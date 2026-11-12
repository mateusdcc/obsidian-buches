const { listBuches } = require('./catalog');

function flattenConcepts(concepts) {
  return concepts.flatMap(concept => [concept, ...flattenConcepts(concept.children)]);
}

function findBuchContext(app, file) {
  if (!file || typeof file.path !== 'string' || !file.path.startsWith('Buches/')) return null;
  const book = listBuches(app).find(item => file.path.startsWith(`${item.path}/`));
  if (!book) return null;
  if (file.path === book.index.path) return { book, file: book.index, isIndex: true, name: book.title };
  const concept = flattenConcepts(book.concepts).find(item => item.file.path === file.path);
  if (concept) return { book, file: concept.file, isIndex: false, name: concept.name, concept };
  const path = file.path;
  if (path === `${book.path}/_progress.md` || path.startsWith(`${book.path}/_solutions/`)) return null;
  if (!path.toLowerCase().endsWith('.md')) return null;
  const basename = path.slice(path.lastIndexOf('/') + 1, -3);
  const value = app.metadataCache.getFileCache(file)?.frontmatter?.name;
  const name = typeof value === 'string' && value.trim() ? value : basename;
  return {book, file, isIndex:false, name};
}

function dependencyLink(value) {
  if (typeof value !== 'string') return null;
  let link = value.trim();
  if (link.startsWith('[[') && link.endsWith(']]')) link = link.slice(2, -2);
  return link.split('|')[0].split('#')[0].trim() || null;
}

function buildGraph(app, book) {
  const nodes = flattenConcepts(book.concepts).map(concept => ({file: concept.file, path: concept.file.path, name: concept.name}));
  const paths = new Set(nodes.map(node => node.path));
  const edges = [];
  function addHierarchy(concepts) {
    for (const concept of concepts) {
      for (const child of concept.children) edges.push({ source:concept.file.path, target:child.file.path, type:'hierarchy' });
      addHierarchy(concept.children);
    }
  }
  addHierarchy(book.concepts);
  for (const node of nodes) {
    const frontmatter = app.metadataCache.getFileCache(node.file)?.frontmatter;
    const declared = frontmatter?.depends_on;
    const values = Array.isArray(declared) ? declared : declared ? [declared] : [];
    const dependencies = new Set();
    for (const value of values) {
      const link = dependencyLink(value);
      const dest = link && app.metadataCache.getFirstLinkpathDest(link, node.path);
      if (dest && paths.has(dest.path) && dest.path !== node.path) dependencies.add(dest.path);
    }
    const links = Object.keys(app.metadataCache.resolvedLinks?.[node.path] ?? {});
    for (const target of new Set([...dependencies, ...links])) {
      if (!paths.has(target) || target === node.path) continue;
      edges.push({ source: node.path, target, type: dependencies.has(target) ? 'dependency' : 'link' });
    }
  }
  return {nodes, edges};
}

module.exports = { flattenConcepts, findBuchContext, buildGraph };
