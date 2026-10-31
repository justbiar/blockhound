// OpenRouter sohbet istemcisi. Cevap her zaman verilen JSON şemasına zorlanır; şemaya uymayan cevap hata sayılır.
// model virgüllü bir liste olabilir: ilki hata verirse (hız sınırı gibi) OpenRouter sıradakine geçer.
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function modelSec(model) {
  const liste = String(model || '').split(',').map((x) => x.trim()).filter(Boolean);
  return liste.length > 1 ? { model: liste[0], models: liste } : { model: liste[0] };
}

export function openRouter({ anahtar, fetchFn = globalThis.fetch, zamanAsimiMs = 60_000 } = {}) {
  return async function sohbet({ model, sistem, kullanici, sema, web = null }) {
    if (!anahtar) throw new Error('OPENROUTER_API_KEY tanımlı değil');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), zamanAsimiMs);
    try {
      const res = await fetchFn(OPENROUTER_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: { authorization: `Bearer ${anahtar}`, 'content-type': 'application/json', 'x-title': 'Blockhound' },
        body: JSON.stringify({
          ...modelSec(model), temperature: 0,
          // Gerçek maliyet cevapta gelsin: günlük sayaç bununla tutulur
          usage: { include: true },
          messages: [{ role: 'system', content: sistem }, { role: 'user', content: kullanici }],
          response_format: { type: 'json_schema', json_schema: { name: sema.ad, strict: true, schema: sema.sema } },
          ...(web ? { plugins: [{ id: 'web', max_results: web }] } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${String(j?.error?.message || '').slice(0, 200)}`);
      const icerik = j?.choices?.[0]?.message?.content;
      let veri;
      try { veri = JSON.parse(String(icerik ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('Model geçerli JSON döndürmedi'); }
      return { veri, maliyet: Number(j?.usage?.cost ?? NaN), model: j?.model || model };
    } finally { clearTimeout(t); }
  };
}
