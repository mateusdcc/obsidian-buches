function outlineFor(app, file) {
  return (app.metadataCache.getFileCache(file)?.headings ?? [])
    .map(heading => ({ text: heading.heading, level: heading.level, line: heading.position?.start?.line ?? 0 }));
}
module.exports = { outlineFor };
