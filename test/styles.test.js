const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync(require('node:path').join(__dirname, '../styles.css'), 'utf8');

test('navigator explicitly removes inherited button backgrounds and rounded corners', () => {
  assert.match(css, /\.buches-view\s+button\.buches-title/);
  assert.match(css, /background(?:-color)?:\s*transparent\s*!important/);
  assert.match(css, /border-radius:\s*0\s*!important/);
  assert.doesNotMatch(css, /\.buches-tree-row:hover\s*\{[^}]*background:/);
});

test('concept titles are left-aligned even when the theme makes buttons flex containers', () => {
  const match = css.match(/\.buches-view button\.buches-title\s*\{([^}]*)\}/);
  assert.ok(match, 'concept title rule exists');
  assert.match(match[1], /justify-content:\s*(?:flex-start|start)\s*(?:!important)?\s*;/);
});

test('navigator uses compact, regular-weight text', () => {
  assert.match(css, /font-size:\s*var\(--font-ui-small\)/);
  assert.match(css, /font-weight:\s*(?:400|normal|var\(--font-normal\))/);
  assert.doesNotMatch(css, /min-height:\s*38px/);
});
