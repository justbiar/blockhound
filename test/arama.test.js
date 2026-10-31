import { test } from 'node:test';
import assert from 'node:assert/strict';
import { braveArama, mintAra, aramaMetni } from '../src/arama.js';

test('Brave araması: anahtar başlıkta gider, sonuçlar temizlenir', async () => {
  let istek;
  const ara = braveArama({ anahtar: 'k'.repeat(30), fetchFn: async (url, o) => { istek = { url, o }; return { ok: true, status: 200, json: async () => ({ web: { results: [
    { title: '<b>Jager</b> mint', url: 'https://jager.live/', description: 'Mint $JAGENT\u0000' }, { title: 'kötü', url: 'javascript:alert(1)', description: '' },
  ] } }) }; } });
  const r = await ara('0xabc', 5);
  assert.equal(istek.o.headers['x-subscription-token'], 'k'.repeat(30));
  assert.match(istek.url, /q=0xabc&count=5/);
  assert.deepEqual(r, [{ baslik: 'Jager mint', url: 'https://jager.live/', aciklama: 'Mint $JAGENT' }]);
  const kota = braveArama({ anahtar: 'x', fetchFn: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(kota('a'), /kota/);
});

test('mint araması: adres bir site bulduysa tek arama, sadece gezgin sonuçları varsa adla ikinci arama', async () => {
  const sorgular = [];
  const sahte = (cevaplar) => async (q) => { sorgular.push(q); return cevaplar[sorgular.length - 1] || []; };
  const r = { adres: '0x' + 'a'.repeat(40), ad: 'Ghosts' };
  await mintAra(sahte([[{ url: 'https://bscscan.com/address/0x', baslik: 'b', aciklama: '' }, { url: 'https://ghosts.xyz', baslik: 'g', aciklama: '' }]]), r);
  assert.equal(sorgular.length, 1);
  sorgular.length = 0;
  const s = await mintAra(sahte([[{ url: 'https://bscscan.com/address/0x', baslik: 'b', aciklama: '' }], [{ url: 'https://ghosts.xyz', baslik: 'g', aciklama: '' }]]), r);
  assert.deepEqual(sorgular, [r.adres, '"Ghosts" NFT BNB Chain mint']);
  assert.equal(s.length, 2);
  assert.match(aramaMetni(s), /1\. b\n   https:\/\/bscscan/);
});
