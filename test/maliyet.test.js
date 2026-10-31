import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MaliyetTakibi } from '../src/maliyet.js';

const dosya = () => path.join(mkdtempSync(path.join(tmpdir(), 'maliyet-')), 'llm.jsonl');

test('defter: adım, model, mint başına ve bu ayki arama sayısı', () => {
  let zaman = new Date(2026, 9, 31, 12).getTime();
  const m = new MaliyetTakibi({ dosya: dosya(), saat: () => zaman });
  m.kaydet({ ajan: 'Site', model: 'n/nemo:free', maliyet: 0, adres: '0xA' });
  m.kaydet({ ajan: 'Hakem', model: 'a/haiku', maliyet: 0.0006, adres: '0xA' });
  m.kaydet({ ajan: 'Arama', model: 'brave', maliyet: 0, adres: '0xB', adet: 2 });
  m.kaydet({ ajan: 'Hakem', model: 'a/haiku', maliyet: 0.0004, adres: '0xb' });
  zaman = new Date(2026, 10, 1, 9).getTime();
  const o = m.yerelOzet();
  assert.equal(o.ajanlar.Hakem.cagri, 2);
  assert.ok(Math.abs(o.toplamUsd - 0.001) < 1e-12);
  assert.equal(o.ajanlar.Site.ucretsiz, 1);
  assert.equal(o.arastirilanMint, 2);
  assert.ok(Math.abs(o.mintBasinaUsd - 0.0005) < 1e-12);
  assert.equal(o.bugunUsd, 0);
  assert.equal(o.aramaBuAy, 0); // yeni ay
  assert.equal(o.modeller['a/haiku'].cagri, 2);
});

test('OpenRouter: kullanım ve sınır okunur, önbelleğe alınır, anahtar yoksa null', async () => {
  let istek = 0;
  const fetchFn = async (url) => { istek++; return { ok: true, json: async () => ({ data: url.endsWith('key')
    ? { usage: 1.5, usage_daily: 0.2, usage_weekly: 1, usage_monthly: 1.5, limit: 3, limit_remaining: 1.5, free_model_daily_requests: { used: 4, limit: 1000 } }
    : { total_credits: 10, total_usage: 4 } }) }; };
  const m = new MaliyetTakibi({ anahtar: () => 'sk-or-x', fetchFn });
  const o = await m.openRouter();
  assert.deepEqual([o.toplamUsd, o.bugunUsd, o.sinirUsd, o.kalanUsd, o.hesapKrediUsd, o.ucretsizIstek.kullanilan], [1.5, 0.2, 3, 1.5, 10, 4]);
  await m.openRouter();
  assert.equal(istek, 2);
  assert.equal(await new MaliyetTakibi({ anahtar: () => '' }).openRouter(), null);
  const hata = await new MaliyetTakibi({ anahtar: () => 'k', fetchFn: async () => ({ ok: false, status: 401 }) }).openRouter();
  assert.match(hata.hata, /401/);
});
