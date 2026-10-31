// Fiyat emirleri: "şu fiyata gelince sat".
//  - Kâr al, Binance'te: baw limit-order sell. Binance tarafında bekler, bu bilgisayar kapalıyken de tetiklenir.
//  - Kâr al ya da zarar kes, bu terminalde: sunucu fiyatı izler, koşul art arda iki okumada sağlanınca
//    normal satış akışıyla (limitler, preview denetimi) satar. Terminal kapalıyken çalışmaz.
// Bir emir tetiklenmeden önce koşulu zaten sağlıyorsa reddedilir: koşullu emir sessizce anında satışa dönüşmez.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { adresKontrol } from './guard.js';

export const BNB_HEDEF = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const BITMIS = new Set(['tamamlandi', 'iptal', 'hata', 'FINISHED', 'FAILED', 'EXPIRED', 'CANCELED']);

export const kosulSaglandi = (tur, fiyat, tetik) => (tur === 'kar-al' ? fiyat >= tetik : fiyat <= tetik);

export class FiyatEmirleri {
  constructor({ baw, islem, fiyatGetir, bakiyeGetir, canli, dosya = null, aralikMs = 15_000, bildir = null }) {
    Object.assign(this, { baw, islem, fiyatGetir, bakiyeGetir, canli, dosya, aralikMs, bildir });
    this.emirler = [];
    this.binanceOnbellek = { at: 0, liste: [] };
    try { if (dosya && existsSync(dosya)) this.emirler = JSON.parse(readFileSync(dosya, 'utf8')); } catch { /* baştan */ }
  }

  #kaydet() { if (this.dosya) { try { writeFileSync(this.dosya, JSON.stringify(this.emirler, null, 2)); } catch { /* bellekte kalır */ } } }

  async olustur({ token, sembol = null, tur, tetikUsd, miktar, yer = 'terminal', kayma = null, onay }) {
    if (onay !== true) throw new Error('Fiyat emri için açık onay gerekli');
    if (!this.canli) throw new Error('Canlı işlem kapalı (.env: MOD=live ve CANLI_ISLEM=1): fiyat emri kurulamaz');
    adresKontrol(token, 'token');
    if (!['kar-al', 'zarar-kes'].includes(tur)) throw new Error('Emir türü kâr al ya da zarar kes olmalı');
    if (!['binance', 'terminal'].includes(yer)) throw new Error('Emir yeri binance ya da terminal olmalı');
    if (yer === 'binance' && tur !== 'kar-al') throw new Error('Binance limit emri sadece kâr al için: zarar kes bu terminalde çalışır');
    const tetik = Number(tetikUsd);
    if (!Number.isFinite(tetik) || tetik <= 0) throw new Error('Tetik fiyatı pozitif bir sayı olmalı');
    const hepsi = miktar === 'hepsi';
    const adet = hepsi ? null : Number(miktar);
    if (!hepsi && (!Number.isFinite(adet) || adet <= 0)) throw new Error('Miktar pozitif bir sayı ya da "hepsi" olmalı');

    const fiyat = await this.fiyatGetir(token);
    if (fiyat == null) throw new Error('Bu tokenin güncel fiyatı alınamadı: fiyat emri kurulamaz');
    if (kosulSaglandi(tur, fiyat, tetik)) {
      throw new Error(`Fiyat zaten ${tur === 'kar-al' ? 'tetiğin üstünde' : 'tetiğin altında'} (şu an $${fiyat}). Emir hemen satardı: anında satmak istiyorsan "Hemen sat"ı kullan.`);
    }

    const e = {
      id: randomUUID(), token, sembol, tur, tetikUsd: tetik, miktar: hepsi ? 'hepsi' : adet, yer, kayma,
      olusturma: Date.now(), kurulusFiyati: fiyat, durum: 'bekliyor', okuma: 0, sonFiyat: fiyat, sonuc: null,
    };
    if (yer === 'binance') {
      const satilacak = hepsi ? await this.bakiyeGetir(token) : adet;
      if (!(satilacak > 0)) throw new Error('Cüzdanda bu tokenden yok');
      const r = await this.baw.limitSat({ token, miktar: String(satilacak), tetikUsd: String(tetik), hedef: BNB_HEDEF, kayma });
      if (!r?.strategyId) throw new Error('Binance limit emri numara döndürmedi');
      Object.assign(e, { strategyId: String(r.strategyId), miktar: satilacak, durum: 'WORKING' });
    }
    this.emirler.unshift(e);
    this.#kaydet();
    return this.#disari(e);
  }

  async iptal(id) {
    const e = this.emirler.find((x) => x.id === id);
    if (!e) throw new Error('Emir bulunamadı');
    if (BITMIS.has(e.durum)) throw new Error('Emir zaten bitmiş');
    if (e.yer === 'binance') await this.baw.limitIptal(e.strategyId);
    e.durum = e.yer === 'binance' ? 'CANCELED' : 'iptal';
    e.bitis = Date.now();
    this.#kaydet();
    return this.#disari(e);
  }

  // Binance emirlerinin durumunu Binance'ten günceller (en sık 20 saniyede bir)
  async #binanceGuncelle() {
    if (!this.emirler.some((e) => e.yer === 'binance' && !BITMIS.has(e.durum))) return;
    if (Date.now() - this.binanceOnbellek.at < 20_000) return;
    const liste = await this.baw.limitListe().catch(() => null);
    if (!liste) return;
    this.binanceOnbellek = { at: Date.now(), liste };
    let degisti = false;
    for (const e of this.emirler.filter((x) => x.yer === 'binance')) {
      const b = liste.find((x) => String(x.strategyId) === e.strategyId);
      if (!b || b.status === e.durum) continue;
      e.durum = b.status;
      e.sonuc = { txHash: b.txHash || null, alinan: b.toTokenActualQty ?? null, iade: Array.isArray(b.refund) && b.refund.length ? b.refund : null };
      if (BITMIS.has(b.status)) e.bitis = Date.now();
      if (b.status === 'FINISHED') this.bildir?.(`Limit emri doldu: ${e.sembol || e.token.slice(0, 10)}`, `$${e.tetikUsd} tetiğiyle satıldı`);
      degisti = true;
    }
    if (degisti) this.#kaydet();
  }

  async liste() {
    await this.#binanceGuncelle();
    return this.emirler.slice(0, 100).map((e) => this.#disari(e));
  }

  #disari(e) { return { ...e }; }

  // Terminal emirlerini bir kez kontrol eder. Koşul art arda iki okumada sağlanmalı: tek bir hatalı fiyat satış tetiklemez
  async tur() {
    for (const e of this.emirler.filter((x) => x.yer === 'terminal' && x.durum === 'bekliyor')) {
      const fiyat = await this.fiyatGetir(e.token).catch(() => null);
      if (fiyat == null) continue;
      e.sonFiyat = fiyat;
      e.sonKontrol = Date.now();
      e.okuma = kosulSaglandi(e.tur, fiyat, e.tetikUsd) ? (e.okuma || 0) + 1 : 0;
      if (e.okuma < 2) continue;
      e.durum = 'tetiklendi';
      e.tetiklenme = Date.now();
      this.#kaydet();
      try {
        if (!this.canli) throw new Error('Canlı işlem kapalı');
        const miktar = e.miktar === 'hepsi' ? await this.bakiyeGetir(e.token) : e.miktar;
        if (!(miktar > 0)) throw new Error('Cüzdanda satılacak token kalmamış');
        const r = await this.islem.sat({ token: e.token, miktar: String(miktar), kayma: e.kayma, kaynak: 'fiyat-emri' });
        e.sonuc = { emirId: r?.id ?? null, durum: r?.durum ?? null, txHash: r?.txHash ?? null, sebep: r?.sebep ?? null, fiyat };
        e.durum = ['reddedildi', 'basarisiz', 'simulasyon'].includes(r?.durum) ? 'hata' : 'tamamlandi';
      } catch (err) {
        e.durum = 'hata';
        e.sonuc = { sebep: err.message, fiyat };
      }
      e.bitis = Date.now();
      this.#kaydet();
      this.bildir?.(`Fiyat emri ${e.durum === 'tamamlandi' ? 'çalıştı' : 'başarısız'}: ${e.sembol || e.token.slice(0, 10)}`,
        `${e.tur === 'kar-al' ? 'Kâr al' : 'Zarar kes'} $${e.tetikUsd} · fiyat $${fiyat}${e.sonuc?.sebep ? ` · ${e.sonuc.sebep}` : ''}`);
    }
    this.#kaydet();
  }

  baslat() {
    if (this.zamanlayici) return;
    const dongu = async () => {
      await this.tur().catch(() => {});
      this.zamanlayici = setTimeout(dongu, this.aralikMs);
    };
    this.zamanlayici = setTimeout(dongu, this.aralikMs);
  }
}
