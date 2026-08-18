import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('dashboard export module is loaded from the existing same-origin enhancement layer',async()=>{
  const loader=await read('v4-alerts.js');
  assert.match(loader,/script\.src='\/dashboard-export\.js'/);
  assert.match(loader,/data-karkalkan-dashboard-export|karkalkanDashboardExport/);
  assert.doesNotMatch(loader,/https?:\/\/[^'"`]*dashboard-export/i);
});

test('dashboard export uses the authenticated dashboard summary for the selected store and period',async()=>{
  const source=await read('dashboard-export.js');
  assert.match(source,/activeConnectionId/);
  assert.match(source,/functionRequest\('dashboard-summary', \{ query: \{ connection_id: activeConnectionId, days \} \}\)/);
  assert.match(source,/els\?\.rangeDays\?\.value/);
  assert.doesNotMatch(source,/fetch\(.*dashboard-summary|SUPABASE_SECRET|service_role/i);
});

test('CSV contains summary, daily and visible product records with UTF-8 Excel compatibility',async()=>{
  const source=await read('dashboard-export.js');
  assert.match(source,/record_type/);
  assert.match(source,/rows\.push\(row\('summary'/);
  assert.match(source,/rows\.push\(row\('daily'/);
  assert.match(source,/appendProducts\('critical_product'/);
  assert.match(source,/appendProducts\('missing_cost_product'/);
  assert.match(source,/\\uFEFF/);
  assert.match(source,/text\/csv;charset=utf-8/);
});

test('seller-controlled CSV text is protected against spreadsheet formula injection',async()=>{
  const source=await read('dashboard-export.js');
  assert.match(source,/\^\[=\+\\-@\]/);
  assert.match(source,/text = `'\$\{text\}`/);
  assert.match(source,/replaceAll\('\"', '\"\"'\)/);
  assert.match(source,/replace\(\/\[\\r\\n\\t\]\+\/g, ' '\)/);
});

test('dashboard export does not read credentials, auth tokens, bank data or seller identifiers',async()=>{
  const source=await read('dashboard-export.js');
  for(const forbidden of ['apiKey','apiSecret','access_token','refresh_token','external_seller_id','bankAccount','iban','credential']){
    assert.doesNotMatch(source,new RegExp(forbidden,'i'));
  }
  assert.match(source,/dashboard_summary_not_official_accounting_profit/);
});
