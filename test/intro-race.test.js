const test=require('node:test');
const assert=require('node:assert/strict');
const { IntroductionRenderer }=require('../src/introduction');

test('a file switch while the index is loading cannot insert the old intro',async()=>{
 let resolveRead;
 const index={path:'Buches/B/_index.md',name:'_index.md',extension:'md'}, other={path:'Outside.md'};
 const folder=(path,children)=>({path,name:path.split('/').pop(),children});
 const root=folder('Buches',[folder('Buches/B',[index])]);
 let inserted=0;
 const view={file:index,contentEl:{insertBefore(){inserted++;}},getViewType:()=> 'markdown'};
 const app={vault:{getAbstractFileByPath:()=>root,cachedRead:()=>new Promise(r=>resolveRead=r)},metadataCache:{getFileCache:()=>({frontmatter:{title:'Book'}})},workspace:{iterateAllLeaves:fn=>fn({view})}};
 const r=new IntroductionRenderer(app);const pending=r.refresh();view.file=other;resolveRead('---\ntitle: Book\n---\n');await pending;assert.equal(inserted,0);
});
