// Giriş bölümündeki robot tazı: tamamen kodla kurulur (görsel dosyası yok). Başı imleci izler, ekranındaki gözler kırpılır,
// sayfa kaydıkça kamera yüzüne yaklaşır. WebGL yoksa ya da hareket azaltılmışsa sahne sabit kalır.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

  // Malzemeler: beyaz seramik kabuk, koyu eklemler, marka gradyanlı halka
  const fiz = (renk, oz = {}) => new THREE.MeshPhysicalMaterial({ color: renk, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.3, ...oz });
  const kabuk = fiz(0xeeedea);
  const kabukAcik = fiz(0xf8f7f4, { roughness: 0.34 });
  const eklem = new THREE.MeshStandardMaterial({ color: 0x1b1c21, roughness: 0.55, metalness: 0.3 });
  const derin = new THREE.MeshStandardMaterial({ color: 0x0f1014, roughness: 0.6 });
  const kaide = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.9 });

  const gradyanTuval = document.createElement('canvas');
  gradyanTuval.width = gradyanTuval.height = 512;
  const g = gradyanTuval.getContext('2d');
  const kg = g.createConicGradient(0, 256, 256);
  for (const [d, r] of [[0, '#00c2ff'], [0.2, '#2b7fff'], [0.4, '#7a5cff'], [0.55, '#b45cff'], [0.7, '#7a5cff'], [0.85, '#2b7fff'], [1, '#00c2ff']]) kg.addColorStop(d, r);
  g.fillStyle = kg;
  g.fillRect(0, 0, 512, 512);
  const gradyan = new THREE.CanvasTexture(gradyanTuval);
  gradyan.colorSpace = THREE.SRGBColorSpace;
  const halka = fiz(0xffffff, { map: gradyan, emissive: 0xffffff, emissiveMap: gradyan, emissiveIntensity: 0.22, roughness: 0.5, clearcoat: 0.35 });

  // Yüz ekranı: kendi tuvaline çizilir, gözler kırpılır ve imlece bakar
  const yuzTuval = document.createElement('canvas');
  yuzTuval.width = 512; yuzTuval.height = 320;
  const y = yuzTuval.getContext('2d');
  const yuzDoku = new THREE.CanvasTexture(yuzTuval);
  yuzDoku.colorSpace = THREE.SRGBColorSpace;
  const ekran = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.15, clearcoat: 1, emissive: 0xffffff, emissiveMap: yuzDoku, emissiveIntensity: 1.6 });
  const yuz = { kirp: 1, bakX: 0, bakY: 0, mutlu: 0 };
  function yuzCiz() {
    y.globalAlpha = 1;
    y.fillStyle = '#000';
    y.fillRect(0, 0, 512, 320);
    y.fillStyle = y.strokeStyle = '#d8f3ff';
    y.shadowColor = '#7fd8ff';
    y.shadowBlur = 18;
    const dx = yuz.bakX * 22, dy = yuz.bakY * 14;
    for (const x of [176, 336]) {
      const cx = x + dx, cy = 160 + dy;
      if (yuz.mutlu > 0.5) {
        // Mutlu gözler: ters V
        y.lineWidth = 22; y.lineCap = 'round';
        y.beginPath(); y.moveTo(cx - 34, cy + 14); y.lineTo(cx, cy - 18); y.lineTo(cx + 34, cy + 14); y.stroke();
      } else {
        y.beginPath();
        y.ellipse(cx, cy, 30, Math.max(3, 40 * yuz.kirp), 0, 0, Math.PI * 2);
        y.fill();
      }
    }
    yuzDoku.needsUpdate = true;
  }

  const kutu = (g, h, d, r, m) => new THREE.Mesh(new RoundedBoxGeometry(g, h, d, 4, r), m);
  const top = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
  const silindir = (r1, r2, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 24), m);

  // Yuvarlatılmış dikdörtgen çerçeve (ekran halkası): UV'ler çerçevenin sınırlarına göre yeniden eşlenir
  function yuvarlakDortgen(sekil, g, h, r) {
    const x = -g / 2, y0 = -h / 2;
    sekil.moveTo(x + r, y0);
    sekil.lineTo(x + g - r, y0); sekil.quadraticCurveTo(x + g, y0, x + g, y0 + r);
    sekil.lineTo(x + g, y0 + h - r); sekil.quadraticCurveTo(x + g, y0 + h, x + g - r, y0 + h);
    sekil.lineTo(x + r, y0 + h); sekil.quadraticCurveTo(x, y0 + h, x, y0 + h - r);
    sekil.lineTo(x, y0 + r); sekil.quadraticCurveTo(x, y0, x + r, y0);
    return sekil;
  }
  function cerceve(dg, dh, dr, ig, ih, ir, derinlik) {
    const s = yuvarlakDortgen(new THREE.Shape(), dg, dh, dr);
    s.holes.push(yuvarlakDortgen(new THREE.Path(), ig, ih, ir));
    const geo = new THREE.ExtrudeGeometry(s, { depth: derinlik, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 16 });
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - min.x) / (max.x - min.x), (p.getY(i) - min.y) / (max.y - min.y));
    return geo;
  }

  const kopek = new THREE.Group();
  sahne.add(kopek);

  // Gövde: x ekseni boyunca uzanır, baş +x ucunda
  const govde = new THREE.Group();
  govde.position.y = 0.55;
  kopek.add(govde);
  govde.add(kutu(1.9, 0.86, 0.86, 0.24, kabuk));
  const sirt = kutu(1.3, 0.12, 0.6, 0.05, kabukAcik);
  sirt.position.y = 0.45;
  govde.add(sirt);
  const yanPanel = kutu(1.1, 0.42, 0.04, 0.02, derin);
  yanPanel.position.set(-0.05, -0.02, 0.44);
  govde.add(yanPanel);
  for (const [i, renk] of [0x00c2ff, 0x2b7fff, 0x7a5cff].entries()) {
    const led = top(0.035, new THREE.MeshStandardMaterial({ color: renk, emissive: renk, emissiveIntensity: 2.4 }));
    led.position.set(-0.35 + i * 0.13, 0.08, 0.47);
    govde.add(led);
  }
  for (let i = 0; i < 4; i++) {
    const cizgi = kutu(0.6, 0.025, 0.02, 0.005, eklem);
    cizgi.position.set(0.1, -0.12 - i * 0.05, 0.465);
    govde.add(cizgi);
  }

  // Bacaklar: kalça topu, üst bacak, diz, alt bacak, pati
  const bacaklar = [];
  for (const [bx, bz] of [[0.66, 0.27], [0.66, -0.27], [-0.66, 0.27], [-0.66, -0.27]]) {
    const b = new THREE.Group();
    b.position.set(bx, 0.15, bz);
    kopek.add(b);
    b.add(top(0.15, eklem));
    const ust = kutu(0.27, 0.5, 0.27, 0.09, kabuk);
    ust.position.y = -0.27;
    b.add(ust);
    const diz = top(0.11, eklem);
    diz.position.y = -0.55;
    b.add(diz);
    const alt = kutu(0.22, 0.36, 0.22, 0.07, kabuk);
    alt.position.y = -0.76;
    b.add(alt);
    const pati = kutu(0.32, 0.12, 0.36, 0.05, kabukAcik);
    pati.position.set(0.04, -0.98, 0);
    b.add(pati);
    bacaklar.push(b);
  }

  // Kuyruk: üç koyu parça, kökten sallanır
  const kuyruk = new THREE.Group();
  kuyruk.position.set(-0.98, 0.85, 0);
  kopek.add(kuyruk);
  let uc = kuyruk;
  for (let i = 0; i < 3; i++) {
    const parca = new THREE.Group();
    parca.position.set(i ? -0.16 : 0, i ? 0.14 : 0, 0);
    parca.rotation.z = 0.35;
    const s = silindir(0.06 - i * 0.012, 0.07 - i * 0.012, 0.22, i === 2 ? halka : eklem);
    s.rotation.z = Math.PI / 2 - 0.7;
    s.position.set(-0.08, 0.07, 0);
    parca.add(s);
    uc.add(parca);
    uc = parca;
  }

  // Boyun ve tasma
  const boyun = silindir(0.2, 0.24, 0.3, eklem);
  boyun.position.set(0.9, 0.98, 0);
  boyun.rotation.z = -0.55;
  kopek.add(boyun);
  const tasma = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 16, 40), halka);
  tasma.position.set(0.86, 0.92, 0);
  tasma.rotation.set(Math.PI / 2, 0.5, 0);
  kopek.add(tasma);
  const kunye = silindir(0.08, 0.08, 0.03, kabukAcik);
  kunye.rotation.x = Math.PI / 2;
  kunye.position.set(1.02, 0.76, 0.18);
  kopek.add(kunye);

  // Baş: pivot boyunun üstünde. Ekran +z yüzünde, yani köpek başını izleyiciye çevirmiş durur
  const bas = new THREE.Group();
  bas.position.set(1.12, 1.08, 0);
  kopek.add(bas);
  const kafa = new THREE.Group();
  kafa.position.y = 0.28;
  kafa.scale.setScalar(1.15);
  bas.add(kafa);
  kafa.add(kutu(1.02, 0.86, 0.86, 0.22, kabuk));
  const arka = kutu(0.8, 0.66, 0.5, 0.12, derin);
  arka.position.z = -0.22;
  kafa.add(arka);
  const halkaMesh = new THREE.Mesh(cerceve(0.98, 0.62, 0.2, 0.7, 0.4, 0.12, 0.08), halka);
  halkaMesh.position.set(0, 0.08, 0.4);
  kafa.add(halkaMesh);
  const ekranMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), ekran);
  ekranMesh.position.set(0, 0.08, 0.47);
  kafa.add(ekranMesh);
  // Burun: ekranın altında, öne çıkık
  const burun = kutu(0.5, 0.26, 0.36, 0.1, kabukAcik);
  burun.position.set(0, -0.3, 0.45);
  kafa.add(burun);
  const burunUcu = kutu(0.18, 0.1, 0.06, 0.03, derin);
  burunUcu.position.set(0, -0.24, 0.64);
  kafa.add(burunUcu);
  // Kulaklar: dik, uçları koyu; ara sıra seğirir
  const kulaklar = [];
  for (const k of [-1, 1]) {
    const kulak = new THREE.Group();
    kulak.position.set(k * 0.3, 0.38, -0.12);
    kulak.rotation.set(-0.3, 0, -k * 0.45);
    const parca = kutu(0.26, 0.3, 0.1, 0.06, kabuk);
    parca.position.y = 0.14;
    kulak.add(parca);
    const uc2 = kutu(0.2, 0.12, 0.11, 0.05, eklem);
    uc2.position.y = 0.3;
    kulak.add(uc2);
    kafa.add(kulak);
    kulaklar.push(kulak);
  }

  // Kaide
  const kaideMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.6), kaide);
  kaideMesh.position.set(-0.45, -1.7, 0);
  kaideMesh.rotation.y = 0.5;
  kaideMesh.receiveShadow = true;
  sahne.add(kaideMesh);
  kopek.traverse((m) => { if (m.isMesh) m.castShadow = true; });
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
  yuzCiz();
  requestAnimationFrame(kare);
  bolum.classList.add('sahne-hazir');
}
