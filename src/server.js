// Yerel HTTP sunucusu. Sadece 127.0.0.1'i dinler; değişiklik yapan istekler API token ister.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import * as C from './config.js';
import { baw } from './baw.js';
import { Trader } from './trader.js';
import { Tarayici } from './scanner.js';
import * as four from './fourAgent.js';
import { emirKayitlariOku, portfoyOlustur } from './portfoy.js';
import { Defter } from './defter.js';
import { FiyatServisi } from './fiyat.js';
import { PortfoyServisi } from './portfoyServisi.js';
import { FiyatEmirleri } from './fiyatEmirleri.js';
import { islemlerOlustur } from './islemler.js';
import { Otomasyon } from './otomasyon.js';
import { nftServisi } from './nft.js';
import { JsonRpcProvider } from 'ethers';
import { BasiciCuzdan } from './basiciCuzdan.js';
import { fourmemeApi } from './fourmemeApi.js';
import { Basim } from './basim.js';
import { MintTakip } from './mintTakip.js';
import { MintIslem } from './mintIslem.js';
import { AjanYonetici } from './ajanlar.js';
import { mintSiniflandir, sayimlar as mintSayimlar } from './mintFiltre.js';
import { openRouter } from './openrouter.js';
import { LiderServisi, onchainosCalistir } from './liderler.js';
import { braveArama } from './arama.js';
import { MaliyetTakibi } from './maliyet.js';
import { PiyasaIzleme } from './piyasaIzleme.js';
import { kasaAnaliz } from './kasaKart.js';
import { HoundTakip } from './houndTakip.js';
import { TarsTakip } from './tarsTakip.js';
import { Bildirimler, mintBildirimi } from './bildirim.js';
import { mintKayitlari, agentKontratlari, agentPortfoy } from './agentPortfoy.js';
import { UygulamaAyarlari, ALANLAR, envOku } from './ayarlar.js';
import { spawn } from 'node:child_process';

const tarayici = new Tarayici({ aralikMs: Number(process.env.TARAMA_ARALIK_MS || 5000) });
tarayici.baslat();
// Solana'daki TARS launchpad'i: Siper'de ikinci kaynak, sadece okuma
const tarsTakip = new TarsTakip({ aralikMs: Number(process.env.TARS_ARALIK_MS || 15_000) });
tarsTakip.baslat();

const trader = new Trader({
  baw, canli: C.CANLI_ISLEM, islemBasiMax: C.ISLEM_BASI_MAX_BNB, gunlukMax: C.GUNLUK_MAX_BNB, varsayilanKayma: C.VARSAYILAN_KAYMA,
  gunlukDosya: C.dataFile('gunluk-harcama.json'), kayitDosya: C.dataFile('emirler.jsonl'),
});

const islem = islemlerOlustur({ trader, baw, four });
// Bütün masaüstü bildirimleri buradan geçer: Ayarlar sekmesindeki tercihler uygulanır
const bildirimler = new Bildirimler({ dosya: C.dataFile('bildirim.json') });

// Fiyat emirleri: kâr al (Binance limit emri ya da bu terminal), zarar kes (bu terminal)
const fiyatEmirleri = new FiyatEmirleri({
  baw, islem, canli: C.CANLI_ISLEM, dosya: C.dataFile('fiyat-emirleri.json'), bildir: (b, g) => bildirimler.bildir('fiyatEmri', b, g),
  fiyatGetir: (token) => portfoy.fiyat.tokenFiyati(token),
  bakiyeGetir: async (token) => Number((await baw.bakiye()).find((x) => x.address?.toLowerCase() === token.toLowerCase())?.balance) || 0,
});
const nftler = nftServisi({ baw });
// Kâr / zarar: cüzdan geçmişi (defter) + ücretsiz fiyat kaynakları
const portfoy = new PortfoyServisi({
  baw, nftler: () => nftler(),
  defter: new Defter({ baw, dosya: C.dataFile('defter.json') }),
  fiyat: new FiyatServisi({ dosya: C.dataFile('fiyat-onbellek.json') }),
  provider: new JsonRpcProvider(C.BSC_RPC, 56, { staticNetwork: true, batchMaxCount: 1 }), standartDosya: C.dataFile('kontrat-standart.json'),
});

fiyatEmirleri.baslat();
// Fiyatı olmayan tokenler (havuzu henüz kurulmamış mintler) izlenir: piyasa açılınca bildirim
const piyasaIzleme = new PiyasaIzleme({
  portfoy, fiyatGetir: (a) => portfoy.fiyat.tokenFiyati(a), dosya: C.dataFile('piyasa-izleme.json'),
  bildir: (b, g) => bildirimler.bildir('piyasaAcildi', b, g),
});
piyasaIzleme.baslat();



const basim = new Basim({
  cuzdan: new BasiciCuzdan({ dosya: C.dataFile('basici-cuzdan.json') }),
  api: fourmemeApi({ taban: C.FOUR_MEME_API }),
  provider: new JsonRpcProvider(C.BSC_RPC, 56, { staticNetwork: true }),
  kayitDosya: C.dataFile('basimlar.jsonl'),
  canli: C.CANLI_ISLEM, onalimMax: C.BASIM_ONALIM_MAX_BNB, ucretMax: C.BASIM_UCRET_MAX_BNB,
  presetId: C.AGENT_ID_PRESET, registry: C.OPENFOUR_REGISTRY,
});

let bnbFiyatOnbellek = { at: 0, v: null };
async function bnbFiyati() {
  if (Date.now() - bnbFiyatOnbellek.at < 60_000) return bnbFiyatOnbellek.v;
  const b = (await baw.bakiye().catch(() => [])).find((x) => x.address?.toLowerCase() === C.BNB.toLowerCase());
  bnbFiyatOnbellek = { at: Date.now(), v: b ? Number(b.price) : bnbFiyatOnbellek.v };
  return bnbFiyatOnbellek.v;
}

const otomasyon = new Otomasyon({
  islem, tarayici, canli: C.CANLI_ISLEM, islemBasiMax: C.ISLEM_BASI_MAX_BNB, bnbFiyati, bakiyeGetir: () => baw.bakiye(),
  ayarDosya: C.dataFile('otomasyon.json'), pozisyonDosya: C.dataFile('pozisyonlar.json'), logDosya: C.dataFile('otomasyon-log.jsonl'),
});
otomasyon.baslat();

// Ücretsiz mint takibi: sadece okur, mintleri cüzdan adresiyle simüle eder
const mintProvider = new JsonRpcProvider(C.BSC_RPC, 56, { staticNetwork: true, batchMaxCount: 1 });
const rpcListe = (liste) => liste.split(',').map((u) => u.trim()).filter(Boolean).map((u) => new JsonRpcProvider(u, 56, { staticNetwork: true, batchMaxCount: 1 }));
const blokProvider = rpcListe(C.BSC_BLOK_RPC);
const olayProvider = C.BSC_OLAY_RPC.split(',').map((u) => u.trim()).filter(Boolean).map((u) => new JsonRpcProvider(u, 56, { staticNetwork: true, batchMaxCount: 1 }));
const mintTakip = new MintTakip({
  provider: mintProvider, olayProvider, blokProvider, cuzdanAdresi: () => baw.adres(), dosya: C.dataFile('mint-takip.json'),
  bildir: (r) => { const b = mintBildirimi(r); bildirimler.bildir(b.kategori, b.baslik, b.govde, { agentId: b.agentId }); },
});
mintTakip.baslat();
// Mint gönderimi: önce preview ve denetim, gönderim sadece kullanıcının açık onayıyla
const mintIslem = new MintIslem({
  takip: mintTakip, trader, baw, provider: mintProvider, canli: C.CANLI_ISLEM, kayitDosya: C.dataFile('mint-islemleri.jsonl'), bnbFiyati,
});
// Araştırma ajanları: LLM'ler sadece puan verir, otomatik gönderim kural tabanlı ve sadece 0 BNB'lik mintlerde
const liderler = new LiderServisi();
// Yapay zekâ maliyeti: yerel çağrı defteri ve OpenRouter'ın kendi kullanım verisi
const maliyet = new MaliyetTakibi({
  dosya: C.dataFile('llm-maliyet.jsonl'),
  anahtar: () => (C.OPENROUTER_ENV_DEN ? C.OPENROUTER_API_KEY : (() => { try { return readFileSync(C.OPENROUTER_ANAHTAR_DOSYA, 'utf8').trim(); } catch { return ''; } })()),
});
const ajanlar = new AjanYonetici({
  takip: mintTakip, mintIslem, provider: mintProvider, sohbet: openRouter({ anahtar: C.OPENROUTER_API_KEY }), sohbetUret: (anahtar) => openRouter({ anahtar }),
  bildir: (b, g, o = {}) => bildirimler.bildir(o.kategori, b, g, { agentId: o.agentId }),
  anahtarVar: !!C.OPENROUTER_API_KEY, anahtarIpucu: C.OPENROUTER_API_KEY ? `${C.OPENROUTER_API_KEY.slice(0, 6)}…${C.OPENROUTER_API_KEY.slice(-4)}` : null,
  siteModel: C.AJAN_SITE_MODEL, sosyalModel: C.AJAN_SOSYAL_MODEL, hakemModel: C.AJAN_HAKEM_MODEL,
  ara: C.BRAVE_API_KEY ? braveArama({ anahtar: C.BRAVE_API_KEY }) : null, maliyet, okx: (args) => onchainosCalistir(args, { zamanAsimi: 20_000 }), gunlukArastirmaMax: C.AJAN_GUNLUK_ARASTIRMA,
  ayarDosya: C.dataFile('ajan.json'), raporDosya: C.dataFile('ajan-raporlar.json'), logDosya: C.dataFile('ajan-log.jsonl'), sayacDosya: C.dataFile('ajan-sayac.json'),
});
// Açılışta, önceki kurallarla "onay bekle" kalmış adaylar yeniden değerlendirilir
setTimeout(() => ajanlar.bekleyenleriDegerlendir(), 10_000);
if (C.BRAVE_API_KEY) ajanlar.aramaIpucu = `${C.BRAVE_API_KEY.slice(0, 4)}…${C.BRAVE_API_KEY.slice(-4)}`;

// QR ile giriş: tek seferde bir oturum
let giris = null;   // { pairingCode, url, qrCodeId, bitis, qr, durum: 'bekliyor' | 'basarili' | 'hata', hata, cocuk }
const girisOzet = () => (giris
  ? { durum: giris.durum, pairingCode: giris.pairingCode, url: giris.url, bitis: giris.bitis, qr: giris.qr, hata: giris.hata }
  : { durum: 'yok' });

const PUBLIC = path.join(C.ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const IZINLI_HOST = new Set([`127.0.0.1:${C.PORT}`, `localhost:${C.PORT}`]);

const tokenEsit = (a) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(C.API_TOKEN);
  return x.length === y.length && timingSafeEqual(x, y);
};

function json(res, kod, veri) {
  res.writeHead(kod, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(veri));
}

async function govde(req, sinir = 64 * 1024) {
  let s = '';
  for await (const p of req) { s += p; if (s.length > sinir) throw new Error('İstek çok büyük'); }
  return s ? JSON.parse(s) : {};
}

async function cuzdanDurumu() {
  const durum = await baw.durum().catch((e) => ({ hata: e.message }));
  if (durum !== 'CONNECTED') return { bagli: false, durum: typeof durum === 'string' ? durum : 'HATA', hata: durum?.hata || null };
  const [adres, agent, ayar, bakiye] = await Promise.all([
    baw.adres().catch(() => null), baw.agentId().catch(() => null), baw.ayarlar().catch(() => null), baw.bakiye().catch(() => []),
  ]);
  const bnb = bakiye.find((b) => b.address?.toLowerCase() === C.BNB.toLowerCase());
  return {
    bagli: true, adres, agentId: agent?.claimed ? agent.agentId : null,
    bnb: bnb ? Number(bnb.balance) : 0, bnbUsd: bnb ? Number(bnb.value) : 0,
    devMode: ayar?.devMode ? { acik: !!ayar.devMode.enabled, bitis: ayar.devMode.expiresAt } : null,
    oturumBitis: ayar?.sessionExpireTime || null, gunlukLimit: ayar?.dailyLimit ?? null,
    tokenler: bakiye.filter((b) => b !== bnb),
  };
}

// .env ayarları arayüzden: limitler ve ajan ayarları anında, mod ve RPC yeniden başlatınca devreye girer
const ENV_DOSYA = path.join(C.ROOT, '.env');
const uygulamaAyarlari = new UygulamaAyarlari({
  dosya: ENV_DOSYA,
  calisan: Object.fromEntries(ALANLAR.map((a) => [a.anahtar, process.env[a.anahtar] ?? (a.anahtar === 'CANLI_ISLEM' ? '0' : String(C[a.anahtar] ?? ''))])),
  uygula: (k, v) => {
    const n = Number(v);
    if (k === 'ISLEM_BASI_MAX_BNB') { trader.islemBasiMax = n; otomasyon.islemBasiMax = n; }
    else if (k === 'GUNLUK_MAX_BNB') trader.gunlukMax = n;
    else if (k === 'VARSAYILAN_KAYMA') trader.varsayilanKayma = n;
    else if (k === 'BASIM_ONALIM_MAX_BNB') basim.onalimMax = n;
    else if (k === 'BASIM_UCRET_MAX_BNB') basim.ucretMax = n;
    else if (k === 'AJAN_GUNLUK_ARASTIRMA') ajanlar.gunlukArastirmaMax = n;
    else if (k === 'AJAN_SITE_MODEL') ajanlar.siteModel = v;
    else if (k === 'AJAN_SOSYAL_MODEL') ajanlar.sosyalModel = v;
    else if (k === 'AJAN_HAKEM_MODEL') ajanlar.hakemModel = v;
    console.log(`Ayar değişti: ${k}=${v}`);
  },
});

// Kendini yeniden başlatır: yeni süreç .env'i baştan okusun diye .env'den gelen değişkenler ortamdan çıkarılır
function yenidenBaslat() {
  const ortam = { ...process.env };
  for (const k of Object.keys(envOku(ENV_DOSYA))) delete ortam[k];
  sunucu.close();
  const cocuk = spawn('/bin/sh', ['-c', `sleep 1; exec "${process.execPath}" src/server.js >> data/sunucu.log 2>&1`], { cwd: C.ROOT, env: ortam, detached: true, stdio: 'ignore' });
  cocuk.unref();
  setTimeout(() => process.exit(0), 300);
}

const kasaOnbellek = new Map();
// GeckoTerminal token verisi: fiyat, hacim, likidite. Havuz yoksa alanlar boş döner
async function tokenPiyasa(t) {
  const j = await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${t}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
  const a = j?.data?.attributes || {};
  return { fiyatUsd: Number(a.price_usd) || null, hacim24sUsd: Number(a.volume_usd?.h24) || null, likiditeUsd: Number(a.total_reserve_in_usd) || null, fdvUsd: Number(a.fdv_usd) || null, sembol: a.symbol || null };
}
// HOUND / BlockHound takibi: istek geldikçe güncellenir, aynı anda tek okuma yapılır
const houndTakip = new HoundTakip({ provider: mintProvider, dosya: C.dataFile('hound-takip.json'), cuzdanAdresi: () => mintTakip.cuzdan(), tokenPiyasa });
let houndIstek = null;
const houndGuncelle = () => (houndIstek ||= houndTakip.ozet().catch(() => houndTakip.son).finally(() => { houndIstek = null; }));
houndGuncelle();
setInterval(houndGuncelle, 60_000).unref();
const rotalar = {
  'GET /api/durum': async () => ({
    mod: C.MOD, canliIslem: C.CANLI_ISLEM,
    limitler: { islemBasiMax: trader.islemBasiMax, gunlukMax: trader.gunlukMax, bugunHarcanan: trader.bugunHarcanan() },
    cuzdan: await cuzdanDurumu(),
  }),

  'GET /api/emirler': async () => trader.emirler,

  'POST /api/giris/baslat': async () => {
    if (giris?.durum === 'bekliyor') giris.cocuk?.kill();
    const d = await baw.girisBaslat();
    if (d?.status === 'ALREADY_CONNECTED') return { durum: 'zaten-bagli' };
    if (!/^https:\/\/[a-z0-9.-]*binance\.com\//i.test(String(d.urlForWeb))) throw new Error('baw beklenmeyen bir giriş adresi döndürdü');
    // Binance'in giriş linkini QR olarak çiz: Binance App ile okutulur
    const qr = `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(d.urlForWeb, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } })).toString('base64')}`;
    giris = { pairingCode: d.pairingCode, url: d.urlForWeb, qrCodeId: d.qrCodeId, bitis: Number(d.expireAt) || Date.now() + 300_000, qr, durum: 'bekliyor', hata: null, cocuk: null };
    const bu = giris;
    baw.girisDogrula(d.qrCodeId, (c) => { bu.cocuk = c; })
      .then(async () => {
        // baw "SUCCESS" dese bile asıl kaynak wallet status
        bu.durum = (await baw.durum().catch(() => null)) === 'CONNECTED' ? 'basarili' : 'hata';
        islem.adresSifirla();
        if (bu.durum === 'hata') bu.hata = 'App onay verdi ama cüzdan bağlı görünmüyor. Yeni kodla tekrar dene.';
      })
      .catch((e) => { bu.durum = 'hata'; bu.hata = /expired|does not exist|AUTH_REJECTED/i.test(e.message) ? 'Kodun süresi doldu' : e.message; });
    return girisOzet();
  },

  'GET /api/giris/durum': async () => girisOzet(),
  'POST /api/giris/iptal': async () => { if (giris?.durum === 'bekliyor') { giris.cocuk?.kill(); giris.durum = 'hata'; giris.hata = 'İptal edildi'; } return girisOzet(); },

  'GET /api/siper': async () => ({ durum: tarayici.durum, ...tarayici.listeler }),
  'GET /api/siper/tars': async () => ({ durum: tarsTakip.durum, solUsd: tarsTakip.solUsd, ...tarsTakip.listeler }),

  'POST /api/teklif': async (b) => islem.teklif({ yon: b.yon, token: b.token, miktar: b.miktar, kayma: b.kayma }),

  'POST /api/emir': async (b) => {
    if (b.onay !== true) throw new Error('Emir için açık onay gerekli');
    if (b.yon === 'al') return islem.al({ token: b.token, bnb: b.miktar, kayma: b.kayma, kaynak: 'manuel' });
    if (b.yon === 'sat') return islem.sat({ token: b.token, miktar: b.miktar, kayma: b.kayma, kaynak: 'manuel' });
    throw new Error('yon "al" ya da "sat" olmalı');
  },

  'GET /api/otomasyon': async () => otomasyon.durum(),
  'POST /api/otomasyon/ayar': async (b) => otomasyon.ayarGuncelle(b),
  'POST /api/otomasyon/acil-durdur': async () => {
    // Acil durdur otomatik mint'i de kapatır
    try { ajanlar.ayarGuncelle({ otomatikMint: false }); } catch { /* otomasyonu durdurmaya engel olmasın */ }
    return otomasyon.acilDurdur();
  },

  'GET /api/ajan': async () => ajanlar.durum(),
  'POST /api/ajan/ayar': async (b) => ajanlar.ayarGuncelle(b),
  // Anahtar sadece bu bilgisayarda data/openrouter-key dosyasına yazılır, hiçbir yanıtta geri dönmez
  'POST /api/ajan/anahtar': async (b) => {
    if (C.OPENROUTER_ENV_DEN) throw new Error('Anahtar .env dosyasında tanımlı. Değiştirmek için .env içindeki OPENROUTER_API_KEY satırını düzenle.');
    const anahtar = String(b.anahtar ?? '').trim();
    if (!anahtar) { rmSync(C.OPENROUTER_ANAHTAR_DOSYA, { force: true }); return ajanlar.anahtarAyarla(''); }
    if (!/^sk-or-[A-Za-z0-9_-]{20,200}$/.test(anahtar)) throw new Error('Bu bir OpenRouter anahtarına benzemiyor (sk-or- ile başlamalı)');
    writeFileSync(C.OPENROUTER_ANAHTAR_DOSYA, anahtar, { mode: 0o600 });
    return ajanlar.anahtarAyarla(anahtar);
  },
  'POST /api/ajan/arama-anahtari': async (b) => {
    if (C.BRAVE_ENV_DEN) throw new Error('Anahtar .env dosyasında tanımlı. Değiştirmek için .env içindeki BRAVE_API_KEY satırını düzenle.');
    const anahtar = String(b.anahtar ?? '').trim();
    if (!anahtar) { rmSync(C.BRAVE_ANAHTAR_DOSYA, { force: true }); return ajanlar.aramaAyarla(null); }
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(anahtar)) throw new Error('Bu bir Brave Search API anahtarına benzemiyor');
    // Kaydetmeden önce dene: yanlış anahtar sessizce aramasız kalmasın
    const ara = braveArama({ anahtar });
    await ara('BNB Chain', 1).catch((e) => { throw new Error(`Anahtar çalışmadı: ${e.message}`); });
    writeFileSync(C.BRAVE_ANAHTAR_DOSYA, anahtar, { mode: 0o600 });
    return ajanlar.aramaAyarla(ara, `${anahtar.slice(0, 4)}…${anahtar.slice(-4)}`);
  },
  // Tek kontratın araştırma durumu ve son raporu: Araştır penceresi bunu yoklar
  'GET /api/ajan/rapor': async (_b, u) => {
    const a = String(u?.searchParams.get('adres') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error('Geçersiz kontrat adresi');
    const durum = ajanlar.calisan === a ? 'arastiriliyor' : ajanlar.kuyruk.some((x) => x.adres === a) ? 'sirada' : 'bitti';
    return { durum, sira: ajanlar.kuyruk.findIndex((x) => x.adres === a) + 1, rapor: ajanlar.raporlar.find((x) => x.adres.toLowerCase() === a) || null };
  },
  'POST /api/ajan/arastir': async (b) => {
    const adres = String(b.adres || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(adres)) throw new Error('Geçersiz kontrat adresi');
    return ajanlar.siraya(adres, { yeniden: false });
  },

  'GET /api/portfoy': async () => {
    const [bakiye, durum] = await Promise.all([baw.bakiye(), baw.durum().catch(() => null)]);
    if (durum !== 'CONNECTED') throw new Error('Cüzdan bağlı değil');
    const bnb = bakiye.find((x) => x.address?.toLowerCase() === C.BNB.toLowerCase());
    const fiyatlar = {};
    for (const l of Object.values(tarayici.listeler)) for (const t of l) if (t.fiyat != null) fiyatlar[t.adres.toLowerCase()] = t.fiyat;
    return portfoyOlustur({ bakiye, emirler: emirKayitlariOku(C.dataFile('emirler.jsonl')), fiyatlar, bnbUsd: bnb ? Number(bnb.price) : null });
  },

  'GET /api/nft': async (_b, u) => nftler({ yenile: u?.searchParams.get('yenile') === '1' }),

  'GET /api/fiyat-emirleri': async () => fiyatEmirleri.liste(),
  'POST /api/fiyat-emirleri': async (b) => fiyatEmirleri.olustur({
    token: String(b.token || ''), sembol: b.sembol ? String(b.sembol).slice(0, 30) : null, tur: b.tur, tetikUsd: b.tetikUsd,
    miktar: b.miktar === 'hepsi' ? 'hepsi' : b.miktar, yer: b.yer, kayma: b.kayma === '' || b.kayma == null ? null : Number(b.kayma), onay: b.onay,
  }),
  'POST /api/fiyat-emirleri/iptal': async (b) => fiyatEmirleri.iptal(String(b.id || '')),

  'GET /api/pnl': async (_b, u) => {
    const p = await portfoy.hesapla({ yenile: u?.searchParams.get('yenile') === '1' });
    // Otomatik mintlenenler Agent bölümü için ayrılır
    const kayitlar = mintKayitlari(C.dataFile('mint-islemleri.jsonl'));
    const agent = agentPortfoy({ kayitlar, varliklar: p.varliklar, islemler: portfoy.defter.islemler(), bnbSimdi: p.ozet.bnbSimdi });
    // Yapay zekâ gideri: OpenRouter'ın bildirdiği gerçek toplam (anahtar sadece bu terminalin ajanları için), yoksa yerel defter
    const or = await maliyet.openRouter().catch(() => null);
    const yz = or && !or.hata ? { toplamUsd: or.toplamUsd, bugunUsd: or.bugunUsd, kaynak: 'openrouter' } : { toplamUsd: maliyet.yerelOzet().toplamUsd, bugunUsd: maliyet.yerelOzet().bugunUsd, kaynak: 'defter' };
    agent.ozet.yapayZekaUsd = yz.toplamUsd;
    agent.ozet.netYzDahilUsd = agent.ozet.netUsd != null ? agent.ozet.netUsd - yz.toplamUsd : null;
    return { ...p, agentKontratlari: [...agentKontratlari(kayitlar)], agent, yapayZeka: yz };
  },
  // Kasa kartı analizi (sadece okuma): mint ücreti, pazar, temettü tahmini ve riskler
  'GET /api/kasa/analiz': async (_b, u) => {
    const adres = String(u?.searchParams.get('adres') || '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(adres)) throw new Error('Geçersiz kontrat adresi');
    const k = adres.toLowerCase();
    const o = kasaOnbellek.get(k);
    if (o && Date.now() - o.at < 60_000) return o.v;
    const v = await kasaAnaliz({ provider: mintProvider, adres, cuzdan: await mintTakip.cuzdan(), bnbUsd: portfoy.fiyat.bnbUsd(Date.now()), tokenPiyasa });
    kasaOnbellek.set(k, { at: Date.now(), v });
    return v;
  },
  // Önce son özet döner, eskiyse güncelleme arka planda başlar: zincir okuması yavaşken sayfa beklemez
  'GET /api/hound': async (_b, u) => {
    const eski = !houndTakip.son || Date.now() - houndTakip.son.guncelleme > 30_000 || u?.searchParams.get('yenile') === '1';
    if (eski) houndGuncelle();
    return houndTakip.son || houndIstek;
  },
  'GET /api/piyasa-izleme': async () => ({ liste: piyasaIzleme.liste(), calisiyor: piyasaIzleme.calisiyor, aralikDk: piyasaIzleme.aralikMs / 60_000 }),
  'POST /api/piyasa-izleme/kontrol': async () => ({ acilanlar: await piyasaIzleme.tur(), liste: piyasaIzleme.liste() }),
  'GET /api/maliyet': async (_b, u) => maliyet.durum({ yenile: u?.searchParams.get('yenile') === '1' }),
  'GET /api/pnl/seri': async (_b, u) => portfoy.seri({ yenile: u?.searchParams.get('yenile') === '1' }),
  'GET /api/ayarlar/uygulama': async () => uygulamaAyarlari.durum(),
  'POST /api/ayarlar/uygulama': async (b) => uygulamaAyarlari.guncelle(b || {}),
  'POST /api/ayarlar/yeniden-baslat': async (b) => {
    if (b?.onay !== true) throw new Error('Yeniden başlatma için onay gerekli');
    setTimeout(yenidenBaslat, 200);
    return { tamam: true };
  },
  'GET /api/ayarlar/bildirim': async () => bildirimler.durum(),
  'POST /api/ayarlar/bildirim': async (b) => bildirimler.guncelle(b || {}),
  'POST /api/ayarlar/bildirim/dene': async () => ({ gonderildi: bildirimler.bildir('deneme', 'Blockhound', 'Deneme bildirimi: ayarlar çalışıyor', { zorla: true }) }),

  'GET /api/liderler': async (_b, u) => liderler.liste({
    sure: u?.searchParams.get('sure') || '7g', siralama: u?.searchParams.get('siralama') || 'kazanc', tur: u?.searchParams.get('tur') || 'hepsi',
  }),
  'GET /api/liderler/cuzdan': async (_b, u) => liderler.cuzdan(String(u?.searchParams.get('adres') || '')),

  'GET /api/pnl/grafik': async (_b, u) => {
    const k = String(u?.searchParams.get('kontrat') || '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(k)) throw new Error('Geçersiz token adresi');
    const aralik = ['minute', 'hour', 'day'].includes(u.searchParams.get('aralik')) ? u.searchParams.get('aralik') : 'hour';
    return portfoy.tokenGrafik(k, { aralik });
  },

  'GET /api/mintler': async () => {
    const o = mintTakip.ozet();
    const raporlar = new Map(ajanlar.raporlar.map((r) => [r.adres.toLowerCase(), r]));
    o.bulunanlar = o.bulunanlar.map((r) => ({ ...r, filtre: mintSiniflandir(r, raporlar.get(r.adres.toLowerCase())) }));
    o.sayimlar = mintSayimlar(o.bulunanlar);
    return o;
  },
  'POST /api/mintler/kontrol': async (b) => {
    const adres = String(b.adres || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(adres)) throw new Error('Geçerli bir kontrat adresi gir (0x ile başlayan 42 karakter)');
    const r = await mintTakip.incele(adres);
    // Listede zaten varsa yeni sonuç listeye de işlenir: beş dakikalık yeniden kontrolü beklemeye gerek kalmaz
    const k = r.adres.toLowerCase();
    if (mintTakip.bulunanlar.some((x) => x.adres.toLowerCase() === k)) {
      const eski = mintTakip.bulunanlar.find((x) => x.adres.toLowerCase() === k);
      mintTakip.kayitEkle({ ...r, blok: eski.blok });
      if (mintTakip.izleme[k]) mintTakip.izleme[k].sonuc = r.sonuc;
      mintTakip.kaydet();
    } else if (mintTakip.zamanliGuncelle(r)) mintTakip.kaydet(); // açılışı gelecekte: zamanlı kuyruğa girer
    return { ...r, mintEdildi: mintTakip.mintBilgisi(r) };
  },
  'POST /api/mintler/hazirla': async (b) => mintIslem.hazirla({ adres: String(b.adres || '').trim(), bnb: b.bnb ?? null }),
  'POST /api/mintler/gonder': async (b) => mintIslem.gonder({ id: b.id, onay: b.onay }),

  'GET /api/basim': async () => basim.bilgi(),
  'POST /api/basim/cuzdan/olustur': async (b) => basim.cuzdan.olustur(b.sifre),
  'POST /api/basim/cuzdan/ac': async (b) => basim.cuzdan.ac(b.sifre),
  'POST /api/basim/cuzdan/kilitle': async () => basim.cuzdan.kilitle(),
  'POST /api/basim/taslak': async (b) => basim.taslakHazirla(b),
  'POST /api/basim/taslak/iptal': async () => basim.taslakIptal(),
  'POST /api/basim/gonder': async (b) => basim.gonder(b),
};

async function statik(req, res) {
  const u = new URL(req.url, 'http://x');
  const ad = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
  const dosya = path.join(PUBLIC, ad);
  if (!dosya.startsWith(PUBLIC + path.sep)) return json(res, 404, { hata: 'Bulunamadı' });
  try {
    let icerik = await readFile(dosya);
    if (ad === 'index.html') icerik = Buffer.from(String(icerik).replace('__API_TOKEN__', C.API_TOKEN));
    res.writeHead(200, {
      'content-type': MIME[path.extname(dosya)] || 'application/octet-stream', 'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; img-src 'self' data: https:; connect-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com", 'x-frame-options': 'DENY',
    });
    res.end(icerik);
  } catch { json(res, 404, { hata: 'Bulunamadı' }); }
}

const sunucu = http.createServer(async (req, res) => {
  // DNS rebinding'e karşı: sadece yerel host adları
  if (!IZINLI_HOST.has(String(req.headers.host || '').toLowerCase())) return json(res, 403, { hata: 'Host izinli değil' });
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/api/')) return req.method === 'GET' ? statik(req, res) : json(res, 405, { hata: 'Yöntem yok' });

  const fn = rotalar[`${req.method} ${u.pathname}`];
  if (!fn) return json(res, 404, { hata: 'Bulunamadı' });
  if (req.method !== 'GET' && !tokenEsit(req.headers['x-api-token'])) return json(res, 401, { hata: 'API token geçersiz' });
  try {
    const b = req.method === 'GET' ? {} : await govde(req, u.pathname === '/api/basim/taslak' ? 3 * 1024 * 1024 : undefined);
    json(res, 200, await fn(b, u));
  } catch (e) {
    json(res, 400, { hata: e.message });
  }
});

sunucu.listen(C.PORT, C.HOST, () => {
  console.log(`Blockhound: http://127.0.0.1:${C.PORT}`);
  console.log(`Mod: ${C.MOD} · Canlı işlem: ${C.CANLI_ISLEM ? 'AÇIK' : 'kapalı'} · İşlem başı ${C.ISLEM_BASI_MAX_BNB} BNB · Günlük ${C.GUNLUK_MAX_BNB} BNB`);
});
