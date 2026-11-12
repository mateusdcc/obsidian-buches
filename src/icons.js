function iconFor(app,file) {
  const value = app.metadataCache.getFileCache(file)?.frontmatter?.icon;
  return typeof value === 'string' ? value.trim() : '';
}
async function setFileIcon(app,file,value) {
  const icon = typeof value === 'string' ? value.trim() : '';
  if (icon.length > 80 || /[\r\n\x00-\x1f]/.test(icon)) throw new Error('Invalid icon. Use a Lucide icon name or emoji.');
  await app.fileManager.processFrontMatter(file, frontmatter => {
    if (icon) frontmatter.icon = icon;
    else delete frontmatter.icon;
  });
}
function renderFileIcon(el, icon, setIcon) {
  if (!icon) return false;
  const name = icon.replace(/^lucide:/i, '');
  if (/^[a-z0-9-]+$/i.test(name)) setIcon(el, name);
  else if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon)) el.textContent = icon;
  else return false;
  return true;
}
module.exports={iconFor,setFileIcon,renderFileIcon};
