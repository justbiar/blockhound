import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id, parseEther, AbiCoder } from 'ethers';
import { MintTakip, siniflandir, revertSebebi, AGENT_ID_REGISTRY } from '../src/mintTakip.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const NFT = '0x2DC57B951A42B7D86449cD7928DcbaB67867A780';
const sel = (imza) => id(imza).slice(2, 10);
const abi = AbiCoder.defaultAbiCoder();

// Bytecode taklidi: her seçici PUSH4 (0x63) ile gömülür
const kodYap = (imzalar, ek = '') => '0x' + imzalar.map((s) => '63' + sel(s)).join('') + ek;

function revert(mesaj) {
  const e = new Error(`execution reverted: "${mesaj}"`);
  e.reason = mesaj;
  return e;
}

// mintler: { 'mint(uint256)': (value) => true | 'revert sebebi' }
function sahteProvider({ kod, mintler = {}, okumalar = {}, erc721 = true, bloklar = {}, makbuzlar = {}, tepe = 100 }) {
  const cagrilar = [];
  return {
    cagrilar,
    getCode: async () => kod,
    getBlockNumber: async () => tepe,
    send: async (yontem, p) => (yontem === 'eth_getBlockByNumber' ? bloklar[Number(p[0])] ?? { transactions: [] } : makbuzlar[p[0]]),
    call: async ({ data, value = 0n, from }) => {
      cagrilar.push({ data, value, from });
      const s = data.slice(2, 10);
      if (s === '01ffc9a7') return abi.encode(['bool'], [erc721 && data.includes('80ac58cd')]);
      for (const [imza, fn] of Object.entries(mintler)) if (sel(imza) === s) {
        const sonuc = fn(BigInt(value));
        if (sonuc === true) return '0x';
        throw revert(sonuc);
      }
      for (const [imza, v] of Object.entries(okumalar)) if (sel(imza) === s) return v;
      throw revert('');
    },
  };
}

const takip = (provider, ek = {}) => new MintTakip({ provider, cuzdanAdresi: async () => BEN, bildir: null, ...ek });

test('revert sebebi sınıflandırılır', () => {
  assert.equal(siniflandir('agent entries sold out'), 'tukendi');
  assert.equal(siniflandir('Mint not started'), 'acilmadi');
  assert.equal(siniflandir('wrong free fee'), 'ucretli');
  assert.equal(siniflandir('already claimed'), 'zaten-aldin');
  assert.equal(revertSebebi(revert('paused')), 'paused');
});

test('0 BNB ile geçen mint UCRETSIZ, cüzdan adresinden simüle edilir', async () => {
  const p = sahteProvider({
    kod: kodYap(['mint(uint256)', 'ownerOf(uint256)', 'tokenURI(uint256)', 'name()', 'totalSupply()', 'maxSupply()']),
    mintler: { 'mint(uint256)': () => true },
    okumalar: { 'name()': abi.encode(['string'], ['Test NFT']), 'totalSupply()': abi.encode(['uint256'], [57]), 'maxSupply()': abi.encode(['uint256'], [3131]) },
  });
  const r = await takip(p).incele(NFT);
  assert.equal(r.sonuc, 'UCRETSIZ');
  assert.equal(r.standart, 'ERC-721');
  assert.equal(r.ad, 'Test NFT');
  assert.equal(r.basilan, '57');
  assert.equal(r.maks, '3131');
  assert.ok(p.cagrilar.some((c) => c.from === BEN && c.data.startsWith('0x' + sel('mint(uint256)'))));
});

test('sabit küçük ücret isteyen mint NEREDEYSE-UCRETSIZ, ücret basamaklarıyla bulunur', async () => {
  const p = sahteProvider({
    kod: kodYap(['freeMint(uint256)']),
    mintler: { 'freeMint(uint256)': (v) => (v === parseEther('0.0001') ? true : 'wrong free fee') },
  });
  const r = await takip(p).incele(NFT);
  assert.equal(r.sonuc, 'NEREDEYSE-UCRETSIZ');
  assert.equal(r.mintler[0].ucretWei, parseEther('0.0001').toString());
});

test('Agent ID kayıt adresini içeren tükenmiş NFT TUKENDI ve agentId işaretli', async () => {
  const p = sahteProvider({
    kod: kodYap(['claimAgentEntry()'], AGENT_ID_REGISTRY.slice(2).toLowerCase()),
    mintler: { 'claimAgentEntry()': () => 'agent entries sold out' },
  });
  const r = await takip(p).incele(NFT);
  assert.equal(r.agentId, true);
  assert.equal(r.sonuc, 'TUKENDI');
});

test('NFT olmayan Agent ID kontratı AGENT-ID-DIGER', async () => {
  const p = sahteProvider({ kod: kodYap(['mint(address,uint256)'], AGENT_ID_REGISTRY.slice(2).toLowerCase()), erc721: false,
    mintler: { 'mint(address,uint256)': () => 'require(false)' } });
  assert.equal((await takip(p).incele(NFT)).sonuc, 'AGENT-ID-DIGER');
});

test('tarama: yeni yüklenen ücretsiz NFT bulunur, bildirilir ve izlemeye alınır', async () => {
  const tx = '0x' + 'ab'.repeat(32);
  const p = sahteProvider({
    kod: kodYap(['claim()']), mintler: { 'claim()': () => true }, tepe: 100,
    bloklar: { 100: { transactions: [{ hash: tx, to: null }, { hash: '0x01', to: BEN }] } },
    makbuzlar: { [tx]: { status: '0x1', contractAddress: NFT } },
  });
  const bildirilen = [];
  const t = takip(p, { bildir: (r) => bildirilen.push(r.adres) });
  t.durum.sonBlok = 99;
  await t.tur();
  assert.equal(t.durum.sonBlok, 100);
  assert.equal(t.durum.kontrat, 1);
  assert.deepEqual(bildirilen, [NFT]);
  assert.equal(t.ozet().bulunanlar[0].sonuc, 'UCRETSIZ');
  assert.equal(t.ozet().izleme.length, 1);
});

test('cüzdan bağlı değilse takip beklemede kalır, tarama yapmaz', async () => {
  const p = sahteProvider({ kod: '0x' });
  const t = new MintTakip({ provider: p, cuzdanAdresi: async () => null, bildir: null });
  await t.tur();
  assert.match(t.durum.sonHata, /Cüzdan bağlı değil/);
  assert.equal(t.durum.taranan, 0);
});

test('mint edildi: Mint et sonrası işaretlenir, zincir bakiyesi de sayılır', async () => {
  const { MintTakip } = await import('../src/mintTakip.js');
  const t = new MintTakip({ provider: { call: async () => '0x' + '2'.padStart(64, '0') }, cuzdanAdresi: async () => '0x00000000000000000000000000000000B10c4040', bildir: null });
  const r = { adres: '0x6b1D77D3DeDE3FC775ca8C7BDe08C2C2EAAb9BEA', standart: 'ERC-721', sonuc: 'UCRETSIZ' };
  assert.equal(t.mintBilgisi(r), null);
  t.mintEdildiIsaretle(r.adres, { txHash: '0xabc' });
  assert.deepEqual({ adet: t.mintBilgisi(r).adet, txHash: t.mintBilgisi(r).txHash }, { adet: 1, txHash: '0xabc' });
  t.bulunanlar = [{ ...r, adres: '0x2dc57b951a42b7d86449cd7928dcbab67867a780' }];
  await t.bakiyeleriTazele();
  assert.equal(t.ozet().bulunanlar[0].mintEdildi.adet, 2);
});
