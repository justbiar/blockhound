// Ayarlar. Proje kökündeki .env dosyası okunur; ortamda zaten tanımlı değişkenler ezilmez.
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

try {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* .env yoksa varsayılanlar kullanılır */ }

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => {
  const v = Number(env(k, d));
  if (!Number.isFinite(v) || v < 0) throw new Error(`${k} geçerli bir sayı olmalı`);
  return v;
};

// sim: sadece teklif ve simülasyon. live: canlı zincir verisi (gerçek emir için ayrıca CANLI_ISLEM=1 gerekir)
export const MOD = env('MOD', 'sim').toLowerCase() === 'live' ? 'live' : 'sim';
export const CANLI_ISLEM = MOD === 'live' && env('CANLI_ISLEM', '0') === '1';

export const PORT = num('PORT', 8787);
export const HOST = '127.0.0.1';   // bilerek sabit: sunucu dışarıya açılmaz

// Sunucuda zorunlu limitler (BNB). 0 = işlem yok
export const ISLEM_BASI_MAX_BNB = num('ISLEM_BASI_MAX_BNB', 0.05);
export const GUNLUK_MAX_BNB = num('GUNLUK_MAX_BNB', 0.2);
export const VARSAYILAN_KAYMA = num('VARSAYILAN_KAYMA', 10);   // yüzde

// Token basımı (ayrı basıcı cüzdan). Ön alım ve basım ücreti için sunucu tavanları (BNB)
export const BASIM_ONALIM_MAX_BNB = num('BASIM_ONALIM_MAX_BNB', 0.02);
export const BASIM_UCRET_MAX_BNB = num('BASIM_UCRET_MAX_BNB', 0.01);
export const BSC_RPC = env('BSC_RPC', 'https://bsc-rpc.publicnode.com');
// Yeni blok taraması için RPC havuzu, virgülle. İstekler sırayla dağıtılır, hata veren RPC'de sıradakine geçilir
export const BSC_BLOK_RPC = env('BSC_BLOK_RPC', 'https://bsc-dataseed1.defibit.io,https://bsc-dataseed2.defibit.io,https://bsc-dataseed3.defibit.io,https://bsc-dataseed4.defibit.io,https://bsc-dataseed1.ninicoin.io,https://bsc-dataseed2.ninicoin.io,https://bsc-dataseed4.ninicoin.io');
// Adres belirtmeden olay sorgusuna (eth_getLogs) izin veren RPC'ler, virgülle: fabrika içinden kurulan kontratları bulmak için.
// Biri hız sınırına takılırsa sıradakine geçilir. Boşsa kapalı
export const BSC_OLAY_RPC = env('BSC_OLAY_RPC', 'https://bsc.drpc.org,https://1rpc.io/bnb');
export const FOUR_MEME_API = env('FOUR_MEME_API', 'https://four.meme/meme-api/v1');
export const OPENFOUR_REGISTRY = '0x912CEf0C3aE9Ab6eB3Ec87cab69371cFb317Ab94';
export const AGENT_ID_PRESET = '1778027615735';

// Mint araştırma ajanları (OpenRouter). Anahtar yoksa ajanlar sadece zincir ve site verisini toplar, LLM çağrılmaz
// Araştırma (site ve sosyal) ücretsiz modellerle, virgülle yedekli: ilki hız sınırına takılırsa sıradaki denenir.
// Hakem iki raporu okuyup son risk değerlendirmesini yapar: küçük girdiyle ucuz ama daha akıllı bir model
const UCRETSIZ_ARASTIRMA = 'nvidia/nemotron-3.5-super-vl:free,dots-studio/dots-3-note-preview:free,openrouter/free';
export const AJAN_SITE_MODEL = env('AJAN_SITE_MODEL', UCRETSIZ_ARASTIRMA);
export const AJAN_SOSYAL_MODEL = env('AJAN_SOSYAL_MODEL', UCRETSIZ_ARASTIRMA);
export const AJAN_HAKEM_MODEL = env('AJAN_HAKEM_MODEL', 'anthropic/claude-haiku-5.5');
export const AJAN_GUNLUK_ARASTIRMA = num('AJAN_GUNLUK_ARASTIRMA', 40);

export const BAW_BIN = env('BAW_BIN', 'baw');
// OKX Onchain OS CLI: sadece okuma (lider tablosu, cüzdan değeri, işlem akışı) için kullanılır
const okxVarsayilan = path.join(homedir(), '.local', 'bin', 'onchainos');
export const ONCHAINOS_BIN = env('ONCHAINOS_BIN', existsSync(okxVarsayilan) ? okxVarsayilan : 'onchainos');
export const ZINCIR_ID = '56';
export const BNB = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const EXPLORER = 'https://bscscan.com';

export const DATA_DIR = path.resolve(ROOT, env('DATA_DIR', 'data'));
mkdirSync(DATA_DIR, { recursive: true });
export const dataFile = (name) => path.join(DATA_DIR, name);

// Değişiklik yapan API istekleri için token. .env'de yoksa data/api-token içinde bir kez üretilir
export const API_TOKEN = (() => {
  const fromEnv = env('API_TOKEN', '');
  if (fromEnv) return fromEnv;
  const f = dataFile('api-token');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const t = randomBytes(24).toString('hex');
  writeFileSync(f, t, { mode: 0o600 });
  return t;
})();

// OpenRouter anahtarı: .env'deki değer önce gelir, yoksa arayüzden girilip data/openrouter-key dosyasına yazılan
export const OPENROUTER_ANAHTAR_DOSYA = dataFile('openrouter-key');
export const OPENROUTER_API_KEY = (() => {
  const fromEnv = env('OPENROUTER_API_KEY', '');
  if (fromEnv) return fromEnv;
  try { return existsSync(OPENROUTER_ANAHTAR_DOSYA) ? readFileSync(OPENROUTER_ANAHTAR_DOSYA, 'utf8').trim() : ''; } catch { return ''; }
})();
export const OPENROUTER_ENV_DEN = env('OPENROUTER_API_KEY', '') !== '';

// Brave Search API anahtarı (her ay 5 $ ücretsiz kredi, yaklaşık 1.000 arama): sosyal ajanın web araması OpenRouter yerine buradan ücretsiz yapılır
export const BRAVE_ANAHTAR_DOSYA = dataFile('brave-key');
export const BRAVE_API_KEY = (() => {
  const fromEnv = env('BRAVE_API_KEY', '');
  if (fromEnv) return fromEnv;
  try { return existsSync(BRAVE_ANAHTAR_DOSYA) ? readFileSync(BRAVE_ANAHTAR_DOSYA, 'utf8').trim() : ''; } catch { return ''; }
})();
export const BRAVE_ENV_DEN = env('BRAVE_API_KEY', '') !== '';
