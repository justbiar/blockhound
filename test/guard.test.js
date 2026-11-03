import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewIncele, limitKontrol, adresKontrol, miktarKontrol } from '../src/guard.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const temiz = () => ({
  requestId: 'r1',
  simulationResult: { simulationCode: '000000000', balanceChanges: [{ owner: BEN.toLowerCase(), change: 1, tokenType: 'Erc721', contractAddress: '0xabc' }], allowanceChanges: [], authorityChanges: [] },
  risks: { riskDetails: [], addresses: {}, riskBehaviors: [] },
});

test('temiz preview geçer', () => {
  assert.deepEqual(previewIncele(temiz(), { cuzdan: BEN }), { ok: true, sebepler: [] });
});

test('requestId yoksa reddedilir', () => {
  const p = temiz(); delete p.requestId;
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
});

test('başarısız simülasyon reddedilir', () => {
  const p = temiz(); p.simulationResult.simulationCode = '351805';
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
});

test('risk uyarısı (CAUTION dahil) reddedilir', () => {
  const p = temiz(); p.risks.riskDetails.push({ code: 'X', title: 'Dikkat', riskType: 'CAUTION' });
  const r = previewIncele(p, { cuzdan: BEN });
  assert.equal(r.ok, false);
  assert.match(r.sebepler[0], /Dikkat/);
});

test('riskli adres reddedilir', () => {
  const p = temiz(); p.risks.addresses['0xdead'] = { riskLevel: 5, riskDetails: [] };
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
});

test('yetki değişikliği reddedilir', () => {
  const p = temiz(); p.simulationResult.authorityChanges.push({ type: 'owner' });
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
});

test('onay sadece izinli spender ve limit içindeyse kabul edilir', () => {
  const p = temiz(); p.simulationResult.allowanceChanges.push({ spender: '0xRouter', change: 100 });
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
  assert.equal(previewIncele(p, { cuzdan: BEN, izinliOnay: { spender: '0xrouter', maxMiktar: 100 } }).ok, true);
  assert.equal(previewIncele(p, { cuzdan: BEN, izinliOnay: { spender: '0xrouter', maxMiktar: 99 } }).ok, false);
  assert.equal(previewIncele(p, { cuzdan: BEN, izinliOnay: { spender: '0xbaska', maxMiktar: 1e30 } }).ok, false);
});

test('cüzdandan token çıkışı reddedilir', () => {
  const p = temiz(); p.simulationResult.balanceChanges.push({ owner: BEN.toLowerCase(), change: -5, tokenType: 'Erc20', contractAddress: '0xusdt' });
  assert.equal(previewIncele(p, { cuzdan: BEN }).ok, false);
});

test('limitler', () => {
  const l = { islemBasiMax: 0.05, gunlukMax: 0.2 };
  assert.equal(limitKontrol({ ...l, bnb: 0.05, bugunHarcanan: 0 }).ok, true);
  assert.equal(limitKontrol({ ...l, bnb: 0.06, bugunHarcanan: 0 }).ok, false);
  assert.equal(limitKontrol({ ...l, bnb: 0.05, bugunHarcanan: 0.16 }).ok, false);
  assert.equal(limitKontrol({ ...l, bnb: 0.05, bugunHarcanan: 0.15 }).ok, true);
  assert.equal(limitKontrol({ ...l, bnb: 0, bugunHarcanan: 0 }).ok, false);
  assert.equal(limitKontrol({ islemBasiMax: 0, gunlukMax: 0.2, bnb: 0.01, bugunHarcanan: 0 }).ok, false);
});

test('adres ve miktar doğrulama', () => {
  assert.equal(adresKontrol(BEN), BEN);
  assert.throws(() => adresKontrol('0x123'));
  assert.throws(() => adresKontrol('0x00000000000000000000000000000000B10c4040; rm -rf /'));
  assert.equal(miktarKontrol('0.01'), '0.01');
  for (const k of ['', '-1', '0', '1e5', 'abc', '--fromToken']) assert.throws(() => miktarKontrol(k), new RegExp(''), k);
});

test('satışta izinli çıkış: yalnızca o token, en fazla o miktar', () => {
  const TOKEN = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
  const satis = (change, adres = TOKEN, tur = 'Erc20') => {
    const p = temiz();
    p.simulationResult.balanceChanges = [{ owner: BEN.toLowerCase(), change, tokenType: tur, contractAddress: adres }, { owner: BEN.toLowerCase(), change: 1e15, tokenType: 'Native' }];
    return p;
  };
  const izin = { token: TOKEN, maxMiktar: 1e21 };
  assert.equal(previewIncele(satis(-1e21), { cuzdan: BEN }).ok, false);
  assert.equal(previewIncele(satis(-1e21), { cuzdan: BEN, izinliCikis: izin }).ok, true);
  assert.equal(previewIncele(satis(-2e21), { cuzdan: BEN, izinliCikis: izin }).ok, false);
  assert.equal(previewIncele(satis(-1e21, '0x55d398326f99059fF775485246999027B3197955'), { cuzdan: BEN, izinliCikis: izin }).ok, false);
  assert.equal(previewIncele(satis(-1, TOKEN, 'Erc721'), { cuzdan: BEN, izinliCikis: izin }).ok, false);
});
