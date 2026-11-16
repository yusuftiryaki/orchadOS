# Kit Sipariş Listesi

21 Ekim 2026 · Yusuf · son güncelleme 16 Kasım 2026 (ana parçalar alındı; baz verisi TUSAGA-Aktif'ten; ESP32 kitten çıktı)

Bu liste, MVP'de kullanılacak tarama kitinin parça parça sipariş listesidir. Kitte 360° kamera, RTK GNSS alıcısı, LiDAR ve kayıt bilgisayarı (Raspberry Pi 5) bulunur; motosiklete monte bir direkte taşınır. Kitin tasarımı [tarama-kiti.md](tarama-kiti.md)'de anlatılıyor. Pi'daki kayıt yazılımı `services/kit-recorder/`'da ([tasarım](superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md)); telefonla ve işleme hattıyla sözleşmesi [arayuzler.md](arayuzler.md#kit-kaydedicisi-raspberry-pi)'de.

> **Karar (16 Kasım 2026, sahip): ESP32 kaydedici kitten çıktı.** GNSS kaydını, PPS'i ve telefonla Bluetooth bağlantısını Pi üstlendi. Kayıt yazılımı ESP32'nin protokolünü ve dosyalarını aynen kullanır, buna LiDAR kaydını ekler. ESP32 firmware'i ([firmware/gnss-logger/](../firmware/gnss-logger/)) repoda referans olarak duruyor.

> **Karar (11 Kasım 2026, sahip): kit LiDAR'lı yapılır.** Liste ilk yazıldığında LiDAR'sız kiti anlatıyordu; LiDAR'lı kitin ek parçaları [bölüm 7](#7-lidarlı-kitin-ek-parçaları)'de. Montaj yüksekliği ve motosiklette deneme: [lidar-olcumleri.md](lidar-olcumleri.md) §8.

## Durum: alınanlar (16 Kasım 2026)

Hepsi yurt içinden alındı. Fiyatlar sipariş tutarlarıdır (KDV dahil); toplam **77.805 TL**.

| # | Parça | Alınan | Adet | Ödenen | Not |
| --- | --- | --- | --- | --- | --- |
| 1.1–1.3 | RTK alıcı, anten, anten kablosu | Radiolink RTK F9P Rover Kit (alıcı + ANT-M7 anten + kablo) | 1 | 24.753,04 TL | u-blox F9P, çift bant (L1/L2), USB-C, 2 UART, dahili pusula. PPS çıkışının yeri ve ham gözlem kaydı gelince doğrulanacak |
| 1.4 | 360° kamera | Insta360 X4 Air, Standard Bundle | 1 | 18.599 TL | 8K 30 fps, çift 1/1,8" sensör, kayıt başına tek `.insv` dosyası |
| 1.5 | Kamera microSD kartı | SanDisk High Endurance 256 GB (V30, UHS-I) | 1 | 3.184 TL | Tek ziyareti alır (aşağıdaki karar) |
| 7.1 | LiDAR | Unitree 4D LiDAR L2 | 1 | 27.270 TL | 360° × 90° (negatif açı kipinde 96°), saniyede 64.000 nokta, dahili IMU, 12 V |
| 7.4 | Kayıt SSD'si | Lexar SL300 512 GB (USB 3.2 Gen 2) | 1 | 3.999 TL | 15'ten fazla ziyaretin LiDAR kaydını alır |

**Elde var:** Raspberry Pi 5 8 GB (aktif soğutucu, saat pili, kutu) ve sistem kartı (microSD). Bu kit için alınmadı; yukarıdaki toplamda yok.

**Karar (16 Kasım 2026, sahip): MVP kiti tek ziyareti taşır.** Tek kamera kartı ve tek SSD alındı; kart her ziyaretten sonra ofiste aktarılıp boşaltılır. Listede iki kart ve iki SSD öneren satırlar pilot sonrasına kaldı. Aynı gün iki bahçe taranacaksa ikinci bir kart gerekir.

**Kalanlar, kısaca:**
- TUSAGA-Aktif abonelik başvurusu (karar 2). Parça değil, ama PPK denemesi buna bağlı.
- Güç (bölüm 3): iki akü, şarj aleti, iki akü adaptörü, kamera için USB-C PD modülü.
- Pi'ın bağlantıları (bölüm 7): iki DC-DC düşürücü, Ethernet ve USB-C kabloları, PPS teli, su geçirmez kutu, sigorta ve anahtar, konnektörler.
- Mekanik (bölüm 4): direk, motosiklet montajı, kamera ve anten bağlantıları; ayrıca LiDAR plakası (7.10) ve kalibrasyon hedefi (7.11).
- Telefon tutucu, şerit metre, lens temizleme kiti (bölüm 5).
- Gerekirse kamera yedek bataryası (1.6).

Yaklaşık tutar [Toplam](#toplam)'da. Gelen parçalarda ilk gün yapılacak denemeler [Doğrulanacaklar](#doğrulanacaklar)'da.

**Neden şimdi?** Kit, takvimin kritik yolunda ([plan.md](plan.md)). 20 Aralık'taki Kapı 1'e kadar teknik denemelerin yapılması gerekiyor (İP3). Ana parçalar yurt içinden alındığı için ithalat beklemesi kalmadı; kalan parçalar da yurt içinden bulunabilir.

> **Fiyatlar:** Alınmamış parçaların fiyatları yaklaşık uluslararası fiyatlardır ve doğrulanmadı. Türkiye'de KDV ve kur farkı belirgin bir artış yapabilir. Alınan parçaların sipariş tutarları yukarıdaki tabloda.

## Sipariş öncesi üç karar

| Karar | Seçenekler | Önerim ve sonuç |
| --- | --- | --- |
| **1. 360° kamera modeli** | Insta360 X serisi · Ricoh Theta X · GoPro Max 2 | **Karar verildi: Insta360 X4 Air alındı.** İlk öneri X5'ti; X4 Air aynı 8K çözünürlüğü verir, sensörü biraz küçüktür (1/1,8"). İşleme hattının `.insv` yolu tek dosyalı kayıtları destekler ve X4 Air tek dosya üretir; elimizdeki Linux Media SDK (3.1.5) X4 Air'i destekler. İki dosyalı X3 bu yüzden seçilmedi |
| **2. PPK için baz verisi** | TUSAGA-Aktif (CORS-TR) aboneliği · Kendi baz istasyonu (ikinci bir RTK alıcısı) | **Karar verildi (16 Kasım 2026, sahip): TUSAGA-Aktif.** İkinci alıcı ve baz kaydedicisi alınmaz. Operasyon TUSAGA'nın RINEX dosyalarını oturumun `base/` klasörüne koyar ([arayuzler.md](arayuzler.md#oturum-klasörü)). Abonelik başvurusu yapılacak; hesap açılana kadar PPK denenemez |
| **3. Akü sistemi** | Makita, Bosch, DeWalt 18 V | **Türkiye'de en kolay bulunanı.** Bataryalar ve şarj aleti sahada yedeklenebilmeli. Seçilen markanın "akü adaptörü" (akü yuvasından kablo çıkışı) bulunabilmeli |

## 1. Uzun teslim süreli parçalar (ilk hafta sipariş)

| # | Parça | Adet | Özellik | Nereden | Yaklaşık fiyat |
| --- | --- | --- | --- | --- | --- |
| 1.1 | **RTK alıcı kartı, ZED-F9P** | 1 | u-blox ZED-F9P; ham GNSS için USB, TIMEPULSE (PPS) çıkışına erişim; SMA anten girişi | **Alındı:** Radiolink RTK F9P. İkinci alıcı alınmaz (karar 2) | 200–280 $ |
| 1.2 | **Çok bantlı GNSS anteni** (L1/L2 ya da L1/L5) | 1 | Direk üstüne vidalı, IP67, yer düzlemi içinde (survey ya da helisel tip) | **Alındı:** ANT-M7, Rover Kit'in içinde (IP67) | 70–200 $ |
| 1.3 | Anten kablosu | 1 | SMA, 1–3 m, düşük kayıplı (RG174 yerine RG316 ya da daha iyisi) | **Alındı:** Rover Kit'in içinde; boyu direğe yetiyor mu, gelince ölçülecek | 10–20 $ |
| 1.4 | **360° kamera** | 1 | Karar 1'e göre; en az 5,7K, 30 fps; dış besleme ile kayıt yapabilmeli | **Alındı:** Insta360 X4 Air | 450–600 $ |
| 1.5 | Kamera microSD kartı | 2 | UHS-I, V30, exFAT, en çok 1 TB (Insta360'ın şartı; UHS-II kart kullanılmaz). 8K'da ziyaret başına ~108–132 GB | **1 adet alındı:** SanDisk High Endurance 256 GB. İkincisi pilot sonrasına | 40–60 $ / adet |
| 1.6 | Kamera yedek bataryası | 2 | Orijinal | Alınmadı. Kamera kayıt sırasında aküden beslenebiliyorsa gerekmez (3.4); beslenemiyorsa şart, çünkü tek batarya 8K'da ~88 dakika dayanır | 30–50 $ / adet |

**Radiolink RTK F9P hakkında bilinenler** (üreticinin sayfası ve kılavuzu; parça gelince doğrulanacak):
- Modül u-blox F9P; GPS L1C/A ve L2C, GLONASS, Galileo, BeiDou, QZSS. Protokoller NMEA, UBX ve RTCM 3.
- Besleme 4,5–6 V. Bağlantılar: USB-C, UART1 (I2C ile aynı fişte: 5 V, RX, TX, SCL, SDA, GND), UART2.
- Zaman darbesi (PPS) teknik özelliklerde var, ama hangi konnektörde olduğu belgelenmemiş. Pi'ın saati PPS'e dayanıyor; konnektörde yoksa modülün TIMEPULSE ayağından tel çıkarmak gerekir. O sağlanana kadar personel ön kontrolün saat maddesini açık bir onayla atlayarak tarar ([arayuzler.md](arayuzler.md#ön-kontrol-ve-atlama)).
- Dahili pusula (IST8310) I2C hattındadır; bizim kullanımımızda gerekmez.
- Alıcı drone uçuş kontrolcüleri için ayarlı gelir. PPK için ham gözlem mesajları (UBX-RXM-RAWX, SFRBX) gerekir; Pi'daki kayıt yazılımı bunları açılışta USB'den kendisi açar. u-center ile elle de açılabilir.

**Baz verisi ve referans ölçüm:** Karar 2 ile ikinci alıcı alınmadı; baz verisi TUSAGA-Aktif'ten gelir. Pilotta referans sıra ölçümü ([MVP.md](MVP.md) Modül 2) ikinci alıcıyı ve bir jalonu varsayıyordu; jalon da listeden çıktı (bölüm 4). Referans ölçümün nasıl yapılacağı açık.

## 2. Kaydedici elektroniği (kitten çıktı)

ESP32 kaydedici kitten çıktı; işini Pi yapıyor ([tasarım](superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md)). Firmware repoda referans olarak duruyor. Bu bölümdeki kalemlerden kit için hâlâ gerekenler (su geçirmez kutu, sigorta ve anahtar, dış konnektörler, kablo malzemesi) [bölüm 7](#7-lidarlı-kitin-ek-parçaları)'ye taşındı.

## 3. Güç

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 3.1 | 18 V alet aküsü | 2 | 5 Ah; karar 3'teki marka. İkisi kit: biri taramayı karşılar, biri yedek | 50–90 $ / adet |
| 3.2 | Şarj aleti | 1 | Aynı marka, hızlı şarj | 40–70 $ |
| 3.3 | Akü adaptörü (akü yuvası → kablo) | 2 | Aynı marka; sigortalı tercih | 10–20 $ / adet |
| 3.4 | USB-C PD modülü (18 V giriş) | 1 | Kamerayı kayıt sırasında aküden beslemek için; kameranın şarj gücüne uygun (≥ 20 W). X4 Air'in kayıt sırasında beslenebildiği önce masada denenecek | 10–20 $ |

**Güç hesabı:** LiDAR (10 W), Raspberry Pi (7 W), SSD (3 W), alıcı (1 W) ve kamera (5 W) birlikte ~26 W çeker; iki saatlik tarama ~52 Wh eder ([tarama-kiti.md](tarama-kiti.md#depolama-ve-güç-hesabı)). 5 Ah'lık 18 V akü ~90 Wh taşıdığı için bir akü bir taramayı karşılar, ikincisi yedektir. Pi akü gerilimini ölçmez; akünün dolu olduğu kit açılmadan kontrol edilir.

## 4. Mekanik: motosiklet montajı ve direk

| # | Parça | Adet | Özellik | Yaklaşık fiyat |
| --- | --- | --- | --- | --- |
| 4.1 | Direk | 1 | Alüminyum ya da karbon, Ø 25–30 mm. Kamera yerden ~2,0 m, anten ~2,1 m'de olacak boyda | 30–80 $ |
| 4.2 | Motosiklet arka bagaj montajı | 1 | Arka sepete ya da bagaj demirine cıvatalı, direği dik tutan kelepçeli plaka | 30–60 $ |
| 4.3 | Titreşim sönümleyici | 4 | Kauçuk takoz (M6/M8); montaj plakası ile direk arasına | 5–10 $ |
| 4.4 | Kamera bağlantısı | 1 | 1/4" vidalı, direğe kelepçeli; kameranın "görünmez çubuk" aksesuarı uyumlu | 15–30 $ |
| 4.5 | Anten bağlantısı | 1 | 5/8" anten vidası adaptörü, direk ucuna | 10–20 $ |
| 4.6 | Gergi/dengeleme halatı ve kelepçeler | 1 set | Direğin sallanmasını azaltmak için | 10–20 $ |

Jalon (eski 4.7) çıktı: baz istasyonu kurulmuyor (karar 2).

**Montaj notu:** Kamera ve anten aynı rijit direkte, aralarındaki dikey mesafe ölçülüp kalibrasyon dosyasına yazılır. Elektronik kutusu (Pi, DC-DC düşürücüler, SSD) direğin altına ya da motosikletin bagajına bağlanır; anten kablosu direk boyunca kelepçelenir.

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
| 6.3 | PPS seri direnci | 1 paket | F9P TIMEPULSE (3,3 V) hattına, F9P'ye yakın. 100, 220 ve 330 Ω; kesin değer robotla ilk denemede ölçülerek seçilecek. 7.9'daki dirençlerle birlikte alınabilir | 1–2 $ |
| 6.4 | Fiş kablosu | 1 | En fazla 1 m; USB çifti bükümlü. `KIT_PRESENT`: fişin içinde pin 2 ile pin 1 (GND) arası tel köprü, ayrı parça yok | 5–10 $ |

**Konnektör bu listede yok.** M16, 12 pinli, IP67, vidalı kilitli dairesel konnektörün iki yarısı (robotta dişi soket, kitte erkek fiş) aynı üreticiden ve aynı seriden, mümkünse aynı siparişte alınacak; farklı markaların M16 parçaları pin düzeni ve kodlamada her zaman uyuşmuyor. Seçimi robot tarafı yapıp `kit-soketi.md`'ye yazacak. GX16 10 pinde kaldığı için yetmez.

**Kit tabanı:** Robotun montaj plakasında kitin tabanını tek yönde ve ortalanmış oturtan bir anahtar (pim ya da asimetrik delik deseni) olacak. Biçimi plaka ile birlikte kesinleşecek; kit tabanı tasarlanırken buna yer bırakılır.

## 7. LiDAR'lı kitin ek parçaları

Tasarım ve L2'nin teknik değerleri: [tarama-kiti.md](tarama-kiti.md#lidar-unitree-4d-lidar-l2).

| # | Parça | Adet | Özellik | Durum | Yaklaşık fiyat |
| --- | --- | --- | --- | --- | --- |
| 7.1 | **LiDAR** | 1 | Unitree 4D LiDAR L2. Kutusunda güç adaptörü, seri bağlantı modülü ve veri kablosu gelir | **Alındı** | 27.270 TL |
| 7.2 | **Raspberry Pi 5, 8 GB** | 1 | Aktif soğutucu, saat pili (RTC), kutu | **Elde var** | — |
| 7.3 | Pi sistem kartı (microSD) | 1 | 32–128 GB, "high endurance" ya da endüstriyel | **Elde var** | — |
| 7.4 | **Kayıt SSD'si** (USB 3) | 1 | Lexar SL300 512 GB | **Alındı** | 3.999 TL |
| 7.5 | DC-DC düşürücü, 18 V → 12 V | 1 | Çıkış 12 V, en az 1,5 A; LiDAR için. Fiş DC 3,5 × 1,35 mm | Alınacak | 3–8 $ |
| 7.6 | DC-DC düşürücü, 18 V → 5 V, 5 A | 1 | Pi için. Pi 5, 5 A'lık kaynağı tanımazsa USB çıkış akımını kısar; SSD için `usb_max_current_enable=1` gerekebilir | Alınacak | 8–15 $ |
| 7.7 | Ethernet kablosu | 1 | Kısa (0,3–0,5 m), Cat5e; LiDAR'ın RJ45 ucu ile Pi arasına | Alınacak | 2–5 $ |
| 7.8 | USB-C veri kablosu | 1 | Kısa; RTK alıcısından Pi'a ham GNSS | Alınacak | 3–6 $ |
| 7.9 | PPS teli ve seviye koruması | 1 set | Alıcının zaman darbesi (PPS) çıkışından Pi'ın GPIO18'ine (pin 12) tel; 3,3 V ise seri 100–330 Ω direnç, 5 V ise gerilim bölücü. Seviye multimetreyle ölçülür | Alınacak | 1–3 $ |
| 7.10 | LiDAR bağlantı plakası | 1 | 4 × M3 delik (derinlik 6 mm); direğe kelepçeli, titreşim sönümlü. LiDAR'ın dört yanında hava boşluğu kalmalı | Yapılacak | 10–20 $ |
| 7.11 | Kalibrasyon hedefi | 1 | Kamera–LiDAR kalibrasyonu için baskılı hedef | Yapılacak | 30–60 $ |
| 7.12 | Su geçirmez elektronik kutusu | 1 | IP65, kablo rakorlu; Pi, iki DC-DC düşürücü ve SSD sığmalı. Pi'ın soğutucusu için hava payı | Alınacak | 10–20 $ |
| 7.13 | Sigorta yuvası, sigorta ve açma/kapama anahtarı | 1 set | Akü girişine. Kit 18 V'ta ~1,5 A çeker; sigorta buna göre seçilir | Alınacak | 3–6 $ |
| 7.14 | Dış bağlantı konnektörü | 4 | GX12/GX16 havacılık tipi; akü, LiDAR ve anten çıkışı için | Alınacak | 3–5 $ / adet |
| 7.15 | Kablo ve küçük malzeme | 1 set | İnce kablo, JST konnektörler, makaron, kablo bağı | Alınacak | 5–15 $ |

**SSD'nin bağlantısı:** USB-C fişi titreşimde gevşeyebilir; SSD kutunun içine sabitlenir ve kablo gerilimsiz bağlanır.

## Toplam

**Alınanlar:** beş parça, **77.805 TL** (KDV dahil; [Durum](#durum-alınanlar-16-kasım-2026)). Raspberry Pi 5 ve sistem kartı elde var, toplama girmez.

**Kalanlar** (yaklaşık uluslararası fiyatlar, doğrulanmadı):

| Grup | Yaklaşık |
| --- | --- |
| 3. Güç (2 akü, şarj aleti, 2 adaptör, USB-C PD) | 170–310 $ |
| 4. Mekanik (4.1–4.6) | 100–220 $ |
| 5. Telefon ve diğer | 30–60 $ (telefon hariç) |
| 7. LiDAR'lı kitin kalanları (7.5–7.15: DC-DC'ler, kablolar, PPS teli, kutu, sigorta, konnektörler, LiDAR plakası, kalibrasyon hedefi) | 90–180 $ |
| **Kalanların toplamı (telefon hariç)** | **~390–770 $** |
| 1.6 Kamera yedek bataryası (yalnız kamera aküden beslenemezse) | 60–100 $ |
| 6. Robot soketi (isteğe bağlı, konnektör hariç) | 25–50 $ |

TL ile dolar tutarları kalanların güncel fiyatları alınmadan toplanmaz. Türkiye'de KDV ve kur farkı kalanların tutarını belirgin artırabilir. TUSAGA-Aktif aboneliği bu listede yok.

İlk tahmin (21 Ekim 2026; LiDAR'sız kit, iki alıcı, ESP32 kaydedici, baz istasyonu ve jalonla) ~1.700–2.900 $'dı; kit tek başına ~1.250–2.100 $ ile 2.000 $ hedefinin içindeydi. LiDAR'lı kitin ilk tahmini ~2.400–3.200 $ ([tarama-kiti.md](tarama-kiti.md#maliyet)).

İşleme istasyonu (İP11) bu listede yok, ayrı bir karar.

## Sipariş sırası

1. **Yapıldı (16 Kasım):** kamera, kamera kartı, RTK alıcısı ve anteni, LiDAR, SSD. Raspberry Pi 5 ve sistem kartı zaten elde. Baz verisi kararı verildi: TUSAGA-Aktif (karar 2). SDK başvurusu daha önce sonuçlandı.
2. **Şimdi:**
    - TUSAGA-Aktif abonelik başvurusu.
    - Akü markası (karar 3) ve güç (bölüm 3).
    - Pi'ın bağlantıları (bölüm 7): DC-DC düşürücüler, Ethernet ve USB-C kabloları, PPS teli, kutu, sigorta ve konnektörler.
    - Mekanik (bölüm 4) ve telefon tutucu (5.2).
3. **Masada, güç ve mekanik gelmeden** (sıra ve ayrıntı `services/kit-recorder/README.md`'de):
    - Pi'a Ubuntu Server 24.04 ve kayıt yazılımını kur; telefonun Pi'ı Bluetooth ile bulduğunu ve ön kontrolü dene.
    - L2 sürücüsünün Pi 5'te ROS 2 Jazzy ile çalışmasını dene. Kayıt yazılımının en büyük teknik riski bu.
    - Alıcıyı USB'den bağla, PPS telini çek; ham kayıt, PPS ve saat kilidi.
    - Açık gökyüzünde ilk fix; iki saatlik masa kaydı.
4. **TUSAGA hesabı açılınca:** yarım saatlik ham kayıt ve PPK denemesi (İP3).
5. **Mekanik:**
    - Motosiklete montaj ve kalibrasyon ölçümü.
    - Kit robota da takılacaksa: kit tabanına göre sensör konumlarının ölçümü ([tarama-kiti.md](tarama-kiti.md#robota-takılan-kit-için-ölçüm)) ve kimlik çipinin yazılması.
    - Kendi bahçende tek koridor taraması (Kapı 1 denemesi). LiDAR ve GNSS aynı oturumda kaydedilmiş olmalı; yalnız GNSS kaydı Kapı 1'e yetmez.

## Doğrulanacaklar

Parça parça ayrıntılı liste [tarama-kiti.md](tarama-kiti.md#doğrulanacaklar)'de. Parçalar gelince ilk gün:

- [ ] **Radiolink RTK F9P:** PPS çıkışının yeri ve seviyesi (3,3 V bekleniyor); USB'den ham gözlem (RAWX, SFRBX) çıkışı; açık gökyüzünde ilk fix ve çift bant sinyali
- [ ] **Raspberry Pi 5:** kayıt yazılımının kurulumu; telefonun Pi'ı bulması, ön kontrol ve uyarılar; PPS ile chrony'nin kilitlenmesi; iki saatlik kayıtta veri kaybı olmaması ve SSD'ye USB akımının yetmesi; kablo çekip takınca kaydın sürmesi
- [ ] **Insta360 X4 Air:** kayıt sırasında USB-C'den beslenerek iki saat kesintisiz 8K kayıt ve ısınma; SanDisk 256 GB kartla kart hızı uyarısı çıkmaması; gerçek `.insv` dosyasının işleme hattından geçmesi ve jiroskop verisi
- [ ] **Unitree L2:** masada adaptörüyle ilk nokta bulutu; negatif açı kipinin açılması; sürücünün Raspberry Pi 5'te çalışması
- [ ] Motosiklet titreşiminin panorama netliğine ve LiDAR yörüngesine etkisi; gerekirse ek sönümleme ya da daha düşük hız
- [ ] Kalan parçaların güncel fiyatları
