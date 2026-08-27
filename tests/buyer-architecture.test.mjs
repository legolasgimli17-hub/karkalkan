import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(path,'utf8');

test('canonical routes distinguish public and authenticated runtime shells',async()=>{
  const vercel=await read('vercel.json');
  assert.match(vercel,/"source": "\/uygulama"[\s\S]*?"destination": "\/v4\.html"/);
  assert.match(vercel,/"source": "\/hesapla"[\s\S]*?"destination": "\/#hesaplayici"/);
  assert.match(vercel,/"source": "\/hesapla\.html"[\s\S]*?"destination": "\/#hesaplayici"/);
});

test('buyer documentation makes active v4 and legacy calculator boundaries explicit',async()=>{
  const [readme,architecture]=await Promise.all([read('README.md'),read('ARCHITECTURE.md')]);
  for(const source of [readme,architecture]){
    assert.match(source,/v4\.html/);
    assert.match(source,/\/uygulama/);
    assert.match(source,/supabase\/functions\//);
    assert.match(source,/app-core\.js/);
    assert.match(source,/legacy|older standalone|eski/i);
  }
  assert.match(readme,/10-minute repository map/i);
  assert.match(readme,/Removing them would break the canonical authenticated application/i);
  assert.match(architecture,/active production code/i);
  assert.match(architecture,/backend is \*\*not\*\* a second root-level `api\/` application/i);
});

test('SEO guides no longer expose obsolete version branding or dead calculator anchors',async()=>{
  const paths=[
    'trendyol-iade-dahil-kar-hesaplama.html',
    'kampanya-basabas-hesaplama.html',
    'pazaryeri-toplu-kar-analizi.html',
  ];
  for(const path of paths){
    const html=await read(path);
    assert.doesNotMatch(html,/<small>v3<\/small>/i,`${path} contains obsolete v3 branding`);
    assert.doesNotMatch(html,/href=["']\/#(?:motor|kampanya|toplu)["']/i,`${path} links to an obsolete calculator anchor`);
    assert.match(html,/href=["']\/#hesaplayici["']/i,`${path} should link to the current public calculator`);
    assert.match(html,/href=["']\/uygulama["']/i,`${path} should link to the canonical seller workspace`);
  }
});
