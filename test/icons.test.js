const test = require('node:test');
const assert = require('node:assert/strict');
const {iconFor, setFileIcon} = require('../src/icons');

test('iconFor returns frontmatter icon or an empty value', () => {
 const file={path:'Buches/B/_index.md'};
 const app={metadataCache:{getFileCache:()=>({frontmatter:{icon:'📚'}})}};
 assert.equal(iconFor(app,file),'📚');
 app.metadataCache.getFileCache=()=>({frontmatter:{icon:['bad']}});
 assert.equal(iconFor(app,file),'');
});

test('setting and clearing an icon only updates the icon property', async () => {
 const frontmatter={title:'Book',description:'Keep',order:4};
 const file={path:'Buches/B/_index.md'};
 const app={fileManager:{processFrontMatter:async (f,cb)=>{assert.equal(f,file);cb(frontmatter)}}};
 await setFileIcon(app,file,'  book-open  ');
 assert.deepEqual(frontmatter,{title:'Book',description:'Keep',order:4,icon:'book-open'});
 await setFileIcon(app,file,'');
 assert.deepEqual(frontmatter,{title:'Book',description:'Keep',order:4});
});

test('unreasonably long icon strings are rejected before writing', async () => {
 let wrote=false;const app={fileManager:{processFrontMatter:async()=>{wrote=true}}};
 await assert.rejects(setFileIcon(app,{path:'x'},'a'.repeat(1000)),/icon/i);
 assert.equal(wrote,false);
});

test('Lucide-prefixed metadata renders an icon rather than literal text', () => {
 const { renderFileIcon } = require('../src/icons');
 const el = {};
 renderFileIcon(el, 'lucide:sigma', (target, name) => {
   assert.equal(target, el);
   assert.equal(name, 'sigma');
   target.rendered = true;
 });
 assert.equal(el.rendered, true);
 assert.equal(el.textContent, undefined);
});
