const { listBuches } = require('./catalog');
const { flattenConcepts } = require('./buch-model');
const { statusFor } = require('./progress');

const stopwords = new Set('como qual quais quando sobre para pode esse essa isso este esta isto nota livro definicao the that with what when from this does about'.split(' '));

function terms(text) {
  return new Set(text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .match(/[\p{L}\p{N}]{4,}/gu)?.filter(word => !stopwords.has(word)) ?? []);
}

function overlap(query, text) {
  const words = terms(text);
  return [...query].filter(word => words.has(word)).length;
}

const excerpt = (text, length) => text.length <= length ? text : text.slice(0, length) + '…';

async function relatedReading(plugin, model, file, focus, question) {
  const query = terms([question, focus?.title, model.byPath.get(file.path)?.name].filter(Boolean).join(' '));
  const target = focus && model.targets.get(`${file.path}#${focus.id}`);
  const direct = [...(target?.dependencies ?? []), ...(model.byPath.get(file.path)?.dependencies ?? [])].filter(Boolean);
  const prerequisites = new Set(direct.map(dep => dep.key));
  const books = listBuches(plugin.app);
  const matches = [];
  for (const book of books) {
    const chapters = flattenConcepts(book.concepts);
    // Other books need only their progress note. Parse their read chapters on demand.
    const progress = await plugin.progress.read(book.path === model.book.path ? model : { book, chapters: [] })
      .catch(() => ({}));
    for (const { file: note, name } of chapters) {
      const path = note.path;
      const sameChapter = path === file.path;
      const read = statusFor({ book }, progress, { path });
      if (!read && !direct.some(dep => dep.path === path)) continue;
      const page = await plugin.learning.page(note).catch(() => null);
      if (!page) continue;
      const candidates = page.nodes.filter(node => node.type !== 'exercise');
      if (!candidates.length) {
        const prose = page.units.filter(unit => unit.type !== 'solution' && !unit.inSolution)
          .map(unit => unit.markdown).join('\n\n');
        candidates.push({ title: name, unit: { markdown: prose } });
      }
      for (const node of candidates) {
        const ref = path + (node.id?.startsWith('^') ? '#' + node.id : '');
        const explicit = prerequisites.has(ref) || prerequisites.has(path);
        if (sameChapter && (!focus || node.id === focus.id || !explicit)) continue;
        if (!explicit && !read) continue;
        const score = 4 * overlap(query, node.title) + overlap(query, node.unit.markdown) + overlap(query, name);
        if (!explicit && !score) continue;
        matches.push({ ref, path, title: node.title, read, explicit, score, text: excerpt(node.unit.markdown, 650) });
      }
    }
  }
  matches.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.score - a.score);
  const seen = new Set();
  return matches.filter(match => {
    if (seen.has(match.path)) return false;
    seen.add(match.path);
    return true;
  }).slice(0, 5);
}

function chapterExcerpt(page, focus) {
  if (focus?.unit.type !== 'solution' && focus?.unit.markdown) {
    return [focus.unit.markdown, ...(focus.prompt ?? [])].join('\n\n');
  }
  return excerpt(page.units.filter(unit => unit.type !== 'solution' && !unit.inSolution)
    .map(unit => unit.markdown).join('\n\n'), 4800);
}

module.exports = { relatedReading, chapterExcerpt };
