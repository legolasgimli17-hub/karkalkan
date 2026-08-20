import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.cwd();
const read=path=>readFile(join(root,path),'utf8');

test('smart CSV mapper receives schema profiles rather than raw row values',async()=>{
  const [client,server]=await Promise.all([read('smart-csv.js'),read('supabase/functions/csv-schema-mapper/index.ts')]);
  assert.match(client,/body:\{columns:profiles\(parsed\)\}/);
  assert.doesNotMatch(client,/csv-schema-mapper[\s\S]{0,250}rows:/);
  assert.match(server,/onlyColumnNamesAndTypeRatios:true/);
  assert.match(server,/rowValuesSentToMapper:false/);
  assert.match(server,/customerDataSentToModel:false/);
  assert.match(server,/const context=\{canonicalFields:CANONICAL,columns,deterministicSuggestions:fallback\}/);
  assert.doesNotMatch(server,/marketplace_daily_financials|marketplace_product_daily_metrics|customer_email|customer_phone/i);
});

test('CSV schema AI is optional, structured, no-store and fail-safe',async()=>{
  const [server,config]=await Promise.all([read('supabase/functions/csv-schema-mapper/index.ts'),read('supabase/config.toml')]);
  assert.match(config,/\[functions\.csv-schema-mapper\][\s\S]*?verify_jwt = true/);
  assert.match(server,/consumeRateLimit\(sql,'csv-schema-mapper',auth\.user\.id,20,3600\)/);
  assert.match(server,/store:false/);
  assert.match(server,/type:'json_schema'/);
  assert.match(server,/strict:true/);
  assert.match(server,/AI_MAPPING_VALIDATION_FAILED/);
  assert.match(server,/mode:'deterministic'/);
  assert.match(server,/Never invent a source column/);
});

test('CSV import always requires human mapping confirmation and reuses deterministic importer',async()=>{
  const client=await read('smart-csv.js');
  assert.match(client,/Onayla ve içe aktar/);
  assert.match(client,/selectedMap\(\)/);
  assert.match(client,/for\(const field of REQUIRED\)if\(!map\[field\]\)/);
  assert.match(client,/fn\('marketplace-import',\{method:'POST',body:\{connection_id:connection,rows\}\}\)/);
  assert.match(client,/MAX_ROWS=5000/);
  assert.match(client,/MAX_FILE_BYTES=2_500_000/);
});

test('public buyer demo is unmistakably synthetic and does not call the model/API',async()=>{
  const [demo,product]=await Promise.all([read('buyer-ai-demo.js'),read('product-2026.js')]);
  assert.match(product,/import\('\/buyer-ai-demo\.js\?v=20260821'\)/);
  assert.match(demo,/DEMO DATA · SENTETİK/);
  assert.match(demo,/Gerçek müşteri, gerçek mağaza veya gerçek AI model çağrısı değildir/);
  assert.match(demo,/authenticated finance-ai endpoint/i);
  assert.doesNotMatch(demo,/fetch\(|OPENAI_API_KEY|functions\/v1/);
});

test('workspace loads smart CSV mapper as a same-origin module',async()=>{
  const workspace=await read('workspace-analytics.js');
  assert.match(workspace,/import\('\/smart-csv\.js\?v=20260821'\)/);
});

test('every checked-in Edge Function directory has a config entry',async()=>{
  const config=await read('supabase/config.toml');
  const entries=await readdir(join(root,'supabase','functions'),{withFileTypes:true});
  const functions=[];
  for(const entry of entries){if(!entry.isDirectory()||entry.name.startsWith('_'))continue;try{await read(`supabase/functions/${entry.name}/index.ts`);functions.push(entry.name)}catch{/* non-function directory */}}
  assert.ok(functions.length>=38,`expected modern function inventory, found ${functions.length}`);
  for(const name of functions)assert.match(config,new RegExp(`\\[functions\\.${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\]`),`missing config entry for ${name}`);
  for(const required of ['product-analytics','account-delete','launch-readiness','trendyol-reconciliation','finance-ai','csv-schema-mapper'])assert.ok(functions.includes(required),`missing ${required}`);
});
