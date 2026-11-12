function stripFrontmatter(text, trim = true) {
  const body = text.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
  return trim ? body.trim() : body;
}
function getIntroduction(app, file, text) {
  const value = app.metadataCache.getFileCache(file)?.frontmatter?.description;
  return { description: typeof value === 'string' ? value.trim() : '', hasBody: !!stripFrontmatter(text) };
}
module.exports = { stripFrontmatter, getIntroduction };
