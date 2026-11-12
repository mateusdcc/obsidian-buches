const test = require('node:test');
const assert = require('node:assert/strict');
const { findBuchContext, buildGraph } = require('../src/buch-model');

function file(path) { return { path, name: path.split('/').pop(), extension:'md' }; }
function folder(path, children) { return { path, name: path.split('/').pop(), children }; }
function fixture() {
  const index = file('Buches/Book/_index.md');
  const a = file('Buches/Book/concepts/Alpha.md');
  const b = file('Buches/Book/concepts/Alpha/Beta.md');
  const c = file('Buches/Book/concepts/Gamma.md');
  const external = file('Elsewhere.md');
  const root = folder('Buches', [folder('Buches/Book', [index, folder('Buches/Book/concepts', [a, folder('Buches/Book/concepts/Alpha', [b]), c])])]);
  const metadata = new Map([[index.path,{frontmatter:{title:'Book title',description:'A description'}}],[a.path,{frontmatter:{name:'Alpha title',depends_on:['[[Beta]]']},headings:[{heading:'One',level:2}]}],[b.path,{frontmatter:{name:'Beta'}}]]);
  const app = { vault: {getAbstractFileByPath: path => path === 'Buches' ? root : null}, metadataCache: {
    getFileCache: f => metadata.get(f.path) ?? null,
    getFirstLinkpathDest: link => ({Beta:b, Gamma:c}[link] ?? null),
    resolvedLinks: { [a.path]:{[b.path]:1,[c.path]:2,[external.path]:1}, [b.path]:{[a.path]:1} },
  }};
  return {app,index,a,b,c,external};
}

test('context identifies Buch indexes and concepts without capturing unrelated notes', () => {
  const {app,index,a,b,external} = fixture();
  assert.equal(findBuchContext(app,index).book.title,'Book title');
  assert.equal(findBuchContext(app,index).isIndex,true);
  assert.equal(findBuchContext(app,a).name,'Alpha title');
  assert.equal(findBuchContext(app,b).name,'Beta');
  assert.equal(findBuchContext(app,b).isIndex,false);
  assert.equal(findBuchContext(app,external),null);
  assert.equal(findBuchContext(app,{path:'Buches/Book/random.md'}).name,'random');
  assert.equal(findBuchContext(app,{path:'Buches/Book/image.png'}),null);
});

test('graph distinguishes explicit dependencies, regular links, and nested hierarchy', () => {
  const {app,index,a,b,c} = fixture();
  const ctx=findBuchContext(app,index);
  const graph=buildGraph(app,ctx.book);
  assert.deepEqual(graph.nodes.map(n=>n.name),['Alpha title','Beta','Gamma']);
  assert.deepEqual(graph.edges.map(e=>[e.source,e.target,e.type]).sort(),[
    [a.path,b.path,'dependency'],[a.path,c.path,'link'],[b.path,a.path,'link'],[a.path,b.path,'hierarchy']
  ].sort());
});

test('unresolved external and self links cannot become concept dependencies', () => {
  const {app,index,a,b} = fixture();
  app.metadataCache.getFileCache = f => f === a ? {frontmatter:{depends_on:['[[Missing]]','[[Alpha title]]']}} : null;
  app.metadataCache.getFirstLinkpathDest = name => name === 'Alpha title' ? a : null;
  app.metadataCache.resolvedLinks = {[a.path]:{[a.path]:1, [b.path]:1, 'Outside.md':1}};
  const graph=buildGraph(app,findBuchContext(app,index).book);
  assert.deepEqual(graph.edges.map(e=>[e.source,e.target,e.type]).sort(),[[a.path,b.path,'link'],[a.path,b.path,'hierarchy']].sort());
});
