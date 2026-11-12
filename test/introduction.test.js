const test=require('node:test');
const assert=require('node:assert/strict');
const { IntroductionRenderer }=require('../src/introduction');

class El {
 constructor(doc){this.ownerDocument=doc;this.children=[];this.attrs={};this.firstChild=null;this.removed=false;}
 setAttribute(k,v){this.attrs[k]=v;}
 createEl(tag,opts={}){const e=new El(this.ownerDocument);e.tag=tag;e.className=opts.cls;e.textContent=opts.text;this.children.push(e);return e;}
 insertBefore(el){this.children.unshift(el);this.firstChild=el;el.parent=this;}
 remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function setup(){
 const doc={createElement:()=>new El(doc)};
 const index={path:'Buches/B/_index.md',name:'_index.md',extension:'md'},idea={path:'Buches/B/concepts/A.md',name:'A.md',extension:'md'};
 const folder=(path,children)=>({path,name:path.split('/').pop(),children});
 const root=folder('Buches',[folder('Buches/B',[index,folder('Buches/B/concepts',[idea])])]);
 const content=new El(doc),view={file:index,contentEl:content,getViewType:()=> 'markdown'},leaf={view};
 const app={vault:{getAbstractFileByPath:()=>root,cachedRead:async()=> '---\ntitle: B\n---\n'},metadataCache:{getFileCache:f=>({frontmatter:f===index?{title:'Book',description:'Description'}:{name:'Idea'}})},workspace:{iterateAllLeaves:fn=>fn(leaf)}};
 return {app,content,view,index,idea};
}
test('introduction is inserted only into Buch index views and removed when switching files',async()=>{
 const {app,content,view,idea}=setup(),renderer=new IntroductionRenderer(app);
 await renderer.refresh();const section=content.children[0];
 assert.equal(section.className,'buches-introduction');
 assert.ok(section.children.some(e=>e.children.some(child=>child.textContent==='Book')));
 assert.ok(section.children.some(e=>e.textContent==='Description'));
 view.file=idea;await renderer.refresh();assert.equal(content.children.length,0);
});
test('introduction renderer cleans up its own elements on unload',async()=>{
 const {app,content}=setup(),renderer=new IntroductionRenderer(app);await renderer.refresh();renderer.unload();assert.equal(content.children.length,0);
});
