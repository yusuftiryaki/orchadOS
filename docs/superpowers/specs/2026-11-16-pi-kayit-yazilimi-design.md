# Kitte Raspberry Pi kayıt yazılımı: tasarım

16 Kasım 2026 · Yusuf (sahip) ile Claude · durum: taslak, sahip onayı bekliyor

## 1. Amaç ve gerekçe

LiDAR'lı kitte (karar 11 Kasım 2026) kayıt bilgisayarı Raspberry Pi 5'tir. Bugün yazılı ve testli olan kaydedici ise ESP32 ([firmware/gnss-logger/](../../../firmware/gnss-logger/)). Saha uygulaması ([apps/field/](../../../apps/field/)) onunla Bluetooth (BLE) üzerinden konuşur, işleme hattı da onun yazdığı `gnss/` klasörünü okur. Pi'da henüz hiçbir yazılım yok, işletim sistemi bile kurulu değil.

Sahip kararları (16 Kasım 2026):

- **Baz verisi TUSAGA-Aktif'ten gelir.** İkinci alıcı ve baz istasyonu kaydedicisi alınmaz.
- **ESP32 kitten çıkar.** Pi, ESP32'nin bütün işini üstlenir.
- **Kapı 1'de (20 Aralık) aynı taramada LiDAR da kaydedilmiş olmalı.** Yalnız GNSS kaydı yetmez.
- **En büyük korku, iki saatlik taramanın sonunda LiDAR kaydının eksik ya da boş çıkması.** Bu yüzden kaydın sağlığı sahadayken telefonda görünür olmalı.
- Teknik seçimler (işletim sistemi, ROS, dil) Claude'a bırakıldı. Aşağıda "Claude'un kararı" diye işaretlenenler bunlardır; sahip itiraz edebilir.

Tasarımın ana fikri: **Pi, saha uygulamasına ve işleme hattına ESP32 gibi görünür, buna LiDAR kaydını ekler.** Böylece hem saha uygulaması hem işleme hattı neredeyse hiç değişmez. Uygulama kitle hiç sahada kullanılmadı. İlk gerçek kullanımı bu yazılımla olacak.

## 2. Hedefler

1. Pi, telefonla ESP32'nin BLE protokolünü konuşur: aynı servis ve özellik UUID'leri, aynı komutlar ve sonuç kodları, aynı 51 baytlık durum mesajı. Bunun ardına yeni alanlar eklenir (§6).
2. Pi, oturum başına ESP32'nin yazdığı üç dosyayı aynı biçimde yazar: `gnss/gnss.ubx`, `gnss/events.csv` ve `gnss/session.json`. İşleme hattının bugünkü okuyucuları ve doğrulamaları bunları değişiklik olmadan kabul eder.
3. Aynı oturumda LiDAR'ın nokta bulutu ve IMU verisi ham olarak kaydedilir (MCAP, §5.3).
4. Pi'ın saati alıcının PPS sinyaliyle GPS zamanına kilitlenir. LiDAR mesajları bu saatle damgalanır.
5. **Kayıt sağlığı görünürdür** (§7):
   - Ön kontrol geçmeden oturum başlamaz. Personel LiDAR ve saat maddelerini açık bir onayla atlayabilir; atlanan madde kayda geçer (§7.1).
   - Kayıt sırasında telefon her saniye LiDAR, GNSS, saat ve SSD durumunu görür. Bir sorun çıkarsa telefon ses ve ekranla uyarır.
   - Durdurunca kısa bir özet gösterilir.
6. Kayıt bozulmaya dayanıklıdır. Güç kesilirse en fazla son birkaç dakikalık parça kaybolur. LiDAR ya da alıcı bir an kopup geri gelirse kayıt kendiliğinden sürer ve boşluk kayda geçer.
7. Pi'a ekran ve klavye bağlanmaz. Güç verilince açılır ve birkaç dakika içinde kayda hazırdır.
8. Boş bir Pi, tek bir kurulum betiğiyle sıfırdan hazırlanabilir. Yeni bir kit ya da bozulan bir kart böyle yeniden kurulur.
9. Testler donanım olmadan çalışır: sahte GNSS ve LiDAR akışı, sahte PPS, sahte BLE. Bu, repodaki diğer bileşenlerin uyduğu kuraldır.

## 3. Hedef dışı

- Pi'da SLAM, PPK ya da `cloud.ply` üretmek. Bunlar işleme istasyonunun işi (bkz. [arayuzler.md → Kayıtlı nokta bulutu](../../arayuzler.md#kayıtlı-nokta-bulutu)).
- Kameradan Pi'a video çekmek. Kamera kendi kartına yazar; kart ofiste ayrıca kopyalanır. [tarama-kiti.md](../../tarama-kiti.md)'deki "tek ortam seçeneği" şimdilik yapılmaz.
- Robota takılan kit: kimlik çipi (`services/kit-chip`) ve robot soketi.
- Pi'ın kendi Wi-Fi ağı ve web durum ekranı. [tarama-kiti.md](../../tarama-kiti.md)'deki bu fikrin yerini BLE ile telefondaki ekran alır.
- Kendi baz istasyonu. TUSAGA-Aktif RINEX'ini operasyon `base/` altına koyar; Pi'ı etkilemez.
- ESP32 firmware'ini silmek. Firmware repoda kalır (§9).
- Telefon cepteyken ya da ekran kapalıyken uyarmak (Android arka plan servisi, bildirim alarmı). Sahip kararı: tarama sırasında telefon motosiklet gidonundaki tutucuda durur, ekranı açıktır ve uygulama öndedir.
- Pi'da yerel uyarı (GPIO'dan buzzer ya da LED). Sahip kararı: tek arabirim telefon. Bluetooth koparsa uygulama bunu zaten kayıp bağlantı olarak gösterir.

## 4. Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Kaydın sahada sorunsuz görünüp ofiste LiDAR'ı eksik ya da boş çıkması.
- Saha uygulamasının ya da işleme hattının Pi için ayrı bir kipe, ayrı bir oturum biçimine ya da ayrı bir kod yoluna ihtiyaç duyması. Fark, eklenen durum alanları ve ekranlarla sınırlı kalmalı.
- Pi'ın saatinin GPS'e kilitlenmeden kayda başlayıp bunu sessizce geçmesi.

## 5. Yapı

### 5.1 Donanım bağlantıları (bilinenler)

| Bağlantı | Ne taşır | Not |
| --- | --- | --- |
| Radiolink RTK F9P → Pi, USB-C | Ham UBX (RAWX, SFRBX, NAV-PVT), alıcı yapılandırması | ESP32'de UART'tı; Pi'da USB CDC-ACM seri port |
| F9P TIMEPULSE → Pi GPIO, tel ve seri direnç | PPS | Konnektörde olup olmadığı, seviyesi (3,3 V beklenir) parça gelince ölçülecek ([kit-siparis-listesi.md](../../kit-siparis-listesi.md) Doğrulanacaklar) |
| Unitree L2 → Pi, Ethernet | Nokta bulutu ve IMU (UDP) | L2'nin PTP ya da PPS girişi yok; damga Pi'a varış anıdır |
| Lexar SL300 SSD → Pi, USB 3 | Bütün oturum kayıtları | Pi 5'in USB akım sınırı: `usb_max_current_enable=1` gerekebilir |
| Pi dahili Bluetooth | Telefonla BLE | |

### 5.2 Yazılım bileşenleri (Claude'un kararı)

- **İşletim sistemi:** Ubuntu Server 24.04 LTS, arm64, masaüstü yok.
- **LiDAR sürücüsü:** Unitree `unilidar_sdk2` ve onun ROS 2 sürücüsü, ROS 2 Jazzy üzerinde. Unitree yalnız Ubuntu 20.04 ve Foxy'yi doğrulamış, bu yüzden **ilk iş sürücünün Pi 5'te Jazzy ile derlenip çalışmasını denemektir.** Derlenmezse yedek yol: ROS kullanmadan SDK'dan doğrudan MCAP yazan küçük bir C++ programı. Kayıt biçimi (§5.3) iki yolda da aynı kalır.
- **Kayıt servisi:** Yeni bir bileşen, `services/kit-recorder/`, Python ile ve `uv` ile yönetilir (repodaki diğer Python servisleri gibi). Bir systemd servisi olarak çalışır ve şunları yapar:
  - BLE GATT sunucusu (BlueZ, D-Bus üzerinden)
  - Alıcının seri portunun tek sahibidir: alıcıyı yapılandırır, UBX akışını okur, `gnss.ubx`'e yazar, NAV-PVT'yi çözer
  - PPS durumu ve saat kilidi
  - Oturum yönetimi: başlat, durdur, olaylar, `events.csv`, `gnss/session.json`
  - LiDAR kaydının (ROS 2 bag ya da yedek program) başlatılıp durdurulması ve izlenmesi
  - SSD izleme, ön kontrol, durum mesajı
- **Saat:** chrony, PPS referansını (`/dev/pps0`, `pps-gpio` overlay) birincil kaynak alır. Saniyenin hangi saniye olduğu bilgisi kayıt servisinin alıcıdan çözdüğü zamandan gelir (chrony SOCK ya da SHM). **gpsd kullanılmaz,** çünkü seri portu kayıt servisiyle paylaşamaz (Claude'un kararı). Kurucu bunu doğrulayıp eşdeğer bir düzen seçebilir, yeter ki seri portun tek sahibi kayıt servisi olsun.
- **Sistem dayanıklılığı:** Kök dosya sistemi ani güç kesintisine dayanıklı kurulur (ör. journald hacmi sınırlı, kayıtlar yalnız SSD'ye yazılır). SSD, `sync` ya da `flush` seçenekleriyle değil, kayıt servisinin kendi `fsync` aralığıyla korunur (§5.4).

### 5.3 SSD'de oturum klasörü

```
/sessions/<session_id>/
  gnss/
    gnss.ubx          ESP32'deki biçim (ham UBX baytları)
    events.csv        ESP32'deki biçim (altı sütun)
    session.json      ESP32'deki biçim; farkları §5.5'te
  lidar/
    raw/
      <session_id>_<n>.mcap   LiDAR nokta + IMU, ayrıca ham GNSS (UBX); birkaç dakikalık parçalar
      metadata.yaml           (ROS 2 bag kullanılırsa)
    recording.json    kayıt özeti: parçalar, nokta sayıları, boşluklar, uyarılar (§7.3)
```

- **İşleme istasyonuna kopyalama:** Operasyon `/sessions/<session_id>/` klasörünü olduğu gibi oturum klasörünün köküne kopyalar. Bugün ESP32 kartının klasörü `gnss/` altına kopyalanıyor. Pi'da `gnss/` zaten içeride olduğundan kopya doğrudan köke gider, dosyalar yeniden adlandırılmaz. Bu değişiklik [arayuzler.md](../../arayuzler.md) "Oturum klasörü" bölümüne yazılır. `services/ingest`'in `push` komutu SSD'yi kart gibi kabul etmelidir.
- **MCAP konuları (topic):** LiDAR sürücüsünün nokta bulutu ve IMU konuları, ayrıca ham UBX baytları. Konu adları ve mesaj türleri kurucunun kararı, ama `recording.json`'a ve [arayuzler.md](../../arayuzler.md)'ye yazılır. Ham UBX'in hem `gnss.ubx`'te hem MCAP'te bulunması bilinçli bir seçim: hat `gnss.ubx`'i okur, ileride SLAM adımı tek dosyadan çalışabilir.
- **Parçalama:** Kayıt birkaç dakikalık parçalara bölünür (ör. ROS 2 bag'de `--max-bag-duration`). Parça uzunluğu kurucunun kararı, öneri 2–5 dakika.
- **Boyut:** L2 için iki saatlik bir taramada ~10 GB beklenir, henüz ölçülmedi. 512 GB'lık SSD bunu rahatça alır.

### 5.4 Dayanıklılık

- `gnss.ubx` ve `events.csv` düzenli aralıklarla (ör. saniyede bir) `fsync` edilir. Güç kesilirse son saniyeler dışında hepsi diskte kalır.
- `gnss/session.json` oturum başında `stop: null` ile yazılır. Bu ESP32'deki davranışla aynı: güç kesilen oturum bitişsiz görünür.
- LiDAR ya da alıcı koparsa (kablo, güç dalgalanması) kayıt servisi yeniden bağlanmayı dener, oturumu kapatmaz. Kopuşun başı ve sonu `events.csv`'ye ve `recording.json`'a yazılır.
- Pi yeniden açılırsa, kapanmamış bir oturum bulduğunda onu `stop_reason: power_loss` ile kapatır. Kendiliğinden yeni kayıt başlatmaz.
- Bir kopuş ya da SSD hatası kaydı durdurmaz, uyarı olarak bildirilir. Yalnız SSD dolarsa ya da hiç yazılamazsa kayıt durur. Bu da ESP32'deki `sd_full` ve `sd_error` davranışıyla aynı.

### 5.5 ESP32 biçimlerinden farklar

Sözleşmeyi bozmamak için sütun ve alan adları **değişmez.** Yalnız anlamları Pi'a göre okunur:

- `events.csv` `esp_micros`: kaydedicinin monotonik saati, µs (`CLOCK_MONOTONIC`). Çapa sütunları (`pps_esp_micros`, `pps_gps_time_ns`): son PPS kenarının monotonik zamanı ve GPS zamanı. Pi'ın saati kilitliyken `gps_time_ns` her zaman dolu yazılır; çapa yine de yazılır, böylece hattın türetme kuralı (60 sn) aynen çalışır.
- Yeni olay türleri ([arayuzler.md](../../arayuzler.md)'ye eklenir): `lidar_lost` ve `lidar_regained`, `gnss_lost` ve `gnss_regained` (alıcının USB'si koparsa), `clock_unlocked`, `ssd_error`. Payload'lar kurucunun kararı, ama belgelenir. Hat bilmediği olay türlerini ve `stop: null`'u bugün reddetmiyor, uyarı olarak listeliyor (`services/pipeline/src/orchados_pipeline/ingest.py`). Bu yüzden hatta değişiklik gerekmez.
- `gnss/session.json`: `firmware_version` alanına kayıt servisinin sürümü yazılır. `recorder` diye yeni bir alan eklenir: `"kit-recorder"` ya da `"esp32"`. ESP32 bu alanı yazmadığı için hat yokluğunu `esp32` kabul eder. `receiver.port` USB aygıt yolu olur. `stop_reason` için `power_loss` ve `ssd_error` eklenir. Alan eklemek sözleşmeyi bozmuyorsa `format_version` 1 kalır.
- Olay `session_stop` payload'ı: `command`, `sd_full` (SSD için de bu ad kullanılır), `sd_error` ya da `power_loss`.

## 6. BLE protokolü (Pi tarafı)

- **Değişmeyenler:** Aynı servis ve özellik UUID'leri, aynı komutlar (`start_session`, `stop_session`, `mark_event`) ve bayt düzenleri, aynı sonuç kodları, MTU önerisi (247). Kaynak: [firmware/gnss-logger/README.md → BLE protokolü](../../../firmware/gnss-logger/README.md#ble-protokolü).
- **Cihaz adı** `orchados-gnss-XXXX` kalır, çünkü saha uygulaması taramada bu öneki arıyor ([ble_gnss_logger.dart:75](../../../apps/field/lib/features/gnss/ble_gnss_logger.dart#L75)). Böylece uygulama Pi'ı değişiklik olmadan bulur (Claude'un kararı).
- **Durum mesajının ilk 51 baytı** ESP32'deki gibi doldurulur:
  - SD alanları SSD'yi anlatır (`sd_free_mib` SSD'nin boş alanı).
  - `battery_mv`: Pi akü gerilimini ölçemediği için `0` gönderilir. Uygulamanın ön kontrolü bugün 16,5 V'un altında taramayı engelliyor ([gnss_health.dart](../../../apps/field/lib/features/gnss/gnss_health.dart)). Bu yüzden uygulama, kaydedici Pi ise akü kontrolünü atlayacak şekilde değiştirilir (§8).
  - `fw_*`: kayıt servisinin sürümü.
- **Yeni alanlar, 51. bayttan sonra:** Protokol kuralı "aynı sürümde yalnız sona alan eklenir" olduğundan `version` 1 kalır. Eski uygulama yeni alanları yok sayar. Önerilen içerik, kesin ofset ve türleri kurucu belirleyip [arayuzler.md](../../arayuzler.md)'ye yazar:
  - Kaydedici türü (ESP32 mi, Pi mi)
  - LiDAR durumu: yok, veri geliyor, kopuk
  - Son birkaç saniyenin LiDAR nokta hızı (nokta/sn) ve IMU hızı
  - Bu oturumdaki LiDAR boşluk sayısı ve en uzun boşluk (sn)
  - LiDAR kaydına yazılan toplam bayt
  - Saat kilidi: chrony'nin PPS'e kilitli olup olmadığı ve tahmini hata
  - Uyarı bayrakları: ön kontrolün hangi maddesi geçmedi
- **Ön kontrol ve atlama:**
  - Ön kontrol durum mesajından okunur.
  - `start_session`, ön kontrol geçmemişse yeni bir sonuç koduyla reddedilir. Hangi maddenin geçmediği durumda zaten görünür.
  - Atlama için `start_session`'ın sonuna isteğe bağlı bir "atlanan maddeler" baytı (bit maskesi) eklenir. Yalnız LiDAR ve saat maddeleri atlanabilir; SSD atlanamaz (§7.1).
  - Eski 7+ baytlık biçim aynen geçerli kalır. Uygulama bu baytı yalnız Pi'a gönderir, çünkü ESP32 fazla baytı `malformed` sayar. Kaydedici türü durumdan bilinir.
  - Yeni sonuç kodları ve maske bitleri [arayuzler.md](../../arayuzler.md)'ye eklenir.

## 7. Kayıt sağlığı

### 7.1 Ön kontrol (oturum başlamadan)

Oturum ancak şu koşullarla başlar:

| Madde | Geçme koşulu (eşikler kurucunun kararı, belgelenir) |
| --- | --- |
| LiDAR | Son birkaç saniyede nokta ve IMU geliyor; nokta hızı beklenenin (~64.000 nokta/sn) makul bir oranının üstünde |
| LiDAR kipi | Negatif açı kipi açık. Kapalı gelir ([tarama-kiti.md](../../tarama-kiti.md)); kayıt servisi her açılışta ve oturum başında açar. SDK kipi geri okuyabiliyorsa doğrular, okuyamıyorsa bu belgelenir (Claude'un kararı). Kapalı kalırsa gövdenin alt kısmı hiç kaydedilmez, kayıt da sağlıklı görünür |
| Alıcı | Ham UBX geliyor, yapılandırma `ok` |
| PPS ve saat | PPS kilitli, chrony'nin PPS'e kilitli hatası eşik altında |
| SSD | Takılı ve yazılabilir (deneme yazısı yapılır), boş alan iki saatlik kayda yetiyor |

Fix durumu ön kontrol değildir. Açık gökyüzü bulunmayan bir yerde başlatılabilir. Bu bugünkü ESP32 davranışıyla aynı.

**Atlama (sahip kararı):** LiDAR, LiDAR kipi ve saat maddeleri geçmezse personel taramayı telefonda açık bir onayla yine de başlatabilir. SSD maddesi atlanamaz, çünkü SSD olmadan hiçbir şey kaydedilmez. Gerekçe: arızalı bir LiDAR ya da henüz bağlanamamış bir PPS teli, envanter ve sınır yürüyüşü dahil bütün ziyaretleri durdurmamalı. Panorama ve GNSS yine değerli.

- Atlanan maddeler sessiz geçmez (anti-hedef 3):
  - `gnss/session.json`'a `precheck_overrides` alanıyla yazılır.
  - `events.csv`'ye `session_start`'tan hemen sonra bir `precheck_override` olayıyla yazılır. `session_start` payload'ı değişmez, çünkü hat onu parsel kimliği olarak doğruluyor.
  - Kayıt ekranında, kayıt boyunca görünür kalır.
- **Saat kilitli değilken:** `events.csv`'de `gps_time_ns` ve çapa sütunları boş kalır, ESP32'nin PPS'siz davranışı gibi. Hat bunu bugün de karşılıyor. Pi'ın sistem saati alıcının USB'den gelen zamanına kaba olarak ayarlıdır (onlarca ms), MCAP damgaları bu saattendir. Bu, `recording.json`'a ve `session.json`'a saat durumu olarak yazılır (Claude'un kararı).

### 7.2 Kayıt sırasında

- Durum her saniye telefona gider.
- Telefon şu durumlarda **sesli ve görünür** uyarır:
  - LiDAR birkaç saniyedir veri göndermiyor ya da nokta hızı düştü
  - LiDAR kaydına yazılan bayt artmıyor
  - Alıcı koptu
  - Saat kilidi kayboldu
  - SSD hatası ya da yer azaldı
- Uyarı, sorun sürdükçe ekranda kalır. Sorun düzelince kendiliğinden kalkar, ama özette görünür.

### 7.3 Durdurunca

- Kayıt servisi `lidar/raw/recording.json`'u yazar: süre, parça listesi, toplam nokta ve IMU mesajı, boşluklar, uyarılar.
- Telefonda kısa bir özet çıkar: süre, LiDAR verisi (var/yok, boşluk sayısı), GNSS baytları, uyarılar. Özet durum mesajındaki sayılardan üretilir. Telefon dosya okumaz.

## 8. Saha uygulamasında değişiklik

Değişiklik küçük tutulur. Uygulama ESP32 ile de çalışmaya devam eder.

- Durum çözücüsü ([gnss_status.dart](../../../apps/field/lib/features/gnss/protocol/gnss_status.dart)) 51 bayttan uzun mesajdaki yeni alanları okur. Kısa mesajda alanlar "yok" sayılır: kaydedici ESP32'dir, LiDAR satırı gösterilmez.
- Ön kontrol ekranına LiDAR, saat ve SSD satırları eklenir. Geçmeyen madde açıkça yazılır. Atlanabilir bir madde geçmezse personel onu açık bir onayla atlayabilir (§7.1).
- Kayıt sırasında ekran açık tutulur. Telefon gidonda durduğu için arka plan servisi gerekmez (§3).
- Ön kontrolün akü maddesi (16,5 V) kaydedici Pi ise atlanır. Akü gerilimi Pi'da ölçülmüyor (§6).
- Kayıt ekranına LiDAR satırı (nokta hızı, boşluk) ve §7.2'deki uyarılar eklenir. Uygulamada uyarı sesi altyapısı yok (`core/audio`'da yalnız ses kaydı var), bu yüzden yeniden yazılır.
- Durdurma özetine LiDAR satırı eklenir.
- Sahte kaydedici (`fake_gnss_logger.dart`) yeni alanları da üretir. Böylece ekranlar telefonda kaydedici olmadan denenebilir.

## 9. Belgeler ve sipariş listesi

Kurallara göre sözleşme önce [arayuzler.md](../../arayuzler.md)'de değişir, sonra kod.

- **[arayuzler.md](../../arayuzler.md):** oturum klasörü (Pi kaydı ve `lidar/raw/`), yeni olay türleri, `gnss/session.json` farkları, BLE durumundaki yeni alanlar ve sonuç kodları.
- **[firmware/gnss-logger/README.md](../../../firmware/gnss-logger/README.md):** BLE protokolünün kaynağı olarak kalır. Başına bir not eklenir: kitte artık Pi kullanılıyor, Pi aynı protokolü konuşuyor, uzatmalar arayuzler.md'de. Firmware silinmez.
- **[tarama-kiti.md](../../tarama-kiti.md):** Pi'ın Wi-Fi ağı ve web ekranı yerine BLE ve telefon; gpsd yerine kayıt servisi ve chrony; TUSAGA kararı.
- **[kit-siparis-listesi.md](../../kit-siparis-listesi.md):**
  - Karar 2 "TUSAGA-Aktif" olarak kapanır.
  - Çıkanlar: ESP32 kaydedici elektroniği (bölüm 2), ikinci alıcı ve anten (1.1–1.3'ün ikinci adedi), üçüncü akü, jalon.
  - Pi 5 ve sistem kartı "elde var" diye işaretlenir.
  - Toplam güncellenir.
- **[MVP.md](../../MVP.md):** "GNSS kaydedici: ESP32 + microSD" satırı güncellenir.
- **[plan.md](../../plan.md):** İP2'nin tanımı "ESP32 kaydedici" yerine "Pi kayıt yazılımı" olur; ilerleme tablosu ve kalan işler güncellenir.
- **[CLAUDE.md](../../../CLAUDE.md):** "Komutlar" bölümüne `services/kit-recorder/` komutları eklenir: test, Pi'da kurulum, servis yönetimi.

## 10. Testler ve doğrulama

- **Donanımsız testler (CI):**
  - UBX ayrıştırma ve alıcı yapılandırma mesajları. ESP32 firmware'inin test vektörleri yeniden kullanılabilir.
  - `events.csv` ve `session.json` biçimi, işleme hattının okuyucusuyla birlikte. Pi'ın yazdığı bir oturum hattın `ingest` doğrulamasından geçmeli.
  - BLE durum mesajının bayt düzeni, ESP32 README'deki örnek mesajla birlikte.
  - Komutlar ve sonuç kodları.
  - Ön kontrol ve uyarı mantığı, sahte LiDAR, GNSS, PPS ve SSD durumlarıyla.
  - Güç kesintisinden sonra oturum kapatma.
- **Uçtan uca sahte zincir:** Kayıt servisi sahte kaynaklarla bir oturum yazar. `orchados-pipeline` bu oturumun `gnss/` kısmını bugünkü gibi işler.
- **Donanımda ilk gün** (parçalar gelince; listesi [kit-siparis-listesi.md](../../kit-siparis-listesi.md) Doğrulanacaklar'da):
  - L2 sürücüsü Pi 5'te Jazzy ile çalışıyor mu?
  - PPS geliyor mu, chrony kilitleniyor mu?
  - İki saatlik kayıtta veri kaybı var mı, SSD'nin USB akımı yetiyor mu?
  - Telefon Pi'ı buluyor mu, ön kontrol ve uyarılar çalışıyor mu?
  - Kablo çekip geri takınca kayıt sürüyor mu?
  - Güç kesilince en fazla bir parça kayboluyor mu?

## 11. Kurulum

- **Tek betik** (`services/kit-recorder/` altında; yeri ve adı kurucunun kararı) boş bir Ubuntu Server 24.04'ü hazırlar:
  - ROS 2 Jazzy ve L2 sürücüsü
  - chrony ve PPS overlay
  - BlueZ ayarları
  - Kayıt servisi ve systemd birimleri
  - SSD bağlama kuralı: otomatik, etiketle bağlanır
  - Pi 5 USB akım ayarı
  - Gereksiz servislerin kapatılması
- Betik tekrar çalıştırılabilir olmalı, yani ikinci çalıştırmada bir şeyi bozmamalı.
- Gizli bilgi gerekmez. Pi internete bağlanmaz; kurulum sırasında internet gerekir.
- Adım adım işletim (kart yazma, ilk açılış, servis günlükleri) `services/kit-recorder/README.md`'ye yazılır.

## 12. Sıra ve Kapı 1

Donanımın (Pi, L2, F9P ve PPS teli, SSD, DC-DC düşürücüler) ne zaman masada birleşeceği belli değil. Bu yüzden iş, donanımsız ilerleyebilecek şekilde sıralanır (Claude'un kararı):

1. **Sözleşme:** [arayuzler.md](../../arayuzler.md) güncellenir.
2. **Donanımsız kısımlar:** Sahte kaynaklarla ve testlerle yazılır.
   - Kayıt servisinin çekirdeği: UBX okuma ve yapılandırma, oturum dosyaları, BLE protokolü, ön kontrol ve uyarı mantığı, dayanıklılık.
   - Saha uygulaması değişiklikleri, sahte kaydediciyle.
   - Kurulum betiği.
3. **Pi masaya gelince** (diğer parçalar gelmeden):
   - Kurulum betiği gerçek Pi'da denenir.
   - BLE gerçek telefonla denenir.
   - L2 sürücüsünün Jazzy'de derlenmesi denenir. L2 olmadan da derleme denenebilir.
4. **Parçalar gelince:** §10'daki donanım denemeleri.

**Kapı 1 için olmazsa olmazlar:**
- LiDAR ve GNSS'in aynı oturumda kaydı
- ESP32 ile aynı BLE protokolü ve dosyalar
- Ön kontrol ve atlama
- Kayıt sırasındaki uyarılar
- Kurulum betiği

**Kapı 1'den sonraya kalabilecekler:**
- Durdurma özetinin ayrıntıları
- Kurulum betiğinin tekrar çalıştırılabilirliğinin cilası
- Belgelerin son geçişi. Sözleşme belgesi ([arayuzler.md](../../arayuzler.md)) bunun dışında, o en başta güncellenir.

## 13. Kurucuya bırakılanlar

- §6'daki yeni durum alanlarının kesin ofset ve türleri, yeni sonuç kodları ve olay payload'ları. Hepsi [arayuzler.md](../../arayuzler.md)'ye yazılır.
- Ön kontrol ve uyarı eşikleri. Belgelenir; gerçek donanımda ayarlanır.
- MCAP konu adları, parça uzunluğu, `fsync` aralığı.
- Python'da BLE kütüphanesi seçimi (BlueZ D-Bus üzerinden).
- chrony'ye saniye bilgisinin nasıl verileceği (SOCK ya da SHM).
- L2 sürücüsü Jazzy'de derlenmezse yedek C++ kaydedicinin ayrıntıları.

## 14. Açık noktalar ve riskler

- **L2 sürücüsü ve Jazzy uyumu:** Doğrulanmadı. En büyük teknik risk ve ilk denenecek şey.
- **Radiolink'te PPS'in yeri:** Konnektörde değilse modüle tel lehimlenecek. Bu sağlanana kadar saat maddesi onayla atlanarak çalışılır (§7.1).
- **Akü gerilimi:** Pi bugünkü tasarımda aküyü ölçemiyor. Ölçmek gerekirse bir ADC eklenir; şimdilik hedef dışı.
- **Donanım tarihi:** Belli değil. İş sırası buna göre kuruldu (§12).
