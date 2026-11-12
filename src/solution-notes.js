const { ensureFolder } = require('./storage');

const EMBED = /^!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/;

function isSolutionEmbed(unit) {
  return EMBED.test(unit.markdown.trim());
}

function resolveEmbed(app, chapter, unit) {
  const path = unit.markdown.trim().match(EMBED)?.[1];
  if (!path) return null;
  return app.metadataCache.getFirstLinkpathDest(path, chapter.path)
    ?? app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
}

async function materializeSolution(plugin, chapter, book, unit, engine) {
  const { vault } = plugin.app;
  if (isSolutionEmbed(unit)) return resolveEmbed(plugin.app, chapter, unit);
  const key = chapter.path;
  const previous = plugin.solutionWrites.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const latest = await vault.read(chapter);
    const page = await plugin.learning.page(chapter, latest);
    const current = page.nodes.find(node => node.type === 'exercise' && node.id === unit.exercise.id)?.solution;
    if (current && isSolutionEmbed(current)) return resolveEmbed(plugin.app, chapter, current);
    if (current?.source !== unit.source) throw new Error('The solution changed. Reopen it to load the latest version.');
    const openNotes = ['markdown', 'buches-reader'].flatMap(type => plugin.app.workspace.getLeavesOfType(type));
    if (openNotes.some(({ view }) => view.file === chapter && view.getViewData?.() !== latest && view.dirty)) {
      throw new Error('Save the chapter edits before opening its solution.');
    }
    const folder = `${book.path}/_solutions`;
    await ensureFolder(vault, folder);
    const renderer = (unit.engine ?? engine) === 'mathjax' ? 'latex' : 'typst';
    const content = `---\nrenderer: ${renderer}\n---\n\n${unit.markdown}`;
    const note = await vault.create(`${folder}/${crypto.randomUUID()}.md`, content);
    try {
      await vault.process(chapter, text => {
        if (text !== latest) throw new Error('The chapter changed. Reopen the solution to try again.');
        const newline = text.includes('\r\n') ? '\r\n' : '\n';
        return text.slice(0, current.start) + `![[${note.path}]]${newline}` + text.slice(current.end);
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

module.exports = { isSolutionEmbed, materializeSolution };
