const test = require('node:test');
const assert = require('node:assert/strict');
const { studyContext } = require('../src/book-memory');

test('book memory prioritizes prerequisite chains and finds unread theory without leaking solutions', async () => {
  const book = { path: 'Buches/Book', index: { path: 'Buches/Book/_index.md' }, title: 'Álgebra' };
  const chapter = (name, units) => ({
    path: book.path + '/concepts/' + name + '.md',
    name, category: 'Álgebra', units, nodes: [], dependencies: [],
  });
  const exercise = { id: '^prompt', title: 'Determine the sign' };
  const current = chapter('Exercise', [
    { type: 'text', markdown: 'State the sign.' },
    { type: 'solution', markdown: 'SECRET Permutação solução do aluno' },
    { type: 'callout', callout: 'hint', markdown: 'SECRET hint' },
  ]);
  const foundation = chapter('Foundations', [{ type: 'text', markdown: 'A bijection of a finite set.' }]);
  const prereq = chapter('Prerequisite', [{ type: 'text', markdown: 'Adjacent transpositions.' }]);
  const theory = chapter('Permutações', [{ type: 'text', markdown: 'Count inversions to compute the sign.' }]);
  prereq.dependencies.push({ key: foundation.path, path: foundation.path, dependencies: [] });
  const target = { key: prereq.path, path: prereq.path, dependencies: prereq.dependencies };
  foundation.dependencies.push(target);
  target.dependencies[0].dependencies = foundation.dependencies; // A cycle in authored prerequisites.
  const chapters = [current, foundation, prereq, theory];
  const model = {
    book, chapters, byPath: new Map(chapters.map(item => [item.path, item])),
    targets: new Map([[current.path + '#^prompt', { dependencies: [target] }]]),
  };
  const plugin = {
    progress: { read: async () => ({ 'concepts/Foundations.md': { read: true } }) },
    app: { vault: { cachedRead: async () => 'An introduction.' } },
  };
  const results = await studyContext(plugin, model, { path: current.path }, exercise, 'permutacoes');
  assert.deepEqual(results.map(({ ref, read, prerequisite }) => [ref, read, prerequisite]), [
    [prereq.path, false, true], [foundation.path, true, true], [theory.path, false, false],
  ]);
  assert.ok(!results.some(({ text }) => text.includes('SECRET')));
});
