// Mintler listesini filtrelemek için her bulunanı tek bir gruba koyar ve nedenlerini yazar.
// Gruplar öncelik sırasıyla: mint ettin > riskli > geçmiyor > bitti > hazır > izleniyor.
// Riskli: somut dolandırıcılık işareti olanlar (ajan "atla" dedi, site cüzdan izni istiyor, Binance önizlemesi risk buldu).
// Sitesi ve sosyali doğrulanamayanlar ayrıca "kimliksiz" diye işaretlenir; bu tek başına rug kanıtı değildir.
export const GRUPLAR = ['hazir', 'riskli', 'gecmiyor', 'bitti', 'izleniyor', 'edildi'];

const BITTI_SONUC = new Set(['TUKENDI', 'ZATEN-ALDIN']);
const BITTI_SEBEP = /sold ?out|quota full|closed|exceed|minted out|max ?supply|limit|ended|over/i;
const HAZIR_SONUC = new Set(['UCRETSIZ', 'NEREDEYSE-UCRETSIZ', 'UCRETLI']);

const kisalt = (x) => { const t = String(x).trim(); return t.length > 160 ? `${t.slice(0, 157)}…` : t; };

export function mintSiniflandir(r, rapor = null) {
  const riskler = [];
  const karar = rapor?.karar?.eylem ?? null;
  if (karar === 'atla') riskler.push(`Ajan atla dedi${rapor.karar.sebepler?.length ? `: ${rapor.karar.sebepler[0]}` : ''}`);
  for (const x of rapor?.sosyal?.dolandiricilikIsaretleri || []) riskler.push(x);
  if (rapor?.site?.cuzdanIzniIstiyor) riskler.push('Site cüzdan izni (approval) istiyor');
  if (r.onizleme?.durum === 'riskli') riskler.push(`Binance önizlemesi: ${r.onizleme.sebep}`);

  const sitePuan = rapor?.site?.puan ?? null;
  const sosyalPuan = rapor?.sosyal?.puan ?? null;
  const kimliksiz = rapor ? (sitePuan ?? 0) < 40 && (sosyalPuan ?? 0) < 30 : null;

  const fnSebepler = (r.mintler || []).filter((m) => !m.gecti).map((m) => m.sebep).filter(Boolean);
  const gecen = (r.mintler || []).some((m) => m.gecti);
  let gecmemeSebebi = null;
  let grup;
  if (r.mintEdildi) grup = 'edildi';
  else if (riskler.length) grup = 'riskli';
  else if (r.onizleme?.durum === 'basarisiz') { grup = 'gecmiyor'; gecmemeSebebi = `Binance önizlemesi geçmedi: ${r.onizleme.sebep}`; }
  else if (BITTI_SONUC.has(r.sonuc) || (!gecen && fnSebepler.some((s) => BITTI_SEBEP.test(s)))) {
    grup = 'bitti';
    gecmemeSebebi = fnSebepler.find((s) => BITTI_SEBEP.test(s)) || (r.sonuc === 'ZATEN-ALDIN' ? 'Hakkını kullanmışsın' : 'Tükendi');
  } else if (HAZIR_SONUC.has(r.sonuc)) grup = 'hazir';
  else if (r.sartliImzalar?.length && !fnSebepler.length) { grup = 'izleniyor'; gecmemeSebebi = 'Sitenin imzasını istiyor'; }
  else if (!gecen && r.isKaniti) { grup = 'izleniyor'; gecmemeSebebi = 'İş kanıtı: hash bulunmadan mintlenemez'; }
  else if (!gecen) {
    grup = 'gecmiyor';
    gecmemeSebebi = r.sonuc === 'AGENT-ID-DIGER' ? 'NFT değil, mint fonksiyonu yok'
      : fnSebepler.length ? `Simülasyon geçmedi: ${[...new Set(fnSebepler)].slice(0, 2).join(', ')}` : 'Bilinen bir mint fonksiyonu geçmedi';
  } else grup = 'izleniyor';

  return { grup, riskler: riskler.map(kisalt), kimliksiz, sitePuan, sosyalPuan, ajanKarar: karar, gecmemeSebebi };
}

export function sayimlar(liste) {
  const s = Object.fromEntries(GRUPLAR.map((g) => [g, 0]));
  for (const r of liste) s[r.filtre.grup] = (s[r.filtre.grup] || 0) + 1;
  return s;
}
