const ROOT = 'Buches';

function validateName(value, label = 'Name') {
  const name = typeof value === 'string' ? value : '';
  if (!name || name.trim() !== name || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f\x7f#^[\]]/.test(name) || /[.]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(`${label} is invalid. Avoid leading/trailing spaces, path separators, and reserved characters or names.`);
  }
  return name;
}

function isFolder(entry) {
  return !!entry && Array.isArray(entry.children);
}

async function ensureFolder(vault, path) {
  const existing = vault.getAbstractFileByPath(path);
  if (existing) {
    if (!isFolder(existing)) throw new Error(`A file exists where a folder is required: ${path}`);
    return existing;
  }
  try {
    await vault.createFolder(path);
  } catch (error) {
    if (!isFolder(vault.getAbstractFileByPath(path))) throw error;
  }
  return vault.getAbstractFileByPath(path);
}

async function ensureRoot(vault) {
  return ensureFolder(vault, ROOT);
}

function buchPath(title) {
  return `${ROOT}/${validateName(title, 'Buch title')}`;
}

function validBuchPath(path) {
  if (typeof path !== 'string' || !path.startsWith(`${ROOT}/`)) throw new Error('Invalid Buch path.');
  const name = path.slice(ROOT.length + 1);
  if (validateName(name, 'Buch title') !== name) throw new Error('Invalid Buch path.');
  return path;
}

async function createBuch(vault, title) {
  const name = validateName(title, 'Buch title');
  const directory = buchPath(name);
  await ensureRoot(vault);
  if (vault.getAbstractFileByPath(directory)) throw new Error(`A Buch named “${name}” already exists.`);
  await vault.createFolder(directory);
  await vault.createFolder(`${directory}/concepts`);
  return vault.create(`${directory}/_index.md`, `---\ntitle: ${JSON.stringify(name)}\ntype: buch\ncreated: ${new Date().toISOString()}\n---\n`);
}

function folderOrder(vault, filePath, cache) {
  const directory = vault.getAbstractFileByPath(filePath.slice(0, filePath.lastIndexOf('/')));
  const siblings = directory?.children?.filter(child => child.extension === 'md') ?? [];
  const orders = siblings.map(file => cache?.getFileCache(file)?.frontmatter?.order).filter(Number.isFinite);
  return 1 + Math.max(siblings.length, ...orders);
}

async function createConcept(vault, path, value, cache) {
  const name = validateName(value, 'Concept name');
  const directory = validBuchPath(path);
  if (!isFolder(vault.getAbstractFileByPath(directory)) || !vault.getAbstractFileByPath(`${directory}/_index.md`)) {
    throw new Error('Buch does not exist.');
  }
  const folder = `${directory}/concepts`;
  await ensureFolder(vault, folder);
  const filePath = `${folder}/${name}.md`;
  if (vault.getAbstractFileByPath(filePath)) throw new Error(`A concept named “${name}” already exists.`);
  return vault.create(filePath, `---\nname: ${JSON.stringify(name)}\ndescription: ""\ncategory: ""\norder: ${folderOrder(vault, filePath, cache)}\ndepends_on: []\n---\n`);
}

async function createSubconcept(vault, parentPath, value, cache) {
  const name = validateName(value, 'Concept name');
  const segments = typeof parentPath === 'string' ? parentPath.split('/') : [];
  if (segments.length < 4 || segments[0] !== ROOT || segments[2] !== 'concepts' || !segments[segments.length - 1].endsWith('.md')) {
    throw new Error('Invalid parent concept path.');
  }
  try {
    validateName(segments[1], 'Buch title');
    for (const segment of segments.slice(3, -1)) validateName(segment, 'Concept name');
    validateName(segments[segments.length - 1].slice(0, -3), 'Concept name');
  } catch (_) {
    throw new Error('Invalid parent concept path.');
  }
  const parent = vault.getAbstractFileByPath(parentPath);
  const index = vault.getAbstractFileByPath(`${ROOT}/${segments[1]}/_index.md`);
  if (!parent || isFolder(parent) || !index || isFolder(index)) throw new Error('Parent concept or Buch does not exist.');
  const childFolder = parentPath.slice(0, -3);
  await ensureFolder(vault, childFolder);
  const filePath = `${childFolder}/${name}.md`;
  if (vault.getAbstractFileByPath(filePath)) throw new Error(`A concept named “${name}” already exists.`);
  return vault.create(filePath, `---\nname: ${JSON.stringify(name)}\ndescription: ""\ncategory: ""\norder: ${folderOrder(vault, filePath, cache)}\ndepends_on: []\n---\n`);
}

module.exports = { ROOT, validateName, ensureRoot, ensureFolder, createBuch, createConcept, createSubconcept, buchPath };
