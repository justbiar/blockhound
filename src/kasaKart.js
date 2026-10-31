// Kasa kartı analizi: Flap vergi tokenlarının gelirini kart (NFT) sahiplerine dağıtan kasaları (vault) değerlendirir.
// Hepsi okuma yapar. Üç soruya cevap: mintle ve hemen sat kâr mı, tutarsan temettü maliyeti kaç günde çıkarır,
// mintlemek mi kontrat içi pazardan almak mı ucuz. Temettü tahmini son 24 saatlik hacmin aynen sürdüğünü varsayar.
import { Interface, formatEther } from 'ethers';

const BNB = (v) => (v == null ? null : Number(formatEther(v)));
const kelimeler = (hex) => (hex && hex.length > 2 ? hex.slice(2).match(/.{64}/g) || [] : []).map((x) => BigInt('0x' + x));

async function oku(provider, to, imza, args = [], tur = 'uint256') {
  try {
    const ad = imza.slice(0, imza.indexOf('('));
    const i = new Interface([`function ${imza} view returns (${tur})`]);
    return i.decodeFunctionResult(ad, await provider.call({ to, data: i.encodeFunctionData(ad, args) }))[0];
  } catch { return null; }
}

// Cüzdan başı sınır: mint(n) simülasyonu geçen en büyük n (1..20). Ücret mintPrice * n
async function cuzdanSiniri(provider, adres, cuzdan, fiyat) {
  const i = new Interface(['function mint(uint256) payable']);
  const gecer = async (n) => { try { await provider.call({ from: cuzdan, to: adres, data: i.encodeFunctionData('mint', [BigInt(n)]), value: fiyat * BigInt(n) }); return true; } catch { return false; } };
  if (!(await gecer(1))) return 0;
  let alt = 1, ust = 20;
  if (await gecer(ust)) return ust;
  while (ust - alt > 1) { const o = (alt + ust) >> 1; if (await gecer(o)) alt = o; else ust = o; }
  return alt;
}

// Kontrat içi pazar: aktif teklifler (bids) ve ilanlardaki fiyatlar. Teklif kaydı: [kimlik, birim fiyat, adet, dolan]
async function pazar(provider, adres) {
  const sonId = Number(await oku(provider, adres, 'nextBidId()') ?? 0);
  const teklifler = [];
  const bas = Math.max(1, sonId - 300);
  await Promise.all(Array.from({ length: Math.max(0, sonId - bas) }, (_, k) => bas + k).map(async (id) => {
    try {
      const w = kelimeler(await provider.call({ to: adres, data: new Interface(['function bids(uint256)']).encodeFunctionData('bids', [id]) }));
      if (w.length >= 4 && w[2] > w[3]) teklifler.push({ fiyat: BNB(w[1]), adet: Number(w[2] - w[3]) });
    } catch { /* yok */ }
  }));
  teklifler.sort((a, b) => b.fiyat - a.fiyat);
  // getActiveListings(imleç, adet) -> (kart numaraları, (satıcı, fiyat)[], sonraki imleç). İmleç izlenir, kartlar tekrarsız toplanır
  const ilanlar = [];
  const gorulen = new Set();
  const li = new Interface(['function getActiveListings(uint256,uint256) view returns (uint256[] ids, (address satici, uint256 fiyat)[] ilan, uint256 imlec)']);
  try {
    let imlec = 0n;
    for (let tur = 0; tur < 30; tur++) {
      const [ids, ilan, sonraki] = li.decodeFunctionResult('getActiveListings', await provider.call({ to: adres, data: li.encodeFunctionData('getActiveListings', [imlec, 300n]) }));
      let yeni = 0;
      ids.forEach((id, i) => { const k = String(id); if (!gorulen.has(k) && ilan[i].fiyat > 0n) { gorulen.add(k); ilanlar.push(BNB(ilan[i].fiyat)); yeni++; } });
      if (!ids.length || !yeni || sonraki === imlec || sonraki === 0n) break;
      imlec = sonraki;
    }
  } catch { /* pazar yok ya da şablon farklı */ }
  ilanlar.sort((a, b) => a - b);
  return { teklifler, ilanlar };
}

export async function kasaAnaliz({ provider, adres, cuzdan, tokenPiyasa, bnbUsd }) {
  const n = (imza, args) => oku(provider, adres, imza, args);
  const [fiyat, toplamVergi, odenenTemettu, bekleyenVergi, agirlik, basilan, token, kullanilan, partiAcilis, sahip] = await Promise.all([
    n('mintPrice()'), n('totalTaxReceived()'), n('totalDividendPaid()'), n('undistributedTax()'), n('totalWeight()'), n('userMints()'),
    oku(provider, adres, 'projectToken()', [], 'address'), cuzdan ? n('mintsUsed(address)', [cuzdan]) : null, n('batchOpenedAt()'),
    oku(provider, adres, 'owner()', [], 'address'),
  ]);
  const vergiOrani = token ? await oku(provider, token, 'sellTaxRate()') ?? await oku(provider, token, 'taxRate()') : null;
  const [sinir, p, tp] = await Promise.all([
    fiyat != null && cuzdan ? cuzdanSiniri(provider, adres, cuzdan, fiyat) : null,
    pazar(provider, adres),
    token && tokenPiyasa ? tokenPiyasa(token).catch(() => null) : null,
  ]);

  const mint = BNB(fiyat);
  const enIyiTeklif = p.teklifler[0]?.fiyat ?? null;
  const enUcuzIlan = p.ilanlar[0] ?? null;
  const temettuPayi = toplamVergi && toplamVergi > 0n ? Number(odenenTemettu ?? 0n) / Number(toplamVergi) : null;

  // Günlük temettü tahmini (kart başı, BNB): hacim × vergi oranı × temettüye giden pay / kart ağırlığı
  let gunlukKartBasi = null;
  if (tp?.hacim24sUsd && vergiOrani != null && temettuPayi != null && agirlik && bnbUsd) {
    const gunlukVergiUsd = tp.hacim24sUsd * (Number(vergiOrani) / 10_000);
    gunlukKartBasi = (gunlukVergiUsd * temettuPayi) / Number(agirlik) / bnbUsd;
  }

  const riskler = [];
  const kod = String(await provider.getCode(adres)).toLowerCase();
  if (kod.length < 4000 && kod.includes('5c60da1b')) riskler.push('Yükseltilebilir kontrat (beacon proxy): kurallar sonradan değişebilir');
  const uygKod = await (async () => { for (const m of kod.matchAll(/7f0{24}([0-9a-f]{40})/g)) { const u = await oku(provider, '0x' + m[1], 'implementation()', [], 'address'); if (u) return String(await provider.getCode(u)).toLowerCase(); } return kod; })();
  const secici = (imza) => uygKod.includes('63' + new Interface([`function ${imza}`]).getFunction(imza.slice(0, imza.indexOf('('))).selector.slice(2));
  if (secici('emergencyWithdrawNative(address,uint256)') || secici('emergencyWithdrawToken(address,address,uint256)')) riskler.push('Sahibi kasadaki BNB ve tokenleri acil durum fonksiyonuyla çekebilir');
  if (tp && tp.likiditeUsd != null && tp.likiditeUsd < 20_000) riskler.push(`Tokenin likiditesi düşük ($${Math.round(tp.likiditeUsd)})`);

  return {
    adres, token, sahip, vergiOraniBps: vergiOrani != null ? Number(vergiOrani) : null,
    mintBnb: mint, cuzdanSiniri: sinir, kullanilan: kullanilan != null ? Number(kullanilan) : null,
    basilan: basilan != null ? Number(basilan) : null, agirlik: agirlik != null ? Number(agirlik) : null,
    partiAcilis: partiAcilis ? Number(partiAcilis) * 1000 : null,
    toplamVergiBnb: BNB(toplamVergi), odenenTemettuBnb: BNB(odenenTemettu), bekleyenVergiBnb: BNB(bekleyenVergi), temettuPayi,
    pazar: { enIyiTeklif, teklifAdedi: p.teklifler[0]?.adet ?? 0, toplamTalep: p.teklifler.reduce((t, x) => t + x.adet, 0), enUcuzIlan, ilanSayisi: p.ilanlar.length, teklifler: p.teklifler.slice(0, 5) },
    tokenPiyasa: tp,
    hesap: {
      // Teklife sat: en iyi teklife satınca kart başı kâr / zarar (pazar ücreti hariç)
      hemenSatKarBnb: mint != null && enIyiTeklif != null ? enIyiTeklif - mint : null,
      // İlan vererek sat: en ucuz ilanla rekabet etmek gerekir; temkinli senaryo
      ilanlaSatKarBnb: mint != null && enUcuzIlan != null ? enUcuzIlan - mint : null,
      // Teklif en ucuz ilandan yüksekse teklifler bir koşul taşıyor olabilir (örneğin sadece belirli kartlar)
      teklifKosulluOlabilir: enIyiTeklif != null && enUcuzIlan != null && enIyiTeklif > enUcuzIlan,
      // Pazardan almak mintten ucuz mu
      pazarFarkBnb: mint != null && enUcuzIlan != null ? enUcuzIlan - mint : null,
      gunlukTemettuKartBasiBnb: gunlukKartBasi,
      geriOdemeGun: gunlukKartBasi && mint ? Math.min(mint, enUcuzIlan ?? mint) / gunlukKartBasi : null,
    },
    riskler,
    zaman: Date.now(),
  };
}
