class ItemView { constructor(leaf) { this.app = leaf.app; } }
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this.commands = []; this.views = new Map(); }
  addSettingTab() {}
  registerView(type, factory) { this.views.set(type, factory); }
  registerEvent() {}
  register() {}
  async loadData() { return null; }
  addCommand(command) { this.commands.push(command); }
  addRibbonIcon() {}
}
class Modal { constructor(app) { this.app = app; } open() { this.app.lastModal = this; } }
class Notice { constructor(message) { this.message = message; } }
function setIcon() {}
module.exports = { PluginSettingTab: ItemView, FileView: ItemView, MarkdownView: ItemView, ItemView, Plugin, Modal, Notice, setIcon };
