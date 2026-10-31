// Agent ID'ye özel Four.meme lansmanlarını Binance'in resmi listeleme API'sinden (meme-rush skill'inin kullandığı uç nokta) tarar.
// Sadece okuma yapar. Gelen alanlar dış veridir: arayüzde her zaman kaçışlanarak gösterilir.
import { EventEmitter } from 'node:events';

export const RUSH_URL = 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list/ai';
export const ASAMALAR = { yeni: 10, bitmekUzere: 20, dex: 30 };
const AGENT_ID_FILTRE = { 2004: ['openfour.meme.AgentIdExclusive'] };

const sayi = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// API satırını arayüzün ihtiyaç duyduğu alanlara indirger. null = bilinmiyor (0 değil)
export function satirNormalize(r) {
  if (!r || typeof r.contractAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(r.contractAddress)) return null;
  const icon = typeof r.icon === 'string' ? (r.icon.startsWith('http') ? r.icon : `https://bin.bnbstatic.com${r.icon}`) : null;
  const url = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
  return {
    adres: r.contractAddress,
    sembol: String(r.symbol ?? '').slice(0, 40),
    ad: String(r.name ?? '').slice(0, 80),
    ikon: icon && /^https:\/\//.test(icon) ? icon : null,
    olusturma: sayi(r.createTime),
    ilerleme: sayi(r.progress),
    holder: sayi(r.holders),
    piyasaDegeri: sayi(r.marketCap),
    likidite: sayi(r.liquidity),
    hacim: sayi(r.volume),
    fiyat: sayi(r.price),
    alim: sayi(r.countBuy), satim: sayi(r.countSell),
    top10: sayi(r.holdersTop10Percent),
    devSatti: sayi(r.devSellPercent),
    devPozisyon: r.devPosition ?? null,
    vergiAl: sayi(r.taxRateBuy), vergiSat: sayi(r.taxRateSell),
    dexDurum: sayi(r.migrateStatus),
    dev: typeof r.devAddress === 'string' ? r.devAddress : null,
    sosyal: { web: url(r.socials?.website), x: url(r.socials?.twitter), telegram: url(r.socials?.telegram) },
  };
}

export class Tarayici extends EventEmitter {
  constructor({ aralikMs = 5000, limit = 50, fetchFn = globalThis.fetch } = {}) {
    super();
    Object.assign(this, { aralikMs, limit, fetchFn });
    this.listeler = { yeni: [], bitmekUzere: [], dex: [] };
    this.gorulen = new Set();
    this.ilkTur = true;
    this.durum = { calisiyor: false, sonBasari: 0, sonHata: null, hataSayisi: 0 };
  }

  async asamaGetir(rankType) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await this.fetchFn(RUSH_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'accept-encoding': 'identity', 'user-agent': 'binance-web3/2.0 (Skill)' },
        body: JSON.stringify({ chainId: '56', rankType, protocol: [2004], tokenVersionFilter: AGENT_ID_FILTRE, limit: this.limit }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.code && j.code !== '000000') throw new Error(`API ${j.code}: ${j.message || ''}`);
      const rows = Array.isArray(j.data) ? j.data : j.data?.list || [];
      return rows.map(satirNormalize).filter(Boolean);
    } finally { clearTimeout(t); }
  }

  async tur() {
    const sonuc = await Promise.allSettled(Object.entries(ASAMALAR).map(async ([ad, rt]) => [ad, await this.asamaGetir(rt)]));
    const hatalar = [];
    for (const s of sonuc) {
      if (s.status === 'rejected') { hatalar.push(s.reason?.message || String(s.reason)); continue; }
      const [ad, list] = s.value;
      this.listeler[ad] = list;
      if (ad === 'yeni') {
        for (const t of list) {
          if (this.gorulen.has(t.adres)) continue;
          this.gorulen.add(t.adres);
          if (!this.ilkTur) this.emit('yeni', t);   // açılıştaki mevcut liste için uyarı verme
        }
      }
    }
    if (hatalar.length) { this.durum.sonHata = hatalar[0]; this.durum.hataSayisi++; } else { this.durum.sonHata = null; this.durum.hataSayisi = 0; }
    if (hatalar.length < sonuc.length) this.durum.sonBasari = Date.now();
    this.ilkTur = false;
  }

  baslat() {
    if (this.durum.calisiyor) return;
    this.durum.calisiyor = true;
    const dongu = async () => {
      if (!this.durum.calisiyor) return;
      await this.tur().catch((e) => { this.durum.sonHata = e.message; });
      // hata üst üste gelirse yavaşla (en fazla 60 sn)
      const bekle = Math.min(60_000, this.aralikMs * 2 ** Math.min(this.durum.hataSayisi, 4));
      this.zamanlayici = setTimeout(dongu, bekle);
    };
    dongu();
  }

  durdur() { this.durum.calisiyor = false; clearTimeout(this.zamanlayici); }
}
