import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, solidityPacked, randomBytes, hexlify } from 'ethers';
import { hazirla, dene, nonceOlustur, hashle } from '../site/hound/madenci.js';
import { nftSvg } from '../site/hound/gorsel.js';

const CH = '0x' + 'ab'.repeat(32);
const AD = '0x00000000000000000000000000000000B10c4040';
const resmi = (ch, ad, n) => keccak256(solidityPacked(['bytes32', 'address', 'uint256'], [ch, ad, BigInt(n)]));

test('madenci hash\'i Solidity keccak256(abi.encodePacked) ile aynı', () => {
  for (const n of [0n, 1n, 123456789n, 2n ** 255n + 7n]) assert.equal(hashle(CH, AD, n), resmi(CH, AD, n));
  for (let i = 0; i < 20; i++) {
    const ch = hexlify(randomBytes(32)), ad = hexlify(randomBytes(20)), n = BigInt(hexlify(randomBytes(32)));
    assert.equal(hashle(ch, ad, n), resmi(ch, ad, n));
  }
});

test('bulunan nonce istenen zorluğu sağlar', () => {
  const h = hazirla(CH, AD, randomBytes(28));
  for (const bits of [1, 8, 12, 16]) {
    const sayac = dene(h, 0, 1e7, bits);
    assert.ok(sayac >= 0);
    const d = BigInt(resmi(CH, AD, nonceOlustur(h, sayac)));
    assert.ok(d <= (2n ** 256n - 1n) >> BigInt(bits), `${bits} bit`);
  }
});

test('NFT görseli hash\'in son baytlarından türer', () => {
  const a = nftSvg('0x' + '00'.repeat(28) + '0102016d', '#1');
  assert.match(a, /hsl\(5,28%,9%\)/); // 0x016d = 365, 365 % 360 = 5
  // bayt 29 = 0x02, 2 % 3 + 1 = 3 blok; göz ve burunla birlikte 5 konumlu dikdörtgen
  assert.equal((a.match(/<rect x="/g) || []).length, 5);
});
