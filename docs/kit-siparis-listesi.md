# Kit Sipariş Listesi: LiDAR'sız MVP Kiti

21 Ekim 2026 · Yusuf

Bu liste, MVP'de kullanılacak **LiDAR'sız** tarama kitinin parça parça sipariş listesidir. Kitte 360° kamera, RTK GNSS alıcısı ve ESP32 GNSS kaydedici bulunur; motosiklete monte bir direkte taşınır. Kitin tasarımı [tarama-kiti.md](tarama-kiti.md)'de, kaydedicinin bağlantı tablosu [firmware/gnss-logger/README.md](../firmware/gnss-logger/README.md)'de anlatılıyor.

**Neden şimdi?** Kit, takvimin kritik yolunda ([plan.md](plan.md)). 20 Aralık'taki Kapı 1'e kadar teknik denemelerin yapılması gerekiyor (İP3). Yurt dışından gelen parçalar 2–4 hafta sürebilir. Bu yüzden kitin Kasım ortasında elde olması gerekiyor.

> **Fiyatlar:** Yaklaşık uluslararası fiyatlardır ve doğrulanmadı. Türkiye'ye getirmede gümrük, KDV ve kur farkı belirgin bir artış yapabilir. Sipariş öncesi güncel fiyatı ve Türkiye distribütörünü kontrol et.

## Sipariş öncesi üç karar

| Karar | Seçenekler | Önerim |
| --- | --- | --- |
| **1. 360° kamera modeli** | Insta360 X serisi (X5) · Ricoh Theta X · GoPro Max 2 | **Insta360 X5**: görüntü kalitesi ağaç değerlendirmesi için önemli. SDK pilot için şart değil: pilotta videolar Insta360 Studio'dan elle birleştirilmiş (equirectangular) olarak dışa aktarılır, SDK (Linux Media SDK, başvuruyla) sonra otomasyon için. **Yedek:** Ricoh Theta X kamerada birleştirip equirectangular MP4 kaydeder, API'si açık belgeli; SDK gerekmez ama sensörü küçük |
| **2. PPK için baz verisi** | TUSAGA-Aktif (CORS-TR) aboneliği · Kendi baz istasyonu (ikinci bir RTK alıcısı) | **İkinci bir alıcı al.** Pilotta referans sıra ölçümü için zaten gerekiyor ([MVP.md](MVP.md) Modül 2). Aynı alıcı, TUSAGA başvurusu sonuçlanana kadar baz istasyonu olarak da çalışır |
| **3. Akü sistemi** | Makita, Bosch, DeWalt 18 V | **Türkiye'de en kolay bulunanı.** Bataryalar ve şarj aleti sahada yedeklenebilmeli. Seçilen markanın "akü adaptörü" (akü yuvasından kablo çıkışı) bulunabilmeli |

## 1. Uzun teslim süreli parçalar (ilk hafta sipariş)

| # | Parça | Adet | Özellik | Nereden | Yaklaşık fiyat |
| --- | --- | --- | --- | --- | --- |
| 1.1 | **RTK alıcı kartı, ZED-F9P** | 2 | u-blox ZED-F9P; UART1 TX/RX ve TIMEPULSE (PPS) pinlerine erişim; SMA anten girişi. Örnek: ArduSimple simpleRTK2B ya da SparkFun GPS-RTK2 | ArduSimple (İspanya), SparkFun ya da Türkiye distribütörü | 200–280 $ / adet |
| 1.2 | **Çok bantlı GNSS anteni** (L1/L2 ya da L1/L5) | 2 | Direk üstüne vidalı, IP67, yer düzlemi içinde (survey ya da helisel tip) | Alıcıyla aynı satıcı | 70–200 $ / adet |
| 1.3 | Anten kablosu | 2 | SMA, 1–3 m, düşük kayıplı (RG174 yerine RG316 ya da daha iyisi) | Alıcıyla aynı satıcı | 10–20 $ / adet |
| 1.4 | **360° kamera** | 1 | Karar 1'e göre; en az 5,7K, 30 fps; dış besleme ile kayıt yapabilmeli | Türkiye distribütörü | 450–600 $ |
| 1.5 | Kamera microSD kartı | 2 | 512 GB, V30, kameranın önerdiği listede olsun | Yurt içi | 40–60 $ / adet |
| 1.6 | Kamera yedek bataryası | 2 | Orijinal | Distribütör | 30–50 $ / adet |

**İkinci alıcının ve antenin görevleri:**
- **Baz istasyonu:** Envanter ve taramalarda bahçe kenarında sabit bir noktaya kurulur. Ham kaydını bir ikinci ESP32 kaydedici alır (bölüm 2'deki yedek setle).
- **Referans ölçüm:** Pilotta 2–3 referans sırada ağaç ağaç ölçüm yapılır. Bunun için bir jalona (bölüm 4) takılır.

## 2. Kaydedici elektroniği (yurt içi, hızlı)

Bağlantılar `firmware/gnss-logger/README.md`'deki tabloya göre. Her kalemden bir set kit için, bir set baz istasyonu için, bir set de yedek.

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
| 3.4 | USB-C PD modülü (18 V giriş) | 1 | Kamerayı kayıt sırasında aküden beslemek için; kameranın şarj gücüne uygun (≥ 20 W) | 10–20 $ |

**Güç hesabı:** Kaydedici, alıcı ve kamera birlikte ~7 W çeker; iki saatlik tarama ~15 Wh eder. 5 Ah'lık 18 V akü ~90 Wh taşıdığı için bir akü günlük işi rahatça karşılar.

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

## Toplam

| Grup | Yaklaşık |
| --- | --- |
| 1. Uzun teslim süreli (2 alıcı, 2 anten, kamera, kartlar, yedek pil) | 1.150–1.800 $ |
| 2. Kaydedici elektroniği (3 set) | 120–220 $ |
| 3. Güç | 220–400 $ |
| 4. Mekanik | 160–370 $ |
| 5. Telefon ve diğer | 30–60 $ (telefon hariç) |
| **Toplam (telefon hariç)** | **~1.700–2.900 $** |

Kit tek başına, yani ikinci alıcı, anteni, baz kaydedicisi, üçüncü akü ve jalon olmadan, ~1.250–2.100 $ tutar. Bu, belirlenen 2.000 $ hedefinin içinde. Aradaki ~450–800 $, baz istasyonu ve pilot referans ölçümünün maliyeti.

İşleme istasyonu (İP11) bu listede yok, ayrı bir karar.

## Sipariş sırası

1. **Bu hafta:**
    - Kamera modelini seç (karar 1), SDK başvurusunu yap.
    - RTK alıcıları ve antenler (1.1–1.3): en uzun teslim süresi bunlarda.
    - TUSAGA-Aktif başvurusu (karar 2'den bağımsız; sonuçlanınca baz istasyonu yedek olur).
2. **Bu hafta, yurt içi:**
    - Kamera, kartlar, yedek pil (1.4–1.6)
    - Elektronik (bölüm 2), güç (bölüm 3)
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

- [ ] Seçilen kameranın jiroskop verisini dışa aktarma ve SDK erişimi
- [ ] Kameranın dış beslemeyle iki saat kesintisiz kayıt yapabilmesi; ısınma
- [ ] ZED-F9P kartında UART1 ve TIMEPULSE pinlerinin 3,3 V seviyesi; bazı kartlar 5 V çıkış verir
- [ ] Motosiklet titreşiminin panorama netliğine etkisi; gerekirse ek sönümleme ya da daha düşük hız
- [ ] Güncel fiyatlar ve Türkiye'ye getirme maliyeti
