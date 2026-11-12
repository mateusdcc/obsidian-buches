const test=require('node:test');
const assert=require('node:assert/strict');
const { getIntroduction, stripFrontmatter }=require('../src/intro-model');

test('a Buch introduction uses its description property before its note body',()=>{
 const app={metadataCache:{getFileCache:()=>({frontmatter:{description:'A small introduction'}})}};
 assert.deepEqual(getIntroduction(app,{path:'x'},'---\ntitle: x\n---\nBody text'),{description:'A small introduction',hasBody:true});
});
test('a Buch without description keeps its markdown body as the introduction',()=>{
 const app={metadataCache:{getFileCache:()=>null}};
 assert.deepEqual(getIntroduction(app,{path:'x'},'---\ntitle: x\n---\n\n# Intro\nContent'),{description:'',hasBody:true});
 assert.equal(stripFrontmatter('---\ntitle: x\n---\n\n# Intro\nContent'),'# Intro\nContent');
});
test('empty indexes are recognized without reading frontmatter as body',()=>{
 const app={metadataCache:{getFileCache:()=>({frontmatter:{title:'x'}})}};
 assert.deepEqual(getIntroduction(app,{path:'x'},'---\ntitle: x\n---\n'),{description:'',hasBody:false});
});
