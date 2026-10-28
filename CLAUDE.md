# orchadOS — Antep fıstığı bahçeleri için bağımsız denetim hizmeti

## Dil
- Kullanıcı Türkçe konuşuyor; her zaman Türkçe yanıt ver.
- Dokümanlar (`docs/`) Türkçe. Kod, tanımlayıcılar, commit mesajları ve kod yorumları İngilizce.

## Önce oku
- `docs/plan.md`: iş paketleri (İP0–İP12), kilometre taşları, kesme listesi. Hangi İP üzerinde çalışıldığını buradan bul; ilerlemeyi burada güncelle.
- `docs/MVP.md`: ürün tanımı ve modüller.
- `docs/veri-modeli.md`: **veri modelinin kaynağı**. Şema değişiklikleri önce burada tartışılır.
- `docs/metodoloji.md`: değerlendirme kuralları (ölçekler, genel sınıf, bulgu türleri); `docs/kullanim-kilavuzu.md`: rol rol uçtan uca akış.
- `docs/musteri-yonetimi.md`: müşteri edinme ve yönetimi (İP12): self-servis kayıt, başvuru, teklif, ödeme, back office; faturalama tablolarının, fonksiyonlarının ve hata kodlarının sözleşmesi.
- `docs/demo-turu.md`: demo turu (İP13): ayrı demo projesi, geçici demo hesabı, yazma ve hesap kilitleri, sentetik demo verisi ve yükleyicisi, `demo-data` iş akışı.
- `docs/arayuzler.md`: **bileşenler arası sözleşmelerin kaynağı**: oturum klasörü, `events.csv`, iki `session.json`, QR saat kodu, zaman tanımı. Bir biçim değişirse önce burası güncellenir.

## Yapı
- `apps/web/` — Next.js: sahip portalı, uzman paneli, ofis üçgenleme aracı
- `apps/field/` — Flutter saha uygulaması (`mobile` devcontainer)
- `services/pipeline/` — Python işleme hattı (işleme istasyonunda çalışır)
- `services/ai-worker/` — AI ön değerlendirme
- `supabase/` — migration'lar, satır bazlı yetki kuralları, örnek veri
- `firmware/gnss-logger/` — ESP32 GNSS kaydedici (PlatformIO)
- `.devcontainer/core`, `.devcontainer/mobile` — bkz. `docs/gelistirme-ortami.md`

## Kurallar
- **Saha verisi repoya girmez:** ham video, MCAP, UBX/RINEX, gerçek bahçe görüntüleri. Testler sentetik veriyle ya da küçültülmüş örneklerle yazılır.
- **Kişisel veri:** Sahip kimliği ve telefonu ayrı şemada tutulur; LLM'e asla gönderilmez (`docs/teknik-mimari.md`, KVKK bölümü).
- **Medya değiştirilemez:** Dosyalar içerik hash'iyle adreslenir; mevcut bir medya kaydı güncellenmez, yenisi eklenir.
- **Ölçümler sürümlüdür:** Her ölçüm ve ürün, onu üreten yöntem ya da hat sürümünü taşır. Yeniden işleme eski sonuçları silmez.
- Gizli bilgiler (`.env`, API anahtarları) repoya girmez.
- **Migration'lar:** Yeni tablo ekleyen migration `select private.attach_demo_guard('<tablo>')` çağırır; kullanıcıya erişim ya da kimlik veren tablo ayrıca `private.attach_demo_account_guard(...)` çağırır (docs/demo-turu.md §6.1–6.2). Servis rolüyle yazan yeni Edge yolları demo claim'ini reddeder. Yeni migration'ın zaman damgası `supabase/migrations/`'taki en yenisinden (şu an `20261101120300`) **sonra** gelir: `supabase migration new` bugünün tarihini verir ve gelecek tarihli mevcut migration'lardan önce sıralanabilir; o zaman dosya adı elle ileri alınır. CI (`scripts/check-migration-order.sh`) daha eski damgalı yeni migration'ı reddeder.

## Komutlar
İş paketleri ilerledikçe buraya eklenecek (her bileşenin build ve test komutu).

### Veritabanı (`supabase/`)
Kökte bir kez `pnpm install` (Supabase komut satırı aracı; sürümü `package.json` ve kilit dosyasında sabit). Docker çalışıyor olmalı; bulut oturumunda SessionStart kancası (`scripts/cloud-session-start.sh`) başlatır.

| Komut | Ne yapar |
| --- | --- |
| `pnpm db:start` | Yerel Supabase'i başlatır: Postgres + PostGIS, Auth, PostgREST, Storage. Studio, Realtime, e-posta, edge ve analitik kapalı (`supabase/config.toml`) |
| `pnpm db:stop` | Durdurur |
| `pnpm db:reset` | Veritabanını sıfırdan kurar: `supabase/migrations/` + `supabase/seed.sql` |
| `pnpm db:test` | pgTAP testleri (`supabase/tests/`) |
| `pnpm db:demo` | `db:reset`'ten sonra iki örnek tarama ziyareti yükler (`supabase/demo/scans.sql`): biri yayımlanmış, biri uzman incelemesinde. Görüntü dosyaları yok. Testler buna dayanmaz |
| `pnpm db:demo-tour` | Demo turu veri kümesini (ayrı demo org'u, iki parsel, sentetik panoramalar, kesitler ve yakın planlar) derler, yükler, doğrular ve açar (`demo load --target local --verify --enable`). `--profile test --reset-local`: küçük görüntüler, önce demo org'unu temizler (CI, e2e). Ayrıntı: `supabase/demo/tour/README.md` |
| `pnpm db:status` | Yerel adresler ve anahtarlar |

Test temizliği `testing` şemasındaki fonksiyonlarla yapılır (`supabase/testing/`; seed'den sonra yüklenir, test ve pilot projelerine gitmez). Bu şemadan önceki eski bir yerel veritabanında `pnpm db:start` PostgREST hatasıyla takılırsa: `pnpm exec supabase stop --no-backup && pnpm db:start`.

Örnek kullanıcılar (sadece yerel): `owner@`, `viewer@`, `field@`, `expert@`, `ops@example.com`, ayrıca self-servis müşteri `customer@example.com` (İP12; başvurusu incelemede), parola `orchados-dev`. Yerelde kayıt açık ve sahte ödemeye izin var (`org_billing_setting`).

### GNSS kaydedici (`firmware/gnss-logger/`)
| Komut | Ne yapar |
| --- | --- |
| `pio test -e native` | Donanımsız birim testleri (Unity) |
| `pio run -e esp32dev` | ESP32 derlemesi |
| `pio run -e esp32dev -t upload` | Flaşlama (sadece yerelde, USB) |

BLE protokolü, dosya biçimleri ve bağlantı tablosu: `firmware/gnss-logger/README.md`.

### İşleme hattı (`services/pipeline/`)
| Komut | Ne yapar |
| --- | --- |
| `uv sync` | Bağımlılıkları kurar |
| `uv run pytest` | Testler (RTKLIB yoksa ilgili testler atlanır) |
| `uv run orchados-pipeline synth <klasör>` | Sentetik bir oturum üretir |
| `uv run orchados-pipeline run <oturum>` | Tüm aşamaları sırayla çalıştırır |
| `uv run orchados-pipeline run <oturum> --trees-from-db` | Kesitler için ağaç konumlarını veritabanındaki envanterden alır |
| `uv run orchados-pipeline synth <klasör> --trees-from-db --rows 1-2` | Sentetik sahneyi bir parselin gerçek ağaç konumlarına uydurur |
| `uv run orchados-pipeline boundary <oturum> [--dry-run]` | Sınır köşelerini (oturum olayları) PPK'lı yörüngeden konumlayıp yeni sınır sürümü yazar; `run --boundary` ile de çalışır. Sentetik sınır yürüyüşü: `synth --boundary-walk` |
| `uv run orchados-pipeline demo build\|load\|enable\|disable\|verify` | Demo turu verisi: sentetik medya derlemesi (`--profile full\|test`, önbellek `.demo-build/`), yükleme (`--target local\|remote`, `--reset-local`, `--demo-only`, `--dry-run`, `--verify`, `--enable`), açma, kapama, doğrulama. Barındırılan projeler: `demo-data` iş akışı |
| `uv run orchados-pipeline upload <çalıştırma> --session-id <uuid>` | Çıktıları Supabase'e yükler (ops kullanıcısıyla; ortam değişkenleri README'de). Entegrasyon ve uçtan uca zincir testi (`tests/test_chain_supabase.py`: tarama → yükleme → uzman → yayın → sahip) yerel Supabase ister |

Aşamalar, girdi/çıktı biçimleri ve QR saat kodu biçimi: `services/pipeline/README.md`.

### AI worker (`services/ai-worker/`)
Kurulum ve komutlar: `services/ai-worker/README.md` (`uv sync`, `uv run pytest`, `ai-worker run --session-id <uuid>`, `ai-worker eval`). `ANTHROPIC_API_KEY` ortam değişkeninden; testlerde gerçek API çağrısı yok. Anahtarsız deneme: `--config configs/ollama-gemma3.json` (yerel Ollama, veri makineden çıkmaz) ya da `configs/gemini-free.json` (yalnız test verisi, `--test-data-only`).

### Yükleme aracı (`services/ingest/`) ve bulutta işleme
| Komut | Ne yapar |
| --- | --- |
| `uv sync` / `uv run pytest` | Bağımlılıklar / testler (MinIO ve Azurite'i docker ile kendisi açar) |
| `uv run orchados-ingest push <klasör ya da kart> --session-id <uuid>` | Oturumu ham veri deposuna yükler (SHA-256 manifesti, kaldığı yerden devam, `--bwlimit`) |
| `uv run orchados-ingest pull <session-id> <hedef>` | İndirir ve sağlama toplamlarını doğrular |
| `uv run orchados-ingest verify\|list\|prune --older-than 30d` | Doğrulama, liste, 30 günlük saklama |

Depo seçimi `ORCHADOS_STORE_*` ya da `~/.config/orchados/ingest.toml` (s3: AWS/R2/GCS/MinIO, azure, local); kimlik bilgileri sağlayıcının standart yolundan. İşlem container'ı ve makine betikleri: `deploy/processing/`; adım adım işletim: `docs/bulut-isleme.md`.

### Kit kimlik çipi (`services/kit-chip/`)
| Komut | Ne yapar |
| --- | --- |
| `uv sync` / `uv run pytest` | Bağımlılıklar / testler (robotla ortak test vektörleri, sahte sysfs, sahte Supabase) |
| `uv run orchados-kit write <manifest.json> [--out kit.bin \| --dry-run]` | Manifesti kodlar, tek DS2431'e yazar ve geri okuyup doğrular |
| `uv run orchados-kit from-calibration <uuid> --hw-rev 1.0 --gnss-link usb` | Manifesti `public.calibration` kaydından üretir (`chip_id`, `extrinsics.kit_mount`) |

Sözleşme robot reposunda (`hoverboard/docs/kit-soketi.md`, şema 1); test vektörleri tek taraflı değiştirilmez.

### Web uygulaması (`apps/web/`)
Kökte `pnpm install`. Entegrasyon testleri için yerel Supabase çalışıyor ve sıfırlanmış olmalı (`pnpm db:start && pnpm db:reset`).

| Komut | Ne yapar |
| --- | --- |
| `pnpm web:dev` | Geliştirme sunucusu |
| `pnpm web:lint` | ESLint + Prettier + tip denetimi |
| `pnpm web:build` | Üretim derlemesi |
| `pnpm web:test` | Birim (Vitest) + yerel Supabase'e karşı entegrasyon testleri |
| `pnpm web:e2e` | Playwright tarayıcı testleri (Chromium gerekir) |
| `pnpm web:typegen` | Veritabanı tiplerini yeniden üretir (`src/lib/database.types.ts`) |
| (ofis aracı) | Panoramaları depodan okur; geliştirmede yerel klasör `LOCAL_PANORAMA_DIR` ile seçilir |
| `cd apps/web && pnpm office:dev-data` | Ofis üçgenleme aracı için sentetik panoramalar ve yeri olmayan bir geliştirme parseli üretir. Testlerden önce `pnpm db:reset` gerekir |

### Saha uygulaması (`apps/field/`, `mobile` devcontainer)
| Komut | Ne yapar |
| --- | --- |
| `flutter analyze` | Statik analiz |
| `flutter test` | Birim ve arayüz testleri |
| `dart run build_runner build --delete-conflicting-outputs` | drift kodunu yeniden üretir; üretilen dosyalar commit'lenir |
| `flutter run --dart-define=FAKE_GNSS=true` | Telefonda, kaydedici olmadan |
