const assert = require('node:assert/strict');
const { test } = require('node:test');
const { patchRange, handOff } = require('../src/claudian');
const { relatedReading } = require('../src/study-context');

test('patch ranges preserve frontmatter, callout headers and anchors', () => {
  const text = '---\nname: Criterion\n---\n\n> [!theorem] Criterion\n> Original statement. ^criterion\n\nNext';
  const start = text.indexOf('> [!');
  const end = text.indexOf('\n\nNext');
  const [from, to] = patchRange(text, { start, end, source: text.slice(start, end) });
  assert.equal(text.slice(from, to), '> Original statement.');
  assert.equal(text.slice(0, from) + '> Revised.' + text.slice(to), text.replace('Original statement.', 'Revised.'));
  assert.equal(text.slice(...patchRange(text)), text.slice(start));
});

test('chat handoff queues into the active session or prepares a draft on first use', async () => {
  const calls = [];
  const plugin = {
    views: {
      activateView: async () => calls.push('open'),
      getView: () => ({ appendToActiveInput: text => Boolean(calls.push(['draft', text])) }),
    },
    api: { version: 1, getActiveSessionId: () => 'session', send: async (...args) => calls.push(args) && 'started' },
  };
  const app = { plugins: { getPlugin: id => id === 'realclaudian' && plugin } };
  await handOff(app, 'question');
  plugin.api.getActiveSessionId = () => null;
  await handOff(app, 'first question');
  assert.deepEqual(calls, ['open', ['session', { text: 'question', mode: 'queue' }], 'open', ['draft', 'first question']]);
});

test('related reading prioritizes declared blocks and retrieves studied material across books', async () => {
  const folder = (path, children) => ({ path, name: path.split('/').at(-1), children });
  const file = path => ({ path, name: path.split('/').at(-1), extension: 'md' });
  const current = file('Buches/Current/concepts/Sums.md');
  const prerequisite = file('Buches/Current/concepts/Prerequisite.md');
  const other = file('Buches/Other/concepts/Intersection.md');
  const unread = file('Buches/Other/concepts/Unread.md');
  const root = folder('Buches', [
    folder('Buches/Current', [file('Buches/Current/_index.md'), folder('Buches/Current/concepts', [current, prerequisite])]),
    folder('Buches/Other', [file('Buches/Other/_index.md'), folder('Buches/Other/concepts', [other, unread])]),
  ]);
  const dep = { path: prerequisite.path, key: prerequisite.path + '#^needed' };
  const focus = { id: '^direct', title: 'Direct sum' };
  const local = { path: current.path, key: current.path + '#^same-page' };
  const app = { vault: { getAbstractFileByPath: () => root }, metadataCache: { getFileCache: () => null } };
  const model = {
    book: { path: 'Buches/Current' },
    targets: new Map([[current.path + '#^direct', { dependencies: [dep, local] }]]),
    byPath: new Map([[current.path, { name: 'Sums', dependencies: [] }]]),
  };
  const node = (id, title, type = 'definition') => ({ id, title, type, unit: { markdown: title } });
  const plugin = {
    app,
    progress: { read: async ({ book }) => book.path.endsWith('Other') ? { 'concepts/Intersection.md': { read: true } } : {} },
    learning: { page: async note => ({ nodes: {
      [prerequisite.path]: [node('^needed', 'Axiom')],
      [current.path]: [node('^same-page', 'Definitions')],
      [other.path]: [node('^unrelated', 'Exponents'), node('^related', 'Intersection'), node('^private', 'Intersection answer', 'exercise')],
      [unread.path]: [node('^unread', 'Intersection')],
    }[note.path] }) },
  };
  const hits = await relatedReading(plugin, model, current, focus, 'What does the intersection do?');
  assert.deepEqual(hits.map(hit => hit.ref).sort(), [dep.key, local.key, other.path + '#^related'].sort());
  assert.ok(hits[0].explicit);
});
