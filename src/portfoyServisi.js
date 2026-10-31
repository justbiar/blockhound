// Portföy servisi: defteri eşitler, fiyatları toplar ve kâr / zarar ile grafik serilerini üretir.
// Ağır çağrılar kısa süreli önbelleğe alınır; arayüz sık yenilese de kaynaklara yük binmez.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pnlHesapla, seriOlustur } from './pnl.js';
import { BNB_ADRES } from './defter.js';

const SAAT = 3_600_000;
const GUN = 24 * SAAT;

// Mumlardan, verilen andaki son kapanışı bulan fonksiyon
export function fiyatBulucu(mumlar) {
  return (z) => {
    let lo = 0, hi = mumlar.length - 1, sonuc = null;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (mumlar[m].zaman <= z) { sonuc = mumlar[m].kapanis; lo = m + 1; } else hi = m - 1;
    }
    return sonuc;
  };
}

export class PortfoyServisi {
  constructor({ baw, defter, fiyat, nftler, onbellekMs = 60_000, provider = null, standartDosya = null }) {
    Object.assign(this, { baw, defter, fiyat, nftler, onbellekMs, provider, standartDosya });
    // Kontrat standardı değişmez: zincirden bir kez okunur ve saklanır. adres -> 'nft' | 'token'
    this.standart = {};
    try { if (standartDosya && existsSync(standartDosya)) this.standart = JSON.parse(readFileSync(standartDosya, 'utf8')); } catch { /* baştan */ }
    this.son = null;
    this.seriSon = null;
    this.calisan = null;
  }

  async hesapla({ yenile = false } = {}) {
    if (!yenile && this.son && Date.now() - this.son.at < this.onbellekMs) return this.son.v;
    // Aynı anda gelen istekler tek hesabı paylaşır
    if (this.calisan) return this.calisan;
    this.calisan = this.#hesapla().finally(() => { this.calisan = null; });
    return this.calisan;
  }

  // Token numarası gelmeyen girişlerin kontratı NFT mi: ERC-721 / ERC-1155 arayüzü zincirden sorulur
  async #nftKontratlari(islemler) {
    const adaylar = new Set();
    for (const i of islemler) for (const k of [...i.giren, ...i.cikan]) if (k.tokenId == null && k.kontrat !== BNB_ADRES) adaylar.add(String(k.kontrat).toLowerCase());
    const sor = [...adaylar].filter((a) => !(a in this.standart)).slice(0, 80);
    if (sor.length && this.provider) {
      const arayuz = async (a, id) => { try { return BigInt(await this.provider.call({ to: a, data: '0x01ffc9a7' + id.padEnd(64, '0') })) === 1n; } catch { return false; } };
      await Promise.all(sor.map(async (a) => { this.standart[a] = (await arayuz(a, '80ac58cd')) || (await arayuz(a, 'd9b67a26')) ? 'nft' : 'token'; }));
      if (this.standartDosya) { try { writeFileSync(this.standartDosya, JSON.stringify(this.standart)); } catch { /* bellekte kalır */ } }
    }
    return new Set(Object.entries(this.standart).filter(([, t]) => t === 'nft').map(([a]) => a));
  }

  async #hesapla() {
    const cuzdan = await this.baw.adres();
    if (!cuzdan) throw new Error('Cüzdan bağlı değil');
    const esit = await this.defter.esitle(cuzdan);
    const islemler = this.defter.islemler();
    const nftKontratlari = await this.#nftKontratlari(islemler);
    await this.fiyat.bnbGecmisHazirla([...islemler.map((i) => i.zaman), Date.now()]);
    const [poz, nft] = await Promise.all([
      this.fiyat.pozisyonlar(cuzdan),
      this.nftler().catch(() => []),
    ]);
    // Pozisyon listesinde olmayan ama elde tutulan tokenlerin fiyatı ayrıca sorulur
    const guncel = { ...poz.tokenler };
    const nftAdetleri = {}, nftAdlari = {};
    for (const k of nft) { nftAdetleri[k.kontrat.toLowerCase()] = k.adet; nftAdlari[k.kontrat.toLowerCase()] = k.ad; }
    const bnbSimdi = poz.bnbFiyat ?? this.fiyat.bnbUsd(Date.now());
    const bnbGercek = poz.tokenler[BNB_ADRES]?.miktar ?? null;

    let r = pnlHesapla({ islemler, bnbUsd: (z) => this.fiyat.bnbUsd(z), guncel, bnbSimdi, bnbBakiyeGercek: bnbGercek, nftAdetleri, nftKontratlari });
    const eksik = r.varliklar.filter((v) => v.tur === 'token' && v.miktar > 0 && v.fiyat == null && !(v.kontrat in guncel)).slice(0, 10);
    if (eksik.length) {
      const fiyatlar = await Promise.all(eksik.map((v) => this.fiyat.tokenFiyati(v.kontrat).catch(() => null)));
      eksik.forEach((v, i) => { guncel[v.kontrat] = { fiyat: fiyatlar[i] }; });
      r = pnlHesapla({ islemler, bnbUsd: (z) => this.fiyat.bnbUsd(z), guncel, bnbSimdi, bnbBakiyeGercek: bnbGercek, nftAdetleri, nftKontratlari });
    }
    for (const v of r.varliklar) {
      if (v.tur === 'nft') { v.ad = nftAdlari[v.kontrat] || v.ad; if (!(v.kontrat in nftAdetleri)) v.dogrulanmadi = true; }
      // Grafik için hareketlerin son 100'ü yeter
      v.hareketler = v.hareketler.slice(-100);
    }
    const v = { ...r, cuzdan, guncelleme: Date.now(), defter: { islem: islemler.length, yeniKayit: esit.yeni, ilk: islemler[0]?.zaman ?? null } };
    this.son = { at: Date.now(), v };
    return v;
  }

  // Portföy değeri ve net kâr / zarar zaman serisi. Kısa geçmişte saatlik, uzunda günlük noktalar
  async seri({ yenile = false } = {}) {
    if (!yenile && this.seriSon && Date.now() - this.seriSon.at < 10 * 60_000) return this.seriSon.v;
    const p = await this.hesapla();
    const islemler = this.defter.islemler();
    if (!islemler.length) return { noktalar: [], adim: 'saat' };
    const simdi = Date.now();
    const bas = Math.floor(islemler[0].zaman / SAAT) * SAAT;
    const gunluk = simdi - bas > 8 * GUN;
    const adim = gunluk ? GUN : SAAT;
    const noktalar = [];
    for (let z = Math.max(bas, simdi - (gunluk ? 180 * GUN : 8 * GUN)); z <= simdi; z += adim) noktalar.push(z);
    noktalar.push(simdi);
    await this.fiyat.bnbGecmisHazirla(noktalar);

    // Grafik için en değerli ya da en çok işlem gören 8 token: GeckoTerminal sınırı yüzünden
    const tokenler = p.varliklar.filter((v) => v.tur === 'token' && (v.degerUsd > 0 || v.satisUsd > 0)).slice(0, 8);
    const bulucular = {};
    for (const t of tokenler) {
      const mumlar = await this.fiyat.tokenMumlari(t.kontrat, { aralik: gunluk ? 'day' : 'hour', limit: gunluk ? 180 : 200 }).catch(() => []);
      if (mumlar.length) bulucular[t.kontrat] = fiyatBulucu(mumlar);
      // Mumu olmayan ama güncel fiyatı olan token: son noktada güncel fiyat kullanılır
      else if (t.fiyat) bulucular[t.kontrat] = (z) => (z >= simdi - adim ? t.fiyat : null);
    }
    const s = seriOlustur({ islemler, noktalar, bnbUsd: (z) => this.fiyat.bnbUsd(z), fiyatAt: (k, z) => bulucular[k]?.(z) ?? null });
    const v = { noktalar: s, adim: gunluk ? 'gun' : 'saat', fiyatli: Object.keys(bulucular) };
    this.seriSon = { at: Date.now(), v };
    return v;
  }

  // Tek token için fiyat grafiği + alış / satış işaretleri
  async tokenGrafik(kontrat, { aralik = 'hour' } = {}) {
    const k = kontrat.toLowerCase();
    const p = await this.hesapla();
    const v = p.varliklar.find((x) => x.kontrat === k);
    const mumlar = await this.fiyat.tokenMumlari(k, { aralik, limit: aralik === 'day' ? 180 : aralik === 'minute' ? 300 : 200 });
    return { kontrat: k, sembol: v?.sembol ?? null, ortalamaUsd: v?.ortalamaUsd ?? null, mumlar, hareketler: v?.hareketler ?? [] };
  }
}
