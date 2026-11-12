const { ItemView } = require('obsidian');
const { findBuchContext, buildGraph } = require('./buch-model');
const { renderGraph } = require('./graph-view');
const { outlineFor } = require('./outline-model');
const { exerciseMeter, chapterLink, renderDependencies } = require('./dashboard');
const { countsFor } = require('./progress');
const { renderWidgetControls, WIDGETS } = require('./settings');

const CONTEXT_VIEW = 'buches-context';

class ContextView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.revision = 0; }
  getViewType() { return CONTEXT_VIEW; }
  getDisplayText() { return 'Buch context'; }
  getIcon() { return 'network'; }
  async onOpen() { this.contentEl.addClass('buches-context'); await this.render(); }
  async onClose() { this.revision++; }

  async render() {
    const root = this.contentEl;
    const plugin = this.plugin;
    const revision = ++this.revision;
    const file = plugin.getContextFile();
    const context = findBuchContext(this.app, file);
    if (!context) {
      this.signature = null;
      root.empty();
      root.createEl('p', { cls: 'buches-context-empty', text: 'Open a Buch or concept to see its progress and outline.' });
      return;
    }
    try {
      const model = await plugin.learning.book(context.book);
      let progress = {};
      let progressError;
      try { progress = await plugin.progress.read(model); }
      catch (error) { progressError = error.message; }
      if (revision !== this.revision) return;
      const chapter = model.byPath.get(file.path);
      const page = chapter ?? await plugin.learning.page(file);
      if (revision !== this.revision) return;
      const headings = page.units.some(unit => unit.type !== 'text')
        ? page.units.filter(unit => unit.level).map(unit => ({ text: unit.title, level: unit.level, line: unit.line }))
        : outlineFor(this.app, file);
      const widgets = plugin.settings.widgets;
      const signature = JSON.stringify([file.path, context.name, widgets, headings, progress, progressError, model.issues,
        model.chapters.map(ch => [ch.path, ch.name, ch.nodes.map(node => [node.id, node.title]),
          ch.dependencies.map(dep => dep?.key),
          ch.nodes.map(node => model.targets.get(`${ch.path}#${node.id}`).dependencies.map(dep => dep?.key))])]);
      if (signature === this.signature) return;
      this.signature = signature;
      const wasOpen = root.querySelector?.('.buches-widget-settings')?.open;
      root.empty();
      root.createEl('h3', { cls: 'buches-context-title', text: context.name });
      const controls = root.createEl('details', { cls: 'buches-widget-settings' });
      controls.open = Boolean(wasOpen);
      controls.createEl('summary', { text: 'Customize sidebar' });
      renderWidgetControls(controls, plugin);
      if (progressError) root.createEl('p', { cls: 'buches-edit-error', text: progressError });
      const open = target => plugin.openTarget(target);
      for (const widget of widgets) {
        if (!widget.visible) continue;
        const section = root.createEl('section', { cls: `buches-context-widget buches-widget-${widget.id}` });
        section.createEl('h4', { cls: 'buches-context-label', text: WIDGETS[widget.id] });
        if (widget.id === 'progress') {
          if (chapter) exerciseMeter(section, 'This chapter', countsFor(model, progress, [chapter]));
          exerciseMeter(section, 'Book', countsFor(model, progress));
        } else if (widget.id === 'outline') {
          this.renderOutline(section, file, headings, chapter, open);
        } else {
          this.renderGraph(section, file, model, progress, chapter, open);
        }
      }
    } catch (error) {
      if (revision !== this.revision) return;
      this.signature = null;
      root.empty();
      root.createEl('p', { cls: 'buches-edit-error', text: error.message });
    }
  }

  renderOutline(section, file, headings, chapter, open) {
    if (!headings.length && !chapter?.nodes.length) {
      section.createEl('p', { cls: 'buches-context-empty', text: 'No headings yet.' });
      return;
    }
    const list = section.createDiv({ cls: 'buches-outline' });
    const minLevel = Math.min(...headings.map(item => item.level));
    for (const heading of headings) {
      const button = list.createEl('button', { cls: `buches-outline-link buches-outline-level-${Math.min(6, heading.level - minLevel)}`, text: heading.text });
      button.setAttribute('aria-label', `Go to ${heading.text}`);
      button.addEventListener('click', () => this.plugin.goToHeading(file, heading));
    }
    for (const node of chapter?.nodes ?? []) {
      if (!node.unit.anchor) continue;
      chapterLink(list, { ...node, file }, open);
    }
  }

  renderGraph(section, file, model, progress, chapter, open) {
    const graph = buildGraph(this.app, model.book);
    const declared = model.chapters.flatMap(node => node.dependencies.filter(dep => dep && dep.path !== node.path)
      .map(dep => ({ source: node.path, target: dep.path, type: 'dependency' })));
    graph.edges = [...graph.edges.filter(edge => edge.type !== 'dependency' &&
      !declared.some(dep => dep.source === edge.source && dep.target === edge.target)), ...declared];
    renderGraph(section.createDiv({ cls: 'buches-graph-wrap' }), graph, file.path, target => open({ file: target }));
    section.createEl('p', { cls: 'buches-graph-caption', text: 'Solid prerequisites · Dashed links · Faint nesting' });
    if (chapter) {
      renderDependencies(section, model, progress, chapter, open);
      for (const node of chapter.nodes) {
        const target = model.targets.get(`${chapter.path}#${node.id}`);
        if (!target.dependencies.length) continue;
        chapterLink(section, target, open);
        renderDependencies(section, model, progress, target, open);
      }
    }
    if (model.issues.length) section.createEl('p', { cls: 'buches-context-empty',
      text: `${model.issues.length} prerequisite issues · See the book index` });
  }
}

module.exports = { ContextView, CONTEXT_VIEW };
