import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewIncele } from '../src/guard.js';
import { onayDogrula, FOUR_CORE } from '../src/fourAgent.js';
import { maliyetHesapla, portfoyOlustur } from '../src/portfoy.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const TK = '0x245238289e2d1c08664f26263946ed6b862f4444';
const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');

test('onay: Binance preview formatı (postAmount) ile tam miktar kabul, fazlası red', () => {
  const pre = (post, spender = FOUR_CORE, token = TK) => ({
    requestId: 'r', risks: {},
    simulationResult: { simulationCode: '000000000', allowanceChanges: [{ tokenAddress: token, spender, preAmount: 0, postAmount: post }] },
  });
  const izin = { token: TK, spender: FOUR_CORE, maxMiktar: 1e21 };
  assert.equal(previewIncele(pre(1e21), { cuzdan: BEN, izinliOnay: izin }).ok, true);
  assert.equal(previewIncele(pre(2e21), { cuzdan: BEN, izinliOnay: izin }).ok, false);
  assert.equal(previewIncele(pre(1e21, '0x000000000000000000000000000000000000dead'), { cuzdan: BEN, izinliOnay: izin }).ok, false);
  assert.equal(previewIncele(pre(1e21, FOUR_CORE, '0x55d398326f99059fF775485246999027B3197955'), { cuzdan: BEN, izinliOnay: izin }).ok, false);
  assert.equal(previewIncele(pre(1.157920892373162e77), { cuzdan: BEN, izinliOnay: izin }).ok, false);
});

test('onay calldata: sadece Four Core ve tam miktar', () => {
  const miktarRaw = '1000000000000000000000';
  const iyi = { from: BEN, to: TK, value: '0', inputData: `0x095ea7b3${pad(FOUR_CORE)}${pad(BigInt(miktarRaw).toString(16))}` };
  assert.doesNotThrow(() => onayDogrula(iyi, { token: TK, cuzdan: BEN, miktarRaw }));
  const sinirsiz = { ...iyi, inputData: `0x095ea7b3${pad(FOUR_CORE)}${'f'.repeat(64)}` };
  assert.throws(() => onayDogrula(sinirsiz, { token: TK, cuzdan: BEN, miktarRaw }), /tam satış/);
  const baskaSpender = { ...iyi, inputData: `0x095ea7b3${pad('0x000000000000000000000000000000000000dEaD')}${pad(BigInt(miktarRaw).toString(16))}` };
  assert.throws(() => onayDogrula(baskaSpender, { token: TK, cuzdan: BEN, miktarRaw }));
  assert.throws(() => onayDogrula({ ...iyi, to: FOUR_CORE }, { token: TK, cuzdan: BEN, miktarRaw }), /başka bir tokene/);
});

test('maliyet: sadece canlı ve tamamlanan emirler sayılır', () => {
  const m = maliyetHesapla([
    { id: 1, canli: true, durum: 'tamamlandi', yon: 'al', token: TK, miktar: '0.01', odenenBnb: '0.0099', alinan: '1000' },
    { id: 2, canli: true, durum: 'tamamlandi', yon: 'sat', token: TK, miktar: '500', gelenBnb: '0.008' },
    { id: 3, canli: false, durum: 'simulasyon', yon: 'al', token: TK, miktar: '1' },
    { id: 4, canli: true, durum: 'basarisiz', yon: 'al', token: TK, miktar: '1' },
    { id: 5, canli: true, durum: 'tamamlandi', yon: 'onay', rota: 'onay', token: TK, miktar: '500' },
  ]).get(TK);
  assert.equal(m.harcananBnb, 0.0099);
  assert.equal(m.gelenBnb, 0.008);
  assert.equal(m.islem, 2);
});

test('portföy: kâr / zarar BNB cinsinden hesaplanır', () => {
  const [p] = portfoyOlustur({
    bakiye: [{ address: TK, symbol: 'meme', balance: '500' }],
    emirler: [{ id: 1, canli: true, durum: 'tamamlandi', yon: 'al', token: TK, miktar: '0.01', odenenBnb: '0.01' }],
    fiyatlar: { [TK]: 0.000015 }, bnbUsd: 750,
  });
  assert.ok(Math.abs(p.degerUsd - 0.0075) < 1e-12);
  assert.ok(Math.abs(p.karZararBnb - (0.00001 - 0.01)) < 1e-12);
});
