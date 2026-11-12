const { ensureFolder } = require('./storage');
const { ADDED_SOLUTION } = require('./learning');

const EMBED = /^!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/;
const TAB = /^<!-- buches-solution-tab: (manual|ai) -->\r?\n(!\[\[[^\r\n]+\]\])[ \t]*\r?$/gm;

function solutionTabs(unit) {
  return [...unit.markdown.matchAll(TAB)].flatMap(match => {
    const path = match[2].match(EMBED)?.[1];
    return path ? [{ kind: match[1], path, offset: match.index }] : [];
  });
}

function primarySolution(unit) {
  return unit.markdown.slice(0, solutionTabs(unit)[0]?.offset ?? unit.markdown.length).trim();
}

function isSolutionEmbed(unit) {
  return EMBED.test(primarySolution(unit));
}

function resolveEmbed(app, chapter, unit) {
  const path = primarySolution(unit).match(EMBED)?.[1];
  if (!path) return null;
  return app.metadataCache.getFirstLinkpathDest(path, chapter.path)
    ?? app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
}

async function writeSolution(plugin, chapter, book, unit, kind, engine) {
  const { vault } = plugin.app;
  const key = chapter.path;
  const previous = plugin.solutionWrites.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const latest = await vault.read(chapter);
    const page = await plugin.learning.page(chapter, latest);
    const exercise = page.nodes.find(node => node.type === 'exercise' && node.id === unit.exercise.id);
    let current = exercise?.solution;
    if (!kind && current && isSolutionEmbed(current)) return resolveEmbed(plugin.app, chapter, current);
    if (!exercise || (!current && !unit.virtual) || (current && !kind && current.source !== unit.source)) {
      throw new Error('The solution changed. Reopen it to load the latest version.');
    }
    const addingSection = !current;
    if (addingSection) {
      const next = page.units.slice(page.units.indexOf(exercise.unit) + 1).find(item =>
        item.node || item.type === 'heading' || item.type === 'solution' || (item.callout && item.callout !== 'hint'));
      const at = next?.start ?? latest.length;
      current = { start: at, end: at, source: '', markdown: '' };
    }
    const openNotes = ['markdown', 'buches-reader'].flatMap(type => plugin.app.workspace.getLeavesOfType(type));
    if (openNotes.some(({ view }) => view.file === chapter && view.getViewData?.() !== latest && view.dirty)) {
      throw new Error('Save the chapter edits before opening its solution.');
    }
    const folder = `${book.path}/_solutions`;
    await ensureFolder(vault, folder);
    const renderer = kind === 'ai' || (current.engine ?? engine) === 'mathjax' ? 'latex' : 'typst';
    const body = kind ? '' : current.markdown.slice(0, solutionTabs(current)[0]?.offset ?? current.markdown.length);
    const content = `---\nrenderer: ${renderer}\n---\n\n${body}`;
    const note = await vault.create(`${folder}/${crypto.randomUUID()}.md`, content);
    try {
      await vault.process(chapter, text => {
        if (text !== latest) throw new Error('The chapter changed. Try again.');
        const newline = text.includes('\r\n') ? '\r\n' : '\n';
        const link = `![[${note.path}]]${newline}`;
        const tabOffset = solutionTabs(current)[0]?.offset;
        const suffix = tabOffset === undefined ? '' : current.markdown.slice(tabOffset);
        const separator = current.source && !current.source.endsWith('\n') ? newline : '';
        const prefix = current.added ? ADDED_SOLUTION + newline : '';
        let replacement = kind
          ? current.source + separator + `<!-- buches-solution-tab: ${kind} -->${newline}` + link
          : prefix + link + suffix;
        if (addingSection) {
          replacement = [newline, newline, '---', newline, ADDED_SOLUTION, newline,
            replacement, '---', newline, newline].join('');
        }
        return text.slice(0, current.start) + replacement + text.slice(current.end);
      });
    } catch (error) {
      if (await vault.read(note) === content) await vault.delete(note);
      throw error;
    }
    return note;
  });
  plugin.solutionWrites.set(key, operation);
  try { return await operation; }
  finally {
    if (plugin.solutionWrites.get(key) === operation) plugin.solutionWrites.delete(key);
  }
}

function materializeSolution(plugin, chapter, book, unit, engine) {
  if (isSolutionEmbed(unit)) return resolveEmbed(plugin.app, chapter, unit);
  return writeSolution(plugin, chapter, book, unit, null, engine);
}

function appendSolutionTab(plugin, chapter, book, unit, kind, engine) {
  return writeSolution(plugin, chapter, book, unit, kind, engine);
}

module.exports = { isSolutionEmbed, resolveEmbed, materializeSolution, appendSolutionTab, solutionTabs, primarySolution };
