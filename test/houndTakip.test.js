import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, id, toQuantity, parseUnits, parseEther, zeroPadValue } from 'ethers';
import { HoundTakip, HOUND_KONTRATLAR } from '../src/houndTakip.js';

const abi = AbiCoder.defaultAbiCoder();
const konu = (a) => zeroPadValue(a, 32);
const u256 = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const SIFIR = '0x0000000000000000000000000000000000000000';
const A = '0x00000000000000000000000000000000000000aA', B = '0x00000000000000000000000000000000000000bB';
const H = HOUND_KONTRATLAR.hound.adres, N = HOUND_KONTRATLAR.blockhound.adres;
const transfer = (adres, kimden, kime, deger, blok, nft = false) => ({
  address: adres, blockNumber: toQuantity(blok), transactionHash: '0x' + blok.toString(16).padStart(64, '0'),
  topics: [id('Transfer(address,address,uint256)'), konu(kimden), konu(kime), ...(nft ? [u256(deger)] : [])],
  data: nft ? '0x' : abi.encode(['uint256'], [deger]),
});
const mined = (adres, madenci, sira, ucret, blok) => ({
  address: adres, blockNumber: toQuantity(blok), transactionHash: '0x' + (blok * 7).toString(16).padStart(64, '0'),
  topics: [id('Mined(address,uint256,uint256,uint256,uint256)'), konu(madenci), u256(sira)],
  data: abi.encode(['uint256', 'uint256', 'uint256'], [123n, 20n, ucret]),
});

test('olaylardan sahip, madenci ve gelir hesaplanır; aralık reddedilirse parça küçülür', async () => {
  const loglar = [
    mined(H, A, 0, parseEther('0.0007'), 105), transfer(H, SIFIR, A, parseUnits('10000', 18), 105),
    mined(H, A, 1, parseEther('0.0007'), 106), transfer(H, SIFIR, A, parseUnits('10000', 18), 106),
    transfer(H, A, B, parseUnits('5000', 18), 110),
    mined(N, B, 0, parseEther('0.00014'), 120), transfer(N, SIFIR, B, 1n, 120, true),
    transfer(N, B, A, 1n, 130, true),
  ];
  const istenen = [];
  const provider = {
    getBlockNumber: async () => 140,
    send: async (_m, [f]) => {
      const bas = Number(f.fromBlock), son = Number(f.toBlock);
      istenen.push(son - bas + 1);
      if (son - bas + 1 > 20) throw new Error('aralık çok büyük');
      return loglar.filter((l) => Number(l.blockNumber) >= bas && Number(l.blockNumber) <= son);
    },
    call: async () => { throw new Error('revert'); },
    getBalance: async () => 0n,
    getBlock: async (b) => ({ timestamp: Math.floor(Date.now() / 1000) - (140 - b) }),
  };
  const t = new HoundTakip({ provider, kurulumBlogu: 100, parca: 80, enKucukParca: 10 });
  const o = await t.ozet();
  assert.ok(istenen[0] > 20 && istenen.at(-1) <= 20, 'parça küçülmeli');
  assert.equal(o.sonBlok, 140);
  assert.equal(o.hound.sahipSayisi, 2);
  assert.deepEqual(o.hound.enBuyukSahipler.map((s) => [s.adres.toLowerCase(), s.miktar]), [[A.toLowerCase(), 15000], [B.toLowerCase(), 5000]]);
  assert.equal(o.hound.madenciSayisi, 1);
  assert.equal(o.hound.madenciler[0].mint, 2);
  assert.ok(Math.abs(o.hound.gelirBnb - 0.0014) < 1e-12);
  assert.equal(o.hound.son24, 2);
  assert.equal(o.blockhound.sahipSayisi, 1);
  assert.equal(o.blockhound.enBuyukSahipler[0].adres.toLowerCase(), A.toLowerCase());
  assert.equal(o.blockhound.madenciler[0].adres.toLowerCase(), B.toLowerCase());
  // İkinci turda yalnızca yeni bloklar okunur ve olaylar iki kez sayılmaz
  istenen.length = 0;
  const o2 = await t.ozet();
  assert.equal(istenen.length, 0);
  assert.equal(o2.hound.madenciler[0].mint, 2);
});
