const test = require('node:test');
const assert = require('node:assert/strict');
const { splitResolutions } = require('../src/resolution');

test('solutions enclose full Markdown blocks, including math and lists', () => {
  const proof = 'First, use linearity.\n\n$$\nT(0)=0\n$$\n\n1. Finish the proof.';
  const source = `---\r\nname: Chapter\r\n---\r\nProve the claim.\r\n---\r\n${proof}\n---\n\nNext exercise\n---\nSecond proof\n---\nAfter`;
  const blocks = splitResolutions(source);
  assert.deepEqual(blocks.map(block => [block.solution, block.markdown.trim()]), [
    [false, 'Prove the claim.'], [true, proof], [false, 'Next exercise'], [true, 'Second proof'], [false, 'After'],
  ]);
});

test('literal and unpaired dividers remain Markdown', () => {
  const source = '~~~md\n---\n---\n~~~\n\n```md\n---\n---\n```\n\n$$\n---\n$$\n\n<!--\n---\n-->\n\n***\n\n---\nUnpaired';
  assert.deepEqual(splitResolutions(source), [{ solution: false, markdown: source }]);
});
