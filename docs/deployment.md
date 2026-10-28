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
| `deploy-db` | `main`'de `supabase/migrations/`, `supabase/functions/` ya da `supabase/config.toml` değişince, ya da elle | `supabase db push` ile test projesine migration uygular ve bütün Edge Function'ları dağıtır. Seed uygulanmaz |
| `deploy-db-pilot` | `release`'te aynı yollar değişince, ya da elle | Aynısını pilot projesine yapar. Seed hiçbir zaman uygulanmaz. Önce ödeme ve kayıt kilitlerini denetler (aşağıda, Ödeme) |
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
- Ortam değişkenleri aşağıdaki tabloda. Servis anahtarı Vercel'e **konmaz**.
| Değişken | Ne için | Test (`orchados`) | Pilot (`orchados-pilot`) |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase adresi ve "publishable" (ya da eski "anon") anahtarı | Test projesi | Pilot projesi |
| `ORCHADOS_SIGNUP_ENABLED` | `1`: `/kayit` ve kayıt bağlantıları görünür. Yalnızca arayüz; kaydı sunucuda `accepts_signups` açar ve kapatır (Ödeme › Geri alma) | Kayıt denenirken `1` | Turnstile kapısı geçilene kadar boş |
| `ORCHADOS_PAYMENTS_ENABLED` | `1`: portalda "Kartla öde" | Ödeme denenirken `1` | iyzico canlı hesabı ve sandbox listesi tamamlanınca `1` |
| `PAYMENT_FAKE_CHECKOUT` | `1`: `/odeme/sahte` sayfası (sahte sağlayıcı) | Sahte ödeme denenirken `1` | **Asla tanımlanmaz** |
| `ORCHADOS_SITE_INDEXABLE` | `1`: `robots.txt` dizinlemeye izin verir, site haritası dolar | Boş | Alan adı bağlanınca `1` |
| `ORCHADOS_SITE_URL` | `robots.txt` ve site haritasındaki adres (sonda `/` yok). Boşsa `http://localhost:3000` | `https://orchados-orchad-os.vercel.app` | Pilot adresi, alan adı gelince o |
| `SIGNUP_PROXY_SECRET` | `customer-signup` ile ortak sır; Next sunucusu ziyaretçi IP'sini bununla iletir. Edge'deki değerle **aynı**; yalnızca sunucu, asla `NEXT_PUBLIC` | Rastgele | Rastgele (test projesinden farklı) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Kayıt formundaki Turnstile widget'ı | Cloudflare test site anahtarı | **Zorunlu**, canlı site anahtarı |

`NEXT_PUBLIC_*` değerleri derlemeye gömülür; değişince yeniden dağıtılır. Değişkenlerin ayrıntısı: `apps/web/README.md`.

- Sunucu fonksiyonları veritabanıyla aynı bölgede; bölge Vercel proje ayarında: test `arn1` (Stockholm), pilot `fra1` (Frankfurt).
- Supabase Auth ayarlarında Site URL olarak Vercel üretim adresi, yönlendirme adreslerinde Vercel önizleme adresleri tanımlıdır.

## Edge Function'lar, bildirimler ve telefonla giriş

`deploy-db` ve `deploy-db-pilot` `supabase/functions` altındaki yedi fonksiyonun hepsini dağıtır: `invite-user`, `send-notifications`, `send-sms`, `customer-signup` (İP12 kayıt), `payments`, `payment-callback`, `payment-webhook` (İP12 ödeme). `verify_jwt` ayarı `supabase/config.toml`'dan gelir. Servis anahtarı sadece Supabase içinde kalır.

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

## Ödeme ve kayıt (İP12)

Tasarım: [musteri-yonetimi.md](musteri-yonetimi.md) §7, §8, §13–§15. Kart ödemesi iyzico Checkout Form ile, üç Edge Function üzerinden yürür: `payments` (başlatma, iade, mutabakat), `payment-callback` (iyzico'nun tarayıcıyı geri gönderdiği adres) ve `payment-webhook`. Üçünde de `verify_jwt = false`; kimlik kodda doğrulanır (müşteri ve ops JWT'si `/auth/v1/user` ile, mutabakat `x-orchados-cron-secret` başlığıyla, webhook imzayla). `deploy-db` ve `deploy-db-pilot` `supabase/functions` altındaki bütün fonksiyonları dağıtır. Kart verisi sistemimize hiç gelmez; alıcı bilgisi yalnızca iyzico isteği sırasında bellekte durur, loglanmaz ve olay kayıtlarına yazılmaz.

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
| `ORCHADOS_CRON_SECRET` | Mutabakat ve kayıt temizliği çağrılarının başlığı (Vault `orchados_cron_secret` ile aynı) | Rastgele | Rastgele |
| `TURNSTILE_SECRET_KEY` | Kayıt formu (`customer-signup`). **Yoksa kayıt kapalıdır** (503 `signup_closed`) | Cloudflare test gizli anahtarı | **Zorunlu**, canlı anahtar |
| `SIGNUP_HASH_SECRET` | Kayıt oran sınırları için IP, telefon ve e-posta özetlerinin HMAC anahtarı. Yoksa her kayıt 500 döner | Rastgele | Rastgele (test projesinden farklı) |
| `SIGNUP_PROXY_SECRET` | Next sunucusunun ziyaretçi IP'sini ilettiği başlığın sırrı; Vercel'deki değerle **aynı**. Yoksa ya da tutmazsa bütün ziyaretçiler Vercel'in IP'sini paylaşır ve saatte 10 kayıttan sonra herkes `too_many_attempts` alır | Rastgele | Rastgele |
| `SIGNUP_TURNSTILE_DISABLED` | `1`: Turnstile olmadan kayıt. Yalnızca yerel yığın ve CI (`supabase/config.toml`) | **Asla tanımlanmaz** | **Asla tanımlanmaz** |

Örnek (test projesi, sahte ödeme):

```bash
supabase secrets set --project-ref <ref> PAYMENT_PROVIDER=fake PAYMENT_FAKE_ALLOWED=1 \
  FAKE_WEBHOOK_SECRET=$(openssl rand -hex 32) ORCHADOS_CRON_SECRET=$(openssl rand -hex 32) \
  PAYMENT_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/payment-callback \
  PAYMENT_RETURN_ORIGINS=https://orchados.vercel.app,https://orchados-*-<ekip>.vercel.app \
  PAYMENT_ALLOW_PREVIEW_ORIGINS=1 PORTAL_BASE_URL=https://orchados.vercel.app
```

Kayıt (test projesi; `SIGNUP_PROXY_SECRET` aynı değerle Vercel'e de girilir):

```bash
SIGNUP_PROXY_SECRET=$(openssl rand -hex 32)
supabase secrets set --project-ref <ref> SIGNUP_HASH_SECRET=$(openssl rand -hex 32) \
  SIGNUP_PROXY_SECRET=$SIGNUP_PROXY_SECRET TURNSTILE_SECRET_KEY=<Turnstile gizli anahtarı>
echo "$SIGNUP_PROXY_SECRET"   # Vercel → Settings → Environment Variables → SIGNUP_PROXY_SECRET
```

**Vault** (SQL düzenleyici). İki `pg_cron` işi aynı `orchados_cron_secret`'ı kullanır: `reconcile-payments` 10 dakikada bir `payments_reconcile_url`'i, kayıt temizliği saatte bir `signup_cleanup_url`'i çağırır. Adresi ya da sır yoksa iş sessizce hiçbir şey yapmaz; `signup_cleanup_url` olmadan telefonunu 24 saatte doğrulamayan self-servis hesaplar (e-posta, telefon, parola özeti) `auth.users`'ta kalır (KVKK saklama süresi):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/payments', 'payments_reconcile_url');
select vault.create_secret('https://<ref>.supabase.co/functions/v1/customer-signup', 'signup_cleanup_url');
select vault.create_secret('<ORCHADOS_CRON_SECRET ile aynı değer>', 'orchados_cron_secret');
```

**Web (Vercel):** değişkenler yukarıda, Vercel bölümünde. `ORCHADOS_PAYMENTS_ENABLED` kart ödemesi düğmesini açar. `PAYMENT_FAKE_CHECKOUT=1` yalnızca yerel, CI ve test projesinde; o zaman `/odeme/sahte` sayfası açılır (yoksa 404). Pilot Vercel projesinde tanımlanmaz.

**Alıcı e-postası:** iyzico `buyer.email` ister. `payment_begin` sırayla fatura profili, iletişim ve hesap e-postasına bakar; hiçbiri yoksa (yalnızca telefonla kaydedilmiş sahip) kart denemesi açılmaz, `payments` 409 `billing_profile_incomplete` (`field: "email"`) döner ve portal fatura bilgilerine e-posta eklemesini söyler. Havale etkilenmez.

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

Pilotta hiçbiri açılmaz. `deploy-db-pilot` migration'dan önce Management API ile denetler ve şu durumlarda başarısız olur:
- `PAYMENT_FAKE_ALLOWED` secret'ı tanımlı;
- `allow_fake_payments` açık bir org var;
- `SIGNUP_TURNSTILE_DISABLED` secret'ı tanımlı;
- `accepts_signups` açık bir org var ama `TURNSTILE_SECRET_KEY`, `SIGNUP_HASH_SECRET` ya da `SIGNUP_PROXY_SECRET` tanımlı değil.

Denetim `SUPABASE_ACCESS_TOKEN`'ı kullanır, değerleri okumaz (secret listesi yalnızca adları verir). Vercel'deki `SIGNUP_PROXY_SECRET`'ı ve Vault girdilerini göremez; onlar aşağıdaki kapıda elle denetlenir.

**Kayıt kapısı:** Kayıt (`accepts_signups`) bir org'da açılmadan önce:
- Edge: `TURNSTILE_SECRET_KEY` (canlı), `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET`;
- Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (canlı), Edge'dekiyle aynı `SIGNUP_PROXY_SECRET`;
- Vault: `signup_cleanup_url`, `orchados_cron_secret`.

Test projesinde Cloudflare'in test anahtarları kullanılır. `accepts_signups` dağıtımdan sonra `/operasyon/ayarlar`'dan açılabildiği için dağıtım denetimi tek başına yetmez: `customer-signup` `TURNSTILE_SECRET_KEY` olmadan kayıt almaz (fail closed).

**Geri alma:**
- Kayıt: `accepts_signups = false` (`/operasyon/ayarlar` › Dışarıdan kayıt, ya da SQL). Sunucu tarafındaki anahtar budur: `customer-signup` herkese açıktır (`verify_jwt = false`), doğrudan gelen istekler de 503 `signup_closed` alır. `ORCHADOS_SIGNUP_ENABLED` bayrağını kapatmak yalnızca `/kayit` arayüzünü gizler, kaydı **kapatmaz**.
- Kart ödemesi: `ORCHADOS_PAYMENTS_ENABLED` kapatılır; Edge'de `PAYMENT_PROVIDER` silinirse `payments` da 503 döner.

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
