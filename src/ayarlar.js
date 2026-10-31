// Uygulama ayarları: .env dosyasındaki değerler arayüzden değiştirilir. Kaynak yine .env'dir: değişiklik satırına yazılır,
// yorumlar ve diğer satırlar korunur. Limit ve ajan ayarları çalışırken uygulanır; mod ve RPC değişiklikleri yeniden başlatma ister.
// Gizli değerler (API_TOKEN, OPENROUTER_API_KEY) ve PORT gibi altyapı ayarları burada yoktur.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const ALANLAR = [
  { anahtar: 'ISLEM_BASI_MAX_BNB', grup: 'limit', etiket: 'İşlem başı en fazla', birim: 'BNB', tur: 'sayi', min: 0, max: 5, canli: true,
    aciklama: 'Tek bir alım, mint ya da emirde harcanabilecek en fazla BNB. 0 = alım kapalı.' },
  { anahtar: 'GUNLUK_MAX_BNB', grup: 'limit', etiket: 'Günlük en fazla', birim: 'BNB', tur: 'sayi', min: 0, max: 20, canli: true,
    aciklama: 'Bir günde toplam harcanabilecek BNB. Otomatik mintler ve sniper da buna dahil.' },
  { anahtar: 'VARSAYILAN_KAYMA', grup: 'limit', etiket: 'Varsayılan kayma', birim: '%', tur: 'sayi', min: 0.1, max: 50, canli: true,
    aciklama: 'Al ve sat emirlerinde fiyatın en fazla ne kadar kayabileceği.' },
  { anahtar: 'BASIM_ONALIM_MAX_BNB', grup: 'limit', etiket: 'Basımda ön alım tavanı', birim: 'BNB', tur: 'sayi', min: 0, max: 5, canli: true,
    aciklama: 'Basım sekmesinde token basarken yapılabilecek en fazla ön alım.' },
  { anahtar: 'BASIM_UCRET_MAX_BNB', grup: 'limit', etiket: 'Basım ücreti tavanı', birim: 'BNB', tur: 'sayi', min: 0, max: 1, canli: true,
    aciklama: 'Four.meme basım ücreti bunu aşarsa basım yapılmaz.' },
  { anahtar: 'AJAN_GUNLUK_ARASTIRMA', grup: 'ajan', etiket: 'Günlük araştırma', birim: 'adet', tur: 'tamsayi', min: 0, max: 500, canli: true,
    aciklama: 'Ajanların günde en fazla kaç mint araştıracağı. Her araştırma 2 LLM çağrısı ve web araması (yaklaşık 1 sent).' },
  { anahtar: 'AJAN_SITE_MODEL', grup: 'ajan', etiket: 'Site ajanı modeli', tur: 'model', canli: true,
    aciklama: 'Siteyi inceler. Virgülle yedekli liste: ilki hız sınırına takılırsa sıradaki. ":free" modeller ücretsiz.' },
  { anahtar: 'AJAN_SOSYAL_MODEL', grup: 'ajan', etiket: 'Sosyal ajan modeli', tur: 'model', canli: true,
    aciklama: 'Web aramasıyla siteyi ve X hesabını bulur. Model ücretsiz olsa da web araması sonuç başına ücretlidir.' },
  { anahtar: 'AJAN_HAKEM_MODEL', grup: 'ajan', etiket: 'Hakem modeli', tur: 'model', canli: true,
    aciklama: 'İki raporu okuyup son risk değerlendirmesini yapar. Girdisi küçük: ucuz ama akıllı bir model yeter.' },
  { anahtar: 'MOD', grup: 'sistem', etiket: 'Mod', tur: 'secim', secenekler: ['sim', 'live'], canli: false,
    aciklama: 'sim: sadece teklif ve simülasyon. live: canlı zincir verisi.' },
  { anahtar: 'CANLI_ISLEM', grup: 'sistem', etiket: 'Gerçek işlem', tur: 'secim', secenekler: ['0', '1'], canli: false,
    aciklama: '1: gerçek emir ve mint gönderilir (sadece live modda). 0: hiçbir işlem gönderilmez.' },
  { anahtar: 'BSC_RPC', grup: 'sistem', etiket: 'BSC RPC', tur: 'url', canli: false, aciklama: 'Zincir okuma ve simülasyon için.' },
  { anahtar: 'BSC_OLAY_RPC', grup: 'sistem', etiket: 'Olay RPC (virgülle)', tur: 'urller', canli: false,
    aciklama: 'Fabrika içinden kurulan mint kontratlarını bulmak için. Boş = kapalı.' },
];
const ALAN = Object.fromEntries(ALANLAR.map((a) => [a.anahtar, a]));

export function envOku(dosya) {
  const d = {};
  if (!dosya || !existsSync(dosya)) return d;
  for (const satir of readFileSync(dosya, 'utf8').split('\n')) {
    const m = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) d[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return d;
}

// Var olan satırın değerini değiştirir, yoksa sona ekler. Yorumlar ve sıra korunur
export function envYaz(dosya, degisiklik) {
  const satirlar = existsSync(dosya) ? readFileSync(dosya, 'utf8').split('\n') : [];
  const kalan = new Map(Object.entries(degisiklik));
  const yeni = satirlar.map((s) => {
    const m = s.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)/);
    if (!m || !kalan.has(m[2])) return s;
    const v = kalan.get(m[2]);
    kalan.delete(m[2]);
    return `${m[1]}${m[2]}=${v}`;
  });
  if (kalan.size) {
    while (yeni.length && yeni.at(-1) === '') yeni.pop();
    for (const [k, v] of kalan) yeni.push(`${k}=${v}`);
    yeni.push('');
  }
  writeFileSync(dosya, yeni.join('\n'), { mode: 0o600 });
}

export function degerDogrula(alan, ham) {
  const s = String(ham ?? '').trim();
  if (/[\n\r#"'`$\\]/.test(s)) throw new Error(`${alan.etiket}: geçersiz karakter`);
  if (alan.tur === 'sayi' || alan.tur === 'tamsayi') {
    const v = Number(s.replace(',', '.'));
    if (s === '' || !Number.isFinite(v) || v < alan.min || v > alan.max || (alan.tur === 'tamsayi' && !Number.isInteger(v))) {
      throw new Error(`${alan.etiket} ${alan.min} ile ${alan.max} arasında ${alan.tur === 'tamsayi' ? 'tam sayı' : 'sayı'} olmalı`);
    }
    return String(v);
  }
  if (alan.tur === 'secim') {
    if (!alan.secenekler.includes(s)) throw new Error(`${alan.etiket}: geçersiz seçim`);
    return s;
  }
  if (alan.tur === 'model') {
    const liste = s.split(',').map((x) => x.trim()).filter(Boolean);
    if (!liste.length || liste.length > 4 || liste.some((x) => !/^[\w.-]+\/[\w.:-]+$/.test(x))) throw new Error(`${alan.etiket}: "saglayici/model" biçiminde olmalı, en fazla 4 tane virgülle`);
    return liste.join(',');
  }
  const urller = alan.tur === 'urller' ? s.split(',').map((x) => x.trim()).filter(Boolean) : [s];
  if (alan.tur === 'url' && !s) throw new Error(`${alan.etiket} boş olamaz`);
  for (const u of urller) if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w./%-]*)?$/.test(u)) throw new Error(`${alan.etiket}: https adresi olmalı (${u.slice(0, 40)})`);
  return urller.join(',');
}

export class UygulamaAyarlari {
  // calisan: sunucunun şu an kullandığı değerler; uygula(anahtar, deger): çalışırken uygulanabilen ayarı devreye alır
  constructor({ dosya, calisan, uygula = () => {} }) {
    Object.assign(this, { dosya, uygula });
    this.calisan = Object.fromEntries(ALANLAR.map((a) => [a.anahtar, String(calisan[a.anahtar] ?? '')]));
  }

  durum() {
    const env = envOku(this.dosya);
    const alanlar = ALANLAR.map((a) => {
      const kayitli = env[a.anahtar] ?? this.calisan[a.anahtar];
      return { ...a, deger: kayitli, calisan: this.calisan[a.anahtar], yenidenBaslat: !a.canli && kayitli !== this.calisan[a.anahtar] };
    });
    return { alanlar, yenidenBaslatGerekli: alanlar.some((a) => a.yenidenBaslat) };
  }

  guncelle(govde = {}) {
    const temiz = {};
    for (const [k, v] of Object.entries(govde)) {
      if (!ALAN[k]) throw new Error(`Bilinmeyen ayar: ${k}`);
      temiz[k] = degerDogrula(ALAN[k], v);
    }
    const env = envOku(this.dosya);
    const sonra = { ...this.calisan, ...env, ...temiz };
    if (Number(sonra.GUNLUK_MAX_BNB) < Number(sonra.ISLEM_BASI_MAX_BNB)) throw new Error('Günlük limit işlem başı limitten küçük olamaz');
    if (!Object.keys(temiz).length) return this.durum();
    envYaz(this.dosya, temiz);
    for (const [k, v] of Object.entries(temiz)) {
      if (!ALAN[k].canli || v === this.calisan[k]) continue;
      this.uygula(k, v);
      this.calisan[k] = v;
    }
    return this.durum();
  }
}
