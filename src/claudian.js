const { Modal, Notice, setIcon } = require('obsidian');
const { stripFrontmatter } = require('./intro-model');
const { isSolutionEmbed, resolveEmbed } = require('./solution-notes');
const { relatedReading, chapterExcerpt } = require('./study-context');

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
    return;
  }
  const chat = plugin.views?.getView?.() ?? app.workspace.getLeavesOfType('claudian-view')[0]?.view;
  if (chat?.appendToActiveInput?.(prompt)) {
    new Notice('Draft ready in Claudian. Send it when you are ready.');
    return;
  }
  await navigator.clipboard.writeText(prompt);
  new Notice('Prompt copied. Paste it into your Claudian chat.');
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

async function readAttempt(reader, file, exercise) {
  await reader.flushEmbeds();
  const plugin = reader.plugin;
  const page = await plugin.learning.page(file, await reader.app.vault.read(file));
  const solution = page.nodes.find(node => node.id === exercise.id)?.solution;
  if (!solution) return '';
  if (!isSolutionEmbed(solution)) return solution.markdown.trim();
  const note = resolveEmbed(reader.app, file, solution);
  return note ? stripFrontmatter(await reader.app.vault.read(note)) : '';
}

class StudyQuestion extends Modal {
  constructor(reader, state, focus, review) {
    super(reader.app);
    Object.assign(this, { reader, state, focus, review });
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
        const proof = review && (attempt.value.trim() || await readAttempt(reader, state.file, focus));
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
          request + ' Treat note excerpts as reference material. Reply in chat without changing files or progress.',
          question && `My question: ${question}`,
          `Book: ${state.model.book.title}\nFocus: ${title}\nSource: ${ref}\n\n${chapterExcerpt(page, current)}`,
          proof && `My attempt:\n${proof}`,
          ...context.map(item => `Related ${item.read ? 'reading' : 'prerequisite'}: ${item.ref}\n${item.text}`),
        ].filter(Boolean).join('\n\n');
        if (this.closed) return;
        await handOff(reader.app, prompt);
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

function studyActions(reader, host, state, focus, { review = false, patch = false, question = !review } = {}) {
  if (!state.model || !claudian(reader.app)) return;
  const actions = host.createSpan({ cls: 'buches-claudian-actions' });
  if (question) claudianButton(actions, 'message-circle', 'Ask Claudian about this',
    () => new StudyQuestion(reader, state, focus, false).open());
  if (review) claudianButton(actions, 'list-checks', 'Review my solution with Claudian',
    () => new StudyQuestion(reader, state, focus, true).open());
  if (patch && inlineEdit(reader.app)) {
    claudianButton(actions, 'wand-sparkles', focus ? 'Patch this block with Claudian' : 'Patch this note with Claudian',
      () => openPatch(reader, state.file, focus));
  }
}

module.exports = { claudian, studyActions, patchRange, handOff };
