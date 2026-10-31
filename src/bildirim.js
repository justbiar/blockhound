// Masaüstü bildirimleri tek kapıdan geçer: kategori, Agent ID filtresi, sessiz saatler ve saatlik sınır burada uygulanır.
// Gönderilen ve susturulan her bildirim kısa bir geçmişte tutulur, Ayarlar sekmesi bunu gösterir.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

export const KATEGORILER = {
  mintUcretsiz: 'Ücretsiz mint bulundu',
  mintUcuz: 'Neredeyse ücretsiz mint (0.001 BNB\'ye kadar)',
  mintUcretli: 'Ücretli token mint (0.01 BNB\'ye kadar)',
  mintIzle: 'Agent ID mint bulundu, henüz açık değil',
  ajanOnay: 'Ajan: onayını bekleyen mint',
  ajanOtoMint: 'Ajan: otomatik mint gönderildi',
  ajanAtla: 'Ajan: şüpheli mint atlandı',
  fiyatEmri: 'Fiyat emri doldu ya da başarısız oldu',
  piyasaAcildi: 'Elindeki bir tokenin piyasası açıldı (havuz kuruldu)',
};

export const VARSAYILAN = {
  acik: true,
  ses: true,
  // Hedef Agent ID mintleri: diğer mintler bildirim göndermez
  sadeceAgentId: true,
  kategoriler: { mintUcretsiz: true, mintUcuz: true, mintUcretli: true, mintIzle: false, ajanOnay: true, ajanOtoMint: true, ajanAtla: false, fiyatEmri: true, piyasaAcildi: true },
  sessiz: { acik: false, bas: '00:00', bit: '08:00' },
  saatlikMax: 12,
};

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

function macGonder(baslik, govde, ses) {
  if (process.platform !== 'darwin') return;
  const k = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execFile('osascript', ['-e', `display notification "${k(govde)}" with title "${k(baslik)}" subtitle "Blockhound"${ses ? ' sound name "Glass"' : ''}`], () => {});
}

// "dk" gün içindeki dakika; aralık gece yarısını geçebilir (23:00 - 08:00)
export function sessizMi(sessiz, tarih = new Date()) {
  if (!sessiz?.acik) return false;
  const dk = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const simdi = tarih.getHours() * 60 + tarih.getMinutes();
  const [b, e] = [dk(sessiz.bas), dk(sessiz.bit)];
  return b <= e ? simdi >= b && simdi < e : simdi >= b || simdi < e;
}

export class Bildirimler {
  constructor({ dosya = null, gonder = macGonder, saat = () => new Date() } = {}) {
    Object.assign(this, { dosya, gonder, saat });
    this.ayar = structuredClone(VARSAYILAN);
    this.gecmis = [];
    this.gonderilenler = [];
    try {
      if (dosya && existsSync(dosya)) this.ayar = this.#birlestir(JSON.parse(readFileSync(dosya, 'utf8')));
    } catch { /* bozuk dosya: varsayılanlar */ }
  }

  #birlestir(g) {
    const a = structuredClone(VARSAYILAN);
    if (typeof g.acik === 'boolean') a.acik = g.acik;
    if (typeof g.ses === 'boolean') a.ses = g.ses;
    if (typeof g.sadeceAgentId === 'boolean') a.sadeceAgentId = g.sadeceAgentId;
    for (const k of Object.keys(KATEGORILER)) if (typeof g.kategoriler?.[k] === 'boolean') a.kategoriler[k] = g.kategoriler[k];
    if (g.sessiz) {
      if (typeof g.sessiz.acik === 'boolean') a.sessiz.acik = g.sessiz.acik;
      if (SAAT.test(g.sessiz.bas ?? '')) a.sessiz.bas = g.sessiz.bas;
      if (SAAT.test(g.sessiz.bit ?? '')) a.sessiz.bit = g.sessiz.bit;
    }
    const m = Number(g.saatlikMax);
    if (Number.isInteger(m) && m >= 0 && m <= 120) a.saatlikMax = m;
    return a;
  }

  guncelle(yeni) {
    this.ayar = this.#birlestir({ ...this.ayar, ...yeni, kategoriler: { ...this.ayar.kategoriler, ...yeni?.kategoriler }, sessiz: { ...this.ayar.sessiz, ...yeni?.sessiz } });
    if (this.dosya) writeFileSync(this.dosya, JSON.stringify(this.ayar, null, 2));
    return this.durum();
  }

  #kaydet(k) {
    this.gecmis.unshift(k);
    this.gecmis.length = Math.min(this.gecmis.length, 50);
  }

  // kategori: KATEGORILER anahtarı; agentId: false ise ve sadece Agent ID açıksa susturulur
  bildir(kategori, baslik, govde = '', { agentId = null, zorla = false } = {}) {
    const a = this.ayar;
    const simdi = this.saat();
    let sebep = null;
    if (!zorla) {
      if (!a.acik) sebep = 'Bildirimler kapalı';
      else if (kategori in KATEGORILER && !a.kategoriler[kategori]) sebep = 'Bu tür kapalı';
      else if (a.sadeceAgentId && agentId === false) sebep = 'Agent ID mint değil';
      else if (sessizMi(a.sessiz, simdi)) sebep = 'Sessiz saatler';
      else {
        this.gonderilenler = this.gonderilenler.filter((z) => simdi - z < 3_600_000);
        if (this.gonderilenler.length >= a.saatlikMax) sebep = `Saatlik sınır (${a.saatlikMax})`;
      }
    }
    this.#kaydet({ zaman: +simdi, kategori, baslik: String(baslik).slice(0, 120), govde: String(govde).slice(0, 200), gonderildi: !sebep, sebep });
    if (sebep) return false;
    this.gonderilenler.push(+simdi);
    this.gonder(baslik, govde, a.ses);
    return true;
  }

  durum() {
    return { ayar: this.ayar, kategoriler: KATEGORILER, gecmis: this.gecmis, sonSaat: this.gonderilenler.filter((z) => this.saat() - z < 3_600_000).length };
  }
}

// Mint takibinin bulduğu kayıttan bildirim kategorisi ve metni
export function mintBildirimi(r) {
  const tur = r.tur === 'token' ? 'token mint' : 'mint';
  const [kategori, etiket] = r.sonuc === 'UCRETSIZ' ? ['mintUcretsiz', `Ücretsiz ${tur}`]
    : r.sonuc === 'NEREDEYSE-UCRETSIZ' ? ['mintUcuz', `Neredeyse ücretsiz ${tur}`]
      : r.sonuc === 'UCRETLI' ? ['mintUcretli', `Ücretli ${tur}`] : ['mintIzle', 'Agent ID mint (henüz açık değil)'];
  return { kategori, baslik: `${etiket}: ${r.ad || r.sembol || 'NFT'}`, govde: `${String(r.adres).slice(0, 10)}…${r.agentId ? ' · Agent ID şartlı' : ''}`, agentId: !!r.agentId };
}
