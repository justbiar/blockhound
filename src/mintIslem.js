// Mint akışı: hazırla (yeniden analiz + Binance preview + denetim) -> kullanıcı onayı -> gönder.
// Preview'da tek bir şüphe bile varsa taslak oluşmaz. requestId sadece sunucuda, kısa ömürlü taslakta durur.
import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseEther } from 'ethers';
import { adresKontrol, miktarKontrol, limitKontrol, previewIncele } from './guard.js';
import { kodla, revertSebebi } from './mintTakip.js';

// Cüzdandan çıkan BNB (wei) gönderilen değeri aşamaz. Gas preview'da ayrı tutulur.
export function bnbCikisiDenetle(pre, { cuzdan, degerWei }) {
  const ben = String(cuzdan).toLowerCase();
  let cikis = 0n;
  for (const b of pre?.simulationResult?.balanceChanges || []) {
    if (b.tokenType === 'Native' && String(b.owner || '').toLowerCase() === ben && Number(b.change) < 0) cikis += BigInt(Math.round(-Number(b.change)));
  }
  // Number hassasiyeti için %0.0001 pay
  return cikis <= BigInt(degerWei) + BigInt(degerWei) / 1_000_000n + 1n
    ? null : `Cüzdandan beklenenden fazla BNB çıkıyor (${Number(cikis) / 1e18} BNB > ${Number(BigInt(degerWei)) / 1e18} BNB)`;
}

function bakiyeDegisimleri(pre, cuzdan) {
  const ben = String(cuzdan).toLowerCase();
  const bilgi = Object.fromEntries(Object.entries(pre?.tokenInfos || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return (pre?.simulationResult?.balanceChanges || []).filter((b) => String(b.owner || '').toLowerCase() === ben).map((b) => {
    const t = bilgi[String(b.contractAddress || '').toLowerCase()] || {};
    const ondalik = Number.isFinite(Number(t.decimals)) ? Number(t.decimals) : 0;
    return {
      tur: b.tokenType, kontrat: b.contractAddress, sembol: String(t.symbol || '').slice(0, 20),
      degisim: Number(b.change) / 10 ** ondalik, tokenId: b.tokenId ? BigInt(b.tokenId).toString() : null,
    };
  });
}

export class MintIslem {
  constructor({ takip, trader, baw, provider, canli, kayitDosya = null, bnbFiyati = async () => null, sureMs = 120_000 }) {
    Object.assign(this, { takip, trader, baw, provider, canli, kayitDosya, bnbFiyati, sureMs });
    this.taslaklar = new Map();
    this.#kayitlardanIsaretle();
  }

  // Önceki oturumlarda gönderilmiş mintler de listede "mint ettin" görünsün
  #kayitlardanIsaretle() {
    if (!this.kayitDosya || !this.takip?.mintEdildiIsaretle) return;
    let metin = '';
    try { metin = readFileSync(this.kayitDosya, 'utf8'); } catch { return; }
    for (const satir of metin.split('\n')) {
      try {
        const k = JSON.parse(satir);
        if (k?.adres && ['gonderildi', 'app-onayi-bekliyor'].includes(k.durum)) this.takip.mintEdildiIsaretle(k.adres, { txHash: k.txHash, zaman: k.zaman, kaydet: false });
      } catch { /* boş ya da bozuk satır */ }
    }
    this.takip.kaydet?.();
  }

  #temizle() { for (const [k, t] of this.taslaklar) if (t.bitis < Date.now()) this.taslaklar.delete(k); }

  // bnb verilirse calldata olmadan kontrata düz BNB gönderen mint hazırlanır
  async hazirla({ adres, bnb = null }) {
    adresKontrol(adres, 'kontrat');
    const cuzdan = await this.takip.cuzdan();
    if (!cuzdan) throw new Error('Cüzdan adresi alınamadı. Önce cüzdanı bağla.');

    let imza, veri, degerWei, ad = '', sembol = '';
    if (bnb != null && String(bnb).trim() !== '') {
      degerWei = parseEther(miktarKontrol(bnb, 'BNB miktarı')).toString();
      veri = '0x';
      imza = 'Düz BNB transferi';
      try { await this.provider.call({ to: adres, from: cuzdan, data: '0x', value: BigInt(degerWei) }); } catch (e) {
        throw new Error(`Kontrat bu miktarı kabul etmedi: ${revertSebebi(e)}`);
      }
    } else {
      // Eski sonuca güvenme: kontratı şimdi yeniden incele
      const r = await this.takip.incele(adres);
      ({ ad, sembol } = r);
      const gecen = (r.mintler || []).filter((m) => m.gecti).sort((a, b) => (BigInt(a.ucretWei) < BigInt(b.ucretWei) ? -1 : 1));
      if (!gecen.length) {
        if (r.sartliImzalar?.length) throw new Error('Bu mint sitenin imzasını istiyor, sadece kendi sitesinden yapılabilir.');
        throw new Error(`Şu an geçen bir mint fonksiyonu yok (durum: ${r.sonuc})`);
      }
      imza = gecen[0].imza;
      degerWei = gecen[0].ucretWei;
      // Token mintlerinde argümanlar simülasyonda bulunan haliyle gelir (pay, Agent ID, referans, ödeme sınırı)
      veri = gecen[0].veri || kodla(imza, cuzdan);
    }

    const bnbDeger = Number(BigInt(degerWei)) / 1e18;
    let pre;
    try { pre = await this.baw.preview({ kimden: cuzdan, kime: adres, degerWei, veri }); } catch (e) {
      this.takip.onizlemeIsaretle?.(adres, { durum: 'basarisiz', sebep: e.message });
      throw e;
    }
    const inceleme = previewIncele(pre, { cuzdan });
    const cikis = bnbCikisiDenetle(pre, { cuzdan, degerWei });
    if (cikis) inceleme.sebepler.push(cikis);
    if (inceleme.sebepler.length) {
      // Simülasyonun geçmemesi "geçmiyor", risk ya da beklenmeyen çıkış "riskli" sayılır
      const riskli = inceleme.sebepler.filter((s) => !/^(Simülasyon başarısız|Preview requestId|Preview sonucu)/.test(s));
      this.takip.onizlemeIsaretle?.(adres, { durum: riskli.length ? 'riskli' : 'basarisiz', sebep: (riskli.length ? riskli : inceleme.sebepler).join(' | ') });
      throw new Error(`Preview reddedildi: ${inceleme.sebepler.join(' | ')}`);
    }
    // Cüzdana bir şey gelmiyorsa önizleme "geçti" sayılmaz: liste bu kaydı Geçmiyor grubuna taşır
    const gelenVar = bakiyeDegisimleri(pre, cuzdan).some((d) => d.degisim > 0 && !/^0xe{40}$/i.test(String(d.kontrat)));
    this.takip.onizlemeIsaretle?.(adres, gelenVar ? { durum: 'gecti' } : { durum: 'basarisiz', sebep: 'Önizlemede cüzdana varlık gelmiyor: çağrılan fonksiyon mint değil' });
    if (!ad && !sembol) {
      const t = Object.entries(pre.tokenInfos || {}).find(([k]) => k.toLowerCase() === adres.toLowerCase())?.[1] || {};
      ad = String(t.name || '').slice(0, 40);
      sembol = String(t.symbol || '').slice(0, 20);
    }

    let gasBnb = null;
    try {
      const [gas, ucret] = await Promise.all([
        this.provider.estimateGas({ to: adres, from: cuzdan, data: veri, value: BigInt(degerWei) }), this.provider.getFeeData(),
      ]);
      gasBnb = Number(gas * (ucret.gasPrice ?? 0n)) / 1e18;
    } catch { /* tahmin yoksa bilinmiyor */ }

    const uyarilar = [];
    if (bnbDeger > 0) {
      const l = limitKontrol({ bnb: bnbDeger, islemBasiMax: this.trader.islemBasiMax, gunlukMax: this.trader.gunlukMax, bugunHarcanan: this.trader.bugunHarcanan() });
      if (!l.ok) uyarilar.push(`${l.sebep}. Göndermek için .env dosyasında ISLEM_BASI_MAX_BNB ve GUNLUK_MAX_BNB değerlerini yükseltip terminali yeniden başlat.`);
    }
    if (!this.canli) uyarilar.push('Canlı işlem kapalı (.env: MOD=live ve CANLI_ISLEM=1 gerekir). Mint gönderilemez.');
    // Mint cüzdana bir şey getirmeli: getirmiyorsa çağrılan fonksiyon mint değildir (fiyat okuma gibi), gas boşa gider
    if (!gelenVar) uyarilar.push('Önizlemede cüzdana hiçbir varlık gelmiyor: bu çağrı mint değil gibi görünüyor, gönderilmedi.');

    this.#temizle();
    const id = randomUUID();
    const bitis = Math.min(Number(pre.expiresAt) || Infinity, Date.now() + this.sureMs);
    // Önizlemeye göre cüzdana girecek varlıklar: Portföy'de otomatik mintlenenleri ayırmak için kayda yazılır
    const gelenler = bakiyeDegisimleri(pre, cuzdan).filter((d) => d.degisim > 0 && /^0x[0-9a-fA-F]{40}$/.test(d.kontrat) && !/^0xe{40}$/i.test(d.kontrat)).map((d) => d.kontrat.toLowerCase());
    this.taslaklar.set(id, { id, adres, imza, degerWei, bnb: bnbDeger, requestId: pre.requestId, bitis, ad, sembol, gelenler });
    const fiyat = await this.bnbFiyati().catch(() => null);
    return {
      id, adres, ad, sembol, imza, bnb: bnbDeger, usd: fiyat ? bnbDeger * fiyat : null, gasBnb,
      bakiyeDegisimleri: bakiyeDegisimleri(pre, cuzdan), uyarilar, gonderilebilir: uyarilar.length === 0,
      appOnayi: !!pre.requireConfirmation, bitis,
    };
  }

  // kaynak: 'elle' (Mint et düğmesi) ya da 'otomatik' (ajanların otomatik mint'i)
  async gonder({ id, onay, kaynak = 'elle' }) {
    if (onay !== true) throw new Error('Mint için açık onay gerekli');
    this.#temizle();
    const t = this.taslaklar.get(id);
    if (!t) throw new Error('Taslak bulunamadı ya da süresi doldu. Yeniden hazırla.');
    this.taslaklar.delete(id);   // tek kullanımlık
    if (!this.canli) throw new Error('Canlı işlem kapalı: mint gönderilmedi');
    const r = await this.trader.onizlenmisCalistir({ requestId: t.requestId, bnb: t.bnb });
    const kayit = { zaman: Date.now(), adres: t.adres, ad: t.ad, sembol: t.sembol, imza: t.imza, bnb: t.bnb, kaynak: kaynak === 'otomatik' ? 'otomatik' : 'elle', gelenler: t.gelenler || [], ...r };
    if (this.kayitDosya) { try { appendFileSync(this.kayitDosya, JSON.stringify(kayit) + '\n'); } catch { /* kayıt yazılamazsa sonuç yine döner */ } }
    if (r.durum === 'reddedildi' || r.durum === 'basarisiz') throw new Error(r.sebep);
    // Calldata'sız düz BNB transferleri de dahil: kontrat listede "mint edildi" görünür
    this.takip.mintEdildiIsaretle?.(t.adres, { txHash: r.txHash });
    return { durum: r.durum, txHash: r.txHash, adres: t.adres };
  }
}
