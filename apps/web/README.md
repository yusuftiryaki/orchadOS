# apps/web

Next.js web uygulaması: sahip portalı, uzman paneli ve ofis üçgenleme aracı. Rol bazlı tek uygulama.

İş paketleri: İP5 (ofis üçgenleme aracı), İP7 (uzman paneli), İP8 (sahip portalı). Bkz. [docs/plan.md](../../docs/plan.md).

Şu anki hâli bir **iskelet**: giriş/çıkış, rol bazlı bölümler, her bölümde parsel listesi ve harita üzerinde parsel detayı. Asıl amaç, veritabanı yetki kurallarının uygulamadan uca çalıştığını göstermek.

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

`apps/web` içinde ayrıca: `pnpm test:unit`, `pnpm test:integration`, `pnpm format` (Prettier ile yazar).

**Entegrasyon ve tarayıcı testleri** çalışan yerel Supabase ister: önce `pnpm db:start && pnpm db:reset`. Adres ve anahtarlar ortam değişkenlerinden, yoksa `supabase status` çıktısından okunur; `.env.local` gerekmez. Testler `supabase/` örnek verisini değiştirmez; ihtiyaç duydukları ek kayıtları (ikinci parsel, başka işletme, örnek değerlendirme) servis anahtarıyla kendileri ekler ve sonunda siler.

**Veritabanı tipleri:** Şema değişince (`supabase/migrations/`) `pnpm db:reset && pnpm web:typegen` çalıştırılır ve üretilen dosya commit'lenir.

## Klasör yapısı

```
apps/web/
├── src/
│   ├── proxy.ts                 # her istekte oturumu yeniler, girişsizleri /giris'e yollar
│   ├── app/
│   │   ├── giris/               # giriş sayfası, giriş yöntemleri, server action
│   │   ├── portal/              # sahip, izleyici
│   │   ├── uzman/               # uzman
│   │   ├── ofis/                # saha personeli, operasyon
│   │   ├── operasyon/           # operasyon
│   │   │   └── parsel/[parcelId]/   # her bölümde parsel detayı
│   │   ├── forbidden.tsx        # 403 sayfası
│   │   └── page.tsx             # girişten sonra ilk erişilebilir bölüme yönlendirir
│   ├── components/              # bölüm başlığı, parsel listesi, harita, ağaç paneli
│   └── lib/
│       ├── auth/                # roller → bölümler, oturum ve bölüm kontrolü
│       ├── i18n/tr.ts           # bütün arayüz metinleri
│       ├── map/                 # GeoJSON yardımcıları, altlık, ağaç renkleri
│       ├── supabase/            # sunucu istemcisi ve proxy oturum yenileme
│       ├── parcels.ts           # parsel sorguları (sadece satır bazlı yetkiyle)
│       └── database.types.ts    # üretilmiş; elle değiştirilmez
├── tests/
│   ├── integration/             # supabase-js ile yerel veritabanına karşı
│   └── e2e/                     # Playwright
└── scripts/typegen.mjs
```

Birim testleri kaynak dosyaların yanında (`*.test.ts`).

## Roller ve bölümler

Roller veritabanından okunur: işletme rolleri `membership`, parsel rolleri `parcel_access` tablosundan. Eşleme `src/lib/auth/roles.ts` içinde tek tabloda:

| Bölüm        | Kimler girer                                      | Kaynak          |
| ------------ | ------------------------------------------------- | --------------- |
| `/portal`    | sahip (`owner`), izleyici (`viewer`)              | `parcel_access` |
| `/uzman`     | uzman (`expert`)                                  | `membership`    |
| `/ofis`      | saha personeli (`field_staff`), operasyon (`ops`) | `membership`    |
| `/operasyon` | operasyon (`ops`)                                 | `membership`    |

- Yetkisi olmayan bölüme giren kullanıcı **403** sayfası görür (`forbidden()`); kontrol hem bölüm düzeninde (layout) hem her sayfada yapılır.
- Birden çok rolü olan kullanıcı üst menüden bölümler arasında geçer. Girişten sonra yukarıdaki sıradaki ilk erişilebilir bölüme yönlendirilir.
- Bölüm erişimi sadece **hangi ekranların** açılacağını belirler. Bir bölümde **hangi verinin** görüneceğine veritabanındaki satır bazlı yetki kuralları karar verir; uygulama tarafında filtreleme yapılmaz. Örneğin sahip sadece kendi parselini görür, işletme rolleri işletmenin bütün parsellerini.
- Bir parseli görme yetkisi olmayan kullanıcı için o parselin sayfası 404'tür (yok ile görünmez ayırt edilmez).

## Giriş

Geliştirmede e-posta + parola. Telefonla (SMS kodu) giriş sonraya kaldı; giriş sayfası yöntem listesiyle (`src/app/giris/login-methods.ts`) kurulu, telefon yöntemi şimdilik pasif. Eklemek için: `phone` için bir form bileşeni ve `signInWithOtp` / `verifyOtp` çağıran bir server action.

## Harita

MapLibre GL. Parsel detayında son sürüm sınır, yerler ve ağaçlar çizilir; ağaçlar son değerlendirmenin genel sınıfına göre renklenir. Örnek veride değerlendirme olmadığı için bütün ağaçlar tek renktir ("Değerlendirilmedi"), boş yerler içi boş daire. Ağaca tıklayınca sağda kod ve özellikler görünür.

**Altlık:** Geliştirmede API anahtarı gerektirmeyen OpenStreetMap raster karoları kullanılır. OSM karo sunucuları üretim trafiği için değildir (kullanım politikası); **üretimde `NEXT_PUBLIC_MAP_STYLE_URL` ile kendi barındırdığımız ya da bir sağlayıcının stil adresine geçilmeli** (ör. kendi PMTiles/OpenMapTiles sunucusu ya da uydu altlığı).

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyala. Gerçek anahtar repoya girmez.

| Değişken                        | Açıklama                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase API adresi (yerelde `http://127.0.0.1:54321`)                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (publishable) anahtar; tarayıcıya açıktır, her sorgu satır bazlı yetkiyle sınırlıdır |
| `NEXT_PUBLIC_MAP_STYLE_URL`     | İsteğe bağlı MapLibre stil adresi; boşsa OSM raster                                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Sadece entegrasyon testleri; uygulama okumaz. Boşsa `supabase status`'tan alınır          |

`NEXT_PUBLIC_*` değerleri derleme sırasında koda gömülür; ortam değişince yeniden derlemek gerekir.

## Stil

CSS Modules + `src/app/globals.css` içinde CSS değişkenleri (renk, boşluk, köşe). Gerekçe: Next.js'te ek bağımlılık ve derleme eklentisi olmadan çalışır, sınıflar bileşene kapalıdır, iskelet aşamasında öğrenme ve bakım yükü en düşük seçenektir. Ekranlar büyüyünce bir bileşen kütüphanesine ya da Tailwind'e geçmek bu yapıyı bozmadan mümkün.

## Metinler

Bütün arayüz metinleri `src/lib/i18n/tr.ts` içinde; bileşenler `t` üzerinden okur. Başka bir dil, aynı yapıda (`Messages` tipi) ikinci bir dosya ve `src/lib/i18n/index.ts` içinde dil seçimi demek. Bir birim testi, veritabanındaki her enum değerinin (parsel durumu, cinsiyet, aşı, sağlık sınıfı…) Türkçe karşılığı olduğunu denetler.
