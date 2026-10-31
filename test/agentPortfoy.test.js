import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentKontratlari, agentPortfoy } from '../src/agentPortfoy.js';

const kayitlar = [
  { zaman: 1, adres: '0xAA', ad: 'Elle NFT', bnb: 0.0005, durum: 'gonderildi', txHash: '0x1', kaynak: 'elle', gelenler: ['0xaa'] },
  { zaman: 2, adres: '0xBB', ad: 'Oto Token', bnb: 0.001, durum: 'gonderildi', txHash: '0x2', kaynak: 'otomatik', gelenler: ['0xcc'] },
  { zaman: 3, adres: '0xDD', ad: 'Oto NFT', bnb: 0, durum: 'gonderildi', txHash: '0x3', kaynak: 'otomatik' },
  { zaman: 3.5, adres: '0xF1', ad: 'Hiçbir şey gelmedi', bnb: 0, durum: 'gonderildi', txHash: '0x9', kaynak: 'otomatik', gelenler: [] },
  { zaman: 4, adres: '0xEE', ad: 'Reddedildi', bnb: 0, durum: 'reddedildi', kaynak: 'otomatik' },
  { zaman: 5, adres: '0xFF', ad: 'Eski kayıt', bnb: 0, durum: 'gonderildi', txHash: '0x5' },
];

test('sadece gönderilmiş otomatik mintler Agent sayılır, eski kayıtlar Normal kalır', () => {
  assert.deepEqual([...agentKontratlari(kayitlar)].sort(), ['0xcc', '0xdd']);
});

test('Agent portföyü: ödenen, gas, değer ve net', () => {
  const varliklar = [{ kontrat: '0xcc', tur: 'token', sembol: 'OTO', miktar: 1000, degerUsd: 2 }, { kontrat: '0xdd', tur: 'nft', miktar: 1, degerUsd: null }];
  const a = agentPortfoy({ kayitlar, varliklar, islemler: [{ hash: '0x2', gasBnb: 0.00001 }, { hash: '0x3', gasBnb: 0.00002 }], bnbSimdi: 600 });
  assert.equal(a.ozet.adet, 3);
  assert.equal(a.ozet.harcananBnb, 0.001);
  assert.ok(Math.abs(a.ozet.gasBnb - 0.00003) < 1e-12);
  assert.ok(Math.abs(a.ozet.maliyetUsd - 0.618) < 1e-9);
  assert.equal(a.ozet.degerUsd, 2);
  assert.equal(a.ozet.fiyatsiz, 1);
  assert.deepEqual(a.satirlar[0].gelen, []); // varlık getirmeyen mint
  assert.equal(a.satirlar[1].ad, 'Oto NFT');
  assert.equal(a.satirlar[2].gelen[0].sembol, 'OTO');
});
