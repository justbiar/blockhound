// Four.meme iş API'si (resmi openfour-docs scripts/api/fourMemeClient.js akışı).
// Giriş: nonce -> "You are sign in Meme {nonce}" düz metin imzası -> erişim anahtarı.
const AG = { 'meme-network-code': '0' }; // 0 = BSC (zincir kimliği değil)

export function fourmemeApi({ taban, fetchFn = globalThis.fetch }) {
  const url = (yol) => `${taban.replace(/\/+$/, '')}/${yol.replace(/^\/+/, '')}`;

  async function istek(yol, { method = 'GET', govde, erisim, form } = {}) {
    const headers = { ...AG, ...(erisim ? { 'meme-web-access': erisim } : {}) };
    let body;
    if (form) body = form;
    else if (govde !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(govde);
    }
    const r = await fetchFn(url(yol), { method, headers, body, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`Four.meme HTTP ${r.status}`);
    const j = await r.json();
    if (!(j?.code === 0 || j?.code === '0')) throw new Error(`Four.meme: ${j?.msg || j?.message || 'bilinmeyen hata'}`);
    return j.data;
  }

  return {
    async giris(imzaci) {
      const adres = await imzaci.getAddress();
      const nonce = await istek('/private/user/nonce/generate', {
        method: 'POST', govde: { accountAddress: adres, verifyType: 'LOGIN', networkCode: 0 },
      });
      const imza = await imzaci.signMessage(`You are sign in Meme ${nonce}`);
      const erisim = await istek('/private/user/login/dex', {
        method: 'POST',
        govde: {
          region: 'WEB', langType: 'EN', loginIp: '', inviteCode: '', walletName: 'MetaMask',
          verifyInfo: { address: adres, networkCode: 0, signature: imza, verifyType: 'LOGIN' },
        },
      });
      if (!erisim || typeof erisim !== 'string') throw new Error('Four.meme girişi erişim anahtarı döndürmedi');
      return { adres, erisim };
    },

    async sablonAyari(sablonId) {
      const liste = await istek(`/public/token_template/config?templateId=${encodeURIComponent(sablonId)}`);
      if (!Array.isArray(liste) || !liste.length) throw new Error('Şablon ayarı bulunamadı');
      return liste.find((x) => String(x.symbol).toUpperCase() === 'BNB') || liste[0];
    },

    async gorselYukle(erisim, { veri, ad, tur }) {
      const form = new FormData();
      form.append('file', new Blob([veri], { type: tur }), ad);
      const d = await istek('/private/token/upload', { method: 'POST', erisim, form });
      const u = typeof d === 'string' ? d : d?.url ?? d?.imgUrl ?? d?.imageUrl ?? d?.path;
      if (!u) throw new Error('Görsel yüklendi ama adres dönmedi');
      return u;
    },

    async basimIste(erisim, govde) {
      const d = await istek('/private/token_template/token/create', { method: 'POST', erisim, govde });
      const satir = Array.isArray(d) ? d[0] : d;
      if (!satir?.createArg || satir.createArg === '0x' || !satir?.signature || satir.signature === '0x') {
        throw new Error('Four.meme basım verisi ya da imzası dönmedi');
      }
      return satir;
    },
  };
}
