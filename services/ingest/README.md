# services/ingest

Ham veri yükleme aracı (`orchados-ingest`). Ofiste karttan ya da oturum klasöründen buluttaki ham veri deposuna sağlama toplamıyla yükler; işlem makinesinde oturumu indirip doğrular. Depo sağlayıcıdan bağımsızdır: AWS S3, Cloudflare R2, Google Cloud Storage (S3 uyumluluk modu), MinIO, Azure Blob Storage ya da yerel klasör. Seçim yapılandırmayla yapılır.

Operasyon akışı ve makineler: [docs/bulut-isleme.md](../../docs/bulut-isleme.md). Oturum klasörü: [docs/arayuzler.md → Oturum klasörü](../../docs/arayuzler.md#oturum-klasörü).

## Komutlar

```bash
cd services/ingest
uv sync
uv run pytest                     # birim + MinIO/Azurite entegrasyon testleri (docker ile kendisi başlatır)
uv run ruff check . && uv run ruff format --check .
```

| Komut | Ne yapar |
| --- | --- |
| `orchados-ingest push <klasör> --session-id <uuid>` | Oturum klasörünü ya da kartı `raw/<org>/<parcel>/<session>/...` altına yükler; SHA-256 manifesti yazar. Kaldığı yerden devam eder |
| `orchados-ingest pull <session-id> <hedef>` | Oturumu indirir, her dosyanın SHA-256'sını doğrular. `--include`/`--exclude` glob |
| `orchados-ingest verify <session-id> [--deep] [--local <klasör>]` | Depodaki (ya da yerel) dosyaları manifestle karşılaştırır; sorun varsa çıkış kodu 3 |
| `orchados-ingest list [<session-id>]` | Depodaki oturumlar ya da bir oturumun dosyaları |
| `orchados-ingest prune --older-than 30d [--dry-run]` | Saklama süresini aşan oturumları siler |
| `orchados-ingest init` | Kova/kapsayıcı yoksa açar (geliştirme, test) |
| `orchados-ingest config` | Çözümlenmiş depo ayarlarını yazar (kimlik bilgisi içermez) |

`push` ve `pull` seçenekleri: `--bwlimit <Mbit/s>` (bant genişliği sınırı), `--bwlimit-hours 08-19` (sınır sadece bu saatlerde; gece tam hız), `--concurrency N`, `-q`.

## Kaynak düzenleri (`push --layout`)

`auto` (varsayılan) sırayla tanır:

| Düzen | Tanıma | Depoya |
| --- | --- | --- |
| `session` | Kökte `session.json`, `gnss/` ya da `video/` | Dosyalar göreli yollarıyla |
| `kit-ssd` | `sessions/<session_id>/gnss/` | Kit kaydedicisinin (Raspberry Pi) SSD'si: `sessions/<session_id>/*` oturum köküne aynı göreli yolla (`gnss/...`, `lidar/raw/...`); kimlikler `sessions/<session_id>/gnss/session.json`'dan |
| `logger-card` | `sessions/<session_id>/` (içinde `gnss/` yok) | ESP32 kaydedicinin kartı: `gnss/*` (kartın klasörü olduğu gibi; dosyalar değiştirilmez) |
| `camera-card` | `DCIM/` | `camera/<DCIM altındaki yol>`; sadece `.insv .insp .mp4 .mov .jpg .jpeg .dng`. Düşük çözünürlüklü `.lrv` önizlemeler alınmaz |
| `video` | Kökte `.mp4` | `video/<ad>`; Insta360 Studio'nun dışa aktardığı klasör |

Gizli dosyalar (`.` ile başlayan) ve işletim sistemi artıkları (`System Volume Information`, `Thumbs.db` ...) yüklenmez.

**Kimlikler:** `org_id` ve `parcel_id` sırayla `--org-id`/`--parcel-id`, kök `session.json` (ve `gnss/session.json`), depodaki oturum dizini kaydından okunur. Kaynaklar çelişirse hata. Kaydedici kartı ve kit SSD'si yalnız `gnss/session.json` taşır (`org_id` yok); kamera kartı ve dışa aktarılan video hiç `session.json` taşımaz; oturum depoda zaten varsa kimlikler oradan gelir, yoksa seçenekle verilir. `session.json`'daki `session_id` `--session-id` ile aynı olmalıdır.

**Değiştirilemezlik:** Aynı yolda başka içerikli bir dosya reddedilir (`--replace` ile üzerine yazılır). Aynı içerik tekrar yüklenmez.

## Depo düzeni ve manifest

```
raw/<org_id>/<parcel_id>/<session_id>/<oturum klasöründeki yol>
raw/<org_id>/<parcel_id>/<session_id>/.orchados/manifest.json
raw/_index/<session_id>.json          oturumun nerede olduğu (pull sadece session-id ile çalışsın diye)
```

Yapılandırmadaki `prefix` hepsinin önüne eklenir. Manifest (`orchados.raw-manifest/1`) **sadece kimlikleri, göreli dosya adlarını, boyutları ve SHA-256'ları** taşır; kişisel veri yok. Bir `push`'un bütün dosyaları depoya girdikten sonra yazılır; manifesti olmayan oturum tamamlanmamıştır. Her nesnenin SHA-256'sı ayrıca nesne üst verisinde (`sha256`) durur; `verify` indirmeden boyut ve hash'i denetler, `--deep` indirip yeniden hesaplar. `pull` manifestin bir kopyasını `<hedef>/.orchados/manifest.json`'a yazar; bu kopyada ayrıca oturumun depodaki adresi durur (`location.uri`, ör. `s3://<kova>/raw/<org>/<parcel>/<oturum>/`, `az://...`, `file://...`). İşleme hattı noktalı klasörleri işlemez; `upload` ham kayıtların `capture.uri`'sini bu adresten yazar ([arayuzler.md](../../docs/arayuzler.md#ham-kayıtların-adresi-captureuri)).

## Yapılandırma

TOML dosyası (`--config`, `$ORCHADOS_INGEST_CONFIG` ya da `~/.config/orchados/ingest.toml`; Windows'ta `%APPDATA%\orchados\ingest.toml`) ve/veya ortam değişkenleri. Ortam değişkeni dosyayı ezer.

| Ayar | Ortam değişkeni | Anlamı |
| --- | --- | --- |
| `backend` | `ORCHADOS_STORE_BACKEND` | `s3`, `azure`, `local` |
| `provider` | `ORCHADOS_STORE_PROVIDER` | s3 için `aws` (vars.), `r2`, `gcs`, `minio`, `generic` |
| `bucket` | `ORCHADOS_STORE_BUCKET` | Kova (s3) ya da kapsayıcı (azure) |
| `prefix` | `ORCHADOS_STORE_PREFIX` | Kova içinde ön ek (isteğe bağlı) |
| `region` | `ORCHADOS_STORE_REGION` | aws: vars. `eu-central-1`; gcs/r2: `auto` |
| `endpoint` | `ORCHADOS_STORE_ENDPOINT` | r2 ve minio için zorunlu; gcs: vars. `https://storage.googleapis.com` |
| `profile` | `ORCHADOS_STORE_PROFILE` | s3: `~/.aws/credentials` profili |
| `account_url` | `ORCHADOS_STORE_ACCOUNT_URL` | azure: `https://<hesap>.blob.core.windows.net` |
| `root` | `ORCHADOS_STORE_ROOT` | local: kök klasör |
| `part_size_mb` | `ORCHADOS_STORE_PART_SIZE_MB` | Parça boyutu, vars. 64 (en az 5) |
| `concurrency` | `ORCHADOS_STORE_CONCURRENCY` | Aynı anda yüklenen parça/dosya, vars. 4 |

Örnekler:

```toml
# AWS S3, Frankfurt
backend = "s3"
provider = "aws"
bucket = "orchados-raw-eu"
region = "eu-central-1"
```

```toml
# Google Cloud Storage, S3 uyumluluk modu (HMAC anahtarı)
backend = "s3"
provider = "gcs"
bucket = "orchados-raw-eu"
```

```toml
# Cloudflare R2
backend = "s3"
provider = "r2"
bucket = "orchados-raw"
endpoint = "https://<hesap-kimliği>.r2.cloudflarestorage.com"
```

```toml
# Azure Blob
backend = "azure"
bucket = "orchados-raw"
account_url = "https://orchadosraw.blob.core.windows.net"
```

### Kimlik bilgileri

Repoya ve yapılandırma dosyasına girmez; yapılandırma dosyasında `secret`, `password`, `token`, `connection_string`, `access_key`, `account_key` geçen bir anahtar hata verir. Her SDK kendi standart yolundan okur:

- **s3 (AWS, R2, GCS, MinIO):** boto3 zinciri: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE` ya da `profile` ayarı, makineye atanmış rol (EC2 instance profile). R2 ve GCS'nin HMAC anahtar çifti aynı değişkenlere ya da bir profile yazılır.
- **azure:** `AZURE_STORAGE_CONNECTION_STRING` varsa o (Azurite, hesap anahtarı ya da SAS); yoksa `account_url` + `DefaultAzureCredential` (`AZURE_CLIENT_*` ortam değişkenleri, `az login`, sanal makinenin yönetilen kimliği).
- **gcs (yerel kimlikle):** S3 uyumluluk modu HMAC anahtarı ister; Google'ın kendi kimlik zinciri (`gcloud auth`, servis hesabı) bu yolda kullanılmaz. GCP makinesinde HMAC anahtarı Secret Manager'dan okunur (bkz. `docs/bulut-isleme.md`).

## Kaldığı yerden devam

- **S3 uyumlu:** Parça boyutunu aşan dosyalar çok parçalı yüklenir, `concurrency` kadar parça aynı anda. Yarım kalan yüklemenin kimliği yerel durum klasöründe (`uploads.json`) dosyanın SHA-256'sı ve parça boyutuyla birlikte tutulur; aynı komut aynı bilgisayarda tekrar çalışınca depodaki parçalar boyut ve MD5 (ETag) ile denetlenip atlanır. Durum kaydı yoksa (başka bilgisayar, silinmiş durum) o anahtarın yarım yüklemeleri iptal edilir, dosya baştan gider.
- **Azure:** Blok kimlikleri dosyanın SHA-256'sından ve blok numarasından türetilir; yarım kalan yüklemenin blokları blob'un onaylanmamış blok listesinde bulunur, yerel durum gerekmez. Azure onaylanmamış blokları 7 günde siler.
- **local:** `.partial/` altında yarım dosya, boyutundan devam.
- **pull:** `<dosya>.part` boyutundan devam; bitince SHA-256 tutmazsa `.part` silinir, hata verilir.
- **Hash önbelleği:** 90 GB'ı karttan yeniden okumamak için SHA-256'lar yol + boyut + değişiklik zamanıyla `hashes.json`'da tutulur.

Durum klasörü: `$ORCHADOS_INGEST_STATE`, Windows'ta `%LOCALAPPDATA%\orchados-ingest`, diğerlerinde `~/.local/state/orchados-ingest`. İçinde depo anahtarları (kimlikler ve dosya adları), boyutlar, hash'ler ve yükleme kimlikleri var; kişisel veri yok.

Ağ hatalarında SDK isteği kendisi yeniden dener (boto3 `standard` modu, 5 deneme). Ctrl-C'de o an gönderilmekte olan parçalar bitince çıkılır; aynı komut kaldığı yerden sürer.

## Saklama (`prune`)

Ham veri 30 gün tutulur. `prune --older-than 30d` **en yeni nesnesi** 30 günden eski olan oturumu bütünüyle (dosyalar, manifest, dizin kaydı) siler; tam 30 günlük olan kalır. Sonradan eklenen bir dosya (ör. Windows'ta dışa aktarılan video) oturumu o tarihten itibaren 30 gün daha tutar. Ayrıca kesimden eski yarım çok parçalı yüklemeler iptal edilir. Sağlayıcının yaşam döngüsü kuralı (nesne başına, `raw/` ön eki) asıl yoldur; `prune` her yerde çalışan yedektir. Kurallar: `docs/bulut-isleme.md`.

## Kütüphane seçimi

`boto3` + `azure-storage-blob` (+ `azure-identity`):

- Kaldığı yerden devam için çok parçalı yüklemenin parçalarına doğrudan erişim gerekiyor (S3: `ListParts`, `UploadPart`; Azure: onaylanmamış blok listesi, `stage_block`). `fsspec`/`obstore` çok parçalı yüklemeyi soyutlar; yarım kalan bir yüklemeyi başka bir süreçten sürdürmek ya da parçaları MD5'le denetlemek zorlaşır.
- Kimlik zincirleri (ortam değişkeni, profil, makine rolü / yönetilen kimlik) iki SDK'da hazır ve her sağlayıcının belgeledikleriyle aynı.
- R2, GCS ve MinIO S3 API'siyle aynı istemciyi kullanır; tek fark uç nokta ve bölge. boto3 1.36'dan beri varsayılan CRC sağlama toplamlarını GCS ve R2 reddettiği için `request_checksum_calculation=when_required` ayarlı, bütünlük her istekte `Content-MD5` ile.
- SDK'lar sadece kullanılan arka uç için içe aktarılır.

## Testler

| Dosya | Ne |
| --- | --- |
| `test_config.py` | Dosya + ortam çözümü, kimlik bilgisinin reddi, sağlayıcı ön ayarları, doğrulama |
| `test_transfer.py` | Bant sınırı (sahte saat), saat aralığı, ilerleme/hız/kalan süre, okuyucunun baytı bir kez sayması |
| `test_manifest.py` | Depo düzeni, kimlik ve yol denetimi, manifestte sadece kimlik/ad/boyut/hash, değiştirilemezlik, parça boyutu |
| `test_sources.py` | Kaynak düzenleri (oturum, kit SSD'si, kaydedici kartı, kamera kartı, video klasörü) |
| `test_store_contract.py` | Aynı sözleşme her arka uçta (local, MinIO, Azurite): küçük nesne, çok parçalı yükleme, yarıda kesilip devam, değişen dosyanın parçaları kullanmaması |
| `test_ops.py` | Her arka uçta yükle → yarıda kes → devam et → indir → doğrula; bozulmanın yakalanması; filtreler; kimlikler ve değiştirilemezlik; hash önbelleği; `prune` tarih hesabı (31/30 gün, sonradan eklenen dosya), sahipsiz dizin kaydı |
| `test_gcs_compat.py` | `gcs` ön ayarının `minio` ile aynı sınıf ve istemci ayarlarını kullandığı; uç noktası MinIO'ya çevrilmiş `gcs` yapılandırmasıyla tam push/pull/verify |
| `test_cli.py` | Komut satırı, her arka uçta |

**MinIO ve Azurite:** `ORCHADOS_TEST_MINIO_URL` / `ORCHADOS_TEST_AZURITE_URL` verilmezse testler docker ile kendi container'larını açar. İmajlar Docker Hub dışından: `cgr.dev/chainguard/minio:latest`, `mcr.microsoft.com/azure-storage/azurite:3.35.0` (`ORCHADOS_TEST_MINIO_IMAGE`, `ORCHADOS_TEST_AZURITE_IMAGE` ile değişir). Docker yoksa bu testler atlanır; CI atlanırsa başarısız olur. Testlerdeki Azurite hesap anahtarı Azurite'in herkese açık, sabit geliştirme anahtarıdır; MinIO parolası sadece test container'ı içindir.

Gerçek bulut hesabı kullanılmaz; test verisi test sırasında rastgele baytlarla üretilir.
