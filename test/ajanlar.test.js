import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { guvenliUrl, kaynakUrl, xHesaplari, dataUriJson, karar, AjanYonetici, VARSAYILAN_AYAR, getir } from '../src/ajanlar.js';
import { openRouter } from '../src/openrouter.js';

const ADR = '0x6b1D77D3DeDE3FC775ca8C7BDe08C2C2EAAb9BEA';
const iyiSite = { resmiSiteGibi: true, ucretsizKademeVar: true, siteImzaIstiyor: false, cuzdanIzniIstiyor: false, supheliIsaretler: [], puan: 85, ozet: 'iyi' };
const iyiSosyal = { xHesabi: 'proje', takipciTahmini: 2000, hesapYasiAy: 12, siteIleEslesiyor: true, dolandiricilikIsaretleri: [], puan: 80, ozet: 'iyi' };
const acik = { ...VARSAYILAN_AYAR, otomatikMint: true };
const ucretsiz = { adres: ADR, sonuc: 'UCRETSIZ', agentId: true };

test('güvenli URL: yerel ağ, IP ve garip şemalar reddedilir', () => {
  assert.equal(guvenliUrl('javascript:alert(1)'), null);
  assert.equal(guvenliUrl('http://127.0.0.1:8787/api/durum'), null);
  assert.equal(guvenliUrl('http://localhost/'), null);
  assert.equal(guvenliUrl('http://192.168.1.1/'), null);
  assert.equal(guvenliUrl('http://[::1]/'), null);
  assert.equal(guvenliUrl('http://router.local/'), null);
  assert.equal(guvenliUrl('https://user:pw@site.xyz/'), null);
  assert.equal(guvenliUrl('https://hirelings.pages.dev'), 'https://hirelings.pages.dev/');
  assert.equal(kaynakUrl('ipfs://Qm123/1.json'), 'https://ipfs.io/ipfs/Qm123/1.json');
});

test('getir: iç ağa yönlendirmeyi takip etmez', async () => {
  const fetchFn = async () => ({ status: 302, ok: false, headers: { get: () => 'http://127.0.0.1:8787/api/durum' } });
  assert.equal(await getir('https://kotu.site/', { fetchFn }), null);
});

test('X hesapları ve data URI metadata', () => {
  assert.deepEqual(xHesaplari('a https://x.com/Proje b https://twitter.com/intent/tweet https://x.com/proje2'), ['Proje', 'proje2']);
  const j = dataUriJson(`data:application/json;base64,${Buffer.from('{"external_url":"https://a.xyz"}').toString('base64')}`);
  assert.equal(j.external_url, 'https://a.xyz');
});

test('karar: ücretsiz ve neredeyse ücretsiz Agent ID mint, site ve sosyal puan düşük olsa da otomatik', () => {
  const zayif = { site: { ...iyiSite, puan: 20, resmiSiteGibi: false }, sosyal: { ...iyiSosyal, puan: 10 }, ayar: acik, bugunOtoMint: 0 };
  assert.equal(karar({ r: ucretsiz, ...zayif }).eylem, 'otomatik-mint');
  assert.equal(karar({ r: { ...ucretsiz, sonuc: 'NEREDEYSE-UCRETSIZ' }, ...zayif }).eylem, 'otomatik-mint');
});

test('karar: 0.001 BNB üstü mint asla otomatik değil', () => {
  const k = karar({ r: { ...ucretsiz, sonuc: 'UCRETLI' }, site: iyiSite, sosyal: iyiSosyal, ayar: acik, bugunOtoMint: 0 });
  assert.equal(k.eylem, 'onay-bekle');
});

test('karar: araştırma yoksa, Agent ID değilse, şüpheli işaret varsa, kapalıysa ya da sınır dolduysa onay bekler', () => {
  const temel = { r: ucretsiz, site: iyiSite, sosyal: iyiSosyal, ayar: acik, bugunOtoMint: 0 };
  for (const degisim of [{ site: null, sosyal: null }, { r: { ...ucretsiz, agentId: false } }, { sosyal: { ...iyiSosyal, dolandiricilikIsaretleri: ['taklit'] } },
    { bugunOtoMint: 3 }, { ayar: VARSAYILAN_AYAR }]) {
    assert.equal(karar({ ...temel, ...degisim }).eylem, 'onay-bekle', JSON.stringify(degisim));
  }
  // Agent ID şartı kapatılırsa Agent ID olmayan da otomatik
  assert.equal(karar({ ...temel, r: { ...ucretsiz, agentId: false }, ayar: { ...acik, sadeceAgentId: false } }).eylem, 'otomatik-mint');
});

test('karar: cüzdan izni isteyen site ya da dolandırıcılık işareti atlanır', () => {
  const temel = { r: ucretsiz, sosyal: iyiSosyal, veri: { kontratSitede: true }, ayar: acik, bugunOtoMint: 0 };
  assert.equal(karar({ ...temel, site: { ...iyiSite, cuzdanIzniIstiyor: true } }).eylem, 'atla');
  assert.equal(karar({ ...temel, site: iyiSite, sosyal: { ...iyiSosyal, puan: 10, dolandiricilikIsaretleri: ['taklit hesap'] } }).eylem, 'atla');
});

test('openrouter: JSON şeması istenir, anahtar yoksa çağrı yapılmaz', async () => {
  let govde;
  const sohbet = openRouter({ anahtar: 'k', fetchFn: async (_u, o) => { govde = JSON.parse(o.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { cost: 0.001 } }) }; } });
  const r = await sohbet({ model: 'm', sistem: 's', kullanici: 'k', sema: { ad: 'x', sema: { type: 'object' } }, web: 3 });
  assert.deepEqual(r.veri, { a: 1 });
  assert.equal(govde.response_format.type, 'json_schema');
  assert.deepEqual(govde.plugins, [{ id: 'web', max_results: 3 }]);
  await assert.rejects(openRouter({ anahtar: '' })({ model: 'm', sistem: '', kullanici: '', sema: { ad: 'x', sema: {} } }), /OPENROUTER_API_KEY/);
});

function sahteYonetici({ sohbetCevap, taslak }) {
  const takip = new EventEmitter();
  takip.incele = async () => ({ adres: ADR, ad: 'Test', sembol: 'T', sonuc: 'UCRETSIZ', agentId: true, mintler: [{ imza: 'mint()', gecti: true, ucretWei: '0' }] });
  const gonderilen = [];
  const mintIslem = {
    hazirla: async () => taslak,
    gonder: async (b) => { gonderilen.push(b); return { durum: 'gonderildi', txHash: '0xabc' }; },
  };
  // Sayfa kontrat adresini içeriyor, metadata yok
  const provider = { call: async () => { throw new Error('yok'); } };
  const y = new AjanYonetici({
    takip, mintIslem, provider, anahtarVar: true, siteModel: 's', sosyalModel: 'o', bildir: null,
    sohbet: async ({ sema }) => ({ veri: sohbetCevap[sema.ad], maliyet: 0.001 }),
    fetchFn: async () => ({ status: 200, ok: true, text: async () => `<a href="https://x.com/proje">x</a> ${ADR}` }),
  });
  return { y, gonderilen };
}

test('yönetici: site bulunamasa da ücretsiz Agent ID mint otomatik gönderilir ve otomatik diye işaretlenir', async () => {
  const { y, gonderilen } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal }, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.equal(r.karar.eylem, 'otomatik-mint');
  assert.deepEqual(gonderilen, [{ id: 't1', onay: true, kaynak: 'otomatik' }]);
});

test('yönetici: taslak 0.001 BNB üstündeyse ya da uyarılıysa otomatik yol göndermez', async () => {
  const { y, gonderilen } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal }, taslak: { id: 't1', bnb: 0.0015, gonderilebilir: true, uyarilar: [] } });
  y.ayar = acik;
  // karar katmanını atlayıp son kapıyı doğrudan dene
  const veriTam = { site: 'https://a.xyz/', kontratSitede: true, xHesaplari: [] };
  y.raporlar = [{ adres: ADR, site: iyiSite, sosyal: iyiSosyal, veri: veriTam }];
  const r = await y.arastir(ADR, { yeniden: true });
  assert.equal(r.karar.eylem, 'otomatik-mint');
  assert.equal(r.mint.durum, 'gonderilmedi');
  assert.equal(gonderilen.length, 0);
});

test('yönetici: yeniden açılan ücretsiz mint, kayıtlı araştırmayla otomatik gönderilir', async () => {
  const { y, gonderilen } = sahteYonetici({ sohbetCevap: {}, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  y.ayar = acik;
  y.raporlar = [{ adres: ADR, site: iyiSite, sosyal: iyiSosyal, veri: { site: 'https://a.xyz/', kontratSitede: true, xHesaplari: [] } }];
  const r = await y.arastir(ADR, { yeniden: true });
  assert.equal(r.mint.durum, 'gonderildi');
  assert.deepEqual(gonderilen, [{ id: 't1', onay: true, kaynak: 'otomatik' }]);
  assert.equal(y.sayac.otoMint, 1);
});

test('yönetici: anahtar yoksa LLM çağrılmaz, karar onay bekler', async () => {
  const { y } = sahteYonetici({ sohbetCevap: {}, taslak: null });
  y.anahtarVar = false;
  y.sohbet = async () => { throw new Error('çağrılmamalı'); };
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.equal(r.karar.eylem, 'onay-bekle');
  assert.match(r.hatalar[0], /OPENROUTER_API_KEY/);
});

test('ayar doğrulama', () => {
  const { y } = sahteYonetici({ sohbetCevap: {}, taslak: null });
  assert.throws(() => y.ayarGuncelle({ minSitePuan: 150 }), /0 ile 100/);
  assert.equal(y.ayarGuncelle({ otomatikMint: 'evet' }).ayar.otomatikMint, false);
  assert.equal(y.ayarGuncelle({ otomatikMint: true, gunlukOtoMint: 2 }).ayar.gunlukOtoMint, 2);
});

test('yönetici: sosyal ajanın bulduğu site kodla doğrulanır, kontrat sitede ise otomatik mint yapılır', async () => {
  const { y, gonderilen } = sahteYonetici({
    sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: { ...iyiSosyal, resmiSite: 'https://proje.xyz' } },
    taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] },
  });
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.equal(r.veri.siteKaynagi, 'web-arama');
  assert.equal(r.veri.kontratSitede, true);
  assert.equal(r.karar.eylem, 'otomatik-mint');
  assert.equal(gonderilen.length, 1);
});

test('yönetici: site cüzdan izni istiyorsa ücretsiz olsa da atlanır', async () => {
  const { y, gonderilen } = sahteYonetici({
    sohbetCevap: { site_raporu: { ...iyiSite, cuzdanIzniIstiyor: true }, sosyal_rapor: iyiSosyal },
    taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] },
  });
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.equal(r.karar.eylem, 'atla');
  assert.equal(gonderilen.length, 0);
});

test('yönetici: 0.0008 BNB lik temiz taslak otomatik gönderilir', async () => {
  const { y, gonderilen } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal }, taslak: { id: 't2', bnb: 0.0008, gonderilebilir: true, uyarilar: [] } });
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.equal(r.mint.durum, 'gonderildi');
  assert.equal(gonderilen.length, 1);
});

test('anahtar: durum çıktısında anahtarın kendisi yok', () => {
  const { y } = sahteYonetici({ sohbetCevap: {}, taslak: null });
  let kurulan = null;
  y.sohbetUret = (a) => { kurulan = a; return async () => ({}); };
  const d = y.anahtarAyarla('sk-or-v1-abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(kurulan, 'sk-or-v1-abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(d.anahtarVar, true);
  assert.ok(!JSON.stringify(d).includes('abcdefghijklmnop'));
  assert.equal(y.anahtarAyarla('').anahtarVar, false);
});

test('karar: hakem varsa onun değerlendirmesi esastır', () => {
  const temel = { r: ucretsiz, site: iyiSite, sosyal: { ...iyiSosyal, puan: 10, dolandiricilikIsaretleri: ['kanıtsız şüphe'] }, ayar: acik, bugunOtoMint: 0 };
  // Ücretsiz modelin kanıtsız işaretini hakem ayıklarsa otomatik
  assert.equal(karar({ ...temel, hakem: { dolandiricilikIsaretleri: [], cuzdanIzniIstiyor: false, guvenPuani: 60 } }).eylem, 'otomatik-mint');
  // Hakem izin isteyen kod görürse atla
  assert.equal(karar({ ...temel, sosyal: iyiSosyal, hakem: { dolandiricilikIsaretleri: [], cuzdanIzniIstiyor: true, guvenPuani: 70 } }).eylem, 'atla');
  // Hakem kanıtlı işaret bulursa ve güven düşükse atla
  const k = karar({ ...temel, sosyal: iyiSosyal, hakem: { dolandiricilikIsaretleri: ['taklit X hesabı'], cuzdanIzniIstiyor: false, guvenPuani: 20 } });
  assert.equal(k.eylem, 'atla');
  assert.match(k.sebepler[0], /Hakem/);
  // Hakem çağrısı başarısızsa eski davranış: sosyal ajanın işaretleri
  assert.equal(karar(temel).eylem, 'atla');
});

test('yönetici: web araması sadece otomatik mint adaylarında, hakem iki rapordan sonra çalışır', async () => {
  const cagrilar = [];
  const { y } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal, hakem_karari: { dolandiricilikIsaretleri: [], cuzdanIzniIstiyor: false, guvenPuani: 70, ozet: 'ok' } }, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  const asil = y.sohbet;
  y.sohbet = async (o) => { cagrilar.push([o.sema.ad, o.model, o.web ?? null]); return asil(o); };
  y.hakemModel = 'h/akem';
  y.ayar = acik;
  const r = await y.arastir(ADR);
  assert.deepEqual(cagrilar.map((c) => c[0]), ['sosyal_rapor', 'site_raporu', 'hakem_karari']);
  assert.equal(cagrilar[0][2], acik.webSonuc);
  assert.equal(cagrilar[2][1], 'h/akem');
  assert.equal(r.hakem.guvenPuani, 70);
  // Agent ID olmayan ücretli mint: web araması yapılmaz
  cagrilar.length = 0;
  y.takip.incele = async () => ({ adres: ADR, ad: 'X', sonuc: 'UCRETLI', agentId: false, mintler: [] });
  await y.arastir(ADR);
  assert.equal(cagrilar.some((c) => c[0] === 'sosyal_rapor'), false);
});

test('openrouter: virgüllü model listesi yedek modeller olarak gider, maliyet istenir', async () => {
  let govde;
  const sohbet = openRouter({ anahtar: 'k', fetchFn: async (_u, o) => { govde = JSON.parse(o.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }], usage: { cost: 0 } }) }; } });
  await sohbet({ model: 'a/b:free,c/d', sistem: '', kullanici: '', sema: { ad: 'x', sema: {} } });
  assert.equal(govde.model, 'a/b:free');
  assert.deepEqual(govde.models, ['a/b:free', 'c/d']);
  assert.deepEqual(govde.usage, { include: true });
});

test('yönetici: günlük sayaç yeniden başlatmada sıfırlanmaz', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dosya = path.join(mkdtempSync(path.join(tmpdir(), 'sayac-')), 'sayac.json');
  const kur = () => new AjanYonetici({ takip: new EventEmitter(), mintIslem: {}, provider: {}, anahtarVar: true, siteModel: 's', sosyalModel: 'o', bildir: null, sayacDosya: dosya, sohbet: async () => ({ veri: null }) });
  const y = kur();
  y.sayac.arastirma = 0;
  y.takip.incele = async () => ({ adres: ADR, sonuc: 'IZLE', mintler: [] });
  y.fetchFn = async () => ({ status: 404, ok: false, text: async () => '' });
  await y.arastir(ADR);
  assert.equal(y.sayac.arastirma, 1);
  assert.equal(kur().sayac.arastirma, 1);
});

test('yönetici: Brave araması varsa web eklentisi kullanılmaz, sonuçlar metin olarak gider', async () => {
  const cagrilar = [];
  const { y } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal }, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  const asil = y.sohbet;
  y.sohbet = async (o) => { cagrilar.push(o); return asil(o); };
  y.ara = async () => [{ baslik: 'Proje', url: 'https://proje.xyz/', aciklama: 'mint' }];
  y.ayar = acik;
  await y.arastir(ADR);
  const sosyal = cagrilar.find((c) => c.sema.ad === 'sosyal_rapor');
  assert.equal(sosyal.web, null);
  assert.match(sosyal.kullanici, /guvenilmez_arama_sonuclari[\s\S]*https:\/\/proje\.xyz/);
});

test('yönetici: her LLM çağrısı ve Brave araması maliyet defterine yazılır', async () => {
  const yazilan = [];
  const { y } = sahteYonetici({ sohbetCevap: { site_raporu: iyiSite, sosyal_rapor: iyiSosyal, hakem_karari: { dolandiricilikIsaretleri: [], cuzdanIzniIstiyor: false, guvenPuani: 70, ozet: '' } }, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  y.maliyet = { kaydet: (k) => yazilan.push(k) };
  y.ara = async () => [{ baslik: 'b', url: 'https://bscscan.com/x', aciklama: '' }];
  y.hakemModel = 'h/akem';
  y.ayar = acik;
  await y.arastir(ADR);
  assert.deepEqual(yazilan.map((k) => k.ajan), ['Arama', 'Sosyal', 'Site', 'Hakem']);
  assert.equal(yazilan[0].adet, 2); // sadece gezgin sonucu: adla ikinci arama
  assert.equal(yazilan[3].maliyet, 0.001);
});

test('karar: süzgeç risk bulursa atla, temizse araştırmasız da otomatik', () => {
  const temel = { r: { ...ucretsiz, agentId: false }, site: null, sosyal: null, ayar: { ...acik, sadeceAgentId: false }, bugunOtoMint: 0 };
  assert.equal(karar({ ...temel, suzgec: { riskler: [], notlar: [] } }).eylem, 'otomatik-mint');
  const k = karar({ ...temel, suzgec: { riskler: ['Token bal tuzağı'], notlar: [] } });
  assert.equal(k.eylem, 'atla');
  assert.deepEqual(k.sebepler, ['Token bal tuzağı']);
  assert.equal(karar(temel).eylem, 'onay-bekle'); // ne araştırma ne süzgeç
});

test('yönetici: LLM araştırması kapalıyken OpenRouter çağrılmaz, süzgeç çalışır ve otomatik mint gönderilir', async () => {
  const llm = [];
  const okx = [];
  const { y, gonderilen } = sahteYonetici({ sohbetCevap: {}, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  y.sohbet = async (o) => { llm.push(o); return { veri: null }; };
  y.okx = async (args) => { okx.push(args[1]); return args[1] === 'tx-scan' ? { action: '' } : { isMalicious: false }; };
  y.takip.cuzdan = async () => '0x' + '1'.repeat(40);
  y.ayar = { ...acik, llmArastirma: false, sadeceAgentId: false };
  const r = await y.arastir(ADR);
  assert.equal(llm.length, 0);
  assert.ok(okx.includes('tx-scan'));
  assert.equal(r.karar.eylem, 'otomatik-mint');
  assert.equal(gonderilen.length, 1);
  assert.equal(y.sayac.arastirma, 0);
});

test('yönetici: eski kuralla "onay bekle" kalan ücretsiz adaylar yeniden değerlendirilir', async () => {
  const { y } = sahteYonetici({ sohbetCevap: {}, taslak: { id: 't1', bnb: 0, gonderilebilir: true, uyarilar: [] } });
  const B = '0x' + 'b'.repeat(40), C2 = '0x' + 'c'.repeat(40), D = '0x' + 'd'.repeat(40), E = '0x' + 'e'.repeat(40);
  y.takip.bulunanlar = [
    { adres: ADR, sonuc: 'UCRETSIZ', agentId: true }, // onay-bekle: yeniden
    { adres: B, sonuc: 'NEREDEYSE-UCRETSIZ', agentId: false }, // rapor yok: yeniden
    { adres: C2, sonuc: 'UCRETLI', agentId: true }, // ücretli: dokunma
    { adres: D, sonuc: 'UCRETSIZ', agentId: true, bendeki: 1 }, // mint edilmiş
    { adres: E, sonuc: 'UCRETSIZ', agentId: true }, // atlanmış
  ];
  y.takip.mintBilgisi = (r) => (r.bendeki ? { adet: 1 } : null);
  y.raporlar = [{ adres: ADR, karar: { eylem: 'onay-bekle' }, suzgec: { riskler: [] } }, { adres: E, karar: { eylem: 'atla' } }];
  const sirada = [];
  y.siraya = (a, o) => { sirada.push([a, o.yeniden]); return { durum: 'sirada' }; };
  y.ayar = { ...acik, llmArastirma: false, sadeceAgentId: false };
  assert.equal(y.bekleyenleriDegerlendir(), 2);
  assert.deepEqual(sirada, [[ADR, true], [B, false]]);
  // Günlük sınır doluysa hiç denenmez; LLM açıkken araştırması olmayanlar beklenir
  sirada.length = 0;
  y.sayac.otoMint = acik.gunlukOtoMint;
  assert.equal(y.bekleyenleriDegerlendir(), 0);
  y.sayac.otoMint = 0;
  y.ayar = { ...acik, llmArastirma: true, sadeceAgentId: false };
  y.bekleyenleriDegerlendir();
  assert.deepEqual(sirada, [[ADR, true]]);
});
