import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('workspace loads Smart CSV without weakening existing AI readiness module',async()=>{
  const source=await read('workspace-analytics.js');
  assert.match(source,/import\('\/finance-ai\.js\?v=20260821'\)/);
  assert.match(source,/import\('\/smart-csv\.js\?v=20260821'\)/);
  assert.match(source,/import\('\/trendyol-sync-pipeline\.js\?v=20260819'\)/);
});

test('CSV mapper is JWT protected, rate limited, bounded and readiness-gated for model use',async()=>{
  const [source,config]=await Promise.all([read('supabase/functions/csv-schema-mapper/index.ts'),read('supabase/config.toml')]);
  assert.match(config,/\[functions\.csv-schema-mapper\][\s\S]*?verify_jwt = true/);
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/MAX_COLUMNS=40/);
  assert.match(source,/consumeRateLimit\(sql,'csv-schema-mapper',auth\.user\.id,20,3600\)/);
  assert.match(source,/launch-readiness/);
  assert.match(source,/body\?\.readyForAi===true/);
  assert.match(source,/AI_READINESS_REQUIRED/);
});

test('schema mapper never receives or forwards CSV row values',async()=>{
  const [client,source]=await Promise.all([read('smart-csv.js'),read('supabase/functions/csv-schema-mapper/index.ts')]);
  assert.match(client,/body:\{columns:profiles\(parsed\)\}/);
  assert.doesNotMatch(client,/csv-schema-mapper[\s\S]{0,200}rows/);
  assert.match(source,/rowValuesSentToMapper:false/);
  assert.match(source,/customerDataSentToModel:false/);
  assert.match(source,/onlyColumnNamesAndTypeRatios:true/);
  assert.match(source,/store:false/);
  assert.match(source,/SENSITIVE_HEADER/);
});

test('model output stays structured, unique and fail-safe',async()=>{
  const source=await read('supabase/functions/csv-schema-mapper/index.ts');
  assert.match(source,/type:'json_schema'/);
  assert.match(source,/strict:true/);
  assert.match(source,/targets\.has\(target\)/);
  assert.match(source,/AI_MAPPING_VALIDATION_FAILED/);
  assert.match(source,/mode:'deterministic'/);
});

test('browser normalization requires core finance fields and uses existing deterministic importer',async()=>{
  const client=await read('smart-csv.js');
  assert.match(client,/REQUIRED=new Set\(\['day','external_product_id','sales_units','gross_sales'\]\)/);
  assert.match(client,/return_units:returns/);
  assert.match(client,/fn\('marketplace-import',\{method:'POST',body:\{connection_id:id,rows\}\}\)/);
  assert.match(client,/MAX_ROWS=5000/);
  assert.match(client,/MAX_FILE_BYTES=2_500_000/);
  assert.match(client,/if\(quoted\)throw new Error\('CSV_QUOTES_INVALID'\)/);
});
