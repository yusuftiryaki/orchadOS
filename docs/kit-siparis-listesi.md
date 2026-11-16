# Kit Sipariş Listesi

21 Ekim 2026 · Yusuf · son güncelleme 16 Kasım 2026 (ana parçalar alındı)

Bu liste, MVP'de kullanılacak tarama kitinin parça parça sipariş listesidir. Kitte 360° kamera, RTK GNSS alıcısı, LiDAR, kayıt bilgisayarı (Raspberry Pi 5) ve ESP32 GNSS kaydedici bulunur; motosiklete monte bir direkte taşınır. Kitin tasarımı [tarama-kiti.md](tarama-kiti.md)'de, kaydedicinin bağlantı tablosu [firmware/gnss-logger/README.md](../firmware/gnss-logger/README.md)'de anlatılıyor.

> **Karar (11 Kasım 2026, sahip): kit LiDAR'lı yapılır.** Liste ilk yazıldığında LiDAR'sız kiti anlatıyordu; LiDAR'lı kitin ek parçaları [bölüm 7](#7-lidarlı-kitin-ek-parçaları)'de. Montaj yüksekliği ve motosiklette deneme: [lidar-olcumleri.md](lidar-olcumleri.md) §8.

## Durum: alınanlar (16 Kasım 2026)

Hepsi yurt içinden alındı. Fiyatlar ilan fiyatıdır (KDV dahil); ödenen tutar farklı olabilir.

| # | Parça | Alınan | Adet | İlan fiyatı | Not |
| --- | --- | --- | --- | --- | --- |
| 1.1–1.3 | RTK alıcı, anten, anten kablosu | Radiolink RTK F9P Rover Kit (alıcı + ANT-M7 anten + kablo) | 1 | 24.753 TL | u-blox F9P, çift bant (L1/L2), USB-C, 2 UART, dahili pusula. PPS çıkışının yeri ve ham gözlem kaydı gelince doğrulanacak |
| 1.4 | 360° kamera | Insta360 X4 Air, Standard Bundle | 1 | 18.599 TL | 8K 30 fps, çift 1/1,8" sensör, kayıt başına tek `.insv` dosyası |
| 1.5 | Kamera microSD kartı | SanDisk High Endurance 256 GB (V30, UHS-I) | 1 | 3.184 TL | Tek ziyareti alır (aşağıdaki karar) |
| 7.1 | LiDAR | Unitree 4D LiDAR L2 | 1 | Kayıtlı değil | 360° × 90° (negatif açı kipinde 96°), saniyede 64.000 nokta, dahili IMU, 12 V |
| 7.4 | Kayıt SSD'si | Lexar SL300 512 GB (USB 3.2 Gen 2) | 1 | 3.999 TL | 15'ten fazla ziyaretin LiDAR kaydını alır |

**Karar (16 Kasım 2026, sahip): MVP kiti tek ziyareti taşır.** Tek kamera kartı ve tek SSD alındı; kart her ziyaretten sonra ofiste aktarılıp boşaltılır. Listede iki kart ve iki SSD öneren satırlar pilot sonrasına kaldı. Aynı gün iki bahçe taranacaksa ikinci bir kart gerekir.

**Kalanlar, kısaca:** baz verisi için ikinci alıcı ya da TUSAGA-Aktif (karar 2); Raspberry Pi 5 ve bağlantıları (bölüm 7); kaydedici elektroniği (bölüm 2); güç (bölüm 3); mekanik (bölüm 4). Gelen parçalarda ilk gün yapılacak denemeler [Doğrulanacaklar](#doğrulanacaklar)'da.

**Neden şimdi?** Kit, takvimin kritik yolunda ([plan.md](plan.md)). 20 Aralık'taki Kapı 1'e kadar teknik denemelerin yapılması gerekiyor (İP3). Ana parçalar yurt içinden alındığı için ithalat beklemesi kalmadı; kalan parçalar da yurt içinden bulunabilir.

> **Fiyatlar:** Alınmamış parçaların fiyatları yaklaşık uluslararası fiyatlardır ve doğrulanmadı. Türkiye'de KDV ve kur farkı belirgin bir artış yapabilir. Alınan parçaların ilan fiyatları yukarıdaki tabloda.

## Sipariş öncesi üç karar

| Karar | Seçenekler | Önerim ve sonuç |
| --- | --- | --- |
| **1. 360° kamera modeli** | Insta360 X serisi · Ricoh Theta X · GoPro Max 2 | **Karar verildi: Insta360 X4 Air alındı.** İlk öneri X5'ti; X4 Air aynı 8K çözünürlüğü verir, sensörü biraz küçüktür (1/1,8"). İşleme hattının `.insv` yolu tek dosyalı kayıtları destekler ve X4 Air tek dosya üretir; elimizdeki Linux Media SDK (3.1.5) X4 Air'i destekler. İki dosyalı X3 bu yüzden seçilmedi |
| **2. PPK için baz verisi** | TUSAGA-Aktif (CORS-TR) aboneliği · Kendi baz istasyonu (ikinci bir RTK alıcısı) | **Açık.** Tek alıcı alındı; baz verisi olmadan PPK yapılamaz. İlk öneri ikinci bir alıcıydı: pilotta referans sıra ölçümü için zaten gerekiyor ([MVP.md](MVP.md) Modül 2) ve TUSAGA başvurusu sonuçlanana kadar baz istasyonu olarak çalışır. Radiolink'te baz ve gezici aynı donanımdır, yalnız ayarı farklıdır; ikinci bir Rover Kit baz olarak kullanılabilir |
| **3. Akü sistemi** | Makita, Bosch, DeWalt 18 V | **Türkiye'de en kolay bulunanı.** Bataryalar ve şarj aleti sahada yedeklenebilmeli. Seçilen markanın "akü adaptörü" (akü yuvasından kablo çıkışı) bulunabilmeli |

## 1. Uzun teslim süreli parçalar (ilk hafta sipariş)

| # | Parça | Adet | Özellik | Nereden | Yaklaşık fiyat |
| --- | --- | --- | --- | --- | --- |
| 1.1 | **RTK alıcı kartı, ZED-F9P** | 2 | u-blox ZED-F9P; UART1 TX/RX ve TIMEPULSE (PPS) pinlerine erişim; SMA anten girişi | **1 adet alındı:** Radiolink RTK F9P. İkincisi karar 2'ye bağlı | 200–280 $ / adet |
| 1.2 | **Çok bantlı GNSS anteni** (L1/L2 ya da L1/L5) | 2 | Direk üstüne vidalı, IP67, yer düzlemi içinde (survey ya da helisel tip) | **1 adet alındı:** ANT-M7, Rover Kit'in içinde (IP67) | 70–200 $ / adet |
| 1.3 | Anten kablosu | 2 | SMA, 1–3 m, düşük kayıplı (RG174 yerine RG316 ya da daha iyisi) | **1 adet alındı:** Rover Kit'in içinde; boyu direğe yetiyor mu, gelince ölçülecek | 10–20 $ / adet |
| 1.4 | **360° kamera** | 1 | Karar 1'e göre; en az 5,7K, 30 fps; dış besleme ile kayıt yapabilmeli | **Alındı:** Insta360 X4 Air | 450–600 $ |
| 1.5 | Kamera microSD kartı | 2 | UHS-I, V30, exFAT, en çok 1 TB (Insta360'ın şartı; UHS-II kart kullanılmaz). 8K'da ziyaret başına ~108–132 GB | **1 adet alındı:** SanDisk High Endurance 256 GB. İkincisi pilot sonrasına | 40–60 $ / adet |
| 1.6 | Kamera yedek bataryası | 2 | Orijinal | Alınmadı. Kamera kayıt sırasında aküden beslenebiliyorsa gerekmez (3.4); beslenemiyorsa şart, çünkü tek batarya 8K'da ~88 dakika dayanır | 30–50 $ / adet |

**Radiolink RTK F9P hakkında bilinenler** (üreticinin sayfası ve kılavuzu; parça gelince doğrulanacak):
- Modül u-blox F9P; GPS L1C/A ve L2C, GLONASS, Galileo, BeiDou, QZSS. Protokoller NMEA, UBX ve RTCM 3.
- Besleme 4,5–6 V. Bağlantılar: USB-C, UART1 (I2C ile aynı fişte: 5 V, RX, TX, SCL, SDA, GND), UART2.
- Zaman darbesi (PPS) teknik özelliklerde var, ama hangi konnektörde olduğu belgelenmemiş. Kaydedici firmware'i de Pi'ın saati de PPS'e dayanıyor; konnektörde yoksa modülün TIMEPULSE ayağından tel çıkarmak gerekir.
- Dahili pusula (IST8310) I2C hattındadır; bizim kullanımımızda gerekmez.
- Alıcı drone uçuş kontrolcüleri için ayarlı gelir. PPK için ham gözlem mesajları (UBX-RXM-RAWX, SFRBX) u-center ile açılmalıdır; kaydedici firmware'i bunları açılışta kendisi de ister ([firmware/gnss-logger/README.md](../firmware/gnss-logger/README.md)).

**İkinci alıcının ve antenin görevleri:**
- **Baz istasyonu:** Envanter ve taramalarda bahçe kenarında sabit bir noktaya kurulur. Ham kaydını bir ikinci ESP32 kaydedici alır (bölüm 2'deki yedek setle).
- **Referans ölçüm:** Pilotta 2–3 referans sırada ağaç ağaç ölçüm yapılır. Bunun için bir jalona (bölüm 4) takılır.

## 2. Kaydedici elektroniği (yurt içi, hızlı)

Bağlantılar `firmware/gnss-logger/README.md`'deki tabloya göre. Her kalemden bir set kit için, bir set baz istasyonu için, bir set de yedek.

LiDAR'lı kitte tasarım GNSS kaydını Raspberry Pi'a veriyor ([tarama-kiti.md](tarama-kiti.md)). Pi'ın kayıt yazılımı henüz yok; saha uygulaması bugün ESP32 kaydediciyle (Bluetooth) çalışıyor. Bu yüzden Kapı 1 denemeleri ESP32 kaydediciyle yapılabilir ve bu bölüm geçerliliğini korur; baz istasyonu için de ayrıca gerekir.

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 2.1 | ESP32 geliştirme kartı | 3 | ESP32-WROOM-32, `esp32dev` uyumlu (DevKitC ya da benzeri), USB-UART çipli | 6–12 $ / adet |
| 2.2 | microSD kart modülü (SPI) | 3 | 3,3 V uyumlu | 2–4 $ / adet |
| 2.3 | microSD kart (kaydedici) | 3 | 32 GB, endüstriyel ya da "high endurance" | 10–15 $ / adet |
| 2.4 | DC-DC düşürücü, 18 V → 5 V | 3 | Giriş 24 V'a kadar, çıkış 5 V 2–3 A | 3–8 $ / adet |
| 2.5 | Dirençler | 1 paket | 220 kΩ ve 33 kΩ (batarya gerilim bölücü), LED için 330 Ω; %1 metal film | 2–5 $ |
| 2.6 | Durum LED'i | 1 paket | 5 mm, kasadan görünecek | 1–2 $ |
| 2.7 | Sigorta yuvası + 2 A sigorta, açma/kapama anahtarı | 3 | Akü girişine | 3–6 $ / set |
| 2.8 | Delikli plaket, pin header, JST konnektörler, ince kablo | 1 set | Lehimli montaj için | 10–20 $ |
| 2.9 | Su geçirmez elektronik kutusu | 2 | IP65, ~150 × 100 × 60 mm, kablo rakorlu | 10–20 $ / adet |
| 2.10 | Dış bağlantı konnektörü | 4 | GX12/GX16 havacılık tipi; akü ve anten çıkışı için | 3–5 $ / adet |

## 3. Güç

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 3.1 | 18 V alet aküsü | 3 | 5 Ah; karar 3'teki marka. İkisi kit, biri baz istasyonu | 50–90 $ / adet |
| 3.2 | Şarj aleti | 1 | Aynı marka, hızlı şarj | 40–70 $ |
| 3.3 | Akü adaptörü (akü yuvası → kablo) | 2 | Aynı marka; sigortalı tercih | 10–20 $ / adet |
| 3.4 | USB-C PD modülü (18 V giriş) | 1 | Kamerayı kayıt sırasında aküden beslemek için; kameranın şarj gücüne uygun (≥ 20 W). X4 Air'in kayıt sırasında beslenebildiği önce masada denenecek | 10–20 $ |

**Güç hesabı:** Kaydedici, alıcı ve kamera birlikte ~7 W çeker; iki saatlik tarama ~15 Wh eder. LiDAR (10 W), Raspberry Pi (7 W) ve SSD (3 W) eklenince toplam ~26 W, iki saatte ~52 Wh olur. 5 Ah'lık 18 V akü ~90 Wh taşıdığı için bir akü bir taramayı karşılar.

## 4. Mekanik: motosiklet montajı ve direk

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 4.1 | Direk | 1 | Alüminyum ya da karbon, Ø 25–30 mm. Kamera yerden ~2,0 m, anten ~2,1 m'de olacak boyda | 30–80 $ |
| 4.2 | Motosiklet arka bagaj montajı | 1 | Arka sepete ya da bagaj demirine cıvatalı, direği dik tutan kelepçeli plaka | 30–60 $ |
| 4.3 | Titreşim sönümleyici | 4 | Kauçuk takoz (M6/M8); montaj plakası ile direk arasına | 5–10 $ |
| 4.4 | Kamera bağlantısı | 1 | 1/4" vidalı, direğe kelepçeli; kameranın "görünmez çubuk" aksesuarı uyumlu | 15–30 $ |
| 4.5 | Anten bağlantısı | 1 | 5/8" anten vidası adaptörü, direk ucuna | 10–20 $ |
| 4.6 | Gergi/dengeleme halatı ve kelepçeler | 1 set | Direğin sallanmasını azaltmak için | 10–20 $ |
| 4.7 | Jalon (referans ölçüm ve baz için) | 1 | 2 m, su terazili, tripod ya da bipod ayaklı | 60–150 $ |

**Montaj notu:** Kamera ve anten aynı rijit direkte, aralarındaki dikey mesafe ölçülüp kalibrasyon dosyasına yazılır. Kaydedici kutusu direğin altına ya da motosikletin bagajına bağlanır; anten kablosu direk boyunca kelepçelenir.

## 5. Telefon ve diğer

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 5.1 | Android telefon (personelinki yoksa) | 1 | Android 12+, BLE 5, iyi bir arka kamera (yakın plan), güneşte okunur ekran | 200–350 $ |
| 5.2 | Telefon tutucu | 1 | Motosiklet gidonuna, titreşim sönümlü | 15–30 $ |
| 5.3 | Şerit metre (5 m) ve çelik metre | 1 | Kalibrasyon ve gövde çapı ölçümü | 10–20 $ |
| 5.4 | Lens temizleme kiti | 1 | Kamera lensleri için | 5–10 $ |

## 6. Robot soketi (kit tarafı; sadece kit robota takılacaksa)

Kit, `yusuftiryaki/hoverboard` robotuna bir soketle takılabilir. Sözleşme robot reposunda: [kit-soketi.md](https://github.com/yusuftiryaki/hoverboard/blob/main/docs/kit-soketi.md). Pin numaraları orada hâlâ başlangıç önerisi; donanım gelince robotun bağlantı haritasına işlenip multimetreyle doğrulanacak.

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 6.1 | **Kimlik çipi DS2431+** | 2 | TO-92 kılıf, fişin içine sığar. Bacaklar: veri → `KIT_ID` (pin 3), GND → pin 1. **Kit tarafına pull-up direnci konmaz**, pull-up robotta. Biri yedek | 2–4 $ / adet |
| 6.2 | Kendi beslemeli USB hub | 1 | F9P ve kamera robota bunun üzerinden bağlanır. Tek şart: upstream VBUS'a geri besleme yapmamalı. Sokette VBUS (pin 7) bağlanmaz, kit kendi aküsüyle çalışır | 15–30 $ |
| 6.3 | PPS seri direnci | 1 paket | F9P TIMEPULSE (3,3 V) hattına, F9P'ye yakın. 100, 220 ve 330 Ω; kesin değer robotla ilk denemede ölçülerek seçilecek. 2.5'teki paketle birlikte alınabilir | 1–2 $ |
| 6.4 | Fiş kablosu | 1 | En fazla 1 m; USB çifti bükümlü. `KIT_PRESENT`: fişin içinde pin 2 ile pin 1 (GND) arası tel köprü, ayrı parça yok | 5–10 $ |

**Konnektör bu listede yok.** M16, 12 pinli, IP67, vidalı kilitli dairesel konnektörün iki yarısı (robotta dişi soket, kitte erkek fiş) aynı üreticiden ve aynı seriden, mümkünse aynı siparişte alınacak; farklı markaların M16 parçaları pin düzeni ve kodlamada her zaman uyuşmuyor. Seçimi robot tarafı yapıp `kit-soketi.md`'ye yazacak. GX16 10 pinde kaldığı için yetmez.

**Kit tabanı:** Robotun montaj plakasında kitin tabanını tek yönde ve ortalanmış oturtan bir anahtar (pim ya da asimetrik delik deseni) olacak. Biçimi plaka ile birlikte kesinleşecek; kit tabanı tasarlanırken buna yer bırakılır.

## 7. LiDAR'lı kitin ek parçaları

Tasarım ve L2'nin teknik değerleri: [tarama-kiti.md](tarama-kiti.md#lidar-unitree-4d-lidar-l2).

| # | Parça | Adet | Özellik | Durum | Yaklaşık fiyat |
| --- | --- | --- | --- | --- | --- |
| 7.1 | **LiDAR** | 1 | Unitree 4D LiDAR L2. Kutusunda güç adaptörü, seri bağlantı modülü ve veri kablosu gelir | **Alındı** | Üretici liste fiyatı 419 $ |
| 7.2 | **Raspberry Pi 5, 8 GB** | 1 | Aktif soğutucu, saat pili (RTC), kutu | Alınacak | 120–150 $ |
| 7.3 | Pi sistem kartı (microSD) | 1 | 32–128 GB, "high endurance" ya da endüstriyel | Alınacak | 10–20 $ |
| 7.4 | **Kayıt SSD'si** (USB 3) | 1 | Lexar SL300 512 GB | **Alındı** | 3.999 TL |
| 7.5 | DC-DC düşürücü, 18 V → 12 V | 1 | Çıkış 12 V, en az 1,5 A; LiDAR için. Fiş DC 3,5 × 1,35 mm | Alınacak | 3–8 $ |
| 7.6 | DC-DC düşürücü, 18 V → 5 V, 5 A | 1 | Pi için. Pi 5, 5 A'lık kaynağı tanımazsa USB çıkış akımını kısar; SSD için `usb_max_current_enable=1` gerekebilir | Alınacak | 8–15 $ |
| 7.7 | Ethernet kablosu | 1 | Kısa (0,3–0,5 m), Cat5e; LiDAR'ın RJ45 ucu ile Pi arasına | Alınacak | 2–5 $ |
| 7.8 | USB-C veri kablosu | 1 | Kısa; RTK alıcısından Pi'a ham GNSS | Alınacak | 3–6 $ |
| 7.9 | PPS teli ve seviye koruması | 1 set | Alıcının PPS çıkışından Pi'ın GPIO'suna; 3,3 V seviyesi ölçülerek | Alınacak | 1–3 $ |
| 7.10 | LiDAR bağlantı plakası | 1 | 4 × M3 delik (derinlik 6 mm); direğe kelepçeli, titreşim sönümlü. LiDAR'ın dört yanında hava boşluğu kalmalı | Yapılacak | 10–20 $ |
| 7.11 | Kalibrasyon hedefi | 1 | Kamera–LiDAR kalibrasyonu için baskılı hedef | Yapılacak | 30–60 $ |

**SSD'nin bağlantısı:** USB-C fişi titreşimde gevşeyebilir; SSD kutunun içine sabitlenir ve kablo gerilimsiz bağlanır.

## Toplam

| Grup | Yaklaşık |
| --- | --- |
| 1. Uzun teslim süreli (2 alıcı, 2 anten, kamera, kartlar, yedek pil) | 1.150–1.800 $ |
| 2. Kaydedici elektroniği (3 set) | 120–220 $ |
| 3. Güç | 220–400 $ |
| 4. Mekanik | 160–370 $ |
| 5. Telefon ve diğer | 30–60 $ (telefon hariç) |
| **Toplam (telefon hariç)** | **~1.700–2.900 $** |
| 6. Robot soketi (isteğe bağlı, konnektör hariç) | 25–50 $ |

Kit tek başına, yani ikinci alıcı, anteni, baz kaydedicisi, üçüncü akü ve jalon olmadan, ~1.250–2.100 $ tutar. Bu, belirlenen 2.000 $ hedefinin içinde. Aradaki ~450–800 $, baz istasyonu ve pilot referans ölçümünün maliyeti.

Bu toplam ilk tahmindir: LiDAR'sız kit içindir ve uluslararası fiyatlara dayanır. LiDAR'lı kitin ek parçaları (bölüm 7) buna dahil değildir. Alınan beş parçadan fiyatı kayıtlı dördünün ilan fiyatları toplamı 50.535 TL'dir; LiDAR'ın fiyatı kayıtlı değil.

İşleme istasyonu (İP11) bu listede yok, ayrı bir karar.

## Sipariş sırası

1. **Yapıldı (16 Kasım):** kamera, kamera kartı, RTK alıcısı ve anteni, LiDAR, SSD. SDK başvurusu daha önce sonuçlandı.
2. **Şimdi:**
    - Baz verisi kararı (karar 2): ikinci alıcı ya da TUSAGA-Aktif başvurusu.
    - Raspberry Pi 5 ve bağlantıları (bölüm 7).
    - Elektronik (bölüm 2), güç (bölüm 3).
3. **Alıcılar gelmeden:**
    - Kaydediciyi geliştirme masasında kur ve firmware'i flaşla.
    - `firmware/gnss-logger/README.md`'deki donanım testlerinin GNSS gerektirmeyenlerini yap: SD, LED, BLE ve telefonla bağlantı.
4. **Alıcılar gelince:**
    - Masada, açık gökyüzünde ilk fix.
    - Yarım saatlik ham kayıt ve PPK denemesi (İP3).
5. **Mekanik:**
    - Motosiklete montaj ve kalibrasyon ölçümü.
    - Kit robota da takılacaksa: kit tabanına göre sensör konumlarının ölçümü ([tarama-kiti.md](tarama-kiti.md#robota-takılan-kit-için-ölçüm)) ve kimlik çipinin yazılması.
    - Kendi bahçende tek koridor taraması (Kapı 1 denemesi).

## Doğrulanacaklar

Parça parça ayrıntılı liste [tarama-kiti.md](tarama-kiti.md#doğrulanacaklar)'de. Parçalar gelince ilk gün:

- [ ] **Radiolink RTK F9P:** PPS çıkışının yeri; UART ve PPS pinlerinin 3,3 V seviyesi; u-center ile ham gözlem (RAWX, SFRBX) çıkışı; açık gökyüzünde ilk fix ve çift bant sinyali
- [ ] **Insta360 X4 Air:** kayıt sırasında USB-C'den beslenerek iki saat kesintisiz 8K kayıt ve ısınma; SanDisk 256 GB kartla kart hızı uyarısı çıkmaması; gerçek `.insv` dosyasının işleme hattından geçmesi ve jiroskop verisi
- [ ] **Unitree L2:** masada adaptörüyle ilk nokta bulutu; negatif açı kipinin açılması; sürücünün Raspberry Pi 5'te çalışması
- [ ] Motosiklet titreşiminin panorama netliğine ve LiDAR yörüngesine etkisi; gerekirse ek sönümleme ya da daha düşük hız
- [ ] Kalan parçaların güncel fiyatları
