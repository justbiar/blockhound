import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ayarTemizle, sniperFiltre, satisKarari, miktarYaz, Otomasyon, VARSAYILAN } from '../src/otomasyon.js';

const TK = '0x245238289e2d1c08664f26263946ed6b862f4444';

test('ayar: varsayılan kapalı + simülasyon, sınırlar sıkıştırılır', () => {
  const a = ayarTemizle({}, 0.05);
  assert.equal(a.sniper.acik, false);
  assert.equal(a.sniper.simulasyon, true);
  assert.equal(a.otoSatis.acik, false);
  assert.equal(a.otoSatis.simulasyon, true);
  const b = ayarTemizle({ sniper: { bnb: 5, kayma: 99, gunlukMaxToken: 1000 }, otoSatis: { karAl: [{ kat: 0.5, yuzde: 50 }, { kat: 3, yuzde: 200 }] } }, 0.05);
  assert.equal(b.sniper.bnb, 0.05);
  assert.equal(b.sniper.kayma, 50);
  assert.equal(b.sniper.gunlukMaxToken, 50);
  assert.deepEqual(b.otoSatis.karAl, [{ kat: 1.01, yuzde: 50 }, { kat: 3, yuzde: 100 }]);
  assert.equal(ayarTemizle({ sniper: { simulasyon: 'evet' } }).sniper.simulasyon, true);
});

test('sniper filtresi', () => {
  const s = ayarTemizle({ sniper: { maxYasSn: 60, minHolder: 5, maxTop10: 80 } }).sniper;
  const simdi = 1_000_000;
  const t = { olusturma: simdi - 30_000, holder: 10, top10: 50, devSatti: 0, dexDurum: 0 };
  assert.equal(sniperFiltre(t, s, simdi).ok, true);
  assert.equal(sniperFiltre({ ...t, olusturma: simdi - 120_000 }, s, simdi).ok, false);
  // anti-sniper: varsayılan en az 8 sn
  assert.match(sniperFiltre({ ...t, olusturma: simdi - 3_000 }, s, simdi).sebep, /anti-sniper/);
  assert.equal(sniperFiltre({ ...t, holder: 2 }, s, simdi).ok, false);
  assert.equal(sniperFiltre({ ...t, top10: null }, s, simdi).ok, false);
  assert.equal(sniperFiltre({ ...t, devSatti: 90 }, s, simdi).ok, false);
  assert.equal(sniperFiltre({ ...t, dexDurum: 1 }, s, simdi).ok, false);
});

test('satış kararı: zarar kes, kademeli kâr al, aynı kademe iki kez satılmaz', () => {
  const o = ayarTemizle({ otoSatis: { karAl: [{ kat: 2, yuzde: 50 }, { kat: 4, yuzde: 100 }], zararKes: 50 } }).otoSatis;
  const p = { girisBnb: 0.01, ilkMiktar: 1000, kalan: 1000, karAlYapilan: [] };
  assert.equal(satisKarari(p, 0.012, o), null);
  assert.equal(satisKarari(p, 0.021, o).kat, 2);
  assert.equal(satisKarari(p, 0.05, o).kat, 4);
  assert.equal(satisKarari({ ...p, karAlYapilan: [2] }, 0.021, o), null);
  assert.equal(satisKarari(p, 0.004, o).yuzde, 100);
  // kalan yarıya indikten sonra oran birim fiyatla hesaplanır
  assert.equal(satisKarari({ ...p, kalan: 500, karAlYapilan: [2] }, 0.0105, o), null);
  assert.equal(satisKarari({ ...p, kalan: 500, karAlYapilan: [2] }, 0.0201, o).kat, 4);
});

test('miktar yazımı üslü gösterim üretmez', () => {
  assert.equal(miktarYaz(1e-7), '0');
  assert.equal(miktarYaz(226298.6775789), '226298.677578');
  assert.equal(miktarYaz(1e21), '1000000000000000000000');
});

function kur({ canli = false, ayar = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oto-'));
  const tarayici = Object.assign(new EventEmitter(), { listeler: { yeni: [], bitmekUzere: [], dex: [] } });
  const cagri = [];
  const islem = {
    teklif: async (a) => { cagri.push(['teklif', a]); return { fromCoinAmount: a.miktar, toCoinAmount: '1000' }; },
    al: async (a) => { cagri.push(['al', a]); return { id: 'e1', durum: 'gonderildi' }; },
    sonucBekle: async () => ({ durum: 'tamamlandi', odenenBnb: '0.001', alinan: '1000', txHash: '0xt' }),
    sat: async (a) => { cagri.push(['sat', a]); return { id: 'e2' }; },
    degerBnb: async () => ({ bnb: 0.003 }),
    rotaBelirle: async () => ({ rota: 'contract-call' }),
  };
  const o = new Otomasyon({
    islem, tarayici, canli, islemBasiMax: 0.05, bnbFiyati: async () => 750, bakiyeGetir: async () => [],
    ayarDosya: path.join(dir, 'a.json'), pozisyonDosya: path.join(dir, 'p.json'), logDosya: path.join(dir, 'l.jsonl'),
  });
  o.ayarGuncelle(ayar);
  return { o, tarayici, cagri };
}

const yeniToken = (ek = {}) => ({ adres: TK, sembol: 'meme', olusturma: Date.now() - 15_000, holder: 3, top10: 50, devSatti: 0, dexDurum: 0, ...ek });

test('sniper kapalıyken hiçbir şey yapmaz', async () => {
  const { o, cagri } = kur();
  await o.yeniToken(yeniToken());
  assert.equal(cagri.length, 0);
});

test('sniper simülasyonda sadece teklif alır, sanal pozisyon açar', async () => {
  const { o, cagri } = kur({ canli: true, ayar: { sniper: { acik: true, simulasyon: true } } });
  await o.yeniToken(yeniToken());
  assert.deepEqual(cagri.map(([n]) => n), ['teklif']);
  assert.equal(o.durum().pozisyonlar.length, 1);
  assert.equal(o.durum().pozisyonlar[0].simulasyon, true);
});

test('canlı işlem kapalıysa sniper simülasyon kapatılsa bile gerçek alım yapmaz', async () => {
  const { o, cagri } = kur({ canli: false, ayar: { sniper: { acik: true, simulasyon: false } } });
  await o.yeniToken(yeniToken());
  assert.ok(!cagri.some(([n]) => n === 'al'));
});

test('canlı sniper: aynı token iki kez alınmaz, günlük sınır uygulanır', async () => {
  const { o, cagri } = kur({ canli: true, ayar: { sniper: { acik: true, simulasyon: false, gunlukMaxToken: 1 } } });
  await o.yeniToken(yeniToken());
  await o.yeniToken(yeniToken());
  await o.yeniToken(yeniToken({ adres: '0x1111111111111111111111111111111111114444' }));
  assert.equal(cagri.filter(([n]) => n === 'al').length, 1);
  assert.equal(cagri.find(([n]) => n === 'al')[1].kaynak, 'sniper');
});

test('acil durdurma her şeyi kapatır', async () => {
  const { o, cagri } = kur({ canli: true, ayar: { sniper: { acik: true, simulasyon: false } } });
  o.acilDurdur();
  assert.equal(o.ayar.sniper.acik, false);
  assert.equal(o.ayar.otoSatis.acik, false);
  await o.yeniToken(yeniToken());
  assert.equal(cagri.length, 0);
});

test('canlı oto satış: 3x kârda %50 satar, sonra aynı kademe tekrar satılmaz', async () => {
  const { o, cagri } = kur({ canli: true, ayar: { sniper: { acik: true, simulasyon: false }, otoSatis: { acik: true, simulasyon: false, karAl: [{ kat: 2, yuzde: 50 }], zararKes: null } } });
  await o.yeniToken(yeniToken());
  await o.satisTuru();
  const satislar = cagri.filter(([n]) => n === 'sat');
  assert.equal(satislar.length, 1);
  assert.equal(satislar[0][1].miktar, '500');
  assert.equal(satislar[0][1].kaynak, 'oto-satis');
  await o.satisTuru();
  assert.equal(cagri.filter(([n]) => n === 'sat').length, 1);
});

test('VARSAYILAN nesnesi değişmez', () => {
  assert.equal(VARSAYILAN.sniper.acik, false);
});
