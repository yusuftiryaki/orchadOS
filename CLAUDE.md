# orchadOS — Antep fıstığı bahçeleri için bağımsız denetim hizmeti

## Dil
- Kullanıcı Türkçe konuşuyor; her zaman Türkçe yanıt ver.
- Dokümanlar (`docs/`) Türkçe. Kod, tanımlayıcılar, commit mesajları ve kod yorumları İngilizce.

## Önce oku
- `docs/plan.md`: iş paketleri (İP0–İP11), kilometre taşları, kesme listesi. Hangi İP üzerinde çalışıldığını buradan bul; ilerlemeyi burada güncelle.
- `docs/MVP.md`: ürün tanımı ve modüller.
- `docs/veri-modeli.md`: **veri modelinin kaynağı**. Şema değişiklikleri önce burada tartışılır.

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
| `pnpm db:status` | Yerel adresler ve anahtarlar |

Örnek kullanıcılar (sadece yerel): `owner@`, `viewer@`, `field@`, `expert@`, `ops@example.com`, parola `orchados-dev`.
