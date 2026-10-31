// Binance Agentic Wallet CLI (baw) sarmalayıcısı. Private key'e hiç dokunmaz; imzalar Binance tarafında yapılır.
// execFile kabuk kullanmaz, argümanlar tek tek geçer, adres ve miktarlar önceden doğrulanır.
import { execFile } from 'node:child_process';
import { BAW_BIN, ZINCIR_ID } from './config.js';
import { adresKontrol, miktarKontrol } from './guard.js';

export class BawHatasi extends Error {
  constructor(mesaj, ayrinti) { super(mesaj); this.ayrinti = ayrinti; }
}

export function bawCalistir(args, { zamanAsimi = 60_000, cocukAl } = {}) {
  return new Promise((resolve, reject) => {
    const cocuk = execFile(BAW_BIN, [...args, '--json'], { timeout: zamanAsimi, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      const metin = String(stdout || '').trim();
      let json = null;
      try { json = metin ? JSON.parse(metin) : null; } catch { /* JSON değil */ }
      if (err && err.code === 'ENOENT') return reject(new BawHatasi('baw bulunamadı. Kurulum: npm i -g @binance/agentic-wallet'));
      if (json?.success === false) {
        const e = json.error || {};
        return reject(new BawHatasi(`${e.name || e.code || 'baw hatası'}: ${e.message || ''}`.trim(), json));
      }
      if (err) return reject(new BawHatasi(String(stderr || err.message).trim().slice(0, 400)));
      if (!json) return reject(new BawHatasi(`baw JSON döndürmedi: ${metin.slice(0, 200)}`));
      resolve(json.data);
    });
    cocukAl?.(cocuk);
  });
}

const zincir = ['--binanceChainId', ZINCIR_ID];

export const baw = {
  durum: async () => (await bawCalistir(['wallet', 'status'], { zamanAsimi: 20_000 }))?.status || 'BILINMIYOR',
  agentId: () => bawCalistir(['wallet', 'agent-id'], { zamanAsimi: 20_000 }),
  ayarlar: () => bawCalistir(['wallet', 'settings'], { zamanAsimi: 20_000 }),
  kilit: async () => (await bawCalistir(['wallet', 'tx-lock', ...zincir], { zamanAsimi: 20_000 }))?.status || 'BILINMIYOR',

  async adres() {
    const list = (await bawCalistir(['wallet', 'address'], { zamanAsimi: 20_000 }))?.addresses || [];
    return list.find((a) => String(a.binanceChainId) === ZINCIR_ID)?.address || null;
  },

  async bakiye() {
    const d = await bawCalistir(['wallet', 'balance', ...zincir, '--hideLowValue', 'false'], { zamanAsimi: 30_000 });
    return Array.isArray(d) ? d : [];
  },

  islemGecmisi({ imlec } = {}) {
    const args = ['wallet', 'tx-history', ...zincir, '--size', '100'];
    if (imlec) args.push('--nextCursor', String(imlec));
    return bawCalistir(args, { zamanAsimi: 30_000 });
  },

  girisBaslat: () => bawCalistir(['auth', 'signin'], { zamanAsimi: 30_000 }),
  // App'te onay gelene ya da 5 dk dolana kadar bekler
  girisDogrula: (qrCodeId, cocukAl) => bawCalistir(['auth', 'verify', '--qrCodeId', String(qrCodeId)], { zamanAsimi: 330_000, cocukAl }),

  teklif({ miktar, kaynak, hedef, kayma }) {
    const args = ['market-order', 'quote', '--fromTokenQty', miktarKontrol(miktar), '--fromToken', adresKontrol(kaynak, 'kaynak token'),
      '--toToken', adresKontrol(hedef, 'hedef token'), ...zincir];
    if (kayma != null) args.push('--slippage', String(kayma));
    return bawCalistir(args, { zamanAsimi: 45_000 });
  },

  swap({ miktar, kaynak, hedef, kayma, mev = true }) {
    const args = ['market-order', 'swap', '--fromTokenQty', miktarKontrol(miktar), '--fromToken', adresKontrol(kaynak, 'kaynak token'),
      '--toToken', adresKontrol(hedef, 'hedef token'), ...zincir, '--mev', mev ? 'true' : 'false'];
    if (kayma != null) args.push('--slippage', String(kayma));
    return bawCalistir(args, { zamanAsimi: 90_000 });
  },

  async emirSorgu(orderId) {
    const d = await bawCalistir(['market-order', 'list', '--orderId', String(orderId)], { zamanAsimi: 30_000 });
    return d?.list?.[0] || null;
  },

  preview({ kimden, kime, degerWei = '0', veri = '0x' }) {
    if (!/^\d+$/.test(String(degerWei))) throw new Error('degerWei tam sayı olmalı');
    if (!/^0x[0-9a-fA-F]*$/.test(String(veri))) throw new Error('inputData hex olmalı');
    return bawCalistir(['contract-call', 'preview', ...zincir, '--from', adresKontrol(kimden, 'gönderen'), '--to', adresKontrol(kime, 'kontrat'),
      '--value', String(degerWei), '--inputData', String(veri)], { zamanAsimi: 45_000 });
  },

  calistir: (requestId) => bawCalistir(['contract-call', 'execute', '--requestId', String(requestId)], { zamanAsimi: 150_000 }),

  // Binance limit emri: tetik fiyatına gelince Binance tarafında satar (bu bilgisayar kapalıyken de)
  limitSat({ token, miktar, tetikUsd, hedef, kayma = null }) {
    const args = ['limit-order', 'sell', '--triggerPrice', miktarKontrol(tetikUsd, 'tetik fiyatı'), '--fromTokenQty', miktarKontrol(miktar),
      '--fromToken', adresKontrol(token, 'token'), '--toToken', adresKontrol(hedef, 'hedef token'), ...zincir];
    if (kayma != null) args.push('--slippage', String(kayma));
    return bawCalistir(args, { zamanAsimi: 60_000 });
  },

  async limitListe({ durum = null } = {}) {
    const args = ['limit-order', 'list', ...zincir, '--pageSize', '100'];
    if (durum) args.push('--status', String(durum));
    return (await bawCalistir(args, { zamanAsimi: 30_000 }))?.list || [];
  },

  limitIptal: (strategyId) => {
    if (!/^\d{1,30}$/.test(String(strategyId))) throw new Error('Geçersiz emir numarası');
    return bawCalistir(['limit-order', 'cancel', '--strategyId', String(strategyId)], { zamanAsimi: 30_000 });
  },
};

// market-order swap sadece "gönderildi" demektir; FINISHED ya da FAILED görene kadar sorgula
export async function emirSonucuBekle(orderId, { sorgu = baw.emirSorgu, maxMs = 60_000, aralikMs = 1500, uyu = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const t0 = Date.now();
  let son = null;
  while (Date.now() - t0 < maxMs) {
    son = await sorgu(orderId).catch(() => son);
    if (son?.status === 'FINISHED' || son?.status === 'FAILED') return son;
    await uyu(aralikMs);
  }
  return son ? { ...son, status: son.status || 'PENDING' } : { orderId, status: 'PENDING' };
}
