# Bileşenler Arası Arayüzler

Bu belge saha uygulaması (İP6), ESP32 GNSS kaydedici (İP2), 360° kamera, operasyon ve işleme hattı (İP4) arasındaki sözleşmelerin **tek kaynağıdır**. Bir biçim değişecekse önce burası güncellenir, sonra bileşenler.

Bit düzeyindeki ayrıntıların kaynağı ilgili bileşenin README'sidir; bu belge onlara atıf yapar, çakışma olursa bileşen README'si geçerlidir ve bu belge düzeltilir:

- ESP32 dosya biçimleri ve BLE protokolü: [firmware/gnss-logger/README.md](../firmware/gnss-logger/README.md)
- İşleme hattının aşamaları ve çıktıları: [services/pipeline/README.md](../services/pipeline/README.md)

"**Karar**" diye işaretlenen maddeler, bileşenler ayrı yazılırken açık kalmış ve entegrasyonda karara bağlanmış noktalardır.

## Zaman

- Bileşenler arasında taşınan tüm zamanlar **GPS zamanıdır: GPS dönemi başlangıcından (1980-01-06 00:00:00) bu yana tam sayı nanosaniye, artık saniye yok.** Alan adları `gps_time_ns` ile biter.
- UTC yalnızca insanların okuması için yazılır (`utc` alanları, ISO 8601, `Z` ekli). GPS − UTC = 18 s (2017'den beri); ESP32 bu değeri `gnss/session.json`'da `gps_utc_leap_seconds` olarak yazar.
- QR kodunda zaman milisaniye çözünürlüğündedir (`gps_time_ms`), yine GPS zamanı.
- ESP32 olaylarında `esp_micros` kartın açılıştan beri mikrosaniyesidir; tek başına anlamı yoktur, PPS çapası ile GPS zamanına çevrilir (aşağıda).

## Oturum klasörü

Bir tarama oturumu işleme istasyonuna tek bir klasör olarak gelir. Klasör adı serbesttir; kimlik `session.json`'dan okunur.

```
<oturum>/
  session.json        saha uygulaması + operasyon
  gnss/
    gnss.ubx          ESP32 (SD karttaki /sessions/<session_id>/ klasöründen)
    events.csv        ESP32
    session.json      ESP32
  video/*.mp4         kamera (masaüstü yazılımından dışa aktarılmış equirectangular)
  base/*              operasyon (opsiyonel; baz/CORS RINEX)
  trees.json          operasyon (opsiyonel; normalde veritabanından okunur)
```

| Yol | Üreten | Ne zaman | Zorunlu |
| --- | --- | --- | --- |
| `session.json` | Saha uygulaması yazar, operasyon tamamlar | Oturum başlatılırken; operasyon işlemeden önce eksik alanları doldurur | Evet |
| `gnss/gnss.ubx`, `gnss/events.csv`, `gnss/session.json` | ESP32 GNSS kaydedici | Kayıt sırasında SD karta; operasyon kartın `/sessions/<session_id>/` klasörünü olduğu gibi `gnss/` altına kopyalar | Evet |
| `video/*.mp4` | 360° kamera → operasyon | Kameranın masaüstü yazılımıyla equirectangular (2:1) dışa aktarılır; birden çok parça dosya adı sırasıyla ardışık kabul edilir | Evet |
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
| `esp_micros` | Olayın ESP32 açılıştan beri mikrosaniyesi |
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
| `sd_error` | `gnss_write`, `events_write` ya da `sd_full` |

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
| `stop_reason` | str | `command`, `sd_full`, `sd_error` |
| `gnss_bytes` | int | `gnss.ubx`'e yazılan bayt |
| `dropped_bytes` | int | Tampon taşmasıyla atılan bayt |

ESP32 kamera yüksekliğini, kalibrasyonu ya da personeli bilmez; bu dosyaya eklenmez.

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
| `camera_height_m` | float | Operasyon (kalibrasyondan) | Hayır, vars. 2,0 | Kamera merceğinin zeminden yüksekliği. Yoksa hat uyarı verir |
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

- Cihaz adı `orchados-gnss-XXXX`; servis `cdee0001-…`, durum `cdee0002-…` (read/notify, 39 bayt, sürüm 1), komut `cdee0003-…` (write). Tüm alanlar little-endian; uygulama MTU ≥ 247 ister.
- **Durumda GPS zamanı:** Ofset 31'de `gps_time_ns` (u64): mesajın oluşturulduğu anın GPS zamanı, `çapa_gps + (şimdi − çapa_micros) × 1000`; PPS eşlemesi yoksa `0` (bu durumda `flags` bit3 de 0'dır). Firmware 0.2.0'dan itibaren gönderilir; 0.1.0 31 bayt gönderir. Aynı sürümde alanlar yalnızca sona eklendiği için çözücüler 31 bayt ve üzerini kabul eder; 31 baytlık mesajda alan yok sayılır. Saha uygulaması bu değerle telefon saatinin GPS zamanına ofsetini bulur ve QR'ı GPS zamanıyla gösterir; değer yoksa telefon saati + 18 sn kullanır ve bunu işaretler.
- Komutlar: `start_session(session_id, parcel_id)`, `stop_session`, `mark_event(corner | qr_sync, payload)`. Sonuç durum mesajındaki `last_cmd_seq` / `last_cmd_result` ile izlenir.
- `start_session`'a verilen `session_id` ve `parcel_id`, kök `session.json`'dakilerle aynı olmalıdır (yukarıdaki birleştirme kuralı).

## Medya depolama

Saha fotoğrafları ve işleme hattının ürünleri (panorama, ağaç kesiti vb.) Supabase Storage'daki **özel** `media` alanında tutulur. Ham video ve MCAP gibi büyük ham kayıtlar işleme istasyonunda kalır (`uri` `station://...`).

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

`trajectory` satırlarında `pose` ve konum boştur.

## Ağaç konumları (veritabanından)

İşleme hattı (`run --trees-from-db`) ağaç konumlarını envanterden, ops kullanıcısının belirteciyle PostgREST üzerinden okur (servis anahtarı yok):

| Okunan | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `id`, `parcel_id`, `kind` | `session.json`'daki `session_id`; parsel `session.json`'daki `parcel_id` ile aynı olmalı |
| `public.slot` | `id`, `code`, `position`, `position_uncertainty_m`, `local_x_m`, `local_y_m` | Parselin slotları. `position` PostgREST'ten GeoJSON nokta olarak gelir |
| `public.tree` | `id`, `slot_id` | `status = active` |

- Kesitin `subject.tree_id`'si `tree.id`, `slot_code`'u `slot.code`'dur; yükleme bunu slotun yükleme anındaki aktif ağacıyla yeniden denetler.
- `slot.position` boşsa ağaç kesit almaz (**karar**: yerel koordinattan konum türetilmez). Parselde konumlu aktif ağaç yoksa ya da oturum `kind = inventory` ise hat sadece panorama üretir; bu hata değil, `outputs.json`'da `crops_status` (`no_tree_positions`, `inventory_session`) olarak raporlanır.

## Doğrulama kalemleri

Envanter doğrulama turu (`docs/MVP.md` Modül 2, adım 9) ofiste oluşturulur; saha uygulaması (sonraki sürüm) kalemleri personele görev olarak indirir ve sonuçları yazar. Şema: `docs/veri-modeli.md`, "Doğrulama listesi ve envanter onayı". Saha uygulaması kullanıcının belirteciyle PostgREST üzerinden çalışır (servis anahtarı yok).

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

## Saha uygulaması ve veritabanı

Saha uygulaması (`apps/field`) çevrimdışı çalışır: her kaydı önce telefondaki veritabanına ve gönderim kuyruğuna yazar, bağlantı olunca kuyruğu sırayla gönderir (ayrıntı: [apps/field/README.md](../apps/field/README.md), "Senkronizasyon"). Personelin belirteciyle PostgREST ve Storage üzerinden çalışır (servis anahtarı yok).

**Okunan (günün görevleri):**

| Okunan | Alanlar | Kural |
| --- | --- | --- |
| `public.session` | `id`, `org_id`, `parcel_id`, `kind`, `planned_date`, `lead_user_id` | `status = planned`, `kind` `inventory` ya da `periodic_scan`, `planned_date` ≤ bugün + 7 gün. `lead_user_id` kullanıcı olanlar önce |
| `public.parcel` | `name`, `village`, `estimated_area_m2` | Ziyaretin parseli |
| `public.tree` + `public.slot` | `tree.id`, `slot.code`, `slot.row_no`, `slot.position_no` | Periyodik ziyarette parselin `status = active` ağaçları |
| `public.tree_latest_assessment` | `tree_id`, `overall_class` | Yakın plan listesi: Dikkat, Sorunlu, Kuru olanlar + %10 örneklem (metodoloji bölüm 7) |

- **Karar:** Ziyaret satırında mevsim yok; uygulama mevsimi `planned_date`'in ayından çıkarır (Aralık–Şubat kış, Mart–Mayıs ilkbahar, Haziran–Temmuz yaz, Ağustos–Kasım hasat).
- **Karar:** Telefondaki oturumun kimliği planlanmış ziyaretin `session.id`'sidir; kaydediciye (`start_session`) ve kök `session.json`'a da o gider. Saha personeli `inventory` / `periodic_scan` ziyareti ekleyemez (operasyon planlar), yalnızca günceller.

**Yazılan (gönderim kuyruğu):**

| Telefonda | Sunucuda | Nasıl | Tekrar gönderimde |
| --- | --- | --- | --- |
| Oturum | `public.session` (planlanmış ziyaret) | `update`: `started_at`, `methodology_version`; kayıt durunca `status = captured`, `ended_at`. Yalnızca `status` `planned` ya da `captured` iken | Aynı değerler; ziyaret işlendiyse dokunulmaz |
| Oturum olayı (`session_start`, `qr_sync`, `corner`, `session_stop`) | `public.session_event` | `insert`, kimlik telefondan | `on conflict (id) do nothing` |
| Yakın plan fotoğrafı | `media` alanında `org/<org_id>/parcel/<parcel_id>/<sha256>` + `public.capture` (`kind = photo`, `tree_id`, `uri`, `content_hash`, `started_at` = çekimin GPS zamanından UTC) | Önce dosya, sonra satır. `capture.id` = uuid v5(`<oturum>/<sha256>`). Çekim kodu, yer kodu, `gps_time_ns`, zaman kaynağı ve cihazdaki kalite kontrolü `metadata`'da | Var olan nesne yüklenmiş sayılır; `on conflict (session_id, content_hash) do nothing` |
| Personel cevabı | `public.measurement` (`source = staff`, `method = field_question`, `method_version` = soru seti sürümü) | Evet/hayır → `value_boolean`; `metric_definition_id` metrik kodundan | `on conflict (id) do nothing` |

- **Zaman:** Sunucudaki zaman damgaları UTC'dir; telefonda tutulan GPS zamanı (`gps_time_ms`) 18 sn düşülerek çevrilir. `session_event.gps_time_ns` GPS zamanıdır (bu belgenin "Zaman" bölümü); `time_source = phone` ise değer telefon saatinden türetilmiştir.
- **Karar (oturum olayları):** Olaylar için ayrı, ekleme-yalnız bir tablo açıldı (`public.session_event`: `id`, `org_id`, `parcel_id`, `session_id`, `event_type`, `payload`, `gps_time_ns`, `time_source`, `phone_time`, `logger_result`, `recorded_by`). Gerekçe: (1) her olayın telefonda üretilmiş kimliği var, ayrı satır tekrar gönderimi `on conflict do nothing` ile güvenli kılar; `session` üzerinde bir JSON dizisini güncellemek sıraya ve eşzamanlı yazmaya bağımlı olurdu ve yayımlanmış ziyarette mümkün değil; (2) `capture.metadata` bir dosyaya bağlı, olayların dosyası yok; (3) kaydedicinin `events.csv`'si SD kartla ofise gelir, bu satırlar ise ağdan önce gelir ve kaydedicinin kaçırdığı olayları da taşır: işleme hattı QR eşlemesini iki kaynakla karşılaştırabilir. Okuma yalnızca kurum rolleri; sahip ve izleyici görmez.
- **Karar (metrikler):** Yakın plan sorularının metrikleri kayıtta yoktu; evet/hayır, ağaç, karnede gizli (`card_visibility = hidden`) olarak eklendi: `dead_branch_present`, `trunk_damage_present`, `root_sucker_present`, `pruned`, `frost_damage_present`, `pest_sign_present`, `fruit_present`, `drought_stress_sign`, `theft_sign_present`. Hasat sorularında kayıtlı `harvest_complete` ve `branch_break` kullanılır. Personel cevabı uzmana kanıttır, karnede gösterilmez.
- **Hatalar:** Ağ hatası, zaman aşımı, 5xx/429 ve süresi geçmiş giriş geçicidir (kayıt kuyrukta kalır, artan beklemeyle yeniden denenir). Yetki (`42501`), doğrulama (`23xxx`, `22P02`), bilinmeyen ya da iptal edilmiş ziyaret (`visit_not_found`, `visit_cancelled`), kayıtta olmayan metrik (`unknown_metric`) kalıcıdır: kayıt telefonda "başarısız" diye sebebiyle işaretlenir, kuyruk durmaz.
- **Fotoğraf dosyası** telefondan ancak yükleme, `capture` satırı ve nesnenin varlık kontrolü başarılı olunca silinir.
- **Açık:** Cevap ile kanıt fotoğrafı arasındaki bağ sunucuda yok (`measurement_evidence` yalnızca `asset`'e bağlanır); ikisi aynı oturum ve ağaçla eşleşir.

## Açık noktalar

- Kamera jiroskop verisi (ince zaman eşleme) henüz sözleşmede yok.
