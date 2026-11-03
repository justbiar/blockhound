// PancakeSwap: havuz bulma, zincirden fiyat / likidite / arz, en iyi rotadan teklif ve swap calldata'sı.
// Fiyat ve likidite doğrudan PancakeSwap kontratlarından okunur. Mum grafiği ve holder sayısı GeckoTerminal'den,
// ilk 10 cüzdan payı OKX'ten gelir (ikisi de isteğe bağlı, gelmezse alan boş kalır).
// İşlem göndermez: teklif bir tx ({ to, inputData, value }) döndürür, gönderim trader.kontratEmriVer'den geçer.
import { Interface, getAddress, formatUnits, parseUnits, ZeroAddress, id as olayId } from 'ethers';

// Adresler BSC ana ağında zincirden doğrulandı (router.factory() ve quoter.factory() eşleşiyor)
export const PANCAKE = {
  v2Factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  v2Router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  v3Factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  v3Router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
  v3Quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
};
export const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USD1 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
// Fiyat bulunurken bakılan karşı tokenler; dolar karşılığı: WBNB için BNB fiyatı, stabiller için 1
const KARSI = [{ adres: WBNB, sembol: 'WBNB' }, { adres: USDT, sembol: 'USDT', usd: 1 }, { adres: USD1, sembol: 'USD1', usd: 1 }];
const V3_UCRETLER = [100, 500, 2500, 10000];
const YAKIM = ['0x000000000000000000000000000000000000dEaD', ZeroAddress];

const ERC20 = [
  'function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)',
];
const V2_FABRIKA = ['function getPair(address,address) view returns (address)'];
const V2_CIFT = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];
const V3_FABRIKA = ['function getPool(address,address,uint24) view returns (address)'];
const V3_HAVUZ = ['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)', 'function token0() view returns (address)'];
export const V2_ROUTER = new Interface([
  'function getAmountsOut(uint256,address[]) view returns (uint256[])',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
]);
export const V3_ROUTER = new Interface([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function multicall(bytes[] data) payable returns (bytes[])',
]);
const V3_QUOTER = ['function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)'];
export const ERC20_ARAYUZ = new Interface(ERC20);
const TRANSFER = olayId('Transfer(address,address,uint256)');
const CEKIM = olayId('Withdrawal(address,uint256)');   // WBNB → BNB

const ayni = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const sifirMi = (a) => !a || ayni(a, ZeroAddress);

// --- Saf hesaplar (testli) ---

// V3 sqrtPriceX96 → token'ın karşı token cinsinden fiyatı (ondalıklar düzeltilmiş)
export function v3Fiyat({ sqrtPriceX96, tokenSifirMi, ondalikToken, ondalikKarsi }) {
  const p = (Number(sqrtPriceX96) / 2 ** 96) ** 2;   // ham: token1 / token0
  if (!Number.isFinite(p) || p === 0) return null;
  return tokenSifirMi ? p * 10 ** (ondalikToken - ondalikKarsi) : (1 / p) * 10 ** (ondalikToken - ondalikKarsi);
}

// V2 rezervlerinden fiyat ve likidite (karşı taraf x2)
export function v2Fiyat({ rezervToken, rezervKarsi, ondalikToken, ondalikKarsi }) {
  const t = Number(formatUnits(rezervToken, ondalikToken)), k = Number(formatUnits(rezervKarsi, ondalikKarsi));
  return { fiyat: t > 0 ? k / t : null, karsiMiktar: k };
}

// Kayma payı düşülmüş en az çıktı (kayma yüzde, ör. 10 = %10)
export function enAzCikti(cikti, kaymaYuzde) {
  const bps = BigInt(Math.round(Math.min(Math.max(Number(kaymaYuzde) || 0, 0), 50) * 100));
  return (BigInt(cikti) * (10_000n - bps)) / 10_000n;
}

// Rota için swap tx'i. yon 'al': BNB → token, 'sat': token → BNB. Değerler ham birim (BigInt)
export function swapTx({ rota, yon, token, girdi, enAz, alici, sonTarih }) {
  if (rota.surum === 'v2') {
    if (yon === 'al') {
      return { to: PANCAKE.v2Router, value: girdi.toString(), inputData: V2_ROUTER.encodeFunctionData('swapExactETHForTokensSupportingFeeOnTransferTokens', [enAz, rota.yol, alici, sonTarih]) };
    }
    return { to: PANCAKE.v2Router, value: '0', inputData: V2_ROUTER.encodeFunctionData('swapExactTokensForETHSupportingFeeOnTransferTokens', [girdi, enAz, rota.yol, alici, sonTarih]) };
  }
  if (yon === 'al') {
    const p = { tokenIn: WBNB, tokenOut: token, fee: rota.ucret, recipient: alici, deadline: sonTarih, amountIn: girdi, amountOutMinimum: enAz, sqrtPriceLimitX96: 0n };
    return { to: PANCAKE.v3Router, value: girdi.toString(), inputData: V3_ROUTER.encodeFunctionData('exactInputSingle', [p]) };
  }
  // Satış: WBNB router'da kalır, aynı işlemde BNB'ye çevrilip cüzdana gönderilir
  const p = { tokenIn: token, tokenOut: WBNB, fee: rota.ucret, recipient: PANCAKE.v3Router, deadline: sonTarih, amountIn: girdi, amountOutMinimum: enAz, sqrtPriceLimitX96: 0n };
  const adimlar = [V3_ROUTER.encodeFunctionData('exactInputSingle', [p]), V3_ROUTER.encodeFunctionData('unwrapWETH9', [enAz, alici])];
  return { to: PANCAKE.v3Router, value: '0', inputData: V3_ROUTER.encodeFunctionData('multicall', [adimlar]) };
}

// Makbuzdan gerçekleşen tutar: alımda cüzdana gelen token, satışta router'ın çözdüğü WBNB (BNB)
export function makbuzTutari(makbuz, { yon, token, cuzdan, ondalik }) {
  let toplam = 0n;
  for (const l of makbuz?.logs || []) {
    if (yon === 'al' && ayni(l.address, token) && l.topics?.[0] === TRANSFER && ayni(`0x${String(l.topics[2]).slice(26)}`, cuzdan)) toplam += BigInt(l.data);
    if (yon === 'sat' && ayni(l.address, WBNB) && l.topics?.[0] === CEKIM) toplam += BigInt(l.data);
  }
  return toplam > 0n ? formatUnits(toplam, yon === 'al' ? ondalik : 18) : null;
}

const sayiYaDaNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Okumalar Multicall3 ile tek eth_call'da toplanır: onlarca ayrı istek hem yavaş hem de bazı RPC'lerde takılıyor
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MC = new Interface(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])']);
const I_ERC20 = ERC20_ARAYUZ, I_V2F = new Interface(V2_FABRIKA), I_V2C = new Interface(V2_CIFT), I_V3F = new Interface(V3_FABRIKA), I_V3H = new Interface(V3_HAVUZ), I_Q = new Interface(V3_QUOTER);
const c = (hedef, arayuz, fn, args = []) => ({ hedef, arayuz, fn, args });

export function pancakeOlustur({ provider, fetchFn = globalThis.fetch, gecko = null, okx = null, simdi = () => Date.now(), zamanAsimiMs = 15_000 }) {
  const onbellek = new Map();
  function sakla(anahtar, ms, f) {
    const o = onbellek.get(anahtar);
    if (o && simdi() - o.at < ms) return o.p;
    const p = f();
    onbellek.set(anahtar, { at: simdi(), p });
    p.catch(() => onbellek.delete(anahtar));
    return p;
  }
  // Yavaş kaynaklar (GeckoTerminal, OKX) kartı en fazla bekleMs bekletir; gelmezse eski değer ya da null döner, sonraki yenilemede gelir
  async function hazirsa(anahtar, ms, f, bekleMs = 3_500) {
    const o = onbellek.get(anahtar);
    if (o && simdi() - o.at < ms && o.deger !== undefined) return o.deger;
    const p = sakla(anahtar, ms, f);
    p.then((d) => { const x = onbellek.get(anahtar); if (x) x.deger = d; }, () => {});
    const d = await Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(undefined), bekleMs))]);
    return d === undefined ? (o?.deger ?? null) : d;
  }
  const geckoTek = (url) => (gecko ? gecko(url) : fetchFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))));
  // GeckoTerminal dakikalık sınıra takılırsa (429) bir kez bekleyip yeniden dener
  const geckoGetir = (url) => geckoTek(url).catch(async (e) => {
    if (!/429/.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 4_000));
    return geckoTek(url);
  });
  const sonMumlar = new Map();   // son başarılı mum listesi: sınır aşılınca boş grafik yerine bu gösterilir

  // Çağrıları toplu çalıştırır; başarısız ya da çözülemeyen her sonuç null. Tek dönüş değeri olanlar düz döner
  async function toplu(cagrilar) {
    const sonuc = [];
    for (let i = 0; i < cagrilar.length; i += 120) {
      const parca = cagrilar.slice(i, i + 120);
      const veri = MC.encodeFunctionData('aggregate3', [parca.map((x) => ({ target: x.hedef, allowFailure: true, callData: x.arayuz.encodeFunctionData(x.fn, x.args) }))]);
      const ham = await Promise.race([
        provider.call({ to: MULTICALL3, data: veri }),
        new Promise((_, red) => setTimeout(() => red(new Error('RPC zaman aşımı')), zamanAsimiMs)),
      ]);
      const [donen] = MC.decodeFunctionResult('aggregate3', ham);
      donen.forEach((r, j) => {
        if (!r.success) return sonuc.push(null);
        try { const d = parca[j].arayuz.decodeFunctionResult(parca[j].fn, r.returnData); sonuc.push(d.length === 1 ? d[0] : d); } catch { sonuc.push(null); }
      });
    }
    return sonuc;
  }

  const meta = (a) => sakla(`meta:${a.toLowerCase()}`, 24 * 3_600_000, async () => {
    const [ad, sembol, ondalik] = await toplu([c(a, I_ERC20, 'name'), c(a, I_ERC20, 'symbol'), c(a, I_ERC20, 'decimals')]);
    if (ondalik == null) throw new Error('Token okunamadı (ERC-20 değil ya da adres yanlış)');
    return { adres: getAddress(a), ad: ad || '', sembol: sembol || '?', ondalik: Number(ondalik) };
  });
  const karsiMeta = () => sakla('karsiMeta', 24 * 3_600_000, async () => {
    const d = await toplu(KARSI.map((k) => c(k.adres, I_ERC20, 'decimals')));
    return Object.fromEntries(KARSI.map((k, i) => [k.adres.toLowerCase(), Number(d[i] ?? 18)]));
  });
  const bnbHavuz = () => sakla('bnbHavuz', 24 * 3_600_000, async () => (await toplu([c(PANCAKE.v3Factory, I_V3F, 'getPool', [WBNB, USDT, 500])]))[0]);

  // Tokenin PancakeSwap havuzları (adresler 5 dk önbellekte, rezervler her okumada taze)
  const havuzAdresleri = (token) => sakla(`havuzlar:${token.toLowerCase()}`, 5 * 60_000, async () => {
    const adaylar = [];
    for (const k of KARSI) {
      if (ayni(k.adres, token)) continue;
      adaylar.push({ surum: 'v2', karsi: k, cagri: c(PANCAKE.v2Factory, I_V2F, 'getPair', [token, k.adres]) });
      for (const u of V3_UCRETLER) adaylar.push({ surum: 'v3', ucret: u, karsi: k, cagri: c(PANCAKE.v3Factory, I_V3F, 'getPool', [token, k.adres, u]) });
    }
    const adresler = await toplu(adaylar.map((a) => a.cagri));
    return adaylar.map(({ cagri, ...a }, i) => (sifirMi(adresler[i]) ? null : { ...a, adres: adresler[i] })).filter(Boolean);
  });

  // Havuz durumları, arz ve BNB fiyatı tek toplu okumada
  async function durumOku(tm, adresler) {
    const bh = await bnbHavuz();
    const cagrilar = [c(bh, I_V3H, 'slot0'), c(bh, I_V3H, 'token0'), c(tm.adres, I_ERC20, 'totalSupply'), ...YAKIM.map((y) => c(tm.adres, I_ERC20, 'balanceOf', [y]))];
    for (const h of adresler) {
      if (h.surum === 'v2') cagrilar.push(c(h.adres, I_V2C, 'getReserves'), c(h.adres, I_V2C, 'token0'));
      else cagrilar.push(c(h.adres, I_V3H, 'slot0'), c(h.adres, I_V3H, 'token0'), c(tm.adres, I_ERC20, 'balanceOf', [h.adres]), c(h.karsi.adres, I_ERC20, 'balanceOf', [h.adres]));
    }
    const [km, d] = await Promise.all([karsiMeta(), toplu(cagrilar)]);
    if (!d[0] || !d[1]) throw new Error('BNB fiyatı okunamadı');
    const bnb = v3Fiyat({ sqrtPriceX96: d[0][0], tokenSifirMi: ayni(d[1], WBNB), ondalikToken: 18, ondalikKarsi: 18 });
    const arzHam = d[2] ?? 0n, yakilanHam = (d[3] ?? 0n) + (d[4] ?? 0n);
    let i = 5;
    const havuzlar = [];
    for (const h of adresler) {
      const ok = km[h.karsi.adres.toLowerCase()];
      const karsiUsd = h.karsi.usd ?? bnb;
      if (h.surum === 'v2') {
        const [rez, t0] = [d[i], d[i + 1]]; i += 2;
        if (!rez || !t0) continue;
        const tokenSifir = ayni(t0, tm.adres);
        const { fiyat, karsiMiktar } = v2Fiyat({ rezervToken: tokenSifir ? rez[0] : rez[1], rezervKarsi: tokenSifir ? rez[1] : rez[0], ondalikToken: tm.ondalik, ondalikKarsi: ok });
        if (fiyat == null) continue;
        havuzlar.push({ ...h, fiyatUsd: fiyat * karsiUsd, likiditeUsd: 2 * karsiMiktar * karsiUsd });
      } else {
        const [s0, t0, bT, bK] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; i += 4;
        if (!s0 || !t0) continue;
        const fiyat = v3Fiyat({ sqrtPriceX96: s0[0], tokenSifirMi: ayni(t0, tm.adres), ondalikToken: tm.ondalik, ondalikKarsi: ok });
        if (fiyat == null) continue;
        const fiyatUsd = fiyat * karsiUsd;
        havuzlar.push({ ...h, fiyatUsd, likiditeUsd: Number(formatUnits(bK ?? 0n, ok)) * karsiUsd + Number(formatUnits(bT ?? 0n, tm.ondalik)) * fiyatUsd });
      }
    }
    havuzlar.sort((a, b) => (b.likiditeUsd || 0) - (a.likiditeUsd || 0));
    return { bnb, arzHam, yakilanHam, havuzlar };
  }

  // GeckoTerminal: holder sayısı (10 dk) ve en derin havuzun 24 saatlik hacim / değişim / işlem sayısı (1 dk); OKX: ilk 10 payı (10 dk)
  const holderGetir = (token) => geckoGetir(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${token}/info`).then((j) => sayiYaDaNull(j?.data?.attributes?.holders?.count));
  const ozetGetir = async (havuz) => {
    const a = (await geckoGetir(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${havuz}`))?.data?.attributes || {};
    const tx = a.transactions?.h24 || {};
    return { hacim24sUsd: sayiYaDaNull(a.volume_usd?.h24), degisim24s: sayiYaDaNull(a.price_change_percentage?.h24), alim24s: sayiYaDaNull(tx.buys), satim24s: sayiYaDaNull(tx.sells) };
  };
  const ilk10Getir = async (token) => (okx ? sayiYaDaNull((await okx(['token', 'advanced-info', '--chain', 'bsc', '--address', token]))?.top10HoldPercent) : null);

  // Token kartı: fiyat, piyasa değeri, arz, likidite, holder, havuzlar. Zincir verisi her çağrıda taze (10 sn önbellek)
  const bilgi = (adres) => sakla(`bilgi:${String(adres).toLowerCase()}`, 10_000, async () => {
    const token = getAddress(adres);
    const [tm, adresler] = await Promise.all([meta(token), havuzAdresleri(token)]);
    const { bnb, arzHam, yakilanHam, havuzlar } = await durumOku(tm, adresler);
    const ana = havuzlar[0] || null;
    const arz = Number(formatUnits(arzHam, tm.ondalik));
    const yakilan = Number(formatUnits(yakilanHam, tm.ondalik));
    const dolasim = arz - yakilan;
    const [holder, ozet, ilk10] = await Promise.all([
      hazirsa(`holder:${token.toLowerCase()}`, 10 * 60_000, () => holderGetir(token)),
      ana ? hazirsa(`ozet:${ana.adres.toLowerCase()}`, 60_000, () => ozetGetir(ana.adres)) : null,
      hazirsa(`ilk10:${token.toLowerCase()}`, 10 * 60_000, () => ilk10Getir(token)),
    ]);
    const fiyatUsd = ana?.fiyatUsd ?? null;
    return {
      ...tm, bnbUsd: bnb, fiyatUsd, fiyatBnb: fiyatUsd != null && bnb ? fiyatUsd / bnb : null,
      arz, dolasim, yakilan,
      piyasaDegeriUsd: fiyatUsd != null ? fiyatUsd * dolasim : null, fdvUsd: fiyatUsd != null ? fiyatUsd * arz : null,
      likiditeUsd: havuzlar.reduce((t, h) => t + (h.likiditeUsd || 0), 0) || null,
      holder, ilk10Yuzde: ilk10, hacim24sUsd: null, degisim24s: null, alim24s: null, satim24s: null, ...(ozet || {}),
      anaHavuz: ana ? { adres: ana.adres, surum: ana.surum, ucret: ana.ucret ?? 2500, karsi: ana.karsi.sembol } : null,
      havuzlar: havuzlar.map((h) => ({ adres: h.adres, surum: h.surum, ucret: h.surum === 'v2' ? 2500 : h.ucret, karsi: h.karsi.sembol, fiyatUsd: h.fiyatUsd, likiditeUsd: h.likiditeUsd })),
      zaman: simdi(),
    };
  });

  const bnbUsd = async () => (await durumOku({ adres: WBNB, ondalik: 18 }, [])).bnb;

  // Mum grafiği (USD): aralık '5d' | '15d' | '1s' | '4s' | '1g'
  const ARALIK = { '5d': ['minute', 5], '15d': ['minute', 15], '1s': ['hour', 1], '4s': ['hour', 4], '1g': ['day', 1] };
  async function mumlar(adres, { havuz = null, aralik = '1s', limit = 200 } = {}) {
    const token = getAddress(adres);
    const [tip, agg] = ARALIK[aralik] || ARALIK['1s'];
    const h = havuz && /^0x[0-9a-fA-F]{40}$/.test(havuz) ? havuz : (await bilgi(token)).anaHavuz?.adres;
    if (!h) return { havuz: null, mumlar: [] };
    const anahtar = `mum:${h.toLowerCase()}:${token.toLowerCase()}:${aralik}`;
    return sakla(anahtar, tip === 'minute' ? 60_000 : 5 * 60_000, async () => {
      const j = await geckoGetir(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${h}/ohlcv/${tip}?aggregate=${agg}&limit=${Math.min(1000, limit)}&currency=usd&token=${token}`);
      const liste = (j?.data?.attributes?.ohlcv_list || [])
        .map(([z, a, y, d, k, hcm]) => ({ zaman: z, acilis: +a, yuksek: +y, dusuk: +d, kapanis: +k, hacim: +hcm }))
        .sort((a, b) => a.zaman - b.zaman)
        .filter((m, i, l) => i === 0 || m.zaman !== l[i - 1].zaman);
      sonMumlar.set(anahtar, liste);
      return { havuz: h, mumlar: liste };
    }).catch((e) => {
      if (sonMumlar.has(anahtar)) return { havuz: h, mumlar: sonMumlar.get(anahtar), eski: true };
      throw e;
    });
  }

  // En iyi rotadan teklif ve imzalanmaya hazır tx. yon 'al': miktar BNB; 'sat': miktar token adedi
  async function teklif({ yon, token: adres, miktar, kayma = 10, cuzdan }) {
    if (yon !== 'al' && yon !== 'sat') throw new Error('yon "al" ya da "sat" olmalı');
    const token = getAddress(adres);
    const alici = getAddress(cuzdan);
    const [tm, adresler] = await Promise.all([meta(token), havuzAdresleri(token)]);
    if (!adresler.length) throw new Error('PancakeSwap\'ta bu token için havuz yok');
    // Aday rotalar: V2'de BNB ile doğrudan ya da bir stabil üzerinden, V3'te WBNB havuzları
    const adaylar = [];
    for (const h of adresler.filter((x) => x.surum === 'v2')) adaylar.push({ surum: 'v2', yol: ayni(h.karsi.adres, WBNB) ? [WBNB, token] : [WBNB, h.karsi.adres, token] });
    for (const h of adresler.filter((x) => x.surum === 'v3' && ayni(x.karsi.adres, WBNB))) adaylar.push({ surum: 'v3', ucret: h.ucret, yol: [WBNB, token] });
    if (!adaylar.length) throw new Error('PancakeSwap\'ta BNB ile işlem yapılabilecek bir rota yok');
    if (yon === 'sat') for (const r of adaylar) r.yol = [...r.yol].reverse();

    const girdi = yon === 'al' ? parseUnits(String(miktar), 18) : parseUnits(String(miktar), tm.ondalik);
    const cagrilar = adaylar.map((r) => (r.surum === 'v2'
      ? c(PANCAKE.v2Router, V2_ROUTER, 'getAmountsOut', [girdi, r.yol])
      : c(PANCAKE.v3Quoter, I_Q, 'quoteExactInputSingle', [{ tokenIn: r.yol[0], tokenOut: r.yol[1], amountIn: girdi, fee: r.ucret, sqrtPriceLimitX96: 0n }])));
    if (yon === 'sat') cagrilar.push(c(token, I_ERC20, 'allowance', [alici, PANCAKE.v2Router]), c(token, I_ERC20, 'allowance', [alici, PANCAKE.v3Router]));
    const d = await toplu(cagrilar);
    const sonuclar = adaylar.map((r, i) => {
      const x = d[i];
      const cikti = x == null ? null : r.surum === 'v2' ? x.at(-1) : x[0];
      return cikti ? { ...r, cikti } : null;
    });
    const en = sonuclar.filter((r) => r && r.cikti > 0n).sort((a, b) => (b.cikti > a.cikti ? 1 : -1))[0];
    if (!en) throw new Error('PancakeSwap rotaları teklif veremedi (likidite yetersiz olabilir)');

    const enAz = enAzCikti(en.cikti, kayma);
    const sonTarih = BigInt(Math.floor(simdi() / 1000) + 600);
    const tx = swapTx({ rota: en, yon, token, girdi, enAz, alici, sonTarih });
    const spender = en.surum === 'v2' ? PANCAKE.v2Router : PANCAKE.v3Router;
    let onay = null;
    if (yon === 'sat') {
      const izin = (en.surum === 'v2' ? d[adaylar.length] : d[adaylar.length + 1]) ?? 0n;
      if (izin < girdi) onay = { spender, miktarHam: girdi.toString(), tx: { to: token, value: '0', inputData: ERC20_ARAYUZ.encodeFunctionData('approve', [spender, girdi]) } };
    }
    const ondalikCikti = yon === 'al' ? tm.ondalik : 18;
    const rotaAd = en.surum === 'v2' ? `PancakeSwap V2${en.yol.length > 2 ? ' (stabil üzerinden)' : ''}` : `PancakeSwap V3 %${en.ucret / 10_000}`;
    return {
      rota: 'pancakeswap', rotaAd, surum: en.surum, ucret: en.ucret ?? 2500, yol: en.yol,
      fromCoinAmount: String(miktar), fromCoinSymbol: yon === 'al' ? 'BNB' : tm.sembol,
      toCoinAmount: formatUnits(en.cikti, ondalikCikti), toCoinSymbol: yon === 'al' ? tm.sembol : 'BNB',
      enAz: formatUnits(enAz, ondalikCikti), slippage: Number(kayma) / 100, ondalik: tm.ondalik,
      tx, onay, onayGerekli: !!onay,
    };
  }

  return { bilgi, mumlar, teklif, bnbUsd, meta };
}
