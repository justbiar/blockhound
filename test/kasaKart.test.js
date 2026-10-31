import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface, parseEther, AbiCoder, id } from 'ethers';
import { kasaAnaliz } from '../src/kasaKart.js';

const abi = AbiCoder.defaultAbiCoder();
const KASA = '0x' + 'a'.repeat(40), TOKEN = '0x' + 'b'.repeat(40), CUZDAN = '0x' + 'c'.repeat(40);
const sel = (s) => id(s).slice(0, 10);
const u = (v) => abi.encode(['uint256'], [v]);

function sahte({ mintSiniri = 7, enIyiTeklif = parseEther('0.0026'), ilanFiyat = parseEther('0.0013') } = {}) {
  const yanit = {
    [sel('mintPrice()')]: u(parseEther('0.002')), [sel('totalTaxReceived()')]: u(parseEther('40')), [sel('totalDividendPaid()')]: u(parseEther('20')),
    [sel('undistributedTax()')]: u(parseEther('5')), [sel('totalWeight()')]: u(20000n), [sel('userMints()')]: u(30000n),
    [sel('projectToken()')]: abi.encode(['address'], [TOKEN]), [sel('mintsUsed(address)')]: u(2n), [sel('batchOpenedAt()')]: u(1700000000n),
    [sel('owner()')]: abi.encode(['address'], [CUZDAN]), [sel('nextBidId()')]: u(3n),
  };
  const li = new Interface(['function getActiveListings(uint256,uint256) view returns (uint256[], (address,uint256)[], uint256)']);
  return {
    getCode: async () => '0x6080',
    call: async ({ to, data, value = 0n }) => {
      const s = data.slice(0, 10);
      const tokenMu = String(to).toLowerCase() === TOKEN;
      if (tokenMu && s === sel('sellTaxRate()')) return u(200n);
      if (tokenMu) throw new Error('revert');
      if (s === sel('mint(uint256)')) {
        const n = BigInt('0x' + data.slice(10));
        if (n > BigInt(mintSiniri) || BigInt(value) !== parseEther('0.002') * n) throw new Error('revert');
        return '0x';
      }
      if (s === sel('bids(uint256)')) {
        const bid = Number(BigInt('0x' + data.slice(10)));
        return bid === 1 ? abi.encode(['uint256', 'uint256', 'uint256', 'uint256'], [1n, enIyiTeklif, 10n, 1n]) : abi.encode(['uint256', 'uint256', 'uint256', 'uint256'], [1n, parseEther('0.001'), 5n, 5n]);
      }
      if (s === sel('getActiveListings(uint256,uint256)')) {
        const imlec = BigInt('0x' + data.slice(10, 74));
        if (imlec !== 0n) return li.encodeFunctionResult('getActiveListings', [[], [], imlec]);
        return li.encodeFunctionResult('getActiveListings', [[1n, 2n], [[CUZDAN, ilanFiyat], [CUZDAN, parseEther('0.01')]], 99n]);
      }
      if (yanit[s]) return yanit[s];
      throw new Error('revert');
    },
  };
}

test('kasa analizi: sınır, pazar, temettü ve geri ödeme', async () => {
  const d = await kasaAnaliz({ provider: sahte(), adres: KASA, cuzdan: CUZDAN, bnbUsd: 600, tokenPiyasa: async () => ({ hacim24sUsd: 1_200_000, likiditeUsd: 50_000 }) });
  assert.equal(d.mintBnb, 0.002);
  assert.equal(d.cuzdanSiniri, 7);
  assert.equal(d.kullanilan, 2);
  assert.equal(d.vergiOraniBps, 200);
  assert.equal(d.temettuPayi, 0.5);
  assert.equal(d.pazar.enIyiTeklif, 0.0026);
  assert.equal(d.pazar.teklifAdedi, 9); // dolmuş teklif (5/5) sayılmaz
  assert.equal(d.pazar.enUcuzIlan, 0.0013);
  assert.ok(Math.abs(d.hesap.hemenSatKarBnb - 0.0006) < 1e-12);
  assert.ok(Math.abs(d.hesap.ilanlaSatKarBnb + 0.0007) < 1e-12);
  assert.equal(d.hesap.teklifKosulluOlabilir, true);
  // 1.2M $ × %2 × %50 / 20000 kart / 600 $ = 0.001 BNB/gün; en ucuz yoldan (0.0013) 1.3 günde çıkar
  assert.ok(Math.abs(d.hesap.gunlukTemettuKartBasiBnb - 0.001) < 1e-12);
  assert.ok(Math.abs(d.hesap.geriOdemeGun - 1.3) < 1e-9);
  assert.equal(d.riskler.length, 0);
});

test('düşük likidite risk olarak yazılır, hacim yoksa temettü tahmini yapılmaz', async () => {
  const d = await kasaAnaliz({ provider: sahte({ mintSiniri: 3 }), adres: KASA, cuzdan: CUZDAN, bnbUsd: 600, tokenPiyasa: async () => ({ hacim24sUsd: null, likiditeUsd: 5000 }) });
  assert.equal(d.cuzdanSiniri, 3);
  assert.equal(d.hesap.gunlukTemettuKartBasiBnb, null);
  assert.match(d.riskler.join(' '), /likiditesi düşük/);
});
