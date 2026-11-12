const { Notice } = require('obsidian');
const { claudian, handOff } = require('./claudian');
const { chapterExcerpt } = require('./study-context');

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

  async ask(note, file, exercise, instructions) {
    const app = this.plugin.app;
    const page = await this.plugin.learning.page(file);
    const current = page.nodes.find(node => node.id === exercise.id);
    if (!current) throw new Error('The exercise changed. Reopen it and try again.');
    const initial = await app.vault.read(note);
    const prompt = [
      'Write a mathematical proof or a starting point, according to my instructions. Follow the requested proof method and depth. Answer in the language of my instructions. Explain the reusable manipulation or proof technique when it helps. Use Markdown and LaTeX math. Reply in chat without editing files or changing progress.',
      `Exercise: ${current.title}\nSource: ${file.path}\n\n${chapterExcerpt(page, current)}`,
      `My instructions: ${instructions}`,
    ].join('\n\n');
    return this.request(note, 'solution', prompt, async proof => {
      await app.vault.process(note, current => {
        // Preserve any changes made directly to the note while waiting.
        const prefix = current === initial ? current : current.trimEnd() + '\n\n';
        return prefix + proof + '\n';
      });
      new Notice('AI solution saved in its tab.');
    });
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
      if (request.note === note) this.pending.delete(token);
    }
    this.changed();
  }

  async receive(sessionId) {
    const api = claudian(this.plugin.app)?.api;
    const candidates = [...this.pending].filter(([, request]) => !request.session || request.session === sessionId);
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

module.exports = { AiSolutions };
