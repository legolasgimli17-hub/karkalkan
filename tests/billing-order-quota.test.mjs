import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationPath='supabase/migrations/20260819002000_billing_order_usage_enforcement.sql';
const read=()=>readFile(migrationPath,'utf8');

test('monthly order quota is enforced in the database, not only in the browser',async()=>{
  const sql=await read();
  assert.match(sql,/create table if not exists public\.billing_order_usage_daily/i);
  assert.match(sql,/create trigger trg_marketplace_product_metric_order_quota/i);
  assert.match(sql,/after insert or update[\s\S]*or delete[\s\S]*marketplace_product_daily_metrics/i);
  assert.match(sql,/PLAN_ORDER_LIMIT_REACHED/);
  assert.match(sql,/v_period_usage > v_limit/);
});

test('quota writes are tenant-serialized to prevent concurrent stores racing the limit',async()=>{
  const sql=await read();
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 7193\)\)/i);
  assert.match(sql,/where u\.user_id = p_user_id/i);
  assert.match(sql,/foreign key \(connection_id, user_id\)[\s\S]*marketplace_connections\(id, user_id\)[\s\S]*on delete cascade/i);
});

test('quota respects paid billing periods and keeps bounded free validation capacity',async()=>{
  const sql=await read();
  assert.match(sql,/v_status not in \('trialing','active','past_due'\)/i);
  assert.match(sql,/when 'growth' then 5000/i);
  assert.match(sql,/when 'scale' then 50000/i);
  assert.match(sql,/else 500/i);
  assert.match(sql,/current_period_start/i);
  assert.match(sql,/current_period_end/i);
  assert.match(sql,/Historical re-syncs must not be rejected/i);
});

test('summary imports cannot bypass quota by collapsing many orders into one product row',async()=>{
  const sql=await read();
  assert.match(sql,/sales_unit_basis = 'settlement_transaction_proxy'/i);
  assert.match(sql,/greatest\(coalesce\(m\.orders,0\), coalesce\(m\.sales_units,0\)\)/i);
  assert.match(sql,/conservative_proxy_units/i);
  assert.match(sql,/conservative_product_orders/i);
});

test('usage table is not directly writable by browser roles',async()=>{
  const sql=await read();
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.billing_order_usage_daily from anon, authenticated/i);
  assert.doesNotMatch(sql,/create policy[\s\S]*billing_order_usage_daily/i);
});
