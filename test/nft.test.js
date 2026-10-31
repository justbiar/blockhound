import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nftAdaylari, nftDogrula, stringCoz } from '../src/nft.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const BASKA = '0x000000000000000000000000000000000000dEaD';
const K1 = '0x720e3bDc318529399135a71E80F23ab5F4262e92';
const K2 = '0x1ae3f37769f465606735eb52893e1afd80ee1a52';

const islem = (zaman, tur, kayitlar, status = 'confirmed') => ({
  txTime: zaman, status, txType: 'mint', txHash: '0x' + zaman.length.toString(16).padStart(64, '0'),
  txHashList: [{ txHash: '0xaa', instructions: { receive: [], send: [], [tur]: kayitlar } }],
});
const kayit = (kontrat, tokenId, adres = BEN, sembol = 'NGRDN') => ({ addressInfo: { address: adres }, tokenInfo: { contractAddress: kontrat, tokenId, symbol: sembol } });

test('geçmişten NFT adayları: alınan eklenir, gönderilen düşer, onaysız ve ERC20 yok sayılır', () => {
  const a = nftAdaylari([
    islem('2026-10-28T20:00:00Z', 'receive', [kayit(K1, '794'), kayit(K2, '1', BEN, 'ZOD'), kayit(K2, '2', BEN, 'ZOD')]),
    islem('2026-10-28T21:00:00Z', 'send', [kayit(K2, '2', BASKA, 'ZOD')]),
    islem('2026-10-28T22:00:00Z', 'receive', [kayit(K1, '5')], 'pending'),
    islem('2026-10-28T22:00:00Z', 'receive', [{ addressInfo: { address: BEN }, tokenInfo: { contractAddress: K1, symbol: 'X' } }]),
    islem('2026-10-28T22:00:00Z', 'receive', [kayit(K1, '9', BASKA)]),
  ], BEN);
  assert.deepEqual(a.map((x) => `${x.sembol}#${x.tokenId}`).sort(), ['NGRDN#794', 'ZOD#1']);
});

const strHex = (s) => '0x' + (32).toString(16).padStart(64, '0') + s.length.toString(16).padStart(64, '0') + Buffer.from(s).toString('hex').padEnd(64, '0');
const adrHex = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');

test('sahiplik doğrulama: devredilen düşer, doğrulanamayan işaretlenir, koleksiyona gruplanır', async () => {
  const adaylar = [
    { kontrat: K1, tokenId: '794', sembol: 'NGRDN', zaman: '2026-10-28T20:00:00Z' },
    { kontrat: K2, tokenId: '1', sembol: 'ZOD', zaman: '2026-10-28T20:00:00Z' },
    { kontrat: K2, tokenId: '2', sembol: 'ZOD', zaman: '2026-10-28T20:00:00Z' },
    { kontrat: K2, tokenId: '3', sembol: 'ZOD', zaman: '2026-10-28T20:00:00Z' },
  ];
  const cagir = async (c) => (c[0].data.startsWith('0x6352211e')
    ? [{ result: adrHex(BEN) }, { result: adrHex(BEN) }, { result: adrHex(BASKA) }, { error: { message: 'revert' } }]
    : c[0].data.startsWith('0x70a08231')
      ? [{ result: adrHex('0x' + '0'.repeat(39) + '1') }, { result: adrHex('0x' + '0'.repeat(39) + '3') }]
      : [{ result: strHex('Neural Garden') }, { result: '0x' }]);
  const k = await nftDogrula(adaylar, BEN, cagir);
  assert.equal(k.length, 2);
  assert.equal(k[0].ad, 'Neural Garden');
  assert.equal(k[1].ad, 'ZOD');
  assert.deepEqual(k.map((x) => x.adet), [1, 3]);
  assert.deepEqual(k[1].tokenler.map((t) => [t.tokenId, t.dogrulandi]), [['1', true], ['3', false]]);
});

test('string çözümü', () => {
  assert.equal(stringCoz(strHex('Agent Apes')), 'Agent Apes');
  assert.equal(stringCoz('0x'), null);
});
