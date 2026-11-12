const test=require('node:test');
const assert=require('node:assert/strict');
const { TabTitles }=require('../src/tab-titles');

test('all tabs are visited even when the workspace stops iterating on truthy callbacks',()=>{
 const a={path:'Buches/B/_index.md',name:'_index.md',extension:'md'};
 const b={path:'Buches/B/concepts/Idea.md',name:'Idea.md',extension:'md'};
 const folder=(path,children)=>({path,name:path.split('/').pop(),children});
 const root=folder('Buches',[folder('Buches/B',[a,folder('Buches/B/concepts',[b])])]);
 const leaf=f=>({view:{file:f},getDisplayText(){return this.view.file.name},updateHeader(){this.header=this.getDisplayText()}});
 const leaves=[leaf(a),leaf(b)];
 const app={vault:{getAbstractFileByPath:()=>root},metadataCache:{getFileCache:f=>({frontmatter:f===a?{title:'Book'}:{name:'Concept'}})},workspace:{iterateAllLeaves(fn){for(const l of leaves)if(fn(l))break;}}};
 const manager=new TabTitles(app);manager.refresh();
 assert.deepEqual(leaves.map(l=>l.header),['Book','Concept']);
 manager.unload();
});
