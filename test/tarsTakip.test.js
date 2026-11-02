import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tarsNormalize, aktiviteAnaliz, kategorile, TarsTakip } from '../src/tarsTakip.js';

const CA = 'AV7DcNW3tPPsaR5WBaBY3sKEHMZsXGApviC4jtxmBQZH';
const DEV = 'GkK1PXamZ4PTZ6voxhMyV4chRqVRPVhoeAn4Z5CYGS77';
const satir = (ek = {}) => ({ ca: CA, symbol: 'TARS', name: 'TARS', creator: DEV, createdAt: '2026-11-01T08:28:39.000Z', marketCapSol: 100, priceSol: 1e-7, raisedSol: 40, targetSol: 80, progress: 50, holders: 12, volume24hSol: 5, status: 'curve', imageUri: 'https://tars.meme/a.png', ...ek });

test('normalize: dolar değeri SOL fiyatıyla, bozuk adres ve tehlikeli linkler atılır', () => {
  const t = tarsNormalize(satir({ website: 'javascript:alert(1)', twitter: 'https://x.com/tars' }), 95);
  assert.equal(t.zincir, 'solana');
  assert.equal(t.piyasaDegeri, 9500);
  assert.equal(t.sosyal.web, null);
  assert.equal(t.sosyal.x, 'https://x.com/tars');
  assert.equal(t.durum, 'curve');
  assert.equal(tarsNormalize(satir(), null).piyasaDegeri, null);
  assert.equal(tarsNormalize({ ca: '0xbozuk' }), null);
});

test('aktivite: aynı saniyede çok cüzdanlı alımlar senkron sayılır, geliştirici satışı oranlanır', () => {
  const k = (wallet, type, amountSol, timestamp, tokens = 100, agent = 'x.ai') => ({ wallet, type, amountSol, timestamp, tokens, agent });
  const a = aktiviteAnaliz([
    k('w1', 'buy', 0.5, '2026-11-01T11:16:16.000Z'), k('w2', 'buy', 0.5, '2026-11-01T11:16:16.000Z'), k('w3', 'buy', 0.5, '2026-11-01T11:16:16.000Z'),
    k('w4', 'buy', 0.4, '2026-11-01T11:13:41.000Z'), k('w5', 'buy', 0.4, '2026-11-01T11:13:41.000Z'),
    k('w6', 'buy', 0.1, '2026-11-01T11:10:00.000Z'), k('w7', 'buy', 0.2, '2026-11-01T11:10:00.000Z'),
    k(DEV, 'buy', 1, '2026-11-01T09:00:00.000Z', 1000), k(DEV, 'sell', 1, '2026-11-01T10:00:00.000Z', 250),
  ], DEV);
  assert.equal(a.alim, 8);
  assert.equal(a.satim, 1);
  assert.equal(a.senkron, 5); // 3 cüzdan + eşit tutarlı 2 cüzdan; farklı tutarlı ikili sayılmaz
  assert.equal(a.devSatti, 25);
});

test('kategoriler: DEX, dolmak üzere ve yeni ayrılır', () => {
  const l = kategorile([
    tarsNormalize(satir({ ca: CA, status: 'graduated', progress: 100 })),
    tarsNormalize(satir({ ca: 'HzoFqKoZHi4AKN7EvTDg4RsGr5Q6wVxrKyKFS5WebEFC', progress: 85 })),
    tarsNormalize(satir({ ca: 'HMgcmeZuxBsD48MRcsnrqeNRudnhtM1iRcpmuERShTWR', progress: 3 })),
  ]);
  assert.equal(l.dex.length, 1);
  assert.equal(l.bitmekUzere.length, 1);
  assert.equal(l.yeni.length, 1);
});

test('takip: açılıştaki tokenler için uyarı vermez, aktiviteyi değişmeyen token için tekrar okumaz', async () => {
  let tokenler = [satir()];
  let aktiviteIstegi = 0;
  const fetchFn = async (u) => {
    if (u.includes('/api/market')) return { ok: true, json: async () => ({ price: 95 }) };
    if (u.includes('/api/activity')) { aktiviteIstegi++; return { ok: true, json: async () => ({ items: [] }) }; }
    return { ok: true, json: async () => ({ items: tokenler, nextCursor: null }) };
  };
  const t = new TarsTakip({ fetchFn });
  const yeniler = [];
  t.on('yeni', (x) => yeniler.push(x.adres));
  await t.tur();
  await t.tur();
  assert.equal(aktiviteIstegi, 1);
  assert.equal(yeniler.length, 0);
  tokenler = [satir(), satir({ ca: 'HzoFqKoZHi4AKN7EvTDg4RsGr5Q6wVxrKyKFS5WebEFC', progress: 1 })];
  await t.tur();
  assert.deepEqual(yeniler, ['HzoFqKoZHi4AKN7EvTDg4RsGr5Q6wVxrKyKFS5WebEFC']);
  assert.equal(t.listeler.yeni[0].piyasaDegeri, 9500);
});
