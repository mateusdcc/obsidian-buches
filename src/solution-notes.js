const { parseYaml } = require('obsidian');
const { ensureFolder } = require('./storage');
const { ADDED_SOLUTION } = require('./learning');
const { extractMath } = require('./math');

const EMBED = /^!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/;
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const PRIMARY_AI = '<!-- buches-primary-ai -->';
const TAB = /^<!-- buches-solution-tab: (manual|ai) -->\r?\n(!\[\[[^\r\n]+\]\])[ \t]*\r?$/gm;

function readRenderer(source) {
  const header = source.match(FRONTMATTER);
  if (!header) return null;
  if (typeof parseYaml === 'function') return parseYaml(header[1])?.renderer ?? null;
  const line = header[1].match(/^renderer:[ \t]*([^\r\n#]+?)[ \t]*(?:#.*)?$/m);
  return line ? line[1].replace(/^(['"])(.*)\1$/, '$2') : null;
}

function engineForRenderer(renderer, fallback = 'mathjax') {
  const value = typeof renderer === 'string' ? renderer.trim().toLowerCase() : '';
  if (value === 'latex' || value === 'mathjax' || value === 'tex') return 'mathjax';
  if (value === 'typst') return 'typst';
  return fallback;
}

function solutionEngine(source, kind, fallback = 'mathjax') {
  return engineForRenderer(readRenderer(source), kind === 'ai' ? 'mathjax' : fallback);
}

function solutionTabs(unit) {
  return [...unit.markdown.matchAll(TAB)].flatMap(match => {
    const path = match[2].match(EMBED)?.[1];
    return path ? [{ kind: match[1], path, offset: match.index, end: match.index + match[0].length }] : [];
  });
}

function primarySolution(unit) {
  const body = unit.markdown.slice(0, solutionTabs(unit)[0]?.offset ?? unit.markdown.length).trim();
  return body.startsWith(PRIMARY_AI) ? body.slice(PRIMARY_AI.length).trim() : body;
}

function primaryKind(unit) {
  return unit.markdown.trimStart().startsWith(PRIMARY_AI) ? 'ai' : 'manual';
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

async function queueSolutionWrite(plugin, chapter, write) {
  const key = chapter.path;
  const previous = plugin.solutionWrites.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(write);
  plugin.solutionWrites.set(key, operation);
  try { return await operation; }
  finally {
    if (plugin.solutionWrites.get(key) === operation) plugin.solutionWrites.delete(key);
  }
}

function writeSolution(plugin, chapter, book, unit, kind, engine) {
  const { vault } = plugin.app;
  return queueSolutionWrite(plugin, chapter, async () => {
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
    const body = kind ? '' : current.markdown.slice(0, solutionTabs(current)[0]?.offset ?? current.markdown.length);
    const hasMath = Boolean(!kind && (extractMath(body, true).formulas.length || /\\begin\{/.test(body)));
    const noteEngine = kind === 'ai'
      ? 'mathjax'
      : hasMath
        ? (current.engine ?? engine)
        : engine;
    const renderer = noteEngine === 'mathjax' ? 'latex' : 'typst';
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
}

async function removeSolutionTab(plugin, chapter, book, unit, path, engine) {
  const { app } = plugin;
  const { vault } = app;
  // Save inline proofs to their own note before unlinking, so they can still be recovered.
  const original = path === '' ? await materializeSolution(plugin, chapter, book, unit, engine) : null;
  return queueSolutionWrite(plugin, chapter, async () => {
    const latest = await vault.read(chapter);
    const page = await plugin.learning.page(chapter, latest);
    const current = page.nodes.find(node => node.type === 'exercise' && node.id === unit.exercise.id)?.solution;
    const tabs = current ? solutionTabs(current) : [];
    if (!tabs.length) throw new Error('Keep at least one solution tab.');
    const tab = path === '' ? tabs[0] : tabs.find(item => item.path === path);
    if (!tab || (path === '' && (!original || resolveEmbed(app, chapter, current)?.path !== original.path))) {
      throw new Error('The solution changed. Reopen it and try again.');
    }
    const open = ['markdown', 'buches-reader'].flatMap(type => app.workspace.getLeavesOfType(type));
    if (open.some(({ view }) => view.file === chapter && view.getViewData?.() !== latest && view.dirty)) {
      throw new Error('Save the chapter edits before deleting a solution tab.');
    }

    const { markdown } = current;
    const newline = latest.includes('\r\n') ? '\r\n' : '\n';
    const end = markdown[tab.end] === '\n' ? tab.end + 1 : tab.end;
    const replacement = path === ''
      ? (tab.kind === 'ai' ? PRIMARY_AI + newline : '') + `![[${tab.path}]]` + newline
      : markdown.slice(0, tab.offset);
    const start = current.end - markdown.length;
    await vault.process(chapter, text => {
      if (text !== latest) throw new Error('The chapter changed. Try again.');
      return text.slice(0, start) + replacement + markdown.slice(end) + text.slice(current.end);
    });
    return path === '' ? tab.path : null;
  });
}

function materializeSolution(plugin, chapter, book, unit, engine) {
  if (isSolutionEmbed(unit)) return resolveEmbed(plugin.app, chapter, unit);
  return writeSolution(plugin, chapter, book, unit, null, engine);
}

function appendSolutionTab(plugin, chapter, book, unit, kind, engine) {
  return writeSolution(plugin, chapter, book, unit, kind, engine);
}

module.exports = { isSolutionEmbed, resolveEmbed, materializeSolution, appendSolutionTab, solutionTabs, primarySolution, primaryKind, removeSolutionTab, readRenderer, engineForRenderer, solutionEngine };
