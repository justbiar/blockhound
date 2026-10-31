import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UygulamaAyarlari, envOku, envYaz, degerDogrula, ALANLAR } from '../src/ayarlar.js';

const ENV = `# yorum
MOD=live
CANLI_ISLEM=1
ISLEM_BASI_MAX_BNB=0.002
GUNLUK_MAX_BNB=0.004
OPENROUTER_API_KEY=gizli
`;
function kur() {
  const dosya = path.join(mkdtempSync(path.join(tmpdir(), 'ayar-')), '.env');
  writeFileSync(dosya, ENV);
  const uygulanan = [];
  const calisan = { MOD: 'live', CANLI_ISLEM: '1', ISLEM_BASI_MAX_BNB: '0.002', GUNLUK_MAX_BNB: '0.004', VARSAYILAN_KAYMA: '10', BSC_RPC: 'https://a.org' };
  const a = new UygulamaAyarlari({ dosya, calisan, uygula: (k, v) => uygulanan.push([k, v]) });
  return { a, dosya, uygulanan };
}

test('env yazımı yorumları ve diğer satırları korur, olmayanı sona ekler', () => {
  const { dosya } = kur();
  envYaz(dosya, { GUNLUK_MAX_BNB: '0.01', VARSAYILAN_KAYMA: '15' });
  const metin = readFileSync(dosya, 'utf8');
  assert.match(metin, /^# yorum\nMOD=live\nCANLI_ISLEM=1\nISLEM_BASI_MAX_BNB=0.002\nGUNLUK_MAX_BNB=0.01\nOPENROUTER_API_KEY=gizli\nVARSAYILAN_KAYMA=15\n$/);
});

test('limitler anında uygulanır, mod yeniden başlatma bekler', () => {
  const { a, dosya, uygulanan } = kur();
  const d = a.guncelle({ GUNLUK_MAX_BNB: '0,01', CANLI_ISLEM: '0' });
  assert.deepEqual(uygulanan, [['GUNLUK_MAX_BNB', '0.01']]);
  assert.equal(envOku(dosya).CANLI_ISLEM, '0');
  assert.equal(d.yenidenBaslatGerekli, true);
  assert.equal(d.alanlar.find((x) => x.anahtar === 'CANLI_ISLEM').calisan, '1');
});

test('geçersiz değerler ve bilinmeyen anahtarlar reddedilir, dosya değişmez', () => {
  const { a, dosya } = kur();
  for (const g of [{ ISLEM_BASI_MAX_BNB: '-1' }, { ISLEM_BASI_MAX_BNB: '9' }, { GUNLUK_MAX_BNB: '0.001' }, { MOD: 'turbo' },
    { OPENROUTER_API_KEY: 'x' }, { BSC_RPC: 'http://iç.ağ' }, { AJAN_SITE_MODEL: 'a b' }, { VARSAYILAN_KAYMA: '5\nCANLI_ISLEM=1' }]) {
    assert.throws(() => a.guncelle(g), undefined, JSON.stringify(g));
  }
  assert.equal(readFileSync(dosya, 'utf8'), ENV);
});

test('gizli değerler ayar listesinde yok', () => {
  const adlar = ALANLAR.map((x) => x.anahtar);
  for (const k of ['API_TOKEN', 'OPENROUTER_API_KEY', 'PORT', 'BAW_BIN', 'DATA_DIR']) assert.equal(adlar.includes(k), false);
  assert.equal(degerDogrula(ALANLAR.find((x) => x.anahtar === 'BSC_OLAY_RPC'), ' https://a.org , https://b.io/bnb '), 'https://a.org,https://b.io/bnb');
});

test('model alanı virgülle yedekli liste kabul eder', () => {
  const a = ALANLAR.find((x) => x.anahtar === 'AJAN_SITE_MODEL');
  assert.equal(degerDogrula(a, 'x/y:free , openrouter/free'), 'x/y:free,openrouter/free');
  assert.throws(() => degerDogrula(a, 'a/b,c d'));
  assert.throws(() => degerDogrula(a, 'a/b,a/c,a/d,a/e,a/f'));
});
