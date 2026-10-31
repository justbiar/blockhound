// Madencilik işçisi (Web Worker). Her işçi nonce'un ilk 28 baytını rastgele seçer, böylece işçiler aynı alanı taramaz.
import { hazirla, dene, nonceOlustur } from './madenci.js';

const PARCA = 50_000;
let is = 0;

self.onmessage = (e) => {
  const { tur, challenge, adres, bits } = e.data;
  const benim = ++is;
  if (tur !== 'basla') return;
  const hazir = hazirla(challenge, adres, crypto.getRandomValues(new Uint8Array(28)));
  let sayac = 0;
  const adim = () => {
    if (benim !== is) return; // durduruldu ya da yeni iş geldi
    const bas = performance.now();
    const n = dene(hazir, sayac, PARCA, bits);
    const sure = performance.now() - bas;
    if (n >= 0) { self.postMessage({ tur: 'bulundu', nonce: nonceOlustur(hazir, n), deneme: n - sayac + 1, sure }); return; }
    sayac += PARCA;
    if (sayac >= 0xffffffff - PARCA) { self.postMessage({ tur: 'tukendi' }); return; }
    self.postMessage({ tur: 'ilerleme', deneme: PARCA, sure });
    setTimeout(adim, 0);
  };
  adim();
};
