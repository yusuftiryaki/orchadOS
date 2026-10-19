# services/pipeline

İşleme istasyonunda çalışan Python işleme hattı (İP4 çekirdeği). Bir saha oturumunun ham verisinden konumlu panoramalar ve ağaç kesitleri üretir. Veritabanına ve object storage'a yükleme henüz yok; çıktılar yerel bir klasöre ve `outputs.json` manifestine yazılır, yükleme için bir `Uploader` arayüzü vardır.

Bkz. [docs/plan.md](../../docs/plan.md), [docs/teknik-mimari.md](../../docs/teknik-mimari.md), [docs/veri-modeli.md](../../docs/veri-modeli.md).

## Komutlar

```bash
cd services/pipeline
uv sync                                     # bağımlılıklar (numpy, opencv-python-headless, pydantic)
uv run pytest                               # tüm testler (~2 dk)
uv run ruff check . && uv run ruff format --check .

uv run orchados-pipeline synth /tmp/ornek   # sentetik oturum klasörü üret
uv run orchados-pipeline run /tmp/ornek     # tüm aşamalar
uv run orchados-pipeline upload /tmp/ornek.processed/v0.1.0_<hash> --dest /tmp/kova
```

Her aşama ayrıca tek başına çalışır ve bir önceki aşamanın kaydettiği dosyayı okur:

```bash
uv run orchados-pipeline ingest    <oturum> [--out KÖK] [--params params.json]
uv run orchados-pipeline position  <oturum> ...
uv run orchados-pipeline sync      <oturum> ...
uv run orchados-pipeline frames    <oturum> ...
uv run orchados-pipeline panoramas <oturum> ...
uv run orchados-pipeline crops     <oturum> [--trees agaclar.json] ...
uv run orchados-pipeline outputs   <oturum> ...
uv run orchados-pipeline params    [--hash]   # varsayılan parametreler
```

RTKLIB (`convbin`, `rnx2rtkp`) ve ffmpeg `core` devcontainer'ında kurulu. RTKLIB gerektiren test, araç yoksa atlanır.

## Girdi: oturum klasörü

Oturum klasörünün yapısı, `session.json` (kök, saha uygulaması + operasyon), `gnss/session.json` (ESP32), `gnss/events.csv` (İP2 biçimi, altı sütun) ve QR saat kodu biçimi bileşenler arası sözleşmedir; tek kaynağı **[docs/arayuzler.md](../../docs/arayuzler.md)**.

```
<oturum>/
  session.json        kök oturum dosyası: session_id, parcel_id (zorunlu); camera_height_m,
                      camera_yaw_offset_deg, rig_id, calibration_id, ... (opsiyonel)
  gnss/gnss.ubx       ESP32 kaydedicisinden ham UBX (NAV-PVT ve/veya RXM-RAWX/SFRBX)
  gnss/events.csv     ESP32 olayları, İP2 biçimi
  gnss/session.json   ESP32 oturum dosyası
  video/*.mp4         equirectangular 360° video (2:1), bir ya da birden çok parça
  base/*              (opsiyonel) baz/CORS RINEX gözlem ve navigasyon dosyaları
  trees.json          (opsiyonel) ağaç konumları; --trees ile başka yerden de verilebilir
```

Hattın bu sözleşmeye özgü davranışı (ayrıntı `docs/arayuzler.md`'de):

- `events.csv` başlıklı altı sütunlu biçimde okunur (`events.py`); eski dört sütunlu biçim açık hatayla reddedilir. `gps_time_ns` boş ama PPS çapası doluysa zaman çapadan yeniden hesaplanır ve olay `gps_time_derived` olarak işaretlenir.
- İki `session.json` ayrı modellerle okunur (`SessionInfo`, `LoggerSession`) ve `manifest.json`'da `session` ve `logger` olarak durur. `session_id` / `parcel_id` uyuşmazlığı (ve `session_start` olayındaki parselin uyuşmazlığı) ingest hatasıdır.
- `qr_sync` olaylarının payload'ındaki QR değeri olayın GPS zamanıyla ve videodaki QR okumalarıyla karşılaştırılır; sonuç `sync.json`'da `qr_sync_checks` olarak yazılır, büyük farklar uyarı verir.
- Video parçaları dosya adı sırasıyla, kesintisiz ardışık bölümler olarak kabul edilir; kamera saati parçalar boyunca sürer.
- `base/` içindeki dosyalar uzantıya değil RINEX başlığına göre (gözlem / navigasyon) sınıflandırılır.
- `trees.json`: `[{"tree_id", "slot_code", "lat", "lon"}]` ya da `{"trees": [...]}`. İP1'den sonra veritabanından gelecek.

Sözleşme testleri (`tests/test_contract.py`) İP2 README'sindeki örnek `events.csv` ve `session.json` bloklarını `tests/data/ip2_readme_*` kopyalarından okur ve kopyaların README ile birebir aynı kaldığını denetler. Sentetik oturum üretici (`synth`) de bu biçimleri üretir.

## Aşamalar

| Aşama | Ne yapar | Çıktı |
| --- | --- | --- |
| `ingest` | Klasörü doğrular; her dosyanın SHA-256'sını, boyutunu ve rolünü yazar. Eksik ya da bozuk girdilerin hepsi tek bir hatada listelenir. | `manifest.json` |
| `position` | Baz verisi varsa RTKLIB ile PPK (`convbin` UBX → RINEX, `rnx2rtkp` kinematik çözüm), `.pos` ayrıştırılır. Baz yoksa NAV-PVT'den yörünge, `ppk_status: no_ppk`. PPK sonuç vermezse NAV-PVT'ye düşer, `ppk_failed` (parametreyle kapatılabilir). | `trajectory.json`, `ppk/` |
| `sync` | Videonun başındaki ve sonundaki QR kodlarını okur, kamera saati → GPS zamanı için ofset ve doğrusal kayma (ppm) hesaplar; aykırı okumaları MAD ile eler. | `sync.json` |
| `frames` | Aday kareleri (vars. 5 kare/sn) çıkarır; konumu yörüngeden zaman enterpolasyonuyla, yönü hareket yönünden bulur; Laplacian varyansıyla netlik skoru verir; yörünge boyunca her 3,5 m'lik dilimde en net kareyi seçer. Medyanın %35'inden bulanık kareler seçilemez. | `frames.json` |
| `panoramas` | Seçilen kareleri 4K (3840×1920) ve 2K (1920×960) WebP olarak, her biri için yan dosya JSON'la yazar. | `panoramas/` |
| `crops` | Her ağaç için yakın panoramalardan (1–12 m) açı ve mesafeyi hesaplar, ağaca bakan gnomonik kesit çıkarır, dört ana yönün her birinden en iyisini 1024×1024 JPEG ve yan dosya JSON olarak yazar. | `crops/` |
| `outputs` | Tüm çıktıları türleri, hash'leri, kaynakları (lineage) ve hat sürümüyle listeler. | `outputs.json` |

Hat ayrıca şunları içerir ama sahada henüz kullanmaz:
- `sync.estimate_lag()`: iki açısal hız sinyali (1 boyutlu ya da N×3) arasındaki gecikmeyi FFT ile normalize çapraz korelasyon ve parabolik alt-örnek inceltmeyle bulur (ince zaman eşleme). `sync.heading_rate_signal()` LiDAR'sız kitte referans olarak GNSS izinden yön değişim hızını üretir.
- `imaging.ImageFilter`: panoramalar yazılmadan önce uygulanacak süzgeçler (yüz bulanıklaştırma vb.) için arayüz.

## Çıktı klasörü ve sürümleme

Varsayılan çıktı kökü oturum klasörünün yanındaki `<oturum>.processed/` klasörüdür (`--out` ile değişir). Her çalıştırma şuraya yazar:

```
<kök>/v<hat sürümü>_<parametre hash'inin ilk 12 hanesi>/
  params.json manifest.json trajectory.json sync.json frames.json
  panoramas.json panoramas/pano-<gps_ms>_4k.webp, _2k.webp, .json
  crops.json crops/<tree_id>_<N|E|S|W>.jpg, .json
  outputs.json  ppk/ (yalnızca baz verisi varsa)
```

- Başka bir sürüm ya da parametreyle yeniden işlemek yeni bir klasör açar; eski sonuçlar silinmez.
- Aynı girdi ve parametrelerle tekrar çalıştırmak bayt bayt aynı çıktıyı üretir. Çıktılarda işlem anının zaman damgası yoktur. Bu, testlerde doğrulanır.
- Parametre hash'i, tüm parametrelerin kanonik JSON'unun SHA-256'sıdır (`orchados-pipeline params --hash`).

### outputs.json

[veri-modeli.md](../../docs/veri-modeli.md)'deki Capture/Asset ayrımını izler:

- `captures`: ham girdiler. `capture_id` dosyanın SHA-256'sı; `kind`: `session_meta`, `logger_session`, `gnss_raw`, `gnss_events`, `video`, `base_obs`, `base_nav`.
- `assets`: türetilmiş dosyalar. `asset_id` dosyanın SHA-256'sı; `kind`: `manifest`, `trajectory`, `time_sync`, `frame_selection`, `panorama`, `panorama_preview`, `tree_crop`. Her birinde `file` (yol, hash, boyut, medya türü, piksel boyutu), varsa `sidecar`, `pose` (WGS84, EPSG:4979, yön, yatay belirsizlik, çözüm kalitesi), `gps_time_ns`, `quality_score`, ağaç kesitlerinde `subject` (tree_id, slot_code, yön), `derived_from` (kaynak capture'lar ve üst asset'ler) ve `producer_stage`.
- `pipeline`: ad, sürüm, parametre hash'i ve parametrelerin kendisi.

### Panorama yan dosyası (`pano-<gps_ms>.json`)

`panorama_id`, `session_id`, `gps_time_ns`, `utc`, `pose` (lat, lon, height_m elipsoidal, heading_deg, sd_h_m, quality), `quality_score`, `sharpness`, `source_video` + `source_video_sha256`, `frame_index`, `camera_s`, `image` ve `preview` (hash'leriyle), `filters_applied`, `producer` (hat, sürüm, parametre hash'i, aşama).

Panorama kuralı: orta sütun `heading_deg` yönüne bakar; azimut sağa doğru (yukarıdan bakınca saat yönünde) artar; üst satır zenit, alt satır nadirdir. `heading_deg` = hareket yönü + `camera_yaw_offset_deg` (kamera önü hareket yönüne hizalı varsayılır; değilse session.json ya da parametreyle düzeltilir).

`quality_score` (v0): `min(1, netlik / medyan netlik) × konum katsayısı` (fix 1,0; float 0,7; dgps 0,5; single 0,4).

### Kesit yan dosyası (`<tree_id>_<yön>.json`)

`tree_id`, `slot_code`, `direction` (kameranın ağacın hangi tarafında olduğu: `N` = kuzeyden bakış), `panorama_id`, `panorama_sha256`, `distance_m`, `azimuth_deg` (kameradan ağaca, kuzeyden saat yönünde), `yaw_in_panorama_deg`, `pitch_deg`, `fov_deg`, `score`, `image`, `producer`.

Kesit seçimi: her yönde `exp(-((d − 4 m) / 3 m)²) × (0,5 + 0,5 × quality_score)` skoru en yüksek panorama. Kesit merkezi zeminden 1,5 m yükseklikteki gövde/taç noktasına bakar; görüş açısı 5 m'lik tacı sığdıracak şekilde 50°–110° arasında seçilir.

## Zaman

Hattaki tüm zamanlar **GPS zamanı, GPS başlangıcından (1980-01-06 00:00:00) bu yana tam sayı nanosaniye**dir (artık saniye yok). UTC yalnızca gösterim için yazılır (GPS − UTC = 18 s, 2017'den beri).

- NAV-PVT'de zaman `iTOW`'dan alınır; GPS haftası UTC tarih alanlarından çözülür.
- `.pos` dosyasında hem `hafta + TOW` hem takvim biçimi, hem GPST hem UTC okunur. Hattın ürettiği yapılandırma GPST + TOW yazar.
- Kamera saati: `gps_ns = offset_ns + kamera_s × 1e9 × (1 + drift_ppm × 1e-6)`; `kamera_s`, ilk video parçasının ilk karesinden itibaren `kare_no / fps`.

## QR zaman kodu biçimi

Biçim (`OQ1:<gps_time_ms>[:<oturum_etiketi>]`), yenileme hızı ve saha uygulaması kuralları: [docs/arayuzler.md → QR saat kodu](../../docs/arayuzler.md#qr-saat-kodu). Hattın tarafı:

- Okunan değere yenileme aralığının yarısı (`sync.qr_refresh_ms / 2`) ve varsa `sync.qr_display_latency_ms` eklenir. Etiketi başka oturuma ait QR'lar elenir.
- Hat, okunan her kare için (kamera zamanı, GPS zamanı) çifti çıkarır ve doğrusal uydurma yapar. Başlangıç ve bitişin ikisinde de QR varsa kayma da hesaplanır, yoksa sadece ofset (`qr_offset_only`). Hiç QR okunamazsa hat durur; `sync.manual_offset_ns` parametresiyle elle ofset verilebilir.
- `qr_sync` olayları uydurmada kullanılmaz, yalnızca çapraz kontrol içindir (`qr_sync_checks`; eşikler `sync.qr_event_max_diff_ms`, `sync.qr_event_video_max_gap_s`).

## Parametreler

Tüm parametreler `params.py`'de tanımlıdır; `--params dosya.json` ile kısmen ya da tamamen değiştirilir. Örnek:

```json
{"frames": {"slice_m": 4.0}, "sync": {"qr_search_s": 30}}
```

## Bilinen sınırlar

- **Stitch yok:** Girdi kameranın masaüstü yazılımından dışa aktarılmış equirectangular MP4'tür; `.insv` işlenmez.
- **Yüz bulanıklaştırma ve ağaç tespiti yok:** Sadece `ImageFilter` arayüzü var. Bulanıklaştırılmamış panoramalar `outputs.json`'da uyarıyla işaretlenir ve buluta çıkmamalıdır.
- **Gerçek yükleme yok:** `LocalUploader` dosyaları içerik hash'iyle yerel bir klasöre ve `outputs.json`'ı `sessions/<oturum>/<çalıştırma>/` altına yazar. Gerçek uygulama (R2 + API) İP1 şemasından sonra.
- **Kamera jiroskop verisi okunmuyor:** İnce eşleme fonksiyonu sentetik sinyallerle test edildi; dosyadan okuma sonraya kaldı.
- **QR ile kayma tahmini kısa kayıtlarda zayıf:** 100 ms yenilemede tek okumanın belirsizliği ~±50 ms; her uçta ~30 okumayla ofset birkaç ms, kayma ancak uzun kayıtlarda (≥10 dk) anlamlı. Sentetik testteki 40 sn'lik videoda kayma ölçülemez; uydurma uzun bir sentetik seriyle ayrıca test edilir.
- **Video parçaları arasında boşluk yok varsayımı:** Kamera kaydı böldüğünde parçaların kesintisiz olduğu varsayılır. Sabit kare hızı varsayılır.
- **Video baştan sona çözülür:** Kare doğruluğu için arama yerine sıralı okuma kullanılır; 2 saatlik 5,7K videoda süre pilotta ölçülmeli. Gerekirse ffmpeg ile donanım hızlandırmalı çözme eklenebilir.
- **Yön, hareket yönünden çıkar:** Dururken son bilinen yön kullanılır; dönüşlerde ±1 sn pencere nedeniyle yön yumuşar. Kameranın gerçek yönelimi (jiroskop) henüz kullanılmıyor.
- **PPK tek baz dosyasıyla:** Birden çok baz gözlem dosyası varsa ilki kullanılır; Hatanaka (`.crx`) ve sıkıştırılmış RINEX desteklenmez. Anten–kamera kolu (ofseti) uygulanmıyor; anten ve kamera aynı direkte kabul edilir.
- **Yerel düzlem yaklaşımı:** Mesafe ve açılar parsel ölçeğinde (birkaç yüz metre) yerel doğu/kuzey düzleminde hesaplanır.
- **Yörünge JSON olarak tutulur;** teknik mimarideki Parquet biçimi sonra.
