const test = require('node:test');
const assert = require('node:assert/strict');
const { AiSolutions } = require('../src/ai-solutions');
const { solutionTabs, primarySolution } = require('../src/solution-notes');

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
