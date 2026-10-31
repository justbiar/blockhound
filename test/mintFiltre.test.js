import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintSiniflandir, sayimlar } from '../src/mintFiltre.js';

const temel = { adres: '0x1', sonuc: 'UCRETSIZ', mintler: [{ imza: 'mint()', gecti: true, ucretWei: '0' }], sartliImzalar: [], mintEdildi: null };
const rapor = (o = {}) => ({ karar: { eylem: 'onay-bekle', sebepler: [] }, site: { puan: 70, cuzdanIzniIstiyor: false }, sosyal: { puan: 60, dolandiricilikIsaretleri: [] }, ...o });

test('simülasyonu geçen ve işareti olmayan mint hazır', () => {
  const f = mintSiniflandir(temel, rapor());
  assert.equal(f.grup, 'hazir');
  assert.equal(f.kimliksiz, false);
});

test('somut risk işareti hazırı ezer', () => {
  assert.equal(mintSiniflandir(temel, rapor({ karar: { eylem: 'atla', sebepler: ['Taklit'] } })).grup, 'riskli');
  assert.equal(mintSiniflandir(temel, rapor({ sosyal: { puan: 60, dolandiricilikIsaretleri: ['Sahte X hesabı'] } })).grup, 'riskli');
  assert.equal(mintSiniflandir(temel, rapor({ site: { puan: 70, cuzdanIzniIstiyor: true } })).grup, 'riskli');
  assert.equal(mintSiniflandir({ ...temel, onizleme: { durum: 'riskli', sebep: 'Beklenmeyen onay' } }).grup, 'riskli');
});

test('site ve sosyal puanı düşük olan sadece doğrulanmamış işaretlenir, riskli sayılmaz', () => {
  const f = mintSiniflandir(temel, rapor({ site: { puan: 25 }, sosyal: { puan: 15, dolandiricilikIsaretleri: [] } }));
  assert.equal(f.grup, 'hazir');
  assert.equal(f.kimliksiz, true);
  assert.equal(mintSiniflandir(temel).kimliksiz, null);
});

test('Binance önizlemesi geçmeyen geçmiyor grubuna düşer', () => {
  const f = mintSiniflandir({ ...temel, onizleme: { durum: 'basarisiz', sebep: 'Simülasyon başarısız: 1' } });
  assert.equal(f.grup, 'gecmiyor');
  assert.match(f.gecmemeSebebi, /önizlemesi/);
});

test('sebepsiz revert geçmiyor, kapanan ya da tükenen bitti', () => {
  const rev = { ...temel, sonuc: 'IZLE', agentId: true, mintler: [{ imza: 'mint()', gecti: false, sebep: 'revert (sebep yok)' }] };
  assert.equal(mintSiniflandir(rev).grup, 'gecmiyor');
  const kota = { ...rev, mintler: [{ imza: 'mint()', gecti: false, sebep: 'MGBZ: free quota full' }] };
  assert.equal(mintSiniflandir(kota).grup, 'bitti');
  assert.equal(mintSiniflandir({ ...temel, sonuc: 'TUKENDI', mintler: [] }).grup, 'bitti');
});

test('sadece site imzası isteyen izleniyor, mint ettiğin her şeyin önünde', () => {
  assert.equal(mintSiniflandir({ ...temel, sonuc: 'IZLE', mintler: [], sartliImzalar: ['mint(bytes)'] }).grup, 'izleniyor');
  assert.equal(mintSiniflandir({ ...temel, mintEdildi: { adet: 1 } }, rapor({ karar: { eylem: 'atla' } })).grup, 'edildi');
});

test('sayımlar her grubu verir', () => {
  const s = sayimlar([{ filtre: { grup: 'hazir' } }, { filtre: { grup: 'riskli' } }, { filtre: { grup: 'hazir' } }]);
  assert.equal(s.hazir, 2);
  assert.equal(s.riskli, 1);
  assert.equal(s.bitti, 0);
});
