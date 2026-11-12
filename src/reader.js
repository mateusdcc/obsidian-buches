const { Component, MarkdownView, Keymap, setIcon } = require('obsidian');
const { findBuchContext, flattenConcepts } = require('./buch-model');
const { getIntroduction, stripFrontmatter } = require('./intro-model');
const { getPagination } = require('./order-model');
const { renderPagination, withFinish } = require('./pagination');
const { iconFor, renderFileIcon } = require('./icons');
const { countsFor, statusFor } = require('./progress');
const { renderDashboard, renderBookProgress, renderDependencies, chapterLink, progressButton } = require('./dashboard');
const { renderMarkdown } = require('./math');
const { materializeSolution, appendSolutionTab, solutionTabs } = require('./solution-notes');
const { claudian, studyActions } = require('./claudian');
const { NameModal } = require('./name-modal');
const { GradeModal } = require('./grading');

const READER_VIEW = 'buches-reader';
const emptySolution = exercise => ({ exercise, hints: [], markdown: '', source: '', virtual: true });

class BuchReader extends MarkdownView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sheet = false;
    this.embeds = new Set();
    this.selectedSolutions = new Map();
  }

  getViewType() { return READER_VIEW; }
  getIcon() { return this.sheet ? 'clipboard-list' : 'book-open'; }
  getDisplayText() { return this.title || this.file?.basename || 'Buches'; }
  canAcceptExtension() { return false; }

  getState() { return { ...super.getState(), sheet: this.sheet }; }

  async setState(state, result) {
    const changed = this.sheet !== Boolean(state.sheet);
    this.sheet = Boolean(state.sheet);
    if (this.editingChapter) await this.toggleChapterEditor();
    await super.setState({ ...state, mode: 'preview' }, result);
    if (changed) await this.refresh();
  }

  async onOpen() {
    await super.onOpen();
    this.modeButtonEl?.hide();
    this.contentEl.addClass('buches-reader');
    this.nativeHost = this.contentEl.createDiv({ cls: 'buches-native-parking' });
    this.pageHost = this.contentEl.createDiv({ cls: 'buches-page-host' });
    this.editingBar = this.contentEl.createDiv({ cls: 'buches-chapter-edit-bar' });
    const done = this.editingBar.createEl('button', { text: 'Back to reading' });
    done.addEventListener('click', () => void this.toggleChapterEditor());
    if (this.editMode?.editorEl) this.nativeHost.append(this.editMode.editorEl);
    if (this.previewMode?.containerEl) this.nativeHost.append(this.previewMode.containerEl);
  }

  async onLoadFile(file) {
    await super.onLoadFile(file);
    await this.refresh();
  }

  async onUnloadFile(file) {
    await this.flushEmbeds();
    if (this.editingChapter) {
      this.contentEl.removeClass('buches-editing-chapter');
      this.editingChapter = false;
    }
    this.refreshTask = null;
    this.renderKey = null;
    this.title = null;
    if (this.renderComponent) this.removeChild(this.renderComponent);
    this.renderComponent = null;
    this.pageHost.empty();
    await super.onUnloadFile(file);
  }

  async flushEmbeds() {
    for (const embed of this.embeds) {
      if (!embed.editor || !embed.dirty) continue;
      embed.requestSave?.cancel?.();
      await embed.save(embed.editor.getValue(), true);
    }
  }

  onSwitchView() { return this.toggleChapterEditor(); }

  async toggleChapterEditor() {
    if (this.editingChapter) {
      await this.setMode(this.previewMode);
      this.editingChapter = false;
      this.contentEl.removeClass('buches-editing-chapter');
      await this.refresh();
      this.pageHost.querySelector('.buches-edit-note')?.focus();
      return;
    }
    if (this.sheet) return;
    await this.flushEmbeds();
    for (const embed of this.embeds) if (embed.editor) embed.showPreview();
    await this.setMode(this.editMode);
    this.editingChapter = true;
    this.contentEl.addClass('buches-editing-chapter');
    this.editMode.onResize();
    this.editor.focus();
  }

  refresh() {
    const file = this.file;
    if (!file || this.editingChapter || this.solutionLoading || [...this.embeds].some(embed => embed.editor)) return Promise.resolve();
    if (this.refreshTask?.file === file) {
      this.refreshTask.again = true;
      return this.refreshTask.promise;
    }
    const task = { file, again: false };
    this.refreshTask = task;
    task.promise = (async () => {
      try {
        do {
          task.again = false;
          await this.renderPage(file, task);
        } while (task.again && this.refreshTask === task && this.file === file && !this.editingChapter);
      } finally {
        if (this.refreshTask === task) this.refreshTask = null;
      }
    })();
    return task.promise;
  }

  async renderPage(file, task) {
    const plugin = this.plugin;
    const text = await this.app.vault.cachedRead(file);
    const context = findBuchContext(this.app, file);
    const pagination = context && getPagination(this.app, context.book, file.path);
    const title = context?.name ?? file.basename;
    const sheet = this.sheet;
    const icon = iconFor(this.app, file);
    const intro = context?.isIndex && getIntroduction(this.app, file, text);
    const parsed = await plugin.learning.page(file, text);
    const model = context && await plugin.learning.book(context.book);
    let progress = {};
    let progressError;
    if (model) {
      try { progress = await plugin.progress.read(model); }
      catch (error) { progressError = error.message; }
    }
    if (this.file !== file || this.refreshTask !== task || this.editingChapter) return;
    const chapter = model?.byPath.get(file.path);
    const { readerMath, solutionMath } = plugin.settings;
    const key = JSON.stringify([file.path, sheet, text, title, icon, intro, readerMath, solutionMath, progress, progressError, Boolean(claudian(this.app)), plugin.aiSolutions.revision,
      model?.book.title, model?.issues, model?.chapters.map(ch => [
        ch.path, ch.name, ch.description, ch.category, ch.nodes.map(node => sheet ? [node.id, node.unit.markdown, node.prompt, node.solution?.source] : [node.id, node.title]),
        ch.dependencies.map(dep => dep?.key),
        ch.nodes.map(node => model.targets.get(`${ch.path}#${node.id}`)?.dependencies.map(dep => dep?.key)),
      ])]);
    if (key === this.renderKey) return;

    const component = this.addChild(new Component());
    const page = this.contentEl.ownerDocument.createElement('div');
    page.className = 'buches-reader-page';
    const header = page.createEl('header', { cls: 'buches-reader-header' });
    const bar = header.createDiv({ cls: 'buches-reader-bar' });
    if (sheet) {
      chapterLink(bar, { name: title }, () => plugin.openFile(file, this.leaf));
    } else if (context?.isIndex) {
      bar.createSpan({ cls: 'buches-reader-position', text: `${pagination.total} ${pagination.total === 1 ? 'chapter' : 'chapters'}` });
    } else if (context) {
      const home = bar.createEl('button', { cls: 'buches-reader-home', text: context.book.title });
      setIcon(home.createSpan({ cls: 'buches-reader-home-icon', attr: { 'aria-hidden': 'true' } }), 'book-open');
      home.addEventListener('click', () => plugin.openFile(context.book.index, this.leaf));
      if (pagination) bar.createSpan({ cls: 'buches-reader-position', text: `${pagination.index} / ${pagination.total}` });
    }
    if (chapter && !sheet) {
      const count = countsFor(model, progress, [chapter]);
      if (count.exercises) bar.createSpan({ cls: 'buches-reader-position', text: `${count.solved} / ${count.exercises} solved` });
      if (statusFor(model, progress, chapter)) bar.createSpan({ cls: 'buches-reader-position', text: '✓ Read' });
    }
    if (!sheet) {
      chapterLink(bar, { name: 'Exercises' }, () => plugin.openExercises(file, this.leaf));
      const edit = bar.createEl('button', { cls: 'buches-reader-action buches-edit-note', text: 'Edit note' });
      edit.addEventListener('click', () => void this.toggleChapterEditor());
    }

    const headingHost = header.createDiv({ cls: 'buches-title-host buches-source-block' });
    const heading = headingHost.createEl('h1', { cls: 'buches-reader-title' });
    if (icon) renderFileIcon(heading.createSpan({ cls: 'buches-reader-title-icon', attr: { 'aria-hidden': 'true' } }), icon, setIcon);
    const headingText = heading.createSpan({ text: sheet ? 'Exercises' : title });
    if (!sheet && intro?.description) header.createEl('p', { cls: 'buches-reader-description', text: intro.description });
    if (progressError) header.createEl('p', { cls: 'buches-edit-error', text: progressError });
    if (!sheet && context?.isIndex && model) renderBookProgress(header, model, progress);
    const body = page.createEl('article', { cls: 'buches-reader-body markdown-rendered' });
    const units = parsed.units;
    const state = { file, model, progress, component, readerMath, solutionMath };
    studyActions(this, bar, state, undefined, { patch: !sheet });
    const firstHeading = units[0]?.level === 1 ? units[0] : null;
    try {
      if (sheet && model) await this.renderExerciseSheet(body, context, state);
      if (!sheet && firstHeading) {
        const titleMarkup = firstHeading.markdown.replace(/^ {0,3}#\s+/, '').replace(/\s+#+\s*$/, '');
        headingText.empty();
        await this.render(titleMarkup, headingText, state);
        const inline = headingText.querySelector('p');
        if (inline) headingText.replaceChildren(...inline.childNodes);
        heading.dataset.heading = firstHeading.title;

      }
      if (!sheet) await Promise.all(units.map(async unit => {
        if (unit === firstHeading || unit.inSolution) return;
        if (unit.type === 'solution') return this.renderSolution(body, unit, state);
        const row = body.createDiv({ cls: 'buches-source-block' });
        const rendered = row.createDiv();
        await this.renderUnit(unit, rendered, state);
        if (unit.node) {
          row.dataset.block = unit.node.id;
          studyActions(this, row, state, unit.node, {
            patch: Boolean(unit.callout && unit.node.type !== 'exercise'),
            question: true,
          });
          const target = model?.targets.get(`${file.path}#${unit.node.id}`);
          if (target && unit.node.type === 'exercise' && !unit.node.solution) {
            await this.renderSolution(row, emptySolution(unit.node), state);
          }
        } else if (unit.anchor) row.dataset.block = `^${unit.anchor}`;
        if (unit.node?.type === 'exercise') rendered.querySelector('h2,h3,h4,h5,h6')?.addClass('buches-exercise-heading');

      }));
    } catch (error) {
      this.removeChild(component);
      throw error;
    }
    if (this.file !== file || this.refreshTask !== task || this.editingChapter || this.solutionLoading || [...this.embeds].some(embed => embed.editor)) {
      this.removeChild(component);
      return;
    }
    if (!sheet && context?.isIndex && model) {
      renderDashboard(page.createDiv({ cls: 'buches-dashboard' }), model, progress, target => plugin.openTarget(target, this.leaf));
    }
    if (!sheet) renderPagination(page, withFinish(pagination, context), (target, direction) => plugin.turnPage(context, this.leaf, target, direction));
    page.addEventListener('click', event => this.openLink(event, file));

    const samePage = this.renderedPath === file.path && this.renderedSheet === sheet;
    const scroll = samePage ? this.contentEl.scrollTop : 0;
    if (samePage) {
      const opened = new Set([...this.pageHost.querySelectorAll('details[open][data-state-key]')].map(el => el.dataset.stateKey));
      for (const details of page.querySelectorAll('details[data-state-key]')) details.open = opened.has(details.dataset.stateKey);
    }
    if (this.renderComponent) this.removeChild(this.renderComponent);
    this.pageHost.replaceChildren(page);
    this.contentEl.scrollTop = scroll;
    this.renderComponent = component;
    this.renderedPath = file.path;
    this.renderedSheet = sheet;
    this.renderKey = key;
    this.title = sheet ? `${title} · Exercises` : title;
    this.leaf.updateHeader?.();
  }

  render(markdown, host, state, engine = state.readerMath) {
    return renderMarkdown(this.app, markdown, host, state.file.path, state.component, engine);
  }

  async renderUnit(unit, host, state) {
    if (!unit.node || !unit.callout) return this.render(unit.markdown, host, state);
    const heading = host.createEl('h3', { cls: 'buches-learning-title' });
    heading.createSpan({ cls: 'buches-learning-kind', text: unit.callout });
    await this.render(unit.node.title, heading.createSpan(), state);
    return this.render(calloutBody(unit.markdown), host.createDiv(), state);
  }

  async renderExerciseSheet(body, context, state) {
    const { model, progress } = state;
    const chapters = context.isIndex ? model.chapters : context.concept ? flattenConcepts([context.concept])
      .map(concept => model.byPath.get(concept.file.path)) : [];
    let number = 0;
    for (const chapter of chapters) {
      const exercises = chapter.nodes.filter(node => node.type === 'exercise');
      if (!exercises.length) continue;
      const group = body.createEl('section', { cls: 'buches-exam-chapter' });
      chapterLink(group.createEl('h2'), chapter, target => this.plugin.openTarget(target, this.leaf));
      for (const exercise of exercises) {
        const target = model.targets.get(`${chapter.path}#${exercise.id}`);
        const row = group.createEl('section', { cls: 'buches-exam-exercise' });
        const heading = row.createEl('h3', { text: `${++number}. ` });
        await this.render(exercise.title.replace(/^Exercise:?\s*/i, ''), heading.createSpan(), { ...state, file: chapter.file });
        const prompt = [exercise.unit.callout ? calloutBody(exercise.unit.markdown) : '', ...(exercise.prompt ?? [])]
          .filter(Boolean).join('\n\n');
        await this.render(prompt, row.createDiv(), { ...state, file: chapter.file });
        const prerequisites = new Set([chapter, ...chapter.dependencies, ...target.dependencies]);
        for (const match of prompt.matchAll(/(?<!!)\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
          const [path, fragment] = match[1].split('#');
          const file = path ? this.app.metadataCache.getFirstLinkpathDest(path, chapter.path) : chapter.file;
          const linked = file && model.targets.get(fragment ? `${file.path}#${fragment}` : file.path);
          if (linked && linked !== target && linked !== chapter) prerequisites.add(linked);
        }
        const tools = row.createDiv({ cls: 'buches-exam-tools' });
        studyActions(this, tools, { ...state, file: chapter.file }, exercise, { question: true });
        const disclosure = tools.createEl('details', { cls: 'buches-exam-prereqs buches-hint' });
        const summary = disclosure.createEl('summary', { text: 'Prerequisites' });
        const popover = disclosure.createDiv({ cls: 'buches-hint-popover' });
        renderDependencies(popover, model, progress, { dependencies: [...prerequisites] },
          item => this.plugin.openTarget(item, this.leaf));
        this.bindPopover(disclosure, summary, state.component);
        progressButton(tools, 'Mark solved', statusFor(model, progress, target),
          done => this.plugin.learn(model, target, done));
        const practice = row.createEl('details', { cls: 'buches-exam-solution' });
        practice.dataset.stateKey = `practice:${target.key}`;
        practice.createEl('summary', { text: 'Solution and hints' });
        await this.renderSolution(practice, exercise.solution ?? emptySolution(exercise), { ...state, file: chapter.file }, false);
      }
    }
    if (!number) body.createEl('p', { cls: 'buches-context-empty', text: 'No exercises yet.' });
  }

  bindPopover(disclosure, summary, component) {
    disclosure.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      disclosure.open = false;
      summary.focus();
    });
    component.registerDomEvent(disclosure.ownerDocument, 'pointerdown', event => {
      if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
    });
  }

  async renderSolution(body, unit, state, showSolved = true) {
    const { exercise, hints } = unit;
    const { model, progress, file } = state;
    const section = body.createEl('section', { cls: 'buches-exercise-tools' });
    const inner = section.createDiv({ cls: 'buches-solution-inner' });
    const tools = inner.createDiv({ cls: 'buches-solution-tools' });
    const hintBar = tools.createDiv({ cls: 'buches-hint-bar' });
    studyActions(this, tools, state, exercise, { review: true, selectedSolution: () => note });
    for (const [index, hint] of hints.entries()) {
      const disclosure = hintBar.createEl('details', { cls: 'buches-hint' });
      const button = disclosure.createEl('summary', { attr: { 'aria-label': `Hint ${index + 1}` } });
      setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), 'lightbulb');
      button.createSpan({ text: `#${index + 1}` });
      const popover = disclosure.createDiv({ cls: 'buches-hint-popover buches-source-block' });
      const rendered = popover.createDiv();
      const markdown = calloutBody(hint.markdown);
      if (hint.title && hint.title.toLowerCase() !== 'hint') rendered.createEl('strong', { text: hint.title });
      await this.render(markdown, rendered.createDiv(), state);
      disclosure.addEventListener('toggle', () => {
        if (disclosure.open) for (const other of hintBar.children) if (other !== disclosure) other.open = false;
      });
      this.bindPopover(disclosure, button, state.component);
    }
    const target = model?.targets.get(`${file.path}#${exercise.id}`);
    if (target && showSolved) progressButton(tools, 'Mark solved', statusFor(model, progress, target),
      done => this.plugin.learn(model, target, done));

    const details = inner.createEl('details', { cls: 'buches-solution' });
    details.dataset.stateKey = `solution:${file.path}#${exercise.id}`;
    if (exercise.unit === unit) section.dataset.block = exercise.id;
    const summary = details.createEl('summary');
    setIcon(summary.createSpan({ cls: 'buches-solution-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    summary.createSpan({ cls: 'buches-solution-reveal', text: 'Reveal solution' });
    summary.createSpan({ cls: 'buches-solution-hide', text: 'Hide solution' });
    const tabs = [{ path: '', title: 'Solution 1' }, ...solutionTabs(unit).map((tab, index) => ({
      ...tab, title: tab.kind === 'ai' ? `AI · Solution ${index + 2}` : `Solution ${index + 2}`,
    }))];
    const tabKey = details.dataset.stateKey;
    const active = tabs.find(tab => tab.path === this.selectedSolutions.get(tabKey)) ?? tabs[0];
    const tabBar = details.createDiv({ cls: 'buches-solution-tabs', attr: { 'aria-label': 'Solutions' } });
    const changeTab = async path => {
      this.selectedSolutions.set(tabKey, path);
      this.renderKey = null;
      await this.refresh();
    };
    const saveCurrent = async () => {
      if (pending) await pending;
      if (embed?.editor && !await this.finishEmbedEdit(embed)) throw new Error('Save the current solution before switching.');
    };
    const addTabButton = (title, action, cls = '') => {
      const button = tabBar.createEl('button', { text: title, cls, attr: { type: 'button' } });
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await action(); }
        catch (error) { this.plugin.report(error, error.message || 'Could not open the solution tab.'); }
        finally { button.disabled = false; }
      });
      return button;
    };
    for (const tab of tabs) {
      const button = addTabButton(tab.title, async () => {
        if (tab === active) return;
        await saveCurrent();
        await changeTab(tab.path);
      });
      button.setAttribute('aria-pressed', String(tab === active));
    }
    const createTab = async kind => {
      await saveCurrent();
      return appendSolutionTab(this.plugin, file, model.book, unit, kind, state.solutionMath);
    };
    addTabButton('+ Solution', async () => changeTab((await createTab('manual')).path), 'buches-solution-tab-add');
    if (claudian(this.app)?.api?.version === 1) {
      addTabButton('+ AI', () => {
        let created;
        new NameModal(this.app, {
          title: 'AI solution',
          placeholder: 'Proof method or first step you want to see',
          submitText: 'Ask Claudian',
          onSubmit: async instructions => {
            created ??= await createTab('ai');
            try { await this.plugin.aiSolutions.ask(created, file, exercise, instructions); }
            finally { await changeTab(created.path); }
          },
        }).open();
      }, 'buches-solution-tab-add');
    }
    const rendered = details.createDiv({ cls: 'buches-solution-body' });
    const edit = tools.createEl('button', { cls: 'buches-block-edit',
      attr: { 'aria-label': 'Edit solution', title: 'Edit solution' } });
    setIcon(edit, 'pencil');
    let embed;
    let note = active.path ? this.app.vault.getAbstractFileByPath(active.path) : null;
    let pending;
    if (note && this.plugin.aiSolutions.isPending(note)) {
      const waiting = details.createDiv({ cls: 'buches-solution-waiting', attr: { role: 'status' } });
      waiting.createSpan({ text: 'Waiting for Claudian…' });
      waiting.createEl('button', { text: 'Stop waiting', attr: { type: 'button' } })
        .addEventListener('click', () => this.plugin.aiSolutions.cancel(note));
    }
    const ensureContent = (native = false) => pending ??= (async () => {
      this.solutionLoading = (this.solutionLoading ?? 0) + 1;
      try {
        if (!active.path) note = await materializeSolution(this.plugin, file, model.book, unit, state.solutionMath);
        if (!note) throw new Error('The linked solution note could not be found.');
        if (!rendered.isConnected) return;
        const source = await this.app.vault.read(note);
        if (!rendered.isConnected) return;
        if (!native && (active.kind === 'ai' || /^---\r?\nrenderer: latex\r?\n/.test(source))) {
          rendered.empty();
          await this.render(stripFrontmatter(source), rendered, { ...state, file: note }, 'mathjax');
          return;
        }
        const create = this.app.embedRegistry?.getEmbedCreator(note);
        if (!create) {
          await this.render(`![[${note.path}]]`, rendered, state);
          return;
        }
        rendered.empty();
        const host = rendered.createDiv({ cls: 'buches-solution-embed markdown-embed' });
        embed = create({ app: this.app, containerEl: host, sourcePath: file.path, displayMode: false }, note, '');
        embed.editable = true;
        state.component.addChild(embed);
        this.embeds.add(embed);
        state.component.register(() => this.embeds.delete(embed));
        await embed.loadFile();
      } catch (error) {
        rendered.empty();
        rendered.createEl('p', { cls: 'buches-edit-error', text: error.message });
        pending = null;
      } finally {
        this.solutionLoading--;
      }
    })();
    details.addEventListener('toggle', () => {
      if (details.open && !unit.virtual) void ensureContent();
      else if (embed?.editor) void this.finishEmbedEdit(embed).then(updateEditButton);
    });
    const grade = tools.createEl('button', { cls: 'buches-block-edit',
      attr: { 'aria-label': 'Grade this solution', title: 'Grade this solution', type: 'button' } });
    setIcon(grade, 'chart-no-axes-column');
    grade.addEventListener('click', async () => {
      grade.disabled = true;
      try {
        await saveCurrent();
        if (!note) note = await materializeSolution(this.plugin, file, model.book, unit, state.solutionMath);
        if (!note) throw new Error('The solution note could not be found.');
        new GradeModal(this, state, exercise, note).open();
      } catch (error) {
        this.plugin.report(error, error.message || 'Could not open the grade.');
      } finally {
        grade.disabled = false;
      }
    });
    const updateEditButton = () => {
      const editing = Boolean(embed?.editor);
      const label = editing ? 'Done editing solution' : 'Edit solution';
      edit.setAttribute('aria-label', label);
      edit.setAttribute('title', label);
      setIcon(edit, editing ? 'check' : 'pencil');
    };
    edit.addEventListener('click', async () => {
      details.open = true;
      if (note && this.plugin.aiSolutions.isPending(note)) return;
      if (pending) await pending;
      if (!embed) {
        pending = null;
        await ensureContent(true);
      }
      if (!embed) {
        if (note) await this.app.workspace.getLeaf('tab').openFile(note, { state: { mode: 'source' } });
        return;
      }
      const editing = Boolean(embed.editor);
      if (editing) {
        if (await this.finishEmbedEdit(embed)) {
          this.renderKey = null;
          await this.refresh();
        }
      } else embed.showEditor();
      updateEditButton();
    });
  }

  async finishEmbedEdit(embed) {
    try {
      await this.flushEmbeds();
      embed.showPreview();
      this.plugin.scheduleRefresh();
      return true;
    } catch (error) {
      this.plugin.report(error, 'Could not save the solution note.');
      return false;
    }
  }

  openLink(event, file) {
    const link = event.target.closest?.('a.internal-link');
    const href = link?.getAttribute('data-href');
    if (!href || event.defaultPrevented) return;
    event.preventDefault();
    const separator = href.indexOf('#');
    const path = separator < 0 ? href : href.slice(0, separator);
    const heading = separator < 0 ? '' : href.slice(separator + 1);
    const target = path ? this.app.metadataCache.getFirstLinkpathDest(path, file.path) : file;
    const newLeaf = Keymap.isModEvent(event);
    if (!newLeaf && target && findBuchContext(this.app, target)) {
      if (heading.startsWith('^')) {
        void this.plugin.openTarget({ file: target, id: heading }, this.leaf);
        return;
      }
      void this.plugin.openFile(target, this.leaf).then(async () => {
        const reader = this.leaf.view;
        if (heading && reader.file?.path === target.path) {
          await reader.refresh();
          reader.goToHeading(heading);
        }
      });
    } else {
      void this.app.workspace.openLinkText(href, file.path, newLeaf);
    }
  }

  async revealBlock(id) {
    await this.refresh();
    const target = [...this.pageHost.querySelectorAll('[data-block]')].find(el => el.dataset.block === id);
    this.scrollTo(target);
  }

  goToHeading(text) {
    const heading = [...this.pageHost.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .find(el => (el.dataset.heading || el.textContent).trim().toLowerCase() === text.trim().toLowerCase());
    this.scrollTo(heading);
  }

  scrollTo(target) {
    for (let details = target?.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
    target?.scrollIntoView({ block: 'start' });
  }
}

function calloutBody(markdown) {
  return markdown.split(/\r?\n/).slice(1).map(line => line.replace(/^ {0,3}> ?/, '')).join('\n');
}

module.exports = { BuchReader, READER_VIEW };
