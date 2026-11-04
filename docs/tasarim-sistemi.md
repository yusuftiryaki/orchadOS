# Tasarım sistemi

28 Ekim 2026 · Arayüz yenileme, 1. dalga; 29 Ekim 2026 · 3. dalga (entegrasyon); 4 Kasım 2026 · 4. dalga (müşteri ekranları, sadeleştirme)

Bu belge orchadOS web arayüzünün görsel dilini ve bileşen sözleşmesini tutar. 1. dalgada tasarım sistemi ve karşılama sayfası yapıldı. 2. dalgada portal, personel ekranları (ofis, operasyon, uzman, back office) ve kalan site sayfaları bu belgeye göre yeniden düzenlenir. Bir token ya da bileşen sözleşmesi değişirse önce bu belge güncellenir.

- Token'lar: `apps/web/src/app/globals.css`
- Bileşenler: `apps/web/src/components/ui/`
- Site kabuğu: `apps/web/src/components/site/` (başlık, mobil menü, altbilgi, karşılama sayfası)
- Bölüm kabuğu: `apps/web/src/components/section-shell.tsx`, `AppShell` üzerine kurulu

## İçindekiler

1. [Denetim](#denetim)
2. [Tasarım planı](#tasarım-planı)
3. [Token'lar](#tokenlar)
4. [Bileşenler](#bileşenler)
5. [Kullanım](#kullanım)
6. [Performans](#performans)
7. [4. dalga: müşteri ekranlarının sadeleştirilmesi](#4-dalga-müşteri-ekranlarının-sadeleştirilmesi)
8. [Notlar](#notlar)

## Denetim

Yenilemeden önceki arayüzün ekran görüntüleri (28 Ekim 2026, `main` 60cfaff4) 390 ve 1440 piksel genişlikte alındı. Ekranlar örnek kullanıcılarla açıldı: oturumsuz ziyaretçi, `owner@`, `customer@`, `ops@` ve `expert@example.com`. Sorunlar alana göre, en ağırı başta sıralandı.

### Site/karşılama

- **KVKK aydınlatma metni, 390: yurt dışı aktarım tablosunun 4. sütunu ("Aktarılan") ekranın dışında kalıyor ve görünmüyor.** Satırlar görünmeyen metin kadar uzuyor: "[Anthropic PBC]" satırında yaklaşık 600 px boş beyaz alan var. Kelimeler hecenin ortasından bölünüyor ("barındırılmas ı", "değerlendir mesi"); bunun nedeni `site.module.css`'teki `overflow-wrap: anywhere`. Hukuken zorunlu bilgi mobilde okunamıyor. Kategoriler: mobil, erişilebilirlik.
- **İletişim, 390 ve 1440: kartta "[Telefon]", "[E-posta]", "[Adres]", "[kvkk@alanadi]", "Hafta içi [09.00–18.00]" yer tutucuları duruyor.** Aynı sayfanın altbilgisinde ise gerçek değerler var: "destek@example.com · +905550000100". Aynı bilgi iki kaynaktan geliyor ve biri doldurulmamış. Kartın altında 1440'ta yaklaşık 250 px boş alan kalıyor. Kategoriler: boş/hata durumları, tutarlılık.
- **Paketler, 1440: üç fiyat kartında fiyatlar aynı hizada değil.** "Kapsamlı" kartının açıklaması dört satır sürdüğü için "₺1.209,60" öbür kartlardaki "₺499,20" ve "₺864"ten yaklaşık 46 px aşağıda. Kartların hiçbirinde "Bu paketle başvur" gibi bir eylem yok, önerilen paket de vurgulanmıyor. Sayfanın kendine ait bir CTA'sı yok, kullanıcı başlıktaki "Kayıt ol"a dönmek zorunda. Kategoriler: hiyerarşi, tutarlılık.
- **Paketler, 390 ve 1440: kart içindeki öbekler birbirine yapışık.** "Envanter ücreti … ₺7.200" satırı ile "Örnek: 20 dönüm: …" paragrafı arasında boşluk yok. Fiyat altındaki iki satır ("dönüm başına, yıllık, KDV dahil" ve "Ziyaret başına …") ve "Yılda 2 periyodik ziyaret" satırı üç farklı yazı boyutunda ve renginde. Kategoriler: boşluk, tipografi.
- **Açılış, 390: başlıktaki "Demoyu dene" bağlantısı mobilde kayboluyor; yalnızca "Giriş" ve "Kayıt ol" kalıyor.** İkinci satırdaki gezinme ("Nasıl çalışır · Paketler · SSS · İletişim") her sayfada yaklaşık 50 px dikey yer kaplıyor. Kategori: mobil.
- **Açılış, 1440: hero'da dört eşdeğer eylem var: "Kayıt olun", "Demoyu dene", "Nasıl çalışır?" ve "Hesabınız varsa giriş yapın".** Başlıkta da "Giriş", "Demoyu dene" ve "Kayıt ol" tekrarlanıyor. Hero'nun sağ yarısı boş: görsel ya da ürün önizlemesi yok. Ürünün asıl değeri olan harita ve 360° gezi görünmüyor. Kategori: hiyerarşi.
- **Kart başlığı ölçeği sayfadan sayfaya değişiyor.** Açılıştaki "Neden orchadOS?" kartlarında ("Bağımsız", "Uzman imzalı") 15 px kalın başlık kullanılıyor. Aynı tasarımdaki "Portalda ne görürsünüz?" ve "Neyi iddia etmiyoruz?" kartları, Nasıl çalışır'daki "1. Kayıt … 6. Periyodik ziyaretler" kartları ve Paketler'deki "Temel/Standart/Kapsamlı" kartları ise yaklaşık 20–22 px başlık kullanıyor. Kategoriler: tipografi, tutarlılık.
- **Nasıl çalışır ve Paketler, 1440: giriş paragrafı ile ilk kart satırı arasında yalnızca yaklaşık 12 px var.** Başlık ile paragraf arası ise yaklaşık 40 px. Boşluk ritmi ters çalışıyor: paragraf kartlara yapışık duruyor. Kategori: boşluk.
- **SSS, 390 ve 1440: akordeon işareti tarayıcının siyah "▶" üçgeni ve marka renginde değil.** Mobilde iki satıra kayan soruların ("Bahçemin sınırını bilmiyorum, sorun olur / mu?") ikinci satırı üçgenin altına giriyor, soru metninin hizasında başlamıyor. Sayfada giriş metni ve "Sorunuzun cevabı yok mu? İletişim" yönlendirmesi yok. Kategoriler: tutarlılık, tipografi.
- **KVKK, 1440 ve 390: 6.400 px (mobilde 11.000 px) uzunluğundaki metinde içindekiler listesi, bölüm bağlantıları ve "başa dön" yok.** Sarı taslak uyarısı ("Bu metin taslaktır…") başlığın üstünde duruyor ve okunan ilk şey o oluyor. Kategoriler: hiyerarşi, erişilebilirlik.
- **Bütün site sayfaları, 390: altbilgi yaklaşık 600 px uzunluğunda.** Şirket künyesi, 4 gezinme bağlantısı ve 7 hukuk bağlantısı tek sütunda alt alta, araları ayrılmadan diziliyor. Hukuk bağlantıları dokunmatik hedef olarak sıkışık: satır aralığı yaklaşık 26 px. Kategoriler: mobil, erişilebilirlik.

### Giriş/kayıt

- **Giriş, 1440: sol paneldeki "Hesaplar operasyon ekibi tarafından açılır." notu sağdaki "Hesabınız yok mu? Kayıt olun" bağlantısıyla çelişiyor.** Self-servis kayıt açık olduğu için not yanlış bilgi veriyor. Kategoriler: tutarlılık, boş/hata durumları.
- **Giriş, 390 ve 1440: sitenin başlık ve altbilgisi yok; ana sayfaya dönmenin tek yolu logo.** Kayıt sayfası ise site kabuğunun içinde. Birbirinin devamı olan iki adım iki ayrı yerleşimle gösteriliyor. "Parolamı unuttum" bağlantısı da görünmüyor. Kategoriler: tutarlılık, hiyerarşi.
- **Giriş, 1440: form, sağ yarının dikey ortasında kalıyor (y ≈ 240–670) ve sol paneldeki başlıkla aynı hizada değil.** Sol panelin yeşil degradesi giriş için ayrı bir marka dili kuruyor. Aynı degrade sitenin başka hiçbir yerinde yok. Kategoriler: tutarlılık, renk.
- **Kayıt, 390 ve 1440: alt başlıkta iki paragraf, toplam beş satır gri metin var ("Bahçeniz için hesap açın…" ve "Başvurunuzu … değerlendiririz…").** Bu metin ilk alanı ekranın altına itiyor. KVKK kutusundaki "Metin sürümleri: kvkk-v2-taslak, riza-v2-taslak" satırı geliştirici bilgisi ve kullanıcıya gösterilmemeli. Kategoriler: hiyerarşi, tipografi.
- **Kayıt, 390 ve 1440: üç farklı kutu tarzı alt alta.** "Size nasıl ulaşalım?" gri zeminli fieldset, KVKK onayı beyaz zeminli kart, alanlar ise çerçevesiz. "Parola" altındaki "En az 8 karakter" ipucu yalnızca bu alanda var. Diğer alanlarda ipucu yok, telefonun biçim ipucu da placeholder'da ("Örnek: 0532 123 45 67") ve yazmaya başlayınca kayboluyor. Kategoriler: tutarlılık, erişilebilirlik.

### Portal (sahip & müşteri)

- **Portal, bütün sayfalar, 390 ve 1440: iki gezinme katmanı birbiriyle çelişiyor.** Üst başlıktaki hap "Bahçelerim" her sayfada etkin görünüyor: "Başvurularım" ve "Hesabım"da da. Altındaki sekme grubunda ise "Bahçelerim" ikinci kez yer alıyor. Kullanıcı hangi düzeyde olduğunu anlayamıyor. Kategoriler: tutarlılık, hiyerarşi.
- **Portal, 390: sayfa kenar boşlukları tutarsız.** Başlık ve logo x=16'dan, sekme kutusu x=24'ten, "Bahçelerim" ve "Başvurularım" başlıkları x=8'den, kartlar x=8'den başlıyor. Sekme kutusu ile sayfa başlığı arasında boşluk yok ("Hesabım" başlığı sekmelere yapışık). Kategoriler: boşluk, mobil.
- **Portal, 1440: başlık çubuğu tam genişlikte (logo x=24, "Çıkış" x=1416), içerik ise x=144–1296 arasında.** Sekme kutusu yaklaşık 655 px'te kesiliyor ve sağdaki "Yeni başvuru" düğmesiyle aynı ızgarada değil. Site tarafında içerik ve başlık x=176'dan hizalı. Portal ve personel tarafında hiza ilkesi farklı. Kategoriler: boşluk, tutarlılık.
- **Sahip portalı "Bahçelerim", 1440: sekmeler ile "Bahçelerim" başlığı arasında yaklaşık 110 px açıklama gelmeyen boşluk var (y=120–235).** Müşteri portalında aynı başlık y=168'de. Boş bir bildirim ya da bant alanı yer kaplıyor gibi görünüyor. Kategori: boşluk.
- **Sahip portalı "Bahçelerim": kart "Henüz yayımlanmış denetim yok" diyor, ama altında tam genişlikte birincil "Karneyi aç" düğmesi var.** Bahçe adı "Örnek Bahçe 1" altı çizili yeşil bağlantı ve aynı hedefe ikinci bir giriş. Tek bahçe 1152 px'lik alanda 372 px genişlikte, solda yalnız duruyor. Kategoriler: hiyerarşi, boş/hata durumları.
- **Hesabım, 1440 ve 390: "Bahçelerim" kartı "Hizmette bahçeniz yok." diyor, ama aynı kullanıcının Bahçelerim sekmesinde "Örnek Bahçe 1" kartı var.** Hemen altında "Siparişsiz bahçeler" başlığı ve yaklaşık 40 px boşluk, sonra "Örnek Bahçe 1 · Bu bahçeyi çıkarmak için bize ulaşın" satırı geliyor. Durum dili kafa karıştırıyor ve boşluk kırık görünüyor. Kategoriler: boş/hata durumları, boşluk.
- **Hesabım: altı kart aynı ağırlıkta alt alta diziliyor.** "Sözleşme belgeleri", "İzinler" ve "Özet" kartlarının her biri tek bir bağlantıdan ibaret ve neredeyse boş. "Özet" kartında "0 başvuru / 0 sipariş / 0 ödeme" sayaçları altı çizili bağlantı biçiminde. Sıfır değerli sayaçlar bağlantı olmamalı. Kategoriler: hiyerarşi, boş/hata durumları.
- **Parsel sayfası, 1440 ve 390: "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin…" uyarısı aynı sayfada üç kez tekrarlanıyor.** Bir kez sarı kutuda, bir kez sağlık haritasının altında paragraf olarak geçiyor. Bunlara ek olarak her haritanın altında bir de "Fiili kullanım sınırı; tapu ya da kadastro sınırı değildir." satırı var. Mobilde bu metinler yaklaşık 400 px tutuyor. Kategoriler: hiyerarşi, boşluk.
- **Parsel sayfası: sarı uyarı rengi iki farklı anlamda kullanılıyor.** Hukuki uyarı ("Haritadaki sınır…") ve boş durum ("Bu bahçe için henüz yayımlanmış bir denetim sonucu yok…") aynı sarı tonda. Boş durum bir uyarı değil, bilgi. Kategoriler: renk, boş/hata durumları.
- **Parsel sayfası, sağlık haritası: "Değerlendirilmedi (302)" mavi (#1c7ed6 civarı).** Bu ton paletin dışında, açıklama satırındaki yeşil, sarı, kırmızı ve kahve tonlarıyla aynı aileden değil. Haritanın tamamı mavi noktalara boğuluyor. "Sağlıklı (0)" ve "Dikkat (0)" gibi sıfır değerli filtre çipleri seçilebilir duruyor. Kategoriler: renk, boş/hata durumları.
- **Parsel sayfası, 390: harita ölçek çubuğu ("50 r…") atıf yazısının altında kalıp kesiliyor.** "Katmanlar:" etiketiyle iki onay kutusu iki satıra dağılıyor. "Bir ağaca dokunun…" ipucu kartı haritanın altına, filtrelerin de altına düşüyor. Kategori: mobil.
- **Parsel sayfası, Hissedarlar, 1440 ve 390: onay kutusu etiketinin yanında değil, üstünde duruyor.** "Bu kişinin bahçede hakkı var…" kutunun altında başlıyor. "Erişimi kaldır" düğmesi isim satırının sonuna boşluksuz yapışık. Davet formundaki girişler (yaklaşık 240 px) sayfadaki diğer formlardan dar. Kategoriler: erişilebilirlik, boşluk.
- **Başvurularım, 390: başvuru numarası "B-2026-000001" üç satıra bölünüyor ("B-", "2026-", "000001").** Tarih de iki satıra kayıyor. Numara sütunu tek aralıklı (monospace) yazıyla dizilmiş ve sayfanın geri kalanından farklı. Kategoriler: mobil, tipografi.

### Personel (ofis/operasyon/back office/uzman)

- **Ofis "Parseller" (390), Uzman paneli (390), Operasyon panosu (390), Başvurular (390), Fiyatlar (390) ve Ziyaretler (390): tablolar ekran genişliğini aşıyor.** Ofis ve Uzman sayfalarında bütün sayfa yatay kayıyor. Görüntüler 459 px ve 635 px genişliğinde, beyaz başlık çubuğu 390 px'te bitiyor. Neden: `parcel-list.module.css`'te kaydırma sarmalayıcısı yok, `expert.module.css`'te `overflow: hidden` var. Öbür tablolarda "Düzenle", "Durum" ve "Sorumlu" sütunları kaydırma işareti olmadan kesiliyor. Kategoriler: mobil, erişilebilirlik.
- **Operasyon, bütün sayfalar: iki gezinme satırı, ikisi farklı biçimde.** Üstte hap sekmeler var: "Pano … KVKK talepleri" ve aynı grupta eylemler ("+ Yeni sahip", "+ Yeni parsel", "+ Ziyaret planla"). Altta "Müşteri ve ödeme:" etiketli yeşil metin bağlantıları var ("Başvurular … Ayarlar"). Mobilde bu iki satır başlık hariç yaklaşık 290 px tutuyor ve içerik ancak y=430'da başlıyor. Gezinme ile eylemler ayrılmamış. Kategoriler: hiyerarşi, mobil.
- **Operasyon panosu, 1440: 18 sayaç kartının hepsi aynı ağırlıkta.** Tek dolu değer olan "1 İncelenecek başvuru" ve "1 İncelemede" hiçbir biçimde öne çıkmıyor. Kartlar etiket uzunluğuna göre 100, 124 ve 147 px gibi farklı yüksekliklerde ve ızgara pürüzlü. "Müşteri ve ödeme" sayaçları bir kartın içinde, "Ziyaretler (durumlarına göre)" sayaçları ise kartın dışında. Kategoriler: hiyerarşi, tutarlılık.
- **Filtrelerde üç ayrı desen var.** Başvurular ve Siparişler'de altı çizili metin bağlantıları kullanılıyor ("Tümü İncelemede Teklif verildi …") ve seçili filtre belli değil. Ziyaretler'de açılır menüler ve "Uygula" düğmesi var. Uzman "Sorular"da hap çipler var ("Cevap bekleyen (0)" dolu yeşil, "Tümü (0)"). Filtre satırı tabloya boşluksuz yapışık. Kategoriler: tutarlılık, erişilebilirlik.
- **Tablo biçimi bölüme göre değişiyor.** Operasyon ve Ofis tablolarında başlık satırı normal yazımlı, zemin beyaz, köşeler keskin. Uzman tablolarında BÜYÜK HARF ("PARSEL", "AÇIK DOĞRULAMA"), açık yeşil başlık zemini ve yuvarlak köşeler var. Kodda `.table` tanımı en az 7 CSS modülünde tekrarlanıyor (operations, expert, portal, site, contracts, parcel-list, office ×2). Kategori: tutarlılık.
- **Aynı yaşam döngüsü verisi farklı biçimlerde gösteriliyor.** Ofis "Parseller" ve Uzman "Parseller" tablolarında "Envanter tamam" düz metin, Operasyon panosunda gri rozet. Uzman "Envanter onayı bekleyenler" tablosunda "İncelemede" düz metin, Ziyaretler ve Başvurular'da gri rozet. Kategoriler: tutarlılık, renk.
- **Durum rozetlerinin hepsi aynı gri tonda: "İncelemede", "Taslak", "Yayımlandı" ve "Bugün geçerli".** Durumun anlamı renkle ayrılmıyor. Fiyatlar'da "Yayımlandı" ve "Bugün geçerli" rozetleri arasında boşluk yok, yan yana yapışıklar. Kategoriler: renk, boşluk.
- **Siparişler, 1440 ve 390: sayfanın ilk öğesi tamamen boş bir kart ("Sözleşme belgesi eksik siparişler", "… sipariş yok.").** Asıl liste filtrelerin altında tek bir gri cümle olarak kalıyor ("Bu durumda sipariş yok."). Boş istisna kartı birincil listenin önüne geçiyor. Kategoriler: hiyerarşi, boş/hata durumları.
- **Birincil ve ikincil düğme rolleri tutarsız.** Portal'da "Yeni başvuru" dolu yeşil birincil düğme. Fiyatlar'da "Yeni paket" ve "Boş taslak aç" ise çerçeveli ikincil düğme. Uzman tablosunda satır eylemi "İncele" dolu yeşil düğme, Fiyatlar'da satır eylemi "Düzenle" altı çizili bağlantı. Kategoriler: tutarlılık, hiyerarşi.
- **Uzman paneli: alt sayfa "Sorular (0 cevap bekliyor)" yalnızca başlığın üstündeki küçük altı çizili bağlantıyla açılıyor.** Operasyon ve portaldaki sekme yapısı uzman panelinde yok. Başlıktaki tek hap "Uzman paneli" ise gezinme işlevi görmüyor. Boş kuyruk durumu ("İnceleme bekleyen ziyaret yok.") sol kenarı yeşil şeritli bir kartta gösteriliyor. Bu, portaldaki "İncelemedeki başvuru" kartıyla aynı görsel dil ama anlamı farklı. Kategoriler: hiyerarşi, tutarlılık.

### Ortak

- **Sonuç ve bildirim kutuları birden fazla bileşende ayrı ayrı yazılmış.** Kodda iki ayrı `result-notice.tsx` var (`components/operations/` ve `components/portal-billing/`). Bunlara ek olarak `demo-notice.tsx`, `legal-notice.tsx`, `notice-gate.tsx` ve `globals.css`'teki `.error` var. Ekranlarda en az dört görsel tür görülüyor: sarı dolu kutu (KVKK taslak, parsel uyarıları), sol kenarı yeşil şeritli beyaz kart (uzman boş kuyruk, müşteri başvuru kartı), düz gri cümle (operasyon boş durumları) ve onay satırı ("✓ Siz 12 Eki 2026 tarihinde onayladınız"). Kategoriler: tutarlılık, renk.
- **Gezinme en az beş ayrı uygulamayla kurulmuş:** site başlığı (`site-header.tsx`), bölüm kabuğu hapları (`section-shell.tsx`), portal sekmeleri (`portal-nav.tsx`), operasyon sekmeleri ve alt satırı (`ops-nav.tsx`), ofis aracı sekmeleri (`office-tool`, `inventory` modüllerindeki `.tabs`). Her birinin etkin durumu farklı: beyaz hap, yeşil zeminli hap, kalın yeşil metin, ya da hiç gösterge yok (site). Kategori: tutarlılık.
- **Sabit kodlanmış renkler 10 CSS modülüne dağılmış.** Örnekler: `#e8a317`, `#f1d9a6`, `#e8590c`, `#a33c00`, `#e7f5ff`, `#a5d8ff`, `#343a40`, `#212529`, `#fff`; bunların çoğu Open Color tonu. Etkilenen modüller: `portal`, `portal-billing`, `operations`, `site`, `demo`, `contracts`, `office`, `parcel-explorer`, `giris/login`. Bunun yanında `.tsx` dosyalarında 52 satır içi `style={{…}}` var. Uyarı sarıları ve mavi tonlar `globals.css`'teki token'ların dışında kalıyor ve karanlık tema ya da tema değişikliği bu renkleri kapsamıyor. Kategoriler: renk, tutarlılık.
- **Üç farklı kabuk ve hiza ızgarası kullanılıyor.** Site içeriği yaklaşık 1088 px genişlikte ve x=176'da hizalı. Portal ve personel tarafında başlık tam genişlikte, içerik ise 1152 px ve x=144'te. Giriş sayfası 50/50 bölünmüş tam ekran. Sayfa başlıkları da kabuğa göre değişiyor: site ve portalda 28 px, operasyonda 28 px ama üstünde iki gezinme satırı, uzman panelinde üstünde bir geri bağlantısı var. Kategoriler: tutarlılık, boşluk.
- **Kart, rozet, istatistik ve sekme tanımları her modülde yeniden yazılmış.** `.card` 5 yerde tanımlı (globals ×2, signup, login, operations, portal-billing). `.badge` 3, `.stat` 2, `.tabs` ve `.nav` 5 yerde tanımlı. Kenar yarıçapı, gölge ve iç boşluk değerleri bu yüzden ekranlar arasında birkaç piksel farklı: site kartları yaklaşık 12 px yarıçaplı, operasyon tablosu köşeli, uzman tablosu yuvarlak. Kategori: tutarlılık.
- **Bağlantı biçimi aşırı kullanılmış.** Yeşil altı çizili metin hem gezinme (operasyon alt satırı), hem filtre, hem satır eylemi ("Aç", "Düzenle"), hem sayaç ("0 başvuru"), hem de birincil yönlendirme ("Fatura bilgilerini girin") için kullanılıyor. Kullanıcı neyin sayfa değiştirdiğini, neyin filtrelediğini ve neyin işlem yaptığını ayırt edemiyor. Kategoriler: hiyerarşi, erişilebilirlik.
- **Konsol, parsel sayfası (sahip): harita karoları 503 döndürüyor (beklenen, çevrimdışı).** Ancak MapLibre her karo hatasını yakalanmamış `AJAXError: Service Unavailable` olarak konsola basıyor: tek sayfada 62 kayıt. Haritada da bu durumda kullanıcıya bir "harita altlığı yüklenemedi" bildirimi gösterilmiyor, zemin düz beyaz kalıyor. Bunun dışında konsol hatası yok. Kategori: boş/hata durumları.

## Tasarım planı

### Konu ve okur

- **Konu:** Antep fıstığı bahçelerinin bağımsız, ölçüme dayalı denetimi. Ekranlarda tarama, ağaç envanteri, panorama, uzman bulgusu ve rapor var.
- **Sahip:** Çoğu zaman telefondan ve dışarıdan bakar. Dijital okuryazarlığı karışıktır. Türkçe, kısa ve düz cümle ister. Asıl sorusu şudur: "Bahçem ne durumda, buna neden inanayım?"
- **Personel:** Operasyon, uzman ve back office ekiplerinden oluşur. Masaüstünde yoğun veriyle çalışır. Ekranda daha çok satır, daha az boşluk ve hızlı tarama ister.
- **Karşılama sayfasının işi:** Sahip, bağımsız bir denetimin bahçesi hakkında ne söylediğini anlamalı. Ardından kayıt olmalı ya da demo turunu denemeli.

### Fikir: ölçüm paftası

Kimlik genel SaaS dilinden alınmadı. Kaynağı konunun kendi dünyasıdır: bahçenin kuşbakışı planı, sıralar ve ağaç kodları (`S5-12`), kırmızı Antep toprağı, fıstığın içi ve olgun kabuğu. Ölçüm paftalarındaki kenar kodları da bu dünyadan gelir.

- **Tek cesur yer** kahramandaki örnek bahçe planıdır. Toprak zemin üzerinde on sıra ağaç çizilir; her ağaç portalın sağlık haritasındaki sınıf rengiyle boyanır, seçili ağaç kabuk rengi bir halkayla işaretlenir. Bu planı bir "ağaç karnesi" kartı tamamlar. Yapı bilgi taşır: sınıf kümesi, boş yer, kuru ve kayıp ağaç gerçek metodoloji kurallarıyla çizilir. Plan örnektir ve bu yazılır.
- **Geri kalan her şey sakin kalır:** zemin üzerinde düz metin, ince ayraçlar, gerektiği yerde çerçeve. Kart takımı, gradyan ve gölge yığını kullanılmaz.
- **Izgara motifi** üç yerde tekrar eder: logo (3×3 dikim ızgarası, bir ağaç kabuk renginde), boş durum çizimi (ağaçsız dikim sırası) ve paket takvimi (12 ay × paket).

### İkinci geçiş: planın brife göre gözden geçirilmesi

İlk plan yazıldıktan sonra brife karşı okundu. Genel kalan kararlar değiştirildi:

| İlk plan | Sorun | Karar |
| --- | --- | --- |
| Krem zemin (#F4F1EA tonları) ve Antep taşı bej | Brifteki "krem + serif + terrakota" klişesine yakın | Zemin yeşile çalan açık kül (`#F4F5EF`). Toprak rengi yalnız bahçe planının zemininde kullanılır, vurgu rengi olarak kullanılmaz |
| Başlıklarda ikinci bir aile (geniş grotesk ya da serif) | İki yazı ailesi yükü iki katına çıkarır. Konudan gelen bir gerekçesi de yok | Tek aile: Atkinson Hyperlegible Next. Az görenler için çizilmiştir ve sahibin telefonda, güneşte okumasına uyar. Monospace kesimi yalnız kod ve ölçü için kullanılır (ağaç kodu, koordinat, hash) |
| Kahramanda "0–100 skor" büyük sayı | Brifteki "büyük sayı + küçük etiket" kalıbı. Uydurma istatistik riski de var | Sayı yerine örnek bahçe planı ve tek ağacın karnesi |
| Dört özellik kartı ("Bağımsız", "Uzman imzalı"…) | SaaS kart takımı | Özellikler içeriğe dağıtıldı: sınıf açıklaması, kanıt zinciri, adımlar ve bağımsızlık cümlesi |
| Kart kartından giriş animasyonları | Dağınık hareket | Tek koordineli an: tarama çizgisi bahçeyi soldan sağa bir kez geçer, ağaçlar renklenir ve kart belirir. Azaltılmış harekette hiç oynamaz |
| Kabuk rengi birincil düğmede | Cesaret her yere dağılır, personel ekranlarında da bağırır | Birincil eylem fıstık yeşili. Kabuk rengi yalnız "seçili olan" için kullanılır (seçili ağaç, logodaki ağaç) |
| Karanlık tema | Raporlar basılıyor, harita renkleri açık zemine göre ayarlı, sahip güneşte okuyor | Karanlık tema yok (`color-scheme: light`) |

Göndermeden önce bir aksesuar çıkarıldı: kahramandaki "Antep fıstığı bahçeleri için" üst etiketi (eyebrow). Bu bilgi artık giriş paragrafında.

### Palet

| Ad | Hex | Token | Kullanım |
| --- | --- | --- | --- |
| Toprak | `#2B2420` | `--palette-toprak` → `--color-text`, `--color-focus` | Metin, odak halkası. Beyazda 15,3:1 |
| Fıstık içi | `#3B6A1E` | `--palette-fistik` → `--color-accent` | Birincil düğme, bağlantı, etkin sekme. Beyazda 6,4:1, zeminde 5,9:1 |
| Taze iç | `#B5CF6B` | `--palette-taze` | Seçim zemini, logo. Metin rengi olarak kullanılmaz |
| Kabuk | `#A3375A` | `--palette-kabuk` → `--color-highlight` | Tek vurgu: seçili ağaç. Beyazda 6,5:1 |
| Tarla | `#EADBCB` | `--palette-tarla` | Bahçe planının toprak zemini |
| Kül | `#F4F5EF` | `--palette-kul` → `--color-bg` | Sayfa zemini |

Durum renkleri metin rengidir ve kendi `-soft` zemininde AA kontrastı verir:

| Ton | Metin | Zemin | Kontrast |
| --- | --- | --- | --- |
| success | `#2B6A2E` | `#E6F1DD` | 5,6:1 |
| warning | `#7C5A06` | `#FFF3D6` | 5,7:1 |
| danger | `#A3301F` | `#FCE9E4` | 6,0:1 |
| info | `#1F5A99` | `#E5EEF8` | 6,0:1 |
| neutral | `#4F5550` | `#ECEDE8` | 6,5:1 |

Ağaç sınıfları (`--class-*`) haritanın renkleridir (`src/lib/map/tree-style.ts`) ve değiştirilmez. Bu renkler metin olarak kullanılmaz. Her zaman koyu halkalı bir nokta olarak çizilir ve yanında sınıfın adı yazılır (`ClassBadge`, `ClassDot`). Sarı Dikkat'in beyazdaki kontrastı 1,9:1'dir; ayırt edilebilmesini halka sağlar.

### Tipografi

- **Aile (4. dalga):** Inter (değişken) ve JetBrains Mono. 1.–3. dalgada Atkinson Hyperlegible Next kullanılıyordu; çizgili sıfırı kapatılamadığı için sayılar ("2026", "₺20.640,00") eski ve kalabalık görünüyordu (§Notlar). Inter ekran için çizilmiş, x-yüksekliği büyük, tabular rakamlı ve Türkçe harfleri tam bir yüz; telefonda ve güneşte okunurluk korunur. `font-feature-settings: "cv05", "cv08"` küçük l ile büyük I'yı ayırır. `next/font/google` derleme sırasında indirir ve aynı origin'den sunar; dış istek olmaz. Alt kümeler `latin` + `latin-ext`. `display: swap`; mono kesimi önceden yüklenmez ve yalnız kod ve ölçü içindir.
- **Ölçek** (16 px taban): 12 · 14 · 16 · 18 · 20 · 24 · 30 · 38 · 48 px (`--text-xs` … `--text-5xl`). Sayfa başlığı 30 px (telefonda 24 px), `--tracking-tight` (−0,02em).
- **Satır:** gövde için 1,55 (`--leading`), büyük başlık için 1,15. Satır uzunluğu en çok 68ch (`--measure`); paragraflar 52–64ch.
- **Ağırlık:** gövde 400, etiket 500–550, bölüm başlığı 650, sayfa başlığı 700. Büyük harfli etiket, harf aralıklı küçük etiket ve tek kelimesi renkli başlık kullanılmaz.

### Boşluk, köşe, derinlik, hareket, odak

- **Boşluk:** 4 px tabanlı: 4 · 8 · 16 · 24 · 32 · 48 · 64 · 96 (`--space-1` … `--space-8`). Bölümler arası 48 px, kahraman 64 px.
- **Köşe hiyerarşisi (4. dalga):** 6 px küçük öğe (`--radius-sm`), 8 px kontrol ve düğme (`--radius`), 12 px kart, pafta ve diyalog (`--radius-lg`), 16 px büyük yüzey (`--radius-xl`). Hap biçimi (`--radius-pill`) durum rozetinde, avatar menüsünde ve alt sekme çubuğunun etkin işaretinde kullanılır.
- **Derinlik (4. dalga):** Yüzeyleri ince çerçeve ve neredeyse görünmeyen bir kart gölgesi (`--shadow-card`) ayırır. Düğmelerde `--shadow-sm` var. Yüzen öğeler: menü `--shadow`, diyalog, toast ve hesap menüsü `--shadow-lg`.
- **Hareket:** 120 ms (renk, çerçeve) ve 200 ms (açılan yüzey) sürer, eğri `--ease`. Sayfada en çok bir koordineli an olur. `prefers-reduced-motion: reduce` bütün animasyon ve geçişleri kapatır (globals.css).
- **Odak:** Halka 3 px Toprak rengindedir, 2 px boşluk bırakır. Beyazda, zeminde ve yeşil düğmede görünür. Form alanında yeşil çerçeve ve hale eklenir. Odak hiçbir yerde kaldırılmaz.
- **Dokunma hedefi:** Sitede ve portalda kontrol yüksekliği 44 px, karşılama CTA'sı 52 px, alt sekme çubuğunda 56 px.

### Personel varyantı

`data-density="compact"` token'ları yeniden tanımlar: gövde 14 px, kontrol 36 px, başlık çubuğu 52 px, tablo hücresi 6/10 px. Personel kabuğu 1440 px genişliktedir; portal 1120 px. `AppShell variant="staff"` başlığı her zaman sıkı gösterir. `dense` sayfa içeriğine de uygular: 1. dalgada kapalı, 2. dalga ekranları elden geçirirken açar.

## Token'lar

Bileşenler yalnız anlamsal token'ları kullanır (`--color-*`, `--space-*`, `--text-*`, `--radius*`, `--shadow*`, `--control-height*`, `--duration*`). `--palette-*` yalnız `globals.css`'te ve karşılama sayfasının çiziminde kullanılır.

| Grup | Token'lar |
| --- | --- |
| Yüzey | `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-surface-3`, `--color-border`, `--color-border-strong` |
| Metin | `--color-text`, `--color-text-2`, `--color-muted` (zeminde 6,3:1) |
| Eylem | `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-accent-contrast`, `--color-highlight`, `--color-highlight-soft`, `--color-focus` |
| Durum | `--color-{success,warning,danger,info,neutral}` ve `-soft`; `--color-warning-border`, `--color-danger-hover` |
| Ağaç sınıfı | `--class-healthy`, `--class-attention`, `--class-problem`, `--class-dead`, `--class-absent`, `--class-unassessed`, `--class-ring` |
| Yazı | `--font-sans`, `--font-mono`, `--text-xs` … `--text-5xl`, `--leading`, `--leading-tight`, `--measure` |
| Boşluk | `--space-1` (4) … `--space-8` (96) |
| Biçim | `--radius-sm` (4), `--radius` (6), `--radius-lg` (10), `--radius-pill`; `--shadow-sm`, `--shadow`, `--shadow-lg` |
| Kontrol | `--control-height` (44, sıkıda 36), `--control-height-sm` (36 / 30), `--header-height` |
| Hareket | `--duration-fast`, `--duration`, `--ease` |

Eski token adlarının hepsi korundu; değerleri yeni palete taşındı. Eski ekranlar bu yüzden kırılmadan yeni renkleri ve yazıyı aldı. `--color-success` önceden tanımsızdı; artık tanımlı.

## Bileşenler

Hepsi `@/components/ui/<dosya>` yolundan tek tek içe aktarılır; toplu dışa aktarım (barrel) yok. İstemci bileşenleri `"use client"` ile işaretlidir, diğerleri sunucu bileşenidir.

| Bileşen | Dosya | Not |
| --- | --- | --- |
| `Button`, `ButtonLink`, `buttonClass` | `button.tsx` | `variant`: primary, secondary, quiet, danger. `size`: sm, md, lg. `block`. Global `.button` sınıflarını seçer; birincil orta düğme tam olarak `class="button"` olur. `Button` varsayılan olarak `type="button"`dır |
| `Field`, `Input`, `Select`, `Textarea`, `Checkbox` | `field.tsx` | `Field` etiketi, ipucunu ve hatayı kontrole bağlar (`id`, `aria-describedby`, `aria-invalid`). `errorTestId` mevcut e2e test kimliklerini taşır |
| `Table`, `cell` | `table.tsx` | Çerçeveli ve yatay kayan sarmalayıcı. `cell.num` sağa hizalı tabular rakam, `cell.code` ağaç kodu ve kimlik için. Sıkı yoğunlukta satırlar daralır |
| `Badge`, `ClassBadge`, `ClassDot` | `badge.tsx` | `Badge tone`: neutral, success, warning, danger, info, highlight. `ClassBadge` ağaç sınıfıdır: nokta ve ad |
| `Tabs` | `tabs.tsx` (istemci) | Sayfa içi ARIA sekmeleri; ok tuşları, Home ve End ile gezilir |
| `TabLinks` | `tab-links.tsx` | Her sekme ayrı bir URL ise kullanılır: `nav` ve `aria-current="page"` |
| `Dialog` | `dialog.tsx` (istemci) | Yerel `<dialog>` üzerine kurulu. Odak içeri girer ve geri döner, Escape kapatır |
| `Alert` | `alert.tsx` | Sayfa ya da son eylem hakkında mesaj. İşlemden sonra çıkan hatada `role="alert"`, onayda `role="status"` |
| `Toast` | `toast.tsx` (istemci) | Kısa onay için; kendiliğinden kapanır. Okunması gereken hata için `Alert` kullanılır |
| `EmptyState` | `empty-state.tsx` | Başlık eksik olanı söyler, gövde nedenini ve sonrasını, eylem bir sonraki adıma çağırır |
| `PageHeader` | `page-header.tsx` | Tek `h1`, giriş metni, durum rozetleri (`meta`), eylemler ve bir üst düzeye dönüş bağlantısı (`back`) |
| `AppShell` | `app-shell.tsx` | Oturumlu bölüm kabuğu. `variant`: portal ya da staff; `dense`, `nav`, `account`. Portal varyantında telefonda bölüm bağlantıları alt sekme çubuğu olur (`NavItem.icon`); personel varyantında ikinci satırda yatay kayar; geçerli bağlantı görünüme kaydırılır, sağda daha fazlası varken kenar solar (`current-into-view.tsx`) |
| `AccountMenu` | `account-menu.tsx` (istemci) | Oturumlu başlığın hesap köşesi: avatar düğmesi ve açılır panel (açılıp kapanan bir panel; ARIA menüsü değil). Escape, dışarı tıklama ve sayfa geçişi paneli kapatır. Hesap sayfaları, diğer bölümler ve Çıkış buradadır |
| İkonlar | `icons.tsx` | 24 px ızgaralı çizgi ikonlar (`IconTree`, `IconClipboard`, `IconPackage`, `IconCard`, `IconTool`, `IconUser` …). Her zaman bir metin etiketinin yanında kullanılır ve `aria-hidden`'dır |
| `Panel`, `panelClass` | `panel.tsx` | Başlıklı bölge: `h2`/`h3` (`headingLevel`), `description`, sağda `actions`, çerçeveli yüzey. `plain` yüzeyi kaldırır (içinde tablo olan bölge). Başlıksız hali yalnız yüzeydir; `section` olmayan öğe (form) için `panelClass` |
| `Facts`, `factsClass` | `facts.tsx` | Etiket → değer listesi (`dl`). `list`: kayıt ("Paket  Standart"). `summary`: para; değerler sağa hizalı, tabular, `total` çizginin altında. Satırı kendi test kimliğini taşıyorsa `factsClass` |
| `FilterTabs` | `filter-tabs.tsx` | Listenin süzgeçleri, her biri ayrı URL (`?durum=`): bölmeli denetim, sayılar, `aria-current`. Sekme paneli için `Tabs`, ekranın alt sayfaları için `TabLinks` |
| `Pagination`, `pageOf`, `PAGE_SIZE` | `pagination.tsx` | Bellekteki uzun listenin bir sayfası (`?sayfa=`, 50 satır); aralık ve önceki/sonraki |
| `Stack`, `Split`, `Toolbar` | `layout.tsx` | Bölge yığını; kayıt + dar yan sütun (`Split`, kapsayıcı sorgusu: içerik 880 px'i geçince iki sütun, kenar çubuğunun yanında da ortalanmış portal sütununda da aynı); listenin üstündeki süzgeç ve sayı satırı (`Toolbar`) |
| `Disclosure`, `Consequence` | `disclosure.tsx` | Seyrek ya da geri alınamaz eylem (iptal, fesih, ret, cayma kaydı): kapalı başlar, özet dokunmatikte 44 px. İçinde `Consequence` düğmeye basınca ne olacağını söyler |
| `Kbd` | `kbd.tsx` | Klavye tuşu. Adı zaten söyleyen düğmenin yanında `hidden`, dolu düğmede `onAccent` |
| `statusTone`, `severityTone` | `status.ts` | Uygulamanın tek durum → ton eşlemesi (§Kullanım 5). `statusTone(durum, tür?)`; tür yalnız aynı kodun başka anlama geldiği yerde fark eder |
| `ScrollBox` | `scroll-box.tsx` (istemci) | `Table`'ın kayan kutusu: içerik taşarken odaklanabilir, adlı bir bölge olur (klavyeyle kaydırma, axe `scrollable-region-focusable`); sığan tablo sekme durağı eklemez |

`Table` 3. dalgada şunları aldı: `cell.nowrap`; `tfoot` toplam satırı; sarmalayıcıda `position: relative` (başlık hücresindeki `.sr-only` metin artık sayfayı genişletmez); satır vurgusu `--color-row-hover` token'ı. `EmptyState` `compact` aldı (panel içindeki boş liste: çizimsiz, az boşluk). `StatusPage` (`components/site/status-page.tsx`) 404, 403 ve `error.tsx` için ortak; 403 oturum açıksa "Çıkış yap" da verir.

Harita ve panorama kabuğu da token'ları kullanır: MapLibre boyası somut renk ister, bu yüzden renkler `src/lib/map/tree-style.ts`'te (`MARKER_COLORS`, `MAP_COLORS`) tek yerde durur ve `tree-style.test.ts` her sabiti `globals.css`'teki token'la karşılaştırır. Seçili ağaç kabuk halkası, sınıf noktası koyu halka (`ClassDot` ile aynı), boş yer gri halkalı beyaz nokta, sınır `--color-accent`, bulgu halkası bulgu rozetinin tonu. Ayrıntı: `docs/haritalar.md`.

Site kabuğu bileşenleri (`components/site/`):

- `SiteHeader`: masaüstünde sayfa bağlantıları çubukta durur. Telefonda yalnız "Kayıt ol" (ya da "Hesabım") ve "Menü" görünür.
- `MobileNav`: istemci bileşeni. Bağlantıya dokunmak ya da Escape menüyü kapatır; odak düğmeye döner.
- `SiteFooter`: iki başlıklı bağlantı sütunu; telefonda iki sütun.
- `OrchardPlate`: karşılama sayfasının çizimi.

## Kullanım

### 2. dalga ajanları için

1. **Önce kabuk, sonra içerik.** Portal ve personel bölümleri `SectionShell` → `AppShell` ile çerçevelenir. Personel ekranlarını elden geçirirken `section-shell.tsx`'te personel için `dense` açılır ve sıkı yoğunlukta ekran görüntüsü alınır.
2. **Ekran başına bir `PageHeader`.** Sayfada tek `h1` olur. Geri bağlantısı `back` ile verilir; eylemler sağda durur.
3. **Yinelenenleri kaldırın, paralel kopya eklemeyin.** Denetimdeki yinelenenler `ui/` karşılıklarıyla değiştirilir:
    - `operations/result-notice.tsx` ve `portal-billing/result-notice.tsx` → `Alert`
    - Modüllerdeki `.table` tanımları → `Table`
    - `.badge` tanımları → `Badge`
    - `portal-nav.tsx`, `ops-nav.tsx` ve ofis `.tabs` tanımları → `TabLinks`
    - Boş liste cümleleri → `EmptyState`
4. **Renk yalnız token'dan.** Modüllerdeki sabit renkleri (`#e8a317`, `#f1d9a6`, `#e7f5ff`…) anlamsal token'la değiştirin. Yeni bir anlam gerekiyorsa önce bu belgeye token ekleyin.
5. **Durum = ton + metin.** Ödendi ve Yayımlandı success, İncelemede ve Taslak neutral ya da info, Süresi geçti ve Başarısız danger, Ödeme bekliyor warning. Aynı durum her ekranda aynı tonu alır.
6. **Ağaç sınıfı her yerde `ClassBadge` ya da `ClassDot` ile ve adıyla gösterilir.** Harita renkleri `tree-style.ts`'te kalır; harita bileşenlerine bu dalga dokunmaz (harita ve panorama başka dallarda).
7. **e2e sözleşmeleri.** Metin ya da biçim değişince seçiciler güncellenir (tercihen `getByRole`, `getByLabel`). Doğrulamalar zayıflatılmaz; `data-testid`'ler korunur. Hukuk metinlerine dokunulmaz.

### 3. dalgadan sonra (bütün alanlar)

1. **Yerel kopya yazmayın.** Panel, anahtar/değer listesi, süzgeç, sayfalama, yığın ve yan sütun, katlanır eylem, tuş, boş durum `components/ui`'den gelir. Bir alanda yeni bir yapı taşı gerekiyorsa önce `ui/`'ye eklenir ve bu belgeye yazılır. Kaldırılanlar: `operations/ops-ui.tsx`, `back-office/status-tone.ts`, `money-ui.tsx`'teki `ActionDisclosure`/`Consequence`/`Amount`, uzman ve ofisteki `.kbd`, `.segmented`, `.facts`, portaldaki `.panel`, `.facts`, `.narrow`, `.doc`, yerel ton haritaları (`SESSION_STATUS_TONE`, `PARCEL_STATUS_TONE`, `SEVERITY_TONE`, KVKK ve hissedar tonları).
2. **Durum tonu yalnız `statusTone`'dan.** Aynı durum portalda, back office'te, ofiste ve uzman panelinde aynı renktir; operasyon panosundaki sayaçlar da rozetle aynı tonu alır. Yeni bir durum kodu `status.ts`'e eklenir, ekranda eşleme yazılmaz.
3. **Genişlik ve hiza.** Portal: her sayfa aynı 1120 px sütunda, başlık aynı yerde; form ve belge sayfaları `.reading` ile 760 px'e daralır ama sola hizalı kalır. Personel: ofis ve uzman sayfaları `components/staff-page.module.css` ile kabuk genişliğinde ve kabukla aynı kenar boşluğunda; operasyon kenar çubuğunun yanında.
4. **Aynı eylem, aynı ad.** Kayıt ol, Demoyu dene, Giriş yap; personel satır eylemi "İncele", portalda "<Nesne>yi aç" ("Karneyi aç", "Başvuruyu aç", "360° geziyi aç"); süzgeç "Uygula", arama "Ara"; "Düzenle", "Ziyaret planla", "Fiyat önizlemesi". Menü adı ile sayfa başlığı aynıdır. Ağaç sınıfı 2 her yerde "Kuru" (metodoloji §5).
5. **Yıkıcı eylem kırmızıdır** (`danger`): erişimi kaldır, başvuruyu geri çek, rızayı geri al, reddet. Seyrek ve geri alınamaz olan `Disclosure` içinde, sonucuyla birlikte durur.
6. **Boş durum başlığı noktasız** ("Henüz sipariş yok"); panel içinde `compact`. Kesik çerçeve yalnız boş durum demektir, iş kartında kullanılmaz.

### Yap ve yapma

| Yap | Yapma |
| --- | --- |
| Eylemi söyleyen düğme metni yazın: "Bahçemi kaydet", "Teklifi onayla" | "Gönder", "Tamam", "Devam" |
| Bir akış boyunca aynı eylem adını kullanın ("Kayıt ol" başlıkta, sayfada, düğmede) | Aynı eyleme her adımda başka ad vermek |
| Hatada ne olduğunu ve nasıl düzeleceğini yazın: "Kart reddedildi. Kartınızı ya da limitinizi kontrol edip yeniden deneyin." | "Bir hata oluştu." |
| Boş durumda bir sonraki adımı gösterin | Tek gri cümle |
| Cümle düzeni ("Ödeme planı") | BÜYÜK HARF etiket, Başlık Düzeni |
| Bir ekranda bir birincil düğme kullanın | Satır eylemlerini dolu yeşil düğme yapmak; satır eylemi `quiet` ya da `secondary` olur |
| Tablo telefonda `Table` içinde yatay kaysın | Sayfanın kendisini yatay kaydırmak |
| Sayı ve tutar için tabular rakam (`cell.num`), kod için `cell.code` | Monospace'i küçük etiketlerde kullanmak |
| Bağlantıyı yalnız sayfa değiştiren şey için kullanın | Filtreyi, sayacı ve eylemi altı çizili bağlantı yapmak |
| Gölgeyi yalnız yüzen öğede kullanın | Her karta gölge, gradyan zemin |
| Tek koordineli hareket, azaltılmış harekette hiç | Her kartta giriş animasyonu ve hover efekti |
| Kabuk rengini yalnız "seçili olan" için kullanın | Kabuk rengini dekorasyon için kullanmak |
| Bağlantılarda düz metin | Bağlantı sonuna "→" |

### Ekran görüntüsü inceleme listesi

Her anlamlı değişiklikten sonra 390 ve 1440 piksel ekran görüntüsü alın, okuyun ve dürüstçe eleştirin. Personel ekranlarında 1280 piksele de bakın.

- [ ] Sayfada tek bir `h1` var. İlk bakışta ekranın ne olduğu ve asıl eylemi anlaşılıyor.
- [ ] Birincil düğme bir tane; ikincil ve sessiz eylemler ondan ayrılıyor.
- [ ] Kenar boşlukları başlık, sekme ve içerikte aynı hizada (telefonda 16 px).
- [ ] 360 pikselde yatay kaydırma yok; uzun tablo kendi kutusunda kayıyor.
- [ ] Renkler token'dan geliyor; durum ve ağaç sınıfı metinle de söyleniyor.
- [ ] Metin kontrastı AA. Gri metin zeminde en az `--color-muted`.
- [ ] Sekmeyle gezilince her odakta halka görünüyor; sıra mantıklı.
- [ ] Boş, yükleniyor ve hata durumları tasarlanmış; hata ne olduğunu ve nasıl düzeleceğini söylüyor.
- [ ] Türkçe harfler doğru (ğ, ş, ı, İ, ç, ö, ü). Kod ve tutar biçimleri tutarlı ("₺1.209,60").
- [ ] `prefers-reduced-motion` açıkken hiçbir şey oynamıyor.
- [ ] Konsolda hata yok (çevrimdışı harita karoları hariç).
- [ ] `pnpm web:lint`, `web:test` ve `web:e2e` yeşil.

## Performans

Karşılama sayfası (`/`) için ölçüm yapıldı: üretim derlemesi, yerel Supabase, Lighthouse 12.8 ve headless Chromium. Mobil ölçüm Lighthouse'un varsayılan yavaş 4G ve 4× CPU kısmasıyla yapıldı.

| Ölçü | Önce | Sonra |
| --- | --- | --- |
| Performans (mobil / masaüstü) | 91 / 100 | 97 / 100 |
| Erişilebilirlik (mobil) | 100 | 100 |
| FCP (mobil) | 0,9 sn | 1,2 sn |
| LCP (mobil) | 3,1 sn | 2,6 sn |
| TBT (mobil) | 170 ms | 60 ms |
| CLS | 0 | 0 |
| Toplam aktarım | 321 KiB | 268 KiB |
| JavaScript | 164 KiB | 164 KiB (değişmedi) |
| Font | 131 KiB | 70 KiB |
| HTML / CSS | 8 / 10 KiB | 16 / 13 KiB |

- Karşılama sayfası sunucu bileşenidir. Çizim satır içi SVG'dir; görsel dosyası yoktur. Animasyon yalnız CSS'tir.
- Sayfaya eklenen tek istemci kodu mobil menüdür (`MobileNav`, birkaç yüz bayt). JavaScript'in tamamı Next ve React çerçevesidir.
- Fontlar `latin` ve `latin-ext` alt kümeleriyle iki değişken dosya olarak yüklenir, `display: swap` kullanılır. Mono kesimi önceden yüklenmez.
- FCP'deki küçük artış ölçümler arasındaki oynamanın içindedir. HTML büyüdü (paket fiyatları ve çizim), LCP ise düştü.
- Paket fiyatları `/paketler` ile aynı kaynaktan gelir: `public_package_prices`. Sayfaya bir RPC çağrısı eklendi.

### 3. dalga (entegrasyon)

Üretim derlemesi, yerel Supabase (`db:reset` + `db:demo` + `db:demo-tour --profile test` + `office:dev-data`), 390 px, önbelleksiz yükleme, başsız Chromium (yazılımla WebGL); bir ısınmadan sonra beş yüklemenin medyanı. Önce: `main` a3e89713 (#101–#107 birleşmiş hali). JS ve CSS sıkıştırılmamış boyuttur.

| Rota | TTFB | FCP | LCP | TBT | JS (KiB) |
| --- | --- | --- | --- | --- | --- |
| `/` | 58 → 23 ms | 184 → 124 ms | 184 → 124 ms | 17 → 1 ms | 534 → 544 |
| `/portal` | 72 → 52 ms | 156 → 120 ms | 156 → 120 ms | 0 → 0 ms | 549 → 560 |
| `/portal/parsel/[id]` | 177 → 125 ms | 304 → 228 ms | 304 → 228 ms | 193 → 140 ms | 2159 → 2172 |
| `/portal/parsel/[id]/gezi` | 138 → 115 ms | 224 → 172 ms | 452 → 388 ms | 330 → 288 ms | 2825 → 2837 |
| `/operasyon` | 46 → 38 ms | 132 → 120 ms | 132 → 120 ms | 0 → 0 ms | 584 → 595 |
| `/uzman/ziyaret/[id]` | 121 → 99 ms | 268 → 228 ms | 268 → 228 ms | 47 → 15 ms | 541 → 551 |

- Gerileme yok; süre farklarının çoğu ölçüm oynamasının içinde (sunucu ilk koşuda yeni açılmıştı).
- JS her sayfada yaklaşık 10 KiB (sıkıştırılmamış) arttı: üç küçük istemci bileşeni (`ScrollBox`, `CurrentIntoView`, site başlığındaki geçerli bağlantı). Sayfalar yine sunucu bileşeni.
- Önceki PR'ların sayıları başka koşullarda alındı (#101 Lighthouse, #102 ve #104 `data-map-ready` ve ilk panorama karesi, #103 ve #105–#107 TTFB ve load); bu tablo hepsini aynı koşulda karşılaştırır.

## 4. dalga: müşteri ekranlarının sadeleştirilmesi

4 Kasım 2026. Kapsam: herkese açık site, giriş ve kayıt, demo, sahip ve müşteri portalı. Personel ekranları yalnız ortak token ve bileşen değişikliklerini aldı.

**Neden:** 3. dalgadan sonra ekranlar tutarlıydı ama kalabalıktı. Müşteri portalının üst menüsünde yedi-sekiz sekme vardı ve telefonda yatay kayıyordu. Parsel karnesi 5.700 piksellik tek bir akıştı. Çizgili sıfırlı yazı tipi tarih ve tutarları eski gösteriyordu. Sayfalarda birden çok birincil düğme vardı. Uzun açıklama metinleri ilk ekranı dolduruyordu.

**Kararlar:**

- **Yazı:** Inter ve JetBrains Mono (§Tipografi).
- **Yüzey:** Köşeler 8 ve 12 px. Kartlarda ince çerçeve ve `--shadow-card` var. Etiket ağırlıkları düştü (500–600).
- **Portal gezinmesi:** Üst menüde en çok beş hedef var: Bahçelerim, Başvurularım, Siparişlerim, Ödemelerim, Hizmetlerim. Hesabım, Sözleşmelerim, İzinler, diğer bölümler ve Çıkış hesap menüsünde (`AccountMenu`, avatar düğmesi). Telefonda (<860 px) aynı hedefler ikonlu bir alt sekme çubuğu olur (`AppShell` portal varyantı, `data-bottom-nav`). Portalda sabit alt öğeler (`Toast`, sabit kaydet çubukları, bildirim kapısı) çubuğun üstünde durur: `bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))`.
- **Bir görünüm, bir birincil eylem.** İkincil eylemler `secondary` ya da `quiet` düğmedir. Metin bağlantısı yalnız düzyazı içinde kullanılır.
- **Parsel karnesi:** Başlıktan sonra özet kartı ve "Dikkat isteyenler" kartı gelir; birincil eylem bu kartta. Altında yapışkan bölüm sekmeleri var (`SectionNav`, kaydırmayla güncellenir): Özet, Harita, Bulgular, Karne, Ziyaretler, Sorular, Hissedarlar. İçerik aynı sayfada kalır, böylece baskı ve bağlantılar çalışır. Sınır uyarısı bir kez gösterilir. Telefonda ağaç paneli alt sayfa (bottom sheet) görünümündedir.
- **İş ekranları:** Başvuru, teklif, sipariş, ödeme ve hizmet ekranları tek bir çalışma alanı düzenini paylaşır (`portal-billing/workspace.tsx`). Düzenin parçaları:
  - `DetailHeader`: durum rozetiyle başlık.
  - `Lifecycle`: Başvuru → Teklif → Ödeme → Hizmet adımları.
  - `DetailLayout`: ana sütun ve yapışkan özet kartı. Geri alma eylemleri sonda durur.
  - `Timeline`: dikey geçmiş.
  - `listClass`: telefonda karta dönen tablolar.
  
  Teklif, ödeme sayfası (checkout) gibi okunur: tutar kartı ve tek kabul düğmesi.
- **Hesap:** Ayarlar düzeni (`portal-billing/settings-shell.tsx`) kullanılır. Masaüstünde sol alt menü vardır: Profil ve iletişim, Fatura bilgileri, Sözleşmelerim, İzinler. Hesap menüsüyle aynı sırayı izler.
- **Giriş ve kayıt:** Ortada tek kart var. Yöntemler bölümlü düğmeyle seçilir: E-posta, Telefon. Parola göster/gizle düğmesi (`site/password-input.tsx`) ve bekleme durumlu gönder düğmesi (`site/submit-button.tsx`) eklendi. SMS kodu `one-time-code` alanıyla girilir.
- **Site:** Açılıştaki bahçe planı bir uygulama penceresi gibi çerçevelendi. Paketler subgrid ile hizalı ve önerilen paket vurgulu. SSS iki sütunlu akordeon. Hukuk metinlerinde yapışkan içindekiler var (`site/legal-toc.tsx`), taslak notu sade bir satır oldu. `legal.ts` içeriği değişmedi.
- **İkonlar:** `ui/icons.tsx`, 24 px ızgarada ve 1,75 çizgi kalınlığında. İkonlar her zaman bir metin etiketinin yanında durur ve `aria-hidden`'dır.

**Açık konular:**

- Paketler sayfasında "Önerilen" rozeti Standart pakette. Gerekçe: `docs/fiyatlandirma.md` örnekleri Standart'ı kullanıyor. Bu iş kararını ürün sahibi onaylamalı.
- Demo bandındaki düğmeler 30 px. Bant, demo turu telefon testi için 48 px'in altında kalmalı.
- Kılavuz ekran görüntüleri (`docs/kilavuz/`) yeni arayüzle yeniden üretilmeli.

## Notlar

- **Kahraman, ilk deneme:** Açıklama kartı bahçe planının sağ alt köşesine biniyor, sınıf kümesini ve seçili ağacı kapatıyordu. Küme yukarı alındı ve kart planın alt kenarından sarkıtıldı; artık yalnız son sıranın ucunu örtüyor. Telefonda kart planın altında duruyor.
- **Paket takvimi:** Dikey ziyaret adları ("Hasat öncesi") 72 piksellik hücreye sığmadı; hücre 100 piksele çıkarıldı. Telefonda hücreler adı taşıyamayacak kadar dar, bu yüzden ad şeridin üstünde metin olarak yazıldı: "Kış (Oca), Hasat (Eki)". Masaüstünde bu metin yalnız ekran okuyucuya kalır. Şerit kendisi `aria-hidden`.
- **Adımlar:** Dört sütunda gövde metinleri farklı yükseklikte başlıyordu, çünkü grid satırları gerildi. `align-content: start` ile düzeltildi.
- **Altbilgi:** Telefonda 600 piksellik tek sütun yerine iki başlıklı iki sütun kullanıldı. Hukuk notu dar ızgara hücresinde sarıyordu; ayrı satıra alındı.
- **Font:** Atkinson Hyperlegible Next'in çizgili sıfırını kapatan bir OpenType özelliği yok (`zero`, `ss01–05`, `salt`, `cv01` denendi). Bu okunabilirlik özelliği olarak kabul edildi.
- **Mevcut ekranlar:** Token değişikliğinden sonra bütün ana rotaların ekran görüntüsü yeniden alındı (portal, ofis, operasyon, uzman, giriş, kayıt). Kırılan yerleşim görülmedi: renkler, yazı ve köşeler yenilendi, yerleşim aynı kaldı. Denetimdeki sorunların çoğu sayfa düzeyindedir ve 2. dalgaya kalır.
- **Kesilenler:** Kahramanda gerçek demo ekranının görüntüsü kullanılmadı. Harita karoları çevrimdışı ortamda yüklenmiyor; ayrıca bir görüntü dosyası LCP'yi ağırlaştırırdı. Dört özellik kartı da kesildi.
- **Referans görüntüleri** (`docs/tasarim/`): `karsilama-1440.jpg` ve `karsilama-390.jpg` (ilk ekran), `karsilama-menu-390.jpg` (telefon menüsü), `karsilama-takvim-390.jpg` (paket takvimi).
- **3. dalga (entegrasyon, 29 Ekim 2026):** Yedi PR'ın her biri kendi alanında yerel yapı taşları yazmıştı. Ekran görüntüsü denetimi (390 ve 1440 px; ziyaretçi, `owner@`, `customer@`, `ops@`, `expert@`, `field@`) aynı durumun alanlara göre başka renk aldığını gösterdi: operasyon panosunda "İncelemede" turuncu, her yerde mavi; "Yayımlandı" mavi, her yerde yeşil; teklif "Açık" portalda sarı, back office'te mavi. Bunun nedeni dört ayrı ton haritasıydı. Ayrıca iki ayrı süzgeç görünümü, üç portal sayfa genişliği, üç ofis genişliği, "Kuru"/"Kurumuş", "Devam et"/"İncele"/"Aç", "Kayıt ol"/"Kayıt olun" gibi farklar vardı. Haritada seçili ağaç siyah, sınıf noktası beyaz halkalıydı; açıklama ise koyu halkalı noktaydı. Hepsi tek kaynağa bağlandı (§Bileşenler, §Kullanım "3. dalgadan sonra"). axe: bütün ana rotalarda (rol başına) WCAG 2.1 A/AA ihlali yok. Önce MapLibre atıf bağlantısında `link-in-text-block` ve back office bahçe haritasında `nested-interactive` vardı.
- **Boş durum başlığı:** `EmptyState` dize başlığın sonundaki noktayı düşürür. Aynı ileti başka yerde cümle olarak da kullanıldığı için kural bileşende.
