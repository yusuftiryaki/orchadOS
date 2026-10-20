# Deployment ve CI

19 Ekim 2026 · Yusuf

Her PR'da değişen bileşenin testleri GitHub Actions'ta otomatik koşar. `main`'e birleşen migration'lar barındırılan Supabase test projesine kendiliğinden uygulanır. Web uygulaması Vercel'de, her PR için ayrı bir önizleme adresiyle yayınlanır. Bu düzen ücretsiz katmanlarla çalışır. Pilotta ücretli müşteriyle çalışmaya başlanınca web barındırma ücretli plana geçmeli (aşağıda).

## Ortamlar

| Ortam | Web | Veritabanı | Ne zaman güncellenir |
| --- | --- | --- | --- |
| Yerel | `pnpm web:dev` | `pnpm db:start` (Docker) | Elle |
| PR önizlemesi | Vercel önizleme adresi | Supabase test projesi | Her push'ta (web); migration'lar ancak `main`'e birleşince |
| Test | Vercel üretim adresi (`main`) | Supabase test projesi (Frankfurt) | `main`'e her birleşmede |

**Dikkat:** PR önizlemeleri de test veritabanını kullanır. Bir PR yeni bir migration içeriyorsa, önizlemedeki web uygulaması migration `main`'e birleşene kadar eski şemayla çalışır.

## GitHub Actions iş akışları

| İş akışı | Ne zaman | Ne yapar |
| --- | --- | --- |
| `ci-db-web` | `supabase/`, `apps/web/` ya da kökteki paket dosyaları değişince | Yerel Supabase'i başlatır; migration + seed; pgTAP testleri; üretilmiş tiplerin güncelliği; lint, derleme, birim, entegrasyon ve tarayıcı testleri |
| `ci-pipeline` | `services/pipeline/` değişince | ruff, pytest, sentetik oturumla uçtan uca çalıştırma |
| `ci-firmware` | `firmware/` değişince | Native testler, ESP32 derlemesi; `firmware.bin` 14 gün saklanır |
| `ci-field` | `apps/field/` değişince | analyze, test, üretilmiş kodun güncelliği. `main`'de ayrıca debug APK derlenir ve 7 gün saklanır |
| `deploy-db` | `main`'de migration değişince ya da elle | `supabase db push` ile test projesine migration uygular. Seed uygulanmaz |
| `keepalive` | Haftada iki kez | Ücretsiz Supabase projesinin duraklatılmaması için küçük bir istek |

**Dakika bütçesi:** Private repoda ayda 2.000 dakika ücretsiz. İş akışları sadece ilgili klasör değişince koşar. Firmware araç zinciri ve Flutter önbelleğe alınır.

## GitHub secret'ları

`gh secret set <AD>` ile ayarlanır; komut değeri gizli olarak sorar.

| Secret | Nereden | Kullanan |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens | `deploy-db` |
| `SUPABASE_DB_PASSWORD` | Proje oluşturulurken belirlenen veritabanı parolası | `deploy-db` |
| `SUPABASE_PROJECT_REF` | Proje ayarları → General → Project ID | `deploy-db` |
| `SUPABASE_URL` | Proje ayarları → API → Project URL | `keepalive` |
| `SUPABASE_ANON_KEY` | Proje ayarları → API → anon / publishable key | `keepalive` |

## Vercel

- Repo Vercel'e GitHub entegrasyonuyla bağlıdır; ayrı bir iş akışı yoktur.
- Kök dizin `apps/web`. Kurulum pnpm workspace'i üzerinden yapılır.
- Ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase'in "publishable" anahtarı ya da eski "anon" anahtarı). Servis anahtarı Vercel'e **konmaz**.
- Sunucu fonksiyonları Frankfurt'ta (`apps/web/vercel.json`, `fra1`): veritabanına yakın ve veri AB içinde kalıyor.
- Supabase Auth ayarlarında Site URL olarak Vercel üretim adresi, yönlendirme adreslerinde Vercel önizleme adresleri tanımlıdır.

## Test projesindeki kullanıcılar

`supabase/seed.sql` sadece yerel geliştirme içindir ve bilinen parolalar içerir; test projesine uygulanmaz. Test projesindeki kullanıcılar Supabase panelinden oluşturulur ve rolleri (`membership`, `parcel_access`) SQL düzenleyiciyle verilir. Sentetik bir bahçe gerekiyorsa seed'in sadece veri kısmı elle çalıştırılabilir.

## Pilot için geçiş

- **Web:** Vercel Hobby planı ticari olmayan kullanım içindir. Ücretli müşteriyle çalışmaya başlamadan önce Vercel Pro (20 $/ay) ya da Cloudflare Workers ücretli plan (5 $/ay, OpenNext ile; uyumluluğu denenmeli) seçilir.
- **Medya:** Supabase ücretsiz planda 1 GB dosya alanı var; bir ziyaret ~4,4 GB. Pilotta panoramalar için Cloudflare R2 ya da Supabase Pro gerekir. Karar İP4 yükleme işiyle verilecek.
- **Üretim veritabanı:** Pilot verisi test projesinde değil, ayrı bir üretim projesinde tutulmalı.
