import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bildirimler, sessizMi, mintBildirimi, VARSAYILAN } from '../src/bildirim.js';

const saatte = (h, m = 0) => { const d = new Date(2026, 9, 31, h, m); return () => d; };
function kur(ayar = {}, saat = saatte(12)) {
  const giden = [];
  const b = new Bildirimler({ gonder: (bas, gov, ses) => giden.push({ bas, ses }), saat });
  b.guncelle(ayar);
  return { b, giden };
}

test('varsayılan: Agent ID olmayan mint susturulur, Agent ID li gider', () => {
  const { b, giden } = kur();
  assert.equal(b.bildir('mintUcretsiz', 'A', '', { agentId: false }), false);
  assert.equal(b.bildir('mintUcretsiz', 'B', '', { agentId: true }), true);
  assert.deepEqual(giden.map((x) => x.bas), ['B']);
  assert.equal(b.gecmis[1].sebep, 'Agent ID mint değil');
  assert.equal(VARSAYILAN.kategoriler.mintIzle, false);
});

test('kapalı tür ve kapalı ana anahtar susturur, deneme bildirimi her zaman gider', () => {
  const { b, giden } = kur({ kategoriler: { fiyatEmri: false } });
  assert.equal(b.bildir('fiyatEmri', 'x'), false);
  b.guncelle({ acik: false });
  assert.equal(b.bildir('ajanOnay', 'y', '', { agentId: true }), false);
  assert.equal(b.bildir('deneme', 'z', '', { zorla: true }), true);
  assert.equal(giden.length, 1);
});

test('sessiz saatler gece yarısını geçebilir', () => {
  const s = { acik: true, bas: '23:00', bit: '08:00' };
  assert.equal(sessizMi(s, new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(sessizMi(s, new Date(2026, 0, 1, 7, 59)), true);
  assert.equal(sessizMi(s, new Date(2026, 0, 1, 8, 0)), false);
  assert.equal(sessizMi({ ...s, acik: false }, new Date(2026, 0, 1, 23, 30)), false);
  const { b } = kur({ sessiz: s }, saatte(2));
  assert.equal(b.bildir('fiyatEmri', 'gece'), false);
});

test('saatlik sınır ve sessiz ses tercihi', () => {
  const { b, giden } = kur({ saatlikMax: 2, ses: false });
  for (let i = 0; i < 4; i++) b.bildir('fiyatEmri', `e${i}`);
  assert.equal(giden.length, 2);
  assert.equal(giden[0].ses, false);
  assert.match(b.gecmis[0].sebep, /Saatlik/);
});

test('geçersiz ayarlar yok sayılır', () => {
  const { b } = kur({ saatlikMax: -5, sessiz: { bas: '25:00' }, kategoriler: { bilinmeyen: true, ajanAtla: 'evet' }, acik: 'hayır' });
  assert.equal(b.ayar.saatlikMax, VARSAYILAN.saatlikMax);
  assert.equal(b.ayar.sessiz.bas, VARSAYILAN.sessiz.bas);
  assert.equal(b.ayar.acik, true);
  assert.equal('bilinmeyen' in b.ayar.kategoriler, false);
  assert.equal(b.ayar.kategoriler.ajanAtla, false);
});

test('mint kaydından kategori', () => {
  assert.equal(mintBildirimi({ sonuc: 'UCRETLI', tur: 'token', adres: '0x1', agentId: true }).kategori, 'mintUcretli');
  assert.equal(mintBildirimi({ sonuc: 'IZLE', adres: '0x1', agentId: true, standart: 'ERC-721' }).kategori, 'mintIzle');
  assert.equal(mintBildirimi({ sonuc: 'UCRETSIZ', adres: '0x1' }).agentId, false);
});
