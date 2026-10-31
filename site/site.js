// Blockhound tanıtım sitesi: TR / EN dil seçimi ve yayınlanmış rakamlar (istatistik.json). Cüzdana bağlanmaz.
const EN = {
  atla: 'Skip to content', m_nasil: 'How it works', m_tur: 'Terminal',
  tu_ust: 'Terminal tour', tu_baslik: 'A look inside', tu_alt: 'These screenshots come from the real terminal with live chain data. The terminal works in English and Turkish. The wallet balance and address are blurred; no personal portfolio is shown.',
  tu_mintler: 'Mints', tu_siper: 'Launches', tu_liderler: 'Leaders', tu_ayarlar: 'Settings', m_guvenlik: 'Safety', m_rakamlar: 'Numbers', m_kur: 'Install', m_sss: 'FAQ',
  h_ust: 'BNB Chain · open-source mint agent',
  h_baslik: 'Sniffs out new mints from the first block.',
  h_alt: 'Blockhound scans every new contract on chain, simulates its mint functions with your wallet, filters out the risky ones and mints the free ones by your rules. When a token you hold gets a market, it tells you in the first minute.',
  h_cta1: 'Source on GitHub', h_cta2: 'Run it yourself',
  k_baslik: 'Run it on your own computer',
  k_alt: 'Blockhound is open source (MIT). Download it, run it with your own wallet, build on it. Your wallet and keys stay on your computer.',
  k1: 'Install Node.js 20+ and the Binance Agentic Wallet CLI', k2: 'Clone the repository', k3: 'Install dependencies and create the settings file', k4: 'Start it and open 127.0.0.1:8787 in your browser',
  k_not: 'Default mode is simulation: nothing is sent. Keep limits low before going live. Details in the README.',
  k_cta: 'Setup guide', k_cta2: 'Report a bug or suggest',
  n_baslik: 'How it works',
  n1_b: 'Sniff', n1_m: 'Catches every contract deployed in each new block, including those created inside factory contracts. Recognizes contracts behind proxies and mints gated by Agent ID.',
  n2_b: 'Simulate', n2_m: 'Tries the mint functions with your wallet address without sending a transaction. Free or paid, sold out or open, eligible or not: all read straight from the chain.',
  n3_b: 'Filter', n3_m: 'Transaction, token and site security scans, impersonated brand names and, as the last gate, a wallet preview: anything that asks for approvals, delivers nothing or is a trap gets dropped.',
  n4_b: 'Mint and alert', n4_m: 'Sends free mints that pass your rules automatically within a daily cap and asks you about pricier ones. When a token you hold gets a pool, you get a notification.',
  g_baslik: 'Safety first',
  g1_b: 'On your own computer', g1_m: 'Blockhound runs on your computer. Keys and the wallet session never leave it. This site never connects to a wallet, the HOUND mint page included.',
  g2_b: 'Hard limits', g2_m: 'Per-trade and daily BNB caps, a daily auto-mint limit and a one-click emergency stop. Raising a limit takes a separate confirmation.',
  g3_b: 'No approvals, no surprises', g3_m: 'A transaction showing a token approval, an authority change or an unexpected outflow is never sent. A call that brings nothing into the wallet is stopped too.',
  g4_b: 'Free filter', g4_m: 'Decisions come from chain data and free security scans, with no paid AI needed. AI research can be switched on separately if you want it.',
  r_baslik: 'Numbers', r_yok: 'Numbers have not been published yet.',
  r1: 'Contracts tracked (14 days)', r2: 'Mints sent', r3: 'Auto mints', r4: 'Dropped as risky', r5: 'Average gas per mint',
  t_ust: 'Proof-of-work mint', t_baslik: 'HOUND and BlockHound',
  t_m1: 'HOUND is the community token and BlockHound the NFT collection. Not a single one is pre-minted: anyone can search for the hash, but only wallets with a Binance Agent ID can mint. Supply is unlimited, but difficulty doubles every epoch, so after a while minting becomes practically impossible. 10,000 HOUND cost 0.50 dollars and one BlockHound 0.10 dollars; fees go to the treasury to support the project.',
  t_uyari: 'HOUND is not an investment product. There is no promise of profit, yield, dividends or price; it may be worth nothing. Only support with what you can afford to lose.',
  t_cta: 'Mint page', t_cta2: 'Difficulty chart', t_cta3: 'Agent prompt',
  s_baslik: 'FAQ',
  s1_s: 'Does Blockhound access my wallet?', s1_c: 'The introduction pages never connect to a wallet. The mint page does not connect to a wallet either: it searches for the hash in your browser and you send from your own agent wallet with baw. The Blockhound app runs on the computer it is installed on, with its owner\'s own wallet session and the limits they set.',
  s2_s: 'Which chain does it run on?', s2_c: 'BNB Chain (BSC). It recognizes both NFT mints and token mints distributed through a mint contract.',
  s3_s: 'Is everything it mints worth money?', s3_c: 'No. Most free mints are worth nothing. For token mints the pool is usually created when the mint completes, and some never get one. Blockhound makes it easier to catch an opportunity; it does not guarantee a gain.',
  s4_s: 'Is HOUND an investment?', s4_c: 'No. HOUND and BlockHound are for supporting the project; they carry no promise of yield or price and may be worth nothing.',
  s5_s: 'Can I run it myself?', s5_c: 'Yes. Blockhound is MIT-licensed open source: download it from GitHub, run it on your own computer with your own wallet, read the code and build on it.',
  s6_s: 'Can I contribute?', s6_c: 'Of course. Start by opening an issue on GitHub; report security problems privately instead of in a public issue.',
  f_m: 'An independent, open-source (MIT) project with no affiliation to Binance, OKX or any other organization. Nothing here is investment advice.',
};

const el = (s) => document.querySelectorAll(s);
const TR = {};
for (const e of el('[data-i18n]')) TR[e.dataset.i18n] = e.textContent;
const depo = { oku: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, yaz: (k, v) => { try { localStorage.setItem(k, v); } catch { /* yoksa önemli değil */ } } };
let dil = depo.oku('dil') || ((navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

function dilUygula(d) {
  dil = d === 'en' ? 'en' : 'tr';
  document.documentElement.lang = dil;
  for (const e of el('[data-i18n]')) e.textContent = (dil === 'en' ? EN : TR)[e.dataset.i18n] ?? e.textContent;
  for (const b of el('[data-dil]')) b.setAttribute('aria-pressed', String(b.dataset.dil === dil));
  depo.yaz('dil', dil);
  rakamTarihi();
}
for (const b of el('[data-dil]')) b.addEventListener('click', () => dilUygula(b.dataset.dil));

// Yayınlanmış rakamlar: tarih ile gösterilir, "canlı" denmez
let rakamlar = null;
function rakamTarihi() {
  if (!rakamlar) return;
  const t = new Date(rakamlar.guncelleme).toLocaleDateString(dil === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('rakam-tarih').textContent = dil === 'en' ? `Snapshot from ${t}, since ${new Date(rakamlar.baslangic).toLocaleDateString('en-GB')}.` : `${t} tarihli özet, ${new Date(rakamlar.baslangic).toLocaleDateString('tr-TR')} tarihinden beri.`;
}
fetch('istatistik.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (!d) return;
  rakamlar = d;
  const say = (v) => Number(v).toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR');
  const alanlar = { takip: say(d.takip), gonderilen: say(d.gonderilen), otomatik: say(d.otomatik), elenen: say(d.elenen), gas: d.ortalamaGasBnb != null ? `${Number(d.ortalamaGasBnb).toFixed(6)} BNB` : '–' };
  for (const [k, v] of Object.entries(alanlar)) document.querySelector(`[data-alan="${k}"]`).textContent = v;
  document.getElementById('rakamlar-liste').hidden = false;
  rakamTarihi();
}).catch(() => {});

dilUygula(dil);

// Terminal turu: sekmeler görseli ve açıklamayı değiştirir. Ok tuşlarıyla sekmeler arasında gezilir
const TUR = {
  mintler: {
    tr: ['Mintler', 'Her yeni bloktaki kontratlar taranır, mint fonksiyonları cüzdanınla simüle edilir. Hazır, riskli, geçmiyor ve tükendi diye ayrılır; NFT ve token mintleri ayrı sekmelerdedir. Agent ID şartlı olanlar rozetle işaretlenir.', 'Blockhound Mintler ekranı: yeni mint kontratları, durum rozetleri ve Mint et düğmeleri'],
    en: ['Mints', 'Contracts in every new block are scanned and their mint functions simulated with your wallet. They are sorted into ready, risky, failing and closed; NFT and token mints have separate tabs. Agent ID gated ones carry a badge.', 'Blockhound Mints screen: new mint contracts, status badges and Mint buttons'],
  },
  hound: {
    tr: ['HOUND', 'Kendi token ve NFT koleksiyonumuzun canlı takibi: arz, sahipler, madenciler, gelir, mevcut zorluk ve dönem ilerlemesi. Hepsi zincirdeki Transfer ve Mined olaylarından hesaplanır.', 'Blockhound HOUND ekranı: HOUND ve BlockHound için arz, sahipler, madenciler ve zorluk'],
    en: ['HOUND', 'Live tracking of our own token and NFT collection: supply, holders, miners, revenue, current difficulty and epoch progress, all computed from on-chain Transfer and Mined events.', 'Blockhound HOUND screen: supply, holders, miners and difficulty for HOUND and BlockHound'],
  },
  siper: {
    tr: ['Siper', 'Four.meme\'deki Agent ID lansmanları üç sütunda: yeni, dolmak üzere ve DEX\'e geçenler. Sahip sayısı, ilk 10 payı ve geliştirici satışlarıyla süzülebilir.', 'Blockhound Siper ekranı: yeni, dolmak üzere ve DEX\'e geçmiş lansman kartları'],
    en: ['Launches', 'Agent ID launches on Four.meme in three columns: new, nearly full and graduated to DEX. Filter by holders, top 10 share and developer sells.', 'Blockhound launches screen: new, nearly full and graduated launch cards'],
  },
  liderler: {
    tr: ['Liderler', 'BSC\'de en çok kazanan, en isabetli ve en çok işlem yapan cüzdanlar; en çok kazandıran tokenleriyle birlikte. Sadece bilgi içindir.', 'Blockhound Liderler ekranı: kazanç, getiri ve isabete göre cüzdan sıralaması'],
    en: ['Leaders', 'The top BSC wallets by profit, accuracy and activity, with the tokens that earned them the most. For information only.', 'Blockhound Leaders screen: wallets ranked by profit, return and accuracy'],
  },
  ayarlar: {
    tr: ['Ayarlar', 'İşlem başı ve günlük BNB tavanları, otomatik mint sınırı, yapay zekâ modelleri ve RPC adresleri arayüzden yönetilir. Limitler sunucuda zorunludur.', 'Blockhound Ayarlar ekranı: limitler, ajan ayarları ve sistem ayarları'],
    en: ['Settings', 'Per-trade and daily BNB caps, the auto-mint limit, AI models and RPC endpoints are all managed from the UI. Limits are enforced on the server.', 'Blockhound Settings screen: limits, agent settings and system settings'],
  },
};
let turSecili = 'mintler';
function turGoster(ad, odakla = false) {
  turSecili = ad;
  const [baslik, metin, alt] = TUR[ad][dil === 'en' ? 'en' : 'tr'];
  const img = document.getElementById('tur-gorsel');
  if (!img) return;
  img.src = `img/${dil === 'en' ? 'en/' : ''}${ad}.jpg`; img.alt = alt;
  img.height = ad === 'hound' ? 1100 : ad === 'mintler' ? 1000 : 900;
  document.getElementById('tur-baslik').textContent = baslik;
  document.getElementById('tur-metin').textContent = metin;
  for (const b of el('[data-tur]')) {
    const secili = b.dataset.tur === ad;
    b.setAttribute('aria-selected', String(secili));
    b.tabIndex = secili ? 0 : -1;
    if (secili) { document.getElementById('tur-panel').setAttribute('aria-labelledby', b.id); if (odakla) b.focus(); }
  }
}
for (const b of el('[data-tur]')) {
  b.addEventListener('click', () => turGoster(b.dataset.tur));
  b.addEventListener('keydown', (e) => {
    const sira = Object.keys(TUR);
    const i = sira.indexOf(b.dataset.tur);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      turGoster(sira[(i + (e.key === 'ArrowRight' ? 1 : sira.length - 1)) % sira.length], true);
    }
  });
}
for (const b of el('[data-dil]')) b.addEventListener('click', () => turGoster(turSecili));
turGoster('mintler');
