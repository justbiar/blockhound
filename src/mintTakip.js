// Ücretsiz mint takibi. BSC'ye yeni yüklenen NFT kontratlarını ve Agent ID'ye bağlı token mint kontratlarını bulur,
// mint fonksiyonlarını cüzdan adresiyle eth_call üzerinden simüle eder ve ücretsiz ya da ucuz olanları bildirir.
// Sadece okuma yapar: hiçbir işlem imzalamaz, göndermez. Kontrattan gelen ad ve semboller dış veridir.
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { getAddress, id, Interface, parseEther, toQuantity, keccak256, toUtf8Bytes, AbiCoder } from 'ethers';
import { tokenMintBul, hataAdlari, BILINEN_IMZALAR, seciciOf } from './tokenMint.js';

export const AGENT_ID_REGISTRY = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

// Argümanlar türe göre doldurulur: uint256 -> 1, address -> cüzdan adresi
export const MINT_IMZALARI = [
  'mint()', 'mint(uint256)', 'mint(address)', 'mint(address,uint256)', 'mint(uint256,address)',
  'freeMint()', 'freeMint(uint256)', 'mintFree()', 'mintFree(uint256)',
  'publicMint()', 'publicMint(uint256)', 'mintPublic()', 'mintPublic(uint256)',
  'claim()', 'claim(uint256)', 'claimFree()', 'claimNFT()',
  'claimAgentEntry()', 'agentMint()', 'agentClaim()',
  'safeMint(address)', 'safeMint(address,uint256)',
];

// Arka uçtan imza ya da merkle kanıtı isteyenler: simüle edilemez, sadece işaretlenir
export const SARTLI_IMZALAR = [
  'mintWithProof(uint256,uint256,uint256,bytes)', 'mintWithSignature(bytes)', 'mint(bytes)',
  'mint(bytes32[])', 'mint(uint256,bytes32[])', 'whitelistMint(bytes32[])', 'whitelistMint(uint256,bytes32[])',
  'allowlistMint(bytes32[])', 'allowlistMint(uint256,bytes32[])', 'presaleMint(uint256,bytes32[])',
  'claim(bytes32[])', 'claim(uint256,bytes32[])',
];

const FIYAT_IMZALARI = ['price()', 'mintPrice()', 'MINT_PRICE()', 'PRICE()', 'cost()', 'publicPrice()', 'mintFee()', 'fee()'];
const BASILAN_IMZALARI = ['totalSupply()', 'totalMinted()'];
const MAKS_IMZALARI = ['maxSupply()', 'MAX_SUPPLY()', 'maxTokens()', 'MAX_TOKENS()', 'collectionSize()'];
// İki fazlı mintlerde (önce bedava havuz, sonra ücretli) bedava kısmın büyüklüğü
const BEDAVA_ARZ_IMZALARI = ['FREE_SUPPLY()', 'freeSupply()', 'MAX_FREE()', 'maxFree()', 'maxFreeSupply()', 'MAX_FREE_SUPPLY()',
  'FREE_MINTS()', 'freeMintSupply()', 'MAX_FREE_MINTS()'];
// Bedava havuzdan basılan ve kalan: totalSupply ücretli mintleri de sayar, ayrı sayaç varsa o kullanılır
const BEDAVA_BASILAN_IMZALARI = ['freeMinted()', 'freeClaimed()', 'totalFreeMinted()', 'freeMintedCount()', 'freeMintCount()',
  'mintedFree()', 'freeUsed()', 'totalFreeClaimed()'];
const BEDAVA_KALAN_IMZALARI = ['freeRemaining()', 'remainingFree()', 'freeLeft()'];
// Koleksiyon görseli: metadata önce zincirden (data:), sonra IPFS ağ geçidinden ya da https'ten okunur
const GORSEL_GECIT = 'https://ipfs.io/ipfs/';
const GORSEL_DATA_MAX = 80_000; // kayıt dosyası şişmesin: daha büyük gömülü görseller alınmaz
const CUZDAN_YOK = 'Cüzdan bağlı değil, takip bekliyor';
const GORSEL_YENIDEN_MS = 60 * 6e4; // görseli olmayan koleksiyon bu kadar sonra yeniden denenir (metadata sonradan yüklenebilir)

// Bu tutar ve altı "neredeyse ücretsiz" sayılır. Fiyatı okunamayan kontratlar için küçük ücret basamakları denenir
export const UCUZ_WEI = parseEther('0.001');
// İş kanıtıyla (hash bularak) mint: HOUND / BlockHound ve 0xBitcoin tarzı kontratlar. Simülasyon hash olmadan hep geri çevrilir
export const IS_KANITI_IMZALARI = [['challenge()', 'difficultyBits()'], ['getChallengeNumber()', 'getMiningDifficulty()']];
const KASA_UCRET_MAX = parseEther('0.01');
const UCRET_BASAMAKLARI = ['0.00005', '0.0001', '0.0002', '0.0003', '0.0005', '0.001'].map((v) => parseEther(v));

// UCRETLI: sadece token mintlerinde, 0.01 BNB'ye kadar ödemeyle geçen mintler
export const BILDIRILEN = new Set(['UCRETSIZ', 'NEREDEYSE-UCRETSIZ', 'UCRETLI']);
const IZLENEN = new Set(['UCRETSIZ', 'NEREDEYSE-UCRETSIZ', 'UCRETLI', 'IZLE']);
// Bildirilmiş ve açık mintleri günlerce yeniden kontrol etmek RPC sınırını açılmamış olanlardan çalar. Sonuca göre saklama
// süresi (gün): açılmamışlar varsayılan süre kalır; ücretli olanlar bedava faz açabilir diye biraz daha uzun tutulur
export const IZLEME_SURE_GUN = { 'NEREDEYSE-UCRETSIZ': 1, UCRETSIZ: 2, UCRETLI: 2 };
// Yeniden kontrolde önce açılması beklenenler gelir
const KONTROL_ONCELIK = { IZLE: 0, 'AGENT-ID-DIGER': 0, UCRETLI: 1, UCRETSIZ: 2, 'NEREDEYSE-UCRETSIZ': 3 };

// Proxy kontratların asıl kodunu bulmak için: EIP-1967 uygulama ve beacon yuvaları, EIP-1167 klon kalıbı
const UYGULAMA_YUVASI = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const BEACON_YUVASI = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const KLON = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/;
// Kayıt adresini depoda tutan kontratların getter'ları
const KAYIT_GETTERLARI = ['registry()', 'handleRegistry()', 'identity()', 'agentRegistry()', 'idRegistry()', 'identityRegistry()',
  'agentIdRegistry()', 'nameRegistry()', 'REGISTRY()', 'IDENTITY()', 'gate()', 'verifier()', 'eligibility()'];
// Fabrika içinden kurulan kontratlar bu olaylardan biriyle doğar: sıfırdan sahiplik, ilk kurulum, proxy kurulumu, ilk yönetici rolü
export const DOGUM_OLAYLARI = {
  sahiplik: id('OwnershipTransferred(address,address)'), rol: id('RoleGranted(bytes32,address,address)'),
  kurulum8: id('Initialized(uint8)'), kurulum64: id('Initialized(uint64)'), yukseltme: id('Upgraded(address)'),
};
const SIFIR32 = '0x' + '0'.repeat(64);
// Mintin açılacağı zaman: kontratlar bunu farklı adlarla yazar. Aynı ad sayaç da olabilir (POPZERO'da OPEN_AT 10000, startTime
// zamandı): sadece makul bir zaman damgası kabul edilir
const ACILIS_IMZALARI = ['startTime()', 'mintStartTime()', 'mintStart()', 'saleStart()', 'saleStartTime()', 'publicSaleStart()',
  'publicStartTime()', 'startAt()', 'openAt()', 'openTime()', 'OPEN_AT()', 'START_TIME()', 'launchTime()', 'startTimestamp()',
  'mintOpenTime()', 'freeMintStart()', 'claimStart()'];
const ACILIS_ILERI_MS = 7 * 864e5;
// Zamanlı kuyruk: bedava faz açılışında saniyeler önemli (POPZERO'nun 2.000 bedava hakkı 7,5 dakikada bitti, ilk 100'ü 8 saniyede)
const ZAMANLI_ONCE_MS = 5_000; // açılıştan bu kadar önce sık kontrole başlanır
const ZAMANLI_SIK_MS = 1_500; // açılıştan sonraki ilk iki dakika
const ZAMANLI_SEYREK_MS = 10_000;
const ZAMANLI_SURE_MS = 15 * 6e4; // açılıştan sonra en fazla bu kadar beklenir
const BILINEN_MINT_SECICILERI = BILINEN_IMZALAR.filter((x) => /^mint/.test(x)).map(seciciOf);
// Revert sebebi Agent ID şartını anlatıyorsa kontrat Agent ID'li sayılır
const AGENT_SEBEP = /agent|handle|identity|\.ai\b|not registered|no id\b/i;

const secici = (imza) => id(imza).slice(2, 10);
const seciciVar = (kod, imza) => kod.includes('63' + secici(imza));
// Saniye ya da milisaniye; şimdiden bir saat önce ile yedi gün sonrası arasında değilse zaman sayılmaz
export function acilisZamani(v, simdi = Date.now()) {
  let ms = Number(v);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 1e12) ms *= 1000;
  return ms > simdi - 36e5 && ms < simdi + ACILIS_ILERI_MS ? ms : null;
}
const bedavaGecti = (r) => (r.mintler || []).some((m) => m.gecti && m.ucretWei === '0');

const temizle = (s, n = 40) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);

// Görsel adresi panelde <img> olarak gösterilir: sadece gömülü resim, https ya da IPFS kabul edilir
const GORSEL_DATA = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)[;,]/i;
const ipfs = (u) => (u.startsWith('ipfs://') ? GORSEL_GECIT + u.slice(7).replace(/^ipfs\//, '') : u);
function gorselAdresi(u) {
  u = ipfs(String(u || '').trim());
  if (GORSEL_DATA.test(u)) return u.length <= GORSEL_DATA_MAX ? u : null;
  try { return new URL(u).protocol === 'https:' && u.length <= 2_000 ? u : null; } catch { return null; }
}
// Metadata sunucusu kontrat sahibinin elinde: yerel ağ adreslerine istek atılmaz, yönlendirme izlenmez, boyut ve süre sınırlıdır
const YEREL_HOST = /^(localhost|.*\.local|.*\.internal|\[.*\]|\d+\.\d+\.\d+\.\d+)$/i;
async function metadataOku(u, fetchFn) {
  if (u.startsWith('data:')) {
    const virgul = u.indexOf(',');
    const govde = u.slice(virgul + 1);
    return JSON.parse(/;base64$/i.test(u.slice(0, virgul)) ? Buffer.from(govde, 'base64').toString('utf8') : decodeURIComponent(govde));
  }
  const url = new URL(ipfs(u));
  if (url.protocol !== 'https:' || YEREL_HOST.test(url.hostname)) return null;
  const yanit = await fetchFn(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!yanit.ok || Number(yanit.headers.get('content-length') || 0) > 300_000) return null;
  const tur = yanit.headers.get('content-type') || '';
  if (tur.startsWith('image/')) return { image: url.href };
  const metin = await yanit.text();
  return metin.length > 300_000 ? null : JSON.parse(metin);
}
export async function gorselCoz(uri, fetchFn = globalThis.fetch) {
  if (!uri) return null;
  const dogrudan = gorselAdresi(uri);
  if (dogrudan && (dogrudan.startsWith('data:image') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(dogrudan))) return dogrudan;
  const m = await metadataOku(uri, fetchFn).catch(() => null);
  if (!m || typeof m !== 'object') return null;
  if (typeof m.image_data === 'string' && m.image_data.trim().startsWith('<svg')) {
    return gorselAdresi('data:image/svg+xml;base64,' + Buffer.from(m.image_data).toString('base64'));
  }
  return gorselAdresi(m.image || m.image_url || m.imageUrl || '');
}

export function kodla(imza, cuzdan) {
  const turler = imza.slice(imza.indexOf('(') + 1, -1).split(',').filter(Boolean);
  const iface = new Interface([`function ${imza}`]);
  return iface.encodeFunctionData(imza.slice(0, imza.indexOf('(')), turler.map((t) => (t === 'address' ? cuzdan : 1n)));
}

export function revertSebebi(e) {
  // Bazı RPC'ler özel hata kodunu mesajda değil sadece "data" alanında döndürür (publicnode gibi)
  const veri = [e?.data, e?.info?.error?.data, e?.error?.data].find((v) => typeof v === 'string' && /^0x[0-9a-f]{8}/i.test(v));
  if (!e?.reason && veri && !/^0x08c379a0/i.test(veri)) return temizle(veri, 120);
  const msg = e?.reason || e?.info?.error?.message || e?.error?.message || e?.shortMessage || e?.message || '';
  const m = msg.match(/execution reverted:?\s*"?([^"]*)"?/i);
  return temizle((m ? m[1] : msg) || 'revert (sebep yok)', 120);
}

export function siniflandir(sebep) {
  // Özel hata adları camelCase gelir: MintNotStarted -> "mint not started"
  const r = sebep.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (/sold ?out|max ?supply|exceed|minted out|no more|supply/.test(r)) return 'tukendi';
  if (/already|claimed|limit/.test(r)) return 'zaten-aldin';
  if (/not (yet )?(started|open|active|live|enabled)|paused|closed|inactive|disabled|not begun|too early|wait/.test(r)) return 'acilmadi';
  if (/insufficient|price|value|ether|bnb|fee|payment|funds|cost/.test(r)) return 'ucretli';
  if (/agent|whitelist|allowlist|proof|signature|eligible|not allowed|unauthori/.test(r)) return 'sartli';
  return 'diger';
}

function macBildirimi(r) {
  if (process.platform !== 'darwin') return;
  const k = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const tur = r.tur === 'token' ? 'token mint' : 'mint';
  const baslik = `${r.sonuc === 'UCRETSIZ' ? `Ücretsiz ${tur}` : r.sonuc === 'NEREDEYSE-UCRETSIZ' ? `Neredeyse ücretsiz ${tur}` : r.sonuc === 'UCRETLI' ? `Ücretli ${tur}` : 'Agent ID mint'}: ${r.ad || r.sembol || 'NFT'}`;
  const govde = `${r.adres.slice(0, 10)}…${r.agentId ? ' · Agent ID şartlı' : ''}`;
  execFile('osascript', ['-e', `display notification "${k(govde)}" with title "${k(baslik)}" sound name "Glass"`], () => {});
}

export class MintTakip extends EventEmitter {
  constructor({ provider, cuzdanAdresi, dosya = null, registry = AGENT_ID_REGISTRY, aralikMs = 3000, blokParalel = 12,
    maxGeriBlok = 400, maxBosluk = 50_000, geriDoldurBlok = 40, yenidenKontrolDk = 5, izlemeGun = 14, maxBulunan = 100, bildir = macBildirimi, fetchFn = globalThis.fetch, olayProvider = null, olayAralikMs = 15_000, blokProvider = null, incelemeParalel = 4, maxKuyruk = 50,
    yenidenKontrolYeni = 200, yenidenKontrolEski = 100 } = {}) {
    super();
    Object.assign(this, { provider, cuzdanAdresi, dosya, aralikMs, blokParalel, maxGeriBlok, maxBosluk, geriDoldurBlok, yenidenKontrolDk, izlemeGun, maxBulunan, bildir, fetchFn, registry, olayAralikMs, yenidenKontrolYeni, yenidenKontrolEski, incelemeParalel, maxKuyruk });
    this.olayProviderlar = [olayProvider].flat().filter(Boolean);
    // Blok taraması bir RPC havuzunda sırayla döner: tek ücretsiz RPC paralel blok okumada hız sınırına takılıyor
    this.blokProviderlar = [blokProvider].flat().filter(Boolean);
    if (!this.blokProviderlar.length) this.blokProviderlar = [provider];
    this.blokSira = 0;
    this.geride = false;
    this.incelemeKuyrugu = [];
    this.incelemeCalisan = 0;
    this.incelemeBekleyenler = [];
    this.olaySira = 0;
    this.sonOlayTur = 0;
    this.registryHex = registry.toLowerCase().slice(2);
    this.imzaOnbellek = new Map();
    this.agentIdSon = null;
    // Yardımcı kontratların kodunda kayıt adresi var mı: adres -> bool
    this.kayitliKod = new Map();
    // Koleksiyon görselleri: adres -> görsel adresi ya da { zaman } (bulunamadı)
    this.gorselOnbellek = new Map();
    // Olaylardan gelen adayların tekrar tekrar incelenmemesi için
    this.gorulen = new Set();
    this.durum = { calisiyor: false, sonBlok: null, taranan: 0, kontrat: 0, sonHata: null, cuzdan: null, baslangic: null };
    this.izleme = {};
    this.bulunanlar = [];
    // Bu terminalden mint edilenler: { adres(lowercase) -> { zaman, txHash, adet } }. Zincirdeki bakiye ayrıca okunur
    this.mintEdilenler = {};
    // Son Binance önizlemesi: { adres(lowercase) -> { durum: 'gecti'|'basarisiz'|'riskli', sebep, zaman } }
    this.onizlemeler = {};
    // Takip durduğunda (cüzdan bağlı değil, sunucu kapalı) atlanan blok aralıkları: canlı tarama öne alınır,
    // boşluklar her turda küçük parçalarla geriye doğru doldurulur
    this.bosluklar = [];
    this.sonYenidenKontrol = 0;
    // Yeniden kontrolde eski kayıtlar parça parça döner: bir sonraki turun başlayacağı sıra
    this.eskiImlec = 0;
    // Açılış zamanı bilinen ve henüz bedava geçmeyen mintler: adres(lowercase) -> { adres, acilis, ad, sonuc, sonKontrol }
    this.zamanli = {};
    this.zamanliCalisan = new Set();
    this.yukle();
  }

  yukle() {
    if (!this.dosya || !existsSync(this.dosya)) return;
    try {
      const d = JSON.parse(readFileSync(this.dosya, 'utf8'));
      this.durum.sonBlok = d.sonBlok ?? null;
      this.izleme = d.izleme || {};
      this.bulunanlar = d.bulunanlar || [];
      this.mintEdilenler = d.mintEdilenler || {};
      this.onizlemeler = d.onizlemeler || {};
      this.bosluklar = d.bosluklar || [];
      this.zamanli = d.zamanli || {};
    } catch { /* bozuk dosya: baştan başla */ }
  }

  kaydet() {
    if (!this.dosya) return;
    writeFileSync(this.dosya, JSON.stringify({ sonBlok: this.durum.sonBlok, bosluklar: this.bosluklar, izleme: this.izleme, bulunanlar: this.bulunanlar, mintEdilenler: this.mintEdilenler, onizlemeler: this.onizlemeler, zamanli: this.zamanli }, null, 2));
  }

  async cuzdan() {
    if (this.durum.cuzdan) return this.durum.cuzdan;
    const a = await this.cuzdanAdresi?.().catch(() => null);
    if (a) this.durum.cuzdan = getAddress(a);
    return this.durum.cuzdan;
  }

  async cagir(to, imza) {
    try {
      const out = await this.provider.call({ to, data: '0x' + secici(imza) });
      return out && out !== '0x' ? BigInt(out.slice(0, 66)) : null;
    } catch { return null; }
  }

  async ilkDeger(to, kod, imzalar) {
    for (const s of imzalar) if (seciciVar(kod, s)) {
      const v = await this.cagir(to, s);
      if (v !== null) return v;
    }
    return null;
  }

  async metinOku(to, imza) {
    try {
      const iface = new Interface([`function ${imza} view returns (string)`]);
      const ad = imza.slice(0, -2);
      return temizle(iface.decodeFunctionResult(ad, await this.provider.call({ to, data: iface.encodeFunctionData(ad) }))[0]);
    } catch { return ''; }
  }

  async bakiyeOku(to, sahip) {
    try {
      const out = await this.provider.call({ to, data: '0x70a08231' + sahip.toLowerCase().slice(2).padStart(64, '0') });
      return out && out.length >= 66 ? Number(BigInt(out.slice(0, 66))) : null;
    } catch { return null; }
  }

  // Mint et akışı başarıyla gönderince çağrılır: liste hemen güncellenir, zincir bakiyesi sonraki kontrolde gelir
  // Aynı işlem iki kez sayılmaz (kayıtlardan geriye dönük doldurma da aynı yolu kullanır)
  mintEdildiIsaretle(adres, { txHash = null, zaman = Date.now(), kaydet = true } = {}) {
    const k = adres.toLowerCase();
    const o = this.mintEdilenler[k] || { txler: [], adet: 0 };
    o.txler ||= o.txHash ? [o.txHash] : [];
    if (txHash && o.txler.includes(txHash)) return;
    if (txHash) o.txler.push(txHash);
    o.adet = (o.adet || 0) + 1;
    o.txHash = txHash || o.txHash || null;
    o.zaman = Math.max(o.zaman || 0, zaman);
    this.mintEdilenler[k] = o;
    if (kaydet) this.kaydet();
  }

  // Mint hazırlanırken alınan Binance önizlemesinin sonucu: listede "geçmiyor" ya da "riskli" filtresini besler
  onizlemeIsaretle(adres, { durum, sebep = null, zaman = Date.now() }) {
    this.onizlemeler[adres.toLowerCase()] = { durum, sebep: sebep ? String(sebep).slice(0, 300) : null, zaman };
    this.kaydet();
  }

  // Liste satırı için: zincirdeki bakiye ya da bu terminalden yapılmış mint
  mintBilgisi(r) {
    const m = this.mintEdilenler[String(r.adres).toLowerCase()];
    const adet = Math.max(r.bendeki || 0, m?.adet || 0);
    return adet > 0 ? { adet, txHash: m?.txHash || null, zaman: m?.zaman || null } : null;
  }

  // Cüzdanın .ai adından Agent ID numarası: uint256(keccak256(ad)). Agent ID yoksa null
  async agentIdNumarasi() {
    const cuzdan = await this.cuzdan();
    if (!cuzdan) return null;
    if (this.agentIdSon?.cuzdan === cuzdan) return this.agentIdSon.v;
    let v = null;
    try {
      const out = await this.provider.call({ to: this.registry, data: '0xc50a1514' + cuzdan.toLowerCase().slice(2).padStart(64, '0') });
      const ad = AbiCoder.defaultAbiCoder().decode(['string'], out)[0];
      if (ad) v = BigInt(keccak256(toUtf8Bytes(ad)));
    } catch { return null; } // okunamadı: sonra yeniden denenir
    this.agentIdSon = { cuzdan, v };
    return v;
  }

  // NFT olmayan Agent ID kontratlarını token mint'i olarak inceler
  async tokenIncele(adres, cuzdan, r, kod) {
    const t = await tokenMintBul({
      provider: this.provider, adres, kod, cuzdan, agentId: await this.agentIdNumarasi(),
      fetchFn: this.fetchFn, onbellek: this.imzaOnbellek, revertSebebi,
    });
    if (!t) return null;
    await this.sebepleriAdlandir(t.mintler);
    const bakiye = await this.tokenBakiye(t.token, cuzdan);
    const gecen = t.mintler.filter((m) => m.gecti).map((m) => BigInt(m.ucretWei)).sort((a, b) => (a < b ? -1 : 1));
    const turler = new Set(t.mintler.map((m) => (m.gecti ? null : siniflandir(m.sebep))));
    const sonuc = gecen[0] === 0n ? 'UCRETSIZ' : gecen.length ? (gecen[0] <= UCUZ_WEI ? 'NEREDEYSE-UCRETSIZ' : 'UCRETLI')
      : turler.has('tukendi') ? 'TUKENDI' : turler.has('acilmadi') ? 'IZLE' : 'AGENT-ID-DIGER';
    return {
      ...r, tur: 'token', standart: t.nft ? 'ERC-721 (satış kontratı)' : 'ERC-20', mintler: t.mintler.map((m) => (m.gecti ? m : { ...m, tur: siniflandir(m.sebep) })),
      ad: t.tokenAd, sembol: t.tokenSembol, token: t.token, bendeki: bakiye > 0n ? 1 : 0, tokenBakiye: bakiye.toString(),
      fiyatWei: gecen.length ? gecen[0].toString() : null, basilan: null, maks: null, sahip: null, sonuc,
    };
  }

  // Hata kodu olarak dönen revert sebeplerini adlandırıp yeniden sınıflandırır
  async sebepleriAdlandir(mintler) {
    const adlar = await hataAdlari(mintler.filter((m) => !m.gecti).map((m) => m.sebep), { fetchFn: this.fetchFn, onbellek: this.imzaOnbellek }).catch(() => ({}));
    for (const m of mintler) {
      const k = /^0x([0-9a-f]{8})/i.exec(String(m.sebep || ''))?.[1]?.toLowerCase();
      if (!m.gecti && k && adlar[k]) { m.sebep = adlar[k]; m.tur = siniflandir(m.sebep); }
    }
  }

  async tokenBakiye(token, sahip) {
    try { return BigInt((await this.provider.call({ to: token, data: '0x70a08231' + sahip.toLowerCase().slice(2).padStart(64, '0') })).slice(0, 66)); } catch { return 0n; }
  }

  // Proxy ya da klonsa asıl (uygulama) kontratın adresi
  async uygulamaAdresi(adres, kod) {
    const klon = KLON.exec(kod);
    if (klon) return getAddress('0x' + klon[1]);
    const yuva = async (y) => { try { const v = await this.provider.getStorage(adres, y); return BigInt(v) ? getAddress('0x' + v.slice(-40)) : null; } catch { return null; } };
    const uyg = await yuva(UYGULAMA_YUVASI);
    if (uyg) return uyg;
    const uygulamasi = async (b) => { try { const v = await this.provider.call({ to: b, data: '0x5c60da1b' }); return BigInt(v) ? getAddress('0x' + v.slice(26, 66)) : null; } catch { return null; } };
    const beacon = await yuva(BEACON_YUVASI);
    if (beacon) return uygulamasi(beacon);
    // Beacon adresi depoda değil koda gömülü olabilir (Flap kasa kartları): kısa bir proxy implementation() çağırıyorsa
    // koddaki adres adaylarına sorulur
    if (kod.length < 4000 && kod.includes('5c60da1b')) {
      const adaylar = new Set([...kod.matchAll(/7f0{24}([0-9a-f]{40})/g), ...kod.matchAll(/73([0-9a-f]{40})/g)].map((m) => m[1]).filter((a) => !/^0{8}|^f{8}/.test(a)));
      for (const a of [...adaylar].slice(0, 4)) {
        const u = await uygulamasi('0x' + a);
        if (u) return u;
      }
    }
    return null;
  }

  async kayitKoddaMi(adres) {
    const k = adres.toLowerCase();
    if (this.kayitliKod.has(k)) return this.kayitliKod.get(k);
    let v = false;
    try { v = String(await this.provider.getCode(adres)).toLowerCase().includes(this.registryHex); } catch { return false; }
    if (this.kayitliKod.size > 5000) this.kayitliKod.clear();
    this.kayitliKod.set(k, v);
    return v;
  }

  // Kayıt adresi kodda yoksa: depodaki getter'lardan ya da kodun andığı yardımcı kontratlardan biri Agent ID kaydına bağlı mı
  async agentIdDolayli(adres, kod) {
    const adaylar = new Set();
    for (const g of KAYIT_GETTERLARI) {
      if (!seciciVar(kod, g)) continue;
      try {
        const v = await this.provider.call({ to: adres, data: '0x' + secici(g) });
        if (!v || v.length < 66 || !BigInt(v.slice(0, 66))) continue;
        const a = '0x' + v.slice(26, 66).toLowerCase();
        if (a === '0x' + this.registryHex) return 'depo';
        adaylar.add(a);
      } catch { /* getter yok */ }
    }
    // Koda gömülü adresler (PUSH20): yardımcı ya da kapı kontratı olabilir
    for (const m of kod.matchAll(/73([0-9a-f]{40})/g)) if (!/^0{8}|^f{8}/.test(m[1])) adaylar.add('0x' + m[1]);
    adaylar.delete(adres.toLowerCase());
    for (const a of [...adaylar].slice(0, 8)) if (await this.kayitKoddaMi(a)) return 'yardimci';
    return null;
  }

  async arayuzVar(to, arayuz) {
    try { return BigInt(await this.provider.call({ to, data: '0x01ffc9a7' + arayuz.padEnd(64, '0') })) === 1n; } catch { return false; }
  }

  // Kontratın yazdığı ilk geçerli açılış zamanı (ms)
  async acilisOku(adres, kod) {
    for (const s of ACILIS_IMZALARI) if (seciciVar(kod, s)) {
      const v = acilisZamani(await this.cagir(adres, s));
      if (v) return v;
    }
    return null;
  }

  // Tek bir kontratı inceler. Ağ çağrısı dışında yan etkisi yoktur.
  // İki fazlı mintlerde (önce bedava, sonra ücretli) ücretli yol geçerken bedava yol henüz açılmamış olabilir: sonuç "ücretli"
  // kalır ama ikiFaz işaretlenir, açılış zamanı biliniyorsa zamanlı kuyruk onu açılışta yeniden dener
  async incele(adres) {
    const r = await this.inceleIc(adres);
    const simdi = Date.now();
    r.ikiFaz = !bedavaGecti(r) && (r.mintler || []).some((m) => m.gecti)
      && ((r.mintler || []).some((m) => !m.gecti && m.tur === 'acilmadi') || r.acilis > simdi);
    return r;
  }

  async inceleIc(adres) {
    adres = getAddress(adres);
    const cuzdan = await this.cuzdan();
    if (!cuzdan) throw new Error('Cüzdan adresi alınamadı. Önce cüzdanı bağla.');
    const kendi = String(await this.provider.getCode(adres)).toLowerCase();
    const r = { adres, zaman: Date.now(), standart: null, agentId: false, mintler: [], sartliImzalar: [] };
    if (kendi === '0x') return { ...r, sonuc: 'KOD-YOK' };
    // Proxy ise asıl kod uygulama kontratındadır: seçiciler ve kayıt adresi ikisinin birleşiminde aranır
    const uygulama = await this.uygulamaAdresi(adres, kendi);
    const kod = uygulama ? kendi + String(await this.provider.getCode(uygulama).catch(() => '0x')).toLowerCase().slice(2) : kendi;
    if (uygulama) r.uygulama = uygulama;
    r.acilis = await this.acilisOku(adres, kod);

    const erc721 = (await this.arayuzVar(adres, '80ac58cd')) || (seciciVar(kod, 'ownerOf(uint256)') && seciciVar(kod, 'tokenURI(uint256)'));
    const erc1155 = !erc721 && (await this.arayuzVar(adres, 'd9b67a26'));
    r.standart = erc721 ? 'ERC-721' : erc1155 ? 'ERC-1155' : null;
    r.sartliImzalar = SARTLI_IMZALAR.filter((s) => seciciVar(kod, s));
    const mintImzalari = MINT_IMZALARI.filter((s) => seciciVar(kod, s));
    // Flap kasa kartı: vergi gelirini kart sahiplerine dağıtan kasa (vault). Ayrı analizi var
    r.kasa = seciciVar(kod, 'vaultSpecVersion()') && (seciciVar(kod, 'totalTaxReceived()') || seciciVar(kod, 'pendingDividend(uint256)'));
    r.agentIdKaynak = kod.includes(this.registryHex) ? (uygulama && !kendi.includes(this.registryHex) ? 'proxy' : 'kod') : null;
    // Dolaylı bağlantıya sadece mint olabilecek kontratlarda bakılır: her yeni kontratta RPC harcamamak için
    if (!r.agentIdKaynak && (r.standart || mintImzalari.length || BILINEN_MINT_SECICILERI.some((x) => kod.includes('63' + x)))) {
      r.agentIdKaynak = await this.agentIdDolayli(adres, kod);
    }
    r.agentId = !!r.agentIdKaynak;
    r.isKaniti = IS_KANITI_IMZALARI.some((ciftler) => ciftler.every((x) => seciciVar(kod, x)));
    if (r.isKaniti && !r.standart) Object.assign(r, { tur: 'token', token: adres, standart: 'ERC-20' });
    if (!r.standart && r.agentId) {
      const t = await this.tokenIncele(adres, cuzdan, r, kod).catch(() => null);
      if (t && t.sonuc !== 'AGENT-ID-DIGER') return t;
    }
    if (!r.standart && !r.agentId) return { ...r, sonuc: 'NFT-DEGIL' };
    if (!mintImzalari.length && !r.agentId && !r.sartliImzalar.length) return { ...r, sonuc: 'MINT-YOK' };

    const fiyat = await this.ilkDeger(adres, kod, FIYAT_IMZALARI);
    for (const imza of mintImzalari) {
      const data = kodla(imza, cuzdan);
      const denemeler = [0n];
      let ilk = null;
      for (let i = 0; i < denemeler.length; i++) {
        try {
          await this.provider.call({ to: adres, from: cuzdan, data, value: denemeler[i] });
          r.mintler.push({ imza, gecti: true, ucretWei: denemeler[i].toString() });
          ilk = null;
          break;
        } catch (e) {
          if (i > 0) continue;
          const sebep = revertSebebi(e);
          ilk = { imza, gecti: false, sebep, tur: siniflandir(sebep) };
          // Adı henüz çözülmemiş özel hata (0x…) ücret hatası olabilir (WrongPayment gibi): ücret basamakları yine denenir
          if (ilk.tur !== 'ucretli' && !/^0x[0-9a-f]{8}/i.test(sebep)) break;
          // Kasa kartlarında kontratın bildirdiği fiyat 0.01 BNB'ye kadar denenir: temettü kartları genelde bu aralıkta
          if (fiyat && fiyat > 0n && fiyat <= (r.kasa ? KASA_UCRET_MAX : UCUZ_WEI)) denemeler.push(fiyat);
          for (const v of UCRET_BASAMAKLARI) if (!denemeler.includes(v)) denemeler.push(v);
        }
      }
      if (ilk) r.mintler.push(ilk);
    }

    const [ad, sembol, basilan, maks, sahip, bendeki, bedavaArz, bedavaBasilan, bedavaKalan] = await Promise.all([
      this.metinOku(adres, 'name()'), this.metinOku(adres, 'symbol()'),
      this.ilkDeger(adres, kod, BASILAN_IMZALARI), this.ilkDeger(adres, kod, MAKS_IMZALARI), this.cagir(adres, 'owner()'),
      r.standart === 'ERC-721' ? this.bakiyeOku(adres, cuzdan) : Promise.resolve(null),
      this.ilkDeger(adres, kod, BEDAVA_ARZ_IMZALARI), this.ilkDeger(adres, kod, BEDAVA_BASILAN_IMZALARI), this.ilkDeger(adres, kod, BEDAVA_KALAN_IMZALARI),
    ]);
    // Bedava havuz toplam arzdan küçükse mint iki fazlıdır: havuz dolunca aynı mint ücretli olur.
    // Ayrı sayaç yoksa doluluk toplam arzdan tahmin edilir (ücretli mintler de sayıldığı için yaklaşık)
    if (bedavaArz > 0n && (maks === null || bedavaArz < maks)) {
      const enKucuk = (a, b) => (a < b ? a : b);
      const dolan = bedavaBasilan !== null ? bedavaBasilan : bedavaKalan !== null && bedavaKalan <= bedavaArz ? bedavaArz - bedavaKalan : basilan;
      if (dolan !== null) r.havuz = { bedava: bedavaArz.toString(), dolan: enKucuk(dolan, bedavaArz).toString(), yaklasik: bedavaBasilan === null && bedavaKalan === null };
    }
    // Cüzdanda bu koleksiyondan kaç tane var: siteden ya da başka yoldan yapılan mintler de görünür
    r.bendeki = bendeki;
    Object.assign(r, {
      ad, sembol,
      fiyatWei: fiyat?.toString() ?? null,
      basilan: basilan?.toString() ?? null,
      maks: maks?.toString() ?? null,
      sahip: sahip !== null ? getAddress('0x' + sahip.toString(16).padStart(64, '0').slice(24)) : null,
    });

    await this.sebepleriAdlandir(r.mintler);
    if (!r.agentId && r.mintler.some((m) => !m.gecti && AGENT_SEBEP.test(String(m.sebep)))) { r.agentId = true; r.agentIdKaynak = 'hata'; }
    const gecen = r.mintler.filter((m) => m.gecti);
    const turler = new Set(r.mintler.map((m) => m.tur));
    if (gecen.some((m) => m.ucretWei === '0')) r.sonuc = 'UCRETSIZ';
    else if (gecen.length) r.sonuc = gecen.some((m) => BigInt(m.ucretWei) <= UCUZ_WEI) ? 'NEREDEYSE-UCRETSIZ' : 'UCRETLI';
    else if (turler.has('tukendi') && !turler.has('acilmadi')) r.sonuc = 'TUKENDI';
    else if (turler.has('zaten-aldin')) r.sonuc = 'ZATEN-ALDIN';
    else if (turler.has('acilmadi') || r.agentId || r.sartliImzalar.length) r.sonuc = 'IZLE';
    else r.sonuc = 'GECERSIZ';
    // Agent ID kayıt adresini anan NFT olmayan kontratlar genelde lansman ya da yardımcı kontratlardır, mint değil
    if (!r.standart && !gecen.length && !r.isKaniti) r.sonuc = 'AGENT-ID-DIGER';
    if (r.isKaniti && !gecen.length) r.sonuc = 'IZLE';
    if (r.standart && IZLENEN.has(r.sonuc)) r.gorsel = await this.gorselOku(adres, kod, r.standart);
    return r;
  }

  // Koleksiyonun ilk tokeninin görseli. Sonuç adres başına önbelleğe alınır; bulunamazsa bir saat sonra yeniden denenir.
  // Metadata dış veridir: sadece görsel adresi alınır, o da data:image, https ya da IPFS olmalıdır
  async gorselOku(adres, kod, standart) {
    const k = adres.toLowerCase();
    const eski = this.gorselOnbellek.get(k) ?? this.bulunanlar.find((x) => String(x.adres).toLowerCase() === k)?.gorsel;
    if (typeof eski === 'string') return eski;
    if (eski && Date.now() - eski.zaman < GORSEL_YENIDEN_MS) return null;
    let gorsel = null;
    const denemeler = standart === 'ERC-1155' ? [['uri(uint256)', 1n], ['uri(uint256)', 0n]] : [['tokenURI(uint256)', 1n], ['tokenURI(uint256)', 0n]];
    if (seciciVar(kod, 'contractURI()')) denemeler.push(['contractURI()', null]);
    for (const [imza, arg] of denemeler) {
      try {
        const iface = new Interface([`function ${imza} view returns (string)`]);
        const fn = imza.slice(0, imza.indexOf('('));
        const uri = iface.decodeFunctionResult(fn, await this.provider.call({ to: adres, data: iface.encodeFunctionData(fn, arg === null ? [] : [arg]) }))[0];
        gorsel = await gorselCoz(String(uri).replace('{id}', (arg ?? 0n).toString(16).padStart(64, '0')), this.fetchFn);
      } catch { /* bu token yok ya da metadata okunamadı */ }
      if (gorsel) break;
    }
    this.gorselOnbellek.set(k, gorsel || { zaman: Date.now() });
    return gorsel;
  }

  kayitEkle(r) {
    this.bulunanlar = [r, ...this.bulunanlar.filter((x) => x.adres !== r.adres)].slice(0, this.maxBulunan);
    this.zamanliGuncelle(r);
  }

  // Açılışı gelecekte olan ve henüz bedava geçmeyen Agent ID'li ya da NFT mintleri zamanlı kuyruğa girer
  zamanliGuncelle(r) {
    const k = String(r.adres).toLowerCase();
    if (!(r.acilis > Date.now()) || bedavaGecti(r) || !(r.agentId || r.standart) || this.mintBilgisi(r)) return false;
    this.zamanli[k] = { adres: r.adres, acilis: r.acilis, ad: r.ad || r.sembol || null, sonuc: r.sonuc, sonKontrol: this.zamanli[k]?.sonKontrol || 0 };
    return true;
  }

  // Her saniye çalışır: açılışına birkaç saniye kalan mintler sık sık yeniden incelenir. Mint açılınca "acildi" olayı ajana gider,
  // otomatik mint kuralları (sadece bedava, Agent ID, günlük sınır) orada uygulanır
  zamanliTur(simdi = Date.now()) {
    for (const [k, z] of Object.entries(this.zamanli)) {
      if (simdi > z.acilis + ZAMANLI_SURE_MS) { delete this.zamanli[k]; this.kaydet(); continue; }
      if (simdi < z.acilis - ZAMANLI_ONCE_MS || this.zamanliCalisan.has(k)) continue;
      const aralik = simdi < z.acilis + 2 * 6e4 ? ZAMANLI_SIK_MS : ZAMANLI_SEYREK_MS;
      if (simdi - (z.sonKontrol || 0) < aralik) continue;
      z.sonKontrol = simdi;
      this.zamanliCalisan.add(k);
      this.zamanliKontrol(k, z).finally(() => this.zamanliCalisan.delete(k));
    }
  }

  async zamanliKontrol(k, z) {
    let r;
    try { r = await this.incele(z.adres); } catch (e) { this.durum.sonHata = `Zamanlı kontrol: ${e.shortMessage || e.message}`; return; }
    if (!this.zamanli[k]) return;
    const w = this.izleme[k];
    r.blok = w?.blok ?? null;
    if (r.sonuc === 'TUKENDI' || this.mintBilgisi(r)) { delete this.zamanli[k]; this.kayitEkle(r); this.kaydet(); return; }
    if (!bedavaGecti(r) && !(BILDIRILEN.has(r.sonuc) && r.sonuc !== z.sonuc)) return;
    delete this.zamanli[k];
    if (w) w.sonuc = r.sonuc;
    else this.izleme[k] = { adres: r.adres, ilkGorulme: Date.now(), blok: null, sonuc: r.sonuc, ad: r.ad };
    this.durum.zamanliYakalanan = (this.durum.zamanliYakalanan || 0) + 1;
    this.kayitEkle(r);
    this.kaydet();
    this.emit('acildi', r);
    this.bildir?.(r);
  }

  async yeniKontrat(adres, blok) {
    const anahtar = adres.toLowerCase();
    if (this.izleme[anahtar]) return;
    const r = await this.incele(adres);
    // Açılışı gelecekte olan Agent ID'li ya da NFT mintleri, şu an hiçbir yolu geçmese de izlenir
    if (!IZLENEN.has(r.sonuc) && !(r.acilis > Date.now() && (r.agentId || r.standart))) return;
    r.blok = blok;
    this.izleme[anahtar] = { adres: r.adres, ilkGorulme: Date.now(), blok, sonuc: r.sonuc, ad: r.ad };
    this.kayitEkle(r);
    this.emit('bulundu', r);
    // Agent ID'li NFT'ler açılmadan da haber verilir: kontenjanları küçük
    if ((BILDIRILEN.has(r.sonuc) || (r.agentId && r.standart)) && !this.mintBilgisi(r)) this.bildir?.(r);
  }

  // Listedeki NFT'ler için cüzdan bakiyesini tazeler: siteden ya da elle yapılan mintler de "mint ettin" görünür
  async bakiyeleriTazele() {
    const cuzdan = await this.cuzdan();
    if (!cuzdan) return;
    await Promise.all(this.bulunanlar.filter((r) => r.standart === 'ERC-721' || r.tur === 'token').map(async (r) => {
      if (r.tur === 'token') { const b = await this.tokenBakiye(r.token, cuzdan); r.tokenBakiye = b.toString(); r.bendeki = b > 0n ? 1 : 0; return; }
      const b = await this.bakiyeOku(r.adres, cuzdan);
      if (b !== null) r.bendeki = b;
    }));
  }

  // İzleme listesi binlerce kontrata çıkabiliyor: hepsini sırayla kontrol etmek saatler sürer. Her turda son bir günde
  // görülenlerin en yenileri ve eskilerden sıradaki bir parça kontrol edilir. Açılış saatine bağlı mintleri zamanlı kuyruk yakalar
  async yenidenKontrol() {
    const basla = Date.now();
    for (const [anahtar, w] of Object.entries(this.izleme)) {
      const gun = IZLEME_SURE_GUN[w.sonuc] ?? this.izlemeGun;
      if (basla - w.ilkGorulme > gun * 864e5 || ['TUKENDI', 'ZATEN-ALDIN'].includes(w.sonuc)) delete this.izleme[anahtar];
    }
    const sirali = Object.entries(this.izleme).sort((a, b) => b[1].ilkGorulme - a[1].ilkGorulme);
    const oncelik = (w) => KONTROL_ONCELIK[w.sonuc] ?? 0;
    const gunluk = sirali.filter(([, w]) => basla - w.ilkGorulme < 864e5).sort((a, b) => oncelik(a[1]) - oncelik(b[1]));
    const yeni = gunluk.slice(0, this.yenidenKontrolYeni);
    const eski = sirali.slice(yeni.length);
    if (this.eskiImlec >= eski.length) this.eskiImlec = 0;
    const parca = eski.slice(this.eskiImlec, this.eskiImlec + this.yenidenKontrolEski);
    this.eskiImlec += parca.length;
    for (const [anahtar, w] of [...yeni, ...parca]) {
      if (!this.izleme[anahtar]) continue;
      try {
        const r = await this.incele(w.adres);
        r.blok = w.blok;
        if (r.sonuc !== w.sonuc) {
          w.sonuc = r.sonuc;
          if (BILDIRILEN.has(r.sonuc) && !this.mintBilgisi(r)) { this.emit('acildi', r); this.bildir?.(r); }
        }
        this.kayitEkle(r);
      } catch (e) { this.durum.sonHata = e.shortMessage || e.message; }
    }
    this.durum.sonKontrol = { zaman: Date.now(), sureMs: Date.now() - basla, kontrat: yeni.length + parca.length, izlenen: sirali.length };
    await this.bakiyeleriTazele().catch(() => {});
    this.kaydet();
    this.emit('kontrolBitti');
  }

  // Blok ve makbuzları havuzdaki sıradaki RPC'den okur; hata veren RPC'de bir sonrakiyle yeniden dener.
  // Hepsi başarısız olursa hata fırlatılır: çağıran o bloğu boşluğa yazar, taranmış saymaz
  async bloktakiKontratlar(n) {
    const havuz = this.blokProviderlar;
    let son;
    for (let deneme = 0; deneme < havuz.length; deneme++) {
      const p = havuz[this.blokSira++ % havuz.length];
      try {
        const blok = await p.send('eth_getBlockByNumber', [toQuantity(n), true]);
        if (!blok) throw new Error(`Blok ${n} henüz yok`);
        const adresler = [];
        for (const tx of (blok.transactions ?? []).filter((t) => t.to === null)) {
          const rc = await p.send('eth_getTransactionReceipt', [tx.hash]);
          if (rc?.status === '0x1' && rc.contractAddress) adresler.push(rc.contractAddress);
        }
        return adresler;
      } catch (e) { son = e; }
    }
    throw son;
  }

  // Canlı bloklardan gelenler kuyruğun önüne geçer: taze bir mint, eski boşluklardan gelen kontratların arkasında beklemesin
  async adayIncele(adres, blok, { fabrika = false, eski = false } = {}) {
    const k = adres.toLowerCase();
    if (this.gorulen.has(k)) return;
    if (this.gorulen.size > 50_000) this.gorulen.clear();
    this.gorulen.add(k);
    this.durum.kontrat++;
    if (fabrika) this.durum.fabrika = (this.durum.fabrika || 0) + 1;
    if (eski) this.incelemeKuyrugu.push([adres, blok]); else this.incelemeKuyrugu.unshift([adres, blok]);
    this.incelemePompala();
  }

  // Kontrat incelemesi onlarca eth_call sürer: tarama döngüsünü bekletmesin diye kuyrukta, sınırlı paralellikle yürür
  incelemePompala() {
    while (this.incelemeCalisan < this.incelemeParalel && this.incelemeKuyrugu.length) {
      const [adres, blok] = this.incelemeKuyrugu.shift();
      this.incelemeCalisan++;
      this.yeniKontrat(adres, blok).catch((e) => { this.durum.sonHata = e.shortMessage || e.message; }).finally(() => {
        this.incelemeCalisan--;
        this.incelemePompala();
        if (!this.incelemeCalisan && !this.incelemeKuyrugu.length) for (const f of this.incelemeBekleyenler.splice(0)) f();
      });
    }
  }

  incelemeleriBekle() {
    if (!this.incelemeCalisan && !this.incelemeKuyrugu.length) return Promise.resolve();
    return new Promise((r) => this.incelemeBekleyenler.push(r));
  }

  // Olay taraması blok taramasından ayrı ve seyrek çalışır: ücretsiz RPC'lerin hız sınırına takılmamak için
  // birikmiş aralık tek sorguyla alınır. Sınıra takılan RPC'de sıradakine geçilir, aralık bir sonraki turda yeniden denenir
  async olayTur(tepe) {
    if (!this.olayProviderlar.length || Date.now() - this.sonOlayTur < this.olayAralikMs) return;
    this.sonOlayTur = Date.now();
    let bas = (this.durum.olayBlok ?? tepe - 1) + 1;
    if (tepe - bas > this.maxGeriBlok) bas = tepe - this.maxGeriBlok;
    // Ücretsiz RPC'ler tek sorguda en fazla 50 blok kabul ediyor
    for (let a = bas; a <= tepe; a += 50) {
      const b = Math.min(a + 49, tepe);
      let adaylar = null;
      for (let deneme = 0; deneme < this.olayProviderlar.length && !adaylar; deneme++) {
        const p = this.olayProviderlar[this.olaySira % this.olayProviderlar.length];
        try { adaylar = await this.olaydanKontratlar(a, b, p); } catch (e) {
          this.olaySira++;
          this.durum.sonHata = `Olay taraması: ${e.shortMessage || e.message}`.slice(0, 160);
        }
      }
      if (!adaylar) return; // hepsi başarısız: kalan aralık sonraki turda
      this.durum.olayBlok = b;
      for (const o of adaylar) await this.adayIncele(o.adres, o.blok, { fabrika: true });
    }
  }

  // Fabrika ya da launchpad kontratlarının içinden kurulanlar blokta ayrı bir kurulum işlemi olarak görünmez.
  // Doğarken yaydıkları olaylardan bulunur: sıfır adresten sahiplik devri, ilk yönetici rolü, ilk kurulum, proxy kurulumu
  async olaydanKontratlar(bas, son, provider = this.olayProviderlar[0]) {
    if (!provider) return [];
    const T = DOGUM_OLAYLARI;
    const loglar = await provider.send('eth_getLogs', [{
      fromBlock: toQuantity(bas), toBlock: toQuantity(son), topics: [[T.sahiplik, T.rol, T.kurulum8, T.kurulum64, T.yukseltme]],
    }]);
    const bulunan = new Map();
    for (const l of loglar || []) {
      const [t0, t1] = l.topics || [];
      if ((t0 === T.sahiplik || t0 === T.rol) && t1 !== SIFIR32) continue;
      const a = String(l.address).toLowerCase();
      if (!bulunan.has(a)) bulunan.set(a, Number(BigInt(l.blockNumber)));
    }
    return [...bulunan].map(([adres, blok]) => ({ adres, blok }));
  }

  boslukEkle(bas, son, { kaydet = true } = {}) {
    if (son < bas) return;
    // Çakışan ya da bitişik aralıklar birleştirilir: aynı blok iki kez taranmasın
    const hepsi = [...this.bosluklar, { bas, son }].sort((a, b) => a.bas - b.bas);
    this.bosluklar = [];
    for (const x of hepsi) {
      const onceki = this.bosluklar.at(-1);
      if (onceki && x.bas <= onceki.son + 1) onceki.son = Math.max(onceki.son, x.son);
      else this.bosluklar.push({ ...x });
    }
    // En yeni boşluk önce doldurulur; toplam boşluk sınırı aşılırsa en eskiler bırakılır
    this.bosluklar.sort((a, b) => b.son - a.son);
    let kalan = this.maxBosluk;
    this.bosluklar = this.bosluklar.filter((x) => { if (kalan <= 0) return false; x.bas = Math.max(x.bas, x.son - kalan + 1); kalan -= x.son - x.bas + 1; return true; });
    if (kaydet) this.kaydet();
  }

  // Her turda en yeni boşluğun sonundan geriye doğru `geriDoldurBlok` kadar blok tarar
  async boslukDoldur() {
    const b = this.bosluklar[0];
    if (!b) { this.durum.bosluk = 0; return; }
    const alt = Math.max(b.bas, b.son - this.geriDoldurBlok + 1);
    // Sondan geriye taranır; okunamayan blok olursa o noktada durulur, taranan kısım boşluktan düşülür
    while (b.son >= alt) {
      const bloklar = Array.from({ length: Math.min(this.blokParalel, b.son - alt + 1) }, (_, i) => b.son - i);
      const sonuclar = await Promise.all(bloklar.map((x) => this.bloktakiKontratlar(x).then((a) => [x, a]).catch(() => [x, null])));
      const hata = sonuclar.findIndex(([, a]) => a === null);
      const tamam = hata < 0 ? sonuclar : sonuclar.slice(0, hata);
      for (const [x, adresler] of tamam) for (const a of adresler) await this.adayIncele(a, x, { eski: true });
      if (tamam.length) b.son = tamam.at(-1)[0] - 1;
      if (hata >= 0) break;
    }
    if (b.son < b.bas) this.bosluklar.shift();
    this.durum.bosluk = this.bosluklar.reduce((t, x) => t + x.son - x.bas + 1, 0);
    this.kaydet();
  }

  async aralikTara(bas, son) {
    for (let n = bas; n <= son; n += this.blokParalel) {
      const bloklar = Array.from({ length: Math.min(this.blokParalel, son - n + 1) }, (_, i) => n + i);
      const sonuclar = await Promise.all(bloklar.map((b) => this.bloktakiKontratlar(b).then((a) => [b, a])
        .catch((e) => { this.durum.sonHata = `Blok ${b}: ${e.shortMessage || e.message}`; return [b, null]; })));
      // Okunamayan blok boşluğa yazılır, sonra yeniden taranır: sessizce atlanırsa içindeki kontratlar kaybolur
      for (const [b, adresler] of sonuclar) {
        if (adresler === null) { this.boslukEkle(b, b, { kaydet: false }); continue; }
        for (const a of adresler) await this.adayIncele(a, b);
      }
      this.durum.sonBlok = bloklar.at(-1);
      this.durum.taranan += bloklar.length;
    }
    this.kaydet();
  }

  async tur() {
    if (!(await this.cuzdan())) { this.durum.sonHata = CUZDAN_YOK; return; }
    // Cüzdan bağlanınca ilk tur aradaki blokları tararken uzun sürebilir: eski uyarı turun sonunu beklemeden kalkar
    if (this.durum.sonHata === CUZDAN_YOK) this.durum.sonHata = null;
    const tepe = await this.provider.getBlockNumber();
    let bas = (this.durum.sonBlok ?? tepe - 1) + 1;
    if (tepe - bas > this.maxGeriBlok) {
      const yeniBas = tepe - this.maxGeriBlok;
      if (this.durum.sonBlok != null) this.boslukEkle(Math.max(bas, yeniBas - this.maxBosluk), yeniBas - 1);
      bas = yeniBas;
    }
    if (bas <= tepe) await this.aralikTara(bas, tepe);
    // Önce canlı: tarama sürerken zincir ilerlediyse boşluk doldurma atlanır ve döngü beklemeden yeniden döner
    const yeniTepe = await this.provider.getBlockNumber().catch(() => tepe);
    this.geride = yeniTepe - (this.durum.sonBlok ?? yeniTepe) > this.blokParalel * 2;
    // İnceleme kuyruğu birikmişse eski boşluklar beklesin: önce kuyruk erisin
    if (!this.geride && this.incelemeKuyrugu.length < this.maxKuyruk) await this.boslukDoldur();
    this.durum.bosluk = this.bosluklar.reduce((t, x) => t + x.son - x.bas + 1, 0);
    this.durum.gerideBlok = Math.max(0, yeniTepe - (this.durum.sonBlok ?? yeniTepe));
    this.durum.incelemeKuyrugu = this.incelemeKuyrugu.length;
    await this.olayTur(tepe);
    // İzlenenlerin yeniden kontrolü dakikalar sürebilir: arka planda yürür, canlı taramayı bekletmez (yoksa takip zincirin
    // gerisine düşer ve aradaki bloklar boşluğa kalır). Aynı anda tek kontrol çalışır
    if (!this.kontrolSuruyor && Date.now() - this.sonYenidenKontrol > this.yenidenKontrolDk * 6e4) {
      this.sonYenidenKontrol = Date.now();
      this.kontrolSuruyor = this.yenidenKontrol().catch((e) => { this.durum.sonHata = e.shortMessage || e.message; }).finally(() => { this.kontrolSuruyor = null; });
    }
    this.durum.sonHata = null;
  }

  baslat() {
    if (this.durum.calisiyor) return;
    this.durum.calisiyor = true;
    this.durum.baslangic = Date.now();
    this.bakiyeleriTazele().catch(() => {});
    const dongu = async () => {
      if (!this.durum.calisiyor) return;
      await this.tur().catch((e) => { this.durum.sonHata = e.shortMessage || e.message; });
      this.zamanlayici = setTimeout(dongu, this.geride ? 0 : this.aralikMs);
    };
    dongu();
    this.zamanliZamanlayici = setInterval(() => this.zamanliTur(), 1000);
  }

  durdur() { this.durum.calisiyor = false; clearTimeout(this.zamanlayici); clearInterval(this.zamanliZamanlayici); }

  ozet() {
    return {
      durum: this.durum,
      bulunanlar: this.bulunanlar.map((r) => ({ ...r, mintEdildi: this.mintBilgisi(r), onizleme: this.onizlemeler[String(r.adres).toLowerCase()] || null })),
      izleme: Object.values(this.izleme).sort((a, b) => b.ilkGorulme - a.ilkGorulme),
      zamanli: Object.values(this.zamanli).sort((a, b) => a.acilis - b.acilis),
    };
  }
}
