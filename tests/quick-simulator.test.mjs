import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function bootSimulator() {
  const source = await read('product-2026.js');
  const initial = {
    quickSalePrice: '799',
    quickProductCost: '410',
    quickCommission: '17,5',
    quickShipping: '54',
    quickAdRate: '6',
    quickReturnRate: '4'
  };
  const ids = [...Object.keys(initial), 'quickProfit', 'quickMargin',
    'quickBreakEven', 'quickStatus', 'quickDecisionMarker', 'quickReset'];
  const nodes = new Map(ids.map((id) => [id, {
    value: initial[id] ?? '',
    textContent: '',
    className: '',
    style: { left: '' },
    handlers: {},
    addEventListener(type, callback) { this.handlers[type] = callback; }
  }]));
  const onReady = [];
  const document = {
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelectorAll() { return []; },
    addEventListener(type, callback) {
      if (type === 'DOMContentLoaded') onReady.push(callback);
    }
  };
  runInNewContext(source, { document, window: {}, location: { hash: '' }, Intl });
  onReady.forEach((callback) => callback());
  return {
    text(id) { return nodes.get(id).textContent; },
    input(id, value) {
      const node = nodes.get(id);
      node.value = value;
      node.handlers.input();
    },
    reset() { nodes.get('quickReset').handlers.click(); }
  };
}

test('public quick calculator accepts both Turkish and international grouped amounts', async () => {
  const ui = await bootSimulator();
  assert.notEqual(ui.text('quickProfit'), 'Kontrol et');
  ui.input('quickSalePrice', '1.234,56');
  const turkish = ui.text('quickProfit');
  ui.input('quickSalePrice', '1,234.56');
  assert.equal(ui.text('quickProfit'), turkish);
  ui.input('quickSalePrice', '1234,56');
  assert.equal(ui.text('quickProfit'), turkish);
  ui.input('quickSalePrice', '1.234');
  const grouped = ui.text('quickProfit');
  ui.input('quickSalePrice', '1234');
  assert.equal(ui.text('quickProfit'), grouped);
});

test('malformed calculator inputs fail closed instead of silently changing amounts', async () => {
  const ui = await bootSimulator();
  for (const invalid of ['799abc', '1.2.3', '1,23,4', '2e3', '100 TL EXTRA', '']) {
    ui.input('quickSalePrice', invalid);
    assert.equal(ui.text('quickProfit'), 'Kontrol et', invalid);
    assert.equal(ui.text('quickBreakEven'), '—', invalid);
  }
  ui.reset();
  assert.notEqual(ui.text('quickProfit'), 'Kontrol et');
});

test('public calculator discloses its fixed operational assumptions', async () => {
  const html = await read('index.html');
  assert.match(html, /Örnek varsayımlar:/);
  assert.match(html, /%1 platform hizmet bedeli/);
  assert.match(html, /iade başına 50 ₺ işlem gideri/);
  assert.match(html, /iade edilen üründe %5 maliyet kaybı/);
});
