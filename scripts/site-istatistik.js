// Tanıtım sitesi için rakam özeti: site/istatistik.json. Kişisel veri içermez: cüzdan adresi, bakiye, kontrat
// adresleri ya da işlem numaraları yazılmaz; sadece sayılar ve tarih. Çalıştırma: node scripts/site-istatistik.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defterOlustur } from '../src/defter.js';

const KOK = fileURLToPath(new URL('..', import.meta.url));
const veri = (f) => path.join(KOK, 'data', f);
const json = (f, d) => { try { return existsSync(veri(f)) ? JSON.parse(readFileSync(veri(f), 'utf8')) : d; } catch { return d; } };
const satirlar = (f) => (existsSync(veri(f)) ? readFileSync(veri(f), 'utf8').split('\n').filter(Boolean).flatMap((s) => { try { return [JSON.parse(s)]; } catch { return []; } }) : []);

const takip = json('mint-takip.json', {});
const mintler = satirlar('mint-islemleri.jsonl').filter((k) => /gonderildi|onay/.test(k.durum));
const ajanLog = satirlar('ajan-log.jsonl');
const defter = json('defter.json', { kayitlar: [] });
const islemler = defterOlustur(defter.kayitlar || []);
const gas = new Map(islemler.map((i) => [String(i.hash).toLowerCase(), i.gasBnb || 0]));
const gaslar = mintler.map((k) => gas.get(String(k.txHash || '').toLowerCase())).filter((g) => g > 0);

const ozet = {
  guncelleme: Date.now(),
  baslangic: Math.min(...[...mintler.map((k) => k.zaman), ...ajanLog.map((k) => k.zaman)].filter(Boolean), Date.now()),
  takip: Object.keys(takip.izleme || {}).length,
  gonderilen: mintler.length,
  otomatik: mintler.filter((k) => k.kaynak === 'otomatik').length,
  elenen: ajanLog.filter((k) => /: atla\b/.test(k.mesaj || '')).length,
  ortalamaGasBnb: gaslar.length ? gaslar.reduce((a, b) => a + b, 0) / gaslar.length : null,
};
writeFileSync(path.join(KOK, 'site', 'istatistik.json'), JSON.stringify(ozet, null, 2) + '\n');
console.log('site/istatistik.json yazıldı:', ozet);
