// Defter: cüzdanın zincir geçmişini (baw tx-history) işlem bazında normalize eder.
// Binance geçmişi tek bir işlemi aynı txHash'le birden fazla kayda bölebilir (biri BNB çıkışı, biri token girişi)
// ve gas ücreti her kayıtta tekrar eder. Bu yüzden kayıtlar txHash'e göre birleştirilir, gas bir kez sayılır.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const BNB_ADRES = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const sayi = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function kalem(r) {
  const t = r?.tokenInfo || {};
  const kontrat = String(t.contractAddress || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(kontrat)) return null;
  return { kontrat, sembol: String(t.symbol || '').slice(0, 30), miktar: sayi(r.amount), tokenId: t.tokenId != null ? String(t.tokenId) : null };
}

// kayıtlar: tx-history "transactions" dizisi. Dönen işlemler eskiden yeniye sıralıdır
export function defterOlustur(kayitlar) {
  const harita = new Map();
  for (const k of kayitlar) {
    if (k?.status !== 'confirmed') continue;
    for (const h of k.txHashList || []) {
      if (h.status && h.status !== 'confirmed') continue;
      const hash = String(h.txHash || k.txHash || '').toLowerCase();
      if (!hash) continue;
      const i = harita.get(hash) || { hash, zaman: Date.parse(k.txTime) || 0, turler: new Set(), gasBnb: 0, cikan: [], giren: [] };
      i.turler.add(k.txType);
      const f = h.networkFee;
      if (f && String(f.feeTokenAddress || '').toLowerCase() === BNB_ADRES) {
        i.gasBnb = Math.max(i.gasBnb, sayi(f.feeValue) / 10 ** (sayi(f.feeTokenDecimals) || 18));
      }
      for (const [alan, hedef] of [['send', i.cikan], ['receive', i.giren]]) {
        for (const r of h.instructions?.[alan] || []) {
          const x = kalem(r);
          // Bölünmüş kayıtlar aynı kalemi iki kez getirebilir
          if (x && !hedef.some((y) => y.kontrat === x.kontrat && y.tokenId === x.tokenId && y.miktar === x.miktar)) hedef.push(x);
        }
      }
      harita.set(hash, i);
    }
  }
  return [...harita.values()].map((i) => {
    // BNB her iki yönde de varsa (örneğin artan BNB iadesi) net hali tutulur
    const bnbCik = i.cikan.filter((x) => x.kontrat === BNB_ADRES).reduce((a, x) => a + x.miktar, 0);
    const bnbGir = i.giren.filter((x) => x.kontrat === BNB_ADRES).reduce((a, x) => a + x.miktar, 0);
    const net = bnbGir - bnbCik;
    return {
      hash: i.hash, zaman: i.zaman, tur: [...i.turler].sort().join('+'), gasBnb: i.gasBnb,
      bnbNet: Math.abs(net) < 1e-15 ? 0 : net,
      cikan: i.cikan.filter((x) => x.kontrat !== BNB_ADRES),
      giren: i.giren.filter((x) => x.kontrat !== BNB_ADRES),
    };
  }).sort((a, b) => a.zaman - b.zaman);
}

// Geçmişi sayfa sayfa çeker. Ham kayıtlar diskte tutulur, sonraki çağrılarda sadece yeni sayfalar istenir
export class Defter {
  constructor({ baw, dosya = null, maxSayfa = 50 }) {
    Object.assign(this, { baw, dosya, maxSayfa });
    this.ham = new Map();
    this.cuzdan = null;
    try {
      if (dosya && existsSync(dosya)) {
        const d = JSON.parse(readFileSync(dosya, 'utf8'));
        this.cuzdan = d.cuzdan || null;
        for (const k of d.kayitlar || []) this.ham.set(this.#anahtar(k), k);
      }
    } catch { /* bozuksa baştan çekilir */ }
  }

  #anahtar(k) { return `${k.txHash}|${k.txType}|${JSON.stringify(k.txHashList?.[0]?.instructions || {}).length}|${k.txTime}`; }

  async esitle(cuzdan) {
    if (this.cuzdan && cuzdan && this.cuzdan.toLowerCase() !== cuzdan.toLowerCase()) this.ham.clear();
    this.cuzdan = cuzdan;
    let imlec = null, yeni = 0;
    for (let s = 0; s < this.maxSayfa; s++) {
      const d = await this.baw.islemGecmisi({ imlec });
      const liste = d?.transactions || [];
      let bilinen = 0;
      for (const k of liste) {
        const a = this.#anahtar(k);
        if (this.ham.has(a) && this.ham.get(a).status === k.status) bilinen++;
        else { this.ham.set(a, k); yeni++; }
      }
      // Bir sayfanın tamamı zaten biliniyorsa daha eskisi de bilinir
      if (!d?.hasMore || !d.nextCursor || (liste.length && bilinen === liste.length)) break;
      imlec = d.nextCursor;
    }
    if (this.dosya && yeni) {
      try { writeFileSync(this.dosya, JSON.stringify({ cuzdan, kayitlar: [...this.ham.values()] })); } catch { /* bellekte kalır */ }
    }
    return { yeni, toplam: this.ham.size };
  }

  islemler() { return defterOlustur([...this.ham.values()]); }
}
