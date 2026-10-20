# apps/web

Next.js web uygulaması: sahip portalı, uzman paneli ve ofis üçgenleme aracı. Rol bazlı tek uygulama.

İş paketleri: İP5 (ofis üçgenleme aracı), İP7 (uzman paneli), İP8 (sahip portalı). Bkz. [docs/plan.md](../../docs/plan.md).

Şu anki hâli: giriş/çıkış, rol bazlı bölümler, her bölümde parsel listesi ve harita üzerinde parsel detayı (iskelet), `/ofis` altında **ofis üçgenleme aracı** (İP5) ve `/portal` altında **sahip portalı** (İP8); ikisi de aşağıda.

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
│   │   ├── uzman/               # uzman
│   │   ├── ofis/                # saha personeli, operasyon
│   │   │   ├── parsel/[parcelId]/envanter/  # ofis üçgenleme aracı + kaydetme (server action)
│   │   │   └── panorama/[setId]/[panoramaId]/[variant]/  # panorama görüntüsü (route handler)
│   │   ├── operasyon/           # operasyon
│   │   │   └── parsel/[parcelId]/   # her bölümde parsel detayı
│   │   ├── forbidden.tsx        # 403 sayfası
│   │   └── page.tsx             # girişten sonra ilk erişilebilir bölüme yönlendirir
│   ├── components/              # bölüm başlığı, parsel listesi, harita, ağaç paneli
│   │   ├── office/              # üçgenleme aracı: harita, panorama görünümü, paneller
│   │   └── portal/              # sahip portalı: karne, sağlık haritası, ağaç karnesi, gezi
│   └── lib/
│       ├── auth/                # roller → bölümler, oturum ve bölüm kontrolü
│       ├── i18n/tr.ts           # bütün arayüz metinleri
│       ├── map/                 # GeoJSON yardımcıları, altlık, ağaç renkleri
│       ├── office/              # üçgenleme, sıra oturtma, kodlama, doğrulama listesi (saf TS),
│       │                        # panorama kaynağı, envanter kaydı
│       ├── portal/              # portal sorguları + saf hesaplar (sınıf, değişim, ölçüm, gezi yönleri)
│       ├── media/               # storage:// adresleri, toplu imzalama ve önbellek
│       ├── supabase/            # sunucu istemcisi ve proxy oturum yenileme
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

| Değişken                          | Açıklama                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase API adresi (yerelde `http://127.0.0.1:54321`)                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Anon (publishable) anahtar; tarayıcıya açıktır, her sorgu satır bazlı yetkiyle sınırlıdır |
| `NEXT_PUBLIC_MAP_STYLE_URL`       | İsteğe bağlı MapLibre stil adresi; boşsa OSM raster                                       |
| `SUPABASE_SERVICE_ROLE_KEY`       | Sadece entegrasyon testleri; uygulama okumaz. Boşsa `supabase status`'tan alınır          |
| `LOCAL_PANORAMA_DIR`              | Ofis aracı, sadece geliştirme: işleme hattı çıktılarının klasörü (aşağıda)                |
| `LOCAL_PANORAMA_ALLOW_PRODUCTION` | `1` ise üretim derlemesi de yerel klasörü okur; sadece tarayıcı testleri kullanır         |

`NEXT_PUBLIC_*` değerleri derleme sırasında koda gömülür; ortam değişince yeniden derlemek gerekir.

## Stil

CSS Modules + `src/app/globals.css` içinde CSS değişkenleri (renk, boşluk, köşe). Gerekçe: Next.js'te ek bağımlılık ve derleme eklentisi olmadan çalışır, sınıflar bileşene kapalıdır, iskelet aşamasında öğrenme ve bakım yükü en düşük seçenektir. Ekranlar büyüyünce bir bileşen kütüphanesine ya da Tailwind'e geçmek bu yapıyı bozmadan mümkün.

## Metinler

Bütün arayüz metinleri `src/lib/i18n/tr.ts` içinde; bileşenler `t` üzerinden okur. Başka bir dil, aynı yapıda (`Messages` tipi) ikinci bir dosya ve `src/lib/i18n/index.ts` içinde dil seçimi demek. Bir birim testi, veritabanındaki her enum değerinin (parsel durumu, cinsiyet, aşı, sağlık sınıfı…) Türkçe karşılığı olduğunu denetler.

## Sahip portalı (İP8)

Sahip (`owner`) ve hissedar (`viewer`) için `/portal`. Zincir: **Bahçelerim → parsel karnesi → sağlık haritası → ağaç karnesi → fotoğraf geçmişi → 360° gezi.** Telefon öncelikli: 800 px'in altında her şey tek sütun, harita ve panorama ekranın büyük kısmını alır, haritada ağaca dokununca panel görünür alana kayar.

### Ekranlar

| Adres                                 | Ne gösterir                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/portal`                             | Her parsel: konum, ağaç sayısı, son yayımlanmış denetimin tarihi, sınıf dağılımı çubuğu, acil bulgu sayısı                                                                                                                                                                                          |
| `/portal/parsel/<parsel>`             | **Karne:** son denetimin özeti (ağaç sayısı; sağlıklı / dikkat / sorunlu / kurumuş / yok / değerlendirilmedi, yüzdeleriyle), önceki denetime göre kötüleşen ve iyileşen ağaçlar, **sağlık haritası**, önem sırasıyla bulgular, karnede gösterilen ölçümlerin özeti, ziyaret geçmişi, "Yazdır / PDF" |
| `…?sinif=problem,dead#harita`         | Haritayı o sınıflarla açar (karnedeki sınıf kutuları bu bağlantıyı kullanır)                                                                                                                                                                                                                        |
| `…?bulgu=<bulgu>#harita`              | Parsel düzeyindeki bir bulguyu haritada seçer                                                                                                                                                                                                                                                       |
| `/portal/parsel/<parsel>/agac/<ağaç>` | **Ağaç karnesi:** kod, yer türü, cinsiyet, aşı, yaş sınıfı, çeşit, envantere giriş; son sınıf ve kimin verdiği; durum geçmişi; ölçüm geçmişi (ziyaret × metrik); fotoğraf geçmişi (satır ziyaret, sütun yön; yakın planlar ayrıca; her fotoğrafın hash'inin ilk 8 hanesi); bulgular ve öneriler     |
| `/portal/parsel/<parsel>/gezi`        | **360° gezi** (`?agac=<ağaç>`: ağaca en yakın panoramada ağaca dönük açılır; `?panorama=<asset>`)                                                                                                                                                                                                   |

### Kurallar

- **Sadece yayımlanmış ziyaretler.** Kural veritabanında (satır bazlı yetki, `media` alanının kuralı). Portal ayrıca bütün sonuç sorgularını parselin `published` ziyaretleriyle sınırlar; bir kullanıcı hem sahip hem kurum rolündeyse de portalda yayımlanmamış sonuç görmez. Entegrasyon testi ikisini birden denetler.
- **Ziyaretin sınıfı:** aynı ziyarette uzman > model > AI, sonra en yeni satır (`src/lib/portal/classes.ts`). Karnedeki dağılım ve değişim bunu kullanır. Değerlendirmesi olmayan aktif ağaç "Değerlendirilmedi" sayılır.
- **Harita rengi** `tree_latest_assessment` görünümünden gelir (önce en yeni ziyaret, aynı ziyarette kaynak önceliği). Böylece son denetimde bakılmayan bir ağaç önceki denetimin rengini korur. Ortak harita (`src/lib/parcels.ts`) hâlâ kaynak gözetmeden en yeni değerlendirmeyi kullanıyor; uzman ve ofis tarafı koordinatöre bırakıldı.
- **Değişim:** iki ziyarette de sınıfı olan ağaçlar karşılaştırılır; sıra sağlıklı < dikkat < sorunlu < kurumuş = yok. Kurumuş → yok değişim sayılmaz.
- **Kimin kararı:** "Uzman onaylı" (yeşil, ✓), "Otomatik onay" (toplu onaylanmış AI), "Yapay zekâ ön değerlendirmesi (uzman onayı yok)". Turuncu rozet uzman onayı olmadığını gösterir.
- **Ölçümler:** sadece `card_visibility = shown` metrikler. Aynı ziyarette uzman > algoritma > saha ekibi > AI.
- **Bulgular:** önem (acil, önemli, düşük, bilgi), aynı önemde önce bahçe geneli, sonra sıra/pozisyon sırasıyla. Ağaç bulgusu ağaç karnesine, parsel bulgusu haritadaki konumuna gider. Haritada bulgular önem renginde halka; konum sırasıyla bulgunun kendi `location`'ı, ağacı, bölgesi (`zone`).
- **Sade dil:** sınıflar ve önem dereceleri tek cümlelik açıklamalarla (`t.portal`).

### 360° gezi

- Son yayımlanmış ve panoraması olan ziyaret. Aynı panoramanın tam ve önizleme görüntüsü (`pose.variant`) `pose.gps_time_ns`'ten (yoksa konumdan) eşlenir. Önce önizleme yüklenir, yakınlaştırınca (zoom > 55) tam çözünürlüğe geçilir.
- Komşu oklar: 8 yön diliminin her birinde 20 m içindeki en yakın panorama. Ok, panoramanın `heading_deg`'ine göre yönü hesaplanmış bir işaretçi; tıklayınca o panoramaya aynı yöne bakarak geçilir.
- Haritada bir yere dokununca en yakın panorama açılır ve dokunulan noktaya döner.
- **Ağaç işaretçileri:** 14 m içindeki ağaçlar, sınıf rengiyle. Yön = ağacın azimutu − `heading_deg` (orta sütun `heading_deg`, azimut saat yönünde; `services/pipeline/README.md`). Yükseklik açısı kamera 1,8 m, hedef 1,5 m varsayımıyla. Tıklanınca ağaç karnesi.
- Görüntü yoksa ya da açılamazsa tarayıcıda üretilen bir yer tutucu panorama gösterilir (gökyüzü, zemin, gerçek yönlerinde K/D/G/B harfleri); oklar ve ağaçlar yine çalışır. Demo verisi bu durumu gösterir.
- Görüntü adresleri bir server action ile (`gezi/actions.ts`) panorama değiştikçe imzalanır; sadece o parselin yayımlanmış ziyaretlerindeki `panorama` kayıtları imzalanır.

### Medya (`src/lib/media/`)

Uzman paneli de kullanacak; arayüz bilinçli olarak küçük:

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

### Demo

```bash
pnpm db:reset && pnpm db:demo     # repo kökünde
pnpm web:dev                      # owner@example.com / orchados-dev
```

`/portal` → "Örnek Bahçe 1": 14 Ekim denetimi (302 ağaç; 232 sağlıklı, 40 dikkat, 16 sorunlu, 13 kurumuş, 1 değerlendirilmedi), 30 bulgu, kuru dal ölçek dağılımı. 18 Ekim denetimi incelemede olduğu için görünmez. Görüntü dosyaları demo verisinde yok: fotoğraflar "Görüntü yok", gezi yer tutucu panoramayla açılır.

### Testler

- Birim: `src/lib/portal/portal.test.ts` (ziyaret sınıfı, dağılım, değişim, onay türü, harita durumu, ziyaret zamanı, bulgu sırası ve konumu, ölçüm özeti, panoramada yön ve yükseklik açısı, komşu panoramalar, varyant eşleme), `src/lib/media/media.test.ts` (adres ayrıştırma, toplu imzalama, önbellek).
- Entegrasyon (`tests/integration/portal.test.ts`) ve tarayıcı (`tests/e2e/portal-owner.spec.ts`) testleri kendi verilerini `tests/integration/portal-fixture.ts` ile kurar: ayrı bir işletme, üç kullanıcı (`portal-owner@`, `portal-viewer@`, `portal-other@example.test`), iki parsel; parsel A'da iki yayımlanmış ve bir incelemedeki ziyaret, depoda gerçek küçük PNG'ler. `capture`/`asset`/`measurement` API'den silinemediği için temizlik, yerel veritabanı konteynerinde (`supabase_db_orchados`, `SUPABASE_DB_CONTAINER` ile değişir) tetikleyiciler kapalıyken SQL ile yapılır; başta da çalışır, yarıda kalan bir koşu sorun çıkarmaz.
- Tarayıcı: sahip olarak giriş → Bahçelerim → karne → haritada ağaç → ağaç karnesi (fotoğraf yüklenir, eksik fotoğraf yer tutucu); sınıf filtresi ve parsel bulgusu; yayımlanmamış sonucun görünmemesi; gezi (ağaca dönük açılış, önizleme → tam çözünürlük, ok ile geçiş, yer tutucu, ağaç işaretçisinden karneye); 390 px ekranda yatay taşma olmadan karne, harita ve ağaç karnesi.

## Ofis üçgenleme aracı (İP5)

Envanterde ağaç konumları sahada tek tek alınmaz: ofisteki kişi grid taramanın panoramalarında her gövdeye iki (ya da daha çok) panoramadan tıklar, araç konumu üçgenler, sıraları oturtur, yerlere kod verir, boş yerleri bulur ve doğrulama listesini çıkarır (`docs/MVP.md` Modül 2). Saha personeli ve operasyon rolleri için: `/ofis/parsel/<parsel>` sayfasındaki **Envanter üçgenleme aracı** düğmesi → `/ofis/parsel/<parsel>/envanter`.

### Kullanım

1. **Oturum ve panorama seti:** Parselin envanter oturumu (`session.kind = inventory`) ve panorama kaynağındaki işlenmiş bir set seçilir. Oturum kimliği eşleşen set önce gelir; eşleşmeyenler (sentetik veri) "geliştirme verisi" notuyla listelenir.
2. **Üçgenleme:** Haritada bir ağacın yakınına tıklayınca en yakın panorama ve ona en az 2 m uzaklıktaki en yakın ikinci panorama sağda açılır, ikisi de tıklanan noktaya döner. Her panoramada gövdeye tıklanır; her tık haritada bir yön çizgisidir. İki çizgiden sonra aday konum, belirsizliği ve kesişme açısı görünür. **Ağacı ekle** (Enter) ağacı ekler, **Temizle** (Esc) çizgileri siler. "Önceki/Sonraki" ile başka panoramaya geçip üçüncü bir çizgi eklenebilir.
   - Uyarılar: belirsizlik 0,5 m'yi aşarsa, çizgiler arasındaki en büyük açı 15°'nin altındaysa, kesişim bir panoramanın arkasında kalıyorsa ya da üç ve daha çok çizgi birbiriyle uyuşmuyorsa. 1°'nin altındaki çizgiler hiç kesiştirilmez.
   - Haritadaki ağaç tıklanınca seçilir: **Emin değilim** işareti, **Sil** (Delete), sürükleyerek elle kaydırma ("elle kaydırıldı" diye işaretlenir).
   - Panoramalarda daha önce eklenmiş ağaçlar yeşil işaretle gösterilir; aynı ağacı iki kez eklememeye yardım eder.
3. **Kodlama:** Sıra yönü ve başlangıç köşesi parsel kaydındaysa oradan gelir ve değiştirilemez. Yoksa kullanıcı seçer (**Ağaçlardan tahmin et** ve **+90°** yardımcı olur); kaydedince parsele yazılır ve bir daha değişmez (veritabanı tetikleyicisi). Özet (sıra, yer, ağaç, boş yer, ara ağaç), oturtulan sıra yönü, sıra ve ağaç aralığı ve yer tablosu görünür; haritada sıra doğruları kesikli çizgi, boş yerler kırmızı halka.
4. **Doğrulama listesi:** "Emin değilim" işaretli ağaçlar, belirsizliği 0,5 m'yi aşanlar, üçgenleme uyarısı olanlar, boş yerler, sıra doğrusundan uzak (`sıra dışında`) ve aynı pozisyonda ikinci gövde (`çift gövde`) olanlar. **CSV olarak indir**: UTF-8 (BOM'lu), virgülle ayrılmış; sütunlar `kod,neden,enlem,boylam,belirsizlik_m`.
5. **Kaydet:** Önizleme onaylanınca yerler (`slot`) ve ağaçlar (`tree`, `first_seen_session_id` = envanter oturumu, `first_seen_at` = oturum başlangıcı) kullanıcının kendi yetkisiyle yazılır; servis anahtarı kullanılmaz. Kodlar sunucuda, tarayıcıdaki önizlemeyle aynı fonksiyonla ağaç konumlarından yeniden hesaplanır. Parselde zaten yer ya da ağaç varsa kaydetme engellenir ve neden gösterilir (mevcut envanteri değiştirme akışı sonra).

Çalışma, kaydedilene kadar tarayıcının `localStorage`'ında parsel + oturum başına taslak olarak tutulur (sayfa yenilenince kaybolmaz). Taslakta her ağacın tıklamaları (panorama, azimut, yükseklik açısı) da durur; gövde tespit modeli için etiketli veri olacak, ama henüz veritabanına yazılmıyor.

### Hesaplama (`src/lib/office/`, saf TypeScript, birim testli)

- **Yerel çerçeve** (`local-frame.ts`): WGS84 → doğu/kuzey metre, işleme hattının `LocalFrame`'iyle aynı formül. Çerçeve başlangıcı `parcel.local_origin`, yoksa sınırın merkezi.
- **Üçgenleme** (`triangulate.ts`): Tık → azimut = panorama `heading_deg` + tıklanan yaw (panorama yan dosyası kuralı: orta sütun `heading_deg`, sağa doğru artar). Çizgiler dik uzaklıklarının ağırlıklı en küçük kareleriyle kesiştirilir; ağırlık `1 / (sd_h² + (mesafe × 0,5°)²)`. Belirsizlik, 1σ hata elipsinin büyük yarı ekseni; ikiden çok çizgide artıklar beklenenden büyükse büyütülür.
- **Sıra oturtma ve kodlama** (`rows.ts`): Ağaçlar sıra yönüne (u) ve ona dik yöne (v) izdüşürülür. Yön, verilen değerin ±3° çevresinde v-izdüşümlerinin histogram yoğunluğuyla, sonra sıralar içindeki eğimin en küçük kareleriyle inceltilir. Sıralar v'deki boşluklarla ayrılır (eşik: tipik sıra aralığının yarısı); sıra aralığının %60'ından yakın küçük kümeler komşu sıraya katılır. Ağaç aralığı sıralar içindeki ardışık aralıkların medyanından, eksik ağaçları (tam katlar) hesaba katarak bulunur; bütün sıralar ortak bir ızgarayı (a0 + k × aralık) paylaşır.
  - Izgara noktasına aralığın ¼'ünden yakın ağaç: sıra yeri. Daha uzaksa: **ara ağaç**, numaralandırma yönünde önceki yerin kodu + harf (`S5-12a`, `b`…). Aynı noktada ikinci gövde: ara ağaç + `çift gövde`.
  - **Boş yer:** sıranın ilk ve son ağacı arasında ağaçsız ızgara noktası; parselin sınırı varsa sıranın uçlarından sınır içinde kalan noktalar da (sıra başı ve sonundaki eksik ağaçlar). Konumu sıra doğrusu üzerindeki ızgara noktası.
  - **Numaralandırma:** Seçilen köşeye en yakın ağacın sırası 1. sıradır, pozisyonlar o ağacın bulunduğu uçtan başlar. Pozisyon her sırada o sıranın ilk beklenen yerinden sayılır (sahada sıra sayımıyla bulunur).
- **Doğrulama listesi** (`verification.ts`), **önizleme ve kayıt için ortak hesap** (`plan.ts`), **kayıt** (`inventory.ts`).

### Panorama kaynağı

`PanoramaSource` arayüzü (`src/lib/office/panoramas.ts`) bir oturumun panoramalarını (konum, yön, zaman, kalite) ve görüntülerini verir. Görüntüler `/ofis/panorama/<set>/<panorama>/<2k|4k>` route handler'ından, `/ofis` bölümüne girebilen kullanıcılara sunulur; araç 2K önizlemeyi açar.

- **Yerel uygulama** (`local-panorama-source.ts`): `LOCAL_PANORAMA_DIR` altında (4 seviyeye kadar) `panoramas.json` içeren her klasör bir settir (işleme hattının çalıştırma klasörü). Oturum ve parsel kimliği, kamera yüksekliği `manifest.json`'dan okunur. Sadece `panoramas.json`'da listelenen ve çalıştırma klasörünün içinde kalan dosyalar sunulur. **Sadece geliştirmede açık:** üretim derlemesinde `LOCAL_PANORAMA_ALLOW_PRODUCTION=1` olmadıkça devre dışıdır (tarayıcı testleri üretim derlemesine karşı çalıştığı için bunu kullanır).
- Depolamadan okuyan uygulama, işleme hattının yükleme adımıyla birlikte gelecek.

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

- Birim: `triangulate.test.ts`, `rows.test.ts` (tohumlu pseudo-rastgele gürültü, eksik ve ara ağaçlı ızgaralar; 12 rastgele bahçe), `verification.test.ts`, `plan.test.ts`, `panoramas.test.ts` (yerel kaynak, yol dışına çıkma denemeleri).
- Entegrasyon (`tests/integration/office-inventory.test.ts`): test kendi parsellerini kurar; saha personeli kaydeder, ikinci kayıt engellenir, operasyon numaralandırmayı parsele yazar, saha personeli yazamaz, parseli gören sahip kaydedemez, erişimi olmayan göremez.
- Tarayıcı (`tests/e2e/office-tool.spec.ts`): global kurulum sentetik panoramaları `.dev-data/e2e` altına üretir (uv yoksa test atlanır). Test 12 ağacın her birine iki panoramada tıklar, konumları sentetik gerçekle (< 30 cm) ve kodları `synthetic_truth.json`'daki yer kodlarıyla karşılaştırır, bir ağacı "emin değilim" işaretler, CSV'yi indirir, kaydeder ve veritabanını denetler.

### Bilinen sınırlar

- **Kayıt tek işlem değil:** yerler ve ağaçlar iki ayrı insert. Ağaç insert'i başarısız olursa yazılan yerler silinmeye çalışılır, ama RLS'te `slot` silme yalnızca operasyonda var. Doğrusu bir veritabanı fonksiyonu (RPC) ile tek işlem; şema değişikliği gerektiği için bu PR'da yok.
- **Yer–oturum bağı yok:** `slot` tablosunda oturum alanı yok; oturum bağı ağaçların `first_seen_session_id`'si üzerinden.
- **Numaralandırmayı yalnızca operasyon yazabilir** (RLS: `parcel` güncellemesi `ops`). Sıra yönü kayıtlı olmayan parselde saha personeli kaydedemez; araç bunu önceden söyler.
- **Yatay üçgenleme:** tıklamanın yükseklik açısı kullanılmıyor (kamera yüksekliğiyle tek panoramadan mesafe tahmini yapılabilirdi).
- **Izgara varsayımı:** sıralar paralel ve aynı aralıklı ızgarada kabul edilir; şaşırtmalı (üçgen) dikim, eğri sıralar ve tamamen boş bir sıra algılanmaz.
- **Taslak tarayıcıda:** başka bir bilgisayardan devam edilemez.
