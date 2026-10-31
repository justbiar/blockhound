import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TOKEN = '0x05fd19702029c473683d6188cD856e59038278F4';
const BEN = '0x00000000000000000000000000000000B10c4040';
let Trader, dir;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'ajan-test-'));
  process.env.DATA_DIR = dir;
  ({ Trader } = await import('../src/trader.js'));
});

function sahteBaw({ swapSonuc = 'FINISHED', kilit = 'UNLOCKED', preview } = {}) {
  const cagri = [];
  return {
    cagri,
    teklif: async (a) => { cagri.push(['teklif', a]); return { fromCoinAmount: a.miktar, fromCoinSymbol: 'BNB', toCoinAmount: '1000', toCoinSymbol: 'X', slippage: 0.1 }; },
    kilit: async () => kilit,
    swap: async (a) => { cagri.push(['swap', a]); return { orderId: 'o1' }; },
    preview: async (a) => { cagri.push(['preview', a]); return preview; },
    calistir: async (id) => { cagri.push(['calistir', id]); return { status: 'BROADCASTED', txHash: '0xtx', orderId: 'k1' }; },
    _sonuc: swapSonuc,
  };
}

const yeni = (baw, ek = {}) => new Trader({
  baw, canli: true, islemBasiMax: 0.05, gunlukMax: 0.1, gunlukDosya: path.join(dir, `g-${Math.random()}.json`),
  bekle: async () => ({ status: baw._sonuc, txHash: '0xabc', toTokenActualQty: '999' }), ...ek,
});

test('simülasyonda swap çağrılmaz', async () => {
  const b = sahteBaw();
  const e = await yeni(b, { canli: false }).emirVer({ yon: 'al', token: TOKEN, miktar: '0.01' });
  assert.equal(e.durum, 'simulasyon');
  assert.ok(!b.cagri.some(([n]) => n === 'swap'));
});

test('canlı alım tamamlanır ve günlük harcamaya yazılır', async () => {
  const b = sahteBaw(); const t = yeni(b);
  const e = await t.emirVer({ yon: 'al', token: TOKEN, miktar: '0.02' });
  assert.equal(e.durum, 'tamamlandi');
  assert.equal(e.txHash, '0xabc');
  assert.equal(t.bugunHarcanan(), 0.02);
});

test('işlem başı limit aşılırsa teklif bile alınmaz', async () => {
  const b = sahteBaw();
  const e = await yeni(b).emirVer({ yon: 'al', token: TOKEN, miktar: '0.06' });
  assert.equal(e.durum, 'reddedildi');
  assert.equal(b.cagri.length, 0);
});

test('günlük limit eşzamanlı emirlerde de korunur', async () => {
  const b = sahteBaw(); const t = yeni(b);
  const sonuc = await Promise.all([1, 2, 3].map(() => t.emirVer({ yon: 'al', token: TOKEN, miktar: '0.04' })));
  const swaplar = b.cagri.filter(([n]) => n === 'swap').length;
  assert.equal(swaplar, 2);
  assert.equal(sonuc.filter((e) => e.durum === 'reddedildi').length, 1);
  assert.ok(t.bugunHarcanan() <= 0.1);
});

test('başarısız swap günlük limiti geri verir', async () => {
  const b = sahteBaw({ swapSonuc: 'FAILED' }); const t = yeni(b);
  const e = await t.emirVer({ yon: 'al', token: TOKEN, miktar: '0.03' });
  assert.equal(e.durum, 'basarisiz');
  assert.equal(t.bugunHarcanan(), 0);
});

test('cüzdan kilitliyse swap yapılmaz', async () => {
  const b = sahteBaw({ kilit: 'LOCKED' });
  const e = await yeni(b).emirVer({ yon: 'sat', token: TOKEN, miktar: '100' });
  assert.equal(e.durum, 'reddedildi');
  assert.ok(!b.cagri.some(([n]) => n === 'swap'));
});

test('kontrat çağrısı: riskli preview çalıştırılmaz', async () => {
  const preview = { requestId: 'r', simulationResult: { simulationCode: '000000000' }, risks: { riskDetails: [{ title: 'Phishing' }] } };
  const b = sahteBaw({ preview });
  const r = await yeni(b).kontratCagir({ cuzdan: BEN, kime: TOKEN, veri: '0x1249c58b' });
  assert.equal(r.durum, 'reddedildi');
  assert.ok(!b.cagri.some(([n]) => n === 'calistir'));
});

test('kontrat çağrısı: temiz preview çalıştırılır', async () => {
  const preview = { requestId: 'r', simulationResult: { simulationCode: '000000000' }, risks: {} };
  const b = sahteBaw({ preview });
  const r = await yeni(b).kontratCagir({ cuzdan: BEN, kime: TOKEN, veri: '0x1249c58b' });
  assert.equal(r.durum, 'gonderildi');
  assert.equal(r.txHash, '0xtx');
});
