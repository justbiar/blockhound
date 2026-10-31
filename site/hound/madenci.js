// HOUND / BlockHound madencisi. Kontratın doğruladığı hash: keccak256(challenge 32 bayt | madenci adresi 20 bayt | nonce 32 bayt).
// 84 baytlık girdi tek keccak bloğuna sığar, bu yüzden her deneme tek bir keccak-f[1600] permütasyonudur.
// 64 bitlik şeritler iki 32 bitlik kelimeyle tutulur: s[2i] alt, s[2i+1] üst yarı. Tarayıcıda (Worker) ve Node'da çalışır.

const RC = [
  0x00000001, 0x00000000, 0x00008082, 0x00000000, 0x0000808a, 0x80000000, 0x80008000, 0x80000000,
  0x0000808b, 0x00000000, 0x80000001, 0x00000000, 0x80008081, 0x80000000, 0x00008009, 0x80000000,
  0x0000008a, 0x00000000, 0x00000088, 0x00000000, 0x80008009, 0x00000000, 0x8000000a, 0x00000000,
  0x8000808b, 0x00000000, 0x0000008b, 0x80000000, 0x00008089, 0x80000000, 0x00008003, 0x80000000,
  0x00008002, 0x80000000, 0x00000080, 0x80000000, 0x0000800a, 0x00000000, 0x8000000a, 0x80000000,
  0x80008081, 0x80000000, 0x00008080, 0x80000000, 0x80000001, 0x00000000, 0x80008008, 0x80000000,
];
// Dönüş miktarı ve hedef konum, şerit indeksi i = x + 5y için (rho ve pi adımları birlikte)
const ROT = new Int32Array(25);
const HEDEF = new Int32Array(25);
{
  const r = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { ROT[x + 5 * y] = r[x][y]; HEDEF[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5); }
}

const C = new Uint32Array(10);
const B = new Uint32Array(50);

function keccakF(s) {
  for (let t = 0; t < 48; t += 2) {
    for (let x = 0; x < 10; x += 2) {
      C[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
      C[x + 1] = s[x + 1] ^ s[x + 11] ^ s[x + 21] ^ s[x + 31] ^ s[x + 41];
    }
    for (let x = 0; x < 5; x++) {
      const a = ((x + 4) % 5) * 2, b = ((x + 1) % 5) * 2;
      const dl = C[a] ^ ((C[b] << 1) | (C[b + 1] >>> 31));
      const dh = C[a + 1] ^ ((C[b + 1] << 1) | (C[b] >>> 31));
      for (let y = 0; y < 50; y += 10) { s[2 * x + y] ^= dl; s[2 * x + y + 1] ^= dh; }
    }
    for (let i = 0; i < 25; i++) {
      const lo = s[2 * i], hi = s[2 * i + 1], n = ROT[i], h = HEDEF[i] * 2;
      if (n === 0) { B[h] = lo; B[h + 1] = hi; }
      else if (n < 32) { B[h] = (lo << n) | (hi >>> (32 - n)); B[h + 1] = (hi << n) | (lo >>> (32 - n)); }
      else if (n === 32) { B[h] = hi; B[h + 1] = lo; }
      else { const m = n - 32; B[h] = (hi << m) | (lo >>> (32 - m)); B[h + 1] = (lo << m) | (hi >>> (32 - m)); }
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 5; x++) {
        const i = y + 2 * x, j = y + 2 * ((x + 1) % 5), k = y + 2 * ((x + 2) % 5);
        s[i] = B[i] ^ (~B[j] & B[k]);
        s[i + 1] = B[i + 1] ^ (~B[j + 1] & B[k + 1]);
      }
    }
    s[0] ^= RC[t]; s[1] ^= RC[t + 1];
  }
}

const hexBayt = (hex, n) => {
  const h = String(hex).replace(/^0x/, '').padStart(n * 2, '0');
  if (h.length !== n * 2 || /[^0-9a-f]/i.test(h)) throw new Error('geçersiz hex');
  return Uint8Array.from(h.match(/../g), (b) => parseInt(b, 16));
};
const okuLE = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const bswap = (w) => (((w & 0xff) << 24) | ((w & 0xff00) << 8) | ((w >>> 8) & 0xff00) | (w >>> 24)) >>> 0;

/// Girdinin sabit kısmını (challenge, adres, nonce'un ilk 28 baytı) hazırlar. `ek` her işçiye ayrı rastgele 28 bayt
export function hazirla(challenge, adres, ek) {
  const m = new Uint8Array(136);
  m.set(hexBayt(challenge, 32), 0);
  m.set(hexBayt(adres, 20), 32);
  m.set(ek.subarray(0, 28), 52);
  m[84] = 0x01; // keccak dolgusu (SHA3 değil, Ethereum keccak256)
  m[135] |= 0x80;
  const taban = new Uint32Array(50);
  for (let i = 0; i < 34; i++) taban[i] = okuLE(m, i * 4);
  return { taban, onEk: m.slice(52, 80) };
}

/// Hash'in büyük uçlu ilk `bits` biti sıfır mı (digest <= 2^256 >> bits - 1)
function yeterli(s, bits) {
  for (let k = 0; bits > 0; k++, bits -= 32) {
    const w = bswap(s[k]);
    if (bits >= 32) { if (w !== 0) return false; }
    else return (w >>> (32 - bits)) === 0;
  }
  return true;
}

const s = new Uint32Array(50);
/// `bas` sayacından itibaren `adet` deneme yapar. Bulursa sayacı döner, bulamazsa -1. Sayaç nonce'un son 4 baytıdır
export function dene(hazir, bas, adet, bits) {
  const { taban } = hazir;
  for (let n = bas, son = bas + adet; n < son; n++) {
    s.set(taban);
    s[20] = bswap(n >>> 0); // nonce'un son 4 baytı = 80..83, şerit 10'un alt yarısı
    keccakF(s);
    if (yeterli(s, bits)) return n;
  }
  return -1;
}

/// Bulunan sayaçtan kontrata gönderilecek nonce (uint256, ondalık metin)
export function nonceOlustur(hazir, sayac) {
  let h = '0x';
  for (const b of hazir.onEk) h += b.toString(16).padStart(2, '0');
  return BigInt(h + (sayac >>> 0).toString(16).padStart(8, '0')).toString();
}

/// Test ve doğrulama için: verilen nonce ile hash (hex)
export function hashle(challenge, adres, nonce) {
  const m = new Uint8Array(136);
  m.set(hexBayt(challenge, 32), 0);
  m.set(hexBayt(adres, 20), 32);
  m.set(hexBayt(BigInt(nonce).toString(16), 32), 52);
  m[84] = 0x01; m[135] |= 0x80;
  for (let i = 0; i < 50; i++) s[i] = i < 34 ? okuLE(m, i * 4) : 0;
  keccakF(s);
  let h = '0x';
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) h += ((s[i] >>> (8 * k)) & 0xff).toString(16).padStart(2, '0');
  return h;
}

/// Kısa bir metnin keccak256'sı (136 bayttan kısa, tek blok). Agent ID adından kimlik numarası için
export function keccakMetin(metin) {
  const b = new TextEncoder().encode(metin);
  if (b.length >= 136) throw new Error('metin çok uzun');
  const m = new Uint8Array(136);
  m.set(b, 0);
  m[b.length] ^= 0x01; m[135] ^= 0x80;
  for (let i = 0; i < 50; i++) s[i] = i < 34 ? okuLE(m, i * 4) : 0;
  keccakF(s);
  let h = '0x';
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) h += ((s[i] >>> (8 * k)) & 0xff).toString(16).padStart(2, '0');
  return h;
}
