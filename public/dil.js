// Arayüz dili. Türkçe asıl dildir; İngilizce ya da Çince seçiliyse sayfadaki metinler çizildikçe yerinde çevrilir: birebir eşleşen
// metinler SOZLUK'ten, içinde sayı ya da ad geçenler KALIPLAR'dan. Çince, İngilizce karşılık üzerinden dil-zh.js'ten gelir;
// Çincesi olmayan metin İngilizce gösterilir. Bilinmeyen metin (token adları, adresler) olduğu gibi kalır.
// Dil değişince sayfa yeniden yüklenir; sayı ve tarih biçimi de YEREL ile dile göre değişir.
import { ZH, KALIP_ZH } from './dil-zh.js';

const ANAHTAR = 'blockhound-dil';
const DILLER = { tr: ['TR', 'tr-TR', 'Dil'], en: ['EN', 'en-US', 'Language'], zh: ['中文', 'zh-CN', '语言'] };
export const DIL = (() => { try { const d = localStorage.getItem(ANAHTAR); return d in DILLER ? d : 'tr'; } catch { return 'tr'; } })();
export const YEREL = DILLER[DIL][1];
export function dilDegistir(d) {
  try { localStorage.setItem(ANAHTAR, d); } catch { /* depolama yoksa yalnızca bu oturum */ }
  location.reload();
}

const SOZLUK = new Map(Object.entries({
  // Üst çubuk ve menü
  'Canlı işlem': 'Live trading', 'Cüzdanı bağla': 'Connect wallet', 'Acil durdur': 'Emergency stop', 'Acil durduruldu': 'Emergency stopped',
  'Binance cüzdanı bağlı değil. İşlem yapmak için QR ile bağlan.': 'Binance wallet not connected. Connect with QR to trade.',
  'QR ile bağlan': 'Connect with QR', 'Binance cüzdanını bağla': 'Connect your Binance wallet', 'Telefonda': 'On your phone,',
  "'i aç ve QR tarayıcıyı başlat.": ' and start the QR scanner.', 'Aşağıdaki QR kodu okut.': 'Scan the QR code below.',
  'Uygulamada görünen kodun': 'Check that the code shown in the app', 'aşağıdaki eşleştirme koduyla aynı': 'matches the pairing code below',
  'olduğunu kontrol et ve onayla.': 'and approve.', 'Eşleştirme kodu': 'Pairing code', 'Kalan süre': 'Time left', 'Kod hazırlanıyor…': 'Preparing code…',
  'Yeni kod': 'New code', 'Giriş sayfasını aç': 'Open sign-in page', 'Kapat': 'Close',
  "Kod Binance'ten gelir ve yaklaşık 5 dakika geçerlidir. Bağlantı en fazla 7 gün sürer, 48 saat işlem yapılmazsa düşer.": 'The code comes from Binance and is valid for about 5 minutes. A connection lasts up to 7 days and drops after 48 hours without activity.',
  'Siper': 'Launches', 'Yeni lansmanlar': 'New launches', 'Portföy': 'Portfolio', 'Elindekiler, K/Z': 'Holdings, P/L', 'Emirler': 'Orders',
  'İşlem geçmişi': 'Trade history', 'Otomasyon': 'Automation', 'Sniper, oto satış': 'Sniper, auto sell', 'Mintler': 'Mints',
  'Ücretsiz mint takibi': 'Free mint tracking', 'Liderler': 'Leaders', 'En çok kazanan cüzdanlar': 'Top earning wallets',
  'Token ve NFT takibi': 'Token and NFT tracking', 'Basım': 'Launch', "Four.meme'de token bas": 'Launch a token on Four.meme',
  'Cüzdan': 'Wallet', 'Bağlantı, bakiye': 'Connection, balance', 'Ayarlar': 'Settings', 'Bildirimler': 'Notifications', 'Bölümler': 'Sections',
  // İşlem paneli
  'İşlem': 'Trade', "Siper'den bir token seç ya da adres yapıştır.": 'Pick a token from Launches or paste an address.', 'Al': 'Buy', 'Sat': 'Sell',
  'Token adresi': 'Token address', 'Miktar (BNB)': 'Amount (BNB)', 'Kayma %': 'Slippage %', 'varsayılan': 'default', '1 · Teklif al': '1 · Get quote',
  '2 · Gerçek emri hazırla': '2 · Prepare real order', '2 · Simüle et': '2 · Simulate', 'Evet, gerçek emri gönder': 'Yes, send the real order',
  'Kendi araştırmanı yap. Yeni çıkan tokenler sıfıra inebilir ya da satılamayabilir.': 'Do your own research. New tokens can go to zero or be unsellable.',
  'Binance giriş QR kodu': 'Binance sign-in QR code', 'İşlem fişine al': 'Add to trade ticket',
  // Siper
  "Agent ID'ye özel Four.meme lansmanları · Binance Web3 resmi listesi ·": 'Agent ID only Four.meme launches · official Binance Web3 list ·',
  'Min holder': 'Min holders', 'Maks top10 %': 'Max top10 %', 'Min MC $': 'Min MC $', 'Dev satanları gizle': 'Hide dev sellers',
  'Yeni lansmanda ses': 'Sound on new launch', 'Token yok': 'No tokens', 'Toplanan': 'Raised', '24s hacim': '24h volume', '24s': '24h', 'Yükleniyor…': 'Loading…',
  "Agent ID'ye özel Four.meme lansmanları · Binance Web3 resmi listesi": 'Agent ID only Four.meme launches · official Binance Web3 list',
  "Agent ID'ye özel TARS lansmanları · Solana · tars.meme herkese açık API": 'Agent ID only TARS launches · Solana · tars.meme public API',
  'TARS Solana\'da çalışır: kartlar sadece izleme içindir, terminal bu tokenlerde işlem yapmaz. "Senkron" aynı saniyede birden çok cüzdandan gelen alımların sayısıdır; tek elden yönetilen cüzdanların ya da botun işareti olabilir.': 'TARS runs on Solana: these cards are for watching only and the terminal does not trade them. "Synced" counts buys from several wallets in the same second; it can point to wallets run by one hand or a bot.', 'Yeni': 'New', 'Dolmak üzere': 'Nearly full', "DEX'te": 'On DEX', 'Holder': 'Holders',
  'Al / Sat': 'Buys / Sells', 'Dev sattı': 'Dev sold', 'Sembol, ad ya da adres ara': 'Search symbol, name or address',
  'Boş alan "bilinmiyor" demektir, sıfır değil. Bonding curve aşamasında bu tokenleri sadece Agent ID sahipleri alıp satabilir.': 'An empty field means "unknown", not zero. During the bonding curve only Agent ID holders can trade these tokens.',
  // Portföy
  'Cüzdanın tüm zincir geçmişinden hesaplanır: mintler, alımlar, satışlar, transferler ve gas ·': "Computed from your wallet's full chain history: mints, buys, sells, transfers and gas ·",
  'Yenile': 'Refresh', 'Piyasası açılmayı bekleyen tokenler': 'Tokens waiting for a market', 'Token': 'Token', 'Elindeki': 'Held',
  'İzleniyor': 'Watching', 'Yaklaşan açılışlar': 'Upcoming openings', 'Açılış': 'Opens in', 'açıldı': 'opened', 'Bedava faz bekleniyor': 'Free phase pending', 'Bu oturumda henüz bildirim yok': 'No notifications this session yet', 'İki faz': 'Two-phase', 'Önce bedava havuz, dolunca ücretli': 'Free pool first, paid once it fills', 'Toplam arzdan tahmin, ücretli mintler de sayılıyor': 'Estimated from total supply, paid mints included', "Kontratın bedava sayacı": "Contract's free counter",
  'Kontratın yazdığı açılış saatinde takip birkaç saniyede bir yeniden kontrol eder. Açılınca otomatik mint kuralların uygulanır.': 'At the opening time written in the contract, the tracker re-checks every few seconds. Once it opens, your auto-mint rules apply.',
  'Kontratın yazdığı açılış saati': 'Opening time written in the contract', 'Ücretli yol açık, bedava yol henüz açılmadı': 'Paid path is open, free path not yet', 'Son kontrol': 'Last check', 'Durum': 'Status', 'Havuz yok': 'No pool', 'Şimdi kontrol et': 'Check now',
  'Mint edilen tokenlerin çoğunda havuz mint bitince ya da proje sahibi açınca kurulur. Fiyatı olmayan tokenler 10 dakikada bir kontrol edilir; fiyat oluştuğu an bildirim gelir. En iyi satış fırsatı genelde ilk dakikalardır.': 'For most minted tokens the pool is created when the mint ends or when the owner opens it. Tokens without a price are checked every 10 minutes and you are notified the moment a price appears. The best selling window is usually the first minutes.',
  'Normal': 'Normal', 'Agent': 'Agent', 'Portföy bölümü': 'Portfolio section',
  'Ajanların senin onayın olmadan, otomatik mintledikleri. Elle "Mint et" ile yaptıkların ve diğer her şey Normal bölümünde.': 'What the agents minted automatically without your approval. Your manual "Mint" actions and everything else are in Normal.',
  'Net kâr / zarar': 'Net profit / loss', 'Değer eksi BNB, gas ve yapay zekâ · zincirde': 'Value minus BNB, gas and AI · on chain', 'Yapay zekâ': 'AI',
  'OpenRouter toplam harcama': 'OpenRouter total spend', 'Otomatik mint': 'Auto mint', 'Ödenen': 'Paid', 'Bugünkü değer': 'Value today',
  'Fiyatı olan varlıklar': 'Priced assets', 'Zaman': 'Time', 'Mint': 'Mint', 'Gelen': 'Received', 'Gas': 'Gas', 'bedava': 'free', 'fiyat yok': 'no price',
  'hiçbir şey gelmedi': 'nothing received', 'Maliyet paneli': 'Cost panel', 'Yükleniyor…': 'Loading…', 'Adım': 'Step', 'Çağrı': 'Calls',
  'Ücretsiz': 'Free', 'Tutar': 'Amount', 'Model': 'Model', 'Gerçekleşmemiş': 'Unrealized', 'Eldeki fiyatlı tokenler': 'Priced tokens held',
  'Gerçekleşen': 'Realized', 'Satışlardan': 'From sales', 'Gas ve harcama': 'Gas and spend', 'BNB fiyat etkisi': 'BNB price effect',
  'Yapay zekâ gideri': 'AI cost', 'Zaman içinde': 'Over time', 'Portföy değeri': 'Portfolio value', 'Nereden geldi': 'Where it came from',
  'Kaynak': 'Source', 'Varlık': 'Asset', 'Maliyet': 'Cost', 'Fiyatı bilinmeyen': 'Unknown price', 'Bedava geldi': 'Came free', 'Alım': 'Buy',
  'Tokenler': 'Tokens', 'Miktar': 'Amount', 'Ort. maliyet': 'Avg. cost', 'Fiyat': 'Price', 'Değer': 'Value', 'Toplam': 'Total', 'Grafik': 'Chart',
  'Hemen sat': 'Sell now', 'Fiyat emri': 'Price order', 'Hepsi': 'All', 'Emir türü': 'Order type', 'Kâr al: fiyat şuna çıkınca sat': 'Take profit: sell when price rises to',
  'Zarar kes: fiyat şuna inerse sat': 'Stop loss: sell if price drops to', 'Tetik fiyatı (USD)': 'Trigger price (USD)', 'Nerede beklesin': 'Where it waits',
  "Binance'te (bilgisayar kapalıyken de)": 'On Binance (even with the computer off)', 'Bu terminalde (açık olmalı)': 'In this terminal (must be open)',
  'Devam': 'Continue', 'Evet': 'Yes', 'Vazgeç': 'Cancel', 'Fiyat emirleri': 'Price orders', 'Tür': 'Type', 'Tetik': 'Trigger', 'Nerede': 'Where',
  'Kuruldu': 'Created', 'Emir yok': 'No orders', 'Dakika': 'Minute', 'Saat': 'Hour', 'Gün': 'Day', "NFT'ler": 'NFTs', 'Koleksiyon': 'Collection',
  'Adet': 'Count', 'Nasıl geldi': 'How it came', 'Token ID': 'Token ID', 'Son işlem': 'Last trade',
  'Fiyatı bilinmeyen varlıklara (NFT\'ler, havuzu olmayan tokenler)': 'On assets without a known price (NFTs, tokens without a pool)',
  'harcandı ve bunlar değere 0 olarak girdi. Maliyetleriyle sayılırsa net kâr / zarar:': 'was spent and they count as 0 in value. Counted at cost, net profit / loss:',
  "Mumlar GeckoTerminal'in havuz verisinden gelir. Oklar senin alış ve satışların, kesikli çizgi ortalama maliyetin.": "Candles come from GeckoTerminal pool data. Arrows are your buys and sells, the dashed line is your average cost.",
  // Emirler ve otomasyon
  'Bu oturumdaki tüm emirler, son 200': 'All orders this session, last 200', 'Yön': 'Side', 'Ayrıntı': 'Details', 'Henüz emir yok': 'No orders yet',
  'Sniper': 'Sniper', 'Yeni lansman filtreye uyarsa otomatik alır.': 'Buys automatically when a new launch matches the filter.', 'Açık': 'On',
  'Simülasyon (gerçek işlem yok)': 'Simulation (no real trades)', 'İşlem başı BNB': 'BNB per trade', 'En az yaş (sn)': 'Min age (s)',
  'En fazla yaş (sn)': 'Max age (s)', 'Günlük en fazla token': 'Max tokens per day', "Dev'in sattıklarını alma": 'Skip tokens the dev sold',
  'Otomatik satış': 'Auto sell', "Sadece sniper'ın aldığı pozisyonlar. Kademeler kalan miktarın yüzdesini satar.": 'Only positions the sniper bought. Steps sell a percentage of what is left.',
  'Kâr al kademeleri': 'Take profit steps', 'Zarar kes %': 'Stop loss %', 'Kontrol aralığı (sn)': 'Check interval (s)', 'En fazla izleme (saat)': 'Max watch (hours)',
  'gerçek işlem': 'real trades', 'Evet, gerçek işlemi aç': 'Yes, turn on real trading', 'Ayarları kaydet': 'Save settings', 'Açık pozisyonlar': 'Open positions',
  'Giriş': 'Entry', 'Kalan': 'Left', 'Kâr al': 'Take profit', 'Açılış': 'Opened', 'Simülasyon': 'Simulation', 'Kayıtlar': 'Log', 'Kayıt yok': 'No entries',
  'yapacak: senin onayın olmadan BNB harcayabilir ya da token satabilir. Limitler ve güvenlik kontrolleri yine uygulanır.': 'mode: it may spend BNB or sell tokens without your approval. Limits and safety checks still apply.',
  // Mintler
  "BSC'ye yeni yüklenen NFT kontratları · mintler cüzdan adresinle simüle edilir ·": 'New NFT contracts deployed on BSC · mints are simulated with your wallet address ·',
  'BNB miktarı': 'BNB amount', 'Kontrol et': 'Check', 'Yeni ücretsiz mintte ses': 'Sound on new free mint', 'Bir kontrat adresini elle kontrol et: 0x…': 'Check a contract address by hand: 0x…',
  'boş': 'empty', 'BNB miktarını sadece "kontrata şu kadar BNB gönder" diye duyurulan mintler için doldur. Boş bırakırsan kontrat incelenir.': 'Fill in the BNB amount only for mints announced as "send this much BNB to the contract". Leave it empty to inspect the contract.',
  'Hazır': 'Ready', 'Riskli': 'Risky', 'Geçmiyor': 'Failing', 'Kapandı / tükendi': 'Closed / sold out', 'Mint ettiklerim': 'My mints', 'Tümü': 'All',
  'Sadece 0 BNB': 'Only 0 BNB', 'Sitesi ve sosyali doğrulanmamışları gizle': 'Hide unverified site and socials', 'Mint türü': 'Mint type', 'Mintleri filtrele': 'Filter mints',
  'Ad, sembol ya da adres ara': 'Search name, symbol or address', 'Ücret': 'Fee', 'Basılan': 'Minted', 'Mint et': 'Mint', 'Araştır': 'Research',
  'Neredeyse ücretsiz': 'Nearly free', 'Ücretli': 'Paid', 'İzle': 'Watch', 'Tükendi': 'Sold out', 'Zaten aldın': 'Already claimed', 'NFT değil': 'Not an NFT',
  'Simülasyonu geçen ve risk işareti olmayan mintler. Yine de "Mint et" önce Binance önizlemesinden geçer.': 'Mints that pass simulation and carry no risk flag. "Mint" still goes through the Binance preview first.',
  'Tarama sadece okuma yapar. İşlem sadece "Evet, mint et" onayınla ya da açtıysan otomatik mint kurallarıyla gönderilir. "Simülasyon geçti" demek güvenli demek değil: kaynağı doğrulanmamış ya da yetkisi sahibinde kalan kontratlarda dikkatli ol. Başka bir kontratın içinden yüklenen NFT\'ler ve proxy kontratlar kaçabilir. Arka uçtan imza isteyen mintler simüle edilemez, sadece işaretlenir.': 'Scanning only reads. A transaction is sent only after your "Yes, mint" or, if you turned it on, by the auto-mint rules. "Simulation passed" does not mean safe: be careful with unverified contracts or ones whose owner keeps control. NFTs deployed inside other contracts and proxies can be missed. Mints that need a backend signature cannot be simulated, only flagged.',
  'Sadece kontrata düz BNB gönderilerek yapılan mintler için. Doldurursan calldata olmadan bu miktarla mint hazırlanır.': 'Only for mints done by sending plain BNB to the contract. If filled, a mint with this amount and no calldata is prepared.',
  'Mint onayı': 'Mint confirmation', 'Kasa kartı analizi': 'Vault card analysis', 'Araştırma sonucu': 'Research result', 'İş kanıtı: hash bulunmadan mintlenemez': 'Proof of work: cannot be minted without finding a hash',
  'Ajanlar': 'Agents', 'açık': 'on', 'kapalı': 'off', 'Ayarlar ve anahtarlar': 'Settings and keys', 'Anahtarı kaydet': 'Save key', 'Anahtarı sil': 'Delete key',
  'Kayıtlı:': 'Saved:', 'Anahtar yok: web araması kapalı': 'No key: web search off', 'Sadece gas ödenen (0 BNB) mintleri otomatik yap': 'Auto-mint only gas-only (0 BNB) mints',
  'Sadece Agent ID mintlerini otomatik yap': 'Auto-mint only Agent ID mints', 'LLM araştırması (OpenRouter, ücretli)': 'LLM research (OpenRouter, paid)',
  'Günlük otomatik mint': 'Daily auto mints', 'Web arama sonucu': 'Web search results', 'Otomatik mint açılınca sistem kurallar geçen': 'With auto-mint on, the system sends',
  "0 BNB'lik": '0 BNB', 'Evet, aç': 'Yes, turn on', 'Son kararlar': 'Recent decisions', 'Karar': 'Decision', 'Site': 'Site', 'Sosyal': 'Social', 'Neden': 'Reason',
  'mintleri senin onayın olmadan gönderir (mint başına sadece gas). Acil durdur bunu da kapatır.': 'mints that pass the rules without your approval (only gas per mint). Emergency stop turns this off too.',
  'Onayını bekliyor': 'Awaiting your approval', 'Yok': 'None', 'Ücret istiyor (otomatik mint sadece gas ödenenlerde): onayın gerekiyor': 'Charges a fee (auto-mint is gas-only): needs your approval', 'Sadece gas, risk işareti yok': 'Gas only, no risk flags', 'Ücret istiyor: otomatik mint sadece gas ödenenlerde': 'Charges a fee: auto-mint is gas-only',
  'Araştırma yapılamadı': 'Research failed', 'Süzgeç temiz: OKX taramaları ve site kontrolü': 'Filter clean: OKX scans and site check',
  'Mint şu an geçmiyor: henüz açılmamış ya da simülasyonda geçmiyor': 'Mint is not passing now: not open yet or failing in simulation',
  'Agent ID mint değil': 'Not an Agent ID mint', 'Şüpheli, atlandı': 'Suspicious, skipped', 'Token riski LOW': 'Token risk LOW', 'Token riski MEDIUM': 'Token risk MEDIUM',
  'Token riski HIGH': 'Token risk HIGH', 'Agent ID': 'Agent ID', 'Kasa': 'Vault',
  'OpenRouter API anahtarı: sk-or-…': 'OpenRouter API key: sk-or-…', 'Brave Search API anahtarı (ücretsiz plan): ücretsiz web araması için': 'Brave Search API key (free plan): for free web search',
  'Site ajanı mint sitesini ve kodunu, sosyal ajan X hesabını ve taklit işaretlerini inceler. İkisi de sadece puan verir. Karar ve gönderim kural tabanlı koddadır: otomatik mint sadece gas ödenen (0 BNB) mintlerde, risk işareti yoksa ve Binance önizlemesi temizse (token izni, yetki değişikliği ya da beklenmeyen çıkış yoksa) yapılır. Ücret isteyen mintler için bildirim gelir, sen onaylarsın. Otomatik mintlenenler Portföy\'ün Agent bölümünde görünür.': "The site agent reviews the mint site and its code, the social agent the X account and impersonation signs. Both only give scores. Decisions and sending live in rule-based code: auto-mint runs only for gas-only (0 BNB) mints when there is no risk flag and the Binance preview is clean (no token approval, authority change or unexpected outflow). Mints that charge a fee send you a notification for your approval. Auto-minted items appear in the Agent part of Portfolio.",
  // Liderler
  "BSC'de en çok kazanan, en isabetli ve en zengin aktif cüzdanlar · kaynak OKX Onchain OS ·": 'The most profitable, most accurate and richest active wallets on BSC · source OKX Onchain OS ·',
  'En çok kazanan': 'Top earners', 'En yüksek getiri': 'Highest return', 'En isabetli': 'Most accurate', 'En çok hacim': 'Most volume', 'En çok işlem': 'Most trades',
  'En zengin': 'Richest', 'Süre': 'Period', '1 gün': '1 day', '3 gün': '3 days', '7 gün': '7 days', '30 gün': '30 days', '3 ay': '3 months', 'Cüzdan türü': 'Wallet type',
  'Akıllı para': 'Smart money', 'Fenomen (KOL)': 'Influencer (KOL)', 'Geliştirici': 'Developer', 'Yeni cüzdan': 'Fresh wallet', 'Pump avcısı': 'Pump hunter',
  'Seçilen sürede en çok gerçekleşmiş kâr eden cüzdanlar.': 'Wallets with the most realized profit in the selected period.', 'Kazanç': 'Profit', 'Getiri': 'Return',
  'İsabet': 'Win rate', 'Hacim': 'Volume', 'BSC varlığı': 'BSC holdings', 'En çok kazandıran': 'Best tokens', 'Sıralama': 'Sort', 'Adres ya da token ara': 'Search address or token',
  'Kazanç gerçekleşmiş kâr / zarardır (satılmış pozisyonlar). "En zengin" zincirin tamamı değil: seçilen süredeki kazanç ve hacim listelerinde yer alan aktif cüzdanların BSC\'deki varlık değeridir. Liste sadece bilgi içindir; bu cüzdanları körü körüne takip etmek zarar ettirebilir, çoğu yüksek riskli meme tokenlerde işlem yapar.': 'Profit is realized profit / loss (closed positions). "Richest" is not the whole chain: it is the BSC holdings of active wallets on the profit and volume lists for the period. The list is for information only; blindly copying these wallets can lose money, most of them trade high-risk meme tokens.',
  // HOUND
  'HOUND ve BlockHound': 'HOUND and BlockHound', 'Kendi token ve NFT koleksiyonumuz · arz, sahipler, madenciler ve gelir zincirden okunur ·': 'Our own token and NFT collection · supply, holders, miners and revenue read from chain ·',
  'Toplam gelir': 'Total revenue', 'Kontratta bekleyen': 'Held in contracts', 'Kasa bakiyesi': 'Treasury balance', 'Sahip': 'Holders', 'Madenci': 'Miners',
  'Arz': 'Supply', 'Zorluk': 'Difficulty', 'Ortalama hash': 'Average hashes', 'Gelir': 'Revenue', 'Son 24 saat': 'Last 24 hours', 'Bende': 'Mine', 'Piyasa': 'Market',
  'Son 24 saat, saatlik mint': 'Last 24 hours, mints per hour', 'En büyük sahipler': 'Top holders', 'Pay': 'Share', 'Madenciler': 'Miners', 'Son mintler': 'Recent mints',
  'Sıra': 'Index', 'Henüz sahip yok': 'No holders yet', 'Henüz madenci yok': 'No miners yet', 'Henüz mint yok': 'No mints yet', 'Dönem ilerlemesi': 'Epoch progress',
  'zincirden okunuyor…': 'reading from chain…',
  'Sahipler kurulum bloğundan bu yana Transfer olaylarından hesaplanır; Agent ID adı olan cüzdanlar adıyla gösterilir. Kontratta biriken ücret, herkesin çağırabildiği withdraw() ile yalnızca kasaya gider. Arz sınırsızdır ama zorluk her dönemde bir bit artar.': 'Holders are computed from Transfer events since the deployment block; wallets with an Agent ID are shown by name. Fees held in the contracts can only go to the treasury, through withdraw() which anyone can call. Supply is unlimited but difficulty rises one bit every epoch.',
  // Basım
  'Four.meme Agent ID şablonuyla token basımı · ayrı basıcı cüzdan · önce zincir simülasyonu': 'Token launch with the Four.meme Agent ID template · separate launcher wallet · chain simulation first',
  'Basıcı cüzdan': 'Launcher wallet', 'Bakiye:': 'Balance:', '· Kilitli': '· Locked', 'Şifre': 'Password', 'Kilidi aç': 'Unlock', 'Token bilgileri': 'Token details',
  'Ad': 'Name', 'Sembol': 'Symbol', 'Açıklama': 'Description', 'Görsel (png, jpeg, webp, gif · en fazla 2 MB)': 'Image (png, jpeg, webp, gif · up to 2 MB)',
  'Web sitesi': 'Website', 'Ön alım (BNB)': 'Pre-buy (BNB)', 'Vergi ayarları (isteğe bağlı, varsayılan %0)': 'Tax settings (optional, default 0%)',
  "Vergi DEX'e geçtikten sonraki alım-satımlara uygulanır. Vergi varsa dağılım oranlarının toplamı 100 olmalı.": 'Tax applies to trades after moving to DEX. If there is a tax, the split must add up to 100.',
  'Alım vergisi (bps, 100 = %1)': 'Buy tax (bps, 100 = 1%)', 'Satış vergisi (bps)': 'Sell tax (bps)', 'Kurucuya %': 'To founder %', 'Tutuculara %': 'To holders %',
  'Yakım %': 'Burn %', 'Likiditeye %': 'To liquidity %', 'Ödül için en az token': 'Min tokens for rewards', 'Taslak hazırla ve simüle et': 'Prepare draft and simulate',
  'Basım ücreti, ön alım ve gas bu cüzdandan ödenir. BNB göndermek için yukarıdaki adresi kullan.': 'The launch fee, pre-buy and gas are paid from this wallet. Use the address above to send BNB.',
  'İlk 6 blokta anti-sniper ek ücreti var': 'Anti-sniper surcharge in the first 6 blocks', 'yok': 'none', 'ÖRN: AJAN': 'E.G. AGENT', 'En fazla 0.02 BNB': 'Up to 0.02 BNB',
  // Cüzdan
  'Binance Agentic Wallet · imzalar Binance tarafında atılır, private key bu bilgisayarda yok': 'Binance Agentic Wallet · signatures happen on Binance\'s side, no private key on this computer',
  'Binance Agentic Wallet bağlı değil.': 'Binance Agentic Wallet is not connected.',
  // Ayarlar
  'Limitler, ajanlar ve bildirimler · değerler .env dosyasına yazılır ·': 'Limits, agents and notifications · values are written to the .env file ·',
  'Limitler ve işlem': 'Limits and trading', 'Sunucunun zorunlu tavanları. Kaydedince hemen geçerli olur.': 'Hard caps enforced by the server. Take effect as soon as you save.',
  'İşlem başı en fazla': 'Max per trade', '(BNB)': '(BNB)', '(adet)': '(count)', 'Tek bir alım, mint ya da emirde harcanabilecek en fazla BNB. 0 = alım kapalı.': 'The most BNB a single buy, mint or order can spend. 0 = buying off.',
  'Günlük en fazla': 'Max per day', 'Bir günde toplam harcanabilecek BNB. Otomatik mintler ve sniper da buna dahil.': 'Total BNB that can be spent in a day. Auto mints and the sniper count too.',
  'Varsayılan kayma': 'Default slippage', 'Al ve sat emirlerinde fiyatın en fazla ne kadar kayabileceği.': 'How far the price may slip on buy and sell orders.',
  'Basımda ön alım tavanı': 'Launch pre-buy cap', 'Basım sekmesinde token basarken yapılabilecek en fazla ön alım.': 'The largest pre-buy allowed when launching a token.',
  'Basım ücreti tavanı': 'Launch fee cap', 'Four.meme basım ücreti bunu aşarsa basım yapılmaz.': 'No launch if the Four.meme fee exceeds this.',
  'Araştırma ve otomatik mint sınırları. Kaydedince hemen geçerli olur.': 'Research and auto-mint limits. Take effect as soon as you save.',
  'Günlük araştırma': 'Daily research', 'Ajanların günde en fazla kaç mint araştıracağı. Her araştırma 2 LLM çağrısı ve web araması (yaklaşık 1 sent).': 'How many mints the agents research per day at most. Each research is 2 LLM calls and a web search (about 1 cent).',
  'Site ajanı modeli': 'Site agent model', 'Siteyi inceler. Virgülle yedekli liste: ilki hız sınırına takılırsa sıradaki. ":free" modeller ücretsiz.': 'Reviews the site. Comma-separated fallback list: if the first hits a rate limit, the next is used. ":free" models are free.',
  'Sosyal ajan modeli': 'Social agent model', 'Web aramasıyla siteyi ve X hesabını bulur. Model ücretsiz olsa da web araması sonuç başına ücretlidir.': 'Finds the site and X account via web search. Even with a free model, web search is paid per result.',
  'Hakem modeli': 'Judge model', 'İki raporu okuyup son risk değerlendirmesini yapar. Girdisi küçük: ucuz ama akıllı bir model yeter.': 'Reads both reports and makes the final risk call. Small input: a cheap but smart model is enough.',
  'Sistem': 'System', 'Bunlar yeniden başlatınca devreye girer.': 'These take effect after a restart.', 'Mod': 'Mode', 'Simülasyon (sim)': 'Simulation (sim)', 'Canlı (live)': 'Live',
  'sim: sadece teklif ve simülasyon. live: canlı zincir verisi.': 'sim: quotes and simulation only. live: live chain data.', 'Gerçek işlem': 'Real trading',
  'Kapalı: işlem gönderilmez': 'Off: nothing is sent', 'Açık: gerçek işlem gönderilir': 'On: real transactions are sent',
  '1: gerçek emir ve mint gönderilir (sadece live modda). 0: hiçbir işlem gönderilmez.': '1: real orders and mints are sent (live mode only). 0: nothing is sent.',
  'BSC RPC': 'BSC RPC', 'Zincir okuma ve simülasyon için.': 'For chain reads and simulation.', 'Olay RPC (virgülle)': 'Event RPC (comma-separated)',
  'Fabrika içinden kurulan mint kontratlarını bulmak için. Boş = kapalı.': 'To find mint contracts deployed inside factories. Empty = off.', 'Evet, kaydet': 'Yes, save', 'Kaydet': 'Save',
  'Bazı değişiklikler yeniden başlatınca devreye girecek. Terminal birkaç saniye kapanıp açılır, açık fiyat emirleri ve takip kaldığı yerden devam eder.': 'Some changes take effect after a restart. The terminal closes and reopens in a few seconds; open price orders and tracking resume where they left off.',
  'Yeniden başlat': 'Restart', 'bildirimler kapalı': 'notifications off', 'Masaüstü bildirimleri': 'Desktop notifications', 'Terminal açıkken macOS bildirim merkezine gelir.': 'Delivered to the macOS notification center while the terminal is open.',
  'Bildirimler açık': 'Notifications on', 'Bildirim sesi': 'Notification sound', 'Sadece Agent ID mintleri': 'Agent ID mints only', 'Saatte en fazla': 'Max per hour',
  'Deneme bildirimi gönder': 'Send test notification', 'Ne zaman bildirilsin': 'When to notify', 'Kapattığın türler susturulur ama aşağıdaki geçmişte görünür.': 'Types you turn off are muted but still appear in the history below.',
  'Ücretsiz mint bulundu': 'Free mint found', "Neredeyse ücretsiz mint (0.001 BNB'ye kadar)": 'Nearly free mint (up to 0.001 BNB)', "Ücretli token mint (0.01 BNB'ye kadar)": 'Paid token mint (up to 0.01 BNB)',
  'Agent ID mint bulundu, henüz açık değil': 'Agent ID mint found, not open yet', 'Ajan: onayını bekleyen mint': 'Agent: mint awaiting approval', 'Ajan: otomatik mint gönderildi': 'Agent: auto mint sent',
  'Ajan: şüpheli mint atlandı': 'Agent: suspicious mint skipped', 'Fiyat emri doldu ya da başarısız oldu': 'Price order filled or failed', 'Elindeki bir tokenin piyasası açıldı (havuz kuruldu)': 'A token you hold got a market (pool created)',
  'Sessiz saatler': 'Quiet hours', 'Bu aralıkta hiç bildirim gelmez. Gece yarısını geçebilir (23:00 - 08:00 gibi).': 'No notifications in this window. It can span midnight (like 23:00 - 08:00).',
  'Sessiz saatler açık': 'Quiet hours on', 'Başlangıç': 'Start', 'Bitiş': 'End', 'Tarayıcı sesleri': 'Browser sounds', 'Terminal sekmesi açıkken çalan kısa bip. Bu tarayıcıya özeldir.': 'A short beep while the terminal tab is open. Specific to this browser.',
  'Siper: yeni lansmanda ses': 'Launches: sound on new launch', 'Mintler: yeni ücretsiz mintte ses': 'Mints: sound on new free mint', 'Son bildirimler': 'Recent notifications', 'Bildirim': 'Notification',
  'Site ? · Sosyal ? · Mintler sekmesinden mint edebilirsin': 'Site ? · Social ? · you can mint from the Mints tab', 'Susturuldu: Bildirimler kapalı': 'Muted: notifications off',
  'Ajanların bir günde senin onayın olmadan gönderebileceği en fazla mint': 'The most mints agents can send in a day without your approval', 'Bir saat içinde bundan fazlası gelirse kalanlar susturulur': 'If more arrive within an hour, the rest are muted',
  'Kapalıyken OpenRouter hiç kullanılmaz: karar ücretsiz süzgeçle (OKX işlem, token ve site taramaları, site kodu, taklit adı) ve Binance önizlemesiyle verilir': 'When off, OpenRouter is never used: decisions come from the free filter (OKX transaction, token and site scans, site code, impersonated names) and the Binance preview',
  "Sosyal ajanın her araştırmada okuyacağı web sonucu sayısı. Model ücretsiz olsa da her sonuç OpenRouter'da yaklaşık 0,4 sent. 0 = web araması kapalı.": 'How many web results the social agent reads per research. Even with a free model each result costs about 0.4 cents on OpenRouter. 0 = web search off.',
  'Brave anahtarı olunca sosyal ajanın web araması ücretsiz yapılır (Brave her ay 5 $ ücretsiz kredi veriyor: yaklaşık 1.000 arama; ödemeli bakiye yüklemezsen kota bitince ücret kesilmez, arama durur). Anahtar yoksa arama OpenRouter üzerinden ücretli yapılır ya da "Web arama sonucu" 0 ise hiç yapılmaz. Anahtarı api-dashboard.search.brave.com adresinden Search planıyla alabilirsin.': 'With a Brave key the social agent searches the web for free (Brave gives 5 dollars of free credit a month: about 1,000 searches; without a paid balance nothing is charged when the quota runs out, search just stops). Without a key search goes through OpenRouter for a fee, or not at all if "Web search results" is 0. Get a key with the Search plan at api-dashboard.search.brave.com.',
  // Ek etiketler
  "Adsız": "Untitled",
  "Temayı değiştir": "Toggle theme",
  "5D": "5m",
  "15D": "15m",
  "1S": "1h",
  "4S": "4h",
  "1G": "1d",
  "PancakeSwap fiyat, grafik, swap": "PancakeSwap price, chart, swap",
  "Fiyat, likidite ve havuzlar doğrudan PancakeSwap kontratlarından okunur · grafik ve holder sayısı GeckoTerminal'den ·": "Price, liquidity and pools are read straight from PancakeSwap contracts · chart and holder count from GeckoTerminal ·",
  "Token adresi: 0x…": "Token address: 0x…",
  "Getir": "Load",
  "Fişteki token": "Token in trade panel",
  "Bir token adresi gir. Fiyat, piyasa değeri, arz, likidite, holder ve havuzlar burada görünür.": "Enter a token address. Price, market cap, supply, liquidity, holders and pools show up here.",
  "Fiyat grafiği": "Price chart",
  "Aralık": "Interval",
  "Rota": "Route",
  "PancakeSwap ile al": "Buy on PancakeSwap",
  "PancakeSwap'ta aç": "Open on PancakeSwap",
  "Likidite": "Liquidity",
  "İlk 10 payı bilinmiyor": "Top 10 share unknown",
  "Havuzlar": "Pools",
  "Satıra tıkla: grafik o havuzdan çizilir.": "Click a row to chart that pool.",
  "Havuz": "Pool",
  "Sürüm": "Version",
  "PancakeSwap'ta havuz yok.": "No pool on PancakeSwap.",
  "Bu token için WBNB, USDT ya da USD1 karşılığında bir V2 ya da V3 havuzu bulunamadı. Bonding curve'deki tokenler için rota Binance olarak kalmalı.": "No V2 or V3 pool against WBNB, USDT or USD1 was found for this token. For tokens still on the bonding curve, keep the route on Binance.",
  "Önce satış miktarı kadar PancakeSwap router'ına onay gönderilir, sonra satış.": "First an approval for the sale amount goes to the PancakeSwap router, then the sale.",
  "fişte geçerli bir token adresi yok": "no valid token address in the trade panel",
  "yükleniyor…": "loading…",
  "· yükleniyor": "· loading",
  "· bu aralıkta işlem yok": "· no trades in this interval",
  "· grafik kütüphanesi yüklenemedi": "· chart library failed to load",
  "Henüz araştırma yok": "No research yet",
  "Adres": "Address",
  "Oturum bitişi": "Session ends",
  "Geçmiş ve fiyatlar toplanıyor…": "Collecting history and prices…",
  "Four.meme girişi düz metin imza istediği için basım Binance cüzdanıyla değil, bu bilgisayarda şifreli duran ayrı bir cüzdanla yapılır. Anahtar": "Because Four.meme sign-in needs a plain text signature, launches use a separate encrypted wallet on this computer, not the Binance wallet. The key is stored encrypted in",
  "dosyasında şifreli durur. Şifreyi kaybedersen bu cüzdana erişim de kaybolur. Basılan token curve aşamasında sadece Agent ID'li cüzdanlarla alınıp satılabilir.": "If you lose the password you lose access to this wallet. During the curve stage the launched token can only be traded by Agent ID wallets.",
  "Kâr al emirleri Binance'te bekleyebilir. Zarar kes ve \"bu terminalde\" emirleri sadece terminal açıkken çalışır: fiyat art arda iki kontrolde (15 saniye arayla) tetiği geçince normal satış akışıyla satar. Emir kurulurken fiyat tetiği zaten geçmişse emir reddedilir, anında satış için \"Hemen sat\"ı kullan.": "Take profit orders can wait on Binance. Stop loss and \"in this terminal\" orders only run while the terminal is open: when the price crosses the trigger on two checks in a row (15 seconds apart) it sells through the normal sell flow. If the price is already past the trigger when you create the order it is rejected; use \"Sell now\" for an instant sale.",
  "BSC'de NFT taban fiyatı için ücretsiz bir kaynak yok: NFT'ler maliyetleriyle gösterilir ve toplam değere 0 olarak girer. Satıldıklarında gelen BNB gerçekleşen kâr olarak yazılır. NFT satmak bir pazar yeri ister (BSC'de Element): şimdilik NFT'leri pazar yerinin kendi sitesinden satabilirsin.": "There is no free source for NFT floor prices on BSC: NFTs are shown at cost and count as 0 in total value. When sold, the BNB received is recorded as realized profit. Selling NFTs needs a marketplace (Element on BSC): for now you can sell them on the marketplace's own site.",
  "Anahtar sınırı": "Key limit",
  "Anti-sniper": "Anti-sniper",
  "Basım ücreti": "Launch fee",
  "Bugün": "Today",
  "Doğrulama": "Verification",
  "Geçen fonksiyon": "Passing function",
  "Geçmeyen": "Failing",
  "Görüldü": "Seen",
  "Güvenlik süzgeci": "Safety filter",
  "Hakem": "Judge",
  "Hesap kredisi": "Account credit",
  "Kart": "Card",
  "Kasaya gelen vergi": "Tax received by vault",
  "Kontrat": "Contract",
  "Mint başına": "Per mint",
  "Mint işlemin": "Your mint tx",
  "Not": "Note",
  "Partner adresi": "Partner address",
  "Riskler": "Risks",
  "Site ajanı": "Site agent",
  "Sosyal ajan": "Social agent",
  "Tahmini token adresi": "Predicted token address",
  "Teklife sat": "Sell to bid",
  "Temettü": "Dividend",
  "Temettüye giden pay": "Share to dividends",
  "Vergi": "Tax",
  "İlanla sat": "Sell by listing",
  "İmza geçerliliği": "Signature validity",
  "İmza isteyen": "Signature required",
  "Bu satıştan K/Z": "P/L on this sale",
  "Piyasa değeri": "Market cap",
  "Agent ID kontrolü yardımcı bir kontratta": "Agent ID check is in a helper contract",
  "Alış": "Buy",
  "Anahtar yok: arama OpenRouter üzerinden ücretli": "No key: search is paid through OpenRouter",
  "Araştırılıyor…": "Researching…",
  "Açılıyor…": "Opening…",
  "Bağlandı ✓": "Connected ✓",
  "Brave (ücretsiz)": "Brave (free)",
  "Brave araması": "Brave search",
  "Bu anahtarla yapılan bütün harcama": "All spend with this key",
  "Bu terminalden ya da başka yoldan mint ettiklerin.": "What you minted from this terminal or elsewhere.",
  "Bugünkü değer eksi ödenen BNB ve gas": "Value today minus BNB paid and gas",
  "Bulunan her şey.": "Everything found.",
  "Canlı işlem kapalı (sadece simülasyon)": "Live trading off (simulation only)",
  "Canlı moda geçiliyor": "Switching to live mode",
  "Canlı veri": "Live data",
  "Curve aşamasında sadece Agent ID sahipleri satabilir.": "During the curve only Agent ID holders can sell.",
  "Cüzdan bağlandı.": "Wallet connected.",
  "Değişiklik yok": "No changes",
  "En çok alım satım hacmi yapanlar.": "Wallets with the most trading volume.",
  "En çok işlem yapanlar. Çoğu bot olabilir.": "Wallets with the most trades. Many may be bots.",
  "Emir bu terminalde bekler, terminal açık olmalı.": "The order waits in this terminal, which must stay open.",
  "Emri hazırla": "Prepare order",
  "Fişe aktar": "Move to ticket",
  "Gerçek basımı hazırla": "Prepare real launch",
  "Gerçek işlem açılıyor": "Turning on real trading",
  "Giriş başarısız": "Sign-in failed",
  "Gönderiliyor": "Sending",
  "Gönderiliyor, onay bekleniyor…": "Sending, waiting for confirmation…",
  "Gönderiliyor…": "Sending…",
  "Görsel en fazla 2 MB olabilir": "Image can be at most 2 MB",
  "Görsel seç": "Choose image",
  "Görsel önizleme": "Image preview",
  "Günlük": "Daily",
  "Henüz açılmamış ya da sitenin imzasını isteyen mintler.": "Mints not open yet or needing a site signature.",
  "Kapandı": "Closed",
  "Kesikli çizgi: o ana kadar yatırılan net para.": "Dashed line: net money deposited up to that point.",
  "Kod alınamadı": "Could not get a code",
  "Kod alınıyor…": "Getting code…",
  "Kodun süresi doldu. \"Yeni kod\" ile tekrar dene.": "The code expired. Try again with \"New code\".",
  "Kârla kapattığı işlem oranı en yüksek olanlar.": "Wallets with the highest share of profitable trades.",
  "Oluşturuluyor, birkaç saniye sürebilir…": "Creating, may take a few seconds…",
  "OpenRouter (ücretli)": "OpenRouter (paid)",
  "OpenRouter ayarlarından konabilir": "Can be set in OpenRouter settings",
  "Satıldı": "Sold",
  "Satılıyor": "Selling",
  "Satış": "Sell",
  "Sonuç bekleniyor": "Waiting for result",
  "Sosyal ajan (web araması dahil)": "Social agent (incl. web search)",
  "Süresi doldu": "Expired",
  "Sınır yok": "No limit",
  "Tamamlandı": "Done",
  "Teklif alınıyor": "Getting quote",
  "Token hacmi okunamadı": "Could not read token volume",
  "Vazgeçildi": "Cancelled",
  "Yeni açılan yok": "Nothing newly opened",
  "Yeniden başlatılıyor…": "Restarting…",
  "Zincire gönderildi": "Sent to chain",
  "Ücretsiz arama": "Free search",
  "İptal": "Cancel",
  "Şifreler aynı değil": "Passwords do not match",
  "Aktif cüzdanların BSC'deki varlık değeri.": "Holdings value on BSC of active wallets.",
  // Mint ayrıntısı
  "kayıt adresi kontratın kodunda": "registry address is in the contract code",
  "kayıt adresi proxy'nin uygulama kodunda": "registry address is in the proxy's implementation code",
  "kayıt adresi kontratın deposunda": "registry address is in the contract storage",
  "mint hatası Agent ID şartını söylüyor": "the mint error states an Agent ID requirement",
  "BscScan'de gör": "View on BscScan",
  // Genel
  'Ayrıntı ': 'Details ', 'Kapalı': 'Off', 'Gönderildi': 'Sent', 'Başarısız': 'Failed', 'Bekliyor': 'Pending', 'Hata': 'Error', 'Tamam': 'OK',
}));

const BIRIM = { sn: 's', dk: 'min', sa: 'h', gün: 'd' };
const KALIPLAR = [
  [/^(\d+) (sn|dk|sa|gün) önce$/, (m) => `${m[1]} ${BIRIM[m[2]]} ago`],
  [/^(\d+) (sn|dk|sa|gün)$/, (m) => `${m[1]}${BIRIM[m[2]]}`],
  [/^az önce$/, () => 'just now'],
  [/^Senkron alım: (\d+)$/, (m) => `Synced buys: ${m[1]}`],
  [/^([\d.,]+) \/ ([\d.,?]+) SOL$/, (m) => `${m[1]} / ${m[2]} SOL`],
  [/^%(-?[\d.,]+)$/, (m) => `${m[1]}%`],
  [/^güncellendi (.+)$/, (m) => `updated ${m[1]}`],
  [/^Kaynağa ulaşılamıyor, site kapalı olabilir · (\d+) sn sonra tekrar denenecek$/, (m) => `Source unreachable, the site may be down · retrying in ${m[1]} s`],
  [/^Tarama hatası: (.+)$/, (m) => `Scan error: ${m[1]}`],
  [/^blok ([\d.,]+) · güncellendi (.+?)( · yeni bloklar okunamadı, tekrar denenecek)?$/, (m) => `block ${m[1]} · updated ${m[2]}${m[3] ? ' · new blocks could not be read, will retry' : ''}`],
  [/^(\d+) cüzdan · güncellendi (.+?)( · varlık değeri (\d+)\/(\d+))?$/, (m) => `${m[1]} wallets · updated ${m[2]}${m[3] ? ` · holdings value ${m[4]}/${m[5]}` : ''}`],
  [/^(\d+) mint$/, (m) => `${m[1]} mint${m[1] === '1' ? '' : 's'}`],
  [/^(\d+) mint · (.+)$/, (m) => `${m[1]} mint${m[1] === '1' ? '' : 's'} · ${m[2]}`],
  [/^zorlaşmaya ([\d.,]+) mint$/, (m) => `${m[1]} mints until harder`],
  [/^Dönem (\d+) · (\d+) bit$/, (m) => `Epoch ${m[1]} · ${m[2]} bits`],
  [/^(\d+) bit$/, (m) => `${m[1]} bits`],
  [/^([\d.,]+) (milyon|milyar)$/, (m) => `${m[1]} ${m[2] === 'milyon' ? 'million' : 'billion'}`],
  [/^(\d+) saat önce: (\d+) mint$/, (m) => `${m[1]} hours ago: ${m[2]} mints`],
  [/^Son 24 saatte saatlik mint sayısı, toplam (\d+)$/, (m) => `Mints per hour in the last 24 hours, ${m[1]} in total`],
  [/^İlk 10 cüzdan arzın %([\d.,]+)'i(?:ni|nı|nu|nü)? tutuyor\.$/, (m) => `The top 10 wallets hold ${m[1]}% of the supply.`],
  [/^withdraw\(\) ile kasaya(.*)$/, (m) => `to treasury via withdraw()${m[1]}`],
  [/^(.+) · Agent ID şartlı$/, (m) => `${m[1]} · Agent ID gated`],
  [/^Onayını bekliyor: (.+)$/, (m) => `Awaiting your approval: ${m[1]}`],
  [/^Ücretsiz mint: (.+)$/, (m) => `Free mint: ${m[1]}`],
  [/^Neredeyse ücretsiz mint: (.+)$/, (m) => `Nearly free mint: ${m[1]}`],
  [/^Bedava (~?\S+ \/ \S+)$/, (m) => `Free ${m[1]}`],
  [/^toplam (\S+ \/ \S+)$/, (m) => `total ${m[1]}`],
  [/^Ücretli token mint: (.+)$/, (m) => `Paid token mint: ${m[1]}`],
  [/^Agent ID mint \(henüz açık değil\): (.+)$/, (m) => `Agent ID mint (not open yet): ${m[1]}`],
  [/^Daha fazla göster \((\d+) kaldı\)$/, (m) => `Show more (${m[1]} left)`],
  [/^· (\d+) bekliyor$/, (m) => `· ${m[1]} waiting`],
  [/^\(bugün (\d+)\/(\d+)\)$/, (m) => `(today ${m[1]}/${m[2]})`],
  [/^Günlük otomatik mint sınırı doldu \((\d+)\)$/, (m) => `Daily auto-mint limit reached (${m[1]})`],
  [/^Taklit adı: "(.+)" bilinen bir markayı kullanıyor$/, (m) => `Impersonated name: "${m[1]}" uses a known brand`],
  [/^Simülasyon geçmedi: (.+)$/, (m) => `Simulation failed: ${m[1]}`],
  [/^Binance önizlemesi geçmedi: (.+)$/, (m) => `Binance preview failed: ${m[1]}`],
  [/^İşlem başı ([\d.,]+) BNB · bugün ([\d.,]+) \/ ([\d.,]+) BNB$/, (m) => `Per trade ${m[1]} BNB · today ${m[2]} / ${m[3]} BNB`],
  [/^işlem başı ([\d.,]+) BNB · günlük ([\d.,]+) BNB · gerçek işlem (açık|kapalı)$/, (m) => `per trade ${m[1]} BNB · daily ${m[2]} BNB · real trading ${m[3] === 'açık' ? 'on' : 'off'}`],
  [/^çalışıyor · son blok (\d+) · ([\d.,]+) blok, ([\d.,]+) yeni kontrat tarandı(?: \(([\d.,]+) fabrikadan\))? · ([\d.,]+) izleniyor(?: · ([\d.,]+) zamanlı)?$/,
    (m) => `running · last block ${m[1]} · ${m[2]} blocks, ${m[3]} new contracts scanned${m[4] ? ` (${m[4]} from factories)` : ''} · ${m[5]} watched${m[6] ? ` · ${m[6]} timed` : ''}`],
  [/^(\d+) sa (\d+) dk$/, (m) => `${m[1]}h ${m[2]}m`],
  [/^LLM araştırması kapalı: ücretsiz süzgeç \(OKX taramaları, site kodu, taklit adı\) · bugün (.+) · otomatik mint$/, (m) => `LLM research off: free filter (OKX scans, site code, impersonated names) · today ${m[1]} · auto mint`],
  [/^(\d+) koleksiyon, (\d+) NFT · toplam maliyet (.+)$/, (m) => `${m[1]} collections, ${m[2]} NFTs · total cost ${m[3]}`],
  [/^maliyet (.+)$/, (m) => `cost ${m[1]}`],
  [/^Yatırılan net (.+)$/, (m) => `Net deposited ${m[1]}`],
  [/^BNB şu an (.+)$/, (m) => `BNB now ${m[1]}`],
  [/^Bugün (.+) · net, dahil$/, (m) => `Today ${m[1]} · net, included`],
  [/^BNB (.+) · tokenler (.+)$/, (m) => `BNB ${m[1]} · tokens ${m[2]}`],
  [/^Gas (.+) · toplam (.+)$/, (m) => `Gas ${m[1]} · total ${m[2]}`],
  [/^(\d+) NFT · (\d+) token · (\d+) fiyatsız$/, (m) => `${m[1]} NFTs · ${m[2]} tokens · ${m[3]} unpriced`],
  [/^Kartlar ve grafik cüzdanın tamamını gösterir\. Otomatik mintlenen (\d+) varlık tablolarda değil, Agent bölümünde\.$/, (m) => `The cards and chart show the whole wallet. The ${m[1]} auto-minted assets are in the Agent section, not in these tables.`],
  [/^Binance ort\. (.+)$/, (m) => `Binance avg. ${m[1]}`],
  [/^(\d+) sa önce$/, (m) => `${m[1]} h ago`],
  [/^Sitesi ve sosyali doğrulanmamış \(site (.+), sosyal (.+)\)$/, (m) => `Site and socials unverified (site ${m[1]}, social ${m[2]})`],
  [/^Açık · bitiş (.+)$/, (m) => `On · expires ${m[1]}`],
  [/^Dolaşımda (\S+) · yakılan (\S+)$/, (m) => `Circulating ${m[1]} · burned ${m[2]}`],
  [/^İlk 10 cüzdan %(.+)$/, (m) => `Top 10 wallets ${m[1]}%`],
  [/^(\d+) havuz · en derini (V2|V3) (.+)$/, (m) => `${m[1]} pools · deepest ${m[2]} ${m[3]}`],
  [/^(\S+) alım · (\S+) satım$/, (m) => `${m[1]} buys · ${m[2]} sells`],
  [/^(\S+) BNB · 24s$/, (m) => `${m[1]} BNB · 24h`],
  [/^· (.+) · (\d+) mum · USD$/, (m) => `· ${m[1]} · ${m[2]} candles · USD`],
  [/^· Sniper (açık|kapalı) · Oto satış (açık|kapalı) · bugün (\d+)\/(\d+) token$/, (m) => `· Sniper ${m[1] === 'açık' ? 'on' : 'off'} · Auto sell ${m[2] === 'açık' ? 'on' : 'off'} · today ${m[3]}/${m[4]} tokens`],
];

function cevirMetin(t) {
  const sade = t.replace(/\s+/g, ' ').trim();
  if (!sade) return null;
  const s = SOZLUK.get(sade);
  if (s !== undefined) return DIL === 'zh' ? ZH.get(s) ?? s : s;
  for (const [i, [re, f]] of KALIPLAR.entries()) {
    const m = sade.match(re);
    if (m) return DIL === 'zh' && KALIP_ZH[i] ? KALIP_ZH[i](m) : f(m);
  }
  return null;
}

const OZNITELIK = ['placeholder', 'title', 'aria-label', 'alt'];
const cevrilen = new WeakMap(); // düğüm -> son yazdığımız değer: kendi yazdığımızı yeniden çevirmeyelim

function dugumCevir(n) {
  if (cevrilen.get(n) === n.nodeValue) return;
  const p = n.parentElement;
  if (!p || p.closest('script,style,code,[data-cevirme]')) return;
  const yeni = cevirMetin(n.nodeValue);
  if (yeni == null) return;
  const bas = n.nodeValue.match(/^\s*/)[0], son = n.nodeValue.match(/\s*$/)[0];
  n.nodeValue = bas + yeni + son;
  cevrilen.set(n, n.nodeValue);
}

function agacCevir(kok) {
  if (kok.nodeType === Node.TEXT_NODE) { dugumCevir(kok); return; }
  if (kok.nodeType !== Node.ELEMENT_NODE) return;
  const w = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) dugumCevir(w.currentNode);
  for (const e of [kok, ...kok.querySelectorAll('[placeholder],[title],[aria-label],[alt]')]) {
    for (const a of OZNITELIK) {
      const v = e.getAttribute?.(a);
      if (!v) continue;
      const yeni = cevirMetin(v);
      if (yeni != null && yeni !== v) e.setAttribute(a, yeni);
    }
  }
}

function seciciKur() {
  const yer = document.querySelector('.ust-sag');
  if (!yer || document.getElementById('dil-secici')) return;
  const g = document.createElement('div');
  g.id = 'dil-secici';
  g.className = 'dil-secici';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', DILLER[DIL][2]);
  g.setAttribute('data-cevirme', '');
  for (const [d, [ad]] of Object.entries(DILLER)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ad;
    b.setAttribute('aria-pressed', String(d === DIL));
    b.addEventListener('click', () => { if (d !== DIL) dilDegistir(d); });
    g.append(b);
  }
  yer.prepend(g);
}

seciciKur();
if (DIL !== 'tr') {
  document.documentElement.lang = DIL === 'zh' ? 'zh-CN' : 'en';
  agacCevir(document.body);
  let bekleyen = new Set();
  let planli = false;
  new MutationObserver((kayitlar) => {
    for (const k of kayitlar) {
      if (k.type === 'childList') k.addedNodes.forEach((n) => bekleyen.add(n));
      else bekleyen.add(k.target);
    }
    if (planli) return;
    planli = true;
    queueMicrotask(() => {
      planli = false;
      const liste = bekleyen;
      bekleyen = new Set();
      for (const n of liste) if (n.isConnected) agacCevir(n);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: OZNITELIK });
}
