# Denetim Metodolojisi

**Sürüm:** `methodology-v0` (taslak) · 21 Ekim 2026 · Yusuf

Bu belge, orchadOS denetimlerinde bir ağacın ve bir parselin **nasıl değerlendirildiğini** tanımlar: hangi ziyarette neye bakılır, ölçekler ne anlama gelir, ağacın genel sınıfı nasıl çıkar, bulgular nasıl yazılır, sahibe ne gösterilir. Uzman (ziraat mühendisi), saha personeli eğitmeni ve operasyon aynı kuralları buradan okur.

Her ölçüm, değerlendirme ve rapor üretildiği metodoloji sürümünü taşır (veritabanında `methodology_version`). Kurallar değişince yeni sürüm açılır. Eski raporlar kendi sürümleriyle kalır ve yeniden hesaplanmaz.

> **Taslak durumu:** Bu sürüm, uzmanla ön görüşmeden önce yazıldı. "Uzmanla kesinleşecek" diye işaretli her nokta, pilot uzmanın onayıyla `methodology-v1`'e dönüşür. Referans fotoğrafların hiçbiri henüz yok; listesi [Ek A](#ek-a--hazırlanacak-referans-fotoğraflar)'da.

## İçindekiler

1. [İlkeler](#1-ilkeler)
2. [Ziyaretler ve mevsimler](#2-ziyaretler-ve-mevsimler)
3. [Ağaç kimliği ve özellikleri](#3-ağaç-kimliği-ve-özellikleri)
4. [Ölçekler](#4-ölçekler)
5. [Genel sınıf kuralı](#5-genel-sınıf-kuralı)
6. [Kaynaklar ve karar zinciri](#6-kaynaklar-ve-karar-zinciri)
7. [Yakın plan protokolü](#7-yakın-plan-protokolü)
8. [Bulgular ve öneriler](#8-bulgular-ve-öneriler)
9. [Parsel karnesi](#9-parsel-karnesi)
10. [Kalite kapıları](#10-kalite-kapıları)
11. [Uzmanla kesinleşecekler](#11-uzmanla-kesinleşecekler)
- [Ek A – Hazırlanacak referans fotoğraflar](#ek-a--hazırlanacak-referans-fotoğraflar)
- [Ek B – Metrik kaydı karşılıkları](#ek-b--metrik-kaydı-karşılıkları)

## 1. İlkeler

1. **Kanıta dayanır.** Her sınıf ve her bulgu, ağacın o ziyaretteki görüntülerine bağlanır. Kanıtı olmayan bir sonuç rapora girmez.
2. **Görüneni söyler, teşhis koymaz.** Denetim "taçta %10–30 kuru dal var" der; "kök çürüklüğü var" demez. Teşhis ve ilaç önerisi uzmanın ayrıca yazdığı öneride, açıkça uzman görüşü olarak yer alır.
3. **Kaynaklar karışmaz.** Personel cevabı, AI önerisi ve uzman kararı ayrı kayıtlardır. Birinin üzerine yazılmaz. Sahip sadece uzmanın onayladığı sonucu görür.
4. **Belirsizlik saklanmaz.** Görüntüden karar verilemeyen bir şey "belirsiz" kalır. Tahminle doldurulmaz.
5. **Karşılaştırılabilir.** Rota, kamera yüksekliği ve yöntem parsel başına sabittir. Böylece bir ağacın bu kışki görüntüsü geçen kışkiyle yan yana konabilir.
6. **Sınır iddiası yoktur.** Haritadaki sınır, sahibin gösterdiği fiili kullanım sınırıdır; tapu ya da mülkiyet sınırı değildir. Bu ibare her raporda yer alır.

## 2. Ziyaretler ve mevsimler

Ziyaretin mevsimi, taramanın yapıldığı aydan çıkar. Hangi ölçeğin girileceğini mevsim belirler.

| Ay | Mevsim | Ziyaret | Odak |
| --- | --- | --- | --- |
| Aralık, Ocak, Şubat | Kış | Kış denetimi | Budama, kuru dal, eksik ya da kesilmiş ağaç, gövde ve dip |
| Mart, Nisan, Mayıs | İlkbahar | İlkbahar denetimi | Çiçeklenme, don hasarı, cinsiyet, zararlı belirtileri |
| Haziran, Temmuz | Yaz | Yaz denetimi | Meyve yükü, göz kurdu, kuraklık stresi |
| Ağustos, Eylül, Ekim | Hasat | Hasat denetimi | Hırsızlık izi, hasadın tamamlanması, dal kırığı, yangın riski |
| Kasım | Kış | (ara dönem) | Kış ölçekleri kullanılır |

- Mart ve Kasım, uzman panelinde (İP7) bu tabloyla eşlendi. Mart'ta erken bir ziyaret çiçeklenmeden önceye denk gelebilir. O zaman ilkbahar ölçeklerinden sadece görülebilenler girilir.
- **Yapraklı dönem:** İlkbahar ve yaz. Taç doluluğu sadece bu dönemde ölçülür. Kuru kararı yapraklı dönemde daha güvenilirdir (bkz. [5](#5-genel-sınıf-kuralı)).
- **Envanter** ziyareti ayrı bir ziyaret türüdür. Hasat sonrası ya da kışın, otlar kısayken yapılır, çünkü uzun ot gövde diplerini kapatır. Envanterde sağlık ölçeği girilmez; sadece ağaç kimliği ve özellikleri çıkarılır.

## 3. Ağaç kimliği ve özellikleri

**Kodlama** (`docs/MVP.md` Modül 2):

| Durum | Kod | Örnek |
| --- | --- | --- |
| Sıradaki yer | S{sıra}-{pozisyon} | S5-12 |
| Sıra arasındaki ağaç | Önceki yerin kodu + harf | S5-12a |
| Ağacı olmayan yer | Yer kodu korunur, ağaç kaydı boş | S5-13 (boş) |

- Bir ağaç kurusa ya da kesilse de yer kodu korunur.
- Boş yere yeni ağaç dikilirse aynı koda yeni bir ağaç kaydı bağlanır.
- Sıra yönü ve başlangıç köşesi parsel başına bir kez seçilir.

**Özellikler:** Envanterde panoramalardan çıkarılır, sonraki ziyaretlerde gerekirse düzeltilir.

| Özellik | Değerler | Nasıl karar verilir |
| --- | --- | --- |
| Yaş sınıfı | Fidan · Genç · Verimli · Yaşlı · Belirsiz | Taç çapı ve gövde kalınlığına göre (aşağıdaki tablo) |
| Aşı durumu | Aşılı · Aşısız · Belirsiz | Gövdede aşı yeri ya da aşı izi görülüyorsa aşılı. Sıra arasındaki ve dipten çıkan genç ağaçlar çoğunlukla aşısızdır |
| Cinsiyet | Dişi · Erkek · Bilinmiyor | Kışın ayırt edilmez; envanterde "bilinmiyor" başlar. İlkbaharda çiçekten belirlenir: erkek çiçek salkımları daha iri ve sıktır. Yazın meyve salkımı olan dişidir |
| Çeşit | Kırmızı, Uzun, Siirt, … · boş | Sahibin beyanı. Denetim çeşidi görüntüden belirlemez |

Yaş sınıfı için ilk eşikler (uzmanla kesinleşecek):

| Sınıf | Taç çapı | Gövde çapı (30 cm'de) |
| --- | --- | --- |
| Fidan | < 1 m | < 5 cm |
| Genç | 1–3 m | 5–15 cm |
| Verimli | 3–7 m | 15–40 cm |
| Yaşlı | > 7 m ya da belirgin yaşlılık (oyuk, büyük kesimler) | > 40 cm |

## 4. Ölçekler

Her ölçeğin bir tanımı, mevsimi ve referans fotoğrafı vardır. 0–3 ölçeklerde ortak kural şudur:
- **0** belirti yok
- **1** hafif, bakım gerektirmez ya da rutin bakımla geçer
- **2** belirgin, bu sezon müdahale önerilir
- **3** ağır, ağacın verimini ya da hayatını tehdit eder

Emin olunamayan durumda bir alt değer değil, **değer girilmez** ve not yazılır.

### 4.1 Kuru dal (tüm ziyaretler)

| Değer | Tanım |
| --- | --- |
| 0 | Kuru dal yok, ya da sadece ince uç sürgünler |
| 1 | Tacın %10'undan azı kuru |
| 2 | Tacın %10–30'u kuru |
| 3 | Tacın %30'undan fazlası kuru |

- **Nasıl bakılır:** Dört yönün kesitleri birlikte değerlendirilir. Oran, tacın görünen hacmine göre tahmin edilir; dal sayısına göre değil.
- **Kışın:** Yapraklar olmadığı için kuru dal canlı daldan renk ve kabukla ayrılır. Kuru dal kül grisidir, kabuğu çatlak ya da soyulmuştur, ucunda tomurcuk yoktur. Kışın verilen 3, ilkbaharda yeniden kontrol edilir.
- **Sık hata:** Budamadan kalan kesik dal uçları kuru dal sayılmaz.

### 4.2 Gövde ve dip (tüm ziyaretler)

Yara, oyuk, kabuk soyulması, zamklanma ve dip sürgünü birlikte değerlendirilir.

| Değer | Tanım |
| --- | --- |
| 0 | Gövde sağlam, dip temiz |
| 1 | Küçük yara ya da birkaç dip sürgünü |
| 2 | Gövde çevresinin dörtte birinden azını saran yara ya da oyuk; yoğun dip sürgünü; zamklanma |
| 3 | Gövde çevresinin dörtte birinden fazlasını saran yara, derin oyuk ya da kabuk soyulması |

- **Nasıl bakılır:** Panorama kesitleri gövdeyi her zaman göstermez; uzun ot, sulama hortumu ya da açı gövdeyi kapatabilir.
- **2 ve üstü yakın planla doğrulanmalı.** Doğrulanamazsa değer girilmez ve ağaç bir sonraki ziyaretin yakın plan listesine alınır.

### 4.3 Budama (kış)

| Değer | Tanım |
| --- | --- |
| Yapılmış | Bu sezon budama izleri belirgin: taze kesimler, açılmış taç ortası |
| Kısmi | Bazı ana dallarda budama var, tacın bir kısmı budanmamış |
| Yapılmamış | Bu sezon budama izi yok |
| Belirsiz | Görüntüden karar verilemiyor (ör. ziyaret budama döneminin başında) |

Budama bir ölçek değil, bakım uyumu göstergesidir. Genel sınıfı etkilemez, parsel karnesinde "bakım uyumu" satırına girer.

### 4.4 Taç doluluğu (ilkbahar, yaz)

| Değer | Tanım |
| --- | --- |
| 0 | Normal: taçtan gökyüzü az görünür |
| 1 | Hafif seyrek |
| 2 | Belirgin seyrek: taçtan gökyüzü geniş alanlarda görünür |
| 3 | Çok seyrek: yaprak sadece dal uçlarında ya da birkaç dalda |

- **Nasıl bakılır:** Aynı parseldeki aynı yaş sınıfından sağlıklı ağaçlarla karşılaştırılır.
- Kıraç bahçelerde yaz sonunda genel bir seyrelme olağandır. Bu durumda parsel karnesinde "kuraklık stresi" bulgusu yazılır; ağaç ağaç yüksek değer verilmez.

### 4.5 Don hasarı (ilkbahar)

| Değer | Tanım |
| --- | --- |
| 0 | Hasar yok |
| 1 | Birkaç sürgünde ya da çiçek salkımında kararma |
| 2 | Tacın belirgin bir kısmında kararmış çiçek ve sürgün |
| 3 | Tacın büyük kısmında çiçek ve genç sürgün kaybı |

Geç don genelde bahçenin çukur kısımlarında kümelenir. Parsel karnesindeki mekânsal desen bunu gösterir.

### 4.6 Zararlı belirtisi (ilkbahar, yaz)

İki parça olarak kaydedilir: şiddet (yok / hafif / belirgin) ve tür.

| Tür | Görünür belirti (görüntüden) |
| --- | --- |
| Psilla | Yapraklarda bal çiği ve parlaklık, üzerinde fumajin (siyah küf) lekeleri, yaprak kıvrılması ve dökümü |
| Göz kurdu | Sürgün uçlarında ve gözlerde kuruma, uç sürgünlerde ölme |
| Kımıl | Meyvelerde emgi lekeleri, iç boşalması (yakın planda) |
| Diğer | Uzman not olarak belirtir |

- **Şiddet:** "Hafif", birkaç dalda belirti demektir. "Belirgin", tacın genelinde ya da çok sayıda dalda.
- Tür kesin değilse "diğer" seçilir ve not yazılır.
- Bu tablo **uzmanla kesinleşecek.** Denetim teşhis koymaz (ilke 2). Türün yanında "görünür belirti" ibaresi yer alır.

### 4.7 Meyve yükü (yaz)

| Değer | Tanım |
| --- | --- |
| 0 | Salkım yok ya da çok az |
| 1 | Az: dalların küçük bir kısmında salkım |
| 2 | Orta |
| 3 | Yüklü: dalların çoğunda salkım |

- Antep fıstığında var yılı / yok yılı (periyodisite) olağandır. Düşük meyve yükü tek başına bir sorun değildir ve genel sınıfı etkilemez.
- Parsel karnesinde dağılım olarak gösterilir. Önceki yılın aynı ziyaretiyle karşılaştırılır.

### 4.8 Hasat sonrası (hasat)

| Gösterge | Değerler |
| --- | --- |
| Hasat tamam mı | Tamam / Eksik / Belirsiz |
| Dal kırığı | Var / Yok |
| Hırsızlık izi | Var / Yok: hasat zamanından önce toplanmış salkımlar, kırılmış dallar, ağaç altında yaprak ve sap yığını |

Dal kırığı "var" ise ağaç için bir bulgu yazılır. Hırsızlık izi parsel düzeyinde bulgudur ve kritik bulgu bildirimiyle sahibe gider (bkz. [8](#8-bulgular-ve-öneriler)).

## 5. Genel sınıf kuralı

Ağacın her ziyaretteki genel sınıfı aşağıdaki kurallarla çıkar. Kurallar yukarıdan aşağı okunur; ilk tutan kural geçerlidir.

| Sıra | Sınıf | Kural |
| --- | --- | --- |
| 1 | **Yok** | Konumda ağaç görünmüyor. En az iki yönün kesitiyle doğrulanmış ve uzman onaylamış olmalı |
| 2 | **Kuru** | Yapraklı dönemde canlı sürgün ya da yaprak yok; veya uzman kuru beyan etmiş |
| 3 | **Sorunlu** | Herhangi bir 0–3 ölçek 3; ya da zararlı belirtisi belirgin |
| 4 | **Dikkat** | Herhangi bir 0–3 ölçek 2; ya da zararlı belirtisi hafif |
| 5 | **Sağlıklı** | Diğer bütün durumlar |

**Kenar durumlar:**
- **Kışın kuru kararı:** Yapraksız dönemde canlıyla kuru ayrımı zordur. Kışın "kuru" sınıfını sadece uzman verir. Kanıt olarak gövde ve ana dallarda yaşam belirtisi olmadığı (tomurcuk yok, kabuk soyulmuş) not edilir. Bu ağaçlar ilkbahar ziyaretinin yakın plan listesine otomatik girer.
- **Kuru → Yok:** Bir sonraki ziyarette sökülmüş bulunan kuru ağaç "yok" olur. Bu bir kötüleşme sayılmaz.
- **Yok → yeni ağaç:** Boş yere fidan dikildiyse yere yeni bir ağaç kaydı açılır. Eski kaydın durumu "kayıp" kalır.
- **Ölçek girilmediyse:** Sınıf, girilen ölçeklerden çıkar. Hiçbir ölçek girilemediyse (ör. görüntü yok) sınıf verilmez ve ağaç "değerlendirilmedi" olarak görünür. Yayından önce uzman bu ağaçlar için ya sınıf girer ya da ek ziyaret ister.
- **Budama ve meyve yükü** genel sınıfı etkilemez.

**Değişim:** Ziyaretler arası değişim bu sırayla okunur: sağlıklı < dikkat < sorunlu < kuru = yok. Sahibe "kötüleşen" ve "iyileşen" ağaç sayısı olarak gösterilir.

## 6. Kaynaklar ve karar zinciri

| Kaynak | Kim | Ne üretir | Sahibe görünür mü |
| --- | --- | --- | --- |
| Personel (`staff`) | Saha personeli | Evet/hayır gözlem cevapları, yakın plan fotoğraflar, "Sorun gördüm" işareti | Kanıt olarak, uzman yayımladıktan sonra |
| Algoritma (`algorithm`) | İşleme hattı | Konum, kesit, kalite skoru, ileride taç çapı gibi ölçümler | Kanıt olarak |
| AI (`ai`) | AI ön değerlendirme | Ölçek önerisi, 0–1 güven skoru, tutarsızlık bayrağı | Hayır. Sadece uzmanın gördüğü bir öneridir |
| Uzman (`expert`) | Ziraat mühendisi | Ölçek ve sınıf kararı, bulgu, öneri, imza | Evet |

**Aynı ziyarette birden çok sonuç varsa:** Uzman > model > AI önceliği geçerlidir. Ziyaretler arasında en yeni ziyaret geçerlidir.

**Zorunlu inceleme:** Aşağıdaki ağaçlar mutlaka uzmanın önüne gelir.
- AI güveni eşiğin altında olanlar. İlk eşik %70; uzman panelinde "düşük güven" filtresi bununla çalışıyor.
- AI'ın sorunlu, kuru ya da yok önerdiği ağaçlar.
- Önceki ziyarete göre sınıfı değişenler.
- Personel cevabıyla AI önerisi çelişenler.
- Personelin "Sorun gördüm" dedikleri.

**Toplu onay ve kalite örneklemi:** Kalan ağaçlar toplu onaylanabilir; bu ağaçların rastgele %5'i yine uzmana gösterilir.
- Toplu onaylanan sonuç sahibe "otomatik onay" olarak, uzman incelemesinden ayrı görünür.
- *v0.1 uzman panelinde toplu onay yok; her ağaç tek tek kabul edilir ya da düzeltilir.*

**İmza ve yayın:**
- Uzman ziyaret özetini görür ve raporu imzalar. Yayın ancak ziyaretteki her aktif ağacın bir uzman kararı varsa yapılabilir.
- Yayın geri alınamaz. Yayımlanmış bir ziyaretin değerlendirmeleri, bulguları ve uzman ölçümleri değiştirilemez; düzeltme bir sonraki ziyarette yapılır ve gerekçesi not edilir.
- Personelin geç gelen kayıtları yayından sonra da eklenebilir.

**Etiketli veri:** Uzmanın her kabulü ve düzeltmesi saklanır. AI önerisi değiştirilmez; uzman kararı ayrı bir kayıttır. Bu eşleşmeler ileride Antep fıstığına özel bir modelin eğitim verisi olur.

## 7. Yakın plan protokolü

**Hangi ağaçlar:**
1. Önceki ziyarette dikkat, sorunlu ya da kuru olan ağaçlar
2. Tabakalı rastgele örneklem: Parsel 10×10 m hücrelere bölünür, hücrelerden dengeli seçimle ağaçların %10'u
3. Personelin taramada "Sorun gördüm" diye işaretlediği ağaçlar
4. Uzmanın ek bakış istediği ağaçlar ("Sonraki ziyarette yakından bakılsın")

**Çekim kuralları:**
- Fotoğraflar sadece uygulama içinden çekilir; galeriden yükleme yoktur.
- Bulanık ya da karanlık fotoğraf cihazda reddedilir.
- Her çekimde ekranda "böyle çek" referans görseli durur.

**Mevsime göre çekimler ve sorular** (uzmanla kesinleşecek):

| Mevsim | Çekimler | Evet/hayır soruları |
| --- | --- | --- |
| Kış | 1. Gövde ve dip, 1 m'den · 2. Taç, ağacın tamamı · 3. Varsa yara ya da kesim yeri, yakından | Gövdede yara ya da oyuk var mı? · Dipte sürgün var mı? · Bu sezon budanmış mı? · Kurumuş ana dal var mı? |
| İlkbahar | 1. Taç · 2. Çiçek ya da sürgün salkımı, yakından · 3. Yaprak, yakından | Çiçek var mı? · Çiçekler erkek mi (iri, sık salkım)? · Kararmış çiçek ya da sürgün var mı? · Yapraklarda yapışkanlık ya da siyah leke var mı? |
| Yaz | 1. Taç · 2. Meyve salkımı, yakından · 3. Yaprak, yakından | Salkım var mı? · Kuruyan sürgün ucu var mı? · Yapraklarda yapışkanlık ya da siyah leke var mı? |
| Hasat | 1. Taç · 2. Varsa kırık dal · 3. Ağaç altı | Hasat yapılmış mı? · Kırık dal var mı? · Ağaç altında yaprak ve sap yığını var mı? |

Sorular sade Türkçe ve referans görselli olmalı; personel ziraat bilgisi beklemeden cevaplayabilmeli. Personel isterse sesli not bırakır.

## 8. Bulgular ve öneriler

Bulgu, sahibin dikkat etmesi gereken bir durumdur. Bir ağaca, bir yere ya da parselin bir bölgesine bağlanır ve en az bir kanıt görüntüsü taşır.

**Önem:**

| Önem | Anlamı | Sahibe bildirim |
| --- | --- | --- |
| Yüksek (`high`) | Ağaç ya da hasat kaybı riski, hemen müdahale: kuruyan ağaç, hırsızlık izi, yangın riski | Uzman onaylar onaylamaz, raporu beklemeden |
| Orta (`medium`) | Bu sezon müdahale: belirgin kuru dal, zararlı belirtisi, gövde yarası | Raporla |
| Düşük (`low`) | Takip edilmeli: sulama sızıntısı, budanmamış ağaçlar | Raporla |
| Bilgi (`info`) | Kayıt için: yeni dikim, var/yok yılı notu | Raporla |

**Bulgu türleri** (veritabanında `finding.kind`):

| Kod | Bulgu | Tipik önem |
| --- | --- | --- |
| `dead_tree` | Kurumuş ağaç | Yüksek |
| `missing_tree` | Kaybolan ağaç (önceki ziyarette vardı) | Yüksek |
| `dead_branch` | Kuru dal (ölçek 2–3) | Orta |
| `trunk_damage` | Gövde yarası, oyuk, kabuk soyulması | Orta |
| `pest_sign` | Zararlı belirtisi (tür notta) | Orta |
| `frost_damage` | Don hasarı | Orta |
| `branch_break` | Dal kırığı | Orta |
| `theft_trace` | Hırsızlık izi | Yüksek |
| `fire_risk` | Kuru ot, yanıcı yığın | Yüksek (hasat dönemi) |
| `drought_stress` | Kuraklık stresi (parsel ya da bölge) | Orta |
| `irrigation_leak` | Sulama sızıntısı ya da arıza | Düşük |
| `unpruned` | Budanmamış ağaçlar (parsel ya da bölge) | Düşük |
| `new_planting` | Yeni dikim | Bilgi |
| `other` | Diğer | Uzman seçer |

**Yazım kuralları:**
- **Açıklama** ne görüldüğünü söyler, yorumsuz: "S5-12: taçta %10–30 kuru dal; kuzey ve doğu yönlerinde."
- **Öneri** sahibin ya da bahçıvanın ne yapacağını söyler: "Kış budamasında kuru dallar alınsın." İlaç önerisi gerekiyorsa uzman adıyla, açıkça uzman görüşü olarak yazılır.
- Dil sade olmalı; sahip ziraat mühendisi değil. Latince ad gerekiyorsa parantez içinde verilir.
- Aynı durumdaki birçok ağaç için ağaç ağaç değil, bölge düzeyinde tek bulgu yazılabilir. Etkilenen ağaçlar kanıt olarak bağlanır.

## 9. Parsel karnesi

Karne, son yayımlanmış ziyaretin özetidir.

**Genel durum skoru** (0–100):
- Önerilen yöntem: ağaç sınıflarının ağırlıklı ortalaması.
- Ağırlıklar: sağlıklı 100, dikkat 60, sorunlu 20, kuru 0, yok 0. Değerlendirilmemiş ağaçlar hesaba girmez.
- v0.1 portalında skor yok. Ağırlıklar bu belgede kesinleşince eklenecek.

**Boyutlar:**

| Boyut | Gösterge |
| --- | --- |
| Envanter | Yer, ağaç, boş yer, ara ağaç; kaybolan ve yeni ağaçlar |
| Bahçe yapısı | Dişi/erkek oranı (önerilen 1 erkeğe 8–10 dişi), aşısız ağaç sayısı, yaş dağılımı |
| Sağlık | Beş sınıfın dağılımı ve önceki ziyarete göre değişimi |
| Mekânsal desen | 10×10 m hücrelerde sorunların kümelenmesi |
| Bakım uyumu | Budama oranı (kış), hasadın tamamlanması (hasat) |
| Zararlı belirtileri | Belirti görülen ağaç sayısı, türü, bölgesi |
| Meyve yükü (yaz) | Ölçek dağılımı |
| Denetim güveni | Kapsama oranı, panorama ve yakın plan sayısı, uzmanın detaylı incelediği oran, metodoloji sürümü, uzman imzası |

"Denetim güveni" satırı her karnede bulunur. Sahip, sonucun ne kadar veriye dayandığını görmelidir.

## 10. Kalite kapıları

| Kapı | Nerede | Kural |
| --- | --- | --- |
| Ön kontrol | Saha uygulaması | Lens, pil, depolama, GNSS ham kaydı. Şafakta, gün batımında, yağmurda ve yoğun tozda tarama yapılmaz |
| Yakın plan kalitesi | Saha uygulaması | Netlik ve pozlama denetimi. Ret halinde fotoğraf kaydedilmez |
| Konum kalitesi | İşleme hattı | Panorama başına GNSS çözümü: fix, float, dgps, single. Fix dışındaki panoramalar kalite skorunda düşer |
| Panorama kalitesi | İşleme hattı | Netlik ve konum katsayısından kalite skoru (0–1) |
| Kapsama | İşleme hattı | Her aktif ağacın en az iki yönden kesiti olmalı. Eşiğin altındaki parsel için yeniden tarama görevi açılır (ilk eşik: ağaçların %95'i, uzmanla kesinleşecek) |
| Uzman | Uzman paneli | Her aktif ağacın uzman kararı olmadan yayın yapılmaz |

## 11. Uzmanla kesinleşecekler

- [ ] Ölçek tanımları ve sınır değerleri (bölüm 4), özellikle kuru dal yüzdeleri ve gövde ölçeği
- [ ] Zararlı belirtisi türleri ve görünür belirtileri (4.6)
- [ ] Yaş sınıfı eşikleri (bölüm 3)
- [ ] Kışın kuru kararının kanıt kuralı (bölüm 5)
- [ ] Yakın plan çekimleri ve soruları (bölüm 7)
- [ ] Bulgu türleri listesi ve tipik önemleri (bölüm 8)
- [ ] Genel durum skoru ağırlıkları (bölüm 9)
- [ ] AI güven eşiği ve kalite örneklemi oranı (bölüm 6)
- [ ] Kapsama eşiği (bölüm 10)
- [ ] Referans fotoğrafların seçimi (Ek A)

Kesinleşen her madde `methodology-v1`'e girer. Sürüm değişikliği o tarihten sonraki ziyaretlerde geçerli olur.

## Ek A – Hazırlanacak referans fotoğraflar

Her ölçek değeri için, panorama kesiti ve yakın plan olmak üzere iki tür referans gerekir. Fotoğraflar pilot bahçelerden ve uzmanın arşivinden seçilir.

| Ölçek | Değerler | Kış | İlkbahar | Yaz | Hasat |
| --- | --- | --- | --- | --- | --- |
| Kuru dal | 0, 1, 2, 3 | ✓ | ✓ | ✓ | ✓ |
| Gövde ve dip | 0, 1, 2, 3 | ✓ | | | |
| Budama | Yapılmış, kısmi, yapılmamış | ✓ | | | |
| Taç doluluğu | 0, 1, 2, 3 | | ✓ | ✓ | |
| Don hasarı | 0, 1, 2, 3 | | ✓ | | |
| Zararlı belirtisi | Her tür için hafif, belirgin | | ✓ | ✓ | |
| Meyve yükü | 0, 1, 2, 3 | | | ✓ | |
| Hasat sonrası | Tamam/eksik, dal kırığı, hırsızlık izi | | | | ✓ |
| Yaş sınıfı | Fidan, genç, verimli, yaşlı | ✓ | | | |
| Cinsiyet | Erkek ve dişi çiçek | | ✓ | | |

Ayrıca saha uygulamasındaki "böyle çek" görselleri: mevsim başına 3 çekim (bölüm 7).

## Ek B – Metrik kaydı karşılıkları

Ölçekler veritabanında `metric_definition` kaydıyla tanımlanır. Kayıt migration'la kurulur (`supabase/migrations/20261021180000_metric_registry.sql`); aşağıdaki kodların hepsi kayıtlıdır.

| Ölçek | Önerilen kod | Değer türü | Mevsimler | Kayıtta |
| --- | --- | --- | --- | --- |
| Kuru dal | `dead_branch_scale` | Ölçek 0–3 | Tümü | Var |
| Gövde ve dip | `trunk_base_scale` | Ölçek 0–3 | Tümü | Var |
| Budama | `pruning_status` | Kategori: `done`, `partial`, `not_done` | Kış | Var |
| Taç doluluğu | `crown_density_scale` | Ölçek 0–3 | İlkbahar, yaz | Var |
| Don hasarı | `frost_damage_scale` | Ölçek 0–3 | İlkbahar | Var |
| Zararlı belirtisi | `pest_sign_severity` + `pest_sign_type` | Kategori: `none`, `mild`, `marked` · kategori: `psylla`, `bud_borer`, `stink_bug`, `other` | İlkbahar, yaz | Var |
| Meyve yükü | `fruit_load_scale` | Ölçek 0–3 | Yaz | Var |
| Hasat tamam mı | `harvest_complete` | Evet/hayır | Hasat | Var |
| Dal kırığı | `branch_break` | Evet/hayır | Hasat | Var |
| Hırsızlık izi | `theft_trace` | Evet/hayır (parsel) | Hasat | Var |

Uzman panelinde bir düzeltme için mevsimin ölçeklerinden en az birinin girilmesi gerekir; görüntüden karar verilemeyen ölçek boş bırakılır (bölüm 4).
