import { YEREL } from './dil.js';

const TOKEN = document.querySelector('meta[name="api-token"]').content;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kisalt = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const usd = (v) => (v == null || Number.isNaN(v) ? '?' : v > 0 && v < 0.01 ? `$${v}` : `$${Number(v).toFixed(2)}`);
const sayiYaz = (v, b = 6) => (v == null ? '?' : Number(v).toLocaleString(YEREL, { maximumFractionDigits: b }));
const depoOku = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const depoYaz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* depolama yoksa önemli değil */ } };

// Kararlı yeniden çizim: içerik değişmediyse dokunma; değiştiyse kullanıcının baktığı satırı aynı yükseklikte tut.
// Bakılan satır: son 15 saniyede tıklanan satır (hâlâ ekrandaysa), yoksa ekranın ortasındaki satır. Böylece 3-5 saniyelik
// yenilemeler ya da başka satırların büyüyüp küçülmesi baktığın yeri kaydırmaz
let sonDokunus = null;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('[data-capa]');
  sonDokunus = el ? { capa: el.dataset.capa, zaman: Date.now() } : null;
}, true);
const ekranda = (el) => { const r = el?.getBoundingClientRect(); return r && r.bottom > 0 && r.top < window.innerHeight; };
function capaBul() {
  if (sonDokunus && Date.now() - sonDokunus.zaman < 15_000) {
    const el = document.querySelector(`[data-capa="${CSS.escape(sonDokunus.capa)}"]`);
    if (ekranda(el)) return { sec: `[data-capa="${CSS.escape(sonDokunus.capa)}"]`, ust: el.getBoundingClientRect().top };
  }
  const icerik = document.querySelector('main.icerik');
  const x = (icerik?.getBoundingClientRect().left ?? 0) + 48;
  const el = document.elementFromPoint(x, window.innerHeight / 2)?.closest('[data-capa],[id]');
  if (!el || el === document.body) return null;
  return { sec: el.dataset.capa ? `[data-capa="${CSS.escape(el.dataset.capa)}"]` : `#${CSS.escape(el.id)}`, ust: el.getBoundingClientRect().top };
}
function sabitCiz(el, html) {
  if (!el || el.__html === html) return false;
  const capa = capaBul();
  el.innerHTML = html;
  el.__html = html;
  if (capa) {
    const yeni = document.querySelector(capa.sec);
    if (yeni) window.scrollBy(0, yeni.getBoundingClientRect().top - capa.ust);
  }
  return true;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-token': TOKEN }, body: JSON.stringify(govde),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `HTTP ${r.status}`);
  return j;
}

// ---------- Görünümler (yan menü) ----------
function gorunumAc(ad) {
  for (const s of document.querySelectorAll('section.gorunum')) s.hidden = s.dataset.gorunum !== ad;
  for (const b of document.querySelectorAll('.yan button')) b.classList.toggle('aktif', b.dataset.gorunum === ad);
  depoYaz('gorunum', ad);
  if (ad === 'portfoy') { portfoyYenile(); piyasaYenile(); }
  if (ad === 'basim') basimYenile();
  if (ad === 'mintler') mintlerYenile();
  if (ad === 'liderler') liderlerYenile();
  if (ad === 'hound') houndYenile();
  if (ad === 'ayarlar') { bildirimYenile(); uygYenile(); }
}
// Üst menüde açıklamalar ipucu olarak: dar çubukta yer kaplamaz
for (const b of document.querySelectorAll('.yan button')) b.title = b.querySelector('small')?.textContent || '';
document.querySelector('.yan').addEventListener('click', (e) => { const b = e.target.closest('[data-gorunum]'); if (b) gorunumAc(b.dataset.gorunum); });
document.addEventListener('click', (e) => { const g = e.target.closest('[data-git]'); if (g) gorunumAc(g.dataset.git); });

// ---------- Durum ve cüzdan ----------
let canliIslem = false;

function durumCiz(d) {
  canliIslem = d.canliIslem;
  const m = $('mod');
  m.textContent = d.canliIslem ? 'Canlı işlem' : d.mod === 'live' ? 'Canlı veri' : 'Simülasyon';
  m.classList.toggle('canli', d.canliIslem);
  const l = d.limitler;
  $('limit').textContent = `İşlem başı ${l.islemBasiMax} BNB · bugün ${l.bugunHarcanan.toFixed(4)} / ${l.gunlukMax} BNB`;
  $('emir-btn').textContent = d.canliIslem ? '2 · Gerçek emri hazırla' : '2 · Simüle et';

  const c = d.cuzdan;
  $('giris').hidden = c.bagli;
  oturumUyarisi(c);
  // bağlı değilse üstteki düğme QR penceresini, bağlıysa Cüzdan ekranını açar
  $('ust-cuzdan').toggleAttribute('data-baglan', !c.bagli);
  if (c.bagli) $('ust-cuzdan').dataset.git = 'cuzdan'; else delete $('ust-cuzdan').dataset.git;
  if (!c.bagli) {
    $('ust-cuzdan').textContent = 'Cüzdanı bağla';
    $('cuzdan').innerHTML = `<p class="soluk">Durum: ${esc(c.durum)}${c.hata ? ` · ${esc(c.hata)}` : ''}</p>`;
    return;
  }
  $('ust-cuzdan').innerHTML = `${esc(c.agentId || 'Agent ID yok')} · ${esc(c.bnb.toFixed(4))} BNB <span class="mono">${esc(kisalt(c.adres))}</span>`;
  const dev = c.devMode ? (c.devMode.acik ? `Açık · bitiş ${esc(new Date(c.devMode.bitis).toLocaleString(YEREL))}` : '<span class="hata">Kapalı</span>') : '?';
  const tokenler = c.tokenler.length
    ? `<div class="tablo-kap"><table><thead><tr><th>Token</th><th>Miktar</th><th>Değer</th></tr></thead><tbody>${c.tokenler.map((t) =>
      `<tr><td>${esc(t.symbol)}<div class="adres">${esc(t.address)}</div></td><td>${esc(sayiYaz(t.balance))}</td><td>${esc(usd(Number(t.value)))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="soluk">Başka token yok</p>';
  $('cuzdan').innerHTML = `
    <dl class="bilgi">
      <dt>Adres</dt><dd class="adres">${esc(c.adres)}</dd>
      <dt>Agent ID</dt><dd>${c.agentId ? esc(c.agentId) : '<span class="hata">Yok</span>'}</dd>
      <dt>BNB</dt><dd>${esc(c.bnb.toFixed(6))} (${esc(usd(c.bnbUsd))})</dd>
      <dt>Developer Mode</dt><dd>${dev}</dd>
      <dt>Oturum bitişi</dt><dd>${c.oturumBitis ? esc(new Date(c.oturumBitis).toLocaleString(YEREL)) : '?'}</dd>
    </dl>
    <h2>Tokenler</h2>${tokenler}`;
}

async function durumYenile() {
  try { durumCiz(await api('/api/durum')); } catch (e) { $('cuzdan').innerHTML = `<p class="hata">${esc(e.message)}</p>`; }
}

// ---------- QR ile giriş ----------
let girisZamanlayici = null, girisSayac = null;

function girisCiz(g) {
  const ust = $('giris-qr-ust');
  if (g.qr) $('giris-qr').src = g.qr;
  $('eslesme').textContent = g.pairingCode || '······';
  if (g.url) $('giris-link').href = g.url;
  clearInterval(girisSayac);
  if (g.durum === 'bekliyor') {
    ust.hidden = true;
    $('giris-durum').textContent = 'Binance App\'te onay bekleniyor…';
    const say = () => {
      const kalan = Math.max(0, Math.round((g.bitis - Date.now()) / 1000));
      $('giris-sayac').textContent = `${Math.floor(kalan / 60)}:${String(kalan % 60).padStart(2, '0')}`;
      if (!kalan) { clearInterval(girisSayac); ust.hidden = false; ust.textContent = 'Kodun süresi doldu. "Yeni kod" ile tekrar dene.'; }
    };
    say(); girisSayac = setInterval(say, 1000);
  } else if (g.durum === 'basarili') {
    ust.hidden = false; ust.textContent = 'Bağlandı ✓';
    $('giris-durum').textContent = 'Cüzdan bağlandı.';
    $('giris-sayac').textContent = '–';
    setTimeout(() => { $('giris-modal').hidden = true; }, 1200);
  } else if (g.durum === 'hata') {
    ust.hidden = false; ust.textContent = `${g.hata || 'Giriş başarısız'}. "Yeni kod" ile tekrar dene.`;
    $('giris-durum').innerHTML = `<span class="hata">${esc(g.hata || 'Giriş başarısız')}</span>`;
    $('giris-sayac').textContent = '–';
  }
}

async function girisTakip() {
  clearTimeout(girisZamanlayici);
  const g = await api('/api/giris/durum').catch(() => null);
  if (g) girisCiz(g);
  if (!g || g.durum === 'bekliyor') { girisZamanlayici = setTimeout(girisTakip, 2000); return; }
  if (g.durum === 'basarili') durumYenile();
}

async function girisBaslat() {
  $('giris-modal').hidden = false;
  $('giris-yeni').disabled = true;
  $('giris-qr').removeAttribute('src');
  $('giris-qr-ust').hidden = false; $('giris-qr-ust').textContent = 'Kod alınıyor…';
  $('giris-durum').textContent = 'Kod hazırlanıyor…';
  try {
    const g = await api('/api/giris/baslat', {});
    if (g.durum === 'zaten-bagli') { girisCiz({ durum: 'basarili' }); durumYenile(); return; }
    girisCiz(g);
    girisTakip();
  } catch (e) {
    $('giris-qr-ust').textContent = 'Kod alınamadı';
    $('giris-durum').innerHTML = `<span class="hata">${esc(e.message)}</span>`;
  } finally { $('giris-yeni').disabled = false; }
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-baglan]')) girisBaslat(); });
$('giris-yeni').onclick = girisBaslat;
$('giris-kapat').onclick = () => {
  $('giris-modal').hidden = true;
  clearTimeout(girisZamanlayici); clearInterval(girisSayac);
  api('/api/giris/iptal', {}).catch(() => {});
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('giris-modal').hidden) $('giris-kapat').click(); });
// Gönderim sürerken (onay düğmesi kilitliyken) pencere kapanmaz: sonucu görmeden kaybolmasın
function mintModalKapat() {
  const b = $('mint-taslak').querySelector('[data-mint-onay]');
  if (b?.disabled && !b.closest('[hidden]')) return;
  $('mint-modal').hidden = true;
  $('mint-taslak').innerHTML = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('mint-modal').hidden) mintModalKapat(); });

// Oturum uyarısı: bağlı değilse ya da oturum 12 saatten az kaldıysa üstte şerit göster
function oturumUyarisi(c) {
  let metin = null;
  if (!c.bagli) metin = 'Binance cüzdanı bağlı değil. İşlem yapmak için QR ile bağlan.';
  else if (c.oturumBitis) {
    const saat = (new Date(c.oturumBitis) - Date.now()) / 3_600_000;
    if (saat < 12) metin = `Cüzdan oturumu ${saat < 1 ? `${Math.max(0, Math.round(saat * 60))} dakika` : `${Math.round(saat)} saat`} içinde bitiyor. Bittiğinde QR ile yeniden bağlanman gerekecek.`;
  }
  $('oturum-uyari').hidden = !metin;
  if (metin) $('oturum-uyari-metin').textContent = metin;
}

// ---------- İşlem fişi ----------
const form = $('emir-form');
let seciliToken = null;   // Siper'den seçilen tokenin bilgisi
const formVeri = () => {
  const f = new FormData(form);
  return { yon: f.get('yon'), token: f.get('token').trim(), miktar: f.get('miktar').trim(), kayma: f.get('kayma').trim() ? Number(f.get('kayma')) : undefined };
};

function fisSifirla() {
  $('emir-btn').disabled = true;
  $('emir-onay').hidden = true;
  $('teklif').innerHTML = '';
  $('miktar-etiket').textContent = formVeri().yon === 'al' ? 'Miktar (BNB)' : 'Miktar (token adedi)';
}
form.addEventListener('input', fisSifirla);

function seciliCiz() {
  const adres = form.elements.token.value.trim();
  if (seciliToken && seciliToken.adres.toLowerCase() === adres.toLowerCase()) {
    const t = seciliToken;
    $('secili').classList.remove('soluk');
    $('secili').innerHTML = `<strong>${esc(t.sembol)}</strong>${esc(t.ad)}<div class="adres">${esc(t.adres)}</div>
      <div class="metrik"><div><small>MC</small><b>$${esc(kisaSayi(t.piyasaDegeri))}</b></div><div><small>Holder</small><b>${esc(t.holder ?? '?')}</b></div><div><small>Yaş</small><b>${esc(yas(t.olusturma))}</b></div></div>`;
  } else {
    $('secili').classList.add('soluk');
    $('secili').textContent = adres ? 'Elle girilen adres' : 'Siper\'den bir token seç ya da adres yapıştır.';
  }
}
form.elements.token.addEventListener('input', seciliCiz);

function fisDoldur({ adres, yon = 'al', miktar = '', token = null }) {
  seciliToken = token;
  form.elements.token.value = adres;
  form.querySelector(`input[name=yon][value=${yon}]`).checked = true;
  form.elements.miktar.value = miktar;
  fisSifirla();
  seciliCiz();
  siperCiz();   // seçili kart vurgusu
  if (window.matchMedia('(max-width: 1180px)').matches) $('fis').scrollIntoView({ behavior: 'smooth' });
  (miktar ? $('teklif-btn') : form.elements.miktar).focus();
}

$('teklif-btn').onclick = async () => {
  if (!form.reportValidity()) return;
  $('teklif').innerHTML = '<span class="soluk">Teklif alınıyor…</span>';
  $('emir-onay').hidden = true;
  try {
    const t = await api('/api/teklif', formVeri());
    const rota = t.rota === 'contract-call' ? 'Bonding curve' : 'DEX';
    const notlar = [
      t.tavanUyarisi ? '<span class="hata">Cüzdan başı %1 tavanına takıldı, artan BNB iade edilir.</span>' : '',
      t.onayGerekli ? 'Önce tam satış miktarı kadar Four Core\'a onay gönderilir, sonra satış.' : '',
      t.rota === 'contract-call' && formVeri().yon === 'al' ? 'Curve aşamasında sadece Agent ID sahipleri satabilir.' : '',
    ].filter(Boolean).map((n) => `<div class="not">${n}</div>`).join('');
    $('teklif').innerHTML = `<dl>
      <dt>Rota</dt><dd>${esc(rota)}</dd>
      <dt>Verilen</dt><dd>${esc(sayiYaz(t.fromCoinAmount))} ${esc(t.fromCoinSymbol)}</dd>
      <dt>Tahmini</dt><dd>${esc(sayiYaz(t.toCoinAmount))} ${esc(t.toCoinSymbol)}</dd>
      ${t.enAz ? `<dt>En az</dt><dd>${esc(sayiYaz(t.enAz))}</dd>` : ''}
      <dt>Kayma</dt><dd>%${esc(+(Number(t.slippage) * 100).toFixed(2))}</dd></dl>${notlar}`;
    $('emir-btn').disabled = false;
  } catch (e) { $('teklif').innerHTML = `<span class="hata">${esc(e.message)}</span>`; }
};

async function emirGonder() {
  const v = formVeri();
  $('emir-btn').disabled = true;
  $('emir-onay').hidden = true;
  $('emir-sonuc').innerHTML = '<span class="soluk">Gönderiliyor…</span>';
  try {
    const e = await api('/api/emir', { ...v, onay: true });
    $('emir-sonuc').innerHTML = `Durum: <b>${esc(DURUM[e.durum] || e.durum)}</b>${e.sebep ? `<div class="soluk">${esc(e.sebep)}</div>` : ''}
      ${e.txHash ? `<div><a href="https://bscscan.com/tx/${esc(e.txHash)}" target="_blank" rel="noopener">BscScan'de gör</a></div>` : ''}
      <div><a href="#" data-git="emirler">Tüm emirler →</a></div>`;
  } catch (err) { $('emir-sonuc').innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
  emirlerYenile(); durumYenile();
}

// Gerçek emirde tarayıcı confirm() yerine sayfa içi onay: bazı tarayıcı panellerinde confirm() hiç görünmüyor
form.onsubmit = (ev) => {
  ev.preventDefault();
  const v = formVeri();
  if (!canliIslem) return emirGonder();
  $('emir-onay-metin').innerHTML = `<b>GERÇEK işlem:</b> ${v.yon === 'al' ? `${esc(v.miktar)} BNB ile al` : `${esc(v.miktar)} adet sat`}<div class="adres">${esc(v.token)}</div>`;
  $('emir-onay').hidden = false;
  $('emir-onay-evet').focus();
};
$('emir-onay-evet').onclick = emirGonder;
$('emir-onay-hayir').onclick = () => { $('emir-onay').hidden = true; };

// ---------- Emirler ----------
const DURUM = {
  teklif: 'Teklif alınıyor', simulasyon: 'Simülasyon', reddedildi: 'Reddedildi', gonderiliyor: 'Gönderiliyor',
  'onay-bekliyor': 'Zincir bekleniyor', tamamlandi: 'Tamamlandı', gonderildi: 'Zincire gönderildi', basarisiz: 'Başarısız', bekliyor: 'Sonuç bekleniyor',
};

async function emirlerYenile() {
  const list = await api('/api/emirler').catch(() => null);
  if (!list) return;
  sabitCiz($('emirler'), list.length ? list.map((e) => {
    const sinif = e.durum === 'tamamlandi' ? 'iyi' : ['basarisiz', 'reddedildi'].includes(e.durum) ? 'kotu' : '';
    const ayrinti = e.txHash ? `<a href="https://bscscan.com/tx/${esc(e.txHash)}" target="_blank" rel="noopener">${esc(kisalt(e.txHash))}</a>`
      : e.teklif ? `≈ ${esc(sayiYaz(e.teklif.toCoinAmount))} ${esc(e.teklif.toCoinSymbol)}` : '';
    return `<tr><td>${esc(new Date(e.zaman).toLocaleTimeString(YEREL))}</td><td>${{ al: 'Al', sat: 'Sat', onay: 'Onay' }[e.yon] || esc(e.yon)}${e.kaynak && e.kaynak !== 'manuel' ? `<div class="soluk">${esc(e.kaynak)}</div>` : ''}</td>
      <td class="adres">${esc(e.token)}</td><td>${esc(e.miktar)}</td>
      <td><span class="durum ${sinif}">${esc(DURUM[e.durum] || e.durum)}</span></td><td>${ayrinti}${e.sebep ? `<div class="soluk">${esc(e.sebep)}</div>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="soluk">Henüz emir yok</td></tr>');
}

// ---------- Siper ----------
const filtreAlanlari = ['f-ara', 'f-holder', 'f-top10', 'f-mc', 'f-devsatti', 'f-ses'];
const kayitliFiltre = depoOku('siper-filtre', {});
for (const id of filtreAlanlari) if (id in kayitliFiltre) $(id)[$(id).type === 'checkbox' ? 'checked' : 'value'] = kayitliFiltre[id];
for (const id of filtreAlanlari) $(id).addEventListener('input', () => {
  depoYaz('siper-filtre', Object.fromEntries(filtreAlanlari.map((i) => [i, $(i).type === 'checkbox' ? $(i).checked : $(i).value])));
  siperCiz();
});

const sayiVeyaNull = (id) => ($(id).value.trim() === '' ? null : Number($(id).value));
function filtrele(t) {
  const q = $('f-ara').value.trim().toLowerCase();
  if (q && !`${t.sembol} ${t.ad} ${t.adres}`.toLowerCase().includes(q)) return false;
  const h = sayiVeyaNull('f-holder'), top = sayiVeyaNull('f-top10'), mc = sayiVeyaNull('f-mc');
  if (h != null && !(t.holder >= h)) return false;
  if (top != null && !(t.top10 != null && t.top10 <= top)) return false;
  if (mc != null && !(t.piyasaDegeri >= mc)) return false;
  if ($('f-devsatti').checked && t.devSatti != null && t.devSatti > 50) return false;
  return true;
}

const kisaSayi = (v) => (v == null ? '?' : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(v < 10 ? 2 : 0));
const yas = (ms) => {
  if (!ms) return '?';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 60 ? `${Math.floor(s)} sn` : s < 3600 ? `${Math.floor(s / 60)} dk` : s < 86400 ? `${Math.floor(s / 3600)} sa` : `${Math.floor(s / 86400)} gün`;
};
const yuzde = (v) => (v == null ? '?' : `%${Number(v).toFixed(v < 10 ? 1 : 0)}`);

function kartHtml(t) {
  const taze = t.olusturma && Date.now() - t.olusturma < 60_000;
  const secildi = form.elements.token.value.trim().toLowerCase() === t.adres.toLowerCase();
  const sosyal = [['web', 'Web'], ['x', 'X'], ['telegram', 'Telegram']].filter(([k]) => t.sosyal[k])
    .map(([k, ad]) => `<a href="${esc(t.sosyal[k])}" target="_blank" rel="noopener noreferrer">${ad}</a>`).join('');
  return `<div class="tkart${taze ? ' taze' : ''}${secildi ? ' secildi' : ''}" data-sec="${esc(t.adres)}" title="İşlem fişine al">
    <div class="tkart-ust">
      ${t.ikon ? `<img src="${esc(t.ikon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="bos"></div>'}
      <div class="tkart-ad"><strong>${esc(t.sembol)}</strong><span>${esc(t.ad)}</span></div>
      <span class="tkart-yas">${esc(yas(t.olusturma))}</span>
    </div>
    <div class="metrik">
      <div><small>MC</small><b>$${esc(kisaSayi(t.piyasaDegeri))}</b></div>
      <div><small>Holder</small><b>${esc(t.holder ?? '?')}</b></div>
      <div><small>Al / Sat</small><b>${esc(t.alim ?? '?')} / ${esc(t.satim ?? '?')}</b></div>
      <div><small>Top10</small><b>${esc(yuzde(t.top10))}</b></div>
      <div><small>Dev sattı</small><b>${esc(yuzde(t.devSatti))}</b></div>
      <div><small>Curve</small><b>${t.ilerleme == null ? '?' : `%${esc(Number(t.ilerleme).toFixed(1))}`}</b></div>
    </div>
    ${t.ilerleme != null ? `<div class="bar"><i data-w="${Math.min(100, Math.max(0, t.ilerleme))}"></i></div>` : ''}
    <div class="tkart-alt"><span class="adres">${esc(kisalt(t.adres))}</span>
      <a href="https://bscscan.com/token/${esc(t.adres)}" target="_blank" rel="noopener">BscScan</a>
      <a href="https://four.meme/token/${esc(t.adres)}" target="_blank" rel="noopener">four.meme</a>${sosyal}</div>
  </div>`;
}

let siperVeri = null, gorulen = null;
const sonHtml = {};
const tumTokenler = () => (siperVeri ? [...siperVeri.yeni, ...siperVeri.bitmekUzere, ...siperVeri.dex] : []);
function siperCiz() {
  if (!siperVeri) return;
  for (const k of ['yeni', 'bitmekUzere', 'dex']) {
    const hepsi = siperVeri[k] || [];
    const list = hepsi.filter(filtrele);
    $(`say-${k}`).textContent = `${list.length}/${hepsi.length}`;
    // sadece değişince yeniden çiz: her turda DOM'u değiştirmek tıklamaları ve hover'ı bozuyor
    const html = list.length ? list.map(kartHtml).join('') : '<p class="soluk">Token yok</p>';
    if (sonHtml[k] !== html) { $(`s-${k}`).innerHTML = html; sonHtml[k] = html; }
  }
  // CSP satır içi style'a izin vermiyor: genişliği CSSOM ile ver
  for (const el of $('siper-kart').querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
}

let sesBaglam = null;
function bip() {
  try {
    sesBaglam ||= new AudioContext();
    const o = sesBaglam.createOscillator(), g = sesBaglam.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g).connect(sesBaglam.destination); o.start(); o.stop(sesBaglam.currentTime + 0.15);
  } catch { /* ses desteklenmiyorsa sessiz geç */ }
}

async function siperYenile() {
  const d = await api('/api/siper').catch((e) => ({ hata: e.message }));
  if (d.hata) { $('siper-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  const yeniler = (d.yeni || []).map((t) => t.adres);
  if (gorulen && $('f-ses').checked && yeniler.some((a) => !gorulen.has(a) && filtrele(d.yeni.find((t) => t.adres === a)))) bip();
  gorulen = new Set([...(gorulen || []), ...yeniler]);
  siperVeri = d;
  const s = d.durum;
  $('siper-durum').innerHTML = s.sonHata ? `<span class="hata">Tarama hatası: ${esc(s.sonHata)}</span>`
    : s.sonBasari ? `güncellendi ${esc(new Date(s.sonBasari).toLocaleTimeString(YEREL))}` : 'taranıyor…';
  siperCiz();
}

$('siper-kart').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;   // linkler kartı seçmesin
  const a = e.target.closest('[data-sec]')?.dataset.sec;
  if (!a) return;
  fisDoldur({ adres: a, yon: 'al', token: tumTokenler().find((t) => t.adres === a) || null });
});

// ---------- Portföy: kâr / zarar ----------
const bnbYaz = (v) => (v == null ? '' : `${Number(v).toFixed(6)} BNB`);
const isaretli = (v, ek = '') => (v == null || Number.isNaN(v) ? '<span class="soluk">?</span>'
  : `<span class="${v > 0.004 ? 'kazanc' : v < -0.004 ? 'kayip' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${esc(usd(Math.abs(v)))}${ek}</span>`);
const yuzdeYaz = (v) => (v == null ? '' : ` <span class="${v > 0 ? 'kazanc' : v < 0 ? 'kayip' : 'soluk'}">(${v > 0 ? '+' : ''}${v.toFixed(1)}%)</span>`);
const fiyatYaz = (v) => (v == null ? '?' : v >= 1 ? `$${v.toFixed(2)}` : `$${Number(v.toPrecision(3))}`);
const KAYNAK = { mint: 'Mint', alim: 'Alım', bedava: 'Bedava geldi', takas: 'Takas' };
const tarihKisa = (z) => (z ? new Date(z).toLocaleString(YEREL, { dateStyle: 'short', timeStyle: 'short' }) : '');
const renk = (ad) => getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
let pnlSon = null;

function pnlKart(etiket, deger, alt, ana = false) {
  return `<div class="pnl-kart${ana ? ' ana' : ''}"><small>${esc(etiket)}</small><b>${deger}</b><span>${alt}</span></div>`;
}

function pnlCiz(d) {
  pnlSon = d;
  const o = d.ozet;
  $('pnl-durum').textContent = `${d.defter.islem} işlem · ${tarihKisa(d.guncelleme)}`;
  $('pnl-uyari').innerHTML = d.uyarilar.map((u) => `<div class="pnl-uyari">${esc(u)}</div>`).join('');
  $('pnl-kartlar').innerHTML = [
    pnlKart('Net kâr / zarar', isaretli(o.netUsd), `Yatırılan net ${esc(usd(o.netYatirilanUsd))}${yuzdeYaz(o.netYuzde)}`, true),
    pnlKart('Bugünkü değer', esc(usd(o.toplamDegerUsd)), `BNB ${esc(usd(o.bnbDegerUsd))} · tokenler ${esc(usd(o.tokenDegerUsd))}`),
    pnlKart('Gerçekleşmemiş', isaretli(o.gerceklesmemisUsd), 'Eldeki fiyatlı tokenler'),
    pnlKart('Gerçekleşen', isaretli(o.gerceklesenUsd), 'Satışlardan'),
    pnlKart('Gas ve harcama', isaretli(-(o.gasUsd + o.harcamaUsd)), `Gas ${esc(o.gasBnb.toFixed(5))} BNB${o.gelirUsd > 0 ? ` · gelir ${esc(usd(o.gelirUsd))}` : ''}`),
    pnlKart('BNB fiyat etkisi', isaretli(o.bnbFiyatEtkisiUsd), `BNB şu an ${esc(fiyatYaz(o.bnbSimdi))}`),
    d.yapayZeka ? pnlKart('Yapay zekâ gideri', isaretli(-d.yapayZeka.toplamUsd), `Bugün ${esc(usd(d.yapayZeka.bugunUsd))} · net, dahil ${isaretli(o.netUsd - d.yapayZeka.toplamUsd)}`) : '',
  ].join('');
  const f = $('pnl-fiyatsiz');
  f.hidden = !(o.fiyatsizMaliyetUsd > 0.005);
  f.innerHTML = `Fiyatı bilinmeyen varlıklara (NFT'ler, havuzu olmayan tokenler) <b>${esc(usd(o.fiyatsizMaliyetUsd))}</b> harcandı ve bunlar değere 0 olarak girdi. Maliyetleriyle sayılırsa net kâr / zarar: ${isaretli(o.netMaliyetleUsd)}.`;

  $('pnl-kategoriler').innerHTML = Object.values(d.kategoriler).map((k) =>
    `<tr><td>${esc(k.ad)}</td><td>${esc(k.varlik)}</td><td>${esc(k.islem)}</td><td>${esc(usd(k.maliyetUsd))}</td><td>${esc(usd(k.degerUsd))}</td><td>${k.fiyatsiz ? esc(k.fiyatsiz) : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="soluk">İşlem yok</td></tr>';

  // Otomatik mintlenenler Agent bölümünde: Normal tablolarda gösterilmez
  const agentSet = new Set(d.agentKontratlari || []);
  const agentde = d.varliklar.filter((v) => agentSet.has(v.kontrat) && v.miktar > 0).length;
  $('normal-not').hidden = !agentde;
  $('normal-not').textContent = `Kartlar ve grafik cüzdanın tamamını gösterir. Otomatik mintlenen ${agentde} varlık tablolarda değil, Agent bölümünde.`;
  agentCiz(d.agent);
  const tokenler = d.varliklar.filter((v) => v.tur === 'token' && !agentSet.has(v.kontrat) && (v.miktar > 0 || v.gerceklesenUsd !== 0));
  $('portfoy').innerHTML = tokenler.length ? tokenler.map((v) => {
    const ikon = v.ikon ? `<img src="${esc(v.ikon)}" alt="" loading="lazy">` : '';
    const capraz = v.binanceOrtalama != null ? `<div class="soluk">Binance ort. ${esc(fiyatYaz(v.binanceOrtalama))}</div>` : '';
    const sat = v.miktar > 0 ? `<button type="button" class="dugme ana" data-sat-ac="${esc(v.kontrat)}">Sat</button>` : '';
    return `<tr>
      <td><div class="token-hucre">${ikon}<div>${esc(v.sembol || '?')} <span class="soluk">${esc(KAYNAK[v.anaTur] || '')}</span><div class="adres">${esc(v.kontrat)}</div></div></div></td>
      <td>${esc(sayiYaz(v.miktar, 2))}</td>
      <td>${v.ortalamaUsd != null ? esc(fiyatYaz(v.ortalamaUsd)) : v.maliyetUsd === 0 && v.miktar > 0 ? '<span class="soluk">bedava</span>' : '?'}${capraz}</td>
      <td>${esc(fiyatYaz(v.fiyat))}${v.degisim24s != null ? yuzdeYaz(v.degisim24s) : ''}${v.dusukLikidite ? '<div class="hata">düşük likidite</div>' : ''}</td>
      <td>${v.degerUsd != null ? esc(usd(v.degerUsd)) : '<span class="soluk">fiyat yok</span>'}<div class="soluk">maliyet ${esc(usd(v.maliyetUsd))}</div></td>
      <td>${isaretli(v.gerceklesmemisUsd)}</td>
      <td>${v.satisUsd > 0 ? isaretli(v.gerceklesenUsd) : '<span class="soluk">–</span>'}</td>
      <td>${isaretli(v.degerUsd != null || v.miktar === 0 ? v.toplamUsd : null)}${yuzdeYaz(v.yuzde)}</td>
      <td class="satir-dugmeler"><button type="button" class="dugme" data-grafik="${esc(v.kontrat)}">Grafik</button>${sat}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="soluk">Token yok</td></tr>';

  const nftler = d.varliklar.filter((v) => v.tur === 'nft' && v.miktar > 0 && !agentSet.has(v.kontrat));
  const nftMaliyet = nftler.reduce((a, v) => a + v.maliyetUsd, 0);
  $('nft-ozet').textContent = `${nftler.length} koleksiyon, ${nftler.reduce((a, v) => a + v.miktar, 0)} NFT · toplam maliyet ${usd(nftMaliyet)}`;
  $('nft').innerHTML = nftler.length ? nftler.map((v) => {
    const kisaId = (t) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : t);
    const idler = v.tokenIdler.slice(-5).map((t) => `<a href="https://bscscan.com/nft/${esc(v.kontrat)}/${esc(t)}" target="_blank" rel="noopener noreferrer" title="${esc(t)}">#${esc(kisaId(t))}</a>`).join(', ');
    const kaynak = Object.entries(v.kaynak).map(([k, n]) => `${esc(KAYNAK[k] || k)}${n > 1 ? ` ×${esc(n)}` : ''}`).join(', ');
    return `<tr><td>${esc(v.ad || v.sembol || '?')}<div class="adres">${esc(v.kontrat)}</div></td><td>${esc(v.miktar)}${v.dogrulanmadi ? ' <span class="soluk">(doğrulanmadı)</span>' : ''}</td>
      <td>${v.maliyetUsd > 0 ? esc(usd(v.maliyetUsd)) : '<span class="soluk">bedava</span>'}</td><td>${kaynak}</td><td>${idler}${v.tokenIdler.length > 5 ? ' …' : ''}</td><td class="soluk">${esc(tarihKisa(v.son))}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="soluk">NFT yok</td></tr>';
}

function agentCiz(a) {
  if (!a) return;
  const o = a.ozet;
  $('agent-sayi').textContent = o.adet ? `(${o.adet})` : '';
  $('agent-kartlar').innerHTML = [
    pnlKart('Net kâr / zarar', isaretli(o.netYzDahilUsd ?? o.netUsd), o.yapayZekaUsd != null ? `Değer eksi BNB, gas ve yapay zekâ · zincirde ${isaretli(o.netUsd)}` : 'Bugünkü değer eksi ödenen BNB ve gas', true),
    o.yapayZekaUsd != null ? pnlKart('Yapay zekâ', isaretli(-o.yapayZekaUsd), 'OpenRouter toplam harcama') : '',
    pnlKart('Otomatik mint', esc(o.adet), (() => {
      const g = a.satirlar.flatMap((s) => s.gelen);
      const nft = g.filter((x) => x.tur === 'nft').length, token = g.filter((x) => x.tur === 'token').length;
      return `${esc(nft)} NFT · ${esc(token)} token${o.fiyatsiz ? ` · ${esc(o.fiyatsiz)} fiyatsız` : ''}`;
    })()),
    pnlKart('Ödenen', `${esc(o.harcananBnb.toFixed(4))} BNB`, `Gas ${esc(o.gasBnb.toFixed(5))} BNB · toplam ${esc(usd(o.maliyetUsd))}`),
    pnlKart('Bugünkü değer', esc(usd(o.degerUsd)), 'Fiyatı olan varlıklar'),
  ].join('');
  $('agent-mintler').innerHTML = a.satirlar.length ? a.satirlar.map((s) => `<tr>
    <td class="soluk">${esc(tarihKisa(s.zaman))}</td>
    <td>${esc(s.ad || '?')}<div class="adres">${esc(s.adres)}</div></td>
    <td>${s.gelen.map((g) => `<div>${g.tur ? `<span class="mint-rozet ${g.tur === 'token' ? 'agent' : 'izle'}">${g.tur === 'token' ? 'Token' : 'NFT'}</span> ` : ''}${esc(g.sembol || kisalt(g.kontrat))}${g.miktar != null ? ` <span class="soluk">${esc(sayiYaz(g.miktar, 2))}</span>` : ''}</div>`).join('') || '<span class="soluk">hiçbir şey gelmedi</span>'}</td>
    <td>${s.bnb > 0 ? `${esc(s.bnb)} BNB` : '<span class="soluk">bedava</span>'}</td>
    <td class="soluk">${s.gasBnb != null ? esc(s.gasBnb.toFixed(5)) : '?'}</td>
    <td>${s.gelen.some((g) => g.degerUsd != null) ? esc(usd(s.gelen.reduce((t, g) => t + (g.degerUsd || 0), 0))) : '<span class="soluk">fiyat yok</span>'}</td>
    <td>${s.txHash ? `<a href="https://bscscan.com/tx/${esc(s.txHash)}" target="_blank" rel="noopener noreferrer">BscScan</a>` : esc(s.durum)}</td>
  </tr>`).join('') : '<tr><td colspan="7" class="soluk">Henüz otomatik mint yok. Mintler sekmesindeki Ajanlar kartından otomatik mint açıkken kurallara uyan ücretsiz ve 0.001 BNB\'ye kadar mintler burada birikir.</td></tr>';
}

// ---------- Maliyet paneli: OpenRouter kullanımı ve yerel çağrı defteri ----------
async function maliyetYenile(yenile = false) {
  const d = await api(`/api/maliyet${yenile ? '?yenile=1' : ''}`).catch((e) => ({ hata: e.message }));
  if (d.hata) { $('maliyet-kartlar').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  const o = d.openRouter, y = d.yerel;
  const kalanYuzde = o && o.sinirUsd ? Math.max(0, Math.round((o.kalanUsd / o.sinirUsd) * 100)) : null;
  $('maliyet-kartlar').innerHTML = !o ? '<div class="soluk">OpenRouter anahtarı yok</div>' : o.hata ? `<div class="hata">OpenRouter: ${esc(o.hata)}</div>` : [
    pnlKart('Bugün', esc(usd(o.bugunUsd)), `Bu hafta ${esc(usd(o.haftaUsd))} · bu ay ${esc(usd(o.ayUsd))}`, true),
    pnlKart('Toplam', esc(usd(o.toplamUsd)), 'Bu anahtarla yapılan bütün harcama'),
    pnlKart('Anahtar sınırı', o.sinirUsd != null ? `${esc(usd(o.kalanUsd))} kaldı` : 'Sınır yok', o.sinirUsd != null ? `Sınır ${esc(usd(o.sinirUsd))} · kalan %${esc(kalanYuzde)}` : 'OpenRouter ayarlarından konabilir'),
    pnlKart('Hesap kredisi', o.hesapKrediUsd != null ? `${esc(usd(o.hesapKrediUsd - o.hesapKullanimUsd))} kaldı` : '?', o.hesapKrediUsd != null ? `${esc(usd(o.hesapKrediUsd))} yüklendi` : ''),
    pnlKart('Mint başına', y.mintBasinaUsd != null ? esc(usd(y.mintBasinaUsd)) : '?', `${esc(y.arastirilanMint)} mint araştırıldı (defter)`),
    pnlKart('Ücretsiz arama', `${esc(y.aramaBuAy)} / 1.000`, 'Brave, bu ay'),
  ].join('');
  const AD = { Site: 'Site ajanı', Sosyal: 'Sosyal ajan (web araması dahil)', Hakem: 'Hakem', Arama: 'Brave araması' };
  $('maliyet-ajanlar').innerHTML = Object.entries(y.ajanlar).map(([k, a]) => `<tr><td>${esc(AD[k] || k)}</td><td>${esc(a.cagri)}</td><td>${esc(a.ucretsiz)}</td><td>${esc(usd(a.usd))}</td></tr>`).join('')
    || '<tr><td colspan="4" class="soluk">Defter henüz boş: ilk araştırmadan sonra dolar</td></tr>';
  $('maliyet-modeller').innerHTML = Object.entries(y.modeller).sort((a, b) => b[1].usd - a[1].usd).map(([m, a]) => `<tr><td class="mono">${esc(m.split('/').pop())}</td><td>${esc(a.cagri)}</td><td>${a.usd ? esc(usd(a.usd)) : '<span class="kazanc">ücretsiz</span>'}</td></tr>`).join('')
    || '<tr><td colspan="3" class="soluk">Henüz yok</td></tr>';
  $('maliyet-not').textContent = `Defter ${y.baslangic ? `${tarihKisa(y.baslangic)} tarihinden beri` : 'henüz'} tutuluyor: ondan önceki harcamalar sadece OpenRouter toplamında görünür. `
    + (o?.ucretsizIstek ? `Ücretsiz modeller bugün ${o.ucretsizIstek.kullanilan}/${o.ucretsizIstek.sinir} istek.` : '');
}
$('maliyet-yenile').addEventListener('click', () => maliyetYenile(true));

// ---------- Piyasa açıldı izleyicisi ----------
async function piyasaYenile() {
  const d = await api('/api/piyasa-izleme').catch(() => null);
  if (!d) return;
  const bekleyen = d.liste.filter((x) => !x.acildi), acilan = d.liste.filter((x) => x.acildi);
  $('piyasa-ozet').textContent = `· ${bekleyen.length} bekliyor${acilan.length ? ` · ${acilan.length} açıldı` : ''}`;
  sabitCiz($('piyasa-liste'), d.liste.length ? d.liste.map((x) => `<tr data-capa="p-${esc(x.kontrat)}">
    <td>${esc(x.sembol || '?')}<div class="adres" title="${esc(x.kontrat)}">${esc(kisalt(x.kontrat))}</div></td>
    <td>${esc(x.miktar >= 1e9 ? x.miktar.toExponential(2) : sayiYaz(x.miktar, 2))}</td>
    <td class="soluk">${esc(zamanFarki(x.ilkGorulme).replace(' önce', ''))}</td>
    <td class="soluk">${x.sonKontrol ? esc(zamanFarki(x.sonKontrol)) : 'henüz değil'}</td>
    <td>${x.acildi ? `<span class="kazanc">Açıldı ✓</span> <span class="soluk">${esc(fiyatYaz(x.fiyat))} · ${esc(zamanFarki(x.acildi))}</span>` : '<span class="soluk">Havuz yok</span>'}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="soluk">İlk kontrol terminal açıldıktan bir dakika sonra yapılır.</td></tr>');
}
$('piyasa-kontrol').addEventListener('click', async (e) => {
  e.target.disabled = true;
  $('piyasa-mesaj').textContent = 'Kontrol ediliyor…';
  try {
    const r = await api('/api/piyasa-izleme/kontrol', {});
    $('piyasa-mesaj').textContent = r.acilanlar.length ? `${r.acilanlar.length} tokenin piyasası açıldı` : 'Yeni açılan yok';
    piyasaYenile();
    if (r.acilanlar.length) portfoyYenile();
  } catch (err) { $('piyasa-mesaj').textContent = err.message; }
  e.target.disabled = false;
});
$('piyasa-kat').open = depoOku('piyasa-acik', true);
$('piyasa-kat').addEventListener('toggle', (e) => depoYaz('piyasa-acik', e.target.open));

function portfoyBolum(b) {
  $('portfoy-agent').hidden = b !== 'agent';
  $('portfoy-normal').hidden = b === 'agent';
  depoYaz('portfoy-bolum', b);
  if (b === 'agent') maliyetYenile();
}
$('portfoy-bolum').addEventListener('change', (e) => portfoyBolum(e.target.value));
{
  const b = depoOku('portfoy-bolum', 'normal');
  const r = document.querySelector(`#portfoy-bolum input[value="${b === 'agent' ? 'agent' : 'normal'}"]`);
  r.checked = true;
  portfoyBolum(r.value);
}

// ---------- Grafikler (TradingView Lightweight Charts, projenin içinde) ----------
const LWC = window.LightweightCharts;
function grafikYap(kap) {
  const g = LWC.createChart(kap, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: renk('--fog'), fontFamily: renk('--sans') },
    grid: { vertLines: { color: renk('--elevated') }, horzLines: { color: renk('--elevated') } },
    rightPriceScale: { borderColor: renk('--peak') }, timeScale: { borderColor: renk('--peak'), timeVisible: true },
    localization: { locale: YEREL },
  });
  return g;
}
const sn = (ms) => Math.floor(ms / 1000);

let seriGrafik = null, seriVeri = null;
function seriCiz() {
  if (!LWC || !seriVeri) return;
  if (!seriGrafik) seriGrafik = grafikYap($('pnl-grafik'));
  for (const s of seriGrafik._seriler || []) seriGrafik.removeSeries(s);
  const tur = document.querySelector('input[name=pnl-seri]:checked').value;
  const noktalar = [];
  for (const x of seriVeri.noktalar) {
    const t = sn(x.zaman);
    if (noktalar.length && noktalar.at(-1).t >= t) continue;
    noktalar.push({ t, x });
  }
  const seriler = [];
  if (tur === 'net') {
    const s = seriGrafik.addBaselineSeries({
      baseValue: { type: 'price', price: 0 }, topLineColor: renk('--gain'), bottomLineColor: renk('--warn'),
      topFillColor1: 'rgba(63,178,127,0.25)', topFillColor2: 'rgba(63,178,127,0.02)', bottomFillColor1: 'rgba(232,110,88,0.02)', bottomFillColor2: 'rgba(232,110,88,0.25)',
      priceFormat: { type: 'custom', formatter: (v) => usd(v) },
    });
    s.setData(noktalar.map(({ t, x }) => ({ time: t, value: x.netUsd })));
    seriler.push(s);
  } else {
    const d = seriGrafik.addAreaSeries({ lineColor: renk('--blue'), topColor: 'rgba(43,127,255,0.25)', bottomColor: 'rgba(43,127,255,0.02)', priceFormat: { type: 'custom', formatter: (v) => usd(v) } });
    d.setData(noktalar.map(({ t, x }) => ({ time: t, value: x.degerUsd })));
    const y = seriGrafik.addLineSeries({ color: renk('--fog'), lineWidth: 1, lineStyle: 2, priceFormat: { type: 'custom', formatter: (v) => usd(v) } });
    y.setData(noktalar.map(({ t, x }) => ({ time: t, value: x.yatirilanUsd })));
    seriler.push(d, y);
  }
  seriGrafik._seriler = seriler;
  seriGrafik.timeScale().fitContent();
  $('pnl-grafik-not').textContent = `${seriVeri.adim === 'gun' ? 'Günlük' : 'Saatlik'} noktalar. ${tur === 'deger' ? 'Kesikli çizgi: o ana kadar yatırılan net para. ' : ''}Fiyat geçmişi olan tokenler ve BNB sayılır; NFT'ler ve fiyatı olmayan tokenler 0 değerle girer.`;
}
document.querySelectorAll('input[name=pnl-seri]').forEach((r) => r.addEventListener('change', seriCiz));

async function seriYenile(yenile = false) {
  const d = await api(`/api/pnl/seri${yenile ? '?yenile=1' : ''}`).catch((e) => ({ hata: e.message }));
  if (d.hata) { $('pnl-grafik-not').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  seriVeri = d;
  seriCiz();
}

let tokenGrafik = null, tokenSecili = null;
async function tokenGrafikAc(kontrat) {
  tokenSecili = kontrat;
  const kart = $('pnl-token');
  kart.hidden = false;
  const aralik = document.querySelector('input[name=pnl-aralik]:checked').value;
  const v = pnlSon?.varliklar.find((x) => x.kontrat === kontrat);
  $('pnl-token-baslik').textContent = `${v?.sembol || 'Token'} · yükleniyor…`;
  kart.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const d = await api(`/api/pnl/grafik?kontrat=${encodeURIComponent(kontrat)}&aralik=${aralik}`).catch((e) => ({ hata: e.message }));
  if (tokenSecili !== kontrat) return;
  if (d.hata) { $('pnl-token-baslik').textContent = `${v?.sembol || 'Token'} · ${d.hata}`; return; }
  $('pnl-token-baslik').textContent = `${d.sembol || 'Token'} · ${d.mumlar.length ? `${d.mumlar.length} mum` : 'bu token için havuz ya da fiyat geçmişi bulunamadı'}`;
  if (!LWC) return;
  if (tokenGrafik) tokenGrafik.remove();
  tokenGrafik = grafikYap($('pnl-token-grafik'));
  const fmt = { type: 'custom', formatter: (p) => fiyatYaz(p), minMove: 1e-12 };
  const m = tokenGrafik.addCandlestickSeries({ upColor: renk('--gain'), downColor: renk('--warn'), borderVisible: false, wickUpColor: renk('--gain'), wickDownColor: renk('--warn'), priceFormat: fmt });
  const mumlar = [];
  for (const x of d.mumlar) { const t = sn(x.zaman); if (!mumlar.length || mumlar.at(-1).time < t) mumlar.push({ time: t, open: x.acilis, high: x.yuksek, low: x.dusuk, close: x.kapanis }); }
  m.setData(mumlar);
  if (d.ortalamaUsd) m.createPriceLine({ price: d.ortalamaUsd, color: renk('--fog'), lineStyle: 2, lineWidth: 1, title: 'ort. maliyet' });
  // İşaretler mum zamanlarına oturtulur
  const enYakin = (t) => { let s = mumlar[0]?.time; for (const x of mumlar) { if (x.time <= t) s = x.time; else break; } return s; };
  const isaretler = d.hareketler.filter((h) => h.yon === 'giris' || h.yon === 'satis').map((h) => ({
    time: enYakin(sn(h.zaman)), position: h.yon === 'satis' ? 'aboveBar' : 'belowBar', shape: h.yon === 'satis' ? 'arrowDown' : 'arrowUp',
    color: h.yon === 'satis' ? renk('--warn') : renk('--gain'), text: h.yon === 'satis' ? `Sat ${usd(h.usd)}` : `${KAYNAK[h.tur] || 'Al'} ${h.usd ? usd(h.usd) : ''}`,
  })).filter((x) => x.time != null).sort((a, b) => a.time - b.time);
  if (mumlar.length) m.setMarkers(isaretler);
  tokenGrafik.timeScale().fitContent();
}
document.querySelectorAll('input[name=pnl-aralik]').forEach((r) => r.addEventListener('change', () => tokenSecili && tokenGrafikAc(tokenSecili)));
$('pnl-token-kapat').onclick = () => { $('pnl-token').hidden = true; tokenSecili = null; };

// ---------- Sat paneli: hemen sat ya da fiyat emri ----------
let satToken = null;
const satForm = $('sat-form');
const satMod = () => document.querySelector('input[name=sat-mod]:checked').value;

function satAc(kontrat) {
  const v = pnlSon?.varliklar.find((x) => x.kontrat === kontrat);
  if (!v) return;
  satToken = v;
  $('sat-kart').hidden = false;
  $('sat-onay').hidden = true;
  $('sat-mesaj').textContent = '';
  $('sat-baslik').textContent = `Sat: ${v.sembol || 'token'}`;
  $('sat-bilgi').innerHTML = `Elinde ${esc(sayiYaz(v.miktar, 4))} · fiyat ${esc(fiyatYaz(v.fiyat))} · değer ${v.degerUsd != null ? esc(usd(v.degerUsd)) : '?'}${v.ortalamaUsd != null ? ` · ortalama maliyet ${esc(fiyatYaz(v.ortalamaUsd))}` : ''}`;
  satForm.miktar.value = v.miktar;
  satForm.miktar.dataset.hepsi = '1';
  satForm.tetik.value = '';
  satModCiz();
  $('sat-kart').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function satModCiz() {
  const emir = satMod() === 'emir';
  for (const el of satForm.querySelectorAll('.emir-alani')) el.hidden = !emir;
  const tur = satForm.tur.value;
  // Binance limit emri sadece kâr al için
  satForm.yer.querySelector('option[value=binance]').disabled = tur === 'zarar-kes';
  if (tur === 'zarar-kes') satForm.yer.value = 'terminal';
  const f = satToken?.fiyat;
  const kat = tur === 'kar-al' ? [1.25, 1.5, 2, 3] : [0.9, 0.8, 0.7, 0.5];
  const m = satToken?.ortalamaUsd;
  $('sat-aciklama').innerHTML = !emir
    ? 'İşlem fişine aktarılır: önce teklif alınır, sonra onayınla satılır.'
    : tur === 'kar-al' ? 'Fiyat tetiğe çıkınca sat. Şu anki fiyatın üstünde bir tetik gir.' : 'Fiyat tetiğe inerse sat. Şu anki fiyatın altında bir tetik gir. Sadece terminal açıkken çalışır.';
  document.querySelector('[data-hizli=tetik]').innerHTML = f ? kat.map((k) => `<button type="button" data-tetik="${f * k}">${k > 1 ? '+' : '−'}%${Math.round(Math.abs(k - 1) * 100)}</button>`).join('')
    + (m && tur === 'kar-al' && m > f ? `<button type="button" data-tetik="${m}">maliyet</button>` : '') : '';
  $('sat-gonder').textContent = emir ? 'Emri hazırla' : 'Fişe aktar';
}
document.querySelectorAll('input[name=sat-mod]').forEach((r) => r.addEventListener('change', satModCiz));
satForm.tur.addEventListener('change', () => { satForm.tetik.value = ''; satModCiz(); });
satForm.miktar.addEventListener('input', () => { delete satForm.miktar.dataset.hepsi; });
$('sat-kart').addEventListener('click', (e) => {
  const y = e.target.closest('[data-yuzde]');
  if (y && satToken) {
    const p = Number(y.dataset.yuzde);
    satForm.miktar.value = p === 100 ? satToken.miktar : Number((satToken.miktar * p / 100).toPrecision(12));
    if (p === 100) satForm.miktar.dataset.hepsi = '1'; else delete satForm.miktar.dataset.hepsi;
  }
  const t = e.target.closest('[data-tetik]');
  if (t) satForm.tetik.value = Number(Number(t.dataset.tetik).toPrecision(4));
});
$('sat-kapat').onclick = () => { $('sat-kart').hidden = true; satToken = null; };

let satBekleyen = null;
satForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!satToken) return;
  const miktar = satForm.miktar.value.trim();
  if (!(Number(miktar) > 0)) { $('sat-mesaj').innerHTML = '<span class="hata">Miktar gir</span>'; return; }
  if (satMod() === 'hemen') { fisDoldur({ adres: satToken.kontrat, yon: 'sat', miktar }); return; }
  const tetik = Number(satForm.tetik.value);
  if (!(tetik > 0)) { $('sat-mesaj').innerHTML = '<span class="hata">Tetik fiyatı gir</span>'; return; }
  const tur = satForm.tur.value, yer = satForm.yer.value;
  satBekleyen = {
    token: satToken.kontrat, sembol: satToken.sembol, tur, tetikUsd: tetik, yer, kayma: satForm.kayma.value.trim(),
    miktar: satForm.miktar.dataset.hepsi ? 'hepsi' : miktar,
  };
  $('sat-onay-metin').innerHTML = `<b>${tur === 'kar-al' ? 'Kâr al' : 'Zarar kes'}</b>: ${esc(satToken.sembol || '')} fiyatı ${tur === 'kar-al' ? 'yükselip' : 'düşüp'} <b>${esc(fiyatYaz(tetik))}</b> olunca ${satBekleyen.miktar === 'hepsi' ? 'hepsi' : esc(sayiYaz(Number(miktar), 4))} BNB karşılığı satılacak. ${yer === 'binance' ? 'Emir Binance\'te bekler.' : 'Emir bu terminalde bekler, terminal açık olmalı.'} Tetiklenince sana sorulmadan satılır.`;
  $('sat-onay').hidden = false;
  $('sat-onay-evet').focus();
});
$('sat-onay-hayir').onclick = () => { $('sat-onay').hidden = true; satBekleyen = null; };
$('sat-onay-evet').onclick = async () => {
  if (!satBekleyen) return;
  $('sat-onay-evet').disabled = true;
  try {
    const r = await api('/api/fiyat-emirleri', { ...satBekleyen, onay: true });
    $('sat-onay').hidden = true;
    $('sat-mesaj').innerHTML = `<span class="ok">Emir kuruldu.</span> ${r.yer === 'binance' ? `Binance emir no: ${esc(r.strategyId)}. ` : ''}Bu bir satış değil: fiyat ${esc(fiyatYaz(r.tetikUsd))} olunca çalışacak.`;
    satBekleyen = null;
    emirlerCiz();
  } catch (err) {
    $('sat-mesaj').innerHTML = `<span class="hata">${esc(err.message)}</span>`;
  } finally { $('sat-onay-evet').disabled = false; }
};

const EMIR_DURUM = {
  bekliyor: 'Bekliyor', tetiklendi: 'Satılıyor', tamamlandi: 'Satıldı', hata: 'Başarısız', iptal: 'İptal',
  WORKING: 'Bekliyor', TRIGGERED: 'Tetiklendi', PENDING: 'Zincirde', FINISHED: 'Satıldı', FAILED: 'Başarısız', EXPIRED: 'Süresi doldu', CANCELED: 'İptal',
};
async function emirlerCiz() {
  const l = await api('/api/fiyat-emirleri').catch((e) => ({ hata: e.message }));
  if (l.hata) { $('fiyat-emirleri').innerHTML = `<tr><td colspan="8" class="soluk">${esc(l.hata)}</td></tr>`; return; }
  sabitCiz($('fiyat-emirleri'), l.length ? l.map((e) => {
    const acik = ['bekliyor', 'WORKING'].includes(e.durum);
    const sonuc = e.sonuc?.txHash ? ` <a href="https://bscscan.com/tx/${esc(e.sonuc.txHash)}" target="_blank" rel="noopener noreferrer">işlem</a>` : '';
    const sebep = e.sonuc?.sebep ? `<div class="hata">${esc(e.sonuc.sebep)}</div>` : '';
    const iade = e.sonuc?.iade ? '<div class="soluk">Kısmen doldu, bir kısmı iade edildi</div>' : '';
    return `<tr><td>${esc(e.sembol || '?')}<div class="adres">${esc(e.token)}</div></td>
      <td>${e.tur === 'kar-al' ? 'Kâr al' : 'Zarar kes'}</td>
      <td>${esc(fiyatYaz(e.tetikUsd))}${acik && e.sonFiyat ? `<div class="soluk">şu an ${esc(fiyatYaz(e.sonFiyat))}</div>` : ''}</td>
      <td>${e.miktar === 'hepsi' ? 'Hepsi' : esc(sayiYaz(e.miktar, 4))}</td>
      <td>${e.yer === 'binance' ? `Binance <span class="soluk">#${esc(e.strategyId)}</span>` : 'Terminal'}</td>
      <td>${esc(EMIR_DURUM[e.durum] || e.durum)}${sonuc}${sebep}${iade}</td>
      <td class="soluk">${esc(tarihKisa(e.olusturma))}</td>
      <td>${acik ? `<button type="button" class="dugme" data-emir-iptal="${esc(e.id)}">İptal</button>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="8" class="soluk">Emir yok</td></tr>');
}
$('fiyat-emirleri').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-emir-iptal]');
  if (!b) return;
  b.disabled = true;
  try { await api('/api/fiyat-emirleri/iptal', { id: b.dataset.emirIptal }); } catch (err) { alert(err.message); }
  emirlerCiz();
});

let pnlYukleniyor = false;
async function portfoyYenile(yenile = false) {
  if (pnlYukleniyor) return;
  pnlYukleniyor = true;
  if (!pnlSon) $('pnl-durum').textContent = 'Geçmiş ve fiyatlar toplanıyor…';
  try {
    const d = await api(`/api/pnl${yenile ? '?yenile=1' : ''}`);
    pnlCiz(d);
    seriYenile(yenile);
    emirlerCiz();
  } catch (e) {
    $('pnl-durum').innerHTML = `<span class="hata">${esc(e.message)}</span>`;
    if (!pnlSon) $('portfoy').innerHTML = `<tr><td colspan="9" class="soluk">${esc(e.message)}</td></tr>`;
  } finally { pnlYukleniyor = false; }
}
$('portfoy-yenile').onclick = () => portfoyYenile(true);
$('portfoy-kart').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sat-ac]');
  if (s) return satAc(s.dataset.satAc);
  const g = e.target.closest('[data-grafik]');
  if (g) tokenGrafikAc(g.dataset.grafik);
});

// ---------- Otomasyon ----------
const otoForm = $('oto-form');
const alan = (ad) => otoForm.elements[ad];
const karAlYaz = (list) => list.map((k) => `${k.kat}x:${k.yuzde}`).join(', ');
const karAlOku = (s) => s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
  const m = /^([\d.]+)\s*x?\s*:\s*([\d.]+)$/i.exec(p);
  if (!m) throw new Error(`Kademe anlaşılamadı: "${p}" (örnek: 2x:50)`);
  return { kat: Number(m[1]), yuzde: Number(m[2]) };
});
const bosNull = (v) => (String(v).trim() === '' ? null : Number(v));

function otoFormDoldur(a) {
  for (const [on, grup] of [['s', a.sniper], ['o', a.otoSatis]]) {
    for (const [k, v] of Object.entries(grup)) {
      const el = alan(`${on}.${k}`);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = k === 'karAl' ? karAlYaz(v) : v ?? '';
    }
  }
}

function otoFormOku() {
  return {
    acilDurdur: false,
    sniper: {
      acik: alan('s.acik').checked, simulasyon: alan('s.simulasyon').checked, bnb: Number(alan('s.bnb').value), kayma: Number(alan('s.kayma').value),
      minYasSn: Number(alan('s.minYasSn').value), maxYasSn: Number(alan('s.maxYasSn').value), minHolder: bosNull(alan('s.minHolder').value), maxTop10: bosNull(alan('s.maxTop10').value),
      gunlukMaxToken: Number(alan('s.gunlukMaxToken').value), devSattiGizle: alan('s.devSattiGizle').checked,
    },
    otoSatis: {
      acik: alan('o.acik').checked, simulasyon: alan('o.simulasyon').checked, karAl: karAlOku(alan('o.karAl').value),
      zararKes: bosNull(alan('o.zararKes').value), kontrolSn: Number(alan('o.kontrolSn').value), maxSureSaat: Number(alan('o.maxSureSaat').value),
    },
  };
}

let otoIlk = true;
function otoCiz(d) {
  if (otoIlk) { otoFormDoldur(d.ayar); otoIlk = false; }
  const a = d.ayar;
  const mod = (m) => (!m.acik ? 'kapalı' : m.simulasyon || !d.canliIslem ? 'açık · simülasyon' : '<span class="hata">açık · GERÇEK</span>');
  $('oto-durum').innerHTML = [a.acilDurdur ? '<span class="hata">Acil durduruldu</span>' : '',
    `Sniper ${mod(a.sniper)}`, `Oto satış ${mod(a.otoSatis)}`, `bugün ${d.sniperBugun}/${a.sniper.gunlukMaxToken} token`].filter(Boolean).join(' · ');
  $('oto-poz').innerHTML = d.pozisyonlar.length ? d.pozisyonlar.map((p) => `<tr>
    <td>${esc(p.sembol || '?')}<div class="adres">${esc(p.token)}</div></td><td>${p.simulasyon ? 'Simülasyon' : '<span class="hata">Gerçek</span>'}</td>
    <td>${esc(Number(p.girisBnb).toFixed(6))} BNB</td><td>${esc(sayiYaz(p.kalan, 2))} / ${esc(sayiYaz(p.ilkMiktar, 2))}</td>
    <td>${esc(Number(p.gelenBnb).toFixed(6))} BNB</td><td>${esc(p.karAlYapilan.map((k) => `${k}x`).join(', ') || '–')}</td>
    <td>${esc(new Date(p.acilis).toLocaleString(YEREL))}</td></tr>`).join('') : '<tr><td colspan="7" class="soluk">Açık pozisyon yok</td></tr>';
  sabitCiz($('oto-log'), d.log.length ? d.log.map((k) => `<div><span class="soluk">${esc(new Date(k.zaman).toLocaleTimeString(YEREL))} ${esc(k.modul)}</span>
    ${k.sembol ? `<b>${esc(k.sembol)}</b>` : ''} ${esc(k.mesaj)}${k.txHash ? ` <a href="https://bscscan.com/tx/${esc(k.txHash)}" target="_blank" rel="noopener">tx</a>` : ''}</div>`).join('')
    : '<div class="soluk">Kayıt yok</div>');
}

async function otoYenile() { const d = await api('/api/otomasyon').catch(() => null); if (d) otoCiz(d); }

async function otoKaydet(a) {
  try {
    otoFormDoldur(await api('/api/otomasyon/ayar', a));
    $('oto-mesaj').textContent = 'Kaydedildi';
    otoYenile();
  } catch (e) { $('oto-mesaj').innerHTML = `<span class="hata">${esc(e.message)}</span>`; }
}

let bekleyenAyar = null;
$('oto-kaydet').onclick = () => {
  let a;
  try { a = otoFormOku(); } catch (e) { $('oto-mesaj').innerHTML = `<span class="hata">${esc(e.message)}</span>`; return; }
  const gercek = canliIslem && ((a.sniper.acik && !a.sniper.simulasyon) || (a.otoSatis.acik && !a.otoSatis.simulasyon));
  if (!gercek) return otoKaydet(a);
  bekleyenAyar = a;
  $('oto-onay').hidden = false;
};
$('oto-onay-evet').onclick = () => { $('oto-onay').hidden = true; if (bekleyenAyar) otoKaydet(bekleyenAyar); bekleyenAyar = null; };
$('oto-onay-hayir').onclick = () => { $('oto-onay').hidden = true; bekleyenAyar = null; };

$('acil-btn').onclick = async () => {
  try {
    otoFormDoldur(await api('/api/otomasyon/acil-durdur', {}));
    $('oto-mesaj').textContent = 'Sniper ve otomatik satış durduruldu. Yeniden açmak için ayarları kaydet.';
    otoYenile();
    gorunumAc('otomasyon');
  } catch (e) { gorunumAc('otomasyon'); $('oto-mesaj').innerHTML = `<span class="hata">Acil durdurma başarısız: ${esc(e.message)}</span>`; }
};

// ---------- Başlat ----------
// ---------- Basım ----------
let basimBilgi = null;
let basimGorsel = null;

function basimCuzdanCiz(b) {
  const c = b.cuzdan;
  const sablon = b.sablon ? `<p class="alt">Şablon: Agent ID · arz ${esc(sayiYaz(b.sablon.arz, 0))} · curve'de satılan ${esc(sayiYaz(b.sablon.satis, 0))} · hedef ${esc(b.sablon.hedef)} BNB · basım ücreti ${esc(b.sablon.ucret)} BNB</p>` : '';
  if (!c.var) {
    $('basim-cuzdan').innerHTML = `<h2 class="kart-baslik">Basıcı cüzdan</h2>
      <p>Henüz basıcı cüzdan yok. Oluşturulan anahtar sadece bu bilgisayarda, senin şifrenle şifrelenmiş olarak durur. Ben ve sunucu şifreyi saklamaz.</p>
      <form id="bc-olustur" class="alan-izgara" autocomplete="off">
        <label>Şifre (en az 10 karakter) <input type="password" name="sifre" autocomplete="new-password" required minlength="10"></label>
        <label>Şifre tekrar <input type="password" name="tekrar" autocomplete="new-password" required minlength="10"></label>
        <div class="genis satir-dugmeler"><button type="submit" class="dugme ana">Cüzdan oluştur</button><span class="soluk" id="bc-mesaj"></span></div>
      </form>${sablon}`;
    return;
  }
  const bakiye = c.bakiye == null ? '?' : `${Number(c.bakiye).toFixed(6)} BNB`;
  const ust = `<h2 class="kart-baslik">Basıcı cüzdan</h2>
    <div class="adres">${esc(c.adres)}</div>
    <p>Bakiye: <b>${esc(bakiye)}</b> · ${c.acik ? '<span class="ok">Açık</span> (10 dk işlem yapılmazsa kilitlenir)' : 'Kilitli'}</p>
    <p class="alt">Basım ücreti, ön alım ve gas bu cüzdandan ödenir. BNB göndermek için yukarıdaki adresi kullan.</p>`;
  $('basim-cuzdan').innerHTML = c.acik
    ? `${ust}<div class="satir-dugmeler"><button type="button" class="dugme" id="bc-kilitle">Kilitle</button></div>${sablon}`
    : `${ust}<form id="bc-ac" class="alan-izgara" autocomplete="off">
        <label>Şifre <input type="password" name="sifre" autocomplete="current-password" required></label>
        <div class="satir-dugmeler bc-ac-dugme"><button type="submit" class="dugme ana">Kilidi aç</button><span class="soluk" id="bc-mesaj"></span></div>
      </form>${sablon}`;
}

async function basimYenile() {
  const b = await api('/api/basim').catch((e) => ({ hata: e.message }));
  if (b.hata) { $('basim-cuzdan').innerHTML = `<p class="hata">${esc(b.hata)}</p>`; return; }
  basimBilgi = b;
  basimCuzdanCiz(b);
  $('basim-form').hidden = !b.cuzdan.acik;
  $('basim-onalim').title = `En fazla ${b.onalimMax} BNB`;
  basimTaslakCiz(b.taslak);
}

$('basim-cuzdan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const sifre = f.elements.sifre.value;
  const mesaj = (m) => { const x = $('bc-mesaj'); if (x) x.textContent = m; };
  try {
    if (f.id === 'bc-olustur') {
      if (sifre !== f.elements.tekrar.value) throw new Error('Şifreler aynı değil');
      mesaj('Oluşturuluyor, birkaç saniye sürebilir…');
      await api('/api/basim/cuzdan/olustur', { sifre });
    } else {
      mesaj('Açılıyor…');
      await api('/api/basim/cuzdan/ac', { sifre });
    }
    f.reset();
    basimYenile();
  } catch (err) {
    f.elements.sifre.value = '';
    if (f.elements.tekrar) f.elements.tekrar.value = '';
    mesaj(err.message);
  }
});
$('basim-cuzdan').addEventListener('click', async (e) => {
  if (e.target.id === 'bc-kilitle') { await api('/api/basim/cuzdan/kilitle', {}).catch(() => {}); basimYenile(); }
});

$('basim-form').elements.gorsel.addEventListener('change', (e) => {
  basimGorsel = null;
  const dosya = e.target.files[0];
  const kutu = $('basim-onizleme');
  kutu.hidden = true;
  if (!dosya) return;
  if (dosya.size > 2 * 1024 * 1024) { $('basim-mesaj').textContent = 'Görsel en fazla 2 MB olabilir'; e.target.value = ''; return; }
  const okuyucu = new FileReader();
  okuyucu.onload = () => {
    basimGorsel = okuyucu.result;
    kutu.innerHTML = '';
    const img = document.createElement('img');
    img.src = basimGorsel;
    img.alt = 'Görsel önizleme';
    kutu.append(img);
    kutu.hidden = false;
  };
  okuyucu.readAsDataURL(dosya);
});

$('basim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  if (!basimGorsel) { $('basim-mesaj').textContent = 'Görsel seç'; return; }
  const govde = {
    ad: f.ad.value, sembol: f.sembol.value, aciklama: f.aciklama.value, gorsel: basimGorsel,
    webUrl: f.webUrl.value, twitterUrl: f.twitterUrl.value, telegramUrl: f.telegramUrl.value, onalim: f.onalim.value,
    vergi: Object.fromEntries(['buyFeeRate', 'sellFeeRate', 'rateFounder', 'rateHolder', 'rateBurn', 'rateLiquidity', 'minShare'].map((k) => [k, f[k].value])),
  };
  $('basim-hazirla').disabled = true;
  $('basim-mesaj').textContent = 'Four.meme girişi, görsel yükleme, imzalı veri ve simülasyon… (30 sn kadar sürebilir)';
  try {
    basimTaslakCiz(await api('/api/basim/taslak', govde));
    $('basim-mesaj').textContent = '';
    $('basim-taslak').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    $('basim-mesaj').textContent = err.message;
  } finally {
    $('basim-hazirla').disabled = false;
  }
});

function basimTaslakCiz(t) {
  const k = $('basim-taslak');
  if (!t) { k.hidden = true; k.innerHTML = ''; return; }
  const canli = basimBilgi?.canli;
  const sim = t.sim || {};
  const kalan = Math.max(0, Math.round((t.gecerlilik - Date.now()) / 1000));
  const vergi = t.vergi && (t.vergi.buyFeeRate || t.vergi.sellFeeRate)
    ? `alım %${t.vergi.buyFeeRate / 100}, satış %${t.vergi.sellFeeRate / 100}` : 'yok (%0)';
  const satir = (a, b) => `<tr><td class="soluk">${a}</td><td>${b}</td></tr>`;
  const gonderilebilir = canli && sim.ok && !t.suresiDoldu;
  k.innerHTML = `<h2 class="kart-baslik">Taslak</h2>
    <div class="taslak-ust">${t.gorsel ? `<img src="${esc(t.gorsel)}" alt="">` : ''}<div><b>${esc(t.ad)}</b> <span class="soluk">${esc(t.sembol)}</span></div></div>
    <table class="ozet-tablo"><tbody>
      ${satir('Basım ücreti', `${esc(t.ucret)} BNB`)}
      ${satir('Ön alım', `${esc(t.onalim)} BNB`)}
      ${satir('Gönderilecek toplam', `<b>${esc(t.toplam)} BNB</b> + gas ${esc(sim.gasUcret ?? '?')} BNB`)}
      ${satir('Cüzdan bakiyesi', `${esc(sim.bakiye ?? '?')} BNB`)}
      ${satir('Vergi', esc(vergi))}
      ${satir('Anti-sniper', t.antiSniper ? 'açık' : 'kapalı')}
      ${satir('Partner adresi', esc(t.ortak))}
      ${satir('Tahmini token adresi', sim.tahminiToken ? `<span class="adres">${esc(sim.tahminiToken)}</span>` : '?')}
      ${satir('İmza geçerliliği', t.suresiDoldu ? '<span class="hata">doldu, yeniden hazırla</span>' : `<span id="basim-kalan" data-bitis="${esc(t.gecerlilik)}">${kalan} sn</span>`)}
      ${satir('Simülasyon', sim.ok ? '<span class="ok">Başarılı</span>' : `<span class="hata">${esc(sim.hata || 'başarısız')}</span>`)}
    </tbody></table>
    <div class="satir-dugmeler" id="basim-dugmeler">
      <button type="button" class="dugme tehlike" id="basim-gonder" ${gonderilebilir ? '' : 'disabled'}>${canli ? 'Gerçek basımı hazırla' : 'Canlı işlem kapalı (sadece simülasyon)'}</button>
      <button type="button" class="dugme" id="basim-iptal">Taslağı sil</button>
    </div>
    <div class="onay-cubuk" id="basim-onay" hidden>
      <span><b>GERÇEK basım:</b> basıcı cüzdandan ${esc(t.toplam)} BNB + gas gönderilecek ve token zincirde oluşacak. Geri alınamaz.</span>
      <button type="button" class="dugme tehlike" id="basim-onay-evet">Evet, bas</button>
      <button type="button" class="dugme" id="basim-onay-hayir">Vazgeç</button>
    </div>
    <p id="basim-sonuc"></p>`;
  k.hidden = false;
  k.dataset.id = t.id;
}

$('basim-taslak').addEventListener('click', async (e) => {
  const id = e.target.id;
  if (id === 'basim-iptal') { await api('/api/basim/taslak/iptal', {}).catch(() => {}); basimTaslakCiz(null); }
  if (id === 'basim-gonder') { $('basim-onay').hidden = false; $('basim-onay-evet').focus(); }
  if (id === 'basim-onay-hayir') $('basim-onay').hidden = true;
  if (id === 'basim-onay-evet') {
    e.target.disabled = true;
    $('basim-sonuc').textContent = 'Gönderiliyor, onay bekleniyor…';
    try {
      const r = await api('/api/basim/gonder', { id: $('basim-taslak').dataset.id, onay: true });
      $('basim-onay').hidden = true;
      $('basim-dugmeler').hidden = true;
      $('basim-sonuc').innerHTML = `<span class="ok">Token basıldı.</span> ${r.token ? `<span class="adres">${esc(r.token)}</span>
        <a href="https://four.meme/token/${esc(r.token)}" target="_blank" rel="noopener noreferrer">Four.meme</a> ·` : ''}
        <a href="https://bscscan.com/tx/${esc(r.txHash)}" target="_blank" rel="noopener noreferrer">İşlem</a>`;
      basimBilgiYenileSessiz();
    } catch (err) {
      e.target.disabled = false;
      $('basim-sonuc').innerHTML = `<span class="hata">${esc(err.message)}</span>`;
    }
  }
});

async function basimBilgiYenileSessiz() {
  const b = await api('/api/basim').catch(() => null);
  if (b) { basimBilgi = b; basimCuzdanCiz(b); }
}
// İmza geçerliliği geri sayımı; süre dolunca gönder düğmesi kapanır
setInterval(() => {
  const x = $('basim-kalan');
  if (!x) return;
  const kalan = Math.round((Number(x.dataset.bitis) - Date.now()) / 1000);
  if (kalan > 0) { x.textContent = `${kalan} sn`; return; }
  x.outerHTML = '<span class="hata">doldu, yeniden hazırla</span>';
  const g = $('basim-gonder');
  if (g) g.disabled = true;
}, 1000);

// ---------- Mintler ----------
const MINT_SONUC = {
  UCRETSIZ: ['Ücretsiz', 'ucretsiz'], 'NEREDEYSE-UCRETSIZ': ['Neredeyse ücretsiz', 'ucuz'], UCRETLI: ['Ücretli', 'ucuz'], IZLE: ['İzleniyor', 'izle'],
  TUKENDI: ['Tükendi', ''], 'ZATEN-ALDIN': ['Zaten aldın', ''], 'AGENT-ID-DIGER': ['NFT değil', ''], 'NFT-DEGIL': ['NFT değil', ''],
  'MINT-YOK': ['Mint yok', ''], 'KOD-YOK': ['Kontrat yok', ''], GECERSIZ: ['Geçmiyor', ''],
};
const weiBnb = (w) => (w == null ? null : Number(BigInt(w)) / 1e18);
const bnbKisa = (v) => (v == null ? '?' : v === 0 ? '0 BNB' : `${v.toLocaleString(YEREL, { maximumFractionDigits: 6 })} BNB`);

// Her mint tek satırlık bir özet: durum, ad, ücret, ilerleme ve düğmeler. Adres, fonksiyonlar ve nedenler "Ayrıntı" ile açılır
const acikMintler = new Set();
function mintSatir(r) {
  // "İzleniyor" sonucu simülasyonda geçmeyen ya da kapanan mintleri de kapsar: rozet filtre grubunu söyler
  const [etiket, sinif] = r.filtre?.grup === 'gecmiyor' ? ['Geçmiyor', ''] : r.filtre?.grup === 'bitti' && r.sonuc === 'IZLE' ? ['Kapandı', ''] : MINT_SONUC[r.sonuc] || [r.sonuc, ''];
  const gecen = (r.mintler || []).filter((m) => m.gecti).map((m) => weiBnb(m.ucretWei));
  // Simülasyonda geçen ücret kesin; geçmeyenlerde kontratın yazdığı fiyat "~" ile ve ipucunda açıklamayla
  const ucret = gecen.length ? esc(bnbKisa(Math.min(...gecen)))
    : r.fiyatWei != null ? `<span title="Kontratın bildirdiği fiyat: mint simülasyonda geçmedi">~${esc(bnbKisa(weiBnb(r.fiyatWei)))}</span>` : '?';
  // Sembol adın büyük harfli kopyasıysa tekrar yazılmaz (BinaryBanshees BINARYBANSHEES gibi)
  const sade = (x) => String(x || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const sembolFarkli = r.sembol && sade(r.sembol) !== sade(r.ad);
  const ad = r.ad || r.sembol ? `${esc(r.ad || r.sembol)}${r.ad && sembolFarkli ? ` <span class="soluk">${esc(r.sembol)}</span>` : ''}` : '<span class="soluk">Adsız</span>';
  const f = r.filtre || {};
  const acik = acikMintler.has(String(r.adres).toLowerCase());
  const rozet = r.mintEdildi
    ? `<span class="mint-rozet edildi">Mint ettin ✓${r.mintEdildi.adet > 1 ? ` ×${esc(r.mintEdildi.adet)}` : ''}</span>`
    : f.grup === 'riskli' ? '<span class="mint-rozet riskli">Riskli</span>'
    : `<span class="mint-rozet ${sinif}">${esc(etiket)}</span>`;
  // Özette tek satırlık neden: risk ya da geçmeme sebebi
  const kisaNeden = f.riskler?.[0] ? `<div class="hata kisa">⚠ ${esc(f.riskler[0])}</div>` : f.gecmemeSebebi && f.grup !== 'edildi' ? `<div class="soluk kisa">${esc(f.gecmemeSebebi)}</div>` : '';
  // Büyük sayılar kısaltılır: token arzları 18 basamaklı ham değer olabiliyor
  const adet = (v) => {
    const n = Number(v);
    if (v == null || !Number.isFinite(n)) return '?';
    return n >= 1e12 ? n.toExponential(1) : n >= 1e9 ? `${sayiYaz(n / 1e9, 1)}B` : n >= 1e6 ? `${sayiYaz(n / 1e6, 1)}M` : sayiYaz(n, 0);
  };
  const ilerleme = r.basilan != null || r.maks != null ? `${esc(adet(r.basilan))} / ${esc(adet(r.maks))}` : '<span class="soluk">?</span>';
  const ozet = `<tr data-capa="m-${esc(r.adres)}" class="mint-ozet${acik ? ' acik' : ''}">
    <td>${rozet}${r.agentId ? ' <span class="mint-rozet agent kucuk">Agent ID</span>' : ''}</td>
    <td>${ad}${r.tur === 'token' ? ' <span class="mint-rozet agent kucuk">Token</span>' : ''}${r.kasa ? ' <span class="mint-rozet ucretsiz kucuk" title="Vergi gelirini kart sahiplerine dağıtan kasa kartı">Kasa</span>' : ''}${kisaNeden}</td>
    <td>${ucret}</td>
    <td>${ilerleme}</td>
    <td>${mintAksiyon(r, acik)}</td>
  </tr>`;
  if (!acik) return ozet;

  const gecenFn = (r.mintler || []).filter((m) => m.gecti).map((m) => `<div><span class="ok">✓</span> ${esc(m.imza)} · ${esc(bnbKisa(weiBnb(m.ucretWei)))}</div>`).join('');
  const gecmeyen = (r.mintler || []).filter((m) => !m.gecti).map((m) => `<div>✗ ${esc(m.imza)}: ${esc(m.sebep)}</div>`).join('');
  const kaynak = { proxy: 'kayıt adresi proxy\'nin uygulama kodunda', depo: 'kayıt adresi kontratın deposunda', yardimci: 'Agent ID kontrolü yardımcı bir kontratta', hata: 'mint hatası Agent ID şartını söylüyor' }[r.agentIdKaynak] || 'kayıt adresi kontratın kodunda';
  const satir = (b, d) => (d ? `<div class="ayrinti-satir"><span>${esc(b)}</span><div>${d}</div></div>` : '');
  return ozet + `<tr class="mint-ayrinti" data-capa="d-${esc(r.adres)}"><td colspan="5">
    ${satir('Kontrat', `<span class="adres">${esc(r.adres)}</span> · <a href="https://bscscan.com/address/${esc(r.adres)}" target="_blank" rel="noopener noreferrer">BscScan</a>${r.standart ? ` · ${esc(r.standart)}` : ''}`)}
    ${r.token && r.token.toLowerCase() !== r.adres.toLowerCase() ? satir('Basılan', `<a href="https://bscscan.com/token/${esc(r.token)}" target="_blank" rel="noopener noreferrer">${esc(r.token)}</a>`) : ''}
    ${r.mintEdildi?.txHash ? satir('Mint işlemin', `<a href="https://bscscan.com/tx/${esc(r.mintEdildi.txHash)}" target="_blank" rel="noopener noreferrer">BscScan'de gör</a>`) : ''}
    ${r.agentId ? satir('Agent ID', esc(kaynak)) : ''}
    ${(f.riskler || []).length ? satir('Riskler', f.riskler.map((x) => `<div class="hata">⚠ ${esc(x)}</div>`).join('')) : ''}
    ${f.kimliksiz ? satir('Doğrulama', `Sitesi ve sosyali doğrulanmamış (site ${esc(f.sitePuan ?? '?')}, sosyal ${esc(f.sosyalPuan ?? '?')})`) : ''}
    ${satir('Geçen fonksiyon', gecenFn || '<span class="soluk">Yok</span>')}
    ${gecmeyen ? satir('Geçmeyen', gecmeyen) : ''}
    ${r.sartliImzalar?.length ? satir('İmza isteyen', esc(r.sartliImzalar.join(', '))) : ''}
    ${satir('Görüldü', `${esc(new Date(r.zaman).toLocaleString(YEREL))}${r.blok ? ` · blok ${esc(r.blok)}` : ''}`)}
  </td></tr>`;
}

function mintAksiyon(r, acik = false) {
  // Sırada ya da araştırılıyorsa düğme bunu yenilemeler arasında da gösterir
  const sirada = ajanSirada.has(String(r.adres).toLowerCase());
  const arastir = `<button type="button" class="dugme" data-ajan-arastir="${esc(r.adres)}"${sirada ? ' disabled' : ''}>${sirada ? 'Araştırılıyor…' : 'Araştır'}</button>`;
  const ayrinti = (r.kasa ? `<button type="button" class="dugme ana" data-kasa-analiz="${esc(r.adres)}">Kasa analizi</button> ` : '')
    + `<button type="button" class="dugme ayrinti-dugme" data-mint-ayrinti="${esc(r.adres)}" aria-expanded="${acik}">${acik ? 'Kapat' : 'Ayrıntı'}</button>`;
  if (r.sonuc === 'UCRETSIZ' || r.sonuc === 'NEREDEYSE-UCRETSIZ' || r.sonuc === 'UCRETLI') {
    return `<div class="mint-aksiyon"><button type="button" class="dugme${r.mintEdildi ? '' : ' ana'}" data-mint-et="${esc(r.adres)}">${r.mintEdildi ? 'Bir tane daha' : 'Mint et'}</button> ${arastir} ${ayrinti}</div>`;
  }
  if (r.sartliImzalar?.length) return `<div class="mint-aksiyon"><span class="soluk" title="Bu mint sitenin imzasını istiyor, sadece kendi sitesinden yapılabilir">Siteden</span> ${arastir} ${ayrinti}</div>`;
  return `<div class="mint-aksiyon">${arastir} ${ayrinti}</div>`;
}

// ---------- Mint et: hazırla -> özet -> onay -> gönder ----------
async function mintHazirla(adres, bnb = null) {
  const k = $('mint-taslak');
  $('mint-modal').hidden = false;
  k.innerHTML = '<span class="soluk">Kontrat yeniden inceleniyor, Binance preview alınıyor…</span>';
  try {
    mintTaslakCiz(await api('/api/mintler/hazirla', { adres, bnb }));
  } catch (e) {
    k.innerHTML = `<h2 class="kart-baslik">Mint hazırlanamadı</h2><p class="hata">${esc(e.message)}</p><div class="satir-dugmeler"><button type="button" class="dugme" data-mint-kapat>Kapat</button></div>`;
  }
}

function mintTaslakCiz(t) {
  const k = $('mint-taslak');
  const degisim = t.bakiyeDegisimleri.length ? t.bakiyeDegisimleri.map((b) => `<div>${b.degisim > 0 ? '+' : ''}${esc(sayiYaz(b.degisim, 8))} ${esc(b.sembol || b.tur)}${b.tokenId ? ` #${esc(b.tokenId)}` : ''} <span class="adres">${esc(b.kontrat)}</span></div>`).join('') : '<span class="soluk">Yok</span>';
  k.innerHTML = `
    <h2 class="kart-baslik">Mint özeti</h2>
    <table class="ozet-tablo"><tbody>
      <tr><td class="soluk">Koleksiyon</td><td>${esc(t.ad || '?')}${t.sembol ? ` (${esc(t.sembol)})` : ''}<div class="adres">${esc(t.adres)}</div></td></tr>
      <tr><td class="soluk">Çağrılacak</td><td class="mono">${esc(t.imza)}</td></tr>
      <tr><td class="soluk">Gönderilecek BNB</td><td>${esc(bnbKisa(t.bnb))}${t.usd != null ? ` (${esc(usd(t.usd))})` : ''}</td></tr>
      <tr><td class="soluk">Tahmini gas</td><td>${t.gasBnb != null ? esc(bnbKisa(t.gasBnb)) : '?'}</td></tr>
      <tr><td class="soluk">Bakiye değişimi (preview)</td><td>${degisim}</td></tr>
      <tr><td class="soluk">Geçerlilik</td><td>${esc(new Date(t.bitis).toLocaleTimeString(YEREL))} saatine kadar</td></tr>
    </tbody></table>
    ${t.uyarilar.map((u) => `<p class="hata">${esc(u)}</p>`).join('')}
    ${t.appOnayi ? '<p class="soluk">Bu işlem Binance App\'te ayrıca onay isteyecek.</p>' : ''}
    <div class="onay-cubuk" ${t.gonderilebilir ? '' : 'hidden'}>
      <span><b>Gerçek mint:</b> cüzdanından ${esc(bnbKisa(t.bnb))} + gas gidecek. Geri alınamaz. Kendi araştırmanı yap.</span>
      <button type="button" class="dugme tehlike" data-mint-onay="${esc(t.id)}">Evet, mint et</button>
      <button type="button" class="dugme" data-mint-kapat>Vazgeç</button>
    </div>
    ${t.gonderilebilir ? '' : '<div class="satir-dugmeler"><button type="button" class="dugme" data-mint-kapat>Kapat</button></div>'}
    <p id="mint-gonder-sonuc"></p>`;
}

async function mintGonder(id, dugme) {
  dugme.disabled = true;
  const sonuc = $('mint-gonder-sonuc');
  sonuc.textContent = 'Gönderiliyor…';
  try {
    const r = await api('/api/mintler/gonder', { id, onay: true });
    dugme.closest('.onay-cubuk').hidden = true;
    mintlerYenile();
    sonuc.innerHTML = r.durum === 'gonderildi'
      ? `<span class="ok">Mint zincire gönderildi.</span> ${r.txHash ? `<a href="https://bscscan.com/tx/${esc(r.txHash)}" target="_blank" rel="noopener noreferrer">BscScan'de gör</a>` : ''}`
      : '<span class="ok">Binance App\'te onayla.</span> Onaylayınca işlem zincire gider.';
    sonuc.insertAdjacentHTML('afterend', '<div class="satir-dugmeler"><button type="button" class="dugme" data-mint-kapat>Kapat</button></div>');
  } catch (e) {
    sonuc.innerHTML = `<span class="hata">${esc(e.message)}</span>`;
    dugme.disabled = false;
  }
}

document.querySelector('section[data-gorunum=mintler]').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mint-et]');
  if (m) return mintHazirla(m.dataset.mintEt);
  const ka = e.target.closest('[data-kasa-analiz]');
  if (ka) return kasaAc(ka.dataset.kasaAnaliz);
  if (e.target.closest('[data-kasa-kapat]') || e.target === $('kasa-modal')) { $('kasa-modal').hidden = true; return; }
  const km = e.target.closest('[data-kasa-mint]');
  if (km) { $('kasa-modal').hidden = true; return mintHazirla(km.dataset.kasaMint); }
  const ay = e.target.closest('[data-mint-ayrinti]');
  if (ay) {
    const k = ay.dataset.mintAyrinti.toLowerCase();
    if (acikMintler.has(k)) acikMintler.delete(k); else acikMintler.add(k);
    return mintListeCiz();
  }
  const a = e.target.closest('[data-ajan-arastir]');
  if (a) return ajanArastir(a.dataset.ajanArastir, a);
  if (e.target.closest('[data-arastir-kapat]') || e.target === $('arastir-modal')) return arastirModalKapat();
  const am = e.target.closest('[data-arastir-mint]');
  if (am) { arastirModalKapat(); return mintHazirla(am.dataset.arastirMint); }
  const o = e.target.closest('[data-mint-onay]');
  if (o) return mintGonder(o.dataset.mintOnay, o);
  if (e.target.closest('[data-mint-kapat]') || e.target === $('mint-modal')) mintModalKapat();
});

let mintGorulen = null;
async function mintlerYenile() {
  const d = await api('/api/mintler').catch((e) => ({ hata: e.message }));
  if (d.hata) { $('mint-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  const u = d.durum;
  $('mint-durum').innerHTML = u.sonHata
    ? `<span class="hata">${esc(u.sonHata)}</span>`
    : `${u.calisiyor ? 'çalışıyor' : 'durdu'} · son blok ${esc(u.sonBlok ?? '?')} · ${esc(sayiYaz(u.taranan, 0))} blok, ${esc(sayiYaz(u.kontrat, 0))} yeni kontrat tarandı${u.fabrika ? ` (${esc(sayiYaz(u.fabrika, 0))} fabrikadan)` : ''} · ${d.izleme.length} izleniyor`;
  const ucretsizler = d.bulunanlar.filter((r) => !r.mintEdildi && (r.sonuc === 'UCRETSIZ' || r.sonuc === 'NEREDEYSE-UCRETSIZ') && (!bildirimAyar?.sadeceAgentId || r.agentId)).map((r) => `${r.adres}:${r.sonuc}`);
  if (mintGorulen && $('mint-ses').checked && ucretsizler.some((k) => !mintGorulen.has(k))) bip();
  mintGorulen = new Set(ucretsizler);
  if (document.querySelector('section[data-gorunum=mintler]').hidden) return;
  mintSon = d.bulunanlar;
  mintListeCiz();
}

// ---------- Liderler ----------
const LIDER_NOT = {
  kazanc: 'Seçilen sürede en çok gerçekleşmiş kâr eden cüzdanlar.',
  roi: 'Yatırdığına göre en yüksek getiriyi alanlar. Küçük cüzdanlar öne çıkabilir.',
  isabet: 'Kârla kapattığı işlem oranı en yüksek olanlar.',
  hacim: 'En çok alım satım hacmi yapanlar.',
  islem: 'En çok işlem yapanlar. Çoğu bot olabilir.',
  servet: 'Aktif cüzdanların BSC\'deki toplam varlık değeri. İlk açılış yarım dakika kadar sürebilir.',
};
let liderSiralama = depoOku('lider-siralama', 'kazanc');
let liderSon = null;
let liderIstek = 0;
const imzaliUsd = (v) => (v == null ? '?' : `${v < 0 ? '−' : '+'}$${kisaSayi(Math.abs(v))}`);
const zamanFarki = (z) => {
  if (!z) return '?';
  const dk = Math.max(0, Math.round((Date.now() - z) / 60_000));
  return dk < 60 ? `${dk} dk önce` : dk < 1440 ? `${Math.round(dk / 60)} sa önce` : `${Math.round(dk / 1440)} gün önce`;
};

async function liderlerYenile() {
  $('lider-sure').value = depoOku('lider-sure', '7g');
  $('lider-tur').value = depoOku('lider-tur', 'hepsi');
  for (const b of document.querySelectorAll('#lider-siralama [data-siralama]')) b.setAttribute('aria-pressed', String(b.dataset.siralama === liderSiralama));
  $('lider-not').textContent = LIDER_NOT[liderSiralama] || '';
  const no = ++liderIstek;
  $('lider-durum').textContent = 'yükleniyor…';
  const q = new URLSearchParams({ sure: $('lider-sure').value, siralama: liderSiralama, tur: $('lider-tur').value });
  const d = await api(`/api/liderler?${q}`).catch((e) => ({ hata: e.message }));
  if (no !== liderIstek) return;
  if (d.hata) { $('lider-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  liderSon = d;
  $('lider-durum').textContent = `${d.satirlar.length} cüzdan · güncellendi ${new Date(d.guncelleme).toLocaleTimeString(YEREL)}`
    + (d.degerHazir < d.satirlar.length ? ` · varlık değeri ${d.degerHazir}/${d.satirlar.length}` : '');
  liderCiz();
  // Varlık değerleri arka planda dolar: tamamlanana kadar arada bir yenile
  if (d.degerHazir < d.satirlar.length && liderSiralama !== 'servet') setTimeout(() => { if (no === liderIstek && !document.querySelector('section[data-gorunum=liderler]').hidden) liderlerYenile(); }, 8000);
}

function liderCiz() {
  if (!liderSon) return;
  const ara = $('lider-ara').value.trim().toLowerCase();
  const satirlar = liderSon.satirlar.filter((r) => !ara || r.adres.includes(ara) || r.enIyi.some((t) => t.sembol.toLowerCase().includes(ara) || t.kontrat.includes(ara)));
  sabitCiz($('liderler'), satirlar.length ? satirlar.map((r) => `<tr data-cuzdan="${esc(r.adres)}" data-capa="l-${esc(r.adres)}">
    <td>${esc(r.sira)}</td>
    <td><span class="mono">${esc(kisalt(r.adres))}</span><div><a href="https://bscscan.com/address/${esc(r.adres)}" target="_blank" rel="noopener noreferrer">BscScan</a></div></td>
    <td class="${r.kazancUsd >= 0 ? 'kazanc' : 'kayip'}">${esc(imzaliUsd(r.kazancUsd))}</td>
    <td class="${r.roi >= 0 ? 'kazanc' : 'kayip'}">${r.roi == null ? '?' : `%${esc(sayiYaz(r.roi, 1))}`}</td>
    <td>${r.isabet == null ? '?' : `%${esc(sayiYaz(r.isabet, 1))}`}</td>
    <td>${esc(sayiYaz(r.islem, 0))}</td>
    <td>$${esc(kisaSayi(r.hacimUsd))}</td>
    <td>${r.degerUsd == null ? '<span class="soluk">…</span>' : `$${esc(kisaSayi(r.degerUsd))}`}</td>
    <td>${r.enIyi.map((t) => `<div class="lider-token">${esc(t.sembol)} <span class="${t.kazancUsd >= 0 ? 'kazanc' : 'kayip'}">${esc(imzaliUsd(t.kazancUsd))}</span></div>`).join('') || '<span class="soluk">?</span>'}</td>
    <td class="soluk">${esc(zamanFarki(r.sonAktif))}</td>
  </tr>`).join('') : '<tr><td colspan="10" class="soluk">Bu seçime uyan cüzdan yok.</td></tr>');
}

async function liderDetay(adres) {
  const k = $('lider-detay');
  k.hidden = false;
  k.innerHTML = `<p class="soluk">${esc(kisalt(adres))} cüzdanının son işlemleri yükleniyor…</p>`;
  k.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const d = await api(`/api/liderler/cuzdan?adres=${encodeURIComponent(adres)}`).catch((e) => ({ hata: e.message }));
  if (d.hata) { k.innerHTML = `<p class="hata">${esc(d.hata)}</p><button type="button" class="dugme" data-lider-kapat>Kapat</button>`; return; }
  k.innerHTML = `<div class="lider-detay-bas">
      <div><h2 class="kart-baslik">Son işlemler</h2><span class="mono">${esc(d.adres)}</span> · BSC varlığı ${d.degerUsd == null ? '?' : `$${esc(kisaSayi(d.degerUsd))}`}</div>
      <div class="satir-dugmeler"><a class="dugme" href="https://bscscan.com/address/${esc(d.adres)}" target="_blank" rel="noopener noreferrer">BscScan</a><button type="button" class="dugme" data-lider-kapat>Kapat</button></div>
    </div>
    <div class="tablo-kap"><table><thead><tr><th>Zaman</th><th>Yön</th><th>Token</th><th>BNB</th><th>Piyasa değeri</th><th>Bu satıştan K/Z</th></tr></thead><tbody>
    ${d.islemler.length ? d.islemler.map((t) => `<tr>
      <td>${t.txHash ? `<a href="https://bscscan.com/tx/${esc(t.txHash)}" target="_blank" rel="noopener noreferrer">${esc(zamanFarki(t.zaman))}</a>` : esc(zamanFarki(t.zaman))}</td>
      <td class="${t.tur === 'alis' ? 'kazanc' : 'kayip'}">${t.tur === 'alis' ? 'Alış' : 'Satış'}</td>
      <td>${esc(t.sembol)}<div class="adres">${esc(t.kontrat)}</div></td>
      <td>${esc(sayiYaz(t.bnb, 4))}</td>
      <td>$${esc(kisaSayi(t.piyasaDegeri))}</td>
      <td>${t.tur === 'satis' && t.kazancUsd != null ? `<span class="${t.kazancUsd >= 0 ? 'kazanc' : 'kayip'}">${esc(imzaliUsd(t.kazancUsd))}</span>` : '<span class="soluk">·</span>'}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="soluk">Son işlem bulunamadı.</td></tr>'}
    </tbody></table></div>
    <p class="not">Tokenlerin çoğu çok düşük piyasa değerli meme tokenleri. Kontrat adresini almadan önce Portföy ya da Mintler'deki güvenlik kontrollerinden geçir.</p>`;
}

$('lider-siralama').addEventListener('click', (e) => {
  const b = e.target.closest('[data-siralama]');
  if (!b) return;
  liderSiralama = b.dataset.siralama;
  depoYaz('lider-siralama', liderSiralama);
  liderlerYenile();
});
for (const id of ['lider-sure', 'lider-tur']) $(id).addEventListener('change', (e) => { depoYaz(id, e.target.value); liderlerYenile(); });
$('lider-ara').addEventListener('input', liderCiz);
document.querySelector('section[data-gorunum=liderler]').addEventListener('click', (e) => {
  if (e.target.closest('[data-lider-kapat]')) { $('lider-detay').hidden = true; return; }
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr[data-cuzdan]');
  if (tr) liderDetay(tr.dataset.cuzdan);
});

// ---------- Ayarlar: .env değerleri ----------
let uygSon = null;
let uygBekleyen = null;
let uygOto = null;
const SECIM_ADLARI = { MOD: { sim: 'Simülasyon (sim)', live: 'Canlı (live)' }, CANLI_ISLEM: { 0: 'Kapalı: işlem gönderilmez', 1: 'Açık: gerçek işlem gönderilir' } };

async function uygYenile() {
  const [d, a] = await Promise.all([api('/api/ayarlar/uygulama').catch((e) => ({ hata: e.message })), api('/api/ajan').catch(() => null)]);
  if (d.hata) { $('uyg-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  uygSon = d;
  const f = $('uyg-form');
  for (const grup of ['limit', 'ajan', 'sistem']) {
    const kap = f.querySelector(`[data-grup="${grup}"]`);
    for (const el of kap.querySelectorAll('[data-env]')) el.remove();
    kap.insertAdjacentHTML('beforeend', d.alanlar.filter((x) => x.grup === grup).map((x) => {
      const girdi = x.tur === 'secim'
        ? `<select name="${esc(x.anahtar)}" data-env>${x.secenekler.map((o) => `<option value="${esc(o)}"${o === x.deger ? ' selected' : ''}>${esc(SECIM_ADLARI[x.anahtar]?.[o] || o)}</option>`).join('')}</select>`
        : `<input name="${esc(x.anahtar)}" value="${esc(x.deger)}" ${x.tur === 'sayi' || x.tur === 'tamsayi' ? 'inputmode="decimal"' : 'class="mono"'} data-env>`;
      const genis = ['url', 'urller', 'model'].includes(x.tur) ? ' class="genis"' : '';
      return `<label${genis} data-env title="${esc(x.aciklama)}">${esc(x.etiket)}${x.birim ? ` <span class="soluk">(${esc(x.birim)})</span>` : ''}${girdi}`
        + `<span class="uyg-not${x.yenidenBaslat ? ' uyg-bekliyor' : ''}">${x.yenidenBaslat ? `Yeniden başlatınca: şu an ${esc(x.calisan || 'boş')}` : esc(x.aciklama)}</span></label>`;
    }).join(''));
  }
  uygOto = a?.ayar?.gunlukOtoMint ?? null;
  if (uygOto != null && document.activeElement !== f.gunlukOtoMint) f.gunlukOtoMint.value = uygOto;
  $('uyg-baslat').hidden = !d.yenidenBaslatGerekli;
  const deg = (k) => d.alanlar.find((x) => x.anahtar === k)?.calisan;
  $('uyg-durum').textContent = `işlem başı ${deg('ISLEM_BASI_MAX_BNB')} BNB · günlük ${deg('GUNLUK_MAX_BNB')} BNB · ${deg('MOD') === 'live' && deg('CANLI_ISLEM') === '1' ? 'gerçek işlem açık' : 'gerçek işlem kapalı'}`;
}

// Limit yükseltme ve gerçek işlemi açma ayrı onay ister
function uygRiskler(yeni) {
  const eski = Object.fromEntries(uygSon.alanlar.map((x) => [x.anahtar, x.deger]));
  const r = [];
  for (const k of ['ISLEM_BASI_MAX_BNB', 'GUNLUK_MAX_BNB', 'BASIM_ONALIM_MAX_BNB', 'BASIM_UCRET_MAX_BNB']) {
    if (k in yeni && Number(yeni[k]) > Number(eski[k])) r.push(`${uygSon.alanlar.find((x) => x.anahtar === k).etiket}: ${eski[k]} → ${yeni[k]} BNB`);
  }
  if (yeni.CANLI_ISLEM === '1' && eski.CANLI_ISLEM !== '1') r.push('Gerçek işlem açılıyor');
  if (yeni.MOD === 'live' && eski.MOD !== 'live') r.push('Canlı moda geçiliyor');
  return r;
}

async function uygKaydet(degisen, gunlukOtoMint) {
  try {
    if (Object.keys(degisen).length) await api('/api/ayarlar/uygulama', degisen);
    if (gunlukOtoMint != null) await api('/api/ajan/ayar', { gunlukOtoMint });
    $('uyg-mesaj').innerHTML = '<span class="ok">Kaydedildi</span>';
    uygYenile();
    ajanYenile(true);
  } catch (e) { $('uyg-mesaj').innerHTML = `<span class="hata">${esc(e.message)}</span>`; }
}

$('uyg-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!uygSon) return;
  const f = $('uyg-form');
  const degisen = {};
  for (const el of f.querySelectorAll('[data-env][name]')) {
    const x = uygSon.alanlar.find((a) => a.anahtar === el.name);
    if (x && el.value.trim() !== x.deger) degisen[el.name] = el.value.trim();
  }
  const oto = Number(f.gunlukOtoMint.value);
  const otoDegisti = uygOto != null && oto !== uygOto ? oto : null;
  if (!Object.keys(degisen).length && otoDegisti == null) { $('uyg-mesaj').textContent = 'Değişiklik yok'; return; }
  const riskler = uygRiskler(degisen);
  if (riskler.length) {
    uygBekleyen = { degisen, otoDegisti };
    $('uyg-onay-metin').innerHTML = `<b>Onay gerekiyor:</b> ${riskler.map(esc).join(' · ')}. Daha yüksek limitlerle terminal ve ajanlar senin adına daha fazla BNB harcayabilir.`;
    $('uyg-onay').hidden = false;
    return;
  }
  uygKaydet(degisen, otoDegisti);
});
$('uyg-onay-evet').addEventListener('click', () => { $('uyg-onay').hidden = true; if (uygBekleyen) uygKaydet(uygBekleyen.degisen, uygBekleyen.otoDegisti); uygBekleyen = null; });
$('uyg-onay-hayir').addEventListener('click', () => { $('uyg-onay').hidden = true; uygBekleyen = null; $('uyg-mesaj').textContent = 'Vazgeçildi'; });
$('uyg-baslat-evet').addEventListener('click', async (e) => {
  e.target.disabled = true;
  $('uyg-mesaj').textContent = 'Yeniden başlatılıyor…';
  try { await api('/api/ayarlar/yeniden-baslat', { onay: true }); } catch { /* bağlantı kopabilir */ }
  // Sunucu kapanıp açılana kadar bekle, sonra sayfayı yenile
  await new Promise((r) => setTimeout(r, 2500));
  for (let i = 0; i < 40; i++) {
    try { await api('/api/ayarlar/uygulama'); location.reload(); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  $('uyg-mesaj').innerHTML = '<span class="hata">Sunucu açılmadı. Masaüstündeki simgeyle başlat.</span>';
});

// ---------- Ayarlar: bildirimler ----------
let bildirimAyar = null;
async function bildirimYenile() {
  const d = await api('/api/ayarlar/bildirim').catch((e) => ({ hata: e.message }));
  if (d.hata) { $('bildirim-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  bildirimCiz(d);
}

function bildirimCiz(d) {
  bildirimAyar = d.ayar;
  const f = $('bildirim-form');
  const a = d.ayar;
  f.acik.checked = a.acik; f.ses.checked = a.ses; f.sadeceAgentId.checked = a.sadeceAgentId;
  // Odaktaki alanın üzerine yazma: kullanıcı yazarken değer kaybolmasın
  if (document.activeElement !== f.saatlikMax) f.saatlikMax.value = a.saatlikMax;
  f['sessiz.acik'].checked = a.sessiz.acik; f['sessiz.bas'].value = a.sessiz.bas; f['sessiz.bit'].value = a.sessiz.bit;
  $('bildirim-kategoriler').innerHTML = Object.entries(d.kategoriler).map(([k, ad]) => `<label class="secim"><input type="checkbox" data-kategori="${esc(k)}"${a.kategoriler[k] ? ' checked' : ''}> ${esc(ad)}</label>`).join('');
  for (const el of f.querySelectorAll('[data-ses]')) el.checked = $(el.dataset.ses).checked;
  $('bildirim-durum').textContent = !a.acik ? 'bildirimler kapalı' : `son bir saatte ${d.sonSaat}/${a.saatlikMax} bildirim`;
  $('bildirim-gecmis').innerHTML = d.gecmis.length ? d.gecmis.map((g) => `<tr>
    <td class="soluk">${esc(new Date(g.zaman).toLocaleString(YEREL))}</td>
    <td>${esc(g.baslik)}${g.govde ? `<div class="soluk">${esc(g.govde)}</div>` : ''}</td>
    <td>${g.gonderildi ? '<span class="kazanc">Gönderildi</span>' : `<span class="soluk">Susturuldu: ${esc(g.sebep)}</span>`}</td>
  </tr>`).join('') : '<tr><td colspan="3" class="soluk">Bu oturumda henüz bildirim yok</td></tr>';
}

async function bildirimKaydet() {
  const f = $('bildirim-form');
  const kategoriler = Object.fromEntries([...f.querySelectorAll('[data-kategori]')].map((el) => [el.dataset.kategori, el.checked]));
  const govde = {
    acik: f.acik.checked, ses: f.ses.checked, sadeceAgentId: f.sadeceAgentId.checked, saatlikMax: Number(f.saatlikMax.value),
    kategoriler, sessiz: { acik: f['sessiz.acik'].checked, bas: f['sessiz.bas'].value, bit: f['sessiz.bit'].value },
  };
  const d = await api('/api/ayarlar/bildirim', govde).catch((e) => ({ hata: e.message }));
  if (d.hata) { $('bildirim-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  bildirimCiz(d);
  $('bildirim-durum').textContent += ' · kaydedildi';
}

$('bildirim-form').addEventListener('change', (e) => {
  const ses = e.target.closest('[data-ses]');
  if (ses) {
    // Siper ve Mintler sekmelerindeki asıl kutuyu değiştirir: onların kendi kaydı çalışır
    const asil = $(ses.dataset.ses);
    asil.checked = ses.checked;
    asil.dispatchEvent(new Event('input'));
    asil.dispatchEvent(new Event('change'));
    return;
  }
  bildirimKaydet();
});
$('bildirim-form').addEventListener('submit', (e) => e.preventDefault());
$('bildirim-dene').addEventListener('click', async () => {
  await api('/api/ayarlar/bildirim/dene', {}).catch(() => null);
  bildirimYenile();
});
setInterval(() => { if (!document.querySelector('section[data-gorunum=ayarlar]').hidden) bildirimYenile(); }, 10_000);
api('/api/ayarlar/bildirim').then((d) => { bildirimAyar = d.ayar; }).catch(() => {});

// ---------- Mint filtreleri ----------
const MINT_GRUP_NOT = {
  hazir: 'Simülasyonu geçen ve risk işareti olmayan mintler. Yine de "Mint et" önce Binance önizlemesinden geçer.',
  riskli: 'Somut risk işareti olanlar: ajan "atla" dedi, dolandırıcılık işareti buldu, site cüzdan izni istiyor ya da Binance önizlemesi risk gördü. Mint etme.',
  gecmiyor: 'Simülasyonda ya da Binance önizlemesinde geçmeyenler. Kontrat açılırsa takip yeniden dener ve buradan çıkar.',
  bitti: 'Arzı tükenen, kotası dolan, kapanan ya da hakkını kullandığın mintler.',
  izleniyor: 'Henüz açılmamış ya da sitenin imzasını isteyen mintler.',
  edildi: 'Bu terminalden ya da başka yoldan mint ettiklerin.',
  hepsi: 'Bulunan her şey.',
};
let mintSon = [];
let mintGrup = depoOku('mint-grup', 'hazir');
let mintTur = depoOku('mint-tur', 'nft') === 'token' ? 'token' : 'nft';
let mintGoster = 30;
// Ajan kuyruğundaki ve araştırılan kontratlar: "Araştır" düğmesi yenilemelerde durumunu korur
const ajanSirada = new Set();
const mintTuru = (r) => (r.tur === 'token' ? 'token' : 'nft');

function mintListeCiz() {
  // Önce tür (NFT / Token), sonra grup: sayılar seçili türe göre
  const turdekiler = mintSon.filter((r) => mintTuru(r) === mintTur);
  $('mint-tur-nft').textContent = `(${mintSon.filter((r) => mintTuru(r) === 'nft').length})`;
  $('mint-tur-token').textContent = `(${mintSon.filter((r) => mintTuru(r) === 'token').length})`;
  const sayim = Object.fromEntries(Object.keys(MINT_GRUP_NOT).map((g) => [g, 0]));
  for (const r of turdekiler) sayim[r.filtre?.grup || 'izleniyor']++;
  sayim.hepsi = turdekiler.length;
  for (const b of document.querySelectorAll('#mint-filtre [data-grup]')) {
    b.setAttribute('aria-pressed', String(b.dataset.grup === mintGrup));
    b.querySelector('span').textContent = sayim[b.dataset.grup];
  }
  $('mint-filtre-not').textContent = MINT_GRUP_NOT[mintGrup] || '';
  const ara = $('mint-ara').value.trim().toLowerCase();
  const bedava = $('mint-sadece-bedava').checked;
  const kimliksizGizle = $('mint-kimliksiz-gizle').checked;
  const satirlar = turdekiler.filter((r) => {
    if (mintGrup !== 'hepsi' && (r.filtre?.grup || 'izleniyor') !== mintGrup) return false;
    if (bedava && r.sonuc !== 'UCRETSIZ') return false;
    if (kimliksizGizle && r.filtre?.kimliksiz) return false;
    if (ara && ![r.ad, r.sembol, r.adres].some((x) => String(x || '').toLowerCase().includes(ara))) return false;
    return true;
  });
  // Hazır listesinde ücretsizler önce, sonra yeniler
  if (mintGrup === 'hazir') satirlar.sort((a, b) => (a.sonuc === 'UCRETSIZ' ? 0 : 1) - (b.sonuc === 'UCRETSIZ' ? 0 : 1) || b.zaman - a.zaman);
  // Uzun liste parça parça: önce 30 satır, "Daha fazla" ile 30'ar artar
  const gosterilen = satirlar.slice(0, mintGoster);
  const kalan = satirlar.length - gosterilen.length;
  $('mint-daha').hidden = kalan <= 0;
  $('mint-daha').textContent = `Daha fazla göster (${kalan} kaldı)`;
  sabitCiz($('mintler'), gosterilen.length ? gosterilen.map(mintSatir).join('')
    : turdekiler.length ? '<tr><td colspan="5" class="soluk">Bu filtreye uyan mint yok.</td></tr>'
    : mintSon.length ? `<tr><td colspan="5" class="soluk">Henüz ${mintTur === 'token' ? 'token' : 'NFT'} mint'i bulunmadı.</td></tr>`
    : '<tr><td colspan="5" class="soluk">Henüz bir şey bulunmadı. Takip yeni blokları tarıyor, ilk bulgu biraz sürebilir.</td></tr>');
}

document.querySelector(`#mint-tur input[value="${mintTur}"]`).checked = true;
$('mint-tur').addEventListener('change', (e) => { mintTur = e.target.value; depoYaz('mint-tur', mintTur); mintGoster = 30; mintListeCiz(); });
$('mint-daha').addEventListener('click', () => { mintGoster += 30; mintListeCiz(); });
// Ajan ayarları katlanır: son durumu hatırlanır
$('ajan-ayar-kat').open = depoOku('ajan-ayar-acik', false);
$('ajan-ayar-kat').addEventListener('toggle', (e) => depoYaz('ajan-ayar-acik', e.target.open));
$('mint-filtre').addEventListener('click', (e) => {
  const b = e.target.closest('[data-grup]');
  if (!b) return;
  mintGrup = b.dataset.grup;
  depoYaz('mint-grup', mintGrup);
  mintGoster = 30;
  mintListeCiz();
});
$('mint-ara').addEventListener('input', () => { mintGoster = 30; mintListeCiz(); });
for (const id of ['mint-sadece-bedava', 'mint-kimliksiz-gizle']) {
  $(id).checked = depoOku(id, false);
  $(id).addEventListener('change', (e) => { depoYaz(id, e.target.checked); mintListeCiz(); });
}

$('mint-kontrol-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bnb = $('mint-kontrol-bnb').value.trim();
  if (bnb) { $('mint-kontrol-sonuc').hidden = true; return mintHazirla($('mint-kontrol-adres').value.trim(), bnb); }
  const k = $('mint-kontrol-sonuc');
  $('mint-kontrol-btn').disabled = true;
  k.hidden = false; k.innerHTML = '<span class="soluk">Kontrat inceleniyor, mintler simüle ediliyor…</span>';
  try {
    const r = await api('/api/mintler/kontrol', { adres: $('mint-kontrol-adres').value.trim() });
    // Elle kontrol edilen kontratın ayrıntıları açık gelir
    acikMintler.add(String(r.adres).toLowerCase());
    k.innerHTML = `<div class="tablo-kap"><table><thead><tr><th>Durum</th><th>Koleksiyon</th><th>Ücret</th><th>Basılan</th><th></th></tr></thead><tbody>${mintSatir(r)}</tbody></table></div>`
      + (r.sahip ? `<p class="not">Kontrat sahibi: <span class="adres">${esc(r.sahip)}</span></p>` : '');
  } catch (err) { k.innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
  finally { $('mint-kontrol-btn').disabled = false; }
});
// ---------- Ajanlar: araştırma raporları ve otomatik mint ayarı ----------
const KARAR = {
  'otomatik-mint': ['Otomatik mint', 'ucretsiz'], 'onay-bekle': ['Onayını bekliyor', 'ucuz'],
  atla: ['Şüpheli, atlandı', 'agent'], izle: ['İzleniyor', 'izle'],
};
let ajanAyar = null;
// "nvidia/nemotron-3.5-super-vl:free,dots..." -> "nemotron-3.5-super-vl (ücretsiz) +2 yedek"
const modelKisa = (m) => {
  if (!m) return 'yok';
  const l = String(m).split(',');
  const ilk = l[0].split('/').pop().replace(/:free$/, ' (ücretsiz)');
  return l.length > 1 ? `${ilk} +${l.length - 1} yedek` : ilk;
};

function puanHucre(x, ekstra = '') {
  if (!x) return '<span class="soluk">Yok</span>';
  return `<b>${esc(x.puan)}</b>/100 ${ekstra}<div class="soluk">${esc(x.ozet)}</div>`;
}

function ajanRaporSatir(r) {
  const [etiket, sinif] = KARAR[r.karar?.eylem] || [r.karar?.eylem || '?', ''];
  const site = r.veri?.site ? `<a href="${esc(r.veri.site)}" target="_blank" rel="noopener noreferrer">site</a>${r.veri.kontratSitede ? ' · kontrat sitede ✓' : ''}` : '';
  const sosyal = r.sosyal?.xHesabi ? `@${esc(r.sosyal.xHesabi)}${r.sosyal.takipciTahmini >= 0 ? ` · ${esc(sayiYaz(r.sosyal.takipciTahmini, 0))} takipçi` : ''}` : '';
  const mint = r.mint ? `<div>${r.mint.txHash ? `<a href="https://bscscan.com/tx/${esc(r.mint.txHash)}" target="_blank" rel="noopener noreferrer">Mint işlemi</a> · ${esc(r.mint.durum)}` : `<span class="hata">Mint: ${esc(r.mint.sebep || r.mint.durum)}</span>`}</div>` : '';
  const isaretler = [...(r.site?.supheliIsaretler || []), ...(r.sosyal?.dolandiricilikIsaretleri || [])].slice(0, 4);
  const belirsiz = (r.sosyal?.dogrulanamayanlar || []).slice(0, 3);
  return `<tr data-capa="r-${esc(r.adres)}">
    <td>${esc(r.ad || '?')}${r.sembol ? ` (${esc(r.sembol)})` : ''}<div class="adres">${esc(r.adres)}</div><span class="soluk">${esc(new Date(r.zaman).toLocaleString(YEREL))}</span></td>
    <td><span class="mint-rozet ${sinif}">${esc(etiket)}</span>${mint}${r.karar?.eylem === 'onay-bekle' ? `<div class="mint-aksiyon"><button type="button" class="dugme ana" data-mint-et="${esc(r.adres)}">Mint et</button></div>` : ''}</td>
    <td>${puanHucre(r.site, site)}</td>
    <td>${puanHucre(r.sosyal, sosyal)}</td>
    <td class="mint-fn">${(r.karar?.sebepler || []).map((x) => `<div>${esc(x)}</div>`).join('')}${isaretler.map((x) => `<div class="hata">⚠ ${esc(x)}</div>`).join('')}${belirsiz.map((x) => `<div class="soluk">? ${esc(x)}</div>`).join('')}${(r.suzgec?.notlar || []).map((x) => `<div class="soluk">${esc(x)}</div>`).join('')}${r.suzgec && !r.suzgec.riskler.length ? '<div class="soluk">Süzgeç temiz: OKX taramaları ve site kontrolü</div>' : ''}${(r.hatalar || []).map((x) => `<div class="soluk">${esc(x)}</div>`).join('')}</td>
  </tr>`;
}

function ajanFormDoldur(a) {
  const f = $('ajan-form');
  f.otomatikMint.checked = a.otomatikMint;
  f.sadeceAgentId.checked = a.sadeceAgentId !== false;
  f.llmArastirma.checked = a.llmArastirma !== false;
  for (const k of ['gunlukOtoMint', 'webSonuc']) if (document.activeElement !== f[k]) f[k].value = a[k];
}

async function ajanYenile(formuDoldur = false) {
  const d = await api('/api/ajan').catch((e) => ({ hata: e.message }));
  if (d.hata) { $('ajan-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  if (formuDoldur || !ajanAyar) ajanFormDoldur(d.ayar);
  if (formuDoldur || !ajanAyar) { ajanAnahtarCiz(d); aramaAnahtarCiz(d); }
  ajanAyar = d.ayar;
  const onceki = [...ajanSirada].sort().join();
  ajanSirada.clear();
  for (const a of [...d.kuyruk, d.calisan].filter(Boolean)) ajanSirada.add(String(a).toLowerCase());
  if ([...ajanSirada].sort().join() !== onceki) mintListeCiz();
  const s = d.sayac;
  $('ajan-durum').innerHTML = (d.anahtarVar
    ? d.ayar.llmArastirma === false ? `LLM araştırması kapalı: ücretsiz süzgeç (OKX taramaları, site kodu, taklit adı) · bugün ${esc(usd(Number.isFinite(s.maliyet) ? s.maliyet : 0))}` : `Araştırma: ${esc(modelKisa(d.modeller.site))} · hakem: ${esc(modelKisa(d.modeller.hakem))} · web araması: ${{ brave: 'Brave (ücretsiz)', openrouter: 'OpenRouter (ücretli)', kapali: 'kapalı' }[d.arama?.kaynak] || '?'} · bugün ${esc(s.arastirma)}/${esc(d.gunlukArastirmaMax)} araştırma · ${esc(usd(Number.isFinite(s.maliyet) ? s.maliyet : 0))}`
    : '<span class="hata">OpenRouter anahtarı yok: sadece zincir ve site verisi toplanır, LLM araştırması yapılmaz</span>')
    + ` · otomatik mint ${d.ayar.otomatikMint ? `<b>açık</b> (bugün ${esc(s.otoMint)}/${esc(d.ayar.gunlukOtoMint)})` : 'kapalı'}`
    + (d.calisan ? ` · araştırılıyor: <span class="mono">${esc(kisalt(d.calisan))}</span>` : '') + (d.kuyruk.length ? ` · sırada ${esc(d.kuyruk.length)}` : '');
  if (document.querySelector('section[data-gorunum=mintler]').hidden) return;
  sabitCiz($('ajan-raporlar'), d.raporlar.length ? d.raporlar.map(ajanRaporSatir).join('') : '<tr><td colspan="5" class="soluk">Henüz araştırma yok</td></tr>');
}

function aramaAnahtarCiz(d) {
  const a = d.arama || {};
  $('arama-anahtar-durum').innerHTML = a.kaynak === 'brave' ? `Kayıtlı: <span class="mono">${esc(a.ipucu || '?')}</span> · arama ücretsiz`
    : a.kaynak === 'openrouter' ? 'Anahtar yok: arama OpenRouter üzerinden ücretli' : 'Anahtar yok: web araması kapalı';
  $('arama-anahtar-sil').hidden = a.kaynak !== 'brave';
}

$('arama-anahtar-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alan = $('arama-anahtar');
  $('arama-anahtar-durum').textContent = 'Anahtar deneniyor…';
  try { aramaAnahtarCiz(await api('/api/ajan/arama-anahtari', { anahtar: alan.value.trim() })); alan.value = ''; ajanYenile(); }
  catch (err) { $('arama-anahtar-durum').innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
});
$('arama-anahtar-sil').onclick = async () => {
  try { aramaAnahtarCiz(await api('/api/ajan/arama-anahtari', { anahtar: '' })); ajanYenile(); } catch (err) { $('arama-anahtar-durum').innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
};

function ajanAnahtarCiz(d) {
  $('ajan-anahtar-durum').innerHTML = d.anahtarVar ? `Kayıtlı: <span class="mono">${esc(d.anahtarIpucu || '?')}</span>` : 'Anahtar yok';
  $('ajan-anahtar-sil').hidden = !d.anahtarVar;
}

$('ajan-anahtar-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alan = $('ajan-anahtar');
  try {
    ajanAnahtarCiz(await api('/api/ajan/anahtar', { anahtar: alan.value.trim() }));
    alan.value = '';
    ajanYenile();
  } catch (err) { $('ajan-anahtar-durum').innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
});
$('ajan-anahtar-sil').onclick = async () => {
  try { ajanAnahtarCiz(await api('/api/ajan/anahtar', { anahtar: '' })); ajanYenile(); } catch (err) { $('ajan-anahtar-durum').innerHTML = `<span class="hata">${esc(err.message)}</span>`; }
};

// Araştır: pencere açılır, araştırma bitene kadar durum gösterilir, sonra karar ve nedenleri
let arastirmaYoklama = null;
async function ajanArastir(adres, dugme) {
  dugme.disabled = true;
  dugme.textContent = 'Araştırılıyor…';
  ajanSirada.add(adres.toLowerCase());
  const k = $('arastir-icerik');
  $('arastir-modal').hidden = false;
  k.innerHTML = '<h2 class="kart-baslik">Araştırılıyor</h2><p class="soluk" id="arastir-durum">Sıraya alınıyor…</p>';
  const baslangic = Date.now();
  try {
    await api('/api/ajan/arastir', { adres });
    ajanYenile();
  } catch (e) {
    ajanSirada.delete(adres.toLowerCase());
    dugme.disabled = false;
    dugme.textContent = 'Araştır';
    k.innerHTML = `<h2 class="kart-baslik">Araştırılamadı</h2><p class="hata">${esc(e.message)}</p><div class="satir-dugmeler"><button type="button" class="dugme" data-arastir-kapat>Kapat</button></div>`;
    return;
  }
  clearInterval(arastirmaYoklama);
  const yokla = async () => {
    if ($('arastir-modal').hidden) { clearInterval(arastirmaYoklama); return; }
    const d = await api(`/api/ajan/rapor?adres=${encodeURIComponent(adres)}`).catch(() => null);
    if (!d) return;
    // Bu tıklamadan sonra yazılmış bir rapor gelince sonuç gösterilir
    if (d.durum === 'bitti' && d.rapor && d.rapor.zaman >= baslangic - 1000) {
      clearInterval(arastirmaYoklama);
      arastirmaSonucCiz(d.rapor);
      mintlerYenile();
      return;
    }
    const sn = Math.round((Date.now() - baslangic) / 1000);
    $('arastir-durum').textContent = d.durum === 'sirada' ? `Sırada: önünde ${d.sira - 1} kontrat var · ${sn} sn` : `Kontrat inceleniyor, güvenlik taramaları yapılıyor · ${sn} sn`;
    if (Date.now() - baslangic > 180_000) {
      clearInterval(arastirmaYoklama);
      $('arastir-durum').textContent = 'Araştırma uzun sürdü. Sonuç bitince Ajanlar kartındaki "Son kararlar" tablosunda görünür.';
    }
  };
  arastirmaYoklama = setInterval(yokla, 2000);
  yokla();
}

function arastirmaSonucCiz(r) {
  const [etiket, sinif] = KARAR[r.karar?.eylem] || [r.karar?.eylem || '?', ''];
  const satir = (baslik, deger) => (deger ? `<tr><td>${esc(baslik)}</td><td>${deger}</td></tr>` : '');
  const liste = (xs, sinifAdi = '') => xs.map((x) => `<div class="${sinifAdi}">${esc(x)}</div>`).join('');
  const sz = r.suzgec;
  const mint = r.mint
    ? (r.mint.txHash ? `<span class="ok">Otomatik mint gönderildi</span> · <a href="https://bscscan.com/tx/${esc(r.mint.txHash)}" target="_blank" rel="noopener noreferrer">BscScan</a>` : `<span class="hata">${esc(r.mint.sebep || r.mint.durum)}</span>`)
    : '';
  const mintEdilebilir = !r.mint?.txHash && r.karar?.eylem !== 'atla' && ['UCRETSIZ', 'NEREDEYSE-UCRETSIZ', 'UCRETLI'].includes(r.sonuc);
  $('arastir-icerik').innerHTML = `
    <h2 class="kart-baslik">Araştırma sonucu</h2>
    <div class="arastir-bas"><div><b>${esc(r.ad || r.sembol || 'Adsız')}</b>${r.sembol && r.ad ? ` <span class="soluk">(${esc(r.sembol)})</span>` : ''}<div class="adres">${esc(r.adres)}</div></div>
      <span class="mint-rozet ${sinif}">${esc(etiket)}</span></div>
    <table class="ozet-tablo">
      ${satir('Durum', esc(MINT_SONUC[r.sonuc]?.[0] || r.sonuc))}
      ${satir('Neden', liste(r.karar?.sebepler || []))}
      ${sz ? satir('Güvenlik süzgeci', sz.riskler.length ? liste(sz.riskler, 'hata') : '<span class="ok">Temiz</span>' + (sz.notlar.length ? liste(sz.notlar, 'soluk') : '')) : ''}
      ${satir('Site', r.veri?.site ? `<a href="${esc(r.veri.site)}" target="_blank" rel="noopener noreferrer">${esc(r.veri.site)}</a>${r.veri.kontratSitede ? ' · kontrat sitede ✓' : ''}` : '<span class="soluk">Bulunamadı</span>')}
      ${r.site ? satir('Site ajanı', `<b>${esc(r.site.puan)}</b>/100 · ${esc(r.site.ozet)}`) : ''}
      ${r.sosyal ? satir('Sosyal ajan', `${r.sosyal.xHesabi ? `@${esc(r.sosyal.xHesabi)} · ` : ''}<b>${esc(r.sosyal.puan)}</b>/100 · ${esc(r.sosyal.ozet)}`) : ''}
      ${r.hakem ? satir('Hakem', `Güven <b>${esc(r.hakem.guvenPuani)}</b>/100 · ${esc(r.hakem.ozet)}`) : ''}
      ${satir('Mint', mint)}
      ${(r.hatalar || []).length ? satir('Not', liste(r.hatalar, 'soluk')) : ''}
    </table>
    <div class="satir-dugmeler">
      ${mintEdilebilir ? `<button type="button" class="dugme ana" data-arastir-mint="${esc(r.adres)}">Mint et</button>` : ''}
      <button type="button" class="dugme" data-arastir-kapat>Kapat</button>
    </div>`;
}

// ---------- Kasa kartı analizi ----------
const isaretliBnb = (v, b = 5) => (v == null ? '<span class="soluk">?</span>' : `<span class="${v >= 0 ? 'kazanc' : 'kayip'}">${v >= 0 ? '+' : '−'}${esc(Math.abs(v).toFixed(b))} BNB</span>`);
async function kasaAc(adres) {
  const k = $('kasa-icerik');
  $('kasa-modal').hidden = false;
  k.innerHTML = '<h2 class="kart-baslik">Kasa analizi</h2><p class="soluk">Kasa, pazar ve token verisi okunuyor… (5-10 sn)</p>';
  const d = await api(`/api/kasa/analiz?adres=${encodeURIComponent(adres)}`).catch((e) => ({ hata: e.message }));
  if (d.hata) { k.innerHTML = `<h2 class="kart-baslik">Kasa analizi yapılamadı</h2><p class="hata">${esc(d.hata)}</p><div class="satir-dugmeler"><button type="button" class="dugme" data-kasa-kapat>Kapat</button></div>`; return; }
  const h = d.hesap, p = d.pazar, t = d.tokenPiyasa || {};
  const kalan = d.cuzdanSiniri != null && d.kullanilan != null ? Math.max(0, d.cuzdanSiniri - d.kullanilan) : null;
  const satir = (b, v) => `<tr><td>${esc(b)}</td><td>${v}</td></tr>`;
  k.innerHTML = `
    <h2 class="kart-baslik">Kasa analizi</h2>
    <p class="adres">${esc(d.adres)}</p>
    <div class="pnl-kartlar kasa-kartlar">
      ${pnlKart('Mint', d.mintBnb != null ? `${esc(d.mintBnb)} BNB` : '?', `Cüzdan başı ${esc(d.cuzdanSiniri ?? '?')} · ${kalan != null ? `${esc(kalan)} hakkın kaldı` : ''}`, true)}
      ${pnlKart('Teklife sat', isaretliBnb(h.hemenSatKarBnb), `En iyi teklif ${esc(p.enIyiTeklif ?? '?')} · ${esc(p.teklifAdedi)} kart${h.teklifKosulluOlabilir ? ' · koşullu olabilir' : ''}`)}
      ${pnlKart('İlanla sat', isaretliBnb(h.ilanlaSatKarBnb), `En ucuz ilan ${esc(p.enUcuzIlan ?? '?')} · ${esc(p.ilanSayisi)} ilan`)}
      ${pnlKart('Temettü', h.gunlukTemettuKartBasiBnb != null ? `${esc(h.gunlukTemettuKartBasiBnb.toFixed(5))} BNB/gün` : '?', h.geriOdemeGun != null ? `Maliyeti ≈ ${esc(h.geriOdemeGun.toFixed(1))} günde çıkarır` : 'Token hacmi okunamadı')}
    </div>
    ${h.pazarFarkBnb != null && h.pazarFarkBnb < 0 ? `<p class="kasa-ipucu">Pazardan almak mintlemekten <b>${esc(Math.abs(h.pazarFarkBnb).toFixed(5))} BNB</b> ucuz.</p>` : ''}
    ${h.teklifKosulluOlabilir ? '<p class="soluk kasa-ipucu">En yüksek teklif en ucuz ilandan yüksek: teklifler belirli kartlarla sınırlı olabilir. Temkinli hesap için "İlanla sat"a bak.</p>' : ''}
    <table class="ozet-tablo">
      ${satir('Kasaya gelen vergi', `${esc((d.toplamVergiBnb ?? 0).toFixed(2))} BNB · dağıtılan ${esc((d.odenenTemettuBnb ?? 0).toFixed(2))} · bekleyen ${esc((d.bekleyenVergiBnb ?? 0).toFixed(2))}`)}
      ${satir('Temettüye giden pay', d.temettuPayi != null ? `%${esc((d.temettuPayi * 100).toFixed(0))}` : '?')}
      ${satir('Kart', `${esc(sayiYaz(d.basilan, 0))} basıldı · ağırlık ${esc(sayiYaz(d.agirlik, 0))}${d.partiAcilis ? ` · son parti ${esc(zamanFarki(d.partiAcilis))}` : ''}`)}
      ${satir('Token', `${esc(t.sembol || kisalt(d.token))} · vergi %${esc(d.vergiOraniBps != null ? d.vergiOraniBps / 100 : '?')} · 24s hacim ${t.hacim24sUsd ? `$${esc(kisaSayi(t.hacim24sUsd))}` : '?'} · likidite ${t.likiditeUsd ? `$${esc(kisaSayi(t.likiditeUsd))}` : '?'}`)}
      ${satir('Riskler', d.riskler.length ? d.riskler.map((x) => `<div class="hata">⚠ ${esc(x)}</div>`).join('') : '<span class="ok">Belirgin risk yok</span>')}
    </table>
    <p class="not">Temettü tahmini son 24 saatlik hacmin aynen sürdüğünü varsayar; meme token hacmi genelde hızla düşer. Pazar ücreti hesaba katılmadı. Yatırım tavsiyesi değildir.</p>
    <div class="satir-dugmeler">
      ${d.mintBnb != null && kalan !== 0 ? `<button type="button" class="dugme ana" data-kasa-mint="${esc(d.adres)}">Mint et (önizleme)</button>` : ''}
      <button type="button" class="dugme" data-kasa-kapat>Kapat</button>
    </div>`;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('kasa-modal').hidden) $('kasa-modal').hidden = true; });

function arastirModalKapat() {
  clearInterval(arastirmaYoklama);
  $('arastir-modal').hidden = true;
  $('arastir-icerik').innerHTML = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('arastir-modal').hidden) arastirModalKapat(); });

async function ajanKaydet() {
  const f = $('ajan-form');
  const b = { otomatikMint: f.otomatikMint.checked, sadeceAgentId: f.sadeceAgentId.checked, llmArastirma: f.llmArastirma.checked };
  for (const k of ['gunlukOtoMint', 'webSonuc']) b[k] = Number(f[k].value);
  try {
    await api('/api/ajan/ayar', b);
    $('ajan-mesaj').innerHTML = '<span class="ok">Kaydedildi</span>';
    ajanYenile(true);
  } catch (e) { $('ajan-mesaj').innerHTML = `<span class="hata">${esc(e.message)}</span>`; }
}

// Otomatik mint'i açmak ayrı bir onay ister
$('ajan-kaydet').onclick = () => {
  if ($('ajan-form').otomatikMint.checked && !ajanAyar?.otomatikMint) { $('ajan-onay').hidden = false; $('ajan-onay-evet').focus(); return; }
  ajanKaydet();
};
$('ajan-onay-evet').onclick = () => { $('ajan-onay').hidden = true; ajanKaydet(); };
$('ajan-onay-hayir').onclick = () => { $('ajan-onay').hidden = true; $('ajan-form').otomatikMint.checked = false; };

$('mint-ses').checked = depoOku('mint-ses', false);
$('mint-ses').addEventListener('change', (e) => depoYaz('mint-ses', e.target.checked));

// ---------- HOUND ve BlockHound ----------
let houndIstek = 0;
const BSCSCAN = 'https://bscscan.com';
const houndKim = (adres, agent) => `<a href="${BSCSCAN}/address/${esc(adres)}" target="_blank" rel="noopener noreferrer">${agent ? esc(agent) : `<span class="mono">${esc(kisalt(adres))}</span>`}</a>`;
const houndZaman = (t) => {
  if (!t) return '?';
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'az önce' : s < 3600 ? `${Math.round(s / 60)} dk önce` : s < 86400 ? `${Math.round(s / 3600)} sa önce` : new Date(t).toLocaleDateString(YEREL);
};
const houndHash = (n) => (n == null ? '?' : n >= 1e9 ? `${sayiYaz(n / 1e9, 1)} milyar` : n >= 1e6 ? `${sayiYaz(n / 1e6, 1)} milyon` : sayiYaz(n, 0));

async function houndYenile(yenile = false) {
  const no = ++houndIstek;
  $('hound-durum').textContent = 'zincirden okunuyor…';
  const d = await api(`/api/hound${yenile ? '?yenile=1' : ''}`).catch((e) => ({ hata: e.message }));
  if (no !== houndIstek) return;
  if (d.hata) { $('hound-durum').innerHTML = `<span class="hata">${esc(d.hata)}</span>`; return; }
  $('hound-durum').textContent = `blok ${sayiYaz(d.sonBlok, 0)} · güncellendi ${new Date(d.guncelleme).toLocaleTimeString(YEREL)}`;
  const gelir = d.hound.gelirBnb + d.blockhound.gelirBnb;
  const bekleyen = (d.hound.bekleyenBnb || 0) + (d.blockhound.bekleyenBnb || 0);
  const usd = (b) => (d.bnbUsd && b != null ? ` · $${(b * d.bnbUsd).toFixed(2)}` : '');
  sabitCiz($('hound-genel'), [
    ['Toplam gelir', `${sayiYaz(gelir, 5)} BNB`, `${d.hound.basilan + d.blockhound.basilan} mint${usd(gelir)}`, true],
    ['Kontratta bekleyen', `${sayiYaz(bekleyen, 5)} BNB`, `withdraw() ile kasaya${usd(bekleyen)}`],
    ['Kasa bakiyesi', `${sayiYaz(d.kasa.bnb, 5)} BNB`, `${kisalt(d.kasa.adres)}${usd(d.kasa.bnb)}`],
    ['Sahip', `${sayiYaz(d.hound.sahipSayisi, 0)} · ${sayiYaz(d.blockhound.sahipSayisi, 0)}`, 'HOUND · BlockHound'],
    ['Madenci', `${sayiYaz(d.hound.madenciSayisi, 0)} · ${sayiYaz(d.blockhound.madenciSayisi, 0)}`, 'HOUND · BlockHound'],
  ].map(([b, v, a, ana]) => `<div class="pnl-kart${ana ? ' ana' : ''}"><small>${esc(b)}</small><b>${esc(v)}</b><span>${esc(a)}</span></div>`).join(''));
  sabitCiz($('hound-token'), houndKart(d.hound, d));
  sabitCiz($('hound-nft'), houndKart(d.blockhound, d));
  // CSP satır içi stile izin vermez: boyutlar CSSOM üzerinden verilir
  for (const e of document.querySelectorAll('section[data-gorunum=hound] [data-genislik]')) e.style.width = `${e.dataset.genislik}%`;
  for (const e of document.querySelectorAll('section[data-gorunum=hound] [data-yukseklik]')) e.style.height = `${e.dataset.yukseklik}%`;
}

function houndKart(k, d) {
  const token = k.tur === 'hound';
  const birim = token ? 'HOUND' : 'NFT';
  const ilerleme = k.donemBoyu ? ((k.basilan % k.donemBoyu) / k.donemBoyu) * 100 : 0;
  const enCok = Math.max(1, ...k.saatlik);
  const piyasa = token ? (k.piyasa?.fiyatUsd ? `$${sayiYaz(k.piyasa.fiyatUsd, 8)} · likidite $${kisaSayi(k.piyasa.likiditeUsd || 0)}` : 'Havuz yok') : null;
  const metrik = [
    ['Arz', `${token && k.arz >= 1000 ? kisaSayi(k.arz) : sayiYaz(k.arz, 0)} ${birim}`],
    ['Mint', sayiYaz(k.basilan, 0)],
    ['Sahip', sayiYaz(k.sahipSayisi, 0)],
    ['Zorluk', `${k.zorlukBit} bit`],
    ['Ortalama hash', houndHash(k.ortalamaHash)],
    ['Ücret', `$${k.ucretUsd == null ? '?' : k.ucretUsd.toFixed(2)} · ${sayiYaz(k.ucretBnb, 5)} BNB`],
    ['Gelir', `${sayiYaz(k.gelirBnb, 5)} BNB`],
    ['Son 24 saat', `${k.son24} mint`],
    ['Bende', k.benimki == null ? '?' : `${token && k.benimki >= 1000 ? kisaSayi(k.benimki) : sayiYaz(k.benimki, 0)} ${birim}`],
  ];
  if (piyasa) metrik.push(['Piyasa', piyasa]);
  const tablo = (baslik, bas, satirlar, bos) => `<h3 class="hound-alt-baslik">${baslik}</h3><div class="tablo-kap"><table><thead><tr>${bas.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${satirlar.length ? satirlar.join('') : `<tr><td colspan="${bas.length}" class="soluk">${bos}</td></tr>`}</tbody></table></div>`;
  return `<div class="hound-bas"><div><h2 class="kart-baslik">${esc(k.ad)}</h2><a class="mono soluk" href="${BSCSCAN}/address/${esc(k.adres)}#code" target="_blank" rel="noopener noreferrer">${esc(kisalt(k.adres))}</a></div><span class="mint-rozet ${token ? 'agent' : 'izle'}">${token ? 'ERC-20' : 'ERC-721'}</span></div>
    <div class="metrik hound-metrik">${metrik.map(([b, v]) => `<div><small>${esc(b)}</small><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="hound-donem"><div class="hound-donem-ust"><span>Dönem ${k.donem} · ${k.zorlukBit} bit</span><span class="soluk">zorlaşmaya ${sayiYaz(k.sonrakiZorlasmaya, 0)} mint</span></div>
      <div class="hound-cubuk" role="progressbar" aria-valuenow="${Math.round(ilerleme)}" aria-valuemin="0" aria-valuemax="100" aria-label="Dönem ilerlemesi"><span data-genislik="${ilerleme}"></span></div></div>
    <h3 class="hound-alt-baslik">Son 24 saat, saatlik mint</h3>
    <div class="hound-saatlik" role="img" aria-label="Son 24 saatte saatlik mint sayısı, toplam ${k.son24}">${k.saatlik.map((n, i) => `<span title="${23 - i} saat önce: ${n} mint" data-yukseklik="${n ? Math.max(8, (n / enCok) * 100) : 0}"></span>`).join('')}</div>
    ${!token && k.sonMintler.some((m) => m.gorsel) ? `<div class="hound-galeri">${k.sonMintler.filter((m) => m.gorsel).map((m) => `<figure><img src="${esc(m.gorsel)}" alt="BlockHound #${m.sira + 1}" width="72" height="72" loading="lazy"><figcaption>#${m.sira + 1}</figcaption></figure>`).join('')}</div>` : ''}
    ${tablo('En büyük sahipler', ['Cüzdan', 'Miktar', 'Pay'], k.enBuyukSahipler.map((s) => `<tr><td>${houndKim(s.adres, s.agent)}</td><td>${token ? kisaSayi(s.miktar) : sayiYaz(s.miktar, 0)}</td><td>%${sayiYaz(s.yuzde, 1)}</td></tr>`), 'Henüz sahip yok')}
    ${k.enBuyukSahipler.length ? `<p class="not">İlk 10 cüzdan arzın %${sayiYaz(k.ilk10Yuzde, 1)}'ini tutuyor.</p>` : ''}
    ${tablo('Madenciler', ['Cüzdan', 'Mint'], k.madenciler.map((m) => `<tr><td>${houndKim(m.adres, m.agent)}</td><td>${sayiYaz(m.mint, 0)}</td></tr>`), 'Henüz madenci yok')}
    ${tablo('Son mintler', ['Zaman', 'Madenci', token ? 'Sıra' : 'NFT', 'Zorluk', 'Ücret', 'İşlem'], k.sonMintler.map((m) => `<tr><td>${esc(houndZaman(m.zaman))}</td><td>${houndKim(m.madenci, m.agent)}</td><td>#${token ? m.sira : m.sira + 1}</td><td>${m.bit} bit</td><td>${sayiYaz(m.ucretBnb, 5)}</td><td><a href="${BSCSCAN}/tx/${esc(m.tx)}" target="_blank" rel="noopener noreferrer">BscScan</a></td></tr>`), 'Henüz mint yok')}`;
}

$('hound-yenile').addEventListener('click', () => houndYenile(true));
setInterval(() => { if (!document.querySelector('section[data-gorunum=hound]').hidden) houndYenile(); }, 60_000);

gorunumAc(depoOku('gorunum', 'siper'));
durumYenile(); emirlerYenile(); siperYenile(); otoYenile();
setInterval(durumYenile, 20_000);
setInterval(emirlerYenile, 3_000);
setInterval(siperYenile, 3_000);
setInterval(otoYenile, 3_000);
mintlerYenile();
setInterval(mintlerYenile, 5_000);
ajanYenile(true);
setInterval(ajanYenile, 5_000);
setInterval(() => { if (!document.querySelector('section[data-gorunum=portfoy]').hidden) portfoyYenile(); }, 30_000);


