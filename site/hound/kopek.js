// Giriş bölümündeki robot tazı sahnesi (model kopek-model.js'te). Başı imleci izler, ekranındaki gözler kırpılır,
// sayfa kaydıkça kamera yüzüne yaklaşır. WebGL yoksa ya da hareket azaltılmışsa sahne sabit kalır.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { kopekModeli } from './kopek-model.js';

const tuval = document.getElementById('kopek-sahne');
const bolum = document.getElementById('giris');
const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: tuval, antialias: true, alpha: true });
} catch {
  bolum?.classList.add('webgl-yok');
}

if (renderer) kur();

function kur() {
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sahne = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  sahne.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  sahne.environmentIntensity = 0.9;

  const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  sahne.add(new THREE.HemisphereLight(0xf4f8ff, 0xd2d6de, 0.7));
  const anahtar = new THREE.DirectionalLight(0xf6f8ff, 1.7);
  anahtar.position.set(-3, 5, 4);
  anahtar.castShadow = true;
  anahtar.shadow.mapSize.set(1024, 1024);
  anahtar.shadow.radius = 6;
  anahtar.shadow.bias = -0.0005;
  Object.assign(anahtar.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  sahne.add(anahtar);
  const kenar = new THREE.DirectionalLight(0xeef4ff, 1.2);
  kenar.position.set(4, 2, -4);
  sahne.add(kenar);
  const dolgu = new THREE.PointLight(0x6a8cff, 2.2, 6);
  dolgu.position.set(-3.2, 1.2, 0.8);
  sahne.add(dolgu);

  const { kopek, govde, bas, kulaklar, kuyruk, yuz, yuzCiz } = kopekModeli();
  sahne.add(kopek);
  const kaide = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.9 });

  // Kaide
  const kaideMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.6), kaide);
  kaideMesh.position.set(-0.45, -1.7, 0);
  kaideMesh.rotation.y = 0.5;
  kaideMesh.receiveShadow = true;
  sahne.add(kaideMesh);
  kopek.position.set(-0.45, 0, 0);
  kopek.rotation.y = 0.5;

  // Durumlar: giriş (geniş) ve yakın plan (baş). Kaydırma ile aralarında yumuşak geçiş
  const DURUM = [
    { z: 11, y: 1.1, bak: 0.45, x: 0.2 },
    { z: 6.2, y: 1.7, bak: 1.35, x: 0.75 },
  ];
  const yumusak = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const isaret = { x: 0, y: 0 }, isaretY = { x: 0, y: 0 };
  let kaydir = 0, kaydirY = 0;
  addEventListener('pointermove', (e) => { isaret.x = (e.clientX / innerWidth) * 2 - 1; isaret.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  addEventListener('scroll', () => { kaydir = Math.min(1, Math.max(0, scrollY / innerHeight)); }, { passive: true });

  function boyutla() {
    const g = tuval.clientWidth, h = tuval.clientHeight;
    renderer.setSize(g, h, false);
    kamera.aspect = g / Math.max(1, h);
    kamera.updateProjectionMatrix();
  }
  addEventListener('resize', boyutla);
  boyutla();

  let sonrakiKirpma = performance.now() + 2500;
  let kirpBas = 0;
  let gorunur = true;
  new IntersectionObserver((k) => { gorunur = k[0].isIntersecting; }).observe(bolum);

  function kare(an) {
    requestAnimationFrame(kare);
    if (!gorunur || document.hidden) return;
    const t = an / 1000;
    isaretY.x += (isaret.x - isaretY.x) * 0.06;
    isaretY.y += (isaret.y - isaretY.y) * 0.06;
    kaydirY += (kaydir - kaydirY) * 0.08;

    const e = yumusak(kaydirY);
    // Dikey ekranda yatay görüş daralır: kamera ekran oranına göre uzaklaşır ve köpeği ortalar
    const dar = Math.min(1.7, Math.max(1, 0.7 / kamera.aspect));
    const kx = kamera.aspect < 1 ? -0.35 : 0;
    const [a, b] = DURUM;
    kamera.position.set(a.x + kx + (b.x - a.x) * e + isaretY.x * 0.25, a.y + (b.y - a.y) * e - isaretY.y * 0.1, (a.z + (b.z - a.z) * e) * dar);
    kamera.lookAt(a.x + kx + (b.x - a.x) * e, a.bak + (b.bak - a.bak) * e, 0);

    const h = azHareket ? 0 : 1;
    // Baş imlece bakar; gövde ve kulaklar yavaşça yaşar
    bas.rotation.y = -0.5 + isaretY.x * 0.55 + Math.sin(t * 0.9) * 0.03 * h;
    bas.rotation.x = 0.06 + isaretY.y * 0.22 + Math.sin(t * 0.9) * 0.02 * h;
    bas.rotation.z = 0.12 * (1 - e) + Math.sin(t * 0.7) * 0.02 * h;
    kopek.rotation.y = 0.5 + isaretY.x * 0.12;
    govde.position.y = 0.55 + Math.sin(t * 1.4) * 0.015 * h;
    kuyruk.rotation.y = Math.sin(t * 7) * 0.45 * h;
    kuyruk.rotation.z = 0.15 + Math.sin(t * 1.3) * 0.08 * h;
    const segir = Math.max(0, Math.sin(t * 0.8) - 0.92) * 4;
    kulaklar[0].rotation.z = 0.45 + segir * 0.25 * h;
    kulaklar[1].rotation.z = -0.45 - Math.sin(t * 1.1) * 0.03 * h;

    // Göz kırpma: 2,5 ile 5,5 saniye arası, 0,18 sn
    if (!azHareket && an > sonrakiKirpma) { kirpBas = an; sonrakiKirpma = an + 2500 + Math.random() * 3000; }
    const kp = (an - kirpBas) / 180;
    yuz.kirp = kp < 1 ? 1 - Math.sin(kp * Math.PI) * 0.9 : 1;
    yuz.bakX = isaretY.x; yuz.bakY = isaretY.y;
    yuz.mutlu = kaydirY > 0.55 ? 1 : 0;
    yuzCiz();
    renderer.render(sahne, kamera);
  }
  requestAnimationFrame(kare);
  bolum.classList.add('sahne-hazir');
}
