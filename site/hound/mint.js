// HOUND / BlockHound mint sayfası. Zinciri herkese açık RPC'den okur, hash'i Web Worker'larda arar.
// Hash'i herkes arayabilir ama mintleyen Agent ID sahibi cüzdandır: arama o cüzdanın adresiyle yapılır ve sayfa,
// ajan cüzdanından çalıştırılacak baw komutlarını verir. Sayfa hiçbir cüzdana bağlanmaz, hiçbir şey imzalatmaz.
import { AG } from './adresler.js';
import { hashle, keccakMetin } from './madenci.js';
import { nftSvg } from './gorsel.js';

const EN = {
  atla: 'Skip to content', m_ana: 'Home', m_nasil: 'How it works', m_bot: 'For bots', m_kod: 'Contract code',
  m_zorluk: 'Difficulty', m_prompt: 'Agent prompt', m_kontrat: 'Contracts',
  z_baslik: 'How difficulty rises',
  z_alt: 'Every epoch the difficulty rises one bit and the average hashes needed per mint double. The chart shows how long one mint takes on the same hardware as more are minted. The vertical axis is logarithmic: each line is a multiple of the one below.',
  z_seri1: 'Browser (about 3 MH/s)', z_seri2: 'GPU (about 1 GH/s)', z_tablo: 'Show as a table',
  p_baslik: 'Let your agent mint',
  p_alt: 'If you have an AI agent with access to Binance Agentic Wallet (baw), give it the prompt below. It finds the hash, checks the preview and asks for your approval before sending.',
  p_kopyala: 'Copy prompt',
  kt_baslik: 'Contracts',
  kt_alt: 'Both contracts are live on BNB Smart Chain and their source code is verified on BscScan. They have no owner: the values below were fixed at deployment and nobody can change them.',
  kt_rozet: 'Verified', kt_bscscan: 'Code on BscScan', kt_kopyala: 'Copy address',
  kt_tur: 'Type', kt_odul: 'Per mint', kt_ucret: 'Fee', kt_donem: 'Harder', kt_donem_h: '+1 bit every 1,000 mints', kt_donem_n: '+1 bit every 250 mints',
  kt_basla: 'Starting difficulty', kt_basla_d: '20 bits (about 1 million hashes)', kt_kasa: 'Treasury receiving fees',
  kt_kayit: 'Agent ID registry (Binance)', kt_fiyat: 'Price source (Chainlink BNB/USD)',
  u_ust: 'Proof-of-work mint', u_baslik: 'Find the hash, mint the hound.',
  u_alt: 'Nobody pre-minted HOUND or BlockHound. Anyone can search for the hash, but only wallets with a Binance Agent ID can mint. Supply is unlimited and difficulty doubles every epoch: after a while minting becomes practically impossible.',
  a_etiket: 'Which agent are we searching for? Agent ID name or agent wallet address', a_bul: 'Find agent',
  h_baslik: '10,000 HOUND', h_alt: 'ERC-20 · fixed reward per solution · one bit harder every 1,000 mints',
  n_baslik: '1 BlockHound NFT', n_alt: 'ERC-721 · on-chain art derived from your hash · one bit harder every 250 mints',
  o_ucret: 'Fee', o_zorluk: 'Difficulty', o_basilan: 'Minted', o_kalan: 'Until harder',
  d_kaz: 'Find hash', d_dur: 'Stop', d_kopyala: 'Copy commands',
  k_aciklama: 'Run these two commands in order on the computer where the agent wallet is connected. The first previews and returns a requestId, the second sends with that id.',
  i_etiket: 'CPU cores',
  na_baslik: 'How it works',
  na1_b: 'Pick the agent, find a hash', na1_m: 'You type the Agent ID name and the wallet address is read from the on-chain registry. Your browser hashes the contract\'s puzzle for the epoch, that address and a random number with keccak256. The first hash with enough leading zero bits is a solution.',
  na2_b: 'Yours only', na2_m: 'Anyone can search: you, your GPU or a friend. But the agent\'s address is part of the hash, so the solution only works for that Agent ID wallet and cannot be copied from the mempool.',
  na3_b: 'Mint', na3_m: 'Once a solution is found the page gives you two baw commands to send it from your agent wallet (Developer Mode must be on in the Binance app). The contract checks the sender against the Agent ID registry. The fee is fixed in dollars and any excess is refunded.',
  na4_b: 'Twice as hard each epoch', na4_m: 'Difficulty rises one bit every 1,000 HOUND mints and every 250 BlockHound mints. With the same computing power, the time per mint doubles every epoch.',
  na_uyari: 'HOUND and BlockHound are not investment products. There is no promise of profit, yield or price; they may be worth nothing. The contracts have no owner and fees go to the project treasury to support Blockhound development. The code has not been audited.',
  b_baslik: 'Bots and your own miner',
  b_alt: 'If you run an auto-mint system with an Agent ID it can mint HOUND too: the only rule is finding the solution. GPU, bot or command line, the rules are the same for everyone.',
  b_not: 'The command-line miner in the repository finds a solution and prints the baw commands to send; it never touches a key:',
  f_m: 'An independent, open-source (MIT) project with no affiliation to Binance, OKX or any other organization. Nothing here is investment advice.',
};
const M = {
  zh: {
    yayinYok: '合约尚未上线。目前你可以用测试挖矿查看电脑的算力；找到的哈希不会发送到任何地方。',
    yayinVar: (a) => `网络：${a}。请在 BscScan 上核对合约地址；如果 baw 预览显示的是其他地址，请不要发送。`,
    ajanBulundu: (ad, a) => `${ad} → ${a}。已找到 Agent ID，将为该地址计算。`,
    ajanAdres: (a) => `将为 ${a} 计算。已找到 Agent ID。`,
    ajanYok: '没有找到以此名称注册的 Agent ID。', ajanKayitsiz: '该地址没有 Agent ID：即使找到哈希，mint 也会被拒绝。',
    ajanGecersiz: '请输入 Agent ID 名称（例如 biar.ai）或以 0x 开头的地址。', ajanBekle: '正在读取注册表…',
    ajanOnce: '请先在上方选择一个代理。',
    tahmin: (d, s) => `平均需要 ${d} 次尝试 · 按当前速度约 ${s}`, tahminHizsiz: (d) => `平均需要 ${d} 次尝试`,
    araniyor: (d) => `计算中… ${d} 次尝试`, bulundu: (d, s) => `找到解：约 ${d} 次尝试，用时 ${s}。请用下方命令从代理钱包发送。`,
    demoBulundu: (d, s) => `找到测试解：约 ${d} 次尝试，用时 ${s}。合约上线后这里会显示发送命令。`,
    gecersiz: '期间周期已变化或该解已被使用；正在重新计算。', kopyalandi: '已复制。',
    hata: (m) => `错误：${m}`,
    sn: (n) => n < 1 ? '不到 1 秒' : n < 90 ? `${Math.round(n)} 秒` : n < 5400 ? `${Math.round(n / 60)} 分钟` : n < 172800 ? `${Math.round(n / 3600)} 小时` : `${Math.round(n / 86400)} 天`,
    bit: (b) => `${b} 位`, mint: (n) => `${n} 次 mint`,
  },
  en: {
    yayinYok: 'The contracts are not live yet. For now you can try test mining to see your computer\'s speed; the hash found is not sent anywhere.',
    yayinVar: (a) => `Network: ${a}. Verify the contract addresses on BscScan; do not send if the baw preview shows a different address.`,
    ajanBulundu: (ad, a) => `${ad} → ${a}. Agent ID found, searching for this address.`,
    ajanAdres: (a) => `Searching for ${a}. Agent ID found.`,
    ajanYok: 'No Agent ID is registered under this name.', ajanKayitsiz: 'This address has no Agent ID: a mint would be rejected even with a valid hash.',
    ajanGecersiz: 'Type an Agent ID name (such as biar.ai) or an address starting with 0x.', ajanBekle: 'Reading the registry…',
    ajanOnce: 'Pick an agent above first.',
    tahmin: (d, s) => `About ${d} tries on average · roughly ${s} at this speed`, tahminHizsiz: (d) => `About ${d} tries on average`,
    araniyor: (d) => `Searching… ${d} tries`, bulundu: (d, s) => `Solution found in about ${d} tries, ${s}. Send it from the agent wallet with the commands below.`,
    demoBulundu: (d, s) => `Test solution found in about ${d} tries, ${s}. Once the contracts are live, the send commands appear here.`,
    gecersiz: 'The epoch changed or the solution was used meanwhile; searching again.', kopyalandi: 'Copied.',
    hata: (m) => `Error: ${m}`,
    sn: (n) => n < 1 ? 'under a second' : n < 1.5 ? 'about a second' : n < 90 ? `${Math.round(n)} seconds` : n < 5400 ? `${Math.round(n / 60)} minutes` : n < 172800 ? `${Math.round(n / 3600)} hours` : `${Math.round(n / 86400)} days`,
    bit: (b) => `${b} bits`, mint: (n) => `${n} mints`,
  },
};

const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const depo = { oku: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, yaz: (k, v) => { try { localStorage.setItem(k, v); } catch { /* önemli değil */ } } };
// Sayfanın kendi metni Çincedir; İngilizce EN sözlüğünden gelir
const ZH = {};
for (const e of $$('[data-i18n]')) ZH[e.dataset.i18n] = e.textContent;
let dil = depo.oku('dil') === 'en' ? 'en' : 'zh';
const t = () => M[dil];
const sayi = (v) => Number(v).toLocaleString(dil === 'en' ? 'en-US' : 'zh-CN');

// Seçiciler (cast sig ile hesaplandı). Kayıt kontratı: her Agent ID bir NFT, kimlik = keccak256(ad)
const SEC = { challenge: '0xd2ef7398', difficultyBits: '0x249379ad', mintFee: '0x13966db5', minted: '0x4f02c420', epochSize: '0x572d356e', mint: '0xa0712d68', check: '0x96fb7217' };
const KAYIT = { adres: AG.agentKayit, ownerOf: '0x6352211e', balanceOf: '0x70a08231' };
const u256 = (v) => BigInt(v).toString(16).padStart(64, '0');
const adres32 = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const DEMO_BIT = 20;
const DEMO_CHALLENGE = '0x' + 'b10c'.repeat(16);
const SIFIR = '0x0000000000000000000000000000000000000000';

const KART = {
  hound: { adres: AG.hound, ucretUsd: 0.5, kok: $('[data-tur=hound]') },
  blockhound: { adres: AG.blockhound, ucretUsd: 0.1, kok: $('[data-tur=blockhound]') },
};
const yayinda = Boolean(AG.hound || AG.blockhound);
let ajan = null; // { adres, ad }
let hiz = 0; // toplam hash / saniye, son ölçüm (iş bitince de korunur)

// Herkese açık RPC'ler sık isteğe 429 döner: çağrılar tek toplu (batch) istekte gider, olmazsa yedek RPC denenir
const RPCLER = [AG.rpc, ...(AG.yedekRpc || [])];
async function topluCagri(cagrilar) {
  const govde = JSON.stringify(cagrilar.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params })));
  let son;
  for (const url of RPCLER) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: govde });
      if (!r.ok) throw new Error(`RPC ${r.status}`);
      const j = await r.json();
      const sirali = (Array.isArray(j) ? j : [j]).sort((a, b) => a.id - b.id);
      if (sirali.length !== cagrilar.length) throw new Error('RPC: incomplete response');
      return sirali.map((x) => { if (x.error) throw new Error(x.error.message || 'RPC'); return x.result; });
    } catch (e) { son = e; }
  }
  throw son;
}
const oku = async (to, data) => (await topluCagri([['eth_call', [{ to, data }, 'latest']]]))[0];
const okuHepsi = (to, secler) => topluCagri(secler.map((d) => ['eth_call', [{ to, data: d }, 'latest']]));

// Agent ID adı ya da adresi: ad ise kayıttan cüzdanı bulur, her durumda kaydın varlığını doğrular
async function ajanCoz(girdi) {
  const g = girdi.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(g)) {
    const n = BigInt(await oku(KAYIT.adres, KAYIT.balanceOf + adres32(g)));
    return { adres: g, kayitli: n > 0n };
  }
  const ad = g.replace(/\.ai$/, '');
  if (!/^[a-z0-9_-]{1,64}$/.test(ad)) throw new Error('gecersiz');
  try {
    const r = await oku(KAYIT.adres, KAYIT.ownerOf + keccakMetin(ad).slice(2));
    const adres = '0x' + r.slice(-40);
    return adres === SIFIR ? null : { adres, ad: `${ad}.ai`, kayitli: true };
  } catch { return null; } // kayıtsız kimlikte ownerOf geri çevirir
}

const rastgeleSeed = () => '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');

for (const [tur, k] of Object.entries(KART)) {
  k.tur = tur;
  k.alan = (ad) => $(`[data-alan="${ad}"]`, k.kok);
  k.dugme = (ad) => $(`[data-is="${ad}"]`, k.kok);
  k.isciler = [];
  k.durumYaz = (m) => { k.alan('durum').textContent = m; };
  k.dugme('kaz').addEventListener('click', () => kazmayaBasla(k));
  k.dugme('dur').addEventListener('click', () => durdur(k));
  k.dugme('kopyala').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(k.alan('komut-metni').textContent); k.durumYaz(t().kopyalandi); } catch { /* elle seçilebilir */ }
  });
}

async function guncelle(k) {
  if (!k.adres) {
    k.bits = DEMO_BIT; k.challenge = DEMO_CHALLENGE;
    k.alan('zorluk').textContent = t().bit(DEMO_BIT);
    tahminYaz(k);
    return;
  }
  try {
    const [ch, bits, fee, basilan, donem] = await okuHepsi(k.adres, ['challenge', 'difficultyBits', 'mintFee', 'minted', 'epochSize'].map((f) => SEC[f]));
    k.challenge = ch; k.bits = Number(BigInt(bits)); k.ucretWei = BigInt(fee); k.basilan = Number(BigInt(basilan)); k.donem = Number(BigInt(donem));
    k.alan('ucret').textContent = `${k.ucretUsd.toFixed(2)} $ · ${(Number(k.ucretWei) / 1e18).toFixed(5)} BNB`;
    k.alan('zorluk').textContent = t().bit(k.bits);
    k.alan('basilan').textContent = sayi(k.basilan);
    k.alan('kalan').textContent = t().mint(sayi(k.donem - (k.basilan % k.donem)));
    k.alan('donem-cubuk').style.transform = `scaleX(${(k.basilan % k.donem) / k.donem})`;
    document.dispatchEvent(new CustomEvent('hound:basilan', { detail: { tur: k.tur, basilan: k.basilan } }));
    tahminYaz(k);
  } catch (e) { k.durumYaz(t().hata(e.message)); }
}

function tahminYaz(k) {
  if (k.bits == null) return;
  const d = 2 ** k.bits;
  const ds = d >= 1e6 ? `${sayi((d / 1e6).toFixed(d >= 1e8 ? 0 : 1))} M` : sayi(d);
  k.alan('tahmin').textContent = hiz > 0 ? t().tahmin(ds, t().sn(d / hiz)) : t().tahminHizsiz(ds);
}

const hizlar = new Map();
function hizYaz() {
  const simdi = performance.now();
  for (const [isci, v] of hizlar) if (simdi - v.zaman > 3000) hizlar.delete(isci);
  const anlik = [...hizlar.values()].reduce((a, v) => a + v.hiz, 0);
  if (anlik > 0) hiz = anlik; // durunca son ölçüm tahminlerde kullanılmaya devam eder
  $('#hiz').textContent = hiz > 0 ? `${sayi(Math.round(hiz / 1000))} kH/s` : '—';
  for (const k of Object.values(KART)) tahminYaz(k);
}

function durdur(k) {
  for (const w of k.isciler) w.terminate();
  k.isciler = [];
  k.dugme('kaz').hidden = false; k.dugme('dur').hidden = true;
}

// Ajan cüzdanından çalıştırılacak komutlar: önizleme bir requestId verir, gönderim o kimlikle yapılır
function komutYaz(k, nonce) {
  const deger = (k.ucretWei * 105n) / 100n; // fiyat oynarsa düşmesin diye %5 pay; fazlası kontratta iade edilir
  const veri = SEC.mint + u256(nonce);
  k.alan('komut-metni').textContent =
    `baw contract-call preview --binanceChainId ${AG.zincirId} --from ${ajan.adres} --to ${k.adres} --value ${deger} --inputData ${veri}\n`
    + `baw contract-call execute --requestId ${dil === 'en' ? '<requestId from the preview>' : '<预览中的 requestId>'}`;
  k.alan('komut').hidden = false;
}

async function kazmayaBasla(k) {
  if (k.adres && !ajan) { k.durumYaz(t().ajanOnce); $('#ajan').focus(); return; }
  durdur(k);
  k.alan('komut').hidden = true;
  if (k.adres) await guncelle(k);
  const madenci = ajan?.adres || SIFIR;
  const n = Number($('#isci-sayi').value);
  let toplam = 0;
  const bas = performance.now();
  k.dugme('kaz').hidden = true; k.dugme('dur').hidden = false;
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./isci.js', import.meta.url), { type: 'module' });
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.tur === 'ilerleme') {
        toplam += m.deneme;
        hizlar.set(w, { hiz: m.deneme / (m.sure / 1000), zaman: performance.now() });
        k.durumYaz(t().araniyor(sayi(toplam)));
      } else if (m.tur === 'bulundu') {
        // Diğer işçilerin yarım kalan parçaları da yaklaşık bu kadar denedi
        toplam += m.deneme * n;
        const gecen = (performance.now() - bas) / 1000;
        durdur(k);
        if (!hizlar.size && gecen > 0) hiz = toplam / gecen;
        hizYaz();
        const sure = t().sn(gecen);
        if (k.tur === 'blockhound') k.alan('onizleme').innerHTML = nftSvg(hashle(k.challenge, madenci, m.nonce), '#?');
        if (!k.adres) { k.durumYaz(t().demoBulundu(sayi(toplam), sure)); return; }
        try {
          const r = await oku(k.adres, SEC.check + adres32(madenci) + u256(m.nonce));
          if (BigInt('0x' + r.slice(66, 130)) !== 1n) { k.durumYaz(t().gecersiz); kazmayaBasla(k); return; }
          await guncelle(k);
          komutYaz(k, m.nonce);
          k.durumYaz(t().bulundu(sayi(toplam), sure));
        } catch (err) { k.durumYaz(t().hata(err.message)); }
      } else if (m.tur === 'tukendi') {
        w.terminate();
      }
    };
    w.postMessage({ tur: 'basla', challenge: k.challenge, adres: madenci, bits: k.bits });
    k.isciler.push(w);
  }
  hizYaz();
}

$('#ajan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const durum = $('#ajan-durum');
  durum.textContent = t().ajanBekle;
  for (const k of Object.values(KART)) { durdur(k); k.alan('komut').hidden = true; }
  try {
    const r = await ajanCoz($('#ajan').value);
    if (!r) { ajan = null; durum.textContent = t().ajanYok; return; }
    if (!r.kayitli) { ajan = null; durum.textContent = t().ajanKayitsiz; return; }
    ajan = r;
    const kisa = `${r.adres.slice(0, 6)}…${r.adres.slice(-4)}`;
    durum.textContent = r.ad ? t().ajanBulundu(r.ad, kisa) : t().ajanAdres(kisa);
    depo.yaz('ajan', $('#ajan').value.trim());
  } catch (err) {
    ajan = null;
    durum.textContent = err.message === 'gecersiz' ? t().ajanGecersiz : t().hata(err.message);
  }
});

function dilUygula(d) {
  dil = d === 'en' ? 'en' : 'zh';
  document.documentElement.lang = dil === 'en' ? 'en' : 'zh-CN';
  for (const e of $$('[data-i18n]')) e.textContent = (dil === 'en' ? EN : ZH)[e.dataset.i18n] ?? e.textContent;
  for (const b of $$('[data-dil]')) b.setAttribute('aria-pressed', String(b.dataset.dil === dil));
  depo.yaz('dil', dil);
  $('#durum-yayin').textContent = yayinda ? t().yayinVar(AG.ad) : t().yayinYok;
}
for (const b of $$('[data-dil]')) b.addEventListener('click', () => dilUygula(b.dataset.dil));

const cekirdek = Math.max(1, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));
$('#isci-sayi').max = String(Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4)));
$('#isci-sayi').value = String(cekirdek);
$('#isci-deger').textContent = String(cekirdek);
$('#isci-sayi').addEventListener('input', (e) => { $('#isci-deger').textContent = e.target.value; });

const kayitliAjan = depo.oku('ajan');
if (kayitliAjan) $('#ajan').value = kayitliAjan;
KART.blockhound.alan('onizleme').innerHTML = nftSvg(rastgeleSeed(), '#?');
dilUygula(dil);
for (const k of Object.values(KART)) guncelle(k);
for (const b of $$('[data-dil]')) b.addEventListener('click', () => { for (const k of Object.values(KART)) if (k.bits != null) { k.alan('zorluk').textContent = t().bit(k.bits); if (k.basilan != null) { k.alan('basilan').textContent = sayi(k.basilan); k.alan('kalan').textContent = t().mint(sayi(k.donem - (k.basilan % k.donem))); } tahminYaz(k); } });
setInterval(hizYaz, 1000);
if (yayinda) setInterval(() => { for (const k of Object.values(KART)) if (!k.isciler.length) guncelle(k); }, 30_000);
