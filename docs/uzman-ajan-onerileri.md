# Uzman ajan önerileri: metodoloji v0 → v1 taslak kararları

**Durum:** Bu belgedeki her karar bir **AI uzman ajanın** (ziraat mühendisi rolünde çalıştırılan bir dil modeli) önerisidir. **27 Ekim 2026'da işletme kararıyla `methodology-v0.1` olarak kabul edildi.** Bir ziraat mühendisinin görüşü değildir; kaynak ya da saha ölçümüne dayanmaz. Pilotta uzman düzeltmeleri ve AI uyum ölçümü bu kararları sınar. Kabul edilen kurallar ve açık kalanlar: [metodoloji.md](metodoloji.md), bölüm 11. Bölüm 6'daki sorular pilot uzmanla görüşülürse diye duruyor; kabul için şart değil.
**Tarih:** 27 Ekim 2026 · **Dayanak:** `docs/metodoloji.md` (methodology-v0), `docs/MVP.md`, `docs/mvp-denetimi.md`

**Nasıl okunur:**
- Her kararda dört parça var: **Öneri**, **Gerekçe**, **Güven** (yüksek / orta / düşük), **Gerçek uzmana soru**.
- Taslakta bir değer zaten varsa karar **Kabul** ya da **Değiştir (neden)** diye başlar.
- Kaynak gösterilmedi. Öneriler Gaziantep'te kuru tarım fıstıkçılığına dair genel saha bilgisine dayanıyor. İstatistik ya da literatür atfı yok. Bölgeye, çeşide ya da yıla göre değişen yerlerde güven düşük ya da orta yazıldı.
- Kod adları İngilizce ve snake_case. Mevcut kayıtla (Ek B) uyumlu.

## İçindekiler

1. [Bölüm 11'deki maddeler](#1-bölüm-11deki-maddeler)
2. [Yeni ağaç alanları: dip sürgünü ve belirgin kuruma](#2-yeni-ağaç-alanları-dip-sürgünü-ve-belirgin-kuruma)
3. [Envanter raporu içeriği](#3-envanter-raporu-içeriği)
4. ["Böyle çek" referans görselleri ve ölçek referans fotoğrafları](#4-böyle-çek-referans-görselleri-ve-ölçek-referans-fotoğrafları)
5. [Belgelerdeki çelişkiler ve eksikler](#5-belgelerdeki-çelişkiler-ve-eksikler)
6. [Gerçek uzmana sorulacak soruların toplu listesi](#6-gerçek-uzmana-sorulacak-soruların-toplu-listesi)

---

## 1. Bölüm 11'deki maddeler

### 1.1 Ölçek tanımları ve sınır değerleri (bölüm 4)

Ortak 0–3 kuralına (0 yok, 1 hafif, 2 belirgin, 3 ağır) ve "emin değilsen değer girme" kuralına **kabul**. Bu iki kural doğru; özellikle ikincisi, personel ve AI'ın "ortaya yakın" değer verme eğilimini kırar.

Bir ekleme öneriyorum: **Her ölçekte sınırdaki vaka için yön kuralı.** İki değer arasında kalınırsa ve kanıt iyi ise **üst değer** seçilsin. Kanıt zayıfsa değer girilmesin. Gerekçe: Denetimin amacı sahibi uyarmak. Sınırdaki bir vakayı bir alt değere indirmek, sorunu bir ziyaret geciktirir.
- **Güven:** orta.
- **Uzmana soru:** "İki değer arasında kalınca yukarı mı yuvarlarsınız, aşağı mı?"

#### 4.1 Kuru dal (`dead_branch_scale`) — Değiştir (yüzdeler kalsın, "ana kol" kuralı eklensin)

| Değer | Görünür ölçüt (öneri) |
| --- | --- |
| 0 | Kuru dal yok. Sadece kalem kalınlığından ince, tek tük kuru uç sürgün var. Budama kesik uçları sayılmaz. |
| 1 | Tacın yaklaşık %10'undan azı kuru. Tipik görünüm: 1–3 yan dal ya da dağınık kuru uçlar. Hiçbir **ana kol** (gövdeden çıkan kalın iskelet dalı) kuru değil. |
| 2 | Tacın %10–30'u kuru **ya da** bir ana kol tümüyle kuru. |
| 3 | Tacın %30'undan fazlası kuru **ya da** iki ve daha fazla ana kol tümüyle kuru. |

- **Gerekçe:** Yüzde tahmini kişiden kişiye çok değişir, sayılabilir bir ölçüt bu yayılmayı azaltır. Fıstıkta bir ana kolun kuruması tek başına önemlidir: o koldaki meyve dalları gider ve ağacın bir tarafı yıllarca boş kalır. Bu yüzden ana kol kuruması yüzde ne olursa olsun en az 2 sayılmalı.
- **Kışın:** Taslaktaki kül grisi kabuk, soyulma ve tomurcuksuz uç ölçütlerine **kabul**. Bir ekleme var: Canlı fıstık dalının kabuğu kışın kızıl kahve ile gri arasındadır ve uçlarında dolgun tomurcuk bulunur. Kuru dalda tomurcuklar büzüşmüş ya da yoktur, ince dal bükülünce esnemeden "çıt" diye kırılır. Bu bükme testi yakın planda personel sorusu olabilir (bkz. 1.5).
- **Sık hata (ekleme):** Gölgede kalan iç dallar ve kışın koyu görünen ıslak dallar yanlışlıkla kuru sanılır. Üst üste binen arka sıra ağacının dalları da tacın parçası sanılır.
- **Güven:** Yüzde sınırları için orta. Ana kol kuralı için orta–yüksek.
- **Uzmana soru:** "Tek bir ana kolun tümüyle kuruması sizce tek başına 'belirgin' (2) mi? %10 ve %30 sınırlarını sahada gözle ayırt edebiliyor musunuz, yoksa 0–1–2 gibi daha kaba bir ölçek mi daha tutarlı olur?"

#### 4.2 Gövde ve dip (`trunk_base_scale`) — Değiştir (dip sürgünü çıkarılsın, mutlak ölçü eklensin)

v1'de bu ölçek **"Gövde ve kök boğazı"** olsun. Dip sürgünü ayrı alana taşınsın (bkz. bölüm 2). Kod adı aynı kalabilir. Tanımın sürümle değiştiği metrik kaydına yazılsın.

| Değer | Görünür ölçüt (öneri) |
| --- | --- |
| 0 | Gövde ve kök boğazı sağlam. Eski, kapanmış (kabukla örtülmüş) budama yaraları olabilir. |
| 1 | Bir avuç içinden küçük (yaklaşık 10 cm'den kısa), yüzeysel ve açık yara. Ya da tek tük, küçük zamk (kehribar renkli, sertleşmiş damla) noktası. |
| 2 | Avuçtan büyük ama gövde çevresinin dörtte birinden azını saran yara. Ya da sığ oyuk. Ya da birden çok yerde zamklanma. Ya da kök boğazında koyulaşmış, çökmüş kabuk. |
| 3 | Gövde çevresinin dörtte birinden fazlasını saran yara ya da kabuk soyulması. Ya da içine el girecek kadar derin oyuk. Ya da kök boğazını çepeçevre saran kabuk ölümü. |

- **Gerekçe:** Taslakta 1 ile 2'yi ayıran bir ölçü yoktu ("küçük yara" ile "dörtte birden az" çakışıyordu). Avuç içi, personelin ve uzmanın yanında taşıdığı bir ölçüdür. Kök boğazındaki kabuk ölümü ve zamklanma, özellikle sulu bahçelerde ve su birikintisi yapan yerlerde ciddiye alınmalı. Burada teşhis konmaz, sadece görünür belirti yazılır. Traktör ve çapa yarası Gaziantep bahçelerinde sık görülür ve bu ölçeğe girer.
- **Neden dip sürgünü çıkıyor:** Dip sürgünü bir yara değildir, bakım durumunu gösterir. Aynı ölçekte durunca "yoğun dip sürgünü olan sağlam gövde" ile "küçük yaralı gövde" aynı değeri alıyordu.
- **Güven:** orta.
- **Uzmana soru:** "Pilot bahçelerde kök boğazı sorunu (kabuk koyulaşması, zamklanma) ne sıklıkta görülüyor? Sulu ve kıraç bahçede bu ölçeği aynı mı tutalım? Zamklanmayı ayrı bir evet/hayır alanı yapmak ister misiniz?"

#### 4.3 Budama (`pruning_status`) — Kabul (bir uyarıyla)

- Değerlere **kabul**. Kanıt ölçütü (ekleme): **Taze kesim** yüzeyi açık krem rengindedir ve henüz grileşmemiştir. Kesimin üstünde kabuk henüz kapanmaya başlamamıştır. Geçen yılın kesimi ise grileşmiş ve kenarından kapanmaya başlamış olur.
- **Uyarı:** Antep fıstığında her yıl ağır budama yapılması bölgede yaygın bir uygulama değildir. Pek çok üretici var yılı hasadının ardından ya da birkaç yılda bir budar. Bu yüzden "yapılmamış" sonucu sahibe olumsuz bir bulgu gibi sunulmamalı. Karnede "bu sezon budama izi görülen ağaç oranı" olarak durmalı, `unpruned` bulgusu yalnız uzman gerekli görürse yazılmalı (bkz. 1.6).
- Kış ziyareti **Şubat'ın ikinci yarısına** kaydırılırsa "belirsiz" oranı düşer, çünkü budama çoğunlukla Aralık–Şubat arasında yapılır.
- **Güven:** Değerler için yüksek. Budama sıklığıyla ilgili uyarı için orta (üreticiye göre çok değişir).
- **Uzmana soru:** "Pilot bahçelerin sahipleri her yıl mı budatıyor? 'Budanmamış' sizce bir bulgu mu, yoksa sadece bilgi mi?"

#### 4.4 Taç doluluğu (`crown_density_scale`) — Kabul + görünür ölçüt

| Değer | Görünür ölçüt (öneri) |
| --- | --- |
| 0 | Normal: Aynı parselde aynı büyüklükteki iyi ağaçlar kadar dolu. Taçtan gökyüzü sadece küçük boşluklarda görünüyor. |
| 1 | Hafif seyrek: Karşılaştırma ağacından fark edilir derecede açık. Gökyüzü taçta dağınık ama çok sayıda boşluktan görünüyor. |
| 2 | Belirgin seyrek: Taç alanının kabaca yarısına yakın kısmından gökyüzü görünüyor. Ya da yaprak bir yönde belirgin biçimde az. |
| 3 | Çok seyrek: Yaprak sadece dal uçlarında ya da birkaç dalda kalmış. Taç çoğunlukla çıplak dal. |

- Parsel içi karşılaştırma kuralına **kabul**. Bir ek kural öneriyorum: **Erkek ağaçlar ve fidanlar** kendi gruplarıyla karşılaştırılsın. Erkek ağaçların tacı ve yaprak yapısı dişilerden farklı olabilir.
- Kıraç bahçede yaz sonu genel seyrelme için bölge bulgusu yazma kuralına **kabul**.
- Var yılında çok yüklü ağaçta yaprak, meyveye göre az görünebilir. Bu durum taç doluluğuna yansıtılmasın.
- **Güven:** orta. "Yarısı" sınırı için düşük.
- **Uzmana soru:** "Seyrekliği gökyüzü oranıyla tarif etmek sizce sahada işe yarar mı? Haziran sonunda kıraç bir bahçede 'normal' taç nasıl görünür?"

#### 4.5 Don hasarı (`frost_damage_scale`) — Değiştir (oranlar eklensin)

| Değer | Görünür ölçüt (öneri) |
| --- | --- |
| 0 | Kararmış çiçek ya da sürgün yok. |
| 1 | Salkım ve genç sürgünlerin yaklaşık %10'undan azında kararma ya da büzüşme. |
| 2 | %10–50'sinde kararma. Genellikle tacın alt kısmında ya da bir yönde daha yoğun. |
| 3 | Yarısından fazlasında çiçek ve genç sürgün kaybı. Salkımlar kahverengi ya da siyah, kurumuş ve sarkık. |

- **Gerekçe:** Taslakta "belirgin kısım" ile "büyük kısım" ayrımı ölçüsüzdü. Geç donda zarar genellikle tacın alt kısmında ve bahçenin çukur yerlerinde yoğunlaşır. Tacın üstü sağlam kalabilir. Bu bilgi değer ve not olarak yazılmalı.
- **Zamanlama:** Don belirtisi birkaç gün içinde görünür hale gelir. İki üç hafta sonra kararmış salkımlar dökülür ve iz kaybolur. Sabit tarihli ilkbahar ziyareti bunu kaçırabilir. Sahip ya da bölgeden "don oldu" haberi gelirse **olaya bağlı ek ziyaret** açılmasını öneriyorum (bkz. bölüm 5).
- **Karışan belirtiler:** Göz kurdunun sürgün ucunu kurutması ve mantar kaynaklı salkım yanıklığı dondan ayırt edilemeyebilir. Ayrımı uzman yapar. Personel sadece "kararmış salkım var mı" sorusunu cevaplar.
- **Güven:** orta. %50 sınırı için düşük.
- **Uzmana soru:** "Gaziantep'te fıstığın çiçek açma dönemi (çoğu yıl Nisan ortası–sonu) ile geç don riski ne sıklıkla çakışıyor? Don sonrası kaç gün içinde bakmak gerekir?"

#### 4.6 Zararlı belirtisi (`pest_sign_severity`, `pest_sign_type`) — Değiştir (önemli)

**a) "Kımıl" adı yanlış.** Kımıl (süne/kımıl) bir hububat zararlısıdır. Fıstıkta meyveyi emerek boş ya da lekeli iç yapan böcekler **fıstık kokarcalarıdır**. Kod zaten `stink_bug`, yani düzeltme yalnız Türkçe adda. Belgedeki ad **"Kokarca"** olsun.
- **Güven:** yüksek.

**b) Tür tablosu (öneri):**

| Tür (kod) | Hangi ziyarette görülür | Görünür belirti (görüntüden) | Personelin görebileceği |
| --- | --- | --- | --- |
| Psilla (`psylla`) | İlkbahar sonu, yaz (en yoğun Haziran–Ağustos) | Yaprakta parlaklık ve yapışkanlık (bal çiği). Yaprak üstünde ya da ağaç altında beyaz, şeker tanesi ya da pul gibi salgı. Bunun üstünde siyah küf (fumajin). Ağır durumda yaprakta sararma ve yaz ortasında yaprak dökümü | Evet: yapışkanlık, beyaz pul, siyah is |
| Göz kurdu (`bud_borer`) | İlkbahar, yaz başı | Sürgün ucunda ya da tomurcukta kuruma. Kurumuş uç sürgünde küçük delik. Sürgünün kolayca kırılması | Kısmen: "kuruyan sürgün ucu var mı" |
| Kokarca (`stink_bug`) | Yaz (Haziran–Temmuz); izleri hasatta | Meyve dış kabuğunda küçük koyu emgi noktaları. Yere erken dökülmüş yeşil meyve. Asıl zarar (boş ya da lekeli iç) ancak meyve kırılınca görülür | Zor. Yerde yeşil meyve sorusu sorulabilir |
| Diğer (`other`) | Tümü | Uzman notla yazar | — |

- **Ek tür önerisi (düşük güven):** Yaprakta leke ya da benekli kuruma (`leaf_spot`). Bu bir zararlı değil ama yazın görünür ve sahibi ilgilendirir. Kodlamada `pest_sign_type` yerine ayrı bir "yaprak belirtisi" alanı daha doğru olabilir. Pilot verisi gelene kadar "diğer" altında not olarak tutulsun.
- **Diğer başlığına girebilecekler (bilgi amaçlı, düşük güven):** Kabuklu bitler (dalda yapışık küçük kabuklar), kök ve gövde kurtları (gövde dibinde delik ve talaş), meyve içi zararlıları (dışarıdan görülmez).

**c) Şiddet kuralı — Değiştir.** Taslakta "hafif" zararlı belirtisi ağacı **Dikkat** sınıfına çıkarıyor. Yaz ziyaretinde hafif psilla belirtisi bölgedeki bahçelerin çoğunda neredeyse her ağaçta görülebilir. Bu kural yazın parselin büyük kısmını Dikkat'e boyar ve bilgi değeri kalmaz.
- **Öneri:** "Hafif" belirti ağaç sınıfını değiştirmesin, parsel ya da bölge düzeyinde `pest_sign` bulgusu olarak yazılsın. Ağaç sınıfını sadece "belirgin" etkilesin: **belirgin → Dikkat**. **Belirgin + yaprak dökümü ya da sürgün kaybı → Sorunlu**.
- **Güven:** orta.

**d) Hasat ziyaretinde de girilebilsin.** Psilla Ağustos'ta hâlâ etkili olabilir. Ağustos başındaki hasat ziyaretinde psilla belirtisi kaydedilemezse bilgi kaybolur.
- **Güven:** orta.

- **Uzmana soru:** "Pilot bahçelerde psilla, göz kurdu ve kokarca dışında sahibe bildirilmesi gereken ve görüntüden fark edilebilen başka bir zararlı ya da hastalık belirtisi var mı? Hafif psilla belirtisini ağaç sınıfına yansıtmamak sizce doğru mu?"

#### 4.7 Meyve yükü (`fruit_load_scale`) — Kabul + görünür ölçüt + karşılaştırma kuralı değişsin

| Değer | Görünür ölçüt (öneri) |
| --- | --- |
| 0 | Salkım yok ya da tek tük (birkaç salkım). |
| 1 | Az: Dalların kabaca üçte birinden azında salkım. |
| 2 | Orta: Dalların üçte biri ile üçte ikisi arasında salkım. |
| 3 | Yüklü: Dalların üçte ikisinden fazlasında salkım. Dallar yükten aşağı eğilmiş olabilir. |

- **Erkek ağaçlar** bu ölçeğe girmez ("uygulanamaz"). Karne dağılımına da katılmaz.
- **Değiştir:** Taslak, meyve yükünü **önceki yılın** aynı ziyaretiyle karşılaştırıyor. Fıstıkta var ve yok yılları çoğunlukla birbirini izler, bu yüzden önceki yılla karşılaştırma doğal olarak "çok düştü" ya da "çok arttı" gösterir ve sahibi yanıltır. Öneri: **Hem bir önceki yıl hem iki önceki yıl** (aynı faz) gösterilsin. Yorum iki yıl önceki ile yapılsın. Var ya da yok yılı notu yazılsın.
- **Zamanlama:** Haziran'da meyve dökümü henüz sürüyor olabilir. Yaz ziyareti için **Temmuz** daha uygun.
- **Güven:** Ölçek için orta. Periyodisite kuralı için yüksek.
- **Uzmana soru:** "Bu bahçelerde var ve yok yılı düzenli olarak birbirini izliyor mu, yoksa ağaçlar arasında karışık mı? Meyve yükünü Temmuz'da değerlendirmek uygun mu?"

#### 4.8 Hasat sonrası — Değiştir (ziyaret ikiye bölünsün ya da bulgu zamanlaması düzeltilsin)

- Hırsızlık, meyve olgunlaştığı ama hasat başlamadığı dönemde (Ağustos başı ve ortası) olur. "Hasat tamam mı" sorusu ise hasattan sonra (Eylül sonu–Ekim) cevaplanabilir. İkisi aynı ziyarette sorulursa biri yanlış zamandadır.
- **Öneri (iki seçenek):**
  - **A:** Paket 4 ziyaret kalacaksa hasat ziyareti **hasattan sonra** (Eylül sonu–Ekim) yapılsın. Hırsızlık izi "olası iz" olarak işaretlensin ve sahibe yüksek önem yerine **orta** önemle gitsin.
  - **B:** Yaz ziyareti Temmuz sonu ya da Ağustos başına kaydırılsın ve hırsızlık riski göstergesi orada sorulsun.
- **Hırsızlık izi yanlış alarm riski yüksek:** Meşru hasattan sonra da ağaç altında yaprak, sap ve kırık dal kalır. "Ağaç altında yığın" tek başına iz sayılmasın. İz için şu ölçütlerden en az biri gereksin:
  - **Hasat zamanından önce** boşaltılmış salkım sapları.
  - Komşu ağaçlar dolu iken tek tük boşaltılmış ağaçlar.
  - Tel ya da çitte yeni açılmış geçit.
- **Güven:** orta.
- **Uzmana soru:** "Bölgede fıstık hırsızlığı hangi tarihlerde yoğunlaşıyor? Meşru hasat artığını hırsızlık izinden fotoğrafta nasıl ayırırsınız?"

### 1.2 Zararlı belirtisi türleri ve görünür belirtileri (4.6)

Bkz. 1.1 içinde 4.6 bölümü. Özet: "kımıl" adı "kokarca" olsun, belirti tablosu ve mevsim sütunu eklensin, "hafif" ağaç sınıfını değiştirmesin, psilla hasat ziyaretinde de girilebilsin.

### 1.3 Yaş sınıfı eşikleri (bölüm 3) — Değiştir

**a) Ad değişikliği:** Görüntüden gerçek yaş bilinemez. Alanın adı sahibe **"büyüklük sınıfı"** olarak gösterilsin. Kod ve iç kullanımda "yaş sınıfı" kalabilir. Gaziantep'te birçok eski bahçe, yerinde aşılanmış yaşlı menengiç ya da buttum ağaçlarından oluşur: anaç gövdesi çok kalın ve yaşlı, aşılı taç ise görece genç olabilir. Gövde çapı bu ağaçlarda yaşı abartır.

**b) Eşikler (öneri):**

| Sınıf | Gövde çapı (aşı yerinin üstünde, yaklaşık yerden 50 cm) | Taç çapı | Motosikletten görülebilecek ölçüt |
| --- | --- | --- | --- |
| Fidan | < 5 cm (bilekten ince) | < 1,5 m | Boy çoğunlukla insan boyundan kısa. Çoğunlukla destek kazığı, koruma kabı ya da torba var. Taç belirgin değil, birkaç dal. |
| Genç | 5–12 cm | 1,5–3 m | Boy insan boyu civarında ya da biraz üstünde. Ana kollar ince (bilek kalınlığı). Tacın arkasından sıra açıkça görünüyor. |
| Verimli | 12–35 cm | 3–6 m | Taç komşu ağaca yaklaşıyor. Ana kollar kol kalınlığında ya da daha kalın. Gövde yetişkin bir baldır kalınlığında ya da daha kalın. |
| Yaşlı | > 35 cm ya da belirgin yaşlılık izi | > 6 m ya da gençleştirilmiş taç | Gövde bel kalınlığında. Ya da gövdede oyuk, büyük eski kesim yerleri, sertleşmiş kabuk. Ya da kalın kesilmiş kolların üstünde ince yeni kollar (gençleştirme budaması). |
| Belirsiz | — | — | Gövde görünmüyor ya da ölçütler çelişiyor. |

- **Ölçüm yüksekliği — Değiştir:** Taslak çapı 30 cm'de ölçüyor. Gaziantep'te aşı çoğunlukla toprağa yakın yapılır ve aşı yerindeki kalınlaşma 30 cm civarında ölçümü bozar. Bu yüzden **aşı yerinin üstünde, yaklaşık 50 cm'de** ölçmeyi öneriyorum. Aşı yeri görünmüyorsa ölçüm 50 cm'de alınsın.
- **Çelişki kuralı:** Gövde ve taç farklı sınıfa düşerse **taç** kazansın ve not yazılsın ("kalın anaç, genç taç"). Gerekçe: Verimi ve bakım ihtiyacını taç belirler. Kalın gövdeli ama küçük taçlı ağaç (yeniden aşılanmış ya da sert gençleştirilmiş) "genç" muamelesi görmeli.
- **Ölçüm yöntemi:** Envanterde ağacın yeri üçgenlemeyle biliniyor, panoramanın ağaca uzaklığı da biliniyor. Bu yüzden gövde genişliği piksel ölçüsünden yaklaşık santimetreye çevrilebilir. Taç çapı da aynı yolla ölçülebilir. İleride `algorithm` kaynaklı bir ölçüm olarak eklenebilir (`trunk_diameter_cm`, `crown_diameter_m`). O zamana kadar ofis kişisi gözle ve yukarıdaki görünür ölçütlerle karar versin.
- **Güven:** **düşük–orta.** Kuru tarımda büyüme yavaştır, sulu bahçede hızlıdır. Aynı yaşta iki kat fark olabilir. Sınıf eşiklerinin gerçek uzman ve pilot bahçe ölçümleriyle ayarlanması gerekir.
- **Uzmana soru:** "Pilot bahçelerde 10, 20 ve 40 yaşlarındaki tipik ağaçların gövde çapı ve taç çapı ne kadar? Aşı genelde hangi yükseklikte yapılmış? Yerinde aşılanmış menengiçler için ayrı bir 'aşılı yaşlı anaç' notu gerekir mi?"

### 1.4 Kışın kuru kararının kanıt kuralı (bölüm 5) — Değiştir (somut test eklensin)

**Öneri:** Kışın (yapraksız dönemde) "Kuru" sınıfı **sadece uzman** tarafından ve şu kanıtlarla verilir:

1. **Yakın plan:** Gövde ve dip çekimi, artı **farklı yönlerden en az üç dal ucunun** yakın planı.
2. **Personel testleri** (her dal için; ziraat bilgisi gerektirmez):
   - **Tomurcuk:** Dal ucunda dolgun tomurcuk var mı?
   - **Bükme:** İnce dal (kalem kalınlığında) bükülünce esniyor mu, "çıt" diye kırılıyor mu?
   - **Kazıma:** Kalem kalınlığındaki bir dalda tırnakla ya da çakının ucuyla kabuk 1 cm kazındığında altı yeşil ve nemli mi, kahverengi ve kuru mu? Kazınan yerin yakın planı çekilir.
3. **Karar:** Üç dalın hepsinde (tomurcuk yok + kırılıyor + kabuk altı kahverengi) **ve** gövdede canlı belirti yoksa uzman "Kuru" verebilir. Sahibe gösterilen ad **"Kuru (kış gözlemi; ilkbaharda doğrulanacak)"** olsun.
4. **Dip sürgünü istisnası:** Aşılı kısım kuru ama dipten (anaçtan) canlı sürgün varsa bkz. bölüm 2.3: Sınıf Kuru, desen `top_dead_base_alive`, not "anaç canlı".
5. **Kanıt eksikse:** Kışın Kuru verilmez. Ağaç `dead_branch_scale = 3` ile **Sorunlu** olur, not düşülür ve ilkbahar yakın plan listesine otomatik girer (taslaktaki kural korunur).
6. **Önceki ziyaret varsa:** Önceki yapraklı ziyarette (yaz ya da hasat) ağaç yapraklıydı ve şimdi kuru görünüyorsa bu ani bir değişimdir. Zorunlu incelemeye girer ve bulgu **yüksek** önemle değerlendirilir.

- **Gerekçe:** Kazıma testi meyvecilikte yaygın ve basit bir canlılık kontrolüdür. Uzaktan çalışan uzmana yalnız fotoğrafa bakmaktan çok daha güçlü bir kanıt verir. Fıstık kışın uzun süre derin dinlenmede kalır. Canlı ama zayıf bir ağaç kışın kuru görünebilir, bu yüzden en az üç farklı dal istenir.
- **Dikkat:** Kazıma ağaca küçük bir yara açar. Sözleşmede sahibin bu teste izin verdiği yazılmalı. Test sadece kuru şüphesi olan ağaçlarda yapılmalı.
- **Güven:** Kazıma ve bükme testinin geçerliliği için orta–yüksek. "Üç dal" sayısı için orta.
- **Uzmana soru:** "Fıstıkta kış ortasında kabuk altı rengi canlılığı güvenilir gösterir mi? Kaç dal yeterli? Sahibin izni olmadan bu testi yapmak sorun olur mu?"

### 1.5 Yakın plan çekimleri ve soruları (bölüm 7) — Değiştir

**Genel kurallar (ekleme):**
- Her soruda **"Bilmiyorum / göremedim"** seçeneği olsun. Bu, ilke 4 ("belirsizlik saklanmaz") gereğidir. Evet/hayır'a zorlanan personel tahmin eder.
- Sorular personelin **gördüğünü ya da dokunduğunu** sorar; ziraat terimi içermez.
- Çekim sırası her ziyarette aynıdır: önce uzak (taç), sonra orta (gövde), en son yakın. Personel ağaca yaklaşırken çeker, geri dönmez.
- **Yön kuralı:** Tekrarlanabilirlik için gövde ve taç çekimi ağacın **güney tarafından, kuzeye bakarak** yapılsın. Böylece Türkiye'de öğle saatlerinde güneş personelin arkasında kalır, ağaç cepheden aydınlanır ve her ziyaret aynı yüzü gösterir. Uygulama pusulayla yönlendirir. Sıra düzeni buna izin vermezse en yakın koridor kullanılır ve yön kaydedilir.

**Mevsim başına çekimler ve sorular (öneri):**

| Mevsim | Çekimler | Sorular (her birinde "göremedim" seçeneği var) |
| --- | --- | --- |
| **Kış** | 1. Taç: ağacın tamamı, 6–8 m'den · 2. Gövde ve dip: 1–1,5 m'den, diz hizasından · 3. Yakın: Varsa yara, oyuk ya da zamk; yoksa bir dal ucu ve tomurcuğu · (4. Sadece kuru şüphesinde: üç dal ucu ve kazıma yeri, bkz. 1.4) | 1. Gövdede yara, oyuk ya da kabuğu kalkmış yer var mı? · 2. Gövdenin dibinden ya da topraktan çıkan ince dallar var mı? Varsa kaç tane: birkaç / çok? · 3. Ağaçta açık renkli, yeni kesilmiş dal yeri var mı? · 4. Kuru görünen kalın dal (kol) var mı? · 5. Gövdede ya da dipte reçine gibi sertleşmiş damla var mı? |
| **İlkbahar** (Nisan ortası–Mayıs ortası) | 1. Taç · 2. Çiçek ya da sürgün salkımı, 20–30 cm'den · 3. Yaprak, 20–30 cm'den (alt yüzü dahil) | 1. Ağaçta çiçek salkımı var mı? · 2. Salkıma dokununca eline sarı toz bulaşıyor mu? (erkek ağaç) · 3. Kararmış ya da kurumuş salkım veya sürgün var mı? · 4. Ucu kurumuş genç sürgün var mı? · 5. Yapraklar yapışkan mı ya da üstünde siyah is var mı? |
| **Yaz** (Temmuz) | 1. Taç · 2. Meyve salkımı, 30 cm'den · 3. Yaprak, 20–30 cm'den (üst ve alt yüz) | 1. Ağaçta meyve salkımı var mı? · 2. Yapraklar yapışkan ya da parlak mı? · 3. Yapraklarda ya da ağaç altında beyaz, şeker tanesi gibi pul var mı? · 4. Yaprakta siyah is var mı? · 5. Ağaç altında çok sayıda dökülmüş yeşil meyve var mı? · 6. Dalda kurumuş, kahverengi yapraklar asılı mı? |
| **Hasat** (hasattan sonra) | 1. Taç · 2. Varsa kırık dal: kırık yerin gövdeyle bağlantısını gösteren 1–2 m'lik çekim · 3. Ağaç altı: tacın altındaki toprak, 2–3 m'den | 1. Ağaçta toplanmamış salkım kalmış mı? · 2. Kırık ya da yarılmış dal var mı? · 3. Ağaç altında yaprak, sap ya da kopmuş dal yığını var mı? · 4. Ağacın çevresinde boyunu aşan kuru ot ya da yığın var mı? |

- **Gerekçe:**
  - Kışın taç ilk sıraya alındı, çünkü kuru dal ve budama yargısı tacın tamamına dayanır.
  - "Çiçekler erkek mi (iri, sık salkım)?" sorusu personel için belirsizdi. Polen tozu dokunarak ayırt edilebilir ve kesin bir ölçüttür. Polen döneminin kısa olduğu ve ziyaretin buna denk gelmeyebileceği unutulmamalı. Denk gelmezse personel "göremedim" der ve karar fotoğraftan uzmana kalır.
  - Psillanın beyaz pul gibi salgısı personelin kolayca gördüğü bir işarettir.
  - "Dalda kurumuş yaprak asılı" sorusu ani kuruma belirtisidir ve kaçırılmaması gerekir (bkz. bölüm 2.3).
  - "Yangın riski" için kuru ot sorusu eklendi; taslakta bulgu türü vardı ama sorusu yoktu.
- **Güven:** Çekimler için orta–yüksek. Erkek ağaç polen sorusu için orta. Yön kuralı için orta.
- **Uzmana soru:** "Erkek ve dişi çiçeği bir saha personeline en kolay nasıl ayırt ettirirsiniz? Kışın tomurcuk şeklinden cinsiyet ayırt edilebiliyor mu (erkek tomurcuk daha iri ve yuvarlak diye biliniyor)? Psilla için en iyi tek fotoğraf hangisi: yaprak alt yüzü mü, sürgün ucu mu?"

### 1.6 Bulgu türleri listesi ve tipik önemleri (bölüm 8) — Kısmen değiştir

**Mevcut türler:**

| Kod | Taslak önem | Öneri | Gerekçe |
| --- | --- | --- | --- |
| `dead_tree` | Yüksek | **Değiştir:** Tek ağaç ve önceden zayıfladığı biliniyorsa **orta**. Önceki yapraklı ziyarette canlıydı ve şimdi kuruysa ya da aynı ziyarette bir bölgede 2+ yeni kuruma varsa **yüksek** | Her kuru ağaç için hemen bildirim sahibi yorar. Ani ya da kümelenen kuruma ise hızlı bakım gerektirir. |
| `missing_tree` | Yüksek | **Kabul.** Kütük ya da kesim izi varsa notta "kesilmiş" yazılsın | Bir ağacın izinsiz kesilmesi sahip için kritik bir bilgidir. |
| `dead_branch` | Orta | **Kabul** (ölçek 2–3) | |
| `trunk_damage` | Orta | **Kabul.** Ölçek 3 ve kök boğazını saran durumlarda uzman yüksek seçebilir | |
| `pest_sign` | Orta | **Değiştir:** Psilla belirgin ve parselde yaygınsa **yüksek** (zamana duyarlı) | Psilla yazın birkaç hafta içinde yaprak dökümüne yol açabilir. Raporu beklemek müdahaleyi geciktirir. |
| `frost_damage` | Orta | **Kabul** | Hemen yapılacak bir şey genellikle yoktur; kayıt ve verim beklentisi için önemlidir. |
| `branch_break` | Orta | **Kabul** | |
| `theft_trace` | Yüksek | **Değiştir:** "Olası iz" olarak **orta**. Uzman en az iki ölçütle (bkz. 4.8) emin olursa yüksek | Yanlış alarm riski yüksek ve sahibi bahçıvanıyla karşı karşıya getirebilir. |
| `fire_risk` | Yüksek (hasat) | **Kabul.** Haziran–Eylül arasında yüksek, diğer aylarda düşük | |
| `drought_stress` | Orta | **Kabul** (parsel ya da bölge düzeyi) | |
| `irrigation_leak` | Düşük | **Kabul** | |
| `unpruned` | Düşük | **Değiştir: Bilgi**, uzman gerekli görürse | Bkz. 4.3; fıstıkta her yıl budama şart değildir. |
| `new_planting` | Bilgi | **Kabul** | |
| `other` | Uzman seçer | **Kabul** | |

**Eklenmesi önerilen türler:**

| Kod | Bulgu | Tipik önem | Not |
| --- | --- | --- | --- |
| `canopy_dieback` | Belirgin kuruma deseni (bkz. 2.3) | Orta. Ani kuruma (dalda asılı kuru yaprak) varsa **yüksek** | |
| `basal_sprouts` | Yoğun dip sürgünü | Düşük | Çoğunlukla bölge ya da parsel düzeyinde tek bulgu olarak yazılır. |
| `regraft_candidate` | Aşılı kısmı kurumuş ama anacı canlı ağaç | Bilgi | Sahibe "yeniden aşılama sorulabilir" denir (uzman görüşü). |
| `ungrafted_tree` | Aşısız ağaç | Bilgi | Envanter raporunda toplu verilir. |
| `pollinizer_ratio` | Erkek ağaç oranı ya da dağılımı alışılmış aralığın dışında | Bilgi | İlkbahardan sonra, parsel düzeyi. |
| `animal_damage` | Hayvan zararı: otlatma, kemirme, kabuk soyma | Orta (fidanda yüksek) | Köy bahçelerinde keçi ve koyun otlatması genç ağaçlar için ciddi bir risktir. |

- **Güven:** orta. `animal_damage` için orta–düşük; pilot bahçelerin konumuna bağlı.
- **Uzmana soru:** "Sahibe raporu beklemeden bildirilmesi gerektiğini düşündüğünüz bulgular hangileri? Bu listede gereksiz ya da eksik bir tür var mı?"

### 1.7 Genel durum skoru ağırlıkları (bölüm 9) — Değiştir

- **Ağırlıklar (öneri):** Sağlıklı 100, Dikkat **70**, Sorunlu **25**, Kuru 0.
- **"Yok" sınıfı:** Yalnız **kaybolduğu ziyarette** 0 ile hesaba girsin. Sonraki ziyaretlerde ağaç "kayıp" durumundadır ve hesaptan çıkar; yer artık boş yer sayılır. Gerekçe: Yıllar önce kaybolmuş bir ağaç her karnede skoru düşürmemeli. Boş yerler envanter boyutunda zaten gösteriliyor.
- **Dikkat 60 yerine 70:** Bu sınıfın tanımı "bu sezon müdahale önerilir" ve çoğu durum geri döndürülebilir. Ağaçların tümü Dikkat olan bir parselin "60" alması sahibe başarısızlık gibi okunur. 70 "iyi değil ama kötü de değil" algısına daha yakın.
- **Mevsim uyarısı:** Kış skorunda daha az ölçek girilir, bu yüzden yaz skoru kış skorundan sistematik olarak farklı olur. Trend **aynı mevsimin önceki yılıyla** karşılaştırılsın. Farklı mevsimler arasında trend oku gösterilmesin ya da "farklı mevsim" notu düşülsün.
- **Değerlendirilmemiş ağaçlar:** Hesaba girmez (kabul). Ancak oranları %5'i geçerse skorun yanında "ağaçların %X'i değerlendirilemedi" uyarısı çıksın.
- Erkek ağaçlar, fidanlar ve yaşlı ağaçlar ayrıca ağırlıklandırılmasın. Basitlik daha önemli.
- **Güven:** düşük–orta. Ağırlıklar bir değer yargısıdır, bilimsel bir dayanağı yoktur. Pilot sahiplerinin skoru nasıl okuduğu ölçülmeli.
- **Uzmana soru:** "Sağlıklı, Dikkat ve Sorunlu ağaçların karışımından oluşan bir parsel için sahibe söyleyeceğiniz genel yargı ne olurdu? Skor sizin yargınıza yakın çıkıyor mu?"

### 1.8 AI güven eşiği ve kalite örneklemi oranı (bölüm 6) — Değiştir

- **Güven eşiği:** %70 başlangıç değeri olarak **kabul**. Ancak genel amaçlı bir görsel LLM'in kendi verdiği güven skoru gerçek doğrulukla örtüşmeyebilir. Bu yüzden eşik bir pilot ölçümüyle ayarlanmalı: Uzman kararıyla AI önerisini eşleştir, güven aralığına göre uyumu ölç ve eşiği "uyum ≥ %90" olan aralığın altına koy.
- **Ölçeğe göre eşik:** Kuru dal ve gövde ölçeği görüntüden en zor değerlendirilen ölçeklerdir. Bu ölçeklerde ilk sezon AI önerisi ne olursa olsun 2 ve üstü değerler zorunlu incelemeye girsin.
- **Kalite örneklemi:** Toplu onay açıldığında örneklem başlangıçta **%10 olsun, ama ziyaret başına en az 20 ağaç**. Aynı mevsimde art arda iki ziyarette örneklem uyumu %90'ı geçerse %5'e insin.
- **Durdurma kuralı:** Örneklemde uyum %85'in altına düşerse o ziyaretin toplu onayı iptal edilsin ve kalan ağaçlar tek tek incelemeye gitsin. Bu eşik MVP başarı ölçütündeki "gözlem uyumu %85" ile aynı.
- **İlk mevsimler:** Her mevsimin **ilk ziyaretinde** toplu onay kapalı kalsın (v0.1'deki gibi). Sebep: Her mevsimin görüntüsü farklıdır ve AI'ın o mevsimdeki başarısı bilinmez.
- **Güven:** orta. Sayılar istatistiksel bir hesaba değil, ihtiyatlı bir başlangıç tercihine dayanıyor.
- **Uzmana soru:** "Bir ziyarette AI ile ne kadar uyuşmazlık görürseniz o ziyaretteki AI önerilerine güvenmezsiniz?"

### 1.9 Kapsama eşiği (bölüm 10) — Kısmen değiştir

- **Periyodik ziyaret:** %95 **kabul**.
- **Envanter:** **%98**. Gerekçe: Envanterde kaçırılan ağaç sonraki bütün ziyaretlere eksik olarak taşınır. MVP de bunu bir risk olarak yazıyor.
- **Fidanlar:** Ayrı raporlansın. Envanterde kapsanmayan her fidan ya da boş yer doğrulama turuna girsin.
- **Kör nokta:** Kural kabul. Ancak kuru tarımda ağaç aralığı çoğunlukla 7–10 m'dir ve 10×10 m'lik bir hücreye 1–2 ağaç düşer. "En az 2 kapsanmayan ağaç" kuralı geniş aralıklı bahçede kör noktayı hiç yakalamayabilir. Ağaç aralığı 8 m'yi aşıyorsa hücre 20×20 m olsun ya da kural "art arda 2 kapsanmayan ağaç" olsun.
- **Güven:** orta. Hücre boyutu önerisi için orta–düşük (pilot bahçelerin dikim aralığına bağlı).
- **Uzmana soru:** "Pilot bahçelerin sıra arası ve sıra üzeri dikim aralıkları ne kadar?"

### 1.10 Referans fotoğrafların seçimi (Ek A)

Bkz. bölüm 4.3.

---

## 2. Yeni ağaç alanları: dip sürgünü ve belirgin kuruma

### 2.1 Neden ayrı alan

Şu an iki bilgi doğrulama listesindeki "çok gövdeli" maddesine sıkıştırılmış. Üç ayrı kavram var ve karışmamaları gerekiyor:

| Kavram | Ne | Sabit mi | Önerilen yer |
| --- | --- | --- | --- |
| Çok gövdeli | Ağacın yapısı: dipten ya da yerden iki veya daha fazla kalın gövde | Sabit (yıllar içinde değişmez) | **Envanter alanı** `stem_form` (`single`, `multi`, `unsure`) |
| Dip sürgünü | Dipten ya da kök çevresinden çıkan ince, genç sürgünler | Değişir (temizlenir, yeniden çıkar) | **Ziyaret ölçümü** `basal_sprout_level` |
| Belirgin kuruma | Tacın kuruma **deseni** | Değişir | **Ziyaret ölçümü** `dieback_pattern` |

- **Gerekçe:** Çok gövdelilik genellikle eski bir dip sürgününün büyümesiyle ya da üst kısmı kuruyup dipten yeniden sürmüş bir ağaçtan oluşur. Ama bir kez oluştuktan sonra kalıcı bir yapıdır. Dip sürgünü ise bahçıvan temizledikçe kaybolur, sonra yeniden çıkar. Bunlar envanterde tek bir "sabit" bayrak olarak tutulursa sonraki ziyaretlerde yanlış kalır.
- `stem_form` istenen iki alanın dışında, ama "çok gövdeli" maddesini temizlemek için gerekli.
- **Güven:** yüksek.

### 2.2 Dip sürgünü — `basal_sprout_level`

**Türü:** Kategori (3 değer + değer girilmemesi). Bilgi ağacın sağlığını değil bakım durumunu gösterdiği için 0–3 ölçek gereksiz bir incelik olur.

| Değer | Kod | Görünür ölçüt |
| --- | --- | --- |
| Yok | `none` | Gövde dibinde ve tacın altındaki toprakta yeşil ya da odunsu ince sürgün yok. |
| Birkaç | `few` | 1–5 ince sürgün (kalem kalınlığında ya da daha ince), boyu yaklaşık diz hizasını geçmiyor. |
| Yoğun | `dense` | 5'ten fazla sürgün, ya da gövde dibini çevreleyen bir öbek, ya da boyu bel hizasını geçen ya da bilek kalınlığına ulaşmış sürgün. |
| (girilmedi) | — | Dip görünmüyor: ot, hortum, açı. Not yazılır. |

- **Ek bayrak:** Sürgün **aşı yerinin altından** mı çıkıyor? Uzman yakın plandan karar verirse notta yazar. Aşı altından çıkan sürgün anaç sürgünüdür. Bırakılırsa zamanla aşısız ikinci bir gövdeye dönüşebilir.
- **Mevsim:**
  - En iyi zaman **hasat ziyareti** (Eylül–Ekim): Sürgünler yapraklı ve otlar kurumuş ya da biçilmiş.
  - **Kış** ve **envanter**: Otlar kısa ve dip görünür, ama yapraksız ince sürgünler panoramada zor seçilir. Yakın plan sorusuyla desteklenmeli.
  - İlkbahar ve yaz: Ot uzunsa dip çoğunlukla görünmez. İsteğe bağlı.
- **Kim değerlendirir:**
  - **Envanter:** Ofis kişisi panoramadan ilk işareti koyar. Bu işaret ağacın sabit özelliği değil, **envanter ziyaretinin ölçümü** olarak kaydedilir. Kaynak sorunu için bkz. bölüm 5.
  - **Periyodik ziyaret:** AI panoramadan önerir. Personel yakın planda "Gövdenin dibinden ya da topraktan çıkan ince dallar var mı? Birkaç mı, çok mu?" sorusunu cevaplar. Uzman karar verir.
- **Genel sınıfa etkisi:** Yok. Dip sürgünü sağlık değil bakım göstergesidir. Karnede **bakım uyumu** satırına girer ("yoğun dip sürgünlü ağaç: 14").
- **Sahibe dil (örnek):** "14 ağacın dibinde yoğun dip sürgünü görüldü. Dip sürgünleri ağacın su ve besinini paylaşır. Bahçıvanınızla temizlenmesini konuşabilirsiniz." Uzman isterse öneriye ekler: "Aşı yerinin altından çıkan sürgünler kökten temizlenmeli."
- **Bulgu:** `basal_sprouts`, düşük önem, çoğunlukla bölge ya da parsel düzeyinde tek bulgu.
- **Güven:** orta. Sayı sınırları (5, diz, bel) için düşük–orta.
- **Uzmana soru:** "Dip sürgününü kaç değerle izlemek size yeter? Pilot bahçelerde anaç sürgünü (aşı altı) ile aşı üstü sürgün ayrımı sahibe ayrıca söylenmeli mi?"

### 2.3 Belirgin kuruma — `dieback_pattern`

**Türü:** Kategori. Bu alan kurumanın **ne kadar** olduğunu değil **nasıl** dağıldığını söyler. Miktar `dead_branch_scale`'de kalır.

| Değer | Kod | Görünür ölçüt | Uzman için anlamı (sahibe teşhis olarak söylenmez) |
| --- | --- | --- | --- |
| Desen yok | `none` | Kuru dal yok ya da dağınık, belirli bir düzeni yok. | — |
| Uçlardan geriye | `tip_dieback` | Birçok dalda kuruma uçtan başlıyor ve geriye doğru ilerliyor. Dalın ucu kuru, dibi canlı. | Kuraklık, zararlı ya da genel zayıflık olabilir. |
| Tek taraflı | `one_sided` | Tacın bir yönü ya da bir ana kol tümüyle kurumuş, diğer taraf canlı. | Gövde, kök ya da o kola ait bir sorun olabilir. |
| Tepeden aşağı | `top_down` | Tacın üst kısmı kuru ya da seyrek, alt kısım canlı. Kuruma genel. | Kök ya da su sorunu, yaşlılık olabilir. |
| Üstü kuru, dibi canlı | `top_dead_base_alive` | Aşılı taç ve gövdenin üstü tümüyle kuru, dipten canlı sürgün çıkıyor. | Aşı üstü ölmüş, anaç canlı. Yeniden aşılama mümkün olabilir. |

**Ek bayrak — `dried_leaves_attached` (evet / hayır):** Yapraklı dönemde (Mayıs–Eylül) kurumuş, kahverengi yapraklar dökülmeden dalda asılı duruyor. Bu, **ani kuruma** belirtisidir: Ağaç ya da dal kısa sürede su alamaz olmuştur. Ayrı bir alan olmasının sebebi şudur: Bu bulgu desenden bağımsız olarak yüksek önemlidir ve kaçırılmamalıdır.

**`dead_branch_scale` ve ağaç durumuyla sınır (çakışmama kuralı):**

| Soru | Hangi alan cevaplar |
| --- | --- |
| Tacın ne kadarı kuru? | `dead_branch_scale` (0–3) |
| Kuruma nasıl dağılmış? | `dieback_pattern` (sadece `dead_branch_scale ≥ 1` iken girilir; 0 ise otomatik `none`) |
| Ağaç bütünüyle ölü mü? | Genel sınıf **Kuru** (aşılı kısımda canlı sürgün ya da yaprak yok). Bu durumda `dead_branch_scale` girilmez, `dieback_pattern` sadece `top_dead_base_alive` olabilir. |
| Ağaç yerinde mi? | Genel sınıf **Yok** ve ağaç durumu **kayıp**. Bu durumda hiçbir ölçek girilmez. |

**Kuru sınıfı kuralında açıklık (öneri):** Bölüm 5'teki "canlı sürgün ya da yaprak yok" ifadesi şöyle olsun: "**Aşılı kısımda** (taçta ve gövdede) canlı sürgün ya da yaprak yok. Dipten ya da anaçtan çıkan sürgünler ağacı canlı saymaz." Bu durumda desen `top_dead_base_alive` olur ve `regraft_candidate` bilgi bulgusu yazılabilir. Gerekçe: Sahip için verim veren ağaç ölmüştür. Ama sökülmemesi ve yeniden aşılanabileceği bilgisi değerlidir.

**Genel sınıfa etkisi (öneri):**
- `one_sided` ya da `top_down` → en az **Dikkat**.
- `dried_leaves_attached = evet` → en az **Sorunlu**.
- `tip_dieback` → tek başına sınıfı değiştirmez, `dead_branch_scale` belirler.

**Mevsim ve kim:**
- En güvenilir mevsimler **yaz** ve **hasat**: Yaprak var, kontrast yüksek. İlkbaharda da girilebilir.
- **Kış:** Sadece uzman, yakın plan kanıtıyla girer. AI kışın bu alanı önermez.
- **Envanter:** Ofis kişisi açık desen gördüğünde işaretler (envanter ziyaretinin ölçümü). Bu ağaçlar doğrulama listesine girer.
- **Personel soruları:** "Ağacın bir tarafı ya da kalın bir kolu tamamen kurumuş mu?" ve (yapraklı dönemde) "Dallarda kurumuş, kahverengi yapraklar asılı mı?"
- **Türü:** Ziyaret ölçümü.

**Sahibe dil (örnek):**
- `one_sided`: "S5-12: Ağacın kuzey tarafındaki kalın kol tamamen kurumuş. Diğer taraf canlı."
- `top_dead_base_alive`: "S7-03: Ağacın aşılı kısmı kurumuş, dipten canlı sürgün çıkıyor. Ağacı sökmeden önce yeniden aşılama yapılıp yapılamayacağını uzmana ya da bahçıvanınıza sorabilirsiniz."
- `dried_leaves_attached`: "S2-08: Dallarda dökülmemiş kuru yapraklar var. Bu, ağacın kısa sürede kuruduğunu gösteren bir belirtidir. Yakından baktırmanızı öneririz." (yüksek önem)

**Kod adları:** `dieback_pattern` (kategori: `none`, `tip_dieback`, `one_sided`, `top_down`, `top_dead_base_alive`) · `dried_leaves_attached` (evet/hayır) · `basal_sprout_level` (kategori: `none`, `few`, `dense`) · `stem_form` (envanter: `single`, `multi`, `unsure`).

- **Güven:** Kavram ayrımı için orta–yüksek. Desen kategorilerinin sahada tutarlı ayırt edilmesi için orta. `top_dead_base_alive` ağacına Kuru deme kararı için **orta–düşük** (bu bir politika kararıdır).
- **Uzmana soru:** "Aşılı kısmı kurumuş ama dipten canlı ağaca sahibe 'kuru' mu dersiniz, 'sorunlu' mu? Bu desen kategorileri uzaktan ön değerlendirme için size yeterli bilgi veriyor mu? 'Dalda asılı kuru yaprak' görüldüğünde ne kadar hızlı haber verilmeli?"

---

## 3. Envanter raporu içeriği

**Genel kurallar:**
- Rapor **bir sayım ve harita raporudur**. Sağlık sınıfı ve genel skor içermez, çünkü metodolojiye göre envanterde sağlık ölçeği girilmez. Ama envanterde göze çarpan durumlar "ilk gözlem" olarak **sayı halinde** verilir (bkz. bölüm 3.7).
- Dil sade olmalı. "Yer", "ağaç", "boş yer" gibi kelimeler ilk geçtikleri yerde bir cümleyle tanımlanmalı.
- Rapor uzman imzalı olmalı. Sınır onayı beklemedeyse rapor **"Taslak — sınır onayınızı bekliyor"** başlığını taşır.
- Teşhis yok. Her ifade "görüldü" ya da "sayıldı" kalıbıyla yazılır.
- **Güven:** Bölüm yapısı için orta–yüksek. Uyarı eşikleri için orta.

| # | Bölüm | Ne gösterilir | Sayılar | Uyarılar |
| --- | --- | --- | --- | --- |
| 1 | **Kapak** | Parsel adı, il/ilçe/köy, envanter tarihi, uzman adı ve imza tarihi, metodoloji sürümü | — | Sınır ibaresi: "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği kullanım sınırıdır; tapu sınırı değildir." |
| 2 | **Kısa özet** | 3–5 cümle. Örnek: "Bahçenizde 312 yer saydık. 287'sinde ağaç var, 21'i boş, 4 ağaç sıraların arasında. Sizin tahmininiz 300 ağaçtı." | Yer, ağaç, boş yer, sıra arası ağaç; beyan edilen tahmin ile fark | Fark %10'u geçerse: "Sayım tahmininizden belirgin farklı. Haritaya bakıp eksik ya da fazla gördüğünüz bir bölge varsa bize yazın." |
| 3 | **Kullanım sınırı** | Harita üstünde sınır çizgisi; köşe işaretleri; sınır işaretlerinin fotoğrafları (taş, çit, duvar, yol) | Alan (dönüm ve m²); beyan edilen alan ile fark | Sınır onaylanmadıysa onay düğmesi. Alan farkı %10'u geçerse not. Sınırı sahadaki kişi göstermediyse (telefonla gösterildiyse) not. |
| 4 | **Ağaç haritası ve kodlar** | Her yerin koduyla harita; kodun nasıl okunduğu ("S5-12 = 5. sıranın 12. yeri"); başlangıç köşesi ve sıra yönü oku | — | "Kodlar bundan sonraki bütün raporlarda aynı kalır. Bahçıvanınızla konuşurken kodu kullanabilirsiniz." |
| 5 | **Boş yerler** | Haritada boş yerler ayrı işaretle; kümelendikleri bölgeler | Boş yer sayısı ve yerlere oranı | Boş yer oranı %10'u geçerse: "Bahçede kayda değer sayıda boş yer var. Yeniden dikim isterseniz uzmanımız uygun yerleri gösterebilir." (uzman görüşü) |
| 6 | **Bahçe yapısı** | Büyüklük sınıfı dağılımı (fidan, genç, verimli, yaşlı, belirsiz); aşılı, aşısız, belirsiz; çok gövdeli ağaçlar; beyan edilen çeşitler | Sınıf başına ağaç sayısı ve yüzdesi; aşısız ağaç sayısı | Aşısız ağaç varsa: "N ağaç aşısız görünüyor. Aşısız ağaçlar fıstık vermez; aşılatmak isteyip istemediğinizi düşünebilirsiniz." Cinsiyet için sabit not: "Erkek ve dişi ağaçları ilkbahar ziyaretinde çiçeklerden belirleyeceğiz." |
| 7 | **İlk gözlemler** | Envanterde göze çarpan durumlar; harita filtresiyle | Kuru görünen ağaç; belirgin kuruma deseni görülen ağaç; yoğun dip sürgünlü ağaç; gövdesinde görünür yara olan ağaç | Her satırda: "Bu bir sağlık değerlendirmesi değildir; ilk sayımda görüleni gösterir. İlk periyodik ziyarette yeniden bakılacak." Kışın kuru görünen ağaçlar için: "ilkbaharda doğrulanacak". |
| 8 | **Altyapı** | Kuyu, havuz, damla sulama hattı, çit, kapı, kulübe; harita üstünde | Her öğe için sayı ya da uzunluk | — |
| 9 | **Denetim güveni** | Bu raporun ne kadar veriye dayandığı | Kapsama oranı; panorama sayısı; doğrulama turunda yerinde bakılan ağaç sayısı; belirsiz kalan ağaç sayısı | Kapsama eşiğin altındaysa ve uzman kabul ettiyse gerekçesi. Belirsiz kalan ağaç varsa: "N ağacı görüntüden kesin belirleyemedik; ilk ziyarette yerinde bakılacak." |
| 10 | **Sırada ne var** | Sonraki ziyaret türü ve tarihi; o ziyarette nelere bakılacağı | — | — |
| 11 | **Sizden beklenenler** | Sınır onayı; sayıya itiraz ya da soru | — | "Haritada yanlış gördüğünüz bir yer varsa o ağaca dokunup soru bırakın." |

- **Sahibe gösterilmeyecekler:** Personel kimliği (kısa kod dışında), AI önerileri, ofis tıklama süreleri, ham kalite skorları.
- **Uzmana soru:** "Envanter raporunda 'kuru görünen' ağaç sayısını vermek doğru mu, yoksa ilk sağlık ziyaretine mi bırakalım? Aşısız ağaçlar için aşılatma önerisi sahibe envanterde mi söylenmeli?"

---

## 4. "Böyle çek" referans görselleri ve ölçek referans fotoğrafları

### 4.1 Ortak çizim şablonu

Her "böyle çek" görseli iki panelden oluşur. Telefonda dikey ekran, panel başına yaklaşık 360×300 birim.

**Panel A — Yandan görünüş (nereden çekilir):**
- **Zemin çizgisi:** Panelin altından 40 birim yukarıda yatay bir çizgi.
- **Ağaç silüeti:** Sağda. Gövde dikdörtgen, taç yuvarlak ya da düzensiz bir bulut. Kış sahnelerinde yapraksız dal çizgileri. Ölçek: 1 m = 30 birim (5 m'lik ağaç = 150 birim).
- **İnsan figürü:** Solda, çubuk adam, boy 1,7 m (51 birim). Kolu ileride, elinde telefon (küçük dikdörtgen).
- **Telefon yüksekliği:** Telefondan zemine kesik dikey çizgi ve etiket ("diz hizası", "göğüs hizası" gibi).
- **Mesafe oku:** İnsan ile gövde arasında çift uçlu yatay ok ve etiket ("1–1,5 m" gibi).
- **Bakış konisi:** Telefondan çıkan iki ince çizgi, kadrajın üst ve alt sınırını gösterir.
- **Güneş:** Kış ve gövde çekimlerinde insanın **arkasında** küçük bir güneş simgesi ("güneş arkanızda").

**Panel B — Ekranda ne görünür (kadraj):**
- Telefon ekranı çerçevesi (dikey dikdörtgen, oran 9:16 ya da 3:4).
- İçinde kadrajın sade bir çizimi.
- **Yeşil onay işaretiyle** "olmalı" öğeleri; ok ile işaretlenir.
- Altında küçük bir **kırmızı çarpılı** "yanlış" kadraj küçük resmi: sık yapılan hata.

**Renkler (öneri):** Gövde koyu kahve, kuru dal gri, canlı yaprak yeşil, toprak açık kahve, ok ve etiketler koyu gri, doğru yeşil, yanlış kırmızı. Koyu tema için ağaç rengi açılmalı.

### 4.2 Çekim tarifleri

Aşağıdaki her satır bir SVG'ye dönüşür. "Mesafe" ağacın gövdesine olan uzaklıktır.

#### Tüm mevsimler — T: Taç (ağacın tamamı)

- **Mesafe:** 6–8 m. Kural: Tacın genişliğinin yaklaşık 1,5 katı geri çekil. Fidan ve genç ağaçta 3–4 m.
- **Yükseklik ve bakış:** Göz hizası, telefon yere paralel. Dikey tutuş. Taç çok genişse yatay.
- **Nereye bakarak:** Ağacın güney tarafından kuzeye; güneş arkada.
- **Kadrajda olmalı:** Ağacın en tepesi ve gövdenin dibi (zemin görünmeli). Üstte ve altta küçük bir boşluk. Ağaç ortada.
- **Olmamalı:** Önde başka bir ağacın dalı. Kesik tepe. Karşıdan gelen güneş (siluet).
- **Sık hata:** Fazla yakından çekmek; tepe ve kenarlar kesilir. Zoom kullanmak (bulanıklaşır).
- **Şema notu:** Panel A'da mesafe oku "6–8 m"; bakış konisi ağacın tepesinin biraz üstünden zemine kadar. Panel B'de ağacın tamamı; yanlış küçük resimde tepesi kesik ağaç.

#### Kış — K2: Gövde ve dip

- **Mesafe:** 1–1,5 m.
- **Yükseklik ve bakış:** Telefon **diz ile bel arası** (yerden 50–80 cm). Hafifçe aşağı eğik. Dikey tutuş.
- **Nereye bakarak:** Gövdenin güney yüzü. Ot gövdeyi kapatıyorsa önce elle ya da ayakla ot ayrılır.
- **Kadrajda olmalı:** Gövdenin toprağa girdiği yer (kök boğazı) ve çevresindeki yaklaşık yarım metre toprak. Yukarıda gövdenin ilk çatallandığı yer. Dip sürgünleri varsa görünmeli.
- **Olmamalı:** Personelin ayakları, gölgesi, sulama hortumu, ot.
- **Sık hata:** Ayakta göz hizasından çekmek: kök boğazı görünmez ve gövde kısa ve kesik çıkar.
- **Şema notu:** Panel A'da insan çömelmiş ya da eğilmiş, telefon diz hizasında, etiket "diz hizası". Panel B'de gövde dikey ortada, alt kenarda toprak, üst kenarda çatal; oklar "kök boğazı" ve "dip sürgünü". Yanlış küçük resimde tepeden bakılmış, dibi otla kapalı gövde.

#### Kış — K3: Yara, oyuk, zamk ya da dal ucu (yakın)

- **Mesafe:** 30–50 cm.
- **Yükseklik ve bakış:** Yaranın hizasında, yüzeye **dik**.
- **Kadrajda olmalı:** Yara kadrajın ortasında ve kenarlarından sağlam kabuk görünüyor. **Ölçek için bir el ya da parmak** yaranın yanında. Yara yoksa bir dal ucu ve tomurcukları.
- **Olmamalı:** Flaş parlaması, arka plandan odaklanma.
- **Sık hata:** Ölçek koymamak (yaranın büyüklüğü anlaşılmaz). Çok yakından çekmek (telefon odaklayamaz).
- **Şema notu:** Panel A'da insan gövdenin önünde, telefon yara hizasında, mesafe "30–50 cm". Panel B'de kabuk dokusu, ortada koyu bir yara, yanında açık el silüeti.

#### Kış — K4: Kuru şüphesi, dal ucu testi (sadece istenirse)

- **Mesafe:** 20–30 cm.
- **Kadrajda olmalı:** Kalem kalınlığında bir dal; kabuğu 1 cm kazınmış yer ortada; yanında başparmak. Üç farklı yönden üç dal için üç fotoğraf.
- **Olmamalı:** Kazınan yerin parmakla kapatılması.
- **Sık hata:** Kalın dalı kazımak (canlı da olsa kabuk altı rengi zor görülür). Hep aynı yönden dal seçmek.
- **Şema notu:** Panel B'de yakından bir dal, ortada kazınmış açık şerit, iki küçük renk örneği: "yeşil = canlı", "kahverengi = kuru".

#### İlkbahar — İ2: Çiçek ya da sürgün salkımı

- **Mesafe:** 20–30 cm.
- **Yükseklik ve bakış:** Salkımın hizasında. Uzanılabilen en iyi salkım, ideal olarak göğüs hizası. Salkıma yandan bakılır.
- **Kadrajda olmalı:** Tek bir salkım bütünüyle; bağlı olduğu dal parçası. Mümkünse arkada düz bir zemin: avuç içi ya da açık renkli bir kart.
- **Olmamalı:** Birçok salkımın karışık arka planı; gökyüzüne karşı çekim (salkım karanlık çıkar).
- **Sık hata:** Gökyüzüne doğru çekmek; arkadaki dallara odaklanmak.
- **Şema notu:** Panel A'da insan bir eliyle salkımın arkasına avuç tutuyor, öbür eliyle çekiyor. Panel B'de salkım ortada, arkasında el silüeti.

#### İlkbahar — İ3 ve Yaz — Y3: Yaprak

- **Mesafe:** 20–30 cm.
- **Kadrajda olmalı:** Bir bileşik yaprağın tamamı (bütün yaprakçıklarıyla). Yazın iki fotoğraf: **üst yüz** ve yaprak çevrilerek **alt yüz**. Yapışkanlık ya da pul varsa ortada.
- **Olmamalı:** Yaprağın koparılması (dalda çekilir); flaş.
- **Sık hata:** Sadece üst yüzü çekmek (psilla belirtileri çoğunlukla alt yüzde ve yaprak ucunda). Yere düşmüş yaprağı çekmek.
- **Şema notu:** Panel B'de iki küçük ekran yan yana, "üst yüz" ve "alt yüz"; alt yüzde beyaz noktalar.

#### Yaz — Y2: Meyve salkımı

- **Mesafe:** 30 cm.
- **Yükseklik ve bakış:** Salkım hizası. Tacın **dış kısmından** ve güney yönünden bir salkım.
- **Kadrajda olmalı:** Tek salkımın tamamı ve sapı. Meyvelerin yüzeyi net olmalı (emgi lekesi için).
- **Olmamalı:** Elle tutup sıkmak, koparmak.
- **Sık hata:** En dolgun salkımı seçmek. Örnek temsilî olmaz; uygulama "aklına gelen ilk salkımı çek" demeli.
- **Şema notu:** Panel B'de salkım ortada; meyve yüzeyine yönelen bir ok "lekeleri görebilmeliyiz".

#### Hasat — H2: Kırık dal

- **Mesafe:** 1–2 m.
- **Kadrajda olmalı:** Kırık yer ve dalın gövdeye ya da ana kola bağlandığı nokta aynı karede. Kırık yerin kendisi ikinci bir 30 cm'lik yakın çekimle.
- **Olmamalı:** Sadece yerdeki kopuk dalın fotoğrafı (hangi ağaçtan olduğu anlaşılmaz).
- **Sık hata:** Kırık yeri yakın çekip bağlantıyı göstermemek.
- **Şema notu:** Panel A'da ağaç ve sarkık bir kol; telefon göğüs hizasında. Panel B'de kırık nokta ve gövde aynı kadrajda.

#### Hasat — H3: Ağaç altı

- **Mesafe:** Gövdeden 2–3 m.
- **Yükseklik ve bakış:** Göğüs hizası, telefon yaklaşık 45° aşağı eğik.
- **Kadrajda olmalı:** Tacın altındaki toprak alanı ve gövde dibi. Tacın gölgesinin düştüğü alanın çoğu.
- **Olmamalı:** Gökyüzü; personelin ayakları.
- **Sık hata:** Telefonu yere paralel tutmak: kadrajın yarısı gökyüzü olur.
- **Şema notu:** Panel A'da bakış konisi 45° aşağı, zemin üstünde taç izdüşümü kesik çizgiyle. Panel B'de kahverengi zemin, ortada gövde dibi, dağınık yaprak ve sap çizgileri.

- **Güven (bütün tarifler):** orta–yüksek. Mesafeler genel fotoğraf pratiğine dayanıyor ve pilot ilk denemelerinde ayarlanabilir.
- **Uzmana soru:** "Gövde ve dip çekimini hep aynı (güney) yüzden mi istersiniz, yoksa yaranın olduğu yüzden mi? Yakın planlarda ölçek için el yeterli mi, yoksa personele basılı bir ölçü kartı mı verilsin?"

### 4.3 Ölçek referans fotoğraflarının seçim ölçütleri (Ek A)

1. **Her ölçek değeri için üç fotoğraf:** Bir **tipik** örnek ve **iki sınır** örneği (alt sınır ve üst sınır). Örnek: Kuru dal 2 için "açıkça 2", "1'e yakın 2" ve "3'e yakın 2". Sınır örnekleri tutarlılığı tipik örnekten daha çok artırır.
2. **Çift kaynak:** Her referans için aynı ağacın hem **panorama kesiti** hem **yakın planı**. Uzman paneli kesitle, personel yakın planla çalışır.
3. **Bağımsız onay:** Bir fotoğraf ancak uzman ve ikinci bir değerlendirici (ikinci uzman ya da sertifikalı eğitmen) birbirini görmeden aynı değeri verdiyse referans olur. Anlaşmazlık olan fotoğraf "sınır vakası" eğitim setine girer.
4. **Benzer koşullar:**
   - Öğle saatleri (10:00–15:00), açık ya da hafif bulutlu hava.
   - Güneş arkadan.
   - Yaprak dönemi ölçekleri için mevsimin ortası.
5. **Temsil:**
   - Ağırlıklı olarak **verimli** büyüklük sınıfından ağaçlar.
   - Taç doluluğu ve kuru dal için ayrıca bir genç ve bir yaşlı ağaç örneği.
   - Kıraç ve sulu bahçeden en az birer örnek.
   - Mümkünse en az iki çeşitten örnek.
6. **"Bu değil" örnekleri:** Her ölçek için sık karışan bir durumun fotoğrafı:
   - Kuru dal: budama kesik uçları; gölgede kalan iç dal; arka sıradaki ağacın dalları.
   - Gövde: eski, kapanmış budama yarası; çamur lekesi.
   - Don: göz kurdu ile kurumuş sürgün (uzman ayırt ettiyse).
   - Taç doluluğu: kış ziyaretinden kalan yapraksız görünüm.
7. **İşaretleme:** Her referans fotoğrafında değeri belirleyen öğe bir halka ya da okla işaretlenir. İşaretsiz bir kopya da saklanır (AI ve eğitim için).
8. **Kayıt bilgileri:** Tarih, mevsim, parsel (sahibin kimliği olmadan), ağaç kodu, büyüklük sınıfı, çeşit (beyan), sulu/kıraç, değer, onaylayanlar, metodoloji sürümü.
9. **Gizlilik ve izin:**
   - Fotoğraflarda kişi, plaka ya da tanınabilir bir yapı olmamalı.
   - Sahipten fotoğrafın eğitim materyali olarak kullanılması için açık izin alınmalı (KVKK aydınlatma metnine eklenmeli).
   - Uzmanın arşivinden gelen fotoğraflar için yazılı kullanım izni alınmalı.
10. **Yenileme:** Her mevsim sonunda, uzmanın en çok düzeltme yaptığı ölçek değerleri için referanslar gözden geçirilir. Bir referans değişirse metodoloji sürümü artar.

- **Güven:** orta–yüksek. Bu ölçütler genel değerlendirme tutarlılığı pratiğine dayanıyor, fıstığa özgü bir dayanağı yok.
- **Uzmana soru:** "Arşivinizde Ek A'daki ölçek değerleri için kullanılabilecek fotoğraf var mı? İkinci değerlendirici olarak kimi önerirsiniz?"

---

## 5. Belgelerdeki çelişkiler ve eksikler

Önem sırasıyla, en önemlisi başta.

1. **Tarama yöntemi: yürüyüş mü, motosiklet mi?** Görev tanımı ve MVP Modül 2 (adım 3 ve süre tablosu) "motosikletle" diyor. MVP Modül 3 ise "Yavaş yürüyüş" ve donanım bölümü "MVP'de tarama yürüyerek yapılır" diyor; kit "sırt çantası direği" olarak tarif ediliyor. Kamera yüksekliği ağaç var/yok sinyalinin kutularını (yerden 2,5–4 m) ve kesit karşılaştırılabilirliğini doğrudan etkiler. Parsel başına sabit tutulması gereken bu değer belgelerde tanımlı değil. **Karar gerekli; kamera yüksekliği metodolojiye bir sayı olarak yazılmalı.**

2. **Envanterde sağlık ölçeği girilmez, ama "dip sürgünü ve belirgin kuruma" envanterde işaretlenir.** Metodoloji bölüm 2 ile MVP Modül 2 adım 6 çelişiyor. Önerim (bölüm 2): Bunlar ağacın sabit özelliği değil, envanter ziyaretinin ölçümleri olsun. Sağlık **sınıfı** verilmesin ama bu ölçümler kaydedilsin.

3. **Ofis kişisinin kaynağı tanımsız.** Bölüm 6'daki kaynaklar `staff`, `algorithm`, `ai`, `expert`. Envanterde yaş, aşı, dip sürgünü ve kuruma işaretlerini koyan ofis kişisi bunlardan hangisi? Personel kaynağı sahadan gelen gözlem anlamında kullanılıyor. Ya `office` diye yeni bir kaynak açılmalı ya da açıkça `staff` (ofis rolü) olarak tanımlanmalı.

4. **"Kımıl" adı yanlış** (bkz. 1.1 içinde 4.6). MVP Modül 3 ziyaret takviminde ilkbahar için "psilla ve kımıl belirtileri" yazıyor. Kokarca belirtisi ilkbaharda değil yazın görülür.

5. **Hasat ziyaretinin zamanı iki işi birden yapamıyor** (bkz. 4.8): Hırsızlık hasattan önce, hasadın tamamlanması hasattan sonra görülür.

6. **İlkbahar dönemi tutarsız:** Metodoloji Mart–Mayıs, MVP Nisan–Mayıs diyor. Gaziantep'te fıstık çoğu yıl Mart'ta henüz uyanmamış olur. Öneri: İlkbahar ziyaretinin hedef aralığı **Nisan ortası–Mayıs ortası** olsun, Mart ziyareti kış ölçekleriyle değerlendirilsin. (güven: orta)

7. **"Yapraklı dönem" tanımı dar.** Bölüm 2 yalnız ilkbahar ve yazı yapraklı sayıyor. Ağaçlar Ağustos–Ekim arasında da yapraklıdır; Kuru kararı ve taç doluluğu hasat ziyaretinde de kullanılabilir. Öte yandan Nisan başında ağaç henüz yapraklanmamış olabilir. Öneri: Yapraklı dönem **ay olarak** tanımlansın: Mayıs–Eylül kesin, Nisan ve Ekim "kısmi". `tree_visible` yapraksız dönemi de (Kasım–Mart) aynı tanımla uyumlu olsun. Kıraç bahçede yaz sonu erken yaprak dökümü Kuru kararını yanıltabilir; bu da not edilmeli.

8. **"Uzman > model > AI" önceliğinde "model" tanımsız.** Kaynak tablosunda "model" diye bir kaynak yok. Muhtemelen `algorithm` kastediliyor. Düzeltilmeli.

9. **Erkek ağaçlar ve meyve yükü:** Erkek ağaç hiç meyve vermez. Meyve yükü dağılımına ve "yazın salkımı olan dişidir" kuralının tersine (salkımı olmayan erkektir) katılmamalı. Yok yılında dişi ağaç da salkımsız olabilir. Bölüm 3'e "salkım olmaması erkek olduğunu göstermez" diye yazılmalı.

10. **Cinsiyet ölçütü belirsiz:** "Erkek çiçek salkımları daha iri ve sık" ölçütü personel için yeterince kesin değil. Polen tozu ve salkım rengi daha güvenilir ayırt edicilerdir (bkz. 1.5). Erkek ağaçlar dişilerden biraz önce çiçek açabilir; ziyaret penceresi dar.

11. **Önceki yılla meyve yükü karşılaştırması periyodisite yüzünden yanıltıcı** (bkz. 4.7).

12. **Hafif zararlı belirtisi yazın parseli Dikkat'e boyar** (bkz. 1.1 içinde 4.6 c).

13. **Don olayına bağlı ziyaret yok.** Sabit takvim, en önemli ilkbahar riskini kaçırabilir. Öneri: Sahip ya da bölgeden don haberi gelirse 3–10 gün içinde sadece taç ve salkım odaklı kısa bir ek ziyaret yapılsın. MVP'de elle tetiklenebilir.

14. **10×10 m hücre, geniş aralıklı bahçede gürültülü** (bkz. 1.9). Isı haritası ve tabakalı örneklem aynı hücreyi kullanıyor. 8–10 m aralıkta hücre başına 1–2 ağaç düşer; ısı haritası tek ağacın sınıfını gösterir hale gelir.

15. **Saha güvenliği ve ilaçlama:** Metodolojide personelin ilaçlama yapılmış bahçeye girme kuralı yok. Psilla ilaçlaması yazın sık yapılır. Ön kontrol listesine "Son birkaç günde ilaçlama yapıldı mı? Yapıldıysa ilacın etiketindeki bekleme süresi geçti mi?" sorusu eklenmeli. Köpek, yılan ve sıcak çarpması uyarısı eğitim konusu olmalı. (güven: yüksek; ayrıntı için uzman ve iş güvenliği görüşü)

16. **Yaş sınıfı = gerçek yaş değil** (bkz. 1.3). Yerinde aşılanmış yaşlı menengiç ve buttumlar Gaziantep bahçelerinin önemli bir kısmını oluşturabilir. Gövde çapı bu ağaçlarda yaşı abartır.

17. **Kazıma testi ve sahibin izni:** Önerilen kış kuru testi (1.4) ağaca küçük bir müdahaledir. Giriş izni beyanına (MVP Modül 1, adım 5) "canlılık kontrolü için küçük kabuk kazıması" eklenmeli.

18. **Budama "yapılmamış" sonucu bulgu olarak yanıltıcı olabilir** (bkz. 4.3, 1.6).

19. **Karne "Bakım uyumu" satırı** MVP'de "toprak işleme ve yabani ot durumu"nu içeriyor, metodolojide bu göstergeler yok (mvp-denetimi de not etmiş). Öneri: Yabani ot için kategori ölçüm `weed_cover` (az / orta / yoğun) eklensin, hasat ziyaretinde yangın riski için de kullanılsın. Toprak işleme panoramadan çoğunlukla görülebilir (sürülmüş / sürülmemiş). (güven: orta)

20. **Gövde ölçeğinin tanımı v1'de değişirse** (dip sürgünü çıkarsa), v0 ve v1 değerleri aynı kodla ama farklı anlamla kayıtlı olur. Ağaç karnesinde zaman çizelgesinde sürüm farkı gösterilmeli ya da kod değiştirilmeli (`trunk_collar_scale` gibi). Proje ilkesi "eski raporlar kendi sürümüyle kalır" olduğu için ikinci yol daha temiz olabilir.

---

## 6. Gerçek uzmana sorulacak soruların toplu listesi

İsteğe bağlı: pilot uzmanla görüşülürse, öncelik sırasıyla:

1. Pilot bahçelerin dikim aralıkları, ağaç yaşları, aşı yüksekliği ve anaçları (menengiç, buttum, P. khinjuk) neler? Yerinde aşılanmış yaşlı anaçlar ne kadar yaygın?
2. Aşılı kısmı kurumuş ama dipten canlı ağaca sahibe "kuru" mu, "sorunlu" mu dersiniz?
3. Kış ortasında kazıma ve bükme testi fıstıkta canlılığı güvenilir gösterir mi? Kaç dal yeterli?
4. Tek bir ana kolun kuruması tek başına "belirgin" (2) mi? %10 ve %30 sınırlarını gözle ayırt edebiliyor musunuz?
5. Hafif psilla belirtisi ağaç sınıfını etkilemeli mi? Görüntüden fark edilebilen ve listede olmayan başka bir zararlı ya da hastalık belirtisi var mı?
6. Bölgede fıstık hırsızlığı hangi tarihlerde yoğunlaşıyor? Meşru hasat artığını hırsızlık izinden nasıl ayırırsınız?
7. Bu bahçelerde var ve yok yılı düzenli olarak birbirini izliyor mu?
8. Pilot bahçeler her yıl budanıyor mu? "Budanmamış" bir bulgu mu, yoksa sadece bilgi mi?
9. Erkek ve dişi çiçeği saha personeline en kolay nasıl ayırt ettirirsiniz? Kışın tomurcuk şeklinden cinsiyet anlaşılır mı?
10. Gaziantep'te fıstığın çiçek açma dönemi ile geç don riski ne sıklıkla çakışıyor? Don sonrası kaç gün içinde bakmak gerekir?
11. Kök boğazı sorunu (kabuk koyulaşması, zamklanma) pilot bahçelerde ne sıklıkla görülüyor? Sulu ve kıraç bahçede gövde ölçeği aynı mı kalsın?
12. Hangi bulgular raporu beklemeden bildirilmeli?
13. Yaz sonu kıraç bir bahçede "normal" taç nasıl görünür?
14. Sağlıklı, Dikkat ve Sorunlu ağaçlardan oluşan bir parsel için sahibe söyleyeceğiniz genel yargı ne olurdu? Önerilen skor bu yargıya yakın mı?
15. Bir ziyarette AI ile ne kadar uyuşmazlık görürseniz o ziyaretteki AI önerilerine güvenmezsiniz?
16. Envanter raporunda "kuru görünen" ağaç sayısı ve aşılatma önerisi verilmeli mi?
17. Arşivinizde referans olarak kullanılabilecek fotoğraf var mı? İkinci değerlendirici kim olabilir?
