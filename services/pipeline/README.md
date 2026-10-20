# services/pipeline

İşleme istasyonunda çalışan Python işleme hattı (İP4). Bir saha oturumunun ham verisinden konumlu panoramalar ve ağaç kesitleri üretir, çıktıları yerel bir klasöre ve `outputs.json` manifestine yazar, sonra Supabase'e yükler (kayıtlar veritabanına, dosyalar `media` depolama alanına; bkz. [Yükleme](#yükleme)).

Bkz. [docs/plan.md](../../docs/plan.md), [docs/teknik-mimari.md](../../docs/teknik-mimari.md), [docs/veri-modeli.md](../../docs/veri-modeli.md).

## Komutlar

```bash
cd services/pipeline
uv sync                                     # bağımlılıklar (numpy, opencv-python-headless, pydantic, httpx)
uv run pytest                               # tüm testler (~4 dk); Supabase kapalıysa entegrasyon testleri atlanır
uv run ruff check . && uv run ruff format --check .

uv run orchados-pipeline synth /tmp/ornek   # sentetik oturum klasörü üret (--session-id, --parcel-id)
uv run orchados-pipeline run /tmp/ornek     # tüm aşamalar
uv run orchados-pipeline run /tmp/ornek --trees-from-db   # ağaç konumları veritabanından
uv run orchados-pipeline upload /tmp/ornek.processed/v0.1.0_<hash> --session-id <uuid>   # Supabase'e
```

Her aşama ayrıca tek başına çalışır ve bir önceki aşamanın kaydettiği dosyayı okur:

```bash
uv run orchados-pipeline ingest    <oturum> [--out KÖK] [--params params.json]
uv run orchados-pipeline position  <oturum> ...
uv run orchados-pipeline sync      <oturum> ...
uv run orchados-pipeline frames    <oturum> ...
uv run orchados-pipeline panoramas <oturum> ...
uv run orchados-pipeline crops     <oturum> [--trees agaclar.json | --trees-from-db [--session-id <uuid>]] ...
uv run orchados-pipeline outputs   <oturum> ...
uv run orchados-pipeline params    [--hash]   # varsayılan parametreler
uv run orchados-pipeline run       <oturum> [--trees-from-db] --upload --session-id <uuid> [yükleme seçenekleri]
uv run orchados-pipeline synth     <klasör> --trees-from-db --parcel-id <uuid> [--rows 1-2] [--positions 1-5]
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
- `trees.json`: `[{"tree_id", "slot_code", "lat", "lon"}]` ya da `{"trees": [...]}`. Gerçek kullanımda ağaç konumları veritabanından gelir (`--trees-from-db`, bkz. [Ağaç konumları veritabanından](#ağaç-konumları-veritabanından)).

Sözleşme testleri (`tests/test_contract.py`) İP2 README'sindeki örnek `events.csv` ve `session.json` bloklarını `tests/data/ip2_readme_*` kopyalarından okur ve kopyaların README ile birebir aynı kaldığını denetler. Sentetik oturum üretici (`synth`) de bu biçimleri üretir.

## Aşamalar

| Aşama | Ne yapar | Çıktı |
| --- | --- | --- |
| `ingest` | Klasörü doğrular; her dosyanın SHA-256'sını, boyutunu ve rolünü yazar. Eksik ya da bozuk girdilerin hepsi tek bir hatada listelenir. | `manifest.json` |
| `position` | Baz verisi varsa RTKLIB ile PPK (`convbin` UBX → RINEX, `rnx2rtkp` kinematik çözüm), `.pos` ayrıştırılır. Baz yoksa NAV-PVT'den yörünge, `ppk_status: no_ppk`. PPK sonuç vermezse NAV-PVT'ye düşer, `ppk_failed` (parametreyle kapatılabilir). | `trajectory.json`, `ppk/` |
| `sync` | Videonun başındaki ve sonundaki QR kodlarını okur, kamera saati → GPS zamanı için ofset ve doğrusal kayma (ppm) hesaplar; aykırı okumaları MAD ile eler. | `sync.json` |
| `frames` | Aday kareleri (vars. 5 kare/sn) çıkarır; konumu yörüngeden zaman enterpolasyonuyla, yönü hareket yönünden bulur; Laplacian varyansıyla netlik skoru verir; yörünge boyunca her 3,5 m'lik dilimde en net kareyi seçer. Medyanın %35'inden bulanık kareler seçilemez. | `frames.json` |
| `panoramas` | Seçilen kareleri 4K (3840×1920) ve 2K (1920×960) WebP olarak, her biri için yan dosya JSON'la yazar. | `panoramas/` |
| `crops` | Her ağaç için yakın panoramalardan (1–12 m) açı ve mesafeyi hesaplar, ağaca bakan gnomonik kesit çıkarır, dört ana yönün her birinden en iyisini 1024×1024 JPEG ve yan dosya JSON olarak yazar. Kullandığı ağaç listesini çalıştırma klasörüne `trees.json` olarak kaydeder. Envanter oturumunda ve konumu olmayan parselde kesit üretmez (durum `crops.json`'da). | `crops/`, `trees.json` |
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
  trees.json crops.json crops/<tree_id>_<N|E|S|W>.jpg, .json
  outputs.json  ppk/ (yalnızca baz verisi varsa)
```

- Başka bir sürüm ya da parametreyle yeniden işlemek yeni bir klasör açar; eski sonuçlar silinmez.
- Aynı girdi ve parametrelerle tekrar çalıştırmak bayt bayt aynı çıktıyı üretir. Çıktılarda işlem anının zaman damgası yoktur. Bu, testlerde doğrulanır.
- Parametre hash'i, tüm parametrelerin kanonik JSON'unun SHA-256'sıdır (`orchados-pipeline params --hash`).

### outputs.json

[veri-modeli.md](../../docs/veri-modeli.md)'deki Capture/Asset ayrımını izler:

- `captures`: ham girdiler. `capture_id` dosyanın SHA-256'sı; `kind`: `session_meta`, `logger_session`, `gnss_raw`, `gnss_events`, `video`, `base_obs`, `base_nav`.
- `assets`: türetilmiş dosyalar. `asset_id` dosyanın SHA-256'sı; `kind`: `manifest`, `trajectory`, `time_sync`, `frame_selection`, `panorama`, `panorama_preview`, `tree_crop`. Her birinde `file` (yol, hash, boyut, medya türü, piksel boyutu), varsa `sidecar`, `pose` (WGS84, EPSG:4979, yön, yatay belirsizlik, çözüm kalitesi), `gps_time_ns`, `quality_score`, ağaç kesitlerinde `subject` (tree_id, slot_code, yön), panorama ve kesitlerde `filters_applied` (uygulanan görüntü süzgeçleri; yüz bulanıklaştırma `face_blur`), `derived_from` (kaynak capture'lar ve üst asset'ler) ve `producer_stage`.
- `pipeline`: ad, sürüm, parametre hash'i ve parametrelerin kendisi.
- `crops_status`: `crops.json`'daki durum (`ok`, `no_tree_positions`, `inventory_session`); ağaç listesi verilmediyse `null`.

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
| Ham kayıtlar: 360° video, UBX, `events.csv`, iki `session.json`, baz RINEX | Sadece `capture` satırı; dosya istasyonda kalır | `uri` = `station://<istasyon>/<mutlak yol>`, ör. `station://ist-01/data/oturumlar/s/video/VID_0001.mp4`. İstasyon adı `--station` (varsayılan: makine adı); oturum klasörü `--session-dir` (varsayılan: `<oturum>.processed` klasörünün yanındaki `<oturum>`). Türler: `video_360`, `gnss_raw` (UBX ve RINEX), diğerleri `other`; dosyanın rolü `metadata.role`'da. `started_at`: video için QR saat modelinden, diğerleri için kaydedicinin başlangıcı |
| Panorama önizlemesi (2K) | `asset` + `media` alanı | `kind = panorama`, `pose.variant = preview` |
| Tam panorama (4K) | `asset` + `media` alanı | `kind = panorama`, `pose.variant = full`. **Varsayılan olarak yüklenmez** |
| Ağaç kesiti | `asset` + `media` alanı | `kind = tree_crop`, `tree_id` slot koduyla bulunur (aşağıda) |
| Yörünge (`trajectory.json`) | `asset` + `media` alanı | `kind = trajectory` |
| `manifest.json`, `sync.json`, `frames.json`, yan dosya JSON'ları | Yüklenmez | İç ara çıktılar; içerikleri `capture`/`asset` satırlarına ve `pose` alanına aktarılır |

- **Nesne adı:** `org/<org_id>/parcel/<parcel_id>/<sha256>`, `asset.uri` = `storage://media/` + bu ad ([arayuzler.md → Medya depolama](../../docs/arayuzler.md#medya-depolama)). `pose` alanları: [arayuzler.md → Asset `pose` alanı](../../docs/arayuzler.md#asset-pose-alanı).
- **Seçim:** `--only preview,tree_crop,trajectory` (varsayılan). Türler: `panorama` (4K), `preview` (2K), `tree_crop`, `trajectory`.
- **Lineage:** `outputs.json`'daki `derived_from` → `asset_source`. Kaydedilmeyen üst öğeler (iç JSON'lar, seçilmeyen türler) atlanır. Önizleme ← video + yörünge; kesit ← tam panorama, o yüklenmediyse aynı karenin önizlemesi (`pose.panorama_asset_id` de aynı kuralla).
- **Ağaç eşleme:** Kesitin `slot_code`'u (ör. `S5-12a`) parseldeki `slot.code` ile, slot da aktif `tree` kaydıyla eşleştirilir. Elle verilen `trees.json`'daki `tree_id` kullanılmaz. Kesitler veritabanından okunan ağaçlarla kesildiyse (`crops.json` → `trees_source: database`) kesitteki `tree_id` de slotun bugünkü aktif ağacıyla aynı olmalıdır; işlemeden sonra slota yeni bir ağaç girdiyse kesit yüklenmez ("active tree changed since processing" uyarısı). `upload --trees-from-db` kesitlerin veritabanı ağaçlarıyla kesilmiş olmasını şart koşar; değilse hiçbir şey yazmadan hata verir. Eşleşmeyen kesit yüklenmez, raporda uyarı olarak listelenir.
- **Yüz bulanıklaştırma:** `outputs.json`'da `filters_applied` içinde `face_blur` olmayan bir panorama ya da kesit seçilmişse komut **hiçbir şey yazmadan hata verir**. `--allow-unblurred` bu kuralı kapatır; **sadece sentetik veri içindir**, gerçek saha görüntüsüyle kullanılmaz.
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

### Ücretsiz katman

Supabase ücretsiz planda 1 GB dosya alanı var ([docs/deployment.md](../../docs/deployment.md)). 20 dönümlük bir parselde (~300 ağaç, ~2,5 km tarama yolu, 3,5 m'de bir kare ≈ 700 panorama) kaba tahmin: 4K panoramalar ~1,5 GB, 2K önizlemeler ~350 MB, kesitler (300 ağaç × 4 yön) ~250 MB, yörünge birkaç MB. **Varsayılan bu yüzden önizleme + kesit + yörünge (~600 MB):** uzman paneli kesitleri, sahip portalı önizlemeyle panorama gezisini kullanır; 4K panoramalar istasyonda kalır ve gerektiğinde `--only panorama` ile sonradan eklenir. Ücretsiz katman bununla bile yaklaşık bir ziyaret taşır; pilotta Cloudflare R2 ya da Supabase Pro gerekir. Depolama `MediaStore` arayüzünün arkasındadır (`media.py`: `SupabaseMediaStore`, testler için `LocalMediaStore`); R2 için yeni bir uygulama yeterlidir.

### Testler

- `tests/test_upload.py`: Sahte veritabanı (`FakeCatalog`) ve yerel depo ile eşleme, tekrar çalıştırma, yarıda kesilme, bulanıklaştırma kuralı, durum geçişleri, yeni hat sürümü.
- `tests/test_trees_db.py`: Sahte istemciyle veritabanından ağaç okuma (aktif ağaç, boş slot, konumsuz slot, sıra), panorama-yalnız durumlar, kesitlerin `tree_id` ile yüklenmesi, sentetik sahnenin parsele uydurulması.
- `tests/test_upload_supabase.py` (`supabase` işareti): Yerel Supabase'e karşı sentetik oturum → `run` → `upload`. Kendi oturumunu seed parselinde açar (sentetik slot kodları S1-1 … S3-4 orada aktif ağaçlı); kayıtların ve dosyaların oluştuğunu, ikinci yüklemenin bir şey eklemediğini, sahibin yayından önce kayıtları ve dosyaları göremediğini, saha personelinin dosya yükleyemediğini denetler. Önce kökte `pnpm install && pnpm db:start && pnpm db:reset`. Supabase'e ulaşılamazsa atlanır. Adres ve anahtar `SUPABASE_URL` / `SUPABASE_ANON_KEY`'den, yoksa `supabase status`'tan okunur.

### Uçtan uca zincir testi

`tests/test_chain_supabase.py` (`supabase` işareti) taramadan sahibin ekranına kadar zinciri yerel Supabase'e karşı, komut satırı üzerinden koşar:

1. ops, seed parselinde `planned` bir `periodic_scan` oturumu açar;
2. `synth --trees-from-db --rows 1-2 --positions 1-5` → `run --trees-from-db` → `upload --trees-from-db`; oturum `processed` olur, seçilen her ağacın kuzey ve güney kesiti vardır ve her kesit kesildiği veritabanı ağacına bağlıdır;
3. uzman oturumu `in_review`'a alır, kesiti olan her ağaç için `save_expert_assessment` (ölçüm + kesitler kanıt olarak) çağırır; eksik ağaçlarla `publish_session`'ın reddedildiğini görür; kalan aktif ağaçlara da değerlendirme yazar ve yayımlar;
4. sahip, ziyaretin değerlendirmelerini `tree_latest_assessment`'te (her aktif ağaç için, beklenen sınıfla), asset'lerini ve kanıt bağlarını görür; bir kesitin imzalı adresinden inen dosyanın SHA-256'sı yüklenen dosyanınkiyle aynıdır;
5. yayından önce (yüklemeden sonra ve değerlendirmelerden sonra) sahip ziyaret satırını görür, başka hiçbir şeyi (capture, asset, değerlendirme, ölçüm, imzalı adres) göremez.

Adım süreleri `pytest -s` ile yazdırılır. Yerelde ~65 sn sürer (çoğu `run`).

**Test verisi:** Capture, asset, ölçüm ve bağ tabloları ekleme-yalnızdır, yayımlanmış ziyaret değiştirilemez; API kullanıcıları test verisini silemez. Kalırsa seed satırlarını sayan testler bozulur (`pnpm db:test`'te 02_rls, 04_publication, 05_storage; web testleri de). Bu yüzden Supabase testleri açtıkları oturumları test oturumunun sonunda siler (`tests/supabase_util.py`): veritabanı kapsayıcısında `postgres` olarak, sadece o işlemde tetikleyiciler kapalı (`session_replication_role = replica`), oturum ve ona bağlı bütün satırlar ile artık hiçbir satırın göstermediği `storage.objects` kayıtları. Bu bir test düzeneğidir; hat bunu yapmaz. `ORCHADOS_TEST_KEEP_DATA=1` veriyi bırakır (ör. web uygulamasında bakmak için); docker yoksa ya da silme başarısız olursa pytest uyarı verir, o zaman `pnpm db:test`'ten önce `pnpm db:reset` gerekir. CI'da pytest'ten sonra `pnpm db:test` çalışır ve bunu denetler.

## Bilinen sınırlar

- **Stitch yok:** Girdi kameranın masaüstü yazılımından dışa aktarılmış equirectangular MP4'tür; `.insv` işlenmez.
- **Yüz bulanıklaştırma ve ağaç tespiti yok:** Sadece `ImageFilter` arayüzü var. Panoramalar ve kesitler `outputs.json`'da `filters_applied` ile işaretlenir; `face_blur` filtresi yoksa yükleme reddedilir (bkz. [Yükleme](#yükleme)).
- **Yükleme sırayla:** Dosyalar ve satırlar tek tek gönderilir; ~1000 asset'lik bir ziyarette istek sayısı yüksektir. Süre pilotta ölçülmeli, gerekirse toplu ekleme ve paralel yükleme eklenir.
- **Kamera jiroskop verisi okunmuyor:** İnce eşleme fonksiyonu sentetik sinyallerle test edildi; dosyadan okuma sonraya kaldı.
- **QR ile kayma tahmini kısa kayıtlarda zayıf:** 100 ms yenilemede tek okumanın belirsizliği ~±50 ms; her uçta ~30 okumayla ofset birkaç ms, kayma ancak uzun kayıtlarda (≥10 dk) anlamlı. Sentetik testteki 40 sn'lik videoda kayma ölçülemez; uydurma uzun bir sentetik seriyle ayrıca test edilir.
- **Video parçaları arasında boşluk yok varsayımı:** Kamera kaydı böldüğünde parçaların kesintisiz olduğu varsayılır. Sabit kare hızı varsayılır.
- **Video baştan sona çözülür:** Kare doğruluğu için arama yerine sıralı okuma kullanılır; 2 saatlik 5,7K videoda süre pilotta ölçülmeli. Gerekirse ffmpeg ile donanım hızlandırmalı çözme eklenebilir.
- **Yön, hareket yönünden çıkar:** Dururken son bilinen yön kullanılır; dönüşlerde ±1 sn pencere nedeniyle yön yumuşar. Kameranın gerçek yönelimi (jiroskop) henüz kullanılmıyor.
- **PPK tek baz dosyasıyla:** Birden çok baz gözlem dosyası varsa ilki kullanılır; Hatanaka (`.crx`) ve sıkıştırılmış RINEX desteklenmez. Anten–kamera kolu (ofseti) uygulanmıyor; anten ve kamera aynı direkte kabul edilir.
- **Yerel düzlem yaklaşımı:** Mesafe ve açılar parsel ölçeğinde (birkaç yüz metre) yerel doğu/kuzey düzleminde hesaplanır.
- **Yörünge JSON olarak tutulur;** teknik mimarideki Parquet biçimi sonra.
