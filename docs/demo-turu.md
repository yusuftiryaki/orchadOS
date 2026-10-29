# Demo Turu (İP13): Tasarım

28 Ekim 2026 · Yusuf · Sürüm 2 (inceleme düzeltmeleri)

Bahçe sahibi adayları ürünü hesap açmadan ve ödeme yapmadan, ücretli bir sahibin gördüğü haliyle deneyebilecek:

1. Ziyaretçi sitede ya da giriş sayfasında "Demoyu dene"ye basar. Link, yalnızca demo için kurulmuş ayrı bir dağıtıma (`demo.<alan adı>`) gider. Bu dağıtım ayrı bir Supabase projesine (**demo projesi**) bağlıdır. Orada gerçek müşteri verisi yoktur.
2. Ziyaretçi Turnstile'ı geçer. Sunucu ona birkaç saatlik geçici bir demo hesabı açar. Hesap kişisel veri taşımaz. Ayrı bir demo işletmesinin iki örnek bahçesinde **sahip** (`owner`) rolündedir.
3. Ziyaretçi sahip portalına girer. Orada şunları görür: 360° bahçe gezisi, sağlık haritası, parsel karnesi (yapı, bakım, zararlı ve meyve yükü satırlarıyla), ağaç karnesi, ziyaret ve envanter raporları, iki PDF, bulgular, uzman notları, örnek soru-cevap dizileri. Ekranlar gerçek portalın kendisidir; yalnızca veri sentetiktir.
4. Rehberli tur ekranları adım adım gezdirir. Üstteki bant bunun bir demo olduğunu hatırlatır ve "Gerçek hesap aç" düğmesini taşır. Düğme asıl siteye döner.
5. Demo hesabı hiçbir şey yazamaz. E-postasını, telefonunu ya da parolasını değiştiremez ve gerçek bir org'a bağlanamaz. Bildirim, SMS, AI işi ve müşteri profili oluşmaz. Süre dolunca hesap silinir.

Portal kodu kopyalanmaz: demo, RLS'li gerçek veri yolundan geçer. Korumalar katmanlıdır:
- ayrı proje: gerçek veri hiç yoktur
- veritabanı korumaları: yazma kilidi, hesap kilidi, erişim kapsamı
- servis rolüyle yazan Edge Function'larda açık demo kontrolleri

Arayüz yalnızca gizler ve açıklar. İş iki dalgada üç akışa bölündü (§17). Hepsi bütün anahtarlar kapalıyken birleşir. Pilot projesinde demo hiç açılmaz.

Bağlam:
- [musteri-yonetimi.md](musteri-yonetimi.md): İP12. Site, kayıt, Turnstile, IP sınırı ve cron temizliği kalıpları buradan alınır.
- [veri-modeli.md](veri-modeli.md)
- [arayuzler.md](arayuzler.md): "Medya depolama" ve "Asset `pose` alanı" bölümleri.
- [deployment.md](deployment.md)
- [teknik-mimari.md](teknik-mimari.md): KVKK.

Temel: `main` ≥ `e68bf9c`, yani #58'in birleşmesi. Bu sürüm İP12'nin tamamını (#53, #57, #58) içerir. En yeni migration `20261031200000_ops_customer_lookups.sql`'dir.

## 1. Kapsam

| Alan | İP13'te |
| --- | --- |
| Barındırma | Ayrı demo Supabase projesi ve ayrı Vercel dağıtımı (`demo.<alan adı>`). Pilot (üretim) projesinde demo kapalıdır; site yalnızca demo adresine link verir |
| Giriş | Landing, site üst menüsü ve `/giris` sayfasında "Demoyu dene". Demo dağıtımında `/demo` sayfası: kısa açıklama, Turnstile, başlat düğmesi |
| Erişim | `demo-start` Edge Function'ının açtığı geçici hesap. Demo org'unun etkin parsellerinde `owner` rolü. Varsayılan süre 3 saat |
| Deneyim | Gerçek sahip portalı (ayrıntı aşağıda) |
| Kabuk | Kalıcı demo bandı ("Turu başlat", "Gerçek hesap aç", "Demodan çık"). Rehberli tur. PDF'lerde "ÖRNEK RAPOR" filigranı |
| Koruma | Demo hesabının her yazması reddedilir. Hesap bilgileri değişmez. Demo hesabı demo org'u dışında erişim, üyelik ya da profil alamaz. Bildirim, SMS, AI işi ve müşteri profili oluşmaz. Ziyaretçiler birbirini görmez |
| Veri | Ayrı demo org'u, kurgusal kişiler, iki parsel. Bir yıl arayla iki yaz ziyareti ve onaylı envanter. Sentetik 360° panoramalar, ağaç kesitleri ve yakın plan fotoğraflar; herkese açık, önbellekli bir ayna kovadan sunulur |
| Yükleme | Yerelde tek komut. Test ve demo projeleri için elle tetiklenen bir iş akışı; yükleme ve açma ayrı adımlardır. İdempotent ve sürümlü |
| İşletim | Süresi dolan hesabı silen cron. IP, toplam ve oturum başı sınırlar. Veritabanı anahtarı, web bayrakları ve Edge'de `ORCHADOS_DEMO_MODE` |

Demoda görünen portal ekranları:
- bahçe listesi
- 360° gezi (zaman yolculuğu dahil)
- sağlık haritası ve katmanları
- parsel karnesi:
    - sağlık puanı ve aynı mevsimde bir yıl öncesiyle karşılaştırma
    - boyutlar:
        - yapı: dişi/erkek oranı, aşısız ağaçlar, yaş dağılımı
        - bakım: dip sürgünü
        - zararlı belirtileri
        - meyve yükü ve geçen yılla karşılaştırma
- ağaç karnesi: fotoğraf kanıtı, hash doğrulaması, ölçüm geçmişi
- ziyaret seçimi
- envanter raporu (panorama güven satırıyla)
- karne ve envanter PDF'leri
- bulgular ve uzman notları
- soru-cevap dizileri
- sınır kartı
- hissedarlar kartı

**Kapsam dışı:**
- Faturalama ekranlarının örnek görünümü (başvuru, teklif, sipariş, makbuz). Bu ekranlar müşteri profili ister; demo hiçbir zaman müşteri profili oluşturmaz. Fiyatlar zaten `/paketler`'de görünüyor.
- Ziyaretçinin soru sorabildiği, kendine ait yazılabilir bir kum havuzu.
- Uzman paneli, operasyon ekranları ve saha uygulaması için demo.
- Pilot projesinde demo. Pilot yalnızca demo adresine link verir.
- Gerçek bir vitrin bahçesinin verisi. İP13 yalnızca geçiş altyapısını kurar (§10.5).
- Analytics ve demo kullanım sayaçları.
- Çok dillilik.

## 2. Kararlar

- **Kullanıcı kararı (27 Ekim):** Müşteri hesap açmadan ve ödemeden sahip özelliklerini birebir dener. Açık seçimlerde önerilen seçenek uygulanır.
- **Demo ayrı bir Supabase projesinde ve ayrı bir Vercel dağıtımında çalışır (§3.4).**
    - Pilot (üretim) projesinde demo hiç açılmaz.
    - Internetten gelen herkese verilen `authenticated` JWT, gerçek bahçe verisinin bulunduğu veritabanına hiç ulaşmaz.
    - Kötüye kullanım yalnızca demo projesini etkiler: Auth sınırları, MAU, egress, harcama tavanı.
    - Kod yolu aynıdır. Aşağıdaki korumalar derinlemesine savunma olarak yine kurulur ve tek başına da geçerli olmalıdır.
- **Erişim, Edge Function'ın açtığı geçici hesapla sağlanır; Supabase anonim girişi kullanılmaz (§3.2).** Hesap `app_metadata.demo = true` taşır. `app_metadata` yalnızca servis rolüyle yazılır, bu yüzden claim'e güvenilir.
- **Giriş token'ı tarayıcıda doğrulanır.**
    - Edge tek kullanımlık bir token (`hashed_token`) döner; tarayıcı `verifyOtp` ile oturumu kendisi açar.
    - Böylece GoTrue'nun IP sınırları ziyaretçinin kendi IP'sine işler.
    - Token sunucuda doğrulansaydı, bütün girişler Vercel'in IP'siyle yapılırdı ve demo ortak giriş sınırını tüketirdi.
- **Demo hesabı, demo parsellerinde `owner` rolündedir.** Sahibin gördüğü her kart (hissedarlar, sınır onayı) görünür. Sahip yetkisinin bütün yazmaları demo hesabına kapalıdır.
- **Ayrı bir demo org'u kullanılır.** Demo projesinde demo org'u dışında org bulunmaz; dağıtım ve yükleme iş akışları bunu denetler. Demo org'unda kayıt ve ödeme ayarı (`org_billing_setting`) açılamaz.
- **Koruma katmanlıdır: veritabanı korumaları ve Edge'de açık kontroller.**
    - Genel bir deyim tetikleyicisi (`zz_demo_read_only`), `public` ve `private` şemalarındaki her tabloda demo isteğinden gelen yazmayı reddeder.
    - Hesap kilidi: `auth.users` üzerindeki bir tetikleyici, demo hesabının e-postasının, telefonunun, parolasının ve kullanıcı metaverisinin değişmesini reddeder (§6.2).
    - Erişim kapsamı: demo hesabı demo org'u dışında `parcel_access` alamaz. Üyelik, sahip ya da fatura profili, rıza ve kayıt satırı hiç alamaz. Kural servis rolü ve ops dahil her çağıran için geçerlidir. Hesap arama fonksiyonları demo hesaplarını hiç döndürmez.
    - Servis rolüyle yazan Edge Function'lar demo claim'li çağıranı en başta reddeder: `customer-signup` `complete`, `payments` `start`, `invite-user`. Veritabanı kilidi bu yollarda claim görmez.
    - Sahip RPC'leri ayrıca en başta kontrol eder.
    - Arayüz yalnızca gizler ve açıklar.
- **Veri sentetiktir ve sentetik olduğu üzerinde yazar.**
    - Gerçek saha görüntüsü ne repoya ne demoya girer.
    - Panoramalarda, kesitlerde ve fotoğraflarda "SENTETIK ORNEK" damgası, PDF'lerde "ÖRNEK RAPOR" filigranı bulunur.
    - Kişilerin adı "Örnek …" biçimindedir ve telefonları yoktur.
- **Demo medyası herkese açık bir ayna kovadan (`demo-media`) sunulur.**
    - Sentetik ve damgalı olduğu için gizli değildir.
    - İmzasız ve uzun önbellekli adresler egress'i ve sunucu işini azaltır.
    - Asıl kopya, içerik adresli kuralla `media` kovasında durur.
- **Demo verisi kalıcı ve sürümlüdür.** Barındırılan projede ekleme-yalnız tablolardan satır silinemez. Bu yüzden veri sabit kimliklerle bir kez yüklenir; yeni bir sürüm yalnızca yeni satır ekler.
- **Servis anahtarı Supabase'den çıkmaz.**
    - Yükleyici SQL'i projenin veritabanı parolasıyla psql üzerinden çalıştırır. Bu parola, dağıtım iş akışlarının zaten kullandığı secret'tır.
    - Medyayı demo org'unun operasyon kişisiyle yükler. Bu kişiye o çalıştırma için geçici bir parola verilir ve yükleme bitince silinir.
- **Anahtarlar; hepsi varsayılan olarak kapalıdır.**
    - Web `ORCHADOS_DEMO_ENABLED`: bu dağıtım `/demo`'yu sunar.
    - Web `ORCHADOS_DEMO_URL`: sitenin CTA'larının hedefi.
    - Edge `ORCHADOS_DEMO_MODE`: `dev` ya da `public`. Tanımsızsa başlatma kapalıdır.
    - Veritabanı `private.demo_org.enabled`.
- **Yeni web bağımlılığı eklenmez.** Rehberli tur sıfırdan yazılır. Tarayıcı istemcisi mevcut `@supabase/ssr` ile kurulur.
- **Analytics yok.** Demo açılış sayısı tutulmaz. Yalnızca oran sınırı için IP'nin HMAC özeti 48 saat saklanır; IPv6'da özet /64 önekinden alınır. Bu özet takma adlandırılmış bir kişisel veridir (§12).

## 3. Erişim modeli

### 3.1 Akış

```
Site (pilot Vercel): "Demoyu dene" ──▶ https://demo.<alan adı>/demo

Tarayıcı                Next (demo Vercel)             Edge: demo-start (demo projesi)      Postgres / Auth (demo projesi)
/demo, Turnstile ──▶ startDemoAction ── proxy sırrı + IP ──▶ ORCHADOS_DEMO_MODE, Turnstile
                                                        demo_admit(ip_hash) ─────────────▶ sınırlar, demo_attempt
                                                        Admin API: kullanıcı aç ─────────▶ auth.users (app_metadata.demo)
                                                        demo_start(user, ip_hash) ──────▶ demo_session, parcel_access(owner)
                                                        Admin API: generate_link ───────▶ hashed_token
            ◀───── {token_hash, next} ◀────────────────
verifyOtp(token_hash) ─────────────────────────────────────────────────────────────────▶ oturum (ziyaretçinin IP'siyle)
/portal?tur=bahceler  →  RLS: demo parsellerinin sahibi; yazma, hesap değişikliği, org dışı erişim reddedilir
Medya                 →  https://<demo ref>.supabase.co/storage/v1/object/public/demo-media/org/<org>/parcel/<parsel>/<sha256>
```

### 3.2 Neden anonim giriş değil

- **GoTrue engeli:** GoTrue'da anonim giriş, dışarıdan üye olma (`enable_signup`) kapalıyken çalışmaz. `SignupAnonymously` önce `DisableSignup`'a bakar ve `signup_disabled` döner.
- **İP12 kararı:** İP12 "Auth'ta dışarıdan kayıt kapalı kalır" der (musteri-yonetimi.md §2). Barındırılan bütün projelerde de dışarıdan üye olma kapalıdır.
- **Açmanın bedeli:** `enable_signup` açılırsa `/auth/v1/signup` e-posta ve telefonla kayda açılır. Telefonla kayıt bir kod SMS'i gönderir; bu da SMS pompalamaya kapı açar.
- **Kancayla kapatmak yeterli değil:** Bir `before_user_created` kancası bu yolu yeniden kapatabilir. Ama o zaman bütün kayıt güvenliği, her projede panelden elle ayarlanan tek bir kancaya dayanır.
- **Seçilen yol:** Edge'in açtığı hesap, İP12'deki `customer-signup` kalıbının aynısıdır: Admin API, Turnstile, HMAC'li IP sınırı ve cron temizliği. `app_metadata.demo` claim'i, RLS'de ve web'de `is_anonymous` kadar kolay okunur.

### 3.3 Neden ortak hesap ya da statik kopya değil

- **Ortak salt okunur hesap:**
    - Parola Vercel'de durur ve girişler sunucudan, Vercel'in IP'siyle yapılır. GoTrue'nun 5 dakikada 30 giriş sınırı paylaşılır.
    - Ziyaretçi başına süre ve temizlik olmaz.
    - `viewer` rolüyle sahip görünümü birebir olmaz.
- **Statik kopya ya da servis rolüyle ayrı bir `/demo/**` ağacı:**
    - Veri katmanı, imzalayıcı ve PDF'ler kopyalanır; portal değiştikçe kopya ayrışır.
    - Servis anahtarı Vercel'e konmaz.

### 3.4 Neden ayrı proje

- **Saldırı yüzeyi:**
    - İP13'ten önce `authenticated`, operasyonun tanıdığı biri demekti. Demo açılınca Turnstile'ı geçen herkes gerçek bir JWT alır.
    - `authenticated`'a açık yaklaşık yüz fonksiyon, her `to authenticated` politikası ve medya kovası politikaları bu JWT'ye açılır.
    - Bunlardan birindeki tek bir eksik erişim kontrolü, bugün ya da gelecekteki bir migration'da, gerçek bahçe verisini sızdırabilir. Yazma kilidi okumaları korumaz.
- **Etki alanı:** Kötüye kullanım üretimle aynı kaynakları tüketirdi: Auth'un IP sınırları, MAU, `auth.users` ve onu sayfalayan kayıt temizliği, depolama egress'i ve harcama tavanı. Kota bitince proje gerçek müşteriler için de kısıtlanırdı.
- **Somut örnek:** Hesap değiştirme açığı (§6.2), bir demo hesabının gerçek bir org'un parseline bağlanabileceğini gösterdi. Ayrı projede bağlanacak gerçek bir parsel yoktur.
- **Bedeli:** Bir Supabase projesi, bir Vercel projesi ve migration'ları o projeye taşıyan bir iş akışı (`deploy-db-demo`). Kod ve migration'lar aynıdır.
- **Test projesi:** Yalnızca kısa, ekip içi bir duman testi için kullanılır (§15). Orada gerçek müşteri yoktur, ama ekip hesapları vardır.
- **Geçici istisna:** Supabase organizasyonu Pro'ya geçene kadar herkese açık demo test projesinde çalışır (§15.1). Ayrı proje hedefi değişmez; geçiş aynı iş akışıyla yapılır.

## 4. Demo oturumunun yaşam döngüsü

| Adım | Ne olur |
| --- | --- |
| Başlatma | Edge önce `ORCHADOS_DEMO_MODE`'a ve Turnstile'a bakar. `demo_admit` IP ve toplam sınırlarını denetler ve sayacı artırır. Hesap açılır. `demo_start`, `demo_session` (bitiş = şimdi + `session_ttl`) ve her etkin demo parseli için `parcel_access(owner)` yazar |
| Kullanım | Ziyaretçi portalda gezinir. Bant kalan süreyi gösterir. Görüntü eşleme ve PDF çağrıları oturum başı sınırlıdır (`demo_hit`). Erişim belirteci, var olan proxy'de saatte bir yenilenir |
| Bitiş | Ziyaretçi "Demodan çık"a basar: `demo_end()` bitişi şimdiye çeker ve oturum kapanır. Ya da süre dolar: oturum kapısı (`lib/auth/session.ts`) her portal sayfasında ve PDF rotasında `/demo/bitti`'ye yönlendirir. Oradan `/demo?bitti=1` adresine gidilir |
| Temizlik | `demo-cleanup` cron'u 15 dakikada bir silinebilir hesapları Admin API ile siler (§7). `parcel_access` ve `demo_session` cascade ile gider. Silinemeyen kimlikler o çalıştırmada bir daha denenmez; döngü yeni silme olmayınca durur. Silme ölçütlerine uymayan hesap silinmez, yalnızca sayısı loglanır. Silinen hesapların GoTrue denetim kayıtları (IP içerir) mümkünse silinir |
| Erişimin kapanması | `demo-housekeeping`, 5 dakikada bir çalışan bir SQL işidir. Yaptıkları: <br>• Süresi dolan oturumların `parcel_access` satırlarını siler. <br>• Demo org'u dışındaki demo erişimlerini siler; bunlar hiç olmamalıdır, sayı loglanır. <br>• Bilgileri değişmiş demo hesaplarının oturumunu bitirir; bu yalnızca hesap kilidi tetikleyicisi kurulamamışsa olur. <br>• Kişilerin (persona) yasağını ve boş parolasını geri koyar. <br>• 48 saatten eski `demo_attempt` satırlarını siler. <br>Edge temizliği çalışmasa bile süresi dolan hesap hiçbir şey göremez |

| Sınır | Varsayılan | Nerede |
| --- | --- | --- |
| IP kovası başına saatlik başlatma | 10 | `private.demo_org.ip_hourly_limit` |
| IP kovası başına günlük başlatma | 40 | `ip_daily_limit` |
| Aynı anda etkin demo | 200 | `max_active_sessions` |
| Günlük toplam başlatma | 500 | `max_daily_starts` |
| Oturum süresi | 3 saat | `session_ttl` (15 dakika ile 24 saat arası) |
| Oturum başı görüntü eşleme çağrısı | 600 | `max_sign_calls` |
| Oturum başı PDF üretimi | 30 | `max_pdf_renders` |
| Turnstile | `ORCHADOS_DEMO_MODE=public`'te zorunludur ve canlı anahtar ister; Cloudflare'in sahte anahtarları reddedilir. `dev`'de yalnızca secret tanımlıysa uygulanır | Edge |

- **IP kovası:** IPv4'te tam adres, IPv6'da /64 önekidir. IPv4 eşlemeli IPv6 adres IPv4 sayılır. Böylece kendi /64'ü içinde adres değiştiren biri sınırı aşamaz.
- **CGNAT:** Türkiye'deki mobil CGNAT ve fuar Wi-Fi'ı tek bir IP'yi paylaşır. Saatlik sınır bu yüzden 10'dur ve `demo_org` satırından değiştirilebilir.
- **Sayım:** Sınırlar yalnızca kabul edilen başlatmaları sayar.
- **Reddedilen istekler:** Satır biriktirmez. `demo_attempt`, her (kova, sonuç, dakika) için tek satır ve bir sayaç tutar.
- **IP'nin kaynağı:** İsteklerin IP'si, `customer-signup`'ta olduğu gibi proxy sırrıyla (`SIGNUP_PROXY_SECRET`) Next'ten gelir. IP yoksa bütün istekler tek bir `unknown` kovasına düşer.

## 5. Veritabanı (A)

Migration'lar:
- `20261101120000_demo_access.sql`: kayıt tabloları, fonksiyonlar, cron, faturalama koruması.
- `20261101120100_demo_write_guard.sql`: yazma kilidi, kısıtlayıcı politikalar, değişen fonksiyonlar.
- `20261101120200_demo_account_lockdown.sql`: hesap kilidi, erişim kapsamı, hesap aramaları, `demo-media` kovası, son `demo_housekeeping`.

Hepsi her projeye (test, pilot, demo) gider. Demo org'u olmayan projede hiçbiri bir şey yapmaz.

### 5.1 Tablolar (`private`; `anon` ve `authenticated` için yetki yok)

```sql
create table private.demo_org (
  org_id uuid primary key references public.org (id) on delete cascade,
  enabled boolean not null default false,
  session_ttl interval not null default '3 hours'
    check (session_ttl between interval '15 minutes' and interval '24 hours'),
  max_active_sessions integer not null default 200 check (max_active_sessions > 0),
  max_daily_starts integer not null default 500 check (max_daily_starts > 0),
  ip_hourly_limit integer not null default 10 check (ip_hourly_limit > 0),
  ip_daily_limit integer not null default 40 check (ip_daily_limit > 0),
  max_sign_calls integer not null default 600 check (max_sign_calls > 0),
  max_pdf_renders integer not null default 30 check (max_pdf_renders > 0),
  -- Ziyaretçi hesaplarının e-posta alan adı (§7).
  visitor_email_domain text not null default 'demo.orchados.invalid'
    check (visitor_email_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  -- Rehberli turun hedefleri; yükleyici yazar (§8.1).
  tour jsonb not null default '{}'::jsonb,
  dataset_version integer,
  dataset_sha256 text,
  dataset_source text not null default 'synthetic' check (dataset_source in ('synthetic', 'showcase')),
  -- null: yükleme sürüyor ya da yarım kaldı.
  loaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or loaded_at is not null)
);
-- En fazla bir etkin demo org'u.
create unique index demo_org_one_enabled on private.demo_org ((true)) where enabled;

create table private.demo_parcel (
  parcel_id uuid primary key references public.parcel (id) on delete cascade,
  org_id uuid not null references private.demo_org (org_id) on delete cascade,
  sort_order integer not null default 0,
  active boolean not null default true
);  -- tetikleyici: parcel.org_id = demo_parcel.org_id

create table private.demo_session (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references private.demo_org (org_id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  sign_calls integer not null default 0,
  pdf_renders integer not null default 0
);

-- Kova, sonuç ve dakika başına tek satır: reddedilen istekler satır biriktirmez.
create table private.demo_attempt (
  ip_hash text not null,
  outcome text not null check (outcome in ('admitted', 'rate_limited', 'capacity', 'closed')),
  minute timestamptz not null,  -- date_trunc('minute', now())
  hits integer not null default 1 check (hits > 0),
  primary key (ip_hash, outcome, minute)
);
-- İndeks: (outcome, minute), günlük toplam için.
```

`tour` alanının biçimi:

```json
{"parcel_id": "uuid", "tree_id": "uuid", "session_id": "uuid", "previous_session_id": "uuid", "inventory_session_id": "uuid"}
```

Anahtar eksikse rehberli tur o adımı atlar.

### 5.2 Fonksiyonlar

| Fonksiyon | Kim | Ne yapar |
| --- | --- | --- |
| `authz.is_demo_user() → boolean` | herkes (politikalar) | `auth.jwt() -> 'app_metadata' ->> 'demo' = 'true'` |
| `authz.is_demo_account(uuid) → boolean` | authenticated (politikalar), security definer | `auth.users.raw_app_meta_data ->> 'demo' = 'true'` |
| `private.is_demo_org(uuid)` | iç | Org bir `demo_org` mu |
| `private.assert_not_demo()` | iç | Demo isteğinde `demo_read_only` (42501) yükseltir |
| `public.demo_admit(p_ip_hash text) → jsonb` | service_role | Advisory lock altında sınırları denetler. Kabul edilen başlatmaları sayar; her sonuç kendi (kova, sonuç, dakika) satırının sayacını artırır. Sonuç `{ok: true, org_id, ttl_seconds, email_domain}` ya da `{ok: false, error: 'demo_closed' \| 'rate_limited' \| 'demo_capacity'}` |
| `public.demo_start(p_user_id uuid, p_ip_hash text) → jsonb` | service_role | Hesabı doğrular. Hesap şu koşulların hepsini sağlamalıdır: <br>• `app_metadata.demo` taşır <br>• son 10 dakikada açılmıştır <br>• telefonu yoktur <br>• e-postası `@<visitor_email_domain>` ile biter <br>• parolası boştur <br>• üyeliği ve profili yoktur <br>`demo_session` ve etkin parseller için `parcel_access(owner, granted_by null)` yazar. Sonuç `{org_id, expires_at, parcel_ids, next: '/portal?tur=bahceler'}`. Aynı kullanıcıyla ikinci çağrı aynı sonucu döner |
| `public.demo_info() → jsonb` | authenticated | Demo kullanıcısına `{org_id, expires_at, tour, parcels: [{id, name}]}` döner; başkasına `null` |
| `public.demo_end() → void` | authenticated | Yalnızca çağıranın kendi `demo_session` satırını kapatır: `expires_at = least(expires_at, now())`, `ended_at` |
| `public.demo_hit(p_kind text) → boolean` | authenticated | `'sign'` ya da `'pdf'`. Çağıranın etkin demo oturumundaki sayacı artırır. Sınır aşıldıysa ya da etkin oturum yoksa `false` döner |
| `public.demo_expired_accounts(p_limit integer default 200, p_exclude uuid[] default '{}') → setof uuid` | service_role | Silinebilir hesaplar (§7) |
| `public.demo_undeletable_count() → integer` | service_role | Demo bayrağı taşıyıp silme ölçütlerine uymayan hesapların sayısı |
| `public.demo_purge_audit_log(p_user_ids uuid[]) → integer` | service_role | Bu hesapların `auth.audit_log_entries` satırlarını siler. Yetki yoksa 0 döner, hata vermez |
| `private.dispatch_demo_cleanup()` | cron | Vault'taki `demo_cleanup_url` ve `orchados_cron_secret` ile `{"action":"cleanup"}` gönderir. Biri yoksa hiçbir şey yapmaz |
| `private.demo_housekeeping()` | cron | §4'teki işler; her adım kendi hata bloğundadır |
| `private.deny_demo_write()`, `private.attach_demo_guard(regclass)` | iç | Genel yazma kilidi (§6.1) |
| `private.attach_demo_guards() → setof regclass`, `private.demo_guard_drift() → table(kind, object, problem)` | iç | Yayına almadan sonra yeniden bağlama ve sapma denetimi (§6.1) |
| `private.demo_account_freeze()` | `auth.users` tetikleyicisi | Hesap kilidi (§6.2) |
| `private.demo_account_scope_guard()`, `private.attach_demo_account_guard(regclass, text, boolean)` | iç | Erişim kapsamı (§6.2) |

**Değişen mevcut nesneler:**
- `approve_boundary`, `owner_invite_viewer`, `owner_cancel_viewer_invitation`: ilk satır `perform private.assert_not_demo();`. İmza, yetki ve yorum aynı kalır.
- `public.ops_find_user_id` ve `public.signup_find_account`: demo hesaplarını hiç döndürmez. `invite-user` ve hissedar onayı aramayı bu fonksiyonla yapar.
- `private.enqueue_notifications` ve faturalama bildirimlerini yazan bütün fonksiyonlar: demo org'larını atlar.
- `public.save_ai_assessment`: demo org'unun oturumunu `demo_org_no_ai` hatasıyla reddeder.
- `public.org_billing_setting`: demo org'unda `accepts_signups` ya da `allow_fake_payments` açılamaz (`demo_billing_forbidden`). Böyle bir ayarı olan org da demo olarak kaydedilemez.
- Kısıtlayıcı (`as restrictive`) politikalar: `parcel_access`, `question`, `question_reply` ve `storage.objects` üzerinde (§6).
- `storage.buckets`: herkese açık `demo-media` kovası. Yükleme yalnızca demo org'unun ops üyesine açıktır, yol `org/<demo org>/…` olmalıdır. Güncelleme ve silme politikası yoktur.

### 5.3 Hata kodları

| Kod | SQLSTATE / HTTP | Nerede | Anlamı |
| --- | --- | --- | --- |
| `demo_read_only` | 42501 / 403 | Tetikleyici, RPC korumaları, Edge kontrolleri (`customer-signup`, `payments`, `invite-user`), `send-sms` kancası | Demo hesabı yazamaz |
| `demo_account_locked` | 42501 | `demo_account_freeze` | Demo hesabının e-postası, telefonu, parolası ve metaverisi değişmez |
| `demo_account_scope` | 42501 | Erişim kapsamı tetikleyicileri | Demo hesabı demo org'u dışına bağlanamaz; üyelik ya da profil alamaz |
| `demo_closed` | P0001 / 503 | `demo_admit`, `demo_start`, Edge (`ORCHADOS_DEMO_MODE` yok ya da canlı Turnstile yok) | Demo açık değil |
| `rate_limited` | 429 | `demo_admit` | IP sınırı aşıldı |
| `demo_capacity` | P0001 / 503 | `demo_admit`, `demo_start` | Etkin oturum ya da günlük başlatma sınırı doldu |
| `not_demo_account` | 22023 | `demo_start` | Kullanıcı Edge'in açtığı bir demo hesabı değil |
| `demo_org_no_ai` | 42501 | `save_ai_assessment` | Demo ziyaretine AI sonucu yazılmaz |
| `demo_billing_forbidden` | 23514 | `org_billing_setting`, `demo_org` | Demo org'unda kayıt ya da ödeme ayarı açılamaz |
| `captcha_failed`, `invalid_input`, `failed`, `unauthorized` | 400 / 400 / 500 / 401 | Edge | |

`demo_hit` hata vermez, `false` döner. Web bu durumda PDF rotasından bağlantının bulunduğu sayfaya `303` ile `?hata=demo_pdf_limit` döner ve sayfa `closed.pdfLimit` notunu gösterir (PDF düğmesi düz bir bağlantıdır; çıplak bir 429 ziyaretçiyi açıklamasız bir hata sayfasına götürürdü). Görüntü eşleme boş sonuçla birlikte `capped` bayrağını döner; gezi görüntüleyicinin üstünde `closed.images` notunu gösterir.

### 5.4 Cron

| İş | Zaman | Ne yapar |
| --- | --- | --- |
| `demo-cleanup` | `*/15 * * * *` | `private.dispatch_demo_cleanup()` |
| `demo-housekeeping` | `*/5 * * * *` | `private.demo_housekeeping()` |

## 6. Yazma yolları ve korumalar

### 6.1 Genel yazma kilidi

- **Tetikleyici:** `private.deny_demo_write()` bir `BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT` tetikleyicisidir. İstek bir demo hesabından geliyorsa (`authz.is_demo_user()`) `demo_read_only` yükseltir.
- **Neden tablo düzeyinde:** Security definer fonksiyonların içinden yapılan yazmalar da yakalanır. Claim'ler istek boyunca geçerli olduğu için, RLS'i atlayan fonksiyonlar da kilide takılır.
- **Sınırı:** Kilit claim'e dayanır. Bir Edge Function kullanıcının token'ını doğrulayıp servis rolüyle yazıyorsa, veritabanı demo claim'ini görmez. Bu yollar Edge'de açıkça kapatılır (§6.3).
- **Kapsam:** `public` ve `private` şemalarındaki bütün temel tablolar. İstisnalar:
    - eklentilere ait tablolar
    - `private.demo_session`: `demo_end` ve `demo_hit` bu tabloya yazar.
- **Kimleri etkilemez:** Servis rolü, cron, işleme hattı ve yükleyicinin isteklerinde demo claim'i yoktur; onlar kilitten etkilenmez.
- **Yeni tablolar:** Bundan sonra tablo ekleyen her migration `select private.attach_demo_guard('<tablo>');` çağırır. Kullanıcıya erişim ya da kimlik veren yeni tablo ayrıca `private.attach_demo_account_guard(...)` çağırır. pgTAP `43_demo_write_guard` birinci çağrısı eksik tabloyu bulursa başarısız olur. Kural CLAUDE.md'de de yazılıdır.
- **Migration sırası:** Yayına alma `db push --include-all` ile yapılır. Sonradan birleşen ama zaman damgası daha eski bir migration, barındırılan projede IP13-A migration'larından sonra, temiz CI veritabanında ise önce uygulanır. Bu yüzden pgTAP onu göremez. Her yayına alma iş akışı (`deploy-db*.yml`) `db push`'tan sonra `scripts/demo-guard-check.sh`'ı çalıştırır: `private.attach_demo_guards()` kilidi eksik tablolara yeniden bağlar, `private.demo_guard_drift()` hâlâ kilitsiz tablo, demo süzgecini kaybetmiş bir geçersiz kılınmış fonksiyon (`ops_find_user_id`, `enqueue_notifications` vb.) ya da kaybolmuş bir hesap kapsamı tetikleyicisi bulursa iş başarısız olur. `ddl_command_end` olay tetikleyicisi kullanılmadı: barındırılan Supabase'de (supautils) `db push` sırasında güvenilir biçimde çalıştığı gösterilemedi; sessizce çalışmayan bir kilit açık denetimden kötüdür.
- **Tablo dışı yan etkiler:** `authenticated` rolüne açık olup `pg_notify` ya da `net.http_` çağıran fonksiyonlar test dosyasındaki bir izin listesinde olmalıdır. Listede olmayan bir fonksiyon testi düşürür.

### 6.2 Hesap kilidi ve erişim kapsamı

**Sorun:**
- Demo ziyaretçisi gerçek bir GoTrue oturumu taşır ve `PUT /auth/v1/user` çağırabilir.
- Yerelde onaylar kapalıdır: `[auth.sms] enable_confirmations = false`, `[auth.email] enable_confirmations = false`. Barındırılan projelerin bu ayarı da bugün belgelenmemiştir.
- Onay kapalıyken GoTrue telefon değişikliğini (otomatik onayla e-posta değişikliğini de) hemen ve onaylı olarak uygular. SMS ya da e-posta gitmez, `send-sms` kancası hiç çalışmaz. Kanca bu yüzden bir kontrol sayılamaz.

**Saldırı şöyle işlerdi:**
1. Ziyaretçi, operasyonun davet edeceği birinin telefonunu ya da e-postasını kendi hesabına yazar. Örnek: gerçek bir sahibin hissedar davetindeki telefon.
2. `ops_find_user_id` o hesabı döndürür.
3. `invite-user` ya da hissedar onayı demo hesabını gerçek bir org'un parseline bağlar.
4. Ziyaretçi o bahçenin gerçek verisini okur.

**Yan etkiler:**
- Telefonu işgal edip gerçek kişinin `/kayit`'ını engelleyebilirdi; her 3 saatte yeni bir demo hesabıyla işgali yenileyebilirdi.
- Temizlik hesabı silerken o gerçek erişim satırlarını sessizce götürürdü.

**Önlemler:**
1. **Hesap kilidi:** `auth.users` üzerinde bir `BEFORE UPDATE` tetikleyicisi (`demo_account_freeze`) kurulur. Eski satır `app_metadata.demo = true` taşıyorsa şu değişiklikler `demo_account_locked` ile reddedilir:
    - `email`, `phone`, `email_change`, `phone_change`, `encrypted_password`
    - kullanıcı metaverisi (GoTrue'nun kendi tuttuğu `email_verified`, `phone_verified`, `email` ve `sub` anahtarları hariç)

   Silme etkilenmez. Oturum açma alanları da (`last_sign_in_at`, token sütunları) etkilenmez.
2. **Erişim kapsamı:** Servis rolü ve ops dahil her çağıran için geçerli satır tetikleyicileri (`demo_account_scope`) kurulur:
    - `parcel_access`: satırın kullanıcısı demo hesabıysa org bir demo org'u olmalıdır.
    - `membership`, `private.owner_profile`, `private.billing_profile`, `private.consent_record`, `private.customer_signup`: demo hesabı için hiç satır kabul etmez.
3. **Aramalar:** `ops_find_user_id` ve `signup_find_account` demo hesaplarını hiç döndürmez.
4. **Hesap ölçütleri:** `demo_start` hesabı yalnızca telefonu yoksa, e-postası ziyaretçi alan adındaysa ve parolası boşsa kabul eder. Temizlik de aynı ölçütleri kullanır (§7).
5. **Housekeeping:**
    - Demo org'u dışındaki demo erişimlerini siler.
    - Hesap kilidi barındırılan projede kurulamamışsa: e-postası, telefonu ya da parolası değişmiş demo hesaplarının oturumunu bitirir ve erişimlerini siler. Hesabı temizlik siler, en geç 15 dakika içinde.
6. **Barındırılan Auth ayarları:** Test, demo ve pilot projelerinde "Confirm phone", "Confirm email" ve "Secure email change" açıktır (deployment.md). Yerelde kapalı kalır; 1–5 bu yüzden onaylara güvenmez.

**Kurulum notu:** Barındırılan proje `auth.users` üzerinde tetikleyiciye izin vermezse migration durmaz, uyarı verir. 2–6 o durumda da geçerlidir.

### 6.3 Yol yol

| Yol | Sunucu tarafı | Arayüz |
| --- | --- | --- |
| Soru sorma, cevaplama, düzenleme (`question`, `question_reply`) | Tetikleyici ve kısıtlayıcı politika. Sunucu eylemi önce `user.demo`'yu kontrol eder | Form yerine "Demoda soru gönderilmez" notu. Hazır örnek diziler görünür |
| Hissedar daveti, iptali, çıkarma (`owner_invite_viewer`, `owner_cancel_viewer_invitation`, `parcel_access` silme) | RPC başında `assert_not_demo`, kısıtlayıcı politika, tetikleyici | Liste görünür; düğmeler yerine not |
| Operasyonun hesap bağlaması (`invite-user`, hissedar onayı, `ops_create_owner_profile`) | `invite-user` demo çağıranı reddeder. Aramalar demo hesabı döndürmez. Erişim kapsamı tetikleyicileri | Yok |
| Sınır onayı (`approve_boundary`) | RPC koruması. Demo sınırı zaten onaylıdır | Düğme hiç çıkmaz |
| Başvuru, paket, bahçe, gönderme, geri çekme, teklif kabul ve ret, sipariş iptali (`customer_*`) | Profil olmadığı için `not_customer`; ayrıca tetikleyici | `PortalNav` ve `CustomerHome` görünmez. Bu sayfalara doğrudan gidilirse `/portal`'a dönülür |
| Ödeme başlatma (`payments` Edge `start`, `payment_begin`) | Edge demo claim'ini görünce 403 `demo_read_only` döner. `payment_begin` yalnızca `service_role`'e açıktır | Link yok |
| Kayıt tamamlama (`customer-signup` `complete`) | Edge demo claim'ini görünce 403 `demo_read_only` döner. Erişim kapsamı tetikleyicisi | `/kayit` önce demodan çıkarır |
| Rızalar, iletişim bilgisi, fatura profili | `not_customer`, tetikleyici, erişim kapsamı | `/portal/hesap` açılmaz |
| Makbuz (`/makbuz/[id]`, `receipt_data`) | Satır olmadığı için 404 | Link yok |
| Hesap değişikliği (GoTrue `PUT /auth/v1/user`: e-posta, telefon, parola, metaveri) | Hesap kilidi (§6.2); GoTrue isteği hata döner. Yerelde Mailpit e-postayı yakalar, ama değişiklik zaten reddedilir. Barındırılan projede onaylar açıktır ve varsayılan SMTP yalnızca ekip adreslerine teslim eder. `send-sms` kancası demo hesabına kod göndermez (ek katman). Hesap süre sonunda silinir | Hesap ekranı yok |
| Medya yükleme (`storage.objects`) | Var olan ops ve saha politikaları ve kısıtlayıcı politika. `demo-media` kovasına yalnızca demo org'unun ops kişisi yükler | Yok |
| Bildirim (`notification`) | `enqueue_notifications` demo org'larını atlar; tetikleyici | Yok |
| Oturumu kapatma | `demo_end()`, yalnızca kendi satırı | "Demodan çık" |
| AI | `save_ai_assessment` demo org'unu reddeder. Worker zaten yayımlanmış ziyarete yazmaz (`WRITABLE = processed, in_review`) | Yok |

### 6.4 Ziyaretçiler arası gizlilik

- **`parcel_access`:** Kısıtlayıcı select politikası şöyledir: demo kullanıcısı yalnızca kendi satırını ve demo hesabı olmayan hesapların satırlarını görür, yani kurgusal sahibi ve hissedarı. Öteki ziyaretçilerin hesap kimlikleri görünmez.
- **Soru dizileri:** Yalnızca hazır veriden gelir; yeni satır yazılamaz.
- **Medya:**
    - Demo org'unun dosyaları `demo-media` kovasından herkese açık adresle sunulur.
    - Bütün demo hesapları aynı veriyi görür, dosyalar sentetiktir ve damgalıdır, bu yüzden paylaşılan adres bilgi sızdırmaz.
    - Öteki adresler her zamanki gibi kullanıcı kapsamıyla imzalanır.
- **E-posta:** Demo hesabının e-postası rastgeledir (`ziyaretci-<uuid>@<ziyaretçi alan adı>`) ve arayüzde gösterilmez.

### 6.5 Bildirim, SMS, AI ve müşteri profili

- **Bildirim:**
    - Demo ziyaretleri doğrudan yayımlanmış durumda eklenir. Durum güncellemesi olmadığı için `session_notify_published` çalışmaz.
    - Bulgular `parcel_access` satırlarından önce eklenir. Bu yüzden `finding_notify_critical` bildirim gönderecek kimseyi bulamaz (§8.3).
    - `enqueue_notifications` demo org'unu ayrıca atlar. Bu yüzden ileride eklenecek bir sürüm bile kuyruğa satır düşürmez.
    - Soru tetikleyicisi (`pg_notify`) yalnızca kimlik taşır; ziyaretçi soru ekleyemez.
- **SMS:**
    - Demo hesabının telefonu yoktur ve hesap kilidi telefon eklemeyi engeller.
    - `send-sms` kancası `app_metadata.demo` taşıyan hesaba kod göndermez ve `message_outbox`'a satır yazmaz.
- **AI:**
    - Demo verisi worker'dan geçmez; değerlendirmeler veride hazır gelir.
    - `save_ai_assessment` demo org'unu reddeder.
    - Demo ziyaretinden LLM'e hiçbir şey gitmez.
- **Müşteri profili:**
    - Demo hesabı için `owner_profile`, `billing_profile`, rıza ya da kayıt satırı oluşmaz. Erişim kapsamı tetikleyicileri bunu servis rolüne karşı da garanti eder.
    - Demo org'unda `org_billing_setting` yoktur, bu yüzden `private.signup_org_id()` demo org'unu hiçbir zaman seçmez.

## 7. `demo-start` Edge Function (A)

`POST /functions/v1/demo-start`. `verify_jwt = false`; kimlik kodda doğrulanır.

```
{ "action": "start", "client_ip"?: string, "captcha_token"?: string }
  x-orchados-proxy-secret: SIGNUP_PROXY_SECRET   (yalnızca Next sunucusu; o zaman client_ip'e güvenilir)
  0. ORCHADOS_DEMO_MODE:
       tanımsız → 503 demo_closed.
       "public" → TURNSTILE_SECRET_KEY tanımlı olmalı ve Cloudflare'in sahte anahtarlarından
                  (1x0000…AA, 2x0000…AA, 3x0000…AA) biri olmamalı; değilse 503 demo_closed.
       "dev"    → Turnstile yalnızca secret tanımlıysa (yerel, CI, kısa test duman testi).
       Kendi robot doğrulamamızda (DEMO_CAPTCHA_PROVIDER=altcha, aşağıda) "public" için
       ALTCHA_HMAC_KEY (≥ 32 karakter, önce DEMO_ adı) gerekir; "dev" gönderilen jetonu denetler.
       Sağlayıcı yalnızca DEMO_CAPTCHA_PROVIDER'dan okunur; boşsa Turnstile. Test sitesinin
       CAPTCHA_PROVIDER'ı demoyu hiçbir zaman değiştirmez (ortak barındırma, §15.1).
       Bilinmeyen bir DEMO_CAPTCHA_PROVIDER → 503 demo_closed.
  1. Robot doğrulaması: Turnstile ya da kendi doğrulamamız (_shared/captcha.ts).
  2. ip_hash = HMAC-SHA256(SIGNUP_HASH_SECRET, "demo:" + (ipBucket(ip) ?? "unknown")); demo_admit(ip_hash).
     ipBucket: IPv4 tam adres; IPv6 ilk 64 bit; ::ffff: eşlemeli IPv4 → IPv4.
  3. Admin API: e-posta ziyaretci-<uuid>@<email_domain>, email_confirm true, app_metadata {demo: true};
     parola, telefon ve user_metadata yok. email_domain demo_admit'ten gelir.
  4. demo_start(user_id, ip_hash); hata olursa hesap hemen silinir.
  5. Admin API generate_link {type: "magiclink", email} → hashed_token.
  200 {token_hash, verification_type, expires_at, next: "/portal?tur=bahceler"}
  · 400 {error: "invalid_input" | "captcha_failed"} · 429 {error: "rate_limited"}
  · 503 {error: "demo_closed" | "demo_capacity"} · 500 {error: "failed"}

{ "action": "challenge" }   yalnızca DEMO_CAPTCHA_PROVIDER=altcha
  HMAC imzalı iş kanıtı sorusu (10 dakika, amaç "demo"); Next sunucusu ister.
  200 {algorithm, challenge, maxnumber, salt, signature} · 400 invalid_input (başka sağlayıcı)
  · 503 demo_closed (başlatma kapalıyken)

{ "action": "cleanup" }   x-orchados-cron-secret: ORCHADOS_CRON_SECRET
  tur: demo_expired_accounts(200, başarısızlar) → her biri Admin API ile silinir;
       silinemeyen kimlik başarısızlar listesine eklenir
  bir turda yeni silme yoksa ya da 10 turdan sonra durulur
  → demo_purge_audit_log(silinenler) → demo_undeletable_count() (yalnızca sayı loglanır)
  200 {deleted, failed, skipped} · 401
```

**Silinebilir hesap ölçütleri:**
- **Süresi dolmuş oturum:** Hesap demo bayrağı taşır. Üyelik, sahip ya da fatura profili, rıza ve kayıt satırı yoktur.
- **Yetim hesap** (oturumsuz, bir günden eski): yukarıdakilere ek olarak:
    - e-posta `ziyaretci-…@<bir ziyaretçi alan adı>` biçimindedir
    - telefon yoktur
    - demo org'u dışında `parcel_access` yoktur
- **Ölçütlere uymayan hesap:** Silinmez. Yalnızca sayısı loglanır ve insan inceler.

**Ek Edge kontrolleri (A):**
- `customer-signup` (`complete`), `payments` (`start`) ve `invite-user` token'ı doğruladıktan hemen sonra, servis rolüyle yapılan ilk çağrıdan önce claim'lere bakar.
- `app_metadata.demo === true` ise 403 `{error: "demo_read_only"}` döner.
- Claim'ler `_shared/signup.ts`'deki `jwtClaims` ile okunur.
- `send-sms` kancası demo hesabına kod göndermez (ek katman).

**Saf yardımcılar:** `supabase/functions/_shared/demo.ts`, Vitest'te de çalışır. İçeriği:
- istek ayrıştırma, hata kodları, HTTP durumları, yanıt tipleri
- `ipBucket`
- `demoMode` (sahte Turnstile anahtarını tanıma dahil)
- `demoEmail(id, domain)`, `DEFAULT_DEMO_EMAIL_DOMAIN`

IP okuma, proxy sırrı ve HMAC için `_shared/signup.ts` kullanılır.

**Robot doğrulaması** ([hukuk/kararlar.md](hukuk/kararlar.md) H03, T12; [deployment.md](deployment.md) › Robot doğrulaması):
- Varsayılan Cloudflare Turnstile'dır. Cloudflare KVKK standart sözleşmesini imzalamazsa kendi sunucumuzda çalışan iş kanıtı doğrulamasına geçilir: Edge `DEMO_CAPTCHA_PROVIDER=altcha` ve `DEMO_ALTCHA_HMAC_KEY` (anahtar için `ALTCHA_HMAC_KEY` de okunur; sağlayıcı için `CAPTCHA_PROVIDER` okunmaz), demo Vercel projesinde `NEXT_PUBLIC_CAPTCHA_PROVIDER=altcha`. Test sitesinin `CAPTCHA_PROVIDER=altcha`'ya geçmesi demoyu Turnstile'da bırakır; demo kilit denetimi de yalnızca `DEMO_CAPTCHA_PROVIDER`'a bakar.
- Kullanılmış çözümler `private.captcha_spent` tablosunda tutulur; aynı çözüm hangi Edge örneğine giderse gitsin bir kez geçer.
- Başlatma sayfası soruyu Next sunucusu üzerinden `{action: "challenge"}` ile alır, tarayıcı Web Crypto ile çözer, cevap gizli `altcha` alanında `captcha_token` olarak gider. Cloudflare'e ya da başka bir üçüncü tarafa istek gitmez; aynı cevap ikinci kez kabul edilmez; kayıt formunun sorusu demoda geçmez (amaç imzanın kapsamında).
- Anahtar yoksa ya da sağlayıcı bilinmiyorsa başlatma kapalıdır (`demo_closed`). Demo kilit denetimi (`scripts/demo-lock-check.sh`) `altcha` seçiliyken Turnstile secret'ı yerine bu anahtarı ister.
- **Geçişten önce** gizlilik metninin demo bölümü (§5), çerez tablosu ve başlatma sayfasının kısa metnindeki Turnstile/Cloudflare cümleleri değişir; metin sürümü ve kayıt migration'ı birlikte gelir (önerilen metin deployment.md'de).
- Yerel yığında sağlayıcı `altcha`'dır (`supabase/config.toml`); `dev` kipinde gönderilen jeton denetlenir, jetonsuz başlatma geçer.

**GoTrue denetim kayıtları:** `cleanup` silinen hesapların denetim satırlarını hemen siler (en iyi çaba); geri kalanı `pg_cron` işi `auth-audit-log-purge` en fazla 30 günde temizler. `deploy-db-demo`, demoyu barındıran projede iş yoksa ya da 31 günden eski satır kalmışsa başarısız olur ([deployment.md](deployment.md) › Kısa saklama denetimleri; H27, T09).

**Ziyaretçi e-posta alan adı:**
- Varsayılan `demo.orchados.invalid`'dir. Bu alan adı RFC 2606 ile ayrılmıştır ve teslim edilemez.
- Barındırılan GoTrue ayrılmış alan adlarını reddedebilir; yerel yığın kabul etse bile. Bu yüzden alan adı `private.demo_org.visitor_email_domain`'da tutulur ve bayrak açılmadan önce barındırılan projede bir duman adımıyla denenir (§15).
- Reddedilirse şirketin sahip olduğu ve null MX kaydı (RFC 7505) olan bir alt alan adı yazılır, ör. `ziyaretci.<alan adı>`. O adrese posta hiçbir zaman teslim edilemez.

**Diğer kurallar:**
- Hiçbir log satırı IP, e-posta ya da token içermez.
- `supabase/config.toml` dosyasına `[functions.demo-start] verify_jwt = false` eklenir; yerel `[edge_runtime.secrets]`'e de `ORCHADOS_DEMO_MODE = "dev"`.
- `[auth]` ayarları **değişmez**: `enable_signup = false` ve `enable_anonymous_sign_ins = false` kalır.

**Vitrin kuralları** ([hukuk/kararlar.md](hukuk/kararlar.md) H28; gerçek bir vitrin bahçesine geçişte, §10.5): Kişi görünen kareler vitrine konmaz; kaçınılmazsa yüz, plaka ve tanınmaya yetecek ayrıntı bulanıklaştırılır. Komşu parsel bilgileri gösterilmez. İzin metni: [hukuk/demo-vitrin-izni.md](hukuk/demo-vitrin-izni.md).

## 8. Demo verisi (B)

### 8.1 Sabit kimlikler (akışlar arası sözleşme)

| Ne | Kimlik | Ad / e-posta |
| --- | --- | --- |
| Demo org'u | `de000000-0000-4000-8000-000000000001` | "orchadOS Demo (örnek veri)" |
| Parsel A | `de100000-0000-4000-8000-000000000001` | "Örnek Bahçe – Kuzey" |
| Parsel B | `de100000-0000-4000-8000-000000000002` | "Örnek Bahçe – Dere" |
| Sahip kişisi | `de900000-0000-4000-8000-000000000001` | `ornek-sahip@demo.orchados.invalid` |
| Hissedar kişisi | `…000000000002` | `ornek-hissedar@…`, profil adı "Örnek Hissedar", telefon yok |
| Uzman kişisi | `…000000000003` | `ornek-uzman@…` |
| Saha kişisi | `…000000000004` | `ornek-saha@…` |
| Operasyon (yükleyici) kişisi | `…000000000005` | `ornek-operasyon@…` |
| A envanter 2025-06-10 / A tarama 2025-07-15 / A tarama 2026-07-14 | `de200000-0000-4000-8000-00000000000{1,2,3}` | |
| B envanter 2026-06-09 / B tarama 2026-07-16 | `de200000-0000-4000-8000-00000000000{4,5}` | |

- **Kişiler (persona):**
    - `auth.users` ve `auth.identities` satırlarıdır; seed.sql'deki kalıp izlenir.
    - GoTrue'nun bütün metin token sütunları `''` olur: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`. Bunlardan biri NULL kalırsa Admin `listUsers` bozulur. Kayıt temizliği ve testler bu çağrıyı kullanır.
    - `encrypted_password = ''` (null değil), `phone` null, `email_confirmed_at` dolu.
    - `raw_app_meta_data` içinde `{"provider":"email","providers":["email"],"demo_persona":true}` bulunur. `demo: true` **taşımazlar**; o bayrak ziyaretçilerindir.
    - `banned_until = '2999-01-01 00:00:00+00'`. Değer sonludur: Postgres'in `infinity` değeri GoTrue'nun Go zaman tipine okunamaz.
    - Hiçbiri giriş yapamaz. Tek istisna, yükleme sırasında operasyon kişisidir (§10.2). Bir çalıştırma yarıda ölürse housekeeping bir saat sonra yasağı ve boş parolayı geri koyar.
    - Yalnızca hissedar kişisinin bir `owner_profile` satırı vardır; bu satır hissedarlar kartında ad göstermek içindir.
- **Öteki satırlar:** Kimlikleri `uuid5(de0f0000-0000-5000-8000-000000000000, "v<sürüm>:<tür>:<anahtar>")` ile türetilir.
- **Tur:** Yükleyici `private.demo_org.tour` alanına şunları yazar:
    - A parseli
    - öne çıkan ağaç
    - A'nın 2026 taraması (`session_id`)
    - A'nın 2025 taraması (`previous_session_id`)
    - A'nın envanter oturumu

### 8.2 İçerik (sürüm 1)

| | A "Örnek Bahçe – Kuzey" | B "Örnek Bahçe – Dere" |
| --- | --- | --- |
| Yerler | 6 sıra × 12 = 72 yer, sıra arası 7 m, ağaç arası 6 m (~3 dönüm) | 4 × 8 = 32 yer (~1,3 dönüm) |
| Ağaç nitelikleri | Her aktif ağaçta cinsiyet (her 8–10 dişiye 1 erkek, A'da ~7 erkek), aşı durumu (birkaç aşısız), yaş sınıfı (çoğu yetişkin, birkaç genç, 1 yeni dikim) ve çeşit | Aynı kurallar |
| Sınır | Saha yürüyüşünden, sahip kişisi onaylamış | Aynı |
| Envanter | 2025-06-10, onaylı. Doğrulama kalemleri, gövde etiketleri, ~16 önizleme panorama, kapıyı geçen kapsama raporu, varlık ölçümleri. Envanter raporunda panorama güven satırı görünür | 2026-06-09, onaylı, ~8 önizleme panorama, kapsama raporu |
| Periyodik tarama | 2025-07-15 ve 2026-07-14 (yaz), ikisi de yayımlanmış. Bir yıl arayla ve aynı mevsimde; karne puanı "aynı mevsim" karşılaştırmasını, meyve yükü geçen yılla kıyası gösterir | 2026-07-16, yayımlanmış |
| Panorama | Her taramada ~40 nokta: 4 koridor, 8 m'de bir. 2026'da tam (4K) ve önizleme, 2025'te yalnızca önizleme. Noktalar iki yılda neredeyse aynı yerdedir, böylece zaman yolculuğu çalışır | ~16 nokta, önizleme |
| Ölçümler | Her taramada aktif ağaç başına bir ölçüm: yazda geçerli ve portalın okuduğu her ağaç kodu için (§8.3). Meyve yükü ortalaması 2025'te ~2,3, 2026'da ~1,4 (periyodisite; karnede "düşük") | Aynı, tek tarama |
| Ağaç kesiti | Her taramada aktif ağaç başına iki yön | Ağaç başına bir ya da iki |
| Yakın plan | ~10 ağaçta 2–3 fotoğraf (bulgusu olan ağaçlar) | ~3 ağaç |
| Son ziyaretin sınıfları | Yaklaşık: 52 sağlıklı, 9 dikkat, 5 sorunlu, 1 kuru, 2 boş yer, 1 yeni dikim | Çoğu sağlıklı, 2 dikkat, 1 sorunlu |
| Bulgular | 2026'da ~10, 2025'te ~5 (türler aşağıda) | ~3 |
| Uzman notları | Her bulguda uzman açıklaması ve önerisi (`finding.description`, `finding.recommendation`), parsel düzeyindekiler dahil. Soru dizilerinde uzman cevapları | Bulgularda açıklama ve öneri |
| Sorular | 2 dizi: biri ağaçta, biri parsel düzeyindeki bir bulguda. Sahip ve hissedar sorar, uzman cevaplar | Yok |
| Hissedarlar | "Örnek Hissedar" (viewer). Bekleyen davet yoktur: `viewer_invitation.phone` zorunludur ve E.164 biçimindedir, demo verisinde ise telefon bulunmaz | Yok |

**Neden yaz ziyareti:**
- Parsel karnesinin zararlı ve meyve yükü satırları yalnızca ilkbahar ve yaz metriklerinden gelir: `pest_sign_*` ilkbahar ve yaz, `fruit_load_scale` yaz.
- Budama kış metriğidir, hasat tamamlama hasat metriğidir.
- Ekim ziyareti (hasat) zararlı ve meyve yükü satırlarını boş bırakırdı.
- Yaz ziyaretinde budama ve hasat satırları gerçek bir sahipte de boştur; bakım satırını dip sürgünü doldurur.
- Portalın oturum içinde gösterdiği ziyaret notları (`session.notes`, `assessment.notes`) sahibe hiç görünmez. Bu yüzden ziyaret başına bir "uzman özeti" eklenmez.

A'nın 2026 bulgu türleri: kuruyan dal, gövde yarası ve zamk akıntısı, yaprak sararması, psil belirtisi, eksik ağaç. Parsel düzeyinde sulama ve yabancı ot bulguları da vardır.

**Öne çıkan ağaç:** A parselinde `S3-6`. 2025'te sağlıklı, 2026'da sorunlu. Kuruyan dal bulgusu, iki yakın plan fotoğrafı, uzman açıklaması ve bir soru dizisi vardır.

### 8.3 Kurallar

- **Şema kuralları:** Satırlar var olan şemaya ve kurallara uyar: yayın kuralı, ekleme-yalnız tablolar, `docs/arayuzler.md` "Asset `pose` alanı".
- **Metrik kodları:**
    - Yükleyici listeyi `metric_definition`'dan okur. Her taramada her aktif ağaç için, `valid_seasons` içinde `summer` olan ve portalın (`dimensions.ts`, `metrics.ts`, `score.ts`) okuduğu her ağaç kodundan bir ölçüm yazar.
    - Bugünkü kodlar: `dead_branch_scale`, `trunk_base_scale`, `crown_density_scale`, `dieback_pattern`, `dried_leaves_attached`, `basal_sprout_level`, `pest_sign_severity`, `fruit_load_scale`. `pest_sign_type` yalnızca belirti olan ağaçlarda yazılır.
    - Sezon dışı kod yazılmaz.
- **Sürüm bilgisi:** Ölçümler ve ürünler, onları üreten yöntemin sürümünü taşır (`orchados-demo/1`, metodoloji sürümü).
- **Ham kayıtlar:** Ham kayıt satırlarının (`capture`: video, GNSS) adresi `station://orchados-demo/synthetic/...` biçimindedir. Bu adres tarayıcıya hiç sunulmaz.
- **Kişisel veri:** Kişi adı yalnızca "Örnek …" biçimindedir. Telefon yoktur. E-postalar yalnızca `.invalid` alan adındadır. `private.parcel_detail` (ada/parsel) boş kalır.
- **Konum:** Konumlar temsilîdir. Gaziantep'te kırsal bir nokta seçilir ve bant "konum temsilîdir" der.
- **Ödeme ayarı:** Demo org'unun `org_billing_setting` satırı olmaz.
- **Ekleme sırası:**
    1. kişiler, org, üyelikler
    2. düzenek, sensör, kalibrasyon
    3. parseller, sınır, yerler, ağaçlar (nitelikleriyle), bölgeler
    4. oturumlar, doğrudan yayımlanmış ya da onaylı olarak (durum güncellemesi yok)
    5. envanter zinciri, kayıtlar, asset'ler, kaynak bağları
    6. ölçümler, değerlendirmeler, bulgular ve kanıt bağları
    7. hissedar profili, `parcel_access`
    8. en son sorular ve cevaplar
    9. kayıt satırı (`loaded_at` null)

  Bu sıra hiçbir bildirim oluşturmaz. Doğrulama, `public.notification`'da demo org'u için 0 satır bekler.
- **Satır kurucuları:** Asset, capture, asset_source, kapsama ve varlık satırları `orchados_pipeline.upload`'daki kurucularla üretilir: `panorama_pose`, `crop_pose`, `_asset_row`, `presence_payload`, `coverage_payload`. Tercihen SQL üreten bir `Catalog` uygulamasıyla `upload_run` olduğu gibi kullanılır. Satırlar elle yazılmaz.
- **Çakışma:**
    - Her ekleme açık hedefli `on conflict (id) do nothing` kullanır. Bir içerik hash çakışması böylece sessizce yutulmaz, hata verir.
    - Her görüntünün damgasında asset anahtarı vardır. Bu yüzden iki dosya, ör. iki boş yer kesiti, aynı bayt olamaz.
- **`scans.sql`:** `supabase/demo/scans.sql` (seed org'u, yerel geliştirme) olduğu gibi kalır; demo turuyla ilgisi yoktur.

## 9. Sentetik medya

Üretici `services/pipeline` içindeki `orchados_pipeline.demo` paketidir: numpy ve OpenCV, yeni bağımlılık yok. Var olan `synth` 960 piksellik bir çizim sahnesi üretir; gezi için yetmez. Bu yüzden yeni bir eşdikdörtgen çizici yazılır. Kesitler, işleme hattının gnomonik projeksiyonuyla bu görüntülerden kesilir.

- **Kural:**
    - Panorama kuralı işleme hattıyla aynıdır: orta sütun `heading_deg` yönüne bakar, azimut sağa doğru artar, üst satır zenit, alt satır nadirdir.
    - Kamera 2,0 m yüksekliktedir ve oturumun tarama kurulumuna `camera_height_m = 2.0` yazılır.
    - Portalın işaretçi hesabı 1,8 m varsayar (`CAMERA_HEIGHT_M`). Ağaç işaretçileri bu yüzden 2–3° yüksekte durur. Bu, işleme hattıyla tutarlıdır ve kabul edilir.
- **Çözünürlük ve hız:**
    - İç çizim profilin tam boyutundadır: test 1024×512, full 3840×1920. Önizlemeler ondan küçültülür, kesitler ondan kesilir.
    - Gökyüzü ve zemin numpy ile vektörel çizilir.
    - Ağaçlar nesne başına rasterleştirilir: her elipsoidin ve gövdenin sınır kutusu eşdikdörtgen uzaya izdüşürülür ve z-buffer yalnızca o piksellerde güncellenir. Bütün nesneler üzerinde piksel başına döngü yoktur.
    - Hedef süreler: test profili CI'da 90 saniyenin altında, full profili 10 dakikanın altında.
- **Gökyüzü:** Ufuktan zenite renk geçişi. Güneş diski ve haresi, çekim tarihi ve saatine göre. Tohumlu fBm gürültüsüyle bulutlar.
- **Ufuk:** Gürültülü tepe silueti ve uzaklıkla artan pus.
- **Zemin:**
    - kırmızımsı kahve toprak dokusu
    - sıralara paralel izler
    - kuru ot lekeleri
    - koridorlarda teker izi
    - sıra boyunca damla sulama borusu
    - güneşe göre düşen taç gölgeleri
- **Ağaçlar:**
    - Gövde: dokulu ve hafif eğik bir silindir.
    - Taç: 6–12 küçük elipsoit kümesi; Lambert gölgeleme ve z-buffer ile çizilir.
    - Duruma göre görünüm:
        - sağlıklı: koyu yeşil, yaz yaprağı, meyve salkımları
        - dikkat: sarımsı
        - sorunlu: seyrek, kahve lekeli
        - kuru: çıplak dallar
        - yeni dikim: küçük taç ve herek
        - boş yer: herek ya da hiçbir şey
    - Bir ağacın 2025 ve 2026 görünümü o yılki durumuna göre değişir.
- **Damga:**
    - Nadirde, düzeneğin durduğu yerde bir disk ve "orchadOS SENTETIK ORNEK" yazısı. ASCII'dir, çünkü `cv2.putText` Türkçe karakter çizemez.
    - Kesitlerde ve fotoğraflarda köşede küçük bir damga ve asset anahtarının kısa hali.
- **Yakın plan fotoğraflar:** Ayrı makro sahneler: yaprakçıklar, gövde ve zamk damlası, kuru sürgün, boş meyve salkımı, psil lekesi. Her biri bir bulgu türüne bağlıdır ve yakın plan protokolünün `capture` alanlarını taşır.
- **Belirlenimcilik:**
    - Bütün rastgelelik `(sürüm, anahtar)` ile tohumlanır.
    - Aynı makinede ve aynı kilit dosyasıyla aynı bayt üretilir.
    - Farklı işlemcilerde kayan nokta farkları baytları değiştirebilir. Barındırılan projelerde bu yüzden baytlara güvenilmez (§10.2).

| Profil | Tam panorama | Önizleme | Kesit | Yakın plan | Toplam |
| --- | --- | --- | --- | --- | --- |
| `full` (barındırılan projeler, yerel varsayılan) | 3840×1920 WebP, ~40 adet (A 2026) | 1920×960 WebP, ~120 adet (A taramaları ~80, A envanteri 16, B envanteri 8, B taraması 16) | 1024² JPEG | 1600×1200 JPEG | ≤ 150 MB (hedef ~115 MB) |
| `test` (CI, e2e) | 1024×512 | 512×256 | 256² | 400×300 | ≤ 10 MB |

Boyutlar işleme hattının yazdığı 4K ve 2K panoramalarla aynıdır. `full` ve `test` farklı hash'ler üretir; bir veritabanına yalnızca biri yüklenebilir (§10.2).

## 10. Yükleyici ve iş akışı (B)

### 10.1 Komutlar

```
uv run orchados-pipeline demo build   [--profile full|test] [--out DIR] [--force]
uv run orchados-pipeline demo load    --target local|remote [--profile full|test] [--build DIR]
                                      [--dry-run] [--reset-local] [--verify] [--demo-only] [--enable]
uv run orchados-pipeline demo enable  --target local|remote
uv run orchados-pipeline demo disable --target local|remote
uv run orchados-pipeline demo verify  --target local|remote
pnpm db:demo-tour [ek argümanlar]   # kök: demo load --target local --verify --enable
```

- **Önbellek:** `services/pipeline/.demo-build/v<sürüm>-<profil>/`, içinde `manifest.json` ve `files/<sha256>`. Git'e girmez.
- **Bağlantı:** Her iki hedefte de SQL psql ile çalışır (`-v ON_ERROR_STOP=1 -1`); kod yolu aynıdır.
    - `local`: `docker exec -i supabase_db_orchados psql -U postgres`. Adres ve anon anahtar `supabase status`'tan gelir.
    - `remote`: `DEMO_DB_URL` ve `PGPASSWORD` kullanılır. İş akışı adresi `supabase link`'ten sonra `supabase/.temp/pooler-url` dosyasından, oturum modunda (5432) kurar. GitHub makinelerinde IPv6 olmadığı için doğrudan `db.<ref>.supabase.co` kullanılmaz.
    - Medya her iki hedefte `SUPABASE_URL` ve `SUPABASE_ANON_KEY` ile yüklenir.
- **`--reset-local`:** Yüklemeden önce `testing.purge_org` ile demo org'unu temizler. Yalnızca yerelde çalışır; `--dry-run` ile birlikte reddedilir (kuru çalıştırma hiçbir şey yazmaz).
- **`--demo-only`:** Hedefte demo org'u dışında hiçbir org yoksa devam eder; varsa hiçbir şey yazmadan durur. Demo projesi için iş akışı bunu her zaman verir; yanlış secret'la pilota yazmayı engeller.
- **Açma ve kapama:**
    - `load --enable`: doğrulama geçerse demoyu açar.
    - `enable`: hiçbir şey derlemez. Yalnızca kayıt satırında `loaded_at` doluysa ve doğrulama geçiyorsa `enabled = true` yazar ve öteki demo org'larını kapatır.
    - `disable`: yalnızca kapatır.

### 10.2 Adımlar

1. **Derleme:** Önbellekte yoksa derlenir. Manifestin kanonik JSON'unun SHA-256'sı `dataset_sha256` olur.
    - `--build` ile verilen klasör (ör. indirilmiş artefakt) önbellekteki gibi denetlenir: sürüm bilinen bir tam sayı, profil istenen profil, `generator_hash` bu kodunki (bütün `orchados_pipeline` kaynağı ve `PipelineParams` varsayılanları; yalnızca `demo/` değil, çünkü derleme çekirdek hattı kullanır ve yükleyici çıktıyı `upload` ile okur), `dataset_sha256` manifestin kendisiyle tutarlı, her dosya var ve baytları adındaki hash'e eşit. Biri tutmazsa hiçbir şey yazılmadan durulur.
    - Kayıt satırına manifestteki sürüm değil, kodun `DATASET_VERSION`'ı yazılır.
2. **Ön kontrol (sürüme göre):**
    - Sürüm v kayıtlı, `loaded_at` dolu ve doğrulama geçiyorsa: "zaten yüklü" yazılır ve çıkış kodu 0'dır. Baytlar karşılaştırılmaz.
    - Sürüm v kayıtlı ama `loaded_at` boşsa (yarım yükleme):
        - Manifest hash'i kayıttakiyle aynıysa yükleme kaldığı yerden devam eder.
        - Farklıysa durulur. Mesaj şunu söyler: önceki çalıştırmanın derleme artefaktını kullan (`reuse_build_run_id`) ya da sürümü artır.
    - Yerelde farklı profil ya da bayt bulunursa `pnpm db:reset` ya da `--reset-local` önerilir. Bu denetim "zaten yüklü" kısayolundan önce yapılır.
    - Operasyon kişisinin kilidi her çalıştırmanın başında yeniden konur (kuru çalıştırma hariç); `verify` ve `enable` de önce kilitler. Medya yüklendikten sonra öldürülen bir çalıştırmanın açık bıraktığı kişi böylece kendiliğinden kapanır.
    - Kayıt tablosu yoksa (A birleşmeden önce): yerelde uyarı verilir ve kayıt adımı atlanır; `remote` reddedilir.
3. **Tek SQL işlemi (postgres):**
    - Satırlar §8.3'teki sırayla eklenir. Kayıt satırı aynı işlemde `loaded_at = null` olarak yazılır.
    - Tetikleyicisi kimliğe bakan satırlar (ör. soru) yazarın claim'leriyle eklenir: `set_config('request.jwt.claims', …, true)` ve `set local role authenticated`.
    - Yayın tarihleri ziyaret tarihlerine göre açıkça verilir.
4. **Medya:**
    1. Yüklenecek her dosyanın baytları adındaki hash'le, nesne yolu `org/<uuid>/parcel/<uuid>/<sha256>` biçimiyle yeniden denetlenir.
    2. Operasyon kişisine o çalıştırmaya özel rastgele bir parola verilir ve yasağı kalkar. `updated_at = now()` yazılır; A'nın bakım görevi son bir saatte değişen kişiyi yeniden yasaklamaz.
    3. Kişi GoTrue parola girişiyle oturum açar.
    4. Eksik nesneler iki kovaya yüklenir:
        - `media` kovasına `org/<org>/parcel/<parcel>/<sha256>` yoluyla
        - aynı yolla `demo-media` kovasına, `cache-control: max-age=31536000` ile

       Zaten varsa geçilir.
    5. Örnek dosyalar geri okunup hash'leri doğrulanır.
    6. `finally` bloğunda parola boşaltılır ve yasak `2999-01-01` olarak geri konur.
5. **Kayıt:** `loaded_at`, `tour`, `dataset_sha256` yazılır. `demo_parcel` satırları: A=1, B=2, ikisi de etkin.
6. **Doğrulama (`--verify`):**
    - Sahip kişisinin claim'leriyle, RLS altında şu sayılar kontrol edilir:
        - yayımlanmış ziyaretler
        - panorama çiftleri
        - aktif ağaç başına kesit
        - öne çıkan ağacın fotoğrafları
        - bulgular
        - cevaplı sorular
        - panoramalı ve onaylı envanter
        - A'nın son taramasında yapı, bakım, zararlı ve meyve yükü kodlarının ağaç başına ölçümleri
    - Postgres olarak şunlar denetlenir:
        - Her `storage://` adresinin iki kovada da nesnesi var.
        - Kişilerin parolası boş (`coalesce(encrypted_password,'') = ''`), yasakları ileri tarihte ve token sütunları dolu (NULL değil).
        - `org_billing_setting` yok.
        - `public.notification`'da demo org'u için 0 satır var.

### 10.3 İdempotentlik ve sürümler

- **Aynı build:** İkinci çalıştırma hiçbir satır eklemez ve hiçbir dosya yüklemez.
- **Yeniden derleme:** Başka bir makinede derlenen kopya farklı bayt üretebilir. Bu yüzden barındırılan projede ön kontrol sürüme ve doğrulamaya bakar, baytlara bakmaz. Yarım kalan bir yükleme yalnızca aynı derlemeyle tamamlanır. Derleme bu yüzden iş akışı artefaktı olarak saklanır.
- **Yeni sürüm:** Sürüm 2 yeni satırlar ekler, ör. bir 2027 ziyareti. Sürüm 1'e dokunmaz, çünkü veri ekleme-yalnızdır. Yükleyici hedef sürüme kadar bütün sürümleri sırayla uygular. Bu, sürüme göre veri kümesi ve derleme gerektirir; sürüm 2 gelene kadar yükleyici yalnızca `DATASET_VERSION`'ı uygular ve `VERSIONS == (DATASET_VERSION,)` olduğunu iddia eder.

### 10.4 Barındırılan projeler

`.github/workflows/demo-data.yml` yalnızca `workflow_dispatch` ile tetiklenir. Girdileri:
- `project`: `test` ya da `demo`. Pilot seçeneği yoktur.
- `action`: `load`, `enable` ya da `disable`; varsayılan `load`.
- `dry_run`: varsayılan `false`.
- `reuse_build_run_id`: isteğe bağlı; önceki bir çalıştırmanın derleme artefaktı. Yalnızca bu iş akışının, bu repoda `main` üzerinde `workflow_dispatch` ile başlatılmış bir çalıştırması kabul edilir; başka bir çalıştırmanın (dal, PR) artefaktı reddedilir.

Koruma:
- İş yalnızca `main`'den çalışır ve projenin adını taşıyan GitHub Environment'ında koşar (`test` ya da `demo`; `DEMO_HOST=test` iken `project=demo` da `test`, aşağıda).
- Tek model: bir projenin veritabanı secret'larına dokunan **her** iş o projenin ortamında koşar: `deploy-db` ve `demo-data project=test` → `test`, `deploy-db-demo` ve `demo-data project=demo` → `demo`, `deploy-db-pilot` → `pilot`. `test` ve `demo` ortamlarında dağıtım dalı kuralı yalnızca `main`, `pilot`'ta yalnızca `release`'tir; `demo` ve `pilot`'ta zorunlu onaylayıcı vardır. Secret'lar bu ortamlara taşınır ve repo düzeyindeki kopyaları silinir; repo düzeyinde yalnızca herkese açık adres ve anon anahtarları kalır (`keepalive`, `ci-field`). Ayrıntı ve geçiş adımları: deployment.md › GitHub secret'ları ve ortamları.
- Eksik secret işi başarısız kılar, atlanıp yeşil bitmez. Tek istisna kurulmadan önceki test projesidir ve açıkça seçilir (repo değişkeni `SUPABASE_TEST_PENDING=1`; `demo-data` için bile geçerli değildir).
- Secret'lar yalnızca onlara ihtiyaç duyan adımlara verilir (denetim, `supabase link`, yükleme ve komut adımları); kurulum adımları ve üçüncü taraf eylemler görmez.

Adımlar:
1. Secret'ların varlığı denetlenir; eksikse iş başarısız olur.
2. `supabase link` yapılır ve havuz adresi kurulur.
3. `load` için:
    1. `uv sync --locked`
    2. derleme ya da artefaktın indirilmesi
    3. boyut sınırı (150 MB)
    4. artefaktın yüklenmesi (30 gün saklanır)
    5. `demo load --target remote --verify`; `demo` projesinde ayrıca `--demo-only`
4. `enable` ve `disable` için yalnızca ilgili komut çalışır; derleme yapılmaz.
5. Özet `$GITHUB_STEP_SUMMARY`'ye yazılır: satır sayıları, dosyalar, MB.

Secret'lar:
- `test` ortamında: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- `demo` ortamında: `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`. Erişim token'ı her ortama ayrı girilir (aynı değer).

Eşzamanlılık grubu, gerçekten yazılan veritabanına göre `demo-data-test` ya da `demo-data-demo`'dur.

**Ortak barındırma (§15.1):** Repo değişkeni `DEMO_HOST=test` iken `project=demo` test projesine çözülür: iş `test` ortamında, test projesinin secret'larıyla koşar ve `--demo-only` verilmez (test sitesinin org'ları da oradadır). Değişken yoksa ya da başka bir değerdeyse eksik bir `DEMO_` secret'ı yine test projesine düşmez, iş başarısız olur.

### 10.5 Gerçek vitrin bahçesine geçiş (ileride)

İP13 yalnızca şu altyapıyı kurar:
- `dataset_source = 'showcase'`
- parsel bazında `demo_parcel.active`
- yükleyicide kaynak bağdaştırıcısı

Gerçek bir bahçe demo parseli olarak doğrudan **kaydedilmez**. Kaydedilseydi ziyaretçi o org'un gerçek sorularını ve hissedar adlarını görürdü. Yapılacak iş:

1. **Yazılı izin:** Bahçe sahibinden görsel ve veri kullanımı için yazılı izin alınır ([hukuk/demo-vitrin-izni.md](hukuk/demo-vitrin-izni.md); vitrin kuralları §7). İzin, görüntülerde tanınabilen çevreyi de açıkça kapsar: tepeler, binalar, komşu parseller. Konum kaydırılsa bile yer bu görüntülerden yeniden bulunabilir.
2. **Kopyalama:** Bir dışa aktarma komutu, yayımlanmış bir ziyaretin medyasını ve sonuçlarını yeni kimliklerle demo org'una kopyalar. Bu sırada:
    - kişiler, notlardaki adlar ve telefonlar çıkarılır
    - konum kaydırılır
    - EXIF/XMP meta verisi (GPS dahil) silinir
    - yüzler ve plakalar bulanıklaştırılır

   Sonuç yeni baytlardır, dolayısıyla yeni hash'lerdir. Bunlar köken bilgisiyle (asset_source) türetilmiş asset olarak kaydedilir.
3. **Yer:** Dışa aktarma ve vitrin derlemeleri repo dışındaki bir dizine yazılır, hiçbir zaman `services/pipeline` altına yazılmaz. Böylece `git add -f` ile gerçek görüntü işlenemez.
4. **Yükleme:** Kopya yeni bir veri sürümü olarak (`source = showcase`) yüklenir. Yeni parseller etkinleştirilir, sentetik parseller `active = false` yapılır. Eski satırlar silinmez.

## 11. Web (C)

### 11.1 Bayraklar, dağıtımlar, CTA

- **Bayraklar (`lib/flags.ts`):**
    - `demoEnabled` = `ORCHADOS_DEMO_ENABLED`. Bu dağıtım `/demo`'yu sunar: demo dağıtımı, yerel, CI ve kısa test duman testi.
    - `demoUrl` = `ORCHADOS_DEMO_URL`. Yoksa ve `demoEnabled` açıksa `/demo`. İkisi de yoksa null. CTA'lar yalnızca `demoUrl` varsa çizilir. Pilot sitesinde değer `https://demo.<alan adı>/demo` olur.
    - `mainSiteUrl` = `ORCHADOS_MAIN_SITE_URL`. Yalnızca demo dağıtımında tanımlıdır; tanımlıysa dağıtım bir **demo sunucusudur**.
- **Demo sunucusu (proxy):**
    - `/` adresi `/demo`'ya gider.
    - `/demo/**`, `/portal/**`, Next varlıkları, `robots.txt` ve auth geri dönüşleri dışındaki site sayfaları asıl sitedeki aynı yola yönlendirilir.
    - Oturumsuz `/portal` isteği `/demo`'ya gider.
    - "Gerçek hesap aç" `<asıl site>/kayit`'a, "Paketleri gör" `<asıl site>/paketler`'e gider.
    - Dağıtım indekslenmez.
- **Bayrak kapalıyken:**
    - `/demo` 404 döner
    - `startDemoAction` başlatmayı reddeder
    - açık demo oturumları `/demo/bitti` üzerinden kapanır
- **Herkese açık yol:** `lib/site/public-paths.ts` → `PUBLIC_PREFIXES` listesine `/demo` eklenir. Test: `/demo/bitti` true, `/demolar` false. Sitemap'e `/demo` yalnızca `demoEnabled` ve `indexable` açıkken girer.
- **CTA'lar:**
    - Landing `.ctaRow` (`landing-demo`): kayıt kapalıyken birincil, açıkken ikincil. Ayrıca "Portalda ne görürsünüz?" kutusunun altında ikinci bir link.
    - Site üst menüsü, oturum yokken (`header-demo`).
    - `/giris` (`login-demo`, yeni `components/site/demo-link.tsx`).
    - `nasil-calisir` sayfasının sonunda bir kutu.
- **Metinler:** `lib/i18n/messages/demo.ts` (`demoText`). Site metinlerine `site.ts` içinde `nav.demo`, `landing.ctaDemo`, `landing.demoFoot` ve `login.tryDemo` eklenir.

### 11.2 `/demo` sayfası ve başlatma

- **Sayfa:** `app/(site)/demo/page.tsx` şunları anlatır:
    - Ne göreceğiniz.
    - Veriler sentetiktir, konum temsilîdir.
    - Kişisel veri istenmez ve oturum çerezi kullanılır.
    - Kötüye kullanımı önlemek için IP'nin takma adlandırılmış özeti 48 saat tutulur.
    - Ham IP oturum ve altyapı loglarında kısa süre kalır.
    - Turnstile Cloudflare tarafından sağlanır.
    - Oturum 3 saat sürer.
    - Gizlilik metnine link verilir.
- **Başlatma:** Sayfada Turnstile (`components/site/turnstile.tsx`) ve "Demoyu başlat" (`demo-start`) bulunur.
- **Oturumu olan ziyaretçi:**
    - Gerçek bir hesapla girmiş kullanıcı otomatik çıkarılmaz; "Demo için önce çıkış yapın" notunu görür.
    - Demo kullanıcısı `/portal`'a yönlendirilir.
- **Sunucu eylemi:** `app/(site)/demo/actions.ts` → `startDemoAction(prev, formData)`.
    - Edge'e `client_ip` (`x-forwarded-for` / `x-real-ip`), `captcha_token` ve `SIGNUP_PROXY_SECRET` gönderir.
    - Durum tipi: `{status: "idle"} | {status: "ready", tokenHash, verificationType, next} | {status: "error", code}`.
    - IP okuma kodu `kayit/actions.ts`'deki `clientIp()` ile ortak bir yardımcıya taşınır.
- **İstemci:** `ready` durumunda yeni `lib/supabase/browser.ts` (`createBrowserClient`) ile `auth.verifyOtp({token_hash, type})` çağrılır, ardından `window.location.assign(next)`.
- **Çıkış:** `exitDemoAction(next)`. Yalnızca oturumun claim'lerinde `app_metadata.demo === true` varsa `demo_end()` ve `signOut()` çağrılır. Gerçek bir kullanıcının oturumuna dokunulmadan yönlendirilir.
- **`/demo/bitti` (route handler, GET):**
    - Yalnızca demo oturumunu kapatır ve `/demo?bitti=1` adresine yönlendirir.
    - Gerçek bir kullanıcı `/demo`'ya yönlendirilir; oturumu kapanmaz. Üçüncü taraf bir sayfadaki `<img>` ya da ön yükleme bu yüzden kimseyi çıkaramaz.
- **`SessionUser`:** `demo: boolean` alanı eklenir; değer `claims.app_metadata.demo === true`'dan gelir. Süre `demo_info()`'dan okunur.

### 11.3 Oturum kapısı ve kabuk

- **Kapı (`lib/auth/session.ts`):**
    - Claim'lerde `demo` true ise `requireUser` ve `requireSection`, rol kontrolünden **önce** bayrağa ve `getDemoInfo()`'ya bakar.
    - Bayrak kapalıysa, `demo_info()` null ise ya da süre dolmuşsa `redirect('/demo/bitti')` yapılır.
    - PDF rotaları aynı kapıyı kullanır ve 302 döner.
    - Sayfalar layout'tan bağımsız çizildiği için kapı her sayfada çalışır. Housekeeping erişimi sildikten ya da temizlik hesabı sildikten sonra da ziyaretçi 403 değil `/demo/bitti` görür.
- **`app/portal/layout.tsx`:** Yalnızca kabuğu seçer. `user.demo` ise `SectionShell` ve `PortalNav` yerine `components/demo/demo-shell.tsx` çizilir.
- **Kabuk:** Marka, "Bahçelerim (örnek)" ve bant bulunur. E-posta ve avatar gösterilmez.
- **Bant (`demo-banner`):**
    - Metin: "Örnek bahçe · veriler ve görüntüler sentetik, konum temsilî · oturum bitişi HH:MM". Saatten sonra ek yoktur: Türkçe yönelme eki saatin okunuşuna göre değişir (15:30'a, 18:00'e, 16:00'ya).
    - Düğmeler: "Turu başlat", "Gerçek hesap aç" (`demo-signup`), "Demodan çık" (`demo-exit`).
    - "Gerçek hesap aç" önce demodan çıkarır. Sonra demo sunucusunda asıl sitenin `/kayit`'ına, aksi halde kayıt açıksa `/kayit`'a, kapalıysa `/iletisim`'e gider.
    - Demo sunucusu asıl sitenin kaydının açık olup olmadığını bilmez; asıl sitede kayıt kapalıysa `/kayit` "Kayıt yakında" sayfasıdır ve iletişim, paketler, demoya dönüş ("Demoyu dene", `ORCHADOS_DEMO_URL`) ve giriş bağlantılarını gösterir. Uçtan uca test: `tests/e2e/site-demo-signup.spec.ts`.
    - Görünüm: `--color-info-soft`; sticky; z-index 55; 16 px kenar boşluğu; mobilde tek satır. Yazdırmada da görünür (`.noPrint` değil).
- **Landing:** `/` sayfasında demo dalı `defaultSection`'dan önce gelir. Demo kullanıcısı landing'i görür; üst menüde "Demoya dön" ve "Demodan çık" çıkar.
- **`/kayit` ve `/giris`:** Bu sayfalarda "Demodan çıkıp devam et" görünür. `/kayit`'taki oturum yönlendirmesi demo kullanıcısı için uygulanmaz.
- **Faturalama sayfaları:** `assertCustomer`, demo kullanıcısını `/portal`'a döndürür.

### 11.4 Rehberli tur

- **Dosyalar:** `components/demo/guided-tour.tsx` (istemci), adım tanımları `lib/demo/tour-steps.ts`, stiller `components/demo/demo.module.css`. Yeni bağımlılık yoktur.
- **Adım tanımı:** `{id, href(ctx), targets (data-testid), title, body}`. `ctx` = `demo_info().tour`.
- **Durum:** Turun adımı URL'de tutulur (`?tur=<id>`). "Kapatıldı" bilgisi `sessionStorage`'da, try/catch içinde tutulur. Sunucuda kalıcı durum yoktur.
- **Mekanik:**
    - Hedef `document.querySelector('[data-testid=…]')` ile bulunur, `scrollIntoView({block: "center"})` ile görünüme alınır ve dış çizgiyle vurgulanır.
    - Kart modal değildir. Masaüstünde hedefin yanında, mobilde alt sayfa olarak açılır.
    - Kontroller "Geri / İleri / Turu kapat"; sayaç "3 / 10".
    - Klavye: Esc kapatır, ok tuşları adım değiştirir. `aria-live="polite"`.
    - Hedef bulunamazsa adım atlanır. Panorama tam ekrandayken kart gizlenir.

| Sıra | `id` | Sayfa | Hedef |
| --- | --- | --- | --- |
| 1 | `bahceler` | `/portal` | `parcel-list` |
| 2 | `gezi` | `/portal/parsel/{A}/gezi` | `tour-viewer`, `tour-visit` (oklar, ağaç işaretçisi, zaman yolculuğu) |
| 3 | `harita` | `/portal/parsel/{A}?katman=isi` | `parcel-map`, `map-controls` |
| 4 | `karne` | `/portal/parsel/{A}` | `health-score`, `dimensions` |
| 5 | `bulgular` | `/portal/parsel/{A}` | `findings` (uzman açıklaması ve önerisi) |
| 6 | `agac` | `/portal/parsel/{A}/agac/{tree}` | `tree-card`, `photo-evidence`, `hash-check` |
| 7 | `ziyaret` | `/portal/parsel/{A}?ziyaret={previous_session}` | `visit-select`, `parcel-map` (yalnızca harita seçilen ziyareti izler; karne son ziyareti gösterir) |
| 8 | `envanter` | `/portal/parsel/{A}/envanter` | `inventory-report` |
| 9 | `pdf` | `/portal/parsel/{A}` | `report-pdf` |
| 10 | `son` | Herhangi bir sayfa | Kapanış kartı: "Gerçek hesap aç" (bantla aynı kural: hedef `/iletisim` ise "Bize ulaşın"), "Paketleri gör" |

Yeni test kimlikleri:
- `demo-banner`, `demo-start`, `demo-exit`, `demo-signup`, `demo-notice`
- `landing-demo`, `header-demo`, `login-demo`
- `guided-tour`, `tour-next`, `tour-prev`, `tour-close`

Görüntü durumu için `tour-viewer` öğesinde zaten bulunan nitelikler kullanılır: `data-loaded="true|false"` ve `data-image=<preview|full|placeholder>`. Yeni nitelik eklenmez.

### 11.5 Yazma arayüzleri

- **Sunucu eylemleri:** Sahip eylemleri (`parsel/[parcelId]/actions.ts`) ve `billing-actions.ts` önce `user.demo`'ya bakar ve "Demoda kapalı" sonucunu döner. Veritabanından gelen `demo_read_only` de aynı mesaja çevrilir.
- **Bileşenler:** `question-threads`, `viewers-card` ve `boundary-card` bir `demo` prop'u alır. Bu prop varken formların yerine `demo-notice` çizilir; okuma görünümü aynı kalır.

### 11.6 PDF ve medya

- **Filigran:**
    - Ayrı bir bileşendir (`SampleWatermark`). `ReportDocument` ve `InventoryDocument` onu yalnızca `{demo: true}` ile içerir.
    - Her sayfada çapraz "ÖRNEK RAPOR – gerçek bir bahçeye ait değildir" yazar; altbilgide "Sentetik demo verisi".
- **Algılanabilirlik:**
    - PDF metni sıkıştırılmış akışta glif kimlikleriyle durur; bayt aramasıyla bulunamaz.
    - Bu yüzden belge bilgisinin `subject` ve `keywords` alanlarına ASCII "orchadOS ornek rapor (sentetik demo verisi)" yazılır. Info sözlüğü sıkıştırılmaz.
    - Yanıt `X-Orchados-Sample: 1` başlığını taşır.
- **Önbellek:**
    - Next veri önbelleği (`unstable_cache`) kullanılır. Anahtar: tür, parsel, son yayımlanmış oturum, veri sürümü. Örnekler arasında paylaşılır.
    - Önbelleğe yalnızca rapor kullanıcının RLS'iyle okunduktan sonra ve parsel `demo_info().parcels` içindeyse bakılır ve yazılır.
    - Her istek `demo_hit('pdf')` sayacını artırır; sınırda bağlantının sayfasına `?hata=demo_pdf_limit` ile döner (§5.3).
    - `Cache-Control: private, max-age=600`.
    - Gerçek kullanıcının PDF'leri değişmez (`no-store`, önbellek yok).
- **Medya:**
    - Demo kullanıcısı için imzalayıcı, demo org'unun `storage://media/org/<demo org>/…` adreslerini `demo-media` kovasının herkese açık adresine çevirir; imza yoktur.
    - Baytlar aynı olduğu için hash doğrulaması geçer. Öteki adresler her zamanki gibi kullanıcı kapsamıyla imzalanır.
    - `signTourImagesAction` her çağrıda `demo_hit('sign')` sayacını artırır.

## 12. KVKK ve bütünlük

- **Ziyaretçiden veri:** Ziyaretçiden hiçbir kişisel veri istenmez: ad, telefon, e-posta yok. Hesap e-postası rastgele ve teslim edilemez bir adrestir.
- **Teknik veri:**
    - **IP özeti:** IPv6'da /64 önekinin HMAC özeti; `private.demo_attempt`'te 48 saat. Bu **takma adlandırılmış** bir kişisel veridir, geri döndürülemez değildir: `SIGNUP_HASH_SECRET`'a sahip biri IPv4 uzayını tarayarak özeti geri bulabilir. Anahtar yalnızca Edge'dedir.
    - **Ham IP ve tarayıcı bilgisi:** Şu yerlerde bulunur:
        - GoTrue oturum satırı (`auth.sessions.ip`, `user_agent`): hesap silinene kadar
        - GoTrue denetim kayıtları (`auth.audit_log_entries`): silme en iyi çaba ile yapılır, değilse Supabase'in saklama süresi geçerlidir
        - Supabase, Vercel ve Edge altyapı logları: sağlayıcının, plana göre değişen saklama süresince (deployment.md güncel değeri yazar)
    - **Turnstile:** Cloudflare, ziyaretçinin tarayıcısından ve IP'sinden sinyal toplar; bu yurtdışına aktarımdır. Supabase (AB bölgesi) ve Vercel de yurtdışındadır.
    - Zorunlu oturum çerezleri.
    - `auth.users` satırı, süre sonunda silinir.
- **Demo verisinde gerçek kişi yok:**
    - Kişi adları kurgusaldır, telefon yoktur.
    - Ada/parsel bilgisi yoktur, konum temsilîdir.
    - Görüntüler sentetiktir ve damgalıdır.
    - Uzman adı hiçbir ekranda ya da PDF'te görünmez.
- **LLM:** LLM'e hiçbir şey gitmez.
- **Bütünlük:** Bağımsız bir denetim ürününde örnek bir rapor gerçek bir rapor gibi dolaşamamalıdır. Bunun için PDF filigranı, belge bilgisi, banttaki uyarı ve görüntü damgası vardır.
- **Gizlilik metni:** Gizlilik metnine bir demo paragrafı eklenir ve avukat onayından geçer. Avukata giden özet bu bölümdeki maddelerdir (§16).

## 13. Ortam değişkenleri

| Değişken | Yer | Not |
| --- | --- | --- |
| `ORCHADOS_DEMO_ENABLED` | Web (sunucu) | **Yeni.** Bu dağıtım `/demo`'yu sunar. Demo dağıtımı, yerel ve CI'da `1`; pilotta hiç |
| `ORCHADOS_DEMO_URL` | Web (site) | **Yeni.** CTA hedefi; pilot sitesinde `https://demo.<alan adı>/demo` |
| `ORCHADOS_MAIN_SITE_URL` | Web (demo dağıtımı) | **Yeni.** Asıl site; tanımlıysa dağıtım demo sunucusudur |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web | Var olan. Demo dağıtımında demo projesinin değerleri |
| `SIGNUP_PROXY_SECRET` | Web (sunucu) + Edge | Var olan. `demo-start` da istemci IP'sine bununla güvenir |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Web / Edge | Var olan. Demo projesinde canlı anahtar zorunludur |
| `SIGNUP_HASH_SECRET` | Edge | Var olan. IP özeti, `demo:` önekiyle |
| `DEMO_CAPTCHA_PROVIDER`, `ALTCHA_HMAC_KEY` (önce `DEMO_` adı) / `NEXT_PUBLIC_CAPTCHA_PROVIDER` | Edge / Web | **Yeni** (T12). Demo sağlayıcısı yalnızca `DEMO_CAPTCHA_PROVIDER`'dan okunur (`CAPTCHA_PROVIDER` kaydındır). Boş ya da `turnstile`: Turnstile (varsayılan). `altcha`: kendi robot doğrulamamız (§7); anahtar ≥ 32 karakter, yoksa başlatma kapalı. Gizlilik metni değişmeden barındırılan projede `altcha` seçilmez |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Web | Var olan. Boşsa üretim derlemesi harita karolarını kendi vekilimizden (`/harita/karo/…`) alır; demo alanında da çalışır (deployment.md › Harita altlığı) |
| `DEMO_TURNSTILE_SECRET_KEY`, `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET` | Edge (`DEMO_SIGNUP_PROXY_SECRET` ayrıca Web sunucusu) | **Yeni.** Ortak barındırma (§15.1). Tanımlıysa `demo-start` (ve web'de `/demo` başlatması) öneksiz adın yerine bunu kullanır; boşsa öneksiz ada düşer. Test sitesinin `TURNSTILE_SECRET_KEY`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET` değerleri böylece değişmez |
| `ORCHADOS_CRON_SECRET` | Edge + Vault `orchados_cron_secret` | Var olan. `cleanup` eylemi için |
| `ORCHADOS_DEMO_MODE` | Edge | **Yeni.** `dev` ya da `public`; tanımsızsa başlatma kapalıdır. Pilotta tanımlanmaz (`deploy-db-pilot` denetler) |
| `demo_cleanup_url` | Vault | **Yeni.** `https://<ref>.supabase.co/functions/v1/demo-start` |
| `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY` | GitHub | **Yeni.** `deploy-db-demo` ve `demo-data`; `DEMO_SUPABASE_DB_PASSWORD` ayrıca `provision-demo` (yeni projenin parolası) |
| `VERCEL_TOKEN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | GitHub | **Yeni.** `provision-demo`; Turnstile ikisi birlikte, yoksa demo kapalı kalır |
| `DEMO_HOST` | GitHub (repo değişkeni) | **Yeni.** `test`: demo test projesinde (§15.1); `deploy-db-demo`, `demo-data project=demo` ve `deploy-db`'nin demo kilitleri buna göre davranır. Tanımsız ya da başka bir değer: ayrı demo projesi |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | GitHub | Var olan. Test projesi |

Veritabanı ayarları ortam değişkeni değildir; `private.demo_org` satırındadır: `enabled`, süre, sınırlar, ziyaretçi alan adı. Yerel Edge secret'ları `config.toml` içindedir; `TURNSTILE_SECRET_KEY` yerelde tanımsız kalır, robot doğrulaması yerelde `altcha`'dır (§7).

## 14. Test stratejisi

- **pgTAP (A):**
    - `42_demo_access`:
        - fonksiyon yetkileri
        - `demo_admit`: sınırlar, kapalı durum, sayaç satırları (reddedilen istekler dakika başına tek satır)
        - `demo_start`: doğrulama (telefon, alan adı, parola ölçütleri dahil) ve idempotentlik
        - demo kullanıcısı yayımlanmış satırları ve medyayı okuyabilir, `in_review` ziyaretini göremez
        - öteki demo hesaplarının `parcel_access` satırları görünmez
        - `demo_info`, `demo_end`, `demo_hit` sınırları
        - `demo_expired_accounts` (yetim ölçütleri, `p_exclude`) ve `demo_undeletable_count`
        - bildirim kuyruğu boş kalır
        - `save_ai_assessment` reddi
        - `demo_billing_forbidden`
        - cron işlerinin kurulu olması
    - `43_demo_write_guard`:
        - Tablo tarafı: her tabloda `zz_demo_read_only` tetikleyicisi bulunur.
        - Fonksiyon tarafı: `pg_notify` ve `net.http_` izin listesi.
        - Demo kullanıcısının §6.3'teki her yazması `demo_read_only` (ya da `not_customer`) ile reddedilir.
        - Yalnızca servis rolüne açık fonksiyonlar (`payment_begin` vb.) `has_function_privilege('authenticated', …) = false` ile denetlenir.
        - Gerçek sahip aynı yazmaları yapabilir.
    - `44_demo_account_lockdown`:
        - Hesap kilidi: her alanın değişmesi reddedilir. Oturum açma alanları ve GoTrue'nun metaveri anahtarları serbesttir. Silme serbesttir.
        - Erişim kapsamı: postgres olarak, demo org'u dışındaki `parcel_access` ve profil satırları reddedilir.
        - Aramalar demo hesabı döndürmez.
        - Housekeeping'in yeni adımları.
        - `demo-media` kovası ve politikaları.
    - Etkilenen eski dosyalar (`00_schema` vb.) güncellenir.
- **Vitest birim:**
    - A, `_shared/demo.ts`: `ipBucket`, `demoMode` (sahte Turnstile anahtarları), istek ayrıştırma.
    - C:
        - bayrak kapalıyken render (`/demo` yok)
        - `public-paths`, demo sunucusu yönlendirme eşleyicisi
        - `tour-steps` biçimi
        - `demoText` biçimi
        - filigran bileşeni yalnızca `demo` ile var
        - PDF önbelleği yalnızca RLS okumasından sonra ve demo parseli için
        - `/demo/bitti` gerçek kullanıcıyı çıkarmaz
        - `SessionUser.demo` ve oturum kapısı
- **Entegrasyon:**
    - A, `demo-start.test.ts`:
        1. Başlat → `verifyOtp` → JWT'de `app_metadata.demo` → okuma.
        2. Yazmaların reddi.
        3. Hesap kilidi: `updateUser({phone})`, `({email})`, `({password})` ve `({data})` hata döner; `auth.users` değişmez; `message_outbox` boş kalır.
        4. Seed ops kullanıcısıyla `invite-user`: o telefon ve e-posta için 409 ya da yeni bir hesap döner, hiçbir zaman demo kimliği değil.
        5. Edge kontrolleri: `customer-signup complete`, `payments start` ve `invite-user` demo token'ıyla 403 döner.
        6. IP sınırı ve IPv6 /64 kovası (TEST-NET ve belge adresleri).
        7. Kapalı demo → 503.
        8. Cleanup.
    - C, `demo-portal.test.ts`:
        - Portal yükleyicileri demo kullanıcısıyla veri döner; yazma yardımcıları "Demoda kapalı" döner.
        - `demo-dataset.test.ts`, B'nin verisi yüklüyse çalışır: A'nın karnesinde `structure`, `care.sprouts`, `pests` ve `fruitLoad.previousYear` dolu.
- **Python (B):**
    - görüntü belirlenimciliği
    - panorama kuralı: ağaç doğru sütunda
    - `pose` alanları
    - kişisel veri taraması
    - boyut sınırı ve süre sınırı (test profili < 90 s)
    - SQL üretimi: açık çakışma hedefleri, ekleme sırası
    - `supabase` işaretli `test_demo_load_supabase.py`:
        - iki kez yükleme; ikincisi değişiklik yapmaz
        - doğrulama
        - kişi parolaları ve token sütunları
        - Admin `listUsers` ve `GET /auth/v1/admin/users/<persona>` 200 döner
- **E2E (C), `demo-tour.spec.ts`:** Global setup `pnpm db:demo-tour --profile test --reset-local` çalıştırır; CI'da `uv` kurulur. Senaryo:
    1. landing CTA → `/demo` → başlat
    2. bant görünür
    3. rehberli turun 10 adımı
    4. gezide `data-loaded="true"`; `data-image` "placeholder" değil; görüntü `demo-media` adresinden gelir
    5. ağaç karnesinde hash doğrulaması geçer
    6. karnede boyutlar görünür
    7. iki PDF 200 döner, `application/pdf`, `X-Orchados-Sample: 1` başlığı ve Info anahtar sözcüğüyle
    8. yazma formları yoktur
    9. süre dolması: `ageDemoSessions` ve housekeeping → yeniden yükleme `/demo?bitti=1`'e düşer
    10. "Demodan çık" → landing
    11. `/portal` → `/giris?next=`
    12. gerçek kullanıcı `GET /demo/bitti` sonrası hâlâ girişlidir
    13. mobil görünüm

    Ayrıca `site-pages` testine `/demo` eklenir. CI'da `office-tool.spec.ts` de bundan sonra çalışır.

## 15. Yayına alma

1. **Birleştirme:**
    - Bütün anahtarlar kapalıdır.
    - Migration'lar ve Edge Function'lar üç projeye gider:
        - test projesine `deploy-db` ile
        - pilot projesine `deploy-db-pilot` ile, elle
        - demo projesine `deploy-db-demo` ile; demo projesi açılana kadar iş akışı GitHub'da devre dışıdır (secret'lar eksikse iş başarısız olur, atlanmaz)
    - Hiçbir projede `ORCHADOS_DEMO_MODE` yoktur, bu yüzden başlatma `demo_closed` döner.
2. **Test projesi (kısa, ekip içi duman testi):** *Ortak barındırmada (`DEMO_HOST=test`, §15.1) bu adım geçersizdir:* duman testi demo adresinde yapılır, test sitesinin `/demo`'su kullanılmaz (`demo-start` `DEMO_*` secret'larını tercih eder; test sitesinden başlatma `captcha_failed` ya da tek IP kovası olur). `ORCHADOS_DEMO_MODE=dev` yazılmaz; `action=disable` ve `ORCHADOS_DEMO_MODE`'un silinmesi herkese açık demoyu kapatır (yalnızca kapatma ya da §15.1'deki ayrı projeye geçiş için). Alt adımlar yalnızca demo test projesinde barındırılmıyorken geçerlidir:
    1. Auth'ta "Confirm phone", "Confirm email" ve "Secure email change" açılır (deployment.md).
    2. Edge secret `ORCHADOS_DEMO_MODE=dev`, Vault `demo_cleanup_url` ve `orchados_cron_secret` eklenir (biri yoksa süresi dolan hesaplar silinmez).
    3. `demo-data` çalıştırılır: önce `project=test action=load`, sonra `action=enable`.
    4. Vercel test projesinde `ORCHADOS_DEMO_ENABLED=1` yapılır, yalnızca duman süresince.
    5. Duman listesi:
        - Başlatma çalışır. Bu, ziyaretçi alan adının barındırılan GoTrue'dan geçtiğini gösterir. Geçmezse alan adı değiştirilir (§7).
        - Tur çalışır.
        - İki PDF iner.
        - Mobil görünüm doğrudur.
        - "Demodan çık" çalışır.
        - `updateUser` denemeleri hata verir.
        - `message_outbox` ve `notification` tablolarında demo satırı yoktur.
        - 3 saat sonra `private.demo_session` boşalmıştır.
    6. Bitince `action=disable` çalıştırılır, bayrak kapatılır ve `ORCHADOS_DEMO_MODE` kaldırılır.
3. **Demo projesi:** Kurulum elle değil `provision-demo` iş akışıyla yapılır (`.github/workflows/provision-demo.yml`, mantık `scripts/provision-demo.sh`; ayrıntı ve girdiler: deployment.md › Demo turu › Kurulum). Elle başlatılır, yalnızca `main`'den ve `demo` ortamında koşar; tekrar çalıştırmak güvenlidir.
    1. `provision-demo` çalıştırılır (önce `dry_run=true` ile). İş akışı:
        - Supabase `orchados-demo` projesini test projesinin organizasyonunda (AB bölgesi, varsayılan `eu-central-1`) `DEMO_SUPABASE_DB_PASSWORD` ile açar ya da var olanı kullanır ve sağlıklı olmasını bekler.
        - Auth'u ayarlar: dışarıdan kayıt ve anonim giriş kapalı; "Confirm phone", "Confirm email", "Secure email change" açık; site adresi ve yönlendirme adresleri demo adresi.
        - Edge secret'larını yazar: `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET` (iş içinde üretilir, eksik olmadıkça yenilenmez), `MESSAGE_PROVIDER=record`, `PORTAL_BASE_URL`. `TURNSTILE_SECRET_KEY` (canlı) ve `ORCHADOS_DEMO_MODE=public` yalnızca Turnstile secret'ları GitHub'da varsa yazılır; yoksa demo kapalı kalır (§5) ve iş özeti bunu söyler.
        - Vault: `demo_cleanup_url`, `orchados_cron_secret` (Edge'dekiyle aynı değer).
        - Vercel `orchados-demo` projesini açar ya da kullanır (aynı repo, `main`, kök `apps/web`). Değişkenler yalnızca **Production** kapsamına girer: `NEXT_PUBLIC_SUPABASE_*`, `SIGNUP_PROXY_SECRET` (Edge'dekiyle aynı), `ORCHADOS_DEMO_ENABLED=1`, `ORCHADOS_MAIN_SITE_URL`, `ORCHADOS_SITE_URL`, Turnstile varsa `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (canlı). Önizleme derlemeleri kapalıdır (Ignored Build Step: `[ "$VERCEL_ENV" != production ]`); birleşmemiş dal kodu herkese açık demo veritabanına bağlanmaz. Dağıtım indekslenmez. `main` yalnızca bir şey değiştiyse dağıtılır.
        - Özete proje ref'ini, Supabase adresini, anon anahtarını, Vercel proje kimliğini ve demo adresini yazar; hiçbir secret değeri yazılmaz. Migration ve demo verisi bu iş akışında yoktur.
    2. Özetteki değerler GitHub `demo` ortamına girilir: `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY` (§10.4). `gh workflow enable deploy-db-demo` ile iş akışı açılır ve `deploy-db-demo` çalıştırılır.
    3. Harcama tavanı açılır ve %80 kullanım uyarısı kurulur (panelden).
    4. `demo-data` çalıştırılır: `project=demo action=load`.
    5. Canlı Turnstile anahtarları `demo` ortamına girilir ve `provision-demo` yeniden çalıştırılır. Anahtarlar gelmeden `action=enable` çalıştırılmaz: `deploy-db-demo` açık ama secret'ları eksik demoda başarısız olur.
    6. `demo-data` `action=enable`; ardından `deploy-db-demo` bir kez daha çalıştırılır.
    7. DNS'te `demo.<alan adı>` tanımlanır ve `provision-demo` `demo_url` girdisiyle yeniden çalıştırılır. Yukarıdaki duman listesi demo adresinde tekrarlanır.
4. **Pilot sitesi:**
    - İP12 sitesi herkese açıldığında Vercel pilot projesine `ORCHADOS_DEMO_URL` eklenir.
    - Pilot Supabase'e hiçbir demo ayarı girmez.
    - `deploy-db-pilot` şu durumlarda başarısız olur:
        - herhangi bir `private.demo_org` satırı var
        - `ORCHADOS_DEMO_MODE` secret'ı tanımlı
        - `demo-media` kovasında nesne var
5. **Geri alma:**
    - Pilotta `ORCHADOS_DEMO_URL` kaldırılır; CTA'lar kaybolur.
    - Demo projesinde `action=disable` çalıştırılır ya da `update private.demo_org set enabled = false;`.
    - Açık oturumları hemen bitirmek için: `update private.demo_session set expires_at = now();`. Oturum kapısı bu ziyaretçileri bir sonraki istekte `/demo/bitti`'ye gönderir.
    - Gerekirse `ORCHADOS_DEMO_MODE` kaldırılır.

### 15.1 Geçici ortak barındırma (test projesi)

**Neden:** `provision-demo` ayrı `orchados-demo` Supabase projesini açamadı: ücretsiz planda organizasyon başına iki proje sınırı var ve iki yer de test ile pilot projelerinde. Karar (28 Ekim): Supabase organizasyonu Pro'ya geçene kadar herkese açık demo **test projesinde** çalışır. Test projesinde gerçek müşteri verisi yoktur. Vercel tarafı ayrı kalır (`orchados-demo`, https://orchados-demo.vercel.app). **Pilot projesi demoyu hiçbir zaman barındırmaz;** `deploy-db-pilot`'taki kilit olduğu gibi kalır, `provision-demo` pilotu (adından ya da `PILOT_SUPABASE_URL`'den tanıyarak) reddeder; `host=test`'te `PILOT_SUPABASE_URL` ve test projesinin `SUPABASE_PROJECT_REF`'i zorunludur, ref `SUPABASE_URL`'dekiyle aynı olmalıdır.

**Kurulum:** `provision-demo` `host=test` ile (şimdilik varsayılan) çalıştırılır ve repo değişkeni `DEMO_HOST=test` yapılır (`gh variable set DEMO_HOST --body test`). İş akışı test projesinde yalnızca şunlara dokunur:
- Auth: demo adresi (`<demo_url>/**`) ek yönlendirme adreslerine eklenir. Site URL, kayıt ve onay ayarları test sitesinindir, değişmez.
- Edge secret'ları: yalnızca demoya özgü olanlar: `ORCHADOS_DEMO_MODE=public` ve `DEMO_TURNSTILE_SECRET_KEY` (ikisi de yalnızca canlı Turnstile anahtarları GitHub'dayken), `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET` (eksikse üretilir). Turnstile anahtarları yokken `public` olmayan bir `ORCHADOS_DEMO_MODE` (eski duman testinin `dev`'i) silinir; önceki çalıştırmanın `public`'i korunur. `MESSAGE_PROVIDER`, `PORTAL_BASE_URL`, `SIGNUP_*`, `TURNSTILE_SECRET_KEY`, `ORCHADOS_CRON_SECRET` ve ödeme secret'larına dokunulmaz.
- Vault: yalnızca `demo_cleanup_url`. Var olan `orchados_cron_secret` kullanılır; Edge ya da Vault tarafı eksikse iş uyarır, üretmez (test projesinin öteki cron'ları da bu değeri kullanır).
- Ortak cron secret'ı (`init_cron_secret`, varsayılan `false`): test projesinde Edge `ORCHADOS_CRON_SECRET` ve Vault `orchados_cron_secret` **ikisi de yoksa**, `init_cron_secret=true` ile iş tek bir rastgele değer üretir ve aynı çalıştırmada ikisine yazar (Edge'e Management API ile, Vault'a güvenli SQL yardımcısıyla). Değer loga ve özete düşmez. Yalnızca biri varsa iş, hiçbir şey yazmadan başarısız olur: değer geri okunamadığı için öteki tarafa kopyalanamaz, elle eşlenir ([deployment.md](deployment.md) › Edge secret'ları ve Vault). İkisi de varsa dokunulmaz. O zamana kadar demo temizliği de test sitesinin öteki cron'ları da çalışmaz; açık bir demo `deploy-db` kilitlerinde takılır.
- Vercel `orchados-demo`: `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` test projesinin değerleri (repo düzeyindeki herkese açık `SUPABASE_URL`, `SUPABASE_ANON_KEY`; anon anahtarın projeye ait olduğu denetlenir), `DEMO_SIGNUP_PROXY_SECRET` Edge'dekiyle aynı.

`demo-start`, Turnstile, IP özeti ve proxy secret'ını önce `DEMO_` önekli addan okur (`_shared/demo.ts` `demoSecrets`); web sunucusu da `/demo` başlatmasında `DEMO_SIGNUP_PROXY_SECRET`'ı tercih eder. Canlı Turnstile anahtarı demo alan adına bağlı olduğu için test sitesinin `TURNSTILE_SECRET_KEY`'i değiştirilmez. `public` kipte canlı anahtar kuralı aynıdır: hangi addan gelirse gelsin Cloudflare'in test anahtarı demoyu açmaz.

**İş akışları (`DEMO_HOST=test`):**
- `deploy-db` test projesine migration ve fonksiyonları her zamanki gibi uygular; sonunda ortak demo kilitlerini denetler (`scripts/demo-lock-check.sh shared`). Açık bir demo org'u kabul edilir; şu durumlarda iş başarısız olur: açık demo için `ORCHADOS_DEMO_MODE`, `DEMO_TURNSTILE_SECRET_KEY`, `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET`, Vault `demo_cleanup_url` ya da `orchados_cron_secret` eksik (test sitesinin öneksiz secret'ları demonun yerine sayılmaz); `ORCHADOS_DEMO_MODE` tam olarak `public` değil ya da Turnstile secret'ı Cloudflare'in sahte anahtarı (secrets API'nin sha256 özetiyle denetlenir); bir demo org'u kayıt ya da sahte ödeme kabul ediyor; bir demo hesabının üyeliği ya da demo dışı bir org'da parsel erişimi var. Test sitesinin org'ları, kaydı ve sahte ödemesi kilit değildir. Denetim migration'lardan sonra çalışır; başarısız bir demo kilidi test projesinin migration'larını durdurmaz.
- `deploy-db-demo` `test` ortamında koşar, yalnızca aynı ortak kilitleri denetler; migration ve fonksiyonları ikinci kez uygulamaz.
- `demo-data project=demo` test projesine yazar (`test` ortamı, `--demo-only` olmadan); `project=test` ile aynı veritabanıdır.

**Ne paylaşılır:** veritabanı (`auth.users` dahil), Auth'un IP sınırları ve MAU kotası, depolama ve egress kotası, harcama tavanı, Edge Function'lar, Vault ve loglar. Demo ziyaretçileri test projesinin aylık etkin kullanıcısına sayılır.

**Yalıtım katmanları değişmez:** yazma kilidi, hesap kilidi, erişim kapsamı tetikleyicileri ve `demo_guard_drift` demo hesabını demo org'unda tutar (§6). `demo_start` yalnızca demo bayraklı, temiz bir hesabı kabul eder; temizlik (`demo_expired_accounts`) yalnızca demo bayraklı, üyeliği, profili, onayı ve kaydı olmayan hesapları siler. pgTAP `49_demo_shared_host` test sitesinin org'u, personeli ve self-servis müşterisi yanındayken bunu sınar: ziyaretçi yalnızca demo parselini görür, ikinci başlatma ve housekeeping'den sonra seed kullanıcılarının üyelik ve erişim satırları satır satır aynıdır, en kötü durumda bile (süresi dolmuş demo oturumu, demo bayrağı taşıyan bir personel) temizlik yalnızca ziyaretçiyi seçer.

**Kabul edilen riskler:**
- §3.4'teki saldırı yüzeyi geçici olarak geri gelir: Turnstile'ı geçen herkes test projesinde gerçek bir JWT alır. Test projesinde gerçek müşteri verisi olmadığı için bu kabul edilmiştir; ekip ve seed hesapları vardır.
- Kötüye kullanım (kapasite saldırısı, egress, MAU) test projesinin kotasını tüketir ve test sitesini de kısıtlayabilir. Önlem: harcama tavanı ve %80 uyarısı test projesinde; gerekirse `private.demo_org.max_daily_starts` düşürülür ya da `demo-data action=disable`.
- Test projesinin log saklama süresi (Free: 1 gün) demo için de geçerlidir.
- Test projesindeki duman testi ve geliştirme denemeleri herkese açık demoyu etkileyebilir (ör. `demo-data project=test action=disable` demoyu kapatır, `load` veri kümesini yeniler).

**Ayrı projeye geçiş (Pro'dan sonra):**
1. `provision-demo` `host=separate` ile çalıştırılır: `orchados-demo` projesi açılır, Auth, Edge secret'ları ve Vault kurulur, Vercel değişkenleri yeni projeye çevrilir.
2. Vercel `orchados-demo`'dan `DEMO_SIGNUP_PROXY_SECRET` silinir (ayrı projede `SIGNUP_PROXY_SECRET`'ın önüne geçerdi; `host=separate` bu değişkeni görünce özeti yazdıktan sonra başarısız olur), iş yeniden çalıştırılır.
3. Özetteki değerler `demo` ortamına girilir (`DEMO_SUPABASE_*`), ardından `gh variable set DEMO_HOST --body separate` (ya da değişken silinir). `deploy-db-demo` ve `demo-data` (`project=demo`, `--demo-only`) artık ayrı projeye gider; §15 adım 3'ün kalanı izlenir.
4. Test projesinde demo kapatılır ve temizlenir: `demo-data project=test action=disable`; Edge'den `ORCHADOS_DEMO_MODE`, `DEMO_TURNSTILE_SECRET_KEY`, `DEMO_SIGNUP_HASH_SECRET`, `DEMO_SIGNUP_PROXY_SECRET` kaldırılır; Auth yönlendirme listesinden demo adresi çıkarılır. Açık oturumlar en geç oturum süresi sonunda biter, hesaplar temizlikle silinir.

## 16. İnsan eylemi

| Kim | Ne |
| --- | --- |
| Yusuf | GitHub Environment'ları `test`, `demo`, `pilot` (dal kuralları, onaylayıcılar), secret'ların ortamlara taşınması ve repo düzeyindeki veritabanı secret'larının silinmesi; demo projesi açılana kadar `gh workflow disable deploy-db-demo` (deployment.md › GitHub secret'ları ve ortamları) |
| Yusuf | Ortak barındırma (§15.1): `provision-demo` `host=test`, repo değişkeni `DEMO_HOST=test`; test projesinde harcama tavanı ve %80 uyarısı; Pro'dan sonra ayrı projeye geçiş |
| Yusuf | Demo projesi: `provision-demo` iş akışını çalıştırmak (Supabase ve Vercel projeleri, Auth, Edge secret'ları, Vault, Vercel değişkenleri; §15); özetteki değerlerle `demo` ortamına `DEMO_` secret'ları; DNS `demo.<alan adı>`; harcama tavanı ve kullanım uyarısı |
| Yusuf | Test, demo ve pilot projelerinde Auth onaylarını açmak (Confirm phone, Confirm email, Secure email change) |
| Yusuf | Demo alan adı için canlı Turnstile anahtarları |
| Yusuf | Ziyaretçi alan adı barındırılan GoTrue'da reddedilirse null MX kayıtlı bir alt alan adı ve `visitor_email_domain` güncellemesi |
| Yusuf | Test projesinde kısa duman testi; İP12 sitesi açılınca pilot sitesinde `ORCHADOS_DEMO_URL` |
| Avukat | Gizlilik metnine demo paragrafı. Özet: <br>• kişisel veri istenmez <br>• IP'nin takma adlandırılmış özeti 48 saat tutulur <br>• ham IP Auth oturumunda ve altyapı loglarında kalır <br>• Turnstile/Cloudflare ve Supabase/Vercel yurtdışı aktarımı <br>• zorunlu çerez |
| Yusuf | İsteğe bağlı: harita altlığı için `NEXT_PUBLIC_MAP_STYLE_URL`. Herkese açık trafikte OSM tile kullanım politikası nedeniyle |
| Yusuf (ileride) | Vitrin bahçesi için bahçe sahibinden yazılı izin; tanınabilir çevreyi de kapsar |

## 17. Paralel geliştirme planı

**Adım 0 (orkestratör):** Bu doküman bir docs PR'ıyla `docs/demo-turu.md` olarak main'e konur. Başlangıç noktası main ≥ `e68bf9c`; İP12'nin tamamı içinde.

| Akış | Dalga | Dal | Bağımlılık |
| --- | --- | --- | --- |
| A Demo erişimi: veritabanı, Edge, dağıtım denetimleri | 1 | `claude/ip13-demo-erisim` | — |
| B Demo verisi: medya, yükleyici, iş akışı | 1 | `claude/ip13-demo-verisi` | Sözleşmeyle A'ya bağlı. Kayıt ve ayna adımları A birleşene kadar yerelde atlanır; `remote` A'yı ister |
| C Demo arayüzü ve uçtan uca test | 2 | `claude/ip13-demo-arayuz` | A, B |

**Sahiplik:**
- **A:**
    - Üç migration, `supabase/tests/**`, `supabase/testing/**`, `config.toml`, `seed.sql`, `supabase/functions/**`, `database.types.ts`.
    - `apps/web/src/lib/demo/demo-shared.test.ts`, `tests/integration/demo-start.test.ts`, `edge-function-config.test.ts`, `tests/local-db.ts`. Değiştirdiği Edge Function'ların var olan entegrasyon testleri, yalnızca gerekirse.
    - `deploy-db-pilot.yml`, yeni `deploy-db-demo.yml`, `supabase/README.md`.
    - Dokümanlar: `veri-modeli.md`, `teknik-mimari.md`.
- **B:**
    - `services/pipeline/src/orchados_pipeline/demo/**`, pipeline `cli.py`, testleri ve README'si.
    - `supabase/demo/tour/**`.
    - Kök `package.json` (yalnızca `db:demo-tour`), kök `.gitignore`.
    - `.github/workflows/demo-data.yml`, `CLAUDE.md`.
- **C:**
    - `apps/web/src/**`. İstisna: A'nın iki dosyası.
    - `apps/web/tests/e2e/**`, `demo-portal.test.ts`, `demo-dataset.test.ts`, `demo-fixture.ts`, `playwright.config.ts`, web README'si.
    - `ci-db-web.yml`.
    - Dokümanlar: `deployment.md`, `plan.md`, `kullanim-kilavuzu.md`, `MVP.md`, ayrıca bu dokümanın sonuna "Uygulama notları" eklemek.

**Kurallar:**
- Adlar ve imzalar §5, §7, §8.1 ve §11'deki gibidir. Bir akış bir sözleşmeyi değiştirmek zorunda kalırsa bunu PR'da açıkça yazar.
- Dalga 2'de yeni migration eklenmez.
- Her ajan PR'dan önce son main'i alır. Dal zaten gönderilmişse rebase yerine `origin/main` birleştirilir; force-push yapılmaz.
- Docker çalışmazsa birim testleri, lint ve build çalıştırılır; PR yine açılır ve doğrulamayı CI yapar.

## 18. Doküman güncellemeleri

- **`plan.md` (C):** İP13 satırı (P1, ~7 gün), Gantt ve durum tablosu.
- **`CLAUDE.md` (B):**
    - "Önce oku" listesine bu doküman.
    - Komut tablosuna `pnpm db:demo-tour` ve `orchados-pipeline demo`.
    - Migration kurallarına şu satır: "Yeni tablo ekleyen migration `select private.attach_demo_guard('<tablo>')` çağırır; kullanıcıya erişim ya da kimlik veren tablo ayrıca `private.attach_demo_account_guard(...)` çağırır (docs/demo-turu.md §6.1–6.2). Servis rolüyle yazan yeni Edge yolları demo claim'ini reddeder."
- **`deployment.md` (C):** "Demo turu" bölümü:
    - demo projesi ve dağıtımı
    - barındırılan Auth onayları (test, demo, pilot); yerelde kapalı oldukları ve korumaların bu yüzden onaylara dayanmadığı
    - Edge secret'ları ve `ORCHADOS_DEMO_MODE`
    - Vault
    - `demo-data` ve `deploy-db-demo` iş akışları
    - pilot denetimleri
    - log saklama süreleri
    - duman listesi
    - geri alma
- **`veri-modeli.md`, `teknik-mimari.md` (A):** Demo tabloları, yazma kilidi kuralı, hesap kilidi, erişim kapsamı, KVKK paragrafı.
- **`kullanim-kilavuzu.md` (C):** "Demo" bölümü: kim, nasıl, neler kapalı.
- **`services/pipeline/README.md` (B), `supabase/README.md` (A), `apps/web/README.md` (C).**

## 19. Açık sorular ve kabul edilen riskler

- **Sentetik görünüm:** Panoramalar özenli çizilse de fotoğraf değildir. Gerçek his ancak bir vitrin bahçesiyle gelir (§10.5).
- **Egress:** Rakamlar demo projesi içindir; pilot etkilenmez.
    - Veri: tam veri kümesi ~115 MB'tır. Ayna kovayla birlikte depoda ~230 MB tutar.
    - Tipik ziyaretçi 5–15 MB indirir: turdaki önizlemeler, birkaç 4K panorama, ağaç karnesi kesitleri ve fotoğrafları, hash kontrolü.
    - Her panoramayı iki yılda da, 4K dahil açan ve her ağaca bakan ziyaretçi en fazla bütün veri kümesini, ~115 MB, indirir.
    - Ayna adresleri herkese açıktır. Bir kazıyıcı oturum açmadan da sınırsız indirebilir. Bayt sınırı demo projesinin kotası ve harcama tavanıdır.
    - Kotalar yaklaşık şöyledir: ücretsiz katmanda aylık ~5 GB (+5 GB önbellekli), Pro'da ~250 GB (+250 GB önbellekli). Güncel değer fiyat sayfasından doğrulanır. Bu, ücretsiz katmanda ~45–90, Pro'da ~2.000 tam indirme eder.
    - Günlük 500 başlatma sınırı tamamen dolarsa tipik ziyaretçiyle günde ~7,5 GB, ayda ~225 GB çıkar. Yani Pro'nun dahil kotasına yakındır.
    - Harcama tavanı açık kalır. Aşılırsa yalnızca demo projesi kısıtlanır. %80 kullanım uyarısı vardır; gerekirse `max_daily_starts` düşürülür.
- **PDF:** Oturum başı 30 üretim vardır. Next veri önbelleği örnekler arasında paylaşılır, bu yüzden aynı PDF ikinci kez üretilmez. Kalan maliyet sunucu işidir.
- **Kapasite saldırısı:** Ucuz bir Turnstile çözücüsü olan saldırgan `max_daily_starts` ya da `max_active_sessions`'ı doldurup demoyu herkes için o gün kapatabilir. Bu risk kabul edilmiştir. Önlemler:
    - canlı Turnstile zorunlu
    - IPv6 /64 kovaları
    - reddedilen istekler satır biriktirmez
    - kullanım uyarısı
    - gerekirse sınırı artırmak ya da Vercel/Cloudflare güvenlik duvarı kuralı eklemek
- **MAU:** Her demo hesabı demo projesinin aylık etkin kullanıcısına sayılır. Ücretsiz katmandaki 50 bin sınırına günlük sınırla uzak kalınır: ayda en fazla ~15 bin.
- **Hesap değişikliği:**
    - Hesap kilidi, erişim kapsamı ve aramalar onaylardan bağımsız çalışır. Barındırılan projelerde onaylar ayrıca açıktır.
    - Tetikleyici barındırılan projede kurulamazsa: değişmiş hesap en geç 5 dakikada erişimini, 15 dakikada hesabını kaybeder. Bu sürede de bir org'a bağlanamaz ve aramalarda görünmez.
    - Özel SMTP açılmadan önce bir Send Email Hook demo hesaplarını ayrıca reddetmelidir.
- **GoTrue denetim kaydı:** Barındırılan projede `auth.audit_log_entries` tablosundan silme yetkisi olmayabilir. Silme bu yüzden en iyi çaba ile yapılır.
- **Yeni yazma yolları:**
    - Portala eklenecek her yazma yolu tetikleyiciyle kendiliğinden korunur. Yeni tabloları ve yan etkili fonksiyonları pgTAP `43_demo_write_guard` yakalar.
    - Servis rolüyle yazan yeni bir Edge yolunu pgTAP göremez. Bu kural CLAUDE.md'de yazılıdır.
- **Ortak barındırma:** Pro'ya geçilene kadar demo test projesindedir; riskleri ve geçiş: §15.1.
- **Üç proje:** Migration'lar üç projeye gider. `deploy-db-demo` `main`'e her birleşmede `demo` ortamında çalışır; secret'lar eksikse başarısız olur. `db push` yarıda kalsa da demo koruması denetimi çalışır.
- **Harita altlığı:** OSM tile sunucusu yoğun ve ticari trafiğe uygun değildir. Bir harita sağlayıcısı seçimi insan kararıdır (§16).
- **Temizlik:**
    - Hesapları silen cron Vault'a bağlıdır. Vault eksikse hesaplar silinmez.
    - Yine de `demo-housekeeping` (yalnızca SQL) süresi dolan oturumların erişimini 5 dakika içinde kaldırır.
    - Oturum kapısı süresi dolan oturumu her istekte kapatır.

## 20. Uygulama notları

Akışların birleşen koddaki sapmaları; yukarıdaki bölümler tasarım olarak kalır.

**A (erişim, PR #63):**
- Tasarımdaki üç migration'a dördüncüsü eklendi: `20261101120300_demo_guard_drift.sql` (`private.attach_demo_guards()`, `private.demo_guard_drift()`) ve `scripts/demo-guard-check.sh`; her `deploy-db*.yml` `db push`'tan sonra çalıştırır (§6.1 "Migration sırası").
- `demo_info()` veri sürümü döndürmez; `tour` alanı `private.demo_org.tour`'dur (B yazar). Süresi dolmuş ya da bitirilmiş oturumda da satır döner; bitişi web'deki kapı `expires_at` ile denetler.
- `demo_hit` etkin oturum yoksa `false` döner (kapıdan sonra çağrıldığı için web'de 429'a dönüşmez).

**B (veri, PR #64):**
- Ad ve kimlikler §8.1'deki gibi. Öne çıkan ağaç `S3-6` turda `tour.tree_id` olarak gelir. `pnpm db:demo-tour --profile test --reset-local` yerelde ~1 dakika sürer (önbellekli derlemeyle).

**C (arayüz):**
- **Demo sunucusu:** `demoHostRedirect(pathname, mainSiteUrl, search)` (`src/lib/site/demo-host.ts`) bir karar döner: `pass`, `local` (`/` → `/demo`) ya da `main` (asıl sitede aynı yol ve sorgu, 307). Uygulamada auth geri dönüş rotası yoktur; geçen yollar `/demo/**`, `/portal/**`, `/_next/**`, `robots.txt`, `favicon.ico`, `sitemap.xml` ve statik dosya uzantılarıdır. Demo sunucusunda `/giris` de asıl siteye gider; oturumsuz portal isteği `/demo`'ya döner.
- **Çıkış hedefleri:** `exitDemoAction`'ın kabul ettiği `next` listesi `/`, `/kayit`, `/giris`'e ek olarak `/iletisim` (kayıt kapalıyken "Gerçek hesap aç" yerine "Bize ulaşın") ve `/paketler`'i içerir. Demo sunucusunda bütün hedefler asıl siteye gider (yalnızca `/` ve `/kayit` değil), çünkü öteki sayfalar da orada.
- **`/demo/bitti`:** 303 ile yönlendirir ve `Cache-Control: private, no-store` taşır. `/kayit` ve `/giris` demo kullanıcısına "Demodan çıkıp devam et" kartını gösterir; düğme `exitDemoAction` ile o sayfaya gider.
- **Oturumu bitirme:** `/demo/bitti` ve `exitDemoAction` ortak `endDemoSession`'ı (`src/lib/demo/end.ts`) çağırır: `demo_end`, çıkış ve GoTrue'nun cevabından bağımsız olarak `sb-*-auth-token` çerezlerinin silinmesi. auth-js çıkış isteği 5xx ya da ağ hatasıyla düşerse yerel oturumu bırakmaz; çerez kalsaydı `/demo` ile portal arasında yönlendirme döngüsü olurdu. `/demo` canlı demo oturumunu portala, bitmiş olanı `/demo/bitti`'ye gönderir; `?bitti=1` iken yönlendirmez.
- **`demo_info()` hatası:** `getDemoInfo` "oturum yok" (boş cevap ya da PostgREST'in reddettiği belirteç, `PGRST3xx`) ile "okunamadı"yı ayırır. Geçici bir hata `DemoInfoUnavailableError` fırlatır ve "Yeniden dene" düğmeli hata sayfası (`src/app/error.tsx`) açılır; oturum bitirilmez.
- **Girişli kullanıcı:** `startDemoAction` önce oturuma bakar. Gerçek kullanıcıya belirteç vermez (`signed_in`), demo kullanıcısını portala gönderir; sayfadaki kart tek savunma değildir.
- **PDF önbelleği:** `demo_info()` veri sürümü vermediği için anahtar tür, parsel, PDF'in gösterdiği yayımlanmış oturum (karnede son ziyaret, envanterde envanter oturumu) ve bir düzen sürümüdür (`LAYOUT_VERSION`). Yeni bir veri sürümü yeni oturum eklediği için anahtar yine değişir. Sıra `src/lib/pdf/serve.ts`'de tek yerde ve birim testlidir. Bitmiş oturumda PDF rotası 302 `/demo/bitti` döner.
- **Görüntü sınırı:** `signTourImagesAction` sınır aşılınca boş nesne yerine her kimlik için `null` döner; boş nesne gezi bileşeninde aynı görüntüleri sonsuza dek yeniden isterdi. Görüntüler yer tutucuyla açılır; ayrı bir not gösterilmez.
- **Bant:** Telefonda tek satır kalsın diye "Turu başlat" yalnızca 720 px ve üstünde bantta görünür; telefonda aynı düğme kabuk başlığında, "Bahçelerim (örnek)"in yanındadır (`demo-tour-start-mobile`), böylece kapatılan tur her zaman yeniden açılır. Yazdırmada bandın metni basılır, düğmeleri basılmaz.
- **Rehberli tur:** Masaüstünde kart, hedefin sağında ya da solunda yer varsa yanına, yoksa sağ alta yerleşir; mobilde alt sayfadır. Hedefler 8 saniye içinde bulunamazsa adım, gidiş yönünde atlanır. Kapatınca `?tur` adresten kaldırılır; yeni bir demo başlatılınca "kapatıldı" bilgisi silinir. Kart adımlar arasında takılı kalır (yeni adımın hedefleri aranırken `aria-busy`), böylece klavye odağı kaybolmaz; ziyaretçinin başlattığı adım değişikliğinde odak kart başlığına geçer. `aria-live` bölgesi kartın dışında sürekli durur ve her adımı duyurur. Ok tuşları ve Esc yalnızca odak kartın içindeyken ya da sayfada odaklı bir öğe yokken tura gider; harita, 360° gezi ve öteki bileşenler kendi tuşlarını korur.
- **Eylem katmanı testi:** `src/app/portal/demo-actions.test.ts` parsel ve faturalama modüllerinin bütün dışa açık eylemlerini demo kullanıcısıyla çağırır; her biri istemci açmadan `demo_read_only` ile reddetmelidir. Sonradan eklenen bir eylem de otomatik olarak kapsanır.
- **Gizlilik metni:** Demo paragrafı artık `gizlilik-v2-taslak` metninin "5. Demo turu" bölümüdür ([hukuk/gizlilik-cerez-politikasi-taslagi.md](hukuk/gizlilik-cerez-politikasi-taslagi.md), [hukuk/kararlar.md](hukuk/kararlar.md) H27); `/gizlilik` sayfası onu diğer bölümlerle birlikte gösterir, ayrı bir `demoText.privacy` yoktur. Yayını [yayın şartlarına](hukuk/kararlar.md#yayin) bağlıdır.
- **E2E:** `demo-tour.spec.ts`, global kurulumun `ORCHADOS_E2E_DEMO_TOUR` ortam değişkeniyle çalışır; veri yüklenemezse yerelde atlanır, CI'da kurulum başarısız olur.
