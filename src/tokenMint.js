// Token mintleri: NFT basmayan, bir mint kontratı üzerinden ERC-20 dağıtan lansmanlar (JAGENT, AGENT MAO gibi).
// Bu kontratların mint fonksiyonları argüman ister: pay sayısı, Agent ID numarası, referans, en fazla ödeme.
// Seçiciler bytecode'dan çıkarılır ve imza veritabanından çözülür; argümanlar türlerine göre aday değerlerle
// denenir ve her deneme cüzdan adresiyle eth_call olarak simüle edilir. Sadece okuma yapar.
import { Interface, MaxUint256, ZeroAddress, parseEther, id } from 'ethers';

// Ağ yokken de tanınsın diye bilinen token mint imzaları
export const BILINEN_IMZALAR = [
  'mint(uint256,uint256,uint256)', 'mint(uint256,uint256)', 'mintWithBnb(uint256,address,uint256)', 'mintWithBnb(uint256,address)',
  'mintWithBnb(uint256)', 'mint(uint256,address,uint256)', 'quote(uint256,uint256)', 'quote(uint256)', 'bnbQuote(uint256)',
  'bnbQuote(uint256,uint256)', 'token()', 'TOKEN()',
];
// Basılan varlığın adresini veren getter'lar: token mintleri ve NFT'yi ayrı bir satış kontratından satanlar
const TOKEN_GETTER = ['token()', 'TOKEN()', 'mintToken()', 'rewardToken()', 'nft()', 'NFT()', 'collection()', 'relic()'];
// Bu tutarın üstündeki token mintleri listelenmez
export const TOKEN_UCRET_MAX = parseEther('0.01');
const BASAMAKLAR = ['0.0005', '0.001', '0.002', '0.005', '0.01'].map((v) => parseEther(v));
const UINT = /^uint\d*$/;

export const seciciOf = (imza) => id(imza).slice(2, 10);

export function kodSecicileri(kod) {
  return [...new Set([...String(kod).toLowerCase().matchAll(/63([0-9a-f]{8})/g)].map((m) => m[1]))];
}

export const parametreler = (imza) => imza.slice(imza.indexOf('(') + 1, -1).split(',').filter(Boolean);
const ad = (imza) => imza.slice(0, imza.indexOf('('));

// Kullanıcının çağırabileceği mint fonksiyonları: sadece sayı ve adres argümanı alanlar
const PARAMETRESIZ = new Set(['mint', 'claim', 'freeMint', 'publicMint', 'mintFree', 'mintPublic', 'claimFree', 'agentMint', 'agentClaim', 'claimToken', 'claimTokens', 'claimAirdrop', 'buy']);

export function mintAdaylari(imzalar) {
  // Fonksiyonlar küçük harfle başlar; büyük harfle başlayanlar hata ya da sabit adıdır (MintNotStarted, MINT_PRICE)
  return imzalar.filter((s) => /^(mint|claim|freeMint|publicMint|agentMint|buy)/.test(ad(s))
    && !/proof|signature|social|sig$|admin|owner|import|batch/i.test(ad(s))
    // Okuma fonksiyonları: mintedById, mintedCount, mintPrice, claimableOf gibi
    && !/^(minted|mintable|claimed|claimable)|(minted|claimed|count|price|cost|quota|limit|of|byid|fee|amount|time|start|end|open|enabled|active|paused)$/i.test(ad(s))
    // Adının içinde de okuma kelimesi geçenler: mintPriceAt, mintState, mintsSold, buyValue, claimableAmountOf gibi
    && !/price|cost|quote|fee|supply|balance|remain|count|status|state|info|sold|value|max|total|left|enabled|open|active|paused|limit|time|config|phase|stage/i
      .test(ad(s).replace(/^(mint|claim|freeMint|publicMint|agentMint|buy)/, ''))
    // Parametresiz olanlar sadece bilinen eylem adlarıyla: parametresiz okuma fonksiyonları çok yaygın
    && (parametreler(s).length > 0 || PARAMETRESIZ.has(ad(s)))
    && parametreler(s).length <= 4 && parametreler(s).every((t) => UINT.test(t) || t === 'address'))
    // BNB ile ödeyenler ve çok argümanlılar önce: token mintleri genelde böyledir
    .sort((a, b) => (/bnb/i.test(b) - /bnb/i.test(a)) || parametreler(b).length - parametreler(a).length);
}

export function fiyatAdaylari(imzalar) {
  return imzalar.filter((s) => /quote|price|cost/i.test(ad(s)) && parametreler(s).length <= 2 && parametreler(s).every((t) => UINT.test(t)))
    .sort((a, b) => /bnb/i.test(b) - /bnb/i.test(a));
}

// Argüman adayları: sayı için 1, gönderilen değer (en fazla ödeme sınırı), Agent ID numarası, "yok" anlamında en büyük sayı;
// adres için sıfır adres (referans yok) ve cüzdan. Sıra önemli: ilk geçen kombinasyon kullanılır, sınırsız değerler en sona kalır
export function* argumanlar(turler, { cuzdan, agentId = null, deger = 0n }) {
  const sayilar = [1n, ...(deger > 0n ? [deger] : []), ...(agentId != null ? [agentId] : []), MaxUint256];
  const adresler = [ZeroAddress, cuzdan];
  // uint8 gibi dar türlere sadece sığan değerler girer
  const sigar = (t) => { const b = BigInt(t.slice(4) || 256); return sayilar.filter((v) => v < (1n << b)); };
  const havuz = turler.map((t) => (t === 'address' ? adresler : sigar(t)));
  const n = havuz.length;
  const idx = new Array(n).fill(0);
  if (!n) { yield []; return; }
  while (true) {
    yield idx.map((k, i) => havuz[i][k]);
    let i = n - 1;
    while (i >= 0 && ++idx[i] >= havuz[i].length) idx[i--] = 0;
    if (i < 0) return;
  }
}

export async function imzalariCoz(seciciler, { fetchFn = globalThis.fetch, onbellek = new Map(), zamanAsimi = 8000 } = {}) {
  const sonuc = {};
  for (const s of BILINEN_IMZALAR) if (seciciler.includes(seciciOf(s))) sonuc[seciciOf(s)] = [s];
  const sor = seciciler.filter((s) => !(s in sonuc) && !onbellek.has(s));
  if (sor.length && fetchFn) {
    try {
      const url = `https://api.openchain.xyz/signature-database/v1/lookup?filter=true&function=${sor.map((s) => '0x' + s).join(',')}`;
      const yanit = await fetchFn(url, { signal: AbortSignal.timeout(zamanAsimi) });
      const f = (await yanit.json())?.result?.function || {};
      for (const s of sor) onbellek.set(s, (f['0x' + s] || []).map((x) => String(x.name)).filter((x) => /^[A-Za-z_$][\w$]*\([\w,\[\]]*\)$/.test(x)));
    } catch { /* veritabanına ulaşılamazsa sadece bilinen imzalar kullanılır */ }
  }
  for (const s of seciciler) if (!(s in sonuc) && onbellek.get(s)?.length) sonuc[s] = onbellek.get(s);
  return sonuc;
}

// Bir mint kontratını token mint'i olarak inceler. Bulamazsa null döner.
export async function tokenMintBul({ provider, adres, kod, cuzdan, agentId = null, fetchFn, onbellek, butce = 150, paralel = 8, revertSebebi = (e) => e?.shortMessage || 'revert' }) {
  const coz = await imzalariCoz(kodSecicileri(kod), { fetchFn, onbellek });
  const imzalar = [...new Set(Object.values(coz).flat())];
  const mintler = mintAdaylari(imzalar);
  if (!mintler.length) return null;

  const cagir = async (imza, args, ret = 'uint256') => {
    const i = new Interface([`function ${imza} view returns (${ret})`]);
    const out = await provider.call({ to: adres, data: i.encodeFunctionData(ad(imza), args) });
    return i.decodeFunctionResult(ad(imza), out)[0];
  };

  // Basılan token: token() benzeri bir getter ya da kontratın kendisi
  let token = null;
  for (const g of TOKEN_GETTER) {
    if (!imzalar.includes(g)) continue;
    try { const a = await cagir(g, [], 'address'); if (a && a !== ZeroAddress) { token = a; break; } } catch { /* yok */ }
  }
  token ||= adres;
  const metin = async (s) => { try { const i = new Interface([`function ${s}() view returns (string)`]); return String(i.decodeFunctionResult(s, await provider.call({ to: token, data: i.encodeFunctionData(s) }))[0]).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40); } catch { return ''; } };
  const [tokenAd, tokenSembol] = await Promise.all([metin('name'), metin('symbol')]);
  if (!tokenSembol && token === adres) return null; // ERC-20 değil
  let nft = false;
  try { nft = BigInt(await provider.call({ to: token, data: '0x01ffc9a7' + '80ac58cd'.padEnd(64, '0') })) === 1n; } catch { /* ERC-165 yok */ }

  // Fiyat: quote / bnbQuote gibi okuma fonksiyonları (1 pay için), bulunamazsa küçük ücret basamakları
  const fiyatlar = [];
  for (const f of fiyatAdaylari(imzalar)) {
    const turler = parametreler(f);
    for (const args of turler.length === 2 ? [[1n, agentId ?? 0n]] : turler.length === 1 ? [[1n]] : [[]]) {
      try { const v = BigInt(await cagir(f, args)); if (v > 0n && v <= TOKEN_UCRET_MAX && !fiyatlar.includes(v)) fiyatlar.push(v); } catch { /* geç */ }
    }
  }
  // Fiyatı her blokta değişen mintler için %2 paylı bir deneme de eklenir; gerçek tutarı Binance önizlemesi gösterir
  const payli = fiyatlar.map((v) => (v * 102n) / 100n).filter((v) => v <= TOKEN_UCRET_MAX);
  const degerler = [0n, ...[...fiyatlar, ...payli].sort((a, b) => (a < b ? -1 : 1)), ...(fiyatlar.length ? [] : BASAMAKLAR)];

  let kalan = butce;
  const sonuclar = [];
  for (const imza of mintler) {
    const iface = new Interface([`function ${imza} payable`]);
    let bulundu = null, ilkSebep = null;
    // Denemeler paralel gruplar halinde gider; grubun içinde sıradaki ilk geçen kullanılır
    disari: for (const deger of degerler) {
      const hepsi = [...argumanlar(parametreler(imza), { cuzdan, agentId, deger })];
      for (let i = 0; i < hepsi.length; i += paralel) {
        const grup = hepsi.slice(i, i + Math.min(paralel, kalan));
        if (!grup.length) break disari;
        kalan -= grup.length;
        const sonuc = await Promise.all(grup.map(async (args) => {
          let veri;
          try { veri = iface.encodeFunctionData(ad(imza), args); } catch { return null; }
          try { await provider.call({ from: cuzdan, to: adres, data: veri, value: deger }); return { args, veri }; } catch (e) { ilkSebep ||= revertSebebi(e); return null; }
        }));
        const ilk = sonuc.find(Boolean);
        if (ilk) { bulundu = { imza, gecti: true, ucretWei: deger.toString(), veri: ilk.veri, argumanlar: ilk.args.map(String) }; break disari; }
      }
    }
    sonuclar.push(bulundu || { imza, gecti: false, sebep: ilkSebep || 'denenmedi' });
    if (bulundu?.ucretWei === '0' || kalan <= 0) break;
  }
  return { token, tokenAd, tokenSembol, nft, mintler: sonuclar };
}

// Özel hata kodlarını adlandırır: 0x52df9fe5 -> SoldOut(). Adı bulunamayan kod olduğu gibi kalır
export async function hataAdlari(sebepler, { fetchFn, onbellek } = {}) {
  const kodlar = [...new Set(sebepler.map((x) => /^0x([0-9a-f]{8})/i.exec(String(x))?.[1]?.toLowerCase()).filter(Boolean))];
  if (!kodlar.length) return {};
  const coz = await imzalariCoz(kodlar, { fetchFn, onbellek });
  return Object.fromEntries(kodlar.filter((k) => coz[k]?.length).map((k) => [k, coz[k][0]]));
}
