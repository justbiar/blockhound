// NFT'ler: baw bakiyesi NFT listelemediği için cüzdanın işlem geçmişinden adaylar çıkarılır,
// güncel sahiplik zincirde ownerOf ile doğrulanır.
import { adresKontrol } from './guard.js';

const RPC = process.env.BSC_RPC || 'https://bsc-rpc.publicnode.com';
const SEC = { ownerOf: '0x6352211e', name: '0x06fdde03', balanceOf: '0x70a08231' };

// Geçmişteki alınan/gönderilen NFT kayıtlarından, cüzdanda olması beklenenleri çıkarır (saf fonksiyon)
export function nftAdaylari(islemler, cuzdan) {
  const ben = cuzdan.toLowerCase();
  const harita = new Map();
  const sirali = [...islemler].sort((a, b) => Date.parse(a.txTime) - Date.parse(b.txTime));
  for (const t of sirali) {
    if (t.status && t.status !== 'confirmed') continue;
    for (const h of t.txHashList || []) {
      for (const [tur, yon] of [['receive', 1], ['send', -1]]) {
        for (const r of h.instructions?.[tur] || []) {
          const ti = r.tokenInfo;
          if (ti?.tokenId == null || !/^0x[0-9a-fA-F]{40}$/.test(ti.contractAddress || '')) continue;
          const anahtar = `${ti.contractAddress.toLowerCase()}:${ti.tokenId}`;
          const muhatap = String(r.addressInfo?.address || '').toLowerCase();
          if (yon === 1 && muhatap && muhatap !== ben) continue;
          if (yon === -1) { harita.delete(anahtar); continue; }
          harita.set(anahtar, {
            kontrat: ti.contractAddress, sembol: ti.symbol || null, tokenId: String(ti.tokenId),
            zaman: t.txTime, txHash: h.txHash || t.txHash, tur: t.txType,
          });
        }
      }
    }
  }
  return [...harita.values()].sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman));
}

async function topluCagri(cagrilar) {
  if (!cagrilar.length) return [];
  const govde = cagrilar.map((c, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [c, 'latest'] }));
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde), signal: AbortSignal.timeout(15_000) });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j?.error?.message || 'RPC toplu yanıt vermedi');
  const sonuc = [];
  for (const x of j) sonuc[x.id] = x;
  return sonuc;
}

const u256 = (n) => BigInt(n).toString(16).padStart(64, '0');

export function stringCoz(hex) {
  const h = String(hex || '').slice(2);
  if (h.length < 128) return null;
  const uzunluk = Number(BigInt('0x' + h.slice(64, 128)));
  if (uzunluk > 200) return null;
  return Buffer.from(h.slice(128, 128 + uzunluk * 2), 'hex').toString('utf8').replace(/[\u0000-\u001f]/g, '') || null;
}

// Adayların sahipliğini zincirde doğrular, koleksiyonlara göre gruplar
export async function nftDogrula(adaylar, cuzdan, cagir = topluCagri) {
  const ben = adresKontrol(cuzdan, 'cüzdan').toLowerCase();
  const kontratlar = [...new Set(adaylar.map((a) => a.kontrat.toLowerCase()))];
  const sahiplik = await cagir(adaylar.map((a) => ({ to: a.kontrat, data: SEC.ownerOf + u256(a.tokenId) })));
  const adlar = await cagir(kontratlar.map((k) => ({ to: k, data: SEC.name })));
  const bakiyeler = await cagir(kontratlar.map((k) => ({ to: k, data: SEC.balanceOf + ben.slice(2).padStart(64, '0') })));
  const adMap = Object.fromEntries(kontratlar.map((k, i) => [k, stringCoz(adlar[i]?.result)]));
  // Geçmiş bazen çoklu mintin sadece bir tokenini kaydeder; adet için zincirdeki bakiye esas alınır
  const adetMap = Object.fromEntries(kontratlar.map((k, i) => {
    const r = bakiyeler[i]?.result;
    return [k, r && r.length >= 66 ? Number(BigInt(r.slice(0, 66))) : null];
  }));
  const koleksiyonlar = new Map();
  adaylar.forEach((a, i) => {
    const r = sahiplik[i];
    const sahip = r?.result?.length >= 66 ? ('0x' + r.result.slice(26)).toLowerCase() : null;
    const durum = sahip === ben ? 'sende' : sahip ? 'devredilmis' : 'dogrulanamadi';
    if (durum === 'devredilmis') return;
    const k = a.kontrat.toLowerCase();
    if (!koleksiyonlar.has(k)) koleksiyonlar.set(k, { kontrat: a.kontrat, ad: adMap[k] || a.sembol || '?', sembol: a.sembol, tokenler: [] });
    koleksiyonlar.get(k).tokenler.push({ tokenId: a.tokenId, zaman: a.zaman, txHash: a.txHash, dogrulandi: durum === 'sende' });
  });
  return [...koleksiyonlar.values()]
    .map((k) => ({ ...k, adet: Math.max(adetMap[k.kontrat.toLowerCase()] ?? 0, k.tokenler.filter((t) => t.dogrulandi).length) }));
}

export function nftServisi({ baw, sureMs = 120_000 }) {
  let onbellek = { at: 0, v: null, cuzdan: null };
  return async function nftler({ yenile = false } = {}) {
    const cuzdan = await baw.adres();
    if (!cuzdan) throw new Error('Cüzdan adresi alınamadı');
    if (!yenile && onbellek.v && onbellek.cuzdan === cuzdan && Date.now() - onbellek.at < sureMs) return onbellek.v;
    const islemler = [];
    let imlec = null;
    for (let sayfa = 0; sayfa < 10; sayfa++) {
      const d = await baw.islemGecmisi({ imlec });
      islemler.push(...(d?.transactions || []));
      if (!d?.hasMore || !d.nextCursor) break;
      imlec = d.nextCursor;
    }
    const v = await nftDogrula(nftAdaylari(islemler, cuzdan), cuzdan);
    onbellek = { at: Date.now(), v, cuzdan };
    return v;
  };
}
