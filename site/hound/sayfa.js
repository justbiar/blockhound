// Mint sayfasının bilgi bölümleri: zorluk grafiği (SVG, logaritmik süre ekseni), tablo görünümü, ajan promptu ve
// adres kopyalama. Dil, mint.js'in <html lang> değerinden okunur; dil düğmesine basılınca yeniden çizilir.
import { AG } from './adresler.js';

const KOLEKSIYON = {
  hound: { adres: AG.hound, donem: 1000, birim: 10_000, ad: 'HOUND', bas: 20 },
  blockhound: { adres: AG.blockhound, donem: 250, birim: 1, ad: 'BlockHound', bas: 20 },
};
const HIZ = { tarayici: 3e6, kart: 1e9 }; // hash / saniye, yaklaşık
const DONEM_SAYISI = 36;

const METIN = {
  tr: {
    sn: 'sn', dk: 'dk', sa: 'sa', gun: 'gün', yil: 'yıl', binYil: 'bin yıl',
    eksenX: (ad) => `Basılan ${ad}`, simdi: (n) => `şu an: ${n} mint`,
    mevcut: (d, ad) => `<b>Şu anki zorluk: ${d.bit} bit</b> · dönem ${d.e} · ${ad} için ortalama ${d.hash} hash. Bir mint ortalama tarayıcıyla ${d.t1}, ekran kartıyla ${d.t2} sürer. Zorluk ${d.kalan} mint sonra ${d.bit + 1} bite çıkar.`,
    mevcutYok: 'Kontrat okunamadı; grafik başlangıç zorluğunu gösteriyor.',
    ipucu: (d) => `<b>Dönem ${d.e}</b> · ${d.bit} bit<br>${d.aralik}<br><span class="i1"></span>Tarayıcı: ${d.t1}<br><span class="i2"></span>Ekran kartı: ${d.t2}`,
    aralik: (a, b, ad) => `${a} – ${b} ${ad}`,
    not: 'Hızlar yaklaşık. Süre şansa bağlıdır: tek bir mint ortalamanın çok altında ya da üstünde bitebilir. Pratik sınır, ekran kartıyla bile bir mintin günler sürdüğü yerdir.',
    tablo: ['Dönem', 'Zorluk', 'Başlangıçta basılan', 'Ortalama hash', 'Tarayıcı', 'Ekran kartı'],
    kopyalandi: 'Kopyalandı.', kopyalanamadi: 'Kopyalanamadı; metni elle seç.',
    prompt: (k, adres) => `Görev: ${k.ad} mint (Blockhound projesi; iş kanıtı, yalnızca Agent ID cüzdanları).

Ağ: BNB Smart Chain (zincir kimliği 56)
Kontrat: ${adres} (BscScan'de doğrulanmış)
Mint başına: ${k.ad === 'HOUND' ? '10.000 HOUND' : '1 BlockHound NFT'} · ücret ${k.ad === 'HOUND' ? '0.50' : '0.10'} $ karşılığı BNB, fazlası iade edilir

Adımlar:
1. baw ile BSC'deki Agent ID cüzdan adresimi öğren.
2. https://github.com/justbiar/blockhound deposunu indir ve içinde "npm install" çalıştır.
3. "node scripts/hound-madenci.js ${k.ad === 'HOUND' ? 'hound' : 'blockhound'} <cüzdan adresim>" komutunu çalıştır. Adres Agent ID'li değilse durur; çözüm bulununca iki baw komutu yazar.
4. İlk komutu (baw contract-call preview) çalıştır ve önizlemede şunların hepsini doğrula:
   - alıcı kontrat tam olarak ${adres}
   - gönderilen BNB 0.002'den az
   - cüzdana ${k.ad === 'HOUND' ? '10.000 HOUND' : '1 BlockHound NFT'} geliyor
   - token harcama izni (approve) ya da başka bir çıkış yok
   Biri bile tutmazsa gönderme, durumu bana bildir.
5. Önizleme özetini göster ve benden açık onay iste. Onay verirsem execute komutunu önizlemedeki requestId ile çalıştır.
6. İşlem hash'ini ve yeni ${k.ad} bakiyemi göster.

Kurallar: Özel anahtar, seed ya da şifre isteme. Bu promptta yazmayan bir adrese işlem gönderme.`,
  },
  en: {
    sn: 's', dk: 'min', sa: 'h', gun: 'd', yil: 'yr', binYil: 'k yr',
    eksenX: (ad) => `${ad} minted`, simdi: (n) => `now: ${n} mints`,
    mevcut: (d, ad) => `<b>Current difficulty: ${d.bit} bits</b> · epoch ${d.e} · ${d.hash} hashes on average for ${ad}. On average one mint takes ${d.t1} in a browser and ${d.t2} on a GPU. Difficulty rises to ${d.bit + 1} bits in ${d.kalan} mints.`,
    mevcutYok: 'Could not read the contract; the chart shows the starting difficulty.',
    ipucu: (d) => `<b>Epoch ${d.e}</b> · ${d.bit} bits<br>${d.aralik}<br><span class="i1"></span>Browser: ${d.t1}<br><span class="i2"></span>GPU: ${d.t2}`,
    aralik: (a, b, ad) => `${a} – ${b} ${ad}`,
    not: 'Speeds are approximate. Timing is luck: a single mint can finish far below or above the average. The practical limit is where a mint takes days even on a GPU.',
    tablo: ['Epoch', 'Difficulty', 'Minted at start', 'Average hashes', 'Browser', 'GPU'],
    kopyalandi: 'Copied.', kopyalanamadi: 'Could not copy; select the text by hand.',
    prompt: (k, adres) => `Task: ${k.ad} mint (Blockhound project; proof of work, Agent ID wallets only).

Network: BNB Smart Chain (chain id 56)
Contract: ${adres} (verified on BscScan)
Per mint: ${k.ad === 'HOUND' ? '10,000 HOUND' : '1 BlockHound NFT'} · fee worth ${k.ad === 'HOUND' ? '0.50' : '0.10'} dollars in BNB, excess refunded

Steps:
1. Use baw to get my Agent ID wallet address on BSC.
2. Clone https://github.com/justbiar/blockhound and run "npm install" inside it.
3. Run "node scripts/hound-madenci.js ${k.ad === 'HOUND' ? 'hound' : 'blockhound'} <my wallet address>". It stops if the address has no Agent ID; when a solution is found it prints two baw commands.
4. Run the first command (baw contract-call preview) and check all of these in the preview:
   - the target contract is exactly ${adres}
   - the BNB sent is below 0.002
   - ${k.ad === 'HOUND' ? '10,000 HOUND arrive' : '1 BlockHound NFT arrives'} in the wallet
   - there is no token approval and no other outflow
   If any of these fails, do not send; tell me what you saw.
5. Show me the preview summary and ask for my explicit approval. If I approve, run the execute command with the requestId from the preview.
6. Show the transaction hash and my new ${k.ad} balance.

Rules: Never ask for a private key, seed phrase or password. Never send to an address not written in this prompt.`,
  },
};

const $ = (s) => document.querySelector(s);
const dil = () => (document.documentElement.lang === 'en' ? 'en' : 'tr');
const m = () => METIN[dil()];
const sayi = (v, k = 0) => Number(v).toLocaleString(dil() === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: k });

function kisaSayi(v) {
  if (v >= 1e9) return `${sayi(v / 1e9, 1)} ${dil() === 'en' ? 'B' : 'mr'}`;
  if (v >= 1e6) return `${sayi(v / 1e6, 1)} M`;
  if (v >= 1e3) return `${sayi(v / 1e3, 1)} ${dil() === 'en' ? 'k' : 'b'}`;
  return sayi(v);
}

function sure(s) {
  const t = m();
  if (s < 1) return `< 1 ${t.sn}`;
  if (s < 60) return `${sayi(s)} ${t.sn}`;
  if (s < 3600) return `${sayi(s / 60)} ${t.dk}`;
  if (s < 86400) return `${sayi(s / 3600, 1)} ${t.sa}`;
  if (s < 31_557_600) return `${sayi(s / 86400, 1)} ${t.gun}`;
  if (s < 31_557_600_000) return `${sayi(s / 31_557_600, 1)} ${t.yil}`;
  return `${sayi(s / 31_557_600_000, 1)} ${t.binYil}`;
}

function veriUret(k) {
  return Array.from({ length: DONEM_SAYISI }, (_, e) => {
    const bit = k.bas + e;
    const hash = 2 ** bit;
    return { e, bit, hash, x0: e * k.donem, x1: (e + 1) * k.donem, t1: hash / HIZ.tarayici, t2: hash / HIZ.kart };
  });
}

let secili = 'hound';
const basilan = { hound: null, blockhound: null };

// Logaritmik y ekseni için okunur süre çizgileri
const Y_CIZGI = [[1, { tr: '1 sn', en: '1 s' }], [60, { tr: '1 dk', en: '1 min' }], [3600, { tr: '1 saat', en: '1 h' }], [86400, { tr: '1 gün', en: '1 day' }], [31_557_600, { tr: '1 yıl', en: '1 yr' }], [3_155_760_000, { tr: '100 yıl', en: '100 yr' }]];

function ciz() {
  const kap = $('#zorluk-grafik');
  if (!kap) return;
  const k = KOLEKSIYON[secili];
  const veri = veriUret(k);
  const W = Math.max(300, kap.clientWidth);
  const H = W < 560 ? 280 : 340;
  const P = { s: W < 560 ? 48 : 60, u: 16, sag: 16, alt: 44 };
  const xMax = DONEM_SAYISI * k.donem;
  const yMin = Math.log10(0.05), yMax = Math.log10(3e10);
  const X = (v) => P.s + (v / xMax) * (W - P.s - P.sag);
  const Y = (s) => { const l = Math.min(yMax, Math.max(yMin, Math.log10(s))); return P.u + (1 - (l - yMin) / (yMax - yMin)) * (H - P.u - P.alt); };

  const basamak = (alan) => veri.map((d, i) => `${i ? 'L' : 'M'}${X(d.x0).toFixed(1)},${Y(d[alan]).toFixed(1)}H${X(d.x1).toFixed(1)}`).join('');
  const izgara = Y_CIZGI.map(([s, ad]) => `<line x1="${P.s}" x2="${W - P.sag}" y1="${Y(s)}" y2="${Y(s)}" class="izgara"/><text x="${P.s - 8}" y="${Y(s) + 4}" class="eksen-yazi" text-anchor="end">${ad[dil()]}</text>`).join('');
  const xTik = [0, 0.25, 0.5, 0.75, 1].map((o) => {
    const v = Math.round(o * xMax);
    return `<text x="${X(v)}" y="${H - P.alt + 18}" class="eksen-yazi" text-anchor="${o === 0 ? 'start' : o === 1 ? 'end' : 'middle'}">${kisaSayi(v * k.birim)}</text>`;
  }).join('');
  const simdi = basilan[secili];
  // Mevcut dönem: iki seride de nokta ve etiket, grafiğin üstünde de yazıyla
  const md = veri[Math.min(DONEM_SAYISI - 1, Math.floor((simdi ?? 0) / k.donem))];
  const mx = X(simdi ?? 0);
  const mevcutNokta = `<circle cx="${mx}" cy="${Y(md.t1)}" r="6" class="nokta nokta-1 mevcut"/><circle cx="${mx}" cy="${Y(md.t2)}" r="6" class="nokta nokta-2 mevcut"/>`
    + `<text x="${mx + 10}" y="${Y(md.t1) - 10}" class="eksen-yazi mevcut-yazi">${md.bit} bit</text>`;
  $('#zorluk-simdi').innerHTML = simdi == null && k.adres ? m().mevcutYok : m().mevcut({
    bit: md.bit, e: md.e, hash: kisaSayi(md.hash), t1: sure(md.t1), t2: sure(md.t2), kalan: sayi(k.donem - ((simdi ?? 0) % k.donem)),
  }, k.ad);
  const simdiCizgi = simdi != null
    ? `<line x1="${X(simdi)}" x2="${X(simdi)}" y1="${P.u}" y2="${H - P.alt}" class="simdi"/><text x="${X(simdi) + 6}" y="${P.u + 12}" class="eksen-yazi simdi-yazi">${m().simdi(sayi(simdi))}</text>`
    : '';

  kap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="grafik-baslik">
    <title id="grafik-baslik">${k.ad}: ${dil() === 'en' ? 'average time per mint by minted amount' : 'basılan miktara göre bir mintin ortalama süresi'}</title>
    ${izgara}
    <line x1="${P.s}" x2="${W - P.sag}" y1="${H - P.alt}" y2="${H - P.alt}" class="eksen"/>
    ${xTik}
    <text x="${(P.s + W - P.sag) / 2}" y="${H - 6}" class="eksen-yazi" text-anchor="middle">${m().eksenX(k.ad)}</text>
    ${simdiCizgi}
    <path d="${basamak('t1')}" class="seri seri-1"/>
    <path d="${basamak('t2')}" class="seri seri-2"/>
    ${mevcutNokta}
    <g class="imlec" style="display:none"><line class="imlec-cizgi" y1="${P.u}" y2="${H - P.alt}"/><circle r="5" class="nokta nokta-1"/><circle r="5" class="nokta nokta-2"/></g>
    <rect x="${P.s}" y="${P.u}" width="${W - P.s - P.sag}" height="${H - P.u - P.alt}" class="dokunma"/>
  </svg>`;

  const svg = kap.querySelector('svg');
  const imlec = svg.querySelector('.imlec');
  const ipucu = $('#grafik-ipucu');
  const goster = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const v = ((px - P.s) / (W - P.s - P.sag)) * xMax;
    const d = veri[Math.min(DONEM_SAYISI - 1, Math.max(0, Math.floor(v / k.donem)))];
    const cx = X((d.x0 + d.x1) / 2);
    imlec.style.display = '';
    imlec.querySelector('.imlec-cizgi').setAttribute('x1', cx); imlec.querySelector('.imlec-cizgi').setAttribute('x2', cx);
    const [n1, n2] = imlec.querySelectorAll('circle');
    n1.setAttribute('cx', cx); n1.setAttribute('cy', Y(d.t1)); n2.setAttribute('cx', cx); n2.setAttribute('cy', Y(d.t2));
    ipucu.innerHTML = m().ipucu({ e: d.e, bit: d.bit, aralik: m().aralik(kisaSayi(d.x0 * k.birim), kisaSayi(d.x1 * k.birim), k.ad), t1: sure(d.t1), t2: sure(d.t2) });
    ipucu.hidden = false;
    const sol = (cx / W) * r.width;
    ipucu.style.left = `${Math.min(r.width - ipucu.offsetWidth - 4, Math.max(4, sol + 12))}px`;
    ipucu.style.top = `${Math.max(4, (Math.min(Y(d.t1), Y(d.t2)) / H) * r.height - ipucu.offsetHeight - 10)}px`;
  };
  const gizle = () => { imlec.style.display = 'none'; ipucu.hidden = true; };
  const dokunma = svg.querySelector('.dokunma');
  dokunma.addEventListener('pointermove', goster);
  dokunma.addEventListener('pointerdown', goster);
  dokunma.addEventListener('pointerleave', gizle);

  $('#grafik-not').textContent = m().not;
  tabloYaz(k, veri);
}

function tabloYaz(k, veri) {
  const b = m().tablo;
  const satirlar = veri.filter((d) => d.e % 5 === 0).map((d) => `<tr><td>${d.e}</td><td>${d.bit} bit</td><td>${kisaSayi(d.x0 * k.birim)} ${k.ad}</td><td>${kisaSayi(d.hash)}</td><td>${sure(d.t1)}</td><td>${sure(d.t2)}</td></tr>`).join('');
  $('#zorluk-tablo').innerHTML = `<thead><tr>${b.map((x) => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${satirlar}</tbody>`;
}

let promptTur = 'hound';
function promptYaz() {
  const k = KOLEKSIYON[promptTur];
  $('#prompt-metni').textContent = m().prompt(k, k.adres || '(henüz yayında değil)');
}

async function kopyala(metin, durumEl) {
  try { await navigator.clipboard.writeText(metin); if (durumEl) durumEl.textContent = m().kopyalandi; return true; }
  catch { if (durumEl) durumEl.textContent = m().kopyalanamadi; return false; }
}

// Basılan sayıyı mint.js zaten zincirden okuyor; ikinci kez sorgu atmamak için onun olayını dinler
document.addEventListener('hound:basilan', (e) => {
  if (basilan[e.detail.tur] === e.detail.basilan) return;
  basilan[e.detail.tur] = e.detail.basilan;
  if (e.detail.tur === secili) ciz();
});

for (const b of document.querySelectorAll('[data-grafik]')) {
  b.addEventListener('click', () => {
    secili = b.dataset.grafik;
    for (const x of document.querySelectorAll('[data-grafik]')) x.setAttribute('aria-pressed', String(x === b));
    ciz();
  });
}
for (const b of document.querySelectorAll('[data-prompt]')) {
  b.addEventListener('click', () => {
    promptTur = b.dataset.prompt;
    for (const x of document.querySelectorAll('[data-prompt]')) x.setAttribute('aria-pressed', String(x === b));
    promptYaz();
  });
}
$('#prompt-kopyala').addEventListener('click', () => kopyala($('#prompt-metni').textContent, $('#prompt-durum')));
for (const b of document.querySelectorAll('[data-kopyala]')) {
  b.addEventListener('click', async () => {
    const eski = b.textContent;
    if (await kopyala(b.dataset.kopyala)) { b.textContent = m().kopyalandi; setTimeout(() => { b.textContent = eski; }, 1500); }
  });
}
for (const b of document.querySelectorAll('[data-dil]')) b.addEventListener('click', () => { ciz(); promptYaz(); });

let olcek;
addEventListener('resize', () => { clearTimeout(olcek); olcek = setTimeout(ciz, 150); });
promptYaz();
ciz();
