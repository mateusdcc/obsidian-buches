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

async function preserveLegacyReview(app, note, bookIndex) {
  const source = await app.vault.read(note);
  const { metadata, body } = readSolution(source);
  const saved = metadata.buches_grade;
  if (!saved?.fingerprint || typeof saved.proof === 'string') return;
  const rubric = rubricFor(app.metadataCache.getFileCache(bookIndex)?.frontmatter);
  if (!rubric.length || await solutionFingerprint(body, rubric) !== saved.fingerprint) return;
  await app.vault.process(note, latest => {
    if (latest !== source) return latest;
    const upgraded = { ...saved, proof: body, rubric, renderer: metadata.renderer ?? null };
    const yaml = stringifyYaml({ ...metadata, buches_grade: upgraded }).trimEnd();
    return '---\n' + yaml + '\n---\n' + body;
  });
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

function storedReview(saved, current) {
  if (!saved) return null;
  const matches = saved.fingerprint === current.fingerprint;
  const proof = typeof saved.proof === 'string' ? saved.proof : matches ? current.body : null;
  const rubric = rubricFor({ grading: saved.rubric });
  const criteria = rubric.length ? rubric : current.rubric;
  if (!criteria.length) return null;
  return {
    proof, rubric: criteria, fingerprint: saved.fingerprint,
    renderer: saved.renderer ?? current.renderer,
    changed: proof === null ? !matches : proof !== current.body,
    stale: !matches,
    grade: validateGrade(saved, criteria, proof === null ? Infinity : proof.split(/\r?\n/).length),
    contest: saved.contest,
  };
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
    this.controls = this.contentEl.createDiv({ cls: 'buches-grade-controls' });
    this.body = this.contentEl.createDiv();
    this.vaultEvent = this.app.vault.on('modify', file => {
      if (file === this.note) void this.refresh();
    });
    this.rubricEvent = this.app.metadataCache.on('changed', file => {
      if (file === this.state.model.book.index) void this.refresh();
    });
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
    if (this.vaultEvent) this.app.vault.offref(this.vaultEvent);
    if (this.rubricEvent) this.app.metadataCache.offref(this.rubricEvent);
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
      const current = { rubric, body, fingerprint, renderer: metadata.renderer };
      const saved = metadata.buches_grade;
      const review = storedReview(saved, current);
      const resultKey = JSON.stringify(review && [saved, review.proof, review.rubric, review.renderer]);
      this.showControls(current, review);
      if (this.resultKey !== resultKey) {
        this.resultKey = resultKey;
        this.body.empty();
        if (review) await this.showGrade(review);
      }
    } catch (error) {
      if (this.closed || revision !== this.revision) return;
      this.controls.empty();
      this.controls.createEl('p', { cls: 'buches-edit-error', text: error.message });
    }
  }

  showControls(current, review) {
    const ai = this.reader.plugin.aiSolutions;
    const task = ai.pendingTask(this.note, 'grade');
    const error = ai.errors.get(this.note);
    const available = typeof claudian(this.app)?.api?.runTask === 'function';
    const key = JSON.stringify([current.fingerprint, review?.grade, review?.contest, task?.phase, error, available, this.contesting]);
    if (this.controlsKey === key) return;
    this.controlsKey = key;
    this.controls.empty();
    if (review?.stale) {
      this.controls.createEl('p', {
        cls: 'buches-claudian-scope',
        text: review.changed ? 'Showing the grade for the previous version of this solution.' : 'Showing the grade for the previous rubric.',
      });
    }
    if (task) {
      this.showPending(task);
      return;
    }
    if (error || this.actionError) {
      this.controls.createEl('p', { cls: 'buches-edit-error', text: this.actionError ?? error });
    }
    const message = !available ? 'Install the Claudian for Bücher fork to grade inside this window.'
      : !current.rubric.length ? 'Define grading criteria in the book index frontmatter.'
      : !current.body.trim() ? 'Write a solution before grading it.'
      : !review ? 'This solution has not been graded yet. Grade it?' : '';
    if (message) this.controls.createEl('p', { text: message });
    if (!available) return;

    const actions = this.controls.createDiv({ cls: 'buches-grade-actions' });
    const start = (input, contest) => {
      try {
        this.grade(input, contest);
        this.actionError = null;
      } catch (error) {
        this.actionError = error.message;
        this.controlsKey = null;
        this.showControls(current, review);
      }
    };
    if (current.rubric.length && current.body.trim()) {
      actions.createEl('button', {
        text: review ? 'Evaluate again' : 'Grade solution',
        cls: !review ? 'mod-cta' : review.changed ? 'buches-grade-edited' : '',
        attr: { type: 'button' },
      }).addEventListener('click', () => {
        this.contesting = false;
        start({ ...current, proof: current.body });
      });
    }
    if (!review) return;
    const contestButton = actions.createEl('button', { text: 'Contest grading', attr: {
      type: 'button', 'aria-expanded': String(Boolean(this.contesting)),
    } });
    contestButton.disabled = review.proof === null;
    if (contestButton.disabled) contestButton.title = 'Evaluate again to record the proof before contesting this legacy grade.';
    contestButton.addEventListener('click', () => {
      this.contesting = !this.contesting;
      this.showControls(current, review);
      if (this.contesting) this.controls.querySelector('textarea')?.focus();
      else this.controls.querySelector('[aria-expanded]')?.focus();
    });
    if (!this.contesting) return;

    const form = this.controls.createEl('form', { cls: 'buches-grade-contest buches-name-form' });
    const input = form.createEl('textarea', { attr: {
      rows: '3', 'aria-label': 'Why should this grade be reconsidered?',
      placeholder: 'Which score or comment should be reconsidered, and why?',
    } });
    input.required = true;
    input.value = this.contestDraft ?? '';
    input.addEventListener('input', () => { this.contestDraft = input.value; });
    form.createEl('button', { text: 'Submit contest', cls: 'mod-cta', attr: { type: 'submit' } });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const reason = input.value.trim();
      if (!reason) return input.focus();
      start(review, { reason, grade: review.grade });
    });
  }

  showPending(task) {
    const ai = this.reader.plugin.aiSolutions;
    const status = this.controls.createDiv({ cls: 'buches-grade-pending' });
    status.createEl('p', { text: ai.taskStatus(this.note, 'grade'), attr: { role: 'status' } });
    status.createEl('progress', { attr: { 'aria-label': 'Grading in progress' } });
    const details = status.createEl('details', { cls: 'buches-grade-analysis' });
    details.open = this.analysisOpen ?? false;
    details.addEventListener('toggle', () => { this.analysisOpen = details.open; });
    details.createEl('summary', { text: 'Review details' });
    this.liveAnalysis = details.createEl('p', { cls: 'buches-live-analysis', text: task.analysis ?? 'The reviewer is checking the proof against the rubric.' });
    status.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).addEventListener('click', () => ai.cancel(this.note));
  }

  grade({ rubric, proof, fingerprint, renderer }, contest) {
    const { reader, state, exercise, note } = this;
    reader.plugin.aiSolutions.run(note, 'grade', async (api, options) => {
      const page = await reader.plugin.learning.page(state.file);
      const current = page.nodes.find(node => node.id === exercise.id);
      if (!current) throw new Error('The exercise changed. Reopen it and try again.');
      const lines = proof.split(/\r?\n/);
      options.signal.throwIfAborted();
      const { data } = await api.runTask({
        ...options,
        schema: gradeSchema(rubric),
        book: { path: state.model.book.path, chapter: state.file.path, block: current.id, query: exercise.title },
        instructions: proofReviewer + (contest ? '\nReconsider the previous assessment in light of the student’s objection. Grade the same submitted proof. Keep or revise the scores on their merits and explain the decision in the summary.' : ''),
        prompt: [
          'Rubric: ' + JSON.stringify(rubric),
          'Exercise: ' + exercise.title + '\n' + chapterExcerpt(page, current),
          'Submitted proof:\n' + lines.map((line, i) => (i + 1) + ' | ' + line).join('\n'),
          contest && 'Previous grade: ' + JSON.stringify(contest.grade) + '\nStudent objection: ' + contest.reason,
        ].filter(Boolean).join('\n\n'),
      });
      options.signal.throwIfAborted();
      const grade = validateGrade(data, rubric, lines.length);
      await this.app.vault.process(note, text => {
        options.signal.throwIfAborted();
        const latest = readSolution(text);
        const saved = latest.metadata.buches_grade;
        if (contest && (saved?.fingerprint !== fingerprint
          || JSON.stringify(validateGrade(saved, rubric, lines.length)) !== JSON.stringify(contest.grade))) {
          throw new Error('The grade changed while the contest was open. Reopen it and try again.');
        }
        const review = { fingerprint, proof, rubric, renderer: renderer ?? null, ...grade };
        if (contest) review.contest = contest;
        const yaml = stringifyYaml({ ...latest.metadata, buches_grade: review }).trimEnd();
        return '---\n' + yaml + '\n---\n' + latest.body;
      });
      if (contest) {
        this.contestDraft = '';
        this.contesting = false;
      }
    });
  }

  async showGrade({ rubric, grade, proof, renderer, contest }) {
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
    if (contest?.grade) {
      const previous = this.body.createEl('details', { cls: 'buches-grade-analysis' });
      previous.createEl('summary', { text: `Grade before contest · ${format(weightedGrade(rubric, contest.grade.scores))} / 10` });
      previous.createEl('p', { text: contest.reason });
      for (const [i, result] of contest.grade.scores.entries()) {
        previous.createEl('p', { text: `${rubric[i].label} · ${format(result.score)}/10 · ${result.reason}` });
      }
    }
    if (proof === null) {
      this.body.createEl('p', { cls: 'buches-claudian-scope', text: 'The original text for this older grade is unavailable.' });
      return;
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

module.exports = { GradeModal, rubricFor, validateGrade, weightedGrade, storedReview, preserveLegacyReview };
