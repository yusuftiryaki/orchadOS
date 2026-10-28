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
| Demo turu (İP13) | Vercel `orchados-demo` projesi (`main`), `demo.<alan adı>` | Supabase `orchados-demo` projesi (AB bölgesi), yalnızca sentetik demo verisi | `main`'de migration ya da fonksiyon değişince (`deploy-db-demo`); veri elle (`demo-data`). Ayrıntı: aşağıda, Demo turu |

**Sürüm akışı:** Değişiklikler önce `main`'e birleşir ve test ortamında denenir. Pilota çıkmak için `main`'den `release`'e bir PR açılır. Birleşince `deploy-db-pilot` migration ve fonksiyonları pilot projesine uygular; Vercel `orchados-pilot` projesi `release`'i yayımlar. Pilot projesi başka dallar için önizleme derlemez, pilot veritabanına önizleme bağlanmaz.

**Dikkat:** PR önizlemeleri de test veritabanını kullanır. Bir PR yeni bir migration içeriyorsa, önizlemedeki web uygulaması migration `main`'e birleşene kadar eski şemayla çalışır.

## GitHub Actions iş akışları

| İş akışı | Ne zaman | Ne yapar |
| --- | --- | --- |
| `ci-db-web` | `supabase/`, `apps/web/` ya da kökteki paket dosyaları değişince | Yerel Supabase'i başlatır; migration + seed; pgTAP testleri; üretilmiş tiplerin güncelliği; lint, derleme, birim, entegrasyon ve tarayıcı testleri |
| `ci-pipeline` | `services/pipeline/` değişince | ruff, pytest, sentetik oturumla uçtan uca çalıştırma |
| `ci-firmware` | `firmware/` değişince | Native testler, ESP32 derlemesi; `firmware.bin` 14 gün saklanır |
| `ci-field` | `apps/field/` değişince | analyze, test, üretilmiş kodun güncelliği. `main`'de ayrıca debug APK derlenir ve 7 gün saklanır |
| `deploy-db` | `main`'de `supabase/migrations/`, `supabase/functions/` ya da `supabase/config.toml` değişince, ya da elle (yalnızca `main`'den) | `test` ortamında koşar. `supabase db push` ile test projesine migration uygular ve bütün Edge Function'ları dağıtır. Seed uygulanmaz |
| `deploy-db-pilot` | `release`'te aynı yollar değişince, ya da elle (yalnızca `release`'ten) | `pilot` ortamında koşar; aynısını pilot projesine yapar. Seed hiçbir zaman uygulanmaz. Önce ödeme, kayıt ve demo kilitlerini denetler (aşağıda, Ödeme ve Demo turu) |
| `deploy-db-demo` | `main`'de aynı yollar değişince, ya da elle (yalnızca `main`'den) | `demo` ortamında koşar; aynısını demo projesine yapar. Önce demo projesinin kilitlerini denetler (aşağıda, Demo turu). Demo projesi açılana kadar iş akışı GitHub'da devre dışıdır |
| `demo-data` | Yalnızca elle (`workflow_dispatch`, yalnızca `main`'den) | `test` ya da `demo` ortamında koşar. Demo turu verisini test ya da demo projesine yükler, açar ya da kapatır (aşağıda, Demo turu) |
| `keepalive` | Haftada iki kez | Ücretsiz Supabase projelerinin (test, pilot) duraklatılmaması için küçük bir istek. Test adresi yoksa ya da yanıt gelmezse (`000`) başarısız olur |

**Dakika bütçesi:** Private repoda ayda 2.000 dakika ücretsiz. İş akışları sadece ilgili klasör değişince koşar. Firmware araç zinciri ve Flutter önbelleğe alınır.

## GitHub secret'ları ve ortamları

Bir projenin veritabanına dokunan her iş, o projenin **GitHub Environment**'ında koşar ve secret'larını yalnızca oradan okur. Repo düzeyinde veritabanı secret'ı kalmaz; böylece bir daldaki iş akışı ya da başka bir daldan `workflow_dispatch` bu secret'lara ulaşamaz. İşler ayrıca kendi dalına bağlıdır (`if: github.ref == ...`).

| Ortam | Dağıtım dalı kuralı | Zorunlu onaylayıcı | İşler | Secret'lar |
| --- | --- | --- | --- | --- |
| `test` | Yalnızca `main` | İsteğe bağlı (açılırsa her `deploy-db` bir onay bekler) | `deploy-db`, `demo-data` (`project=test`) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `demo` | Yalnızca `main` | Evet (her `deploy-db-demo` ve `demo-data` bir onay bekler) | `deploy-db-demo`, `demo-data` (`project=demo`) | `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY` |
| `pilot` | Yalnızca `release` | Evet | `deploy-db-pilot` | `SUPABASE_ACCESS_TOKEN`, `PILOT_SUPABASE_PROJECT_REF`, `PILOT_SUPABASE_DB_PASSWORD` |

**Eksik secret işi başarısız kılar;** uyarıyla atlanıp yeşil bitmez. Tek istisna kurulmadan önceki test projesidir ve açıkça seçilir: repo değişkeni `SUPABASE_TEST_PENDING=1` (`gh variable set SUPABASE_TEST_PENDING --body 1`) varken `deploy-db` ve `keepalive`'ın test isteği uyarıyla atlanır. Henüz açılmamış bir demo ya da pilot projesinin iş akışı devre dışı bırakılır (`gh workflow disable deploy-db-demo`), proje açılınca yeniden açılır (`gh workflow enable deploy-db-demo`).

**Repo düzeyinde kalanlar** yalnızca herkese açık değerlerdir: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`keepalive`, `ci-field`'ın APK derlemesi), `PILOT_SUPABASE_URL`, `PILOT_SUPABASE_ANON_KEY` (`keepalive`). anon anahtarı zaten her web derlemesinde bulunur. Zamanlanmış `keepalive` bu yüzden onay beklemez. `test` ortamındaki `SUPABASE_URL`/`SUPABASE_ANON_KEY` aynı değerlerin kopyasıdır (`demo-data` için).

| Secret | Nereden |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens (üç ortamda aynı token) |
| `*_SUPABASE_DB_PASSWORD` | Proje oluşturulurken belirlenen veritabanı parolası |
| `*_SUPABASE_PROJECT_REF` | Proje ayarları → General → Project ID |
| `*_SUPABASE_URL` | Proje ayarları → API → Project URL |
| `*_SUPABASE_ANON_KEY` | Proje ayarları → API → anon / publishable key |

Test projesi öneksiz adları, pilot `PILOT_`, demo (İP13) `DEMO_` önekini kullanır. Ortam secret'ı `gh secret set <AD> --env <ortam>` ile, repo secret'ı `gh secret set <AD>` ile ayarlanır; komut değeri gizli olarak sorar.

**Geçiş (insan eylemi, bir kez):**
1. GitHub → Settings → Environments: `test`, `demo`, `pilot` ortamlarını yukarıdaki dal kurallarıyla (Deployment branches → Selected branches) ve onaylayıcılarla açmak.
2. Secret'ları tablodaki ortamlara girmek (`gh secret set SUPABASE_DB_PASSWORD --env test` vb.).
3. Repo düzeyindeki veritabanı secret'larını silmek: `gh secret delete SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `PILOT_SUPABASE_DB_PASSWORD`, `PILOT_SUPABASE_PROJECT_REF` ve bütün `DEMO_*`. Herkese açık dört değer (yukarıda) repo düzeyinde kalır.
4. Demo projesi henüz yoksa: `gh workflow disable deploy-db-demo`.
5. `deploy-db`'yi `main`'de, `deploy-db-pilot`'u `release`'te elle çalıştırıp yeşil bittiğini görmek.

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

`deploy-db`, `deploy-db-pilot` ve `deploy-db-demo` `supabase/functions` altındaki sekiz fonksiyonun hepsini dağıtır: `invite-user`, `send-notifications`, `send-sms`, `customer-signup` (İP12 kayıt), `payments`, `payment-callback`, `payment-webhook` (İP12 ödeme), `demo-start` (İP13 demo turu). `verify_jwt` ayarı `supabase/config.toml`'dan gelir. Servis anahtarı sadece Supabase içinde kalır.

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

## Demo turu (İP13)

Tasarım: [demo-turu.md](demo-turu.md) §3.4, §4, §7, §11–§16. Bahçe sahibi adayları hesap açmadan, geçici bir demo hesabıyla sentetik iki bahçeyi sahip portalında gezer. Herkese açık demo **yalnızca kendi Supabase ve Vercel projesinde** çalışır; pilot projesinde hiç açılmaz, pilot sitesi yalnızca demo adresine link verir. Migration'lar ve Edge Function'lar her projeye gider; demo org'u olmayan projede bir şey yapmaz.

**Anahtarlar** (hepsi varsayılan olarak kapalı): web `ORCHADOS_DEMO_ENABLED` (bu dağıtım `/demo`'yu sunar), web `ORCHADOS_DEMO_URL` (sitenin "Demoyu dene" hedefi), Edge `ORCHADOS_DEMO_MODE` (tanımsızsa `demo-start` 503 `demo_closed` döner), veritabanı `private.demo_org.enabled`.

### Demo projesi ve dağıtımı

- **Supabase:** `orchados-demo`, AB bölgesi. Yalnızca sentetik demo org'u; seed uygulanmaz, veri `demo-data` ile gelir. Gerçek müşteri verisi hiçbir zaman buraya girmez (`deploy-db-demo` denetler).
- **Vercel:** `orchados-demo` projesi; aynı repo, üretim dalı `main`, kök dizin `apps/web`. Adres `demo.<alan adı>` (DNS'te CNAME, Vercel → Domains). Supabase Auth'ta Site URL ve yönlendirme adresleri demo alan adıdır.
- **Önizleme yok:** Pilot gibi demo projesi de başka dallar için önizleme derlemez. Vercel → Settings → Git → Ignored Build Step: `[ "$VERCEL_ENV" != production ]` komutu (çıkış kodu 0 derlemeyi atlar), ya da önizleme dağıtımları kapatılır. Aşağıdaki değişkenlerin hepsi yalnızca **Production** kapsamına girilir; birleşmemiş kod herkese açık demo veritabanına, `SIGNUP_PROXY_SECRET` ile ve henüz uygulanmamış bir şemayla hiç bağlanmaz.

| Değişken | Demo (`orchados-demo`) | Not |
| --- | --- | --- |
| `ORCHADOS_DEMO_ENABLED` | `1` | `/demo`'yu açar. Pilotta hiç tanımlanmaz |
| `ORCHADOS_MAIN_SITE_URL` | Asıl sitenin origin'i (sonda `/` yok) | Tanımlıysa dağıtım bir **demo sunucusudur**: `/` → `/demo`; `/demo/**`, `/portal/**`, Next varlıkları, `robots.txt` ve auth geri dönüşleri dışındaki site sayfaları asıl sitedeki aynı yola 307 ile gider; oturumsuz `/portal` → `/demo`; "Gerçek hesap aç" asıl sitenin `/kayit`'ına gider. Dağıtım hiçbir zaman indekslenmez |
| `ORCHADOS_SITE_URL` | `https://demo.<alan adı>` | |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Demo projesinin değerleri | Test ya da pilot projesine asla bağlanmaz |
| `SIGNUP_PROXY_SECRET` | Rastgele, demo projesinin Edge secret'ıyla **aynı** | `demo-start` istemci IP'sine bununla güvenir; yoksa bütün ziyaretçiler tek IP kovasına düşer |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Canlı** site anahtarı (demo alan adı için) | |
| `ORCHADOS_SITE_INDEXABLE` | **Tanımlanmaz** | Tanımlansa da `ORCHADOS_MAIN_SITE_URL` varken dizinleme kapalı kalır |
| `ORCHADOS_SIGNUP_ENABLED`, `ORCHADOS_PAYMENTS_ENABLED`, `PAYMENT_FAKE_CHECKOUT` | Tanımlanmaz | Kayıt ve ödeme asıl sitededir |

**Pilot sitesi:** İP12 sitesi herkese açıldığında `orchados-pilot` projesine `ORCHADOS_DEMO_URL=https://demo.<alan adı>/demo` eklenir. Landing, üst menü, `/giris` ve "Nasıl çalışır" sayfasındaki "Demoyu dene" bağlantıları yalnızca demo adresi çözülebildiğinde (`ORCHADOS_DEMO_URL` ya da aynı dağıtımda `ORCHADOS_DEMO_ENABLED`) çizilir; değişken yoksa hiçbiri görünmez. Pilot Supabase projesine hiçbir demo ayarı girmez.

### Auth ayarları (test, demo ve pilot)

- Authentication → Providers: **"Confirm phone"**, **"Confirm email"** ve **"Secure email change"** üç barındırılan projede de **açık**.
- Dışarıdan üye olma (`enable_signup`) ve anonim giriş **kapalı** kalır. Demo hesabını Admin API ile `demo-start` açar.
- Yerel yığında e-posta ve telefon onayları kapalıdır (`supabase/config.toml`, `enable_confirmations = false`). Bu yüzden veritabanı korumaları (yazma kilidi, hesap kilidi, erişim kapsamı) onaylara **dayanmaz** ve dayanmamalıdır: demo hesabının e-posta, telefon, parola ve metaveri değişikliği `auth.users` tetikleyicisiyle reddedilir. Barındırılan projelerdeki onaylar ek bir katmandır.

### Edge secret'ları ve Vault (demo projesi)

| Değişken | Değer | Not |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | **Canlı** gizli anahtar | `ORCHADOS_DEMO_MODE=public`'te zorunlu; Cloudflare'in sahte anahtarları (`1x0000…AA`, `2x0000…AA`, `3x0000…AA`) reddedilir, başlatma `demo_closed` döner |
| `SIGNUP_HASH_SECRET` | Rastgele | IP kovasının HMAC özeti (`demo:` önekiyle) |
| `SIGNUP_PROXY_SECRET` | Vercel `orchados-demo` ile aynı | |
| `ORCHADOS_CRON_SECRET` | Rastgele, Vault `orchados_cron_secret` ile aynı | `demo-cleanup` cron'unun `cleanup` çağrısı |
| `ORCHADOS_DEMO_MODE` | `public` | `dev` yalnızca test projesindeki kısa duman testinde (Turnstile secret tanımlıysa uygulanır). **Pilotta asla**: `deploy-db-pilot` bu secret tanımlıysa başarısız olur |

```bash
supabase secrets set --project-ref <demo ref> TURNSTILE_SECRET_KEY=<canlı gizli anahtar> \
  SIGNUP_HASH_SECRET=$(openssl rand -hex 32) SIGNUP_PROXY_SECRET=<Vercel'deki değer> \
  ORCHADOS_CRON_SECRET=<Vault'taki değer> ORCHADOS_DEMO_MODE=public
```

**Vault** (SQL düzenleyici). `demo-cleanup` 15 dakikada bir süresi dolan demo hesaplarını siler; adresi ya da sır yoksa hesaplar silinmez. Süresi dolan oturumların erişimini yine de `demo-housekeeping` (5 dakikada bir, yalnızca SQL) kaldırır.

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/demo-start', 'demo_cleanup_url');
select vault.create_secret('<ORCHADOS_CRON_SECRET ile aynı değer>', 'orchados_cron_secret');
```

**Harcama ve kota:** Demo projesinde harcama tavanı (Spend Cap) açık kalır ve kullanımın %80'inde bir uyarı kurulur (egress, MAU). Aşılırsa yalnızca demo projesi kısıtlanır; gerekirse `private.demo_org.max_daily_starts` düşürülür.

### İş akışları

**`deploy-db-demo`:** `main`'de `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`, iş akışının kendisi ya da `scripts/demo-guard-check.sh` değişince, ya da elle (yalnızca `main`'den) çalışır. `demo` ortamında koşar (yukarıda, GitHub secret'ları ve ortamları). `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_DB_PASSWORD` ya da `DEMO_SUPABASE_PROJECT_REF` yoksa **başarısız olur**; demo projesi açılana kadar iş akışı devre dışı bırakılır. Adımlar:
1. `supabase link`.
2. **Demo kilitleri** (Management API; secret listesi yalnızca adları verir, sorgu salt okunur). Şu durumlarda başarısız olur:
    - `private.demo_org`'a kayıtlı olmayan bir org var (demo projesinde gerçek veri olmaz);
    - açık (`enabled`) bir demo org'u var ama `TURNSTILE_SECRET_KEY`, `ORCHADOS_DEMO_MODE`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET` secret'larından biri ya da Vault `demo_cleanup_url` veya `orchados_cron_secret` eksik (ikisi olmadan `demo-cleanup` süresi dolan ziyaretçi hesaplarını sessizce hiç silmez);
    - bir org'da `accepts_signups` ya da `allow_fake_payments` açık;
    - `PAYMENT_FAKE_ALLOWED` secret'ı tanımlı.
3. `supabase db push --include-all`.
4. **Demo koruması denetimi** (`scripts/demo-guard-check.sh`): `private.attach_demo_guards()` eksik kalmış `zz_demo_read_only` tetikleyicilerini yeniden takar (uyarı yazar), `private.demo_guard_drift()` bir sapma bulursa iş başarısız olur. Sebep: `--include-all` geç birleşen, eski zaman damgalı bir migration'ı İP13-A migration'larından sonra uygular. `db push` yarıda başarısız olsa da çalışır (her migration dosyası ayrı işlemde uygulanır; başarısızlıktan önce uygulananların tabloları da korumayı almalı). Düzeltme yeni bir migration'la yapılır; zaman damgası mevcut en yeni migration'dan sonra gelir (CLAUDE.md; CI `scripts/check-migration-order.sh` ile denetler). Aynı denetim `deploy-db` ve `deploy-db-pilot`'ta da `db push`'tan sonra çalışır.
5. Bütün Edge Function'ların dağıtımı (`demo-start` dahil).

**`demo-data`:** Yalnızca elle (`workflow_dispatch`); eşzamanlılık grubu `demo-data-<project>`. Girdiler:

| Girdi | Değerler | Not |
| --- | --- | --- |
| `project` | `test` \| `demo` | Pilot seçeneği yoktur. Her proje yalnızca kendi ortamının secret'larını kullanır; eksik bir `DEMO_` secret'ı test projesine düşmez, iş başarısız olur |
| `action` | `load` (varsayılan) \| `enable` \| `disable` | Önce `load`, doğrulama geçince ayrı bir çalıştırmayla `enable`. `enable`/`disable` yalnızca kayıt anahtarını değiştirir, derleme yapmaz |
| `dry_run` | `false` (varsayılan) | `load`: SQL çalışır ve geri alınır, hiçbir şey yazılmaz |
| `reuse_build_run_id` | Boş ya da önceki bir çalıştırmanın kimliği | `load`: o çalıştırmanın `demo-build-full` artefaktını kullanır (yarım kalmış yüklemeyi aynı baytlarla tamamlamak için). Yalnızca bu iş akışının `main` üzerinde elle başlatılmış bir çalıştırması kabul edilir |

**Koruma:** İş yalnızca `main`'den çalışır ve projenin adını taşıyan GitHub Environment'ında koşar (`environment: test` ya da `demo`), `deploy-db` ve `deploy-db-demo` ile aynı ortamlarda (yukarıda, GitHub secret'ları ve ortamları). Projenin veritabanı secret'ları yalnızca o ortamdadır; repo düzeyinde kopyası kalmaz. Secret'lar yalnızca onlara ihtiyaç duyan adımlara verilir.

`load` adımları: `supabase link`, oturum havuzu adresi (5432; GitHub runner'larında IPv6 yok), `uv sync --locked`, `orchados-pipeline demo build --profile full` ya da artefaktın indirilmesi, 150 MB boyut sınırı, artefaktın yüklenmesi (30 gün), `orchados-pipeline demo load --target remote --profile full --verify` (demo projesinde ayrıca `--demo-only`: başka bir org varsa reddedilir). SQL veritabanı parolasıyla psql üzerinden, medya Storage API'sine demo org'unun operasyon kişisiyle (o çalıştırmaya özel geçici parola) gider; servis anahtarı kullanılmaz. Özet (satır sayıları, dosyalar) iş özetine yazılır.

GitHub secret'ları: `test` ortamında `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`; `demo` ortamında `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`.

### Pilot denetimleri

`deploy-db-pilot` migration'dan önce, ödeme ve kayıt kilitlerine (yukarıda) ek olarak şu durumlarda başarısız olur:
- `private.demo_org`'da herhangi bir satır var;
- `ORCHADOS_DEMO_MODE` secret'ı tanımlı;
- `demo-media` kovasında nesne var.

`db push`'tan sonra demo koruması denetimi (`scripts/demo-guard-check.sh`) pilotta da çalışır.

### Log saklama

Ziyaretçinin ham IP'si ve tarayıcı bilgisi veritabanında yalnızca GoTrue oturum satırında (hesap silinene kadar) ve denetim kayıtlarında (silme en iyi çaba ile) kalır. Bunun dışında Supabase (API, Auth, Postgres), Edge Function ve Vercel logları ham IP'yi sağlayıcının, **plana göre değişen** saklama süresince tutar. Sağlayıcıların belgelediği değerler (Ekim 2026 itibarıyla; yayına almadan önce fiyat ve belge sayfalarından yeniden doğrulanmalı):

| Sağlayıcı | Plan | Log saklama (yaklaşık) |
| --- | --- | --- |
| Supabase (Edge logları dahil) | Free | 1 gün |
| | Pro | 7 gün |
| | Team | 28 gün |
| | Enterprise | 90 güne kadar |
| Vercel runtime logları | Hobby | 1 saat |
| | Pro | 1 gün |
| | Observability Plus ya da log drain | Daha uzun (eklentiye ya da hedefe göre) |

Plan değişince (ör. demo projesi Pro'ya geçerse) süre de değişir; gizlilik metnindeki demo paragrafı (avukat onayı, demo-turu.md §16) buna göre yazılır. Log drain kurulursa ham IP o hedefte de saklanır; kurmadan önce gizlilik metni gözden geçirilir.

### Yayına alma sırası

1. **Birleştirme:** Bütün anahtarlar kapalı. Migration'lar ve fonksiyonlar test (`deploy-db`), pilot (`deploy-db-pilot`, `release` ile) ve demo (`deploy-db-demo`; demo projesi açılana kadar iş akışı devre dışı) projelerine gider. Önce GitHub ortamları ve secret geçişi (yukarıda, GitHub secret'ları ve ortamları). Hiçbir projede `ORCHADOS_DEMO_MODE` yoktur, başlatma `demo_closed` döner.
2. **Test projesi (kısa, ekip içi duman testi):**
    1. Auth onayları açılır (yukarıda).
    2. Edge `ORCHADOS_DEMO_MODE=dev`; Vault `demo_cleanup_url` ve `orchados_cron_secret` (ikisi de gerekli; biri yoksa süresi dolan hesaplar silinmez).
    3. `demo-data`: `project=test action=load`, sonra `action=enable`.
    4. Vercel `orchados` projesinde yalnızca duman süresince `ORCHADOS_DEMO_ENABLED=1`.
    5. Duman listesi (aşağıda).
    6. Bitince `action=disable`, bayrak kaldırılır, `ORCHADOS_DEMO_MODE` silinir.
3. **Demo projesi:** Supabase `orchados-demo` açılır; `DEMO_` secret'ları `demo` ortamına girilir, `gh workflow enable deploy-db-demo` ve `deploy-db-demo` elle çalıştırılır. Auth (kayıt ve anonim giriş kapalı, üç onay açık, Site URL demo alan adı), Edge secret'ları, Vault (`demo_cleanup_url`, `orchados_cron_secret`), harcama tavanı ve %80 uyarısı. `demo-data`: `project=demo action=load`, sonra `action=enable`; ardından `deploy-db-demo` bir kez daha elle çalıştırılır (açık demo için kilitler). Vercel `orchados-demo` (önizlemeler kapalı, değişkenler yalnızca Production) ve DNS. Duman listesi demo adresinde tekrarlanır.
4. **Pilot sitesi:** İP12 sitesi herkese açılınca `orchados-pilot`'a `ORCHADOS_DEMO_URL`.

**Duman listesi** (test projesinde ve demo adresinde, elle):
- [ ] Başlatma çalışır: ziyaretçi e-posta alan adı (`private.demo_org.visitor_email_domain`, varsayılan `demo.orchados.invalid`) barındırılan GoTrue'dan geçer. Geçmezse null MX kayıtlı (RFC 7505) şirket alt alan adı açılır ve yazılır:
  ```sql
  update private.demo_org set visitor_email_domain = 'ziyaretci.<alan adı>';
  ```
- [ ] Rehberli tur 10 adımıyla çalışır.
- [ ] İki PDF (karne, envanter) iner; "ÖRNEK RAPOR" filigranlı, yanıtta `X-Orchados-Sample: 1`.
- [ ] Mobil görünüm doğru.
- [ ] "Demodan çık" çalışır, landing'e döner.
- [ ] `updateUser` denemeleri (e-posta, telefon, parola, metaveri) hata verir.
- [ ] `private.message_outbox` ve `notification` tablolarında demo satırı yok.
- [ ] 3 saat sonra `private.demo_session` boş.

**Geri alma:**
- Pilotta `ORCHADOS_DEMO_URL` kaldırılır (yeniden dağıtım); CTA'lar kaybolur.
- Demo projesinde `demo-data` `action=disable`, ya da SQL:
  ```sql
  update private.demo_org set enabled = false;
  ```
- Açık oturumları hemen bitirmek için (oturum kapısı ziyaretçiyi bir sonraki istekte `/demo/bitti`'ye gönderir):
  ```sql
  update private.demo_session set expires_at = now();
  ```
- Gerekirse Edge'den `ORCHADOS_DEMO_MODE` kaldırılır (`supabase secrets unset --project-ref <ref> ORCHADOS_DEMO_MODE`); başlatma 503 `demo_closed` döner.

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
