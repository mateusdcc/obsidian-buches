const test = require('node:test');
const assert = require('node:assert/strict');
const { AiSolutions, solutionPrompt } = require('../src/ai-solutions');
const { solutionTabs, primarySolution, primaryKind, removeSolutionTab } = require('../src/solution-notes');

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
