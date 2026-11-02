// Mint kaydı: iki kontratın Mined olayları doğrudan herkese açık RPC'den okunur, sunucu yoktur.
// Taranan blok aralığı ve olaylar tarayıcıda saklanır; sonraki ziyarette yalnızca yeni bloklar okunur.
import { AG } from './adresler.js';
import { aktiviteCiz } from './aktivite.js';

const KURULUM = 130898309; // iki kontratın yayınlandığı blok
const MINED = '0xb641e07763e6dadc2d8c70f7c5da177ddbfcef39e0ecb06e7657162b314ba215';
const HANDLE_OF = '0xc50a1514';
const DEPO = 'hound-kayit-v1';
const RPCLER = [AG.rpc, ...(AG.yedekRpc || [])];
const AD = { [AG.hound.toLowerCase()]: 'HOUND', [AG.blockhound.toLowerCase()]: 'BlockHound' };

const M = {
  zh: {
    son: ['#', '矿工', '系列', '难度', '区块', '交易'], lider: ['排名', '矿工', 'HOUND', 'BlockHound', '合计'],
    bos: '还没有 mint 记录。第一个就是你。', okunuyor: (a, b) => `正在读取链上事件… ${a} / ${b} 个区块`,
    hata: '暂时无法读取 RPC，请稍后刷新。', guncel: (z) => `更新于 ${z}`, bit: (b) => `${b} 位`,
    dagilim: (h, n) => `HOUND ${h} · BlockHound ${n}`,
  },
  en: {
    son: ['#', 'Miner', 'Collection', 'Difficulty', 'Block', 'Tx'], lider: ['Rank', 'Miner', 'HOUND', 'BlockHound', 'Total'],
    bos: 'No mints yet. The first one could be yours.', okunuyor: (a, b) => `Reading chain events… ${a} / ${b} blocks`,
    hata: 'Could not reach the RPC right now; refresh in a moment.', guncel: (z) => `Updated ${z}`, bit: (b) => `${b} bits`,
    dagilim: (h, n) => `HOUND ${h} · BlockHound ${n}`,
  },
};
const $ = (s) => document.querySelector(s);
const dil = () => (document.documentElement.lang === 'en' ? 'en' : 'zh');
const t = () => M[dil()];
const sayi = (v, k = 0) => Number(v).toLocaleString(dil() === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: k });
const depo = { oku: () => { try { return JSON.parse(localStorage.getItem(DEPO)); } catch { return null; } }, yaz: (v) => { try { localStorage.setItem(DEPO, JSON.stringify(v)); } catch { /* önemli değil */ } } };
const kisa = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const hex = (n) => '0x' + n.toString(16);

// Tek çağrı tek nesne olarak gider (bazı RPC'ler eth_getLogs'u toplu istekte kabul etmez).
// Hız sınırına takılınca kısa bir beklemeyle yeniden denenir, sonra yedek RPC'ye geçilir
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(cagrilar) {
  const istek = cagrilar.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }));
  const govde = JSON.stringify(istek.length === 1 ? istek[0] : istek);
  let son;
  for (let tur = 0; tur < 3; tur++) {
    for (const url of RPCLER) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: govde });
        if (!r.ok) throw new Error(`RPC ${r.status}`);
        const j = await r.json();
        const sirali = (Array.isArray(j) ? j : [j]).sort((a, b) => a.id - b.id);
        return sirali.map((x) => { if (x.error) throw new Error(x.error.message || 'RPC'); return x.result; });
      } catch (e) { son = e; }
    }
    await bekle(1500 * (tur + 1));
  }
  throw son;
}

let durum = depo.oku() || { son: KURULUM - 1, olaylar: [], adlar: {} };

// Yayınlanmış anlık görüntü tarayıcıdaki kayıttan yeniyse oradan başlanır: zincirden yalnızca sonraki bloklar okunur
async function anlikYukle() {
  try {
    const a = await (await fetch(new URL('./kayit.json', import.meta.url), { cache: 'no-store' })).json();
    if (a.son > durum.son) durum = { ...a, adlar: { ...durum.adlar, ...a.adlar } };
    // Eski sürümün sakladığı olaylarda zaman yoktu: anlık görüntüdekinden tamamlanır
    const zaman = Object.fromEntries(a.olaylar.filter((o) => o.t).map((o) => [o.tx, o.t]));
    for (const o of durum.olaylar) if (!o.t && zaman[o.tx]) o.t = zaman[o.tx];
  } catch { /* yoksa baştan taranır */ }
}
let gorunum = 'son';
let calisiyor = false;

async function tara() {
  const [tepeHex] = await rpc([['eth_blockNumber', []]]);
  const tepe = Number(BigInt(tepeHex));
  let bas = durum.son + 1;
  let aralik = 5_000;
  while (bas <= tepe) {
    const bit = Math.min(tepe, bas + aralik - 1);
    $('#kayit-durum').textContent = t().okunuyor(sayi(bas - KURULUM), sayi(tepe - KURULUM));
    let loglar;
    try {
      [loglar] = await rpc([['eth_getLogs', [{ fromBlock: hex(bas), toBlock: hex(bit), address: [AG.hound, AG.blockhound], topics: [MINED] }]]]);
    } catch (e) {
      if (aralik > 1_000) { aralik = Math.floor(aralik / 2); continue; } // aralık çok geniş: küçült ve tekrar dene
      throw e;
    }
    for (const l of loglar) {
      const veri = l.data.slice(2);
      durum.olaylar.push({
        k: l.address.toLowerCase(), m: '0x' + l.topics[1].slice(26), i: Number(BigInt(l.topics[2])),
        bit: Number(BigInt('0x' + veri.slice(64, 128))), ucret: BigInt('0x' + veri.slice(128, 192)).toString(),
        b: Number(BigInt(l.blockNumber)), tx: l.transactionHash,
      });
    }
    durum.son = bit;
    depo.yaz(durum); // kısmi ilerleme saklanır: sayfa kapanırsa kalınan yerden devam edilir
    bas = bit + 1;
    await bekle(250); // herkese açık RPC'yi zorlamamak için
  }
  durum.zaman = Date.now();
  await zamanlariOku();
  await adlariOku();
  depo.yaz(durum);
}

// Grafik için her mintin zamanı: bloğun zaman damgası (anlık görüntüdekiler hazır gelir)
async function zamanlariOku() {
  const eksik = [...new Set(durum.olaylar.filter((o) => !o.t).map((o) => o.b))].slice(0, 50);
  if (!eksik.length) return;
  try {
    const bloklar = await rpc(eksik.map((b) => ['eth_getBlockByNumber', [hex(b), false]]));
    const zaman = Object.fromEntries(eksik.map((b, i) => [b, bloklar[i] ? Number(BigInt(bloklar[i].timestamp)) * 1000 : null]));
    for (const o of durum.olaylar) if (!o.t && zaman[o.b]) o.t = zaman[o.b];
  } catch { /* zamansız olaylar grafikte görünmez, tabloda görünür */ }
}

// Agent ID adları (handleOf) tek toplu istekte okunur; ABI string çözümü: ofset, uzunluk, veri
async function adlariOku() {
  const eksik = [...new Set(durum.olaylar.map((o) => o.m))].filter((m) => !(m in durum.adlar));
  if (!eksik.length) return;
  try {
    const sonuc = await rpc(eksik.map((m) => ['eth_call', [{ to: AG.agentKayit, data: HANDLE_OF + m.slice(2).padStart(64, '0') }, 'latest']]));
    eksik.forEach((m, i) => {
      const h = (sonuc[i] || '0x').slice(2);
      const uzunluk = h.length >= 128 ? Number(BigInt('0x' + h.slice(64, 128))) : 0;
      const bayt = h.slice(128, 128 + uzunluk * 2).match(/../g) || [];
      durum.adlar[m] = new TextDecoder().decode(new Uint8Array(bayt.map((x) => parseInt(x, 16))));
    });
  } catch { /* adlar olmadan da adresler gösterilir */ }
}

const hucre = (metin, sinif) => { const td = document.createElement('td'); td.textContent = metin; if (sinif) td.className = sinif; return td; };
const baglanti = (href, metin) => { const td = document.createElement('td'); const a = document.createElement('a'); a.href = href; a.rel = 'noopener'; a.textContent = metin; td.append(a); return td; };
const madenciHucre = (m) => {
  const ad = durum.adlar[m];
  const td = baglanti(`${AG.tarayici}/address/${m}`, ad ? (ad.endsWith('.ai') ? ad : `${ad}.ai`) : kisa(m));
  if (ad) { const s = document.createElement('span'); s.className = 'adres-kucuk'; s.textContent = ` ${kisa(m)}`; td.append(s); }
  return td;
};

function ciz() {
  const tablo = $('#kayit-tablo');
  if (!tablo) return;
  const olaylar = durum.olaylar;
  const madenciler = new Map();
  let ucret = 0n;
  for (const o of olaylar) {
    const s = madenciler.get(o.m) || { HOUND: 0, BlockHound: 0 };
    s[AD[o.k]]++;
    madenciler.set(o.m, s);
    ucret += BigInt(o.ucret);
  }
  const yaz = (ad, metin) => { for (const e of document.querySelectorAll(`[data-ky=${ad}]`)) e.textContent = metin; };
  yaz('toplam', sayi(olaylar.length));
  yaz('dagilim', t().dagilim(sayi(olaylar.filter((o) => AD[o.k] === 'HOUND').length), sayi(olaylar.filter((o) => AD[o.k] === 'BlockHound').length)));
  yaz('madenci', sayi(madenciler.size));
  yaz('ucret', `${sayi(Number(ucret) / 1e18, 5)} BNB`);
  yaz('ucret-sayi', sayi(Number(ucret) / 1e18, 5));
  yaz('blok', durum.son >= KURULUM ? sayi(durum.son) : '—');
  const kap = $('#aktivite-grafik');
  if (kap) aktiviteCiz(kap, $('#aktivite-ipucu'), olaylar.map((o) => ({ ad: AD[o.k], t: o.t })), { yerel: dil() === 'en' ? 'en-GB' : 'zh-CN' });

  const basliklar = t()[gorunum];
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const b of basliklar) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = b; tr.append(th); }
  thead.append(tr);
  const tbody = document.createElement('tbody');
  if (!olaylar.length) {
    const r = document.createElement('tr');
    const td = hucre(t().bos, 'bos-satir'); td.colSpan = basliklar.length; r.append(td); tbody.append(r);
  } else if (gorunum === 'son') {
    for (const o of [...olaylar].sort((a, b) => b.b - a.b).slice(0, 25)) {
      const r = document.createElement('tr');
      r.append(hucre(`${AD[o.k]} #${o.i + 1}`), madenciHucre(o.m), hucre(AD[o.k]), hucre(t().bit(o.bit)), hucre(sayi(o.b)), baglanti(`${AG.tarayici}/tx/${o.tx}`, kisa(o.tx)));
      tbody.append(r);
    }
  } else {
    const sirali = [...madenciler].sort((a, b) => (b[1].HOUND + b[1].BlockHound) - (a[1].HOUND + a[1].BlockHound)).slice(0, 25);
    sirali.forEach(([m, s], i) => {
      const r = document.createElement('tr');
      r.append(hucre(String(i + 1)), madenciHucre(m), hucre(sayi(s.HOUND)), hucre(sayi(s.BlockHound)), hucre(sayi(s.HOUND + s.BlockHound)));
      tbody.append(r);
    });
  }
  tablo.replaceChildren(thead, tbody);
  if (durum.zaman) $('#kayit-durum').textContent = t().guncel(new Date(durum.zaman).toLocaleString(dil() === 'en' ? 'en-GB' : 'zh-CN'));
}

async function yenile() {
  if (calisiyor) return;
  calisiyor = true;
  await anlikYukle();
  ciz(); // anlık görüntü zincir okuması bitmeden gösterilir
  $('#kayit-yenile').disabled = true;
  try { await tara(); ciz(); } catch { $('#kayit-durum').textContent = t().hata; } finally { calisiyor = false; $('#kayit-yenile').disabled = false; }
}

for (const b of document.querySelectorAll('[data-kayit]')) {
  b.addEventListener('click', () => {
    gorunum = b.dataset.kayit;
    for (const x of document.querySelectorAll('[data-kayit]')) x.setAttribute('aria-pressed', String(x === b));
    ciz();
  });
}
$('#kayit-yenile')?.addEventListener('click', yenile);
for (const b of document.querySelectorAll('[data-dil]')) b.addEventListener('click', () => setTimeout(ciz));

ciz();
// Yayınlanmış anlık görüntü hemen çizilir: üstteki canlı kartlar zincir okumasını beklemez
anlikYukle().then(ciz);
let olcek;
addEventListener('resize', () => { clearTimeout(olcek); olcek = setTimeout(ciz, 150); });
// Bölüm görünür olunca okunur: sayfanın üstündeki mint kartlarıyla aynı anda RPC'ye yüklenmemek için
const bolum = $('#kayit');
if (bolum && 'IntersectionObserver' in window) {
  const g = new IntersectionObserver((k) => { if (k.some((x) => x.isIntersecting)) { g.disconnect(); yenile(); } }, { rootMargin: '400px' });
  g.observe(bolum);
} else yenile();
