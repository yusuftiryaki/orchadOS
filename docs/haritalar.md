# Haritalar

Web uygulamasındaki bütün MapLibre haritalarının envanteri, ortak çalışma zamanı, test matrisi ve ölçümler. Kod: `apps/web/src/components/map/`, `apps/web/src/lib/map/`; testler: `apps/web/tests/e2e/maps.spec.ts`, `apps/web/src/lib/map/*.test.ts`, `apps/web/src/lib/operations/geometry.test.ts`.

## 1. Ortak çalışma zamanı

Bütün haritalar `useMapLibre` kancası (`components/map/use-maplibre.ts`) üzerinden kurulur:

- **Tek yükleme:** `maplibre-gl` (~1,1 MB, sıkıştırılmış ~280 KB) yalnız haritalı sayfalarda ve ilk harita takıldığında dinamik olarak yüklenir (`lib/map/maplibre.ts`, `loadMapLibre`); işçi (worker) adresi bir kez ayarlanır. Haritasız sayfalar (`/portal`, `/operasyon`) bu parçayı indirmez. Yükleme başarısız olursa önbelleğe alınmaz, yeniden takmada tekrar denenir.
- **Bileşen ömrü başına bir harita:** Harita yalnız kancaya verilen bağımlılıklar değişince yeniden kurulur (çoğunda hiç, parsel haritasında parsel değişince). Veri değişiklikleri `source.setData`, seçim `feature-state` ile uygulanır; seçim binlerce ağacı yeniden göndermez.
- **Stil yüklenince katmanlar:** Katmanlar `style.load` olayında eklenir; altlık karoların inmesi beklenmez (`load` karoları bekler). `data-map-ready="true"` bu anda konur.
- **Hata sınıflandırma** (`classifyMapError`): stil yüklenmeden gelen hata stilin kendisidir, düz arka planlı yedek stile (`FALLBACK_STYLE`) geçilir; karo ya da bizim olmayan bir kaynağın hatası altlık hatasıdır, haritanın altında uyarı çıkar (`MapStatus`, `data-testid="map-status"`), sınır ve ağaçlar çizilmeye devam eder. Bu hatalar konsola yazılmaz; diğer hatalar `console.error` ile yazılır.
- **WebGL yoksa** (ya da parça inmezse) harita yerine açıklama çıkar; sayfanın geri kalanı çalışır.
- **Türkçe denetimler:** Yakınlaştır, Uzaklaştır, kaynaklar; tuval (`canvas`) haritanın kendi etiketini taşır (`mapLocale`).
- **Görünüm:** `components/map/map.module.css`, yalnız tasarım token'ları (`globals.css`). Harita içindeki renkler MapLibre boyası olduğu için somut değerdir ve tek yerde, `lib/map/tree-style.ts`'te (`MARKER_COLORS`, `MAP_COLORS`) durur; birim testi her değeri `globals.css`'teki token'la karşılaştırır. Ağaç sınıfı koyu halkalı nokta (`--class-ring`, `ClassDot` gibi), boş yer gri halkalı beyaz nokta, seçili ağaç kabuk (`--color-highlight`) halkası, sınır `--color-accent`. Odak halkası görünür; dokunmatik ekranda ve 640 px altında denetim düğmeleri 44 px, 640 px altında ölçek çubuğu sol üste geçer (atıf kutusunun altında kalmaz). Atıf bağlantılarının altı çizilidir. Durum iletileri ui `Alert`'tir. Hareketin azaltılması istendiyse (`prefers-reduced-motion`) kamera geçişleri ve panorama ataleti kapalıdır (`lib/map/motion.ts`).
- **Kaldırma:** Bileşen ayrılınca `map.remove()` çağrılır (WebGL bağlamı bırakılır), test kancası ve `data-map-ready` temizlenir.
- **Test kancası:** Kapsayıcıda `__map` (harita örneği; pikselleri `map.project` ile bulmak için). `NEXT_PUBLIC_MAP_TEST_HOOKS=1` ile derlenince (Playwright yapılandırması) `window.__orchadMaps` canlı, oluşturulan ve kaldırılan harita sayısını tutar.

Altlık: `NEXT_PUBLIC_MAP_STYLE_URL` varsa o stil; yoksa üretimde kendi karo vekilimiz (`/harita/karo/{z}/{x}/{y}.png`, H03, T12), geliştirmede doğrudan OSM karoları (`lib/map/basemap.ts`). Vekil üst kaynağa iletişim adresi olmadan istek atmaz (503); CI'da ve ağsız ortamda altlık uyarısı görünür, katmanlar çalışır.

## 2. Envanter

| Harita | Bileşen | Sayfa(lar) ve rol | Veri | Etkileşim | Yaşam döngüsü |
| --- | --- | --- | --- | --- | --- |
| Parsel haritası | `components/parcel-map.tsx` (`ParcelExplorer`, `ParcelDetail` içinde) | `/uzman/parsel/[id]` (uzman), `/operasyon/parsel/[id]` (ops), `/ofis/parsel/[id]` (saha, ops) | `getParcelMap`: son sınır sürümü, yerler, son sağlık sınıfı | Sınıra sığdırma, ağaca tıklayınca seçim ve yan panel, gösterim (lejant) | Parsel (sınır, yerler, sınırlar) değişince yeniden kurulur; seçim `feature-state` |
| Sağlık haritası | `components/portal/portal-map.tsx` (`HealthMap`) | `/portal/parsel/[id]` (sahip, hissedar, demo) | `getParcelReport`: yerler, bulgular, ziyaretler, kapsama | Sınıf süzgeci (katman filtresi), ziyaret seçici, değişenler, ısı ve kapsama katmanları, ağaç ve bulgu seçimi, `?bulgu=` odak, boş parselde boş durum | Parsel başına bir kez; yerler, bulgular, katmanlar `setData` |
| 360° tur haritası | `portal-map.tsx` (`Tour` içinde) | `/portal/parsel/[id]/gezi` | Turun panoramaları ve ağaçları | Haritaya tıklayınca en yakın panoramaya geçiş, bakış kaması, geçerli panorama vurgusu, zaman yolculuğu | Panoramalar ve ziyaret değişince `setData` (harita yeniden kurulmaz) |
| Sınır çizimi | `components/operations/boundary-draw-map.tsx` (`BoundaryEditor`, `GardenForm`) | `/operasyon/parsel/yeni`, `/operasyon/parsel/[id]/sinir`, `/operasyon/basvuru/[id]/bahce/[bahçe]` (ops); `/portal/basvuru/[id]/bahce/yeni` ve `/[bahçe]` (müşteri) | Denetimli: halka ve konum üst bileşende, gizli alanlarla forma gider | Köşe ekleme (tıklama, dokunma, klavyede Enter), köşe seçme, sürükleyerek taşıma (fare, parmak), silme (düğme, Delete), geri al, temizle, konum modu, önceki sürüm soluk, alan ve geçersiz halka iletisi | Bir kez kurulur; mod değişikliği haritayı yeniden kurmaz |
| Başvuru bahçeleri | `components/back-office/gardens-map.tsx` | `/operasyon/basvuru/[id]` (ops) | Başvurunun bahçeleri ve müşterinin mevcut parselleri (soluk) | Salt okunur; sığdırma | Yerler değişince (içeriğe göre) yeniden kurulur |
| Envanter haritası | `components/office/inventory-map.tsx` | `/ofis/parsel/[id]/envanter/duzenle` (saha, ops), `/uzman/envanter/[oturum]` (uzman), `/portal/parsel/[id]` sınır kartı (sahip) | Kayıtlı envanter: sınırlar, yerler, altyapı, iz, çizim | Yer seçimi (Shift ile çoklu), haritaya tıklayarak çizim, kodları göster | Bir kez kurulur; her katman `setData`; seçim `feature-state` |
| Ofis üçgenleme | `components/office/office-map.tsx` (`office-tool.tsx`) | `/ofis/parsel/[id]` üçgenleme aracı (saha, ops) | Panoramalar, ışınlar, aday, ağaçlar, boş yerler, sıra çizgileri | Haritaya tıklayınca en yakın panorama, ağaç seçme ve sürükleme | Bir kez kurulur; seçim `feature-state` |

Saf yardımcılar: `lib/map/geo.ts` (GeoJSON tipleri, sınır kutusu), `lib/map/features.ts` (halka kapatma, çizim verisi, yer özellikleri, dolgulu sınır kutusu), `lib/map/selection.ts` (seçim farkı), `lib/map/maplibre.ts` (yükleme, yerelleştirme, hata sınıfı, kayıt), `lib/operations/geometry.ts` (halka doğrulama, alan, köşe taşıma ve silme, yuvarlama).

## 3. Test matrisi

E2E (`tests/e2e/maps.spec.ts`, kullanıcılar seed'den, parola `orchados-dev`; karolar 1×1 PNG ile taklit edilir, ağa bağımlı değil). Sentetik parseller `tests/e2e/map-fixtures.ts`: 5000 ağaçlı büyük parsel ve ağaçsız boş parsel.

| Senaryo | Sağlık | Parsel | Sınır çizimi | Başvuru | Envanter | Ofis |
| --- | --- | --- | --- | --- | --- | --- |
| Tuval çizilir, konsol hatası yok | ✓ | ✓ (uzman, ops) | ✓ (yeni, sürüm) | ✓ | ✓ (ofis, uzman, sahip) | `office-tool.spec.ts` |
| Veriye sığdırma | ✓ | ✓ | ✓ | ✓ | ✓ | `office-tool.spec.ts` |
| Türkçe denetim adları, tuval etiketi | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Tıklayınca seçim ve ayrıntı, `feature-state` | ✓ | ✓ (panel kapanınca seçim kalkar) | — | — | ✓ | `office-tool.spec.ts` |
| Klavye: odak, +/−, oklar, düğmelere Tab/Enter | ✓ | — | ✓ (Enter köşe, Delete, Esc) | — | — | — |
| Köşe ekle, seç, sürükle, sil; geçersiz halka iletisi; mod değişimi | — | — | ✓ | — | — | — |
| Kaydet, veritabanında, yeniden yüklemede | — | — | ✓ | — | — | — |
| 390 px telefon, dokunma | ✓ (44 px düğme, yatay kaydırma yok, dokunarak seçim) | — | ✓ (dokunarak köşe, parmakla sürükleme) | — | — | — |
| Pencere boyutu değişince tuval | ✓ | — | — | — | — | — |
| Boş parsel: boş durum iletisi | ✓ | — | — | — | — | — |
| 5000 ağaç: yükleme, tıklama, süzgeç, kaydırma | ✓ | — | — | — | — | — |
| Karo isteği kesilir / 500: uyarı, katmanlar çalışır | ✓ | — | ✓ | — | — | — |
| WebGL yok: açıklama, sayfa çalışır | ✓ | — | — | — | — | — |
| Sayfalar arasında gezinme: harita ve WebGL bağlamı sızmaz | ✓ | — | — | — | — | — |

Mevcut testler de haritaları kullanır: `app.spec.ts`, `portal-owner.spec.ts` (tur dahil), `boundary-notice.spec.ts`, `operations-registration.spec.ts`, `customer-gardens.spec.ts`, `back-office-gardens.spec.ts`, `inventory-approval.spec.ts`, `office-tool.spec.ts`.

Birim (Vitest): halka kapatma ve çizim verisi, yer özellikleri (5000 yer), dolgulu sınır kutusu, seçim farkı ve `feature-state` uygulama, hata sınıflandırma, yerelleştirme, yedek stil, test kaydı, köşe taşıma/silme/yuvarlama, halka doğrulama (papyon, kenara değen köşe, eş doğrusal, çok köşe, geçersiz koordinat), alan (sarım yönünden bağımsız), 200 köşelik halkanın doğrulama süresi.

## 4. Bulunan hatalar

1. **Sağlık ve tur haritası her render'da yeniden kuruluyordu.** `PortalMap`'in `findings = []`, `panoramas = []` varsayılanları her render'da yeni dizi; ikisi haritayı kuran efektin bağımlılığıydı. Sağlık haritasında her ağaç seçimi, süzgeç ve katman değişikliği haritayı silip yeniden kuruyor (WebGL bağlamı, görünüm sıfırlanıyor, önceki seçim kayboluyordu); turda her panorama adımı aynı şeyi yapıyordu. Düzeltme: sabit varsayılanlar, bulgular ve panoramalar `setData` ile; harita yalnız sınır ve sınır kutusu değişince kurulur.
2. **Operasyon sınır editöründe mod değişimi haritayı bozuyordu.** `BoundaryDrawMap` moda göre `className` değiştiriyordu; React sınıfı yeniden yazınca MapLibre'nin kapsayıcıya eklediği `maplibregl-map` sınıfı düşüyor, tuval yerinden kayıyordu. Müşteri formu bunu haritayı her modda yeniden kurarak (`key={mode}`) atlatıyordu; `/operasyon/parsel/yeni` atlatmıyordu. Düzeltme: sınıf sabit, mod `data-mode` ile; müşteri formu artık haritayı yeniden kurmaz (görünüm korunur).
3. **Bir köşeye tıklamak üst üste ikinci köşe ekliyordu**, halka "en az üç ayrı köşe" hatasına düşüyordu. Artık köşeye tıklamak onu seçer; köşe taşıma ve silme yoktu, eklendi.
4. **Denetimler ve tuval İngilizceydi** ("Zoom in", "Map"); parsel haritasının erişilebilir adı yoktu. Türkçe etiketler ve harita adları eklendi.
5. **Altlık hataları konsola düşüyordu, kullanıcıya bir şey söylenmiyordu;** stil adresi erişilemezse katmanlar hiç çizilmiyordu. Sınıflandırma, yedek stil ve uyarı eklendi.
6. **WebGL olmayan tarayıcıda** `new Map` istisnası yakalanmıyordu (boş kutu). Açıklama eklendi.
7. **Boş parselde** harita bölge görünümünde boş kalıyordu, açıklama yoktu. Boş durum iletisi eklendi.
8. **Katmanlar altlık karolarını bekliyordu** (`load`): yavaş ya da kesik ağda ağaçlar geç ya da hiç çıkmıyordu. Artık `style.load`.
9. **Envanter haritasında varsayılan `[]` propları** (`slots`, `zones`, `track`) her render'da kaynağı yeniden gönderiyordu; uzman onay ekranı yerleri her render'da yeniden hesaplıyor, harita her seferinde bütün yerleri alıyordu. Sabit varsayılanlar ve içerik anahtarı; seçim `feature-state`.
10. **Dokunmatik ekranda denetim düğmeleri 29 px'ti**; 44 px yapıldı, odak halkası görünür.

## 5. Ölçümler

Yerel üretim derlemesi, başsız Chromium (yazılımla WebGL), yerel Supabase; üç denemenin ortancası. Süre: gezinmenin başından `data-map-ready`'ye.

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Sahip sağlık haritası (seed, 310 yer) hazır | 1318 ms | 725 ms |
| Sahip sağlık haritası (5000 ağaç) hazır | 1860 ms | 1226 ms |
| Uzman parsel haritası hazır | 765 ms | 362 ms |
| Operasyon yeni parsel, çizim haritası hazır | 638 ms | 573 ms |
| 5000 ağaç: tıklamadan panele | 469 ms | 397 ms |
| 5000 ağaç: yükleme sırasında uzun görevler toplamı | 613 ms | 576 ms |
| 5000 ağaç: ağaç seçimi başına yeniden kurulan harita | 1 | 0 |
| 5000 ağaç: kaydırma (yazılımla WebGL) | 25 fps | 25 fps |
| Haritalı sayfa JS (aktarılan) | 480 KB | 482 KB |
| Haritasız sayfa JS (`/portal`) | 181 KB, maplibre yok | 181 KB, maplibre yok |
| Haritalı sayfa CSS | 21,9 KB | 22,3 KB |

`next build` (Turbopack) rota boyutlarını artık yazdırmıyor; boyutlar sayfanın indirdiği `/_next/static` dosyalarından ölçüldü. maplibre zaten dinamik içe aktarılıyordu; kazanç `style.load`, yeniden kurulmayan harita ve `feature-state`'ten.

## 6. Bilinen sınırlar

- Ofis üçgenleme haritasında ağaç sürükleme yalnız fareyle (ofis aracı masaüstü içindir).
- Altlık uyarısı bir karo bile inemezse görünür ve sayfa boyunca kalır; kısa bir kesintiden sonra kendiliğinden kaybolmaz.
- Stil adresi (`NEXT_PUBLIC_MAP_STYLE_URL`) hatası derleme zamanında seçildiği için e2e'de değil birim testinde sınanır.
- Tasarım sistemi (`claude/ui-temel`) birleşince `--map-*` belirteçleri ve düğme görünümü ona bağlanmalı.
