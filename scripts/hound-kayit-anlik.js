// Sitenin mint kaydı için anlık görüntü: terminalin HOUND takibinden (data/hound-takip.json) site/hound/kayit.json üretir.
// Site bu dosyadan başlar ve zincirden yalnızca sonraki blokları okur. Yayından önce çalıştır: npm run hound:anlik
import { readFileSync, writeFileSync } from 'node:fs';

const KONTRAT = { hound: '0x8446C862f84B948fDDAf1Be42c6B59ceCf5941Ac', blockhound: '0x2535E83109909c7B9eA22D5b2f7c8621E595e3Dd' };
const d = JSON.parse(readFileSync(new URL('../data/hound-takip.json', import.meta.url)));
const olaylar = d.mintler.map((m) => ({
  k: KONTRAT[m.tur].toLowerCase(), m: m.madenci.toLowerCase(), i: m.sira, bit: m.bit, ucret: m.ucretWei, b: m.blok, tx: m.tx,
  t: d.blokZaman?.[m.blok] ?? null,
}));
const adlar = Object.fromEntries(Object.entries(d.adlar || {}).map(([a, ad]) => [a.toLowerCase(), ad]));
const cikti = { son: d.sonBlok, olaylar, adlar, zaman: Date.now() };
writeFileSync(new URL('../site/hound/kayit.json', import.meta.url), JSON.stringify(cikti) + '\n');
console.log(`kayit.json: ${olaylar.length} mint, blok ${d.sonBlok}`);
