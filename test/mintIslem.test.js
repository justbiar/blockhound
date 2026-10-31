import { test } from 'node:test';
import assert from 'node:assert/strict';
import { id, parseEther } from 'ethers';
import { MintIslem, bnbCikisiDenetle } from '../src/mintIslem.js';
import { Trader } from '../src/trader.js';

const BEN = '0x00000000000000000000000000000000B10c4040';
const NFT = '0x2DC57B951A42B7D86449cD7928DcbaB67867A780';
const sel = (imza) => id(imza).slice(2, 10);

const temizPreview = (degerWei = '0', ek = {}) => ({
  requestId: 'req-1', expiresAt: Date.now() + 60_000, requireConfirmation: false,
  simulationResult: {
    simulationCode: '000000000', authorityChanges: [], allowanceChanges: [],
    balanceChanges: [
      { contractAddress: NFT, change: 1, owner: BEN.toLowerCase(), tokenType: 'Erc721', tokenId: '0x05' },
      ...(degerWei !== '0' ? [{ contractAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', change: -Number(degerWei), owner: BEN.toLowerCase(), tokenType: 'Native' }] : []),
    ],
  },
  risks: { riskDetails: [], addresses: {}, riskBehaviors: [] },
  tokenInfos: { [NFT]: { symbol: 'TST', decimals: 0 } },
  ...ek,
});

function sahteBaw(preview) {
  const b = { previewlar: [], calisan: [] };
  b.preview = async (p) => { b.previewlar.push(p); return typeof preview === 'function' ? preview(p) : preview; };
  b.calistir = async (requestId) => { b.calisan.push(requestId); return { status: 'BROADCASTED', txHash: '0xabc', orderId: 'o1' }; };
  b.kilit = async () => 'UNLOCKED';
  return b;
}

// incele sonucu doğrudan verilir: ağ katmanı mintTakip testlerinde ayrıca denetleniyor
function sahteTakip(rapor) {
  return { cuzdan: async () => BEN, incele: async () => ({ adres: NFT, ad: 'Test', sembol: 'TST', mintler: [], sartliImzalar: [], ...rapor }) };
}

function sahteProvider({ duzTransfer = () => true } = {}) {
  return {
    call: async ({ value }) => { const s = duzTransfer(value); if (s !== true) { const e = new Error(`execution reverted: "${s}"`); e.reason = s; throw e; } return '0x'; },
    estimateGas: async () => 100_000n,
    getFeeData: async () => ({ gasPrice: 1_000_000_000n }),
  };
}

function kur({ preview = temizPreview(), rapor = { sonuc: 'UCRETSIZ', mintler: [{ imza: 'mint(uint256)', gecti: true, ucretWei: '0' }] }, canli = true,
  islemBasiMax = 0.002, gunlukMax = 0.004, provider = sahteProvider() } = {}) {
  const baw = sahteBaw(preview);
  const trader = new Trader({ baw, canli, islemBasiMax, gunlukMax });
  const m = new MintIslem({ takip: sahteTakip(rapor), trader, baw, provider, canli, bnbFiyati: async () => 700 });
  return { m, baw, trader };
}

test('hazırla: en ucuz geçen fonksiyonu seçer, calldata cüzdan argümanıyla kodlanır, özet döner', async () => {
  const { m, baw } = kur({ rapor: { sonuc: 'UCRETSIZ', mintler: [
    { imza: 'publicMint(uint256)', gecti: true, ucretWei: parseEther('0.001').toString() },
    { imza: 'mint(uint256)', gecti: true, ucretWei: '0' },
  ] } });
  const t = await m.hazirla({ adres: NFT });
  assert.equal(t.imza, 'mint(uint256)');
  assert.equal(t.bnb, 0);
  assert.equal(t.gonderilebilir, true);
  assert.equal(t.gasBnb, 0.0001);
  assert.ok(baw.previewlar[0].veri.startsWith('0x' + sel('mint(uint256)')));
  assert.equal(baw.previewlar[0].degerWei, '0');
  assert.equal(t.requestId, undefined, 'requestId arayüze gitmemeli');
  assert.equal(t.bakiyeDegisimleri[0].tokenId, '5');
});

test('hazırla: risk uyarısı, riskli adres, yetki ve onay değişikliği reddedilir', async () => {
  const durumlar = [
    { risks: { riskDetails: [{ title: 'High Risk' }], addresses: {}, riskBehaviors: [] } },
    { risks: { riskDetails: [], addresses: { [NFT]: { riskLevel: 5, riskDetails: [] } }, riskBehaviors: [] } },
    { simulationResult: { ...temizPreview().simulationResult, authorityChanges: [{ x: 1 }] } },
    { simulationResult: { ...temizPreview().simulationResult, allowanceChanges: [{ spender: NFT, postAmount: 1 }] } },
  ];
  for (const ek of durumlar) {
    const { m } = kur({ preview: temizPreview('0', ek) });
    await assert.rejects(m.hazirla({ adres: NFT }), /Preview reddedildi/);
  }
});

test('hazırla: cüzdandan mint değerinden fazla BNB çıkıyorsa reddeder', async () => {
  const deger = parseEther('0.0001').toString();
  assert.equal(bnbCikisiDenetle(temizPreview(deger), { cuzdan: BEN, degerWei: deger }), null);
  assert.match(bnbCikisiDenetle(temizPreview(parseEther('0.01').toString()), { cuzdan: BEN, degerWei: deger }), /fazla BNB/);
});

test('hazırla: imza isteyen mint için buton yerine açıklama', async () => {
  const { m, baw } = kur({ rapor: { sonuc: 'IZLE', mintler: [], sartliImzalar: ['mintWithProof(uint256,uint256,uint256,bytes)'] } });
  await assert.rejects(m.hazirla({ adres: NFT }), /sitenin imzasını istiyor/);
  assert.equal(baw.previewlar.length, 0);
});

test('düz BNB mint: calldata yok, kontrat reddederse preview alınmaz', async () => {
  const kabul = parseEther('0.01');
  const provider = sahteProvider({ duzTransfer: (v) => (v === kabul ? true : 'one') });
  const { m, baw } = kur({ provider, preview: temizPreview(kabul.toString()) });
  await assert.rejects(m.hazirla({ adres: NFT, bnb: '0.007' }), /kabul etmedi: one/);
  assert.equal(baw.previewlar.length, 0);
  const t = await m.hazirla({ adres: NFT, bnb: '0.01' });
  assert.equal(baw.previewlar[0].veri, '0x');
  assert.equal(baw.previewlar[0].degerWei, kabul.toString());
  assert.equal(t.imza, 'Düz BNB transferi');
  // 0.01 BNB mevcut 0.002 limitini aşar: özet uyarır ve gönderilemez
  assert.equal(t.gonderilebilir, false);
  assert.match(t.uyarilar[0], /İşlem başı limit aşıldı/);
});

test('gönder: onay:true olmadan göndermez', async () => {
  const { m, baw } = kur();
  const t = await m.hazirla({ adres: NFT });
  await assert.rejects(m.gonder({ id: t.id }), /açık onay/);
  await assert.rejects(m.gonder({ id: t.id, onay: 'evet' }), /açık onay/);
  assert.equal(baw.calisan.length, 0);
});

test('gönder: canlı işlem kapalıysa göndermez', async () => {
  const { m, baw } = kur({ canli: false });
  const t = await m.hazirla({ adres: NFT });
  assert.equal(t.gonderilebilir, false);
  await assert.rejects(m.gonder({ id: t.id, onay: true }), /Canlı işlem kapalı/);
  assert.equal(baw.calisan.length, 0);
});

test('gönder: limit aşımında reddeder ve günlük sayacı değiştirmez', async () => {
  const deger = parseEther('0.01').toString();
  const { m, baw, trader } = kur({ preview: temizPreview(deger), rapor: { sonuc: 'NEREDEYSE-UCRETSIZ', mintler: [{ imza: 'mint(uint256)', gecti: true, ucretWei: deger }] } });
  const t = await m.hazirla({ adres: NFT });
  await assert.rejects(m.gonder({ id: t.id, onay: true }), /limit/);
  assert.equal(baw.calisan.length, 0);
  assert.equal(trader.bugunHarcanan(), 0);
});

test('gönder: onaylı ve limit içindeyse bir kez çalıştırır, sayaca yazar, taslak tek kullanımlık', async () => {
  const deger = parseEther('0.0001').toString();
  const { m, baw, trader } = kur({ preview: temizPreview(deger), rapor: { sonuc: 'NEREDEYSE-UCRETSIZ', mintler: [{ imza: 'freeMint(uint256)', gecti: true, ucretWei: deger }] } });
  const t = await m.hazirla({ adres: NFT });
  const r = await m.gonder({ id: t.id, onay: true });
  assert.equal(r.durum, 'gonderildi');
  assert.equal(r.txHash, '0xabc');
  assert.deepEqual(baw.calisan, ['req-1']);
  assert.equal(trader.bugunHarcanan(), 0.0001);
  await assert.rejects(m.gonder({ id: t.id, onay: true }), /bulunamadı/);
  assert.equal(baw.calisan.length, 1);
});

test('hazırla: önizlemede cüzdana varlık gelmiyorsa gönderilemez (fiyat okuma fonksiyonu gibi)', async () => {
  const bosPreview = temizPreview('0');
  bosPreview.simulationResult.balanceChanges = [];
  const { m } = kur({ preview: bosPreview });
  const t = await m.hazirla({ adres: NFT });
  assert.equal(t.gonderilebilir, false);
  assert.match(t.uyarilar.join(' '), /hiçbir varlık gelmiyor/);
});
