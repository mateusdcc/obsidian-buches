const { Component, Modal, parseYaml, stringifyYaml } = require('obsidian');
const { claudian } = require('./claudian');
const { chapterExcerpt } = require('./study-context');
const { proofReviewer } = require('./study-skills');

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function rubricFor(frontmatter) {
  const rows = frontmatter?.grading;
  if (!Array.isArray(rows) || !rows.length) return [];
  const ids = new Set();
  for (const row of rows) {
    if (typeof row?.id !== 'string' || !row.id.trim() || ids.has(row.id) ||
        typeof row.label !== 'string' || !row.label.trim() ||
        typeof row.criteria !== 'string' || !row.criteria.trim() ||
        !Number.isFinite(row.weight) || row.weight <= 0) return [];
    ids.add(row.id);
  }
  return rows.map(({ id, label, criteria, weight }) => ({ id, label, criteria, weight }));
}

function readSolution(text) {
  const header = text.match(FRONTMATTER);
  return {
    metadata: header ? parseYaml(header[1]) ?? {} : {},
    body: text.slice(header?.[0].length ?? 0),
  };
}

async function solutionFingerprint(body, rubric) {
  const bytes = new TextEncoder().encode(JSON.stringify([body, rubric]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateGrade(reply, rubric, lineCount) {
  let grade = reply;
  if (typeof reply === 'string') {
    const json = reply.trim().replace(/^```(?:json)?\s*\n/i, '').replace(/\n```\s*$/, '');
    try { grade = JSON.parse(json); }
    catch { throw new Error('Claudian did not return a readable grade. Try grading again.'); }
  }
  if (!Array.isArray(grade?.scores) || grade.scores.length !== rubric.length || !Array.isArray(grade.comments)) {
    throw new Error('Claudian did not return a grade for every criterion.');
  }
  const scores = rubric.map(({ id }) => {
    const score = grade.scores.find(item => item?.id === id);
    if (!Number.isFinite(score?.score) || score.score < 0 || score.score > 10 ||
        typeof score.reason !== 'string' || !score.reason.trim()) {
      throw new Error('Claudian returned an invalid score or reason.');
    }
    return { id, score: score.score, reason: score.reason };
  });
  const comments = grade.comments.map(item => {
    if (!Number.isInteger(item?.line) || item.line < 1 || item.line > lineCount ||
        typeof item.comment !== 'string' || !item.comment.trim()) {
      throw new Error('Claudian returned a comment outside the solution.');
    }
    return { line: item.line, comment: item.comment };
  });
  const summary = typeof grade.summary === 'string' ? grade.summary.trim() : '';
  return { scores, comments, ...(summary ? { summary } : {}) };
}

function gradeSchema(rubric) {
  const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const string = { type: 'string' };
  return object({
    summary: { ...string, description: 'A short student-facing explanation of the main checks and their outcome.' },
    scores: { type: 'array', items: object({
      id: { type: 'string', enum: rubric.map(row => row.id) },
      score: { type: 'number' },
      reason: string,
    }) },
    comments: { type: 'array', items: object({ line: { type: 'integer' }, comment: string }) },
  });
}

function weightedGrade(rubric, scores) {
  return rubric.reduce((sum, row, i) => sum + row.weight * scores[i].score, 0)
    / rubric.reduce((sum, row) => sum + row.weight, 0);
}

class GradeModal extends Modal {
  constructor(reader, state, exercise, note) {
    super(reader.app);
    Object.assign(this, { reader, state, exercise, note });
  }

  onOpen() {
    this.component = new Component();
    this.component.load();
    this.contentEl.createEl('h2', { text: 'Solution grade' });
    this.contentEl.createEl('p', { cls: 'buches-claudian-scope', text: this.exercise.title });
    this.body = this.contentEl.createDiv();
    this.event = this.app.workspace.on('buches:ai-changed', () => void this.refresh());
    this.analysisEvent = this.app.workspace.on('buches:analysis', (note, text) => {
      if (note === this.note && this.liveAnalysis?.isConnected) this.liveAnalysis.setText(text);
    });
    void this.refresh();
  }

  onClose() {
    this.closed = true;
    if (this.event) this.app.workspace.offref(this.event);
    if (this.analysisEvent) this.app.workspace.offref(this.analysisEvent);
    this.component?.unload();
  }

  rubric() {
    return rubricFor(this.app.metadataCache.getFileCache(this.state.model.book.index)?.frontmatter);
  }

  async refresh() {
    const revision = this.revision = (this.revision ?? 0) + 1;
    try {
      const rubric = this.rubric();
      const { metadata, body } = readSolution(await this.app.vault.read(this.note));
      const fingerprint = await solutionFingerprint(body, rubric);
      if (this.closed || revision !== this.revision) return;
      this.body.empty();
      if (!rubric.length) {
        this.body.createEl('p', { text: 'Define grading criteria in the book index frontmatter.' });
        return;
      }
      const ai = this.reader.plugin.aiSolutions;
      const saved = metadata.buches_grade;
      if (saved?.fingerprint === fingerprint) {
        const grade = validateGrade(saved, rubric, body.split(/\r?\n/).length);
        await this.showGrade(rubric, grade, body, metadata.renderer);
        return;
      }
      if (ai.isPending(this.note, 'grade')) {
        const task = this.body.createDiv({ cls: 'buches-grade-pending' });
        task.createEl('p', { text: ai.taskStatus(this.note, 'grade'), attr: { role: 'status' } });
        task.createEl('progress', { attr: { 'aria-label': 'Grading in progress' } });
        const details = task.createEl('details', { cls: 'buches-grade-analysis' });
        details.open = this.analysisOpen ?? false;
        details.addEventListener('toggle', () => { this.analysisOpen = details.open; });
        details.createEl('summary', { text: 'Review details' });
        this.liveAnalysis = details.createEl('p', { cls: 'buches-live-analysis', text:
          ai.pendingTask(this.note, 'grade').analysis ?? 'The model checks the submitted lines against the book’s rubric and relevant material. Its summary will appear here.',
        });
        task.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).addEventListener('click', () => ai.cancel(this.note));
        return;
      }
      const error = ai.errors.get(this.note);
      if (error) this.body.createEl('p', { cls: 'buches-edit-error', text: error });
      const available = typeof claudian(this.app)?.api?.runTask === 'function';
      const message = !body.trim() ? 'Write a solution before grading it.'
        : !available ? 'Install the Claudian for Bücher fork to grade inside this window.'
        : saved ? 'The solution or rubric changed. Grade it again?' : 'This solution has not been graded yet. Grade it?';
      this.body.createEl('p', { text: message });
      if (body.trim() && available) {
        const button = this.body.createEl('button', { text: 'Grade solution', cls: 'mod-cta' });
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await this.grade(rubric, body, fingerprint); }
          catch (error) { this.body.createEl('p', { cls: 'buches-edit-error', text: error.message }); }
          finally { button.disabled = false; }
        });
      }
    } catch (error) {
      if (this.closed || revision !== this.revision) return;
      this.body.empty();
      this.body.createEl('p', { cls: 'buches-edit-error', text: error.message });
    }
  }

  grade(rubric, body, fingerprint) {
    const { reader, state, exercise, note } = this;
    reader.plugin.aiSolutions.run(note, 'grade', async (api, options) => {
      const page = await reader.plugin.learning.page(state.file);
      const current = page.nodes.find(node => node.id === exercise.id);
      if (!current) throw new Error('The exercise changed. Reopen it and try again.');
      const lines = body.split(/\r?\n/);
      options.signal.throwIfAborted();
      const { data } = await api.runTask({
        ...options,
        schema: gradeSchema(rubric),
        book: { path: state.model.book.path, chapter: state.file.path, block: current.id, query: exercise.title },
        instructions: proofReviewer,
        prompt: [
          'Rubric: ' + JSON.stringify(rubric),
          'Exercise: ' + exercise.title + '\n' + chapterExcerpt(page, current),
          'Submitted proof:\n' + lines.map((line, i) => (i + 1) + ' | ' + line).join('\n'),
        ].join('\n\n'),
      });
      options.signal.throwIfAborted();
      const grade = validateGrade(data, rubric, lines.length);
      await this.app.vault.process(note, text => {
        options.signal.throwIfAborted();
        const latest = readSolution(text);
        if (latest.body !== body || JSON.stringify(this.rubric()) !== JSON.stringify(rubric)) {
          throw new Error('The solution or rubric changed while grading. Grade the new version.');
        }
        const yaml = stringifyYaml({ ...latest.metadata, buches_grade: { fingerprint, ...grade } }).trimEnd();
        return '---\n' + yaml + '\n---\n' + latest.body;
      });
    });
  }

  async showGrade(rubric, grade, proof, renderer) {
    const format = score => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(score);
    this.body.createEl('p', { cls: 'buches-grade-total', text: `${format(weightedGrade(rubric, grade.scores))} / 10` });
    if (grade.summary) {
      const details = this.body.createEl('details', { cls: 'buches-grade-analysis' });
      details.open = this.analysisOpen ?? false;
      details.addEventListener('toggle', () => { this.analysisOpen = details.open; });
      details.createEl('summary', { text: 'Review details' });
      await this.reader.render(grade.summary, details.createDiv({ cls: 'markdown-rendered' }), {
        file: this.note, component: this.component, readerMath: 'mathjax',
      });
      if (this.closed || !details.isConnected) return;
    }
    for (const [i, criterion] of rubric.entries()) {
      const result = grade.scores[i];
      const item = this.body.createDiv({ cls: 'buches-grade-item' });
      item.createEl('strong', { text: `${criterion.label} · ${format(result.score)}/10 · weight ${criterion.weight}`,
        attr: { title: criterion.criteria } });
      item.createEl('progress', { attr: { value: String(result.score), max: '10', 'aria-label': criterion.label } });
      item.createEl('p', { text: result.reason });
    }
    const details = this.body.createEl('details', { cls: 'buches-grade-annotations' });
    details.open = true;
    details.createEl('summary', { text: 'Commented solution' });
    const source = details.createDiv({ cls: 'buches-graded-source' });
    const lines = proof.split(/\r?\n/);
    const bytes = new TextEncoder().encode(proof).buffer;
    const metadata = await this.app.metadataCache.computeMetadataAsync?.(bytes);
    const starts = [...new Set([0, ...(metadata?.sections ?? []).map(section => section.position.start.line)])]
      .filter(line => line < lines.length).sort((a, b) => a - b);
    const engine = renderer === 'latex' ? 'mathjax' : renderer === 'typst' ? 'typst' : this.state.solutionMath;
    for (const [i, start] of starts.entries()) {
      const end = starts[i + 1] ?? lines.length;
      if (this.closed || !source.isConnected) return;
      const segment = source.createDiv({ cls: 'buches-graded-line markdown-rendered' });
      await this.reader.render(lines.slice(start, end).join('\n'), segment, {
        file: this.note, component: this.component, readerMath: engine,
      });
      for (const { line, comment } of grade.comments.filter(item => item.line > start && item.line <= end)) {
        const remark = segment.createDiv({ cls: 'buches-grade-comment' });
        remark.createEl('small', { text: `Line ${line}`, attr: { title: lines[line - 1] } });
        await this.reader.render(comment, remark.createDiv(), {
          file: this.note, component: this.component, readerMath: 'mathjax',
        });
      }
    }
  }
}

module.exports = { GradeModal, rubricFor, validateGrade, weightedGrade };
