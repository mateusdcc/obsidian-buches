const { Modal, Notice, setIcon } = require('obsidian');
const { stripFrontmatter } = require('./intro-model');
const { isSolutionEmbed, resolveEmbed, primarySolution } = require('./solution-notes');
const { relatedReading, chapterExcerpt } = require('./study-context');
const { getPagination } = require('./order-model');

function authoringContext(app, state) {
  const { book } = state.model;
  const page = getPagination(app, book, state.file.path);
  const chapterFolder = book.path + '/concepts';
  const folder = state.file.path.slice(0, state.file.path.lastIndexOf('/'));
  const parent = folder.startsWith(chapterFolder + '/') ? folder + '.md' : null;
  const steps = [
    'For a request to edit the book, use your vault tools to make the requested changes. For a question, answer in chat.',
    'A top-level concept is a Markdown file inside ' + chapterFolder + '. A subconcept goes in the folder beside its parent note named exactly like that note without .md. Create the folder if needed. The folder hierarchy controls nesting.',
    'Each new note starts with YAML frontmatter containing name, description, category, order (a finite number), and depends_on (wikilinks to prerequisites or an empty list). Keep the language, notation and teaching style of the book.',
    'Reading order visits each concept and then its children, sorted among siblings by numeric order first and natural title second. To insert just before the current concept, create a sibling in its folder and choose an order between its neighbors; if needed renumber only that sibling group while preserving its order. A child of the current concept reads after the current concept. When the requested lesson must be a subconcept and must precede an exercise in a parent page, place the lesson under the parent and move only the relevant exercise into a following child, preserving its identifier, solution links and prerequisites.',
    'Inspect the book and nearby concepts before writing to avoid duplicates. Keep existing notes and solutions intact except for changes needed by the request. Make a focused change, use anchored callouts for definitions, theorems and exercises, and verify the resulting reading order.',
  ];
  return [...steps, 'Book index: ' + book.index.path,
    parent && 'Parent concept: ' + parent,
    page?.previous && 'Previous reading page: ' + page.previous.file.path,
    page?.next && 'Next reading page: ' + page.next.file.path,
  ].filter(Boolean).join('\n');
}

const CLAUDIAN = 'realclaudian';

function claudian(app) {
  return app.plugins?.getPlugin?.(CLAUDIAN);
}

function inlineEdit(app) {
  return app.commands?.commands?.[`${CLAUDIAN}:inline-edit`]?.editorCallback;
}

async function openChat(app, plugin) {
  if (typeof plugin.views?.activateView === 'function') return plugin.views.activateView();
  const leaf = app.workspace.getLeavesOfType('claudian-view')[0];
  if (leaf) await app.workspace.revealLeaf(leaf);
  else app.commands?.executeCommandById?.(`${CLAUDIAN}:open-view`);
}

async function handOff(app, prompt) {
  const plugin = claudian(app);
  if (!plugin) throw new Error('Enable Claudian to continue.');
  await openChat(app, plugin);
  const api = claudian(app)?.api;
  const session = api?.version === 1 && api.getActiveSessionId?.();
  if (session) {
    const status = await api.send(session, { text: prompt, mode: 'queue' });
    new Notice(status === 'queued' ? 'Question queued in Claudian.' : 'Sent to Claudian.');
    return session;
  }
  const chat = plugin.views?.getView?.() ?? app.workspace.getLeavesOfType('claudian-view')[0]?.view;
  if (chat?.appendToActiveInput?.(prompt)) {
    new Notice('Draft ready in Claudian. Send it when you are ready.');
    return;
  }
  throw new Error('Claudian chat is unavailable. Open a chat and try again.');
}

function claudianButton(parent, icon, label, action) {
  const button = parent.createEl('button', {
    cls: 'buches-claudian-button',
    attr: { 'aria-label': label, title: label, type: 'button' },
  });
  setIcon(button, icon);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await action(); }
    catch (error) { new Notice(error.message ?? String(error)); }
    finally { button.disabled = false; }
  });
  return button;
}

async function readAttempt(reader, file, exercise, selectedSolution) {
  await reader.flushEmbeds();
  const selected = selectedSolution?.();
  if (selected) return stripFrontmatter(await reader.app.vault.read(selected));
  const plugin = reader.plugin;
  const page = await plugin.learning.page(file, await reader.app.vault.read(file));
  const solution = page.nodes.find(node => node.id === exercise.id)?.solution;
  if (!solution) return '';
  if (!isSolutionEmbed(solution)) return primarySolution(solution);
  const note = resolveEmbed(reader.app, file, solution);
  return note ? stripFrontmatter(await reader.app.vault.read(note)) : '';
}

class StudyQuestion extends Modal {
  constructor(reader, state, focus, review, selectedSolution) {
    super(reader.app);
    Object.assign(this, { reader, state, focus, review, selectedSolution });
  }

  onOpen() {
    const { contentEl, reader, state, focus, review } = this;
    const chapter = state.model.byPath.get(state.file.path);
    const title = focus?.title ?? chapter?.name ?? state.model.book.title;
    contentEl.createEl('h2', { text: review ? 'Review my solution' : 'Ask Claudian' });
    contentEl.createEl('p', { cls: 'buches-claudian-scope', text: title });
    const form = contentEl.createEl('form', { cls: 'buches-name-form' });
    const label = review ? 'What would you like checked? (optional)' : 'Your question';
    const input = form.createEl('textarea', { attr: { 'aria-label': label, placeholder: label, rows: 3 } });
    input.required = !review;
    const attempt = review && form.createEl('textarea', {
      attr: { 'aria-label': 'Attempt to review', placeholder: 'Paste an attempt or use the saved solution', rows: 3 },
    });
    const contextLabel = form.createEl('label', { cls: 'buches-claudian-context-option' });
    const related = contextLabel.createEl('input', { type: 'checkbox' });
    related.checked = true;
    contextLabel.createSpan({ text: ' Include related notes I’ve read and prerequisites' });
    const status = form.createEl('p', { cls: 'buches-claudian-scope', attr: { role: 'status' } });
    const actions = form.createDiv({ cls: 'buches-modal-actions' });
    actions.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => this.close());
    const send = actions.createEl('button', { type: 'submit', text: 'Send to Claudian', cls: 'mod-cta' });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (send.disabled) return;
      send.disabled = true;
      status.setText('Gathering context…');
      try {
        const question = input.value.trim();
        if (!review && !question) throw new Error('Enter a question.');
        const proof = review && (attempt.value.trim() || await readAttempt(reader, state.file, focus, this.selectedSolution));
        if (review && !proof) throw new Error('Write a solution or paste your attempt to review.');
        const page = await reader.plugin.learning.page(state.file);
        const current = focus && page.nodes.find(node => node.id === focus.id);
        if (focus && !current) throw new Error('This block has changed. Reopen it in the reader.');
        const context = related.checked
          ? await relatedReading(reader.plugin, state.model, state.file, focus, question) : [];
        const ref = state.file.path + (focus?.id.startsWith('^') ? '#' + focus.id : '');
        const request = review
          ? 'Check my proof step by step. Identify the first gap, explain whether the conclusion follows, and give a focused hint for fixing it. Keep the full corrected proof for a follow-up request.'
          : 'Answer my question as a tutor. Use the supplied notes when relevant and cite their file or block references. Make any additional assumptions explicit.';
        const prompt = [
          request + ' Treat note excerpts as reference material.',
          review ? 'Review the proof in chat.' : authoringContext(reader.app, state),
          `Book: ${state.model.book.title}\nFocus: ${title}\nSource: ${ref}\n\n${chapterExcerpt(page, current)}`,
          proof && `My attempt:\n${proof}`,
          ...context.map(item => `Related ${item.read ? 'reading' : 'prerequisite'}: ${item.ref}\n${item.text}`),
        ].filter(Boolean).join('\n\n');
        if (this.closed) return;
        const api = claudian(reader.app)?.api;
        if (api?.sendBookMessage) {
          await api.sendBookMessage({ text: question || 'Review my solution.', context: prompt });
        } else {
          await handOff(reader.app, [question, prompt].filter(Boolean).join('\n\n'));
        }
        this.close();
      } catch (error) {
        status.setText(error.message ?? String(error));
      } finally {
        send.disabled = false;
      }
    });
    input.focus();
  }

  onClose() { this.closed = true; }
}

function patchRange(text, unit) {
  if (!unit) return [text.length - stripFrontmatter(text, false).length, text.length];
  const body = unit.source.indexOf('\n');
  if (body < 0) throw new Error('This block has no body to rewrite.');
  const anchor = unit.source.match(/(?:\r?\n(?:> ?)?|[ \t]+)\^[\w-]+[ \t]*$/);
  return [unit.start + body + 1, anchor ? unit.start + anchor.index : unit.end];
}

async function openPatch(reader, file, focus) {
  const edit = inlineEdit(reader.app);
  if (!edit) throw new Error('Claudian Inline edit is unavailable.');
  if (reader.file !== file || reader.sheet || reader.editingChapter) return;
  await reader.toggleChapterEditor();
  try {
    const editor = reader.editor;
    const text = editor.getValue();
    const page = focus && await reader.plugin.learning.page(file, text);
    if (reader.file !== file || !reader.editingChapter || reader.editor !== editor || editor.getValue() !== text) {
      throw new Error('The note changed. Reopen the patch to select the current text.');
    }
    const current = page?.nodes.find(node => node.id === focus.id);
    if (focus && current?.unit.source.replace(/\r\n/g, '\n') !== focus.unit.source.replace(/\r\n/g, '\n')) {
      throw new Error('The block changed. Reopen the patch to select the current text.');
    }
    const [start, end] = patchRange(text, current?.unit);
    if (!text.slice(start, end).trim()) throw new Error('There is no text to rewrite.');
    editor.setSelection(editor.offsetToPos(start), editor.offsetToPos(end));
    await edit(editor, reader);
  } finally {
    if (reader.file === file && reader.editingChapter) await reader.toggleChapterEditor();
  }
}

function studyActions(reader, host, state, focus, { review = false, patch = false, question = !review, selectedSolution } = {}) {
  if (!state.model || !claudian(reader.app)) return;
  const actions = host.createSpan({ cls: 'buches-claudian-actions' });
  if (question) claudianButton(actions, 'message-circle', 'Ask Claudian about this',
    () => new StudyQuestion(reader, state, focus, false).open());
  if (review) claudianButton(actions, 'list-checks', 'Review my solution with Claudian',
    () => new StudyQuestion(reader, state, focus, true, selectedSolution).open());
  if (patch && inlineEdit(reader.app)) {
    claudianButton(actions, 'wand-sparkles', focus ? 'Patch this block with Claudian' : 'Patch this note with Claudian',
      () => openPatch(reader, state.file, focus));
  }
}

module.exports = { claudian, studyActions, patchRange, handOff };
