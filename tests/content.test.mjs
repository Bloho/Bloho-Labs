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
 const entry=load().entries[0];assert.ok(entry);assert.equal(entry.thumbnail,null);assert.equal(entry.orcid,null);assert.equal(entry.vixra,null);assert.equal(entry.fund,'');
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
