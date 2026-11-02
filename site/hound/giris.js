// Giriş bölümü: kendi kendine yazılan istem kutusu, görününce beliren bloklar ve açık / koyu tema düğmesi.
// Dil, mint.js'in <html lang> değerinden okunur; dil değişince sıradaki istem o dilde yazılır.
const ISTEMLER = {
  zh: ['为 biar.ai 找一个 HOUND 哈希，并给出 baw 命令。', '扫描最新区块里新部署的 NFT 合约。', '用我的钱包模拟这个 mint：要花多少？', '这个合约有风险吗？检查授权和所有者。'],
  en: ['Find a HOUND hash for biar.ai and give me the baw commands.', 'Scan the latest block for newly deployed NFT contracts.', 'Simulate this mint with my wallet. What does it cost?', 'Is this contract risky? Check approvals and the owner.'],
};
const dil = () => (document.documentElement.lang === 'en' ? 'en' : 'zh');
const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// İstem kutusu: 38 ms'de bir harf yazar, 2,6 sn bekler, ikişer harf siler, sonrakine geçer
async function istemDongusu() {
  const yazi = document.getElementById('istem-yazi');
  const sonraki = document.getElementById('istem-sonraki');
  if (!yazi) return;
  for (let i = 0; ; i = (i + 1) % 4) {
    const l = ISTEMLER[dil()];
    const metin = l[i];
    sonraki.textContent = l[(i + 1) % 4];
    if (azHareket) { yazi.textContent = metin; await bekle(4000); continue; }
    for (let n = 1; n <= metin.length; n++) { yazi.textContent = metin.slice(0, n); await bekle(38); }
    await bekle(2600);
    for (let n = metin.length; n > 0; n -= 2) { yazi.textContent = metin.slice(0, n); await bekle(14); }
    yazi.textContent = '';
    await bekle(250);
  }
}
istemDongusu();

// Bloklar bölümleri görününce sırayla belirir
// Gizleme yalnızca bu betik çalışınca devreye girer: betik yüklenmezse içerik görünür kalır
document.documentElement.classList.add('rv-hazir');
const gozcu = new IntersectionObserver((kayitlar) => {
  for (const k of kayitlar) if (k.isIntersecting) {
    k.target.querySelectorAll('.rv').forEach((e, i) => { e.style.transitionDelay = `${Math.min(i, 4) * 0.1}s`; e.classList.add('gorundu'); });
    gozcu.unobserve(k.target);
  }
}, { threshold: 0.15 });
for (const b of document.querySelectorAll('main > section')) if (b.querySelector('.rv')) gozcu.observe(b);

// Tema: kayıtlı seçim yoksa sistem ayarı geçerli. Düğme, o an görünen temanın tersine geçer
const dugme = document.getElementById('tema-dugme');
const sistemKoyu = matchMedia('(prefers-color-scheme: dark)');
const gecerli = () => document.documentElement.dataset.tema || (sistemKoyu.matches ? 'koyu' : 'acik');
function etiketle() {
  const koyu = gecerli() === 'koyu';
  const ad = dil() === 'en' ? (koyu ? 'Switch to light theme' : 'Switch to dark theme') : (koyu ? '切换到浅色主题' : '切换到深色主题');
  dugme.setAttribute('aria-label', ad);
  dugme.title = ad;
}
dugme?.addEventListener('click', () => {
  const yeni = gecerli() === 'koyu' ? 'acik' : 'koyu';
  document.documentElement.dataset.tema = yeni;
  try { localStorage.setItem('tema', yeni); } catch { /* yalnızca bu oturum */ }
  etiketle();
});
if (dugme) {
  etiketle();
  sistemKoyu.addEventListener('change', etiketle);
  for (const b of document.querySelectorAll('[data-dil]')) b.addEventListener('click', () => setTimeout(etiketle));
}

// Sağ ray: görünür alanın ortasındaki bölümün adı rayda o bölümün sırasına göre kayar
const RAY = [
  ['giris', 'INTRO', '开场'], ['mint-giris', 'AGENT', '代理'], ['mint', 'MINT', 'MINT'], ['nasil', 'RULES', '规则'], ['zorluk', 'CURVE', '难度'],
  ['kayit', 'LOG', '记录'], ['kontratlar', 'CONTRACTS', '合约'], ['prompt', 'PROMPT', '提示词'], ['arac', 'TERMINAL', '终端'], ['sss', 'FAQ', '问答'],
];
const rayEtiket = document.getElementById('ray-etiket');
const rayAd = document.getElementById('ray-ad');
let raySira = 0;
function rayYaz() {
  const [, en, zh] = RAY[raySira];
  rayAd.textContent = dil() === 'en' ? en : zh;
  rayEtiket.style.top = `${(raySira / (RAY.length - 1)) * (270 - rayEtiket.offsetHeight)}px`;
}
if (rayEtiket) {
  // Ekranın ortasının üstünden geçmiş son bölüm seçilir: hızlı kaydırmada ya da bağlantıyla atlamada da doğru kalır
  const bolumler = RAY.map(([id]) => document.getElementById(id));
  let bekliyor = false;
  const hesapla = () => {
    bekliyor = false;
    let yeni = 0;
    bolumler.forEach((b, i) => { if (b && b.getBoundingClientRect().top <= innerHeight / 2) yeni = i; });
    if (yeni !== raySira) { raySira = yeni; rayYaz(); }
  };
  addEventListener('scroll', () => { if (!bekliyor) { bekliyor = true; requestAnimationFrame(hesapla); } }, { passive: true });
  hesapla();
  for (const b of document.querySelectorAll('[data-dil]')) b.addEventListener('click', () => setTimeout(rayYaz));
  rayYaz();
}
