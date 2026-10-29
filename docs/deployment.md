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
| Demo turu (İP13) | Vercel `orchados-demo` projesi (`main`), `demo.<alan adı>` | Supabase `orchados-demo` projesi (AB bölgesi), yalnızca sentetik demo verisi. **Şimdilik test projesi** (`DEMO_HOST=test`; aşağıda, Ortak barındırma) | `main`'de migration ya da fonksiyon değişince (`deploy-db-demo`; ortak barındırmada `deploy-db`); veri elle (`demo-data`). Ayrıntı: aşağıda, Demo turu |

**Sürüm akışı:** Değişiklikler önce `main`'e birleşir ve test ortamında denenir. Pilota çıkmak için `main`'den `release`'e bir PR açılır. Birleşince `deploy-db-pilot` migration ve fonksiyonları pilot projesine uygular; Vercel `orchados-pilot` projesi `release`'i yayımlar. Pilot projesi başka dallar için önizleme derlemez, pilot veritabanına önizleme bağlanmaz.

**Dikkat:** PR önizlemeleri de test veritabanını kullanır. Bir PR yeni bir migration içeriyorsa, önizlemedeki web uygulaması migration `main`'e birleşene kadar eski şemayla çalışır.

## GitHub Actions iş akışları

| İş akışı | Ne zaman | Ne yapar |
| --- | --- | --- |
| `ci-db-web` | `supabase/`, `apps/web/` ya da kökteki paket dosyaları değişince | Yerel Supabase'i başlatır; migration + seed; pgTAP testleri; üretilmiş tiplerin güncelliği; lint, derleme, birim, entegrasyon ve tarayıcı testleri |
| `ci-pipeline` | `services/pipeline/` değişince | ruff, pytest, sentetik oturumla uçtan uca çalıştırma |
| `ci-firmware` | `firmware/` değişince | Native testler, ESP32 derlemesi; `firmware.bin` 14 gün saklanır |
| `ci-field` | `apps/field/` değişince | analyze, test, üretilmiş kodun güncelliği. `main`'de ayrıca debug APK derlenir ve 7 gün saklanır |
| `deploy-db` | `main`'de `supabase/migrations/`, `supabase/functions/` ya da `supabase/config.toml` değişince, ya da elle (yalnızca `main`'den) | `test` ortamında koşar. `supabase db push` ile test projesine migration uygular ve bütün Edge Function'ları dağıtır. Seed uygulanmaz. `DEMO_HOST=test` iken sonunda ortak demo kilitlerini denetler (aşağıda, Ortak barındırma). En sonda Vault `signup_cleanup_url`'i yazar ve kayıt temizliğini denetler (aşağıda, Kısa saklama denetimleri) |
| `deploy-db-pilot` | `release`'te aynı yollar değişince, ya da elle (yalnızca `release`'ten) | `pilot` ortamında koşar; aynısını pilot projesine yapar. Seed hiçbir zaman uygulanmaz. Önce ödeme, kayıt ve demo kilitlerini denetler (aşağıda, Ödeme ve Demo turu); en sonda Vault `signup_cleanup_url`'i yazar ve kayıt temizliğini denetler (aşağıda, Kısa saklama denetimleri) |
| `provision-pilot-signup` | Yalnızca elle (`workflow_dispatch`, yalnızca `release`'ten) | `pilot` ortamında koşar. Pilotta self-servis kaydı açar ya da kapatır: Edge secret'ları, Vault, Vercel `orchados-pilot` değişkenleri, `accepts_signups`, `release`'in üretim dağıtımı; SMS'in telefona gidip gitmediğini (`sms_ready`) raporlar. Tekrar çalıştırmak güvenlidir (aşağıda, Pilot kaydı açma / kapama) |
| `deploy-db-demo` | `main`'de aynı yollar değişince, ya da elle (yalnızca `main`'den) | `demo` ortamında koşar; aynısını demo projesine yapar. Önce demo projesinin kilitlerini denetler (aşağıda, Demo turu). Demo projesi açılana kadar iş akışı GitHub'da devre dışıdır. `DEMO_HOST=test` iken `test` ortamında koşar ve yalnızca ortak demo kilitlerini denetler. İki kipte de en sonda GoTrue denetim kaydı temizliğini denetler (aşağıda, Kısa saklama denetimleri) |
| `demo-data` | Yalnızca elle (`workflow_dispatch`, yalnızca `main`'den) | `test` ya da `demo` ortamında koşar. Demo turu verisini test ya da demo projesine yükler, açar ya da kapatır (aşağıda, Demo turu). `DEMO_HOST=test` iken `project=demo` test projesidir |
| `provision-demo` | Yalnızca elle (`workflow_dispatch`, yalnızca `main`'den) | `demo` ortamında koşar. Demo turunu test projesinde (`host=test`, şimdilik varsayılan) ya da ayrı Supabase projesinde (`host=separate`) ve Vercel `orchados-demo` projesinde kurar ya da günceller; tekrar çalıştırmak güvenlidir. Migration ve veri yüklemez (aşağıda, Demo turu › Kurulum) |
| `ci-scripts` | `scripts/provision-demo.sh`, `scripts/provision-pilot-signup.sh`, `scripts/vault-signup-cleanup.sh`, `scripts/demo-lock-check.sh`, `scripts/retention-check.sh`, testleri ya da dağıtım, demo ve pilot kayıt iş akışları değişince | shellcheck, actionlint ve sahte Supabase/Vercel API'sine karşı `scripts/test-provision-demo.sh` (demo kilitleri ve kısa saklama denetimleri dahil) ile `scripts/test-provision-pilot.sh` (pilot kaydı ve `signup_cleanup_url`); gönderilen her SQL düz bir Postgres servisinde çalıştırılır (`scripts/test-script-sql.sh`). Kilit ve saklama sorguları ayrıca `ci-db-web`'de yerel Supabase'te hazırlanmış satırlarla denenir (`scripts/test-demo-lock-sql.sh`) |
| `keepalive` | Haftada iki kez | Ücretsiz Supabase projelerinin (test, pilot) duraklatılmaması için küçük bir istek. Test adresi yoksa ya da yanıt gelmezse (`000`) başarısız olur |

**Dakika bütçesi:** Private repoda ayda 2.000 dakika ücretsiz. İş akışları sadece ilgili klasör değişince koşar. Firmware araç zinciri ve Flutter önbelleğe alınır.

## GitHub secret'ları ve ortamları

Bir projenin veritabanına dokunan her iş, o projenin **GitHub Environment**'ında koşar ve secret'larını yalnızca oradan okur. Repo düzeyinde veritabanı secret'ı kalmaz; böylece bir daldaki iş akışı ya da başka bir daldan `workflow_dispatch` bu secret'lara ulaşamaz. İşler ayrıca kendi dalına bağlıdır (`if: github.ref == ...`).

| Ortam | Dağıtım dalı kuralı | Zorunlu onaylayıcı | İşler | Secret'lar |
| --- | --- | --- | --- | --- |
| `test` | Yalnızca `main` | İsteğe bağlı (açılırsa her `deploy-db` bir onay bekler) | `deploy-db`, `demo-data` (`project=test`) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `demo` | Yalnızca `main` | Evet (her `deploy-db-demo` ve `demo-data` bir onay bekler) | `deploy-db-demo`, `demo-data` (`project=demo`) | `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY` |
| `pilot` | Yalnızca `release` | Evet | `deploy-db-pilot`, `provision-pilot-signup` | `SUPABASE_ACCESS_TOKEN`, `PILOT_SUPABASE_PROJECT_REF`, `PILOT_SUPABASE_DB_PASSWORD`; `provision-pilot-signup` ayrıca `PILOT_SUPABASE_URL`, `VERCEL_TOKEN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` ve varsa `PILOT_NETGSM_USERCODE`, `PILOT_NETGSM_PASSWORD`, `PILOT_NETGSM_MSGHEADER` (ortamda ya da repo düzeyinde) |

**Eksik secret işi başarısız kılar;** uyarıyla atlanıp yeşil bitmez. Tek istisna kurulmadan önceki test projesidir ve açıkça seçilir: repo değişkeni `SUPABASE_TEST_PENDING=1` (`gh variable set SUPABASE_TEST_PENDING --body 1`) varken `deploy-db` ve `keepalive`'ın test isteği uyarıyla atlanır. Henüz açılmamış bir demo ya da pilot projesinin iş akışı devre dışı bırakılır (`gh workflow disable deploy-db-demo`), proje açılınca yeniden açılır (`gh workflow enable deploy-db-demo`).

**Repo düzeyinde kalanlar** yalnızca herkese açık değerlerdir: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`keepalive`, `ci-field`'ın APK derlemesi), `PILOT_SUPABASE_URL`, `PILOT_SUPABASE_ANON_KEY` (`keepalive`). anon anahtarı zaten her web derlemesinde bulunur. Zamanlanmış `keepalive` bu yüzden onay beklemez. `test` ortamındaki `SUPABASE_URL`/`SUPABASE_ANON_KEY` aynı değerlerin kopyasıdır (`demo-data` için).

| Secret | Nereden |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens (üç ortamda aynı token) |
| `*_SUPABASE_DB_PASSWORD` | Proje oluşturulurken belirlenen veritabanı parolası |
| `*_SUPABASE_PROJECT_REF` | Proje ayarları → General → Project ID |
| `*_SUPABASE_URL` | Proje ayarları → API → Project URL |
| `*_SUPABASE_ANON_KEY` | Proje ayarları → API → anon / publishable key |

**`provision-demo`'nun secret'ları** (`demo` ortamında koşar; ortam secret'ı aynı adlı repo secret'ını gölgeler, ikisi de görünür): `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_DB_PASSWORD` (yeni projenin parolası), `VERCEL_TOKEN`; isteğe bağlı `SUPABASE_PROJECT_REF` (yalnızca demo projesinin açılacağı organizasyonu bulmak için; yoksa token'ın tek organizasyonu kullanılır, birden çoksa iş başarısız olur), `TURNSTILE_SITE_KEY` ve `TURNSTILE_SECRET_KEY` (canlı anahtarlar; yoksa demo kapalı kalır). `host=test` ayrıca repo düzeyindeki herkese açık `SUPABASE_URL`, `SUPABASE_ANON_KEY` (test projesi) ve `PILOT_SUPABASE_URL` (pilotu reddetmek için) değerlerini okur; bu kipte `SUPABASE_PROJECT_REF` (test projesinin ref'i, `deploy-db`'nin kullandığı) ve `https://<ref>.supabase.co` biçiminde `PILOT_SUPABASE_URL` zorunludur; `DEMO_SUPABASE_DB_PASSWORD` gerekmez. Repo değişkeni `DEMO_HOST` (`test` ya da tanımsız) özete yansır. `deploy-db-demo` ve `demo-data` aynı ortamda koşar: `DEMO_SUPABASE_DB_PASSWORD` `demo` ortamında, öteki `DEMO_*` secret'ları ve `SUPABASE_ACCESS_TOKEN` ister ortamda ister repo düzeyinde olsun okunur.

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
| `ORCHADOS_SIGNUP_ENABLED` | `1`: `/kayit` ve kayıt bağlantıları görünür. Kapalıyken `/kayit` "Kayıt yakında" der ve iletişim, paketler, demo ve giriş bağlantılarını gösterir. Yalnızca arayüz; kaydı sunucuda `accepts_signups` açar ve kapatır (Ödeme › Geri alma) | Kayıt denenirken `1` | `provision-pilot-signup` yazar (`signups=on`: `1`, `off`: silinir) |
| `ORCHADOS_PAYMENTS_ENABLED` | `1`: portalda "Kartla öde" | Ödeme denenirken `1` | iyzico canlı hesabı ve sandbox listesi tamamlanınca `1` |
| `PAYMENT_FAKE_CHECKOUT` | `1`: `/odeme/sahte` sayfası (sahte sağlayıcı) | Sahte ödeme denenirken `1` | **Asla tanımlanmaz** |
| `ORCHADOS_SITE_INDEXABLE` | `1`: `robots.txt` dizinlemeye izin verir, site haritası dolar | Boş | Alan adı bağlanınca `1` |
| `ORCHADOS_SITE_URL` | `robots.txt` ve site haritasındaki adres (sonda `/` yok). Boşsa `http://localhost:3000` | `https://orchados-orchad-os.vercel.app` | Pilot adresi, alan adı gelince o |
| `SIGNUP_PROXY_SECRET` | `customer-signup` ile ortak sır; Next sunucusu ziyaretçi IP'sini bununla iletir. Edge'deki değerle **aynı**; yalnızca sunucu, asla `NEXT_PUBLIC` | Rastgele | Rastgele (test projesinden farklı) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Kayıt formundaki Turnstile widget'ı | Cloudflare test site anahtarı | **Zorunlu**, canlı site anahtarı (`provision-pilot-signup`, GitHub `TURNSTILE_SITE_KEY`'den); anahtarın Cloudflare'deki alan adı listesinde pilot adresi olmalı |
| `ORCHADOS_DEMO_URL` | Sitenin "Demoyu dene" bağlantılarının hedefi; boşsa bağlantılar çizilmez (aşağıda, Demo turu › Pilot sitesi) | Boş | `https://orchados-demo.vercel.app/demo` (`provision-pilot-signup`) |
| `NEXT_PUBLIC_CAPTCHA_PROVIDER` | Robot doğrulamasının widget'ı: boş ya da `turnstile` (varsayılan), `altcha` (kendi doğrulamamız). Edge'deki `CAPTCHA_PROVIDER` ile **aynı** olmalı (aşağıda, Robot doğrulaması) | Boş | Boş; değiştirmeden önce gizlilik metni |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Harita stili (MapLibre). Boşsa geliştirmede doğrudan OSM karoları, üretim derlemesinde kendi karo vekilimiz (`/harita/karo/…`) | Boş (vekil) ya da kendi stilimiz | Boş (vekil) ya da **kendi** sunucumuzdaki stil (aşağıda, Harita altlığı) |
| `ORCHADOS_CRON_SECRET` | Sözleşme belgesi taramasının (`/sistem/sozlesme-tarama`, T04) sırrı; Vault `orchados_cron_secret` ve Edge `ORCHADOS_CRON_SECRET` ile **aynı** değer. Yalnızca sunucu. Yoksa rota 503 döner, tarama çalışmaz | Vault'taki değer | Vault'taki değer (`provision-pilot-signup` üçüne birden yazar, sensitive) |
| `MAP_TILE_UPSTREAM`, `MAP_TILE_CONTACT` | Karo vekilinin kaynağı (`https://…/{z}/{x}/{y}.png`; boşsa OSM) ve kaynağın gördüğü User-Agent'taki iletişim adresi. Yalnızca sunucu | Boş | Kaynak seçilince; iletişim adresi girilir |

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
| `CAPTCHA_PROVIDER` | Robot doğrulaması: boş ya da `turnstile` (varsayılan), `altcha` (kendi sunucumuzda iş kanıtı). Başka bir değer kaydı kapatır (fail closed). `demo-start` bunu okumaz: yalnızca `DEMO_CAPTCHA_PROVIDER` (boşsa Turnstile), bilinmeyen değer demoyu kapatır | Boş | Boş; değiştirmeden önce gizlilik metni (aşağıda) |
| `ALTCHA_HMAC_KEY` | `altcha` seçiliyken sorunun imza anahtarı, en az 32 karakter (`openssl rand -hex 32`). Yoksa ya da kısaysa kayıt kapalıdır (503 `signup_closed`), demo `demo_closed` döner. `demo-start` önce `DEMO_ALTCHA_HMAC_KEY`'i okur | Yok | `altcha`'ya geçilirse rastgele |

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
-- T04 sözleşme belgesi taraması (dalga 3): Next sitesinin rotası, Vercel'de de ORCHADOS_CRON_SECRET.
select vault.create_secret('https://<site>/sistem/sozlesme-tarama', 'contract_documents_sweep_url');
```

Üçüncü iş `contract-document-sweep` 30 dakikada bir, eksik belgesi olan en çok 5 sipariş için 10 dakikalık bir bilet üretip `contract_documents_sweep_url`'e POST eder ([musteri-yonetimi.md](musteri-yonetimi.md) §20.8). Adres ya da sır yoksa iş hiçbir şey yapmaz ve kimsenin açmadığı siparişlerin belgeleri (özellikle ödemeden sonra cayma bildirimi) ops listesinden elle üretilir. Vercel'de `ORCHADOS_CRON_SECRET` yoksa rota 503 döner. Rota Vercel'in genel adresinde olmalı (önizleme koruması varsa üretim adresi).

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
- `accepts_signups` açık bir org var ama `TURNSTILE_SECRET_KEY` (`CAPTCHA_PROVIDER=altcha` ise `ALTCHA_HMAC_KEY`), `SIGNUP_HASH_SECRET` ya da `SIGNUP_PROXY_SECRET` tanımlı değil;
- `CAPTCHA_PROVIDER` `turnstile` ya da `altcha` dışında bir değer taşıyor.

`db push`'tan sonra ayrıca kayıt temizliği denetlenir (aşağıda, Kısa saklama denetimleri).

Denetim `SUPABASE_ACCESS_TOKEN`'ı kullanır, değerleri okumaz (secret listesi adları ve değerlerin sha256 özetini verir). Vercel'deki `SIGNUP_PROXY_SECRET`'ı ve Vault girdilerini göremez; onlar aşağıdaki kapıda elle denetlenir.

**Hukuki metin kapısı (T21):** `org_billing_setting.legal_gate_enforced` açıkken `customer_accept_quote` taslak sözleşme ve ön bilgilendirme metniyle, son sürüm olmayan KVKK teyidiyle ya da eksik şirket bilgisiyle teklif kabul etmez (`legal_texts_not_final`; [musteri-yonetimi.md](musteri-yonetimi.md) §9.4). Varsayılan kapalıdır; sahte ödeme ayarına bağlı değildir. Bu yüzden test projesi ve canlı demo (ortak barındırma) her ödeme kipinde, iyzico sandbox listesi de sahte kilitler kapalıyken teklif kabul eder. Yalnızca SQL ile açılır, ops ayar ekranı bu alanı yazmaz. Pilot, [yayın şartları](hukuk/kararlar.md#yayin) tamamlanıp metinler son sürüm olarak kaydedildiğinde (sürüm adında `-taslak` yok) açar:
```sql
update public.org_billing_setting set legal_gate_enforced = true where org_id = '<org>';
```
Test projesinde ve demoda açılmaz.

**Kayıt kapısı:** Kayıt (`accepts_signups`) bir org'da açılmadan önce:
- Edge: `TURNSTILE_SECRET_KEY` (canlı; kendi doğrulamamızda `ALTCHA_HMAC_KEY`), `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET`;
- Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (canlı), Edge'dekiyle aynı `SIGNUP_PROXY_SECRET`;
- Vault: `signup_cleanup_url`, `orchados_cron_secret`;
- SMS: kayıt kodu telefona ancak Send SMS hook'u ve Netgsm kuruluysa gider (aşağıda, Pilot kaydı açma / kapama › SMS).

Pilotta bunların hepsini `provision-pilot-signup` iş akışı kurar ve `accepts_signups`'ı en son açar (aşağıda, Pilot kaydı açma / kapama).

**Telefonu doğrulanmamış hesap temizliği zorunludur** ([hukuk/kararlar.md](hukuk/kararlar.md) H25, T09): `pg_cron` işi `signup-cleanup` saatte bir `customer-signup`'ın `cleanup` eylemini çağırır ve telefonunu 24 saatte doğrulamayan self-servis hesapları siler. Barındırılan bir projede kayıt bu temizlik çalışmadan açık kalamaz; `deploy-db` ve `deploy-db-pilot` bunu her dağıtımda denetler (aşağıda, Kısa saklama denetimleri).

**Hesap varlığı gizlenir** ([hukuk/kararlar.md](hukuk/kararlar.md) H33, T19): kayıtlı bir telefon yeni bir kayıtla aynı yanıtı alır (`200 verify_phone`), hesap açılmaz; kod adımı yalnızca telefonun sahibine giriş kodu gönderir ve sahip kendi hesabına girer. E-posta çakışması ayırt edilmeyen `409 not_completed` döner ("Kayıt tamamlanamadı; bu bilgilerle hesabınız varsa telefonunuzla giriş yapın."). Oran sınırlarından sonraki her yanıt en az 1,5 saniye sürer (`REGISTER_MIN_MS`), web'deki kod adımı en az 2 saniye (`CODE_STEP_MIN_MS`). Oran sınırları üretimde açık kalır.

**Kayıt bileti** (PR #93 incelemesi, iki tur; hesap ön-ele-geçirme): `register`'ın her 200 yanıtı yeni bir bilet taşır (32 rastgele bayt). Web onu `httpOnly`, `SameSite=Lax`, `Path=/` bir çerezde tutar (HTTPS'te `__Host-orchados_signup`, yerelde `orchados_signup`; bir gün; sunucu anahtarıyla telefona bağlı). `__Host-` öneki çerezin bir alt alan adından ya da düz HTTP yanıtından yerleştirilmesini (cookie fixation) engeller. Yalnızca hesap açan kaydın biletinin SHA-256'sı `private.customer_signup.ticket_hash`'e yazılır; kayıtlı telefon saklanmayan rastgele bir bilet alır, yanıt yine aynıdır.
- **Kod gönderimi Auth katmanında da denetlenir.** Kod adımı telefon doğrulama kodunu yalnızca bu tarayıcının açtığı bekleyen kayıt için ister ve bunu sunucu tarafında yapar: server action `customer-signup`'ın `send_code` eylemini telefon ve biletle çağırır. Fonksiyon servis rolüyle `signup_code_grant`'ı çağırır (yalnızca servis rolü; bilet denetimi, kayıt başına dakikada bir ve en çok altı kod), satıra 30 saniyelik bir "gönderim izni" bırakır, kodu aynı istekte Auth'tan kendisi ister (`/auth/v1/resend`) ve Auth yanıt verince izni kaldırır (`signup_code_release`). İzin böylece yalnızca sunucunun başlattığı bu tek gönderimi kapsar. `send_code` kod gitse de gitmese de en az 1,5 saniye sonra aynı boş `200`'ü döner (H33). Send SMS hook'u (`send-sms`) tamamlanmamış self-servis kaydın telefon doğrulama kodunu yalnızca bu izin varken gönderir (`signup_sms_allowed` yalnızca bakar) ve izni sağlayıcı kodu gönderdikten **sonra** tüketir (`signup_sms_sent`): oran sınırı, sağlayıcı hatası ya da Auth'un zaman aşımı sonrası yeniden denemesi izni harcamaz. Auth'un herkese açık `/auth/v1/resend` ucu izinsiz çağrılırsa hook hiçbir şey göndermez ve gönderilmiş gibi boş `200` döner (H33). Doğrulanmış telefonun giriş kodu, davet edilen kullanıcılar ve tamamlanmış müşteriler etkilenmez.
- **Kabul edilen ödünleşim: herkese açık `resend` ile kayıt engelleme.** Numarayı bilen biri, sahibi kayıt olurken `/auth/v1/resend?type=sms`'i dakikada bir çağırabilir. Hook izinsiz kodu göndermez ama `200 {}` döndüğü için Auth yeni kodu saklar; kayıt sahibinin elindeki kod sessizce geçersizleşir. Hook'un hata dönmesi Auth'un eski kodu korumasını sağlardı, fakat hata yanıtı bekleyen bir kaydı olan numarayı bilinmeyen numaradan (`200 {}`) ayırt ettirirdi; bu H33'e aykırıdır. Bu yüzden boş `200` korunur. Hesap ele geçirilemez, yalnızca kayıt geciktirilebilir. Hafifletme: kayıt sahibinin kendi biletiyle girdiği yanlış kodlar telefon kilidine sayılmaz (`phone_login_record_failure(p_phone, p_ticket)`; bilet olmadan ya da başka biletle her yanlış kod sayılır, yanıt bir şey ele vermez). Kayıt sahibi "yeniden gönder" ile `send_code`'dan yeni kod alır; Auth'un dakikada bir sınırı o kodu bir dakika boyunca yeni bir `resend`'e karşı korur.
- **Her `complete` kayıt sahibini kanıtlar; bilet yokluğu denetimi atlatmaz.** `/kayit`, `/kayit/dogrula` ve `/` çerezdeki bileti gönderir. Bekleyen kayıt ya bu bileti taşımalı ya da oturum hesabın parolasıyla açılmış olmalıdır (`amr` içinde `password`). `verifyOtp` oturumu kodun oturumuyla değiştirdiği için `/kayit/dogrula` kodu istemeden önce parola oturumuyla `claim` eylemini çağırır ve yeni bir bilet alır. Kanıt yoksa 403 `signup_mismatch` döner; web oturumu kapatır ve kullanıcıyı `/giris?kayit=yarim`'e gönderir: "kaydı siz başlattıysanız e-posta ve parolanızla giriş yapın; telefonunuzu oradan doğrularsınız; giremiyorsanız yeniden kayıt olabilirsiniz". Hiçbir zaman yalnızca "yeniden kayıt olun" demez; o, telefonu doğrulanmış kayıtta döngüye yol açardı.
- **Telefon kodu kanıtı.** GoTrue (v2.197) telefon kodunu da e-posta kodunu ve sihirli bağlantıyı da `amr` içinde `otp` olarak kaydeder; yöntem adı tek başına telefonu kanıtlamaz. `complete` bir `otp` (ya da `sms`) girdisini yalnızca o kodun damgaladığı `phone_confirmed_at` ile en çok 2 saniye farklıysa telefon kodu sayar (`latestPhoneCodeAt`); e-posta kodu `phone_confirmed_at`'e dokunmaz. Ayrıca self-servis hesaplar hiç e-posta kodu, sihirli bağlantı ya da e-posta değişikliği alamaz (aşağıda, `customer_account_guard`). Bu hesapların e-postasını kayıt sırasında kimse doğrulamadı.
- **Kapalı başarısızlık.** Kanıtsız bir telefon kodu, tamamlanmamış self-servis kayıtta telefonu doğrulanmış bırakmaz. Telefonu doğrulanmış, biletli bekleyen kayıt silinir. Auth her kod girişinde `phone_confirmed_at`'i yeniden damgaladığı için "telefon daha önce doğrulanmıştı" ayrımı yapılamaz; biletini kaybeden kayıt sahibi yeniden kayıt olur ya da silinmeden önce parolasıyla tamamlar. Karantina **önce** veritabanında yapılır: `signup_owner_check` `mismatch` döndürürken aynı işlemde telefon onayını kaldırır, hesabın oturumlarını kapatır ve satırı `review_reason = 'delete_failed'` ile işaretler. `customer-signup` hesabı ancak bundan sonra siler (iki deneme). Silme olursa satır da gider. Olmazsa karantina kalır ve logda `ALERT customer-signup: hijack candidate quarantined but not deleted` satırı çıkar. Bu satır için Supabase log uyarısı (Logs → Edge Functions, `ALERT` araması) tanımlanır. Ops'un hâlâ `delete_failed` ile gördüğü satır, silmesi olmamış satırdır. Biletten önce yazılmış satır (`ticket_hash IS NULL`) silinmez, aynı şekilde karantinaya alınır (`unproven_code`); kayıt sahibi parolasıyla tamamlar (`/kayit/dogrula`, `claim`). `signup_housekeeping` bir günü geçen, telefonu doğrulanmış ama tamamlanmamış kayıtları `unfinished` ile işaretler.
- **Karantinadaki kayıt ops çözene kadar kalır.** `review_required_at` dolu satırları ne saatlik `signup_housekeeping` siler ne de `cleanup` eylemi hesaplarını siler (`signup_review_user_ids`); yaşı bir günü geçse de. Böylece ops satırı gerçekten görür ve kayıt sahibi parolasıyla tamamlayabilir. Ops şu sorguyla bakar ve her satırı inceledikten sonra çözer: tamamlanmasını bekler ya da hesabı siler (`auth.users`'tan silinince satır da gider; KVKK saklama süresi, H25):
  ```sql
  select user_id, review_reason, review_required_at from private.customer_signup
  where review_required_at is not null and completed_at is null order by review_required_at;
  ```
- Aynı tarayıcıdan yeni bir `register` ("Bilgileri değiştir") kendi süren kaydının yerine geçer; bilet olmadan başkasının süren kaydı 30 dakika dolmadan silinmez. Aynı tarayıcıda iki sekmede iki ayrı telefonla kayıt olunursa çerezde son kaydın bileti kalır; ilk sekmedeki kod girilince o kayıt kanıtsız sayılıp silinir ve yeniden kayıt gerekir (güvenlik için kabul edilen ödünleşim).
- Kod adımı her durumda aynı metni gösterir ve kod gelmezse e-posta ve parolayla `/giris`'e yönlendirir. Auth'un numara başına sınırları (yalnızca hesabı olan numaraya işler) ve gönderim hataları da aynı kod adımını gösterir; yeniden gönderme geri sayımı istemcidedir. Yeniden gönderme yalnızca bu tarayıcıda kayıttan (robot doğrulaması ve oran sınırlarıyla) geçmiş numaraya kod ister.

**Telefon Auth üzerinden yalnızca personel hesabında, yeni numaraya giden kodla değişir.** Yerel yığında `[auth.sms] enable_confirmations = false` olduğu için `PUT /auth/v1/user` telefonu kodsuz değiştirir. Barındırılan projelerde ise "Confirm phone" açıkken bile telefon değiştirme kodu hesabın **mevcut** telefonuna gidiyordu: GoTrue v2.197 hook'a `sms.sms_type` göndermez, hook ise türü bu alandan okuyup kodu `user.phone`'a yolluyordu. İki durumda da hesap (personel hesabı dahil) sahibi olmadığı bir telefonu doğrulanmış olarak alabiliyordu; o telefonun gerçek sahibinin telefonla girişi o hesaba düşer, `ops_find_user_id` de o hesabı döndürdüğü için `invite-user` gerçek sahibin parsellerini o hesaba bağlardı. Artık:
- `auth.users` üzerinde `customer_account_guard` (BEFORE UPDATE, `demo_account_freeze` gibi) personel olmayan her hesabın (self-servis, sahip profili, parsel erişimi, rolü ve parseli olmayan hesap) `phone` ve `phone_change` alanını Auth üzerinden değiştirmesini reddeder (`phone_change_locked`, 42501); Admin API de buna dahildir. Personel hesabı (`membership` rolü olan, müşteri ya da sahip olmayan hesap) değişikliği başlatabilir, ama telefonu yalnızca bekleyen numarayı kodla onaylayarak alır; doğrudan yazma (yereldeki kodsuz değişiklik, Admin API) personelde de reddedilir. Bekleyen bir değişikliğin temizlenmesine izin verilir.
- Aynı tetikleyici self-servis hesaplarda e-posta giriş kodunu, sihirli bağlantıyı, parola sıfırlamayı (`recovery_token`) ve e-posta değişikliğini de reddeder (`email_code_locked`). Uygulamada bunların hiçbiri sunulmaz; müşteri telefonla ya da e-posta ve parolayla girer.
- Send SMS hook'u `sms_type`'a hiç bakmaz: kodu her zaman Auth'un hedef numarasına (`sms.phone`; yoksa `user.phone`) gönderir. Hedef `user.new_phone` ise (Auth bekleyen numarayı hook'tan önce yazar) bu bir telefon değiştirme kodudur ve yalnızca personel hesabına gider (`account_phone_change_allowed`); diğer hesaplar `403 phone_change_not_allowed` alır.
- Ops bir müşterinin telefonunu SQL düzenleyicide değiştirir (yalnızca `postgres`; servis rolü dahil hiçbir API rolü çağıramaz). Önce numaranın başka bir hesapta olmadığını ve yeni numaranın müşteriye ait olduğunu doğrular:
  ```sql
  select private.change_account_phone('<user_id>', '+905321234567');
  ```
  Fonksiyon telefonu yazar ve doğrulanmış sayar, bekleyen telefon değişikliğini siler. Sahip profilindeki iletişim telefonu (`private.owner_profile.phone`) ayrıca güncellenir.
- Tetikleyici bir projede yetki yüzünden kurulamazsa (`insufficient_privilege`) migration uyarı verir ve geçer. O zaman koruma yalnızca "Confirm phone" açıkken vardır: hook personel dışı hesaba telefon değiştirme kodu göndermez, personelin kodu yeni numaraya gider. "Confirm phone" kapalıysa (yerel yığın gibi) Auth telefonu kodsuz değiştirir ve hiçbir şey bunu engellemez; bu yüzden tetikleyicisiz bir projede "Confirm phone" kapatılmaz. `complete` e-posta kodu oturumunu yine telefon kanıtı saymaz.

**Dağıtım sırası (kayıt):** `deploy-db` (migration'lar, sonra Edge Function'lar) web dağıtımından **önce** biter. Vercel dağıtımı ayrı çalıştığı için yeni web, `deploy-db` tamamlanmadan yayına alınmaz (gerekirse Vercel'de "Promote" `deploy-db` yeşil olunca yapılır). Ters sırada yeni web eski `customer-signup`'tan bilet almaz, kod istemez ve `send_code` henüz yoktur; yeni kayıtlar SMS alamaz. 30 dakikalık bekleme süresi dolana kadar aynı telefonla yeniden denemek de kod getirmez. Kendiliğinden düzelir, 500 dönmez, ama kayıt o süre boyunca çalışmaz.

**Dağıtım anında süren kayıtlar baştan başlar.** Bu sürümle çerezin adı ve yolu değişti (`/kayit` → `/`, HTTPS'te `__Host-` öneki) ve biletten önce yazılmış satırların `ticket_hash` değeri boştur. Dağıtım anında kod adımında olan kullanıcının kodu kanıtsız sayılır: satır karantinaya alınır, `/giris?kayit=yarim` e-posta ve parolayla tamamlamayı anlatır. Kullanıcı isterse kaydı baştan da yapabilir (30 dakika sonra ya da hesabı silindiğinde).

**Robot doğrulama sağlayıcısı:** Web tek bir `NEXT_PUBLIC_CAPTCHA_PROVIDER` değerini hem `/kayit` hem `/demo` için kullanır. `/demo`'nun sunulduğu her dağıtımda bu değer `demo-start`'ın `DEMO_CAPTCHA_PROVIDER` değeriyle (tanımsızsa Turnstile) aynı olmalıdır. Örneğin web'de `altcha`, `demo-start`'ta varsayılan Turnstile olursa `/demo` ALTCHA kutusunu gösterir, `challenge` çağrısı 400 alır ve demo başlamaz. Ayrı `orchados-demo` Vercel projesinde değişken tanımsızdır, bu yüzden varsayılan yapılandırma çalışır.

**`SIGNUP_PROXY_SECRET` Vercel'de zorunludur:** Yoksa kayıt bileti çerezinin telefon bağı her lambda örneğinde ayrı bir anahtarla kurulur. Yeniden gönderme o zaman sık sık "yeniden kayıt olun" der. Üretimde (Vercel) eksikse web bunu bir kez hata günlüğüne yazar.

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

### Robot doğrulaması (Turnstile ya da kendi doğrulamamız)

Kayıt formu ve demo başlatma bugün Cloudflare Turnstile kullanır (varsayılan). [hukuk/kararlar.md](hukuk/kararlar.md) H03: Cloudflare KVKK standart sözleşmesini imzalamazsa Turnstile, kendi sunucumuzda çalışan açık kaynak bir iş kanıtı doğrulamasıyla (ALTCHA şeması) değiştirilir. Seçenek hazırdır, **varsayılan olarak kapalıdır** (T12).

- **Nasıl çalışır:** Next sunucusu `customer-signup` (ya da `demo-start`) fonksiyonundan `{action: "challenge"}` ile HMAC imzalı bir soru alır (10 dakika geçerli; son kullanma ve amaç `signup`/`demo` tuzun içinde, imzanın kapsamında). Tarayıcı Web Crypto ile sayıyı bulur (ortalama ~50.000 SHA-256; telefonda bir iki saniye) ve gizli `altcha` alanına yazar. Fonksiyon imzayı, özeti, süreyi ve amacı denetler, aynı çözümü ikinci kez kabul etmez. Dış betik yüklenmez, üçüncü bir tarafa istek gitmez, çerez yoktur. Kod: `supabase/functions/_shared/captcha.ts`, `apps/web/src/lib/site/altcha-solver.ts`, `components/site/turnstile.tsx` (`CaptchaWidget`).
- **Korunanlar:** Oran sınırları ve "anahtar yoksa kayıt kapalı" davranışı aynıdır: seçilen sağlayıcının anahtarı yoksa, kısaysa ya da `CAPTCHA_PROVIDER` bilinmeyen bir değerse kayıt 503 `signup_closed`, demo `demo_closed` döner. `SIGNUP_TURNSTILE_DISABLED` yalnızca yerel yığındadır.
- **Tekrar kullanım:** Kullanılmış çözümler `private.captcha_spent` tablosunda, sorunun süresi bitene kadar tutulur (`captcha_spend`; sorunun özeti birincil anahtar, `insert … on conflict do nothing`, her çağrı süresi dolmuş satırlardan bir parti siler). Tablo bütün Edge örneklerinde ortaktır: bir çözüm hangi örneğe giderse gitsin bir kez geçer. Veritabanına ulaşılamazsa çözüm kabul edilmez (fail closed). Zorluk (`ALTCHA_MAX_NUMBER`, ortalama ~50.000 SHA-256) yerel bir bot için ucuzdur; asıl sınır oran sınırlarıdır (IP başına saatte 10, telefon başına günde 3 kayıt; demoda IP kovası). Zorluğu artırmak telefonlarda bekleme süresini uzatır; gerekirse IP kovasına göre artan zorluk ayrı bir iş olarak ele alınır.
- **Yerel yığın:** `supabase/config.toml` `CAPTCHA_PROVIDER=altcha` ve yerel bir `ALTCHA_HMAC_KEY` tanımlar; `SIGNUP_TURNSTILE_DISABLED=1` ile gönderilen jeton denetlenir, jetonsuz istek geçer (testler iki yolu da dener). Web yerelde Turnstile kipindedir ve site anahtarı yoktur.

**Sağlayıcıyı değiştirmek** (yalnızca Cloudflare imzalamazsa ya da sözleşme düşerse):
1. **Önce gizlilik metni.** `gizlilik-v2-taslak` §2 ve §3 Turnstile'ı anar; KVKK metni §5'te Cloudflare satırı, demo başlatma sayfasının kısa metni ve gizlilik §5 (demo) Cloudflare'i anar. Metin güncellenir, sürüm artar (`gizlilik-v3-taslak`), eski sürüm arşive gider ve sürüm kaydı (`private.legal_text_version`) bir migration'la güncellenir. Önerilen metin (avukat onayına):
    - §2, Turnstile maddesinin yerine: “Kayıt formunda ve demo turunu başlatma sayfasında, kötüye kullanımı ve otomatik kayıtları önlemek için kendi sunucularımızda çalışan bir robot doğrulaması kullanılır. Doğrulama tarayıcınızda kısa bir hesaplama yapar; bu amaçla üçüncü bir tarafa veri aktarılmaz ve çerez kullanılmaz. Hukuki sebep, bilgi güvenliğine ilişkin meşru menfaatimizdir (KVKK md. 5/2-f).”
    - §3: ilk paragraftaki “robot doğrulaması çerezleri bilgi güvenliği (md. 5/2-f) için kullanılır” ibaresi ve çerez tablosundaki Turnstile satırı çıkar.
    - §5 (demo) ve demo başlatma sayfası: “Robot doğrulaması (Turnstile) Cloudflare Inc. (ABD) tarafından sağlanır…” cümlesi “Robot doğrulaması kendi sunucularımızda yapılır; üçüncü bir tarafa aktarılmaz.” olur.
    - KVKK metni §5: Cloudflare satırı, başka bir hizmet için kullanılmıyorsa çıkar; [yurt-disi-aktarim-kaydi.md](hukuk/yurt-disi-aktarim-kaydi.md) güncellenir.
2. Edge: `ALTCHA_HMAC_KEY` (rastgele, ≥ 32 karakter), sonra `CAPTCHA_PROVIDER=altcha`. Bu yalnızca kaydı değiştirir: `demo-start` `CAPTCHA_PROVIDER`'ı hiç okumaz, `DEMO_CAPTCHA_PROVIDER` boşsa Turnstile'da kalır. Böylece ortak demo barındırmada (`DEMO_HOST=test`) test sitesini denemek canlı demoyu bozmaz (demonun web bileşeni kendi Vercel projesinin `NEXT_PUBLIC_CAPTCHA_PROVIDER`'ını izler). Demo da geçecekse `DEMO_CAPTCHA_PROVIDER=altcha` ve `DEMO_ALTCHA_HMAC_KEY` (ayrı demo projesinde de `DEMO_CAPTCHA_PROVIDER`), ardından demo Vercel projesinde `NEXT_PUBLIC_CAPTCHA_PROVIDER=altcha`.
3. Vercel: `NEXT_PUBLIC_CAPTCHA_PROVIDER=altcha`, yeniden dağıtım. Edge ile web aynı anda değişmezse arada kayıt `captcha_failed` döner; kayıt trafiği azken yapılır.
4. `deploy-db-pilot` `CAPTCHA_PROVIDER=altcha` iken Turnstile anahtarı yerine `ALTCHA_HMAC_KEY` ister; demo kilit denetimi aynısını `DEMO_CAPTCHA_PROVIDER=altcha` iken yapar. Bilinmeyen sağlayıcıda ikisi de başarısız olur.
5. Hiçbir barındırılan projede gizlilik metni değişmeden `altcha` seçilmez; bugün hepsi Turnstile'dadır.
6. Duman testi: kayıt ve demo başlatma, tarayıcının ağ sekmesinde `challenges.cloudflare.com`'a istek yok.

### Harita altlığı

[hukuk/kararlar.md](hukuk/kararlar.md) H03, T12: üretimde tarayıcı harita karolarını doğrudan üçüncü taraf bir sunucudan istemez. `basemapStyle()` (`apps/web/src/lib/map/basemap.ts`):
- `NEXT_PUBLIC_MAP_STYLE_URL` tanımlıysa o stil kullanılır. **Üretimde yalnızca kendi altyapımızdaki ya da vekil sunucumuzdaki bir stili gösterebilir** (stilin içindeki karo, font ve sprite adresleri de); üçüncü taraf bir harita sağlayıcısının stil adresi girilmez.
- Tanımlı değilse üretim derlemesi kendi karo vekilimizi kullanır: `/harita/karo/{z}/{x}/{y}.png` (`app/harita/karo/[z]/[x]/[y]/route.ts`). Sunucu karoyu `MAP_TILE_UPSTREAM`'den (boşsa `tile.openstreetmap.org`) kendi User-Agent'ıyla alır; ziyaretçinin IP'si, çerezi ve başlıkları kaynağa gitmez. Yanıt tarayıcıda 7, CDN'de 30 gün önbelleğe alınır. Kaynağa giden istekler sınırlıdır (OSM'nin toplu indirme yasağı; bir engel bütün haritaları birden kapatır):
    - Yalnızca kendi sayfalarımızın istekleri: `Sec-Fetch-Site: same-origin`, bu başlık yoksa kendi adresimizden bir `Referer`. Başka istemciler 403 alır (CDN'deki karolar yine sunulur).
    - 7. yakınlaştırma düzeyinden itibaren yalnızca hizmet alanı (Türkiye ve çevresi, boylam 25–45,5, enlem 35–42,5); dışı 404.
    - Örnek başına istemci başına dakikada 600 karo ve örnek başına toplam dakikada 1200 kaynak isteği (aşılırsa 503).
    - User-Agent'ta iletişim adresi zorunludur: `MAP_TILE_CONTACT`, yoksa sitenin `https` adresi (`ORCHADOS_SITE_URL`, o da yoksa Vercel'in üretim adresi). Üretimde hiçbiri yoksa vekil 503 döner, kaynağa gitmez. Üretimde `MAP_TILE_CONTACT`'a bir e-posta adresi girilmesi önerilir.

  Yol `.png` ile bittiği için oturum vekilinden geçmez; demo alanında ve oturumsuz sayfalarda da çalışır (karolarda kişisel veri yoktur).
- Geliştirmede (`pnpm web:dev`) karolar eskisi gibi doğrudan OSM'den gelir.

OSM karo sunucularının kullanım koşulları (tanımlı User-Agent, önbellek, toplu indirme yok) vekil için de geçerlidir. Trafik büyürse `MAP_TILE_UPSTREAM` kendi karo sunucumuza ya da sözleşmeli bir sağlayıcıya çevrilir (sunucudan sunucuya; tarayıcı yine yalnızca bizi görür). Kaynak değişince karo atfı ("© OpenStreetMap contributors") gerekirse güncellenir. **Saha uygulamasının** altlığı (personel cihazları, `apps/field`) bu işin kapsamında değildir.

### Lansman fiyat listesi

Fiyatlar barındırılan projelere seed ile gitmez; test ve pilot projesinde ops kullanıcısı back office'ten girer. Rakamlar ve gerekçe: [fiyatlandirma.md](fiyatlandirma.md) §1.

1. **Paketler** (`/operasyon/fiyat`): üç paket açılır ya da mevcutlar düzeltilir. Açıklamalar seed'deki gibi mevsimleri yazar (Kapsamlı: altı ziyaret, [fiyatlandirma.md](fiyatlandirma.md) §1).

    | Kod | Ad | Yıllık ziyaret | Envanter dahil | Sıra |
    | --- | --- | --- | --- | --- |
    | `temel` | Temel | 2 | evet | 1 |
    | `standart` | Standart | 4 | evet | 2 |
    | `kapsamli` | Kapsamlı | 6 | evet | 3 |

    Listede kalmaması gereken eski bir paket (örneğin denemeden kalan `ekonomik`) pasife alınır; yayımlama yalnızca aktif paketlere fiyat ister.
2. **Taslak liste:** Yeni taslak; KDV %20 (2000 bp), geçerlilik başlangıcı yayım günü ya da sonrası (geçmiş gün yayımlanmaz, `valid_from_in_past`), not "Lansman fiyat listesi". Kalemler (TL, KDV hariç):

    | Paket | Birim fiyat (dönüm·ziyaret) | En az ücret | Envanter ücreti |
    | --- | --- | --- | --- |
    | Temel | 208,00 | 5.600,00 | 6.000,00 |
    | Standart | 180,00 | 11.200,00 | 6.000,00 |
    | Kapsamlı | 168,00 | 16.000,00 | 6.000,00 |

3. **Kontrol ve yayım:** Taslağı yayımlamadan önce ikinci bir kişi kontrol eder; yayımlanan liste değişmez. Yayımdan sonra `/paketler`'de Standart'ın 20 dönüm örneği yıllık 17.280 TL, ilk yıl 24.480 TL (KDV dahil) görünür. Önceden verilmiş teklifler kendi listesinde kalır (`quote.inputs`).
4. **Revizyon:** 1 Ocak ve 1 Temmuz'da yeni sürüm aynı yolla, "Bundan taslak oluştur" ile ([fiyatlandirma.md](fiyatlandirma.md) §7).

## Demo turu (İP13)

Tasarım: [demo-turu.md](demo-turu.md) §3.4, §4, §7, §11–§16. Bahçe sahibi adayları hesap açmadan, geçici bir demo hesabıyla sentetik iki bahçeyi sahip portalında gezer. Herkese açık demo **kendi Supabase ve Vercel projesinde** çalışır; Supabase organizasyonu Pro'ya geçene kadar geçici olarak **test projesinde** (aşağıda, Ortak barındırma; demo-turu.md §15.1). Pilot projesinde hiç açılmaz, pilot sitesi yalnızca demo adresine link verir. Migration'lar ve Edge Function'lar her projeye gider; demo org'u olmayan projede bir şey yapmaz.

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

**Pilot sitesi:** `orchados-pilot` projesinde `ORCHADOS_DEMO_URL=https://orchados-demo.vercel.app/demo` (alan adı gelince `https://demo.<alan adı>/demo`; `provision-pilot-signup` `demo_url` girdisiyle yazar). Landing, üst menü, `/giris` ve "Nasıl çalışır" sayfasındaki "Demoyu dene" bağlantıları yalnızca demo adresi çözülebildiğinde (`ORCHADOS_DEMO_URL` ya da aynı dağıtımda `ORCHADOS_DEMO_ENABLED`) çizilir; değişken yoksa hiçbiri görünmez. Pilot Supabase projesine hiçbir demo ayarı girmez.

### Kurulum: `provision-demo` iş akışı

Demo projesi elle değil, `.github/workflows/provision-demo.yml` ile kurulur (mantık `scripts/provision-demo.sh`'te). Elle başlatılır, yalnızca `main`'den ve `demo` ortamında koşar:

```bash
gh workflow run provision-demo --ref main -f dry_run=true   # önce yalnızca okur, ne değişeceğini yazar
gh workflow run provision-demo --ref main
```

| Girdi | Varsayılan | Not |
| --- | --- | --- |
| `host` | `test` | `test`: demo test projesinde (aşağıda, Ortak barındırma); `separate`: ayrı `orchados-demo` projesi (aşağıdaki 1–5. adımlar). Organizasyon Pro'ya geçince `separate` |
| `region` | `eu-central-1` | Yalnızca `host=separate`'te yeni projede; var olan proje başka bölgedeyse uyarı verilir, olduğu gibi kullanılır |
| `dry_run` | `false` | `true`: yalnızca okur (Management API'de tek salt okunur Vault sorgusu dahil), hiçbir şey yazmaz |
| `demo_url` | `https://orchados-demo.vercel.app` | Auth Site URL, yönlendirme kalıbı, `ORCHADOS_SITE_URL`, `PORTAL_BASE_URL`. Alan adı gelince `https://demo.<alan adı>` ile yeniden çalıştırılır |
| `main_site_url` | `https://orchados-pilot-orchad-os.vercel.app` | `ORCHADOS_MAIN_SITE_URL` |
| `redeploy` | `false` | `true`: hiçbir şey değişmese de Vercel'de `main` dağıtılır |
| `init_cron_secret` | `false` | Yalnızca `host=test`: Edge `ORCHADOS_CRON_SECRET` ve Vault `orchados_cron_secret` **ikisi de yoksa** tek bir rastgele değer (`openssl rand -hex 32`) üretip ikisine yazar. Yalnızca biri varsa iş hiçbir şey yazmadan başarısız olur; ikisi de varsa dokunmaz. `host=separate`'te yok sayılır |

Ne yapar (`host=separate`; `host=test` farkları aşağıda, Ortak barındırma):
1. **Supabase projesi:** `SUPABASE_PROJECT_REF`'in (test projesi) organizasyonunda `orchados-demo` adlı proje varsa onu kullanır, yoksa `DEMO_SUPABASE_DB_PASSWORD` parolasıyla açar ve `ACTIVE_HEALTHY` olana kadar bekler (en çok 15 dakika). Duraklatılmış (`INACTIVE`) projede durur.
2. **Anahtar:** anon (yoksa publishable) anahtarı okunur; herkese açıktır. service_role anahtarı hiç okunmaz.
3. **Auth** (`PATCH /config/auth`): Site URL ve `<demo_url>/**` yönlendirmesi; dışarıdan kayıt, anonim giriş ve elle hesap bağlama kapalı; "Confirm email", "Confirm phone", "Secure email change" açık; JWT süresi ve yenileme ayarları `supabase/config.toml` ile aynı. Yalnızca farklı alanlar varsa yazılır.
4. **Edge secret'ları** (Management API): her çalıştırmada `MESSAGE_PROVIDER=record` ve `PORTAL_BASE_URL`. `SIGNUP_HASH_SECRET`, `ORCHADOS_CRON_SECRET` (+ Vault) ve `SIGNUP_PROXY_SECRET` (+ Vercel) iş içinde rastgele üretilir; yalnızca tutan taraflardan biri eksikse yeniden üretilir ve hepsine aynı çalıştırmada yazılır, yoksa dokunulmaz (değerler hiç okunmaz ve karşılaştırılmaz). `TURNSTILE_SECRET_KEY` ve `ORCHADOS_DEMO_MODE=public` **yalnızca iki Turnstile secret'ı da varsa** yazılır; Cloudflare'in test anahtarı reddedilir. Biri varsa öteki yoksa iş başarısız olur.
5. **Vault:** `demo_cleanup_url` (`https://<ref>.supabase.co/functions/v1/demo-start`) ve gerektiğinde `orchados_cron_secret`, SQL uç noktasıyla eklenir ya da güncellenir.
6. **Vercel projesi** (`orchad-os` ekibi): `orchados-demo` varsa kullanılır, yoksa açılır (framework `nextjs`, kök `apps/web`, repo `yusuftiryaki/orchadOS`, üretim dalı `main`). Ignored Build Step `[ "$VERCEL_ENV" != production ]`, Vercel koruması yalnızca önizlemelerde (üretim demosu herkese açık), sunucu bölgesi Supabase bölgesine yakın (`eu-central-1` → `fra1`).
7. **Vercel değişkenleri** (yalnızca Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ORCHADOS_DEMO_ENABLED=1`, `ORCHADOS_MAIN_SITE_URL`, `ORCHADOS_SITE_URL`, `SIGNUP_PROXY_SECRET` (sensitive) ve Turnstile varsa `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Değeri aynı olan değişken yeniden yazılmaz. Demo dağıtımında olmaması gereken bir değişken (`ORCHADOS_SITE_INDEXABLE`, `ORCHADOS_SIGNUP_ENABLED`, `ORCHADOS_PAYMENTS_ENABLED`, `PAYMENT_FAKE_CHECKOUT`, `ORCHADOS_DEMO_URL`, `SUPABASE_SERVICE_ROLE_KEY`) varsa iş, özeti yazdıktan sonra başarısız olur.
8. **Dağıtım:** Hobby planı günde 100 dağıtıma izin verir; `main` yalnızca proje yeni açıldıysa, bir değişken ya da derleme ayarı değiştiyse, hazır üretim dağıtımı yoksa ya da `redeploy` istenirse dağıtılır.
9. **Özet** (`$GITHUB_STEP_SUMMARY`): proje ref'i, Supabase adresi, anon anahtarı, Vercel proje kimliği, demo adresi, bu çalıştırmada değişenler ve kalan adımlar (Turnstile, GitHub secret'ları, harcama tavanı). Hiçbir secret değeri loga ya da özete yazılmaz; üretilen değerler maskelenir, istek gövdeleri ve yetki başlıkları komut satırına değil geçici dosyalara gider.

Migration (`db push`) ve demo verisi bu iş akışında **yoktur**. Özetteki değerlerle `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_URL` ve `DEMO_SUPABASE_ANON_KEY` girildikten sonra `deploy-db-demo` ve `demo-data` (`project=demo`) çalıştırılır (aşağıda, Yayına alma sırası). Turnstile anahtarları yokken demo kapalıdır (`ORCHADOS_DEMO_MODE` tanımsız, `demo-start` 503 `demo_closed`); bu durumda `demo-data action=enable` çalıştırılmaz, çünkü `deploy-db-demo` açık ama secret'ları eksik demoda başarısız olur. Anahtarlar `demo` ortamına girilince iş akışı yeniden çalıştırılır.

Test: `scripts/test-provision-demo.sh` (sahte Supabase ve Vercel API'si, `scripts/tests/provision_demo_mock.py`; ağ ve secret gerekmez; `ci-scripts`). İki kip de denenir. `separate`: ilk kurulum, ikinci çalıştırmanın hiçbir şeyi değiştirmemesi, Turnstile'ın sonradan gelmesi, kaybolan ortak secret, kuru çalıştırma ve reddedilen girdiler. `test`: test sitesinin ayarlarının (Auth, Edge secret'ları, Vault) korunması, yalnızca `DEMO_*` secret'larının ve demo adresinin eklenmesi, pilotun, yabancı bir anon anahtarın ve test anahtarının reddi, ayrı projeye geçişte kalan `DEMO_SIGNUP_PROXY_SECRET`'ın yakalanması. Test projesinde eski duman testinden kalan `ORCHADOS_DEMO_MODE=dev` ve var olan `demo_cleanup_url` (Vault güncelleme dalı) da denenir. Ardından `scripts/demo-lock-check.sh` iki kipte (test sitesinin öneksiz secret'ları hep yerindeyken `DEMO_*` eksikliği, `dev` kipi, sahte Turnstile anahtarı). Her çalıştırmanın çıktısı ve özeti secret değerleri için taranır. Kilit sorgusunun kendisi `scripts/test-demo-lock-sql.sh` ile yerel veritabanında, hazırlanmış satırlar üzerinde çalıştırılır (`ci-db-web`). Sahte API her SQL'e hazır cevap döndüğü için betiklerin `/database/query`'ye gönderdiği her metin (Vault ad sorgusu, Vault upsert'leri, kilit sorgusu) sonda `DB_URL` verilmişse gerçek bir Postgres'te de çalıştırılır (`scripts/test-script-sql.sh`; `vault.secrets` yoksa Supabase Vault imzalarıyla bir yedek kurar, her sorgu geri alınan bir işlemde). Tırnak ve sözdizimi hataları böylece `ci-scripts`'te yakalanır; yerelde `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/test-provision-demo.sh`.

### Ortak barındırma (test projesi)

Gerekçe, paylaşılanlar, kabul edilen riskler ve ayrı projeye geçiş: [demo-turu.md](demo-turu.md) §15.1. Pilot hiçbir zaman demoyu barındırmaz; `deploy-db-pilot` kilitleri değişmez.

```bash
gh workflow run provision-demo --ref main -f host=test -f dry_run=true
gh workflow run provision-demo --ref main -f host=test
gh variable set DEMO_HOST --body test   # repo değişkeni (ortam değişkeni değil)
```

`host=test` ile `provision-demo`:
- Proje açmaz, veritabanı parolası istemez. `SUPABASE_PROJECT_REF` ve `SUPABASE_URL` (`https://<ref>.supabase.co`) zorunludur ve aynı projeyi göstermelidir. `PILOT_SUPABASE_URL` de zorunludur ve `https://<ref>.supabase.co` biçiminde olmalıdır: erişim token'ı organizasyonun bütün projelerine, pilota da yazabildiği için pilotun ref'i bilinmeden iş başlamaz. Ref'lerden biri pilotunkiyse ya da proje adı `pilot` içeriyorsa iş başarısız olur. `SUPABASE_ANON_KEY` projenin anon ya da publishable anahtarı değilse de başarısız olur.
- Auth'ta yalnızca `<demo_url>/**`'ı ek yönlendirme adreslerine ekler (zaten varsa yazmaz). Site URL ve öteki ayarlar test sitesinindir.
- Edge'e yalnızca demoya özgü secret'ları yazar: `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET` (biri eksikse üretilir), Turnstile varsa `DEMO_TURNSTILE_SECRET_KEY` ve `ORCHADOS_DEMO_MODE=public`. Turnstile anahtarları yokken `ORCHADOS_DEMO_MODE` `public` dışında bir değer taşıyorsa (eski duman testinden kalan `dev`) siler: `dev` canlı anahtar kuralını atladığı için demoyu açık bırakırdı; silmek demoyu kapatmanın yoludur (`demo_closed`). Önceki bir çalıştırmadan kalan `public` korunur, özet bunu söyler. Değer, secrets API'nin döndürdüğü sha256 özetiyle karşılaştırılır, açık okunmaz. `MESSAGE_PROVIDER`, `PORTAL_BASE_URL`, `SIGNUP_*`, `TURNSTILE_SECRET_KEY`, `ORCHADOS_CRON_SECRET` ve ödeme secret'larına dokunmaz.
- Vault'a yalnızca `demo_cleanup_url` yazar; `orchados_cron_secret` ya da Edge `ORCHADOS_CRON_SECRET` eksikse uyarır, üretmez. Bu değer test projesinin öteki cron'larınındır (ödeme mutabakatı, kayıt temizliği), bu yüzden yalnızca `init_cron_secret=true` ile ve **iki taraf da yoksa** üretilir: tek bir rastgele değer Edge'e Management API ile, Vault'a güvenli SQL yardımcısıyla (`vault_upsert`) aynı çalıştırmada yazılır; değer loga ve özete düşmez. Yalnızca bir taraf varsa iş, hiçbir şey yazmadan başarısız olur: var olan değer okunamadığı için eşlenemez; Edge'deki değeri Vault'a (ya da Vault'takini Edge'e) elle kopyalayın (aşağıda, Edge secret'ları ve Vault). Önce `dry_run=true` ile ne yapılacağı görülebilir:

  ```bash
  gh workflow run provision-demo --ref main -f host=test -f init_cron_secret=true -f dry_run=true
  gh workflow run provision-demo --ref main -f host=test -f init_cron_secret=true
  ```
- Vercel `orchados-demo`'ya test projesinin adresini ve anon anahtarını, `DEMO_SIGNUP_PROXY_SECRET`'ı (sensitive, Edge'dekiyle aynı) yazar; öteki değişkenler ve dağıtım `host=separate`'teki gibidir.

| Değişken | Yer | Not |
| --- | --- | --- |
| `DEMO_TURNSTILE_SECRET_KEY` | Edge (test projesi) | Demo alan adına bağlı canlı anahtar; `demo-start` bunu `TURNSTILE_SECRET_KEY`'den önce okur. Test sitesinin `TURNSTILE_SECRET_KEY`'i değişmez |
| `DEMO_SIGNUP_HASH_SECRET` | Edge (test projesi) | Demo IP özetinin anahtarı; yoksa `SIGNUP_HASH_SECRET` |
| `DEMO_SIGNUP_PROXY_SECRET` | Edge (test projesi) + Vercel `orchados-demo` | Demo dağıtımının proxy secret'ı; iki tarafta da öneksiz addan önce okunur. Test sitesinin `SIGNUP_PROXY_SECRET`'ı değişmez. Ayrı projede tanımlanmaz (`host=separate` görürse başarısız olur) |
| `ORCHADOS_DEMO_MODE` | Edge (test projesi) | `public`; test projesindeki eski kısa duman testinin `dev` değerinin yerini alır (Turnstile yokken `dev` silinir) |

`DEMO_HOST=test` iken iş akışları:
- **`deploy-db`** migration ve fonksiyonlardan sonra `scripts/demo-lock-check.sh shared` çalıştırır. Açık bir demo org'u kabul edilir. Açık demo için `ORCHADOS_DEMO_MODE`, `DEMO_TURNSTILE_SECRET_KEY`, `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET` ya da Vault `demo_cleanup_url`/`orchados_cron_secret` eksikse (test sitesinin öneksiz `TURNSTILE_SECRET_KEY`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`'ı demonun yerine sayılmaz: test projesinde hep vardır ve `demo-start` onlara düşerse demo, test sitesinin Turnstile anahtarı ve proxy secret'ıyla denetlenir); `ORCHADOS_DEMO_MODE` tam olarak `public` değilse ya da Turnstile secret'ı Cloudflare'in sahte anahtarlarından biriyse (secrets API'nin sha256 özetiyle; değerler açık okunmaz); bir demo org'u kayıt ya da sahte ödeme kabul ediyorsa; bir demo hesabının üyeliği ya da demo dışı bir org'da erişimi varsa iş başarısız olur (migration'lar yine de uygulanmış olur). Test sitesinin org'ları, kaydı ve sahte ödemesi kilit değildir.
- **`deploy-db-demo`** `test` ortamında koşar ve yalnızca aynı ortak kilitleri denetler; migration ve fonksiyonları ikinci kez uygulamaz. `SUPABASE_ACCESS_TOKEN` ve `SUPABASE_PROJECT_REF` yeter.
- **`demo-data`** `project=demo`'yu test projesine çözer (`test` ortamı ve secret'ları, `--demo-only` olmadan). `DEMO_SUPABASE_*` secret'ları gerekmez. Eşzamanlılık grubu yazılan veritabanına göredir, `project=test` ile aynı gruptadır.

Yayına alma: önce `provision-demo` `host=test`, sonra `DEMO_HOST=test`, `demo-data project=demo action=load`; canlı Turnstile anahtarları `demo` ortamına girilince `provision-demo` yeniden; `demo-data action=enable`; `deploy-db-demo` (ya da `deploy-db`) bir kez elle; harcama tavanı ve %80 uyarısı test projesinde; duman listesi demo adresinde.

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
2. **Demo kilitleri** (Management API; secret listesi adları ve değerlerin sha256 özetini verir, değerler açık okunmaz; sorgu salt okunur). Şu durumlarda başarısız olur:
    - `private.demo_org`'a kayıtlı olmayan bir org var (demo projesinde gerçek veri olmaz);
    - açık (`enabled`) bir demo org'u var ama `TURNSTILE_SECRET_KEY`, `ORCHADOS_DEMO_MODE`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET` secret'larından biri ya da Vault `demo_cleanup_url` veya `orchados_cron_secret` eksik (ikisi olmadan `demo-cleanup` süresi dolan ziyaretçi hesaplarını sessizce hiç silmez); ya da `ORCHADOS_DEMO_MODE` tam olarak `public` değil veya `TURNSTILE_SECRET_KEY` Cloudflare'in sahte anahtarı;
    - bir org'da `accepts_signups` ya da `allow_fake_payments` açık;
    - `PAYMENT_FAKE_ALLOWED` secret'ı tanımlı;
    - bir demo hesabının üyeliği ya da demo dışı bir org'da parsel erişimi var.

    Denetim `scripts/demo-lock-check.sh separate`'tedir (ortak barındırmada `shared`, yukarıda).
3. `supabase db push --include-all`.
4. **Demo koruması denetimi** (`scripts/demo-guard-check.sh`): `private.attach_demo_guards()` eksik kalmış `zz_demo_read_only` tetikleyicilerini yeniden takar (uyarı yazar), `private.demo_guard_drift()` bir sapma bulursa iş başarısız olur. Sebep: `--include-all` geç birleşen, eski zaman damgalı bir migration'ı İP13-A migration'larından sonra uygular. `db push` yarıda başarısız olsa da çalışır (her migration dosyası ayrı işlemde uygulanır; başarısızlıktan önce uygulananların tabloları da korumayı almalı). Düzeltme yeni bir migration'la yapılır; zaman damgası mevcut en yeni migration'dan sonra gelir (CLAUDE.md; CI `scripts/check-migration-order.sh` ile denetler). Aynı denetim `deploy-db` ve `deploy-db-pilot`'ta da `db push`'tan sonra çalışır.
5. Bütün Edge Function'ların dağıtımı (`demo-start` dahil).
6. **GoTrue denetim kaydı temizliği** (`scripts/retention-check.sh audit`; aşağıda, Kısa saklama denetimleri). Ortak barındırmada (`DEMO_HOST=test`) yalnızca demo kilitleri ve bu adım çalışır.

Kendi robot doğrulamamız seçiliyse (`CAPTCHA_PROVIDER`/`DEMO_CAPTCHA_PROVIDER` `altcha`), demo kilitleri Turnstile secret'ı yerine `ALTCHA_HMAC_KEY`'i (ortak barındırmada `DEMO_ALTCHA_HMAC_KEY`) ister ve sahte Turnstile anahtarı kuralı uygulanmaz; bilinmeyen bir sağlayıcıda açık demo başarısız olur.

**`demo-data`:** Yalnızca elle (`workflow_dispatch`); eşzamanlılık grubu `demo-data-<project>`. Girdiler:

| Girdi | Değerler | Not |
| --- | --- | --- |
| `project` | `test` \| `demo` | Pilot seçeneği yoktur. Her proje yalnızca kendi ortamının secret'larını kullanır; eksik bir `DEMO_` secret'ı test projesine düşmez, iş başarısız olur. Tek istisna repo değişkeni `DEMO_HOST=test`tir: o zaman `project=demo` test projesidir (yukarıda, Ortak barındırma) |
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

### Kısa saklama denetimleri (T09)

[hukuk/kararlar.md](hukuk/kararlar.md) H25, H27, T09. `scripts/retention-check.sh`, Management API'yle (secret adları ve değerlerin sha256 özeti, bir salt okunur sorgu) iki denetim yapar; ikisi de dağıtımdan sonra çalışır ve başarısızlık işi kırmızı bitirir (migration'lar ve fonksiyonlar yine de uygulanmış olur):

- **`signup`** (`deploy-db` test projesinde, `deploy-db-pilot` pilotta, `provision-pilot-signup` sonunda): bir org'da `accepts_signups` açıkken şu durumlarda başarısız olur: `pg_cron` işi `signup-cleanup` yok ya da pasif; Vault'ta bir `customer-signup` adresine giden `signup_cleanup_url` yok; Vault `orchados_cron_secret` yok; Edge `ORCHADOS_CRON_SECRET` yok ya da Vault'takiyle aynı değil (özetle karşılaştırılır). Bunlardan biri eksikse `private.dispatch_signup_cleanup()` sessizce hiçbir şey yapmaz ya da fonksiyon 401 döner ve doğrulanmamış hesaplar `auth.users`'ta kalır. Adres gizli değildir ve proje ref'inden çıkar: `deploy-db` ve `deploy-db-pilot` denetimden hemen önce `scripts/vault-signup-cleanup.sh` ile `signup_cleanup_url`'i (`https://<ref>.supabase.co/functions/v1/customer-signup`) yoksa ekler, başka bir yeri gösteriyorsa düzeltir. Cron secret'ına dokunmaz: Edge `ORCHADOS_CRON_SECRET` ya da Vault `orchados_cron_secret` eksikse denetim yine başarısız olur; test projesinde ikisi de yoksa `provision-demo` `host=test init_cron_secret=true` ile, pilotta `provision-pilot-signup` ile kurulur.
- **`audit`** (`deploy-db-demo`; demoyu barındıran proje: `DEMO_HOST=test` iken test projesi, yoksa demo projesi): `pg_cron` işi `auth-audit-log-purge` yok ya da pasifse ya da `auth.audit_log_entries`'te 31 günden eski satır varsa başarısız olur. Gizlilik metni denetim kayıtlarındaki IP için en fazla 30 gün der; bir gün günlük işin payıdır. İş ve ilk temizlik veritabanı akışının migration'ıyla gelir (T09; `notification-purge`, `auth-session-purge` ile birlikte).

Eksik secret işi başarısız kılar (yukarıda); tek istisna `SUPABASE_TEST_PENDING=1` ile atlanan kurulmamış test projesidir. Sorgular `scripts/test-demo-lock-sql.sh` ile yerel Supabase'te hazırlanmış satırlarla, betik `scripts/test-provision-demo.sh` ile sahte API'ye karşı denenir (`ci-scripts`, `ci-db-web`).

Elle kontrol (SQL düzenleyici):
```sql
select jobname, schedule, active from cron.job
 where jobname in ('signup-cleanup', 'auth-audit-log-purge', 'notification-purge', 'auth-session-purge');
select count(*) from auth.audit_log_entries where created_at < now() - interval '31 days';
```

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

**Seçilen planlar** (H03, H25; plan değişikliği bu tabloyu günceller):

| Proje | Supabase | Vercel | En uzun log saklama |
| --- | --- | --- | --- |
| Test (demo ortak barındırmada dahil) | Free | Hobby | 1 gün |
| Pilot | Free; pilot verisi gelmeden Pro (aşağıda, Pilot için geçiş) | Hobby; ücretli müşteriden önce Pro | Pro'da 7 gün |
| Demo projesi (açılırsa) | Free, Pro'ya geçerse 7 gün | Hobby | 1 gün (Pro'da 7) |

Gizlilik metni (`gizlilik-v2-taslak` §2 ve §5) sunucu ve altyapı kayıtlarında IP'nin **en fazla 30 gün** tutulduğunu söyler. Bu süre Free, Pro, Team (28 gün) ve Vercel planlarını kapsar. Enterprise (90 güne kadar), Vercel Observability Plus ya da bir log aktarımı (log drain) 30 günü aşabilir: **bunlardan biri seçilmeden ya da kurulmadan önce gizlilik metni değişir** (sürüm artar, kayıt migration'ı gelir), sonra plan ya da aktarım açılır. Log drain kurulursa ham IP o hedefte de saklanır; hedefin saklama süresi 30 günü aşmamalıdır.

### Yayına almadan önce: hukuki ayarlar

- **Telefonu doğrulanmamış hesap temizliği** her barındırılan projede zorunludur (yukarıda, Kayıt kapısı ve Kısa saklama denetimleri).
- **Harita:** Üretimde `NEXT_PUBLIC_MAP_STYLE_URL` boştur (kendi karo vekilimiz) ya da kendi altyapımızdaki veya vekil sunucumuzdaki bir stili gösterir (yukarıda, Harita altlığı).
- **Yapay zekâ aktarım kapısı:** İşleme istasyonunda `ORCHADOS_AI_TRANSFER_SAFEGUARD` yalnızca [yurt-disi-aktarim-kaydi.md](hukuk/yurt-disi-aktarim-kaydi.md)'deki ilgili satır tamamlandığında (standart sözleşme imzalı, Kurum'a bildirilmiş) ve o kaydın referansıyla tanımlanır. Tanımlı değilken ai-worker gerçek veriyle yurt dışındaki sağlayıcıyı çağırmaz ([services/ai-worker/README.md](../services/ai-worker/README.md#yurt-dışı-aktarım-kapısı), H02).
- **Bahçe ekleme ve çıkarma:** `garden_changes_enabled` barındırılan projelerde ancak [yayın şartları](hukuk/kararlar.md#yayin) ile T05 ve T18 üretime girdikten sonra açılır (aşağıda, Bahçe ekleme ve çıkarma).
- **Ziyaret tarihi SMS'i (T07):** `org_billing_setting.visit_notice_sms_enabled` (yalnızca SQL, varsayılan `false`). Açılınca envanter ya da periyodik ziyaret en az 3 gün sonrasına planlanınca sahibe `visit_scheduled` gider; kapalıyken tarih telefonla bildirilir ve ziyaret sayfasına kaydedilir. Pilot sırasında, Netgsm şablonu onaylanınca açılır: `update public.org_billing_setting set visit_notice_sms_enabled = true where org_id = '<org>';`
- **Hizmet sonunda erişim (T08, H23):** `org_billing_setting.service_end_access_flow_enabled` (yalnızca SQL, varsayılan `false`). **İlk `service_end`'den en az 30 gün önce** açılır: `update public.org_billing_setting set service_end_access_flow_enabled = true where org_id = '<org>';`. Açılınca dönemi biten ve yenilenmeyen, idari olarak feshedilen siparişlerin ve pasife alınan pilot parsellerinin bahçelerinde 90 gün salt okunur erişim ve erişimin kaldırılması uygulanır. Açılmadan önce `ops_terminate_order` gerçek müşteride kullanılmaz. En erken bitişi bulmak için: `select min(service_end) from public.service_order where status = 'active';`
- **Sözleşme belgesi taraması (T04):** Vault `contract_documents_sweep_url` ve Vercel `ORCHADOS_CRON_SECRET` (yukarıda, Vault). Yayın şartı 3 (T04 üretimde) bu kurulumla tamamlanır.
- **Hukuki metin sürümleri:** Bir hukuki metnin sürümü her değiştiğinde (sitedeki kopya `apps/web/src/lib/i18n/messages/legal.ts` ve `LEGAL_TEXT_VERSIONS`) sürüm kaydını (`private.legal_text_version`) güncelleyen bir migration aynı değişiklikle gelir; kayıt fonksiyonları kayıtlı sürümden başkasını kabul etmez (T21).
- **Robot doğrulaması:** Sağlayıcı değişikliği önce gizlilik metnini değiştirir (yukarıda, Robot doğrulaması).

### Yayına alma sırası

1. **Birleştirme:** Bütün anahtarlar kapalı. Migration'lar ve fonksiyonlar test (`deploy-db`), pilot (`deploy-db-pilot`, `release` ile) ve demo (`deploy-db-demo`; demo projesi açılana kadar iş akışı devre dışı) projelerine gider. Önce GitHub ortamları ve secret geçişi (yukarıda, GitHub secret'ları ve ortamları). Hiçbir projede `ORCHADOS_DEMO_MODE` yoktur, başlatma `demo_closed` döner.
2. **Test projesi (kısa, ekip içi duman testi):** *`DEMO_HOST=test` iken (ortak barındırma, yukarıda) bu adım geçersizdir ve izlenmez.* Duman testi demo adresinde (https://orchados-demo.vercel.app) yapılır; test sitesinin (`orchados`) `/demo`'su kullanılmaz: `demo-start` `DEMO_SIGNUP_PROXY_SECRET`'ı ve demo alan adına bağlı `DEMO_TURNSTILE_SECRET_KEY`'i tercih ettiği için oradan başlatma `captcha_failed` döner ya da bütün ziyaretçileri tek IP kovasına düşürür. `ORCHADOS_DEMO_MODE=dev` yazılmaz; `action=disable` ve `ORCHADOS_DEMO_MODE`'un silinmesi herkese açık demoyu kapatır, yalnızca demoyu kapatmak ya da ayrı projeye taşımak için yapılır ([demo-turu.md](demo-turu.md) §15.1, Ayrı projeye geçiş). Aşağıdaki alt adımlar yalnızca demo test projesinde barındırılmıyorken geçerlidir:
    1. Auth onayları açılır (yukarıda).
    2. Edge `ORCHADOS_DEMO_MODE=dev`; Vault `demo_cleanup_url` ve `orchados_cron_secret` (ikisi de gerekli; biri yoksa süresi dolan hesaplar silinmez).
    3. `demo-data`: `project=test action=load`, sonra `action=enable`.
    4. Vercel `orchados` projesinde yalnızca duman süresince `ORCHADOS_DEMO_ENABLED=1`.
    5. Duman listesi (aşağıda).
    6. Bitince `action=disable`, bayrak kaldırılır, `ORCHADOS_DEMO_MODE` silinir.
3. **Demo projesi** (şimdilik bunun yerine test projesinde ortak barındırma, yukarıda; aşağıdaki adımlar Pro'dan sonra `host=separate` ile izlenir):
    1. `provision-demo` çalıştırılır (yukarıda, Kurulum): Supabase ve Vercel `orchados-demo` projeleri, Auth, Edge secret'ları, Vault, Vercel değişkenleri ve ilk dağıtım.
    2. Özetteki değerler `demo` ortamına girilir: `gh secret set DEMO_SUPABASE_PROJECT_REF --env demo`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`. Ardından `gh workflow enable deploy-db-demo` ve `deploy-db-demo` elle çalıştırılır.
    3. Harcama tavanı ve %80 uyarısı (yalnızca panelden).
    4. `demo-data`: `project=demo action=load`.
    5. Canlı Turnstile anahtarları `demo` ortamına girilir (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) ve `provision-demo` yeniden çalıştırılır: `ORCHADOS_DEMO_MODE=public` ve site anahtarı yazılır, Vercel bir kez yeniden dağıtır.
    6. `demo-data` `action=enable`; ardından `deploy-db-demo` bir kez daha elle çalıştırılır (açık demo için kilitler).
    7. Alan adı gelince DNS (`demo.<alan adı>`, Vercel → Domains) ve `provision-demo` `demo_url=https://demo.<alan adı>` ile yeniden çalıştırılır. Duman listesi demo adresinde tekrarlanır.
4. **Pilot sitesi:** `orchados-pilot`'a `ORCHADOS_DEMO_URL` ve kayıt (aşağıda, Pilot kaydı açma / kapama).

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

## Bahçe ekleme ve çıkarma (İP14)

Tasarım: [bahce-yonetimi.md](bahce-yonetimi.md) §2, §9.8, §15. Müşteri üyeliği sürerken bahçe ekler (ek sipariş, `pricing-v2`) ve çıkarır (`garden_removal`, `removal-v1` iadesi). Yeni ortam değişkeni, Edge secret'ı ya da Vault girdisi yoktur.

**Anahtar:** `org_billing_setting.garden_changes_enabled`, `/operasyon/ayarlar` sayfasından açılır ve kapanır. Varsayılan kapalıdır; yerel seed'de açıktır. Ayrı bir web bayrağı yoktur.
- Kapalıyken `customer_request_garden_removal`, `ops_request_garden_removal` ve `ops_issue_addon_quote` `garden_changes_closed` döner, portal girişleri ("Bahçe ekle", "Bahçeyi hizmetten çıkar") gizlenir.
- Açılmış kayıtlar anahtar kapalıyken de işler.
- **Barındırılan projelerde (test, pilot) [yayın şartları](hukuk/kararlar.md#yayin) ile T05 (çıkarma akışı) ve T18 (ek teklif dökümü) üretime girene kadar kapalı kalır:** sözleşme `mesafeli-v4-taslak`, iade politikası `iade-v4-taslak`, ön bilgilendirme `onbilgi-v4-taslak`. Avukat soruları (hukuk/README.md 15–22) [hukuk/kararlar.md](hukuk/kararlar.md)'de karara bağlandı; kararlar metinlere girdi ama yayın şartları bitmeden metinler taslaktır. Fiyat kararları da beklenir (en az ücretin orantılanması, `addon_min_days`, bildirim ve erişim süreleri, iade modu; [bahce-yonetimi.md](bahce-yonetimi.md) §16, §19). Test projesinde yalnızca duman testi süresince açılır.

Aynı sayfadaki diğer ayarlar: `addon_min_days` (30; son ek günü), `removal_notice_days` (30), `removal_access_days` (90), `removal_refund_mode` (`unused_visits` ya da `manual`).

**Cron:** `garden-removal-housekeeping` (`30 0 * * *`, `billing-housekeeping`'den sonra) `select private.garden_removal_housekeeping()` çalıştırır: çıkış günü gelen kayıtları tamamlar, erişim bitmeden 7 gün önce bildirim kuyruğa yazar ve süresi dolan erişimleri kaldırır. İşi migration kurar; Vault ya da secret gerekmez, veritabanının içinde çalışır. Kontrol:

```sql
select jobname, schedule from cron.job where jobname = 'garden-removal-housekeeping';
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'garden-removal-housekeeping')
 order by start_time desc limit 5;
```

Bildirimler (`garden_removal_scheduled`, `_rescheduled`, `_cancelled`, `_completed`, `garden_access_ending`) mevcut kuyruktan gider; test ve pilot projesinde `MESSAGE_PROVIDER=record` iken `private.message_outbox`'ta okunur. Demo drift denetimi (`deploy-db*` sonrasında) yeni tabloyu ve `private.enqueue_garden_notification`'ı da kapsar.

**Duman listesi** (test projesinde, anahtar açıkken, sahte ödemeyle):
- [ ] Üye bir müşteri ek bahçe başvurur; ops ek teklif verir (geçerlilik son ek gününü geçmez); müşteri sahte kartla öder; ek siparişin bitişi temel siparişle aynı.
- [ ] Çıkarma talebi; ops bugünü teyit eder ve "hemen tamamla"; parsel pasif, planlı ziyaretler iptal, iade satırı açılır; havaleyle ödenmiş bir siparişte havale iadesi işlenir.
- [ ] Planlanmış bir çıkarmada tarih değişikliği: `private.message_outbox`'ta `garden_removal_rescheduled` satırı.
- [ ] Erişim günü 0 ile çıkarma (devir): ertesi gece housekeeping'den sonra müşterinin ve davet ettiği hissedarın erişimi kalkmış.
- [ ] Yenileme ekranında ek bahçe işaretli, çıkmakta olan bahçe işaretsiz gelir.

**Geri alma:**
- Anahtar kapatılır (`/operasyon/ayarlar` ya da SQL). Yeni talepler ve ek teklifler durur, portal girişleri gizlenir:
  ```sql
  update public.org_billing_setting set garden_changes_enabled = false where org_id = '<org>';
  ```
- Planlanmış çıkarmalar işlemeye devam eder; bir kaydı durdurmak için ops kaydı iptal eder (`/operasyon/cikarma/[id]`, müşteriye SMS gider).
- Verilmiş ek teklifler ve ödenmiş ek siparişler geçerli kalır; ödenmiş bir ek sipariş için gerekirse bugünkü fesih ve iade yolları kullanılır.

## Pilot ortamı

- **Supabase:** `orchados-pilot`, Frankfurt (`eu-central-1`), Free plan. Medya için 1 GB sınırı var; pilot verisi gelmeden Pro'ya geçilmeli.
- **Vercel:** `orchados-pilot` projesi, üretim dalı `release`, bölge `fra1`. Başka dallar için derleme yapmaz (Ignored Build Step). Ortam değişkenleri sadece Production'da, pilot projesini gösteriyor. Site herkese açık olduğu için Vercel girişi koruması yalnızca önizlemeleri kapsar (`provision-pilot-signup` üretimi kapsayan korumada uyarır). Hobby plan ticari kullanıma izin vermiyor, önce Pro'ya geçilmeli.
- **Auth:** Dışarıdan üye olma kapalı (self-servis hesapları `customer-signup` Admin API ile açar). Site URL pilot adresi. Telefonla giriş açık, SMS kancası `send-sms`'te.
- **Mesajlar:** Netgsm gelene kadar gerçek SMS gitmez (`MESSAGE_PROVIDER=record`). Netgsm secret'ları GitHub'a girilince `provision-pilot-signup` onları Edge'e yazar ve bu değişkeni kaldırır (aşağıda).
- **Self-servis kayıt:** 29 Ekim 2026 sahip kararıyla [yayın şartları](hukuk/kararlar.md#yayin) tamamlanmadan açılıyor; hukuki metinler değişmez, teknik kapılar (Turnstile, kayıt secret'ları, doğrulanmamış hesap temizliği, sahte ödeme kilitleri) atlanmaz. `legal_gate_enforced`, `ORCHADOS_PAYMENTS_ENABLED` ve `garden_changes_enabled` kapalı kalır.

### Pilot kaydı açma / kapama

Ziyaretçi yolculuğu: pilot ana sayfası ("Demoyu dene") → demo (https://orchados-demo.vercel.app/demo) → "Gerçek hesap aç" → pilotun `/kayit`'ı. Kayıt kapalıyken `/kayit` "Kayıt yakında" sayfasıdır; iletişim, paketler, demoya dönüş ve giriş bağlantılarını gösterir (`tests/e2e/site-demo-signup.spec.ts`).

Kayıt `.github/workflows/provision-pilot-signup.yml` ile açılır (mantık `scripts/provision-pilot-signup.sh`'te, testi `scripts/test-provision-pilot.sh`). Yalnızca `release`'ten ve `pilot` ortamında koşar; tekrar çalıştırmak güvenlidir.

**Ön koşullar** (iş akışı eksikte hiçbir şey yazmadan başarısız olur):
1. `main` `release`'e birleşmiş, `deploy-db-pilot` yeşil bitmiş olmalı: kayıt migration'ları (`org_billing_setting`, `signup_code_grant`, etkin `signup-cleanup` işi) pilotta.
2. GitHub secret'ları: `SUPABASE_ACCESS_TOKEN`, `PILOT_SUPABASE_PROJECT_REF`, `PILOT_SUPABASE_URL`, `VERCEL_TOKEN`, canlı `TURNSTILE_SITE_KEY` ve `TURNSTILE_SECRET_KEY` (Cloudflare test anahtarları reddedilir).
3. Pilotta kilitler kapalı: Edge'de `PAYMENT_FAKE_ALLOWED`, `SIGNUP_TURNSTILE_DISABLED`, `ORCHADOS_DEMO_MODE` yok; `CAPTCHA_PROVIDER` boş ya da `turnstile`; `allow_fake_payments` açık org yok; Vercel'de `PAYMENT_FAKE_CHECKOUT`, `ORCHADOS_DEMO_ENABLED`, `ORCHADOS_MAIN_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY` yok; Vercel'in `NEXT_PUBLIC_SUPABASE_URL`'i pilot projesi.

| Girdi | Varsayılan | Not |
| --- | --- | --- |
| `signups` | `on` | `on`: kaydı açar; `off`: kapatır (geri alma, aşağıda) |
| `dry_run` | `false` | `true`: yalnızca okur, ne değişeceğini yazar |
| `org_id` | Boş | Kaydı alacak org; boşsa kaydı zaten alan org, o da yoksa pilottaki tek org. Birden çok org varken zorunlu |
| `site_url` | `https://orchados-pilot.vercel.app` | `PORTAL_BASE_URL`, `ORCHADOS_SITE_URL`, sözleşme taraması adresi. Alan adı gelince o |
| `demo_url` | `https://orchados-demo.vercel.app/demo` | `ORCHADOS_DEMO_URL`; boş bırakılırsa Vercel'deki değer korunur |
| `redeploy` | `false` | `true`: değişken değişmese de `release` dağıtılır |
| `init_sms_hook` | `false` | Send SMS hook'u kurulu değilse (kapalı, başka adres ya da Edge secret'ıyla eşleşmeyen sır) `send-sms`'e bağlar ve yeni bir `SEND_SMS_HOOK_SECRET`'ı iki tarafa birden yazar |
| `require_sms` | `false` | `true`: SMS hazır değilse hiçbir şey yazmadan başarısız olur |

**`signups=on` ne yapar:**
1. **Edge secret'ları:** `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET` (+ Vercel) ve `ORCHADOS_CRON_SECRET` (+ Vault + Vercel) iş içinde rastgele üretilir; tutan taraflardan biri eksikse (cron secret'ında Edge ile Vault'un özeti farklıysa da) yeniden üretilip hepsine aynı çalıştırmada yazılır, yoksa dokunulmaz. `TURNSTILE_SECRET_KEY` (GitHub'dan) ve `PORTAL_BASE_URL` değerin özeti farklıysa yazılır. GitHub'da üç `PILOT_NETGSM_*` secret'ı varsa `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER` yazılır ve `MESSAGE_PROVIDER=record` silinir.
2. **Vault:** `signup_cleanup_url`, `contract_documents_sweep_url` (`<site_url>/sistem/sozlesme-tarama`, T04) ve gerektiğinde `orchados_cron_secret`.
3. **Vercel** (`orchados-pilot`, yalnızca Production): `ORCHADOS_SIGNUP_ENABLED=1`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `ORCHADOS_SITE_URL`, `ORCHADOS_DEMO_URL`, `SIGNUP_PROXY_SECRET` ve `ORCHADOS_CRON_SECRET` (sensitive). `PAYMENT_FAKE_CHECKOUT` ve `ORCHADOS_PAYMENTS_ENABLED` hiçbir zaman yazılmaz.
4. **Veritabanı:** en son `accepts_signups` seçilen org'da açılır (satır yoksa eklenir).
5. **Dağıtım:** bir Vercel değişkeni değiştiyse ya da `redeploy=true` ise `release`'in üretim dağıtımı başlatılır (`NEXT_PUBLIC_*` derlemeye gömülür).
6. **Denetim:** `scripts/retention-check.sh signup` (Kısa saklama denetimleri).
7. **Özet:** proje, değişenler, `sms_ready`, Auth'un saatlik SMS sınırı (`rate_limit_sms_sent`, proje geneli) ve sahibin denetimleri. Hiçbir secret değeri loga ya da özete yazılmaz; secrets API yalnızca ad ve sha256 özeti verir, Auth yapılandırmasındaki hook sırrı yalnızca özetiyle karşılaştırılır.

**SMS.** Kayıt kodu telefona yalnızca şu durumda gider (`sms_ready=true`): Auth → Hooks → Send SMS açık ve `https://<ref>.supabase.co/functions/v1/send-sms`'i gösteriyor, sırrı Edge `SEND_SMS_HOOK_SECRET` ile aynı (`v1,whsec_<base64>`), Auth'ta telefon sağlayıcısı açık; Edge'de `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER` üçü de var ve `MESSAGE_PROVIDER` `record` değil (`supabase/functions/_shared/providers.ts`). Değilse kod `private.message_outbox`'a yazılır: kayıt açık görünür ama kimse tamamlayamaz ve doğrulanmamış hesaplar 24 saatte silinir. İş akışı bu durumda `sms_ready=false` çıktısı, özette "SMS is not ready" bölümü ve bir uyarı verir; `require_sms=true` ile başarısız olur. Netgsm sağlayıcısı canlı hesapla henüz denenmedi: ilk gerçek kayıtta Netgsm panelinde gönderim ve `private.message_outbox`'ta satır olmadığı kontrol edilir. `MESSAGE_PROVIDER` silinince bildirimler de (`send-notifications`) gerçek SMS olarak gider.

**Sahibin sağlayacakları:**
- Netgsm: kullanıcı kodu, parola ve onaylı gönderici başlığı → `gh secret set PILOT_NETGSM_USERCODE --env pilot`, `PILOT_NETGSM_PASSWORD`, `PILOT_NETGSM_MSGHEADER`; ardından iş akışı yeniden.
- Cloudflare Turnstile: canlı site anahtarının **Hostnames** listesinde `orchados-pilot.vercel.app` (ve alan adı gelince o) olmalı; iş akışı Cloudflare'i değiştiremez. Yoksa widget hata verir ve `customer-signup` `captcha_failed` döner.
- Şirket bilgileri (T21): `/iletisim` ve "Kayıt yakında" sayfasındaki iletişim bağlantısı şirket bilgileri tamamlanana kadar "yakında" der (`/operasyon/ayarlar`).
- Vercel Authentication üretimi kapsamamalı (Settings → Deployment Protection, yalnızca önizlemeler); iş akışı kapsıyorsa uyarır.

**Adımlar** (orkestratör):
```bash
gh workflow run deploy-db-pilot --ref release                       # main release'e birleştiyse kendiliğinden de koşar
gh workflow run provision-pilot-signup --ref release -f dry_run=true
gh workflow run provision-pilot-signup --ref release                # signups=on
# SMS hook kurulu değilse (özet söyler):
gh workflow run provision-pilot-signup --ref release -f init_sms_hook=true
```
Ardından https://orchados-pilot.vercel.app'te: ana sayfada "Demoyu dene" (demo adresine gider) ve "Kayıt ol"; `/kayit`'ta form ve Turnstile kutusu (tarayıcı konsolunda Turnstile hatası yok); demoda "Gerçek hesap aç" pilotun `/kayit`'ına gider. `sms_ready=true` ise gerçek bir telefonla deneme kaydı: kod gelir, kayıt tamamlanır, `/portal` açılır; sonra deneme hesabı ops tarafından silinir.

**Kapama (geri alma):**
```bash
gh workflow run provision-pilot-signup --ref release -f signups=off
```
`accepts_signups` kapanır (doğrudan `customer-signup` istekleri de 503 `signup_closed`), Vercel'den `ORCHADOS_SIGNUP_ENABLED` silinir ve `release` yeniden dağıtılır; `/kayit` yeniden "Kayıt yakında" olur. Secret'lar ve Vault olduğu gibi kalır. Acil durumda aynı şey `/operasyon/ayarlar` › Dışarıdan kayıt ile ya da SQL ile anında yapılır: `update public.org_billing_setting set accepts_signups = false where accepts_signups;`
- **Seed yok:** İşletme ve ilk operasyon kullanıcısı elle açılır; sonraki kayıtlar `/operasyon` ekranlarından yapılır.

## Test projesindeki kullanıcılar

`supabase/seed.sql` sadece yerel geliştirme içindir ve bilinen parolalar içerir; test projesine uygulanmaz. Test projesindeki kullanıcılar Supabase panelinden oluşturulur ve rolleri (`membership`, `parcel_access`) SQL düzenleyiciyle verilir. Sentetik bir bahçe gerekiyorsa seed'in sadece veri kısmı elle çalıştırılabilir.

## Pilot için geçiş

- **Web:** Vercel Hobby planı ticari olmayan kullanım içindir. Ücretli müşteriyle çalışmaya başlamadan önce Vercel Pro (20 $/ay) ya da Cloudflare Workers ücretli plan (5 $/ay, OpenNext ile; uyumluluğu denenmeli) seçilir.
- **Medya:** Supabase ücretsiz planda 1 GB dosya alanı var; bir ziyaret ~4,4 GB. Pilotta panoramalar için Cloudflare R2 ya da Supabase Pro gerekir. Karar İP4 yükleme işiyle verilecek.
- **Üretim veritabanı:** Pilot verisi test projesinde değil, ayrı bir üretim projesinde tutulmalı.
