// Explicit finite numeric orders sort before legacy siblings. Equal ranks and
// unranked notes use the catalog's original natural-name comparator; exact
// name ties retain their input order.
function sortConcepts(app, siblings) {
  return siblings.map((concept, index) => {
    const value = app.metadataCache.getFileCache(concept.file)?.frontmatter?.order;
    return { concept, index, order: typeof value === 'number' && Number.isFinite(value) ? value : null };
  }).sort((a, b) => {
    if (a.order !== null && b.order === null) return -1;
    if (a.order === null && b.order !== null) return 1;
    if (a.order !== null && b.order !== null && a.order !== b.order) return a.order < b.order ? -1 : 1;
    return a.concept.name.localeCompare(b.concept.name, undefined, { sensitivity: 'base', numeric: true }) || a.index - b.index;
  }).map(item => item.concept);
}

// Paths outside the catalog are deliberately not part of the reading sequence.
function getPagination(app, book, currentPath) {
  const pages = [{ file: book.index, name: book.title }];
  function visit(siblings) {
    for (const concept of sortConcepts(app, siblings)) {
      pages.push(concept);
      visit(concept.children);
    }
  }
  visit(book.concepts);
  const index = pages.findIndex(page => page.file.path === currentPath);
  if (index < 0) return null;
  return { previous: pages[index - 1] ?? null, next: pages[index + 1] ?? null, index, total: pages.length - 1 };
}

// Only the selected sibling group is rewritten. Each operation is awaited to
// avoid overlapping Obsidian fileManager updates. A write failure propagates;
// already-completed frontmatter edits cannot be rolled back atomically.
async function reorderSiblings(app, book, sourcePath, targetPath, position) {
  if (typeof book?.path !== 'string' || !/^Buches\/[^/]+$/.test(book.path) ||
      ['.', '..'].includes(book.path.slice('Buches/'.length)) ||
      book.index?.path !== `${book.path}/_index.md` || !Array.isArray(book.concepts) ||
      typeof sourcePath !== 'string' || typeof targetPath !== 'string' ||
      sourcePath === targetPath || !['before', 'after'].includes(position)) return false;

  // Validate the entire catalog before any write: paths must match the same-
  // named-folder hierarchy, and no file may occur in more than one location.
  const seen = new Set([book.index.path]);
  let sourceGroup = null, targetGroup = null;
  function inspect(siblings, directory) {
    if (!Array.isArray(siblings)) return false;
    for (const item of siblings) {
      const path = item?.file?.path;
      if (typeof path !== 'string' || !path.startsWith(`${directory}/`)) return false;
      const filename = path.slice(directory.length + 1);
      const stem = filename.slice(0, -3);
      if (!filename.endsWith('.md') || !stem || stem === '.' || stem === '..' ||
          filename.includes('/') || filename.includes('\\') || seen.has(path) ||
          typeof item.name !== 'string') return false;
      seen.add(path);
      if (path === sourcePath) sourceGroup = siblings;
      if (path === targetPath) targetGroup = siblings;
      if (!inspect(item.children, `${directory}/${stem}`)) return false;
    }
    return true;
  }
  if (!inspect(book.concepts, `${book.path}/concepts`) || !sourceGroup || sourceGroup !== targetGroup) return false;
  const group = sourceGroup;
  const sorted = sortConcepts(app, group);
  const reordered = sorted.slice();
  const sourceIndex = reordered.findIndex(item => item.file.path === sourcePath);
  const [source] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex(item => item.file.path === targetPath);
  reordered.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source);
  if (reordered.every((item, index) => item === sorted[index])) return false;
  for (let index = 0; index < reordered.length; index++) {
    await app.fileManager.processFrontMatter(reordered[index].file, frontmatter => { frontmatter.order = index; });
  }
  return true;
}

module.exports = { sortConcepts, getPagination, reorderSiblings };
