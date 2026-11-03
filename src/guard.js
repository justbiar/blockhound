// Güvenlik kapısı: ağa dokunmayan, test edilebilir saf fonksiyonlar.

export const ADRES_RE = /^0x[0-9a-fA-F]{40}$/;

export function adresKontrol(a, ad = 'adres') {
  if (typeof a !== 'string' || !ADRES_RE.test(a)) throw new Error(`Geçersiz ${ad}: ${String(a).slice(0, 60)}`);
  return a;
}

export function miktarKontrol(v, ad = 'miktar') {
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) throw new Error(`Geçersiz ${ad}: ${s || '(boş)'}`);
  return s;
}

const BASARILI_SIMULASYON = '000000000';

// contract-call preview sonucunu inceler. Herhangi bir şüphe varsa ok=false döner, sebepleri listeler.
// izinliOnay: { token, spender, maxMiktar } verilirse sadece o tokende, o spender'a, en fazla o miktara (ham birim) onay kabul edilir.
// izinliCikis: { token, maxMiktar } verilirse (satış) cüzdandan yalnızca o token, en fazla o miktar (ham birim) çıkabilir.
export function previewIncele(pre, { cuzdan, izinliOnay = null, izinliCikis = null } = {}) {
  const sebepler = [];
  if (!pre || typeof pre !== 'object') return { ok: false, sebepler: ['Preview sonucu boş'] };
  if (!pre.requestId) sebepler.push('Preview requestId döndürmedi (Binance işlemi engellemiş olabilir)');

  const sim = pre.simulationResult || {};
  if (sim.simulationCode !== BASARILI_SIMULASYON) {
    sebepler.push(`Simülasyon başarısız: ${sim.simulationCode ?? 'kod yok'}${sim.simulationErrorDetail ? ` (${sim.simulationErrorDetail})` : ''}`);
  }

  const risks = pre.risks || {};
  for (const r of risks.riskDetails || []) sebepler.push(`Risk uyarısı: ${r.title || r.code}${r.description ? ` · ${r.description}` : ''}`);
  for (const [adres, bilgi] of Object.entries(risks.addresses || {})) {
    if ((bilgi?.riskLevel ?? 0) > 0 || (bilgi?.riskDetails || []).length) sebepler.push(`Riskli adres: ${adres} (seviye ${bilgi?.riskLevel ?? '?'})`);
  }
  for (const b of risks.riskBehaviors || []) sebepler.push(`Riskli davranış: ${typeof b === 'string' ? b : JSON.stringify(b).slice(0, 120)}`);

  for (const a of sim.authorityChanges || []) sebepler.push(`Yetki değişikliği: ${JSON.stringify(a).slice(0, 160)}`);

  for (const a of sim.allowanceChanges || []) {
    const spender = String(a.spender || a.spenderAddress || '').toLowerCase();
    // Binance preview: postAmount = onay sonrası ham miktar (sayı olarak, float hassasiyetiyle)
    const miktar = Number(a.postAmount ?? a.change ?? a.amount ?? NaN);
    const tokenUyar = !izinliOnay?.token || String(a.tokenAddress || '').toLowerCase() === String(izinliOnay.token).toLowerCase();
    const izinli = izinliOnay && tokenUyar
      && spender === String(izinliOnay.spender).toLowerCase()
      && Number.isFinite(miktar) && miktar <= Number(izinliOnay.maxMiktar) * (1 + 1e-9);
    if (!izinli) sebepler.push(`Beklenmeyen onay (approval): ${JSON.stringify(a).slice(0, 160)}`);
  }

  // Cüzdandan, gönderilen değer dışında token ya da NFT çıkışı olmamalı
  const ben = String(cuzdan || '').toLowerCase();
  for (const b of sim.balanceChanges || []) {
    if (ben && String(b.owner || '').toLowerCase() === ben && Number(b.change) < 0 && b.tokenType !== 'Native') {
      const izinli = izinliCikis && b.tokenType !== 'Erc721' && String(b.contractAddress || '').toLowerCase() === String(izinliCikis.token).toLowerCase()
        && -Number(b.change) <= Number(izinliCikis.maxMiktar) * (1 + 1e-9);
      if (!izinli) sebepler.push(`Cüzdandan çıkış: ${b.tokenType} ${b.contractAddress} (${b.change})`);
    }
  }

  return { ok: sebepler.length === 0, sebepler };
}

// İşlem başı ve günlük BNB limiti
export function limitKontrol({ bnb, islemBasiMax, gunlukMax, bugunHarcanan }) {
  const x = Number(bnb);
  if (!Number.isFinite(x) || x <= 0) return { ok: false, sebep: 'BNB miktarı geçersiz' };
  if (islemBasiMax <= 0 || gunlukMax <= 0) return { ok: false, sebep: 'Limitler 0: alım kapalı' };
  if (x > islemBasiMax) return { ok: false, sebep: `İşlem başı limit aşıldı (${x} > ${islemBasiMax} BNB)` };
  if (bugunHarcanan + x > gunlukMax + 1e-12) {
    return { ok: false, sebep: `Günlük limit aşılır (${(bugunHarcanan + x).toFixed(6)} > ${gunlukMax} BNB)` };
  }
  return { ok: true };
}
