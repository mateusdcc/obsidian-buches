const test = require('node:test');
const assert = require('node:assert/strict');
const { AiSolutions, solutionPrompt } = require('../src/ai-solutions');
const {
  solutionTabs, primarySolution, primaryKind, removeSolutionTab,
  appendSolutionTab, materializeSolution, engineForRenderer, solutionEngine,
} = require('../src/solution-notes');

test('saving an AI reply requires the matching request and preserves an intervening edit', async () => {
  let reply = 'Another response';
  let content = 'My own notes\n';
  const note = { path: 'Buches/Book/_solutions/alternate.md' };
  const app = {
    plugins: { getPlugin: () => ({ api: { version: 1, read: async () => reply } }) },
    workspace: { on: () => ({}) },
    vault: { process: async (file, update) => { assert.equal(file, note); content = update(content); } },
  };
  const ai = new AiSolutions({ app, registerEvent() {}, scheduleRefresh() {} });
  const marker = '<!-- buches-ai-solution: example -->';
  ai.pending.set('example', { note, marker, session: 'correct', save: async proof => {
    await app.vault.process(note, current => current.trimEnd() + '\n\n' + proof + '\n');
  } });
  await ai.receive('correct');
  assert.equal(content, 'My own notes\n');
  reply = marker + '\n\nThe proof.';
  await ai.receive('another-session');
  assert.equal(content, 'My own notes\n');
  await ai.receive('correct');
  await ai.receive('correct');
  assert.equal(content, 'My own notes\n\nThe proof.\n');
});

test('alternate solution markers leave the original solution available', () => {
  const unit = { markdown: 'An original proof.\r\n<!-- buches-solution-tab: ai -->\r\n![[Buches/Book/_solutions/a.md]]\r\n' };
  assert.equal(primarySolution(unit), 'An original proof.');
  assert.deepEqual(solutionTabs(unit).map(({ kind, path }) => [kind, path]), [['ai', 'Buches/Book/_solutions/a.md']]);
});

test('AI requests default to a short proof and send the chosen scope with the requested method', () => {
  const file = { path: 'Buches/Book/Exercise.md' };
  const exercise = { title: 'Prove invariance under transposition' };
  const concise = solutionPrompt(file, exercise, 'Exercise text', '');
  assert.match(concise, /Writing style: Concise.*one to three compact paragraphs/);
  assert.match(concise, /inline math as \$\.\.\.\$/);
  assert.match(concise, /display math between \$\$/);
  const firstStep = solutionPrompt(file, exercise, 'Exercise text', 'Reindex the Leibniz formula.', 'first-step');
  assert.match(firstStep, /Writing style: First step only.*Stop before giving later steps/);
  assert.match(firstStep, /My instructions: Reindex the Leibniz formula\./);
});

test('deleting the primary tab promotes the AI tab and protects the last tab', async () => {
  const chapter = { path: 'Buches/Book/concepts/Exercise.md' };
  const original = { path: 'Buches/Book/_solutions/original.md' };
  const ai = 'Buches/Book/_solutions/ai.md';
  const manual = 'Buches/Book/_solutions/manual.md';
  const marker = (kind, path) => '<!-- buches-solution-tab: ' + kind + ' -->\r\n![[' + path + ']]\r\n';
  const prefix = 'Question\r\n---\r\n<!-- buches-added-solution -->\r\n';
  const suffix = '---\r\nEnd\r\n';
  let text = prefix + '![[' + original.path + ']]\r\n' + marker('ai', ai) + marker('manual', manual) + suffix;
  const unit = () => ({ markdown: text.slice(prefix.length, -suffix.length), end: text.length - suffix.length, exercise: { id: '^exercise' } });
  const plugin = {
    solutionWrites: new Map(),
    learning: { page: async () => ({ nodes: [{ id: '^exercise', type: 'exercise', solution: unit() }] }) },
    app: {
      vault: { read: async () => text, process: async (_, write) => { text = write(text); } },
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { getFirstLinkpathDest: path => path === original.path ? original : { path } },
    },
  };
  assert.equal(await removeSolutionTab(plugin, chapter, {}, unit(), '', 'mathjax'), ai);
  assert.equal(primaryKind(unit()), 'ai');
  assert.equal(primarySolution(unit()), '![[' + ai + ']]');
  assert.deepEqual(solutionTabs(unit()).map(tab => tab.path), [manual]);
  await removeSolutionTab(plugin, chapter, {}, unit(), manual, 'mathjax');
  assert.equal(text, prefix + '<!-- buches-primary-ai -->\r\n![[' + ai + ']]\r\n' + suffix);
  await assert.rejects(removeSolutionTab(plugin, chapter, {}, unit(), '', 'mathjax'), /at least one/);
});

test('new manual solution tabs honor solutionMath even when the inline unit uses MathJax', async () => {
  const chapter = { path: 'Buches/Book/concepts/Exercise.md' };
  const book = { path: 'Buches/Book' };
  const created = [];
  let text = [
    'Prompt',
    '---',
    '<!-- buches-math: mathjax -->',
    String.raw`$\det(A) \neq 0$.`,
    '<!-- buches-solution-tab: ai -->',
    '![[Buches/Book/_solutions/ai.md]]',
    '---',
  ].join('\n');
  const start = text.indexOf('<!-- buches-math: mathjax -->');
  const end = text.lastIndexOf('\n---') + 1;
  const current = () => ({
    type: 'solution',
    start,
    end,
    source: text.slice(start, end),
    engine: 'mathjax',
    markdown: text.slice(start + '<!-- buches-math: mathjax -->\n'.length, end),
    exercise: { id: '^exercise', unit: null },
  });
  const plugin = {
    solutionWrites: new Map(),
    learning: { page: async () => ({ units: [], nodes: [{ id: '^exercise', type: 'exercise', solution: current() }] }) },
    app: {
      vault: {
        getAbstractFileByPath: path => (path === 'Buches/Book/_solutions' ? { children: [] } : null),
        create: async (path, content) => {
          const note = { path, content };
          created.push(note);
          return note;
        },
        read: async () => text,
        process: async (_, write) => { text = write(text); },
      },
      workspace: { getLeavesOfType: () => [] },
    },
  };

  const manual = await appendSolutionTab(plugin, chapter, book, current(), 'manual', 'typst');
  assert.equal(manual.content, '---\nrenderer: typst\n---\n\n');

  const ai = await appendSolutionTab(plugin, chapter, book, current(), 'ai', 'typst');
  assert.equal(ai.content, '---\nrenderer: latex\n---\n\n');

  const materialized = await materializeSolution(plugin, chapter, book, current(), 'typst');
  assert.match(materialized.content, /^---\nrenderer: latex\n---\n\n\$\\det\(A\) \\neq 0\$\./);

  const emptyStart = text.lastIndexOf('<!-- buches-solution-tab:');
  text = 'Prompt\n---\n<!-- buches-math: mathjax -->\n---\n';
  const emptyStart2 = text.indexOf('<!-- buches-math: mathjax -->');
  const emptyEnd2 = text.lastIndexOf('\n---') + 1;
  const emptyUnit = () => ({
    type: 'solution',
    start: emptyStart2,
    end: emptyEnd2,
    source: text.slice(emptyStart2, emptyEnd2),
    engine: 'mathjax',
    markdown: '',
    exercise: { id: '^exercise', unit: null },
  });
  plugin.learning.page = async () => ({ units: [], nodes: [{ id: '^exercise', type: 'exercise', solution: emptyUnit() }] });
  const emptyMaterialized = await materializeSolution(plugin, chapter, book, emptyUnit(), 'typst');
  assert.equal(emptyMaterialized.content, '---\nrenderer: typst\n---\n\n');

  const stubText = 'Prompt\n---\n<!-- buches-math: mathjax -->\n**Sua tentativa registrada** · para revisar\n---\n';
  const stubStart = stubText.indexOf('<!-- buches-math: mathjax -->');
  const stubEnd = stubText.lastIndexOf('\n---') + 1;
  text = stubText;
  const stubUnit = () => ({
    type: 'solution',
    start: stubStart,
    end: stubEnd,
    source: text.slice(stubStart, stubEnd),
    engine: 'mathjax',
    markdown: '**Sua tentativa registrada** · para revisar\n',
    exercise: { id: '^exercise', unit: null },
  });
  plugin.learning.page = async () => ({ units: [], nodes: [{ id: '^exercise', type: 'exercise', solution: stubUnit() }] });
  const stubMaterialized = await materializeSolution(plugin, chapter, book, stubUnit(), 'typst');
  assert.equal(stubMaterialized.content, '---\nrenderer: typst\n---\n\n**Sua tentativa registrada** · para revisar\n');
  assert.equal(created.length, 5);
  void emptyStart;
});

test('solutionEngine resolves frontmatter renderer regardless of key order or tab kind', () => {
  assert.equal(engineForRenderer('latex', 'typst'), 'mathjax');
  assert.equal(engineForRenderer('mathjax', 'typst'), 'mathjax');
  assert.equal(engineForRenderer('tex', 'typst'), 'mathjax');
  assert.equal(engineForRenderer('typst', 'mathjax'), 'typst');
  assert.equal(engineForRenderer(null, 'typst'), 'typst');

  assert.equal(solutionEngine('---\nrenderer: typst\n---\n\n$A^(-1)$', 'manual', 'mathjax'), 'typst');
  assert.equal(solutionEngine('---\ntags: [la]\nrenderer: latex\n---\n\n$\\det(A)$', 'manual', 'typst'), 'mathjax');
  assert.equal(solutionEngine('Plain body', 'ai', 'typst'), 'mathjax');
  assert.equal(solutionEngine('Plain body', 'manual', 'typst'), 'typst');
});
