import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FiyatEmirleri, kosulSaglandi } from '../src/fiyatEmirleri.js';

const TOK = '0x5346e9dC6F65B5cCBd21491716c10F0D8117fFFF';

function kur({ fiyatlar = [1], bakiye = 1000, canli = true } = {}) {
  let i = 0;
  const satislar = [], limitler = [], iptaller = [];
  const f = new FiyatEmirleri({
    canli, bildir: null,
    fiyatGetir: async () => fiyatlar[Math.min(i++, fiyatlar.length - 1)],
    bakiyeGetir: async () => bakiye,
    islem: { sat: async (b) => { satislar.push(b); return { id: 'e1', durum: 'tamamlandi', txHash: '0xt' }; } },
    baw: {
      limitSat: async (b) => { limitler.push(b); return { strategyId: '123' }; },
      limitIptal: async (id) => { iptaller.push(id); return {}; },
      limitListe: async () => [{ strategyId: '123', status: 'FINISHED', txHash: '0xb', toTokenActualQty: '0.01' }],
    },
  });
  return { f, satislar, limitler, iptaller };
}

test('koşul yönü', () => {
  assert.equal(kosulSaglandi('kar-al', 2, 2), true);
  assert.equal(kosulSaglandi('kar-al', 1.9, 2), false);
  assert.equal(kosulSaglandi('zarar-kes', 0.5, 0.5), true);
  assert.equal(kosulSaglandi('zarar-kes', 0.6, 0.5), false);
});

test('onaysız, canlı kapalıyken ya da koşul zaten sağlanmışken emir kurulmaz', async () => {
  await assert.rejects(kur().f.olustur({ token: TOK, tur: 'kar-al', tetikUsd: 2, miktar: 10 }), /onay/);
  await assert.rejects(kur({ canli: false }).f.olustur({ token: TOK, tur: 'kar-al', tetikUsd: 2, miktar: 10, onay: true }), /Canlı işlem kapalı/);
  await assert.rejects(kur({ fiyatlar: [3] }).f.olustur({ token: TOK, tur: 'kar-al', tetikUsd: 2, miktar: 10, onay: true }), /hemen satardı/);
  await assert.rejects(kur({ fiyatlar: [0.4] }).f.olustur({ token: TOK, tur: 'zarar-kes', tetikUsd: 0.5, miktar: 10, onay: true }), /hemen satardı/);
  await assert.rejects(kur().f.olustur({ token: TOK, tur: 'zarar-kes', tetikUsd: 0.5, miktar: 10, yer: 'binance', onay: true }), /sadece kâr al/);
});

test('terminal zarar kes: art arda iki okumada tetiklenir ve bir kez satar', async () => {
  const { f, satislar } = kur({ fiyatlar: [1, 0.4, 0.6, 0.4, 0.4, 0.3] });
  await f.olustur({ token: TOK, tur: 'zarar-kes', tetikUsd: 0.5, miktar: 'hepsi', onay: true });
  await f.tur();   // 0.4: ilk okuma
  await f.tur();   // 0.6: sıfırlandı
  await f.tur();   // 0.4
  assert.equal(satislar.length, 0);
  await f.tur();   // 0.4: ikinci okuma, sat
  await f.tur();
  assert.equal(satislar.length, 1);
  assert.equal(satislar[0].miktar, '1000');
  assert.equal((await f.liste())[0].durum, 'tamamlandi');
});

test('binance kâr al: limit emri kurulur, durumu Binance\'ten güncellenir, iptal edilebilir', async () => {
  const { f, limitler } = kur({ fiyatlar: [1] });
  const e = await f.olustur({ token: TOK, sembol: '.ai', tur: 'kar-al', tetikUsd: 2, miktar: 'hepsi', yer: 'binance', onay: true });
  assert.equal(e.strategyId, '123');
  assert.equal(limitler[0].miktar, '1000');
  assert.equal(limitler[0].hedef, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  const l = await f.liste();
  assert.equal(l[0].durum, 'FINISHED');
  await assert.rejects(f.iptal(e.id), /bitmiş/);
});

test('terminal emri iptal edilince tetiklenmez', async () => {
  const { f, satislar } = kur({ fiyatlar: [1, 3, 3, 3] });
  const e = await f.olustur({ token: TOK, tur: 'kar-al', tetikUsd: 2, miktar: 5, onay: true });
  await f.iptal(e.id);
  await f.tur(); await f.tur(); await f.tur();
  assert.equal(satislar.length, 0);
});
