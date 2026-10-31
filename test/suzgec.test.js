import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suzgec } from '../src/suzgec.js';

const CUZDAN = '0x' + '1'.repeat(40);
const r = { adres: '0x' + 'a'.repeat(40), ad: 'Pixel Ghosts', sembol: 'PG' };
const tx = { veri: '0xa0712d68', degerWei: '0' };
function okxSahte(cevap = {}) {
  const cagrilar = [];
  const okx = async (args) => {
    cagrilar.push(args);
    const k = args[1];
    if (cevap[k] instanceof Error) throw cevap[k];
    return cevap[k] ?? (k === 'tx-scan' ? { action: '', riskItemDetail: [] } : k === 'dapp-scan' ? { isMalicious: false } : { tokens: [] });
  };
  return { okx, cagrilar };
}

test('temiz NFT mint: risk yok, sadece işlem taraması', async () => {
  const { okx, cagrilar } = okxSahte();
  const s = await suzgec({ r, cuzdan: CUZDAN, tx, okx });
  assert.deepEqual(s.riskler, []);
  assert.deepEqual(cagrilar.map((c) => c[1]), ['tx-scan']);
  assert.deepEqual(cagrilar[0].slice(2), ['--chain', 'bsc', '--from', CUZDAN, '--to', r.adres, '--data', tx.veri, '--value', '0']);
});

test('işlem taraması uyarısı, bal tuzağı, kara listedeki site, izin isteyen site kodu ve taklit adı engellenir', async () => {
  const { okx } = okxSahte({ 'tx-scan': { action: 'warn', riskItemDetail: [{ name: 'approve_anycall_contract' }] }, 'token-scan': { tokens: [{ isHoneypot: true, riskLevel: 'HIGH' }] }, 'dapp-scan': { isMalicious: true } });
  const s = await suzgec({ r: { ...r, ad: 'Binance Pass', tur: 'token', token: '0x' + 'b'.repeat(40) }, veri: { site: 'https://x.xyz', jsMetni: 'await nft.setApprovalForAll(op, true)' }, cuzdan: CUZDAN, tx, okx });
  assert.equal(s.riskler.length, 5);
  assert.match(s.riskler.join(' | '), /Taklit.*approve_anycall_contract.*bal tuzağı.*kara listesinde.*setApprovalForAll/);
});

test('orta risk ve OKX kesintisi engel değil, not düşülür', async () => {
  const { okx } = okxSahte({ 'tx-scan': new Error('timeout'), 'token-scan': { tokens: [{ isHoneypot: false, riskLevel: 'MEDIUM', isLowLiquidity: true, sellTaxes: '0' }] } });
  const s = await suzgec({ r: { ...r, tur: 'token', token: '0x' + 'b'.repeat(40) }, cuzdan: CUZDAN, tx, okx });
  assert.deepEqual(s.riskler, []);
  assert.match(s.notlar.join(' | '), /işlem taraması yapılamadı.*MEDIUM, düşük likidite/);
  const v = await suzgec({ r: { ...r, tur: 'token', token: '0x' + 'b'.repeat(40) }, cuzdan: CUZDAN, tx, okx: okxSahte({ 'token-scan': { tokens: [{ sellTaxes: '25' }] } }).okx });
  assert.deepEqual(v.riskler, ['Token vergisi %25']);
});
