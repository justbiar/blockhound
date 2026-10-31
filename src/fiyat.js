// Piyasa verisi. Hepsi ücretsiz ve anahtarsız kaynaklar:
//  - Binance spot (BNBUSDT): BNB'nin saatlik geçmiş fiyatı, her işlemin dolar karşılığı için
//  - Binance Web3 pozisyon listesi: eldeki tokenlerin güncel fiyatı ve Binance'in kendi ortalama alış fiyatı
//  - Binance Web3 token dinamik bilgisi: listede olmayan tokenler için güncel fiyat
//  - GeckoTerminal: küçük tokenler dahil havuz bazlı fiyat mumları (dakikada ~30 istek sınırı)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SAAT = 3_600_000;
const BINANCE_BASLIK = { 'accept-encoding': 'identity', 'user-agent': 'binance-web3/2.0 (Skill)', clienttype: 'web', clientversion: '1.2.0' };
const W3 = 'https://web3.binance.com/bapi/defi';

async function jsonGetir(fetchFn, url, { basliklar = {}, zamanAsimiMs = 15_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), zamanAsimiMs);
  try {
    const r = await fetchFn(url, { headers: basliklar, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const sayiYaDaNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export class FiyatServisi {
  constructor({ fetchFn = globalThis.fetch, dosya = null, geckoAralikMs = 2_200 } = {}) {
    Object.assign(this, { fetchFn, dosya, geckoAralikMs });
    this.bnbSaatlik = new Map();   // saat başı (ms) -> kapanış
    this.havuzlar = {};            // token -> { havuz, at }
    this.mumlar = new Map();       // anahtar -> { at, v }
    this.geckoSira = Promise.resolve();
    this.sonGecko = 0;
    try {
      if (dosya && existsSync(dosya)) {
        const d = JSON.parse(readFileSync(dosya, 'utf8'));
        for (const [k, v] of d.bnbSaatlik || []) this.bnbSaatlik.set(Number(k), v);
        this.havuzlar = d.havuzlar || {};
      }
    } catch { /* önbellek yoksa baştan */ }
  }

  #kaydet() {
    if (!this.dosya) return;
    try { writeFileSync(this.dosya, JSON.stringify({ bnbSaatlik: [...this.bnbSaatlik], havuzlar: this.havuzlar })); } catch { /* önemli değil */ }
  }

  // Verilen zamanları kapsayan saatlik BNB fiyatlarını önbelleğe alır (tamamlanmış saatler kalıcı)
  async bnbGecmisHazirla(zamanlar) {
    const saatler = [...new Set(zamanlar.filter(Boolean).map((z) => Math.floor(z / SAAT) * SAAT))];
    const simdi = Math.floor(Date.now() / SAAT) * SAAT;
    const eksik = saatler.filter((s) => !this.bnbSaatlik.has(s) || s >= simdi - SAAT).sort((a, b) => a - b);
    if (!eksik.length) return;
    let bas = eksik[0];
    const son = eksik.at(-1);
    while (bas <= son) {
      const url = `https://api.binance.com/api/v3/klines?symbol=BNBUSDT&interval=1h&startTime=${bas}&limit=1000`;
      const mumlar = await jsonGetir(this.fetchFn, url);
      if (!Array.isArray(mumlar) || !mumlar.length) break;
      for (const m of mumlar) this.bnbSaatlik.set(Number(m[0]), Number(m[4]));
      bas = Number(mumlar.at(-1)[0]) + SAAT;
      if (mumlar.length < 1000) break;
    }
    this.#kaydet();
  }

  // Önbellekten o saatin kapanışı; yoksa en yakın bilinen saat
  bnbUsd(zaman) {
    const s = Math.floor(zaman / SAAT) * SAAT;
    if (this.bnbSaatlik.has(s)) return this.bnbSaatlik.get(s);
    let enIyi = null, fark = Infinity;
    for (const [k, v] of this.bnbSaatlik) { const d = Math.abs(k - s); if (d < fark) { fark = d; enIyi = v; } }
    return enIyi;
  }

  // Binance'in pozisyon listesi: güncel fiyatlar + Binance'in swap'lerden hesapladığı ortalama alış
  async pozisyonlar(cuzdan) {
    const sonuc = {};
    let bnbFiyat = null;
    for (let offset = 0; offset < 10; offset++) {
      const url = `${W3}/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list/ai?address=${cuzdan}&chainId=56&offset=${offset}`;
      const j = await jsonGetir(this.fetchFn, url, { basliklar: BINANCE_BASLIK });
      if (j?.code && j.code !== '000000') throw new Error(`Binance pozisyon API ${j.code}`);
      const liste = j?.data?.list || [];
      for (const x of liste) {
        const k = String(x.contractAddress || '').toLowerCase();
        if (!k) continue;
        bnbFiyat ??= sayiYaDaNull(x.baseCoinPrice);
        sonuc[k] = {
          sembol: String(x.symbol || '').slice(0, 30), ad: String(x.name || '').slice(0, 60),
          ikon: typeof x.icon === 'string' && x.icon.startsWith('/') ? `https://bin.bnbstatic.com${x.icon}` : null,
          fiyat: sayiYaDaNull(x.price), degisim24s: sayiYaDaNull(x.percentChange24h), miktar: sayiYaDaNull(x.remainQty),
          binanceOrtalama: sayiYaDaNull(x.avgPrice), binanceAlisUsd: sayiYaDaNull(x.buyAmtUsd), binanceSatisUsd: sayiYaDaNull(x.sellAmtUsd),
          likidite: sayiYaDaNull(x.liquidity), dusukLikidite: x.lowLiquidity === 1, risk: x.riskLevel ?? null,
        };
      }
      if (liste.length < 20) break;
    }
    return { tokenler: sonuc, bnbFiyat };
  }

  async tokenFiyati(adres) {
    const url = `${W3}/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=56&contractAddress=${adres}`;
    const j = await jsonGetir(this.fetchFn, url, { basliklar: BINANCE_BASLIK }).catch(() => null);
    return sayiYaDaNull(j?.data?.price);
  }

  // GeckoTerminal istekleri sıraya alınır: ücretsiz sınır dakikada ~30
  #gecko(url) {
    const is = this.geckoSira.then(async () => {
      const bekle = this.sonGecko + this.geckoAralikMs - Date.now();
      if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
      this.sonGecko = Date.now();
      return jsonGetir(this.fetchFn, url, { basliklar: { accept: 'application/json' } });
    });
    this.geckoSira = is.catch(() => {});
    return is;
  }

  async havuz(adres) {
    const k = adres.toLowerCase();
    const h = this.havuzlar[k];
    if (h && Date.now() - h.at < 6 * SAAT) return h.havuz;
    const j = await this.#gecko(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${k}/pools?page=1`).catch(() => null);
    const liste = (j?.data || []).map((p) => ({
      adres: p.attributes?.address, likidite: Number(p.attributes?.reserve_in_usd) || 0,
      tabanMi: String(p.relationships?.base_token?.data?.id || '').toLowerCase() === `bsc_${k}`,
    })).filter((p) => /^0x[0-9a-fA-F]{40}$/.test(p.adres || '')).sort((a, b) => b.likidite - a.likidite);
    const sec = liste[0] ? { adres: liste[0].adres, tabanMi: liste[0].tabanMi } : null;
    this.havuzlar[k] = { havuz: sec, at: Date.now() };
    this.#kaydet();
    return sec;
  }

  // Token fiyat mumları (USD): [{ zaman, acilis, yuksek, dusuk, kapanis, hacim }]. Havuzu yoksa boş döner
  async tokenMumlari(adres, { aralik = 'hour', limit = 200 } = {}) {
    const anahtar = `${adres.toLowerCase()}:${aralik}:${limit}`;
    const o = this.mumlar.get(anahtar);
    if (o && Date.now() - o.at < 10 * 60_000) return o.v;
    const h = await this.havuz(adres);
    if (!h) { this.mumlar.set(anahtar, { at: Date.now(), v: [] }); return []; }
    const yer = h.tabanMi ? 'base' : 'quote';
    const j = await this.#gecko(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${h.adres}/ohlcv/${aralik}?limit=${limit}&currency=usd&token=${yer}`).catch(() => null);
    const v = (j?.data?.attributes?.ohlcv_list || [])
      .map(([z, a, y, d, k, hcm]) => ({ zaman: z * 1000, acilis: a, yuksek: y, dusuk: d, kapanis: k, hacim: hcm }))
      .sort((a, b) => a.zaman - b.zaman);
    this.mumlar.set(anahtar, { at: Date.now(), v });
    return v;
  }

  bnbSeri(bas, son) {
    return [...this.bnbSaatlik].filter(([k]) => k >= bas && k <= son).sort((a, b) => a[0] - b[0]);
  }
}
