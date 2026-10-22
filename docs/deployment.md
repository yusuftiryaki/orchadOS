# Deployment ve CI

19 Ekim 2026 · Yusuf

Her PR'da değişen bileşenin testleri GitHub Actions'ta otomatik koşar. `main`'e birleşen migration'lar barındırılan Supabase test projesine kendiliğinden uygulanır. Web uygulaması Vercel'de, her PR için ayrı bir önizleme adresiyle yayınlanır. Bu düzen ücretsiz katmanlarla çalışır. Pilotta ücretli müşteriyle çalışmaya başlanınca web barındırma ücretli plana geçmeli (aşağıda).

## Ortamlar

| Ortam | Web | Veritabanı | Ne zaman güncellenir |
| --- | --- | --- | --- |
| Yerel | `pnpm web:dev` | `pnpm db:start` (Docker) | Elle |
| PR önizlemesi | Vercel önizleme adresi | Supabase test projesi | Her push'ta (web); migration'lar ancak `main`'e birleşince |
| Test | Vercel `orchados` projesi, üretim adresi (`main`) | Supabase test projesi (Stockholm) | `main`'e her birleşmede |
| **Pilot** | Vercel `orchados-pilot` projesi (`release` dalı) | Supabase pilot projesi (Frankfurt) | `main` → `release` PR'ı birleşince |

**Sürüm akışı:** Değişiklikler önce `main`'e birleşir ve test ortamında denenir. Pilota çıkmak için `main`'den `release`'e bir PR açılır. Birleşince `deploy-db-pilot` migration ve fonksiyonları pilot projesine uygular; Vercel `orchados-pilot` projesi `release`'i yayımlar. Pilot projesi başka dallar için önizleme derlemez, pilot veritabanına önizleme bağlanmaz.

**Dikkat:** PR önizlemeleri de test veritabanını kullanır. Bir PR yeni bir migration içeriyorsa, önizlemedeki web uygulaması migration `main`'e birleşene kadar eski şemayla çalışır.

## GitHub Actions iş akışları

| İş akışı | Ne zaman | Ne yapar |
| --- | --- | --- |
| `ci-db-web` | `supabase/`, `apps/web/` ya da kökteki paket dosyaları değişince | Yerel Supabase'i başlatır; migration + seed; pgTAP testleri; üretilmiş tiplerin güncelliği; lint, derleme, birim, entegrasyon ve tarayıcı testleri |
| `ci-pipeline` | `services/pipeline/` değişince | ruff, pytest, sentetik oturumla uçtan uca çalıştırma |
| `ci-firmware` | `firmware/` değişince | Native testler, ESP32 derlemesi; `firmware.bin` 14 gün saklanır |
| `ci-field` | `apps/field/` değişince | analyze, test, üretilmiş kodun güncelliği. `main`'de ayrıca debug APK derlenir ve 7 gün saklanır |
| `deploy-db` | `main`'de migration değişince ya da elle | `supabase db push` ile test projesine migration uygular. Seed uygulanmaz |
| `deploy-db-pilot` | `release`'te migration ya da fonksiyon değişince, ya da elle | Aynısını pilot projesine yapar. Seed hiçbir zaman uygulanmaz |
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

**Pilot projesi** aynı adların `PILOT_` önekli karşılıklarını kullanır: `PILOT_SUPABASE_PROJECT_REF`, `PILOT_SUPABASE_DB_PASSWORD`, `PILOT_SUPABASE_URL`, `PILOT_SUPABASE_ANON_KEY`. `SUPABASE_ACCESS_TOKEN` ikisinde ortak (`deploy-db-pilot`, `keepalive`).

## Vercel

- Repo Vercel'e GitHub entegrasyonuyla bağlıdır; ayrı bir iş akışı yoktur.
- Kök dizin `apps/web`. Kurulum pnpm workspace'i üzerinden yapılır.
- Ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase'in "publishable" anahtarı ya da eski "anon" anahtarı). Servis anahtarı Vercel'e **konmaz**.
- Sunucu fonksiyonları veritabanıyla aynı bölgede; bölge Vercel proje ayarında: test `arn1` (Stockholm), pilot `fra1` (Frankfurt).
- Supabase Auth ayarlarında Site URL olarak Vercel üretim adresi, yönlendirme adreslerinde Vercel önizleme adresleri tanımlıdır.

## Edge Function'lar, bildirimler ve telefonla giriş

`deploy-db` fonksiyonları da dağıtır: `invite-user`, `send-notifications`, `send-sms`. Servis anahtarı sadece Supabase içinde kalır.

**Fonksiyon secret'ları** (`supabase secrets set --project-ref <ref> AD=değer` ya da panel → Edge Functions → Secrets):

| Değişken | Ne için | Test projesinde |
| --- | --- | --- |
| `PORTAL_BASE_URL` | Bildirimlerdeki bağlantı | Vercel üretim adresi |
| `MESSAGE_PROVIDER` | `record`: mesaj gönderilmez, `private.message_outbox`'a yazılır | `record` |
| `SEND_SMS_HOOK_SECRET` | Supabase Auth'un Send SMS Hook imzası | Ayarlı |
| `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER` | Gerçek SMS (Netgsm hesabı açılınca) | Yok |

**Bir kez yapılan ayarlar** (test projesinde yapıldı, 21 Ekim):
- Authentication → Phone açık, dışarıdan üye olma kapalı. Send SMS Hook → `https://<ref>.supabase.co/functions/v1/send-sms`, aynı secret.
- Vault: `notifications_dispatch_url` (send-notifications adresi) ve `notifications_service_key`. `pg_cron` dakikada bir kuyruğu işletir; Vault boşsa hiçbir şey yapmaz.
- Test projesinde giriş kodları ve bildirimler gönderilmez; SQL düzenleyicide `select * from private.message_outbox order by created_at desc` ile okunur.

## Pilot ortamı

- **Supabase:** `orchados-pilot`, Frankfurt (`eu-central-1`), Free plan. Medya için 1 GB sınırı var; pilot verisi gelmeden Pro'ya geçilmeli.
- **Vercel:** `orchados-pilot` projesi, üretim dalı `release`, bölge `fra1`. Başka dallar için derleme yapmaz (Ignored Build Step). Ortam değişkenleri sadece Production'da, pilot projesini gösteriyor. Vercel girişi koruması açık; pilot sahipleri gelince kaldırılır. Hobby plan ticari kullanıma izin vermiyor, önce Pro'ya geçilmeli.
- **Auth:** Dışarıdan üye olma kapalı. Site URL pilot adresi. Telefonla giriş açık, SMS kancası `send-sms`'te.
- **Mesajlar:** Gerçek SMS gitmez (`MESSAGE_PROVIDER=record`). Netgsm hesabı açılınca secret'lar girilip bu değişken kaldırılır.
- **Seed yok:** İşletme ve ilk operasyon kullanıcısı elle açılır; sonraki kayıtlar `/operasyon` ekranlarından yapılır.

## Test projesindeki kullanıcılar

`supabase/seed.sql` sadece yerel geliştirme içindir ve bilinen parolalar içerir; test projesine uygulanmaz. Test projesindeki kullanıcılar Supabase panelinden oluşturulur ve rolleri (`membership`, `parcel_access`) SQL düzenleyiciyle verilir. Sentetik bir bahçe gerekiyorsa seed'in sadece veri kısmı elle çalıştırılabilir.

## Pilot için geçiş

- **Web:** Vercel Hobby planı ticari olmayan kullanım içindir. Ücretli müşteriyle çalışmaya başlamadan önce Vercel Pro (20 $/ay) ya da Cloudflare Workers ücretli plan (5 $/ay, OpenNext ile; uyumluluğu denenmeli) seçilir.
- **Medya:** Supabase ücretsiz planda 1 GB dosya alanı var; bir ziyaret ~4,4 GB. Pilotta panoramalar için Cloudflare R2 ya da Supabase Pro gerekir. Karar İP4 yükleme işiyle verilecek.
- **Üretim veritabanı:** Pilot verisi test projesinde değil, ayrı bir üretim projesinde tutulmalı.
