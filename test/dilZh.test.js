import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ZH, KALIP_ZH } from '../public/dil-zh.js';

// dil.js tarayıcıda çalışır (localStorage, document): sözlük ve kalıplar metinden okunur
const kaynak = readFileSync(new URL('../public/dil.js', import.meta.url), 'utf8');
const bas = kaynak.indexOf('new Map(Object.entries(') + 'new Map(Object.entries('.length;
const son = kaynak.indexOf('}));', bas) + 1;
const SOZLUK = eval('(' + kaynak.slice(bas, son) + ')');
const kaliplar = kaynak.slice(kaynak.indexOf('const KALIPLAR'), kaynak.indexOf('function cevirMetin'));

test('her İngilizce sözlük metninin Çincesi var', () => {
  const eksik = [...new Set(Object.values(SOZLUK))].filter((en) => !ZH.has(en));
  assert.deepEqual(eksik, []);
});

test('Çince kalıplar KALIPLAR ile aynı sayıda ve sırada', () => {
  const sayi = (kaliplar.match(/^\s*\[\/\^/gm) || []).length;
  assert.equal(KALIP_ZH.length, sayi);
  // Sıra kayarsa ilk ve son kalıp yanlış çıkar
  assert.equal(KALIP_ZH[0]([null, '5', 'dk']), '5 分钟前');
  assert.equal(KALIP_ZH.at(-1)([null, 'açık', 'kapalı', '2', '5']), '· 狙击开 · 自动卖出关 · 今天 2/5 个代币');
});

test('Çince metinlerde uzun tire yok', () => {
  for (const v of ZH.values()) assert.ok(!/—/.test(v), v);
});
