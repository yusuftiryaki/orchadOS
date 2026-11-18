# Bileşenler Arası Arayüzler

Bu belge saha uygulaması (İP6), GNSS kaydedici (İP2: ESP32 ya da kitteki Raspberry Pi kayıt servisi), 360° kamera, operasyon ve işleme hattı (İP4) arasındaki sözleşmelerin **tek kaynağıdır**. Bir biçim değişecekse önce burası güncellenir, sonra bileşenler.

Bit düzeyindeki ayrıntıların kaynağı ilgili bileşenin README'sidir; bu belge onlara atıf yapar, çakışma olursa bileşen README'si geçerlidir ve bu belge düzeltilir:

- ESP32 dosya biçimleri ve BLE protokolü: [firmware/gnss-logger/README.md](../firmware/gnss-logger/README.md)
- Kit kaydedicisi (Raspberry Pi): [services/kit-recorder/README.md](../services/kit-recorder/README.md); ESP32'den farkları bu belgenin [Kit kaydedicisi](#kit-kaydedicisi-raspberry-pi) bölümünde
- İşleme hattının aşamaları ve çıktıları: [services/pipeline/README.md](../services/pipeline/README.md)

"**Karar**" diye işaretlenen maddeler, bileşenler ayrı yazılırken açık kalmış ve entegrasyonda karara bağlanmış noktalardır.

## Zaman

- Bileşenler arasında taşınan tüm zamanlar **GPS zamanıdır: GPS dönemi başlangıcından (1980-01-06 00:00:00) bu yana tam sayı nanosaniye, artık saniye yok.** Alan adları `gps_time_ns` ile biter.
- UTC yalnızca insanların okuması için yazılır (`utc` alanları, ISO 8601, `Z` ekli). GPS − UTC = 18 s (2017'den beri); ESP32 bu değeri `gnss/session.json`'da `gps_utc_leap_seconds` olarak yazar.
- QR kodunda zaman milisaniye çözünürlüğündedir (`gps_time_ms`), yine GPS zamanı.
- ESP32 olaylarında `esp_micros` kartın açılıştan beri mikrosaniyesidir; tek başına anlamı yoktur, PPS çapası ile GPS zamanına çevrilir (aşağıda). Kit kaydedicisinde aynı sütun Pi'ın monotonik saatidir (`CLOCK_MONOTONIC`, µs); anlamı ve çevrimi aynıdır.

## Oturum klasörü

Bir tarama oturumu işleme istasyonuna tek bir klasör olarak gelir. Klasör adı serbesttir; kimlik `session.json`'dan okunur.

```
<oturum>/
  session.json        saha uygulaması + operasyon
  gnss/
    gnss.ubx          kaydedici (ESP32: SD karttaki /sessions/<session_id>/ klasöründen; Pi: SSD'den)
    events.csv        kaydedici
    session.json      kaydedici
  lidar/raw/          kit kaydedicisi (Pi), LiDAR'lı kit
    bag/*.mcap        LiDAR nokta + IMU ve ham UBX (ros2 bag, birkaç dakikalık parçalar)
    bag/metadata.yaml ros2 bag'in üst bilgisi
    recording.json    kayıt özeti (aşağıda)
  video/*.mp4|*.insv  kamera: equirectangular MP4 ya da kameranın ham .insv kaydı
  base/*              operasyon (opsiyonel; baz/CORS RINEX)
  trees.json          operasyon (opsiyonel; normalde veritabanından okunur)
```

| Yol | Üreten | Ne zaman | Zorunlu |
| --- | --- | --- | --- |
| `session.json` | Saha uygulaması yazar, operasyon tamamlar | Oturum başlatılırken; operasyon işlemeden önce eksik alanları doldurur | Evet |
| `gnss/gnss.ubx`, `gnss/events.csv`, `gnss/session.json` | GNSS kaydedici (ESP32 ya da kit kaydedicisi) | Kayıt sırasında karta ya da SSD'ye. ESP32: operasyon kartın `/sessions/<session_id>/` klasörünü olduğu gibi `gnss/` altına kopyalar. Pi: SSD'deki `/sessions/<session_id>/` klasörü `gnss/` ve `lidar/` alt klasörleriyle yazılır ve olduğu gibi oturum **köküne** kopyalanır (`orchados-ingest push`, düzen `kit-ssd`) | Evet |
| `lidar/raw/bag/*.mcap`, `lidar/raw/bag/metadata.yaml`, `lidar/raw/recording.json` | Kit kaydedicisi (Pi) | Kayıt sırasında SSD'ye; yukarıdaki kopyayla gelir | Hayır (LiDAR'lı kitte beklenir) |
| `video/*.mp4` ya da `video/*.insv` | 360° kamera → operasyon | MP4: kameranın masaüstü yazılımıyla equirectangular (2:1) dışa aktarılır. `.insv`: kameranın kartındaki ham kayıt olduğu gibi kopyalanır; işleme hattı sadece seçilen kareleri Insta360 Media SDK ile birleştirir (SDK işleme makinesinde kurulu olmalı, `ORCHADOS_INSTA360_SDK`). Tek dosyalı kayıtlar (X4, X4 Air, X5) desteklenir; iki dosyalı eski kayıtlar (X3 ve öncesi) henüz değil. Kitin kamerası Insta360 X4 Air ([kit-siparis-listesi.md](kit-siparis-listesi.md)). Birden çok parça dosya adı sırasıyla ardışık kabul edilir | Evet |
| `base/*` | Operasyon | CORS ya da kendi baz istasyonundan RINEX gözlem + navigasyon | Hayır (yoksa PPK yok) |
| `trees.json` | Operasyon | Ağaç konumları; `run --trees-from-db` ile gerekmez (aşağıda) | Hayır |

**Karar:** ESP32'nin `session.json`'u adını korur ve `gnss/` altında durur; kökteki `session.json` başka bir dosyadır. Operasyon SD karttaki klasörü yeniden adlandırmadan kopyalar; dosyalar değiştirilmez (içerik hash'leri yakalama kimliğidir).

## `gnss/events.csv`

Kaynak: [firmware/gnss-logger/README.md → `events.csv`](../firmware/gnss-logger/README.md#eventscsv). UTF-8, RFC 4180, başlık satırı zorunlu:

```
esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns
```

| Sütun | Anlamı |
| --- | --- |
| `esp_micros` | Olayın ESP32 açılıştan beri mikrosaniyesi; kit kaydedicisinde Pi'ın monotonik saati (µs). Ad uyum için değişmez |
| `gps_time_ns` | Olayın GPS zamanı (ns). PPS eşlemesi yoksa ya da olay çapadan 2 sn'den uzaksa boş |
| `event_type` | `session_start`, `session_stop`, `corner`, `qr_sync`, `pps_lost`, `pps_regained`, `sd_error` |
| `payload` | Olaya göre metin; virgül ya da tırnak içerirse tırnaklanır |
| `pps_esp_micros`, `pps_gps_time_ns` | Satır yazılırken geçerli PPS çapası (son PPS kenarının `esp_micros`'u ve GPS zamanı); çapa yoksa ikisi de boş |

| Olay | `payload` |
| --- | --- |
| `session_start` | `parcel_id=<parsel>` |
| `session_stop` | `command`, `sd_full` ya da `sd_error` |
| `corner` | Telefondan gelen metin (köşe numarası) |
| `qr_sync` | Telefonun o anda gösterdiği QR'ın **metninin tamamı** (aşağıda) |
| `pps_lost`, `pps_regained` | Boş |
| `sd_error` | `gnss_write`, `events_write` ya da `sd_full`; kit kaydedicisinde ayrıca `lidar_write` |
| `lidar_lost`, `lidar_regained` | Boş. Yalnız kit kaydedicisi: LiDAR verisi 3 sn kesildi / geri geldi |
| `gnss_lost`, `gnss_regained` | Boş. Yalnız kit kaydedicisi: alıcıdan 3 sn veri gelmedi (USB koptu) / geri geldi |
| `precheck_override` | Yalnız kit kaydedicisi, `session_start`'tan hemen sonra: atlanan ön kontrol maddeleri `;` ile (ör. `lidar;clock`) |

Kit kaydedicisinde saat kilidinin kaybı ESP32'deki gibi `pps_lost` / `pps_regained` ile yazılır. Saat PPS'e kilitli değilken `gps_time_ns` ve çapa sütunları boş kalır (ESP32'nin PPS'siz davranışı).

**Çapadan GPS zamanı:** `gps_time_ns = pps_gps_time_ns + (esp_micros − pps_esp_micros) × 1000`.

İşleme hattının uyguladığı kurallar:

- Başlık satırı birebir yukarıdaki gibi olmalı. Eski dört sütunlu biçim (`esp_micros,gps_time_ns,event_type,payload`) açık bir hatayla reddedilir. Her satır tam altı alan içermelidir.
- `gps_time_ns` boş ama çapa doluysa zaman yukarıdaki formülle yeniden hesaplanır ve olay `gps_time_derived` olarak işaretlenir; ingest bunu uyarı olarak listeler. **Karar:** Hat bunu çapa 60 sn'ye kadar eskiyse yapar (ESP32 kristali ±40 ppm → 60 sn'de en fazla ~2,4 ms hata, QR çözünürlüğünün çok altında). Daha eskiyse zaman boş kalır.
- Çapanın yalnızca bir alanı doluysa satır hatalıdır.
- `session_start` payload'ındaki parsel, kök `session.json`'daki `parcel_id` ile aynı olmalıdır; değilse oturum reddedilir.

## İki ayrı oturum dosyası

### `gnss/session.json` (ESP32 yazar)

Kaynak: [firmware/gnss-logger/README.md → `session.json`](../firmware/gnss-logger/README.md#sessionjson). Oturum başında yazılır (`stop: null`), bitişte yeniden yazılır.

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `format_version` | int | 1 |
| `session_id` | str | Telefonun `start_session` ile verdiği kimlik (1–36 karakter, `[A-Za-z0-9_-]`) |
| `parcel_id` | str | Telefonun verdiği parsel kimliği |
| `firmware_version` | str | Ör. `0.1.0` |
| `receiver` | nesne | Alıcı yapılandırması: `model`, `port`, `baud`, `meas_period_ms`, `rawx_rate_hz`, `nav_pvt_rate_hz`, `messages`, `nmea`, `timepulse_grid`, `config_status` (`ok`, `no_response`, `nak`, `invalid_settings`), `detected_baud` |
| `gps_utc_leap_seconds` | int | 18 |
| `start`, `stop` | nesne | `esp_micros`, `gps_time_ns` (eşleme yoksa `null`), `utc` (eşleme yoksa `null`). `stop` güç kesintisinde `null` kalır |
| `stop_reason` | str | `command`, `sd_full`, `sd_error`; kit kaydedicisinde ayrıca `power_loss` (aşağıda) |
| `gnss_bytes` | int | `gnss.ubx`'e yazılan bayt |
| `dropped_bytes` | int | Tampon taşmasıyla atılan bayt |

ESP32 kamera yüksekliğini, kalibrasyonu ya da personeli bilmez; bu dosyaya eklenmez.

Kit kaydedicisi aynı dosyayı aynı alanlarla yazar (`format_version` 1), şu farklarla:

| Alan | Kit kaydedicisinde |
| --- | --- |
| `firmware_version` | Kayıt servisinin sürümü |
| `recorder` | `"kit-recorder"` (yeni alan; ESP32 yazmaz, yokluğu ESP32 demektir) |
| `precheck_overrides` | Atlanan ön kontrol maddeleri listesi (`lidar`, `lidar_mode`, `clock`); boş olabilir (yeni alan) |
| `clock_state_at_start` | `pps`, `coarse` ya da `unlocked` (yeni alan; [Kit kaydedicisi](#kit-kaydedicisi-raspberry-pi)) |
| `receiver.port` | `"USB"`; `receiver.baud` ve `receiver.detected_baud` `null` |
| `stop_reason` | Ek değer `power_loss`: Pi kapanmamış bir oturumla açıldı ya da SSD kapanmamış bir oturumla bağlandı. `stop` `null` kalır (ESP32'de güç kesintisindeki gibi). SSD kayıt sırasında çıkarıldığı için kapanış yazılamadıysa SSD geri takılınca `sd_error` yazılır, `stop` yine `null` |

### Kök `session.json` (saha uygulaması ve operasyon yazar)

**Karar:** Alan adları veritabanındaki `public.session` tablosuyla ([veri-modeli.md](veri-modeli.md)) aynı tutuldu. Saha uygulaması oturum başlatılırken bildiği alanları yazar; operasyon işlemeden önce kit/kalibrasyon alanlarını tamamlar. Bilinmeyen alanlar korunur.

| Alan | Tür | Yazan | Zorunlu | Anlamı |
| --- | --- | --- | --- | --- |
| `session_id` | str | Saha uygulaması | Evet | Oturum kimliği (`public.session.id`, UUID). ESP32'ye `start_session` ile aynısı verilir; bu yüzden 36 karakteri ve `[A-Za-z0-9_-]` kümesini aşamaz |
| `parcel_id` | str | Saha uygulaması | Evet | Parsel kimliği (UUID); ESP32'ye aynısı verilir |
| `org_id` | str | Saha uygulaması | Hayır | Kurum kimliği |
| `kind` | str | Saha uygulaması | Hayır | `public.session.kind`; tarama için `scan` |
| `methodology_version` | str | Saha uygulaması | Hayır | Tarama protokolü sürümü |
| `rig_id` | str | Saha uygulaması / operasyon | Hayır | Kullanılan kit (`public.rig`) |
| `calibration_id` | str | Operasyon | Hayır | Kitin oturum tarihinde geçerli kalibrasyon kaydı |
| `camera_height_m` | float | Operasyon (personelin ön kontrolde ölçtüğü değer, `public.session.camera_height_m`) | Hayır, vars. 2,0 | Kamera merceğinin zeminden yüksekliği; kamera ayarlanabilir olduğu için her ziyarette ölçülür. Yoksa ya da 0,5–3,5 m dışındaysa hat uyarı verir. Yüklemede ziyaretin kaydıyla 5 cm'den fazla farklıysa yükleme reddedilir (kesitler yanlış yükseklikle kesilmiş olur); ziyarette kayıt yoksa bu değer yazılır |
| `scan_platform` | str | Operasyon (ön kontrolden) | Hayır | `walk` (sırt direği), `motorcycle`, `robot`. Ziyaretin kaydıyla farklıysa yükleme uyarı verir, ziyaretin değeri kalır |
| `camera_yaw_offset_deg` | float | Operasyon (kalibrasyondan) | Hayır | Panorama orta sütununun hareket yönüne göre açısı; yoksa hat parametresi kullanılır |
| `lead_user_id` | str | Saha uygulaması | Hayır | Ekip lideri kullanıcı kimliği |
| `crew_user_ids` | str[] | Saha uygulaması | Hayır | Diğer personelin kullanıcı kimlikleri |
| `app_version` | str | Saha uygulaması | Hayır | Saha uygulaması sürümü |

**Karar (KVKK):** Personel yalnızca kullanıcı kimliğiyle anılır; ad, telefon ya da sahip bilgisi bu dosyaya yazılmaz.

Örnek:

```json
{
  "session_id": "4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b",
  "parcel_id": "9b1d7e2a-3c4f-4a5b-8c6d-7e8f9a0b1c2d",
  "kind": "scan",
  "methodology_version": "scan-v1",
  "rig_id": "kit-01",
  "calibration_id": "kit-01-2026-10",
  "camera_height_m": 2.05,
  "camera_yaw_offset_deg": 0.0,
  "lead_user_id": "0f6c2b9a-1d3e-4f5a-8b7c-9d0e1f2a3b4c",
  "app_version": "0.1.0"
}
```

### Birleştirme

İşleme hattı iki dosyayı ayrı modellerle okur (`SessionInfo`, `LoggerSession`) ve `manifest.json`'da `session` ve `logger` olarak yan yana yazar.

- İki dosyada da bulunan `session_id` ve `parcel_id` **birebir aynı olmalıdır**; değilse ingest oturumu reddeder.
- `gnss/session.json` zorunludur (**karar**: ESP32 onu oturumun ilk saniyesinde yazar; yoksa `gnss/` klasörü yanlış kopyalanmıştır).
- `stop: null`, `dropped_bytes > 0`, `config_status ≠ ok` ya da `format_version ≠ 1` uyarı olarak listelenir; işleme durmaz.

## QR saat kodu

Saha uygulaması taramanın başında ve sonunda telefon ekranında sürekli yenilenen bir QR kod gösterir; kamera bunu kaydeder. İçerik düz metindir:

```
OQ1:<gps_time_ms>[:<oturum_etiketi>]
```

| Alan | Anlamı |
| --- | --- |
| `OQ1` | Biçim ve sürüm işareti |
| `gps_time_ms` | QR görüntüsünün ekranda belirdiği an, **GPS zamanı**, GPS başlangıcından bu yana tam sayı milisaniye. Telefon saati UTC ise 18 s eklenir |
| `oturum_etiketi` | Opsiyonel ama saha uygulaması her zaman yazar (**karar**): `session_id`'den harf, rakam, `_` ve `-` dışındaki karakterler atıldıktan sonraki ilk 8 karakter. Başka oturumun QR'ı yanlışlıkla okunursa elenir |

Örnek: `OQ1:1476435618200:4f2a9c1e`

Kurallar:

- **Yenileme hızı:** QR en az 10 Hz yenilenir (100 ms; hattaki parametre `sync.qr_refresh_ms`). Değer, görüntünün belirdiği andır; hat okunan değere yenileme aralığının yarısını ekler. Ekranın bilinen bir gecikmesi varsa `sync.qr_display_latency_ms` ile verilir.
- **Gösterim süresi:** Kayıt başladıktan sonraki ilk 20 sn içinde ve kayıt bitmeden önceki son 20 sn içinde birkaç saniye (`sync.qr_search_s`); telefon kameraya yakın ve düz tutulur.
- **`qr_sync` olayı:** QR ekranda gösterilmeye başladığı anda telefon ESP32'ye `mark_event(qr_sync, payload)` gönderir. **Karar:** `payload` o anda gösterilen QR'ın metninin tamamıdır (`OQ1:...`); İP2 README'sindeki örnek de bu biçimdedir. Eski kayıtlarda görülebilecek ISO 8601 UTC metni de hat tarafından okunur ve GPS zamanına çevrilir, ama saha uygulaması `OQ1` biçimini kullanır.
- **Çapraz kontrol:** Hat her `qr_sync` olayı için `sync.json`'daki `qr_sync_checks` listesine şunları yazar: QR değeri, olayın GPS zamanı (çapadan hesaplandıysa işaretli), `event_minus_qr_ms` (olay zamanı − QR değeri; beklenen değer BLE gecikmesi, tipik olarak < 50 ms) ve videodan okunan en yakın QR değerine uzaklık. |fark| > 250 ms (`sync.qr_event_max_diff_ms`) ise uyarı verilir; fark ~18 s ise telefonun UTC gösterdiği belirtilir. QR değeri videodaki okumaların hiçbirine 10 sn'den (`sync.qr_event_video_max_gap_s`) yakın değilse ya da etiket başka oturumunsa da uyarı verilir. Bu olaylar saat uydurmasında kullanılmaz; uydurma yalnızca videodaki QR okumalarına dayanır.

## BLE protokolü

Kaynak: [firmware/gnss-logger/README.md → BLE protokolü](../firmware/gnss-logger/README.md#ble-protokolü). Özet:

- Cihaz adı `orchados-gnss-XXXX`; servis `cdee0001-…`, durum `cdee0002-…` (read/notify, 51 bayt, sürüm 1), komut `cdee0003-…` (write). Tüm alanlar little-endian; uygulama MTU ≥ 247 ister.
- **Durumda GPS zamanı:** Ofset 31'de `gps_time_ns` (u64): mesajın oluşturulduğu anın GPS zamanı, `çapa_gps + (şimdi − çapa_micros) × 1000`; PPS eşlemesi yoksa `0` (bu durumda `flags` bit3 de 0'dır). Firmware 0.2.0'dan itibaren gönderilir; 0.1.0 31 bayt gönderir. Aynı sürümde alanlar yalnızca sona eklendiği için çözücüler 31 bayt ve üzerini kabul eder; 31 baytlık mesajda alan yok sayılır. Saha uygulaması bu değerle telefon saatinin GPS zamanına ofsetini bulur ve QR'ı GPS zamanıyla gösterir; değer yoksa telefon saati + 18 sn kullanır ve bunu işaretler.
- Komutlar: `start_session(session_id, parcel_id)`, `stop_session`, `mark_event(corner | qr_sync, payload)`. Sonuç durum mesajındaki `last_cmd_seq` / `last_cmd_result` ile izlenir.
- **Durumda konum:** Sınır köşesi, kapsama izi ve doğrulama turunda yere uzaklık için saha uygulaması alıcının konumunu durum mesajından okur. Firmware 0.3.0'dan itibaren 39 baytın ardında 12 baytlık konum bloğu var (toplam 51 bayt):

  | Ofset | Tür | Alan | Açıklama |
  | --- | --- | --- | --- |
  | 39 | i32 | `lat_e7` | Son NAV-PVT `lat` (1e-7 derece) |
  | 43 | i32 | `lon_e7` | Son NAV-PVT `lon` (1e-7 derece) |
  | 47 | i32 | `height_mm` | Son NAV-PVT `height` (elipsoit üstü, mm) |

  Konum yalnızca `gnssFixOK` (bit5), `fix_type` 2–4 ve NAV-PVT `invalidLlh` kalkıkken geçerlidir; o zaman `flags` bit6 (konum geçerli) 1'dir. Aksi halde üç alan `0`, bit6 `0`'dır; çözücü bit6'ya bakar. Saha uygulaması 51 bayttan kısa mesajda (firmware 0.2.0 ve öncesi) konumu "yok" kabul eder: köşe yine GPS zamanıyla kaydedilir, kapsama ve uzaklık gösterilmez. Konum PPK öncesidir; doğruluğu `h_acc_mm`'dedir.
- `start_session`'a verilen `session_id` ve `parcel_id`, kök `session.json`'dakilerle aynı olmalıdır (yukarıdaki birleştirme kuralı).
- Kit kaydedicisi aynı protokolü konuşur ve durum mesajının sonuna alan ekler (77 bayt), `start_session`'a isteğe bağlı bir atlama baytı ve `precheck_failed` (10) sonuç kodunu getirir: aşağıda.

## Kit kaydedicisi (Raspberry Pi)

LiDAR'lı kitte kayıt bilgisayarı Raspberry Pi 5'tir; ESP32 kaydedici kitten çıktı (karar 16 Kasım 2026, tasarım: [superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md](superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md)). Pi'daki kayıt servisi (`services/kit-recorder/`) saha uygulamasına ve işleme hattına ESP32 gibi görünür: aynı BLE servisi ve cihaz adı biçimi (`orchados-gnss-XXXX`), aynı komutlar ve sonuç kodları, aynı `gnss/` dosyaları. Buna LiDAR kaydı ve kayıt sağlığı eklenir.

### Durum mesajı (77 bayt)

İlk 51 bayt [BLE protokolü](#ble-protokolü)ndeki gibidir; `version` 1 kalır (aynı sürümde yalnız sona alan eklenir). Pi'da anlamları:

| Ofset | Alan | Kit kaydedicisinde |
| --- | --- | --- |
| 2 | `flags` | bit0 SSD bağlı, bit1 SSD'de 20 GiB'tan az yer, bit2 SSD hatası, bit3 saat PPS'e kilitli, bit4 bu oturumda veri atıldı, bit5 `gnssFixOK`, bit6 konum geçerli |
| 4 | `pps_state` | `/sys/class/pps/pps0/assert`'e göre: 0 hiç görülmedi, 1 kilitli (son kenar 1,5 sn'den yeni), 2 kayıp |
| 12 | `bytes_written` | Bu oturumda `gnss.ubx`'e yazılan bayt (u32'de doyar) |
| 16 | `sd_free_mib` | SSD'nin boş alanı |
| 20 | `battery_mv` | `0`: Pi aküyü ölçmez. Uygulama kaydedici Pi ise akü maddesini atlar |
| 22–24 | `fw_*` | Kayıt servisinin sürümü |
| 31 | `gps_time_ns` | Saat PPS'e kilitliyse sistem saatinden GPS zamanı, değilse `0` |

Eklenen alanlar:

| Ofset | Tür | Alan | Değerler |
| --- | --- | --- | --- |
| 51 | u8 | `recorder_kind` | `1` = kit kaydedicisi (Pi). 77 bayttan kısa mesaj ESP32 demektir |
| 52 | u8 | `lidar_state` | 0 hiç görülmedi, 1 veri geliyor, 2 kopuk |
| 53 | u8 | `lidar_mode` | 0 bilinmiyor (denetlenmiyor), 1 doğru (negatif açı kipi açık), 2 yanlış |
| 54 | u8 | `clock_state` | 0 kilitsiz, 1 kaba (yalnız alıcının USB zamanı), 2 PPS'e kilitli |
| 55 | u8 | `precheck_fail` | Şu an geçmeyen ön kontrol maddeleri (maske, aşağıda) |
| 56 | u8 | `alerts` | bit0 `lidar_silent`, bit1 `lidar_rate_low`, bit2 `lidar_not_written`, bit3 `gnss_silent`, bit4 `clock_unlocked`, bit5 `ssd_error`, bit6 `ssd_low` |
| 57 | u8 | `overrides` | Bu oturumda atlanan maddeler (maske); kayıt yokken 0 |
| 58 | u8 | — | 0 (ayrılmış) |
| 59 | u32 | `lidar_points_per_s` | Son 3 sn'nin ortalaması |
| 63 | u16 | `imu_hz` | Son 3 sn'nin ortalaması |
| 65 | u16 | `lidar_gap_count` | Bu oturumdaki LiDAR boşluğu sayısı |
| 67 | u16 | `lidar_longest_gap_s` | Bu oturumdaki en uzun boşluk, saniye (doyar) |
| 69 | u32 | `lidar_written_mib` | Bu oturumda MCAP'e yazılan |
| 73 | i32 | `clock_offset_us` | chrony'nin sistem saati hatası tahmini; bilinmiyorsa 0 |

### Ön kontrol ve atlama

**Ön kontrol maskesi** (`precheck_fail`, `overrides` ve atlama baytında aynı): bit0 `lidar`, bit1 `lidar_mode`, bit2 `clock`, bit3 `ssd`, bit4 `gnss`. Atlanabilir maddeler yalnız `lidar`, `lidar_mode` ve `clock`'tur (maske `0x07`); SSD ve alıcı atlanamaz.

| Madde | Geçme koşulu |
| --- | --- |
| `lidar` | Son 3 sn içinde nokta geldi ve nokta hızı beklenenin (64 000/sn) en az yarısı |
| `lidar_mode` | Negatif açı kipi doğrulandı ya da doğrulanamıyor (`lidar_mode` 0 geçer, 2 geçmez) |
| `clock` | Saat PPS'e kilitli (`clock_state` 2): chrony PPS'i seçmiş, hata ≤ 1 ms, son PPS kenarı < 1,5 sn |
| `ssd` | SSD bağlı, deneme yazısı başarılı, boş alan ≥ 30 GiB |
| `gnss` | Alıcı yapılandırması `ok` ve son 3 sn içinde UBX geldi |

Fix durumu ön kontrol maddesi değildir (saha uygulaması kendi ön kontrolünde fix'i ayrıca ister).

**`start_session` atlama baytı:** `01 seq len session_id len parcel_id [override_mask]`. Bayt yoksa maske 0'dır; ESP32 fazla baytı `malformed` saydığı için saha uygulaması bu baytı yalnız `recorder_kind` 1 olan kaydediciye gönderir. Maskede `0x07` dışında bir bit varsa sonuç `invalid_argument` (3). Kit kaydedicisinde `start_session` sırası: kayıttaysa `already_recording`; SSD yoksa `sd_missing`, boş alan yetmiyorsa `sd_full`, SSD hatasıysa `sd_error`; geçmeyen ve maskede olmayan madde varsa **`precheck_failed` (10)**; oturum klasörü varsa `session_exists`; yoksa `ok`.

Atlanan maddeler `gnss/session.json`'da `precheck_overrides`, `events.csv`'de `precheck_override` olayı ve durumda `overrides` olarak görünür.

### Kayıt sırasında

- Uyarılar (`alerts`) durum mesajıyla her saniye gider; saha uygulaması yeni bir uyarıda ses çalar, uyarı sürdükçe 10 sn'de bir tekrarlar ve uyarı bandını gösterir.
- `lidar_silent`: 3 sn'dir nokta yok. `lidar_rate_low`: nokta var ama hız beklenenin yarısının altında. `lidar_not_written`: kayıt süreci ölü ya da MCAP 10 sn'dir büyümüyor (oturumun ilk 10 sn'i hariç). `gnss_silent`: 3 sn'dir UBX yok. `clock_unlocked`: saat PPS'e kilitli değil. `ssd_error`: yazma hatası. `ssd_low`: boş alan 20 GiB'ın altında.
- Kopuşlar kaydı durdurmaz: LiDAR ya da alıcı geri gelince kayıt sürer, boşluk `events.csv`'ye ve `recording.json`'a yazılır. SSD çıkarılırsa ya da yazılamazsa oturum `sd_error`, boş alan 512 MiB'ın altına düşerse `sd_full` ile kapanır.
- BLE bağlantısının kopması kaydı etkilemez.

### `lidar/raw/recording.json`

`schema: orchados.lidar_recording/1`. Oturum durdurulunca yazılır; güç kesilirse yazılmamış olabilir (MCAP parçaları yine okunur).

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `session_id`, `parcel_id` | str | `gnss/session.json` ile aynı |
| `recorder_version` | str | Kayıt servisinin sürümü |
| `start_gps_ns`, `stop_gps_ns` | int, boş olabilir | Saat kilitli değilse boş |
| `clock_state_at_start` | str | `pps`, `coarse`, `unlocked` |
| `precheck_overrides` | str[] | `gnss/session.json` ile aynı |
| `lidar_mode` | str | `unknown`, `ok`, `wrong` |
| `topics` | nesne | `points`, `imu`, `ubx`: MCAP'teki konu adları |
| `segments` | `[{file, bytes}]` | `file` `lidar/raw/`'a göre (ör. `bag/bag_0.mcap`) |
| `points_total`, `imu_messages_total` | int | Oturum toplamı |
| `gaps` | `[{start_gps_ns, end_gps_ns, start_mono_us, end_mono_us, duration_s}]` | LiDAR boşlukları; GPS zamanları saat kilitli değilse boş |
| `alerts` | `[{type, first_mono_us, count}]` | Oturumda görülen uyarılar |

MCAP konuları (varsayılan; donanımda doğrulanınca kesinleşir): `/unilidar/cloud` (`sensor_msgs/msg/PointCloud2`), `/unilidar/imu` (`sensor_msgs/msg/Imu`), `/orchados/gnss_ubx` (`std_msgs/msg/UInt8MultiArray`, `gnss.ubx`'e yazılan baytların aynısı).

### Saat

Alıcının PPS teli Pi'ın GPIO18'ine bağlanır (`pps-gpio`). Kayıt servisi alıcının seri portunun tek sahibidir (gpsd yok); her NAV-PVT'nin zamanını chrony'ye SOCK refclock'u (`/run/chrony.gnss.sock`, refid `GNSS`) ile verir, chrony PPS'i (`refid PPS`, `lock GNSS`) birincil kaynak alır. MCAP'teki damgalar Pi'ın sistem saatindendir.

## Medya depolama

Saha fotoğrafları ve işleme hattının ürünleri (panorama, ağaç kesiti vb.) Supabase Storage'daki **özel** `media` alanında tutulur. Ham video ve MCAP gibi büyük ham kayıtlar işleme istasyonunda kalır (`uri` `station://...`).

### Ham kayıtların adresi (`capture.uri`)

Ham kayıtlar (360° video, UBX, `events.csv`, iki `session.json`, baz RINEX) Supabase'e yüklenmez; `orchados-pipeline upload` yalnızca `capture` satırını açar. `uri` dosyanın gerçek yerini gösterir:

| Oturum nereden işlendi | `capture.uri` | Örnek |
| --- | --- | --- |
| Ham veri deposundan (`orchados-ingest pull`) | Depodaki nesnenin adresi: oturum ön eki + oturum klasöründeki göreli yol | `s3://<kova>/[<prefix>/]raw/<org>/<parcel>/<session>/video/VID_0001.mp4` (AWS, R2, GCS, MinIO) · `az://<kapsayıcı>/[<prefix>/]raw/...` (Azure Blob) · `file:///<kök>/raw/...` (yerel arka uç) |
| Yerel bir klasörden | İşleme istasyonundaki mutlak yol | `station://<istasyon>/<mutlak yol>`, ör. `station://ist-01/data/oturumlar/s/video/VID_0001.mp4` |

- **Kaynak:** `pull`, depodaki manifestin bir kopyasını `<oturum>/.orchados/manifest.json`'a yazar; bu kopyada ek olarak `location` alanı vardır: `{"store": "<depo tanımı>", "uri": "<oturum ön ekinin adresi, / ile biter>"}`. Depodaki asıl manifest değişmez (`orchados.raw-manifest/1`).
- **Kural:** Satırın adresi, dosya manifestte **aynı yol ve aynı SHA-256** ile varsa `location.uri + yol`'dur. Manifestte olmayan ya da içeriği farklı bir dosya `station://` olarak yazılır ve yükleme raporunda uyarı verilir. Manifest yoksa (yerel klasör) hepsi `station://`'dur. `location`'ı olmayan manifest (eski `orchados-ingest`) uyarıyla `station://`'a düşer. Başka bir oturumun manifesti hatadır.
- **Kodlama:** Yol, depo anahtarıyla aynıdır; yüzde kodlaması yapılmaz (`file://` için kök `Path.as_uri()` ile yazılır). Adres dosyaya erişim yetkisi vermez; okumak için deponun kimlik bilgileri gerekir (`services/ingest/README.md`).
- **Değişmez:** `capture` satırları ekleme-yalnızdır. Aynı içerik (`content_hash`) için satır zaten varsa yeniden yüklemede adresi değişmez; ilk yazılan adres kalır.
- **Saklama:** Ham veri depoda 30 gün tutulur (`prune`). Süre dolunca adres bir nesne göstermez; satır içeriğin kimliği (`content_hash`) ve kaydı olarak kalır.
- **Web:** `storage://` dışındaki şemalar tarayıcıya sunulmaz (`apps/web/src/lib/media/uri.ts`).

- **Nesne yolu:** `org/<org_id>/parcel/<parcel_id>/<sha256>`. `sha256` dosya içeriğinin küçük harfli onaltılık SHA-256'sıdır ve ilgili `capture.content_hash` ya da `asset.content_hash` ile aynıdır. Uzantı yoktur; tür satırdaki `mime_type`'tan okunur. Örnek: `org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/2d71…4881`.
- **Satırdaki adres:** Dosya `media` alanındaysa `capture.uri` / `asset.uri` = `storage://media/` + nesne yolu. **Karar:** Ayrı bir depolama anahtarı sütunu eklenmedi; yol, satırdaki `org_id`, `parcel_id` ve `content_hash`'ten türetilir.
- **Değiştirilemez:** Aynı yola ikinci kez yazılmaz, nesne güncellenmez ya da silinmez (API kullanıcıları için güncelleme/silme kuralı yok). İçerik değişirse hash ve dolayısıyla yol da değişir.
- **Yazma:** Servis rolü (işleme hattı), operasyon ve saha personeli (`field_staff`). Operasyon ve saha personeli yalnızca kendi kurumunun bir parselinin altına, kurala uyan bir adla **ekleyebilir**. Saha uygulaması yakın plan fotoğraflarını kendisi yükler (aşağıda, "Saha uygulaması ve veritabanı"; `20261021230000_field_sync.sql`).
- **Okuma:** Kurum rolleri kurumlarının bütün nesnelerini okur. Sahip ve izleyici, aynı kurum, parsel ve hash'e sahip bir `asset` ya da `capture` satırını görebiliyorlarsa nesneyi de okur; yani yayımlanmamış oturumların dosyaları onlara kapalıdır (veri-modeli.md, "Yayın").

## Asset `pose` alanı

İşleme hattı (`orchados-pipeline upload`) `asset.pose` JSON alanını aşağıdaki gibi doldurur; web uygulaması bu alanları okur. Konum `asset.position` (WGS84 nokta) ve `asset.position_uncertainty_m` sütunlarındadır; `pose` içinde tekrarlanmaz. Bilinmeyen alanlar okurken yok sayılmalıdır.

**`kind = panorama`** (tam panorama ve önizleme ayrı satırlardır):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `variant` | `full` \| `preview` | 4K tam panorama ya da 2K önizleme. Yoksa `full` kabul edilir |
| `heading_deg` | sayı | Panorama orta sütununun azimutu (kuzeyden saat yönünde, derece) |
| `height_m` | sayı | Kamera yüksekliği, WGS84 elipsoidal (m) |
| `sd_h_m` | sayı | Yatay konum standart sapması (m); `position_uncertainty_m` ile aynı |
| `quality` | `fix` \| `float` \| `dgps` \| `single` | GNSS çözüm kalitesi. RTKLIB'in `sbas` çözümü `dgps`, `ppp` çözümü `single` yazılır |
| `gps_time_ns` | metin | Çekim anı, GPS zamanı ns (bkz. [Zaman](#zaman)). 64 bit tamsayı JavaScript sayısına sığmadığı için metindir |
| `width_px`, `height_px` | tamsayı | Görüntü boyutu (piksel) |

**`kind = tree_crop`** (`asset.tree_id` slot koduyla eşleşen aktif ağaç; konum, kameranın durduğu yer):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `direction` | `N` \| `E` \| `S` \| `W` | Kameranın ağacın hangi tarafında olduğu (`N` = kuzeyden bakış) |
| `slot_code` | metin | Kesitin yükleme anındaki slot kodu (ör. `S5-12a`) |
| `panorama_asset_id` | uuid \| null | Kesitin alındığı panorama `asset` satırı. Tam panorama yüklenmediyse aynı karenin önizlemesi |
| `distance_m` | sayı | Kameradan ağaca yatay mesafe (m) |
| `azimuth_deg` | sayı | Kameradan ağaca azimut (kuzeyden saat yönünde) |
| `yaw_in_panorama_deg` | sayı | Kesit merkezinin panorama orta sütununa göre açısı (sağa pozitif) |
| `pitch_deg` | sayı | Kesit merkezinin yataya göre açısı (yukarı pozitif) |
| `fov_deg` | sayı | Kesitin yatay görüş açısı |
| `score` | sayı | Kesit seçim skoru (0–1); `quality_score` ile aynı |
| `subject`, `slot_id` | `slot`, uuid | Yalnız **boş yer kesitlerinde**: `asset.tree_id` boştur, kesit aktif ağacı olmayan bir yere bakar (ağaç var/yok kontrolü, yeni dikim önerisi). Ağaç kesitlerinde bu alanlar yoktur |

Ağaca bağlı kesitleri okuyan ekranlar `tree_id` boş satırları atlar (portal ve uzman paneli zaten `tree_id` ile sorgular).

`trajectory` satırlarında `pose` ve konum boştur.

## Ağaç konumları (veritabanından)

İşleme hattı (`run --trees-from-db`) ağaç konumlarını envanterden, ops kullanıcısının belirteciyle PostgREST üzerinden okur (servis anahtarı yok):

| Okunan | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `id`, `parcel_id`, `kind` | `session.json`'daki `session_id`; parsel `session.json`'daki `parcel_id` ile aynı olmalı |
| `public.slot` | `id`, `code`, `position`, `position_uncertainty_m`, `local_x_m`, `local_y_m` | Parselin slotları. `position` PostgREST'ten GeoJSON nokta olarak gelir |
| `public.tree` | `id`, `slot_id` | `status = active` |
| `public.boundary` | `version`, `geom` | En yüksek sürümün sınır kutusu: kapsama hücrelerinin başlangıcı (aşağıda) |

- Kesitin `subject.tree_id`'si `tree.id`, `slot_code`'u `slot.code`'dur; yükleme bunu slotun yükleme anındaki aktif ağacıyla yeniden denetler.
- Aktif ağacı olmayan konumlu yerler "boş yer" olarak okunur ve var/yok kontrolü için kesit alır.
- `slot.position` boşsa ağaç kesit almaz (**karar**: yerel koordinattan konum türetilmez). Parselde konumlu aktif ağaç yoksa ya da oturum `kind = inventory` ise hat sadece panorama üretir; bu hata değil, `outputs.json`'da `crops_status` (`no_tree_positions`, `inventory_session`) olarak raporlanır.

## AI ön değerlendirme satırları

AI worker (`services/ai-worker`, `ai-worker run`) işlenmiş bir tarama ziyaretinin her aktif ağacı için bir öneri yazar. Ops kullanıcısının belirteciyle çalışır (servis anahtarı yok); yazma tek bir veritabanı fonksiyonuyla, tek işlemde yapılır: `save_ai_assessment` (`supabase/migrations/20261023150000_ai_preassessment.sql`). Oturum `processed` ya da `in_review` olmalı.

**Okunan:**

| Tablo | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `status`, `methodology_version`, zaman | Mevsim oturum zamanından çıkar (`started_at`, yoksa `planned_date`, yoksa `created_at`; ay UTC) ve `methodology_version`'dan: v0.2 kış Kasım–Mart, ilkbahar Nisan–Mayıs, yaz Haziran–Ağustos, hasat Eylül–Ekim; eski sürümler Mart ilkbahar, Ağustos hasat, Kasım kış ([metodoloji.md](metodoloji.md) bölüm 2) |
| `public.tree` + `slot.code` | `id`, kod | `status = active` |
| `public.asset` | `kind = tree_crop`, `tree_id`, `uri`, `content_hash`, `pose.direction` | Dosya imzalı adresle indirilir, SHA-256'sı denetlenir. Yön başına en yeni (`produced_at`), sonra en yüksek `quality_score` |
| `public.measurement` | `source = staff`, `value_boolean` | Personelin evet/hayır cevapları; isteğe sadece metrik kodu ve cevap girer |
| `public.metric_definition` | `code`, `value_type`, aralık, kategoriler, `valid_seasons` | Mevsimin ağaç ölçekleri. Ad ve açıklama okunmaz |

- **Görüntüler:** Ziyaretin bütün kesitleri gönderilir. Yakın plan fotoğraflar v0.1'de gönderilmez (kapsam: yakın plan analizi sonraki sürümde).
- **Önceki ziyaret:** Aynı parselin bu ziyaretten önceki en yeni `published` oturumu; o ağacın kesitlerinden ikinci bir mozaik.

**Yazılan** (her ağaç için bir kez):

| Tablo | Alanlar |
| --- | --- |
| `assessment` | `source = ai`, `overall_class` (boş olabilir), `confidence` (sınıf güveni, 0–1), `model_name` (son kararı veren model, ör. `claude-sonnet-5-5`), `model_version` (API'nin bildirdiği model kimliği), `methodology_version`, `notes` (kısa Türkçe gerekçe, sadece uzman için) |
| `measurement` | Değer verilen her ölçek için bir satır: `source = ai`, `method = ai_preassessment`, `method_version` = istem sürümü, `confidence` (0–1), `uncertainty` (sadece 0–3 ölçeklerde: `(1 − güven) × aralık / 2`, ölçek adımı), `params_hash`. Emin olunmayan ölçek yazılmaz |
| `measurement_evidence` | Her AI ölçümü ↔ isteğe giren kesitler (bu ziyaretin) |
| `assessment_measurement` | AI değerlendirmesi ↔ AI ölçümleri |
| `ai_assessment_detail` | Aşağıda |

**`ai_assessment_detail`** (değerlendirme başına bir satır; sadece kurum üyeleri okur, sadece ekleme):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `assessment_id` | uuid | AI değerlendirmesi |
| `prompt_version` | metin | `ai-<istem sürümü>/<metodoloji sürümü>`, ör. `ai-v0.1/methodology-v0` |
| `config_key` | metin | Model kaskadı, ör. `claude-haiku-5-5>claude-sonnet-5-5` |
| `final_model`, `final_stage` | metin, int | Sonucu veren model ve aşaması (1 = triaj) |
| `models` | metin dizisi | Bu ağaç için cevap veren modeller, sırayla |
| `review_reasons` | metin dizisi | Triaj cevabının neden üst modele gittiği: `no_answer`, `no_class`, `low_confidence`, `class_problem`, `class_dead`, `class_absent`, `flag_<bayrak>`, `tree_visible_no`, `tree_visible_unsure`, `class_inconsistent`, `hard_scale_dead_branch_scale`, `hard_scale_trunk_base_scale` (v0.1: kuru dal ya da gövde 2 ve üstü); üçüncü aşamaya gidenlerde ayrıca `hard_<neden>` |
| `tree_visible` | `yes` \| `no` \| `unsure` | Konumda ağaç görünüyor mu |
| `flags` | metin dizisi | `staff_answer_conflict` (personel cevabıyla çelişki), `large_change_from_previous` (önceki ziyarete göre büyük değişim), `poor_image` (kötü görüntü). Worker ekler (v0.1): `winter_dead_downgraded`, kışın kuru cevabı Sorunlu ve kuru dal 3 yapıldı |
| `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` | int | Bu ağacın bütün aşamalarının toplamı |
| `cost_usd` | sayı | Tahmini maliyet, Batch fiyatıyla |
| `batch_ids` | metin dizisi | Message Batches kimlikleri |

- **Tekrar çalıştırma:** (`session_id`, `tree_id`, `prompt_version`, `config_key`) benzersizdir. Aynı istem ve kaskadla ikinci çalıştırma yeni satır açmaz; fonksiyon var olan değerlendirmenin kimliğini döner. İstem ya da kaskad değişirse yeni satırlar eklenir; uzman paneli ziyaretin en yeni AI değerlendirmesini gösterir.
- **Görünürlük:** `source = ai` olan değerlendirme ve ölçümleri sahip ve hissedar hiçbir zaman görmez, yayından sonra da. Uzman kabul ederse ya da toplu onay verilirse sahibe giden ayrı bir `source = expert` satırıdır.
- **Zorunlu inceleme:** Uzman paneli `confidence`, `overall_class` ve `ai_assessment_detail.flags` ile `tree_visible`'ı okuyabilir. "Personel cevabıyla çelişki" kuralı için `flags` içindeki `staff_answer_conflict` kullanılır.

## Doğrulama kalemleri

Envanter doğrulama turu (`docs/MVP.md` Modül 2, adım 9) ofiste oluşturulur; saha uygulaması kalemleri personele görev olarak indirir ve sonuçları yazar. Şema: `docs/veri-modeli.md`, "Doğrulama listesi ve envanter onayı". Saha uygulaması kullanıcının belirteciyle PostgREST üzerinden çalışır (servis anahtarı yok).

**Okunan:**

| Okunan | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `id`, `parcel_id`, `kind`, `status`, `planned_date`, `notes` | `kind = verification`, `status = planned`; günün görevleri `planned_date` ile |
| `public.verification_item` | `id`, `session_id`, `slot_id`, `tree_id`, `reasons`, `note`, `status`, `tree_present`, `result_note`, `checked_at` | Turun kalemleri; sadece `status = open` olanlar görev |
| `public.slot` | `id`, `code`, `row_no`, `position_no`, `position`, `position_uncertainty_m` | Kalemin yeri; personel kod ve sıra sayımıyla bulur. `position` GeoJSON nokta |
| `public.tree` | `id`, `slot_id`, `status`, `age_class`, `graft` | İsteğe bağlı: yerin şu anki ağacı |

**Yazılan** (yalnızca fonksiyonlarla; tabloya doğrudan yazma izni yok):

| Çağrı | Ne yapar |
| --- | --- |
| `record_verification_result(p_item_id uuid, p_tree_present boolean, p_note text default null, p_closeup_capture_id uuid default null)` | Kalemi `checked` yapar; "ağaç var" boş yere yeni ağaç ekler, "ağaç yok" ağacı `lost` yapar. Kapatılmamış kalemde yeniden çağrılabilir. Saha personeli ve operasyon |
| `close_verification_item(p_item_id uuid, p_note text)` | Açık kalemi bakmadan kapatır; not zorunlu |

- **Yakın plan:** fotoğraf önce `capture` olarak (tür `photo`, aynı parsel, oturum = doğrulama turu) yüklenir, kimliği `p_closeup_capture_id` ile verilir. Dosya yükleme yolu "Medya depolama"daki kuralla aynıdır.
- **Hatalar** mesajda neden olarak gelir: `not_found`, `forbidden`, `item_closed`, `item_not_open`, `invalid_input`.
- **Çevrimdışı:** sonuç kuyrukta bekler; aynı kaleme iki kez gönderilen sonuçta en yenisi geçerlidir. Kapatılmış kaleme gelen sonuç `item_closed` ile reddedilir ve kullanıcıya gösterilir.
- Turun bütün kalemlerine bakılınca oturum veritabanında `captured` olur; uygulama ayrıca durum yazmaz.
- **Saha uygulamasında:** Tur kayıt (kaydedici oturumu, QR) gerektirmez. Telefonda turun kimliğiyle yerel bir oturum satırı açılır (fotoğraflar ona bağlanır) ama bu satır kuyruğa girmez: `public.session`'a uygulama yazmaz. Kalemler sıra ve pozisyona göre sıralanır; yer tarifi parselin konumlu yerlerinden çıkar ("S5 sırasında, güneyden 12. yer": pozisyon 1'in sıranın hangi ucunda olduğu). Kuyrukta önce fotoğraf (`capture`), sonra sonuç (`record_verification_result`) gider. `p_closeup_capture_id` = uuid v5(`<tur>/<sha256>`), yani fotoğrafın `capture.id`'si. Fonksiyonun hata nedeni (`item_closed` vb.) kalıcı hatadır; personele sade bir mesajla gösterilir.

## Saha uygulaması ve veritabanı

Saha uygulaması (`apps/field`) çevrimdışı çalışır: her kaydı önce telefondaki veritabanına ve gönderim kuyruğuna yazar, bağlantı olunca kuyruğu sırayla gönderir (ayrıntı: [apps/field/README.md](../apps/field/README.md), "Senkronizasyon"). Personelin belirteciyle PostgREST ve Storage üzerinden çalışır (servis anahtarı yok).

**Okunan (günün görevleri):**

| Okunan | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `id`, `org_id`, `parcel_id`, `kind`, `planned_date`, `lead_user_id`, `notes` | `status = planned`, `kind` `inventory`, `periodic_scan` ya da `verification`, `planned_date` ≤ bugün + 7 gün. `lead_user_id` kullanıcı olanlar önce |
| `public.parcel` | `name`, `village`, `estimated_area_m2` | Ziyaretin parseli |
| `public.slot` | `id`, `code`, `row_no`, `position_no`, `position`, `position_uncertainty_m` | Parselin bütün yerleri (harita, kapsama, yer tarifi). `position` GeoJSON nokta |
| `public.boundary` | `geom` | Parselin en yüksek `version`'lı sınırı (haritada çizilir). GeoJSON poligon |
| `public.verification_item` | `id`, `slot_id`, `tree_id`, `reasons`, `note` | Doğrulama turunda `status = open` kalemler (yukarıda, "Doğrulama kalemleri") |
| `public.tree` + `public.slot` | `tree.id`, `slot.code`, `slot.row_no`, `slot.position_no` | Periyodik ziyarette parselin `status = active` ağaçları |
| `public.tree_latest_assessment` | `tree_id`, `overall_class` | Yakın plan listesi: Dikkat, Sorunlu, Kuru olanlar + %10 örneklem (metodoloji bölüm 7) |

- **Karar:** Ziyaret satırında mevsim yok; uygulama mevsimi `planned_date`'in ayından ve ziyaretin `methodology_version`'ından çıkarır; kural uzman paneli ve AI ile aynı ([metodoloji.md](metodoloji.md) bölüm 2, ortak vektörler `test-vectors/season.json`).
- **Karar:** Telefondaki oturumun kimliği planlanmış ziyaretin `session.id`'sidir; kaydediciye (`start_session`) ve kök `session.json`'a da o gider. Saha personeli `inventory` / `periodic_scan` ziyareti ekleyemez (operasyon planlar), yalnızca günceller.

**Yazılan (gönderim kuyruğu):**

| Telefonda | Sunucuda | Nasıl | Tekrar gönderimde |
| --- | --- | --- | --- |
| Oturum | `public.session` (planlanmış ziyaret) | `update`: `started_at`, ön kontrolde girildiyse `scan_platform` ve `camera_height_m`; kayıt durunca `status = captured`, `ended_at`. Yalnızca `status` `planned` ya da `captured` iken | Aynı değerler; ziyaret işlendiyse dokunulmaz |
| Oturum olayı (bütün türler: aşağıda "Saha olayları (session_event)") | `public.session_event` (ayrıntılar `data`'da ya da hukuki saha kayıtlarında `payload`'da) | `insert`, kimlik telefondan | `on conflict (id) do nothing` |
| Sınır işareti fotoğrafı, doğrulama yakın planı, yapılamayan ziyaretin fotoğrafı | Yakın plan fotoğrafıyla aynı yol; `capture` satırında `tree_id` yok. `metadata.local_kind` `boundary_photo` (`corner_event_id`), `verification_photo` (`slot_id`) ya da `blocked_visit_photo` (`event_id`: `visit_blocked` olayı) | Yakın plan fotoğrafıyla aynı | Aynı |
| Grid rotası (parselin yeni rota sürümü) | `save_parcel_route(...)` (aşağıda, "Grid rotası") | Fonksiyon çağrısı; ziyaret satırından sonra, `route` olayından önce | Aynı kimlik aynı sürümü döndürür |
| Doğrulama sonucu | `record_verification_result(...)` | Fonksiyon çağrısı; fotoğraf varsa önce o | Yeniden çağrılabilir; en yenisi geçerli |
| Yakın plan fotoğrafı | `media` alanında `org/<org_id>/parcel/<parcel_id>/<sha256>` + `public.capture` (`kind = photo`, `tree_id`, `uri`, `content_hash`, `started_at` = çekimin GPS zamanından UTC) | Önce dosya, sonra satır. `capture.id` = uuid v5(`<oturum>/<sha256>`). Çekim kodu, yer kodu, `gps_time_ns`, zaman kaynağı ve cihazdaki kalite kontrolü `metadata`'da | Var olan nesne yüklenmiş sayılır; `on conflict (session_id, content_hash) do nothing` |
| Personel cevabı | `public.measurement` (`source = staff`, `method = field_question`, `method_version` = soru seti sürümü) | Evet/hayır → `value_boolean`, kategori (ör. `basal_sprout_level`) → `value_category`; `metric_definition_id` metrik kodundan. "Göremedim" ölçüm yazmaz, `closeup_unseen` olayına girer | `on conflict (id) do nothing` |

- **Zaman:** Sunucudaki zaman damgaları UTC'dir; telefonda tutulan GPS zamanı (`gps_time_ms`) 18 sn düşülerek çevrilir. `session_event.gps_time_ns` GPS zamanıdır (bu belgenin "Zaman" bölümü); `time_source = phone` ise değer telefon saatinden türetilmiştir.
- **Karar (oturum olayları):** Olaylar için ayrı, ekleme-yalnız bir tablo açıldı (`public.session_event`: `id`, `org_id`, `parcel_id`, `session_id`, `event_type`, `payload`, `gps_time_ns`, `time_source`, `phone_time`, `logger_result`, `recorded_by`). Gerekçe: (1) her olayın telefonda üretilmiş kimliği var, ayrı satır tekrar gönderimi `on conflict do nothing` ile güvenli kılar; `session` üzerinde bir JSON dizisini güncellemek sıraya ve eşzamanlı yazmaya bağımlı olurdu ve yayımlanmış ziyarette mümkün değil; (2) `capture.metadata` bir dosyaya bağlı, olayların dosyası yok; (3) kaydedicinin `events.csv`'si SD kartla ofise gelir, bu satırlar ise ağdan önce gelir ve kaydedicinin kaçırdığı olayları da taşır: işleme hattı QR eşlemesini iki kaynakla karşılaştırabilir. Okuma yalnızca kurum rolleri; sahip ve izleyici görmez.
- **Karar (metrikler):** Yakın plan sorularının metrikleri kayıtta yoktu; evet/hayır, ağaç, karnede gizli (`card_visibility = hidden`) olarak eklendi: `dead_branch_present`, `trunk_damage_present`, `root_sucker_present`, `pruned`, `frost_damage_present`, `pest_sign_present`, `fruit_present`, `drought_stress_sign`, `theft_sign_present`. Hasat sorularında kayıtlı `harvest_complete` ve `branch_break` kullanılır. Personel cevabı uzmana kanıttır, karnede gösterilmez.
- **Hatalar:** Ağ hatası, zaman aşımı, 5xx/429 ve süresi geçmiş giriş geçicidir (kayıt kuyrukta kalır, artan beklemeyle yeniden denenir). Yetki (`42501`), doğrulama (`23xxx`, `22P02`), bilinmeyen ya da iptal edilmiş ziyaret (`visit_not_found`, `visit_cancelled`), kayıtta olmayan metrik (`unknown_metric`) kalıcıdır: kayıt telefonda "başarısız" diye sebebiyle işaretlenir, kuyruk durmaz.
- **v0.1 soruları ve olaylar:** Yakın plan protokolü `*-v0.1` (metodoloji bölüm 7; metrikler `20261028120000_closeup_protocol_v01`). Bir ağacın "Göremedim" cevapları tek bir `closeup_unseen` olayında: `payload` yer kodu, `data` = `{version, tree_id, slot_code, method_version, metric_codes[], evidence[]}`. Ön kontroldeki ilaçlama onayı `session_start` olayının `data.precheck.spraying` alanında (`none` ya da `waiting_period_passed`). Tarama yöntemi ve ölçülen kamera yüksekliği aynı yerde: `data.precheck.platform` (`walk`, `motorcycle`, `robot`) ve `data.precheck.camera_height_m` (metre, iki ondalık); ikisi ziyaret satırına da yazılır. `methodology_version`'ı telefon göndermez, operasyon belirler.
- **v0.2 soruları (methodology-v0.2):** Protokoller `winter-v0.2` (kuru testinde `dead_test_live_bud`) ve `summer-v0.2` (`early_emptied_cluster_present`; metrikler `20261103100800_methodology_v02`). **Parsel soruları** (`fence_breach_present`, evet/hayır; `summer-v0.3` ve `spring-v0.2`'den beri ayrıca `weed_height`, kategori `short`/`medium`/`tall`): yakın plan listesinde ziyarette bir kez sorulur; cevap `tree_id`'siz bir `measurement` satırıdır (konu `parcel`; telefonda `subject_type = parcel`, `subject_id` = parsel kimliği; evet/hayır `value_boolean`, kategori `value_category`). Parsel sorusunun "Göremedim"i ayrı bir `closeup_unseen` olayıdır: `payload` `parcel`, `data` = `{version, parcel_id, method_version, metric_codes[], evidence: []}` (`tree_id` ve `slot_code` yok). Hasat mevsimindeki taramanın ön kontrolünde hasat cevabı `session_start` olayının `data.precheck.harvest` alanında: `gleaning_done`, `gleaning_ongoing` ya da `no_gleaning` (hasat sürüyorsa cevap yoktur, tarama başlamaz). Ziyaretin mevsimini telefon `session.methodology_version` ile ay'dan çıkarır ([metodoloji.md](metodoloji.md) bölüm 2).
- **Fotoğraf dosyası** telefondan ancak yükleme, `capture` satırı ve nesnenin varlık kontrolü başarılı olunca silinir.
- **Açık:** Cevap ile kanıt fotoğrafı arasındaki bağ sunucuda yok (`measurement_evidence` yalnızca `asset`'e bağlanır); ikisi aynı oturum ve ağaçla eşleşir.

### Saha olayları (session_event)

Saha uygulamasının `public.session_event`'e yazdığı **bütün** olay türleri. Tablo ekleme-yalnızdır, `event_type` açık bir kümedir (`^[a-z][a-z0-9_]*$`); okuyan her bileşen tanımadığı türü atlar (işleme hattı türü süzerek okur: `boundary.py`, `EVENT_TYPES`). Ortak sütunlar:

| Sütun | Anlamı |
| --- | --- |
| `id` | Telefonda üretilen uuid v4; tekrar gönderimde aynı kalır (`on conflict (id) do nothing`) |
| `session_id`, `parcel_id`, `org_id` | Planlanmış ziyaret (`public.session.id`), parseli ve kurumu |
| `gps_time_ns` | Olay anının GPS zamanı (ns). `time_source = phone` ise telefon saatinden türetilmiştir |
| `phone_time` | Telefon saati (UTC) |
| `logger_result` | Kaydediciye komut gittiyse cevabı (`ok`, `timeout`, `not_recording`, …); komut gitmediyse `none` (telefondaki sütun boş olamaz; sunucuda da `none` yazılır, `null` değil) |
| `payload` | Metin (aşağıda türe göre) |
| `data` | JSON nesnesi ya da `null` (aşağıda türe göre) |
| `recorded_by` | Yazan kullanıcı (sunucu doldurur) |

**Kaydediciyle ilgili ve ölçüm olayları** (ayrıntı `data`'da):

| Tür | Ne zaman | `payload` | `data` | Kaydediciye komut |
| --- | --- | --- | --- | --- |
| `session_start` | Kayıt başlarken | `parcel_id=<uuid>` | `{version: 1, precheck: {spraying, platform, camera_height_m, notice?}}` (bu bölümün "v0.1 soruları ve olaylar" maddesi); `notice`, aşağıdaki `field_notice_sign` ile aynı nesnedir (`{sign, badge, reason?}`; uygulama başlangıçla levha kaydı arasında kapanırsa cevap kaybolmasın diye); ön kontrol yoksa `null` | `start_session` |
| `qr_sync` | QR ekranda ilk göründüğünde (başlangıç ve bitiş) | QR metni (`OQ1:<gps_ms>:<etiket>`) | `null` | `mark_event(qr_sync)` |
| `corner` | Her "Köşe" basışı | Köşe numarası | Aşağıda "Sınır köşeleri ve kapsama" | `mark_event(corner)` |
| `boundary_corners` | Köşe listesi her düzenlendiğinde | Listedeki köşe sayısı | Aynı yerde; `corners[].note` **kişisel veri olabilir** | yok |
| `route` | Rota kullanılmaya başlanınca | Rota sürümü | Aşağıda "Grid rotası" | yok |
| `route_progress` | Kayıt dururken | `<biten>/<toplam>` | Aynı yerde | yok |
| `coverage` | Kayıt dururken (konum geldiyse) | `<kapsanan>/<toplam>` | Aşağıda "Sınır köşeleri ve kapsama" | yok |
| `closeup_unseen` | Bir ağaçta "Göremedim" cevabı varsa | Yer kodu | `{version, tree_id, slot_code, method_version, metric_codes[], evidence[]}` | yok |
| `visit_log` | Ziyaret kaydı (özet ekranı) her kaydedildiğinde; en yenisi geçerli | boş | `{weather: {sky, temp_c, wind}, equipment: {logger_name, logger_firmware, camera_serial}, issues?}`; `issues` serbest metin, **kişisel veri olabilir** | yok |
| `session_stop` | Kayıt dururken | `command` | `null` | `stop_session` |

**Hukuki saha kayıtları** (H01, H07, H15, H32; takip işleri T07, T16; `apps/field/lib/features/notice/`). Kaydediciye hiç gitmez (`logger_result = none`). Ayrıntı **`payload`'da tek satırlık JSON nesnesi** olarak durur (`payload::jsonb` ile okunur), `data` her zaman `null`'dır. Anahtarlar aşağıdakilerdir; isteğe bağlı anahtar boşsa hiç yazılmaz. Konum yoktur (H05: yeni konum toplanmaz); telefon numarası hiçbir alanda yazılmaz: uygulama, tarih (`28.10.2026`, `28/10/26`, `2026-10-28`) ve saat (`09:30`, `08.30-10.15`) çıkarıldıktan sonra yalnızca boşluk ya da noktalamayla (`. , / _ - ( ) + :`) ayrılmış **en az 10 rakamlık** bir dizi içeren metni telefon numarası sayar ve kaydetmez (`0532 123 45 67`, `0532/123/45/67`, `+90 532 123 4567`). Bu bir sezgisel denetimdir; 7 haneli alan kodsuz numaraları yakalamaz. Denetim bu bölümdeki bütün serbest metin alanlarına uygulanır: aşağıdaki `reason`/`note`/`name` alanları, `boundary_corners` `data.corners[].note` ve `visit_log` `data.issues`. Aynı türden birden çok kayıt olabilir; "en yenisi geçerli" denen türlerde sıra `gps_time_ns`, eşitse `phone_time`'dır.

| Tür | Ne zaman | `payload` JSON şeması | Kişisel veri |
| --- | --- | --- | --- |
| `field_notice_sign` | Kayıt başlarken, `session_start`'tan hemen sonra (ön kontrolde iki soru cevaplanmadan tarama başlamaz). Ziyarette bir kez. Cevaplar `session_start` `data.precheck.notice`'ta da durur; iki olay ayrı yazıldığından uygulama arada kapanırsa yalnızca o vardır. Okuyan `field_notice_sign` yoksa `precheck.notice`'u kullanır; ikisi de yoksa ön kontrol bu sürümden eskidir | `{"sign": bool, "badge": bool, "reason"?: string (1–200)}`. `sign`: QR'lı bilgilendirme levhası bahçe girişine kondu; `badge`: tanıtım kartı görünür. `reason` yalnızca ikisinden biri `false` iken vardır ve o zaman zorunludur | `reason` (serbest metin) |
| `field_notice_verbal` | Ziyaret özetinde, "Ziyareti bitir"den önce zorunlu; değiştirilebilir, en yenisi geçerli | `{"answer": "given" \| "nobody" \| "not_given", "note"?: string (1–500)}`. `given`: rastlanan kişilere sözlü bilgi verildi; `nobody`: bahçede kimse yoktu; `not_given`: verilemedi, `note` zorunlu | `note` |
| `field_notice_objection` | Taramada ya da kayıt durduktan sonra "Bir kişi itiraz etti"; her itiraz ayrı kayıt | `{"note": string (1–500)}`: nerede, ne oldu. O bölüm daha sonra taranır (H01 saha talimatı) | `note` |
| `visit_blocked` | Görev listesinde "Ziyaret yapılamadı" (yalnızca `inventory` / `periodic_scan` planlanmış ziyaret); her kayıt ayrı | `{"reason": "customer" \| "company" \| "weather" \| "force_majeure", "detail": string, "note"?: string (1–500), "photo_count": int}` | `note` |
| `boundary_pointer` | Envanterde sınır ekranında ya da ziyaret özetinde, sınırı gösteren kişi kaydedilince; en yenisi geçerli. Envanter bu kayıt olmadan bitirilemez ("Ziyareti bitir" kapalı); bu uygulama sürümünden önce kaydedilmiş envanterlerde olmayabilir | `{"name": string (1–120), "role": "owner" \| "owner_relative" \| "worker" \| "neighbor" \| "other"}` (sahip, sahibin yakını, işçi/bekçi, komşu, diğer). **Telefon yok** | `name` (üçüncü kişinin adı) |

`visit_blocked.detail` ve `reason` eşlemesi (8A/2: yol, sel ve resmi yasak sahipten kaynaklı sayılmaz):

| `detail` | Personele | `reason` |
| --- | --- | --- |
| `gate_closed`, `no_key`, `no_guard`, `no_boundary_pointer` | Kapı kapalı, anahtar yok, bekçi yok, sınırı gösterecek kişi yok | `customer` |
| `rain`, `dust_wind`, `weather_other` | Yağmur, yoğun toz ya da rüzgâr, başka bir hava koşulu | `weather` |
| `flood` | Sel ("yol, sel ya da resmi yasak" grubunda) | `weather` |
| `road_closed`, `official_ban` | Yol kapandı, resmi yasak (aynı grupta) | `force_majeure` |
| `equipment`, `staff` | Ekipman arızası, personel gelemedi | `company` |
| `force_majeure_other` | Başka bir mücbir sebep | `force_majeure` |

- **Kanıt (H15, 8A/3):** `reason = customer` iken en az bir fotoğraf ve not zorunludur; `weather_other` ve `force_majeure_other` not ister. Fotoğraflar zaman damgalıdır: `capture` satırı (`kind = photo`, `tree_id` yok, `started_at` çekimin GPS zamanından), `metadata.local_kind = blocked_visit_photo`, `metadata.event_id` = olayın `id`'si; telefonda önce fotoğraflar, sonra olay kuyruğa girer. `photo_count` bu fotoğrafların sayısıdır.
- **Ziyaretin durumu değişmez:** `visit_blocked` yalnızca olay ve fotoğraf yazar; `public.session` güncellenmez (planlanmış kalır), uygun bir durum geçişi yok. Telefonda ziyaretin yerel satırı `blocked` durumunda tutulur ve gönderilmez; engel kalkarsa aynı ziyaret aynı gün taranabilir, o zaman satır normal kayda döner. Bir ziyarette `visit_blocked`'tan sonra `session_start` da olabilir. Sahibe aynı gün bildirim ve kaçırılan ziyaret kaydı bu olaylardan ilerideki veritabanı işinde üretilir.
- **Okuma kuralı (`visit_blocked`):** Sunucu bu olayı denetlemez: `session_event` ekleme politikası yalnızca kurumu (`org_id`) denetler, ziyaretin durumuna bakmaz; telefon da yalnızca kendi kaydettiği ziyarette düğmeyi gizler (başka telefonun taraması ya da eski görev listesi bilinmez). Bu yüzden okuyan (dalga 3: kaçırılan ziyaret, iade kararı) bir `visit_blocked` olayını **yok sayar**: (a) ziyaretin `public.session` satırı bir kayıt gösteriyorsa (`status` `planned` değilse) ya da aynı ziyarette herhangi bir zamanda bir `session_start` olayı varsa (ziyaret yapılmıştır; kayıt, `visit_blocked`'a göre önceliklidir), (b) `recorded_by` ziyaretin kurumunda `field_staff` ya da `ops` rolü taşımıyorsa. Yalnızca bu ikisinden geçen olay "ziyaret yapılamadı" sayılır; `reason = customer` ise 8A/3 sonucu (ziyaret yapılmış sayılır, iade edilmez) ancak o zaman uygulanır. Sunucu tarafında denetim (doğrudan ekleme yerine RPC ya da tetikleyici) dalga 3 veritabanı işinin takibidir.
- **Kişisel veri (kabul edilen sapma):** `boundary_pointer.name` üçüncü bir kişinin adıdır; bütün `reason`/`note` alanları, `boundary_corners` `data.corners[].note` ve `visit_log` `data.issues` serbest metindir ve kişi adı içerebilir. Repodaki kural kişisel verinin `private` şemasında durmasıdır; burada mevcut, ekleme-yalnız taşıma tablosu `public.session_event` kullanılır. Bugün tabloyu yalnızca kurum üyeleri (`membership`: saha personeli, uzman, operasyon) okur; sahip ve izleyici (`parcel_access`) okuyamaz. Dalga 2 tabloyu personele daraltır ve ad ile rolü `private` şemasındaki bir tabloya kopyalar; KVKK betikleri (`scripts/kvkk`) istek üzerine bu alanları takma adla değiştirir. Uygulama bu alanların hepsinin (köşe notu ve ziyaret kaydındaki sorunlar dahil) altında telefon numarası ve başka kişilerin adının yazılmamasını hatırlatır ve yukarıdaki kurala göre telefon numarasına benzeyen metni kaydetmez. Kural sezgiseldir; bu sürümden önce kaydedilmiş köşe notlarında ve `issues` alanında denetim yoktu, KVKK betikleri bu alanları da tarar. H25: sınırı gösteren kişinin telefonu bu olaylarda hiç yoktur; ad ve rol raporla birlikte saklanır.

## Sınır köşeleri ve kapsama

Saha uygulaması envanterde sınır yürüyüşünü ve taramanın kapsamasını oturum olayı olarak yazar (`public.session_event`, ayrıntılar `data` sütununda, JSON nesnesi; `20261022120000_session_event_data.sql`). Tablo ekleme-yalnızdır: bir düzeltme yeni bir olaydır.

**Karar (köşeler olay olarak):** Köşeler `boundary` taslağı ya da yeni bir tablo yerine olay olarak saklanır. Gerekçe: (1) telefondaki konum PPK öncesidir; asıl konum ham GNSS kaydının PPK ile düzeltilmiş yörüngesinden, köşenin GPS zamanıyla bulunur. Telefonun bilmediği bir konumla `boundary` sürümü açmak sahibin onayına yanlış bir poligon sunar. (2) Kaydedicinin `events.csv`'sindeki `corner` satırlarıyla aynı anı işaretler; iki kaynak karşılaştırılabilir. (3) Sıra düzeltme ve silme, ekleme-yalnız tabloda "en yeni liste geçerli" kuralıyla güvenle ifade edilir. **Sınır sürümünü (`public.boundary`, kaynak `field_survey`) ofis ya da işleme hattı oluşturur;** saha uygulaması `boundary`'ye yazmaz.

**İşleme hattında** (`orchados-pipeline boundary <oturum>` ya da `run --boundary`; ayrıntı [services/pipeline/README.md → Sınır köşelerinden sınır sürümü](../services/pipeline/README.md#sınır-köşelerinden-sınır-sürümü)): köşe listesi aşağıdaki okuma kuralıyla bulunur; her köşe GPS zamanıyla PPK'lı yörüngeden (`fix` iken) konumlanır, belirsizliği yörüngeninkidir. Yörünge PPK değilse ya da o anda `fix` değilse önce olaydaki `position`, o da yoksa kaydedicinin `gnss.ubx`'teki NAV-PVT çözümü (eşleşen `events.csv` `corner` satırının zamanında) kullanılır; belirsizlik en az 5 m yazılır ve raporda işaretlenir. 3'ten az köşe ya da kendini kesen poligon hatadır. Sürüm `add_field_survey_boundary(p_session_id, p_ring, p_vertex_uncertainty_m, p_surveyed_at)` ile yazılır (yalnızca ops; `session_id`, `vertex_uncertainty_m` = köşelerin en büyüğü, `surveyed_at` = son köşenin zamanı). Aynı oturumun en yeni sürümü aynı köşeleri aynı sırayla ve aynı belirsizlikle taşıyorsa yeni sürüm açılmaz. Sahip `approve_boundary` ile onaylar.

**`corner`** (her "Köşe" basışı): `payload` kaydediciye giden köşe numarası (`mark_event(corner, "<n>")`), `gps_time_ns` basış anının GPS zamanı (zaman kaynağı `time_source`'ta).

| `data` alanı | Tür | Anlamı |
| --- | --- | --- |
| `corner_no` | int | Köşe numarası (`payload` ile aynı). Oturumda tekildir; silinen numara yeniden kullanılmaz. Listedeki sıra değildir |
| `position` | nesne \| null | Kaydedicinin basıştan önceki son durum mesajındaki konum (yukarıda "BLE protokolü", konum bloğu). Mesaj yoksa, konum taşımıyorsa ya da 5 sn'den eskiyse `null` |
| `position.lat`, `position.lon` | sayı | WGS84 derece |
| `position.height_m` | sayı | Elipsoit üstü yükseklik (m) |
| `position.h_acc_m` | sayı | Alıcının yatay doğruluk tahmini (m) |
| `position.fix_type`, `position.num_sv` | int | NAV-PVT `fixType`, uydu sayısı |
| `position.carr_soln` | `none` \| `float` \| `fixed` | RTK durumu |
| `position.status_gps_time_ns` | metin | Konumun geldiği durum mesajının GPS zamanı (ns, 64 bit olduğu için metin) |
| `position.age_ms` | int | Durum mesajının basış anındaki yaşı (telefon saatiyle) |

**`boundary_corners`** (köşe listesi her düzenlendiğinde: sıra değişti, son köşe silindi, not, işaret ya da fotoğraf eklendi): `payload` listedeki köşe sayısı, `logger_result = none` (kaydediciye komut gitmez).

| `data` alanı | Tür | Anlamı |
| --- | --- | --- |
| `version` | int | 1 |
| `corners` | dizi | Yürüme sırasıyla köşeler |
| `corners[].event_id` | uuid | Köşenin `corner` olayı |
| `corners[].corner_no` | int | Aynı olaydaki numara |
| `corners[].note` | metin \| null | Personelin notu |
| `corners[].markers` | metin dizisi | Sınırı belirleyen: `stone` (sınır taşı), `fence` (çit), `wall` (duvar), `road` (yol), `neighbor` (komşu bahçe), `other` |
| `corners[].photos` | dizi | `{sha256, capture_id}`: köşede çekilen fotoğraflar (`capture`, `metadata.local_kind = boundary_photo`, `metadata.corner_event_id`) |

Okuma kuralı: oturumun **en yeni** `boundary_corners` olayı (sıra: `gps_time_ns`, eşitse `phone_time`) köşe listesidir. Listede olmayan ve o olaydan önce işaretlenmiş köşe silinmiştir; ondan sonra işaretlenen köşeler listenin sonuna eklenir. Hiç `boundary_corners` yoksa liste, `corner` olaylarının sırasıdır. Silinen köşenin `corner` olayı ve kaydedicideki satırı kalır.

Uygulamada gösterilen alan, listedeki konumlu köşelerden (en az 3) yerel düzlemde hesaplanır (m² ve dönüm = m² / 1000). Kesin alan PPK'dan sonra `boundary.area_m2`'dir.

**`coverage`** (kayıt durdurulurken, kaydediciden en az bir konum geldiyse; `session_stop`'tan hemen önce): taramada telefonun gördüğü kapsama. İz, kaydedicinin durum mesajlarındaki konumlardır (yaklaşık 1 Hz, PPK öncesi); telefonda kalır, sunucuya gönderilmez (ham GNSS SD kartla gelir). Kural basittir: izin bir yerin `radius_m` yakınından geçtiyse yer kapsanmıştır. İzin her parçası sıra doğrultusuna göre sınıflanır (±30° içinde "sıra boyunca", dikmeye ±30° içinde "dik"): bir sıranın yerlerinin en az `threshold` kadarı sıra boyunca geçişle kapsandıysa sıra, bir pozisyon numarasının yerleri dik geçişle kapsandıysa dik koridor bitmiştir. 10 sn'den uzun konum boşluğu ya da 30 m'den büyük sıçrama birleştirilmez. `payload` `<kapsanan>/<toplam>`.

| `data` alanı | Tür | Anlamı |
| --- | --- | --- |
| `version` | int | 1 |
| `radius_m`, `threshold` | sayı | Kural parametreleri (4 m, 0,95) |
| `max_gap_s`, `max_jump_m`, `direction_tolerance_deg` | sayı | İz birleştirme ve yön sınıflama parametreleri |
| `slots_total`, `slots_covered`, `ratio` | sayı | Konumlu yerler, kapsananlar, oran |
| `rows_done`, `rows_total` | int dizisi, int | Sıra boyunca bitmiş sıra numaraları |
| `cross_done`, `cross_total` | int dizisi, int | Dik geçişle bitmiş pozisyon numaraları |
| `uncovered_slot_codes` | metin dizisi | Yakınından geçilmeyen yerler, yürüme sırasıyla |
| `track_points`, `track_length_m` | sayı | İzdeki nokta sayısı ve uzunluk (m) |

Bu, sahadaki anlık göstergedir; işleme hattının panorama kalitesine dayalı kapsama haritasının (`docs/MVP.md` Modül 3, kalite kapısı) yerini tutmaz.

## Grid rotası

Saha uygulaması taramada parselin sabit grid rotasını üretir ve personeli yönlendirir (`docs/MVP.md` Modül 3: önce sıra boyunca bütün koridorlar, sonra dik koridorlar, en son kenarlar). Karşılaştırılabilirlik için bir parselde **ilk kullanılan rota bir sürüm olarak saklanır** ve sonraki ziyaretler, hangi telefondan olursa olsun, aynı rotayı kullanır. Üretim kuralları: [apps/field/README.md](../apps/field/README.md), "Rota".

**Karar (yeni tablo):** Rota `public.parcel_route`'ta, parsele bağlı ve sürümlü, ekleme-yalnız satırlar olarak tutulur (`20261023160000_parcel_route.sql`). Gerekçe: (1) `parcel` satırını yalnızca operasyon güncelleyebilir; rotayı ise saha personeli ilk taramada oluşturur. (2) Rota sürümlüdür ve eski sürüm, onu kullanan ziyaretler için değişmeden kalmalı (ölçümler sürümlüdür kuralı); `parcel` üzerinde bir JSON alanı üzerine yazılırdı. (3) `boundary` gibi sürüm numaralı, ayrı tablo deseni zaten var. Rota 1 MB'tan küçük bir JSON'dur; koridorlar ayrı satırlara bölünmez (hep birlikte okunur, sıra önemli).

| Sütun | Tür | Anlamı |
| --- | --- | --- |
| `id` | uuid | Telefonda: uuid v5(`7c1e9a42-5b3d-4e8f-a6c0-2d9b4f1e8a37`, `<parcel_id>/<content_hash>`). Aynı parselin aynı rotası her telefonda aynı kimliği alır |
| `org_id`, `parcel_id` | uuid | Parsel |
| `version` | int | Parselde 1'den artan; `unique (parcel_id, version)`. **En yüksek sürüm, sonraki ziyaretin rotasıdır** |
| `route` | jsonb | Rota (aşağıda) |
| `content_hash` | metin | Rotanın telefondaki kanonik JSON'unun SHA-256'sı (hex); `unique (parcel_id, content_hash)` |
| `generator` | metin | Üretici sürümü (`grid-route-v1`); kural değişince artar, eski rotalar yeniden üretilmez |
| `basis` | `inventory` \| `boundary` | Sıraların arasından (envanter sonrası) ya da sınırdan (envanter öncesi) |
| `session_id` | uuid \| null | Rotayı ilk kullanan ziyaret |
| `created_by`, `created_at` | | Yazan kullanıcı, sunucu zamanı |

- **Okuma:** kurum rolleri (sahip ve izleyici görmez). Saha uygulaması günün görevleriyle parselin en yüksek sürümlü rotasını indirir (`id`, `version`, `route`) ve çevrimdışı önbellekte tutar.
- **Yazma:** yalnızca `save_parcel_route(p_id uuid, p_parcel_id uuid, p_session_id uuid, p_route jsonb, p_content_hash text) → {id, version, created}` (saha personeli ve operasyon; tabloya doğrudan yazma izni yok). Bilinen `id` ya da aynı `content_hash` var olan sürümü döndürür (`created = false`); yeni rota parselin sıradaki sürümünü alır. İki telefon çevrimdışıyken farklı rota ürettiyse ikisi de saklanır (sonra gelen bir üst sürüm olur); veri kaybolmaz. Hatalar mesajda: `not_found`, `forbidden`, `session_invalid` (başka parselin ya da iptal edilmiş ziyaret), `invalid_input`.
- **Yeni sürüm ne zaman:** parselin rotası yoksa; ya da son sürüm `basis = boundary` iken parselde artık konumlu yerler (aynı sırada en az iki) varsa. Bunun dışında son sürüm aynen kullanılır; envanter değişse de rota kendiliğinden değişmez.

**`route` biçimi** (`format = 1`):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `format` | int | 1 |
| `generator` | metin | `grid-route-v1` |
| `basis` | metin | `inventory` \| `boundary` |
| `azimuth_deg` | sayı | Sıra yönü, kuzeyden saat yönünde, 0–180'e katlanmış |
| `azimuth_source` | metin | `slots` (yer konumlarına oturtuldu), `parcel` (`parcel.row_azimuth_deg`), `crew` (personel haritada iki dokunuşla belirledi), `boundary` (sınırın en uzun kenarı; personel onayladı) |
| `row_spacing_m`, `tree_spacing_m` | sayı | Sıra ve ağaç aralığı (envanter öncesi: `sqrt(alan / tahmini ağaç sayısı)`, 4–12 m; bilinmiyorsa 8 m) |
| `start_corner` | `sw` \| `se` \| `nw` \| `ne` | Başlangıç köşesi (`parcel.numbering_origin_corner`; yoksa `sw`) |
| `corridors` | dizi | Yürüme sırasıyla koridorlar |
| `corridors[].no` | int | 1'den sıra numarası |
| `corridors[].kind` | `along` \| `cross` \| `edge` | Sıra boyunca, dik, kenar |
| `corridors[].label` | metin | Personele: "S3 ile S4 arası", "5. ile 6. yer arası", "Kenar 2", "Sıra boyunca 4" |
| `corridors[].points` | `[[lon, lat], …]` | Çizgi (sıra boyu ve dik: 2 nokta; kenar: çoklu çizgi), yürüme yönünde; 1e-7° yuvarlanmış |
| `corridors[].length_m` | sayı | Uzunluk (m, 0,1) |

**Oturum olayları** (`public.session_event`, `logger_result = none`):

- **`route`** (rota kullanılmaya başlanınca; ziyarette bir kez): `payload` rota sürümü. `data`: `version` (1), `route_id`, `route_version` (telefonun bildiği sürüm; yeni rotada tahmin, kesin sürüm `parcel_route`'ta `route_id` ile), `new_version` (bu ziyarette mi oluşturuldu), `content_hash`, `generator`, `basis`, `azimuth_deg`, `azimuth_source`, `corridors_total`. **Ziyarette hangi rotanın kullanıldığı buradan okunur.**
- **`route_progress`** (kayıt durdurulurken, `coverage`'dan önce): `payload` `<biten>/<toplam>`. `data`: `version` (1), `corridors_total`, `done`, `skipped`, `pending` (koridor numaraları), `skipped_labels`, `current` (durduğunda sıradaki koridor; bittiyse `null`). Telefondaki yaklaşık takiptir (PPK öncesi konum, koridora 4 m kuralı); kapsamanın yerini tutmaz.

## Yakın plan listesi ve uzman istekleri

Periyodik ziyaretin yakın plan listesi sunucuda üretilir (`docs/metodoloji.md` bölüm 7; `supabase/migrations/20261024120200_followup_requests.sql`). Aynı ziyareti indiren her telefon ve ofis aynı listeyi görür.

**Okunan:** `closeup_list(p_session_id uuid)` (PostgREST: `rpc/closeup_list`), kullanıcının belirteciyle. Kurum rolleri okur; sahip ve izleyici `forbidden` alır, görmediği ziyarette `not_found`.

| Sütun | Tür | Anlamı |
| --- | --- | --- |
| `tree_id`, `slot_id` | uuid | Aktif ağaç ve yeri |
| `slot_code`, `row_no`, `position_no` | metin, int, int | Yer kodu ve sırası; liste bu sırayla gelir |
| `reasons` | metin dizisi | Bir ya da birkaç neden (aşağıda), alfabetik |

| Neden | Kural |
| --- | --- |
| `previous_class` | Bu ziyaretten önceki en yeni yayımlanmış periyodik tarama ya da doğrulama ziyaretinde uzman sınıfı dikkat, sorunlu ya da kuru |
| `sample` | Tabakalı rastgele örneklem: aktif ağaçların %10'u (yukarı yuvarlanır), 10×10 m hücrelerden dengeli |
| `staff_problem` | Bu ziyarette personelin "Sorun gördüm" cevabı (`problem_seen` metriği, `source = staff`, en yeni cevap evet) |
| `expert_request` | Uzmanın açık yakın plan isteği (`followup_request`, `kind = closeup`) |

- **Hücreler:** parselin en yüksek sürümlü sınırının (yoksa yerlerinin) sınır kutusunun güneybatı köşesinden doğu/kuzey metre: `x = Δboylam · π/180 · R · cos(güney enlemi)`, `y = Δenlem · π/180 · R`, `R = 6 371 008,8 m`; hücre `(⌊x/10⌋, ⌊y/10⌋)`. Konumsuz ağaçlar tek hücredir. Portalın hücre ısı haritası (`apps/web/src/lib/portal/cells.ts`) aynı kuralı kullanır.
- **Örneklem:** hücre içinde ağaçlar `md5('<ziyaret>:<ağaç>')` ile sıralanır; her hücrenin 1. ağacı, sonra 2. ağacı… alınır, hücreler `md5('<ziyaret>:<cx>,<cy>')` sırasıyla. Aynı ziyaret hep aynı örneklemi verir.
- **"Sorun gördüm" sonradan gelir:** personel taramada işaretledikçe (gönderildikçe) liste büyür. Telefon listeyi tarama bitince yeniden okuyabilir; çevrimdışıyken kendi işaretlediklerini listeye ekler.
- **Saha uygulaması** listeyi bu fonksiyondan indirir ve "Sorun gördüm" işaretlerini çevrimdışıyken listeye kendisi ekler (`apps/field/README.md`).

**Uzman istekleri** (`public.followup_request`; okuma kurum rolleri, yazma sadece fonksiyonlarla):

| Çağrı | Kim | Ne yapar |
| --- | --- | --- |
| `request_followup(p_session_id, p_kind, p_tree_id, p_note)` | uzman, operasyon | `closeup` (ağaç; sonraki ziyaretin yakın plan listesi), `verification` (ağaç; doğrulama turu), `extra_visit` (parsel; not zorunlu). Aynı ağaç ve tür için açık istek varsa onu döndürür, notu ekler |
| `cancel_followup(p_request_id)` | uzman, operasyon | Açık ya da planlanmış isteği geri alır |
| `ops_plan_followups(p_request_ids, p_session_id)` | operasyon | `verification` ve `extra_visit` isteklerini bir ziyarete bağlar (`planned`). Doğrulama isteği doğrulama ziyareti ister; ağaç turun kalemi olur (`reasons = {other}`, not isteğin notu) |

- **Durum:** `open` → `planned` → `done`, ya da `cancelled`. Yakın plan isteği, ağacın sonraki bir ziyaretten yakın plan fotoğrafı (`capture`, `kind = photo`, `tree_id`) gelince `done` olur. Planlanmış istek, ziyareti `captured` (ve sonrası) olunca `done`; ziyaret iptal edilirse yeniden `open`.
- İstekler sonuç değildir: sahip ve izleyici görmez, yayından sonra da yapılabilir.
- **Kaynak (`origin`):** `expert` (uzman panelinden, `request_followup`) ya da `pipeline` (işleme hattının kapsama raporu; aşağıda). Hattın isteği her zaman `extra_visit`'tir, `coverage_report_id` raporu gösterir; operasyon onu diğer isteklerle aynı şekilde planlar.
- **Hatalar:** `not_found`, `forbidden`, `invalid_input` (ayrıntıda neden).

## Kapsama raporu ve ağaç var/yok

İşleme hattının kalite kontrolleri (`services/pipeline/README.md` → "Kapsama raporu", "Ağaç var/yok kontrolü"). Hat ops kullanıcısıyla yazar; uzman paneli ve envanter onayı okur.

**`record_coverage_report(p_session_id, p_report)`** (yalnız operasyon) → `{report_id, created, passed, rescan_needed}`. `p_report`:

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `pipeline`, `pipeline_version`, `params_hash` | metin | Raporu üreten hat |
| `active_trees`, `covered_trees` | int | Konumlu aktif ağaç ve kapsanan ağaç sayısı (`active_trees > 0`) |
| `threshold` | sayı | Parsel eşiği (0–1] |
| `blind_spots` | int | Kör nokta hücre sayısı |
| `missing_slot_codes` | metin dizisi | Kapsanmayan ağaçların yer kodları |
| `blind_spot_cells` | dizi | `{cell: [cx, cy], trees, uncovered, slot_codes, south, west, north, east}` |
| `rule` | nesne | Hattın kapsama parametreleri |

- Sonuç (`ratio`, `passed`, `missing_trees`, `rescan_needed`) veritabanında sayılardan hesaplanır. Ziyaretin en yeni raporu geçerlidir; aynı hat sürümü, parametreler ve sayılarla gelen rapor yeni satır açmaz.
- `rescan_needed` ise veritabanı ziyaret başına bir kez `followup_request` (`extra_visit`, `origin = pipeline`) açar; notunda oran, eksik ağaçlar ve kör nokta hücreleri yazar. `pipeline_rescan_request(p_session_id)` bu isteği (`{id, status, coverage_report_id}`) döndürür. Daha yeni rapor eşiği geçerse hâlâ açık istek `cancelled` olur.
- **Hücre kuralı** yakın plan listesiyle aynıdır (yukarıda).
- **Envanter onayı:** `approve_inventory` envanter oturumunun en yeni raporu eşiğin altındaysa ve kabul edilmemişse `inventory_incomplete` verir; ayrıntıda `coverage_below_threshold: <oran>/<eşik>` (dört ondalık, `;` ile diğer eksiklerle). `waive_coverage(p_session_id, p_note)` (uzman) en yeni raporu gerekçeyle kabul eder (`waived_by`, `waived_at`, `waiver_note`).

**`record_tree_presence(p_session_id, p_payload)`** (yalnız operasyon) → `{created, existing}`. `p_payload`: `{method, method_version, params_hash, measured_at, items: [{tree_id | slot_id, value: yes|no|unsure, confidence?, evidence_asset_ids: [...]}]}`.

- Her kalem bir `tree_visible` ölçümüdür (`source = algorithm`, kategori `yes`/`no`/`unsure`, belirsizlik yok); kanıtlar ziyaretin `tree_crop` asset'leri. Ağaç parselin aktif ağacı, yer aktif ağacı olmayan bir yer olmalı. Aynı ziyaret, konu, yöntem, sürüm ve parametre hash'iyle ölçüm varsa kalem atlanır.
- **Anlamı:** ağaçta `no` → uzman panelinde zorunlu inceleme (`not_visible`); "Yok" sınıfını yalnız uzman verir. Yerde `yes` → "yeni dikim olabilir" önerisi. Hat boş yerlere yalnız `yes` yazar.
- AI ön değerlendirmesinin `ai_assessment_detail.tree_visible` alanı ayrıdır; ikisi karıştırılmaz.

## Kayıtlı nokta bulutu

LiDAR'lı kitin bir oturumu için işleme hattının LiDAR aşamalarının girdisi ([lidar-olcumleri.md](lidar-olcumleri.md)). Ham MCAP'ten bu bulutu üreten kayıt (LiDAR-inertial SLAM + PPK) henüz yazılmadı; o adım bu iki dosyayı üretmekle yükümlüdür. Sentetik karşılığı `orchados-pipeline lidar synth` yazar.

```
<oturum>/
  lidar/
    cloud.ply      parsel bulutu, yerel doğu/kuzey/yukarı metre
    cloud.json     bulutun üst bilgisi
  trees.json       ağaç konumları (kesitlerle aynı biçim)
```

**`lidar/cloud.ply`:** PLY, `binary_little_endian 1.0`, tek `vertex` öğesi. Zorunlu özellikler `x`, `y`, `z` (`float` ya da `double`), isteğe bağlı `intensity` (`float`, `uchar` ya da `ushort`). Liste özellikleri ve başka öğeler reddedilir. `x` doğu, `y` kuzey, `z` yukarı; birim metre; orijin `cloud.json`'daki noktadır. Yerden ve ottan dönen noktalar bulutta kalır; ayıklamayı hat yapar.

**`lidar/cloud.json`** (`schema: orchados.lidar_cloud/1`):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `session_id`, `parcel_id` | uuid | Kök `session.json` ile aynı |
| `origin_lat`, `origin_lon`, `origin_height_m` | sayı | Yerel düzlemin orijini; WGS84, elipsoit yüksekliği (yörüngeyle aynı) |
| `gps_time_start_ns`, `gps_time_end_ns` | int, boş olabilir | Taramanın GPS zamanı aralığı ([Zaman](#zaman)) |
| `registration_method`, `registration_version` | metin | Bulutu üreten kayıt yöntemi ve sürümü (ör. `fast_lio2+ppk`, sentetikte `synthetic`) |
| `point_sigma_m` | sayı | Nokta gürültüsü ve sürüklenmenin 1σ tahmini (m); ölçüm belirsizliklerine girer |
| `sensor`, `calibration_id` | metin, boş olabilir | Sensör modeli ve kullanılan kalibrasyon kaydı |

- Yerel düzlem `orchados_pipeline.geo.LocalFrame`'dir: parsel boyunda milimetre hatası. İki oturumun bulutları farklı orijinli olabilir; karşılaştırma (budama) enlem/boylam üzerinden yapılır.
- **Ağaç başına ayırma:** Her nokta en yakın gövdeye verilir (Voronoi) ve gövdeden en çok 5 m uzaktaysa tutulur. Zemin her ağaç için ayrı bir düzlem olarak bulunur (ızgara hücrelerinin en alçak noktalarına, aykırıları atarak). Ağacın yükseklikleri bu düzleme göredir, yerden 25 cm'nin altı atılır.
- **Saklama:** `cloud.ply` ham kayıttan türetilmiş bir dosyadır; portala çıkmaz ve yalnız personele açıktır (H05). Portal, ondan türetilen zamansız [3D dünya bulutunu](#3d-dünya-bulutu) gösterir. Ham MCAP saha verisidir, repoya girmez.

**LiDAR ölçüm raporları** (`<oturum>.processed/lidar/`): `crown.json` (`orchados.lidar_crown/1`), `skeleton.json` (`orchados.lidar_skeleton/1`), `pruning.json` (`orchados.lidar_pruning/1`). Ortak başlık: `producer` (hat, sürüm, parametre hash'i, aşama), `method`, `method_version`, `session_id`, `parcel_id`, `trees` (ağaç başına nokta sayısı, yön kapsaması, durum: `ok`, `too_few_points`, `one_sided`, `no_points`) ve `measurements`. Bir ölçüm satırı `{tree_id, slot_code, metric, value_numeric | value_category, unit, uncertainty, confidence, method, method_version}` alanlarını taşır. Sayısal değerde belirsizlik zorunludur. Budama raporunda `session_id` sonraki (budama sonrası) oturumdur.

**`record_lidar_measurements(p_session_id, p_payload)`** (yalnız operasyon; `orchados-pipeline lidar upload`) bu satırları `public.measurement`'a `source = algorithm` olarak yazar. Ayrıntısı ve döndürdüğü özet: [lidar-olcumleri.md](lidar-olcumleri.md) §6.

## 3D dünya bulutu

Gezideki 3D dünyanın ([3d-dunya.md](3d-dunya.md)) gösterdiği, sahibe açık, renkli ve seyreltilmiş bulut. Kayıtlı buluttan (`cloud.ply`) ve oturumun panoramalarından `orchados-pipeline lidar world` üretir; web (`apps/web/src/lib/world/format.ts`) okur. Tek dosyadır; bir `asset` satırı (`kind = world_cloud`, `mime_type = application/vnd.orchados.world-cloud`) ve içerik hash'iyle adreslenir.

```
<oturum>.processed/lidar/world.owc
```

**Dosya düzeni** (küçük sonlu):

| Bayt | İçerik |
| --- | --- |
| 0–3 | Sihirli sözcük `OWC1` (ASCII) |
| 4–7 | `uint32`: başlık uzunluğu `H` (bayt) |
| 8 … 8+H | UTF-8 JSON başlık |
| … | Sıfır dolgu; her dizi, başlıktaki `offset`'ten başlar ve `offset` 4'ün katıdır |

**Başlık** (`schema: orchados.world_cloud/1`):

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `session_id`, `parcel_id` | uuid | Kayıtlı bulutla aynı |
| `origin_lat`, `origin_lon`, `origin_height_m` | sayı | Kayıtlı bulutun orijini (`cloud.json`); konumlar bu yerel doğu/kuzey/yukarı düzlemdedir (`geo.LocalFrame`) |
| `point_count` | int | Nokta sayısı `N` |
| `quantization` | `{min: [x, y, z], scale: [sx, sy, sz]}` | Konum = `min + q × scale` (metre); `q` `uint16` |
| `voxel_m` | sayı | Seyreltme vokseli (varsayılan 0,04 m) |
| `arrays` | nesne | `position` (`uint16` × 3), `color` (`uint8` × 3, sRGB), `tree` (`uint16` × 1); her biri `{offset, type, components}`. Bilinmeyen dizi yok sayılır |
| `trees` | `[{index, tree_id}]` | `tree` dizisindeki sıra numarasının ağaç kimliği. `65535`: ağaca ait değil (zemin, ot, sınır) |
| `colorized` | bool | Renkler panoramalardan alındıysa `true`; değilse `color` yüksekliğe göre gri tonudur |
| `method`, `method_version`, `params_hash` | metin | `lidar_world`, sürüm, parametre hash'i |
| `registration_method`, `registration_version` | metin | Kayıtlı bulutun kaydı (`cloud.json`'dan) |

- **Nokta sırası:** Noktalar sabit tohumla karıştırılmış sıradadır. Dosyanın her ön kısmı bulutun düzgün bir alt örneğidir; web ilk `k` noktayı çizerek ayrıntı düzeyi seçebilir.
- **Zaman ve iz yok (H05):** Başlık GPS zamanı, tarama aralığı, yörünge ya da kare sırası taşımaz; noktaların zamanı ve yoğunluk dışında taşıyanın izi dosyada yoktur. Taşıyanın kendisi (sensörün 1,5 m çevresi) kayıt adımında ya da bu aşamada atılır.
- **Renk:** Her nokta, kendisini gören (derinlik tamponuyla örtülmemiş) en yakın panoramanın pikselinden renk alır. Hiçbir panoramanın görmediği nokta en yakın renkli komşusunun rengini alır.
- **Sürüm:** Biçim değişirse `schema` ve sihirli sözcük birlikte artar; web bilmediği şemayı reddeder.

**Kış iskeleti ve budama (isteğe bağlı, Faz 2b):** Kış taramasının bulutu dal iskeletini ve önceki kış taramasına göre budanan dalları da taşıyabilir. Ek diziler isteğe bağlıdır; onları bilmeyen okuyucu yok sayar, şema `orchados.world_cloud/1` olarak kalır. Ek başlık alanları:

| Alan | Tür | Anlamı |
| --- | --- | --- |
| `segment_count`, `cut_count` | int | İskelet parçası ve kesim sayısı; yoksa 0 |
| `skeleton` | nesne ya da yok | `{method, method_version, params_hash, pruning: {method, method_version, params_hash, before_session_id} \| null}`; zaman taşımaz |

Ek diziler (konumlar noktalarla aynı nicemlemeyle; sınır kutusu parçaları ve kesimleri de kapsar):

| Dizi | Tür | Anlamı |
| --- | --- | --- |
| `segment_a`, `segment_b` | `uint16` × 3 | Parçanın iki ucu (iskelet kenarı: düğüm ile üst düğümü) |
| `segment_radius` | `uint16` × 1 | Parçanın yarıçapı, milimetre (iki ucun ortalaması) |
| `segment_tree` | `uint16` × 1 | Ağaç sırası (`trees` ile aynı numaralama) |
| `segment_kind` | `uint8` × 1 | `0`: bu taramada duran odun; `1`: önceki kış taramasından bu yana kesilmiş (önceki iskeletin kesilen alt ağaçları, hizalamayla bu taramanın düzlemine taşınmış) |
| `cut_position` | `uint16` × 3 | Kesim noktası (`pruning.json` `cuts[].xyz`, bu taramanın düzleminde) |
| `cut_diameter` | `uint16` × 1 | Kesim çapı, milimetre |
| `cut_tree` | `uint16` × 1 | Ağaç sırası |

- Kaynak: `skeleton.json` (`orchados.lidar_skeleton/1`; düğümler ağaç düzleminde, `center_en` ve `ground_z` ile bulut düzlemine çevrilir) ve varsa bu taramayı "sonra" olarak alan `pruning.json` (`orchados.lidar_pruning/1`; kesimler önceki iskeletin düğüm numaralarını taşır, hizalama `alignment` ile ters çevrilir).
- Yalnız durumu yeterli ağaçlar yazılır (`one_sided` ve noktası az olanlar yok). 5 mm'den kısa parçalar atılır.

## Kit kimlik çipi

Tarama kiti robota (`yusuftiryaki/hoverboard`) bir soket üzerinden takılabilir. Kitin fişindeki **DS2431** (1-Wire EEPROM, 128 bayt) kitin manifestini taşır. Robot bu manifesti okur ve kitin frame'lerini (`kit_gnss`, `kit_cam360`, `kit_lidar`) statik TF olarak yayınlar.

- **Sözleşmenin kaynağı:** [hoverboard/docs/kit-soketi.md](https://github.com/yusuftiryaki/hoverboard/blob/main/docs/kit-soketi.md), "Kimlik çipinin içeriği (manifest)" ve "Repolar arası sözleşme". **Uyulan sürüm: manifest şema 1.** Referans okuyucu `hoverboard/ros2/src/robot_kit/robot_kit/manifest.py`'dir; belgeyle çelişirse dosya geçerlidir.
- **Yazan taraf:** `services/kit-chip/` (`orchados-kit write|read`).
- **Test vektörleri:** Robot reposuyla aynı dosya, `services/kit-chip/tests/vectors/kit_manifest_v1.json`. Değiştirilmeden kopyalanmıştır. Format ya da vektörler değişirse iki repo birlikte değişir.
- **Şema numarası** sadece artar. Robot bilmediği bir şemayı reddeder.

**`kit_mount` frame'i** robot tarafında tanımlı (`kit-soketi.md`, "Soket — mekanik" ve URDF); aşağıdaki kabuller robot tarafınca doğrulandı (2026-10-27):
- Robotun montaj plakasının üst yüzeyi: `base_link`'e göre x = 0,11 m, z = 0,1825 m, dönüşsüz.
- Eksenler `base_link`'inkiyle aynı: x ileri, y sola, z yukarı. Açılar roll, pitch, yaw, radyan.

**Kalibrasyon kaydındaki karşılığı** (`public.calibration`, migration `20261027120000_calibration_kit_mount`):

| Manifest alanı | Kaynak |
| --- | --- |
| `calib_id` | `chip_id`: veritabanının verdiği, artan uint32 (1 … 4 294 967 295). Elle seçilemez, değişmez |
| `frames` | `extrinsics.kit_mount`: `{"kit_gnss": [x, y, z, roll, pitch, yaw], "kit_cam360": [...], "kit_lidar": [...]}`. Veritabanı biçimi denetler (bilinen frame adları, altı sayı) |
| `serial` | Kaydın rig'indeki `human_kit` cihazının `serial_number`'ı (tek olmalı, en fazla 8 ASCII karakter) |
| `caps` | Kalibre edilmiş frame'lerden (`kit_gnss` → `gnss_rtk`, `kit_cam360` → `cam360`, `kit_lidar` → `lidar`), artı yazan kişinin verdiği `pps`, `cam360_ctrl` |
| `hw_rev`, `gnss_link` | Veritabanında yok; yazan kişi verir (`--hw-rev 1.0 --gnss-link usb`) |
| `kind` | Her zaman `orchados-scan-kit` |

Robot şimdilik çipi her takılışta okuyor; ileride frame'leri `(serial, calib_id)` anahtarıyla önbelleğe alabilir. Bu yüzden `kit_mount` pozları ve `chip_id` kayıt yazıldıktan sonra değiştirilemez (tetikleyici); yeniden kalibrasyon yeni bir kayıttır, yeni bir `chip_id` alır.

**Kalibrasyon → çip akışı:**
1. Kit kalibre edilir, ölçümler `public.calibration` kaydına girilir ([tarama-kiti.md](tarama-kiti.md#robota-takılan-kit-için-ölçüm)).
2. `orchados-kit from-calibration <kayıt id> --hw-rev … --gnss-link …` kaydı okur (saha ya da ops kullanıcısıyla, satır bazlı yetki geçerli), manifesti üretir, çipe yazar, geri okuyup doğrular. Süresi dolmuş (`valid_to` geçmiş) ya da pozu olmayan kayıt reddedilir.
3. Robot kayıtlarına çipteki `calib_id`'yi yazar; `chip_id` üzerinden hangi kalibrasyonla yapıldığı izlenir.

## Açık noktalar

- Kamera jiroskop verisi (ince zaman eşleme) henüz sözleşmede yok.
