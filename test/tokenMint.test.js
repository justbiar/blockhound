import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface, MaxUint256, ZeroAddress, parseEther } from 'ethers';
import { argumanlar, mintAdaylari, fiyatAdaylari, kodSecicileri, seciciOf, tokenMintBul, hataAdlari } from '../src/tokenMint.js';
import { siniflandir } from '../src/mintTakip.js';

const W = '0x' + '1'.repeat(40);
const A = '0x' + '2'.repeat(40);
const T = '0x' + '3'.repeat(40);
const AGENT = 777n;

test('okuma fonksiyonları ve hata adları mint sayılmaz', () => {
  const m = mintAdaylari(['mint(uint256,uint256,uint256)', 'mintedById(uint256)', 'publicMinted()', 'MintNotStarted(uint64)',
    'mintWithBnb(uint256,address,uint256)', 'claimSocial(bytes32,bytes32,uint256,bytes)', 'mintPrice()', 'claim()', 'transfer(address,uint256)']);
  assert.deepEqual(m, ['mintWithBnb(uint256,address,uint256)', 'mint(uint256,uint256,uint256)', 'claim()']);
  assert.deepEqual(fiyatAdaylari(['quote(uint256,uint256)', 'bnbQuote(uint256)', 'priceAt(uint256)', 'costOf(uint256,uint256,uint256)']),
    ['bnbQuote(uint256)', 'quote(uint256,uint256)', 'priceAt(uint256)']);
});

test('argüman adayları: sınırsız değerler sona kalır, dar türe sığmayan girmez', () => {
  const ilk = [...argumanlar(['uint256', 'address', 'uint256'], { cuzdan: W, agentId: AGENT, deger: 5n })];
  assert.deepEqual(ilk[0], [1n, ZeroAddress, 1n]);
  assert.deepEqual(ilk[1], [1n, ZeroAddress, 5n]);
  assert.equal(ilk.length, 4 * 2 * 4);
  assert.deepEqual([...argumanlar(['uint8'], { cuzdan: W, agentId: AGENT })], [[1n]]);
  assert.deepEqual([...argumanlar([], { cuzdan: W })], [[]]);
});

test('bytecode seçicileri ve camelCase hata sınıflandırması', () => {
  assert.deepEqual(kodSecicileri('0x6302acc94b1463315f1a41'), ['02acc94b', '315f1a41']);
  assert.equal(siniflandir('MintNotStarted(uint64)'), 'acilmadi');
  assert.equal(siniflandir('SoldOut(uint256)'), 'tukendi');
  assert.equal(siniflandir('AlreadyMinted(bytes32,uint256)'), 'zaten-aldin');
});

// MAO benzeri sahte kontrat: mint(pay, agentId, referans=yok) ilk Mao'da ücretsiz
function sahteProvider({ ucret = 0n } = {}) {
  const i = new Interface(['function mint(uint256,uint256,uint256) payable', 'function quote(uint256,uint256) view returns (uint256)',
    'function token() view returns (address)', 'function symbol() view returns (string)', 'function name() view returns (string)']);
  const cagrilar = [];
  return {
    cagrilar,
    async call({ to, data, value = 0n }) {
      cagrilar.push(data.slice(0, 10));
      const s = data.slice(2, 10);
      if (to === T && s === seciciOf('symbol()')) return i.encodeFunctionResult('symbol', ['MAOAI']);
      if (to === T && s === seciciOf('name()')) return i.encodeFunctionResult('name', ['Agent Mao']);
      if (to === T) throw new Error('revert');
      if (s === seciciOf('token()')) return i.encodeFunctionResult('token', [T]);
      if (s === seciciOf('quote(uint256,uint256)')) return i.encodeFunctionResult('quote', [ucret]);
      if (s === seciciOf('mint(uint256,uint256,uint256)')) {
        const [pay, agent, ref] = i.decodeFunctionData('mint', data);
        if (agent !== AGENT || ref !== MaxUint256 || pay !== 1n || BigInt(value) !== ucret) throw Object.assign(new Error('revert'), { shortMessage: 'BAD' });
        return '0x';
      }
      throw new Error('revert');
    },
  };
}
const kod = '0x63' + ['mint(uint256,uint256,uint256)', 'quote(uint256,uint256)', 'token()'].map(seciciOf).join('63');

test('MAO tipi token mint: Agent ID ve "referans yok" argümanlarıyla ücretsiz bulunur', async () => {
  const provider = sahteProvider();
  const t = await tokenMintBul({ provider, adres: A, kod, cuzdan: W, agentId: AGENT, fetchFn: null });
  assert.equal(t.token, T);
  assert.equal(t.tokenSembol, 'MAOAI');
  const m = t.mintler.find((x) => x.gecti);
  assert.equal(m.ucretWei, '0');
  assert.deepEqual(m.argumanlar, ['1', String(AGENT), String(MaxUint256)]);
  assert.ok(m.veri.startsWith('0x02acc94b'));
});

test('ücretli token mint: quote fiyatıyla bulunur, Agent ID yoksa geçmez', async () => {
  const ucret = parseEther('0.001');
  const t = await tokenMintBul({ provider: sahteProvider({ ucret }), adres: A, kod, cuzdan: W, agentId: AGENT, fetchFn: null });
  assert.equal(t.mintler.find((x) => x.gecti).ucretWei, ucret.toString());
  const yok = await tokenMintBul({ provider: sahteProvider(), adres: A, kod, cuzdan: W, agentId: null, fetchFn: null });
  assert.equal(yok.mintler.some((x) => x.gecti), false);
});

test('hata kodları imza veritabanından adlandırılır', async () => {
  const fetchFn = async () => ({ json: async () => ({ result: { function: { '0x52df9fe5': [{ name: 'SoldOut()' }] } } }) });
  assert.deepEqual(await hataAdlari(['0x52df9fe5', 'mint closed'], { fetchFn }), { '52df9fe5': 'SoldOut()' });
});

test('adında fiyat ya da sayaç geçen fonksiyonlar mint adayı değil', () => {
  assert.deepEqual(mintAdaylari(['mintPriceAt(uint256)', 'mintCostFor(uint256)', 'claimFeeOf(address)', 'mintTo(address)', 'buy(uint256)']), ['mintTo(address)', 'buy(uint256)']);
});

test('okuma fonksiyonu adları: mintState, mintsSold, buyValue elenir; parametresizde sadece bilinen eylemler', () => {
  assert.deepEqual(mintAdaylari(['mintState()', 'mintsSold()', 'buyValue(uint256)', 'mintMax(uint256)', 'mintEnabled()', 'mintOne()', 'mint()', 'buy()', 'mintTo(address)']),
    ['mintTo(address)', 'mint()', 'buy()']);
});
