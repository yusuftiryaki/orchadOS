# orchadOS — Antep fıstığı bahçeleri için bağımsız denetim hizmeti

## Dil
- Kullanıcı Türkçe konuşuyor; her zaman Türkçe yanıt ver.
- Dokümanlar (`docs/`) Türkçe. Kod, tanımlayıcılar, commit mesajları ve kod yorumları İngilizce.

## Önce oku
- `docs/plan.md`: iş paketleri (İP0–İP11), kilometre taşları, kesme listesi. Hangi İP üzerinde çalışıldığını buradan bul; ilerlemeyi burada güncelle.
- `docs/MVP.md`: ürün tanımı ve modüller.
- `docs/veri-modeli.md`: **veri modelinin kaynağı**. Şema değişiklikleri önce burada tartışılır.
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
| `pnpm db:status` | Yerel adresler ve anahtarlar |

Örnek kullanıcılar (sadece yerel): `owner@`, `viewer@`, `field@`, `expert@`, `ops@example.com`, parola `orchados-dev`.

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
| `uv run orchados-pipeline upload <çalıştırma> --session-id <uuid>` | Çıktıları Supabase'e yükler (ops kullanıcısıyla; ortam değişkenleri README'de). Entegrasyon testleri yerel Supabase ister |

Aşamalar, girdi/çıktı biçimleri ve QR saat kodu biçimi: `services/pipeline/README.md`.

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
| `cd apps/web && pnpm office:dev-data` | Ofis üçgenleme aracı için sentetik panoramalar ve yeri olmayan bir geliştirme parseli üretir. Testlerden önce `pnpm db:reset` gerekir |

### Saha uygulaması (`apps/field/`, `mobile` devcontainer)
| Komut | Ne yapar |
| --- | --- |
| `flutter analyze` | Statik analiz |
| `flutter test` | Birim ve arayüz testleri |
| `dart run build_runner build --delete-conflicting-outputs` | drift kodunu yeniden üretir; üretilen dosyalar commit'lenir |
| `flutter run --dart-define=FAKE_GNSS=true` | Telefonda, kaydedici olmadan |
