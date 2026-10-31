// Lider tablosu: BSC'de en çok kazanan, en isabetli, en çok işlem yapan ve en zengin aktif cüzdanlar.
// Kaynak OKX Onchain OS CLI (onchainos). Sadece okuma yapar, hiçbir işlem göndermez.
// "En zengin" sıralaması zincirin tamamı değil: kazanç ve hacim listelerindeki aktif cüzdanların BSC'deki varlık değeridir.
import { execFile } from 'node:child_process';
import { ONCHAINOS_BIN } from './config.js';

export function onchainosCalistir(args, { zamanAsimi = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(ONCHAINOS_BIN, args, { timeout: zamanAsimi, maxBuffer: 16 << 20 }, (err, stdout) => {
      if (err?.code === 'ENOENT') return reject(new Error('onchainos bulunamadı. OKX Onchain OS CLI kurulu olmalı (ONCHAINOS_BIN ile yol verilebilir).'));
      let json = null;
      try { json = JSON.parse(String(stdout || '').trim()); } catch { /* JSON değil */ }
      if (json?.ok === false) return reject(new Error(`OKX: ${String(json.error || 'bilinmeyen hata').slice(0, 200)}`));
      if (err || !json) return reject(new Error(`onchainos çalışmadı: ${String(err?.message || stdout).slice(0, 200)}`));
      resolve(json.data);
    });
  });
}

export const SURELER = { '1g': '1', '3g': '2', '7g': '3', '30g': '4', '90g': '5' };
export const SIRALAMALAR = { kazanc: '1', isabet: '2', islem: '3', hacim: '4', roi: '5', servet: null };
export const TURLER = ['hepsi', 'smartMoney', 'sniper', 'dev', 'fresh', 'pump', 'influencer'];

const sayi = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const adresGecerli = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));

export function satirCevir(x) {
  return {
    adres: String(x.walletAddress || '').toLowerCase(),
    kazancUsd: sayi(x.realizedPnlUsd),
    roi: sayi(x.realizedPnlPercent),
    isabet: sayi(x.winRatePercent),
    islem: sayi(x.txs),
    hacimUsd: sayi(x.txVolume),
    ortAlisUsd: sayi(x.avgBuyValueUsd),
    sonAktif: sayi(x.lastActiveTimestamp),
    enIyi: (x.topPnlTokenList || []).slice(0, 3).map((t) => ({
      sembol: String(t.tokenSymbol || '?').slice(0, 24), kontrat: String(t.tokenContractAddress || '').toLowerCase(),
      kazancUsd: sayi(t.tokenPnLUsd), yuzde: sayi(t.tokenPnLPercent),
    })),
  };
}

export class LiderServisi {
  constructor({ calistir = onchainosCalistir, listeMs = 5 * 60_000, degerMs = 30 * 60_000, paralel = 4 } = {}) {
    Object.assign(this, { calistir, listeMs, degerMs, paralel });
    this.listeler = new Map();
    this.degerler = new Map();
    this.dolduruluyor = null;
  }

  async #ham({ sure, sira, tur }) {
    const k = `${sure}|${sira}|${tur}`;
    const o = this.listeler.get(k);
    if (o && Date.now() - o.at < this.listeMs) return o.v;
    const args = ['leaderboard', 'list', '--chain', 'bsc', '--time-frame', SURELER[sure], '--sort-by', sira];
    if (tur !== 'hepsi') args.push('--wallet-type', tur);
    const v = ((await this.calistir(args)) || []).map(satirCevir).filter((r) => adresGecerli(r.adres));
    this.listeler.set(k, { at: Date.now(), v });
    return v;
  }

  #deger(adres) {
    const o = this.degerler.get(adres);
    // Alınamayan değer 2 dakika sonra yeniden denenir
    return o && Date.now() - o.at < (o.hata ? 120_000 : this.degerMs) ? o.v : undefined;
  }

  async #degerleriDoldur(adresler) {
    const eksik = [...new Set(adresler)].filter((a) => this.#deger(a) === undefined);
    let i = 0;
    const isci = async () => {
      while (i < eksik.length) {
        const a = eksik[i++];
        let d = null;
        for (let deneme = 0; deneme < 2 && d === null; deneme++) {
          d = await this.calistir(['portfolio', 'total-value', '--address', a, '--chains', 'bsc'], { zamanAsimi: 20_000 }).catch(() => null);
        }
        const v = d ? sayi(d[0]?.totalValue) : null;
        this.degerler.set(a, { at: Date.now(), v, hata: v === null });
      }
    };
    await Promise.all(Array.from({ length: this.paralel }, isci));
  }

  async liste({ sure = '7g', siralama = 'kazanc', tur = 'hepsi' } = {}) {
    if (!(sure in SURELER)) throw new Error('Geçersiz süre');
    if (!(siralama in SIRALAMALAR)) throw new Error('Geçersiz sıralama');
    if (!TURLER.includes(tur)) throw new Error('Geçersiz cüzdan türü');

    let satirlar;
    if (siralama === 'servet') {
      // En zengin: kazanç ve hacim listelerinin birleşimi, BSC varlık değerine göre
      const [a, b] = await Promise.all([this.#ham({ sure, sira: '1', tur }), this.#ham({ sure, sira: '4', tur })]);
      const m = new Map();
      for (const r of [...a, ...b]) if (!m.has(r.adres)) m.set(r.adres, r);
      satirlar = [...m.values()];
      await this.#degerleriDoldur(satirlar.map((r) => r.adres));
    } else {
      satirlar = await this.#ham({ sure, sira: SIRALAMALAR[siralama], tur });
      // Değerler arka planda dolar, sonraki yenilemede görünür
      if (!this.dolduruluyor) this.dolduruluyor = this.#degerleriDoldur(satirlar.map((r) => r.adres)).finally(() => { this.dolduruluyor = null; });
    }
    satirlar = satirlar.map((r) => ({ ...r, degerUsd: this.#deger(r.adres) ?? null }));
    if (siralama === 'servet') satirlar.sort((x, y) => (y.degerUsd ?? -1) - (x.degerUsd ?? -1));
    return {
      sure, siralama, tur, guncelleme: Date.now(),
      degerHazir: satirlar.filter((r) => r.degerUsd != null).length,
      satirlar: satirlar.slice(0, 100).map((r, i) => ({ sira: i + 1, ...r })),
    };
  }

  // Bir cüzdanın son DEX işlemleri ve güncel BSC değeri
  async cuzdan(adres) {
    if (!adresGecerli(adres)) throw new Error('Geçersiz cüzdan adresi');
    const a = adres.toLowerCase();
    const [islemler] = await Promise.all([
      this.calistir(['tracker', 'activities', '--tracker-type', 'multi_address', '--wallet-address', a, '--chain', 'bsc']),
      this.#degerleriDoldur([a]),
    ]);
    const liste = Array.isArray(islemler) ? islemler : islemler?.trades || [];
    return {
      adres: a,
      degerUsd: this.#deger(a) ?? null,
      islemler: liste.slice(0, 30).map((t) => ({
        zaman: sayi(t.tradeTime), tur: String(t.tradeType) === '1' ? 'alis' : 'satis',
        sembol: String(t.tokenSymbol || '?').slice(0, 24), kontrat: String(t.tokenContractAddress || '').toLowerCase(),
        bnb: sayi(t.quoteTokenAmount), kazancUsd: sayi(t.realizedPnlUsd), piyasaDegeri: sayi(t.marketCap),
        txHash: /^0x[0-9a-fA-F]{64}$/.test(String(t.txHash)) ? t.txHash : null,
      })),
    };
  }
}
