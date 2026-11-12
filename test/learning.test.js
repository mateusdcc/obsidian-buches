const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceParts, parsePage, LearningIndex } = require('../src/learning');
const { extractMath } = require('../src/math');

test('solution offsets preserve CRLF, Unicode, and delimiters in code', async () => {
  const source = '---\r\nname: A\r\n---\r\n\r\n🧪 Prompt\r\n\r\n```md\r\n---\r\n```\r\n\r\n---\r\n<!-- buches-math: typst -->\r\n$sqrt(2)$\r\n---\r\n';
  const ranges = sourceParts(source);
  assert.equal(ranges.filter(part => part.type === 'solution').length, 1);
  const parsed = await parsePage(source, async () => null);
  const proof = parsed.units.find(unit => unit.type === 'solution');
  assert.equal(proof.engine, 'typst');
  assert.equal(proof.markdown, '$sqrt(2)$\r\n');
  assert.equal(source.slice(proof.start, proof.end), proof.source);
  assert.equal(source.slice(0, proof.start) + 'Proof\r\n' + source.slice(proof.end),
    source.replace(proof.source, 'Proof\r\n'));
});

test('chapter dependencies retain exact block targets and report missing references and cycles', async () => {
  const a = { path: 'Buches/B/concepts/A.md' };
  const b = { path: 'Buches/B/concepts/B.md' };
  const index = new LearningIndex({
    metadataCache: {
      getFirstLinkpathDest: name => ({ A: a, B: b })[name],
      getFileCache: file => ({ frontmatter: file === a
        ? { block_depends_on: { a: ['[[B]]', '[[Missing]]'] } }
        : { depends_on: ['[[A#^a]]'] } }),
    },
  });
  index.page = async file => ({ nodes: file === a ? [{ id: '^a', type: 'theorem', title: 'Theorem A' }] : [] });
  const model = await index.book({ concepts: [{ file: a, name: 'A', children: [] }, { file: b, name: 'B', children: [] }] });
  assert.equal(model.byPath.get(b.path).dependencies[0].id, '^a');
  assert.equal(model.byPath.get(b.path).cyclic, true);
  assert.equal(model.issues.length, 2);
  assert.match(model.issues[0], /Missing/);
  assert.match(model.issues[1], /Theorem A → B → Theorem A/);
});

test('renderer isolation preserves literal math syntax in code and extracts both formula modes', () => {
  const { markdown, formulas } = extractMath('Use `$x$` or $y$.\n\n```md\n$z$\n```\n\n$$\nz^2\n$$');
  assert.match(markdown, /`\$x\$`/);
  assert.match(markdown, /```md\n\$z\$\n```/);
  assert.deepEqual(formulas.map(({ source, display }) => [source, display]), [['y', false], ['\nz^2\n', true]]);
});
