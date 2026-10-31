// Yapay zekâ maliyeti: OpenRouter'ın kendi kullanım verisi (anahtar toplamı, günlük, haftalık, aylık, sınır) ve terminalin
// her LLM çağrısını ve web aramasını yazdığı yerel defter (data/llm-maliyet.jsonl). Defter adım ve mint bazında dağılımı verir;
// OpenRouter verisi gerçek harcamadır (defter tutulmaya başlamadan önceki harcamalar da dahil).
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

// Brave aramaları aylık ücretsiz krediden düşer: 1.000 arama 5 $
export const BRAVE_ARAMA_USD = 0.005;
const GUN = 86_400_000;

export class MaliyetTakibi {
  constructor({ dosya = null, anahtar = () => '', fetchFn = globalThis.fetch, onbellekMs = 60_000, saat = () => Date.now() } = {}) {
    Object.assign(this, { dosya, anahtar, fetchFn, onbellekMs, saat });
    this.son = null;
  }

  // ajan: 'Site' | 'Sosyal' | 'Hakem' | 'Arama'; maliyet USD (OpenRouter'ın bildirdiği gerçek tutar)
  kaydet({ ajan, model = null, maliyet = 0, adres = null, adet = 1 }) {
    if (!this.dosya) return;
    const k = { zaman: this.saat(), ajan, model, maliyet: Number.isFinite(maliyet) ? maliyet : 0, adres, adet };
    try { appendFileSync(this.dosya, JSON.stringify(k) + '\n'); } catch { /* defter yazılamazsa işlem yine sürer */ }
  }

  kayitlar() {
    if (!this.dosya || !existsSync(this.dosya)) return [];
    return readFileSync(this.dosya, 'utf8').split('\n').filter(Boolean).flatMap((s) => { try { return [JSON.parse(s)]; } catch { return []; } });
  }

  yerelOzet() {
    const k = this.kayitlar();
    const simdi = this.saat();
    const bugunBas = new Date(simdi); bugunBas.setHours(0, 0, 0, 0);
    const topla = (liste) => liste.reduce((t, x) => t + (x.maliyet || 0), 0);
    const ajanlar = {};
    for (const x of k) {
      const a = (ajanlar[x.ajan] ||= { cagri: 0, usd: 0, ucretsiz: 0 });
      a.cagri += x.adet || 1;
      a.usd += x.maliyet || 0;
      if (!x.maliyet) a.ucretsiz += x.adet || 1;
    }
    const modeller = {};
    for (const x of k.filter((y) => y.model)) {
      const m = (modeller[x.model] ||= { cagri: 0, usd: 0 });
      m.cagri += 1; m.usd += x.maliyet || 0;
    }
    const mintler = new Set(k.filter((x) => x.adres).map((x) => String(x.adres).toLowerCase()));
    const llm = k.filter((x) => x.ajan !== 'Arama');
    const aramalar = k.filter((x) => x.ajan === 'Arama');
    return {
      baslangic: k[0]?.zaman ?? null,
      bugunUsd: topla(llm.filter((x) => x.zaman >= +bugunBas)), son7GunUsd: topla(llm.filter((x) => x.zaman >= simdi - 7 * GUN)), toplamUsd: topla(llm),
      ajanlar, modeller, arastirilanMint: mintler.size,
      mintBasinaUsd: mintler.size ? topla(llm) / mintler.size : null,
      // Brave araması ücretsiz krediden düşer; ay içindeki sayı kotayı izlemek için
      aramaBuAy: aramalar.filter((x) => new Date(x.zaman).getMonth() === new Date(simdi).getMonth() && new Date(x.zaman).getFullYear() === new Date(simdi).getFullYear()).reduce((t, x) => t + (x.adet || 1), 0),
    };
  }

  // OpenRouter'daki gerçek harcama. Anahtar yoksa ya da ulaşılamazsa null
  async openRouter({ yenile = false } = {}) {
    if (!yenile && this.son && this.saat() - this.son.at < this.onbellekMs) return this.son.v;
    const anahtar = this.anahtar();
    if (!anahtar) return null;
    const al = async (yol) => {
      const r = await this.fetchFn(`https://openrouter.ai/api/v1/${yol}`, { headers: { authorization: `Bearer ${anahtar}` }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
      return (await r.json())?.data;
    };
    let v = null;
    try {
      const [k, c] = await Promise.all([al('key'), al('credits').catch(() => null)]);
      v = {
        toplamUsd: Number(k?.usage) || 0, bugunUsd: Number(k?.usage_daily) || 0, haftaUsd: Number(k?.usage_weekly) || 0, ayUsd: Number(k?.usage_monthly) || 0,
        sinirUsd: k?.limit == null ? null : Number(k.limit), kalanUsd: k?.limit_remaining == null ? null : Number(k.limit_remaining),
        ucretsizIstek: k?.free_model_daily_requests ? { kullanilan: k.free_model_daily_requests.used, sinir: k.free_model_daily_requests.limit } : null,
        hesapKrediUsd: c ? Number(c.total_credits) || 0 : null, hesapKullanimUsd: c ? Number(c.total_usage) || 0 : null,
      };
    } catch (e) { v = { hata: e.message }; }
    this.son = { at: this.saat(), v };
    return v;
  }

  async durum(o) {
    return { openRouter: await this.openRouter(o), yerel: this.yerelOzet(), braveAramaUsd: BRAVE_ARAMA_USD };
  }
}
