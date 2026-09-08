import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent, safeUrl } from '../lib/content.ts';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloho-content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const kind of ['papers','articles','blogs']) fs.mkdirSync(path.join(root, kind));
  const write = (kind, name, value) => fs.writeFileSync(path.join(root, kind, name), typeof value === 'string' ? value : JSON.stringify(value));
  return { root, write, load: () => loadContent(root, root) };
}
const valid = { draft:false,title:'Good paper',summary:'A useful summary',author:'Author',date:'2026-09-07' };
test('optional paper metadata isolates malformed fields and rejects unsafe repository links', t => {
 const {write,load}=fixture(t);
 write('papers','metadata.json',{...valid,details:{resourceType:'Preprint',publisher:42,identifiers:['10.5281/example',null,{}],rights:{bad:true}},software:{repositoryUrl:'javascript:alert(1)',programmingLanguages:'Python, TypeScript',developmentStatus:[]}});
 write('papers','wrong-shape.json',{...valid,details:[],software:'bad'});
 const result=load();assert.equal(result.entries.length,2);
 const entry=result.entries.find(entry=>entry.slug==='metadata');
 assert.equal(entry.details.resourceType,'Preprint');assert.equal(entry.details.publisher,'');assert.deepEqual(entry.details.identifiers,['10.5281/example']);assert.equal(entry.details.rights,'');
 assert.equal(entry.software.repositoryUrl,null);assert.equal(entry.software.programmingLanguages,'Python, TypeScript');assert.equal(entry.software.developmentStatus,'');assert.ok(result.issues.length>=6);
});
test('malformed, oversized and invalid entries cannot remove a good sibling', t => {
 const {write,load} = fixture(t);
 write('papers','good.json',valid);write('papers','broken.json','{ "title":');write('papers','huge.json',' '.repeat(262145));write('papers','wrong.json',{...valid,title:42});write('papers','null.json','null');write('papers','array.json',[]);
 const result=load();assert.deepEqual(result.entries.map(x=>x.slug),['good']);assert.equal(result.issues.length,5);
});
test('drafts and copyable templates never publish, and filenames supply unique slugs',t=>{
 const {write,load}=fixture(t);write('papers','_template.json','bad ignored data');write('papers','draft.json',{...valid,draft:true});write('papers','implicit.json',{...valid,draft:undefined});write('papers','first.json',valid);write('papers','second.json',valid);
 assert.deepEqual(load().entries.map(x=>x.slug),['first','second']);
});
test('missing assets and invalid optional fields fall back safely',t=>{
 const {write,load}=fixture(t);write('papers','good.json',{...valid,thumbnail:'/missing.png',orcid:'javascript:alert(1)',vixra:'https://evil.test/',fund:{bad:true},status:[]});
 const entry=load().entries[0];assert.ok(entry);assert.equal(entry.thumbnail,null);assert.equal(entry.orcid,null);assert.equal(entry.zenodo,null);assert.equal(entry.vixra,null);assert.equal(entry.fund,'');
});
test('bad body blocks are isolated, and a body with no valid blocks is skipped',t=>{
 const {write,load}=fixture(t);write('blogs','good.json',{...valid,body:[null,{type:'paragraph',text:'<script>alert(1)</script>'},{type:'html',text:'unsafe'}]});write('blogs','bad.json',{...valid,body:[42]});
 assert.equal(load().entries.length,1);assert.deepEqual(load().entries[0].body,[{type:'paragraph',text:'<script>alert(1)</script>'}]);
});
test('external destinations must be HTTPS, and invalid dates are skipped',t=>{
 const {write,load}=fixture(t);write('articles','good.json',{...valid,externalUrl:'https://example.com/article'});write('articles','bad.json',{...valid,externalUrl:'javascript:alert(1)'});write('papers','bad-date.json',{...valid,date:'2026-02-30'});
 assert.equal(load().entries.length,1);assert.equal(safeUrl('https://user:pass@example.com'),null);assert.equal(safeUrl('//example.com'),null);assert.equal(safeUrl('https://orcid.org.evil.test/','orcid.org'),null);
});
test('missing collections and unsafe filenames cannot crash the catalog',t=>{
 const {root,write,load}=fixture(t);fs.rmSync(path.join(root,'blogs'),{recursive:true});write('papers','Bad Name.json',valid);write('papers','valid.json',valid);assert.equal(load().entries.length,1);assert.equal(load().issues.length,2);
});
test('Zenodo links accept only the official HTTPS domain',t=>{
 const {write,load}=fixture(t);write('papers','valid.json',{...valid,zenodo:'https://zenodo.org/records/22648743'});write('papers','invalid.json',{...valid,zenodo:'https://zenodo.org.evil.test/records/1'});
 const result=load();const entry=result.entries.find(item=>item.slug==='valid');assert.equal(entry?.zenodo,'https://zenodo.org/records/22648743');assert.equal(result.entries.length,2);assert.ok(result.issues.some(issue=>issue.file==='papers/invalid.json'));
});

test('homepage hero stays manual while newest content across collections fills three slots', async t => {
 const {selectHomepage} = await import('../lib/content.ts');
 const {write,load}=fixture(t);
 write('papers','hero.json',{...valid,date:'2026-09-01'});
 for (const slug of ['1011','1012','1013']) write('articles',slug+'.json',{...valid,date:'2026-09-08',externalUrl:'https://example.com/'+slug,order:Number(slug),thumbnail:'https://example.com/thumb.png'});
 let selection=selectHomepage(load().entries,'papers/hero');
 assert.equal(selection.hero.slug,'hero');assert.deepEqual(selection.latest.map(x=>x.slug),['1013','1012','1011']);
 assert.equal(selection.latest[0].thumbnail,'https://example.com/thumb.png');
 write('blogs','newest.json',{...valid,date:'2026-09-09',body:[{type:'paragraph',text:'New post'}]});
 selection=selectHomepage(load().entries,'papers/hero');assert.deepEqual(selection.latest.map(x=>x.slug),['newest','1013','1012']);assert.equal(selection.hero.slug,'hero');
 selection=selectHomepage(load().entries,'blogs/newest');assert.deepEqual(selection.latest.map(x=>x.slug),['1013','1012','1011']);
 assert.equal(selectHomepage(load().entries,'papers/missing').hero,undefined);
 assert.equal(selectHomepage([],null).latest.length,0);
});
