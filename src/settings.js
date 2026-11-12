const { PluginSettingTab, Setting } = require('obsidian');

const WIDGETS = { progress: 'Progress', outline: 'Outline', dependencies: 'Dependencies' };
const ENGINES = { mathjax: 'MathJax', typst: 'Typst Mate' };
const DEFAULTS = { readerMath: 'mathjax', solutionMath: 'typst' };

function readSettings(saved) {
  const widgets = [];
  for (const entry of Array.isArray(saved?.widgets) ? saved.widgets : []) {
    if (entry && Object.hasOwn(WIDGETS, entry.id) && !widgets.some(widget => widget.id === entry.id)) {
      widgets.push({ id: entry.id, visible: entry.visible !== false });
    }
  }
  for (const id of Object.keys(WIDGETS)) if (!widgets.some(widget => widget.id === id)) widgets.push({ id, visible: true });
  const engine = key => Object.hasOwn(ENGINES, saved?.[key]) ? saved[key] : DEFAULTS[key];
  return { readerMath: engine('readerMath'), solutionMath: engine('solutionMath'), widgets };
}

class BuchSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl: root, plugin } = this;
    root.empty();
    for (const [key, name] of [['readerMath', 'Reader math'], ['solutionMath', 'Solution math']]) {
      new Setting(root).setName(name).addDropdown(input => input.addOptions(ENGINES)
        .setValue(plugin.settings[key]).onChange(value => plugin.changeSettings({ [key]: value })));
    }
    new Setting(root).setName('Right sidebar').setHeading();
    renderWidgetControls(root, plugin, () => this.display());
  }
}

function renderWidgetControls(host, plugin, redraw) {
  plugin.settings.widgets.forEach((widget, index, widgets) => {
    const row = host.createDiv({ cls: 'buches-widget-control' });
    const label = row.createEl('label');
    const check = label.createEl('input', { attr: { type: 'checkbox' } });
    check.checked = widget.visible;
    label.createSpan({ text: WIDGETS[widget.id] });
    const commit = next => { plugin.changeSettings({ widgets: next }); redraw?.(); };
    check.addEventListener('change', () => commit(widgets.map(item => item.id === widget.id
      ? { ...item, visible: check.checked } : item)));
    for (const [delta, arrow, direction] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
      const button = row.createEl('button', { text: arrow, attr: { 'aria-label': `Move ${WIDGETS[widget.id]} ${direction}` } });
      button.disabled = !widgets[index + delta];
      button.addEventListener('click', () => {
        const next = widgets.slice();
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        commit(next);
      });
    }
  });
}

module.exports = { BuchSettings, readSettings, renderWidgetControls, WIDGETS, ENGINES };
