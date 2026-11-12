const { countsFor, statusFor } = require('./progress');
const { renderGraph } = require('./graph-view');

function label(target) { return target.title ?? target.name; }

function chapterLink(parent, target, open) {
  const button = parent.createEl('button', { cls: 'buches-dashboard-link', text: label(target) });
  button.addEventListener('click', () => open(target));
  return button;
}

function exerciseMeter(parent, title, counts) {
  const row = parent.createDiv({ cls: 'buches-meter' });
  row.createEl('strong', { text: title });
  if (!counts.exercises) {
    row.createEl('span', { text: 'No exercises yet' });
    return;
  }
  row.createEl('progress', { attr: { max: counts.exercises, value: counts.solved, 'aria-label': `${title} exercises solved` } });
  row.createEl('span', { text: `${counts.solved} solved · ${counts.exercises - counts.solved} left` });
}

function progressButton(parent, text, checked, update, cls = 'buches-reader-action') {
  const button = parent.createEl('button', { cls });
  const paint = value => {
    button.setAttribute('aria-pressed', String(value));
    button.setAttribute('aria-label', text);
    button.textContent = value ? `✓ ${text.replace(/^Mark /, '')}` : text;
  };
  paint(checked);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const next = button.getAttribute('aria-pressed') !== 'true';
    try { if (await update(next)) paint(next); }
    finally { button.disabled = false; }
  });
  return button;
}

function unmet(model, progress, target) {
  return target.dependencies.filter(dep => !dep || !statusFor(model, progress, dep));
}

function renderDependencies(parent, model, progress, target, open) {
  if (!target.dependencies.length) return;
  const list = parent.createEl('ul', { cls: 'buches-prerequisites', attr: { 'aria-label': 'Prerequisites' } });
  for (const dep of target.dependencies) {
    const li = list.createEl('li');
    if (!dep) { li.setText('Unresolved prerequisite'); continue; }
    const done = statusFor(model, progress, dep);
    li.createSpan({ text: done ? '✓' : '○', attr: { 'aria-label': done ? 'Complete' : 'Remaining' } });
    chapterLink(li, dep, open);
  }
}

function renderBookProgress(header, model, progress) {
  const totals = countsFor(model, progress);
  const row = header.createDiv({ cls: 'buches-book-overview' });
  row.createSpan({ text: `${totals.read} / ${totals.chapters} chapters read` });
  row.createSpan({ text: `${totals.solved} / ${totals.exercises} exercises solved` });
}

function expandable(parent, key, title) {
  const details = parent.createEl('details', { cls: 'buches-dashboard-section' });
  details.dataset.stateKey = key;
  details.createEl('summary', { text: title });
  return details;
}

function renderDashboard(host, model, progress, open) {
  if (!model.chapters.length) {
    host.createEl('p', { cls: 'buches-context-empty', text: 'Create a concept to start the curriculum.' });
    return;
  }
  const categories = new Map();
  for (const chapter of model.chapters) {
    if (!categories.has(chapter.category)) categories.set(chapter.category, []);
    categories.get(chapter.category).push(chapter);
  }
  const byCategory = host.createEl('section');
  byCategory.createEl('h2', { text: 'By category' });
  const groups = byCategory.createDiv({ cls: 'buches-category-grid' });
  for (const [name, chapters] of categories) {
    const group = groups.createDiv({ cls: 'buches-category' });
    group.createEl('h3', { text: name });
    const count = countsFor(model, progress, chapters);
    group.createEl('p', { text: `${count.read} / ${count.chapters} chapters read` });
    if (count.exercises) group.createEl('p', { text: `${count.solved} / ${count.exercises} exercises solved` });
  }

  const curriculum = expandable(host, 'curriculum', 'Curriculum');
  function renderChapters(parent, concepts) {
    if (!concepts.length) return;
    const list = parent.createEl('ol', { cls: 'buches-curriculum' });
    for (const concept of concepts) {
      const chapter = model.byPath.get(concept.file.path);
      const li = list.createEl('li');
      const link = chapterLink(li, chapter, open);
      if (chapter.description) link.setAttribute('title', chapter.description);
      if (statusFor(model, progress, chapter)) li.createSpan({ cls: 'buches-read-check', text: '✓', attr: { 'aria-label': 'Read' } });
      renderChapters(li, chapter.children);
    }
  }
  renderChapters(curriculum, model.book.concepts);

  const tree = expandable(host, 'skill-tree', 'Skill tree');
  const edges = model.chapters.flatMap(chapter => chapter.dependencies.filter(dep => dep && dep.path !== chapter.path)
    .map(dep => ({ source: chapter.path, target: dep.path, type: 'dependency' })));
  renderGraph(tree.createDiv({ cls: 'buches-graph-wrap' }), { nodes: model.chapters, edges }, '',
    file => open(model.byPath.get(file.path)), chapter => statusFor(model, progress, chapter));
  for (const chapter of model.chapters) {
    const item = expandable(tree, `skill:${chapter.path}`, chapter.name);
    const remaining = unmet(model, progress, chapter).length;
    const done = statusFor(model, progress, chapter);
    chapterLink(item, chapter, open);
    item.createDiv({ cls: 'buches-curriculum-meta',
      text: done ? 'Read' : remaining ? `${remaining} prerequisite${remaining === 1 ? '' : 's'} left` : 'Ready to read' });
    renderDependencies(item, model, progress, chapter, open);
    if (!chapter.nodes.length) continue;
    const list = item.createEl('ul', { cls: 'buches-skill-blocks' });
    for (const node of chapter.nodes) {
      const target = model.targets.get(`${chapter.path}#${node.id}`);
      const li = list.createEl('li');
      chapterLink(li, target, open);
      renderDependencies(li, model, progress, target, open);
    }
  }
  if (model.issues.length) {
    const diagnostics = expandable(tree, 'prerequisite-issues', `${model.issues.length} prerequisite issues`);
    const list = diagnostics.createEl('ul');
    for (const issue of model.issues) list.createEl('li', { text: issue });
  }
}

module.exports = { renderDashboard, renderBookProgress, renderDependencies, chapterLink, exerciseMeter, progressButton };
