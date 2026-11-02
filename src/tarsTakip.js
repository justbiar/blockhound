// Solana'daki TARS launchpad'inin (Agent ID'ye özel) tokenlerini herkese açık JSON API'sinden izler. Sadece okuma yapar,
// cüzdan kullanmaz. Siper'deki Four.meme listesiyle aynı biçime (yeni / dolmak üzere / DEX'te) indirger.
// Gelen alanlar dış veridir: arayüzde her zaman kaçışlanarak gösterilir.
import { EventEmitter } from 'node:events';

export const TARS_URL = 'https://tars.meme';
const BITMEK_UZERE = 70; // curve yüzdesi
const AKTIVITE_TUR_BASI = 8; // her turda en fazla bu kadar tokenin işlem akışı okunur
const SOLANA_ADRES = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BAGLANTI_HATASI = /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|aborted/i;

const sayi = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const url = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

// API satırını arayüz alanlarına indirger. null = bilinmiyor (0 değil). Dolar değerleri SOL fiyatıyla hesaplanır
export function tarsNormalize(r, solUsd = null) {
  if (!r || typeof r.ca !== 'string' || !SOLANA_ADRES.test(r.ca)) return null;
  const mcSol = sayi(r.marketCapSol);
  const fiyatSol = sayi(r.priceSol);
  return {
    zincir: 'solana', kaynak: 'tars',
    adres: r.ca,
    sembol: String(r.symbol ?? '').slice(0, 40),
    ad: String(r.name ?? '').slice(0, 80),
    ikon: url(r.imageUri),
    olusturma: r.createdAt ? Date.parse(r.createdAt) || null : null,
    durum: r.status === 'graduated' ? 'dex' : 'curve',
    ilerleme: sayi(r.progress),
    holder: sayi(r.holders),
    piyasaDegeriSol: mcSol,
    piyasaDegeri: mcSol != null && solUsd ? mcSol * solUsd : null,
    fiyat: fiyatSol != null && solUsd ? fiyatSol * solUsd : null,
    toplananSol: sayi(r.raisedSol), hedefSol: sayi(r.targetSol),
    hacimSol: sayi(r.volume24hSol), degisim24: sayi(r.change24h),
    dev: typeof r.creator === 'string' && SOLANA_ADRES.test(r.creator) ? r.creator : null,
    dexHavuz: typeof r.dexPoolAddress === 'string' && SOLANA_ADRES.test(r.dexPoolAddress) ? r.dexPoolAddress : null,
    alim: null, satim: null, top10: null, devSatti: null, senkron: null, ajanSayisi: null,
    sosyal: { web: url(r.website), x: url(r.twitter), telegram: url(r.telegram) },
  };
}

// Son işlemlerden: alım / satım sayısı, geliştiricinin sattığı oran ve aynı saniyede birden çok cüzdandan gelen alımlar.
// Aynı saniyede 3+ farklı cüzdan ya da eşit tutarlı 2+ alım, tek elden yönetilen cüzdanların ya da botun işareti olabilir
export function aktiviteAnaliz(kalemler, dev = null) {
  const islemler = (kalemler || []).filter((k) => k && (k.type === 'buy' || k.type === 'sell'));
  const alimlar = islemler.filter((k) => k.type === 'buy');
  let devAldi = 0, devSatti = 0;
  for (const k of islemler) if (dev && k.wallet === dev) { if (k.type === 'buy') devAldi += Number(k.tokens) || 0; else devSatti += Number(k.tokens) || 0; }
  const saniye = new Map();
  for (const k of alimlar) {
    const s = String(k.timestamp || k.createdAt || '').slice(0, 19);
    if (!s) continue;
    if (!saniye.has(s)) saniye.set(s, []);
    saniye.get(s).push(k);
  }
  let senkron = 0;
  for (const grup of saniye.values()) {
    const cuzdan = new Set(grup.map((k) => k.wallet));
    const tutar = new Map();
    for (const k of grup) tutar.set(k.amountSol, (tutar.get(k.amountSol) || 0) + 1);
    const esit = Math.max(0, ...tutar.values());
    if (cuzdan.size >= 3 || (cuzdan.size >= 2 && esit >= 2)) senkron += grup.length;
  }
  const ajanlar = new Set(islemler.map((k) => k.agent).filter((a) => typeof a === 'string' && a.endsWith('.ai')));
  return {
    alim: alimlar.length, satim: islemler.length - alimlar.length, senkron, ajanSayisi: ajanlar.size,
    devSatti: devAldi > 0 ? Math.min(100, (devSatti / devAldi) * 100) : devSatti > 0 ? 100 : 0,
  };
}

export function kategorile(tokenler) {
  const yeni = [], bitmekUzere = [], dex = [];
  for (const t of tokenler) {
    if (t.durum === 'dex') dex.push(t);
    else if ((t.ilerleme ?? 0) >= BITMEK_UZERE) bitmekUzere.push(t);
    else yeni.push(t);
  }
  yeni.sort((a, b) => (b.olusturma || 0) - (a.olusturma || 0));
  bitmekUzere.sort((a, b) => (b.ilerleme || 0) - (a.ilerleme || 0));
  dex.sort((a, b) => (b.piyasaDegeri ?? b.piyasaDegeriSol ?? 0) - (a.piyasaDegeri ?? a.piyasaDegeriSol ?? 0));
  return { yeni: yeni.slice(0, 50), bitmekUzere: bitmekUzere.slice(0, 50), dex: dex.slice(0, 50) };
}

export class TarsTakip extends EventEmitter {
  constructor({ aralikMs = 15_000, fetchFn = globalThis.fetch } = {}) {
    super();
    Object.assign(this, { aralikMs, fetchFn });
    this.listeler = { yeni: [], bitmekUzere: [], dex: [] };
    this.solUsd = null;
    this.aktivite = new Map(); // adres -> { anahtar, analiz }
    this.gorulen = new Set();
    this.ilkTur = true;
    this.durum = { calisiyor: false, sonBasari: 0, sonHata: null, hataSayisi: 0 };
  }

  async getir(yol) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await this.fetchFn(`${TARS_URL}${yol}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`TARS HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  async tokenleriGetir() {
    const satirlar = [];
    let imlec = null;
    for (let sayfa = 0; sayfa < 5; sayfa++) { // en fazla 500 token
      const j = await this.getir(`/api/tokens?limit=100${imlec ? `&cursor=${encodeURIComponent(imlec)}` : ''}`);
      satirlar.push(...(Array.isArray(j.items) ? j.items : []));
      imlec = typeof j.nextCursor === 'string' ? j.nextCursor : null;
      if (!imlec) break;
    }
    return satirlar;
  }

  // İşlem akışı yalnızca token değiştiyse (toplanan SOL ya da hacim) ve sınırlı sayıda token için yeniden okunur
  async aktiviteGuncelle(tokenler) {
    const adaylar = tokenler
      .map((t) => ({ t, anahtar: `${t.toplananSol}|${t.hacimSol}|${t.holder}` }))
      .filter(({ t, anahtar }) => (t.hacimSol || t.toplananSol) && this.aktivite.get(t.adres)?.anahtar !== anahtar)
      .sort((a, b) => (b.t.hacimSol || 0) - (a.t.hacimSol || 0))
      .slice(0, AKTIVITE_TUR_BASI);
    for (const { t, anahtar } of adaylar) {
      try {
        const j = await this.getir(`/api/activity?mint=${encodeURIComponent(t.adres)}&limit=100`);
        this.aktivite.set(t.adres, { anahtar, analiz: aktiviteAnaliz(j.items, t.dev) });
      } catch { /* bir tokenin akışı okunamazsa diğerleri devam eder */ }
    }
  }

  async tur() {
    const [piyasa, satirlar] = await Promise.all([this.getir('/api/market').catch(() => null), this.tokenleriGetir()]);
    if (piyasa && !piyasa.unavailable && sayi(piyasa.price)) this.solUsd = sayi(piyasa.price);
    const tokenler = satirlar.map((r) => tarsNormalize(r, this.solUsd)).filter(Boolean);
    await this.aktiviteGuncelle(tokenler);
    for (const t of tokenler) Object.assign(t, this.aktivite.get(t.adres)?.analiz || {});
    this.listeler = kategorile(tokenler);
    for (const t of this.listeler.yeni) {
      if (this.gorulen.has(t.adres)) continue;
      this.gorulen.add(t.adres);
      if (!this.ilkTur) this.emit('yeni', t);
    }
    this.ilkTur = false;
    this.durum.sonBasari = Date.now();
    this.durum.sonHata = null;
    this.durum.hataSayisi = 0;
  }

  baslat() {
    if (this.durum.calisiyor) return;
    this.durum.calisiyor = true;
    const dongu = async () => {
      if (!this.durum.calisiyor) return;
      await this.tur().then(() => { this.durum.ulasilamiyor = false; }).catch((e) => {
        this.durum.sonHata = e.message;
        this.durum.hataSayisi++;
        // Bağlantı hiç kurulamadıysa (site kapalı, DNS ya da zaman aşımı) arayüz ham hata yerine bunu söyler
        this.durum.ulasilamiyor = BAGLANTI_HATASI.test(`${e.message} ${e.cause?.code || ''}`) || e.name === 'AbortError';
      });
      const bekle = Math.min(120_000, this.aralikMs * 2 ** Math.min(this.durum.hataSayisi, 3));
      this.durum.sonrakiDeneme = Date.now() + bekle;
      this.zamanlayici = setTimeout(dongu, bekle);
    };
    dongu();
  }

  durdur() { this.durum.calisiyor = false; clearTimeout(this.zamanlayici); }
}
