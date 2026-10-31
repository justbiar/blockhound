// Portföy: cüzdandaki tokenler + bu terminalden yapılan işlemlerden maliyet ve kâr / zarar (BNB cinsinden, tahmini).
import { readFileSync } from 'node:fs';

// emirler.jsonl her güncellemede bir satır ekler: her emrin son halini al
export function emirKayitlariOku(dosya) {
  const son = new Map();
  let metin = '';
  try { metin = readFileSync(dosya, 'utf8'); } catch { return []; }
  for (const satir of metin.split('\n')) {
    if (!satir) continue;
    try { const e = JSON.parse(satir); if (e?.id) son.set(e.id, e); } catch { /* bozuk satırı atla */ }
  }
  return [...son.values()];
}

const GERCEK = new Set(['tamamlandi']);

// Her token için harcanan / geri alınan BNB. Sadece zincirde onaylanmış (tamamlandi) canlı emirler sayılır.
export function maliyetHesapla(emirler) {
  const m = new Map();
  for (const e of emirler) {
    if (!e.canli || !GERCEK.has(e.durum) || e.rota === 'onay') continue;
    const k = String(e.token).toLowerCase();
    const r = m.get(k) || { harcananBnb: 0, gelenBnb: 0, alinanToken: 0, satilanToken: 0, islem: 0 };
    if (e.yon === 'al') {
      r.harcananBnb += Number(e.odenenBnb ?? e.miktar) || 0;
      r.alinanToken += Number(e.alinan ?? e.teklif?.toCoinAmount) || 0;
    } else {
      r.gelenBnb += Number(e.gelenBnb ?? e.alinan) || 0;
      r.satilanToken += Number(e.miktar) || 0;
    }
    r.islem++;
    m.set(k, r);
  }
  return m;
}

// bakiye: baw wallet balance satırları; fiyatlar: { adres(lowercase) -> usd fiyatı } (tarayıcıdan); bnbUsd: BNB fiyatı
export function portfoyOlustur({ bakiye, emirler, fiyatlar = {}, bnbUsd }) {
  const maliyet = maliyetHesapla(emirler);
  const satirlar = [];
  const gorulen = new Set();
  for (const b of bakiye) {
    const adres = String(b.address || '').toLowerCase();
    if (!adres || /^0xeeee/i.test(adres)) continue;
    gorulen.add(adres);
    const miktar = Number(b.balance) || 0;
    const fiyat = Number(b.price) > 0 ? Number(b.price) : fiyatlar[adres] ?? null;
    const degerUsd = fiyat != null ? miktar * fiyat : null;
    satirlar.push(satirYap({ adres: b.address, sembol: b.symbol, miktar, fiyat, degerUsd, maliyet: maliyet.get(adres), bnbUsd }));
  }
  // Satılıp bitmiş ama geçmişi olan tokenler (gerçekleşmiş kâr / zarar için)
  for (const [adres, mal] of maliyet) {
    if (!gorulen.has(adres)) satirlar.push(satirYap({ adres, sembol: null, miktar: 0, fiyat: null, degerUsd: 0, maliyet: mal, bnbUsd }));
  }
  return satirlar.sort((a, b) => (b.degerUsd ?? -1) - (a.degerUsd ?? -1));
}

function satirYap({ adres, sembol, miktar, fiyat, degerUsd, maliyet, bnbUsd }) {
  const degerBnb = degerUsd != null && bnbUsd > 0 ? degerUsd / bnbUsd : null;
  const kz = maliyet && degerBnb != null ? degerBnb + maliyet.gelenBnb - maliyet.harcananBnb : null;
  return {
    adres, sembol, miktar, fiyat, degerUsd, degerBnb,
    harcananBnb: maliyet?.harcananBnb ?? null, gelenBnb: maliyet?.gelenBnb ?? null,
    karZararBnb: kz, karZararYuzde: kz != null && maliyet.harcananBnb > 0 ? (kz / maliyet.harcananBnb) * 100 : null,
  };
}
