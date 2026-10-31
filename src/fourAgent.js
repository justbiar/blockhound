// Four.meme Agent ID'ye özel tokenler: Binance'in resmi script'i (agent-id-exclusive-token-launches.mjs) ile
// aşama kontrolü, teklif ve calldata üretimi. Script sadece okuma yapar; işlemi trader.kontratCagir gönderir.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { adresKontrol, miktarKontrol } from './guard.js';

// Bonding curve alımları sadece bu kontrata gidebilir (script'in ürettiği tx burada da doğrulanır)
export const FOUR_CORE = '0xebe7b6c1089d9f72ad07f34e36d898e44e5e27f3';
const AD = 'agent-id-exclusive-token-launches.mjs';

export function scriptBul(ozel = process.env.FOUR_SCRIPT) {
  const adaylar = [ozel, ...['.claude', '.agents'].map((d) => path.join(homedir(), d, 'skills', 'binance-agentic-wallet', 'scripts', AD))].filter(Boolean);
  return adaylar.find((p) => existsSync(p)) || null;
}

export function scriptCalistir(komut, params, { script = scriptBul(), zamanAsimi = 45_000 } = {}) {
  if (!script) return Promise.reject(new Error(`Binance skill script'i bulunamadı (${AD}). binance-agentic-wallet skill'ini kur ya da FOUR_SCRIPT ayarla.`));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, komut, JSON.stringify(params)], { timeout: zamanAsimi, maxBuffer: 8 << 20 }, (err, stdout) => {
      let j = null;
      try { j = JSON.parse(String(stdout || '')); } catch { /* */ }
      if (j?.success === false) return reject(new Error(`${j.error?.code || 'HATA'}: ${j.error?.message || ''}${j.error?.diagnosis ? ` (${j.error.diagnosis})` : ''}`.trim()));
      if (!j?.data) return reject(new Error(err ? err.message.slice(0, 300) : 'Script geçersiz çıktı verdi'));
      resolve(j.data);
    });
  });
}

// Vanity soneki (4444 / ffff) olan adresler Four.meme tokenidir; sadece onlar için zincir kontrolü yapılır
export const fourAdresiMi = (a) => /(4444|ffff)$/i.test(String(a));

export const bilgi = (token, cuzdan) => scriptCalistir('info', { token: adresKontrol(token, 'token'), wallet: adresKontrol(cuzdan, 'cüzdan') });

// Bütçeyle alım teklifi. Dönen tx Four Core'a gitmiyorsa ya da bütçeyi aşıyorsa reddedilir.
export async function alimTeklifi({ token, cuzdan, bnb, kaymaYuzde }) {
  const params = { token: adresKontrol(token, 'token'), wallet: adresKontrol(cuzdan, 'cüzdan'), amount: miktarKontrol(bnb, 'BNB') };
  if (kaymaYuzde != null) params.slippageBps = Math.round(Number(kaymaYuzde) * 100);
  const d = await scriptCalistir('quote-buy', params);
  txDogrula(d.tx, { cuzdan, maxWei: BigInt(Math.round(Number(bnb) * 1e18)), secici: SEC.alimButce });
  if (d.simulation && d.simulation.ok === false) throw new Error(`Simülasyon başarısız: ${d.simulation.error?.reason || 'bilinmiyor'}`);
  if (d.pay && d.pay.sufficient === false) throw new Error(`Bakiye yetersiz: en fazla ${d.pay.maxPay} ${d.pay.symbol} gerekiyor`);
  return d;
}

export const SEC = { alimButce: '0x995ee6da', satis: '0x8bfc7764', onay: '0x095ea7b3' };
const kelime = (h) => h.toLowerCase().replace(/^0x/, '').padStart(64, '0');

// Satış teklifi. Satış işlemi sadece Four Core'a, 0 BNB ile gidebilir.
// approveTx varsa: tam olarak satılacak miktar kadar, sadece Four Core'a onay olmalı (sınırsız onay reddedilir).
export async function satisTeklifi({ token, cuzdan, miktar, kaymaYuzde }) {
  const params = { token: adresKontrol(token, 'token'), wallet: adresKontrol(cuzdan, 'cüzdan'), amount: miktar === 'all' ? 'all' : miktarKontrol(miktar, 'token miktarı') };
  if (kaymaYuzde != null) params.slippageBps = Math.round(Number(kaymaYuzde) * 100);
  const d = await scriptCalistir('quote-sell', params);
  txDogrula(d.tx, { cuzdan, maxWei: 0n, secici: SEC.satis });
  if (d.approveTx) onayDogrula(d.approveTx, { token, cuzdan, miktarRaw: d.sell.amountRaw });
  if (!d.approveTx && d.simulation && d.simulation.ok === false) throw new Error(`Simülasyon başarısız: ${d.simulation.error?.reason || 'bilinmiyor'}`);
  return d;
}

export function onayDogrula(atx, { token, cuzdan, miktarRaw }) {
  const beklenen = SEC.onay + kelime(FOUR_CORE) + kelime(BigInt(miktarRaw).toString(16));
  if (String(atx.to).toLowerCase() !== String(token).toLowerCase()) throw new Error('Onay işlemi başka bir tokene gidiyor');
  if (String(atx.from).toLowerCase() !== String(cuzdan).toLowerCase() || String(atx.value) !== '0') throw new Error('Onay işlemi beklenmedik');
  if (String(atx.inputData).toLowerCase() !== beklenen) throw new Error('Onay işlemi tam satış miktarı değil (sınırsız ya da yanlış miktar)');
  return atx;
}

// Zincir onayını bekler: success | reverted | pending (süre doldu)
export async function makbuzBekle(txHash, { maxMs = 90_000, aralikMs = 2500 } = {}) {
  const t0 = Date.now();
  let son = null;
  while (Date.now() - t0 < maxMs) {
    son = await scriptCalistir('receipt', { txHash }).catch(() => son);
    if (son?.status === 'success' || son?.status === 'reverted') return son;
    await new Promise((r) => setTimeout(r, aralikMs));
  }
  return son || { txHash, status: 'pending' };
}

export function txDogrula(tx, { cuzdan, maxWei, secici = null }) {
  if (!tx) throw new Error('Script işlem üretmedi');
  if (String(tx.to).toLowerCase() !== FOUR_CORE) throw new Error(`Beklenmeyen hedef kontrat: ${tx.to}`);
  if (secici && !String(tx.inputData).toLowerCase().startsWith(secici)) throw new Error('Beklenmeyen kontrat fonksiyonu');
  if (String(tx.from).toLowerCase() !== String(cuzdan).toLowerCase()) throw new Error('İşlem başka bir cüzdan için üretilmiş');
  if (!/^\d+$/.test(String(tx.value)) || BigInt(tx.value) > maxWei) throw new Error('İşlem değeri bütçeyi aşıyor');
  if (!/^0x[0-9a-fA-F]+$/.test(String(tx.inputData))) throw new Error('Geçersiz calldata');
  return tx;
}
