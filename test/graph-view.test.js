const test = require('node:test');
const assert = require('node:assert/strict');
const { renderGraph } = require('../src/graph-view');

class Element {
  constructor(tag='div',doc=null) { this.tag=tag; this.ownerDocument=doc ?? {createElementNS:(_,tag)=>new Element(tag,this.ownerDocument)}; this.children=[]; this.attrs={}; this.events={}; this.textContent=''; }
  setAttribute(key,value){this.attrs[key]=String(value);}
  appendChild(child){this.children.push(child); return child;}
  addEventListener(name,fn){this.events[name]=fn;}
  createEl(tag,opts={}){const child=new Element(tag,this.ownerDocument); child.textContent=opts.text??'';this.children.push(child);return child;}
}
function all(node){return [node,...node.children.flatMap(all)];}

test('graph renders concept nodes and typed edges with accessible clickable labels', () => {
  const host=new Element(); let opened;
  const graph={nodes:[{path:'A',name:'Alpha',file:{path:'A'}},{path:'B',name:'Beta',file:{path:'B'}}],edges:[{source:'A',target:'B',type:'dependency'}]};
  renderGraph(host,graph,'A',file=>{opened=file.path;});
  const nodes=all(host);
  assert.equal(nodes.filter(n=>n.tag==='circle').length,2);
  assert.equal(nodes.filter(n=>n.tag==='line').length,1);
  const alpha=nodes.find(n=>n.attrs['aria-label']==='Open concept Alpha');
  assert.ok(alpha); alpha.events.click(); assert.equal(opened,'A');
  assert.ok(nodes.some(n=>n.attrs.class?.includes('is-current')));
});

test('an empty graph explains that there are no concepts', () => {
  const host=new Element(); renderGraph(host,{nodes:[],edges:[]},null,()=>{});
  assert.ok(all(host).some(node=>node.textContent.includes('No concepts')));
});
