#!/usr/bin/env node
// HOUND / BlockHound komut satırı madencisi. Çözümü bulur ve ajan cüzdanından çalıştırılacak baw komutlarını yazar;
// anahtar istemez, işlem göndermez. Mint yalnızca Agent ID sahibi cüzdanlara açık, arama o cüzdanın adresiyle yapılır.
// Kullanım: node scripts/hound-madenci.js <hound|blockhound> <Agent ID adı ya da adres> [--kontrat 0x..] [--rpc url] [--isci n]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { randomBytes } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { JsonRpcProvider, Contract, getAddress, formatEther, id, ZeroAddress } from 'ethers';
import { hazirla, dene, nonceOlustur } from '../site/hound/madenci.js';
import { AG } from '../site/hound/adresler.js';

const ABI = [
  'function challenge() view returns (bytes32)',
  'function difficultyBits() view returns (uint256)',
  'function mintFee() view returns (uint256)',
  'function check(address,uint256) view returns (bytes32,bool)',
  'function mint(uint256) payable',
  'function isAgent(address) view returns (bool)',
];
const KAYIT_ABI = ['function ownerOf(uint256) view returns (address)'];

if (!isMainThread) {
  const { challenge, adres, bits } = workerData;
  const hazir = hazirla(challenge, adres, randomBytes(28));
  const PARCA = 200_000;
  for (let sayac = 0; sayac < 0xffffffff - PARCA; sayac += PARCA) {
    const n = dene(hazir, sayac, PARCA, bits);
    if (n >= 0) { parentPort.postMessage({ nonce: nonceOlustur(hazir, n) }); break; }
    parentPort.postMessage({ deneme: PARCA });
  }
} else {
  const arg = process.argv.slice(2);
  const bayrak = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg.splice(i, 2)[1] : null; };
  const kontratArg = bayrak('--kontrat');
  const rpc = bayrak('--rpc') || AG.rpc;
  const isci = Number(bayrak('--isci')) || Math.max(1, availableParallelism() - 1);
  const [tur, madenciArg] = arg;
  const kontrat = kontratArg || AG[tur];
  if (!['hound', 'blockhound'].includes(tur) || !madenciArg) {
    console.error('Kullanım: node scripts/hound-madenci.js <hound|blockhound> <Agent ID adı ya da adres> [--kontrat 0x..] [--rpc url] [--isci n]');
    process.exit(1);
  }
  if (!kontrat) { console.error('Kontrat adresi yok: site/hound/adresler.js henüz boş, --kontrat ile ver.'); process.exit(1); }
  const saglayici = new JsonRpcProvider(rpc);
  const c = new Contract(kontrat, ABI, saglayici);
  // Agent ID adı (biar ya da biar.ai) kayıttan cüzdana çevrilir: kimlik = keccak256(ad)
  let madenci;
  if (/^0x[0-9a-fA-F]{40}$/.test(madenciArg)) madenci = getAddress(madenciArg.toLowerCase());
  else {
    const ad = madenciArg.toLowerCase().replace(/\.ai$/, '');
    madenci = await new Contract(AG.agentKayit, KAYIT_ABI, saglayici).ownerOf(id(ad)).catch(() => ZeroAddress);
    if (madenci === ZeroAddress) { console.error(`${ad}.ai adına kayıtlı bir Agent ID yok.`); process.exit(1); }
    console.error(`${ad}.ai → ${madenci}`);
  }
  if (!(await c.isAgent(madenci))) { console.error(`${madenci} adresinin Agent ID kaydı yok: hash bulunsa da mint reddedilir.`); process.exit(1); }
  const [challenge, bits] = await Promise.all([c.challenge(), c.difficultyBits()]);
  console.error(`${tur} ${kontrat} · zorluk ${bits} bit · ortalama ${(2 ** Number(bits)).toLocaleString('tr-TR')} deneme · ${isci} işçi`);

  const bas = Date.now();
  let toplam = 0;
  const isciler = [];
  const nonce = await new Promise((coz) => {
    for (let i = 0; i < isci; i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: { challenge, adres: madenci, bits: Number(bits) } });
      w.on('message', (m) => {
        if (m.nonce) coz(m.nonce);
        else { toplam += m.deneme; process.stderr.write(`\r${toplam.toLocaleString('tr-TR')} deneme · ${Math.round(toplam / ((Date.now() - bas) / 1000) / 1000)} kH/s   `); }
      });
      isciler.push(w);
    }
  });
  await Promise.all(isciler.map((w) => w.terminate()));
  const [, gecerli] = await c.check(madenci, nonce);
  if (!gecerli) { console.error('\nÇözüm artık geçerli değil (dönem değişti ya da kullanıldı). Yeniden çalıştır.'); process.exit(2); }
  const ucret = await c.mintFee();
  const deger = (ucret * 105n) / 100n; // fiyat oynarsa düşmesin diye %5 pay; fazlası kontratta iade edilir
  const veri = c.interface.encodeFunctionData('mint', [nonce]);
  console.error(`\nBulundu: ${((Date.now() - bas) / 1000).toFixed(1)} sn · gönderilecek ${formatEther(deger)} BNB (fazlası iade)`);
  console.error('Ajan cüzdanının bağlı olduğu bilgisayarda sırayla çalıştır (Binance App\'te Geliştirici Modu açık olmalı):\n');
  console.log(`baw contract-call preview --binanceChainId ${AG.zincirId} --from ${madenci} --to ${kontrat} --value ${deger} --inputData ${veri}`);
  console.log('baw contract-call execute --requestId <önizlemedeki requestId>');
  if (arg.includes('--json')) console.log(JSON.stringify({ from: madenci, to: kontrat, nonce, data: veri, value: deger.toString() }));
}
