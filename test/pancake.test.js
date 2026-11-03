import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, zeroPadValue, id } from 'ethers';
import { v3Fiyat, v2Fiyat, enAzCikti, swapTx, makbuzTutari, PANCAKE, WBNB, V2_ROUTER, V3_ROUTER } from '../src/pancake.js';

const TOKEN = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const CUZDAN = '0x1048f7864CA99A68779DAfa70e3a34D86949BB60';

test('v3Fiyat: token0 ve token1 tarafı, ondalık farkı', () => {
  // sqrtPriceX96 = 2^96 → ham fiyat 1 (token1/token0)
  const s = 2n ** 96n;
  assert.equal(v3Fiyat({ sqrtPriceX96: s, tokenSifirMi: true, ondalikToken: 18, ondalikKarsi: 18 }), 1);
  // ham fiyat 4: token0'ın fiyatı 4, token1'in fiyatı 0,25
  const s2 = 2n ** 97n;
  assert.equal(v3Fiyat({ sqrtPriceX96: s2, tokenSifirMi: true, ondalikToken: 18, ondalikKarsi: 18 }), 4);
  assert.equal(v3Fiyat({ sqrtPriceX96: s2, tokenSifirMi: false, ondalikToken: 18, ondalikKarsi: 18 }), 0.25);
  // 6 ondalıklı token, 18 ondalıklı karşı: ham 1 → 1e-12
  assert.ok(Math.abs(v3Fiyat({ sqrtPriceX96: s, tokenSifirMi: true, ondalikToken: 6, ondalikKarsi: 18 }) - 1e-12) < 1e-24);
  assert.equal(v3Fiyat({ sqrtPriceX96: 0n, tokenSifirMi: true, ondalikToken: 18, ondalikKarsi: 18 }), null);
});

test('v2Fiyat: rezerv oranı ve karşı taraf miktarı', () => {
  const r = v2Fiyat({ rezervToken: 1000n * 10n ** 18n, rezervKarsi: 2n * 10n ** 18n, ondalikToken: 18, ondalikKarsi: 18 });
  assert.equal(r.fiyat, 0.002);
  assert.equal(r.karsiMiktar, 2);
  assert.equal(v2Fiyat({ rezervToken: 0n, rezervKarsi: 1n, ondalikToken: 18, ondalikKarsi: 18 }).fiyat, null);
});

test('enAzCikti: kayma düşer, %0-50 arasına sıkışır', () => {
  assert.equal(enAzCikti(10_000n, 5), 9_500n);
  assert.equal(enAzCikti(10_000n, 0), 10_000n);
  assert.equal(enAzCikti(10_000n, 90), 5_000n);
  assert.equal(enAzCikti(10_000n, 'abc'), 10_000n);
});

test('swapTx V2 alım: BNB değeri, en az çıktı, yol ve alıcı', () => {
  const tx = swapTx({ rota: { surum: 'v2', yol: [WBNB, TOKEN] }, yon: 'al', token: TOKEN, girdi: 10n ** 15n, enAz: 123n, alici: CUZDAN, sonTarih: 999n });
  assert.equal(tx.to, PANCAKE.v2Router);
  assert.equal(tx.value, String(10n ** 15n));
  const d = V2_ROUTER.decodeFunctionData('swapExactETHForTokensSupportingFeeOnTransferTokens', tx.inputData);
  assert.equal(d[0], 123n);
  assert.deepEqual([...d[1]], [WBNB, TOKEN]);
  assert.equal(d[2], CUZDAN);
  assert.equal(d[3], 999n);
});

test('swapTx V2 satış: değer 0, girdi token miktarı', () => {
  const tx = swapTx({ rota: { surum: 'v2', yol: [TOKEN, WBNB] }, yon: 'sat', token: TOKEN, girdi: 5n, enAz: 1n, alici: CUZDAN, sonTarih: 1n });
  assert.equal(tx.value, '0');
  const d = V2_ROUTER.decodeFunctionData('swapExactTokensForETHSupportingFeeOnTransferTokens', tx.inputData);
  assert.equal(d[0], 5n);
  assert.equal(d[3], CUZDAN);
});

test('swapTx V3 alım: exactInputSingle, cüzdana gelir', () => {
  const tx = swapTx({ rota: { surum: 'v3', ucret: 2500, yol: [WBNB, TOKEN] }, yon: 'al', token: TOKEN, girdi: 7n, enAz: 3n, alici: CUZDAN, sonTarih: 9n });
  assert.equal(tx.to, PANCAKE.v3Router);
  assert.equal(tx.value, '7');
  const [p] = V3_ROUTER.decodeFunctionData('exactInputSingle', tx.inputData);
  assert.equal(p.tokenIn, WBNB);
  assert.equal(p.tokenOut, TOKEN);
  assert.equal(p.fee, 2500n);
  assert.equal(p.recipient, CUZDAN);
  assert.equal(p.amountOutMinimum, 3n);
});

test('swapTx V3 satış: router\'a WBNB, aynı işlemde BNB olarak cüzdana', () => {
  const tx = swapTx({ rota: { surum: 'v3', ucret: 500, yol: [TOKEN, WBNB] }, yon: 'sat', token: TOKEN, girdi: 10n, enAz: 4n, alici: CUZDAN, sonTarih: 9n });
  assert.equal(tx.value, '0');
  const [adimlar] = V3_ROUTER.decodeFunctionData('multicall', tx.inputData);
  assert.equal(adimlar.length, 2);
  const [p] = V3_ROUTER.decodeFunctionData('exactInputSingle', adimlar[0]);
  assert.equal(p.recipient, PANCAKE.v3Router);
  assert.equal(p.tokenOut, WBNB);
  const u = V3_ROUTER.decodeFunctionData('unwrapWETH9', adimlar[1]);
  assert.equal(u[0], 4n);
  assert.equal(u[1], CUZDAN);
});

test('makbuzTutari: alımda cüzdana gelen token, satışta çözülen WBNB', () => {
  const kod = AbiCoder.defaultAbiCoder();
  const transfer = (kime, miktar, adres = TOKEN) => ({ address: adres, topics: [id('Transfer(address,address,uint256)'), zeroPadValue(PANCAKE.v2Router, 32), zeroPadValue(kime, 32)], data: kod.encode(['uint256'], [miktar]) });
  const makbuz = { logs: [transfer(CUZDAN, 15n * 10n ** 17n), transfer(PANCAKE.v2Router, 99n)] };
  assert.equal(makbuzTutari(makbuz, { yon: 'al', token: TOKEN, cuzdan: CUZDAN, ondalik: 18 }), '1.5');
  const cekim = { address: WBNB, topics: [id('Withdrawal(address,uint256)'), zeroPadValue(PANCAKE.v2Router, 32)], data: kod.encode(['uint256'], [2n * 10n ** 16n]) };
  assert.equal(makbuzTutari({ logs: [cekim] }, { yon: 'sat', token: TOKEN, cuzdan: CUZDAN, ondalik: 18 }), '0.02');
  assert.equal(makbuzTutari({ logs: [] }, { yon: 'al', token: TOKEN, cuzdan: CUZDAN, ondalik: 18 }), null);
});
