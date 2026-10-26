# services/pipeline

İşleme istasyonunda çalışan Python işleme hattı (İP4). Bir saha oturumunun ham verisinden konumlu panoramalar ve ağaç kesitleri üretir, çıktıları yerel bir klasöre ve `outputs.json` manifestine yazar, sonra Supabase'e yükler (kayıtlar veritabanına, dosyalar `media` depolama alanına; bkz. [Yükleme](#yükleme)).

Bkz. [docs/plan.md](../../docs/plan.md), [docs/teknik-mimari.md](../../docs/teknik-mimari.md), [docs/veri-modeli.md](../../docs/veri-modeli.md).

## Komutlar

```bash
cd services/pipeline
uv sync                                     # bağımlılıklar (numpy, opencv-python-headless, pydantic, httpx)
uv run pytest                               # tüm testler (~8 dk); Supabase kapalıysa entegrasyon testleri atlanır
uv run ruff check . && uv run ruff format --check .

uv run orchados-pipeline synth /tmp/ornek   # sentetik oturum klasörü üret (--session-id, --parcel-id)
uv run orchados-pipeline run /tmp/ornek     # tüm aşamalar
uv run orchados-pipeline run /tmp/ornek --trees-from-db   # ağaç konumları veritabanından
uv run orchados-pipeline upload /tmp/ornek.processed/v0.1.0_<hash> --session-id <uuid>   # Supabase'e
uv run orchados-pipeline run /tmp/ornek --boundary          # ayrıca köşelerden sınır sürümü (veritabanı)
```

Her aşama ayrıca tek başına çalışır ve bir önceki aşamanın kaydettiği dosyayı okur:

```bash
uv run orchados-pipeline ingest    <oturum> [--out KÖK] [--params params.json]
uv run orchados-pipeline position  <oturum> ...
uv run orchados-pipeline sync      <oturum> ...
uv run orchados-pipeline frames    <oturum> ...
uv run orchados-pipeline panoramas <oturum> ...
uv run orchados-pipeline crops     <oturum> [--trees agaclar.json | --trees-from-db [--session-id <uuid>]] ...
uv run orchados-pipeline coverage  <oturum> [--trees agaclar.json | --trees-from-db [--session-id <uuid>]] ...
uv run orchados-pipeline presence  <oturum> ...
uv run orchados-pipeline outputs   <oturum> ...
uv run orchados-pipeline boundary  <oturum> [--session-id <uuid>] [--dry-run]   # köşelerden sınır
uv run orchados-pipeline params    [--hash]   # varsayılan parametreler
uv run orchados-pipeline run       <oturum> [--trees-from-db] --upload --session-id <uuid> [yükleme seçenekleri]
uv run orchados-pipeline synth     <klasör> --trees-from-db --parcel-id <uuid> [--rows 1-2] [--positions 1-5]
uv run orchados-pipeline synth     <klasör> --boundary-walk   # taramadan önce sınır yürüyüşü
uv run orchados-pipeline synth     <klasör> --missing S1-2,S3-4 --planted S2-7 --skip-aisle 1   # kapsama ve var/yok sınaması
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
  trees.json          (opsiyonel) ağaç konumları; --trees ile başka yerden de verilebilir,
                      --trees-from-db ile veritabanından okunur
```

Hattın bu sözleşmeye özgü davranışı (ayrıntı `docs/arayuzler.md`'de):

- `events.csv` başlıklı altı sütunlu biçimde okunur (`events.py`); eski dört sütunlu biçim açık hatayla reddedilir. `gps_time_ns` boş ama PPS çapası doluysa zaman çapadan yeniden hesaplanır ve olay `gps_time_derived` olarak işaretlenir.
- İki `session.json` ayrı modellerle okunur (`SessionInfo`, `LoggerSession`) ve `manifest.json`'da `session` ve `logger` olarak durur. `session_id` / `parcel_id` uyuşmazlığı (ve `session_start` olayındaki parselin uyuşmazlığı) ingest hatasıdır.
- `qr_sync` olaylarının payload'ındaki QR değeri olayın GPS zamanıyla ve videodaki QR okumalarıyla karşılaştırılır; sonuç `sync.json`'da `qr_sync_checks` olarak yazılır, büyük farklar uyarı verir.
- Video parçaları dosya adı sırasıyla, kesintisiz ardışık bölümler olarak kabul edilir; kamera saati parçalar boyunca sürer.
- `base/` içindeki dosyalar uzantıya değil RINEX başlığına göre (gözlem / navigasyon) sınıflandırılır.
- `trees.json`: `[{"tree_id", "slot_code", "lat", "lon"}]` ya da `{"trees": [...], "empty_slots": [{"slot_code", "lat", "lon"}]}` (boş yerler isteğe bağlı). Gerçek kullanımda ağaç konumları veritabanından gelir (`--trees-from-db`, bkz. [Ağaç konumları veritabanından](#ağaç-konumları-veritabanından)).

Sözleşme testleri (`tests/test_contract.py`) İP2 README'sindeki örnek `events.csv` ve `session.json` bloklarını `tests/data/ip2_readme_*` kopyalarından okur ve kopyaların README ile birebir aynı kaldığını denetler. Sentetik oturum üretici (`synth`) de bu biçimleri üretir.

## Aşamalar

| Aşama | Ne yapar | Çıktı |
| --- | --- | --- |
| `ingest` | Klasörü doğrular; her dosyanın SHA-256'sını, boyutunu ve rolünü yazar. Eksik ya da bozuk girdilerin hepsi tek bir hatada listelenir. | `manifest.json` |
| `position` | Baz verisi varsa RTKLIB ile PPK (`convbin` UBX → RINEX, `rnx2rtkp` kinematik çözüm), `.pos` ayrıştırılır. Baz yoksa NAV-PVT'den yörünge, `ppk_status: no_ppk`. PPK sonuç vermezse NAV-PVT'ye düşer, `ppk_failed` (parametreyle kapatılabilir). | `trajectory.json`, `ppk/` |
| `sync` | Videonun başındaki ve sonundaki QR kodlarını okur, kamera saati → GPS zamanı için ofset ve doğrusal kayma (ppm) hesaplar; aykırı okumaları MAD ile eler. | `sync.json` |
| `frames` | Aday kareleri (vars. 5 kare/sn) çıkarır; konumu yörüngeden zaman enterpolasyonuyla, yönü hareket yönünden bulur; Laplacian varyansıyla netlik skoru verir; yörünge boyunca her 3,5 m'lik dilimde en net kareyi seçer. Medyanın %35'inden bulanık kareler seçilemez. | `frames.json` |
| `panoramas` | Seçilen kareleri 4K (3840×1920) ve 2K (1920×960) WebP olarak, her biri için yan dosya JSON'la yazar. | `panoramas/` |
| `crops` | Her ağaç için yakın panoramalardan (1–12 m) açı ve mesafeyi hesaplar, ağaca bakan gnomonik kesit çıkarır, dört ana yönün her birinden en iyisini 1024×1024 JPEG ve yan dosya JSON olarak yazar. Konumu olan boş yerler için de aynı kesitleri çıkarır (`crops/slot_<kod>_<yön>.jpg`, `crops.json` → `slot_crops`; var/yok kontrolü için). Kullandığı ağaç listesini çalıştırma klasörüne `trees.json` olarak kaydeder. Envanter oturumunda ve konumu olmayan parselde kesit üretmez (durum `crops.json`'da). | `crops/`, `trees.json` |
| `coverage` | Kapsama kalite kapısı: her aktif ağaç hangi yönlerden ve ne kadar iyi görüldü, parselde kapsanan ağaç oranı ve eşik, kör nokta hücreleri. Ayrıntı: [Kapsama raporu](#kapsama-raporu) | `coverage.json` |
| `presence` | Ağaç var/yok: kesitlerde ağaç görünüyor mu (`tree_visible`: evet / hayır / belirsiz), boş yerlerde fidan sinyali. Ayrıntı: [Ağaç var/yok kontrolü](#ağaç-varyok-kontrolü) | `presence.json` |
| `outputs` | Tüm çıktıları türleri, hash'leri, kaynakları (lineage) ve hat sürümüyle listeler. | `outputs.json` |
| `boundary` | Oturumun köşe olaylarını veritabanından okur, köşeleri yörüngeden konumlar, poligonu denetler ve parselin yeni sınır sürümünü yazar (`run --boundary` ile de çalışır). Ayrıntı: [Sınır köşelerinden sınır sürümü](#sınır-köşelerinden-sınır-sürümü) | `boundary.json` |

Hat ayrıca şunları içerir ama sahada henüz kullanmaz:
- `sync.estimate_lag()`: iki açısal hız sinyali (1 boyutlu ya da N×3) arasındaki gecikmeyi FFT ile normalize çapraz korelasyon ve parabolik alt-örnek inceltmeyle bulur (ince zaman eşleme). `sync.heading_rate_signal()` LiDAR'sız kitte referans olarak GNSS izinden yön değişim hızını üretir.

## Çıktı klasörü ve sürümleme

Varsayılan çıktı kökü oturum klasörünün yanındaki `<oturum>.processed/` klasörüdür (`--out` ile değişir). Her çalıştırma şuraya yazar:

```
<kök>/v<hat sürümü>_<parametre hash'inin ilk 12 hanesi>/
  params.json manifest.json trajectory.json sync.json frames.json
  panoramas.json panoramas/pano-<gps_ms>_4k.webp, _2k.webp, .json
  trees.json crops.json crops/<tree_id>_<N|E|S|W>.jpg, .json  crops/slot_<kod>_<yön>.jpg, .json
  coverage.json presence.json
  outputs.json  ppk/ (yalnızca baz verisi varsa)
  boundary.json (yalnızca boundary aşaması çalıştıysa)
```

- Başka bir sürüm ya da parametreyle yeniden işlemek yeni bir klasör açar; eski sonuçlar silinmez.
- Aynı girdi ve parametrelerle tekrar çalıştırmak bayt bayt aynı çıktıyı üretir. Çıktılarda işlem anının zaman damgası yoktur. Bu, testlerde doğrulanır.
- Parametre hash'i, tüm parametrelerin kanonik JSON'unun SHA-256'sıdır (`orchados-pipeline params --hash`).

### outputs.json

[veri-modeli.md](../../docs/veri-modeli.md)'deki Capture/Asset ayrımını izler:

- `captures`: ham girdiler. `capture_id` dosyanın SHA-256'sı; `kind`: `session_meta`, `logger_session`, `gnss_raw`, `gnss_events`, `video`, `base_obs`, `base_nav`.
- `assets`: türetilmiş dosyalar. `asset_id` dosyanın SHA-256'sı; `kind`: `manifest`, `trajectory`, `time_sync`, `frame_selection`, `panorama`, `panorama_preview`, `tree_crop`. Her birinde `file` (yol, hash, boyut, medya türü, piksel boyutu), varsa `sidecar`, `pose` (WGS84, EPSG:4979, yön, yatay belirsizlik, çözüm kalitesi), `gps_time_ns`, `quality_score`, ağaç kesitlerinde `subject` (tree_id, slot_code, yön), `derived_from` (kaynak capture'lar ve üst asset'ler) ve `producer_stage`.
- `pipeline`: ad, sürüm, parametre hash'i ve parametrelerin kendisi.
- `crops_status`: `crops.json`'daki durum (`ok`, `no_tree_positions`, `inventory_session`); ağaç listesi verilmediyse `null`.

### Panorama yan dosyası (`pano-<gps_ms>.json`)

`panorama_id`, `session_id`, `gps_time_ns`, `utc`, `pose` (lat, lon, height_m elipsoidal, heading_deg, sd_h_m, quality), `quality_score`, `sharpness`, `source_video` + `source_video_sha256`, `frame_index`, `camera_s`, `image` ve `preview` (hash'leriyle), `producer` (hat, sürüm, parametre hash'i, aşama).

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

## Yükleme

`orchados-pipeline upload <çalıştırma klasörü> --session-id <uuid>` bir çalıştırmanın çıktılarını Supabase'e yükler. `--session-id` veritabanındaki `public.session` satırıdır; kurum ve parsel bu satırdan okunur. `outputs.json`'daki `session_id` ve `parcel_id` bu satırla aynı olmalıdır (saha uygulaması `session.json`'a veritabanı kimliğini yazar), değilse hiçbir şey yazılmadan hata verilir. `run --upload --session-id <uuid>` işlemenin ardından aynısını yapar.

### Kimlik

Hat, operasyon (`ops`) rolündeki bir kullanıcının e-posta ve parolasıyla oturum açar ve her istekte o kullanıcının belirtecini gönderir; satır bazlı yetki kuralları ve depolama kuralları geçerlidir. **Servis anahtarı kullanılmaz.** Ortam değişkenleri (değerler repoya girmez; `.env` kök `.gitignore`'da):

```bash
# services/pipeline/.env (örnek, değersiz)
SUPABASE_URL=
SUPABASE_ANON_KEY=
ORCHADOS_EMAIL=
ORCHADOS_PASSWORD=
```

```bash
set -a && . ./.env && set +a
uv run orchados-pipeline upload ../../data/s.processed/v0.1.0_<hash> --session-id <uuid>
```

Yerelde: `pnpm db:status` adresi ve anahtarı verir; kullanıcı `ops@example.com`, parola `orchados-dev`.

### Ne yüklenir

| Ne | Nereye | Ayrıntı |
| --- | --- | --- |
| Ham kayıtlar: 360° video, UBX, `events.csv`, iki `session.json`, baz RINEX | Sadece `capture` satırı; dosya ham veri deposunda ya da istasyonda kalır | Oturum `orchados-ingest pull` ile depodan geldiyse (`<oturum>/.orchados/manifest.json` içinde `location`) `uri` deponun adresidir: `s3://<kova>/raw/<org>/<parcel>/<oturum>/video/VID_0001.mp4`, `az://...`, `file://...`. Yerel klasörde ve manifestte aynı hash'le bulunmayan dosyada `uri` = `station://<istasyon>/<mutlak yol>`, ör. `station://ist-01/data/oturumlar/s/video/VID_0001.mp4` (ikincisinde uyarı). Kurallar: [arayuzler.md → Ham kayıtların adresi](../../docs/arayuzler.md#ham-kayıtların-adresi-captureuri). İstasyon adı `--station` (varsayılan: makine adı); oturum klasörü `--session-dir` (varsayılan: `<oturum>.processed` klasörünün yanındaki `<oturum>`). Türler: `video_360`, `gnss_raw` (UBX ve RINEX), diğerleri `other`; dosyanın rolü `metadata.role`'da. `started_at`: video için QR saat modelinden, diğerleri için kaydedicinin başlangıcı |
| Panorama önizlemesi (2K) | `asset` + `media` alanı | `kind = panorama`, `pose.variant = preview` |
| Tam panorama (4K) | `asset` + `media` alanı | `kind = panorama`, `pose.variant = full`. **Varsayılan olarak yüklenmez** |
| Ağaç kesiti | `asset` + `media` alanı | `kind = tree_crop`, `tree_id` slot koduyla bulunur (aşağıda) |
| Boş yer kesiti | `asset` + `media` alanı | `kind = tree_crop`, `tree_id` boş, `pose.subject = slot`, `pose.slot_id`, `pose.slot_code`. Yer hâlâ boşsa yüklenir; o arada ağaç girdiyse uyarıyla atlanır |
| Yörünge (`trajectory.json`) | `asset` + `media` alanı | `kind = trajectory` |
| Kapsama özeti (`coverage.json`) | `coverage_report` satırı | `record_coverage_report()`; eşiğin altındaysa ya da kör nokta varsa veritabanı bir ek ziyaret isteği açar. [Kapsama raporu](#kapsama-raporu) |
| Var/yok sonuçları (`presence.json`) | `measurement` (+ `measurement_evidence`) | `record_tree_presence()`: ağaç başına `tree_visible`, kaynak `algorithm`, kesitler kanıt; boş yerde yalnız "evet". Kesitler (`tree_crop`) yüklenmiyorsa yazılmaz |
| `manifest.json`, `sync.json`, `frames.json`, yan dosya JSON'ları | Yüklenmez | İç ara çıktılar; içerikleri `capture`/`asset` satırlarına ve `pose` alanına aktarılır |

- **Nesne adı:** `org/<org_id>/parcel/<parcel_id>/<sha256>`, `asset.uri` = `storage://media/` + bu ad ([arayuzler.md → Medya depolama](../../docs/arayuzler.md#medya-depolama)). `pose` alanları: [arayuzler.md → Asset `pose` alanı](../../docs/arayuzler.md#asset-pose-alanı).
- **Seçim:** `--only preview,tree_crop,trajectory` (varsayılan). Türler: `panorama` (4K), `preview` (2K), `tree_crop`, `trajectory`.
- **Lineage:** `outputs.json`'daki `derived_from` → `asset_source`. Kaydedilmeyen üst öğeler (iç JSON'lar, seçilmeyen türler) atlanır. Önizleme ← video + yörünge; kesit ← tam panorama, o yüklenmediyse aynı karenin önizlemesi (`pose.panorama_asset_id` de aynı kuralla).
- **Ağaç eşleme:** Kesitin `slot_code`'u (ör. `S5-12a`) parseldeki `slot.code` ile, slot da aktif `tree` kaydıyla eşleştirilir. Elle verilen `trees.json`'daki `tree_id` kullanılmaz. Kesitler veritabanından okunan ağaçlarla kesildiyse (`crops.json` → `trees_source: database`) kesitteki `tree_id` de slotun bugünkü aktif ağacıyla aynı olmalıdır; işlemeden sonra slota yeni bir ağaç girdiyse kesit yüklenmez ("active tree changed since processing" uyarısı). `upload --trees-from-db` kesitlerin veritabanı ağaçlarıyla kesilmiş olmasını şart koşar; değilse hiçbir şey yazmadan hata verir. Eşleşmeyen kesit yüklenmez, raporda uyarı olarak listelenir.
- **Sıra:** capture → asset (dosya, satır, lineage) → kapsama özeti → var/yok ölçümleri → oturum durumu.
- **Oturum durumu:** Yükleme tamamlanınca `planned` ya da `captured` olan oturum `processed` olur; `processed`, `in_review`, `published` (ve `cancelled`) değiştirilmez.

### Tekrar çalıştırma

- Aynı çalıştırmayı ikinci kez yüklemek hiçbir şey eklemez: var olan nesneler atlanır (klasör listesiyle), `capture` oturum + `content_hash` ile, `asset` oturum + `content_hash` + `pipeline_version` ile bulunur, eksik lineage satırları tamamlanır.
- Sıra her asset için dosya → satır → lineage'dır; yarıda kesilen yükleme aynı komutla kaldığı yerden tamamlanır. Oturum durumu en sonda değişir.
- Hat sürümü değişip yeniden işlenince yeni `asset` satırları eklenir, eski sürümün satırları kalır. Bayt bayt aynı dosya depoda tek nesnedir; satırlar onu paylaşır. Bunun için şemada içerik hash'i kurum başına değil, `capture`'da oturum başına, `asset`'te oturum + hat sürümü başına benzersizdir (`supabase/migrations/20261020160000_content_hash_per_session.sql`). Aynı sürümde yalnızca parametreleri farklı bir çalıştırmanın aynı dosyası mevcut satırla eşleşir (satırdaki `params_hash` ilk yüklemeninkidir).

### Ağaç konumları veritabanından

`run --trees-from-db` (ayrıca `crops --trees-from-db`) kesitleri envanterdeki ağaçlara göre keser:

- Kimlik yüklemedekiyle aynıdır: ops kullanıcısıyla oturum açılır (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORCHADOS_EMAIL`, `ORCHADOS_PASSWORD`); servis anahtarı yok, satır bazlı yetki kuralları geçerli (`trees_db.py`).
- Oturum `session.json`'daki `session_id` ile (ya da `--session-id`) `public.session`'dan bulunur; parseli `session.json`'daki `parcel_id` ile aynı olmalıdır.
- Parseldeki **aktif** ağaçlar slotlarıyla okunur: `tree_id` = `tree.id`, `slot_code` = `slot.code`, konum = `slot.position` (WGS84), `position_uncertainty_m`, ayrıca bilgi için `local_x_m` / `local_y_m`. Boş slotlar ve kayıp ağaçlar atlanır. Sıra: sıra no, yer no, ek harf.
- Kesitlerin `subject` alanında veritabanındaki `tree_id` ve `slot_code` olur. Okunan liste çalıştırma klasörüne `trees.json` (`orchados.trees/1`, `source: database`) olarak yazılır; aynı klasörden `crops` aşaması tekrar çalıştırılabilir.
- **Kesit üretilmeyen durumlar** hata değildir; sadece panorama üretilir, durum `crops.json`'da `status` ve `outputs.json`'da `crops_status` olarak yazılır, komut özetinde görünür:
  - `inventory_session`: oturum türü `inventory` (veritabanındaki `session.kind` ya da `session.json`'daki `kind`). Envanter taramasının amacı konumları bulmaktır.
  - `no_tree_positions`: parselde konumu olan aktif ağaç yok (envanter öncesi).
- Konumu olmayan tek tek slotlar (`unlocated_slots`) kesit almaz; parselin geri kalanı kesilir ve `outputs.json`'a uyarı düşülür.
- **Karar:** `slot.position` yokken `local_x_m`/`local_y_m`'den konum türetilmez. Yerel koordinatlar ofis aracında konumla birlikte yazılıyor; ayrıca dönüşüm (parsel başlangıcı + sıra azimutu, UTM ızgara yakınsaması ~1°) parsel ölçeğinde metrelerce hata verebilir ve kesiti yanlış ağaca bağlar.

**Sentetik veriyi parsele uydurma:** `synth --trees-from-db --parcel-id <uuid>` sahneyi parseldeki aktif ağaçların gerçek konumlarıyla kurar (`--trees dosya.json` aynısını dosyadan yapar). `--rows 1-2` ve `--positions 1-5` sürülecek sıraları ve sıra içindeki yerleri seçer (iki uç dahil); yol, seçilen her sıranın iki yanındaki ara yollardan (sıra aralığının yarısı kadar yanından) gidip gelir, böylece her ağaç kuzeyden ve güneyden görülür. Sıra yönü sıradaki ilk ve son ağaçtan, sıra aralığı parseldeki sıraların medyan aralığından bulunur. Yakındaki bütün parsel ağaçları çizilir. Seed parselinde `--rows 1-2 --positions 1-5` 136 m'lik yol ve ~74 sn'lik video verir. `--start-utc` ve `--seed` her koşuya ayrı dosya hash'leri sağlar.

## Kapsama raporu

`coverage` aşaması (`coverage.py`) metodolojinin kapsama kalite kapısını hesaplar ([docs/metodoloji.md](../../docs/metodoloji.md) bölüm 10). Kural ve eşikler `params.coverage`'dadır, dolayısıyla parametre hash'ine girer:

| Parametre | Varsayılan | Anlamı |
| --- | --- | --- |
| `min_view_score` | 0,2 | Yeterli bakış: kesit skoru (`crops.view_score`: ideal mesafeye yakınlık × panorama kalitesi) en az bu. Kalite 1'de ~0,2–7,8 m |
| `min_directions` | 2 | Yeterli bakışlar en az bu kadar farklı yönden (N, E, S, W: kameranın ağaca göre yeri) gelmeli … |
| `min_view_spread_deg` | 150 | … ve ikisi arasında ağaçtan bakışta en az bu kadar açı olmalı (karşı yüzler). Tek bir düz koridordan eğik bakışların açısı en çok `2·acos(yanal uzaklık / 7,8 m)`: 8 m sırada 118°. Böylece aynı koridordan 45° eğik bakan "E" kesiti ağacın öbür yüzü sayılmaz |
| `parcel_threshold` | 0,95 | Parselin geçmesi için kapsanan aktif ağaç oranı (uzmanla kesinleşecek) |
| `cell_m`, `blind_spot_min_trees`, `blind_spot_min_share` | 10 m, 2, 0,5 | Kör nokta: en az 2 kapsanmayan ağacı olan ve ağaçlarının en az yarısı kapsanmayan 10×10 m hücre |

- **Bakışlar** kesit aşamasının aday bakışlarıdır (aynı mesafe aralığı, geometri ve skor, `crops.candidate_views`). Kesit dosyası gerekmediği için envanter taraması da (kesit üretilmez) ağaç konumları olunca aynı şekilde ölçülür.
- **Hücreler** yakın plan listesiyle aynı kuraldır ([docs/arayuzler.md → Yakın plan listesi](../../docs/arayuzler.md#yakın-plan-listesi-ve-uzman-istekleri)): parselin en yeni sınırının (yoksa ağaçların) sınırlayıcı kutusunun güneybatı köşesinden doğu/kuzey metre, `x = Δboylam · R · cos(güney)`, `y = Δenlem · R`, R = 6 371 008,8 m. Sınır kutusu `--trees-from-db` ile veritabanından okunur.
- **`coverage.json`:** ağaç başına yönler (kesit skoru ve mesafesi, yeterli mi), yeterli yönler, en iyi kesit skoru, en yakın panorama mesafesi, bakış açısı yayılımı, kapsandı mı, hücresi; parsel özeti (aktif, kapsanan, oran, eşik, sonuç, eksik, kör nokta, ek ziyaret gerekiyor mu); kapsanmayan ağacı olan hücreler (köşeleri, eksik ağaçların yer kodları); kural (parametreler). Konumlu ağaç yoksa `status = no_tree_positions`, özet yok.
- **Yükleme:** özet `coverage_report` tablosuna yazılır (`record_coverage_report`, yalnız ops; ekleme-yalnız; aynı çalıştırma tekrar yüklenirse yeni satır açılmaz, yeniden işleme yeni rapor ekler). Oran, sonuç ve "ek ziyaret gerekiyor" veritabanında sayılardan hesaplanır. Karar ve alanlar: [docs/veri-modeli.md → Kapsama raporu](../../docs/veri-modeli.md#kapsama-raporu).
- **Yeniden tarama görevi:** Rapor eşiğin altındaysa ya da kör nokta varsa veritabanı (tetikleyici) mevcut uzman isteği mekanizmasıyla bir **ek ziyaret isteği** açar: `followup_request`, tür `extra_visit`, kaynak (`origin`) `pipeline`, notunda oran, eksik ağaçlar ve kör nokta hücreleri. Operasyon bunu panoda uzman istekleriyle birlikte, kaynağıyla görür ve bir ziyarete bağlar. Bir ziyaret için tek istek açılır: yeniden işleme ikinci istek açmaz (operasyon iptal etmiş olsa bile); daha yeni rapor eşiği geçerse hâlâ açık olan istek kapanır. Yükleme raporu isteği yazar (`extra visit request <id>: open`).
- **Envanter:** Envanter taramasında kesit yoktur ve ağaç konumları ofis üçgenlemesinden sonra gelir. Envanter kaydedildikten sonra kapsama ayrıca ölçülür ve yüklenir:
  ```bash
  uv run orchados-pipeline coverage <oturum> --trees-from-db   # aynı çalıştırma klasörüne coverage.json
  uv run orchados-pipeline upload <çalıştırma> --session-id <uuid> --trees-from-db
  ```
  Uzmanın envanter onayı (`approve_inventory`) bu raporu denetler (aşağıda).
- **Envanter onayı:** Envanter oturumunun en yeni kapsama raporu eşiğin altındaysa `approve_inventory` reddeder (`inventory_incomplete`, ayrıntı `coverage_below_threshold: <oran>/<eşik>`). Uzman raporu gerekçesiyle kabul edebilir (`waive_coverage`; kim, ne zaman, neden rapora yazılır), o zaman onay geçer. Raporu olmayan oturumda (eski veri) davranış değişmez.

## Ağaç var/yok kontrolü

`presence` aşaması (`presence.py`; yöntem `crop_greenness`, sürüm `0.1.0`) envanterdeki ağaçların hâlâ yerinde olup olmadığını ve boş yerlere dikim yapılıp yapılmadığını kesitlerden basit bir görüntü sinyaliyle denetler (MVP Modül 4, adım 5). Model yok; gövde tespit modeli (`trunk_label` etiketleriyle) ileride bunun yerini alır, o zaman yöntem ve sürüm değişir.

- **Sinyal:** Kesitte bitki örtüsü pikselleri: renklilikte (her kanal / toplam) aşırı yeşil `2g − r − b > 0,10` ve en parlak kanal ≥ 40. Kesit ağacın konumuna bilinen mesafe ve eğimle baktığı için (yan dosya: `distance_m`, `pitch_deg`, `fov_deg`), ağaçta yerden yükseklik ve genişlikle tanımlı kutular piksele izdüşürülür:
  - **üst taç kutusu** (2,5–4,0 m, ±1,5 m): yetişkin ağacın tacı doldurur; bir sonraki sıranın 6–8 m daha uzaktaki ağacı daha alçak ve küçük görünür, buraya yetişmez;
  - **bütün kutu** (0,5–4,0 m, ±1,5 m): ağacın yerindeki her yeşil (arkadaki ağaçlar ve ot dahil).
- **Bakış başına:** üst kutunun ≥ %25'i yeşilse `present`; bütün kutunun ≤ %3'ü yeşilse `absent`; arası `ambiguous`; skoru 0,2'nin altındaki kesit ya da çok karanlık / patlamış kutu `unusable`.
- **Ağaç başına** (`tree_visible`): bir bakış `present` ise **evet**; hiçbir bakış `present` değilse ve en az iki farklı yönden bakış `absent` ise **hayır** (yerinde duran ağaç her yönden kutuyu doldurur; arkadaki ağaç o yönü yalnız `ambiguous` yapar); diğer her durum **belirsiz**. Yanlış "hayır", "belirsiz"den kötüdür: tacı üst kutuya yetişmeyen genç ağaç ya da arkasında başka sıra olan boşluk belirsiz kalır.
- **Mevsim:** Yapraklı aylar dışında (`leafy_months`, Nisan–Ekim; ay ziyaretin UTC ayı) yeşillik bir şey söylemez: bütün ağaçlar belirsiz (`leafless_season`).
- **Boş yerler:** Konumu olan ve aktif ağacı olmayan yerler de kesilir; fidan kutusunda (0,2–2,0 m, ±1,0 m) en az iki yönden ≥ %10 yeşillik **evet** = "yeni dikim olabilir". Uzmana öneri olarak düşer; envanter değişmez.
- **`presence.json`:** yöntem, sürüm, ay, yapraklı mı; ağaç ve boş yer başına değer, neden (`green_crown:N,S`, `no_vegetation:N,S`, `ambiguous`, `leafless_season`, …) ve bakış başına kutu oranları, parlaklık, durum, kesitin SHA-256'sı. Parametreler `params.presence`'ta.
- **Yükleme:** `record_tree_presence()` (yalnız ops) her ağaç için bir `tree_visible` ölçümü (kaynak `algorithm`, yöntem + sürüm + parametre hash'i, belirsizlik yok) ve kanıt olarak o ağacın yüklenen kesitlerini yazar; boş yerlerde yalnız "evet" yazılır (yer konulu ölçüm). Aynı çalıştırma tekrar yüklenirse yeni satır açılmaz. Kesitler veritabanı ağaçlarından kesildiyse ağaç kimliği bugünkü aktif ağaçla aynı olmalı; değilse atlanır ve uyarı verilir.
- **Uzman:** "hayır" ağacı zorunlu incelemeye sokar (uzman panelinde "ağaç görünmüyor"); "Yok" sınıfını yalnız uzman verir. Özet sayfasında "İşleme hattı" bölümü kapsamayı, görünmeyen ağaçları ve yeni dikim önerilerini gösterir.
- **Bilinen sınırlar:** Yeşil ot, gölge ve arka plandaki ağaçlar sinyali şaşırtabilir; sık dikimli bahçede eksik ağaç çoğunlukla "belirsiz" çıkar (yanlış "evet" olabilir, yanlış "hayır" için iki yönden boş görüntü gerekir). Kuru ama ayakta duran ağaç yapraklı dönemde "hayır" çıkabilir; uzman bunu "Kuru" olarak sınıflar. Kutular düz zemin ve kesit merkezinin ağaç konumunda olduğu varsayımıyla hesaplanır; konum hatası büyükse kutu kayar. Eşikler sentetik görüntülerle seçildi, pilotta gerçek kesitlerle ayarlanmalı.

## Sınır köşelerinden sınır sürümü

Saha uygulaması envanterde sınır yürüyüşünü oturum olayı olarak yazar (`public.session_event`: `corner` ve `boundary_corners`; biçim [docs/arayuzler.md → Sınır köşeleri ve kapsama](../../docs/arayuzler.md#sınır-köşeleri-ve-kapsama)). `boundary` aşaması (`boundary.py`) bunlardan parselin kesin sınır sürümünü üretir:

```bash
set -a && . ./.env && set +a
uv run orchados-pipeline run <oturum> --boundary            # aşamalar + sınır
uv run orchados-pipeline boundary <oturum>                  # sadece sınır (position aşaması çalışmış olmalı)
uv run orchados-pipeline boundary <oturum> --dry-run        # boundary.json yazılır, sürüm açılmaz
```

1. **Köşe listesi:** Oturumun `corner` ve `boundary_corners` olayları ops kullanıcısının belirteciyle okunur (servis anahtarı yok). En yeni `boundary_corners` (sıra `gps_time_ns`, eşitse `phone_time`) listedir; listede olmayan ve ondan önce işaretlenmiş köşe silinmiştir, ondan sonra işaretlenenler sona eklenir. Hiç liste yoksa işaretleme sırası. Listede veritabanında olmayan bir köşe olayı hatadır. Not ve işaretler (`markers`) rapora geçer.
2. **Köşe zamanı:** Olayın `gps_time_ns`'i. Olay telefon saatiyle zamanlandıysa (`time_source = phone`) ve kaydedicinin `events.csv`'sinde aynı numaralı bir `corner` satırı 10 sn içindeyse o satırın GPS zamanı kullanılır (`time_source = logger`).
3. **Konum** (köşe başına `source`):
   - `ppk`: yörünge PPK'lıysa (`trajectory.json`, `ppk_status = ppk`) ve o anda çözüm `fix` ise yörüngeden enterpolasyon; belirsizlik yörüngenin o anki yatay belirsizliği.
   - `phone`: yoksa olaydaki konum (`data.position`: kaydedicinin durum mesajındaki konum, PPK öncesi).
   - `logger`: o da yoksa kaydedicinin `gnss.ubx`'teki kendi NAV-PVT çözümü, eşleşen `events.csv` satırının zamanına en yakın (1 sn içinde) dönem.
   - `phone` ve `logger` konumlarının belirsizliği en az `boundary.fallback_min_uncertainty_m` (5 m) yazılır ve raporda işaretlenir. Hiçbiri yoksa hata.
4. **Poligon:** Köşeler yürüme sırasıyla. 3'ten az köşe, kendini kesen ya da değen kenar, alansız poligon hatadır. Alan yerel düzlemde (m² ve dönüm = m² / 1000).
5. **Kayıt:** `add_field_survey_boundary(p_session_id, p_ring, p_vertex_uncertainty_m, p_surveyed_at)` (`supabase/migrations/20261023120000_field_survey_boundary.sql`, yalnızca ops): parselin bir sonraki `public.boundary` sürümü, kaynak `field_survey`, `session_id`, `vertex_uncertainty_m` (köşelerin en büyüğü), `surveyed_at` (son köşenin zamanı). Sahip `approve_boundary` ile onaylar.
6. **Tekrar çalıştırma:** Aynı oturumun en yeni sürümü aynı köşeleri aynı sırayla ve aynı belirsizlikle taşıyorsa yeni sürüm açılmaz, o satır döner (`created: false`). Köşeler değiştiyse (ör. baz verisi gelip PPK yapıldı) yeni sürüm açılır; eskisi kalır.
7. **Rapor:** Komut çıktısı ve `boundary.json`: köşe sayısı, alan (m², dönüm), köşe başına kaynak, belirsizlik ve konum, uyarılar, yazılan sürüm (`record`: `boundary_id`, `version`, `created`, veritabanının `area_m2`'si).

**Kararlar:**
- Kaydedici yedeği için `events.csv` biçimi değişmedi: `corner` satırında konum yok, zaman var. "Kaydedicinin konumu" o satırın zamanındaki NAV-PVT çözümüdür (kaydedici aynı anda `gnss.ubx`'e yazar).
- PPK olmayan yörünge (`no_ppk`, `ppk_failed`) PPK sayılmaz; NAV-PVT çözümü RTK fixed görünse bile köşe yedek kaynaktan alınır ve işaretlenir.
- Sürüm yazma tek bir veritabanı fonksiyonunda: sürüm numarası parsel kilidi altında verilir (`add_owner_declared_boundary` ile aynı kilit), tekrar denetimi aynı işlemdedir.

**Sentetik sınır yürüyüşü:** `synth --boundary-walk` taramadan önce tarama yolunun 3 m dışındaki dikdörtgeni yürür (köşede 4 sn durarak): NAV-PVT kaydı yürüyüşü de kapsar, `events.csv`'ye her basış için `corner` satırı, `phone_events.json`'a telefonun oturum olayları yazılır (`public.session_event`'e eklenmeye hazır; `org_id`, `parcel_id`, `session_id` hariç). Yanlışlıkla basılan 4. köşe bir `boundary_corners` olayıyla silinir, 5. köşe listeden sonra eklenir; 2. köşede telefon konumu yoktur (kaydedici yedeği), 5. köşe telefon saatiyle 300 ms hatalı zamanlanır. Doğru köşeler ve alan `synthetic_truth.json`'da (`boundary_corners`, `boundary_area_m2`).

### Ücretsiz katman

Supabase ücretsiz planda 1 GB dosya alanı var ([docs/deployment.md](../../docs/deployment.md)). 20 dönümlük bir parselde (~300 ağaç, ~2,5 km tarama yolu, 3,5 m'de bir kare ≈ 700 panorama) kaba tahmin: 4K panoramalar ~1,5 GB, 2K önizlemeler ~350 MB, kesitler (300 ağaç × 4 yön) ~250 MB, yörünge birkaç MB. **Varsayılan bu yüzden önizleme + kesit + yörünge (~600 MB):** uzman paneli kesitleri, sahip portalı önizlemeyle panorama gezisini kullanır; 4K panoramalar istasyonda kalır ve gerektiğinde `--only panorama` ile sonradan eklenir. Ücretsiz katman bununla bile yaklaşık bir ziyaret taşır; pilotta Cloudflare R2 ya da Supabase Pro gerekir. Depolama `MediaStore` arayüzünün arkasındadır (`media.py`: `SupabaseMediaStore`, testler için `LocalMediaStore`); R2 için yeni bir uygulama yeterlidir.

### Testler

- `tests/test_upload.py`: Sahte veritabanı (`FakeCatalog`) ve yerel depo ile eşleme, tekrar çalıştırma, yarıda kesilme, durum geçişleri, yeni hat sürümü.
- `tests/test_boundary.py`: Köşe listesi kuralları (en yeni liste, silinen ve sonradan eklenen köşe, eşit zamanda `phone_time`), poligon denetimi (az köşe, kendini kesen ve değen kenar, alansız), sentetik yürüyüşte PPK'sız (telefon ve kaydedici yedeği), PPK'lı ve PPK boşluklu konumlama, sahte veritabanıyla kayıt ve tekrar çalıştırma.
- `tests/test_trees_db.py`: Sahte istemciyle veritabanından ağaç okuma (aktif ağaç, boş slot, konumsuz slot, sıra), panorama-yalnız durumlar, kesitlerin `tree_id` ile yüklenmesi, sentetik sahnenin parsele uydurulması.
- `tests/test_coverage.py`: Kapsama kuralı (iki koridor, tek koridor ve eğik bakışlar, uzak/zayıf bakış, eşik, atlanan koridor ve kör nokta hücreleri, tek eksik ağaç kör nokta değil), hücre kuralı (veritabanıyla aynı formül), parametre hash'i; sentetik taramada koridor atlama.
- `tests/test_presence.py`: Kesit geometrisinin izdüşümü, bitki maskesi, net görüntüler (yetişkin ağaç, açıkta boş yer) ve belirsiz durumlar (arkada sıra, genç ağaç, karanlık/patlamış, zayıf kesit), karar tablosu, kış; sentetik taramada kesilmiş ağaçlar, dikilmiş boş yer, kış taraması.
- `tests/test_checks_supabase.py` (`supabase` işareti): Seed parselinde orta koridoru atlayan tarama → kapsama eşiğin altında → hattın tek ek ziyaret isteği (tekrar yüklemede ve başka parametreyle yeniden işlemede ikinci istek yok); kesilmiş ağaç → `tree_visible = no` ve kesitleri kanıt, dikilmiş boş yer → `yes`, sahip yayından önce görmez.
- `tests/test_upload_supabase.py` (`supabase` işareti): Yerel Supabase'e karşı sentetik oturum → `run` → `upload`. Kendi oturumunu seed parselinde açar (sentetik slot kodları S1-1 … S3-4 orada aktif ağaçlı); kayıtların ve dosyaların oluştuğunu, ikinci yüklemenin bir şey eklemediğini, sahibin yayından önce kayıtları ve dosyaları göremediğini, saha personelinin dosya yükleyemediğini denetler. Önce kökte `pnpm install && pnpm db:start && pnpm db:reset`. Supabase'e ulaşılamazsa atlanır. Adres ve anahtar `SUPABASE_URL` / `SUPABASE_ANON_KEY`'den, yoksa `supabase status`'tan okunur.

### Uçtan uca zincir testi

`tests/test_chain_supabase.py` (`supabase` işareti) taramadan sahibin ekranına kadar zinciri yerel Supabase'e karşı, komut satırı üzerinden koşar:

1. ops, seed parselinde `planned` bir `periodic_scan` oturumu açar;
2. `synth --trees-from-db --rows 1-2 --positions 1-5` → `run --trees-from-db` → `upload --trees-from-db`; oturum `processed` olur, seçilen her ağacın kuzey ve güney kesiti vardır ve her kesit kesildiği veritabanı ağacına bağlıdır; kapsama özeti yazılır (parselin küçük bir kısmı tarandığı için eşiğin altında) ve hattın ek ziyaret isteği açılır;
3. uzman oturumu `in_review`'a alır, kesiti olan her ağaç için `save_expert_assessment` (ölçüm + kesitler kanıt olarak) çağırır; eksik ağaçlarla `publish_session`'ın reddedildiğini görür; kalan aktif ağaçlara da değerlendirme yazar ve yayımlar;
4. sahip, ziyaretin değerlendirmelerini `tree_latest_assessment`'te (her aktif ağaç için, beklenen sınıfla), asset'lerini ve kanıt bağlarını görür; bir kesitin imzalı adresinden inen dosyanın SHA-256'sı yüklenen dosyanınkiyle aynıdır;
5. yayından önce (yüklemeden sonra ve değerlendirmelerden sonra) sahip ziyaret satırını görür, başka hiçbir şeyi (capture, asset, değerlendirme, ölçüm, imzalı adres) göremez.

İkinci test (`test_boundary_walk_to_approval`) envanteri koşar: ops bir `inventory` oturumu açar; `synth --boundary-walk` (parsele uydurulmuş, sıra 1, yer 1–3); saha personeli `phone_events.json`'daki olayları `session_event`'e yazar; `run --trees-from-db --boundary` parselin yeni sınır sürümünü açar (kaynak `field_survey`, oturum, belirsizlik, zaman, köşeler); `boundary` tekrar çalıştırılınca yeni sürüm açılmaz; saha personeli onaylayamaz, sahip sürümü görür ve `approve_boundary` ile onaylar.

Adım süreleri `pytest -s` ile yazdırılır. Yerelde ~65 sn (tarama) ve ~25 sn (sınır) sürer (çoğu `run`).

**Test verisi:** Capture, asset, ölçüm ve bağ tabloları ekleme-yalnızdır, yayımlanmış ziyaret değiştirilemez; API kullanıcıları test verisini silemez. Kalırsa seed satırlarını sayan web testleri bozulabilir. Bu yüzden Supabase testleri açtıkları oturumları test oturumunun sonunda siler (`tests/supabase_util.py`): servis rolüyle `testing.purge_sessions` (`supabase/testing/purge.sql`; sadece yerel ve CI veritabanında var, `pnpm db:reset` yükler). Fonksiyon sadece o işlemde tetikleyiciler kapalıyken oturumu ve ona bağlı bütün satırları (oturum olayları, sınır sürümleri, bildirimler dahil) ve artık hiçbir satırın göstermediği `storage.objects` kayıtlarını siler. Bu bir test düzeneğidir; hat bunu yapmaz. `ORCHADOS_TEST_KEEP_DATA=1` veriyi bırakır (ör. web uygulamasında bakmak için); silme başarısız olursa pytest uyarı verir. pgTAP testleri başka takımların bıraktığı satırlardan etkilenmez (her dosya kendi işleminde `testing.reset_to_seed()` çağırır). CI'da pytest'ten sonra `pnpm db:test` çalışır ve bunu denetler.

## Insta360 `.insv` kayıtları

`video/` klasörü equirectangular MP4 yerine kameranın ham `.insv` kaydını da alabilir. Bu durumda Insta360 Studio'da dışa aktarma adımına gerek kalmaz:
- Kare seçimi (netlik, konum) ham kayıttan yapılır.
- Sadece seçilen kareler Insta360 **Media SDK**'nın `MediaSDKTest` aracıyla birleştirilir (`-image_sequence_dir` + `-export_frame_index`). Videonun tamamı hiç dışa aktarılmaz.

- **SDK repoda değil.** Lisans dosyası yok; repoya, herkese açık container imajına ve CI'a girmez. Yeri şöyle verilir: `ORCHADOS_INSTA360_SDK=<MediaSDKTest'in klasörü>`. Değişken yoksa SDK'nın `.deb` kurulumunun yeri denenir: `/opt/MediaSDK-3.1.5-linux/bin`. SDK yoksa `.insv` içeren bir oturum `ingest`'te durur.
- **Parametreler** (`insta360`): `stitch_type` (`template`, `optflow` (varsayılan), `dynamicstitch`, `aistitch`), `output_size`, `cuda`, `model_root_dir`, `timeout_s`. FlowState ve yön kilidi kapalı tutulur, çünkü `heading_deg` kamera önünün hareket yönüne bakmasını varsayar.
- **Meta veri:** `native/ins_meta_dump/` küçük bir C++ aracıdır; InsMetaData SDK'ya karşı `build.sh` ile derlenir. `.insv`'deki jiroskop, pozlama ve GPS verisini ve kamera seri numarasını JSON olarak verir. İnce zaman eşlemede (jiroskop) kullanılması sonraki iş.
- **Denenmedi:** Yol, belgedeki komut satırına göre yazıldı; testler sahte bir `MediaSDKTest` ile koşar (`tests/test_insta360.py`). İlk gerçek kayıtta şunlar doğrulanmalı:
    - dışa aktarılan dosyaların kare sırasına göre adlandırılması;
    - panorama orta sütununun kamera önüne bakması;
    - netlik ölçümünün ham çift balıkgözü görüntüde anlamlı olması. Bant maskesi equirectangular için ayarlı.

## Bilinen sınırlar

- **Stitch yok:** Girdi kameranın masaüstü yazılımından dışa aktarılmış equirectangular MP4'tür; `.insv` işlenmez.
- **Ağaç tespiti yok:** Kesitler ağacın bilinen konumundan geometriyle kesilir; görüntüde ağaç aranmaz. Var/yok kontrolü model değil, basit bir yeşillik sinyalidir ([Ağaç var/yok kontrolü](#ağaç-varyok-kontrolü)).
- **Yükleme sırayla:** Dosyalar ve satırlar tek tek gönderilir; ~1000 asset'lik bir ziyarette istek sayısı yüksektir. Süre pilotta ölçülmeli, gerekirse toplu ekleme ve paralel yükleme eklenir.
- **Kamera jiroskop verisi okunmuyor:** İnce eşleme fonksiyonu sentetik sinyallerle test edildi; dosyadan okuma sonraya kaldı.
- **QR ile kayma tahmini kısa kayıtlarda zayıf:** 100 ms yenilemede tek okumanın belirsizliği ~±50 ms; her uçta ~30 okumayla ofset birkaç ms, kayma ancak uzun kayıtlarda (≥10 dk) anlamlı. Sentetik testteki 40 sn'lik videoda kayma ölçülemez; uydurma uzun bir sentetik seriyle ayrıca test edilir.
- **Video parçaları arasında boşluk yok varsayımı:** Kamera kaydı böldüğünde parçaların kesintisiz olduğu varsayılır. Sabit kare hızı varsayılır.
- **Video baştan sona çözülür:** Kare doğruluğu için arama yerine sıralı okuma kullanılır; 2 saatlik 5,7K videoda süre pilotta ölçülmeli. Gerekirse ffmpeg ile donanım hızlandırmalı çözme eklenebilir.
- **Yön, hareket yönünden çıkar:** Dururken son bilinen yön kullanılır; dönüşlerde ±1 sn pencere nedeniyle yön yumuşar. Kameranın gerçek yönelimi (jiroskop) henüz kullanılmıyor.
- **PPK tek baz dosyasıyla:** Birden çok baz gözlem dosyası varsa ilki kullanılır; Hatanaka (`.crx`) ve sıkıştırılmış RINEX desteklenmez. Anten–kamera kolu (ofseti) uygulanmıyor; anten ve kamera aynı direkte kabul edilir.
- **Yerel düzlem yaklaşımı:** Mesafe ve açılar parsel ölçeğinde (birkaç yüz metre) yerel doğu/kuzey düzleminde hesaplanır.
- **Yörünge JSON olarak tutulur;** teknik mimarideki Parquet biçimi sonra.
