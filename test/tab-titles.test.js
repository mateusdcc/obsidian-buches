const test=require('node:test');
const assert=require('node:assert/strict');
const { titleForLeaf, patchLeafTitle }=require('../src/tab-titles');
function fixture(){
  const index={path:'Buches/A/_index.md',name:'_index.md',extension:'md'};
  const idea={path:'Buches/A/concepts/X.md',name:'X.md',extension:'md'};
  const folder=(path,children)=>({path,name:path.split('/').pop(),children});
  const root=folder('Buches',[folder('Buches/A',[index,folder('Buches/A/concepts',[idea])])]);
  const meta=new Map([[index.path,{frontmatter:{title:'Book'}}],[idea.path,{frontmatter:{name:'Idea'}}]]);
  const app={vault:{getAbstractFileByPath:path=>path==='Buches'?root:[index,idea].find(x=>x.path===path)},metadataCache:{getFileCache:f=>meta.get(f.path)}};
  return {app,index,idea,meta};
}
test('tab titles follow metadata while retaining native markdown views',()=>{
  const {app,index,idea,meta}=fixture();
  const leaf={view:{file:index},getDisplayText(){return this.view.file.name},updateHeader(){this.header=this.getDisplayText()}};
  const original=leaf.getDisplayText;
  assert.equal(titleForLeaf(app,leaf),'Book');
  const undo=patchLeafTitle(app,leaf); leaf.updateHeader(); assert.equal(leaf.header,'Book');
  leaf.view.file=idea;leaf.updateHeader();assert.equal(leaf.header,'Idea');
  meta.set(idea.path,{frontmatter:{name:'Changed'}});leaf.updateHeader();assert.equal(leaf.header,'Changed');
  leaf.view.file={path:'other.md',name:'other.md'};leaf.updateHeader();assert.equal(leaf.header,'other.md');
  undo();assert.equal(leaf.getDisplayText,original);
});
test('deferred tab titles resolve their stored file path',()=>{
 const {app,index}=fixture();const leaf={view:{getViewType:()=> 'deferred'},getViewState:()=>({type:'markdown',state:{file:index.path}})};
 assert.equal(titleForLeaf(app,leaf),'Book');
});
