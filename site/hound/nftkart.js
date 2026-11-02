// BlockHound önizlemesi 3D kart olarak: kontratın ürettiği SVG görselin birebir aynısı kartın yüzüne basılır,
// kart imlece göre eğilir ve parlar. Görsel değişince (hash bulununca) kartın yüzü de değişir. WebGL yoksa SVG görünür kalır.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const kutu = document.querySelector('.nft-onizleme');
const kaynak = kutu?.querySelector('.nft-svg');
const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try { if (kutu) renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { /* SVG kalır */ }

if (renderer) {
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  kutu.append(renderer.domElement);
  renderer.domElement.className = 'nft-tuval';

  const sahne = new THREE.Scene();
  sahne.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const isik = new THREE.DirectionalLight(0xffffff, 1.2);
  isik.position.set(-2, 3, 4);
  sahne.add(isik);
  const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  kamera.position.z = 3.9;

  // Kart: ince yuvarlatılmış gövde, ön yüzde görsel, arkada marka gradyanı
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
    const svg = kaynak.querySelector('svg');
    if (!svg) return;
    const metin = new XMLSerializer().serializeToString(svg);
    const resim = new Image();
    resim.src = URL.createObjectURL(new Blob([metin], { type: 'image/svg+xml' }));
    try { await resim.decode(); } catch { return; }
    const c = tuval.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 1024, 1024);
    c.drawImage(resim, 0, 0, 1024, 1024);
    URL.revokeObjectURL(resim.src);
    doku.needsUpdate = true;
    kutu.classList.add('uc-boyut');
  }
  new MutationObserver(yuzuGuncelle).observe(kaynak, { childList: true, subtree: true });
  yuzuGuncelle();

  function boyutla() {
    const g = kutu.clientWidth;
    renderer.setSize(g, g, false);
  }
  new ResizeObserver(boyutla).observe(kutu);
  boyutla();

  // İmleç kartın üstündeyken ona göre eğilir, değilken yavaşça salınır
  const hedef = { x: 0, y: 0 }, an = { x: 0, y: 0 };
  let ustunde = false;
  kutu.addEventListener('pointermove', (e) => {
    const r = kutu.getBoundingClientRect();
    hedef.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    hedef.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    ustunde = true;
  });
  kutu.addEventListener('pointerleave', () => { ustunde = false; hedef.x = hedef.y = 0; });
  let gorunur = false;
  new IntersectionObserver((k) => { gorunur = k[0].isIntersecting; }).observe(kutu);

  function kare(zaman) {
    requestAnimationFrame(kare);
    if (!gorunur || document.hidden) return;
    const t = zaman / 1000;
    const salin = ustunde || azHareket ? 0 : 1;
    an.x += (hedef.x - an.x) * 0.08;
    an.y += (hedef.y - an.y) * 0.08;
    kart.rotation.y = an.x * 0.45 + Math.sin(t * 0.8) * 0.18 * salin;
    kart.rotation.x = an.y * 0.35 + Math.sin(t * 0.6) * 0.06 * salin;
    renderer.render(sahne, kamera);
  }
  requestAnimationFrame(kare);
}
