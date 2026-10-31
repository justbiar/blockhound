// Ücretsiz web araması: Brave Search API (1.000 arama 5 $, her ay 5 $ ücretsiz kredi: ayda yaklaşık 1.000 ücretsiz arama). OpenRouter'ın ücretli web eklentisinin yerine
// sosyal ajana arama sonuçlarını metin olarak verir. Sonuçlar güvenilmez dış veridir.
export const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

const temiz = (s, n) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

export function braveArama({ anahtar, fetchFn = globalThis.fetch, zamanAsimiMs = 15_000 } = {}) {
  return async function ara(sorgu, adet = 5) {
    if (!anahtar) throw new Error('Brave arama anahtarı yok');
    const url = `${BRAVE_URL}?${new URLSearchParams({ q: sorgu, count: String(Math.min(Math.max(adet, 1), 10)), safesearch: 'off' })}`;
    const res = await fetchFn(url, { headers: { accept: 'application/json', 'x-subscription-token': anahtar }, signal: AbortSignal.timeout(zamanAsimiMs) });
    if (res.status === 429) throw new Error('Brave arama kotası ya da hız sınırı doldu');
    if (!res.ok) throw new Error(`Brave arama ${res.status}`);
    const j = await res.json();
    return (j?.web?.results || []).map((x) => ({ baslik: temiz(x.title, 120), url: temiz(x.url, 300), aciklama: temiz(x.description, 300) }))
      .filter((x) => /^https?:\/\//.test(x.url));
  };
}

// Yeni bir mint için en iyi sorgu kontrat adresinin kendisi: siteler ve gezginler adresi sayfalarında yazar.
// Adresle gezgin sayfası dışında hiçbir sonuç çıkmazsa koleksiyonun adıyla ikinci bir arama yapılır. Aylık ücretsiz kota
// yaklaşık 1.000 arama olduğu için ikinci arama sadece gerektiğinde
export async function mintAra(ara, r, adet = 5) {
  const sonuclar = [];
  const ekle = (liste) => { for (const x of liste) if (!sonuclar.some((y) => y.url === x.url)) sonuclar.push(x); };
  ekle(await ara(r.adres, adet));
  const anlamli = sonuclar.filter((x) => !/bscscan\.com|etherscan\.io|bitquery\.io|oklink\.com/.test(x.url));
  if (!anlamli.length && r.ad) ekle(await ara(`"${r.ad}" NFT BNB Chain mint`, adet));
  return sonuclar.slice(0, adet * 2);
}

export const aramaMetni = (sonuclar) => sonuclar.map((x, i) => `${i + 1}. ${x.baslik}\n   ${x.url}\n   ${x.aciklama}`).join('\n');
