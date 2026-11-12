const MiniSearch = require('minisearch');
const { listBuches } = require('./catalog');
const { statusFor } = require('./progress');
const { stripFrontmatter } = require('./intro-model');

const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const clip = (text, length) => text.length <= length ? text : text.slice(0, length) + '…';

function bookRecords(model, progress, introduction = '') {
  const records = new Map();
  const put = (ref, entry) => records.set(ref, { id: ref, ...entry });
  if (introduction.trim()) put(model.book.index.path, {
    path: model.book.index.path, title: model.book.title, kind: 'index', text: introduction, read: false,
  });
  for (const chapter of model.chapters) {
    const { path, name, category } = chapter;
    const read = Boolean(statusFor(model, progress, chapter));
    const blocks = chapter.units.filter(unit => unit.type !== 'solution' && !unit.inSolution && unit.callout !== 'hint');
    const visible = new Set(blocks);
    const base = { path, category, read, chapter: name };
    put(path, { ...base, title: name, kind: 'chapter', text: [chapter.description, ...blocks.map(unit => unit.markdown)].filter(Boolean).join('\n\n') });
    let heading;
    for (const block of blocks) {
      if (block.type === 'heading' && !block.node) {
        heading = { title: block.title, blocks: [] };
      } else if (heading && !block.node) {
        heading.blocks.push(block.markdown);
      } else {
        heading = null;
      }
      if (!heading?.title) continue;
      put(path + '#' + heading.title, { ...base, title: heading.title, kind: 'section', text: heading.blocks.join('\n\n') });
    }
    for (const node of chapter.nodes) {
      if (!visible.has(node.unit)) continue;
      const ref = path + '#' + (node.id.startsWith('^') ? node.id : node.title);
      put(ref, { ...base, title: node.title, kind: node.type, text: [node.unit.markdown, ...(node.prompt ?? [])].join('\n\n') });
    }
  }
  return records;
}

function prerequisites(model, chapterPath, blockId) {
  const refs = new Set();
  const visited = new Set();
  const queue = [
    ...(model.byPath.get(chapterPath)?.dependencies ?? []),
    ...(model.targets.get(chapterPath + '#' + blockId)?.dependencies ?? []),
  ];
  for (const target of queue) {
    if (!target || visited.has(target.key)) continue;
    visited.add(target.key);
    refs.add(target.id && !target.id.startsWith('^') ? target.path + '#' + target.title : target.key);
    queue.push(...target.dependencies);
  }
  return refs;
}

function searchRecords(records, query) {
  const index = new MiniSearch({
    fields: ['title', 'chapter', 'category', 'text'],
    processTerm: term => fold(term),
  });
  index.addAll([...records.values()]);
  return index.search(query ?? '', {
    boost: { title: 4, chapter: 2, category: 1.5 },
    prefix: term => term.length >= 4,
    fuzzy: term => term.length >= 6 ? 0.15 : false,
  });
}

async function memoryRecords(plugin, model) {
  const [progress, source] = await Promise.all([
    plugin.progress.read(model).catch(() => ({})),
    plugin.app.vault.cachedRead(model.book.index),
  ]);
  return bookRecords(model, progress, stripFrontmatter(source));
}

async function studyContext(plugin, model, file, focus, query) {
  const records = await memoryRecords(plugin, model);
  const required = prerequisites(model, file.path, focus?.id);
  const focusRef = file.path + '#' + (focus?.id.startsWith('^') ? focus.id : focus?.title);
  const ranked = searchRecords(records, [query, focus?.title, model.byPath.get(file.path)?.name].filter(Boolean).join(' '));
  const ordered = [...required, ...ranked.filter(match => records.get(match.id)?.read).map(match => match.id),
    ...ranked.map(match => match.id)];
  return [...new Set(ordered)].flatMap(ref => {
    const record = records.get(ref);
    if (!record || !record.text || ref === focusRef || (ref === file.path && !required.has(ref))) return [];
    if (record.kind === 'exercise' && !required.has(ref)) return [];
    return [{ ref, title: record.title, type: record.kind, read: record.read,
      prerequisite: required.has(ref), text: clip(record.text, 850) }];
  }).slice(0, 6);
}

/** Read-only tools shared by Obsidian plugins. Scope every lookup to the explicit book. */
function createBookTools(plugin) {
  async function modelFor(bookPath) {
    const book = listBuches(plugin.app).find(item => item.path === bookPath);
    if (!book) throw new Error('Bücher could not find that book.');
    return plugin.learning.book(book);
  }
  const recordsFor = async bookPath => memoryRecords(plugin, await modelFor(bookPath));
  return Object.freeze({
    version: 1,
    async context(bookPath, chapterPath, blockId, query) {
      const model = await modelFor(bookPath);
      const chapter = model.byPath.get(chapterPath);
      if (!chapter) throw new Error('Bücher could not find that chapter in the requested book.');
      const focus = chapter.nodes.find(node => node.id === blockId);
      return studyContext(plugin, model, chapter.file, focus, query);
    },
    async search(bookPath, query) {
      const records = await recordsFor(bookPath);
      return searchRecords(records, query).slice(0, 10).map(({ id }) => {
        const { title, kind, read, text } = records.get(id);
        return { ref: id, title, kind, read, excerpt: clip(text, 350) };
      });
    },
    async read(bookPath, ref) {
      const record = (await recordsFor(bookPath)).get(ref);
      if (!record) return null;
      const { id, title, kind, read, text } = record;
      return { ref: id, title, kind, read, text: clip(text, 5000) };
    },
  });
}

module.exports = { createBookTools, studyContext };
