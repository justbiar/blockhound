// Open Four ile token basımı (resmi akış: openfour-docs integration-guide §6).
// 1) basıcı cüzdanla Four.meme girişi  2) görsel yükleme  3) parametreler zincirdeki şemadan kodlanır
// 4) Four.meme imzalı createArg döndürür  5) createArg çözülüp istenenle birebir karşılaştırılır
// 6) zincirde simülasyon  7) sadece canlı modda ve açık onayla createToken gönderilir.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AbiCoder, Contract, Interface, ZeroAddress, ZeroHash, formatEther, getAddress, parseEther, parseUnits } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();

const PARAM = '(string name,string abiType,uint8 decimals,bool optional,string title,string defaultValue,string hint,string minValue,string maxValue)';
const SEMA = `(string kind,uint8 version,${PARAM}[] params)`;
const REGISTRY_ABI = ['function openFourTool() view returns (address)', 'function openFourCore() view returns (address)'];
const TOOLS_ABI = [`function getPresetEncodeSchemas(uint256 presetId) view returns (${SEMA},${SEMA},${SEMA},${SEMA},${SEMA},${SEMA})`];
export const CORE_ABI = [
  'function wrappedNative() view returns (address)',
  'function createToken(bytes createArgs, bytes signature) payable returns (address token)',
  'event TokenCreated(uint256 requestId, uint256 indexed presetId, address indexed creator, address indexed token, string name, string symbol, uint256 maxSupply, uint256 saleAmount, uint256 raiseAmount, uint256 initialPrice, address quoteAsset, address vault, address curveModule, address tradeModule, address migrateModule, address customData, address tokenModule, string tokenMetaUri, uint256 flags, bytes encodedTags)',
];
const coreArayuz = new Interface(CORE_ABI);

// createArg düzeni (scripts/abi/createTokenArgsCodec.json). Eski düzenler resmi koddaki gibi güncele çevrilir.
const INIT13 = 'string name,string symbol,string tokenUri,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,bytes32 tokenSalt,bytes tokenParams,bytes vaultParams,bytes curveParams,bytes tradeParams,bytes migrateParams';
const DIS = 'uint256 requestId,uint256 presetId,uint256 validTimestamp,uint256 createFee,uint256 presaleQuote,bool antiSniperEnabled';
const ABI_GUNCEL = [`tuple(${DIS},address partner,tuple(${INIT13},bytes customDataParams) initParams)`];
const ABI_ORTAKSIZ = [`tuple(${DIS},tuple(${INIT13},bytes customDataParams) initParams)`];
const ABI_VERISIZ = [`tuple(${DIS},tuple(${INIT13}) initParams)`];

const duz = (d) => ({
  requestId: d.requestId, presetId: d.presetId, validTimestamp: d.validTimestamp, createFee: d.createFee,
  presaleQuote: d.presaleQuote, antiSniperEnabled: d.antiSniperEnabled, partner: d.partner ?? ZeroAddress,
  initParams: {
    name: d.initParams.name, symbol: d.initParams.symbol, tokenUri: d.initParams.tokenUri, maxSupply: d.initParams.maxSupply,
    saleAmount: d.initParams.saleAmount, raiseAmount: d.initParams.raiseAmount, quoteAsset: d.initParams.quoteAsset,
    tokenSalt: d.initParams.tokenSalt, tokenParams: d.initParams.tokenParams, vaultParams: d.initParams.vaultParams,
    curveParams: d.initParams.curveParams, tradeParams: d.initParams.tradeParams, migrateParams: d.initParams.migrateParams,
    customDataParams: d.initParams.customDataParams ?? '0x',
  },
});

export function createArgCoz(ham) {
  for (const abi of [ABI_GUNCEL, ABI_ORTAKSIZ, ABI_VERISIZ]) {
    try {
      const [d] = coder.decode(abi, ham);
      const cozulen = duz(d);
      const createArg = abi === ABI_GUNCEL ? ham : coder.encode(ABI_GUNCEL, [cozulen]);
      return { createArg, cozulen };
    } catch { /* sıradaki düzen */ }
  }
  throw new Error('Four.meme yanıtındaki createArg çözülemedi');
}

// ---------- form doğrulama ----------

const URL_ALAN = ['webUrl', 'twitterUrl', 'telegramUrl'];

export function vergiDogrula(v = {}) {
  const sayi = (k, min, max) => {
    const n = Number(v[k] ?? 0);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${k} ${min}-${max} arası tam sayı olmalı`);
    return n;
  };
  const out = {
    buyFeeRate: sayi('buyFeeRate', 0, 1000), sellFeeRate: sayi('sellFeeRate', 0, 1000),
    rateFounder: sayi('rateFounder', 0, 100), rateHolder: sayi('rateHolder', 0, 100),
    rateBurn: sayi('rateBurn', 0, 100), rateLiquidity: sayi('rateLiquidity', 0, 100),
    minShare: String(v.minShare ?? '10000'),
  };
  const toplam = out.rateFounder + out.rateHolder + out.rateBurn + out.rateLiquidity;
  if (out.buyFeeRate > 0 || out.sellFeeRate > 0) {
    if (toplam !== 100) throw new Error('Vergi varken dağılım oranlarının toplamı 100 olmalı');
  } else if (toplam !== 0) {
    throw new Error('Vergi yokken dağılım oranları 0 olmalı');
  }
  if (!/^\d+$/.test(out.minShare) || BigInt(out.minShare) < 10000n) throw new Error('minShare en az 10000 token olmalı');
  return out;
}

export function formDogrula(f = {}, { onalimMax }) {
  const ad = String(f.ad ?? '').trim();
  const sembol = String(f.sembol ?? '').trim().toUpperCase();
  const aciklama = String(f.aciklama ?? '').trim();
  if (ad.length < 1 || ad.length > 32) throw new Error('Ad 1-32 karakter olmalı');
  if (!/^[A-Z0-9]{1,10}$/.test(sembol)) throw new Error('Sembol 1-10 harf ya da rakam olmalı');
  if (aciklama.length < 1 || aciklama.length > 500) throw new Error('Açıklama 1-500 karakter olmalı');
  const linkler = {};
  for (const k of URL_ALAN) {
    const u = String(f[k] ?? '').trim();
    if (!u) continue;
    if (!/^https:\/\/[^\s"'<>]+$/.test(u) || u.length > 200) throw new Error(`${k} https ile başlayan geçerli bir adres olmalı`);
    linkler[k] = u;
  }
  const onalim = String(f.onalim ?? '0').trim() || '0';
  if (!/^\d+(\.\d{1,18})?$/.test(onalim)) throw new Error('Ön alım BNB cinsinden sayı olmalı');
  if (Number(onalim) > onalimMax) throw new Error(`Ön alım en fazla ${onalimMax} BNB olabilir`);
  return { ad, sembol, aciklama, linkler, onalim, vergi: vergiDogrula(f.vergi) };
}

export function gorselCoz(dataUrl) {
  const m = String(dataUrl ?? '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Görsel png, jpeg, webp ya da gif olmalı');
  const veri = Buffer.from(m[2], 'base64');
  if (veri.length > 2 * 1024 * 1024) throw new Error('Görsel en fazla 2 MB olabilir');
  if (veri.length < 100) throw new Error('Görsel çok küçük');
  const uzanti = m[1].split('/')[1].replace('jpeg', 'jpg');
  return { veri, tur: m[1], ad: `token.${uzanti}` };
}

// Şemadaki sırayla tek bir tuple olarak kodlar (resmi encodeFromSchema ile aynı kural)
export function semaKodla(sema, degerler) {
  if (!sema.params.length) return '0x';
  const tipler = sema.params.map((p) => p.abiType);
  const vals = sema.params.map((p) => {
    const ham = degerler[p.name];
    const yok = ham == null || String(ham).trim() === '';
    if (yok) {
      if (!p.optional) throw new Error(`Şema alanı eksik: ${p.name}`);
      if (p.abiType === 'address') return ZeroAddress;
      if (p.abiType === 'bool') return false;
      if (p.abiType === 'bytes32') return ZeroHash;
      if (p.abiType === 'bytes') return '0x';
      if (p.abiType === 'string') return '';
      return 0n;
    }
    if (p.abiType === 'address') return getAddress(String(ham));
    if (p.abiType === 'bool') return ham === true || ham === 'true';
    if (['bytes', 'bytes32', 'string'].includes(p.abiType)) return String(ham);
    return Number(p.decimals) > 0 ? parseUnits(String(ham), Number(p.decimals)) : BigInt(String(ham));
  });
  return coder.encode([`(${tipler.join(',')})`], [vals]);
}

// Four.meme'nin döndürdüğü imzalı veri, istediğimizle birebir aynı mı?
export function createArgDogrula(c, b) {
  const h = [];
  if (String(c.presetId) !== String(b.presetId)) h.push('şablon farklı');
  if (c.initParams.name !== b.ad) h.push('ad farklı');
  if (c.initParams.symbol !== b.sembol) h.push('sembol farklı');
  if (c.initParams.quoteAsset.toLowerCase() !== b.wbnb.toLowerCase()) h.push('ödeme varlığı BNB değil');
  if (c.initParams.tokenParams.toLowerCase() !== b.tokenParams.toLowerCase()) h.push('vergi ayarları farklı');
  if (c.presaleQuote !== b.onalimWei) h.push('ön alım tutarı farklı');
  if (c.createFee > b.ucretMaxWei) h.push(`basım ücreti tavanı aşıyor (${formatEther(c.createFee)} BNB)`);
  if (Number(c.validTimestamp) * 1000 <= b.simdi) h.push('imzanın süresi dolmuş');
  if (h.length) throw new Error(`Four.meme yanıtı reddedildi: ${h.join(', ')}`);
  return true;
}

export function tokenOlustuCoz(makbuz, coreAdres) {
  for (const l of makbuz?.logs || []) {
    if (l.address?.toLowerCase() !== coreAdres.toLowerCase()) continue;
    try {
      const e = coreArayuz.parseLog(l);
      if (e?.name === 'TokenCreated') return { token: e.args.token, ad: e.args.name, sembol: e.args.symbol };
    } catch { /* başka olay */ }
  }
  return null;
}

// ---------- akış ----------

export class Basim {
  constructor({ cuzdan, api, provider, kayitDosya, canli, onalimMax, ucretMax, presetId, registry }) {
    Object.assign(this, { cuzdan, api, provider, kayitDosya, canli, onalimMax, ucretMax, presetId, registry });
    this.oturum = null; // { adres, erisim }
    this.taslakVeri = null;
    this.adresler = null;
    this.semaOnbellek = null;
  }

  async _adresler() {
    if (this.adresler) return this.adresler;
    const reg = new Contract(this.registry, REGISTRY_ABI, this.provider);
    const [tools, core] = await Promise.all([reg.openFourTool(), reg.openFourCore()]);
    const wbnb = await new Contract(core, CORE_ABI, this.provider).wrappedNative();
    this.adresler = { tools, core, wbnb };
    return this.adresler;
  }

  async tokenSemasi() {
    if (this.semaOnbellek) return this.semaOnbellek;
    const { tools } = await this._adresler();
    const ham = await new Contract(tools, TOOLS_ABI, this.provider).getPresetEncodeSchemas(BigInt(this.presetId));
    const cevir = (s) => ({
      kind: s[0], params: Array.from(s[2]).map((p) => ({ name: p[0], abiType: p[1], decimals: Number(p[2]), optional: p[3] })),
    });
    const semalar = Array.from(ham).map(cevir);
    if (semalar.slice(1).some((s) => s.params.length)) throw new Error('Şablonun beklenmeyen modül alanları var, basım durduruldu');
    this.semaOnbellek = semalar[0];
    return this.semaOnbellek;
  }

  async bilgi() {
    const d = this.cuzdan.durum();
    let bakiye = null;
    if (d.adres) bakiye = formatEther(await this.provider.getBalance(d.adres).catch(() => 0n));
    const ayar = await this.api.sablonAyari(this.presetId).catch(() => null);
    return {
      cuzdan: { ...d, bakiye }, canli: this.canli, onalimMax: this.onalimMax, ucretMax: this.ucretMax,
      sablon: ayar && { arz: ayar.totalSupply, satis: ayar.saleAmount, hedef: ayar.raisedAmount, ucret: ayar.createFee },
      taslak: this._taslakOzet(),
    };
  }

  async _giris() {
    const imzaci = this.cuzdan.imzaci();
    const adres = await imzaci.getAddress();
    if (this.oturum?.adres === adres) return this.oturum;
    this.oturum = await this.api.giris(imzaci);
    return this.oturum;
  }

  async taslakHazirla(form) {
    const f = formDogrula(form, { onalimMax: this.onalimMax });
    const gorsel = gorselCoz(form.gorsel);
    const adres = await this.cuzdan.imzaci().getAddress();
    const [{ core, wbnb }, sema, ayar] = await Promise.all([this._adresler(), this.tokenSemasi(), this.api.sablonAyari(this.presetId)]);

    const tokenParams = semaKodla(sema, { ...f.vergi, founder: adres });
    let oturum = await this._giris();
    let imgUrl;
    try {
      imgUrl = await this.api.gorselYukle(oturum.erisim, gorsel);
    } catch {
      this.oturum = null; // erişim anahtarının süresi dolmuş olabilir: bir kez yeniden giriş
      oturum = await this._giris();
      imgUrl = await this.api.gorselYukle(oturum.erisim, gorsel);
    }

    const istek = {
      templateId: this.presetId, presetId: this.presetId, name: f.ad, shortName: f.sembol, symbol: ayar.symbol,
      desc: f.aciklama, imgUrl, ...f.linkler, presaleQuote: f.onalim, feePlan: true,
      raisedAmount: ayar.raisedAmount, saleAmount: ayar.saleAmount, totalSupply: ayar.totalSupply,
      initParams: { tokenParams, vaultParams: '0x', curveParams: '0x', tradeParams: '0x', migrateParams: '0x', customDataParams: '0x' },
    };
    const yanit = await this.api.basimIste(oturum.erisim, istek);
    const { createArg, cozulen } = createArgCoz(yanit.createArg);
    const onalimWei = parseEther(f.onalim);
    createArgDogrula(cozulen, {
      presetId: this.presetId, ad: f.ad, sembol: f.sembol, wbnb, tokenParams, onalimWei,
      ucretMaxWei: parseEther(String(this.ucretMax)), simdi: Date.now(),
    });

    const deger = cozulen.createFee + cozulen.presaleQuote;
    const veri = coreArayuz.encodeFunctionData('createToken', [createArg, yanit.signature]);
    const sim = await this._simule({ adres, core, veri, deger });

    this.taslakVeri = {
      id: randomUUID(), olusturma: Date.now(), gecerlilik: Number(cozulen.validTimestamp) * 1000, adres, core, veri, deger,
      ozet: {
        ad: f.ad, sembol: f.sembol, gorsel: imgUrl, ucret: formatEther(cozulen.createFee), onalim: formatEther(cozulen.presaleQuote),
        toplam: formatEther(deger), vergi: f.vergi, ortak: cozulen.partner, antiSniper: cozulen.antiSniperEnabled,
        fourmemeId: yanit.tokenId ?? null,
      },
      sim,
    };
    return this._taslakOzet();
  }

  async _simule({ adres, core, veri, deger }) {
    const [bakiye, gasFiyat] = await Promise.all([this.provider.getBalance(adres), this.provider.getFeeData().then((x) => x.gasPrice ?? 0n)]);
    try {
      const donus = await this.provider.call({ from: adres, to: core, data: veri, value: deger });
      const gas = await this.provider.estimateGas({ from: adres, to: core, data: veri, value: deger });
      const tahminiToken = coreArayuz.decodeFunctionResult('createToken', donus)[0];
      const gasUcret = gas * gasFiyat;
      const yeterli = bakiye >= deger + gasUcret;
      return {
        ok: yeterli, gas: gas.toString(), gasUcret: formatEther(gasUcret), bakiye: formatEther(bakiye), tahminiToken,
        hata: yeterli ? null : `Bakiye yetersiz: ${formatEther(deger + gasUcret)} BNB gerekli`,
      };
    } catch (e) {
      return { ok: false, bakiye: formatEther(bakiye), hata: `Simülasyon başarısız: ${e.shortMessage || e.reason || e.message}`.slice(0, 300) };
    }
  }

  _taslakOzet() {
    const t = this.taslakVeri;
    if (!t) return null;
    return { id: t.id, ...t.ozet, adres: t.adres, gecerlilik: t.gecerlilik, sim: t.sim, suresiDoldu: Date.now() >= t.gecerlilik };
  }

  taslakIptal() {
    this.taslakVeri = null;
    return { ok: true };
  }

  async gonder({ id, onay }) {
    if (onay !== true) throw new Error('Gönderim için açık onay gerekli');
    if (!this.canli) throw new Error('Canlı işlem kapalı (MOD=live ve CANLI_ISLEM=1 gerekli). Taslak sadece simüle edildi');
    const t = this.taslakVeri;
    if (!t || t.id !== id) throw new Error('Taslak bulunamadı ya da değişti');
    if (Date.now() >= t.gecerlilik - 15_000) throw new Error('İmzanın süresi doldu, taslağı yeniden hazırlayın');

    const sim = await this._simule(t);
    if (!sim.ok) throw new Error(sim.hata);
    const imzaci = this.cuzdan.imzaci(this.provider);
    if ((await imzaci.getAddress()) !== t.adres) throw new Error('Açık cüzdan taslaktaki cüzdan değil');

    this.taslakVeri = null; // aynı taslak iki kez gönderilmesin
    const tx = await imzaci.sendTransaction({ to: t.core, data: t.veri, value: t.deger, gasLimit: (BigInt(sim.gas) * 12n) / 10n });
    this._kaydet({ durum: 'gonderildi', txHash: tx.hash, ...t.ozet });
    const makbuz = await tx.wait(1, 120_000);
    if (makbuz?.status !== 1) {
      this._kaydet({ durum: 'basarisiz', txHash: tx.hash });
      throw new Error(`İşlem başarısız oldu: ${tx.hash}`);
    }
    const olay = tokenOlustuCoz(makbuz, t.core);
    const sonuc = { durum: 'tamamlandi', txHash: tx.hash, token: olay?.token ?? null, ad: t.ozet.ad, sembol: t.ozet.sembol };
    this._kaydet(sonuc);
    return sonuc;
  }

  _kaydet(kayit) {
    appendFileSync(this.kayitDosya, `${JSON.stringify({ zaman: new Date().toISOString(), ...kayit })}\n`);
  }
}
