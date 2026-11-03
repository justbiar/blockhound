// Alım / satım rotalama: Four.meme tokeni bonding curve'deyse resmi script + contract-call, değilse market-order.
// dex 'pancake' seçilirse işlem doğrudan PancakeSwap router'ına contract-call olarak gider (aynı preview ve limit kapısından).
// Hem elle yapılan emirler hem otomasyon bu fonksiyonları kullanır; böylece güvenlik kontrolleri tek yerde kalır.
import { makbuzTutari } from './pancake.js';

export function islemlerOlustur({ trader, baw, four, pancake = null, provider = null }) {
  let cuzdanAdresi = null;
  const adresAl = async () => (cuzdanAdresi ||= await baw.adres());
  const makbuzlar = new Map();   // emir id -> zincir sonucu promise'i

  // Sonuç: { rota: 'contract-call' | 'market-order', bilgi? }
  async function rotaBelirle(token) {
    if (!four.fourAdresiMi(token)) return { rota: 'market-order' };
    const b = await four.bilgi(token, await adresAl());
    if (b.route === 'contract-call' || b.route === 'market-order') return { rota: b.route, bilgi: b };
    if (b.route === 'wait') throw new Error('Token DEX\'e taşınıyor, şu an işlem yapılamaz. Biraz sonra tekrar dene.');
    if (b.route === 'unavailable' && b.isAgentIdExclusive) throw new Error(`Token şu an işleme kapalı (aşama: ${b.curve?.phase?.name || '?'})`);
    return { rota: 'market-order', bilgi: b };
  }

  // Bonding curve işlemi zincire gittiyse makbuzu arka planda bekle, gerçek tutarları emre yaz
  function makbuzTakip(emir) {
    if (emir?.durum !== 'gonderildi' || !emir.txHash) return emir;
    const p = four.makbuzBekle(emir.txHash).then((m) => {
      if (m.status === 'success') {
        const t = (m.trades || []).find((x) => x.token?.address?.toLowerCase() === String(emir.token).toLowerCase());
        return trader.emirIsle(emir.id, {
          durum: 'tamamlandi', sebep: null,
          ...(t && emir.yon === 'al' ? { alinan: t.tokenAmount, odenenBnb: t.traderQuoteAmount } : {}),
          ...(t && emir.yon === 'sat' ? { gelenBnb: t.traderQuoteAmount } : {}),
        });
      }
      if (m.status === 'reverted') return trader.emirIsle(emir.id, { durum: 'basarisiz', sebep: 'Zincirde geri döndü (revert). Gas ödendi, işlem olmadı.' });
      return emir;
    }).catch(() => emir).finally(() => setTimeout(() => makbuzlar.delete(emir.id), 60_000));
    makbuzlar.set(emir.id, p);
    return emir;
  }

  // Emrin kesin sonucunu bekle (otomasyon için)
  const sonucBekle = async (emir) => (makbuzlar.get(emir.id) ? makbuzlar.get(emir.id) : emir);

  // --- PancakeSwap ---
  const pancakeHazir = () => { if (!pancake || !provider) throw new Error('PancakeSwap rotası bu sunucuda kurulu değil'); };
  const pancakeTeklif = async ({ yon, token, miktar, kayma }) => {
    pancakeHazir();
    return pancake.teklif({ yon, token, miktar, kayma: kayma ?? trader.varsayilanKayma, cuzdan: await adresAl() });
  };

  // Zincire gittiyse makbuzu arka planda bekle, gerçekleşen tutarı emre yaz
  function pancakeMakbuz(emir, { yon, token, cuzdan, ondalik }) {
    if (emir?.durum !== 'gonderildi' || !emir.txHash) return emir;
    const p = provider.waitForTransaction(emir.txHash, 1, 180_000).then((m) => {
      if (!m) return emir;
      if (m.status !== 1) return trader.emirIsle(emir.id, { durum: 'basarisiz', sebep: 'Zincirde geri döndü (revert). Gas ödendi, işlem olmadı.' });
      const tutar = makbuzTutari(m, { yon, token, cuzdan, ondalik });
      return trader.emirIsle(emir.id, { durum: 'tamamlandi', sebep: null, ...(tutar && yon === 'al' ? { alinan: tutar } : {}), ...(tutar && yon === 'sat' ? { gelenBnb: tutar } : {}) });
    }).catch(() => emir).finally(() => setTimeout(() => makbuzlar.delete(emir.id), 60_000));
    makbuzlar.set(emir.id, p);
    return emir;
  }

  async function pancakeAl({ token, bnb, kayma, kaynak }) {
    const q = await pancakeTeklif({ yon: 'al', token, miktar: bnb, kayma });
    const cuzdan = await adresAl();
    return pancakeMakbuz(await trader.kontratEmriVer({
      yon: 'al', token, miktar: bnb, kayma: q.slippage * 100, cuzdan, tx: q.tx, rota: q.rotaAd, kaynak,
      teklif: { toCoinAmount: q.toCoinAmount, toCoinSymbol: q.toCoinSymbol },
    }), { yon: 'al', token, cuzdan, ondalik: q.ondalik });
  }

  // Satış: gerekirse önce tam miktar kadar router'a onay, onay zincirde onaylanınca yeniden teklif ve satış
  async function pancakeSat({ token, miktar, kayma, kaynak }) {
    let q = await pancakeTeklif({ yon: 'sat', token, miktar, kayma });
    const cuzdan = await adresAl();
    if (q.onay) {
      const onay = await trader.kontratEmriVer({
        yon: 'onay', token, miktar, cuzdan, tx: q.onay.tx, rota: 'onay', kaynak,
        izinliOnay: { token, spender: q.onay.spender, maxMiktar: Number(q.onay.miktarHam) },
        teklif: { toCoinAmount: miktar, toCoinSymbol: `${q.fromCoinSymbol} onayı (PancakeSwap)` },
      });
      if (onay.durum === 'simulasyon') return trader.emirIsle(onay.id, { sebep: 'Onay preview temiz. Canlıda önce bu onay, onaylanınca satış gönderilir.' });
      if (onay.durum !== 'gonderildi') return onay;
      const m = await provider.waitForTransaction(onay.txHash, 1, 180_000);
      if (m?.status !== 1) return trader.emirIsle(onay.id, { durum: m ? 'basarisiz' : 'bekliyor', sebep: `Onay ${m ? 'geri döndü' : 'henüz onaylanmadı'}. Satış gönderilmedi.` });
      trader.emirIsle(onay.id, { durum: 'tamamlandi', sebep: null });
      q = await pancakeTeklif({ yon: 'sat', token, miktar, kayma });
      if (q.onay) throw new Error('Onaydan sonra hâlâ onay isteniyor, satış durduruldu');
    }
    const girdiHam = Number(q.onay?.miktarHam ?? 0) || Number(miktar) * 10 ** q.ondalik;
    return pancakeMakbuz(await trader.kontratEmriVer({
      yon: 'sat', token, miktar, kayma: q.slippage * 100, cuzdan, tx: q.tx, rota: q.rotaAd, kaynak,
      izinliCikis: { token, maxMiktar: girdiHam },
      teklif: { toCoinAmount: q.toCoinAmount, toCoinSymbol: q.toCoinSymbol },
    }), { yon: 'sat', token, cuzdan, ondalik: q.ondalik });
  }

  async function teklif({ yon, token, miktar, kayma, dex = null }) {
    if (dex === 'pancake') {
      const q = await pancakeTeklif({ yon, token, miktar, kayma });
      const { tx, onay, ...gorunen } = q;
      return gorunen;
    }
    const { rota } = await rotaBelirle(token);
    if (rota === 'market-order') return { rota, ...(await trader.teklif({ yon, token, miktar, kayma })) };
    const cuzdan = await adresAl();
    if (yon === 'sat') {
      const q = await four.satisTeklifi({ token, cuzdan, miktar, kaymaYuzde: kayma });
      return {
        rota, fromCoinAmount: q.sell.amount, fromCoinSymbol: q.token.symbol, toCoinAmount: q.estimate.userReceives, toCoinSymbol: q.receive,
        slippage: Number(q.slippagePercent) / 100, enAz: q.minReceive, onayGerekli: !!q.approveTx,
      };
    }
    const q = await four.alimTeklifi({ token, cuzdan, bnb: miktar, kaymaYuzde: kayma });
    return {
      rota, fromCoinAmount: q.estimate.userPays, fromCoinSymbol: q.pay.symbol, toCoinAmount: q.estimate.tokenAmount, toCoinSymbol: q.token.symbol,
      slippage: Number(q.slippagePercent) / 100, enAz: q.minTokenOut, ucret: q.estimate.totalFee, tavanUyarisi: !!q.estimate.budgetNotFullyUsed,
    };
  }

  async function al({ token, bnb, kayma, kaynak = 'manuel', dex = null }) {
    if (dex === 'pancake') return pancakeAl({ token, bnb, kayma, kaynak });
    const { rota } = await rotaBelirle(token);
    if (rota === 'market-order') return trader.emirVer({ yon: 'al', token, miktar: bnb, kayma, kaynak });
    const cuzdan = await adresAl();
    const q = await four.alimTeklifi({ token, cuzdan, bnb, kaymaYuzde: kayma });
    return makbuzTakip(await trader.kontratEmriVer({
      yon: 'al', token, miktar: bnb, kayma: Number(q.slippagePercent), cuzdan, tx: q.tx, kaynak,
      teklif: { toCoinAmount: q.estimate.tokenAmount, toCoinSymbol: q.token.symbol },
    }));
  }

  // Bonding curve satışı: gerekirse önce tam miktar onay, onay zincirde onaylanınca yeniden teklif ve satış
  async function curveSat({ token, miktar, kayma, kaynak }) {
    const cuzdan = await adresAl();
    let q = await four.satisTeklifi({ token, cuzdan, miktar, kaymaYuzde: kayma });
    if (q.approveTx) {
      const izinliOnay = { token, spender: four.FOUR_CORE, maxMiktar: Number(q.sell.amountRaw) };
      const onay = await trader.kontratEmriVer({
        yon: 'onay', token, miktar: q.sell.amount, cuzdan, tx: q.approveTx, izinliOnay, rota: 'onay', kaynak,
        teklif: { toCoinAmount: q.sell.amount, toCoinSymbol: `${q.token.symbol} onayı (Four Core)` },
      });
      if (onay.durum === 'simulasyon') return trader.emirIsle(onay.id, { sebep: 'Onay preview temiz. Canlıda önce bu onay, onaylanınca satış gönderilir.' });
      if (onay.durum !== 'gonderildi') return onay;
      const m = await four.makbuzBekle(onay.txHash);
      if (m.status !== 'success') return trader.emirIsle(onay.id, { durum: m.status === 'reverted' ? 'basarisiz' : 'bekliyor', sebep: `Onay ${m.status}. Satış gönderilmedi.` });
      trader.emirIsle(onay.id, { durum: 'tamamlandi', sebep: null });
      q = await four.satisTeklifi({ token, cuzdan, miktar, kaymaYuzde: kayma });
      if (q.approveTx) throw new Error('Onaydan sonra hâlâ onay isteniyor, satış durduruldu');
    }
    return makbuzTakip(await trader.kontratEmriVer({
      yon: 'sat', token, miktar: q.sell.amount, kayma: Number(q.slippagePercent), cuzdan, tx: q.tx, kaynak,
      izinliCikis: { token, maxMiktar: Number(q.sell.amountRaw) },
      teklif: { toCoinAmount: q.estimate.userReceives, toCoinSymbol: q.receive },
    }));
  }

  async function sat({ token, miktar, kayma, kaynak = 'manuel', dex = null }) {
    if (dex === 'pancake') return pancakeSat({ token, miktar, kayma, kaynak });
    const { rota } = await rotaBelirle(token);
    if (rota === 'market-order') return trader.emirVer({ yon: 'sat', token, miktar, kayma, kaynak });
    return curveSat({ token, miktar, kayma, kaynak });
  }

  // Elde tutulan token için BNB cinsinden tahmini değer (otomatik satış kararı için)
  async function degerBnb({ token, miktar }) {
    const t = await teklif({ yon: 'sat', token, miktar, kayma: undefined });
    return { bnb: Number(t.toCoinAmount), rota: t.rota };
  }

  // Yeniden girişte başka bir hesaba bağlanılmış olabilir
  const adresSifirla = () => { cuzdanAdresi = null; };

  return { adresAl, adresSifirla, rotaBelirle, teklif, al, sat, degerBnb, sonucBekle };
}
