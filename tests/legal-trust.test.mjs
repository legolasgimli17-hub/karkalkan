import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');
const legalPages=['gizlilik.html','kvkk.html','cerezler.html','kullanim-kosullari.html'];

test('legal trust pages and go-live gate are version controlled',async()=>{
  for(const path of [...legalPages,'legal.css','docs/LEGAL_GO_LIVE.md']) await access(join(root,path));
});

test('KVKK disclosure stays separate from generic privacy policy and covers mandatory disclosure dimensions',async()=>{
  const kvkk=await read('kvkk.html');
  const privacy=await read('gizlilik.html');
  assert.notEqual(kvkk,privacy);
  for(const phrase of ['Veri sorumlusu','İşlenen veri kategorileri, amaçlar ve hukuki sebepler','Toplama yöntemi','Aktarım yapılan alıcı grupları ve amaçlar','Yurt dışına aktarım','KVKK m.11 kapsamındaki haklarınız','Başvuru yöntemi']){
    assert.match(kvkk,new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  }
  assert.match(kvkk,/m\.5\/2\(c\)/i);
  assert.match(kvkk,/m\.5\/2\(f\)/i);
  assert.match(kvkk,/KVKK m\.9/i);
});

test('legal pages fail honest while operator identity and application channel are unknown',async()=>{
  const kvkk=await read('kvkk.html');
  const terms=await read('kullanim-kosullari.html');
  const privacy=await read('gizlilik.html');
  assert.match(kvkk,/GERÇEK KİŞİ \/ TÜZEL KİŞİ UNVANI/);
  assert.match(kvkk,/KVKK BAŞVURU E-POSTASI \/ KEP \/ POSTA ADRESİ/);
  assert.match(terms,/Sözleşme tarafı henüz tanımlı değil/);
  assert.match(privacy,/Yayın öncesi zorunlu alan eksik/);
  for(const source of [kvkk,terms,privacy]) assert.doesNotMatch(source,/hukuken tamamen uyumludur|KVKK uyumludur|tam uyum garantisi/i);
});

test('cookie notice reflects cookie-free Vercel analytics and aggregate onboarding boundary',async()=>{
  const cookies=await read('cerezler.html');
  assert.match(cookies,/Vercel Web Analytics/i);
  assert.match(cookies,/çerez kullanmaz/i);
  assert.match(cookies,/günlük olarak yenilenen bir hash/i);
  assert.match(cookies,/kullanıcı ID’si, mağaza ID’si, ürün ID’si, banka bilgisi veya finans tutarı saklanmaz/i);
  assert.match(cookies,/sessionStorage/i);
});

test('public and authenticated surfaces expose legal links',async()=>{
  const home=await read('index.html');
  const app=await read('v4.html');
  for(const href of ['/gizlilik','/kvkk','/cerezler','/kullanim-kosullari']){
    assert.match(home,new RegExp(`href=\\"${href}\\"`));
    assert.match(app,new RegExp(`href=\\"${href}\\"`));
  }
  assert.match(home,/legal\.css\?v=20260818/);
  assert.match(app,/legal\.css\?v=20260818/);
});

test('Vercel routes legal pages through canonical clean paths without relaxing CSP',async()=>{
  const vercel=await read('vercel.json');
  for(const route of ['gizlilik','kvkk','cerezler','kullanim-kosullari']){
    assert.match(vercel,new RegExp(`\\"source\\"\\s*:\\s*\\"/${route}\\"`));
    assert.match(vercel,new RegExp(`\\"destination\\"\\s*:\\s*\\"/${route}\\.html\\"`));
  }
  assert.match(vercel,/script-src 'self'/);
  assert.doesNotMatch(vercel,/script-src[^;]*unsafe-inline/i);
});

test('go-live gate includes the unresolved high-risk legal checks',async()=>{
  const gate=await read('docs/LEGAL_GO_LIVE.md');
  for(const item of ['Identify the data controller','Approve the KVKK processing inventory','Map and legalize international transfers','Processor/vendor review','Account lifecycle','Billing and consumer/commercial terms','Cookie/analytics re-check']){
    assert.match(gate,new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  }
  assert.match(gate,/Do not change the status text/i);
});
