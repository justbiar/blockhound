import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defterOlustur, BNB_ADRES } from '../src/defter.js';
import { pnlHesapla, seriOlustur } from '../src/pnl.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const TOK = '0x2838c17f11e68cb2e3e800ccf608b35c2247caf6';
const NFT = '0x41ed6bfa4a9eee713bf3a3997f1dd7ac0d3ac482';
const kalem = (kontrat, miktar, tokenId = null, sembol = 'X') => ({ amount: String(miktar), addressInfo: { address: BEN }, tokenInfo: { contractAddress: kontrat, symbol: sembol, tokenId, decimals: 18 } });
const kayit = (hash, zaman, txType, { send = [], receive = [], gas = 0 } = {}) => ({
  txType, txHash: hash, txTime: new Date(zaman).toISOString(), status: 'confirmed',
  txHashList: [{ txHash: hash, status: 'confirmed', networkFee: { feeTokenAddress: BNB_ADRES, feeValue: String(gas * 1e18), feeTokenDecimals: 18 }, instructions: { send, receive } }],
});
const sabit = (f) => () => f;

test('defter: aynı txHash ile bölünmüş kayıtlar birleşir, gas bir kez sayılır', () => {
  const d = defterOlustur([
    kayit('0xa', 1000, 'transfer', { receive: [kalem(TOK, 100000)], gas: 0.00001 }),
    kayit('0xa', 1000, 'transfer', { send: [kalem(BNB_ADRES, 0.01)], gas: 0.00001 }),
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].gasBnb, 0.00001);
  assert.equal(d[0].bnbNet, -0.01);
  assert.equal(d[0].giren[0].miktar, 100000);
});

test('defter: BNB iadesi net hesaplanır, onaylanmamış kayıt atlanır', () => {
  const d = defterOlustur([
    kayit('0xb', 1, 'contract_call', { send: [kalem(BNB_ADRES, 0.004)], receive: [kalem(TOK, 5), kalem(BNB_ADRES, 0.0001)] }),
    { ...kayit('0xc', 2, 'transfer', { receive: [kalem(BNB_ADRES, 1)] }), status: 'pending' },
  ]);
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0].bnbNet + 0.0039) < 1e-12);
});

test('pnl: yatırım, alım, bedava mint ve satış', () => {
  const islemler = defterOlustur([
    kayit('0x1', 1000, 'transfer', { receive: [kalem(BNB_ADRES, 0.1)] }),
    kayit('0x2', 2000, 'swap', { send: [kalem(BNB_ADRES, 0.01)], receive: [kalem(TOK, 1000)], gas: 0.0001 }),
    kayit('0x3', 3000, 'mint', { receive: [kalem(NFT, 1, '7')], gas: 0.0001 }),
    kayit('0x4', 4000, 'swap', { send: [kalem(TOK, 500)], receive: [kalem(BNB_ADRES, 0.008)], gas: 0.0001 }),
  ]);
  const r = pnlHesapla({ islemler, bnbUsd: sabit(500), bnbSimdi: 500, guncel: { [TOK]: { fiyat: 0.004 } } });
  const tok = r.varliklar.find((v) => v.kontrat === TOK);
  assert.equal(tok.miktar, 500);
  assert.ok(Math.abs(tok.maliyetUsd - 2.5) < 1e-9);          // 0.01 BNB * 500 / 2
  assert.ok(Math.abs(tok.gerceklesenUsd - 1.5) < 1e-9);       // 4$ geldi, 2.5$ maliyet düştü
  assert.ok(Math.abs(tok.degerUsd - 2) < 1e-9);
  assert.ok(Math.abs(tok.gerceklesmemisUsd + 0.5) < 1e-9);
  const nft = r.varliklar.find((v) => v.kontrat === NFT);
  assert.equal(nft.anaTur, 'bedava');
  assert.equal(nft.degerUsd, null);
  assert.ok(Math.abs(r.ozet.gasUsd - 0.15) < 1e-9);
  assert.ok(Math.abs(r.ozet.yatirilanUsd - 50) < 1e-9);
  // Toplam: BNB (0.1 - 0.01 + 0.008 - 0.0003 gas) * 500 + token 2$ - 50$ yatırılan
  assert.ok(Math.abs(r.ozet.netUsd - ((0.0977 * 500) + 2 - 50)) < 1e-9);
  // BNB fiyatı sabitken açıklanamayan fark olmamalı
  assert.ok(Math.abs(r.ozet.bnbFiyatEtkisiUsd) < 1e-9);
});

test('pnl: başka adrese gönderim kâr / zarar sayılmaz, maliyet düşer', () => {
  const islemler = defterOlustur([
    kayit('0x1', 1, 'swap', { send: [kalem(BNB_ADRES, 0.01)], receive: [kalem(TOK, 100)] }),
    kayit('0x2', 2, 'transfer', { send: [kalem(TOK, 100)] }),
  ]);
  const t = pnlHesapla({ islemler, bnbUsd: sabit(500), bnbSimdi: 500 }).varliklar[0];
  assert.equal(t.miktar, 0);
  assert.equal(t.gerceklesenUsd, 0);
  assert.ok(Math.abs(t.maliyetUsd) < 1e-9);
});

test('pnl: geçmiş BNB bakiyesi gerçekle tutmazsa uyarır, Binance ortalaması çok farklıysa uyarır', () => {
  const islemler = defterOlustur([kayit('0x1', 1, 'swap', { send: [kalem(BNB_ADRES, 0.01)], receive: [kalem(TOK, 100)] })]);
  const r = pnlHesapla({ islemler, bnbUsd: sabit(500), bnbSimdi: 500, bnbBakiyeGercek: 1, guncel: { [TOK]: { fiyat: 0.05, binanceOrtalama: 0.02 } } });
  assert.equal(r.uyarilar.length, 2);
});

test('seri: değer ve yatırılan zamanla birikir', () => {
  const islemler = defterOlustur([
    kayit('0x1', 1000, 'transfer', { receive: [kalem(BNB_ADRES, 1)] }),
    kayit('0x2', 2000, 'swap', { send: [kalem(BNB_ADRES, 0.5)], receive: [kalem(TOK, 10)] }),
  ]);
  const s = seriOlustur({ islemler, noktalar: [500, 1500, 2500], bnbUsd: sabit(100), fiyatAt: () => 10 });
  assert.deepEqual(s.map((x) => x.degerUsd), [0, 100, 150]);
  assert.deepEqual(s.map((x) => x.netUsd), [0, 0, 50]);
});

test('token numarası gelmeyen ama zincirde NFT olan kontrat NFT sayılır', () => {
  const NFT = '0x' + '7'.repeat(40);
  const islemler = [{ hash: '0x1', zaman: 1, tur: 'contract_call', gasBnb: 0.00001, bnbNet: 0, cikan: [], giren: [{ kontrat: NFT, sembol: 'GHOST', miktar: 1, tokenId: null }] }];
  const bnbUsd = () => 600;
  const tokenGibi = pnlHesapla({ islemler, bnbUsd, bnbSimdi: 600 }).varliklar.find((v) => v.kontrat === NFT);
  assert.equal(tokenGibi.tur, 'token');
  const nft = pnlHesapla({ islemler, bnbUsd, bnbSimdi: 600, nftKontratlari: new Set([NFT]) }).varliklar.find((v) => v.kontrat === NFT);
  assert.equal(nft.tur, 'nft');
  assert.equal(nft.fiyat, null);
});
