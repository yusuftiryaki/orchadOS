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
| `deploy-db-pilot` | `release`'te migration ya da fonksiyon değişince, ya da elle | Aynısını pilot projesine yapar. Seed hiçbir zaman uygulanmaz. Önce ödeme ve kayıt kilitlerini denetler (aşağıda, Ödeme) |
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

## Ödeme (İP12)

Tasarım: [musteri-yonetimi.md](musteri-yonetimi.md) §8, §13–§15. Kart ödemesi iyzico Checkout Form ile, üç Edge Function üzerinden yürür: `payments` (başlatma, iade, mutabakat), `payment-callback` (iyzico'nun tarayıcıyı geri gönderdiği adres) ve `payment-webhook`. Üçünde de `verify_jwt = false`; kimlik kodda doğrulanır (müşteri ve ops JWT'si `/auth/v1/user` ile, mutabakat `x-orchados-cron-secret` başlığıyla, webhook imzayla). `deploy-db` ve `deploy-db-pilot` `supabase/functions` altındaki bütün fonksiyonları dağıtır. Kart verisi sistemimize hiç gelmez; alıcı bilgisi yalnızca iyzico isteği sırasında bellekte durur, loglanmaz ve olay kayıtlarına yazılmaz.

**Fonksiyon secret'ları** (`supabase secrets set --project-ref <ref> AD=değer`):

| Değişken | Ne için | Test projesi | Pilot |
| --- | --- | --- | --- |
| `PAYMENT_PROVIDER` | `iyzico` ya da `fake`; boşsa ödeme kapalı (503) | `fake`, sandbox denemesinde `iyzico` | `iyzico` |
| `PAYMENT_FAKE_ALLOWED` | `1`: sahte sağlayıcının ikinci kilidi | Sahte ödeme denenirken `1` | **Asla tanımlanmaz** |
| `FAKE_WEBHOOK_SECRET` | Sahte webhook imzası (`x-fake-signature`) | Rastgele bir değer | Yok |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` | iyzico panelinden | Sandbox anahtarları | Canlı anahtarlar |
| `IYZICO_BASE_URL` | `https://sandbox-api.iyzipay.com` ya da `https://api.iyzipay.com` | Sandbox | Canlı |
| `IYZICO_ENABLED_INSTALLMENTS` | Taksit seçenekleri, virgülle; varsayılan `1` (tek çekim) | `1` | `1` |
| `PAYMENT_CALLBACK_URL` | `https://<ref>.supabase.co/functions/v1/payment-callback` | Ayarlı | Ayarlı |
| `PAYMENT_RETURN_ORIGINS` | İzinli dönüş adresleri, virgülle; tam origin (`https://alan.adı`, sonda `/` yok) | Vercel üretim adresi + önizleme kalıbı | Yalnızca pilot adresi |
| `PAYMENT_ALLOW_PREVIEW_ORIGINS` | `1`: `PAYMENT_RETURN_ORIGINS` içindeki `*` kalıpları kabul edilir (`*` yalnızca `[a-z0-9-]+`, nokta değil) | `1` | **Yok** |
| `PORTAL_BASE_URL` | Bilinmeyen token'da `/portal/odeme?hata=odeme_bulunamadi` yönlendirmesi | Vercel üretim adresi | Pilot adresi |
| `ORCHADOS_CRON_SECRET` | Mutabakat (ve kayıt temizliği) çağrısının başlığı | Rastgele | Rastgele |
| `TURNSTILE_SECRET_KEY` | Kayıt formu (İP12-A1) | Turnstile test anahtarı | **Zorunlu**, canlı anahtar |

Örnek (test projesi, sahte ödeme):

```bash
supabase secrets set --project-ref <ref> PAYMENT_PROVIDER=fake PAYMENT_FAKE_ALLOWED=1 \
  FAKE_WEBHOOK_SECRET=$(openssl rand -hex 32) ORCHADOS_CRON_SECRET=$(openssl rand -hex 32) \
  PAYMENT_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/payment-callback \
  PAYMENT_RETURN_ORIGINS=https://orchados.vercel.app,https://orchados-*-<ekip>.vercel.app \
  PAYMENT_ALLOW_PREVIEW_ORIGINS=1 PORTAL_BASE_URL=https://orchados.vercel.app
```

**Vault** (SQL düzenleyici; `pg_cron` işi `reconcile-payments` 10 dakikada bir çağırır, ikisi de yoksa hiçbir şey yapmaz):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/payments', 'payments_reconcile_url');
select vault.create_secret('<ORCHADOS_CRON_SECRET ile aynı değer>', 'orchados_cron_secret');
```

**Web (Vercel):** `ORCHADOS_PAYMENTS_ENABLED` kart ödemesi düğmesini açar. `PAYMENT_FAKE_CHECKOUT=1` yalnızca yerel, CI ve test projesinde; o zaman `/odeme/sahte` sayfası açılır (yoksa 404). Pilot Vercel projesinde tanımlanmaz.

**iyzico paneli** (Yusuf; sandbox ve canlı hesap ayrı ayrı):
- Callback adresi Checkout Form isteğiyle gönderilir (`PAYMENT_CALLBACK_URL`); panelde ayrı bir ayar gerekmez.
- Webhook adresi: `https://<ref>.supabase.co/functions/v1/payment-webhook`. İmza sürümü **V3** olmalı (`x-iyz-signature-v3`); hesapta açık değilse entegrasyon@iyzico.com'dan istenir.
- Checkout Form içindeki havale/EFT seçeneği kapatılır (havaleyi operasyon elle kaydeder).
- `identityNumber` yerine sabit `11111111111` gönderilir. Bunun kabul edildiği iyzico'dan **yazılı** alınmadan pilota çıkılmaz (§15).

**Sahte ödeme kilitleri.** Sahte bir ödemenin başarılı yazılması için üç kilidin hepsi açık olmalı:
1. Edge: `PAYMENT_PROVIDER=fake`.
2. Edge: `PAYMENT_FAKE_ALLOWED=1`. Biri eksikse callback ve webhook sahte satıra dokunmaz: callback `?hata=odeme_bulunamadi`'ya yönlendirir, webhook 401 döner, hiçbir olay yazılmaz.
3. Veritabanı: `org_billing_setting.allow_fake_payments = true`. Yalnızca SQL ile açılır, ops ayar ekranı bu alanı yazmaz:
   ```sql
   update public.org_billing_setting set allow_fake_payments = true where org_id = '<org>';
   ```

Pilotta hiçbiri açılmaz. `deploy-db-pilot` migration'dan önce Management API ile denetler ve şu durumlarda başarısız olur: `PAYMENT_FAKE_ALLOWED` secret'ı tanımlı; `allow_fake_payments` açık bir org var; `accepts_signups` açık bir org var ama `TURNSTILE_SECRET_KEY` tanımlı değil. Denetim `SUPABASE_ACCESS_TOKEN`'ı kullanır, değerleri okumaz (secret listesi yalnızca adları verir).

**Turnstile kapısı:** Kayıt (`accepts_signups`) bir org'da açılmadan önce `TURNSTILE_SECRET_KEY` (Edge) ve `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) canlı anahtarlarla girilir. Test projesinde Cloudflare'in test anahtarları kullanılır.

**Sandbox kontrol listesi** (CI dışında, elle; test projesinde `PAYMENT_PROVIDER=iyzico`, sahte kilitler kapalı):
- [ ] Başarılı ödeme (3DS'li sandbox kartı): sonuç sayfası `succeeded`, makbuz numarası var, olay kayıtlarında `initialize` ve `callback` satırları.
- [ ] Reddedilen kart: `failed`, `failure_code = iyzico_<kod>`.
- [ ] Ödeme sayfasından vazgeçme / süre dolumu: callback gelirse `failed` (`not_completed`); gelmezse mutabakat, token süresinden 5 dakika sonra `expired` yazar.
- [ ] Webhook V3: imza doğrulanıyor, aynı bildirimin ikinci gelişi `200` ve yeni işlem yok; bozuk imza `401` ve veritabanında iz yok.
- [ ] Retrieve imzası: `paidPrice`/`price` normalizasyonu (`120.0` → `120`) canlı yanıtla tutuyor.
- [ ] İade yanıt imzası (`paymentId:price:currency:conversationId`) ve iptal (`/payment/cancel`) yanıtının da aynı imzayı taşıdığı.
- [ ] Aynı gün tam iptal (`void`) ve kalem bazında kısmi iade (`refund`, `paymentTransactionId`).
- [ ] `fraudStatus = 0` dönen bir ödeme `pending_review`'a düşüyor, operasyon panosunda görünüyor.
- [ ] `price` alanının `"12000.00"` biçiminde kabul edildiği; sepet toplamı `price`'a eşit.
- [ ] `identityNumber = 11111111111` ile ödeme geçiyor (yazılı teyit ayrıca alınır).
- [ ] İade zaman aşımında `/payment/detail` yanıtının alanları (iade/iptal izini nasıl gösterdiği); şimdilik sonuç otomatik çözülmez, satır `processing` kalır ve operasyon `ops_resolve_refund` ile kapatır.
- [ ] Önizleme adresinden başlatılan ödeme o önizlemeye döner; listede olmayan adres `400`.

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
