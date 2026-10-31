# HOUND ve BlockHound kontratları

BSC ana ağ (31 Ekim 2026):
- HOUND: [`0x8446C862f84B948fDDAf1Be42c6B59ceCf5941Ac`](https://bscscan.com/address/0x8446C862f84B948fDDAf1Be42c6B59ceCf5941Ac)
- BlockHound: [`0x2535E83109909c7B9eA22D5b2f7c8621E595e3Dd`](https://bscscan.com/address/0x2535E83109909c7B9eA22D5b2f7c8621E595e3Dd)

İş kanıtıyla (proof of work) basılan iki kontrat. Hash'i herkes arayabilir ama yalnızca Binance Agent ID sahibi cüzdanlar
mintleyebilir (kayıt: `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, `balanceOf(gönderen) > 0`). Sahip, ön basım ya da
yönetici fonksiyonu yoktur; ücret, zorluk ve kasa adresi kurulumda sabitlenir.

| Kontrat | Ödül | Ücret | Başlangıç zorluğu | Zorlaşma |
| --- | --- | --- | --- | --- |
| `Hound` (ERC-20, HOUND) | 10.000 HOUND | 0.50 $ | 20 bit | her 1.000 mintte +1 bit |
| `BlockHound` (ERC-721, BHOUND) | 1 NFT | 0.10 $ | 20 bit | her 250 mintte +1 bit |

- Çözüm: `keccak256(abi.encodePacked(challenge(), msg.sender, nonce)) <= type(uint256).max >> difficultyBits()`.
  Adres hash'in içinde olduğu için çözüm başka cüzdanda geçersizdir, mempool'dan kopyalanamaz.
- Arama, mintleyecek Agent ID cüzdanının adresiyle yapılır. Agent ID'si olmayan biri hash bulsa bile mint `NotAgent` ile
  reddedilir. Mint, ajan cüzdanından `baw contract-call` ile gönderilir.
- Agent ID kaydı Binance'in kontratıdır. Binance o kontratı değiştirir ya da kapatırsa mint de etkilenir.
- `challenge()` her dönemde değişir. Kullanılmış çözüm ikinci kez kabul edilmez.
- Ücret dolar cinsinden sabittir, Chainlink BNB/USD fiyatıyla BNB'ye çevrilir. Fiyat 6 saatten eskiyse mint durur.
  Fazla gönderilen BNB aynı işlemde iade edilir. `withdraw()` birikmiş ücreti yalnızca kasaya gönderir.
- BlockHound görseli zincir üstündedir (SVG) ve madencinin bulduğu hash'in son baytlarından türer.
- Pratik arz: 1 bit her seferinde gereken ortalama hash sayısını ikiye katlar. Saniyede 1 milyar hash yapan bir ekran
  kartıyla 45 bit yaklaşık 10 saat sürer; HOUND için bu yaklaşık 250 milyon, BlockHound için yaklaşık 6.000 adede denk gelir.

## Derleme ve test

```bash
cd contracts
```

```bash
git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
```

```bash
git clone --depth 1 https://github.com/foundry-rs/forge-std.git lib/forge-std
```

```bash
forge test
```

## Yayın (BSC ana ağ)

Anahtarı komut satırına yazma; `cast wallet import` ile şifreli bir keystore oluştur ve onu kullan.

```bash
HAZINE=0xKASA_ADRESI forge script script/Yayinla.s.sol --rpc-url https://bsc-rpc.publicnode.com --account yayinci --broadcast --verify
```

Yayından sonra adresleri `site/hound/adresler.js` dosyasına yaz. Kontratlar denetlenmemiştir.
