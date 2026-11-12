const { listBuches } = require('./catalog');
const { stripFrontmatter } = require('./intro-model');
const { primarySolution, resolveEmbed, solutionTabs } = require('./solution-notes');

const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const validReference = ref => !/[\r\n|\]]/.test(ref);

function createBookMentions(plugin) {
  const { vault } = plugin.app;
  let catalog;
  for (const event of ['create', 'delete', 'modify', 'rename']) {
    plugin.registerEvent(vault.on(event, (file, oldPath) => {
      if ([file.path, oldPath].some(path => path?.startsWith('Buches/')
        && (event !== 'modify' || !/\/(?:_progress\.md|_solutions\/)/.test(path)))) catalog = null;
    }));
  }
  plugin.registerEvent(plugin.app.metadataCache.on('changed', file => {
    if (file.path.startsWith('Buches/') && !/\/(?:_progress\.md|_solutions\/)/.test(file.path)) catalog = null;
  }));
  function entries() {
    if (catalog) return catalog;
    const pending = Promise.all(listBuches(plugin.app).map(async book => {
      const rows = new Map();
      const add = (ref, title, kind, source) => {
        if (validReference(ref)) rows.set(ref, { ref, title, kind, book: book.title, source });
      };
      const fromNote = async note => stripFrontmatter(await vault.cachedRead(note));
      add(book.index.path, book.title, 'book', () => fromNote(book.index));
      const model = await plugin.learning.book(book);
      for (const chapter of model.chapters) {
        const { path, name } = chapter;
        add(path, name, 'concept', () => chapter.units.filter(unit => unit.type !== 'solution' && !unit.inSolution)
          .map(unit => unit.markdown).join('\n\n'));
        let section;
        for (const unit of chapter.units) {
          if (unit.type === 'heading') {
            section = unit.node || !unit.title ? null : [unit.markdown];
            if (section) {
              const contents = section;
              add(path + '#' + unit.title, unit.title, 'section', () => contents.join('\n\n'));
            }
          } else if (section && unit.type !== 'solution' && !unit.inSolution) {
            section.push(unit.markdown);
          }
        }
        for (const node of chapter.nodes) {
          const { id, title, type, unit, solution } = node;
          const ref = path + '#' + (id.startsWith('^') ? id : unit.type === 'heading' ? title : 'Bücher block ' + id.replaceAll('#', ' '));
          if (unit.type !== 'solution') add(ref, title, type, () => [unit.markdown, ...(node.prompt ?? [])].join('\n\n'));
          if (!solution) continue;
          for (const [i, hint] of (solution.hints ?? []).entries()) {
            const target = hint.anchor ? '^' + hint.anchor : 'Bücher hint ' + (i + 1) + ' for ' + id.replaceAll('#', ' ');
            add(path + '#' + target, title + ' · Hint ' + (i + 1), 'hint', () => hint.markdown);
          }
          const primary = resolveEmbed(plugin.app, chapter.file, solution);
          const fallback = path + '#Bücher solution ' + id.replaceAll('#', ' ');
          if (primary || primarySolution(solution)) {
            add(primary?.path ?? fallback, title + ' · Solution 1', 'solution',
              () => primary ? fromNote(primary) : primarySolution(solution));
          }
          for (const [i, tab] of solutionTabs(solution).entries()) {
            const file = vault.getAbstractFileByPath(tab.path);
            if (file) add(tab.path, title + (tab.kind === 'ai' ? ' · AI' : '') + ' · Solution ' + (i + 2), 'solution', () => fromNote(file));
          }
        }
      }
      return [...rows];
    })).then(groups => new Map(groups.flat()));
    catalog = pending;
    void pending.catch(() => { if (catalog === pending) catalog = null; });
    return pending;
  }
  return {
    async mentions(query) {
      const key = fold(query.trim());
      return [...(await entries()).values()]
        .filter(row => fold(row.title + ' ' + row.kind + ' ' + row.book).includes(key))
        .sort((a, b) => Number(fold(b.title).startsWith(key)) - Number(fold(a.title).startsWith(key)))
        .slice(0, 24)
        .map(({ ref, title, kind, book }) => ({ ref, title, kind, book }));
    },
    async mentionContext(refs) {
      const index = await entries();
      return Promise.all([...new Set(refs)].slice(0, 12).flatMap(ref => {
        const row = index.get(ref);
        return row ? [Promise.resolve().then(row.source).then(source => ({
          ref, kind: row.kind, title: row.title, text: source.length > 6000 ? source.slice(0, 6000) + '…' : source,
        }))] : [];
      }));
    },
  };
}

module.exports = { createBookMentions };
