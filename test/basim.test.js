import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AbiCoder, Interface, Wallet, ZeroAddress, ZeroHash, parseEther, getAddress } from 'ethers';
import {
  Basim, CORE_ABI, createArgCoz, createArgDogrula, formDogrula, gorselCoz, semaKodla, tokenOlustuCoz, vergiDogrula,
} from '../src/basim.js';
import { BasiciCuzdan } from '../src/basiciCuzdan.js';

const coder = AbiCoder.defaultAbiCoder();
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const CORE = '0xebe7b6C1089D9F72aD07f34E36d898e44E5e27f3';
const PRESET = '1778027615735';
const INIT13 = 'string name,string symbol,string tokenUri,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,bytes32 tokenSalt,bytes tokenParams,bytes vaultParams,bytes curveParams,bytes tradeParams,bytes migrateParams';
const DIS = 'uint256 requestId,uint256 presetId,uint256 validTimestamp,uint256 createFee,uint256 presaleQuote,bool antiSniperEnabled';
const ABI_GUNCEL = [`tuple(${DIS},address partner,tuple(${INIT13},bytes customDataParams) initParams)`];
const ABI_ORTAKSIZ = [`tuple(${DIS},tuple(${INIT13},bytes customDataParams) initParams)`];

// Canlı Agent ID şablonunun token şeması (OpenFourTools.getPresetEncodeSchemas)
const SEMA = {
  kind: 'token',
  params: [
    { name: 'founder', abiType: 'address', decimals: 0, optional: true },
    { name: 'buyFeeRate', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'sellFeeRate', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'rateFounder', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'rateHolder', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'rateBurn', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'rateLiquidity', abiType: 'uint256', decimals: 0, optional: false },
    { name: 'minShare', abiType: 'uint256', decimals: 18, optional: false },
    { name: 'taxVaultTypeId', abiType: 'bytes32', decimals: 0, optional: true },
    { name: 'taxVaultInitParams', abiType: 'bytes', decimals: 0, optional: true },
  ],
};

const PNG = `data:image/png;base64,${Buffer.alloc(300, 7).toString('base64')}`;
const form = (ek = {}) => ({ ad: 'Ajan Token', sembol: 'ajan', aciklama: 'Deneme', gorsel: PNG, onalim: '0.01', vergi: {}, ...ek });

function createArgUret({ ad = 'Ajan Token', sembol = 'AJAN', tokenParams, presale = parseEther('0.01'), fee = 0n, quote = WBNB, gecerlilik, abi = ABI_GUNCEL }) {
  const t = {
    requestId: 1n, presetId: BigInt(PRESET), validTimestamp: BigInt(gecerlilik ?? Math.floor(Date.now() / 1000) + 600),
    createFee: fee, presaleQuote: presale, antiSniperEnabled: true,
    initParams: {
      name: ad, symbol: sembol, tokenUri: 'ipfs://x', maxSupply: 10n ** 27n, saleAmount: 8n * 10n ** 26n, raiseAmount: parseEther('13.3'),
      quoteAsset: quote, tokenSalt: ZeroHash, tokenParams, vaultParams: '0x', curveParams: '0x', tradeParams: '0x', migrateParams: '0x', customDataParams: '0x',
    },
  };
  if (abi === ABI_GUNCEL) t.partner = ZeroAddress;
  return coder.encode(abi, [t]);
}

test('vergi: %0 varsayılan, vergi varken oranlar 100 olmalı, sınırlar', () => {
  assert.equal(vergiDogrula({}).buyFeeRate, 0);
  assert.throws(() => vergiDogrula({ buyFeeRate: 100 }), /toplamı 100/);
  assert.equal(vergiDogrula({ buyFeeRate: 100, rateFounder: 30, rateHolder: 70 }).rateHolder, 70);
  assert.throws(() => vergiDogrula({ sellFeeRate: 1001, rateFounder: 100 }), /0-1000/);
  assert.throws(() => vergiDogrula({ rateBurn: 5 }), /oranları 0/);
  assert.throws(() => vergiDogrula({ minShare: '10' }), /10000/);
});

test('form: alanlar, linkler ve ön alım tavanı', () => {
  const f = formDogrula(form({ twitterUrl: 'https://x.com/ajan' }), { onalimMax: 0.02 });
  assert.equal(f.sembol, 'AJAN');
  assert.deepEqual(f.linkler, { twitterUrl: 'https://x.com/ajan' });
  assert.throws(() => formDogrula(form({ onalim: '0.5' }), { onalimMax: 0.02 }), /en fazla 0.02/);
  assert.throws(() => formDogrula(form({ sembol: 'AJ-N' }), { onalimMax: 1 }), /Sembol/);
  assert.throws(() => formDogrula(form({ webUrl: 'javascript:alert(1)' }), { onalimMax: 1 }), /https/);
  assert.throws(() => formDogrula(form({ ad: '' }), { onalimMax: 1 }), /Ad/);
});

test('görsel: tür ve boyut', () => {
  assert.equal(gorselCoz(PNG).tur, 'image/png');
  assert.throws(() => gorselCoz('data:image/svg+xml;base64,AAAA'), /png/);
  assert.throws(() => gorselCoz(`data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024).toString('base64')}`), /2 MB/);
});

test('şema kodlama: tek tuple, opsiyoneller sıfır, ondalıklı alan', () => {
  const kurucu = '0x1111111111111111111111111111111111111111';
  const hex = semaKodla(SEMA, { ...vergiDogrula({}), founder: kurucu });
  const [r] = coder.decode(['(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32,bytes)'], hex);
  assert.equal(r[0], getAddress(kurucu));
  assert.equal(r[7], parseEther('10000'));
  assert.equal(r[8], ZeroHash);
  assert.equal(r[9], '0x');
  assert.throws(() => semaKodla(SEMA, { founder: kurucu }), /buyFeeRate/);
});

test('createArg: güncel ve eski düzen çözülür, eski düzen güncele çevrilir', () => {
  const tp = semaKodla(SEMA, { ...vergiDogrula({}), founder: ZeroAddress });
  const g = createArgCoz(createArgUret({ tokenParams: tp }));
  assert.equal(g.cozulen.initParams.name, 'Ajan Token');
  const e = createArgCoz(createArgUret({ tokenParams: tp, abi: ABI_ORTAKSIZ }));
  assert.equal(e.cozulen.partner, ZeroAddress);
  assert.equal(createArgCoz(e.createArg).cozulen.initParams.symbol, 'AJAN');
  assert.throws(() => createArgCoz('0x1234'), /çözülemedi/);
});

test('createArg doğrulama: oynanmış yanıt reddedilir', () => {
  const tp = semaKodla(SEMA, { ...vergiDogrula({}), founder: ZeroAddress });
  const beklenen = { presetId: PRESET, ad: 'Ajan Token', sembol: 'AJAN', wbnb: WBNB, tokenParams: tp, onalimWei: parseEther('0.01'), ucretMaxWei: parseEther('0.01'), simdi: Date.now() };
  const coz = (o) => createArgCoz(createArgUret({ tokenParams: tp, ...o })).cozulen;
  assert.equal(createArgDogrula(coz({}), beklenen), true);
  assert.throws(() => createArgDogrula(coz({ ad: 'Baska' }), beklenen), /ad farklı/);
  assert.throws(() => createArgDogrula(coz({ presale: parseEther('1') }), beklenen), /ön alım/);
  assert.throws(() => createArgDogrula(coz({ fee: parseEther('0.5') }), beklenen), /ücreti tavanı/);
  assert.throws(() => createArgDogrula(coz({ quote: '0x55d398326f99059fF775485246999027B3197955' }), beklenen), /BNB değil/);
  assert.throws(() => createArgDogrula(coz({ gecerlilik: Math.floor(Date.now() / 1000) - 5 }), beklenen), /süresi dolmuş/);
  const vergili = semaKodla(SEMA, { ...vergiDogrula({ sellFeeRate: 500, rateFounder: 100 }), founder: ZeroAddress });
  assert.throws(() => createArgDogrula(createArgCoz(createArgUret({ tokenParams: vergili })).cozulen, beklenen), /vergi/);
});

test('basıcı cüzdan: şifreli dosya, yanlış şifre, kilit', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bc-'));
  const dosya = path.join(dir, 'c.json');
  const sabit = Wallet.createRandom();
  const c = new BasiciCuzdan({ dosya, olustur: () => sabit });
  await assert.rejects(c.olustur('kisa'), /10 karakter/);
  const d = await c.olustur('cok-gizli-sifre-123');
  assert.equal(d.adres.toLowerCase(), sabit.address.toLowerCase());
  assert.equal(d.acik, true);
  const icerik = readFileSync(dosya, 'utf8');
  assert.ok(!icerik.includes(sabit.privateKey.slice(2)), 'anahtar düz metin yazılmamalı');
  assert.equal(statSync(dosya).mode & 0o777, 0o600);
  await assert.rejects(c.olustur('cok-gizli-sifre-123'), /zaten var/);
  c.kilitle();
  assert.throws(() => c.imzaci(), /kilitli/);
  await assert.rejects(c.ac('yanlis-sifre-0000'), /yanlış/);
  await c.ac('cok-gizli-sifre-123');
  assert.equal((await c.imzaci().getAddress()), sabit.address);
  c.kilitle();
  assert.ok(existsSync(dosya));
});

// ---------- uçtan uca akış (sahte Four.meme ve zincir) ----------

function kur({ canli = false, yanitDegistir = (x) => x, simHata = null, bakiye = parseEther('1') } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'basim-'));
  const imzaci = Wallet.createRandom();
  const cagri = [];
  const tokenAdres = '0x' + '4'.repeat(36) + '4444';
  const coreIf = new Interface(CORE_ABI);
  const cuzdan = {
    durum: () => ({ var: true, adres: imzaci.address, acik: true }),
    imzaci: () => ({
      getAddress: async () => imzaci.address,
      signMessage: (m) => imzaci.signMessage(m),
      sendTransaction: async (tx) => {
        cagri.push(['tx', tx]);
        const ev = coreIf.encodeEventLog('TokenCreated', [
          1n, BigInt(PRESET), imzaci.address, tokenAdres, 'Ajan Token', 'AJAN', 1n, 1n, 1n, 1n, WBNB, ZeroAddress, ZeroAddress,
          ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, '', 0n, '0x',
        ]);
        return { hash: '0xabc', wait: async () => ({ status: 1, logs: [{ address: CORE, ...ev }] }) };
      },
    }),
  };
  const api = {
    giris: async (s) => { cagri.push(['giris']); return { adres: await s.getAddress(), erisim: 'erisim' }; },
    sablonAyari: async () => ({ symbol: 'BNB', totalSupply: '1000000000', saleAmount: '800000000', raisedAmount: '13.3', createFee: '0' }),
    gorselYukle: async (_e, g) => { cagri.push(['gorsel', g.tur]); return 'https://static.four.meme/x.png'; },
    basimIste: async (_e, govde) => {
      cagri.push(['basim', govde]);
      const c = yanitDegistir({ ad: govde.name, sembol: govde.shortName, tokenParams: govde.initParams.tokenParams, presale: parseEther(String(govde.presaleQuote)) });
      return { tokenId: 7, createArg: createArgUret(c), signature: '0x' + '11'.repeat(65) };
    },
  };
  const provider = {
    getBalance: async () => bakiye,
    getFeeData: async () => ({ gasPrice: 1_000_000_000n }),
    call: async (tx) => { cagri.push(['call', tx]); if (simHata) throw new Error(simHata); return coder.encode(['address'], [tokenAdres]); },
    estimateGas: async () => 3_000_000n,
  };
  const b = new Basim({
    cuzdan, api, provider, kayitDosya: path.join(dir, 'k.jsonl'), canli, onalimMax: 0.02, ucretMax: 0.01, presetId: PRESET, registry: ZeroAddress,
  });
  b.adresler = { tools: ZeroAddress, core: CORE, wbnb: WBNB };
  b.semaOnbellek = SEMA;
  return { b, cagri, imzaci, tokenAdres, dir };
}

test('akış: taslak hazırlanır, simüle edilir, simülasyon modunda gönderilmez', async () => {
  const { b, cagri, imzaci, tokenAdres } = kur();
  const t = await b.taslakHazirla(form());
  assert.equal(t.sim.ok, true);
  assert.equal(t.sim.tahminiToken, tokenAdres);
  assert.equal(t.toplam, '0.01');
  const govde = cagri.find(([n]) => n === 'basim')[1];
  assert.equal(govde.templateId, PRESET);
  assert.equal(govde.shortName, 'AJAN');
  assert.equal(govde.symbol, 'BNB');
  const call = cagri.find(([n]) => n === 'call')[1];
  assert.equal(call.from, imzaci.address);
  assert.equal(call.value, parseEther('0.01'));
  await assert.rejects(b.gonder({ id: t.id, onay: true }), /Canlı işlem kapalı/);
  assert.ok(!cagri.some(([n]) => n === 'tx'));
});

test('akış: oynanmış Four.meme yanıtı taslak oluşturmaz', async () => {
  const { b, cagri } = kur({ yanitDegistir: (c) => ({ ...c, presale: parseEther('0.5') }) });
  await assert.rejects(b.taslakHazirla(form()), /ön alım/);
  assert.equal(b.taslakVeri, null);
  assert.ok(!cagri.some(([n]) => n === 'call'));
});

test('akış: simülasyon hatası ve yetersiz bakiye gönderimi engeller', async () => {
  let { b } = kur({ canli: true, simHata: 'execution reverted' });
  let t = await b.taslakHazirla(form());
  assert.equal(t.sim.ok, false);
  await assert.rejects(b.gonder({ id: t.id, onay: true }), /Simülasyon başarısız/);

  ({ b } = kur({ canli: true, bakiye: parseEther('0.001') }));
  t = await b.taslakHazirla(form());
  assert.match(t.sim.hata, /Bakiye yetersiz/);
});

test('akış: canlı gönderim onay ister, bir kez gönderir, token adresini olaydan okur', async () => {
  const { b, cagri, tokenAdres, dir } = kur({ canli: true });
  const t = await b.taslakHazirla(form());
  await assert.rejects(b.gonder({ id: t.id }), /açık onay/);
  await assert.rejects(b.gonder({ id: 'baska', onay: true }), /Taslak bulunamadı/);
  const r = await b.gonder({ id: t.id, onay: true });
  assert.equal(r.durum, 'tamamlandi');
  assert.equal(r.token, getAddress(tokenAdres));
  const tx = cagri.find(([n]) => n === 'tx')[1];
  assert.equal(tx.to, CORE);
  assert.equal(tx.value, parseEther('0.01'));
  assert.equal(tx.gasLimit, 3_600_000n);
  await assert.rejects(b.gonder({ id: t.id, onay: true }), /Taslak bulunamadı/);
  const kayit = readFileSync(path.join(dir, 'k.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(kayit.map((k) => k.durum), ['gonderildi', 'tamamlandi']);
});

test('TokenCreated olayı sadece Core adresinden okunur', () => {
  const coreIf = new Interface(CORE_ABI);
  const ev = coreIf.encodeEventLog('TokenCreated', [
    1n, 1n, ZeroAddress, '0x' + '5'.repeat(40), 'a', 'b', 1n, 1n, 1n, 1n, WBNB, ZeroAddress, ZeroAddress, ZeroAddress,
    ZeroAddress, ZeroAddress, ZeroAddress, '', 0n, '0x',
  ]);
  assert.equal(tokenOlustuCoz({ logs: [{ address: '0x' + '9'.repeat(40), ...ev }] }, CORE), null);
  assert.ok(tokenOlustuCoz({ logs: [{ address: CORE, ...ev }] }, CORE).token);
});
