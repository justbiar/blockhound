// Kontratın görselini birebir taklit eder: renk, kulak tonu ve blok sayısı hash'in son dört baytından
export function nftSvg(seedHex, id) {
  const b = seedHex.replace(/^0x/, '').match(/../g).map((x) => parseInt(x, 16));
  const hue = ((b[30] << 8) | b[31]) % 360, bloklar = (b[29] % 3) + 1, kulak = (hue + 40 + (b[28] % 80)) % 360;
  const blk = `hsl(${hue},85%,58%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue},28%,9%)"/>`
    + '<path d="M10 56L10 33L15 22L27 16L37 19L44 25L57 35L58 41L52 43L41 40L34 44L28 48L25 56Z" fill="#eee"/>'
    + `<path d="M17 22L28 19L30 33L25 44L19 41L16 31Z" fill="hsl(${kulak},18%,62%)"/>`
    + '<rect x="35" y="24" width="4" height="4" fill="#111"/><rect x="54" y="37" width="4" height="4" fill="#111"/>'
    + `<rect x="49" y="47" width="9" height="9" rx="1.5" fill="${blk}"/>`
    + (bloklar > 1 ? `<rect x="42" y="51" width="5" height="5" rx="1" opacity=".55" fill="${blk}"/>` : '')
    + (bloklar > 2 ? `<rect x="37" y="54" width="3" height="3" rx=".5" opacity=".3" fill="${blk}"/>` : '')
    + `<text x="5" y="9" font-family="monospace" font-size="4.5" fill="#a4a19b">${id}</text></svg>`;
}
