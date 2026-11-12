const test = require('node:test');
const assert = require('node:assert/strict');
const { graphLayout } = require('../src/graph-layout');

test('layout gives every concept a stable in-bounds position, even without edges', () => {
  const nodes = [{path:'a'},{path:'b'},{path:'c'}];
  const positions = graphLayout(nodes,320,165);
  assert.equal(positions.size,3);
  for (const point of positions.values()) {
    assert.ok(point.x>=0 && point.x<=320 && point.y>=0 && point.y<=165);
  }
  assert.deepEqual([...positions],[...graphLayout(nodes,320,165)]);
});

test('empty graph has no positions', () => { assert.equal(graphLayout([],320,165).size,0); });
