import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('visual layer keeps empty-state copy and confidence semantics explicit',async()=>{
  const source=await readFile('vnext-visual.js','utf8');
  assert.match(source,/veri güveni/);
  assert.match(source,/Konum görseli dekoratiftir/);
  assert.match(source,/real dashboard data/i);
  assert.doesNotMatch(source,/net k[aâ]r/i);
});
