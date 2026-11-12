const { Modal, Notice } = require('obsidian');
const { claudian, handOff } = require('./claudian');
const { stripFrontmatter } = require('./intro-model');
const { chapterExcerpt } = require('./study-context');
const { normalizeLatexDelimiters } = require('./math');
const { proofTutor } = require('./study-skills');

const MATH_FORMAT = 'Use Obsidian Markdown. Write inline math as $...$. Put display math between $$ delimiters on their own lines. Do not use backslash-parenthesis or backslash-bracket delimiters. Put LaTeX environments inside display math. Do not wrap the reply in a code fence.';

const TASK_STATUS = {
  preparing: 'Finding relevant passages…',
  starting: 'Starting the model…',
  working: 'Analyzing the exercise…',
  responding: 'Receiving the response…',
};

const STYLES = {
  concise: {
    label: 'Concise',
    description: 'A short, complete proof with the key calculation or inference.',
    instruction: 'Start with the first mathematical step. Aim for one to three compact paragraphs or a single derivation with brief justification. Use more space only when the exercise requires it. Skip introductions, restating the exercise, optional examples, and recaps.',
  },
  'step-by-step': {
    label: 'Step by step',
    description: 'The complete proof, with each non-obvious step explained.',
    instruction: 'Present a complete proof. Explain each non-obvious step and why the key manipulation is valid. Keep background and examples out unless requested or required.',
  },
  sketch: {
    label: 'Proof sketch',
    description: 'The strategy and key identities, with routine details left to you.',
    instruction: 'Give the proof strategy and the decisive identities or implications. Leave routine calculations to the reader. Identify any substantive gap left for the reader to fill.',
  },
  'first-step': {
    label: 'First step only',
    description: 'One useful starting move and why it helps.',
    instruction: 'Give one concrete starting step and briefly explain why it is useful. Stop before giving later steps or the conclusion.',
  },
};

function solutionPrompt(file, exercise, excerpt, instructions, style) {
  const preset = Object.hasOwn(STYLES, style) ? STYLES[style] : STYLES.concise;
  return [
    'Answer in the language of the exercise unless I explicitly ask for another language. Follow any explicit method, scope, or detail I request. Apply the selected style where it fits those instructions.',
    `Writing style: ${preset.label}. ${preset.instruction}`,
    MATH_FORMAT + ' Return the requested mathematical content in chat without editing files.',
    `Exercise: ${exercise.title}\nSource: ${file.path}\n\n${excerpt}`,
    instructions && `My instructions: ${instructions}`,
  ].filter(Boolean).join('\n\n');
}

class AiSolutionModal extends Modal {
  constructor(app, submit, { patch = false } = {}) {
    super(app);
    this.submit = submit;
    this.patch = patch;
  }

  onOpen() {
    const patch = this.patch;
    this.contentEl.createEl('h2', { text: patch ? 'Patch AI solution' : 'AI solution' });
    const form = this.contentEl.createEl('form', { cls: 'buches-name-form' });
    let style;
    if (!patch) {
      const label = form.createEl('label', { cls: 'buches-ai-style' });
      label.createSpan({ text: 'Writing style' });
      style = label.createEl('select', { cls: 'dropdown' });
      for (const [value, preset] of Object.entries(STYLES)) {
        style.createEl('option', { text: preset.label, attr: { value } });
      }
      const description = form.createEl('p', { cls: 'buches-claudian-scope', text: STYLES.concise.description });
      style.addEventListener('change', () => description.setText(STYLES[style.value].description));
    }
    const input = form.createEl('textarea', { attr: {
      'aria-label': patch ? 'What should change?' : 'Instructions (optional)',
      placeholder: patch
        ? 'e.g. Keep the proof and add a numerical example after the key step.'
        : 'e.g. Reindex the Leibniz formula and show the key algebraic step.',
      rows: 3,
    } });
    input.required = patch;
    const actions = form.createDiv({ cls: 'buches-modal-actions' });
    actions.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => this.close());
    const send = actions.createEl('button', { type: 'submit', text: patch ? 'Apply patch' : 'Ask Claudian', cls: 'mod-cta' });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (send.disabled || (patch && !input.value.trim())) return;
      send.disabled = true;
      try {
        await this.submit(input.value.trim(), style?.value);
        this.close();
      } catch (error) {
        new Notice(error.message ?? String(error));
      } finally {
        send.disabled = false;
      }
    });
    input.focus();
  }

  onClose() { this.contentEl.empty(); }
}

class AiSolutions {
  constructor(plugin) {
    this.plugin = plugin;
    this.pending = new Map();
    this.errors = new WeakMap();
    this.revision = 0;
    plugin.registerEvent(plugin.app.workspace.on('claudian:turn-ended', event => {
      void this.receive(event.sessionId).catch(error => plugin.report(error, 'Could not read the Claudian reply.'));
    }));
  }

  async ask(note, file, exercise, instructions, style, model) {
    const app = this.plugin.app;
    const page = await this.plugin.learning.page(file);
    const current = page.nodes.find(node => node.id === exercise.id);
    if (!current) throw new Error('The exercise changed. Reopen it and try again.');
    const initial = await app.vault.read(note);
    const prompt = solutionPrompt(file, current, chapterExcerpt(page, current), instructions, style);
    const save = async proof => {
      await app.vault.process(note, current => {
        // Preserve any changes made directly to the note while waiting.
        const prefix = current === initial ? current : current.trimEnd() + '\n\n';
        return prefix + normalizeLatexDelimiters(proof) + '\n';
      });
      new Notice('AI solution saved in its tab.');
    };
    if (!claudian(app)?.api?.runTask) return this.request(note, 'solution', prompt, save);
    this.run(note, 'solution', async (api, options) => {
      const { text } = await api.runTask({
        ...options,
        instructions: proofTutor,
        prompt,
        book: { path: model.book.path, chapter: file.path, block: current.id, query: instructions },
      });
      options.signal.throwIfAborted();
      await save(text);
    });
  }

  async patch(note, file, exercise, instructions, model) {
    const { app, learning } = this.plugin;
    const page = await learning.page(file);
    const current = page.nodes.find(node => node.id === exercise.id);
    if (!current) throw new Error('The exercise changed. Reopen it and try again.');
    const initial = stripFrontmatter(await app.vault.read(note), false);
    if (!initial.trim()) throw new Error('Generate an AI solution before patching it.');
    this.run(note, 'solution', async (api, options) => {
      const { text } = await api.runTask({
        ...options,
        instructions: proofTutor + '\nRevise the existing proof in place. Apply only the requested changes and preserve the other parts, including the proof method, notation, and language, unless the user asks to change them.',
        prompt: [
          MATH_FORMAT + ' Return the complete revised solution body, including unchanged parts, with no frontmatter or commentary about the edits.',
          `Exercise: ${current.title}\n\n${chapterExcerpt(page, current)}`,
          'Current solution (reference material):\n' + initial.trim(),
          'Requested changes:\n' + instructions,
        ].join('\n\n'),
        book: { path: model.book.path, chapter: file.path, block: current.id, query: instructions },
      });
      options.signal.throwIfAborted();
      const revised = normalizeLatexDelimiters(text.trim());
      if (!revised) throw new Error('Claudian returned an empty patch.');
      await app.vault.process(note, latest => {
        options.signal.throwIfAborted();
        const body = stripFrontmatter(latest, false);
        if (body !== initial) throw new Error('This solution was edited while Claudian was working. Reopen the patch and try again.');
        const header = latest.slice(0, latest.length - body.length);
        return header + body.match(/^\s*/)[0] + revised + '\n';
      });
      new Notice('AI solution patched.');
    });
  }

  run(note, kind, work) {
    if (this.isPending(note)) throw new Error('A request for this solution is already waiting.');
    const api = claudian(this.plugin.app)?.api;
    if (!api?.runTask) throw new Error('Install the Claudian for Bücher fork to run this request.');
    const token = crypto.randomUUID();
    const controller = new AbortController();
    const task = { note, kind, controller, phase: 'preparing' };
    this.errors.delete(note);
    this.pending.set(token, task);
    this.changed();
    const onProgress = phase => {
      if (controller.signal.aborted) return;
      task.phase = phase;
      this.changed();
    };
    const onAnalysis = text => {
      if (controller.signal.aborted) return;
      task.analysis = ((task.analysis ?? '') + text).slice(0, 8000);
      this.plugin.app.workspace.trigger?.('buches:analysis', note, task.analysis);
    };
    void Promise.resolve().then(() => work(api, { signal: controller.signal, onProgress, onAnalysis })).catch(error => {
      if (!controller.signal.aborted) this.errors.set(note, error.message ?? String(error));
    }).finally(() => {
      if (this.pending.delete(token)) this.changed();
    });
  }

  pendingTask(note, kind) {
    return [...this.pending.values()].find(task => task.note === note && (!kind || kind === task.kind));
  }

  taskStatus(note, kind) {
    const task = this.pendingTask(note, kind);
    return TASK_STATUS[task?.phase] ?? 'Waiting for Claudian…';
  }

  dispose() {
    for (const request of this.pending.values()) request.controller?.abort();
    this.pending.clear();
  }

  async request(note, kind, prompt, save) {
    if (this.isPending(note)) throw new Error('A request for this solution is already waiting.');
    const token = crypto.randomUUID();
    const marker = `<!-- buches-ai-${kind}: ${token} -->`;
    const request = { note, marker, kind, save, session: undefined };
    this.errors.delete(note);
    this.pending.set(token, request);
    this.changed();
    try {
      request.session = await handOff(this.plugin.app, prompt + '\n\nBegin the reply with this exact line:\n' + marker);
    } catch (error) {
      this.pending.delete(token);
      this.changed();
      throw error;
    }
  }

  changed() {
    this.revision += 1;
    this.plugin.app.workspace.trigger?.('buches:ai-changed');
    this.plugin.scheduleRefresh();
  }

  isPending(note, kind) {
    return [...this.pending.values()].some(request => request.note === note && (!kind || request.kind === kind));
  }

  cancel(note) {
    for (const [token, request] of this.pending) {
      if (request.note !== note) continue;
      request.controller?.abort();
      this.pending.delete(token);
    }
    this.changed();
  }

  async receive(sessionId) {
    const api = claudian(this.plugin.app)?.api;
    const candidates = [...this.pending].filter(([, request]) => request.marker && (!request.session || request.session === sessionId));
    if (!candidates.length || api?.version !== 1) return;
    const lines = (await api.read(sessionId)).trim().split(/\r?\n/);
    for (const [token, request] of candidates) {
      const markerIndex = lines.findIndex(line => line.trim() === request.marker);
      if (markerIndex < 0 || !this.pending.delete(token)) continue;
      try {
        await request.save(lines.slice(markerIndex + 1).join('\n').trim());
      } catch (error) {
        this.errors.set(request.note, error.message);
        this.plugin.report(error, error.message || 'Could not save the Claudian reply.');
      } finally {
        this.changed();
      }
      return;
    }
  }
}

module.exports = { AiSolutions, AiSolutionModal, solutionPrompt };
