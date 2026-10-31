// Emir akışı: her emir önce teklif alır; canlı işlem kapalıysa simülasyonda kalır.
// Günlük harcama, eşzamanlı emirlerin limiti aşmaması için swap'tan ÖNCE ayrılır, başarısız olursa geri bırakılır.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { BNB } from './config.js';
import { adresKontrol, miktarKontrol, limitKontrol, previewIncele } from './guard.js';
import { emirSonucuBekle } from './baw.js';

const bugun = () => new Date().toISOString().slice(0, 10);

export class Trader extends EventEmitter {
  constructor({ baw, canli, islemBasiMax, gunlukMax, varsayilanKayma = 10, gunlukDosya = null, kayitDosya = null, bekle = emirSonucuBekle }) {
    super();
    Object.assign(this, { baw, canli, islemBasiMax, gunlukMax, varsayilanKayma, gunlukDosya, kayitDosya, bekle });
    this.emirler = [];
    this.gunluk = this.#gunlukOku();
  }

  #gunlukOku() {
    try {
      const g = JSON.parse(readFileSync(this.gunlukDosya, 'utf8'));
      if (g.tarih === bugun()) return g;
    } catch { /* yoksa sıfırdan */ }
    return { tarih: bugun(), harcanan: 0 };
  }

  #gunlukYaz() { if (this.gunlukDosya) writeFileSync(this.gunlukDosya, JSON.stringify(this.gunluk)); }

  bugunHarcanan() {
    if (this.gunluk.tarih !== bugun()) { this.gunluk = { tarih: bugun(), harcanan: 0 }; this.#gunlukYaz(); }
    return this.gunluk.harcanan;
  }

  #ayir(bnb) { this.bugunHarcanan(); this.gunluk.harcanan += bnb; this.#gunlukYaz(); }
  #birak(bnb) { this.gunluk.harcanan = Math.max(0, this.gunluk.harcanan - bnb); this.#gunlukYaz(); }

  #guncelle(emir, alanlar) {
    Object.assign(emir, alanlar, { guncellendi: Date.now() });
    this.emit('emir', emir);
    if (this.kayitDosya && ['tamamlandi', 'gonderildi', 'basarisiz', 'reddedildi', 'simulasyon', 'bekliyor'].includes(emir.durum)) {
      try { appendFileSync(this.kayitDosya, JSON.stringify(emir) + '\n'); } catch { /* kayıt yazılamazsa emir yine işler */ }
    }
    return emir;
  }

  // Dışarıdan sonuç bilgisi eklemek için (ör. zincir makbuzu geldiğinde)
  emirIsle(id, alanlar) {
    const e = this.emirler.find((x) => x.id === id);
    return e ? this.#guncelle(e, alanlar) : null;
  }

  async teklif({ yon, token, miktar, kayma }) {
    adresKontrol(token, 'token');
    const [kaynak, hedef] = yon === 'al' ? [BNB, token] : [token, BNB];
    return this.baw.teklif({ miktar: miktarKontrol(miktar), kaynak, hedef, kayma: kayma ?? this.varsayilanKayma });
  }

  // yon: 'al' (miktar = BNB) | 'sat' (miktar = token adedi)
  async emirVer({ yon, token, miktar, kayma, kaynak = 'manuel' }) {
    if (yon !== 'al' && yon !== 'sat') throw new Error('yon "al" ya da "sat" olmalı');
    adresKontrol(token, 'token');
    miktarKontrol(miktar);
    const emir = { id: randomUUID(), zaman: Date.now(), yon, token, miktar: String(miktar), kayma: kayma ?? this.varsayilanKayma, kaynak, canli: this.canli, durum: 'teklif' };
    this.emirler.unshift(emir);
    this.emirler.length = Math.min(this.emirler.length, 200);
    this.emit('emir', emir);

    let ayrilan = 0;
    try {
      if (yon === 'al') {
        const l = limitKontrol({ bnb: Number(miktar), islemBasiMax: this.islemBasiMax, gunlukMax: this.gunlukMax, bugunHarcanan: this.bugunHarcanan() });
        if (!l.ok) return this.#guncelle(emir, { durum: 'reddedildi', sebep: l.sebep });
      }
      const t = await this.teklif({ yon, token, miktar, kayma: emir.kayma });
      emir.teklif = t;
      if (!this.canli) return this.#guncelle(emir, { durum: 'simulasyon', sebep: 'Canlı işlem kapalı: sadece teklif alındı' });

      const kilit = await this.baw.kilit().catch(() => 'BILINMIYOR');
      if (kilit === 'LOCKED') return this.#guncelle(emir, { durum: 'reddedildi', sebep: 'Cüzdan kilitli: Binance App\'te onay bekleyen işlem var' });

      if (yon === 'al') {
        // teklif sırasında başka bir emir limiti doldurmuş olabilir: ayırmadan hemen önce tekrar bak
        const l = limitKontrol({ bnb: Number(miktar), islemBasiMax: this.islemBasiMax, gunlukMax: this.gunlukMax, bugunHarcanan: this.bugunHarcanan() });
        if (!l.ok) return this.#guncelle(emir, { durum: 'reddedildi', sebep: l.sebep });
        ayrilan = Number(miktar); this.#ayir(ayrilan);
      }

      const [kaynakT, hedefT] = yon === 'al' ? [BNB, token] : [token, BNB];
      this.#guncelle(emir, { durum: 'gonderiliyor' });
      const g = await this.baw.swap({ miktar, kaynak: kaynakT, hedef: hedefT, kayma: emir.kayma });
      if (!g?.orderId) throw new Error('baw orderId döndürmedi');
      this.#guncelle(emir, { durum: 'onay-bekliyor', orderId: g.orderId });

      const s = await this.bekle(g.orderId);
      if (s.status === 'FINISHED') {
        ayrilan = 0;
        return this.#guncelle(emir, { durum: 'tamamlandi', txHash: s.txHash || null, alinan: s.toTokenActualQty ?? null, iade: s.refund || null });
      }
      if (s.status === 'FAILED') return this.#guncelle(emir, { durum: 'basarisiz', txHash: s.txHash || null, sebep: 'Zincirde başarısız (kayma, likidite ya da ağ)' });
      ayrilan = 0;   // sonucu belli değil: harcanmış say, limit güvenli tarafta kalsın
      return this.#guncelle(emir, { durum: 'bekliyor', sebep: 'Henüz sonuçlanmadı, Binance App\'ten ya da sonra tekrar kontrol et' });
    } catch (e) {
      return this.#guncelle(emir, { durum: 'basarisiz', sebep: e.message });
    } finally {
      if (ayrilan) this.#birak(ayrilan);
    }
  }

  // Kontrat çağrısını emir geçmişine kaydederek çalıştırır (bonding curve alımları)
  async kontratEmriVer({ yon, token, miktar, kayma, cuzdan, tx, teklif, izinliOnay = null, rota = 'bonding curve', kaynak = 'manuel' }) {
    const emir = { id: randomUUID(), zaman: Date.now(), yon, token, miktar: String(miktar), kayma, kaynak, canli: this.canli, durum: 'teklif', rota, teklif };
    this.emirler.unshift(emir);
    this.emirler.length = Math.min(this.emirler.length, 200);
    this.#guncelle(emir, { durum: 'gonderiliyor' });
    const r = await this.kontratCagir({ cuzdan, kime: tx.to, veri: tx.inputData, degerWei: tx.value, izinliOnay, kaynak }).catch((e) => ({ durum: 'basarisiz', sebep: e.message }));
    const durum = { 'app-onayi-bekliyor': 'bekliyor' }[r.durum] || r.durum;
    const sebep = r.durum === 'gonderildi' ? 'Zincire gönderildi' : r.durum === 'app-onayi-bekliyor' ? 'Binance App\'te onay bekliyor' : r.sebep;
    return this.#guncelle(emir, { durum, sebep, txHash: r.txHash || null });
  }

  // Önceden preview'ı alınıp incelenmiş bir kontrat çağrısını çalıştırır (mint akışı). Limitler burada yeniden denetlenir.
  async onizlenmisCalistir({ requestId, bnb = 0 }) {
    if (!requestId) return { durum: 'reddedildi', sebep: 'requestId yok' };
    if (bnb > 0) {
      const l = limitKontrol({ bnb, islemBasiMax: this.islemBasiMax, gunlukMax: this.gunlukMax, bugunHarcanan: this.bugunHarcanan() });
      if (!l.ok) return { durum: 'reddedildi', sebep: l.sebep };
    }
    if (!this.canli) return { durum: 'reddedildi', sebep: 'Canlı işlem kapalı: gönderilmedi' };
    const kilit = await this.baw.kilit().catch(() => 'BILINMIYOR');
    if (kilit === 'LOCKED') return { durum: 'reddedildi', sebep: 'Cüzdan kilitli: Binance App\'te onay bekleyen işlem var' };
    if (bnb > 0) this.#ayir(bnb);
    try {
      const r = await this.baw.calistir(requestId);
      return { durum: r.status === 'BROADCASTED' ? 'gonderildi' : 'app-onayi-bekliyor', txHash: r.txHash || null, orderId: r.orderId };
    } catch (e) {
      // zaman aşımında işlem zincire gitmiş olabilir: limiti geri vermiyoruz
      if (!/timeout|timed out|ETIMEDOUT|network/i.test(e.message) && bnb > 0) this.#birak(bnb);
      return { durum: 'basarisiz', sebep: e.message };
    }
  }

  // Ham kontrat çağrısı (Aşama 2: Agent ID'ye özel havuzlar). Preview'da tek bir şüphe bile varsa çalıştırmaz.
  async kontratCagir({ cuzdan, kime, veri, degerWei = '0', izinliOnay = null, kaynak = 'manuel' }) {
    const bnb = Number(BigInt(degerWei)) / 1e18;
    if (bnb > 0) {
      const l = limitKontrol({ bnb, islemBasiMax: this.islemBasiMax, gunlukMax: this.gunlukMax, bugunHarcanan: this.bugunHarcanan() });
      if (!l.ok) return { durum: 'reddedildi', sebep: l.sebep };
    }
    const pre = await this.baw.preview({ kimden: cuzdan, kime, degerWei, veri });
    const inceleme = previewIncele(pre, { cuzdan, izinliOnay });
    if (!inceleme.ok) return { durum: 'reddedildi', sebep: inceleme.sebepler.join(' | '), preview: pre };
    if (!this.canli) return { durum: 'simulasyon', sebep: 'Canlı işlem kapalı: preview temiz, gönderilmedi', preview: pre };
    if (bnb > 0) this.#ayir(bnb);
    try {
      const r = await this.baw.calistir(pre.requestId);
      return { durum: r.status === 'BROADCASTED' ? 'gonderildi' : 'app-onayi-bekliyor', txHash: r.txHash || null, orderId: r.orderId, kaynak };
    } catch (e) {
      // zaman aşımında işlem zincire gitmiş olabilir: limiti geri vermiyoruz
      if (!/timeout|timed out|ETIMEDOUT|network/i.test(e.message) && bnb > 0) this.#birak(bnb);
      return { durum: 'basarisiz', sebep: e.message };
    }
  }
}
