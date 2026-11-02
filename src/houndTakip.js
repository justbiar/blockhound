// HOUND ve BlockHound takibi: arz, sahipler, madenciler, gelir ve zorluk. Kurulum bloğundan bu yana Transfer ve Mined
// olaylarını parça parça okur, sahip bakiyelerini olaylardan hesaplar ve diske yazar; sonraki turlarda yalnızca yeni
// blokları okur. Hepsi okuma: işlem göndermez.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Interface, id, formatEther, formatUnits, getAddress, toQuantity } from 'ethers';

export const HOUND_KONTRATLAR = {
  hound: { adres: '0x8446C862f84B948fDDAf1Be42c6B59ceCf5941Ac', ad: 'HOUND', tur: 'token' },
  blockhound: { adres: '0x2535E83109909c7B9eA22D5b2f7c8621E595e3Dd', ad: 'BlockHound', tur: 'nft' },
};
export const HOUND_KURULUM_BLOGU = 130898309;
export const HOUND_KASA = '0x5b72c750D40F7EcB56A305087F0920DF2043c350';
const AGENT_ID_KAYDI = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const BNB_USD = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE';

const T = {
  transfer: id('Transfer(address,address,uint256)'),
  mined: id('Mined(address,uint256,uint256,uint256,uint256)'),
};
const OKU = new Interface([
  'function totalSupply() view returns (uint256)', 'function minted() view returns (uint256)', 'function epoch() view returns (uint256)',
  'function epochSize() view returns (uint256)', 'function difficultyBits() view returns (uint256)', 'function mintFee() view returns (uint256)',
  'function feeUsd() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function tokenURI(uint256) view returns (string)',
  'function handleOf(address) view returns (string)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
]);
const SIFIR = '0x0000000000000000000000000000000000000000';
const adresKonu = (t) => getAddress('0x' + t.slice(26));
const ZAMAN_ASIMI = 'RPC zaman aşımı';

// Hız sınırına takılan RPC'de ethers isteği dakikalarca yeniden dener. Her çağrı süreyle sınırlanır ki özet takılmasın
function sureli(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, red) => { t = setTimeout(() => red(new Error(ZAMAN_ASIMI)), ms); })]).finally(() => clearTimeout(t));
}
const sureliProvider = (p, ms) => new Proxy(p, {
  get(h, k) {
    const v = h[k];
    if (typeof v !== 'function') return v;
    return (...a) => { const r = v.apply(h, a); return r && typeof r.then === 'function' ? sureli(r, ms) : r; };
  },
});

export class HoundTakip {
  constructor({ provider, dosya = null, cuzdanAdresi = async () => null, tokenPiyasa = null, parca = 5000, enKucukParca = 200, kontratlar = HOUND_KONTRATLAR, kurulumBlogu = HOUND_KURULUM_BLOGU, sureMs = 15_000 }) {
    Object.assign(this, { provider: sureliProvider(provider, sureMs), dosya, cuzdanAdresi, tokenPiyasa, parca, enKucukParca, kontratlar, kurulumBlogu });
    this.d = { sonBlok: kurulumBlogu - 1, mintler: [], bakiyeler: {}, sahipler: {}, blokZaman: {}, adlar: {} };
    this.gorseller = {};
    this.son = null;
    this.yukle();
  }

  yukle() {
    if (!this.dosya || !existsSync(this.dosya)) return;
    try { Object.assign(this.d, JSON.parse(readFileSync(this.dosya, 'utf8'))); } catch { /* bozuksa baştan okunur */ }
  }

  kaydet() {
    if (this.dosya) writeFileSync(this.dosya, JSON.stringify(this.d));
  }

  async oku(to, fn, args = []) {
    try {
      const r = OKU.decodeFunctionResult(fn, await this.provider.call({ to, data: OKU.encodeFunctionData(fn, args) }));
      return r.length === 1 ? r[0] : r;
    } catch { return null; }
  }

  // Yeni blokların olaylarını okur. Ücretsiz RPC aralığı reddederse parça küçültülür
  async olaylariOku() {
    const tepe = await this.provider.getBlockNumber();
    const adresler = Object.values(this.kontratlar).map((k) => k.adres);
    let parca = this.parca;
    while (this.d.sonBlok < tepe) {
      const bas = this.d.sonBlok + 1, son = Math.min(tepe, bas + parca - 1);
      let loglar;
      try {
        loglar = await this.provider.send('eth_getLogs', [{ fromBlock: toQuantity(bas), toBlock: toQuantity(son), address: adresler, topics: [[T.transfer, T.mined]] }]);
      } catch (e) {
        // Zaman aşımı aralık büyüklüğünden değil RPC'nin sınırından gelir: küçültmek yalnızca bekleme süresini katlar
        if (parca <= this.enKucukParca || e.message === ZAMAN_ASIMI) { this.kaydet(); throw e; }
        parca = Math.max(this.enKucukParca, Math.floor(parca / 2));
        continue;
      }
      for (const l of loglar) this.olayIsle(l);
      this.d.sonBlok = son;
    }
    this.kaydet();
  }

  olayIsle(l) {
    const tur = Object.entries(this.kontratlar).find(([, k]) => k.adres.toLowerCase() === String(l.address).toLowerCase())?.[0];
    if (!tur) return;
    const [t0, t1, t2, t3] = l.topics;
    if (t0 === T.mined) {
      const [nonce, bit, ucret] = OKU.getAbiCoder().decode(['uint256', 'uint256', 'uint256'], l.data);
      const kayit = { tur, madenci: adresKonu(t1), sira: Number(BigInt(t2)), nonce: nonce.toString(), bit: Number(bit), ucretWei: ucret.toString(), blok: Number(BigInt(l.blockNumber)), tx: l.transactionHash };
      if (!this.d.mintler.some((m) => m.tx === kayit.tx && m.tur === tur && m.sira === kayit.sira)) this.d.mintler.push(kayit);
      return;
    }
    const kimden = adresKonu(t1), kime = adresKonu(t2);
    if (tur === 'hound') {
      const b = (this.d.bakiyeler[tur] ||= {});
      const miktar = BigInt(l.data);
      if (kimden !== SIFIR) b[kimden] = (BigInt(b[kimden] || 0) - miktar).toString();
      if (kime !== SIFIR) b[kime] = (BigInt(b[kime] || 0) + miktar).toString();
    } else if (t3) {
      const s = (this.d.sahipler[tur] ||= {});
      if (kime === SIFIR) delete s[String(BigInt(t3))];
      else s[String(BigInt(t3))] = kime;
    }
  }

  async blokZamani(blok) {
    if (this.d.blokZaman[blok]) return this.d.blokZaman[blok];
    const b = await this.provider.getBlock(blok).catch(() => null);
    if (b) this.d.blokZaman[blok] = b.timestamp * 1000;
    return this.d.blokZaman[blok] || null;
  }

  // Agent ID adı (biar.ai gibi): en büyük sahipler ve madenciler için, önbellekli
  async agentAdi(adres) {
    if (adres in this.d.adlar) return this.d.adlar[adres];
    const h = await this.oku(AGENT_ID_KAYDI, 'handleOf', [adres]);
    this.d.adlar[adres] = h ? `${h}.ai` : null;
    return this.d.adlar[adres];
  }

  async nftGorsel(sira) {
    if (this.gorseller[sira]) return this.gorseller[sira];
    const uri = await this.oku(this.kontratlar.blockhound.adres, 'tokenURI', [BigInt(sira)]);
    if (!uri) return null;
    try { this.gorseller[sira] = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString()).image || null; } catch { return null; }
    return this.gorseller[sira];
  }

  async kontratOzet(tur, cuzdan, bnbUsd) {
    const k = this.kontratlar[tur];
    const [arz, basilan, donem, donemBoyu, bit, ucretWei, ucretUsd, bekleyenWei, benimki] = await Promise.all([
      this.oku(k.adres, 'totalSupply'), this.oku(k.adres, 'minted'), this.oku(k.adres, 'epoch'), this.oku(k.adres, 'epochSize'),
      this.oku(k.adres, 'difficultyBits'), this.oku(k.adres, 'mintFee'), this.oku(k.adres, 'feeUsd'),
      this.provider.getBalance(k.adres).catch(() => null), cuzdan ? this.oku(k.adres, 'balanceOf', [cuzdan]) : null,
    ]);
    const mintler = this.d.mintler.filter((m) => m.tur === tur).sort((a, b) => b.blok - a.blok);
    const birim = tur === 'hound' ? 10_000 : 1;

    // Sahipler: token için olaylardan hesaplanan bakiye, NFT için kimlik başına sahip
    let sahipler;
    if (tur === 'hound') {
      sahipler = Object.entries(this.d.bakiyeler[tur] || {}).map(([adres, w]) => ({ adres, miktar: Number(formatUnits(BigInt(w), 18)) })).filter((s) => s.miktar > 0);
    } else {
      const say = {};
      for (const sahip of Object.values(this.d.sahipler[tur] || {})) say[sahip] = (say[sahip] || 0) + 1;
      sahipler = Object.entries(say).map(([adres, miktar]) => ({ adres, miktar }));
    }
    sahipler.sort((a, b) => b.miktar - a.miktar);
    const toplam = sahipler.reduce((t, s) => t + s.miktar, 0);
    const enBuyuk = await Promise.all(sahipler.slice(0, 10).map(async (s) => ({ ...s, yuzde: toplam ? (s.miktar / toplam) * 100 : 0, agent: await this.agentAdi(s.adres) })));

    const madenciSay = {};
    for (const m of mintler) madenciSay[m.madenci] = (madenciSay[m.madenci] || 0) + 1;
    const madenciler = await Promise.all(Object.entries(madenciSay).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(async ([adres, mint]) => ({ adres, mint, agent: await this.agentAdi(adres) })));

    const sonMintler = await Promise.all(mintler.slice(0, 15).map(async (m) => ({
      ...m, zaman: await this.blokZamani(m.blok), agent: await this.agentAdi(m.madenci), ucretBnb: Number(formatEther(BigInt(m.ucretWei))),
      gorsel: tur === 'blockhound' && mintler.indexOf(m) < 6 ? await this.nftGorsel(m.sira + 1) : undefined,
    })));
    const gelirBnb = mintler.reduce((t, m) => t + Number(formatEther(BigInt(m.ucretWei))), 0);

    // Son 24 saatte saatlik mint sayısı (blok zamanından)
    const simdi = Date.now();
    const saatlik = Array(24).fill(0);
    const son24 = mintler.filter((m) => this.d.blokZaman[m.blok] && simdi - this.d.blokZaman[m.blok] < 864e5);
    for (const m of son24) saatlik[23 - Math.floor((simdi - this.d.blokZaman[m.blok]) / 36e5)]++;

    const n = basilan == null ? mintler.length : Number(basilan);
    const boy = donemBoyu == null ? null : Number(donemBoyu);
    return {
      tur, ad: k.ad, adres: k.adres,
      arz: arz == null ? null : tur === 'hound' ? Number(formatUnits(arz, 18)) : Number(arz),
      basilan: n, birim, donem: donem == null ? null : Number(donem), donemBoyu: boy, zorlukBit: bit == null ? null : Number(bit),
      sonrakiZorlasmaya: boy ? boy - (n % boy) : null, ortalamaHash: bit == null ? null : 2 ** Number(bit),
      ucretUsd: ucretUsd == null ? null : Number(ucretUsd) / 1e8, ucretBnb: ucretWei == null ? null : Number(formatEther(ucretWei)),
      sahipSayisi: sahipler.length, enBuyukSahipler: enBuyuk, ilk10Yuzde: enBuyuk.reduce((t, s) => t + s.yuzde, 0),
      madenciSayisi: Object.keys(madenciSay).length, madenciler,
      gelirBnb, gelirUsd: bnbUsd ? gelirBnb * bnbUsd : null, bekleyenBnb: bekleyenWei == null ? null : Number(formatEther(bekleyenWei)),
      son24: son24.length, saatlik, sonMintler,
      benimki: benimki == null ? null : tur === 'hound' ? Number(formatUnits(benimki, 18)) : Number(benimki),
    };
  }

  async ozet() {
    // Yeni olaylar okunamazsa son okunan bloğa kadarki verilerle özet yine çıkar; hata özete yazılır
    const olayHatasi = await this.olaylariOku().then(() => null, (e) => e.shortMessage || e.message);
    const [cuzdan, fiyat, kasaWei] = await Promise.all([
      this.cuzdanAdresi().catch(() => null), this.oku(BNB_USD, 'latestRoundData'), this.provider.getBalance(HOUND_KASA).catch(() => null),
    ]);
    const bnbUsd = fiyat ? Number(fiyat[1]) / 1e8 : null;
    const [hound, blockhound] = await Promise.all([this.kontratOzet('hound', cuzdan, bnbUsd), this.kontratOzet('blockhound', cuzdan, bnbUsd)]);
    const piyasa = this.tokenPiyasa ? await this.tokenPiyasa(this.kontratlar.hound.adres).catch(() => null) : null;
    this.kaydet();
    this.son = {
      guncelleme: Date.now(), sonBlok: this.d.sonBlok, olayHatasi, bnbUsd, cuzdan,
      kasa: { adres: HOUND_KASA, bnb: kasaWei == null ? null : Number(formatEther(kasaWei)) },
      hound: { ...hound, piyasa }, blockhound,
    };
    return this.son;
  }
}
