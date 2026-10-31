// Ücretsiz, kod tabanlı mint süzgeci: LLM araştırması kapalıyken otomatik mint kararını besler. Hepsi okuma yapar.
//  1. OKX işlem taraması: mint işleminin kendisi (kara liste, kötü niyetli token, onay hilesi, EIP-7702 hilesi)
//  2. OKX token taraması (token mintlerinde): bal tuzağı, yüksek risk, yüksek alım / satım vergisi
//  3. Site: metadata'daki site OKX kara listesinde mi, sitenin kodu cüzdan izni ya da imza istiyor mu
//  4. Taklit adı: Binance, CZ, USDT gibi markaları kullanan koleksiyonlar
// Son kapı yine gönderimden önceki Binance önizlemesidir (token izni, yetki değişikliği, beklenmeyen çıkış).
// OKX'e ulaşılamazsa bu kontrol engel sayılmaz, not düşülür: ücretsiz bir servisin kesintisi mintleri durdurmasın.

export const TAKLIT = /binance|\bcz\b|changpeng|pancake\s*swap|opensea|tether|\busdt\b|\busdc\b|metamask|trust\s*wallet|coinbase|official\s*airdrop|claim\s*reward/i;
// Mint sitesinin kodunda bulunmaması gereken çağrılar: kullanıcıdan token harcama izni ya da kör imza ister
export const SITE_IZIN = /setApprovalForAll\s*\(|\.approve\s*\(|increaseAllowance|\bpermit\s*\(|eth_sign\b|signTypedData|personal_sign/;
const VERGI_SINIR = 10;

export async function suzgec({ r, veri = null, cuzdan, tx, okx }) {
  const riskler = [];
  const notlar = [];
  const dene = async (ad, fn) => { try { return await fn(); } catch (e) { notlar.push(`${ad} yapılamadı: ${String(e.message).slice(0, 80)}`); return null; } };

  if (TAKLIT.test(`${r.ad || ''} ${r.sembol || ''}`)) riskler.push(`Taklit adı: "${r.ad || r.sembol}" bilinen bir markayı kullanıyor`);

  if (tx) {
    const s = await dene('OKX işlem taraması', () => okx(['security', 'tx-scan', '--chain', 'bsc', '--from', cuzdan, '--to', r.adres, '--data', tx.veri, '--value', String(tx.degerWei ?? 0)]));
    if (s && (s.action === 'block' || s.action === 'warn')) {
      riskler.push(`OKX işlem taraması: ${(s.riskItemDetail || []).map((x) => x.name).filter(Boolean).join(', ') || s.action}`);
    }
  }

  if (r.tur === 'token' && r.token) {
    const s = await dene('OKX token taraması', () => okx(['security', 'token-scan', '--tokens', `56:${r.token}`, '--trade-direction', 'sell']));
    const t = s?.tokens?.[0];
    if (t) {
      if (t.isHoneypot) riskler.push('Token bal tuzağı (alınır ama satılamaz)');
      else if (t.action === 'block' || ['HIGH', 'CRITICAL'].includes(String(t.riskLevel).toUpperCase())) riskler.push(`Token riski ${t.riskLevel}`);
      const vergi = Math.max(Number(t.buyTaxes) || 0, Number(t.sellTaxes) || 0);
      if (vergi > VERGI_SINIR) riskler.push(`Token vergisi %${vergi}`);
      if (!riskler.length && t.riskLevel) notlar.push(`Token riski ${t.riskLevel}${t.isLowLiquidity ? ', düşük likidite' : ''}`);
    }
  }

  if (veri?.site) {
    const s = await dene('OKX site taraması', () => okx(['security', 'dapp-scan', '--domain', veri.site, '--chain', 'bsc']));
    if (s?.isMalicious) riskler.push(`Site OKX'in kara listesinde: ${veri.site}`);
    const m = SITE_IZIN.exec(`${veri.siteMetni || ''}\n${veri.jsMetni || ''}`);
    if (m) riskler.push(`Site kodu cüzdan izni ya da imza istiyor (${m[0].replace(/\s*\($/, '')})`);
  }

  return { riskler, notlar, zaman: Date.now() };
}
