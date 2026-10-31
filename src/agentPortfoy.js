// Agent portföyü: ajanların otomatik mintlediği varlıklar. Elle mintlenenler ve diğer her şey Normal portföyde kalır.
// Kaynak mint kaydıdır (data/mint-islemleri.jsonl): her gönderim "kaynak" ('otomatik' | 'elle') ve önizlemeye göre
// cüzdana giren varlıkların adresleriyle yazılır.
import { readFileSync, existsSync } from 'node:fs';

const GIDEN = new Set(['gonderildi', 'app-onayi-bekliyor']);

export function mintKayitlari(dosya) {
  if (!dosya || !existsSync(dosya)) return [];
  return readFileSync(dosya, 'utf8').split('\n').filter(Boolean).flatMap((s) => { try { return [JSON.parse(s)]; } catch { return []; } });
}

// Otomatik mintlerin cüzdana getirdiği varlıkların adresleri (küçük harf)
export function agentKontratlari(kayitlar) {
  const k = new Set();
  for (const r of kayitlar) {
    if (r.kaynak !== 'otomatik' || !GIDEN.has(r.durum)) continue;
    for (const a of (Array.isArray(r.gelenler) ? r.gelenler : [r.adres])) k.add(String(a).toLowerCase());
  }
  return k;
}

export function agentPortfoy({ kayitlar, varliklar, islemler = [], bnbSimdi = null }) {
  const oto = kayitlar.filter((r) => r.kaynak === 'otomatik' && GIDEN.has(r.durum));
  const gas = new Map(islemler.map((i) => [String(i.hash).toLowerCase(), i.gasBnb || 0]));
  const varlik = new Map(varliklar.map((v) => [v.kontrat, v]));
  const satirlar = oto.map((r) => {
    const gasBnb = r.txHash ? gas.get(String(r.txHash).toLowerCase()) ?? null : null;
    const gelen = (Array.isArray(r.gelenler) ? r.gelenler : [r.adres]).map((a) => {
      const v = varlik.get(String(a).toLowerCase());
      return { kontrat: String(a).toLowerCase(), tur: v?.tur ?? null, sembol: v?.sembol || v?.ad || r.sembol || null, miktar: v?.miktar ?? null, degerUsd: v?.degerUsd ?? null, fiyat: v?.fiyat ?? null };
    });
    return { zaman: r.zaman, ad: r.ad || r.sembol || null, adres: r.adres, txHash: r.txHash || null, durum: r.durum, bnb: Number(r.bnb) || 0, gasBnb, gelen };
  }).sort((a, b) => b.zaman - a.zaman);

  const harcananBnb = satirlar.reduce((t, s) => t + s.bnb, 0);
  const gasBnb = satirlar.reduce((t, s) => t + (s.gasBnb || 0), 0);
  // Aynı varlık birden fazla mint'le gelmiş olabilir: değer bir kez sayılır
  const tekil = new Map();
  for (const s of satirlar) for (const g of s.gelen) tekil.set(g.kontrat, g);
  const fiyatli = [...tekil.values()].filter((g) => g.degerUsd != null);
  const degerUsd = fiyatli.reduce((t, g) => t + g.degerUsd, 0);
  const maliyetUsd = bnbSimdi != null ? (harcananBnb + gasBnb) * bnbSimdi : null;
  return {
    ozet: {
      adet: satirlar.length, harcananBnb, gasBnb, maliyetUsd, degerUsd,
      netUsd: maliyetUsd != null ? degerUsd - maliyetUsd : null, varlik: tekil.size, fiyatsiz: tekil.size - fiyatli.length,
    },
    satirlar,
  };
}
