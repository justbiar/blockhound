// Kâr / zarar hesabı. Saf fonksiyonlar: ağa dokunmaz, test edilebilir.
//
// İki bakış birlikte verilir:
//  1) Toplam: cüzdana yatırılan net para ile bugünkü değer arasındaki fark. BNB fiyat değişimi, gas ve
//     hiçbir şey getirmeyen harcamalar dahil her şeyi kapsar; manşet rakam budur.
//  2) Varlık bazında: ortalama maliyet yöntemiyle her token ve NFT koleksiyonu için maliyet, gerçekleşen ve
//     gerçekleşmemiş kâr / zarar. Gas burada ayrı satırdır, varlık maliyetine eklenmez.
// Fiyatı bilinmeyen varlıklar (çoğu NFT, havuzu olmayan tokenler) manşette 0 değerle sayılır (temkinli);
// maliyetleriyle sayılmış hali ayrıca verilir.

const TUR_ADI = { mint: 'Mint', alim: 'Alım', bedava: 'Bedava geldi', takas: 'Takas' };

function yeniVarlik(k, nft) {
  return {
    kontrat: k.kontrat, sembol: k.sembol, tur: nft ? 'nft' : 'token', miktar: 0, maliyetUsd: 0, maliyetBnb: 0,
    gerceklesenUsd: 0, gerceklesenBnb: 0, satisUsd: 0, alisUsd: 0, kaynak: {}, tokenIdler: [], hareketler: [], ilk: null, son: null,
  };
}

function kategori(islem, nft) {
  if (/mint/.test(islem.tur) || nft) return 'mint';
  return 'alim';
}

// islemler: defterOlustur çıktısı (eskiden yeniye). bnbUsd: zaman -> BNB fiyatı
// nftKontratlari: zincirden NFT olduğu doğrulanmış kontratlar. Binance geçmişi bazı NFT mintlerinde token numarası vermiyor;
// numarasız giriş bu kümede ise yine NFT sayılır
export function varliklariHesapla(islemler, bnbUsd, nftKontratlari = new Set()) {
  const nftMi = (k) => k.tokenId != null || nftKontratlari.has(String(k.kontrat).toLowerCase());
  const v = new Map();
  const nakit = { yatirilanUsd: 0, yatirilanBnb: 0, cekilenUsd: 0, cekilenBnb: 0, harcamaUsd: 0, harcamaBnb: 0, gelirUsd: 0, gelirBnb: 0, gasUsd: 0, gasBnb: 0, bnbBakiye: 0 };
  const al = (k) => {
    const a = `${k.kontrat}`;
    if (!v.has(a)) v.set(a, yeniVarlik(k, nftMi(k)));
    const x = v.get(a);
    if (!x.sembol && k.sembol) x.sembol = k.sembol;
    return x;
  };

  for (const i of islemler) {
    const fiyat = bnbUsd(i.zaman) ?? 0;
    nakit.gasBnb += i.gasBnb;
    nakit.gasUsd += i.gasBnb * fiyat;
    nakit.bnbBakiye += i.bnbNet - i.gasBnb;
    const cikis = i.bnbNet < 0 ? -i.bnbNet : 0;
    const giris = i.bnbNet > 0 ? i.bnbNet : 0;

    if (i.giren.length && !i.cikan.length) {
      // Alım ya da mint: ödenen BNB gelen kalemlere eşit bölünür. BNB ödenmediyse bedava geldi
      const pay = i.giren.length;
      for (const k of i.giren) {
        const x = al(k);
        const nft = nftMi(k);
        const tur = cikis > 0 ? kategori(i, nft) : 'bedava';
        x.miktar += k.miktar;
        x.maliyetBnb += cikis / pay;
        x.maliyetUsd += (cikis / pay) * fiyat;
        x.alisUsd += (cikis / pay) * fiyat;
        x.kaynak[tur] = (x.kaynak[tur] || 0) + 1;
        if (nft) x.tokenIdler.push(k.tokenId);
        x.hareketler.push({ zaman: i.zaman, yon: 'giris', tur, miktar: k.miktar, usd: (cikis / pay) * fiyat, hash: i.hash });
      }
      if (giris > 0) { nakit.gelirBnb += giris; nakit.gelirUsd += giris * fiyat; }
    } else if (i.cikan.length && !i.giren.length) {
      // Satış (karşılığında BNB geldiyse) ya da başka adrese gönderim
      const pay = i.cikan.length;
      for (const k of i.cikan) {
        const x = al(k);
        const oran = x.miktar > 0 ? Math.min(1, k.miktar / x.miktar) : 0;
        const dusenUsd = x.maliyetUsd * oran, dusenBnb = x.maliyetBnb * oran;
        x.miktar = Math.max(0, x.miktar - k.miktar);
        x.maliyetUsd -= dusenUsd; x.maliyetBnb -= dusenBnb;
        if (k.tokenId != null) x.tokenIdler = x.tokenIdler.filter((t) => t !== k.tokenId);
        if (giris > 0) {
          const gelenUsd = (giris / pay) * fiyat;
          x.gerceklesenUsd += gelenUsd - dusenUsd;
          x.gerceklesenBnb += giris / pay - dusenBnb;
          x.satisUsd += gelenUsd;
          x.hareketler.push({ zaman: i.zaman, yon: 'satis', miktar: k.miktar, usd: gelenUsd, hash: i.hash });
        } else {
          x.hareketler.push({ zaman: i.zaman, yon: 'gonderim', miktar: k.miktar, usd: dusenUsd, hash: i.hash });
        }
      }
      if (cikis > 0) { nakit.harcamaBnb += cikis; nakit.harcamaUsd += cikis * fiyat; }
    } else if (i.cikan.length && i.giren.length) {
      // Token -> token takas: çıkanın maliyeti gelene aktarılır, kâr / zarar gerçekleşmez
      let aktarUsd = 0, aktarBnb = 0;
      for (const k of i.cikan) {
        const x = al(k);
        const oran = x.miktar > 0 ? Math.min(1, k.miktar / x.miktar) : 0;
        aktarUsd += x.maliyetUsd * oran; aktarBnb += x.maliyetBnb * oran;
        x.maliyetUsd -= x.maliyetUsd * oran; x.maliyetBnb -= x.maliyetBnb * oran;
        x.miktar = Math.max(0, x.miktar - k.miktar);
        x.hareketler.push({ zaman: i.zaman, yon: 'takas', miktar: k.miktar, usd: null, hash: i.hash });
      }
      aktarUsd += cikis * fiyat; aktarBnb += cikis;
      for (const k of i.giren) {
        const x = al(k);
        x.miktar += k.miktar;
        x.maliyetUsd += aktarUsd / i.giren.length; x.maliyetBnb += aktarBnb / i.giren.length;
        x.alisUsd += aktarUsd / i.giren.length;
        x.kaynak.takas = (x.kaynak.takas || 0) + 1;
        x.hareketler.push({ zaman: i.zaman, yon: 'giris', tur: 'takas', miktar: k.miktar, usd: aktarUsd / i.giren.length, hash: i.hash });
      }
    } else if (giris > 0) {
      // Sadece BNB girişi: düz transferse yatırım, kontrat çağrısıysa gelir (ödül, iade)
      if (/transfer/.test(i.tur)) { nakit.yatirilanBnb += giris; nakit.yatirilanUsd += giris * fiyat; } else { nakit.gelirBnb += giris; nakit.gelirUsd += giris * fiyat; }
    } else if (cikis > 0) {
      // Sadece BNB çıkışı: düz transferse çekim, kontrata gittiyse karşılıksız harcama
      if (i.tur === 'transfer') { nakit.cekilenBnb += cikis; nakit.cekilenUsd += cikis * fiyat; } else { nakit.harcamaBnb += cikis; nakit.harcamaUsd += cikis * fiyat; }
    }
    for (const k of [...i.giren, ...i.cikan]) {
      const x = v.get(k.kontrat);
      if (x) { x.ilk ??= i.zaman; x.son = i.zaman; }
    }
  }
  return { varliklar: [...v.values()], nakit };
}

// guncel: { kontrat -> { fiyat, sembol, ad, ikon, degisim24s, binanceOrtalama, miktar, dusukLikidite } }
// nftAdetleri: { kontrat -> zincirde doğrulanmış adet } (geçmiş çoklu mintleri eksik kaydedebilir)
export function pnlHesapla({ islemler, bnbUsd, guncel = {}, bnbSimdi, bnbBakiyeGercek = null, nftAdetleri = {}, nftKontratlari = new Set() }) {
  const { varliklar, nakit } = varliklariHesapla(islemler, bnbUsd, nftKontratlari);
  let degerUsd = 0, fiyatsizMaliyetUsd = 0, gerceklesenUsd = 0, gerceklesmemisUsd = 0;
  const kategoriler = {};
  const satirlar = varliklar.map((x) => {
    const g = guncel[x.kontrat] || {};
    const miktar = x.tur === 'nft' && nftAdetleri[x.kontrat] != null ? nftAdetleri[x.kontrat] : x.miktar;
    const fiyat = x.tur === 'token' && g.fiyat > 0 ? g.fiyat : null;
    const deger = fiyat != null ? miktar * fiyat : null;
    const acik = deger != null ? deger - x.maliyetUsd : null;
    if (deger != null) { degerUsd += deger; gerceklesmemisUsd += acik; } else if (miktar > 0) fiyatsizMaliyetUsd += x.maliyetUsd;
    gerceklesenUsd += x.gerceklesenUsd;
    for (const [tur, adet] of Object.entries(x.kaynak)) {
      const c = (kategoriler[tur] ||= { ad: TUR_ADI[tur] || tur, islem: 0, varlik: 0, maliyetUsd: 0, degerUsd: 0, fiyatsiz: 0 });
      c.islem += adet;
    }
    const anaTur = Object.entries(x.kaynak).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diger';
    const c = (kategoriler[anaTur] ||= { ad: TUR_ADI[anaTur] || anaTur, islem: 0, varlik: 0, maliyetUsd: 0, degerUsd: 0, fiyatsiz: 0 });
    c.varlik++; c.maliyetUsd += x.maliyetUsd;
    if (deger != null) c.degerUsd += deger; else if (miktar > 0) c.fiyatsiz++;
    // Binance'in kendi hesabıyla çapraz kontrol: ortalama alış fiyatı %15'ten fazla farklıysa uyar
    const ortalama = x.tur === 'token' && miktar > 0 && x.maliyetUsd > 0 ? x.maliyetUsd / miktar : null;
    const binanceFark = ortalama && g.binanceOrtalama > 0 ? (ortalama - g.binanceOrtalama) / g.binanceOrtalama : null;
    return {
      kontrat: x.kontrat, sembol: g.sembol || x.sembol, ad: g.ad || null, ikon: g.ikon || null, tur: x.tur, kaynak: x.kaynak, anaTur,
      miktar, maliyetUsd: x.maliyetUsd, maliyetBnb: x.maliyetBnb, ortalamaUsd: ortalama, fiyat, degisim24s: g.degisim24s ?? null,
      degerUsd: deger, gerceklesmemisUsd: acik, gerceklesenUsd: x.gerceklesenUsd, satisUsd: x.satisUsd,
      toplamUsd: (acik ?? 0) + x.gerceklesenUsd, alisUsd: x.alisUsd,
      yuzde: x.alisUsd > 0 && (acik != null || miktar === 0) ? (((acik ?? 0) + x.gerceklesenUsd) / x.alisUsd) * 100 : null,
      binanceOrtalama: g.binanceOrtalama ?? null, binanceFark, dusukLikidite: !!g.dusukLikidite,
      tokenIdler: x.tokenIdler.slice(-50), hareketler: x.hareketler, ilk: x.ilk, son: x.son,
    };
  });

  const bnbBakiye = bnbBakiyeGercek ?? nakit.bnbBakiye;
  const bnbDegerUsd = bnbBakiye * (bnbSimdi || 0);
  const netYatirilanUsd = nakit.yatirilanUsd - nakit.cekilenUsd;
  const toplamDegerUsd = degerUsd + bnbDegerUsd;
  const netUsd = toplamDegerUsd - netYatirilanUsd;
  const uyarilar = [];
  if (bnbBakiyeGercek != null && Math.abs(bnbBakiyeGercek - nakit.bnbBakiye) > 0.0005) {
    uyarilar.push(`Geçmişten hesaplanan BNB bakiyesi (${nakit.bnbBakiye.toFixed(5)}) gerçek bakiyeden (${bnbBakiyeGercek.toFixed(5)}) farklı: geçmiş eksik olabilir, toplamlar yaklaşık.`);
  }
  for (const s of satirlar) if (s.binanceFark != null && Math.abs(s.binanceFark) > 0.15) uyarilar.push(`${s.sembol || s.kontrat}: bizim ortalama alış fiyatımız Binance'inkinden %${(s.binanceFark * 100).toFixed(0)} farklı.`);

  return {
    ozet: {
      toplamDegerUsd, tokenDegerUsd: degerUsd, bnbBakiye, bnbDegerUsd, bnbSimdi,
      yatirilanUsd: nakit.yatirilanUsd, cekilenUsd: nakit.cekilenUsd, netYatirilanUsd,
      netUsd, netYuzde: netYatirilanUsd > 0 ? (netUsd / netYatirilanUsd) * 100 : null,
      netMaliyetleUsd: netUsd + fiyatsizMaliyetUsd, fiyatsizMaliyetUsd,
      gerceklesenUsd, gerceklesmemisUsd, gasUsd: nakit.gasUsd, gasBnb: nakit.gasBnb,
      harcamaUsd: nakit.harcamaUsd, gelirUsd: nakit.gelirUsd, islemSayisi: islemler.length,
      // Varlık bazındaki kalemlerle açıklanamayan kısım: eldeki BNB'nin fiyat değişimi
      bnbFiyatEtkisiUsd: netUsd + fiyatsizMaliyetUsd - (gerceklesenUsd + gerceklesmemisUsd - nakit.gasUsd - nakit.harcamaUsd + nakit.gelirUsd),
    },
    varliklar: satirlar.sort((a, b) => (b.degerUsd ?? -1) - (a.degerUsd ?? -1) || b.maliyetUsd - a.maliyetUsd),
    kategoriler, uyarilar,
  };
}

// Zaman serisi: her noktada portföy değeri ve o ana kadar yatırılan net para.
// fiyatAt(kontrat, zaman) -> o anki USD fiyatı ya da null (fiyatı bilinmeyen varlık 0 sayılır)
export function seriOlustur({ islemler, noktalar, fiyatAt, bnbUsd }) {
  const seri = [];
  let j = 0;
  const miktar = new Map();
  let bnb = 0, yatirilan = 0;
  for (const z of noktalar) {
    for (; j < islemler.length && islemler[j].zaman <= z; j++) {
      const i = islemler[j];
      const f = bnbUsd(i.zaman) ?? 0;
      bnb += i.bnbNet - i.gasBnb;
      if (!i.giren.length && !i.cikan.length && /transfer/.test(i.tur)) yatirilan += i.bnbNet * f;
      for (const k of i.giren) if (k.tokenId == null) miktar.set(k.kontrat, (miktar.get(k.kontrat) || 0) + k.miktar);
      for (const k of i.cikan) if (k.tokenId == null) miktar.set(k.kontrat, Math.max(0, (miktar.get(k.kontrat) || 0) - k.miktar));
    }
    const fb = bnbUsd(z) ?? 0;
    let deger = Math.max(0, bnb) * fb;
    for (const [k, m] of miktar) { const f = m > 0 ? fiyatAt(k, z) : null; if (f) deger += m * f; }
    seri.push({ zaman: z, degerUsd: deger, yatirilanUsd: yatirilan, netUsd: deger - yatirilan });
  }
  return seri;
}
