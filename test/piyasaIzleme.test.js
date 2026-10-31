import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PiyasaIzleme } from '../src/piyasaIzleme.js';

const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), N = '0x' + 'c'.repeat(40), F = '0x' + 'd'.repeat(40);
function kur(fiyatlar) {
  const portfoy = { son: { var: 1 }, hesapla: async () => ({ varliklar: [
    { kontrat: A, sembol: 'AAA', tur: 'token', miktar: 100, fiyat: null },
    { kontrat: B, sembol: 'BBB', tur: 'token', miktar: 50, fiyat: null },
    { kontrat: N, sembol: 'NFT', tur: 'nft', miktar: 1, fiyat: null }, // NFT izlenmez
    { kontrat: F, sembol: 'FYT', tur: 'token', miktar: 5, fiyat: 2 }, // zaten fiyatı var
  ] }) };
  const sorulan = [], bildirimler = [];
  const iz = new PiyasaIzleme({ portfoy, bekleMs: 0, fiyatGetir: async (a) => { sorulan.push(a); return fiyatlar[a] ?? null; }, bildir: (b, g) => bildirimler.push([b, g]) });
  return { iz, sorulan, bildirimler, portfoy };
}

test('sadece fiyatı olmayan tokenler sorulur; havuz yoksa bekler, bildirim yok', async () => {
  const { iz, sorulan, bildirimler } = kur({});
  assert.deepEqual(await iz.tur(), []);
  assert.deepEqual(sorulan.sort(), [A, B]);
  assert.equal(bildirimler.length, 0);
  assert.equal(iz.liste().length, 2);
});

test('fiyat oluşunca bir kez bildirilir, portföy önbelleği tazelenir', async () => {
  const fiyatlar = {};
  const { iz, bildirimler, portfoy } = kur(fiyatlar);
  await iz.tur();
  fiyatlar[A] = 0.002;
  const acilan = await iz.tur();
  assert.deepEqual(acilan.map((x) => x.kontrat), [A]);
  assert.match(bildirimler[0][0], /Piyasa açıldı: AAA/);
  assert.match(bildirimler[0][1], /≈ \$0\.20/);
  assert.equal(portfoy.son, null);
  await iz.tur();
  assert.equal(bildirimler.length, 1);
  assert.ok(iz.liste()[0].acildi);
});
