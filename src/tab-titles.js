const { around } = require('monkey-around');
const { setIcon } = require('obsidian');
const { findBuchContext } = require('./buch-model');
const { iconFor, renderFileIcon } = require('./icons');

function leafFile(app, leaf) {
  const view = leaf.view;
  if (view?.file) return view.file;
  const state = leaf.getViewState?.();
  if (state?.type !== 'markdown' || !state.state?.file) return null;
  return app.vault.getAbstractFileByPath(state.state.file);
}
function titleForLeaf(app, leaf) {
  return findBuchContext(app, leafFile(app, leaf))?.name ?? null;
}
function patchLeafTitle(app, leaf) {
  return around(leaf, {
    getDisplayText: next => function(...args) {
      return titleForLeaf(app, this) ?? next.apply(this, args);
    },
  });
}

class TabTitles {
  constructor(app) { this.app = app; this.patched = new Map(); }
  refresh() {
    const leaves = [];
    this.app.workspace.iterateAllLeaves(leaf => { leaves.push(leaf); });
    for (const [leaf, undo] of this.patched) {
      if (!leaves.includes(leaf)) {
        undo();
        if (leaf._origIcon && leaf.tabHeaderInnerIconEl) leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
        delete leaf._origIcon;
        this.patched.delete(leaf);
      }
    }
    for (const leaf of leaves) {
      if (typeof leaf.getDisplayText !== 'function' || typeof leaf.updateHeader !== 'function') continue;
      const file = leafFile(this.app, leaf);
      const currentTitle = titleForLeaf(this.app, leaf);
      if (currentTitle && !this.patched.has(leaf)) this.patched.set(leaf, patchLeafTitle(this.app, leaf));
      if (this.patched.has(leaf) && leaf.tabHeaderInnerTitleEl?.textContent !== (currentTitle ?? leaf.getDisplayText())) leaf.updateHeader();
      if (leaf.tabHeaderInnerIconEl) {
        const icon = file ? iconFor(this.app, file) : '';
        if (icon) {
          if (!leaf._origIcon) leaf._origIcon = leaf.tabHeaderInnerIconEl.innerHTML;
          renderFileIcon(leaf.tabHeaderInnerIconEl, icon, setIcon);
        } else if (leaf._origIcon) {
          leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
          delete leaf._origIcon;
        }
      }
    }
  }
  unload() {
    for (const [leaf, undo] of this.patched) {
      undo();
      if (leaf._origIcon && leaf.tabHeaderInnerIconEl) leaf.tabHeaderInnerIconEl.innerHTML = leaf._origIcon;
      delete leaf._origIcon;
      leaf.updateHeader?.();
    }
    this.patched.clear();
  }
}
module.exports = { titleForLeaf, patchLeafTitle, TabTitles };
