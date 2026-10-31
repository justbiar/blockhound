// Otomasyon: sniper (yeni Agent ID lansmanında otomatik alım) ve otomatik satış (kâr al / zarar kes).
// Varsayılan: hepsi KAPALI ve SİMÜLASYON. Gerçek işlem için hem CANLI_ISLEM=1 hem de ilgili modülde simülasyonun kapatılması gerekir.
// Tüm emirler islemler.js üzerinden gider: limitler, preview incelemesi ve calldata doğrulaması aynen uygulanır.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';

export const VARSAYILAN = {
  acilDurdur: false,
  sniper: {
    acik: false, simulasyon: true,
    bnb: 0.001, kayma: 20,
    // Open Four ilk 6 blokta anti-sniper ek ücreti alıyor (blok 0'da %100): bu süreden önce alma
    minYasSn: 8, maxYasSn: 120, minHolder: null, maxTop10: null, devSattiGizle: true,
    gunlukMaxToken: 5,
  },
  otoSatis: {
    acik: false, simulasyon: true,
    karAl: [{ kat: 2, yuzde: 50 }, { kat: 4, yuzde: 100 }],
    zararKes: 50,          // giriş fiyatının %50 altına inerse hepsini sat. null = kapalı
    kontrolSn: 15, maxSureSaat: 24,
  },
};

const sayi = (v, min, max, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
const nsayi = (v, min, max) => (v === null || v === '' || v === undefined ? null : sayi(v, min, max, null));

// Kullanıcıdan gelen ayarı güvenli aralıklara sıkıştırır
export function ayarTemizle(g = {}, islemBasiMax = Infinity) {
  const s = g.sniper || {}, o = g.otoSatis || {};
  const D = VARSAYILAN;
  return {
    acilDurdur: !!g.acilDurdur,
    sniper: {
      acik: !!s.acik, simulasyon: s.simulasyon !== false,
      bnb: sayi(s.bnb, 0, Math.min(islemBasiMax, 1), D.sniper.bnb),
      kayma: sayi(s.kayma, 1, 50, D.sniper.kayma),
      minYasSn: sayi(s.minYasSn, 5, 600, D.sniper.minYasSn),
      maxYasSn: sayi(s.maxYasSn, 5, 3600, D.sniper.maxYasSn),
      minHolder: nsayi(s.minHolder, 0, 1e6), maxTop10: nsayi(s.maxTop10, 0, 100),
      devSattiGizle: s.devSattiGizle !== false,
      gunlukMaxToken: sayi(s.gunlukMaxToken, 0, 50, D.sniper.gunlukMaxToken),
    },
    otoSatis: {
      acik: !!o.acik, simulasyon: o.simulasyon !== false,
      karAl: (Array.isArray(o.karAl) ? o.karAl : D.otoSatis.karAl)
        .map((k) => ({ kat: sayi(k?.kat, 1.01, 1000, null), yuzde: sayi(k?.yuzde, 1, 100, null) }))
        .filter((k) => k.kat && k.yuzde).sort((a, b) => a.kat - b.kat).slice(0, 5),
      zararKes: nsayi(o.zararKes, 1, 99),
      kontrolSn: sayi(o.kontrolSn, 5, 600, D.otoSatis.kontrolSn),
      maxSureSaat: sayi(o.maxSureSaat, 0.1, 720, D.otoSatis.maxSureSaat),
    },
  };
}

// Sniper filtresi (saf fonksiyon)
export function sniperFiltre(t, s, simdi = Date.now()) {
  if (t.dexDurum != null && t.dexDurum !== 0) return { ok: false, sebep: 'Bonding curve\'de değil' };
  if (!t.olusturma) return { ok: false, sebep: 'Oluşturma zamanı bilinmiyor' };
  const yas = (simdi - t.olusturma) / 1000;
  if (yas < s.minYasSn) return { ok: false, sebep: `Çok yeni (${Math.round(yas)} sn < ${s.minYasSn} sn): anti-sniper ücreti riski` };
  if (yas > s.maxYasSn) return { ok: false, sebep: `Çok eski (${Math.round(yas)} sn > ${s.maxYasSn} sn)` };
  if (s.minHolder != null && !(t.holder >= s.minHolder)) return { ok: false, sebep: `Holder az (${t.holder ?? '?'})` };
  if (s.maxTop10 != null && !(t.top10 != null && t.top10 <= s.maxTop10)) return { ok: false, sebep: `Top10 yüksek ya da bilinmiyor (${t.top10 ?? '?'})` };
  if (s.devSattiGizle && t.devSatti != null && t.devSatti > 50) return { ok: false, sebep: `Dev satmış (%${Math.round(t.devSatti)})` };
  return { ok: true };
}

// Otomatik satış kararı (saf fonksiyon). oran = şimdiki birim fiyat / giriş birim fiyatı
// Dönüş: null | { yuzde, sebep, kat? }
export function satisKarari(poz, degerBnb, o) {
  if (!(poz.kalan > 0) || !(poz.girisBnb > 0) || !(poz.ilkMiktar > 0) || degerBnb == null) return null;
  const giris = poz.girisBnb / poz.ilkMiktar;
  const simdi = degerBnb / poz.kalan;
  const oran = simdi / giris;
  if (o.zararKes != null && oran <= 1 - o.zararKes / 100) return { yuzde: 100, sebep: `Zarar kes: fiyat girişin %${Math.round((1 - oran) * 100)} altında`, oran };
  const yapilan = new Set(poz.karAlYapilan || []);
  const kademe = [...o.karAl].reverse().find((k) => oran >= k.kat && !yapilan.has(k.kat));
  if (kademe) return { yuzde: kademe.yuzde, sebep: `Kâr al: ${kademe.kat}x (şu an ${oran.toFixed(2)}x)`, kat: kademe.kat, oran };
  return null;
}

const bugun = () => new Date().toISOString().slice(0, 10);
// Token miktarını, binlik ayırıcı ve üslü gösterim olmadan, aşağı yuvarlayarak yazar
export const miktarYaz = (x) => {
  const v = Math.floor(Number(x) * 1e6) / 1e6;
  return v > 0 ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 }) : '0';
};

export class Otomasyon extends EventEmitter {
  constructor({ islem, tarayici, canli, islemBasiMax, bnbFiyati, bakiyeGetir, ayarDosya, pozisyonDosya, logDosya }) {
    super();
    Object.assign(this, { islem, tarayici, canli, islemBasiMax, bnbFiyati, bakiyeGetir, ayarDosya, pozisyonDosya, logDosya });
    this.ayar = ayarTemizle(this.#oku(ayarDosya, VARSAYILAN), islemBasiMax);
    const p = this.#oku(pozisyonDosya, { pozisyonlar: [], sniperGun: { tarih: bugun(), sayi: 0 }, denenen: [] });
    this.pozisyonlar = p.pozisyonlar || [];
    this.sniperGun = p.sniperGun?.tarih === bugun() ? p.sniperGun : { tarih: bugun(), sayi: 0 };
    this.denenen = new Set(p.denenen || []);
    this.log = [];
    this.kuyruk = Promise.resolve();
    this.kilitli = new Set();
    tarayici.on('yeni', (t) => { this.kuyruk = this.kuyruk.then(() => this.yeniToken(t)).catch((e) => this.kaydet('sniper', `Hata: ${e.message}`, { token: t.adres })); });
  }

  #oku(f, d) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return structuredClone(d); } }
  #yaz() {
    try {
      writeFileSync(this.ayarDosya, JSON.stringify(this.ayar, null, 1));
      writeFileSync(this.pozisyonDosya, JSON.stringify({ pozisyonlar: this.pozisyonlar, sniperGun: this.sniperGun, denenen: [...this.denenen].slice(-2000) }));
    } catch { /* disk hatası otomasyonu durdurmasın */ }
  }

  kaydet(modul, mesaj, ek = {}) {
    const k = { zaman: Date.now(), modul, mesaj, ...ek };
    this.log.unshift(k); this.log.length = Math.min(this.log.length, 200);
    try { appendFileSync(this.logDosya, JSON.stringify(k) + '\n'); } catch { /* */ }
    this.emit('log', k);
    return k;
  }

  ayarGuncelle(yeni) {
    this.ayar = ayarTemizle({ ...this.ayar, ...yeni, sniper: { ...this.ayar.sniper, ...yeni.sniper }, otoSatis: { ...this.ayar.otoSatis, ...yeni.otoSatis } }, this.islemBasiMax);
    this.#yaz();
    this.kaydet('ayar', 'Ayarlar güncellendi', { ayar: this.ayar });
    return this.ayar;
  }

  acilDurdur() {
    this.ayar = ayarTemizle({ ...this.ayar, acilDurdur: true, sniper: { ...this.ayar.sniper, acik: false }, otoSatis: { ...this.ayar.otoSatis, acik: false } }, this.islemBasiMax);
    this.#yaz();
    this.kaydet('acil', 'ACİL DURDURMA: sniper ve otomatik satış kapatıldı');
    return this.ayar;
  }

  durum() {
    return { ayar: this.ayar, canliIslem: this.canli, sniperBugun: this.sniperGun.sayi, pozisyonlar: this.pozisyonlar.filter((p) => !p.kapandi), log: this.log.slice(0, 100) };
  }

  async yeniToken(t) {
    const a = this.ayar, s = a.sniper;
    if (a.acilDurdur || !s.acik) return;
    if (this.denenen.has(t.adres)) return;
    this.denenen.add(t.adres);
    const f = sniperFiltre(t, s);
    if (!f.ok) { this.kaydet('sniper', `Atlandı: ${f.sebep}`, { token: t.adres, sembol: t.sembol }); this.#yaz(); return; }
    if (this.sniperGun.tarih !== bugun()) this.sniperGun = { tarih: bugun(), sayi: 0 };
    if (this.sniperGun.sayi >= s.gunlukMaxToken) { this.kaydet('sniper', `Atlandı: günlük token sınırı (${s.gunlukMaxToken}) doldu`, { token: t.adres, sembol: t.sembol }); return; }
    this.sniperGun.sayi++;
    const sim = s.simulasyon || !this.canli;
    const bnb = String(s.bnb);

    if (sim) {
      const q = await this.islem.teklif({ yon: 'al', token: t.adres, miktar: bnb, kayma: s.kayma });
      this.pozisyonEkle({ token: t.adres, sembol: t.sembol, simulasyon: true, girisBnb: Number(q.fromCoinAmount), ilkMiktar: Number(q.toCoinAmount) });
      this.kaydet('sniper', `SİMÜLASYON alım: ${bnb} BNB → ~${q.toCoinAmount} ${t.sembol}`, { token: t.adres, sembol: t.sembol });
      return;
    }
    const e = await this.islem.al({ token: t.adres, bnb, kayma: s.kayma, kaynak: 'sniper' });
    const r = await this.islem.sonucBekle(e);
    if (r.durum === 'tamamlandi') {
      this.pozisyonEkle({ token: t.adres, sembol: t.sembol, simulasyon: false, girisBnb: Number(r.odenenBnb ?? bnb), ilkMiktar: Number(r.alinan ?? r.teklif?.toCoinAmount) });
      this.kaydet('sniper', `Alındı: ${r.odenenBnb ?? bnb} BNB → ${r.alinan ?? '?'} ${t.sembol}`, { token: t.adres, sembol: t.sembol, txHash: r.txHash });
    } else {
      this.kaydet('sniper', `Alım olmadı (${r.durum}): ${r.sebep || ''}`, { token: t.adres, sembol: t.sembol, txHash: r.txHash || null });
    }
  }

  pozisyonEkle({ token, sembol, simulasyon, girisBnb, ilkMiktar }) {
    if (!(girisBnb > 0) || !(ilkMiktar > 0)) return;
    this.pozisyonlar.push({ token, sembol, simulasyon, girisBnb, ilkMiktar, kalan: ilkMiktar, gelenBnb: 0, karAlYapilan: [], acilis: Date.now(), kapandi: false });
    this.#yaz();
  }

  async pozisyonDegeri(p) {
    if (p.simulasyon) {
      // simülasyonda elde token yok: tarayıcının fiyatını kullan (USD → BNB)
      const t = Object.values(this.tarayici.listeler).flat().find((x) => x.adres.toLowerCase() === p.token.toLowerCase());
      const bnbUsd = await this.bnbFiyati();
      return t?.fiyat != null && bnbUsd > 0 ? (p.kalan * t.fiyat) / bnbUsd : null;
    }
    return (await this.islem.degerBnb({ token: p.token, miktar: miktarYaz(p.kalan) })).bnb;
  }

  async satisTuru() {
    const o = this.ayar.otoSatis;
    if (this.ayar.acilDurdur || !o.acik) return;
    for (const p of this.pozisyonlar.filter((x) => !x.kapandi)) {
      if (this.kilitli.has(p.token)) continue;
      if (Date.now() - p.acilis > o.maxSureSaat * 3600_000) { p.kapandi = true; this.kaydet('oto-satis', 'Süre doldu, artık izlenmiyor', { token: p.token, sembol: p.sembol }); continue; }
      this.kilitli.add(p.token);
      try {
        const deger = await this.pozisyonDegeri(p);
        const k = satisKarari(p, deger, o);
        if (!k) continue;
        const sim = o.simulasyon || p.simulasyon || !this.canli;
        const satMiktar = k.yuzde >= 100 ? p.kalan : p.kalan * (k.yuzde / 100);
        if (sim) {
          p.gelenBnb += (deger ?? 0) * (satMiktar / p.kalan);
          p.kalan -= satMiktar;
          if (k.kat) p.karAlYapilan.push(k.kat);
          if (k.yuzde >= 100 || p.kalan <= 0) p.kapandi = true;
          this.kaydet('oto-satis', `SİMÜLASYON satış %${k.yuzde}: ${k.sebep}`, { token: p.token, sembol: p.sembol });
          continue;
        }
        const tumu = k.yuzde >= 100;
        const miktar = tumu && (await this.islem.rotaBelirle(p.token)).rota === 'contract-call' ? 'all' : await this.#satMiktari(p, satMiktar, tumu);
        const e = await this.islem.sat({ token: p.token, miktar, kaynak: 'oto-satis' });
        const r = await this.islem.sonucBekle(e);
        if (r.durum === 'tamamlandi') {
          p.kalan = Math.max(0, p.kalan - satMiktar);
          p.gelenBnb += Number(r.gelenBnb ?? r.alinan ?? 0);
          if (k.kat) p.karAlYapilan.push(k.kat);
          if (tumu || p.kalan <= 0) p.kapandi = true;
          this.kaydet('oto-satis', `Satıldı %${k.yuzde}: ${k.sebep}`, { token: p.token, sembol: p.sembol, txHash: r.txHash });
        } else {
          this.kaydet('oto-satis', `Satış olmadı (${r.durum}): ${r.sebep || ''}`, { token: p.token, sembol: p.sembol });
        }
      } catch (e) {
        this.kaydet('oto-satis', `Hata: ${e.message}`, { token: p.token, sembol: p.sembol });
      } finally {
        this.kilitli.delete(p.token);
        this.#yaz();
      }
    }
  }

  // DEX'te tamamını satarken cüzdandaki gerçek bakiyeyi kullan (yuvarlama tozu kalmasın)
  async #satMiktari(p, miktar, tumu) {
    if (!tumu) return miktarYaz(miktar);
    const b = (await this.bakiyeGetir()).find((x) => x.address?.toLowerCase() === p.token.toLowerCase());
    return b ? String(b.balance) : miktarYaz(miktar);
  }

  baslat() {
    const dongu = async () => {
      await this.satisTuru().catch((e) => this.kaydet('oto-satis', `Hata: ${e.message}`));
      this.zamanlayici = setTimeout(dongu, this.ayar.otoSatis.kontrolSn * 1000);
    };
    this.zamanlayici = setTimeout(dongu, 5000);
  }
}
