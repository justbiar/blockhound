// Mint kartlarındaki 3D önizlemeler: HOUND için logolu madeni para, BlockHound için kontratın SVG görseli basılmış kart.
// NFT kartındaki görsel kontratın ürettiğinin birebir aynısıdır; hash bulununca kartın yüzü de değişir.
// İkisi de imleç üstündeyken ona doğru eğilir, değilken kendi kendine salınır. WebGL yoksa düz görseller kalır.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ortak sahne: kutunun içine tuval ekler, imleci izler, yalnızca görünürken çizer
function sahneKur(kutu, kur) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'onizleme-tuval';
  kutu.append(renderer.domElement);

  const sahne = new THREE.Scene();
  sahne.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const isik = new THREE.DirectionalLight(0xffffff, 1.2);
  isik.position.set(-2, 3, 4);
  sahne.add(isik);
  const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  kamera.position.z = 3.9;

  const boyutla = () => { const g = kutu.clientWidth; renderer.setSize(g, g, false); };
  new ResizeObserver(boyutla).observe(kutu);
  boyutla();

  const imlec = { x: 0, y: 0, ustunde: false };
  kutu.addEventListener('pointermove', (e) => {
    const r = kutu.getBoundingClientRect();
    imlec.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    imlec.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    imlec.ustunde = true;
  });
  kutu.addEventListener('pointerleave', () => { imlec.ustunde = false; imlec.x = imlec.y = 0; });
  let gorunur = false;
  new IntersectionObserver((k) => { gorunur = k[0].isIntersecting; }).observe(kutu);

  const adim = kur(sahne, imlec);
  function kare(zaman) {
    requestAnimationFrame(kare);
    if (!gorunur || document.hidden) return;
    adim(zaman / 1000);
    renderer.render(sahne, kamera);
  }
  requestAnimationFrame(kare);
}

// --- BlockHound: SVG görseli basılmış kart ---
const nftKutu = document.querySelector('.nft-onizleme');
const nftKaynak = nftKutu?.querySelector('.nft-svg');
if (nftKutu && nftKaynak) sahneKur(nftKutu, (sahne, imlec) => {
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = 1024;
  const doku = new THREE.CanvasTexture(tuval);
  doku.colorSpace = THREE.SRGBColorSpace;
  doku.anisotropy = 4;
  const kart = new THREE.Group();
  sahne.add(kart);
  kart.add(new THREE.Mesh(new RoundedBoxGeometry(1.62, 1.62, 0.05, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x15161b, roughness: 0.4, metalness: 0.3, clearcoat: 1 })));
  const yuz = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshPhysicalMaterial({
    map: doku, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600],
  }));
  yuz.position.z = 0.027;
  kart.add(yuz);

  // SVG'yi tuvale çizer (piksel sanatı keskin kalsın diye yumuşatma kapalı)
  async function yuzuGuncelle() {
    const svg = nftKaynak.querySelector('svg');
    if (!svg) return;
    const resim = new Image();
    resim.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try { await resim.decode(); } catch { return; }
    const c = tuval.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 1024, 1024);
    c.drawImage(resim, 0, 0, 1024, 1024);
    URL.revokeObjectURL(resim.src);
    doku.needsUpdate = true;
    nftKutu.classList.add('uc-boyut');
  }
  new MutationObserver(yuzuGuncelle).observe(nftKaynak, { childList: true, subtree: true });
  yuzuGuncelle();

  const an = { x: 0, y: 0 };
  return (t) => {
    const salin = imlec.ustunde || azHareket ? 0 : 1;
    an.x += (imlec.x - an.x) * 0.08;
    an.y += (imlec.y - an.y) * 0.08;
    kart.rotation.y = an.x * 0.45 + Math.sin(t * 0.8) * 0.18 * salin;
    kart.rotation.x = an.y * 0.35 + Math.sin(t * 0.6) * 0.06 * salin;
  };
});

// --- HOUND: yüzünde logo olan madeni para ---
const paraKutu = document.querySelector('.token-onizleme');
if (paraKutu) sahneKur(paraKutu, (sahne, imlec) => {
  // Yüz: koyu zemin, marka gradyanlı ince halka, ortada logo, altta ad
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = 1024;
  const c = tuval.getContext('2d');
  const yuzDoku = new THREE.CanvasTexture(tuval);
  yuzDoku.colorSpace = THREE.SRGBColorSpace;
  yuzDoku.anisotropy = 4;
  // Silindir kapağının dokusu çevrilince yana yatar: görsel dik dursun diye doku döndürülür
  yuzDoku.center.set(0.5, 0.5);
  yuzDoku.rotation = Math.PI / 2;
  // Arka yüz aynı görselin aynalanmışı olmasın diye yatayda çevrilir
  const arkaDoku = yuzDoku.clone();
  arkaDoku.wrapS = THREE.RepeatWrapping;
  arkaDoku.repeat.x = -1;
  arkaDoku.offset.x = 1;

  function ciz(logo) {
    const zemin = c.createRadialGradient(512, 420, 60, 512, 512, 520);
    zemin.addColorStop(0, '#1e2a52'); zemin.addColorStop(1, '#0b0d14');
    c.fillStyle = zemin;
    c.fillRect(0, 0, 1024, 1024);
    const halka = c.createLinearGradient(0, 0, 1024, 1024);
    for (const [d, r] of [[0, '#00c2ff'], [0.4, '#2b7fff'], [0.75, '#7a5cff'], [1, '#b45cff']]) halka.addColorStop(d, r);
    c.strokeStyle = halka; c.lineWidth = 18;
    c.beginPath(); c.arc(512, 512, 455, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 4;
    c.beginPath(); c.arc(512, 512, 425, 0, Math.PI * 2); c.stroke();
    if (logo) c.drawImage(logo, 272, 210, 480, 480);
    c.fillStyle = '#e8ecff';
    c.font = '600 92px "Schibsted Grotesk", system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('HOUND', 512, 830);
    yuzDoku.needsUpdate = arkaDoku.needsUpdate = true;
  }
  ciz(null);
  const logo = new Image();
  logo.src = new URL('../logo-180.png', import.meta.url).href;
  logo.decode().then(() => { ciz(logo); paraKutu.classList.add('uc-boyut'); }, () => {});

  const kenar = new THREE.MeshPhysicalMaterial({ color: 0x8ea6ff, metalness: 1, roughness: 0.28, clearcoat: 0.6 });
  const on = new THREE.MeshPhysicalMaterial({ map: yuzDoku, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const arka = new THREE.MeshPhysicalMaterial({ map: arkaDoku, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const para = new THREE.Group();
  sahne.add(para);
  // Silindirin kapakları kameraya baksın diye x ekseninde çevrilir: [yan, üst (ön), alt (arka)]
  const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.12, 96, 1), [kenar, on, arka]);
  govde.rotation.x = Math.PI / 2;
  para.add(govde);
  // Kabartmalı kenar halkaları ve yan tırtıllar
  for (const z of [0.06, -0.06]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.765, 0.022, 12, 96), kenar);
    h.position.z = z;
    para.add(h);
  }
  // Her tırtıl: dışa doğru ince, kalınlık boyunca uzun bir çubuk
  const tirtil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.012, 0.1), kenar, 72);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    m.makeRotationZ(a).setPosition(Math.cos(a) * 0.785, Math.sin(a) * 0.785, 0);
    tirtil.setMatrixAt(i, m);
  }
  para.add(tirtil);

  // NFT kartı gibi salınır; 7 saniyede bir 1,2 saniyelik tam tur atar. İmleç üstündeyken imlece eğilir
  const an = { x: 0, y: 0 };
  const yumusak = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  return (t) => {
    const salin = imlec.ustunde || azHareket ? 0 : 1;
    an.x += (imlec.x - an.x) * 0.08;
    an.y += (imlec.y - an.y) * 0.08;
    const tur = salin ? yumusak(Math.min(1, Math.max(0, ((t % 7) - 5.8) / 1.2))) * Math.PI * 2 : 0;
    para.rotation.y = an.x * 0.5 + Math.sin(t * 0.8) * 0.3 * salin + tur;
    para.rotation.x = an.y * 0.35 + Math.sin(t * 0.6) * 0.06 * salin;
  };
});
