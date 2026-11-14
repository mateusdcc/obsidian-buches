const { Plugin, Notice } = require('obsidian');
const { ensureRoot, createBuch, createConcept, createSubconcept } = require('./storage');
const { NameModal } = require('./name-modal');
const { BuchesView, VIEW_TYPE } = require('./view');
const { iconFor, setFileIcon } = require('./icons');
const { ContextView, CONTEXT_VIEW } = require('./context-view');
const { findBuchContext, flattenConcepts } = require('./buch-model');
const { TabTitles } = require('./tab-titles');
const { IntroductionRenderer } = require('./introduction');
const { PaginationRenderer } = require('./pagination');
const { BuchReader, READER_VIEW } = require('./reader');
const { LearningIndex } = require('./learning');
const { BookProgress, statusFor } = require('./progress');
const { BuchSettings, readSettings } = require('./settings');
const { AiSolutions } = require('./ai-solutions');
const { createBookTools } = require('./book-memory');
const { SolutionMathRouter } = require('./math');

class BuchesPlugin extends Plugin {
  async onload() {
    await ensureRoot(this.app.vault);
    this.contextFile = null;
    this.contextPath = null;
    this.refreshTimer = null;
    this.contextOpening = null;
    this.alive = true;
    this.tabTitles = new TabTitles(this.app);
    this.introductions = new IntroductionRenderer(this.app);
    this.pagination = new PaginationRenderer(this.app, this);
    const data = this.savedData = await this.loadData() ?? {};
    this.settings = readSettings(data?.settings);
    this.lastRead = new Map(Object.entries(data.lastRead ?? {}));
    this.progress = new BookProgress(this.app, data?.solved ?? {});
    this.learning = new LearningIndex(this.app);
    this.solutionWrites = new Map();
    this.mathRouter = new SolutionMathRouter(this.app);
    this.aiSolutions = new AiSolutions(this);
    this.bookTools = createBookTools(this);
    this.settingsSave = Promise.resolve();
    this.addSettingTab(new BuchSettings(this.app, this));
    this.registerView(READER_VIEW, leaf => new BuchReader(leaf, this));
    this.addCommand({ id:'read-buch', name:'Read current Buch page', checkCallback:checking => {
      const file = this.app.workspace.getActiveFile();
      if (!findBuchContext(this.app, file)) return false;
      if (!checking) void this.openFile(file);
      return true;
    } });
    this.registerView(VIEW_TYPE, leaf => new BuchesView(leaf, this));
    this.registerView(CONTEXT_VIEW, leaf => new ContextView(leaf, this));
    this.addRibbonIcon('library', 'Open Buches', () => { void this.activateView(); });
    this.addCommand({ id:'create-buch', name:'Create Buch', callback:() => this.promptCreateBuch() });
    this.addCommand({ id:'open-buches', name:'Open Buches', callback:() => { void this.activateView(); } });
    this.addCommand({ id:'open-buch-context', name:'Open Buch context', callback:() => { void this.ensureContextView(true); } });
    this.addCommand({ id:'set-buch-icon', name:'Set icon for current Buch or concept', checkCallback:checking => {
      const file = this.app.workspace.getActiveFile();
      if (!findBuchContext(this.app,file)) return false;
      if (!checking) this.promptIcon(file);
      return true;
    } });
    this.registerEvent(this.app.workspace.on('file-open', file => {
      const path = file?.path ?? null;
      const changed = path !== this.contextPath;
      this.contextFile = file;
      this.contextPath = path;
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (leaf?.view?.file?.path === path) this.rememberReading(leaf);
      if (changed && findBuchContext(this.app, file)) void this.ensureContextView(false);
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      this.rememberReading(leaf);
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRefresh()));
    for (const event of ['changed','resolved']) this.registerEvent(this.app.metadataCache.on(event, () => this.scheduleRefresh()));
    for (const event of ['create','delete','modify']) this.registerEvent(this.app.vault.on(event, file => {
      if (file?.path?.startsWith('Buches/')) {
        if (event === 'delete') this.learning.pages.delete(file.path);
        if (/^Buches\/[^/]+\/_solutions\//.test(file.path)) {
          for (const leaf of this.app.workspace.getLeavesOfType(READER_VIEW)) leaf.view.renderKey = null;
        }
        this.scheduleRefresh();
      }
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.learning.pages.delete(oldPath);
      for (const [book, path] of this.lastRead) {
        if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
        const next = file.path + path.slice(oldPath.length);
        this.lastRead.delete(book);
        const nextBook = next.match(/^(Buches\/[^/]+)\/concepts\//)?.[1];
        if (nextBook) this.lastRead.set(nextBook, next);
        this.savePreferences();
        break;
      }
      Promise.resolve(this.progress.rename(file, oldPath))
        .catch(error => this.report(error, 'Could not move chapter progress.'))
        .finally(() => this.scheduleRefresh());
    }));
    const onReady = () => {
      this.contextFile = this.app.workspace.getActiveFile();
      this.contextPath = this.contextFile?.path ?? null;
      this.rememberReading(this.app.workspace.getMostRecentLeaf());
      void this.activateView();
      if (findBuchContext(this.app, this.contextFile)) void this.ensureContextView(false);
      this.scheduleRefresh();
    };
    if (this.app.workspace.layoutReady) {
      onReady();
    } else {
      this.app.workspace.onLayoutReady(onReady);
    }
  }
  onunload() {
    this.alive = false;
    this.mathRouter?.unload();
    this.aiSolutions.dispose();
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.tabTitles.unload();
    this.introductions.unload();
    this.pagination.unload();
    this.app.workspace.detachLeavesOfType(READER_VIEW);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CONTEXT_VIEW);
  }
  getContextFile() { return this.contextFile; }
  scheduleRefresh() {
    if (!this.alive) return;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.tabTitles.refresh();
      void this.introductions.refresh().catch(error => console.error('Buches introduction:', error));
      void this.pagination.refresh().catch(error => console.error('Buches pagination:', error));
      for (const leaf of this.app.workspace.getLeavesOfType(READER_VIEW)) {
        void leaf.view.refresh?.().catch(error => console.error('Buches reader:', error));
      }
      for (const leaf of this.app.workspace.getLeavesOfType(CONTEXT_VIEW)) leaf.view?.render?.();
    }, 120);
  }
  async ensureContextView(reveal) {
    if (this.contextOpening) return this.contextOpening;
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(CONTEXT_VIEW)[0];
    const leaf = workspace.getMostRecentLeaf();
    if (['markdown', READER_VIEW].includes(leaf?.view?.getViewType?.())) {
      this.contextFile = leaf.view.file ?? null;
      this.contextPath = this.contextFile?.path ?? null;
    }
    if (existing) {
      existing.view?.render?.();
      if (reveal || findBuchContext(this.app, this.contextFile)) await workspace.revealLeaf(existing);
      return existing;
    }
    this.contextOpening = (async () => {
      const leaf = workspace.getRightLeaf(false);
      if (!leaf) { if (reveal) new Notice('Could not open Buch context.'); return null; }
      await leaf.setViewState({type:CONTEXT_VIEW, active:true});
      if (this.alive) await workspace.revealLeaf(leaf);
      return leaf;
    })();
    try { return await this.contextOpening; } finally { this.contextOpening = null; }
  }
  async activateView() {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      if (!leaf) { new Notice('Could not open the Buches sidebar.'); return; }
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
  promptIcon(file) {
    new NameModal(this.app, {
      title:'Set icon', placeholder:'Lucide name or emoji; blank to clear', submitText:'Save',
      initialValue:iconFor(this.app,file), required:false,
      onSubmit:async value => { await setFileIcon(this.app,file,value); },
    }).open();
  }
  promptCreateBuch() {
    new NameModal(this.app, {
      title:'Create Buch', placeholder:'Buch title', submitText:'Create Buch',
      onSubmit:async title => { const file = await createBuch(this.app.vault, title); await this.openFile(file); },
    }).open();
  }
  promptCreateConcept(buchPath) {
    new NameModal(this.app, {
      title:'Create concept', placeholder:'Concept name', submitText:'Create concept',
      onSubmit:async name => { const file = await createConcept(this.app.vault, buchPath, name, this.app.metadataCache); await this.openFile(file); },
    }).open();
  }
  promptCreateSubconcept(parentPath) {
    new NameModal(this.app, {
      title:'Create subconcept', placeholder:'Concept name', submitText:'Create subconcept',
      onSubmit:async name => { const file = await createSubconcept(this.app.vault, parentPath, name, this.app.metadataCache); await this.openFile(file); },
    }).open();
  }
  async openFile(file, leaf = this.app.workspace.getLeaf(false), sheet = false) {
    if (leaf.view?.getViewType?.() === READER_VIEW && leaf.view.file?.path === file.path && leaf.view.sheet === sheet && !leaf.view.editingChapter) {
      await this.app.workspace.revealLeaf(leaf);
      this.rememberReading(leaf);
      return;
    }
    await leaf.setViewState({ type: READER_VIEW, state: { file: file.path, sheet }, active: true });
    this.rememberReading(leaf);
    this.contextFile = file;
    this.contextPath = file.path;
    void this.ensureContextView(false);
    this.scheduleRefresh();
  }
  rememberReading(leaf) {
    const view = leaf?.view;
    if (view?.getViewType?.() !== READER_VIEW || view.sheet || view.editingChapter) return;
    const context = findBuchContext(this.app, view.file);
    if (!context?.concept || this.lastRead.get(context.book.path) === context.file.path) return;
    this.lastRead.set(context.book.path, context.file.path);
    this.savePreferences();
    for (const {view: navigator} of this.app.workspace.getLeavesOfType(VIEW_TYPE)) navigator.scheduleRender();
  }
  openExercises(file, leaf) {
    return this.openFile(file, leaf, true);
  }
  async turnPage(context, leaf, file, direction) {
    await this.openFile(file, leaf);
    if (direction !== 'next' || !context?.concept || leaf.view.file?.path !== file.path) return;
    try {
      const model = await this.learning.book(context.book);
      const chapter = model.byPath.get(context.file.path);
      if (chapter) {
        const progress = await this.progress.read(model);
        if (!statusFor(model, progress, chapter)) await this.learn(model, chapter, true);
      }
    } catch (error) {
      this.report(error, 'Could not record chapter progress.');
    }
  }
  report(error, message) {
    console.error('Buches:', error);
    new Notice(message);
  }
  changeSettings(update) {
    this.settings = { ...this.settings, ...update };
    this.scheduleRefresh();
    return this.savePreferences();
  }
  savePreferences() {
    this.settingsSave = this.settingsSave.then(() => this.saveData({
      ...this.savedData, settings: this.settings, solved: this.progress.legacy, lastRead: Object.fromEntries(this.lastRead),
    })).catch(error => this.report(error, 'Could not save Bücher preferences.'));
    return this.settingsSave;
  }
  async setConceptRead(book, concept, read) {
    const model = await this.learning.book(book);
    const paths = flattenConcepts([concept]).map(item => item.file.path);
    await this.progress.setRead(model, paths, read);
    this.scheduleRefresh();
  }

  async learn(model, target, done) {
    try {
      await this.progress.set(model, target, done);
      this.scheduleRefresh();
      return true;
    } catch (error) {
      this.report(error, error.message || 'Could not save reading progress.');
      return false;
    }
  }
  async openTarget(target, leaf = this.app.workspace.getMostRecentLeaf()) {
    await this.openFile(target.file, leaf);
    const reader = leaf?.view;
    if (reader?.getViewType?.() === READER_VIEW && reader.file?.path === target.file.path && target.id) {
      await reader.revealBlock(target.id);
    }
  }
  async goToHeading(file, heading) {
    const workspace = this.app.workspace;
    const reader = workspace.getLeavesOfType(READER_VIEW).find(item => item.view?.file?.path === file.path);
    if (reader) {
      if (reader.view.sheet) await this.openFile(file, reader);
      else await workspace.revealLeaf(reader);
      if (reader.view.editingChapter) reader.view.editor.setCursor({ line: heading.line, ch: 0 });
      else reader.view.goToHeading(heading.text);
      return;
    }
    let leaf = workspace.getLeavesOfType('markdown').find(item => item.view?.file?.path === file.path && item === workspace.getMostRecentLeaf());
    if (!leaf) leaf = workspace.getLeavesOfType('markdown').find(item => item.view?.file?.path === file.path);
    if (!leaf?.view) {
      await workspace.openLinkText(`${file.path}#${heading.text}`, file.path, false);
      return;
    }
    const view = leaf.view;
    if (view.getMode?.() === 'source' && view.editor) {
      const pos = {line:heading.line,ch:0};
      view.editor.setCursor(pos);
      view.editor.scrollIntoView({from:pos,to:pos},true);
      view.editor.focus();
    } else {
      await workspace.openLinkText(`${file.path}#${heading.text}`, file.path, false);
    }
  }
}
module.exports = BuchesPlugin;
