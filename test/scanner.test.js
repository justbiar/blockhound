import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satirNormalize, Tarayici } from '../src/scanner.js';
import { txDogrula, fourAdresiMi, FOUR_CORE } from '../src/fourAgent.js';

const ADR = '0x245238289e2d1c08664f26263946ed6b862f4444';
const BEN = '0x00000000000000000000000000000000B10c4040';

test('satır normalize: null bilinmiyor olarak kalır, tehlikeli linkler atılır', () => {
  const t = satirNormalize({ contractAddress: ADR, symbol: 'X', icon: '/images/a.png', holders: '9', taxRateBuy: null,
    socials: { website: 'javascript:alert(1)', twitter: 'https://x.com/a' } });
  assert.equal(t.ikon, 'https://bin.bnbstatic.com/images/a.png');
  assert.equal(t.holder, 9);
  assert.equal(t.vergiAl, null);
  assert.equal(t.sosyal.web, null);
  assert.equal(t.sosyal.x, 'https://x.com/a');
  assert.equal(satirNormalize({ contractAddress: 'bozuk' }), null);
});

function sahteFetch(sayfa) {
  return async (_u, o) => {
    const rt = JSON.parse(o.body).rankType;
    return { ok: true, json: async () => ({ code: '000000', data: sayfa[rt] || [] }) };
  };
}

test('tarayıcı: açılıştaki tokenler için uyarı vermez, sonra gelen yeni token için verir', async () => {
  const sayfa = { 10: [{ contractAddress: ADR }], 20: [], 30: [] };
  const t = new Tarayici({ fetchFn: sahteFetch(sayfa) });
  const yeniler = [];
  t.on('yeni', (x) => yeniler.push(x.adres));
  await t.tur();
  assert.equal(yeniler.length, 0);
  sayfa[10] = [{ contractAddress: '0x1111111111111111111111111111111111114444' }, { contractAddress: ADR }];
  await t.tur();
  assert.deepEqual(yeniler, ['0x1111111111111111111111111111111111114444']);
  assert.equal(t.listeler.yeni.length, 2);
});

test('tarayıcı: API hatası durumu bildirir, eski listeyi korur', async () => {
  const t = new Tarayici({ fetchFn: sahteFetch({ 10: [{ contractAddress: ADR }] }) });
  await t.tur();
  t.fetchFn = async () => ({ ok: false, status: 429 });
  await t.tur();
  assert.match(t.durum.sonHata, /429/);
  assert.equal(t.listeler.yeni.length, 1);
});

test('four: vanity adres kontrolü', () => {
  assert.equal(fourAdresiMi(ADR), true);
  assert.equal(fourAdresiMi('0x55d398326f99059fF775485246999027B3197955'), false);
});

test('four: script tx doğrulaması', () => {
  const tx = { from: BEN.toLowerCase(), to: FOUR_CORE, value: '1000000000000000', inputData: '0x995ee6da00' };
  assert.doesNotThrow(() => txDogrula(tx, { cuzdan: BEN, maxWei: 10n ** 15n }));
  assert.throws(() => txDogrula({ ...tx, to: '0x000000000000000000000000000000000000dead' }, { cuzdan: BEN, maxWei: 10n ** 15n }), /hedef/);
  assert.throws(() => txDogrula({ ...tx, value: '2000000000000000' }, { cuzdan: BEN, maxWei: 10n ** 15n }), /bütçe/);
  assert.throws(() => txDogrula({ ...tx, from: FOUR_CORE }, { cuzdan: BEN, maxWei: 10n ** 15n }), /cüzdan/);
});
