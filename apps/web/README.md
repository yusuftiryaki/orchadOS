# apps/web

Next.js web uygulaması: sahip portalı, uzman paneli ve ofis üçgenleme aracı. Rol bazlı tek uygulama.

İş paketleri: İP5 (ofis üçgenleme aracı), İP7 (uzman paneli), İP8 (sahip portalı). Bkz. [docs/plan.md](../../docs/plan.md).

Şu anki hâli: giriş/çıkış, rol bazlı bölümler, her bölümde parsel listesi ve harita üzerinde parsel detayı (iskelet), `/ofis` altında **ofis üçgenleme aracı** (İP5), `/uzman` altında **uzman paneli** (İP7) ve `/portal` altında **sahip portalı** (İP8); üçü de aşağıda.

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
│   │   ├── ofis/                # saha personeli, operasyon
│   │   │   ├── parsel/[parcelId]/envanter/  # ofis üçgenleme aracı + kaydetme (server action)
│   │   │   └── panorama/[setId]/[panoramaId]/[variant]/  # panorama görüntüsü (route handler)
│   │   ├── operasyon/           # operasyon
│   │   │   └── parsel/[parcelId]/   # her bölümde parsel detayı
│   │   ├── forbidden.tsx        # 403 sayfası
│   │   └── page.tsx             # girişten sonra ilk erişilebilir bölüme yönlendirir
│   ├── components/              # bölüm başlığı, parsel listesi, harita, ağaç paneli
│   │   ├── office/              # üçgenleme aracı: harita, panorama görünümü, paneller
│   │   ├── portal/              # sahip portalı: karne, sağlık haritası, ağaç karnesi, gezi
│   │   └── expert/              # uzman paneli: kuyruk, inceleme, karar, bulgu, özet, kısayollar
│   └── lib/
│       ├── auth/                # roller → bölümler, oturum ve bölüm kontrolü
│       ├── i18n/tr.ts           # bütün arayüz metinleri
│       ├── map/                 # GeoJSON yardımcıları, altlık, ağaç renkleri
│       ├── office/              # üçgenleme, sıra oturtma, kodlama, doğrulama listesi (saf TS),
│       │                        # panorama kaynağı, envanter kaydı
│       ├── portal/              # portal sorguları + saf hesaplar (sınıf, değişim, ölçüm, gezi yönleri)
│       ├── media/               # storage:// adresleri, toplu imzalama ve önbellek, panorama varyantları
│       ├── expert/              # mevsim, metrik seçimi, özet (saf TS); sorgular, kararlar, bulgular
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
| `LOCAL_PANORAMA_DIR`              | Ofis aracı, sadece geliştirme: depoya ek olarak işleme hattı çıktılarının klasörü         |
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
- **Harita rengi** `tree_latest_assessment` görünümünden gelir (önce en yeni ziyaret, aynı ziyarette kaynak önceliği). Böylece son denetimde bakılmayan bir ağaç önceki denetimin rengini korur. Sorgu ortak (`fetchLatestAssessments`, `src/lib/parcels.ts`): uzman, ofis ve operasyondaki parsel haritası da aynı görünümü kullanır; portal ayrıca sadece yayımlanmış ziyaretlerin satırlarını renklendirir.
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

- **Depo** (`storage-panorama-source.ts`, her zaman açık): işleme hattının yüklediği `kind = panorama` asset satırları (`orchados-pipeline upload`, `services/pipeline/README.md` "Yükleme"). Oturum + hat sürümü başına bir set; yeniden işleme yeni bir set olarak görünür. Bir karenin tam ve önizleme satırları `pose.gps_time_ns` ile (yoksa konumla) eşlenir; `pose.variant` yoksa `full` sayılır (`src/lib/media/panorama-variants.ts`, portal gezisiyle ortak). Konum `asset.position`, yön `pose.heading_deg`, belirsizlik `position_uncertainty_m`, kalite `pose.quality` ve `quality_score`. Route handler görüntüyü kullanıcı adına imzalanmış 15 dakikalık bir adrese yönlendirir (302, `createMediaSigner`); sorgular ve imzalar satır bazlı yetkiyle çalışır, sahip yayımlanmamış bir oturumun panoramasını göremez. Kamera yüksekliği asset satırında olmadığı için 2,0 m kabul edilir (sadece panoramadaki ağaç işaretçilerinin yüksekliği için).
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

### Bilinen sınırlar

- **Yer–oturum bağı yok:** `slot` tablosunda oturum alanı yok; oturum bağı ağaçların `first_seen_session_id`'si ve etiketlerin `session_id`'si üzerinden.
- **Numaralandırmayı yalnızca operasyon yazabilir** (RLS: `parcel` güncellemesi `ops`). Sıra yönü kayıtlı olmayan parselde saha personeli kaydedemez; araç bunu önceden söyler.
- **Yatay üçgenleme:** tıklamanın yükseklik açısı kullanılmıyor (kamera yüksekliğiyle tek panoramadan mesafe tahmini yapılabilirdi). Depo kaynağında kamera yüksekliği 2,0 m kabul edilir.
- **Izgara varsayımı:** sıralar paralel ve aynı aralıklı ızgarada kabul edilir; şaşırtmalı (üçgen) dikim, eğri sıralar ve tamamen boş bir sıra algılanmaz.
- **Taslak tarayıcıda:** başka bir bilgisayardan devam edilemez.
- **Set seçimi serbest:** depo setinin oturumu seçilen oturumdan farklı olabilir (uyarıyla listelenir); etiketler kaydın oturumuna bağlanır.
- **Büyük ziyaret:** set listesi parselin bütün panorama satırlarını sayfa sayfa okur; çok ziyaretli parsellerde bir görünüm ya da sayım fonksiyonu gerekebilir.

## Uzman paneli (İP7)

Uzman (ziraat mühendisi) bir tarama ziyaretini uzaktan inceler, AI ön değerlendirmesini kabul eder ya da düzeltir, bulgu ve öneri yazar, raporu imzalayıp yayımlar (`docs/MVP.md` Modül 4). Yayımlanana kadar sahip ve izleyici ziyaretin hiçbir sonucunu görmez (satır bazlı yetki, `docs/veri-modeli.md` "Yayın").

### Ekranlar

| Adres                          | Ne var                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/uzman`                       | **Ziyaret kuyruğu:** `processed` ve `in_review` durumundaki periyodik tarama ve doğrulama ziyaretleri, en eskisi önce; parsel, tarih, aktif ağaç, incelenen ve kalan sayısı. **Aç** düğmesi `processed` bir ziyareti `in_review`'a alır. Altta işletmenin parselleri.                                                                                                                                                                                                      |
| `/uzman/ziyaret/<oturum>`      | **Ağaç ağaç inceleme.** Solda sıra/pozisyon koduna göre sıralı ağaç listesi ve filtreler: _İncelenmemiş_, _AI sorunlu dedi_ (AI sınıfı Sorunlu, Kuru ya da Yok), _Düşük güven_ (AI güveni %70'in altında ya da AI önerisi yok). Sağda seçili ağaç (`?agac=`): bu ziyaretin ve önceki yayımlanmış ziyaretin kesitleri yönlere göre yan yana, AI önerisi (sınıf, güven, model, ölçümler), önceki ziyaretin uzman sonucu, ağaç özellikleri, karar paneli ve ağacın bulguları. |
| `/uzman/ziyaret/<oturum>/ozet` | **Özet ve imza:** uzman sınıflarının dağılımı, önceki ziyarete göre sınıfı değişenler (kötüleşen/iyileşen), AI ile uyum, incelenmemiş ağaçlar, bütün bulgular, parsel bulgusu ekleme ve yayımlama.                                                                                                                                                                                                                                                                         |

**Kesitler** `asset` satırlarından (`kind = tree_crop`, yön `pose.direction`), ortak medya yardımcısıyla (`src/lib/media/`, 15 dakikalık imzalı adres, kullanıcı başına önbellek) gösterilir. Dosya depoda yoksa ya da açılamazsa yerine "Görüntü yok" kutusu çıkar (demo verisinde dosya yok).

**Önceki ziyaret:** aynı parselin, bu ziyaretten önceki en yeni yayımlanmış periyodik tarama ya da doğrulama ziyareti (zaman: `started_at`, yoksa planlanan gün, yoksa kayıt zamanı).

### Karar

- **AI'ı kabul et:** AI satırı değişmez. AI sınıfıyla yeni bir `source = expert` değerlendirmesi yazılır; AI'ın bu ziyaretin metrikleri için verdiği değerler aynı değer ve belirsizlikle uzman ölçümü olarak kopyalanır.
- **Düzelt:** Uzman sınıfı seçer ve metrikleri girer. Ölçek metrikleri zorunlu, sayı/kategori/evet-hayır metrikleri isteğe bağlı (görüntüden ölçülemeyebilir). Ölçek değerlerinin belirsizliği yarım basamak (0,5); sayı değerlerinde uzman belirsizliği kendisi girer. İsteğe bağlı not.
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

### Testler

- Birim (`src/lib/expert/*.test.ts`): mevsim, metrik seçimi (mevsim + görünürlük + konu), form girdisi ve AI değerlerinin kopyalanması, filtreler, özet ve önceki ziyarete göre değişim, adresler, bulgu doğrulama, uzman metinlerinin tamlığı.
- Entegrasyon (`tests/integration/expert-review.test.ts`): kuyruk ve incelemeye alma; AI'ı kabul (AI satırı değişmez, ölçüm, kanıt, bağ), düzeltme (eski kararlar kalır), bulgu ekleme/düzenleme/silme; eksik değerlendirmeyle yayımlamanın reddi; saha personeli ve operasyonun yayımlayamaması ve durumu doğrudan `published` yapamaması; sahibin sonuçları yayından önce görmemesi, sonra görmesi; yayından sonra donma.
- Tarayıcı (`tests/e2e/expert-review.spec.ts`): uzman girişi, kuyruktan açma, bir ağacı kabul, birini düzeltme, eksikle yayımlamanın reddi, kısayolla kabul, yayımlama.
- **Test verisi** (`tests/e2e/expert-fixtures.ts`): ölçümler silinemediği için uzman testleri ayrı bir test işletmesinde (`e7…`) çalışır. Test süresince örnek kullanıcılara orada rol verilir, sonunda geri alınır; yer ve ağaçlar sabit kimliklidir, her çalıştırma yeni oturumlar ekler. Kalan satırlar örnek kullanıcılara görünmez, ama genel satır sayısını sayan pgTAP testleri (`00_schema`) için önce `pnpm db:reset` gerekir.

### Bilinen sınırlar

- **Toplu onay ve kalite örneklemi yok:** Her ağaç tek tek kabul edilir (kesme listesi 5).
- **Eşik sabit:** Düşük güven eşiği %70 (`LOW_CONFIDENCE`); pilotta ayarlanacak.
- **Ölçümler donmuyor:** Yayından sonra değerlendirme ve bulgular kilitli; ölçümler (saha uygulamasının geç senkronizasyonu için) kilitli değil.
- **Bulgu kaydı tek işlem değil:** bulgu ve kanıtları iki ayrı yazma; kanıt yazılamazsa bulgu silinir.
- **Küçük önizleme yok:** kesit dosyası olduğu gibi gösterilir.
