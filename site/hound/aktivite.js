// Mint aktivitesi: iki koleksiyonun zamana göre birikimli mint sayısı (basamaklı çizgi). Zaman, olayın bloğundan gelir.
// Fare ya da dokunmayla dikey imleç ve o andaki sayılar gösterilir. Tablo görünümü kayıt tablosudur.
const NS = 'http://www.w3.org/2000/svg';
const SERI = [
  { k: 'HOUND', sinif: 'seri-1', nokta: 'nokta-1', ip: 'i1' },
  { k: 'BlockHound', sinif: 'seri-2', nokta: 'nokta-2', ip: 'i2' },
];

const ogeYap = (ad, oz = {}) => {
  const e = document.createElementNS(NS, ad);
  for (const [k, v] of Object.entries(oz)) e.setAttribute(k, v);
  return e;
};

// Y ekseni için tam sayı adımlar: en fazla 4 aralık
function yAdimlar(enCok) {
  const ust = Math.max(4, enCok);
  const adim = Math.max(1, Math.ceil(ust / 4));
  const tavan = Math.ceil(ust / adim) * adim;
  return { tavan, cizgiler: Array.from({ length: tavan / adim + 1 }, (_, i) => i * adim) };
}

// olaylar: [{ ad: 'HOUND' | 'BlockHound', t: ms }], zamanı bilinmeyenler atlanır
export function aktiviteCiz(kap, ipucu, olaylar, { yerel, simdi = Date.now() }) {
  const zamanli = olaylar.filter((o) => o.t).sort((a, b) => a.t - b.t);
  kap.replaceChildren();
  ipucu.hidden = true;
  if (!zamanli.length) return;

  const G = Math.max(300, Math.round(kap.clientWidth || 640));
  const dar = G < 520;
  const Y = dar ? 200 : 240;
  const P = { s: 34, sg: dar ? 16 : 104, u: 14, a: 28 };
  const t0 = zamanli[0].t - Math.max(60_000, (simdi - zamanli[0].t) * 0.04);
  const xOl = (t) => P.s + ((t - t0) / Math.max(1, simdi - t0)) * (G - P.s - P.sg);
  const seriler = SERI.map((s) => ({ ...s, ol: zamanli.filter((o) => o.ad === s.k) }));
  const { tavan, cizgiler } = yAdimlar(Math.max(...seriler.map((s) => s.ol.length)));
  const yOl = (n) => Y - P.a - (n / tavan) * (Y - P.u - P.a);

  const svg = ogeYap('svg', { viewBox: `0 0 ${G} ${Y}`, role: 'img', 'aria-label': seriler.map((s) => `${s.k}: ${s.ol.length}`).join(', ') });
  for (const n of cizgiler) {
    svg.append(ogeYap('line', { class: n ? 'izgara' : 'eksen', x1: P.s, x2: G - P.sg, y1: yOl(n), y2: yOl(n) }));
    const y = ogeYap('text', { class: 'eksen-yazi', x: P.s - 8, y: yOl(n) + 4, 'text-anchor': 'end' });
    y.textContent = String(n);
    svg.append(y);
  }
  // X ekseni: üç etiket. Yarım günden kısa aralıkta saat, birkaç günde tarih ve saat, daha uzunda tarih
  const aralik = simdi - t0;
  const bicim = aralik < 432e5 ? { hour: '2-digit', minute: '2-digit' }
    : aralik < 3 * 864e5 ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' };
  for (const oran of [0, 0.5, 1]) {
    const t = t0 + (simdi - t0) * oran;
    const e = ogeYap('text', { class: 'eksen-yazi', x: xOl(t), y: Y - 8, 'text-anchor': oran === 0 ? 'start' : oran === 1 ? 'end' : 'middle' });
    e.textContent = new Date(t).toLocaleString(yerel, bicim);
    svg.append(e);
  }
  for (const s of seriler) {
    let d = `M${xOl(t0)},${yOl(0)}`;
    s.ol.forEach((o, i) => { d += ` H${xOl(o.t)} V${yOl(i + 1)}`; });
    d += ` H${xOl(simdi)}`;
    svg.append(ogeYap('path', { class: `seri ${s.sinif}`, d }));
    if (!s.ol.length) continue;
    svg.append(ogeYap('circle', { class: `nokta ${s.nokta}`, cx: xOl(simdi), cy: yOl(s.ol.length), r: 4 }));
    // Uçta doğrudan etiket (dar ekranda lejant yeter)
    if (!dar) {
      const e = ogeYap('text', { class: 'eksen-yazi seri-yazi', x: xOl(simdi) + 10, y: yOl(s.ol.length) + 4 });
      e.textContent = `${s.k} ${s.ol.length}`;
      svg.append(e);
    }
  }
  const imlec = ogeYap('line', { class: 'imlec-cizgi', y1: P.u, y2: Y - P.a, visibility: 'hidden' });
  const dokunma = ogeYap('rect', { class: 'dokunma', x: P.s, y: 0, width: G - P.s - P.sg, height: Y });
  svg.append(imlec, dokunma);
  kap.append(svg);

  const goster = (e) => {
    const kutu = svg.getBoundingClientRect();
    const x = Math.min(G - P.sg, Math.max(P.s, ((e.clientX - kutu.left) / kutu.width) * G));
    const t = t0 + ((x - P.s) / (G - P.s - P.sg)) * (simdi - t0);
    imlec.setAttribute('x1', x); imlec.setAttribute('x2', x); imlec.setAttribute('visibility', 'visible');
    const satirlar = seriler.map((s) => `<span class="${s.ip}"></span>${s.k}: <b>${s.ol.filter((o) => o.t <= t).length}</b>`);
    ipucu.innerHTML = `${new Date(t).toLocaleString(yerel, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}<br>${satirlar.join('<br>')}`;
    ipucu.hidden = false;
    const sol = (x / G) * kutu.width;
    ipucu.style.left = `${Math.min(kutu.width - ipucu.offsetWidth - 8, sol + 12)}px`;
    ipucu.style.top = '12px';
  };
  dokunma.addEventListener('pointermove', goster);
  dokunma.addEventListener('pointerdown', goster);
  dokunma.addEventListener('pointerleave', () => { imlec.setAttribute('visibility', 'hidden'); ipucu.hidden = true; });
}
