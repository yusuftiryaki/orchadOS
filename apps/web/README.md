# apps/web

Next.js web uygulaması: sahip portalı, uzman paneli ve ofis üçgenleme aracı. Rol bazlı tek uygulama.

İş paketleri: İP5 (ofis üçgenleme aracı), İP7 (uzman paneli), İP8 (sahip portalı). Bkz. [docs/plan.md](../../docs/plan.md).

Şu anki hâli: giriş/çıkış, rol bazlı bölümler, her bölümde parsel listesi ve harita üzerinde parsel detayı (iskelet), `/ofis` altında **ofis üçgenleme aracı** (İP5), `/uzman` altında **uzman paneli** (İP7), `/portal` altında **sahip portalı** (İP8), `/operasyon` altında **operasyon ekranları** (kayıt ve ziyaret planlama), telefonla (SMS kodu) giriş ve SMS / WhatsApp **bildirimleri**; hepsi aşağıda.

## Kurulum

Gerekenler: Node 22, pnpm (sürüm kökteki `package.json`'da), Docker (yerel Supabase için).

```bash
# Repo kökünde
pnpm install                 # kök + apps/web bağımlılıkları (pnpm workspace)
pnpm db:start                # yerel Supabase
pnpm db:reset                # migration'lar + örnek veri
pnpm db:status               # API adresi ve anahtarlar

cp apps/web/.env.example apps/web/.env.local
# NEXT_PUBLIC_SUPABASE_ANON_KEY'i `pnpm db:status` çıktısındaki anon (publishable) anahtarla doldur

pnpm web:dev                 # http://localhost:3000
```

Örnek kullanıcılar (sadece yerel, parola `orchados-dev`): `owner@`, `viewer@`, `field@`, `expert@`, `ops@example.com`.

## Komutlar

Kökten çalıştırılır; `apps/web` içinde aynı betikler `pnpm dev`, `pnpm build` vb. adlarla da var.

| Komut              | Ne yapar                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `pnpm web:dev`     | Geliştirme sunucusu                                                        |
| `pnpm web:build`   | Üretim derlemesi                                                           |
| `pnpm web:test`    | Birim testleri + yerel Supabase'e karşı entegrasyon testleri               |
| `pnpm web:e2e`     | Tarayıcı testleri (Playwright; uygulamayı derleyip 3100 portunda başlatır) |
| `pnpm web:lint`    | ESLint + Prettier denetimi + TypeScript tip denetimi                       |
| `pnpm web:typegen` | `src/lib/database.types.ts` dosyasını yerel veritabanından üretir          |

`apps/web` içinde ayrıca: `pnpm test:unit`, `pnpm test:integration`, `pnpm format` (Prettier ile yazar), `pnpm office:dev-data` (ofis aracının geliştirme verisi, aşağıda).

**Entegrasyon ve tarayıcı testleri** çalışan yerel Supabase ister: önce `pnpm db:start && pnpm db:reset`. Adres ve anahtarlar ortam değişkenlerinden, yoksa `supabase status` çıktısından okunur; `.env.local` gerekmez. Testler `supabase/` örnek verisini değiştirmez; ihtiyaç duydukları ek kayıtları (ikinci parsel, başka işletme, örnek değerlendirme) servis anahtarıyla kendileri ekler ve sonunda siler.

**Veritabanı tipleri:** Şema değişince (`supabase/migrations/`) `pnpm db:reset && pnpm web:typegen` çalıştırılır ve üretilen dosya commit'lenir.

## Klasör yapısı

```
apps/web/
├── src/
│   ├── proxy.ts                 # her istekte oturumu yeniler, girişsizleri /giris'e yollar
│   ├── app/
│   │   ├── giris/               # giriş sayfası, giriş yöntemleri, server action
│   │   ├── portal/              # sahip, izleyici: bahçelerim, karne, ağaç karnesi, 360° gezi
│   │   ├── uzman/               # uzman: ziyaret kuyruğu, server action'lar
│   │   │   └── ziyaret/[sessionId]/ # ağaç ağaç inceleme; ozet/ özet ve imza
│   │   │   └── sorular/         # sahiplerin soruları ve cevaplar
│   │   ├── ofis/                # saha personeli, operasyon
│   │   │   ├── parsel/[parcelId]/envanter/  # ofis üçgenleme aracı + kaydetme (server action)
│   │   │   └── panorama/[setId]/[panoramaId]/[variant]/  # panorama görüntüsü (route handler)
│   │   ├── operasyon/           # operasyon: pano, sahip, parsel, sınır, erişim, ziyaret planı
│   │   │   └── parsel/[parcelId]/   # her bölümde parsel detayı
│   │   ├── forbidden.tsx        # 403 sayfası
│   │   └── page.tsx             # girişten sonra ilk erişilebilir bölüme yönlendirir
│   ├── components/              # bölüm başlığı, parsel listesi, harita, ağaç paneli
│   │   ├── office/              # üçgenleme aracı: harita, panorama görünümü, paneller
│   │   ├── portal/              # sahip portalı: karne, sağlık haritası, ağaç karnesi, gezi
│   │   ├── expert/              # uzman paneli: kuyruk, inceleme, karar, bulgu, özet, kısayollar
│   │   └── operations/          # operasyon: formlar, sınır çizim haritası, ziyaret tablosu
│   └── lib/
│       ├── auth/                # roller → bölümler, oturum ve bölüm kontrolü
│       ├── i18n/tr.ts           # bütün arayüz metinleri
│       ├── map/                 # GeoJSON yardımcıları, altlık, ağaç renkleri
│       ├── office/              # üçgenleme, sıra oturtma, kodlama, doğrulama listesi (saf TS),
│       │                        # panorama kaynağı, envanter kaydı
│       ├── portal/              # portal sorguları + saf hesaplar (sınıf, değişim, ölçüm, gezi yönleri)
│       ├── media/               # storage:// adresleri, toplu imzalama ve önbellek, panorama varyantları
│       ├── expert/              # mevsim, metrik seçimi, özet (saf TS); sorgular, kararlar, bulgular
│       ├── operations/          # form doğrulama, sınır geometrisi, gecikme hesabı (saf TS); sorgular, yazmalar
│       ├── supabase/            # sunucu istemcisi, proxy oturum yenileme, sayfalı sorgu (fetchAll)
│       ├── parcels.ts           # parsel sorguları (sadece satır bazlı yetkiyle)
│       └── database.types.ts    # üretilmiş; elle değiştirilmez
├── tests/
│   ├── integration/             # supabase-js ile yerel veritabanına karşı
│   └── e2e/                     # Playwright
└── scripts/
    ├── typegen.mjs
    └── office-dev-data.mjs      # sentetik panoramalar + geliştirme parseli
```

Birim testleri kaynak dosyaların yanında (`*.test.ts`).

## Roller ve bölümler

Roller veritabanından okunur: işletme rolleri `membership`, parsel rolleri `parcel_access` tablosundan; müşteri bayrağı (`UserRoles.customer`) `my_owner_profile()` en az bir satır döndüğünde doğrudur. Eşleme `src/lib/auth/roles.ts` içinde tek tabloda:

| Bölüm        | Kimler girer                                      | Kaynak                                |
| ------------ | ------------------------------------------------- | ------------------------------------- |
| `/portal`    | sahip (`owner`), izleyici (`viewer`), müşteri     | `parcel_access`, `my_owner_profile()` |
| `/uzman`     | uzman (`expert`)                                  | `membership`                          |
| `/ofis`      | saha personeli (`field_staff`), operasyon (`ops`) | `membership`                          |
| `/operasyon` | operasyon (`ops`)                                 | `membership`                          |

- Yetkisi olmayan bölüme giren kullanıcı **403** sayfası görür (`forbidden()`); kontrol hem bölüm düzeninde (layout) hem her sayfada yapılır.
- Birden çok rolü olan kullanıcı üst menüden bölümler arasında geçer. Girişten sonra yukarıdaki sıradaki ilk erişilebilir bölüme yönlendirilir.
- Bölüm erişimi sadece **hangi ekranların** açılacağını belirler. Bir bölümde **hangi verinin** görüneceğine veritabanındaki satır bazlı yetki kuralları karar verir; uygulama tarafında filtreleme yapılmaz. Örneğin sahip sadece kendi parselini görür, işletme rolleri işletmenin bütün parsellerini.
- Bir parseli görme yetkisi olmayan kullanıcı için o parselin sayfası 404'tür (yok ile görünmez ayırt edilmez).

## Giriş

İki yöntem (`src/app/giris/login-methods.ts`): **e-posta + parola** ve **telefon (SMS kodu)**.

**Telefonla giriş:** numara (`0532 123 45 67` de yazılabilir) → **SMS kodu gönder** → 6 haneli kod → **Giriş yap** (`src/app/giris/actions.ts`: `signInWithOtp` / `verifyOtp`, `shouldCreateUser: false`).

- **SMS'i bizim sağlayıcımız gönderir:** Supabase Auth kodu kendisi göndermez, "Send SMS Hook" ile `supabase/functions/send-sms` Edge Function'ına verir. Fonksiyon isteğin imzasını (Standard Webhooks, `SEND_SMS_HOOK_SECRET`) denetler, numara sınırlarını uygular ve mesajı sağlayıcıya verir (bkz. [Bildirimler](#bildirimler), sağlayıcılar). Yerelde ve testlerde **kayıt sağlayıcısı** çalışır: SMS gitmez, kod `private.message_outbox` tablosuna yazılır.
- **Sadece davetli numaralar:** Dışarıdan üye olma kapalı (`[auth] enable_signup = false`); hesapları operasyon `invite-user` ile açar. Telefonla açılan hesap (e-postasız sahip) doğrudan SMS koduyla girer. Sayfa bir numaranın kayıtlı olup olmadığını söylemez: davetsiz numaraya da "kayıtlıysa kod gönderdik" denir, ama kod gitmez.
- **Kötüye kullanım sınırları** (veritabanı, `20261023140200_phone_login.sql`): numara başına saatte en çok 5 kod; 15 dakikada 5 hatalı kodda numara 15 dakika kilitlenir (yeni kod da gönderilmez). Numaralar bu sayımda SHA-256 özetiyle tutulur, bir gün sonra silinir. Ayrıca Auth'un kendi sınırları: aynı numaraya 60 saniyede bir kod (`auth.sms.max_frequency`; kod ekranındaki yeniden gönderme sayacı da 60 sn) ve proje genelinde saatlik SMS sınırı.
- Ekranda numara maskeli görünür (`+90 5•• ••• •• 67`, `src/lib/notifications/phone.ts`). Numara ve kod hiçbir yerde loglanmaz.

**Yerel Supabase ayarı** (`supabase/config.toml`): `[auth.hook.send_sms]` hook'u yerel fonksiyona yönlendirir; imza sırrı sadece yerel içindir ve `[edge_runtime.secrets]`'ta fonksiyona da verilir. CLI telefon sağlayıcısını ancak bir SMS sağlayıcısı açıkken açtığı için `[auth.sms.twilio]` sahte değerlerle açıktır; hook açıkken Twilio hiç çağrılmaz.

**Yerelde denemek:** `pnpm db:reset`; operasyonla e-postasız bir sahip kaydet (ya da Supabase'de telefonlu bir kullanıcı aç), `/giris` → **Telefon**. Kodu oku:

```bash
docker exec supabase_db_orchados psql -U postgres -c \
  "select created_at, recipient, body from private.message_outbox order by created_at desc limit 5"
```

## Site ve kayıt

Herkese açık site `src/app/(site)/` altındadır (ortak başlık ve altbilgi: `src/components/site/`). Oturumu olmayan ziyaretçi yalnızca bu yolları açabilir (`src/lib/site/public-paths.ts`, `isPublicPath`); diğer her yol `/giris?next=…`'e gider.

| Yol                                                                                 | Ne                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                 | Oturum yoksa tanıtım sayfası; varsa kullanıcının bölümü. Bölümü olmayan kullanıcıda `customer-signup` `complete` çağrılır: `completed` → `/portal`, `phone_not_verified` → doğrulama kartı, diğerleri → "rol atanmamış" kartı |
| `/nasil-calisir`, `/paketler`, `/sss`, `/iletisim`                                  | Ürün sayfaları. Paketler `loadPublicPackages` ile okunur (İP12-D bağlar); liste boşsa "Fiyatlar teklif ile belirlenir"                                                                                                        |
| `/kvkk`, `/acik-riza`, `/gizlilik`, `/mesafeli-satis`, `/on-bilgilendirme`, `/iade` | Hukuk metinleri (`src/lib/i18n/messages/legal.ts`, kaynağı `docs/hukuk/`). Sürümler `src/lib/legal/versions.ts`; `-taslak` ile biten sürümde üstte bant                                                                       |
| `/kayit`                                                                            | Kayıt formu (bayrak kapalıysa "Kayıt yakında"); oturum varsa `/`'a gider                                                                                                                                                      |
| `/kayit/dogrula`                                                                    | Telefonu doğrulanmamış, oturumu açık self-servis hesap için SMS kodu                                                                                                                                                          |
| `/robots.txt`, `/sitemap.xml`                                                       | `ORCHADOS_SITE_INDEXABLE=1` olmadıkça her şey `Disallow`, site haritası boş                                                                                                                                                   |

**Kayıt akışı** (`src/app/(site)/kayit/actions.ts`, tasarım: `docs/musteri-yonetimi.md` §7):

1. Form sunucuda `parseSignupForm` ile denetlenir (`src/lib/signup/validation.ts`): ad soyad 2–120 karakter, yalnızca Türkiye cep telefonu (`+905…`), e-posta, en az 8 karakterli ve tekrarı tutan parola, iletişim tercihi (WhatsApp / SMS), zorunlu aydınlatma onayı, isteğe bağlı ve işaretsiz iki açık rıza (hizmetin geliştirilmesi, tanıtım). Yapay zekâ aktarımı için rıza kutusu yoktur (tasarım §2).
2. `registerCustomer` (`src/lib/signup/client.ts`) `customer-signup` fonksiyonunu `x-orchados-proxy-secret` başlığı ve ziyaretçinin IP'siyle çağırır. 404 ve 5xx "kayıt hizmetine ulaşılamıyor" olarak gösterilir.
3. `phone_login_allowed`, ardından `signInWithOtp` (`shouldCreateUser: false`) ile SMS kodu gider; 60 saniyede bir yeniden gönderilebilir.
4. `verifyOtp` (hatada `phone_login_record_failure`), sonra `completeSignup`: `completed` → `/portal`, diğerleri → `/`.

Form değerleri, telefon ve kod loglanmaz, adrese yazılmaz. Turnstile, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` varsa formda görünür; jetonu fonksiyon doğrular. Bayrak kapalıyken davranış birim testleriyle (`renderToStaticMarkup`) denetlenir: başlıkta ve giriş sayfasında kayıt bağlantısı yoktur, `/kayit` "Kayıt yakında" kartıdır. Tarayıcı testleri (`tests/e2e/site-pages.spec.ts`) bayrak açıkken çalışır ve `customer-signup` fonksiyonuna ihtiyaç duymaz.

## Harita

MapLibre GL. Parsel detayında son sürüm sınır, yerler ve ağaçlar çizilir; ağaçlar son değerlendirmenin genel sınıfına göre renklenir. Örnek veride değerlendirme olmadığı için bütün ağaçlar tek renktir ("Değerlendirilmedi"), boş yerler içi boş daire. Ağaca tıklayınca sağda kod ve özellikler görünür.

**Altlık:** Geliştirmede API anahtarı gerektirmeyen OpenStreetMap raster karoları kullanılır. OSM karo sunucuları üretim trafiği için değildir (kullanım politikası); **üretimde `NEXT_PUBLIC_MAP_STYLE_URL` ile kendi barındırdığımız ya da bir sağlayıcının stil adresine geçilmeli** (ör. kendi PMTiles/OpenMapTiles sunucusu ya da uydu altlığı).

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyala. Gerçek anahtar repoya girmez.

| Değişken                          | Açıklama                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase API adresi (yerelde `http://127.0.0.1:54321`)                                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Anon (publishable) anahtar; tarayıcıya açıktır, her sorgu satır bazlı yetkiyle sınırlıdır                    |
| `NEXT_PUBLIC_MAP_STYLE_URL`       | İsteğe bağlı MapLibre stil adresi; boşsa OSM raster                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`       | Sadece entegrasyon testleri; uygulama okumaz. Boşsa `supabase status`'tan alınır                             |
| `LOCAL_PANORAMA_DIR`              | Ofis aracı, sadece geliştirme: depoya ek olarak işleme hattı çıktılarının klasörü                            |
| `LOCAL_PANORAMA_ALLOW_PRODUCTION` | `1` ise üretim derlemesi de yerel klasörü okur; sadece tarayıcı testleri kullanır                            |
| `ORCHADOS_SIGNUP_ENABLED`         | `1` ise `/kayit` ve kayıt bağlantıları görünür, `/` yarım kalan kaydı tamamlar. Varsayılan kapalı            |
| `ORCHADOS_PAYMENTS_ENABLED`       | `1` ise portalda kartla ödeme sunulur (İP12-D). Varsayılan kapalı                                            |
| `PAYMENT_FAKE_CHECKOUT`           | `1` ise sahte ödeme sayfası kullanılır. Yalnızca yerel, CI ve test projesi; pilotta asla                     |
| `ORCHADOS_SITE_INDEXABLE`         | `1` ise `robots.txt` dizinlemeye izin verir, site haritası dolar. Yalnızca canlı alan adında                 |
| `ORCHADOS_SITE_URL`               | Sitenin herkese açık adresi (`robots.txt` ve site haritası için), ör. `https://orchados.com.tr`              |
| `SIGNUP_PROXY_SECRET`             | `customer-signup` fonksiyonuyla ortak sır; yalnızca sunucu, asla `NEXT_PUBLIC`. Yerelde `signup-proxy-local` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`  | Cloudflare Turnstile site anahtarı. Boşsa robot doğrulaması gösterilmez (yerel, CI); pilotta zorunlu         |

`NEXT_PUBLIC_*` değerleri derleme sırasında koda gömülür; ortam değişince yeniden derlemek gerekir. Site bayrakları (`ORCHADOS_*`) ve Turnstile anahtarı sunucuda her istekte okunur (`src/lib/flags.ts`).

## Stil

CSS Modules + `src/app/globals.css` içinde CSS değişkenleri (renk, boşluk, köşe). Gerekçe: Next.js'te ek bağımlılık ve derleme eklentisi olmadan çalışır, sınıflar bileşene kapalıdır, iskelet aşamasında öğrenme ve bakım yükü en düşük seçenektir. Ekranlar büyüyünce bir bileşen kütüphanesine ya da Tailwind'e geçmek bu yapıyı bozmadan mümkün.

## Metinler

Bütün arayüz metinleri `src/lib/i18n/tr.ts` içinde; bileşenler `t` üzerinden okur. İP12'den itibaren yeni alanların metinleri `src/lib/i18n/messages/<alan>.ts` dosyalarında: site ve kayıt `site.ts` (`siteText`), hukuk metinleri `legal.ts`. Başka bir dil, aynı yapıda (`Messages` tipi) ikinci bir dosya ve `src/lib/i18n/index.ts` içinde dil seçimi demek. Bir birim testi, veritabanındaki her enum değerinin (parsel durumu, cinsiyet, aşı, sağlık sınıfı…) Türkçe karşılığı olduğunu denetler.

## Sahip portalı (İP8)

Sahip (`owner`) ve hissedar (`viewer`) için `/portal`. Zincir: **Bahçelerim → parsel karnesi → sağlık haritası → ağaç karnesi → fotoğraf geçmişi → 360° gezi.** Telefon öncelikli: 800 px'in altında her şey tek sütun, harita ve panorama ekranın büyük kısmını alır, haritada ağaca dokununca panel görünür alana kayar.

### Ekranlar

| Adres                                 | Ne gösterir                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/portal`                             | Her parsel: konum, ağaç sayısı, son yayımlanmış denetimin tarihi, **genel durum skoru** ve değişimi (▲ ▼), sınıf dağılımı çubuğu, acil bulgu sayısı                                                                                                                                                 |
| `/portal/parsel/<parsel>`             | **Karne:** son denetimin özeti (ağaç sayısı; sağlıklı / dikkat / sorunlu / kurumuş / yok / değerlendirilmedi, yüzdeleriyle), önceki denetime göre kötüleşen ve iyileşen ağaçlar, **sağlık haritası**, önem sırasıyla bulgular, karnede gösterilen ölçümlerin özeti, ziyaret geçmişi, "Yazdır / PDF" |
| `…?sinif=problem,dead#harita`         | Haritayı o sınıflarla açar (karnedeki sınıf kutuları bu bağlantıyı kullanır)                                                                                                                                                                                                                        |
| `…?bulgu=<bulgu>#harita`              | Parsel düzeyindeki bir bulguyu haritada seçer                                                                                                                                                                                                                                                       |
| `/portal/parsel/<parsel>/agac/<ağaç>` | **Ağaç karnesi:** kod, yer türü, cinsiyet, aşı, yaş sınıfı, çeşit, envantere giriş; son sınıf ve kimin verdiği; durum geçmişi; ölçüm geçmişi (ziyaret × metrik); fotoğraf geçmişi (satır ziyaret, sütun yön; yakın planlar ayrıca; her fotoğrafın hash'inin ilk 8 hanesi); bulgular ve öneriler     |
| `/portal/parsel/<parsel>/gezi`        | **360° gezi** (`?agac=<ağaç>`: ağaca en yakın panoramada ağaca dönük açılır; `?panorama=<asset>`)                                                                                                                                                                                                   |

### Kurallar

- **Sadece yayımlanmış ziyaretler.** Kural veritabanında (satır bazlı yetki, `media` alanının kuralı). Portal ayrıca bütün sonuç sorgularını parselin `published` ziyaretleriyle sınırlar; bir kullanıcı hem sahip hem kurum rolündeyse de portalda yayımlanmamış sonuç görmez. Entegrasyon testi ikisini birden denetler.
- **Ziyaretin sınıfı:** aynı ziyarette uzman > model > AI, sonra en yeni satır (`src/lib/portal/classes.ts`). Karnedeki dağılım ve değişim bunu kullanır. Değerlendirmesi olmayan aktif ağaç "Değerlendirilmedi" sayılır.
- **Harita rengi** `tree_latest_assessment` görünümünden gelir (önce en yeni ziyaret, aynı ziyarette kaynak önceliği). Böylece son denetimde bakılmayan bir ağaç önceki denetimin rengini korur. Sorgu ortak (`fetchLatestAssessments`, `src/lib/parcels.ts`): uzman, ofis ve operasyondaki parsel haritası da aynı görünümü kullanır; portal ayrıca sadece yayımlanmış ziyaretlerin satırlarını renklendirir.
- **Değişim:** iki ziyarette de sınıfı olan ağaçlar karşılaştırılır; sıra sağlıklı < dikkat < sorunlu < kurumuş = yok. Kurumuş → yok değişim sayılmaz.
- **Kimin kararı:** "Uzman onaylı" (yeşil, ✓), "Otomatik onay" (toplu onaylanmış AI), "Yapay zekâ ön değerlendirmesi (uzman onayı yok)". Turuncu rozet uzman onayı olmadığını gösterir.
- **Ölçümler:** sadece `card_visibility = shown` metrikler. Aynı ziyarette uzman > algoritma > saha ekibi > AI.
- **Bulgular:** önem (acil, önemli, düşük, bilgi), aynı önemde önce bahçe geneli, sonra sıra/pozisyon sırasıyla. Ağaç bulgusu ağaç karnesine, parsel bulgusu haritadaki konumuna gider. Haritada bulgular önem renginde halka; konum sırasıyla bulgunun kendi `location`'ı, ağacı, bölgesi (`zone`).
- **Sade dil:** sınıflar ve önem dereceleri tek cümlelik açıklamalarla (`t.portal`).
- **Otomatik onay:** toplu onay (uzman paneli) `source = expert`, `auto_approved = true` satırı yazar; `approvalOf` önce bayrağa bakar, yani bu ağaçlar "Uzman onaylı" değil "Otomatik onay" rozetiyle görünür.

### Genel durum skoru ve denetim güveni (v0.2)

`src/lib/portal/score.ts` (saf TS, birim testli):

- **Skor (0–100):** ağaç sınıflarının ağırlıklı ortalaması, tam sayıya yuvarlanır. Ağırlıklar `docs/metodoloji.md` bölüm 9: sağlıklı 100, dikkat 60, sorunlu 20, kurumuş 0, yok 0. Değerlendirilmemiş ağaçlar hesaba girmez; hiç değerlendirilmiş ağaç yoksa skor yok.
- Ağırlıklar metodoloji sürümüne göre tek yapılandırmada (`SCORE_RULES`); bilinmeyen sürüm varsayılanı kullanır.
- **Değişim:** gösterilen (yuvarlanmış) iki skorun farkı, önceki değerlendirilmiş yayımlanmış ziyarete göre; ▲ arttı, ▼ azaldı, "=" aynı. İlk denetimde "İlk denetim".
- Bahçelerim listesinde ve karnenin üstünde, yanında "Ağaçların sınıflarına göre ağırlıklı ortalama" açıklaması ve ağırlıklar.
- **Denetim güveni** (karnede): kapsanan ağaç oranı (bu ziyarette en az iki yönden kesiti olan aktif ağaçlar; `docs/metodoloji.md` bölüm 10), uzmanın tek tek incelediği oran (sınıfı toplu onay olmayan uzman kararından gelen aktif ağaçlar), toplu onay notu ve metodoloji sürümü.

### Soru bırakma (v0.2)

- **Sahip ve hissedar:** ağaç karnesinin altındaki "Sorular" bölümünde ağaca ya da ağacın bir bulgusuna soru yazar; karnede bahçenin bütün soruları listelenir ve bahçe geneli bulgulara soru sorulabilir. Dizide cevap da yazılabilir (takip sorusu).
- **Uzman (ve operasyon):** `/uzman/sorular`; cevap bekleyenler önce (`?durum=acik` varsayılan, `?durum=tum`). Kuyruk sayfasında "Sorular (N cevap bekliyor)" bağlantısı. Dizinin son mesajı uzman ya da operasyondansa "Cevaplandı".
- **Düzenleme:** sadece yazan, sadece metni, yazdıktan sonra 15 dakika içinde ("düzenlendi" notu). Silme yok. Gerekçe: yazım hatası düzeltilebilsin, ama cevaplanmış bir soru sonradan değişmesin; kayıt bir denetim belgesi.
- **Yetki** veritabanında (`question`, `question_reply`; migration `20261023130100_questions.sql`, pgTAP `22_questions.test.sql`): sahip ve hissedar sadece kendi parselinin sorularını görür ve oraya yazar; yayımlanmamış bir bulguya soru soramaz. Uzman ve operasyon kurumun bütün sorularını görür ve cevaplar. Saha personeli görmez. Yazar, rol (`author_role`) ve işletme tetikleyiciyle doldurulur; istemci uyduramaz.
- **Kişisel veri:** soru metni sahibin serbest metnidir; LLM'e gönderilmez, AI worker bu tabloları okumaz.
- **Bildirim yeri:** her yeni soru ve cevapta `private.on_question_activity()` tetikleyicisi `pg_notify('question_activity', …)` gönderir (sadece kimlikler, metin yok). Bildirim işi bu fonksiyonun gövdesini kendi kuyruğuna yazacak şekilde değiştirebilir.
- Kod: `src/lib/portal/questions.ts` (sorgular, yazmalar, saf dizi kurma), `src/lib/expert/questions.ts` (uzman filtresi), `src/components/portal/question-threads.tsx` (iki bölümde ortak).

### 360° gezi

- Son yayımlanmış ve panoraması olan ziyaret. Aynı panoramanın tam ve önizleme görüntüsü (`pose.variant`) `pose.gps_time_ns`'ten (yoksa konumdan) eşlenir. Önce önizleme yüklenir, yakınlaştırınca (zoom > 55) tam çözünürlüğe geçilir.
- Komşu oklar: 8 yön diliminin her birinde 20 m içindeki en yakın panorama. Ok, panoramanın `heading_deg`'ine göre yönü hesaplanmış bir işaretçi; tıklayınca o panoramaya aynı yöne bakarak geçilir.
- Haritada bir yere dokununca en yakın panorama açılır ve dokunulan noktaya döner.
- **Ağaç işaretçileri:** 14 m içindeki ağaçlar, sınıf rengiyle. Yön = ağacın azimutu − `heading_deg` (orta sütun `heading_deg`, azimut saat yönünde; `services/pipeline/README.md`). Yükseklik açısı kamera 1,8 m, hedef 1,5 m varsayımıyla. Tıklanınca ağaç karnesi.
- Görüntü yoksa ya da açılamazsa tarayıcıda üretilen bir yer tutucu panorama gösterilir (gökyüzü, zemin, gerçek yönlerinde K/D/G/B harfleri); oklar ve ağaçlar yine çalışır. Demo verisi bu durumu gösterir.
- Görüntü adresleri bir server action ile (`gezi/actions.ts`) panorama değiştikçe imzalanır; sadece o parselin yayımlanmış ziyaretlerindeki `panorama` kayıtları imzalanır.

### Medya (`src/lib/media/`)

Portal, uzman paneli (kesitler) ve ofis aracı (depodaki panoramalar) kullanır; arayüz bilinçli olarak küçük:

```ts
import { createMediaSigner } from "@/lib/media/signer";
const signer = createMediaSigner(supabase, { scope: user.id });
const urls = await signer.signUrls(rows.map((r) => r.uri)); // Map<uri, string | null>
```

- `parseMediaUri("storage://media/<ad>")` → `{ bucket, path }`; biçimi bozuk, `..` içeren ya da başka şemadaki (`station://`) adresler `null`.
- Toplu imzalama: bucket başına `createSignedUrls`, 200'lük partiler. İmzalı adres 15 dakika geçerli.
- **Önbellek:** süreç içinde, 5 dakika, en çok 5000 kayıt; anahtar `scope` (kullanıcı kimliği) + adres, yani bir kullanıcı için imzalanmış adres başkasına verilmez. Reddedilen imzalar önbelleğe alınmaz.
- Dosya yoksa, imzalama reddedilirse (ör. yayımlanmamış ziyaret) ya da istek başarısız olursa değer `null`; arayüz yer tutucu gösterir.

### PDF

"Yazdır / PDF" düğmesi tarayıcının yazdırma penceresini açar; "PDF olarak kaydet" yeterli. Yazdırma stilleri üst menüyü, düğmeleri, filtreleri ve paneli gizler, katlanmış bulgu listesini açar; harita tuvali yazdırılabilir (`preserveDrawingBuffer`).

### Sınır kartı ve envanter özeti

Karnenin üstünde **Bahçe sınırı** kartı (`src/lib/portal/boundary.ts`, `boundary-card.tsx`): son sınır sürümü haritada, alanı (m² ve dönüm), kaynağı, köşe belirsizliği; sahibin beyan ettiği ilk sınır soluk kesikli çizgiyle. Not her zaman görünür: "Bu sınır, gösterdiğiniz fiili kullanım sınırıdır; tapu ya da mülkiyet sınırı değildir."

- Son sürüm onaylanmamış bir saha ölçümüyse sahip onay kutusunu işaretleyip **Sınırı onaylıyorum** der (`approve_boundary`). Onaylandıysa "Siz / Parsel sahibi … tarihinde onayladı" görünür.
- Hissedar (`viewer`) onaylayamaz (veritabanı kuralı: sadece `owner`); kartta düğme yerine bu açıklama çıkar.
- Envanter uzman tarafından onaylandıysa karnede **Envanter** özeti (yer, ağaç, boş yer, ara ağaç, aşısız, yaş dağılımı) ve onay tarihi.

### Demo

```bash
pnpm db:reset && pnpm db:demo     # repo kökünde
pnpm web:dev                      # owner@example.com / orchados-dev
```

`/portal` → "Örnek Bahçe 1": 14 Ekim denetimi (302 ağaç; 232 sağlıklı, 40 dikkat, 16 sorunlu, 13 kurumuş, 1 değerlendirilmedi), 30 bulgu, kuru dal ölçek dağılımı. 18 Ekim denetimi incelemede olduğu için görünmez. Görüntü dosyaları demo verisinde yok: fotoğraflar "Görüntü yok", gezi yer tutucu panoramayla açılır.

### Testler

- Birim: `src/lib/portal/score.test.ts` (skor, değişim, denetim güveni), `src/lib/portal/questions.test.ts` (metin, düzenleme süresi, dizi sırası ve cevap durumu), `src/lib/portal/portal.test.ts` (ziyaret sınıfı, dağılım, değişim, onay türü, harita durumu, ziyaret zamanı, bulgu sırası ve konumu, ölçüm özeti, panoramada yön ve yükseklik açısı, komşu panoramalar, varyant eşleme), `src/lib/media/media.test.ts` (adres ayrıştırma, toplu imzalama, önbellek).
- Entegrasyon: `tests/integration/portal-questions.test.ts` (soru ve cevap yetkileri: sahip/hissedar kendi parseli, yayımlanmamış bulgu yok, saha personeli hiçbir şey, uzman başka işletmeyi görmez, sadece yazan ve 15 dakika içinde düzenler). `tests/integration/portal.test.ts` ve tarayıcı (`tests/e2e/portal-owner.spec.ts`) testleri kendi verilerini `tests/integration/portal-fixture.ts` ile kurar: ayrı bir işletme, üç kullanıcı (`portal-owner@`, `portal-viewer@`, `portal-other@example.test`), iki parsel; parsel A'da iki yayımlanmış ve bir incelemedeki ziyaret, depoda gerçek küçük PNG'ler. `capture`/`asset`/`measurement` API'den silinemediği için temizlik, yerel veritabanı konteynerinde (`supabase_db_orchados`, `SUPABASE_DB_CONTAINER` ile değişir) tetikleyiciler kapalıyken SQL ile yapılır; başta da çalışır, yarıda kalan bir koşu sorun çıkarmaz.
- Tarayıcı: sahip olarak giriş → Bahçelerim → karne → haritada ağaç → ağaç karnesi (fotoğraf yüklenir, eksik fotoğraf yer tutucu); sınıf filtresi ve parsel bulgusu; yayımlanmamış sonucun görünmemesi; gezi (ağaca dönük açılış, önizleme → tam çözünürlük, ok ile geçiş, yer tutucu, ağaç işaretçisinden karneye); 390 px ekranda yatay taşma olmadan karne, harita ve ağaç karnesi.

## Ofis üçgenleme aracı (İP5)

Envanterde ağaç konumları sahada tek tek alınmaz: ofisteki kişi grid taramanın panoramalarında her gövdeye iki (ya da daha çok) panoramadan tıklar, araç konumu üçgenler, sıraları oturtur, yerlere kod verir, boş yerleri bulur ve doğrulama listesini çıkarır (`docs/MVP.md` Modül 2). Saha personeli ve operasyon rolleri için: `/ofis/parsel/<parsel>` sayfasındaki **Envanter üçgenleme aracı** düğmesi → `/ofis/parsel/<parsel>/envanter`.

### Kullanım

1. **Oturum ve panorama seti:** Oturum listesinde parselin envanter oturumları (`session.kind = inventory`, en yenisi önce) çıkar; envanter oturumu yoksa en yeni tarama oturumu (`periodic_scan`). Panorama seti, işleme hattının depoya yüklediği panoramalardır (aşağıda); oturumla eşleşen set önce gelir. Geliştirmede yerel klasördeki setler de listelenir ("yerel klasör"; oturum kimliği eşleşmeyen sentetik veri "geliştirme verisi" notuyla).
2. **Üçgenleme:** Haritada bir ağacın yakınına tıklayınca en yakın panorama ve ona en az 2 m uzaklıktaki en yakın ikinci panorama sağda açılır, ikisi de tıklanan noktaya döner. Önce önizleme (2K) yüklenir; yakınlaştırınca (zoom > 55) varsa tam çözünürlüğe (4K) geçilir. Her panoramada gövdeye tıklanır; her tık haritada bir yön çizgisidir. İki çizgiden sonra aday konum, belirsizliği ve kesişme açısı görünür. **Ağacı ekle** (Enter) ağacı ekler, **Temizle** (Esc) çizgileri siler. "Önceki/Sonraki" ile başka panoramaya geçip üçüncü bir çizgi eklenebilir.
   - Uyarılar: belirsizlik 0,5 m'yi aşarsa, çizgiler arasındaki en büyük açı 15°'nin altındaysa, kesişim bir panoramanın arkasında kalıyorsa ya da üç ve daha çok çizgi birbiriyle uyuşmuyorsa. 1°'nin altındaki çizgiler hiç kesiştirilmez.
   - Haritadaki ağaç tıklanınca seçilir: **Emin değilim** işareti, **Sil** (Delete), sürükleyerek elle kaydırma ("elle kaydırıldı" diye işaretlenir).
   - Panoramalarda daha önce eklenmiş ağaçlar yeşil işaretle gösterilir; aynı ağacı iki kez eklememeye yardım eder.
3. **Kodlama:** Sıra yönü ve başlangıç köşesi parsel kaydındaysa oradan gelir ve değiştirilemez. Yoksa kullanıcı seçer (**Ağaçlardan tahmin et** ve **+90°** yardımcı olur); kaydedince parsele yazılır ve bir daha değişmez (veritabanı tetikleyicisi). Özet (sıra, yer, ağaç, boş yer, ara ağaç), oturtulan sıra yönü, sıra ve ağaç aralığı ve yer tablosu görünür; haritada sıra doğruları kesikli çizgi, boş yerler kırmızı halka.
4. **Doğrulama listesi:** "Emin değilim" işaretli ağaçlar, belirsizliği 0,5 m'yi aşanlar, üçgenleme uyarısı olanlar, boş yerler, sıra doğrusundan uzak (`sıra dışında`) ve aynı pozisyonda ikinci gövde (`çift gövde`) olanlar. **CSV olarak indir**: UTF-8 (BOM'lu), virgülle ayrılmış; sütunlar `kod,neden,enlem,boylam,belirsizlik_m`.
5. **Kaydet:** Önizleme onaylanınca yerler, ağaçlar ve gövde tıklamaları **tek işlemde** `save_inventory(...)` veritabanı fonksiyonuyla, kullanıcının kendi yetkisiyle yazılır (aşağıda); servis anahtarı kullanılmaz. Kodlar sunucuda, tarayıcıdaki önizlemeyle aynı fonksiyonla ağaç konumlarından yeniden hesaplanır. Parselde zaten yer ya da ağaç varsa kaydetme engellenir ve neden gösterilir (mevcut envanteri değiştirme akışı sonra).

Çalışma, kaydedilene kadar tarayıcının `localStorage`'ında parsel + oturum başına taslak olarak tutulur (sayfa yenilenince kaybolmaz). Taslakta her ağacın tıklamaları (panorama, azimut, yatay ve dikey açı, tıklama zamanı) da durur; kayıtla birlikte gövde etiketi olarak veritabanına geçer.

### Kayıt: `save_inventory`

Migration: `supabase/migrations/20261021120000_inventory_chain.sql`, pgTAP: `supabase/tests/15_inventory_chain.test.sql`.

- **Tek işlem, kullanıcının yetkisiyle** (security invoker): yerler (`slot`), her ağaçlı yer için aktif bir ağaç (`tree`, `first_seen_session_id` = seçilen oturum, `first_seen_at` = oturum başlangıcı) ve ağacın gövde etiketleri (`trunk_label`). Bir satır geçersizse (aynı kod, sınır dışı açı, panorama olmayan bir asset…) hiçbir şey yazılmaz.
- **Kim:** parselin işletmesinde saha personeli ya da operasyon. Satır bazlı yetki uzmanın da yer ve ağaç yazmasına izin verdiği için fonksiyon rolü ayrıca denetler; uzman ve sahip `forbidden` alır.
- **Numaralandırma:** parselde kayıtlıysa aynısı olmalı (`numbering_mismatch`); değilse fonksiyon parsele yazar. Parseli sadece operasyon güncelleyebildiği için saha personeli `numbering_forbidden` alır; araç bunu önceden söyler.
- **Mevcut envanter:** parselde yer ya da ağaç varsa `existing_inventory` (ayrıntı: `yer/ağaç`). Aynı parsele eşzamanlı iki kayıt sırayla çalışır (işlem kilidi), ikincisi bu hatayı alır.
- Hata nedenleri hata mesajında gelir; web uygulaması bunları Türkçe metne çevirir (`t.office.saveErrors`).

**Gövde etiketleri** (`trunk_label`, `docs/veri-modeli.md` "Etiketli veri"): her tıklama için panorama asset'i (depo kaynağında; yerel kaynakta boş), karenin GPS zamanı, panoramadaki yatay ve dikey açı, mutlak azimut, ağaç ve yer, "emin değilim" ve "elle kaydırıldı" işaretleri, kim ve ne zaman. Ekleme-yalnız; sadece kurum rolleri görür, sahip ve hissedar görmez.

### Hesaplama (`src/lib/office/`, saf TypeScript, birim testli)

- **Yerel çerçeve** (`local-frame.ts`): WGS84 → doğu/kuzey metre, işleme hattının `LocalFrame`'iyle aynı formül. Çerçeve başlangıcı `parcel.local_origin`, yoksa sınırın merkezi.
- **Üçgenleme** (`triangulate.ts`): Tık → azimut = panorama `heading_deg` + tıklanan yaw (panorama yan dosyası kuralı: orta sütun `heading_deg`, sağa doğru artar). Çizgiler dik uzaklıklarının ağırlıklı en küçük kareleriyle kesiştirilir; ağırlık `1 / (sd_h² + (mesafe × 0,5°)²)`. Belirsizlik, 1σ hata elipsinin büyük yarı ekseni; ikiden çok çizgide artıklar beklenenden büyükse büyütülür.
- **Sıra oturtma ve kodlama** (`rows.ts`): Ağaçlar sıra yönüne (u) ve ona dik yöne (v) izdüşürülür. Yön, verilen değerin ±3° çevresinde v-izdüşümlerinin histogram yoğunluğuyla, sonra sıralar içindeki eğimin en küçük kareleriyle inceltilir. Sıralar v'deki boşluklarla ayrılır (eşik: tipik sıra aralığının yarısı); sıra aralığının %60'ından yakın küçük kümeler komşu sıraya katılır. Ağaç aralığı sıralar içindeki ardışık aralıkların medyanından, eksik ağaçları (tam katlar) hesaba katarak bulunur; bütün sıralar ortak bir ızgarayı (a0 + k × aralık) paylaşır.
  - Izgara noktasına aralığın ¼'ünden yakın ağaç: sıra yeri. Daha uzaksa: **ara ağaç**, numaralandırma yönünde önceki yerin kodu + harf (`S5-12a`, `b`…). Aynı noktada ikinci gövde: ara ağaç + `çift gövde`.
  - **Boş yer:** sıranın ilk ve son ağacı arasında ağaçsız ızgara noktası; parselin sınırı varsa sıranın uçlarından sınır içinde kalan noktalar da (sıra başı ve sonundaki eksik ağaçlar). Konumu sıra doğrusu üzerindeki ızgara noktası.
  - **Numaralandırma:** Seçilen köşeye en yakın ağacın sırası 1. sıradır, pozisyonlar o ağacın bulunduğu uçtan başlar. Pozisyon her sırada o sıranın ilk beklenen yerinden sayılır (sahada sıra sayımıyla bulunur).
- **Doğrulama listesi** (`verification.ts`), **önizleme ve kayıt için ortak hesap** (`plan.ts`), **kayıt** (`inventory.ts`).

### Panorama kaynağı

`PanoramaSource` arayüzü (`src/lib/office/panoramas.ts`) bir parselin panorama setlerini, bir setin panoramalarını (konum, yön, zaman, kalite, hangi görüntülerin olduğu) ve görüntülerini verir. Görüntüler `/ofis/panorama/<set>/<panorama>/<2k|4k>` route handler'ından, `/ofis` bölümüne girebilen kullanıcılara sunulur (`2k` önizleme, `4k` tam çözünürlük). Set kimliği kaynağın adıyla başlar (`storage-…`, `local-…`).

- **Depo** (`storage-panorama-source.ts`, her zaman açık): işleme hattının yüklediği `kind = panorama` asset satırları (`orchados-pipeline upload`, `services/pipeline/README.md` "Yükleme"). Oturum + hat sürümü başına bir set; yeniden işleme yeni bir set olarak görünür. Bir karenin tam ve önizleme satırları `pose.gps_time_ns` ile (yoksa konumla) eşlenir; `pose.variant` yoksa `full` sayılır (`src/lib/media/panorama-variants.ts`, portal gezisiyle ortak). Konum `asset.position`, yön `pose.heading_deg`, belirsizlik `position_uncertainty_m`, kalite `pose.quality` ve `quality_score`. Route handler görüntüyü kullanıcı adına imzalanmış 15 dakikalık bir adrese yönlendirir (302, `createMediaSigner`); sorgular ve imzalar satır bazlı yetkiyle çalışır, sahip yayımlanmamış bir oturumun panoramasını göremez. Kamera yüksekliği ziyaretin kaydından gelir (`session.camera_height_m`, ön kontrolde personel ölçüp girer); kayıt yoksa 2,0 m kabul edilir (sadece panoramadaki ağaç işaretçilerinin yüksekliği için).
- **Yerel klasör** (`local-panorama-source.ts`, geliştirme): `LOCAL_PANORAMA_DIR` verilirse depoya ek olarak listelenir. Bu klasörün altında (4 seviyeye kadar) `panoramas.json` içeren her klasör bir settir (işleme hattının çalıştırma klasörü). Oturum ve parsel kimliği, kamera yüksekliği `manifest.json`'dan okunur. Sadece `panoramas.json`'da listelenen ve çalıştırma klasörünün içinde kalan dosyalar sunulur. **Sadece geliştirmede açık:** üretim derlemesinde `LOCAL_PANORAMA_ALLOW_PRODUCTION=1` olmadıkça devre dışıdır (tarayıcı testleri üretim derlemesine karşı çalıştığı için bunu kullanır). Yerel kaynaktan kaydedilen etiketlerde panorama asset'i boştur, kare GPS zamanıyla tanımlanır.

**Depodan bir oturumla kullanım:**

1. Operasyon parsel için bir envanter oturumu açar; saha ekibi taramayı yapar.
2. İşleme istasyonunda: `uv run orchados-pipeline run <oturum> --upload --session-id <oturum uuid>` (ya da `upload <çalıştırma> --session-id <uuid>`). Önizlemeler varsayılan olarak yüklenir; tam çözünürlük için `--only preview,panorama,tree_crop,trajectory`.
3. `/ofis/parsel/<parsel>` → **Envanter üçgenleme aracı**. Oturum ve "v0.1.0_… · N panorama · depo" seti seçili gelir → **Aracı aç**.
4. Ağaçlar üçgenlenir, kodlanır, doğrulama listesi indirilir; **Kaydet** sekmesinde önizleme onaylanıp **Veritabanına kaydet**. Sonuç: "N yer ve M ağaç kaydedildi. K gövde tıklaması etiket olarak saklandı."

### Geliştirme verisi

```bash
pnpm db:start && pnpm db:reset          # repo kökünde
cd apps/web && pnpm office:dev-data     # ~40 sn; uv gerekir
```

Betik (`scripts/office-dev-data.mjs`):

1. `services/pipeline` içinde `uv run orchados-pipeline synth` ve `run` ile sentetik bir oturum (3 sıra × 4 = 12 ağaç, 19 panorama) üretir: `apps/web/.dev-data/office/session` ve `.../runs` (git'e girmez).
2. Yerel Supabase'e (servis anahtarı `supabase status`'tan; sadece yerel) sentetik bahçenin yerinde, yeri ve ağacı olmayan bir parsel ("Sentetik Bahçe (üçgenleme, geliştirme)"), sınırı ve bir envanter oturumu ekler. Sıra yönü ve köşe boş bırakılır; araçta seçilir (sentetik bahçe için: güneybatı, 0°).

Çıktıdaki `LOCAL_PANORAMA_DIR=...` satırı `.env.local`'e eklenir ve `pnpm web:dev` yeniden başlatılır; `ops@example.com` ile girip betiğin yazdığı adres açılır. Seçenekler: `--force` (panoramaları yeniden üret), `--reset` (kaydedilmiş envanteri ve parseli silip baştan kur), `--skip-panoramas`, `--skip-db`, `--out <klasör>`.

Geliştirme parseli örnek işletmeye eklendiği için entegrasyon testlerindeki görünürlük listelerini bozar; testlerden önce `pnpm db:reset`.

### Testler

- Birim: `triangulate.test.ts`, `rows.test.ts` (tohumlu pseudo-rastgele gürültü, eksik ve ara ağaçlı ızgaralar; 12 rastgele bahçe), `verification.test.ts`, `plan.test.ts`, `panoramas.test.ts` (yerel kaynak, yol dışına çıkma denemeleri; depo satırlarından panorama eşleme: tam + önizleme, `variant` yoksa `full`, `gps_time_ns` yoksa konum; set kimlikleri; oturum seçimi).
- Entegrasyon (`tests/integration/office-inventory.test.ts`): test kendi parsellerini kurar, birine iki panorama karesini depoya yükler (biri tam + önizleme, biri sadece önizleme). Saha personeli kaydeder (yer, ağaç, 3 etiket tek çağrıda); etiketler saklanır, uzman görür, sahip görmez, etiket değiştirilemez ve silinemez; hatalı bir etiket satırında hiçbir şey yazılmaz; ikinci kayıt engellenir; operasyon numaralandırmayı parsele yazar, saha personeli yazamaz; uzman ve parseli gören sahip kaydedemez (`forbidden`); erişimi olmayan göremez. Depo kaynağı: setler, kareler, varyantlar, imzalı adresten gelen baytlar; sahip yayımlanmamış oturumun panoramalarını göremez.
- Tarayıcı (`tests/e2e/office-tool.spec.ts`): global kurulum sentetik panoramaları `.dev-data/e2e` altına üretir (uv yoksa test atlanır). Test aynı panoramaları depoya da yükler (servis anahtarıyla, işleme hattının yazdığı biçimde) ve iki kez çalışır: depo seti ve yerel set. Her seferinde 12 ağacın her birine iki panoramada tıklar, konumları sentetik gerçekle (< 30 cm) ve kodları `synthetic_truth.json`'daki yer kodlarıyla karşılaştırır, önizlemeden yakınlaştırınca tam çözünürlüğe geçişi denetler, bir ağacı "emin değilim" işaretler, CSV'yi indirir, kaydeder ve veritabanını (yerler, numaralandırma, 24 gövde etiketi) denetler. Ayrı bir test görüntü adreslerini denetler: yerel dosya, depoda yönlendirme, sahip için 403.
- Temizlik: `capture`/`asset`/`trunk_label` API'den silinemediği için test parselleri `tests/local-db.ts` ile yerel veritabanı konteynerinde, tetikleyiciler kapalıyken silinir (`purgeParcels`).

### Envanter sonrası: özellikler, altyapı, sınır, doğrulama turu

Üçgenleme aracında kayıt yapıldıktan sonra `/ofis/parsel/<parsel>/envanter/duzenle` (parsel sayfasındaki **Özellikler, altyapı, sınır ve doğrulama** düğmesi; aracın kayıt mesajındaki bağlantı doğrulama sekmesini açar). Solda kayıtlı yerler (ağaç, ara ağaç, boş yer), altyapı, son sınır ve tarama izi (envanter oturumunun panorama konumları, çekim sırasıyla); sağda dört sekme (`?sekme=attributes|infrastructure|boundary|verification`):

- **Ağaç özellikleri:** yaş sınıfı ve aşı durumu; karar verilemeyen "Bilinmiyor" kalır. Toplu seçim: sıra seçip "görünenlerin hepsi", haritada tıklama (Shift ile çoklu), tablodan işaretleme. Satır bazlı yetkiyle `tree` güncellemesi (saha personeli, uzman, operasyon).
- **Altyapı** (`zone`): kuyu, havuz, kapı, kulübe tek tıkla nokta; sulama hattı ve çit köşe köşe çizgi. Silme sadece operasyonda (satır bazlı yetki).
- **Sınır:** sahada köşe işaretleme gelene kadar tarama izi üzerinde köşeler tıklanır; alan (m², dönüm) ve kesişme denetimi anında (`src/lib/office/boundary.ts`). Kayıt yeni bir `boundary` sürümüdür: kaynak `field_survey`, köşe belirsizliği, envanter oturumu. Eski sürümler kalır; sahip portalda onaylar.
- **Doğrulama:** liste kayıtlı envanterden yeniden hesaplanır (`src/lib/office/verification-candidates.ts`): "emin değilim" etiketli ağaçlar (`trunk_label.unsure`), belirsizliği 0,5 m'yi aşanlar, boş yerler, başka bir ağaca 1 m'den yakın ara ağaçlar (çok gövdeli). Üçgenleme uyarısı ve "sıra dışında" veritabanında saklanmadığı için bunlar haritada tıklanarak eklenir. Her kaleme "fidan olabilir" / "çok gövdeli" ve not eklenir. **Doğrulama turu oluştur:** `create_verification_tour(...)` `planned` bir `verification` oturumu ve kalemleri açar. Açık kalemi olan yerler yeni listeye girmez.
- **Kalemleri kapatma** (saha uygulaması gelene kadar, telefonla doğrulama dahil): "Ağaç var / Ağaç yok" + not → **Bakıldı olarak kaydet** (`record_verification_result`; boş yere yeni ağaç ekler ya da ağacı kayıp yapar), ya da notla **Bakmadan kapat** (`close_verification_item`). Bütün kalemlere bakılınca tur `captured` olur.

Yazmalar `src/lib/office/inventory-edits.ts` (girdi denetimi + kullanıcının yetkisi), veri `src/lib/office/inventory-workspace.ts`. Envanter onaylandıktan sonra sayfa bunu bildirir; yer kodu ve konumu değiştiren yazmalar veritabanında reddedilir.

### Bilinen sınırlar

- **Yer–oturum bağı yok:** `slot` tablosunda oturum alanı yok; oturum bağı ağaçların `first_seen_session_id`'si ve etiketlerin `session_id`'si üzerinden.
- **Numaralandırmayı yalnızca operasyon yazabilir** (RLS: `parcel` güncellemesi `ops`). Sıra yönü kayıtlı olmayan parselde saha personeli kaydedemez; araç bunu önceden söyler.
- **Yatay üçgenleme:** tıklamanın yükseklik açısı kullanılmıyor (kamera yüksekliğiyle tek panoramadan mesafe tahmini yapılabilirdi). Depo kaynağında kamera yüksekliği 2,0 m kabul edilir.
- **Izgara varsayımı:** sıralar paralel ve aynı aralıklı ızgarada kabul edilir; şaşırtmalı (üçgen) dikim, eğri sıralar ve tamamen boş bir sıra algılanmaz.
- **Taslak tarayıcıda:** başka bir bilgisayardan devam edilemez.
- **Set seçimi serbest:** depo setinin oturumu seçilen oturumdan farklı olabilir (uyarıyla listelenir); etiketler kaydın oturumuna bağlanır.
- **Büyük ziyaret:** set listesi parselin bütün panorama satırlarını sayfa sayfa okur; çok ziyaretli parsellerde bir görünüm ya da sayım fonksiyonu gerekebilir.

### Envanter onayı testleri

- Birim: `src/lib/expert/inventory-checks.test.ts` (yinelenen kod, atlanan sıra/pozisyon/harf, yakın ağaçlar, envanter özeti), `src/lib/office/boundary.test.ts` (alan, dönüm, kesişme, sürüm, EWKT), `src/lib/office/verification-candidates.test.ts`, `src/lib/office/inventory-messages.test.ts`.
- Entegrasyon (`tests/integration/inventory-approval.test.ts`): kendi parseliyle; toplu özellik (sahip yazamaz), altyapı (silme sadece operasyon), ofiste sınır sürümü, doğrulama turu (uzman ve sahip oluşturamaz, sahip kalemleri görmez), açık kalemle onayın reddi ve eksik listesi, sonuçların envantere işlenmesi, uzman dışı rollerin onaylayamaması, `inventory_done`, onaydan sonra kod/konumun donması ve özelliklerin değişebilmesi, hissedarın sınırı onaylayamaması, sahibin onayı ve karnedeki özet.
- Tarayıcı (`tests/e2e/inventory-approval.spec.ts`, veri `inventory-fixtures.ts`): ofiste toplu ve haritadan özellik, doğrulama turu oluşturma ve kalemleri kapatma; uzman olarak kuyruktan açma, düzeltme ve onay; hissedar onaylayamaz, sahip sınırı onaylar.

## Uzman paneli (İP7)

Uzman (ziraat mühendisi) bir tarama ziyaretini uzaktan inceler, AI ön değerlendirmesini kabul eder ya da düzeltir, bulgu ve öneri yazar, raporu imzalayıp yayımlar (`docs/MVP.md` Modül 4). Yayımlanana kadar sahip ve izleyici ziyaretin hiçbir sonucunu görmez (satır bazlı yetki, `docs/veri-modeli.md` "Yayın").

### Ekranlar

| Adres                          | Ne var                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/uzman`                       | **Ziyaret kuyruğu:** `processed` ve `in_review` durumundaki periyodik tarama ve doğrulama ziyaretleri, en eskisi önce; parsel, tarih, aktif ağaç, incelenen ve kalan sayısı. **Aç** düğmesi `processed` bir ziyareti `in_review`'a alır. Altta işletmenin parselleri.                                                                                                                                                                                                                                              |
| `/uzman/ziyaret/<oturum>`      | **Ağaç ağaç inceleme.** Solda sıra/pozisyon koduna göre sıralı ağaç listesi ve filtreler: _İncelenmemiş_, _Zorunlu inceleme_, _Kalite örneklemi_, _AI sorunlu dedi_ (AI sınıfı Sorunlu, Kuru ya da Yok), _Düşük güven_ (AI güveni %70'in altında ya da AI önerisi yok). Sağda seçili ağaç (`?agac=`): bu ziyaretin ve önceki yayımlanmış ziyaretin kesitleri yönlere göre yan yana, AI önerisi (sınıf, güven, model, ölçümler), önceki ziyaretin uzman sonucu, ağaç özellikleri, karar paneli ve ağacın bulguları. |
| `/uzman/ziyaret/<oturum>/ozet` | **Özet ve imza:** uzman sınıflarının dağılımı, tek tek bakılan / toplu onaylanan ağaç sayısı, zorunlu inceleme ve kalite örneklemi sayıları, örneklem uyuşmazlığı, toplu onay, önceki ziyarete göre sınıfı değişenler (kötüleşen/iyileşen), AI ile uyum, incelenmemiş ağaçlar, bütün bulgular, parsel bulgusu ekleme ve yayımlama.                                                                                                                                                                                 |

**Kesitler** `asset` satırlarından (`kind = tree_crop`, yön `pose.direction`), ortak medya yardımcısıyla (`src/lib/media/`, 15 dakikalık imzalı adres, kullanıcı başına önbellek) gösterilir. Dosya depoda yoksa ya da açılamazsa yerine "Görüntü yok" kutusu çıkar (demo verisinde dosya yok).

**Önceki ziyaret:** aynı parselin, bu ziyaretten önceki en yeni yayımlanmış periyodik tarama ya da doğrulama ziyareti (zaman: `started_at`, yoksa planlanan gün, yoksa kayıt zamanı).

### Zorunlu inceleme ve toplu onay (v0.2)

**Kurallar** `src/lib/expert/mandatory-review.ts` (saf TS, birim testli), metodoloji sürümü başına tek yapılandırma (`REVIEW_RULES`; bilinmeyen sürüm varsayılanı kullanır). Bir ağaç şu kurallardan birine takılırsa zorunlu incelemeye girer; listede kısa etiket, ağaç panelinde "Zorunlu inceleme" bölümünde hepsi görünür:

| Kural            | Ne zaman                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no_ai`          | Bu ziyarette AI önerisi yok (toplu onaylanamaz)                                                                                                                                                                                                         |
| `low_confidence` | AI güveni %70'in altında ya da güven yok                                                                                                                                                                                                                |
| `ai_flagged`     | AI sorunlu, kuru ya da yok önermiş                                                                                                                                                                                                                      |
| `class_changed`  | AI sınıfı önceki yayımlanmış ziyaretin uzman sınıfından farklı                                                                                                                                                                                          |
| `staff_conflict` | Personelin evet/hayır cevabı AI değeriyle çelişiyor: "evet" ama AI değeri yok (ölçek 0, `none`, `not_done`…); "hayır" ama AI değeri belirgin (ölçek 2–3, `marked`, `done`). Eşleşmeler yapılandırmada (ör. `dead_branch_present` ↔ `dead_branch_scale`) |
| `staff_problem`  | Personel "Sorun gördüm" demiş: `problem_seen` evet/hayır metriği (`source = staff`; migration `20261023130000_bulk_approval.sql`)                                                                                                                       |

Personel cevabı ve AI değeri olarak ziyaretteki en yeni `staff` / `ai` ölçümü okunur.

**Kalite örneklemi:** zorunlu kurala takılmayan ve AI önerisi olan ağaçların `ceil(%5 × n)` tanesi; ağaç kimliğinin ziyaret kimliğiyle birlikte hash'i (FNV-1a) en küçük olanlar. Tohum ziyaret olduğu için sayfa yenilense de aynı kalır; uzman karar verdikçe değişmez (aday kümesi kararlardan bağımsız). Örneklemdeki ağaçlar toplu onaya girmez, panelde "Kalite örneklemi" notuyla uzmanın önüne gelir.

**Toplu onay:** inceleme ve özet sayfasında "Kalanları toplu onayla (N ağaç)". Zorunlu incelemede ve örneklemde olmayan, AI önerisi olan ve uzman kararı olmayan ağaçlar için tek işlemde `bulk_approve_trees(...)` çağrılır:

- Her ağaç için `source = expert`, `auto_approved = true`, sınıfı ziyaretin en yeni AI (ya da model) satırının sınıfı olan bir değerlendirme; AI'ın değerleri "AI'ı kabul et"teki gibi uzman ölçümü olarak kopyalanır (`assessment_measurement`, kesitler kanıt). AI satırı değişmez.
- Veritabanı reddeder: uzman olmayan çağıran (`42501`), yayımlanmış ya da incelenemez ziyaret (`55000`), AI önerisi olmayan ya da zaten uzman kararı olan ağaç (`P0001`, ayrıntıda `no_ai: S1-6` / `decided: S1-2`). Bir ağaç reddedilirse hiçbiri yazılmaz.
- Form, uzmanın gördüğü ağaç sayısını da gönderir; o arada liste değiştiyse hiçbir şey yazılmaz ve "Liste değişti" uyarısı çıkar.
- Toplu onaylı bir ağaç sonradan tek tek düzeltilebilir (yeni karar, en yenisi geçerli).
- `publish_session` toplu onaylı satırları uzman kararı sayar ve imzalayan adına onaylar (pgTAP ve entegrasyon testinde doğrulandı).

**Özet:** tek tek bakılan ve toplu onaylanan ağaç sayısı, zorunlu inceleme (bekleyen), kalite örnekleminde bakılan ağaç sayısı ve **örneklem uyuşmazlığı** (örneklemde uzmanın AI'dan farklı sınıf verdiği oran). "AI ile uyum" artık sadece tek tek verilen kararları sayar.

**Sorular:** `/uzman/sorular`, bkz. sahip portalı "Soru bırakma".

### Karar

- **AI'ı kabul et:** AI satırı değişmez. AI sınıfıyla yeni bir `source = expert` değerlendirmesi yazılır; AI'ın bu ziyaretin metrikleri için verdiği değerler aynı değer ve belirsizlikle uzman ölçümü olarak kopyalanır.
- **Düzelt:** Uzman sınıfı seçer ve metrikleri girer. En az bir ölçek değeri zorunlu; tek tek her metrik boş bırakılabilir (görüntüden karar verilemiyorsa, `docs/metodoloji.md` bölüm 4). Ölçek değerlerinin belirsizliği yarım basamak (0,5); sayı değerlerinde uzman belirsizliği kendisi girer. İsteğe bağlı not.
- **Hangi metrikler:** `metric_definition` içinden ziyaretin mevsimine uyan (`valid_seasons`), karnede görünen (`card_visibility = shown`) ve ağaçta ölçülebilen metrikler; sınırlar ve birimler de oradan. **Mevsim** ziyaret zamanının ayından (UTC): Aralık–Şubat kış, Mart–Mayıs ilkbahar, Haziran–Temmuz yaz, Ağustos–Ekim hasat, Kasım kış (takvimdeki Mart ve Kasım boşlukları için karar; `src/lib/expert/season.ts`).
- Kayıt tek işlemde `save_expert_assessment(...)` veritabanı fonksiyonuyla yapılır (kullanıcının yetkisiyle): değerlendirme, ölçümler (`source = expert`, `method = expert_review`, `method_version` = ziyaretin metodoloji sürümü, yoksa `methodology-v0`), ölçüm ile değerlendirme bağı (`assessment_measurement`) ve kanıt olarak ağacın bu ziyaretteki kesitleri (`measurement_evidence`). Ölçek sınırı dışındaki bir değer bütün kararı geri alır.
- Karar değiştirilirse eski satırlar silinmez, yenisi eklenir; en yenisi geçerlidir (ekranlar ve `tree_latest_assessment` görünümü).
- Kayıttan sonra listedeki bir sonraki ağaç açılır.

**Klavye kısayolları** (bir form alanı odaktayken çalışmaz): `J` sonraki ağaç, `K` önceki, `A` AI'ı kabul et, `1`–`5` düzeltme formunda sınıf seçimi.

### Bulgu ve öneri

Ağaca (ağaç sayfasında) ya da parsele (özet sayfasında) bağlı bulgu: tür (öneri listesi: kuru dal, kuru ağaç, eksik ağaç, gövde hasarı, budama, zararlı belirtisi, don hasarı, dal kırığı, hırsızlık izi, sulama sızıntısı, diğer), önem, açıklama, öneri. Ağaç bulgusunda kanıt kesitleri seçilir (`finding_evidence`). Ziyaret yayımlanana kadar düzenlenip silinebilir.

### Yayımlama ve veritabanı kuralları

Migration: `supabase/migrations/20261020130000_expert_review_and_publication.sql`, pgTAP: `supabase/tests/11_expert_review.test.sql`.

- `publish_session(p_session_id)`: sadece ziyaretin işletmesinde `expert` rolü olanlar çağırabilir. Ziyaret `processed` ya da `in_review` olmalı. Parseldeki her aktif ağacın bu ziyarette bir uzman değerlendirmesi olmalı; yoksa hata verir, eksik yer kodları hata ayrıntısında (`details: "missing: S1-3, ..."`) gelir ve özet sayfasında listelenir. Başarılıysa: onaysız bulgular ve uzman değerlendirmeleri imzalayan adına onaylanır, `status = published`, `published_at`, `published_by` yazılır.
- **Kapatılan boşluk:** API kullanıcıları (`authenticated`) bir oturumu `published` olarak ekleyemez ya da durumunu `published`'a güncelleyemez (`session_insert` / `session_update` kuralları); yayımlanmış bir oturum API kullanıcıları için güncellenemez ve silinemez. Yayımlanmış bir oturumun durumu kimse için geri alınamaz (tetikleyici; servis anahtarı dahil). İşleme hattı ve testler (servis anahtarı) bir oturumu doğrudan `published` yazabilir; `published_at` o zaman otomatik dolar.
- **Yayından sonra donma:** API kullanıcıları yayımlanmış bir ziyaretin değerlendirmelerini, bulgularını ve bunların bağlantı satırlarını ekleyemez, değiştiremez, silemez.
- Yayından kaldırma bu sürümde yok.

### Demo verisiyle kullanım

```bash
pnpm db:reset && pnpm db:demo     # repo kökünde; iki tarama ziyareti
pnpm web:dev                      # expert@example.com / orchados-dev
```

1. `/uzman`: kuyrukta "Örnek Bahçe 1 · 18 Eki 2026 · İncelemede · 302 ağaç". **Devam et**.
2. İlk ağaç S1-1 açılır; solda bu ziyaretin (18 Ekim), sağda önceki ziyaretin (14 Ekim) kesitleri (dosya yok, yer tutucu). **AI'ı kabul et** (ya da `A`) → S1-2 açılır.
3. _AI sorunlu dedi_ filtresiyle sorunlu ağaçlara geçip **Düzelt**: sınıf, "Kuru dal" ölçeği, not → **Düzeltmeyi kaydet**. Ağaç bulgusu: **Bulgu ekle**.
4. **Özet ve imza**: dağılım, değişenler, incelenmemişler. İmza kutusu + **İmzala ve yayımla**: 302 ağacın hepsi incelenmeden reddedilir ve eksikler listelenir.

Demo verisinin yayımlanmış 14 Ekim ziyareti salt okunur açılır.

### Envanter onayı

Kuyruğun altında **Envanter onayı bekleyenler**: `captured`, `processed` ya da `in_review` durumundaki, parselinde yer kaydedilmiş ve parselde henüz onaylı envanteri olmayan envanter ziyaretleri (yer, ağaç ve açık doğrulama kalemi sayısıyla). **İncele** → `/uzman/envanter/<oturum>`:

- **Envanter özeti:** yer, ağaç, boş yer, ara ağaç, aşısız ağaç, yaş dağılımı (`src/lib/expert/inventory-checks.ts`, portal da kullanır).
- **Kodlama denetimleri:** yinelenen kod, atlanan sıra, sıra içinde atlanan pozisyon (1'den sıranın son pozisyonuna), atlanan ara ağaç harfi, birbirine 1,5 m'den yakın aktif ağaçlar. Sorunlu yerler ve açık kalemler haritada turuncu halkalı.
- **Kodlu harita** ve **örnek kontrol:** haritada ağaca tıklayınca envanter oturumunun en yakın (25 m içinde) panoraması ağaca dönük açılır (`/uzman/envanter/<oturum>/panorama/...`, ofisteki görüntü yönlendirmesinin uzman bölümündeki eşi).
- **Ağaç özellikleri tablosu:** uzman yaş, aşı ve cinsiyeti düzeltir (toplu da).
- **Doğrulama kalemleri:** durum ve sonuçlar; uzman açık bir kalemi notla kapatabilir.
- **İmza:** onay kutusu + **Envanteri onayla ve imzala** → `approve_inventory(...)`. Açık kalem ya da yer yoksa reddedilir ve eksikler listelenir.

`approve_inventory` (migration `20261021210000_inventory_approval.sql`, pgTAP `18_inventory_approval.test.sql`): sadece işletmenin uzmanı; envanter oturumunu `publish_session` gibi yayımlar (kim, ne zaman; bulgular ve uzman değerlendirmeleri onaylanır) ama ağaç başına uzman değerlendirmesi aramaz; parseli `inventory_done` yapar. Yayından sonra yer kodları ve konumları donar (tetikleyici), ağaç özellikleri değişebilir.

### Testler

- Birim (`src/lib/expert/*.test.ts`): mevsim, metrik seçimi (mevsim + görünürlük + konu), form girdisi ve AI değerlerinin kopyalanması, filtreler, özet ve önceki ziyarete göre değişim, adresler, bulgu doğrulama, uzman metinlerinin tamlığı.
- Birim: `src/lib/expert/mandatory-review.test.ts` (her kural, çelişki eşleşmeleri, örneklemin tekrarlanabilirliği ve boyutu, triyaj); `summary.test.ts` toplu onay uygunluğu ve örneklem sayıları.
- Entegrasyon (`tests/integration/expert-bulk.test.ts`): triyaj ve örneklem; saha personeli, operasyon ve sahibin toplu onaylayamaması; değişen listeyle reddedilme; doğru ağaçların onaylanması (örneklem ve zorunlular atlanır), kopyalanan değerler ve kanıt; yayımlamanın toplu onayları sayması; yayından sonra reddedilme; sahibin "Otomatik onay" ve denetim güveni görmesi. Test verisi `tests/e2e/expert-bulk-fixtures.ts`: ayrı bir işletme (`e9…`), 24 ağaç, her kural için bir ağaç.
- Tarayıcı (`tests/e2e/expert-bulk.spec.ts`): uzman toplu onaylar, zorunlu ve örneklem ağaçlarına bakar, özeti kontrol edip yayımlar; sahip skoru, denetim güvenini ve "Otomatik onay"ı görür, soru bırakır; uzman `/uzman/sorular`'da cevaplar, sahip cevabı görür.
- Entegrasyon (`tests/integration/expert-review.test.ts`): kuyruk ve incelemeye alma; AI'ı kabul (AI satırı değişmez, ölçüm, kanıt, bağ), düzeltme (eski kararlar kalır), bulgu ekleme/düzenleme/silme; eksik değerlendirmeyle yayımlamanın reddi; saha personeli ve operasyonun yayımlayamaması ve durumu doğrudan `published` yapamaması; sahibin sonuçları yayından önce görmemesi, sonra görmesi; yayından sonra donma.
- Tarayıcı (`tests/e2e/expert-review.spec.ts`): uzman girişi, kuyruktan açma, bir ağacı kabul, birini düzeltme, eksikle yayımlamanın reddi, kısayolla kabul, yayımlama.
- **Test verisi** (`tests/e2e/expert-fixtures.ts`): ölçümler silinemediği için uzman testleri ayrı bir test işletmesinde (`e7…`) çalışır. Test süresince örnek kullanıcılara orada rol verilir, sonunda geri alınır; yer ve ağaçlar sabit kimliklidir, her çalıştırma yeni oturumlar ekler. Kalan satırlar örnek kullanıcılara görünmez, ama genel satır sayısını sayan pgTAP testleri (`00_schema`) için önce `pnpm db:reset` gerekir.

### Bilinen sınırlar

- **Eşikler sabit:** Düşük güven eşiği %70, örneklem %5 (`REVIEW_RULES`); pilotta ayarlanacak. Henüz tek metodoloji sürümü var.
- **Örneklem kaydedilmiyor:** Örneklem kurallardan yeniden hesaplanır; kurallar değişirse eski bir ziyaretin özetindeki örneklem de değişebilir. Gerekirse toplu onay anında örneklem bir tabloya yazılabilir.
- **AI bayrakları okunmuyor:** Personel-AI çelişkisi ölçümlerden hesaplanıyor; AI worker'ın kendi tutarsızlık bayrakları (İP9) veritabanına yazıldığında kurallara eklenebilir.
- **Ölçümler donmuyor:** Yayından sonra değerlendirme ve bulgular kilitli; ölçümler (saha uygulamasının geç senkronizasyonu için) kilitli değil.
- **Bulgu kaydı tek işlem değil:** bulgu ve kanıtları iki ayrı yazma; kanıt yazılamazsa bulgu silinir.
- **Küçük önizleme yok:** kesit dosyası olduğu gibi gösterilir.

## Operasyon ekranları

Operasyon (`ops`) sahibi kaydeder, parselini açar, kaba sınırını çizer, portal erişimini verir, envanter ve tarama ziyaretlerini planlar ve izler (`docs/MVP.md` Modül 1, `docs/kullanim-kilavuzu.md` 1 ve 3.1). Bunlar önceden Supabase panelinden yapılıyordu.

### Ekranlar

| Adres                                      | Ne var                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/operasyon`                               | **Pano:** durumlara göre ziyaret sayıları (planlandı → yayımlandı; tıklayınca filtreli liste), yaklaşan ziyaretler (14 gün), geciken işler, parseller ve yaşam döngüsü durumları                                               |
| `/operasyon/sahip`, `…/yeni`, `…/<profil>` | Sahip ve hissedar listesi; **yeni sahip** (ad soyad, telefon, isteğe bağlı e-posta, iletişim tercihi, KVKK onayı, tarihi ve metin sürümü); profil düzeltme ve kişinin erişimi olan parseller                                   |
| `/operasyon/parsel/yeni?sahip=<profil>`    | **Parsel kaydı:** ad, il/ilçe/köy, tahmini alan (dönüm ↔ m²), sulu/kıraç, tahmini ağaç, kaba konum; haritada **kaba sınır**; tapu, hisse, rızai taksim, yetki dayanağı, giriş izni, erişim notu, sınırı gösterecek kişi; sahip |
| `/operasyon/parsel/<parsel>`               | Parsel bilgileri, özel bilgiler, **portal erişimi** (ver / kaldır), parselin ziyaretleri, harita. `…/duzenle` bilgileri düzeltir, `…/sinir` yeni sınır sürümünü çizer                                                          |
| `/operasyon/ziyaret`                       | Ziyaret listesi; parsel, personel, durum ve türe göre filtre (`?parsel=`, `?personel=`, `?durum=`, `?tur=`)                                                                                                                    |
| `/operasyon/ziyaret/yeni?parsel=…`         | **Ziyaret planı:** tür (envanter, periyodik tarama, doğrulama), tarih, sorumlu saha personeli, not. Tarama ziyaretinde mevsim tarihten gösterilir (`docs/metodoloji.md` 2)                                                     |
| `/operasyon/ziyaret/<ziyaret>`             | Ayrıntı. `planned` ise tarih, sorumlu ve not değişir, ziyaret iptal edilir. Taranmış (`captured` ve sonrası) ya da iptal edilmiş ziyaret salt okunur                                                                           |
| `/operasyon/bildirimler`                   | Sahip ve hissedarlara giden bildirimler, maskeli telefon, başarısızlar için **Yeniden dene** (bkz. [Bildirimler](#bildirimler))                                                                                                |

### Kurallar

- **Kişisel veri** (`private.owner_profile`, `private.parcel_detail`) `private` şemasında kalır; API'ye açılmaz. Operasyon onu sadece `ops_*` veritabanı fonksiyonlarıyla okur ve yazar (`security definer`; her biri çağıranın o işletmede `ops` olduğunu denetler, başkasına boş sonuç ya da `forbidden` döner). Hata mesajları değer içermez, sadece neden kodu ve alan adı taşır (`invalid_input / phone`). Uygulama hiçbir form değerini loglamaz. Sahip kendi kaydını `my_owner_profile()` ile görür.
- **Bütün yazmalar kullanıcının kendi yetkisiyle yapılır:** parsel kaydı tek işlemde `register_parcel(...)` ile (parsel + özel bilgi + sınır v1 + sahip erişimi; `security invoker`), yeni sınır sürümü `add_owner_declared_boundary(...)` ile, erişim ve ziyaretler doğrudan tablolara (satır bazlı yetki). Uygulamada servis anahtarı yok.
- **Kaba sınır:** Haritada köşelere sırayla tıklanır. `boundary` tablosuna bir sonraki sürüm (ilk kayıtta 1) olarak `owner_declared` kaynağıyla yazılır. Kendini kesen ya da alanı olmayan sınır reddedilir. Formda "Fiili kullanım sınırıdır, mülkiyet iddiası değildir." notu görünür. Sıra yönü ve başlangıç köşesi boş kalır (envanterde belirlenir). Konum girilmezse parsel sınırın ortasına konur, en uzak köşenin uzaklığı belirsizlik olur.
- **Ziyaret planı** (`supabase/migrations/20261021220000_operations_screens.sql`): Envanter, periyodik tarama ve doğrulama ziyaretlerini sadece operasyon açar. Saha personeli diğer oturum türlerini (biçme, ilaçlama, elle kayıt) açmaya devam eder. Plan (tür, gün, sorumlu, parsel) sadece `planned` durumdayken ve sadece operasyon tarafından değişir. İptal sadece `planned` bir ziyarette ve operasyonla yapılır; iptal edilen ziyaret bir daha değişmez. Sorumlu, işletmenin saha personeli olmalı. Durum ilerlemesi (tarandı, işlendi, incelemede) bu kurallardan etkilenmez.
- **Yaşam döngüsü:** İlk envanter ziyareti planlanınca parsel `registered` → `inventory_planned` olur. Açık son envanter ziyareti iptal edilirse `registered`'a döner. `inventory_done` envanter onayının işidir.
- **Gecikme:** Tarihi geçmiş `planned` ziyaretler ve 3 günden uzun süredir `captured` (işlenmemiş) ziyaretler. Gün Türkiye saatine göredir (`Europe/Istanbul`). Tarama zamanı bitiş, yoksa başlangıç, yoksa planlanan gündür. Mevsim takvimi uzman paneliyle ortak (`src/lib/expert/season.ts`).

### Portal hesabı: `invite-user` Edge Function

Servis anahtarı Vercel'e konmadığı için (`docs/deployment.md`) hesap, Supabase'in kendi ortamında çalışan `supabase/functions/invite-user` ile açılır:

1. Çağıranın JWT'si Auth API'sinden doğrulanır. Kişinin istekteki işletmede `ops` olması gerekir (kendi JWT'siyle `membership`'ten okunur). Değilse 401 / 403.
2. Bu e-postayla (e-posta yoksa telefonla) bir hesap varsa kimliği döner, hiçbir şey değişmez.
3. Yoksa hesap servis rolüyle açılır (e-posta ve telefon onaylı). E-posta varsa **tek kullanımlık parola** üretilir ve bir kez döner. Fonksiyonun dış bağımlılığı yok (düz `fetch`); kişisel veri loglanmaz.

**Giriş bilgisi: tek kullanımlık parola, WhatsApp'la iletilir.** Pilot sahipleri e-postadan çok WhatsApp kullanıyor. Davet e-postası ise SMTP kurulumu, gönderim sınırı ve dönüş adresinde parola belirleme sayfası isterdi. Parola ekranda bir kez gösterilir, saklanmaz. **SMS'e geçiş:** Hesap telefon numarasıyla (E.164) açılır. Telefonla giriş açılınca aynı hesap SMS koduyla girer; veri taşınmaz. E-postası olmayan sahibin hesabı bugün telefonla açılır; bu sahip, telefonla giriş gelince girebilir.

**Yedek yol:** Fonksiyona ulaşılamazsa (ör. henüz dağıtılmamışsa) uygulama hesabı `ops_find_user_id` ile e-posta ya da telefonla arar. Operasyon hesabı Supabase panelinden açıp kaydı tekrarlar. Parsel sayfasında mevcut bir hesaba e-postayla erişim de verilebilir. Fonksiyon sadece kimlik döndürür.

Yerelde edge runtime açık (`supabase/config.toml`, `[functions.invite-user] verify_jwt = true`); `pnpm db:start` fonksiyonu sunar. Test projesine `deploy-db` iş akışı `supabase functions deploy` ile dağıtır (secret'lar yoksa adım atlanır).

### Kullanım: yeni sahip → parsel → sınır → erişim → envanter planı

1. `ops@example.com` ile gir → **Operasyon** → **+ Yeni sahip**. Ad, telefon (`0532 123 45 67` yazılabilir), e-posta, iletişim tercihi, KVKK onayı, tarihi ve metin sürümü (`kvkk-v0`) → **Sahibi kaydet**. Tek kullanımlık parolayı giriş e-postasıyla birlikte WhatsApp'tan ilet.
2. **Bu sahibe parsel ekle**: Parsel bilgilerini gir. Haritada **Sınır** modunda sahibin gösterdiği köşelere sırayla tıkla (alan dönüm ve m² olarak görünür). İstersen **Konum** modunda kaba konumu işaretle. Tapu ve erişim bilgilerini gir → **Parseli kaydet**. Sınır v1 (sahip beyanı) ve sahibin erişimi birlikte yazılır.
3. Parsel sayfasında **Portal erişimi**: Hissedarı önce "Yeni sahip" ile kaydet, sonra kişiyi seçip **Hissedar (izleyici)** olarak ekle.
4. **Bu parsel için ziyaret planla**: Tür **Envanter**, tarih, sorumlu personel, not → **Ziyareti planla**. Ziyaret personelin görev listesine düşer, parsel "Envanter planlandı" olur.
5. Sahip `/giris`'ten e-posta ve parolayla girer; sadece kendi parselini görür.

### Testler

- Birim (`src/lib/operations/operations.test.ts`): telefon ve ondalık sayı ayrıştırma, sahip / parsel / özel bilgi / ziyaret formları, sınır halkası (kendini kesme, alan), dönüm ↔ m², mevsim, Türkiye günü, yaklaşan ve geciken ziyaretler, URL sonuç kodları, veritabanı hatasından neden kodu, Türkçe etiketlerin tamlığı.
- Entegrasyon (`tests/integration/operations-screens.test.ts`): `invite-user` ile sahip kaydı ve tek kullanımlık parola; aynı kişinin ikinci kaydı; parsel + sınır v1 + özel bilgi + erişim; hissedar erişimi; yeni sahibin parolayla girip sadece kendi parselini ve kendi kaydını görmesi; ziyaret planı, sorumlu kuralı, değiştirme, iptal ve yaşam döngüsü; taranmış ziyaretin değişmemesi; sahip, saha personeli ve uzmanın kayıt ve planlama yapamaması, özel veri okuyamaması; Edge Function'ın yetkisiz çağrıları (401, 403) ve hatalı girdiyi değeri yansıtmadan reddetmesi. Test kendi parsel ve hesaplarını sonunda siler.
- Tarayıcı (`tests/e2e/operations-registration.spec.ts`): operasyon olarak sahip kaydı (onaysız kayıt reddedilir), parsel kaydı, haritada sınır çizimi (geri alma dahil), envanter ziyareti planlama ve tarih değişikliği, pano; yeni sahibin parolayla girişi. Saha personeline operasyon ekranları 403.
- pgTAP (`supabase/tests/17_operations.test.sql`): fonksiyon yetkileri, özel verinin sadece operasyona açılması, değer içermeyen hatalar, sınır sürümleri, ziyaret kuralları ve yaşam döngüsü, rol rol yasaklar.

### Bilinen sınırlar

- **İlk girişte parola değiştirme ekranı yok** (giriş sayfası bu işin dışında); sahip parolasını şimdilik değiştiremez. Parola yenileme de yok: Supabase panelinden yapılır.
- **Takvim görünümü yok:** liste ve filtreler var.
- Özel veri düzeltmesi eski değeri saklamaz (denetim kaydı yok).
- `ops_find_user_id`, operasyonun bütün hesaplarda e-postayla arama yapmasına izin verir; sadece kimlik döner.

## Bildirimler

Uzman bir ziyareti yayımlayınca sahip ve hissedarlara **"Rapor hazır"**, önemi `high` olan bir bulgu onaylanınca raporu beklemeden **"Kritik bulgu"** bildirimi gider (`docs/MVP.md` Modül 5, bölüm 7). Kanal sahibin iletişim tercihinden: WhatsApp → WhatsApp; SMS, telefon araması ya da kayıt yoksa → SMS.

```
yayın / bulgu onayı ──tetikleyici──▶ public.notification (bekliyor)
pg_cron (dakikada bir) ──pg_net──▶ send-notifications ──▶ sağlayıcı ──▶ gönderildi / yeniden dene / başarısız
```

### Kuyruk (`public.notification`)

Migration'lar `supabase/migrations/20261023140000_notification_queue.sql` … `140300`, pgTAP `supabase/tests/23_notifications.test.sql`.

- Satır: alıcı (kullanıcı), kanal (`sms` / `whatsapp`), şablon (`report_ready` / `critical_finding`), şablon değişkenleri, durum (`pending` / `sent` / `failed`), deneme sayısı, hata kodu, sonraki deneme, oluşma ve gönderilme zamanı, hangi yoldan gittiği (`record/sms`, `netgsm/sms`).
- **Kişisel veri:** Telefon numarası kuyrukta yok; gönderici onu gönderim anında `private.owner_profile`'dan okur (`notification_claim`). Şablon değişkenleri sadece parsel adı, ziyaret günü ve portal yolu (veritabanı kısıtı; ad soyad ya da bulgu metni giremez). Hata alanı sadece neden kodu taşır (`no_phone`, `provider_error:30`), serbest metin almaz.
- **Tetikleyiciler:** periyodik tarama ya da doğrulama ziyareti `published` olunca parselin her sahip ve hissedarına `report_ready`; `high` bir bulgu onaylanınca (`approve_finding(...)` ya da doğrudan `approved_at`) `critical_finding`. Envanter onayı rapor bildirimi değildir. Aynı olay için ikinci satır oluşmaz (alıcı + ziyaret / alıcı + bulgu başına tekil indeks). `publish_session` bulguları da onayladığı için, aynı işlemde onaylanan kritik bulgu ayrıca bildirilmez: rapor bildirimi onu da kapsar.
- **`approve_finding(p_finding_id)`:** uzman bir bulguyu rapordan önce onaylar. Uzman panelindeki düğme uzman paneli oturumunun işi; veritabanı tarafı hazır.
- **Kim görür:** alıcı kendi satırlarını, operasyon işletmesinin bütün satırlarını okur. API'den kimse yazamaz; tetikleyiciler ve servis rolü fonksiyonları yazar.

### Gönderici: `send-notifications` Edge Function

- Servis anahtarıyla çağrılır (başka her çağıran 403). Vadesi gelen satırları alır (aynı anda iki çalıştırma aynı satırı almaz), Türkçe şablonu portal bağlantısıyla doldurur, sağlayıcıya verir ve sonucu yazar.
- **Şablonlar** (`supabase/functions/_shared/messaging.ts`, birim testleri `src/lib/notifications/messaging.test.ts`): "Örnek Bahçe 1 için 14 Ekim denetim raporunuz hazır: <bağlantı>", "Örnek Bahçe 1 için 14 Ekim denetiminde uzmanımız acil bir bulgu onayladı. Ayrıntı: <bağlantı>". Bağlantı `PORTAL_BASE_URL` + `/portal/parsel/<parsel>`.
- **Yeniden deneme:** geçici hatada 1, 4, 16, 60 dakika sonra; 5. denemeden sonra `failed`. Kalıcı hata (telefon yok, bozuk şablon, sağlayıcının reddettiği numara) hemen `failed`.
- **Tetikleme:** `pg_cron` dakikada bir `private.dispatch_notifications()` çalıştırır; vadesi gelen satır varsa ve Vault'ta fonksiyon adresi ile servis anahtarı varsa `pg_net` ile fonksiyonu çağırır. Ücretsiz planda çalışır. Yerelde ve CI'da Vault boş olduğu için hiçbir şey yapmaz; testler fonksiyonu doğrudan çağırır. Elle: `curl -X POST <api>/functions/v1/send-notifications -H "Authorization: Bearer <servis anahtarı>"`.

### Sağlayıcılar (`supabase/functions/_shared/providers.ts`)

Tek arayüz (`MessageProvider.send`), iki uygulama:

- **Kayıt sağlayıcısı** (varsayılan): mesajı göndermez, `private.message_outbox` tablosuna yazar (7 gün tutulur). Geliştirme, testler ve test projesi bununla çalışır. Telefonla giriş kodları da buraya düşer.
- **Netgsm** (iskelet): Türkiye'de yaygın bir SMS sağlayıcısı; REST v2, Basic auth, onaylı gönderici başlığı, Türkçe karakter kodlaması. Sadece `NETGSM_USERCODE`, `NETGSM_PASSWORD` ve `NETGSM_MSGHEADER` üçü de tanımlıysa ve `MESSAGE_PROVIDER=record` değilse devreye girer. WhatsApp yok: WhatsApp tercihli mesajlar SMS olarak gider (`netgsm/sms`). Gerçek hesapla denenmedi.

Seçim gerekçesi: Türkiye'de SMS göndermek için BTK/İYS kurallarına uygun, onaylı bir gönderici başlığı gerekiyor; yerli sağlayıcılar bunu ve OTP paketlerini ucuza veriyor. Twilio hem SMS hem WhatsApp sunar ama Türkiye SMS'i pahalı ve gönderici kaydı uzun. WhatsApp için ayrı bir sağlayıcı (WhatsApp Business API) aynı arayüze eklenir.

### Operasyon: `/operasyon/bildirimler`

Son 100 bildirim (durum filtresi `?durum=`): zaman, parsel, alıcı (ad, sahip/hissedar, **maskeli telefon** `+90 5•• ••• •• 01`), bildirim, kanal, durum, deneme, gönderilme ve hata. Başarısız olanlarda **Yeniden dene** satırı deneme sayısını sıfırlayıp kuyruğa geri koyar (`ops_retry_notification`); bir sonraki çalıştırmada gider. Telefon sunucuda maskelenir (`src/lib/notifications/phone.ts`); tam numara tarayıcıya gelmez.

### Testler

- Birim (`src/lib/notifications/*.test.ts`, `src/app/giris/login-methods.test.ts`): şablonlar ve bağlantı, Türkçe gün, yeniden deneme hesabı, numara maskeleme, hata etiketleri, giriş hata eşlemesi ve yeniden gönderme sayacı.
- Entegrasyon: `tests/integration/notifications.test.ts` (kritik bulgu onayla bildirim, yayında rapor bildirimi ve kayıt sağlayıcısının "göndermesi", çift bildirim yok, sahip başkasının bildirimini görmez, göndericiyi sadece servis rolü çalıştırır, operasyon listesi ve yeniden deneme), `tests/integration/notifications-phone-login.test.ts` (operasyonun telefonla açtığı hesap koduyla girer, kod kayıttan okunur; 60 sn içinde ikinci kod yok; davetsiz numaraya kod ve hesap yok; 5 hatalı kodda kilit).
- Tarayıcı: `tests/e2e/notifications-phone-login.spec.ts` (telefonla giriş, hatalı kod, yeniden gönderme sayacı, davetsiz numara), `tests/e2e/notifications-operations.spec.ts` (bildirim listesi, maskeli telefon, yeniden dene).
- pgTAP: `supabase/tests/23_notifications.test.sql`.
- Hiçbir test gerçek SMS göndermez: Netgsm değişkenleri yerelde ve CI'da tanımlı değil.

### Bilinen sınırlar

- Kritik bulgu bildirimi portal bağlantısı verir, ama sahip yayımlanmamış ziyaretin bulgusunu portalda henüz göremez (satır bazlı yetki). Onaylanmış kritik bulgunun yayından önce gösterilmesi portal tarafında ayrı bir karar.
- WhatsApp sağlayıcısı yok; WhatsApp tercihli sahiplere gerçek sağlayıcıyla SMS gider.
- Bildirim için portal hesabı (parsel erişimi) gerekir; hesabı olmayan hissedar bildirim almaz.

## MVP denetimi eklemeleri

`docs/mvp-denetimi.md` denetiminde eksik bulunan ve bu uygulamaya eklenen özellikler. Migration'lar `supabase/migrations/20261024120000…120200`, pgTAP `supabase/tests/26_*.test.sql`.

### Portal

- **Karne "Boyut boyut"** (`src/components/portal/dimensions.tsx`, saf hesaplar `src/lib/portal/dimensions.ts`): envanter ve önceki denetime göre kaybolan (kayıp işaretli ya da bu denetimde yeni "yok") ve yeni ağaçlar; bahçe yapısı (1 erkeğe N dişi, 8–10 önerisine göre yorum, aşısız, yaş dağılımı); mekânsal desen; bakım uyumu (budama oranı, hasat); zararlı belirtileri (sayı, tür, sıra); meyve yükü (300–430 gün önceki yayımlanmış ziyaretle karşılaştırma); denetim güveni (panorama ve yakın plan sayısı, imza tarihi).
- **10×10 m hücreler** (`src/lib/portal/cells.ts`): parselin son sınırının (yoksa yerlerinin) güneybatı köşesinden doğu/kuzey metre; sunucudaki yakın plan örneklemiyle aynı kural (`docs/arayuzler.md`). Isı = hücredeki değerlendirilmiş ağaçlarda sorun ağırlığı (dikkat 0,5; sorunlu, kuru, yok 1). Karnede "sorunların yarısı N hücrenin K'sında".
- **Sağlık haritası** (`health-map.tsx`, `src/lib/portal/map-layers.ts`): ziyaret seçici (`?ziyaret=`; varsayılan "Son durum"), "Sadece bu ziyarette değişenler" (`?degisen=1`; önceki değerlendirilmiş ziyarete göre bir basamak değişenler, kuru → yok değişim değil), katmanlar `?katman=isi,kapsama`: ısı hücreleri ve kapsama (panoramaların GPS zamanı sırasıyla iz, 30 m'den büyük sıçramada bölünür; ağaçlar iki yön / tek yön / görüntü yok halkasıyla). Harita, veri değişince yeniden kurulmaz; kaynaklar `setData` ile güncellenir.
- **360° gezi:** bütün yayımlanmış ziyaretlerin panoramaları; "Bu noktayı başka bir denetimde gör" aynı noktanın (15 m içinde) panoramasını aynı yöne bakarak açar, yoksa en yakınını ve bir not. Haritada pembe görüş üçgeni bakış yönünü gösterir (`viewWedge`).
- **Ağaç karnesi:** renkli sınıf zaman çizelgesi; her fotoğrafta "Kanıt bilgisi": çekim zamanı (kesitte kaynak panoramanın `gps_time_ns`'i, yakın planda `capture.started_at`; Türkiye saatiyle), konum, çeken (kesitte ziyaretin sorumlusu, yakın planda `captured_by`), tam SHA-256 ve **Bütünlüğü doğrula** (dosya tarayıcıda indirilip hash'i kayıttakiyle karşılaştırılır, `src/lib/portal/evidence.ts`). **Karar:** personel adı ya da e-postası sahibe gösterilmez; kullanıcı kimliğinden kısa ve sabit bir kod (`#A1B2`).
- **Hissedarlar** (sadece sahip; `viewers-card.tsx`, `src/lib/portal/viewers.ts`): ad ve telefonla davet, davet geri alma, hissedarın erişimini kaldırma. Telefon sadece son iki hanesiyle görünür. Davet `private.viewer_invitation`'da durur; operasyon tamamlar. **Karar:** sahip bir numaranın hesabı olup olmadığını öğrenmez.

### Uzman paneli

- **Takip istekleri** (`followup-panel.tsx`, `src/lib/expert/followups.ts`): ağaç panelinde "Sonraki ziyarette yakın plan" ya da "Doğrulama turunda kontrol"; özet sayfasında "Ek ziyaret iste" (not zorunlu). İstekler sonuç değildir: yayından sonra da yapılır, sahip görmez.
- **Acil bulgu:** onaylanmamış yüksek önemli bulguda "Onayla ve sahibe hemen bildir" (`approve_finding`; bildirim tetikleyicisi).
- **Kurala göre sınıf** (`src/lib/expert/class-rule.ts`): AI'ın ve önceki uzmanın değerlerinin yanında metodoloji 5'in 3–5. kurallarına göre sınıf (öneri; Yok ve Kuru uzmanın kararı).

### Operasyon

- **Yaşam döngüsü:** parsel sayfasında "İzlemeyi bitir (pasif)" / "İzlemeyi sürdür" (`ops_set_parcel_passive`). İlk yayımlanan periyodik tarama parseli "aktif izleme" yapar (tetikleyici).
- **Pano:** "Hissedar davetleri" (kişiyi arayıp KVKK onayıyla hesabı telefonla aç ve izleyici ekle, ya da reddet) ve "Uzman istekleri" (doğrulama ve ek ziyaret isteklerini planlı bir ziyarete bağla; doğrulama isteği turun kalemi olur).
- **Ziyaret sayfası:** periyodik taramada sunucunun ürettiği **yakın plan listesi** (`closeup_list`) nedenleriyle.

### Testler

- Birim: `src/lib/portal/dimensions.test.ts` (hücreler, desen, boyutlar, harita katmanları), `evidence.test.ts`, `tour-time.test.ts`, `viewers.test.ts`, `src/lib/expert/followups.test.ts`, `class-rule.test.ts`.
- Entegrasyon: `tests/integration/parcel-lifecycle.test.ts`, `viewer-invitations.test.ts`, `followups.test.ts` (yakın plan listesi, istekler, planlama, acil bulgu), `portal-report-layers.test.ts`.
- Tarayıcı: `tests/e2e/mvp-audit.spec.ts` (boyutlar, ziyaret seçici, değişenler, katmanlar, kanıt ve hash doğrulaması, gezide bakış yönü, hissedar daveti ve reddi, yakın plan listesi).
- Temizlik: `followup_request` ve `private.viewer_invitation` satırlarını testler kendileri siler (`purgeParcels` bu tabloları bilmiyor; `tests/local-db.ts` başka bir oturumun klasöründe).

## Müşteri portalı: başvuru ve ödeme

İP12-D. Tasarım: `docs/musteri-yonetimi.md` §10. Müşteri profili olan her kullanıcı `/portal` altında "Hesap" menüsünü görür (Bahçelerim · Başvurularım · Siparişlerim · Ödemelerim · Hesabım); müşteri profili olmayan hissedar yalnız bahçelerini görür, faturalama sayfaları ona 403 döner.

### Ekranlar

| Yol                                              | İş                                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/portal`                                        | Bahçeler ve kartlar: açık teklif, ödeme bekleyen sipariş, taslak / incelemedeki başvuru; hiçbiri yoksa "Bahçenizi kaydedin"                                                   |
| `/portal/basvuru`, `/yeni`, `/[id]`              | Paket seçimi (`public_package_prices` → `customer_create_application`), bahçeler, canlı `price_preview`, gönder, geri çek; gönderildikten sonra salt okunur geçmiş            |
| `/portal/basvuru/[id]/bahce/yeni`, `/[gardenId]` | Bahçe formu: haritada yer (zorunlu) ve kaba sınır (`BoundaryDrawMap`), alan dönüm olarak, yetki/tapu/erişim bilgileri → `customer_save_application_garden`                    |
| `/portal/teklif/[id]`                            | Kalemler, indirim, KDV, toplam, geçerlilik, ekibin notu; fatura profili durumu; eksikse aydınlatma onayı; iki sözleşme onayı → `customer_accept_quote`; revize ya da ret      |
| `/portal/siparis`, `/[id]`                       | "Kartla öde" (yalnız `ORCHADOS_PAYMENTS_ENABLED=1`), havale bilgisi (`customer_payment_instructions`), iptal                                                                  |
| `/portal/odeme`, `/[id]`                         | Ödeme geçmişi; sonuç sayfası `initiated` / `pending_review` iken 10 sn'de bir yenilenir; `?hata=odeme_bulunamadi` uyarısı                                                     |
| `/portal/hesap`, `/fatura`, `/izinler`           | İletişim (`customer_update_contact`; telefon değiştirilemez), fatura profili (TCKN yalnız gerekiyorsa; `?geri=` `safeNextPath` ile süzülür), açık rızalar ve aydınlatma onayı |
| `/makbuz/[paymentId]`                            | Makbuz PDF'i (`receipt_data`; başkasına 404), `private, no-store`                                                                                                             |

`/paketler` artık `public_package_prices` ile yayımlı fiyatları ve her paket için 20 dönümlük örneği (`price_preview`, veritabanının formülü) gösterir.

### Kod

- `src/lib/portal-billing/`: okumalar (`data.ts`, hep `BILLING_COLUMNS`), saf ayrıştırıcılar (`validation.ts`: dönüm → m², Türkçe ondalık, bahçe / fatura / iletişim formları), `tckn.ts`, adresler ve `?bilgi=` / `?hata=` beyaz listeleri (`urls.ts`), kart ödemesi başlatma yardımcıları (`payments.ts`).
- `src/app/portal/billing-actions.ts`: sunucu eylemleri. Kart ödemesi `payments` Edge Function'ını `{action:'start', order_id, return_origin, client_ip}` ile çağırır, tarayıcıyı sağlayıcının sayfasına yönlendirir; dönüş `payment-callback` → `/portal/odeme/<id>`.
- Metinler: `src/lib/i18n/messages/portal-billing.ts` (`portalBillingText`), makbuz `receipt.ts`; durum adları ve hata metinleri `billingText`'ten.
- Form değerleri ve kişisel veri loglanmaz; TCKN tarayıcıya hiç gönderilmez (yalnız maskeli hali).

### Yerelde deneme

`pnpm db:start && pnpm db:reset`, sonra `ORCHADOS_SIGNUP_ENABLED=1 ORCHADOS_PAYMENTS_ENABLED=1 PAYMENT_FAKE_CHECKOUT=1 SIGNUP_PROXY_SECRET=signup-proxy-local pnpm web:dev`. Sahte sağlayıcı yerel Edge secret'larıyla açıktır; `/odeme/sahte` sayfası onay, ret ve inceleme sonucunu callback'e gönderir. Örnek müşteri: `customer@example.com` / `orchados-dev`.

### Testler

- Birim: `src/lib/portal-billing/portal-billing.test.ts` (ayrıştırıcılar, TCKN, `?geri=` için `//evil.com` ve `/\evil.com`, ödeme başlatma hataları), `src/lib/pdf/receipt-pdf.test.ts`, `src/components/portal-billing/order-pay.test.tsx` (bayrak kapalıyken kart düğmesi yok).
- Entegrasyon: `payments-flow.test.ts` (profil → taslak → bahçe → gönder → ops teklifi → kabul → sahte kart → çerezsiz callback → aktivasyon, tekrar callback, ret, iade, mutabakat, RLS), `customer-billing.test.ts`, `customer-sections.test.ts`.
- E2E: `tests/e2e/customer-journey.spec.ts` (yeni ziyaretçi kayıttan makbuza; reddedilen kart). Yardımcılar `billing-helpers.ts`.

### Bilinen sınırlar

- Telefon değişikliği portalda yok (giriş telefonu; operasyon üzerinden).
- Makbuz fatura değildir; e-fatura entegrasyonu kapsam dışı.
