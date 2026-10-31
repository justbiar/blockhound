// Piyasa açıldı izleyicisi: cüzdandaki fiyatı olmayan tokenler (çoğu mint edilmiş, havuzu henüz kurulmamış tokenler)
// periyodik olarak kontrol edilir. Bir tokenin fiyatı ilk kez oluştuğunda (havuz kuruldu, işlem başladı) bildirim gönderilir.
// Bu tür tokenlerde en iyi satış fırsatı genelde havuzun açıldığı ilk dakikalardır. Sadece okuma yapar.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export class PiyasaIzleme {
  constructor({ portfoy, fiyatGetir, bildir = null, dosya = null, aralikMs = 10 * 60_000, turBasinaMax = 25, bekleMs = 1500 }) {
    Object.assign(this, { portfoy, fiyatGetir, bildir, dosya, aralikMs, turBasinaMax, bekleMs });
    // adres -> { sembol, ilkGorulme, sonKontrol, acildi: zaman | null, fiyat, miktar }
    this.durum = {};
    try { if (dosya && existsSync(dosya)) this.durum = JSON.parse(readFileSync(dosya, 'utf8')); } catch { /* baştan */ }
    this.calisiyor = false;
  }

  #kaydet() { if (this.dosya) { try { writeFileSync(this.dosya, JSON.stringify(this.durum, null, 2)); } catch { /* bellekte kalır */ } } }

  async tur() {
    if (this.calisiyor) return [];
    this.calisiyor = true;
    const acilanlar = [];
    try {
      const p = await this.portfoy.hesapla();
      const bekleyenler = p.varliklar.filter((v) => v.tur === 'token' && v.miktar > 0 && v.fiyat == null);
      // En uzun süredir kontrol edilmeyenler önce: çok token olursa sırayla dolaşılır
      bekleyenler.sort((a, b) => (this.durum[a.kontrat]?.sonKontrol || 0) - (this.durum[b.kontrat]?.sonKontrol || 0));
      for (const v of bekleyenler.slice(0, this.turBasinaMax)) {
        const d = (this.durum[v.kontrat] ||= { sembol: v.sembol || null, ilkGorulme: Date.now(), sonKontrol: null, acildi: null, fiyat: null, miktar: v.miktar });
        d.miktar = v.miktar;
        d.sembol = v.sembol || d.sembol;
        const fiyat = await this.fiyatGetir(v.kontrat).catch(() => null);
        d.sonKontrol = Date.now();
        if (fiyat > 0 && !d.acildi) {
          Object.assign(d, { acildi: Date.now(), fiyat });
          acilanlar.push({ kontrat: v.kontrat, ...d });
          const deger = fiyat * v.miktar;
          this.bildir?.(`Piyasa açıldı: ${d.sembol || v.kontrat.slice(0, 10)}`, `Fiyat $${fiyat.toPrecision(3)} · elindeki ${v.miktar.toLocaleString('tr-TR')} adet ≈ $${deger.toFixed(2)} · Portföy'den satabilirsin`);
        }
        if (this.bekleMs) await new Promise((r) => setTimeout(r, this.bekleMs));
      }
      if (acilanlar.length) this.portfoy.son = null; // yeni fiyatlar portföye hemen yansısın
      this.#kaydet();
    } finally { this.calisiyor = false; }
    return acilanlar;
  }

  liste() {
    return Object.entries(this.durum).map(([kontrat, d]) => ({ kontrat, ...d })).sort((a, b) => (b.acildi || 0) - (a.acildi || 0) || b.ilkGorulme - a.ilkGorulme);
  }

  baslat() {
    if (this.zamanlayici) return;
    const dongu = async () => {
      await this.tur().catch(() => {});
      this.zamanlayici = setTimeout(dongu, this.aralikMs);
    };
    this.zamanlayici = setTimeout(dongu, 60_000);
  }
}
