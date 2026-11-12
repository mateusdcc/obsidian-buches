const test=require('node:test');
const assert=require('node:assert/strict');
const { ContextView }=require('../src/context-view');
const { LearningIndex }=require('../src/learning');
const { readSettings }=require('../src/settings');
class Element {
 constructor(tag='div',doc=null){this.tag=tag;this.ownerDocument=doc??{createElementNS:(_,tag)=>new Element(tag,this.ownerDocument)};this.children=[];this.attrs={};this.listeners={};this.textContent='';}
 empty(){this.children=[];}
 addClass(c){this.className=c;}
 createEl(tag,opts={}){const e=new Element(tag,this.ownerDocument);e.className=opts.cls??'';e.textContent=opts.text??'';this.children.push(e);return e;}
 createDiv(opts){return this.createEl('div',opts);}
 createSpan(opts){return this.createEl("span",opts);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 appendChild(e){this.children.push(e);return e;}
 addEventListener(k,fn){this.listeners[k]=fn;}
}
const all=e=>[e,...e.children.flatMap(all)];
test('right context shows graph and outline for an active Buch concept',async()=>{
 const i={path:'Buches/B/_index.md',name:'_index.md',extension:'md'},f={path:'Buches/B/concepts/A.md',name:'A.md',extension:'md'};
 const folder=(path,children)=>({path,name:path.split('/').pop(),children});
 const root=folder('Buches',[folder('Buches/B',[i,folder('Buches/B/concepts',[f])])]);
 const app={vault:{getAbstractFileByPath:()=>root,cachedRead:async()=>''},metadataCache:{getFileCache:file=>file===i?{frontmatter:{title:'My Book'}}:{frontmatter:{name:'My Concept'},headings:[{heading:'Section',level:2,position:{start:{line:3}}}]},resolvedLinks:{},getFirstLinkpathDest:()=>null}};
 const actions=[];const plugin={learning:new LearningIndex(app),progress:{read:async()=>({})},settings:readSettings(),getContextFile:()=>f,openFile:x=>actions.push(['open',x.path]),goToHeading:(x,h)=>actions.push(['heading',x.path,h.line])};
 const view=new ContextView({app},plugin);view.contentEl=new Element();await view.onOpen();
 const nodes=all(view.contentEl);
 assert.ok(nodes.some(x=>x.textContent==='My Concept'));assert.ok(nodes.some(x=>x.textContent==='Section'));
 assert.ok(nodes.some(x=>x.attrs['aria-label']==='Concept dependency graph'));
 nodes.find(x=>x.textContent==='Section').listeners.click();assert.deepEqual(actions.pop(),['heading',f.path,3]);
});
test('right context clears when a non-Buch file is active',async()=>{
 const app={vault:{getAbstractFileByPath:()=>null},metadataCache:{}};
 const view=new ContextView({app},{getContextFile:()=>({path:'Other.md'})});view.contentEl=new Element();await view.onOpen();
 assert.ok(all(view.contentEl).some(n=>n.textContent.includes('Open a Buch')));
});
