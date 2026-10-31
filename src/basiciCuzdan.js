// Basıcı cüzdan: Four.meme düz metin imza istediği için Binance cüzdanı yerine bu ayrı cüzdan kullanılır.
// Anahtar sadece şifreli keystore olarak diske yazılır (ethers, scrypt). Şifre hiçbir yere kaydedilmez,
// açık anahtar sadece bellekte tutulur ve bir süre işlem yapılmazsa kendiliğinden kilitlenir.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { Wallet } from 'ethers';

const MIN_SIFRE = 10;

export class BasiciCuzdan {
  constructor({ dosya, kilitSureMs = 10 * 60_000, olustur = () => Wallet.createRandom() }) {
    this.dosya = dosya;
    this.kilitSureMs = kilitSureMs;
    this.olusturFn = olustur;
    this.acik = null;
    this.zamanlayici = null;
  }

  var() {
    return existsSync(this.dosya);
  }

  adres() {
    if (!this.var()) return null;
    try {
      const a = JSON.parse(readFileSync(this.dosya, 'utf8')).address;
      return a ? `0x${String(a).replace(/^0x/i, '')}` : null;
    } catch {
      return null;
    }
  }

  durum() {
    return { var: this.var(), adres: this.adres(), acik: Boolean(this.acik) };
  }

  async olustur(sifre) {
    if (this.var()) throw new Error('Basıcı cüzdan zaten var. Yenisini oluşturmak için mevcut dosyayı yedekleyip kaldırın');
    sifreKontrol(sifre);
    const w = this.olusturFn();
    const json = await w.encrypt(sifre);
    const gecici = `${this.dosya}.tmp`;
    writeFileSync(gecici, json, { mode: 0o600 });
    renameSync(gecici, this.dosya);
    this._ac(new Wallet(w.privateKey));
    return this.durum();
  }

  async ac(sifre) {
    if (!this.var()) throw new Error('Basıcı cüzdan yok');
    if (typeof sifre !== 'string' || !sifre) throw new Error('Şifre gerekli');
    let w;
    try {
      w = await Wallet.fromEncryptedJson(readFileSync(this.dosya, 'utf8'), sifre);
    } catch {
      throw new Error('Şifre yanlış');
    }
    this._ac(w);
    return this.durum();
  }

  kilitle() {
    this.acik = null;
    clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
    return this.durum();
  }

  // İmza gereken her işlem bunu çağırır; süreyi de yeniler
  imzaci(provider) {
    if (!this.acik) throw new Error('Basıcı cüzdan kilitli. Önce şifreyle açın');
    this._sureyiYenile();
    return provider ? this.acik.connect(provider) : this.acik;
  }

  _ac(w) {
    this.acik = w;
    this._sureyiYenile();
  }

  _sureyiYenile() {
    clearTimeout(this.zamanlayici);
    this.zamanlayici = setTimeout(() => this.kilitle(), this.kilitSureMs);
    this.zamanlayici.unref?.();
  }
}

export function sifreKontrol(sifre) {
  if (typeof sifre !== 'string' || sifre.length < MIN_SIFRE) throw new Error(`Şifre en az ${MIN_SIFRE} karakter olmalı`);
  return sifre;
}
