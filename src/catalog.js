const { ROOT } = require('./storage');
const { iconFor } = require('./icons');
const { sortConcepts } = require('./order-model');

function isFolder(entry) { return !!entry && Array.isArray(entry.children); }
function metadataName(app, file, property, fallback) {
  const value = app.metadataCache.getFileCache(file)?.frontmatter?.[property];
  return typeof value === 'string' && value.trim() ? value : fallback;
}
function compare(a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }); }

function listConcepts(app, directory, inheritedCategory = 'Uncategorized') {
  if (!isFolder(directory)) return [];
  const folders = new Map(directory.children.filter(isFolder).map(folder => [folder.name, folder]));
  const concepts = directory.children
    .filter(item => !isFolder(item) && item.extension === 'md')
    .map(file => {
      const basename = file.name.slice(0, -3);
      const category = metadataName(app, file, 'category', inheritedCategory);
      return {
        file,
        name: metadataName(app, file, 'name', metadataName(app, file, 'title', basename)),
        description: metadataName(app, file, 'description', ''),
        category,
        icon: iconFor(app, file),
        children: listConcepts(app, folders.get(basename), category),
      };
    });
  return sortConcepts(app, concepts);
}

function listBuches(app) {
  const root = app.vault.getAbstractFileByPath(ROOT);
  if (!isFolder(root)) return [];
  const result = [];
  for (const folder of root.children.filter(isFolder)) {
    const index = folder.children.find(item => item.name === '_index.md' && !isFolder(item));
    if (!index) continue;
    const title = metadataName(app, index, 'title', folder.name);
    const conceptFolder = folder.children.find(item => item.name === 'concepts' && isFolder(item));
    const concepts = listConcepts(app, conceptFolder);
    result.push({ path: folder.path, index, title, icon:iconFor(app, index), concepts });
  }
  return result.sort((a, b) => compare(a.title, b.title));
}
module.exports = { listBuches };
