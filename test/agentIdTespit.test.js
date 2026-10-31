import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, id } from 'ethers';
import { MintTakip, AGENT_ID_REGISTRY, DOGUM_OLAYLARI, revertSebebi } from '../src/mintTakip.js';

const abi = AbiCoder.defaultAbiCoder();
const sel = (imza) => id(imza).slice(2, 10);
const BEN = '0x00000000000000000000000000000000B10c4040';
const PROXY = '0x' + 'a'.repeat(40), UYG = '0x' + 'b'.repeat(40), KAPI = '0x' + 'c'.repeat(40);
const REG = AGENT_ID_REGISTRY.toLowerCase().slice(2);
const SIFIR32 = '0x' + '0'.repeat(64);

function takip({ kodlar = {}, depo = {}, cagri = () => { throw new Error('revert'); }, olayProvider = null }) {
  const provider = {
    getCode: async (a) => kodlar[a.toLowerCase()] ?? '0x',
    getStorage: async (a, y) => depo[`${a.toLowerCase()}:${y}`] ?? SIFIR32,
    call: async (tx) => cagri(tx),
  };
  return new MintTakip({ provider, olayProvider, cuzdanAdresi: async () => BEN, bildir: null });
}

test('EIP-1167 klon ve EIP-1967 proxy uygulama adresi bulunur', async () => {
  const t = takip({ depo: { [`${PROXY}:0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`]: '0x' + '0'.repeat(24) + 'b'.repeat(40) } });
  const klon = `0x363d3d373d3d3d363d73${'b'.repeat(40)}5af43d82803e903d91602b57fd5bf3`;
  assert.equal((await t.uygulamaAdresi(PROXY, klon)).toLowerCase(), UYG);
  assert.equal((await t.uygulamaAdresi(PROXY, '0x6080')).toLowerCase(), UYG);
  assert.equal(await takip({}).uygulamaAdresi(PROXY, '0x6080'), null);
});

test('proxy arkasındaki kayıt adresi "proxy" olarak işaretlenir', async () => {
  const klon = `0x363d3d373d3d3d363d73${'b'.repeat(40)}5af43d82803e903d91602b57fd5bf3`;
  const t = takip({ kodlar: { [PROXY]: klon, [UYG]: `0x63${sel('mint()')}73${REG}` } });
  const r = await t.incele(PROXY);
  assert.equal(r.agentId, true);
  assert.equal(r.agentIdKaynak, 'proxy');
  assert.equal(r.uygulama.toLowerCase(), UYG);
});

test('depodaki kayıt adresi getter ile bulunur', async () => {
  const t = takip({ cagri: ({ data }) => { if (data === '0x' + sel('identity()')) return abi.encode(['address'], [AGENT_ID_REGISTRY]); throw new Error('revert'); } });
  assert.equal(await t.agentIdDolayli(PROXY, `0x63${sel('identity()')}63${sel('mint()')}`), 'depo');
});

test('kayıt adresi yardımcı kapı kontratındaysa "yardimci" olur, ilgisiz adres sayılmaz', async () => {
  const t = takip({ kodlar: { [KAPI]: `0x60${REG}` } });
  assert.equal(await t.agentIdDolayli(PROXY, `0x6080${'73' + 'c'.repeat(40)}`), 'yardimci');
  assert.equal(await t.agentIdDolayli(PROXY, `0x6080${'73' + 'd'.repeat(40)}`), null);
});

test('mint hatası Agent ID şartını söylüyorsa kontrat Agent ID li sayılır', async () => {
  const kod = `0x63${sel('mint()')}63${sel('ownerOf(uint256)')}63${sel('tokenURI(uint256)')}`;
  const t = takip({ kodlar: { [PROXY]: kod }, cagri: ({ data }) => {
    if (data.startsWith('0x01ffc9a7')) return abi.encode(['bool'], [data.includes('80ac58cd')]);
    const e = new Error('execution reverted: "Agent handle required"'); e.reason = 'Agent handle required'; throw e;
  } });
  const r = await t.incele(PROXY);
  assert.equal(r.agentId, true);
  assert.equal(r.agentIdKaynak, 'hata');
});

test('doğum olayları: sadece sıfırdan sahiplik ve rol, her kurulum olayı; aynı adres bir kez', async () => {
  const T = DOGUM_OLAYLARI;
  const loglar = [
    { address: PROXY, blockNumber: '0x10', topics: [T.sahiplik, SIFIR32, SIFIR32] },
    { address: UYG, blockNumber: '0x10', topics: [T.sahiplik, '0x' + '0'.repeat(24) + '1'.repeat(40), SIFIR32] },
    { address: KAPI, blockNumber: '0x11', topics: [T.kurulum64] },
    { address: KAPI, blockNumber: '0x11', topics: [T.yukseltme, SIFIR32] },
  ];
  let istek = null;
  const t = takip({ olayProvider: { send: async (y, p) => { istek = p[0]; return loglar; } } });
  const r = await t.olaydanKontratlar(16, 19);
  assert.deepEqual(r, [{ adres: PROXY, blok: 16 }, { adres: KAPI, blok: 17 }]);
  assert.equal(istek.fromBlock, '0x10');
  assert.equal(istek.topics[0].length, 5);
  assert.deepEqual(await takip({}).olaydanKontratlar(1, 2), []);
});

test('olay taraması seyrek çalışır, sınıra takılan RPC de sıradakine geçer, aralık kaybolmaz', async () => {
  const istekler = [];
  const kotu = { send: async () => { istekler.push('kotu'); throw new Error('429'); } };
  const iyi = { send: async (y, p) => { istekler.push(['iyi', p[0].fromBlock, p[0].toBlock]); return []; } };
  const t = takip({ olayProvider: [kotu, iyi] });
  t.durum.olayBlok = 99;
  await t.olayTur(120);
  assert.deepEqual(istekler, ['kotu', ['iyi', '0x64', '0x78']]);
  assert.equal(t.durum.olayBlok, 120);
  await t.olayTur(130); // 15 saniye geçmedi
  assert.equal(istekler.length, 2);
  // Geride kalınca 50 bloklık parçalar
  t.sonOlayTur = 0;
  await t.olayTur(240);
  assert.deepEqual(istekler.slice(2).filter((x) => x !== 'kotu').map((x) => [x[1], x[2]]), [['0x79', '0xaa'], ['0xab', '0xdc'], ['0xdd', '0xf0']]);
  assert.equal(t.durum.olayBlok, 240);
});

test('hata kodu sadece data alanında gelse de okunur', () => {
  assert.equal(revertSebebi({ message: 'execution reverted', info: { error: { message: 'execution reverted', data: '0x919f7df5aa' } } }), '0x919f7df5aa');
  assert.equal(revertSebebi({ reason: 'Sold out', data: '0x08c379a0' }), 'Sold out');
});

test('iş kanıtlı token mint (HOUND tarzı) elenmez, izlemeye alınır', async () => {
  const HOUND = '0x' + 'd'.repeat(40);
  const kod = `0x63${sel('mint(uint256)')}63${sel('challenge()')}63${sel('difficultyBits()')}73${REG}`;
  const t = takip({ kodlar: { [HOUND]: kod }, cagri: () => { const e = new Error('revert'); e.data = '0x' + sel('InvalidSolution()'); throw e; } });
  const r = await t.incele(HOUND);
  assert.equal(r.isKaniti, true);
  assert.equal(r.tur, 'token');
  assert.equal(r.sonuc, 'IZLE');
});

test('takip durunca atlanan bloklar boşluk olarak kaydedilip geriye doğru taranır', async () => {
  const t = takip({});
  const taranan = [];
  t.bloktakiKontratlar = async (b) => { taranan.push(b); return []; };
  t.geriDoldurBlok = 10;
  t.boslukEkle(100, 124);
  assert.deepEqual(t.bosluklar, [{ bas: 100, son: 124 }]);
  await t.boslukDoldur();
  assert.deepEqual([Math.min(...taranan), Math.max(...taranan)], [115, 124]);
  assert.deepEqual(t.bosluklar, [{ bas: 100, son: 114 }]);
  await t.boslukDoldur(); await t.boslukDoldur();
  assert.equal(t.bosluklar.length, 0);
  assert.equal(taranan.length, 25);
  // Sınır: toplam boşluk maxBosluk'u aşarsa en yeni bloklar tutulur
  t.maxBosluk = 50;
  t.boslukEkle(0, 999);
  assert.deepEqual(t.bosluklar, [{ bas: 950, son: 999 }]);
});

test('okunamayan blokta durulur, ondan sonraki taranmış kısım boşluktan düşülür', async () => {
  const t = takip({});
  t.geriDoldurBlok = 8;
  t.bloktakiKontratlar = async (b) => { if (b === 21) throw new Error('rpc'); return []; };
  t.boslukEkle(10, 25);
  await t.boslukDoldur();
  assert.deepEqual(t.bosluklar, [{ bas: 10, son: 21 }]);
});

test('çakışan ve bitişik boşluklar birleştirilir', () => {
  const t = takip({});
  t.boslukEkle(100, 200);
  t.boslukEkle(150, 260);
  t.boslukEkle(261, 300);
  t.boslukEkle(10, 20);
  assert.deepEqual(t.bosluklar, [{ bas: 100, son: 300 }, { bas: 10, son: 20 }]);
});
