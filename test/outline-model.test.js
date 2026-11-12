const test = require('node:test');
const assert = require('node:assert/strict');
const { outlineFor } = require('../src/outline-model');

test('outline retains document order and levels from cached markdown headings', () => {
  const file={path:'Buches/B/concepts/A.md'};
  const app={metadataCache:{getFileCache:()=>({headings:[{heading:'Intro',level:1,position:{start:{line:2}}},{heading:'Details',level:3,position:{start:{line:7}}}]})}};
  assert.deepEqual(outlineFor(app,file),[{text:'Intro',level:1,line:2},{text:'Details',level:3,line:7}]);
});

test('outline is empty when no headings are cached', () => {
  assert.deepEqual(outlineFor({metadataCache:{getFileCache:()=>null}},{path:'x'}),[]);
});
