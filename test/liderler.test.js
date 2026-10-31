import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiderServisi, satirCevir } from '../src/liderler.js';

const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), C = '0x' + 'c'.repeat(40);
const ham = (adres, pnl) => ({ walletAddress: adres, realizedPnlUsd: String(pnl), realizedPnlPercent: '10', winRatePercent: '50', txs: '3', txVolume: '100', lastActiveTimestamp: '1', topPnlTokenList: [] });

function sahte({ listeler, degerler, cagrilar = [] }) {
  return async (args) => {
    cagrilar.push(args);
    if (args[0] === 'leaderboard') return listeler[args[args.indexOf('--sort-by') + 1]] || [];
    if (args[0] === 'portfolio') {
      const a = args[args.indexOf('--address') + 1];
      if (degerler[a] instanceof Error) throw degerler[a];
      return [{ totalValue: String(degerler[a]) }];
    }
    return [];
  };
}

test('OKX satırı çevrilir, geçersiz adres atılır', async () => {
  const r = satirCevir(ham(A.toUpperCase().replace('0X', '0x'), '12.5'));
  assert.equal(r.adres, A);
  assert.equal(r.kazancUsd, 12.5);
  const s = new LiderServisi({ calistir: sahte({ listeler: { 1: [ham(A, 5), ham('kotu', 9)] }, degerler: { [A]: 1 } }) });
  const d = await s.liste({ siralama: 'kazanc' });
  assert.deepEqual(d.satirlar.map((x) => x.adres), [A]);
  assert.equal(d.satirlar[0].sira, 1);
});

test('en zengin: kazanç ve hacim listeleri birleşir, değere göre sıralanır', async () => {
  const s = new LiderServisi({ calistir: sahte({ listeler: { 1: [ham(A, 5), ham(B, 4)], 4: [ham(B, 4), ham(C, 1)] }, degerler: { [A]: 10, [B]: 300, [C]: 50 } }) });
  const d = await s.liste({ siralama: 'servet' });
  assert.deepEqual(d.satirlar.map((x) => [x.adres, x.degerUsd]), [[B, 300], [C, 50], [A, 10]]);
});

test('geçersiz seçimler reddedilir ve CLI çağrılmaz', async () => {
  const cagrilar = [];
  const s = new LiderServisi({ calistir: sahte({ listeler: {}, degerler: {}, cagrilar }) });
  await assert.rejects(s.liste({ sure: '5y' }), /süre/);
  await assert.rejects(s.liste({ siralama: 'x' }), /sıralama/);
  await assert.rejects(s.liste({ tur: '--chain' }), /tür/);
  await assert.rejects(s.cuzdan('0x12'), /adres/);
  assert.equal(cagrilar.length, 0);
});

test('liste önbellekten gelir, alınamayan değer null kalır', async () => {
  const cagrilar = [];
  const s = new LiderServisi({ calistir: sahte({ listeler: { 1: [ham(A, 5)], 4: [] }, degerler: { [A]: new Error('zaman aşımı') }, cagrilar }) });
  const d = await s.liste({ siralama: 'servet' });
  assert.equal(d.satirlar[0].degerUsd, null);
  await s.liste({ siralama: 'servet' });
  assert.equal(cagrilar.filter((c) => c[0] === 'leaderboard').length, 2);
});
