// Koyu / açık tema. <head> içinde erken yüklenir ki sayfa yanlış renkte yanıp sönmesin (CSP satır içi betiğe izin vermez).
// Kayıtlı seçim yoksa sistem ayarı geçerli. Değişince 'tema-degisti' olayı yayılır, grafikler renklerini yeniler.
try { const t = localStorage.getItem('tema'); if (t === 'acik' || t === 'koyu') document.documentElement.dataset.tema = t; } catch { /* yalnızca bu oturum */ }

const acikMi = () => {
  const t = document.documentElement.dataset.tema;
  return t ? t === 'acik' : matchMedia('(prefers-color-scheme: light)').matches;
};

function renkMeta() {
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = acikMi() ? '#efece6' : '#121214';
}

document.addEventListener('DOMContentLoaded', () => {
  renkMeta();
  const d = document.getElementById('tema-dugme');
  d?.addEventListener('click', () => {
    const yeni = acikMi() ? 'koyu' : 'acik';
    document.documentElement.dataset.tema = yeni;
    try { localStorage.setItem('tema', yeni); } catch { /* yalnızca bu oturum */ }
    renkMeta();
    dispatchEvent(new Event('tema-degisti'));
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (document.documentElement.dataset.tema) return;
    renkMeta();
    dispatchEvent(new Event('tema-degisti'));
  });
});
