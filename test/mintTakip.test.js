import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id, parseEther, AbiCoder } from 'ethers';
import { MintTakip, siniflandir, revertSebebi, AGENT_ID_REGISTRY, acilisZamani } from '../src/mintTakip.js';

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
  await t.incelemeleriBekle();
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

test('açılış zamanı: saniye ve milisaniye kabul edilir, sayaç gibi küçük değerler zaman sayılmaz', () => {
  const simdi = Date.UTC(2026, 10, 1, 9, 31);
  const acilis = Date.UTC(2026, 10, 1, 13, 0);
  assert.equal(acilisZamani(acilis / 1000, simdi), acilis);
  assert.equal(acilisZamani(acilis, simdi), acilis);
  assert.equal(acilisZamani(10000, simdi), null); // POPZERO'nun OPEN_AT değeri
  assert.equal(acilisZamani(0, simdi), null);
  assert.equal(acilisZamani(simdi / 1000 + 30 * 86400, simdi), null); // bir ay sonrası: makul değil
});

// POPZERO kalıbı: ücretli yol açık, bedava yol startTime'a kadar NotStarted ile geri çevriliyor
function ikiFazliProvider(acilisSn) {
  const durum = { acik: false };
  const p = sahteProvider({
    kod: kodYap(['mint(uint256)', 'claimFree()', 'startTime()', 'ownerOf(uint256)', 'tokenURI(uint256)', 'name()']),
    mintler: {
      'mint(uint256)': (v) => (v === parseEther('0.0005') ? true : 'BadPayment'),
      'claimFree()': () => (durum.acik ? true : 'NotStarted'),
    },
    okumalar: { 'startTime()': abi.encode(['uint256'], [acilisSn]), 'name()': abi.encode(['string'], ['POPTEST']) },
  });
  return { p, durum };
}

test('iki fazlı mint: ücretli sonuç korunur, bedava faz ve açılış saati işaretlenir, zamanlı kuyruğa girer', async () => {
  const acilis = Math.floor(Date.now() / 1000) + 3600;
  const { p } = ikiFazliProvider(acilis);
  const t = takip(p);
  const r = await t.incele(NFT);
  assert.equal(r.sonuc, 'NEREDEYSE-UCRETSIZ');
  assert.equal(r.ikiFaz, true);
  assert.equal(r.acilis, acilis * 1000);
  t.kayitEkle(r);
  assert.equal(t.ozet().zamanli.length, 1);
  assert.equal(t.ozet().zamanli[0].acilis, acilis * 1000);
});

test('zamanlı kuyruk: açılıştan önce dokunmaz, açılınca bedava geçerse acildi olayı verir ve kuyruktan çıkar', async () => {
  const acilis = Math.floor(Date.now() / 1000) + 3600;
  const { p, durum } = ikiFazliProvider(acilis);
  const bildirilen = [];
  const t = takip(p, { bildir: (r) => bildirilen.push(r.sonuc) });
  t.kayitEkle(await t.incele(NFT));
  const k = NFT.toLowerCase();

  t.zamanliTur(acilis * 1000 - 60_000);
  assert.equal(t.zamanliCalisan.size, 0);

  // Açıldı ama henüz bedava geçmiyor: kuyrukta kalır
  await t.zamanliKontrol(k, t.zamanli[k]);
  assert.ok(t.zamanli[k]);

  durum.acik = true;
  const acilan = [];
  t.on('acildi', (r) => acilan.push(r.sonuc));
  await t.zamanliKontrol(k, t.zamanli[k]);
  assert.deepEqual(acilan, ['UCRETSIZ']);
  assert.deepEqual(bildirilen, ['UCRETSIZ']);
  assert.equal(t.zamanli[k], undefined);
  assert.equal(t.izleme[k].sonuc, 'UCRETSIZ');
  assert.equal(t.durum.zamanliYakalanan, 1);
});

test('zamanlı kuyruk: açılışa birkaç saniye kala kontrol başlar, süresi geçen kayıt silinir', async () => {
  const t = takip(sahteProvider({ kod: '0x' }));
  const acilis = Date.now() + 3600_000;
  t.zamanli = { a: { adres: NFT, acilis, sonuc: 'IZLE' }, b: { adres: NFT, acilis: Date.now() - 60 * 60_000, sonuc: 'IZLE' } };
  const cagrilan = [];
  t.zamanliKontrol = async (k) => { cagrilan.push(k); };
  t.zamanliTur(acilis - 2_000);
  assert.deepEqual(cagrilan, ['a']);
  assert.equal(t.zamanli.b, undefined);
  // Sık kontrol aralığı dolmadan aynı mint yeniden denenmez
  t.zamanliTur(acilis - 1_500);
  assert.deepEqual(cagrilan, ['a']);
});

test('yeniden kontrol: her turda yeniler ve eskilerden bir parça kontrol edilir, eskiler sırayla döner', async () => {
  const t = takip(sahteProvider({ kod: '0x' }), { yenidenKontrolYeni: 2, yenidenKontrolEski: 2 });
  const simdi = Date.now();
  for (let i = 0; i < 7; i++) {
    const a = '0x' + String(i).padStart(40, '0');
    // İlk ikisi bugün, kalanı günler önce görülmüş
    t.izleme[a] = { adres: a, ilkGorulme: simdi - (i < 2 ? i * 1000 : (i + 1) * 864e5), sonuc: 'IZLE' };
  }
  const kontrol = [];
  t.incele = async (a) => { kontrol.push(a.slice(-1)); return { adres: a, sonuc: 'IZLE', mintler: [] }; };
  t.bakiyeleriTazele = async () => {};
  await t.yenidenKontrol();
  assert.deepEqual(kontrol, ['0', '1', '2', '3']);
  kontrol.length = 0;
  await t.yenidenKontrol();
  assert.deepEqual(kontrol, ['0', '1', '4', '5']);
  assert.equal(t.durum.sonKontrol.kontrat, 4);
});

test('blok havuzu: hata veren RPC atlanır, blok sıradaki RPC ile okunur', async () => {
  const tx = '0x' + 'cd'.repeat(32);
  const bozuk = { send: async () => { throw new Error('limit exceeded'); } };
  const saglam = { send: async (y, p) => (y === 'eth_getBlockByNumber' ? { transactions: [{ hash: tx, to: null }] } : { status: '0x1', contractAddress: NFT }) };
  const t = takip(sahteProvider({ kod: '0x' }), { blokProvider: [bozuk, saglam] });
  assert.deepEqual(await t.bloktakiKontratlar(5), [NFT]);
  assert.deepEqual(await t.bloktakiKontratlar(6), [NFT]);
});

test('okunamayan blok taranmış sayılmaz, boşluğa yazılır', async () => {
  const bozuk = { send: async () => { throw new Error('limit exceeded'); } };
  const t = takip(sahteProvider({ kod: '0x', tepe: 100 }), { blokProvider: [bozuk], blokParalel: 2 });
  t.durum.sonBlok = 98;
  await t.aralikTara(99, 100);
  assert.equal(t.durum.sonBlok, 100);
  assert.deepEqual(t.bosluklar, [{ bas: 99, son: 100 }]);
});

test('zincirin gerisindeyken boşluk doldurulmaz, döngü beklemeden döner', async () => {
  let tepe = 100, adim = 50;
  const p = { ...sahteProvider({ kod: '0x' }), getBlockNumber: async () => { const v = tepe; tepe += adim; return v; } };
  const t = takip(p, { blokParalel: 4 });
  t.durum.sonBlok = 96;
  t.bosluklar = [{ bas: 10, son: 20 }];
  let dolduruldu = false;
  t.boslukDoldur = async () => { dolduruldu = true; };
  t.olayTur = async () => {};
  await t.tur();
  assert.equal(t.geride, true);
  assert.equal(dolduruldu, false);
  adim = 0; // zincir duruyor: tarama yetişir
  tepe = t.durum.sonBlok + 2;
  await t.tur();
  assert.equal(t.geride, false);
  assert.equal(dolduruldu, true);
});

test('inceleme kuyruğu: canlı kontrat öne geçer, kuyruk doluyken boşluk doldurulmaz', async () => {
  const p = sahteProvider({ kod: '0x', tepe: 100 });
  const t = takip(p, { incelemeParalel: 0, maxKuyruk: 2 });
  await t.adayIncele('0x' + '1'.repeat(40), 1, { eski: true });
  await t.adayIncele('0x' + '2'.repeat(40), 99);
  assert.equal(t.incelemeKuyrugu[0][0], '0x' + '2'.repeat(40));
  t.durum.sonBlok = 100;
  t.bosluklar = [{ bas: 10, son: 20 }];
  let dolduruldu = false;
  t.boslukDoldur = async () => { dolduruldu = true; };
  t.olayTur = async () => {};
  await t.tur();
  assert.equal(dolduruldu, false);
});
