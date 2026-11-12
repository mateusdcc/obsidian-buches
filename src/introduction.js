const { findBuchContext } = require('./buch-model');
const { getIntroduction } = require('./intro-model');
const { iconFor, renderFileIcon } = require('./icons');
const { setIcon } = require('obsidian');

class IntroductionRenderer {
  constructor(app) { this.app = app; this.rendered = new Map(); this.revision = 0; }
  async refresh() {
    const token = ++this.revision;
    const leaves = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view?.getViewType?.() === 'markdown') leaves.push(leaf);
    });
    const activeViews = new Set(leaves.map(leaf => leaf.view));
    for (const [view, el] of this.rendered) {
      if (!activeViews.has(view)) { el.remove(); this.rendered.delete(view); }
    }
    for (const leaf of leaves) {
      const view = leaf.view;
      const context = findBuchContext(this.app, view.file);
      const previous = this.rendered.get(view);
      if (!context?.isIndex) { if (previous) previous.remove(); this.rendered.delete(view); continue; }
      if (!view.file || !view.contentEl) continue;
      const path = view.file.path;
      const text = await this.app.vault.cachedRead(view.file);
      if (token !== this.revision || view.file?.path !== path) return;
      const intro = getIntroduction(this.app, view.file, text);
      if (previous) previous.remove();
      const el = view.contentEl.ownerDocument.createElement('section');
      el.className = 'buches-introduction';
      el.setAttribute('aria-label', `Introduction to ${context.name}`);
      const eyebrow = el.createEl('div', {cls:'buches-intro-eyebrow', text:'BUCH'});
      eyebrow.setAttribute('aria-hidden','true');
      const title = el.createEl('h2', {cls:'buches-intro-title'});
      const icon = iconFor(this.app,view.file);
      if (icon) {
        const iconEl = title.createEl('span',{cls:'buches-page-icon'});
        iconEl.setAttribute('aria-hidden','true');
        renderFileIcon(iconEl,icon,setIcon);
      }
      title.createEl('span',{text:context.name});
      if (intro.description) el.createEl('p', {cls:'buches-intro-description', text:intro.description});
      else if (!intro.hasBody) el.createEl('p', {cls:'buches-intro-placeholder',text:'Add a description in the properties or write an introduction below.'});
      view.contentEl.insertBefore(el, view.contentEl.firstChild);
      this.rendered.set(view, el);
    }
  }
  unload() {
    this.revision++;
    for (const el of this.rendered.values()) el.remove();
    this.rendered.clear();
  }
}
module.exports = { IntroductionRenderer };
