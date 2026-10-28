# Panorama görüntüleyicileri ve 360° gezi

Bu belge web uygulamasındaki üç panorama görüntüleyicisini anlatır: ofis üçgenleme aracı, uzmanın envanter onayı ve sahip portalındaki 360° gezi. Her birinin nerede kullanıldığını, kimin açabildiğini, görüntülerin nasıl yüklendiğini ve gezinmenin nasıl çalıştığını açıklar. Sonda test matrisi, bulunan hatalar ve performans ölçümleri yer alır.

Panorama biçimi ve yön kuralı için kaynak `services/pipeline/README.md` ("Panorama yan dosyası") ve `docs/arayuzler.md`'dir. Kısaca: eşdikdörtgen görüntünün orta sütunu `heading_deg` yönüne bakar, yaw sağa doğru artar, üst satır zenittir.

## 1. Envanter

### 1.1 Bileşenler

| Bileşen | Dosya | Görevi |
| --- | --- | --- |
| Ortak kanca | `src/components/panorama/use-panorama-viewer.ts` | Photo Sphere Viewer'ı (PSV) bir kez kurar; her panoramayı `setPanorama` ile açar; görüntüyü önce PSV önbelleğine indirir; yakınlaştırınca tam çözünürlüğe geçer; işaretçileri yalnızca gösterilen panoramaya koyar; komşu görüntüleri önceden indirir; klavyeyi yalnızca odakta açar; kapanınca WebGL bağlamını serbest bırakır |
| Çalışma zamanı | `src/lib/panorama/runtime.ts` | PSV'nin tek seferlik tembel yüklemesi; `fetchPanorama` (PSV önbelleğine indirme, eşzamanlı istekleri birleştirme); `destroyViewer` (`destroy` + `forceContextLoss`); WebGL denetimi; araç çubuğu düğmelerine rol ve ad |
| Ortak görünüm | `src/components/panorama/panorama.module.css` | Odak çerçevesi, 44 px araç çubuğu, yükleniyor ve hata notları. Renkler `var(--token, yedek)` biçiminde; tasarım sistemi (`claude/ui-temel`) bu dosyaya dokunmadan tema verebilir |
| Ofis görüntüleyicisi | `src/components/office/panorama-viewer.tsx` | Üçgenleme aracında iki yuva, uzman onayında bir yuva. Tıklama gövde ışını üretir |
| Gezi görüntüleyicisi | `src/components/portal/tour-viewer.tsx` | Gezideki tek görüntüleyici; ok ve ağaç işaretçileri, bakış yönü bildirimi |
| Gezi | `src/components/portal/tour.tsx` | Durum: hangi panorama, hangi ziyaret, imzalı adresler, yeniden deneme, adres çubuğu, adım düğmeleri, harita |
| Gezi mantığı (saf) | `src/lib/portal/tour-view.ts`, `src/lib/portal/tour.ts` | Açılış noktası, komşular (oklar), imzalanacak ve önceden indirilecek görüntüler, görüntü seçimi ve geri düşüş, pusula yönü, adres |
| İlk imza | `src/lib/portal/tour-sign.ts`, `src/app/portal/parsel/[parcelId]/gezi/page.tsx` | Sayfa, açılış panoramasının görüntülerini ve komşularının önizlemelerini sunucuda imzalar; gezi bir sunucu turu beklemeden yüklemeye başlar |
| Sonraki imzalar | `src/app/portal/parsel/[parcelId]/gezi/actions.ts` | `signTourImagesAction`: yürünen panoramalar için |
| Yer tutucu | `src/components/portal/tour-placeholder.ts` | Görüntü yoksa tarayıcıda çizilen gökyüzü, zemin ve pusula harfleri (son 8 yön önbellekte) |
| Ofis adresleri | `src/lib/office/panoramas.ts` | `/ofis/panorama/<set>/<panorama>/<2k\|4k>`; yerel klasör ya da depodan imzalı yönlendirme |

PSV ve three.js yalnızca görüntüleyici açıldığında yüklenir (`loadPhotoSphere`, dinamik `import`). Gezi ve ofis aracı `next/dynamic` ile `ssr: false` yüklenir. Parsel karnesi gibi öteki portal sayfaları bu kodu indirmez (§4).

### 1.2 Kim, nerede

| Ekran | Adres | Roller | Görüntü kaynağı |
| --- | --- | --- | --- |
| 360° gezi | `/portal/parsel/<parsel>/gezi` | Parselin sahibi ve hissedarı (`owner`, `viewer`), self-servis müşteri (kendi parselleri), demo ziyaretçisi | Yayımlanmış ziyaretlerin panoramaları; 15 dakikalık imzalı URL; demoda herkese açık `demo-media` aynası (`docs/demo-turu.md` §11.6) |
| Ofis üçgenleme aracı | `/ofis/parsel/<parsel>/envanter/duzenle` | `ops`, `field_staff` | `/ofis/panorama/...`: yerel klasör (geliştirme, `LOCAL_PANORAMA_DIR`) ya da depodan imzalı yönlendirme |
| Envanter onayı | `/uzman/envanter/<oturum>` | `expert` | `/uzman/envanter/<oturum>/panorama/...` |

Uzman ve ops portal gezisini açamaz ("Bu bölüme erişiminiz yok"). Başka bir parselin gezisi, portal rolü olan kullanıcıya 404 döner. İmza eylemi de yalnızca parselin yayımlanmış ziyaretlerindeki panoramaları imzalar; geri kalan kimlikler için `null` döner.

### 1.3 Görüntü yükleme

1. **Gezi açılışı:** Sayfa açılış panoramasını bulur. Önce `?panorama=`, sonra `?agac=`'ya en yakın panorama (ağaca dönük açılır), yoksa en yeni ziyaretin ilk panoraması. Sayfa bu panoramanın önizleme ve tam görüntüsünü, komşularının da önizlemelerini tek çağrıda imzalar. Demo ziyaretçisinde bu çağrı da `demo_hit('sign')` sayacına yazılır.
2. **Önce önizleme:** Görüntüleyici 2K önizlemeyle açılır. Yakınlaştırma 55'i geçince 4K tam görüntüye geçer; bakış ve yakınlaştırma korunur. Önizleme yoksa doğrudan tam görüntüyle açılır.
3. **İndirme PSV'nin dışında:** Görüntü `fetch` ile indirilir ve PSV'nin önbelleğine (`Cache`, URL anahtarlı, en çok 10 panorama) konur. `setPanorama` yalnızca çözer. Sebebi şu: PSV her `setPanorama` çağrısında kendi yükleyicisinin bütün isteklerini iptal eder. Önceden indirmeler o yükleyiciyle yapılsaydı her geçişte iptal olurdu. Ayrıca başarısız bir indirme PSV'ye hiç ulaşmaz, PSV'nin İngilizce hata kutusu çıkmaz.
4. **Önceden indirme:** Gösterilen panorama ekrana gelince bakış yönüne en yakın üç komşunun açılış görüntüsü indirilir. Bakış 45°'lik dilimlerle izlenir, her karede yeniden hesaplanmaz.
5. **İmza tazeleme:** İmzalı URL 15 dakika yaşar (`SIGNED_URL_TTL_S`). Gezi 10 dakikadan eski adresleri yürürken yeniden imzalar. Aynı türden yeni bir URL, gösterilen panoramayı yeniden yüklemez.
6. **Hata ve geri düşüş:** Yüklenemeyen bir görüntünün varlığı bir kez daha imzalanır ve yeniden denenir. Süresi dolmuş bağlantı ve kopan bağlantı bu yolla düzelir; demo aynası aynı URL'yi döndürse bile görüntü yeniden yüklenir. İkinci hatada sıra şöyledir: önizleme, sonra tam görüntü, sonra yer tutucu ve not ("Bu panoramanın görüntüsü yok…"). Yer tutucuda oklar ve ağaçlar yine gösterilir. Yakınlaştırmada tam görüntü yüklenemezse önizleme kalır, not çıkmaz. Ofis aracında hata, görüntüleyicinin üstünde bir not olarak çıkar ("Panorama görüntüsü açılamadı."). Sonraki panoramaya geçmek görüntüleyiciyi toparlar.
7. **Yavaş ağ:** Yeni panorama hazır olana kadar önceki görüntü ekranda kalır. Üstünde "Panorama yükleniyor…" notu (`role="status"`) ve `aria-busy` görünür. Siyah ekran yoktur. İşaretçiler yalnızca gösterilen panoramaya aittir: yükleme sürerken kalkar, gelince konur.
8. **WebGL yoksa:** Görüntüleyici açılmaz. "Bu tarayıcı 360° görüntüyü gösteremiyor…" notu çıkar, harita ve öteki sayfalar çalışmaya devam eder.

### 1.4 Gezinme

- **Oklar:** Her panoramada, 20 m içindeki en yakın panorama 8 yönün her biri için gösterilir (`neighbourPanoramas`). Ok işaretçisinin yanında aynı oklar görüntünün altında düğme olarak da yer alır ("Yürü": "Doğuya, 8 m"). Düğmeler klavye ve ekran okuyucu içindir, 44 px yüksekliktedir. Yürüyünce yürüme yönüne bakılır.
- **Önceki ve sonraki yok:** Gezide, ekibin yürüdüğü sıraya göre önceki ya da sonraki panorama düğmesi bilerek konmamıştır. Kare zamanı ve yürüyüş sırası gösterilmez (H05, T23). Sıra boyunca yürümek, düz ileri bakan okla yapılır. Ofis aracındaki "Önceki" ve "Sonraki" düğmeleri ise yan dosya sırasıyla adım atar (yalnızca ofis rolleri).
- **Haritadan atlama:** Haritada bir noktaya dokunmak en yakın panoramayı açar ve o noktaya döner.
- **Zaman yolculuğu:** Ziyaret seçimi, öteki ziyarette aynı noktayı (15 m içinde) aynı bakış yönüyle açar. Aynı nokta yoksa en yakın panorama açılır ve bunu söyleyen bir not çıkar.
- **Adres:** Ziyaretçi ilk kez yürüyünce adres çubuğu `?panorama=<kimlik>` olur (`replaceState`). Böylece yenileme, paylaşılan bağlantı ve ağaç karnesinden tarayıcının Geri düğmesi aynı panoramaya döner. `?agac=` düşer, `?tur=` (rehberli demo turu) korunur. Açılışta adres değişmez. Her adım geçmişe ayrı bir kayıt eklemez; Geri düğmesi gezinin önceki sayfasına gider.
- **İşaretçiler:** Ağaç işaretçisi (en çok 24 ağaç, 14 m içinde) ağaç karnesini açar. Ağaç kodu HTML olarak kaçışlanır.
- **Yakınlaştırma, tam ekran, klavye:** Araç çubuğunda yakınlaştırma, dört yön ve tam ekran bulunur; etiketleri Türkçedir, düğmelerin rolü ve adı vardır. Görüntüleyici sekmeyle odaklanır. Odaktayken ok tuşları çevirir, PageUp/PageDown ve +/− yakınlaştırır. Odak başka yerdeyken ok tuşları haritaya, rehberli tura ve formlara kalır.
- **Telefon:** Tek parmak sürükleyerek çevirir, iki parmak yakınlaştırır. Jiroskopla bakma yoktur. Görüntüleyici 390 px genişlikte yatay kaydırma yaratmaz.

### 1.5 Kaynak yönetimi

- Bir görüntüleyici bir kez kurulur ve bütün yürüyüş boyunca aynı kalır. Eski doku PSV tarafından atılır.
- Bileşen kapanınca (örneğin ağaç karnesine geçiş) `destroyViewer` WebGL bağlamını hemen serbest bırakır. three.js'in `dispose()` metodu bağlamı çöp toplayıcıya bırakır; Chromium en çok 16 bağlam tutar.
- Gezi, `PortalMap`'e sabit bir `findings` dizisi verir. `PortalMap`'in varsayılanı (`[]`) her çizimde yeni bir dizi olduğu için harita her çizimde baştan kuruluyordu (§3, H8).
- PSV, panorama başına GPano XMP aramaz (`useXmpData: false`). İşleme hattının panoramaları tam küredir; XMP yazılmaz.

## 2. Test matrisi

Birim testleri (Vitest) saf mantığı sınar. Tarayıcı testleri (Playwright) üretim derlemesine karşı, demo veri kümesinde (`pnpm db:demo-tour --profile test`, en yeni ziyarette önizlemeli ve tam görüntülü 40 panorama) ve ofis aracının sentetik oturumunda çalışır.

### 2.1 Birim

| Dosya | Kapsam |
| --- | --- |
| `src/lib/portal/tour-view.test.ts` | Açılış noktası (`?panorama=` başka ziyarette, `?agac=` yönü, bilinmeyen kimlik); komşular ve sıra boyunca yürüme; pusula yönleri; imzalanacak kimlikler; eskimiş URL; görüntü seçimi ve geri düşüş (önizleme → tam → yer tutucu, bekleme); önceden indirme sırası; adres; HTML kaçışlama |
| `src/lib/panorama/runtime.test.ts` | Önbelleğe indirme, eşzamanlı isteklerin birleşmesi, HTTP ve ağ hataları, yeniden deneme, üretilmiş görüntüler, önceden indirme hatalarının yutulması, bağlam serbest bırakma (`destroy` hata verse de), iptal tanıma |
| `src/lib/portal/tour-time.test.ts`, `portal.test.ts` ("tour geometry") | Yaw ve pitch hesabı, en yakın panorama, komşular, ağaç işaretçileri, zaman yolculuğu, görüş kaması |
| `src/lib/office/panoramas.test.ts` | Ofis adresleri, varyantlar, en yakın panorama çifti |

### 2.2 Tarayıcı

| Senaryo | Test |
| --- | --- |
| Gezi temiz açılır, konsolda hata yoktur, önizleme yüklenir, adres değişmez | `demo-tour.spec.ts` › 360° tour viewer › loads cleanly… |
| Erişilebilir adlar: görüntüleyici bölgesi, Türkçe araç çubuğu düğmeleri, "Yürü" düğmeleri (≥ 44 px) | aynı |
| Ok işaretçisi sayısı adım düğmeleriyle aynıdır; ağaç işaretçileri vardır | aynı |
| Klavye: odak dışındayken ok tuşu çevirmez, odaktayken çevirir; PageUp yakınlaştırır | aynı |
| Yakınlaştırma tam çözünürlüğü yükler; tam ekran açılır ve kapanır | aynı |
| Adım düğmesi ve ok işaretçisi yürütür, adres `?panorama=` olur | aynı |
| Ağaç işaretçisi ağaç karnesini açar; Geri aynı panoramaya döner; İleri ve Geri; yenileme (derin bağlantı) | aynı |
| Eski ziyaret için derin bağlantı; zaman yolculuğu; bilinmeyen kimlik en yeni ziyareti açar | › a deep link opens an older visit… |
| Geçici hata yeniden denenir; bütün görüntüler 404 olunca yer tutucu ve not çıkar, PSV hata kutusu çıkmaz; bağlantı dönünce sonraki panorama gerçek görüntüyle açılır; yakınlaştırmada tam görüntü hatası önizlemeyi korur; iptal edilen istekler; yavaş görüntüde yükleniyor notu ve `aria-busy`; yavaş imzada önceki görüntü kalır | › missing, refused and slow images… |
| 24 panorama boyunca tek bağlam, doku sayısı sabit; gezi ile karne arasında 6 gidiş dönüşten sonra canlı WebGL bağlamı artmaz; "Too many active WebGL contexts" uyarısı yoktur | › walking through 24 panoramas… |
| WebGL yoksa açıklayıcı not, harita çalışır, sayfa hatası olmaz | › without WebGL… |
| Roller: ops ve uzman erişemez, müşteri ve başka org'un sahibi 404 alır | › the tour opens for the parcel's readers only |
| Telefon (390 px, dokunmatik): tek parmak çevirir, iki parmak yakınlaştırır, adım düğmeleri ≥ 44 px ve ekrana sığar, dokununca yürür, yatay kaydırma olmaz | › 360° tour on a phone |
| Rehberli demo turunun gezi adımı (gerçek ayna görüntüleri, sınırda yer tutucu ve not) | `demo-tour.spec.ts` (mevcut) |
| Sahip portalı: ağaca dönük açılış, önizleme → tam, yer tutucu, ağaç işaretçisi | `portal-owner.spec.ts` (mevcut) |
| Ofis: 404'te not; sonraki panorama aynı görüntüleyicide açılır; erişilebilir ad, klavye; 25 adımda tek bağlam ve sabit doku sayısı; konsolda yalnızca istenen 404'ler | `office-tool.spec.ts` › viewers: a missing image… |
| Ofis: 12 ağaçlık üçgenleme, önizleme → 4K, kayıt (depo ve yerel kaynak); görüntü adreslerine rol denetimi | `office-tool.spec.ts` (mevcut) |
| Uzman onayında panorama | `inventory-approval.spec.ts` (mevcut) |

Haritanın altlık karoları (`/harita/karo/…`) çevrimdışı test ortamında 503 döner. Bu hatalar haritaya aittir ve "konsolda hata yok" denetiminin dışında tutulur (`tests/e2e/panorama-helpers.ts`).

### 2.3 Performans sondası

`tests/e2e/panorama-perf.spec.ts` bir kapı değildir. CI'da atlanır; `PANORAMA_PERF=1` ile çalışır ve sonuçları `PANORAMA_PERF_OUT`'a JSON olarak yazar. Ölçtükleri:

- gezi ve parsel karnesinin yüklediği JS (ham ve gzip) ve görüntüleyici kodunun karneye sızıp sızmadığı,
- gezinin başından ilk gerçek panorama karesine kadar geçen süre (yer tutucu sayılmaz; sayfa içinde `MutationObserver` ile),
- ok tıklamasından (`pointerdown`) yeni panoramanın gösterilmesine kadar geçen süre (20 geçiş),
- 20 geçişten sonra doku sayısı ve `gc()` sonrası JS yığını,
- 4G benzeri ağda (9 Mbit/s, 60 ms, önbelleksiz) ilk kare ve 8 geçiş.

## 3. Bulunan hatalar ve düzeltmeler

Her hata önce eski koda karşı bir testle yeniden üretildi, sonra düzeltildi.

| # | Hata | Etki | Düzeltme |
| --- | --- | --- | --- |
| H1 | Ofis görüntüleyicisinde ilk görüntü yüklenemezse PSV'nin `ready` olayı hiç gelmiyordu; görüntüleyici "Önceki" ve "Sonraki"ye tepki vermiyordu. Ekranda İngilizce bir hata kutusu kalıyordu ("The panorama cannot be loaded") | Ofis aracı kilitleniyor, sayfa yenilenmeli | Görüntüleyici görüntüsüz kurulur, her yükleme aynı yoldan geçer; hata Türkçe bir notla gösterilir, sonraki adım toparlar |
| H2 | Görüntüleyici kapanınca WebGL bağlamı serbest kalmıyordu. Gezi ile karne arasında 6 gidiş dönüşte canlı bağlam sayısı 3'ten 9'a çıktı; Chromium'un 16 bağlam sınırına ulaşılınca en eski bağlam (harita ya da görüntüleyici) düşürülür | GPU belleği sızıntısı; uzun oturumda harita ya da görüntüleyici kararabilir | `destroyViewer`: `destroy` ve ardından `forceContextLoss` |
| H3 | Gezi adres çubuğunu güncellemiyordu. Ağaç karnesinden Geri, ziyaretçiyi açılış panoramasına götürüyordu; bağlantı paylaşılamıyordu | Gezinme kayboluyor | `?panorama=` `replaceState` ile güncellenir; Geri ile geri yüklenen sayfada açılış noktasını adres belirler |
| H4 | Geçici bir görüntü hatası (süresi dolmuş imzalı URL, kopan bağlantı) panoramayı oturum boyunca yer tutucuda bırakıyordu. İmzalı URL'ler 15 dakikada doluyor, gezi onları hiç yenilemiyordu | Uzun gezide görüntüler kayboluyor | 10 dakikada yeniden imza; hatada bir kez yeniden imza ve yeniden deneme; sonra önizleme → tam → yer tutucu |
| H5 | İmza beklenirken yer tutucu bir an gösteriliyordu (her geçişte "Görüntü yok" yanıp sönüyordu) ve her geçiş bir sunucu turu bekliyordu | Titreme, yavaş geçiş | Komşular önceden imzalanır; beklerken önceki görüntü ve yükleniyor notu kalır |
| H6 | Klavye erişimi yoktu: görüntüleyici odaklanamıyordu, ok tuşları yalnızca tam ekranda çalışıyordu, oklar yalnızca fareyle ve dokunarak tıklanabiliyordu | Erişilebilirlik | Odaklanabilir bölge, odaktayken ok tuşları, "Yürü" düğmeleri, açıklama metni |
| H7 | PSV araç çubuğu İngilizceydi ("Fullscreen", "Zoom in"…); düğmelerin rolü ve erişilebilir adı yoktu; düğmeler 40 px idi | Arayüz dili, ekran okuyucu, dokunma hedefi | `lang` Türkçe, `role="button"` ve `aria-label`, 44 px |
| H8 | Gezide harita her React çiziminde baştan kuruluyordu: her adımda 3 yeni maplibre haritası açılıyordu, görüntüyü sürüklerken saniyede birkaç kez kuruluyordu. Sebebi `PortalMap`'in `findings = []` varsayılanı | İşlemci yükü, takılma, bağlam tüketimi | Gezi sabit bir dizi verir. Kök sebep harita bileşenindedir: `panoramas = []` varsayılanı da aynı sorunu taşır; sağlık haritası `panoramas` vermediği için parsel karnesi de etkilenir. Düzeltme harita bileşeninin sahibine bırakıldı (`claude/harita-test`), PR açıklamasında belirtildi |
| H9 | Ağaç işaretçisinin ipucu metni kaçışlanmıyordu (PSV ipucunu HTML olarak basar) | Ağaç koduna HTML girerse sayfaya HTML enjekte edilebilir | `escapeHtml` |
| H10 | WebGL yoksa PSV kurucuda hata atıyordu; gezi boş bir kutuyla kalıyordu | Eski ya da kısıtlı tarayıcılarda açıklamasız ekran | Önce denetim; açıklayıcı not |
| H11 | Görüntü yüklenirken işaretçiler yeni panoramanın konumlarıyla eski görüntünün üstüne çiziliyordu | Kısa süre yanlış yerde ok ve ağaç | İşaretçiler gösterilen panoramaya bağlı |
| H12 | Her görüntü, GPano XMP aramak için baştan sona dizgi olarak okunuyordu | 4K görüntüde megabaytlarca gereksiz iş | `useXmpData: false` |
| H13 | Yer tutucu önbelleğinin sınırı yoktu (yön başına bir PNG veri adresi, 360'a kadar) | Bellek | 8 yönlük LRU, JPEG |

## 4. Performans

Ölçüm `tests/e2e/panorama-perf.spec.ts` ile yapıldı: üretim derlemesi, yerel Supabase, demo veri kümesinin test profili (512 × 256 önizleme), başsız Chromium (yazılım WebGL). Değerler iki koşunun ortalamasıdır. Başsız tarayıcıda WebGL işlemcide çalıştığı için mutlak değerler gerçek cihazdan yüksektir; karşılaştırma için anlamlıdırlar.

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Gezinin yüklediği JS, gzip (ham) | 645 KB (2324 KB) | 648 KB (2332 KB) |
| Parsel karnesinin yüklediği JS, gzip; görüntüleyici kodu var mı | 474 KB; yok | 474 KB; yok |
| İlk gerçek panorama karesi (gezinin başından) | 1444 ms | 1027 ms |
| İlk kare, tekrar açılış | 1203 ms | 714 ms |
| Geçiş (ok tıklamasından yeni panoramaya), medyan / p90 / en çok | 671 / 873 / 916 ms | 106 / 199 / 225 ms |
| 4G ağda ilk kare (önbelleksiz) | 1939 ms | 1416 ms |
| 4G ağda geçiş, medyan / p90 | 526 / 740 ms | 108 / 155 ms |
| 20 geçişten sonra JS yığını (`gc()` sonrası) / doku sayısı | 20,7 MB / 1 | 20,2 MB / 1 |
| Gezi ile karne arasında 6 gidiş dönüşten sonra canlı WebGL bağlamı | 3 → 9 | 3 → 3 |
| Bir adımda kurulan maplibre haritası | 3 | 0 |

- **JS:** Görüntüleyici (PSV, three.js) yalnızca gezide ve ofis aracında, dinamik içe aktarmayla yüklenir. Parsel karnesi bu kodu indirmez. Bu durum önceden de böyleydi; değişiklik koruyor ve sonda bunu denetliyor.
- **İlk kare:** Sayfa ilk görüntüleri sunucuda imzalar; gezi yer tutucuyla değil doğrudan önizlemeyle açılır.
- **Geçiş:** Komşular önceden imzalanır, bakış yönündeki üç komşu önceden indirilir, harita yeniden kurulmaz ve XMP taraması yapılmaz.
- **Bellek:** Tek görüntüleyici; 20 geçişten sonra tek doku. Çıkışta WebGL bağlamı serbest kalır.

## 5. Açık riskler ve sonraki işler

- **Harita varsayılanları:** `PortalMap`'te `findings = []` ve `panoramas = []` varsayılanları her çizimde haritayı yeniden kuruyor (H8). Gezi kendi tarafını düzeltti; parsel karnesindeki sağlık haritası için düzeltme harita bileşeninde yapılmalı.
- **Gerçek görüntü boyutu:** Ölçüm test profilinin küçük görüntüleriyle yapıldı. Gerçek 2K/4K görüntülerde çözme ve doku yükleme ana iş parçacığında birkaç on milisaniye daha sürer. Daha da azaltmak için `createImageBitmap` ile çözen özel bir bağdaştırıcı yazılabilir.
- **Demo bütçesi:** Önceden indirme, adım başına en çok üç önizleme indirir. Demo ziyaretçisinin indirdiği veri biraz artar; `docs/demo-turu.md`'deki 5–15 MB tahmini içinde kalmalıdır, gerçek profil ölçülmedi.
- **Jiroskop:** Telefonda cihazı çevirerek bakma yoktur (PSV `GyroscopePlugin`). İstenirse eklenebilir; izin istemi ve kapalı varsayılan gerekir.
- **Tam ekran:** iOS Safari öğe düzeyinde tam ekranı desteklemez. PSV bu durumda düğmeyi gizler; ayrıca test edilmedi.
