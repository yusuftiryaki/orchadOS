# Denetim Metodolojisi

**Sürüm:** `methodology-v0.2` · 28 Ekim 2026 (uzman ajan kararı, nihai kabul edildi) · önceki: `methodology-v0.1` (27 Ekim 2026), `methodology-v0` (21 Ekim 2026)

Bu belge, orchadOS denetimlerinde bir ağacın ve bir parselin **nasıl değerlendirildiğini** tanımlar: hangi ziyarette neye bakılır, ölçekler ne anlama gelir, ağacın genel sınıfı nasıl çıkar, bulgular nasıl yazılır, sahibe ne gösterilir. Uzman (ziraat mühendisi), saha personeli eğitmeni ve operasyon aynı kuralları buradan okur.

Her ölçüm, değerlendirme ve rapor üretildiği metodoloji sürümünü taşır (veritabanında `methodology_version`). Kurallar değişince yeni sürüm açılır. Eski raporlar kendi sürümleriyle kalır ve yeniden hesaplanmaz.

> **Saha protokolleri `spring-v0.2` ve `summer-v0.3` (2 Kasım 2026, İP15):** İlkbahar ve yaz ziyaretlerine parsel sorusu "Bahçede yabani ot ne boyda?" eklendi (`weed_height`; bölüm 7). Cevap bakım uyumu satırına (bölüm 9) ve ot biçme hizmetinin önerisine ([MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme)) girer. Metodoloji sürümü değişmez; ölçekler, genel sınıf ve skor aynıdır.
>
> **v0.2 değişiklikleri (28 Ekim 2026):** "Kapsamlı" paketin yılda 6 periyodik ziyaretinin takvimi bir **uzman ajanla** (AI, ziraat mühendisi rolünde) kararlaştırıldı; kararı, gerekçesi, güveni ve pilot uzmana sorular [uzman-ajan-onerileri.md](uzman-ajan-onerileri.md) bölüm 7'de. İşletme talimatıyla ajanın kararları nihai kabul edildi; bir ziraat mühendisi tarafından doğrulanmadı. Bu sürüme girenler: **yeni ay–mevsim eşlemesi** (kış Kasım–Mart, ilkbahar Nisan–Mayıs, yaz Haziran–Ağustos, hasat Eylül–Ekim; bölüm 2) ve 6 ziyaretlik takvim; Mart sonu "uyanma" ziyareti kış, Ağustos başı "hasat öncesi" ziyareti yaz sayılır. Bu, İP7'deki "Mart ilkbahardır" kararından bilerek ayrılır. Ziyaret kuralları (ilaçlama sonrası giriş, hasat sürerken girilmez, yaz tarama saatleri, don, çamur, rüzgâr, ziyaretler arası en az 3 hafta; bölüm 2). Kayıtta mevsim genişletmeleri: hırsızlık izi, dal kırığı ve ağaç altı yığın yazın da; don hasarı kışın da (yalnız uzman). Yakın plan protokolü `winter-v0.2` (kuru testinde "dolgun ya da kabaran tomurcuk var mı?") ve `summer-v0.2` (erken boşaltılmış salkım sapı; parsel sorusu: tel ya da çitte yeni geçit). Ön kontrolde ilaçlama sorusu "etiketteki tekrar giriş süresi" diye, hasat ziyaretinde hasat ve çöpleme sorusu (bölüm 7). Ölçek tanımları, genel sınıf, karar zinciri ve skor v0.1 ile aynı. Yeni ziyaretler `methodology-v0.2` ile planlanır; `methodology-v0` ve `v0.1` ziyaretleri eski takvimle kalır, yani Mart ve Ağustos'taki eski bir ziyaretin mevsimi değişmez.
>
> **v0.1 değişiklikleri (27 Ekim 2026):** Gerçek uzman gelene kadar kararlar bir **uzman ajanla** (AI) verildi; öneriler, gerekçeleri, güvenleri ve pilot uzmanla görüşülürse sorulacak sorular [uzman-ajan-onerileri.md](uzman-ajan-onerileri.md)'de. Bu sürüme girenler: ölçeklerin görünür ölçütleri (4), büyüklük sınıfı eşikleri (3), dip sürgünü ve kuruma deseni (4.9–4.10), hafif zararlı belirtisinin sınıfı değiştirmemesi ve kışın kuru kanıt kuralı (5), %10 / en az 20 ağaçlık kalite örneklemi, toplu onay durdurma kuralı, mevsimin ilk ziyaretinde toplu onayın kapalı olması ve zor ölçeklerin zorunlu incelemesi (6), yakın plan çekimleri ve soruları (7), yeni bulgu türleri (8), skor kuralları (9), envanterde %98 kapsama ve geniş aralıklı bahçede 20×20 m kör nokta hücresi (10). Yeni ziyaretler `methodology-v0.1` ile planlanır; eski ziyaretler `methodology-v0` kurallarıyla kalır.
>
> **Kabul (27 Ekim 2026):** İşletme, uzman ajanın önerilerini pilot için yeterli buldu ve bu sürümü kabul etti. Öneriler **bir ziraat mühendisi tarafından doğrulanmadı**; kaynak ya da saha ölçümüne dayanmıyor. Pilotta uzmanın düzeltmeleri, AI ile uyum ölçümü ve sahiplerin geri bildirimi bu kuralları sınar; değişiklikler yeni bir sürümle (`methodology-v0.2` ya da `v1`) gelir. Referans fotoğrafların hiçbiri henüz yok; listesi [Ek A](#ek-a--hazırlanacak-referans-fotoğraflar)'da.

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
11. [Kararların durumu](#11-kararların-durumu)
- [Ek A – Hazırlanacak referans fotoğraflar](#ek-a--hazırlanacak-referans-fotoğraflar)
- [Ek B – Metrik kaydı karşılıkları](#ek-b--metrik-kaydı-karşılıkları)

## 1. İlkeler

1. **Kanıta dayanır.** Her sınıf ve her bulgu, ağacın o ziyaretteki görüntülerine bağlanır. Kanıtı olmayan bir sonuç rapora girmez.
2. **Görüneni söyler, teşhis koymaz.** Denetim "taçta %10–30 kuru dal var" der; "kök çürüklüğü var" demez. Teşhis ve ilaç önerisi uzmanın ayrıca yazdığı öneride, açıkça uzman görüşü olarak yer alır.
3. **Kaynaklar karışmaz.** Personel cevabı, AI önerisi ve uzman kararı ayrı kayıtlardır. Birinin üzerine yazılmaz. Sahip sadece uzmanın onayladığı sonucu görür.
4. **Belirsizlik saklanmaz.** Görüntüden karar verilemeyen bir şey "belirsiz" kalır. Tahminle doldurulmaz.
5. **Karşılaştırılabilir.** Rota parsel başına sabittir. Tarama üç yolla yapılabilir: yürüyerek (sırt direği), motosikletle ya da robotla; kamera yüksekliği ayarlanabilir. Bu yüzden yöntem ve ölçülen kamera yüksekliği her ziyarette ön kontrolde kaydedilir. Bir parselde mümkün olduğunca aynı yöntem ve yükseklik kullanılır; böylece bir ağacın bu kışki görüntüsü geçen kışkiyle yan yana konabilir. Farklıysa uzman paneli bunu gösterir (bölüm 11).
6. **Sınır iddiası yoktur.** Haritadaki sınır, sahibin gösterdiği fiili kullanım sınırıdır; tapu ya da mülkiyet sınırı değildir. Bu ibare her raporda yer alır.

## 2. Ziyaretler ve mevsimler

Ziyaretin mevsimi, taramanın yapıldığı aydan (UTC) ve ziyaretin metodoloji sürümünden çıkar. Hangi ölçeğin girileceğini mevsim belirler. Ziyaret satırında ayrı bir mevsim alanı yoktur; aynı kural üç yerde, aynı test vektörleriyle uygulanır (uzman paneli `apps/web/src/lib/expert/season.ts`, AI worker `methodology.py`, saha uygulaması `field_task.dart`; ortak vektörler `test-vectors/season.json`).

**v0.2 takvimi** (`methodology-v0.2` ile planlanan ziyaretler):

| Ay | Mevsim | Odak |
| --- | --- | --- |
| Kasım, Aralık, Ocak, Şubat, Mart | Kış | Budama, kuru dal, eksik ya da kesilmiş ağaç, gövde ve dip. Mart sonunda kabaran tomurcuk canlılığı gösterir |
| Nisan, Mayıs | İlkbahar | Çiçeklenme, don hasarı, cinsiyet, göz kurdu, karazenk, psilla 1. döl |
| Haziran, Temmuz, Ağustos | Yaz | Meyve yükü, psilla, kokarca, kuraklık; Ağustos başında hırsızlık ve yangın riski |
| Eylül, Ekim | Hasat | Hasadın tamamlanması, dal kırığı, hırsızlık karşılaştırması, dip sürgünü |

**Eski takvim** (`methodology-v0`, `v0.1` ve sürümü olmayan ziyaretler; değişmez): Aralık–Şubat kış, Mart–Mayıs ilkbahar, Haziran–Temmuz yaz, Ağustos–Ekim hasat, Kasım kış. Bilinmeyen bir sürüm de eski takvimle okunur. (v0.2'den önce saha uygulaması Kasım'ı hasat sayıyordu; uzman paneli ve AI kış. Bu tutarsızlık giderildi: Kasım her sürümde kıştır.)

**Paketlere göre ziyaretler** (v0.2, uzman ajan kararı; pencereler rakıma, çeşide ve yıla göre 1–2 hafta kayabilir):

| # | Ziyaret | Hedef | Pencere | Mevsim | Fenoloji | Ana amaç | Temel | Standart | Kapsamlı |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kış | Ocak | 15 Aralık–15 Şubat | Kış | Dinlenme | Budama başladı mı, kuru dal, gövde, eksik ya da kesilmiş ağaç | ✓ | ✓ | ✓ |
| 2 | Uyanma | Mart sonu | 10–31 Mart | Kış | Tomurcuk kabarması | Budamanın kesin sonucu, artıklar kaldırıldı mı, kışın "kuru" denen ağaçların doğrulanması (kabaran tomurcuk = canlı), dip sürgünü, toprak, ot ve sulama hattı bakımı | | | ✓ |
| 3 | İlkbahar | Nisan sonu | 15 Nisan–15 Mayıs | İlkbahar | Çiçek sonu, meyve tutumu | Don, cinsiyet, göz kurdu, karazenk, psilla 1. döl | | ✓ | ✓ |
| 4 | Yaz | Temmuz başı–ortası | 1–25 Temmuz | Yaz | Kabuk sertleşmiş | Meyve yükü, psilla piki, kokarca, kuraklık ve sulama | | ✓ | ✓ |
| 5 | Hasat öncesi | Ağustos başı | 1–20 Ağustos, hasat başlamadan | Yaz | İç dolumu tamam | Hırsızlık (erken boşaltılmış salkım, yeni tel geçidi), yangın riski (kuru ot), son meyve yükü | | | ✓ |
| 6 | Hasat sonrası | Ekim | 15 Eylül–31 Ekim, hasat bitiminden 3–21 gün sonra | Hasat | Hasat sonrası | Hasat tamam mı, dal kırığı, hırsızlık karşılaştırması (#5 ile), dip sürgünü | ✓ | ✓ | ✓ |

- Ziyaretin hangi takvim satırı olduğu şimdilik kaydedilmez; mevsim aydan çıkar. #2 ile #1, #5 ile #4 aynı mevsimdedir; skorun "aynı mevsimle trend" kuralı ve "mevsimin ilk ziyareti" kuralı mevsime göre çalışır (bölüm 6, 9). İleride `session.visit_slot` alanı açılabilir (bölüm 11).
- **Yapraklı dönem:** İlkbahar ve yaz. Taç doluluğu sadece bu dönemde ölçülür. Kuru kararı yapraklı dönemde daha güvenilirdir (bkz. [5](#5-genel-sınıf-kuralı)). v0.2'de Mart kış olduğundan yapraksız ağaçta taç doluluğu sorulmaz, budama girilebilir.
- **Don hasarı kışın, dal kırığı yazın:** Mart sonu ziyareti kabaran tomurcukta geç dona denk gelebilir; Ağustos başı ziyaretinde dal kırığı aranır. Kayıt (`metric_definition`) sürümsüz olduğu için uzman formu ve AI bu iki eklemeyi yalnız `methodology-v0.2` ziyaretlerinde, mevsimin olağan ölçeklerinden sonra gösterir; eski ziyaretlerin formu değişmez. Kışın donu yalnız uzman girer; AI kışın don önermez.
- **Envanter** ziyareti ayrı bir ziyaret türüdür. Hasat sonrası ya da kışın, otlar kısayken yapılır, çünkü uzun ot gövde diplerini kapatır. Envanterde sağlık ölçeği girilmez; sadece ağaç kimliği ve özellikleri çıkarılır.

**Ziyaret kuralları (v0.2):**

- **İlaçlama sonrası giriş:** İlacın etiketindeki tekrar giriş süresi geçmeden bahçeye girilmez. Süre bilinmiyorsa en az 48 saat beklenir. Yapraklar ıslaksa ya da ilaç kokusu varsa girilmez. Operasyon, ziyaretten 2 gün önce sahibe ilaçlama planını sorar. Saha personeli ön kontrolde onaylar (bölüm 7).
- **Hasat sürerken bahçeye girilmez.** #5 hasat öncesi ziyaretinde hasat başlamışsa ziyaret iptal edilir ve #6'ya katılır. #6 hasat bitiminden 3–21 gün sonra yapılır; ön kontrolde hasadın bittiği ve çöplemenin sürüp sürmediği sorulur.
- **Yaz tarama saatleri:** Sabah gün doğumundan 1 saat sonra ile 11.00 arası ya da akşamüstü 16.00 ile gün batımından 1 saat önce arası.
- **Don ve kırağı:** Don ya da kırağı kalkmadan tarama yapılmaz.
- **Çamur:** Çamurda motosikletle tarama yapılmaz.
- **Güvenlik:** Çizme zorunludur.
- **Ziyaretler arası:** Aynı parselde iki ziyaret arasında en az 3 hafta olur.
- **Rüzgâr:** Rüzgâr saatte yaklaşık 30 km'yi aşıyorsa yakın plan çekilmez.
- Şafakta, gün batımında, yağmurda ve yoğun tozda tarama yapılmaz (v0.1).

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
| Büyüklük sınıfı (kodda `age_class`) | Fidan · Genç · Verimli · Yaşlı · Belirsiz | Taç çapı ve gövde kalınlığına göre (aşağıdaki tablo). Gerçek yaş görüntüden bilinemez; yerinde aşılanmış yaşlı menengiç ya da buttumlarda gövde yaşı abartır |
| Aşı durumu | Aşılı · Aşısız · Belirsiz | Gövdede aşı yeri ya da aşı izi görülüyorsa aşılı. Sıra arasındaki ve dipten çıkan genç ağaçlar çoğunlukla aşısızdır |
| Gövde yapısı | Tek gövde · Çok gövdeli · Belirsiz | Dipten ya da yerden iki ya da daha fazla kalın gövde çıkıyorsa çok gövdeli. Sabit bir özelliktir; dip sürgünü (4.9) ayrı ve her ziyarette yeniden bakılır |
| Cinsiyet | Dişi · Erkek · Bilinmiyor | Kışın ayırt edilmez; envanterde "bilinmiyor" başlar. İlkbaharda çiçekten belirlenir: salkıma dokununca ele sarı polen tozu bulaşıyorsa erkektir (personel sorusu, bölüm 7). Yazın meyve salkımı olan dişidir; salkım olmaması erkek olduğunu göstermez (yok yılında dişi de salkımsız olabilir) |
| Çeşit | Kırmızı, Uzun, Siirt, … · boş | Sahibin beyanı. Denetim çeşidi görüntüden belirlemez |

Büyüklük sınıfı eşikleri (v0.1). Gövde çapı **aşı yerinin üstünde, yerden yaklaşık 50 cm'de** ölçülür (aşı yeri görünmüyorsa 50 cm'de):

| Sınıf | Gövde çapı | Taç çapı | Görünür ölçüt |
| --- | --- | --- | --- |
| Fidan | < 5 cm (bilekten ince) | < 1,5 m | Boy çoğunlukla insan boyundan kısa; destek kazığı, koruma kabı ya da torba; birkaç dal |
| Genç | 5–12 cm | 1,5–3 m | Boy insan boyu civarı; ana kollar bilek kalınlığında; tacın arkasından sıra görünüyor |
| Verimli | 12–35 cm | 3–6 m | Taç komşu ağaca yaklaşıyor; ana kollar kol kalınlığında ya da daha kalın |
| Yaşlı | > 35 cm ya da yaşlılık izi | > 6 m ya da gençleştirilmiş taç | Gövde bel kalınlığında; ya da oyuk, büyük eski kesimler; ya da kalın kesilmiş kolların üstünde ince yeni kollar |
| Belirsiz | — | — | Gövde görünmüyor ya da ölçütler çelişiyor |

- **Çelişki:** Gövde ve taç farklı sınıfa düşerse **taç** kazanır ve not yazılır ("kalın anaç, genç taç"): verimi ve bakım ihtiyacını taç belirler.
- Sahibe "büyüklük sınıfı" adıyla gösterilir.

## 4. Ölçekler

Her ölçeğin bir tanımı, mevsimi ve referans fotoğrafı vardır. 0–3 ölçeklerde ortak kural şudur:
- **0** belirti yok
- **1** hafif, bakım gerektirmez ya da rutin bakımla geçer
- **2** belirgin, bu sezon müdahale önerilir
- **3** ağır, ağacın verimini ya da hayatını tehdit eder

Emin olunamayan durumda bir alt değer değil, **değer girilmez** ve not yazılır.

**Sınırdaki vaka (v0.1):** İki değer arasında kalınırsa ve kanıt iyiyse **üst değer** seçilir; kanıt zayıfsa değer girilmez. Denetimin amacı sahibi uyarmaktır; sınırdaki vakayı alta yuvarlamak sorunu bir ziyaret geciktirir.

### 4.1 Kuru dal (tüm ziyaretler)

| Değer | Tanım |
| --- | --- |
| 0 | Kuru dal yok. Sadece kalem kalınlığından ince, tek tük kuru uç sürgün var. Budama kesik uçları sayılmaz |
| 1 | Tacın yaklaşık %10'undan azı kuru: 1–3 yan dal ya da dağınık kuru uçlar. Hiçbir **ana kol** (gövdeden çıkan kalın iskelet dalı) kuru değil |
| 2 | Tacın %10–30'u kuru **ya da** bir ana kol tümüyle kuru |
| 3 | Tacın %30'undan fazlası kuru **ya da** iki ve daha fazla ana kol tümüyle kuru |

- **Nasıl bakılır:** Dört yönün kesitleri birlikte değerlendirilir. Oran, tacın görünen hacmine göre tahmin edilir; dal sayısına göre değil. Bir ana kolun kuruması yüzde ne olursa olsun en az 2'dir: o koldaki meyve dalları gider ve ağacın bir tarafı yıllarca boş kalır.
- **Kışın:** Kuru dal kül grisidir, kabuğu çatlak ya da soyulmuştur, ucunda tomurcuk yoktur ya da büzüşmüştür; ince dalı bükülünce esnemeden "çıt" diye kırılır. Canlı dalın kabuğu kızıl kahve ile gri arasındadır, ucunda dolgun tomurcuk vardır. Kışın verilen 3, ilkbaharda yeniden kontrol edilir.
- **Sık hata:** Budamadan kalan kesik dal uçları; gölgede kalan iç dallar; kışın koyu görünen ıslak dallar; üst üste binen arka sıra ağacının dalları.

### 4.2 Gövde ve dip (tüm ziyaretler)

v0.1'de adı **"Gövde ve kök boğazı"**. Yara, oyuk, kabuk soyulması, zamklanma ve kök boğazı birlikte değerlendirilir. Dip sürgünü bu ölçekte değil, ayrı bir göstergede tutulur (4.9). Traktör ve çapa yaraları da bu ölçeğe girer. Teşhis konmaz, görünür belirti yazılır.

| Değer | Tanım |
| --- | --- |
| 0 | Gövde ve kök boğazı sağlam. Eski, kabukla kapanmış budama yaraları olabilir |
| 1 | Avuç içinden küçük (yaklaşık 10 cm'den kısa), yüzeysel, açık yara; ya da tek tük küçük zamk (kehribar renkli, sertleşmiş damla) noktası |
| 2 | Avuçtan büyük ama gövde çevresinin dörtte birinden azını saran yara; ya da sığ oyuk; ya da birden çok yerde zamklanma; ya da kök boğazında koyulaşmış, çökmüş kabuk |
| 3 | Gövde çevresinin dörtte birinden fazlasını saran yara ya da kabuk soyulması; ya da içine el girecek kadar derin oyuk; ya da kök boğazını çepeçevre saran kabuk ölümü |

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

- **Taze kesim:** Kesim yüzeyi açık krem rengindedir, henüz grileşmemiştir ve kenarından kabuk kapanmaya başlamamıştır. Geçen yılın kesimi grileşmiş ve kenarından kapanmaya başlamıştır.
- Antep fıstığında her yıl ağır budama yaygın değildir; çok üretici var yılı hasadından sonra ya da birkaç yılda bir budar. "Yapılmamış" sahibe olumsuz bir bulgu gibi sunulmaz; karnede "bu sezon budama izi görülen ağaç oranı" olarak durur.

### 4.4 Taç doluluğu (ilkbahar, yaz)

| Değer | Tanım |
| --- | --- |
| 0 | Normal: aynı parselde aynı büyüklükteki iyi ağaçlar kadar dolu; gökyüzü sadece küçük boşluklarda görünür |
| 1 | Hafif seyrek: karşılaştırma ağacından fark edilir derecede açık; gökyüzü dağınık ama çok sayıda boşluktan görünür |
| 2 | Belirgin seyrek: taç alanının kabaca yarısına yakın kısmından gökyüzü görünür; ya da yaprak bir yönde belirgin biçimde az |
| 3 | Çok seyrek: yaprak sadece dal uçlarında ya da birkaç dalda; taç çoğunlukla çıplak dal |

- **Nasıl bakılır:** Aynı parseldeki aynı büyüklük sınıfından sağlıklı ağaçlarla karşılaştırılır. Erkek ağaçlar ve fidanlar kendi gruplarıyla karşılaştırılır.
- Var yılında çok yüklü ağaçta yaprak meyveye göre az görünebilir; bu taç doluluğuna yansıtılmaz.
- Kıraç bahçelerde yaz sonunda genel bir seyrelme olağandır. Bu durumda parsel karnesinde "kuraklık stresi" bulgusu yazılır; ağaç ağaç yüksek değer verilmez.

### 4.5 Don hasarı (ilkbahar)

| Değer | Tanım |
| --- | --- |
| 0 | Kararmış çiçek ya da sürgün yok |
| 1 | Salkım ve genç sürgünlerin yaklaşık %10'undan azında kararma ya da büzüşme |
| 2 | %10–50'sinde kararma; genellikle tacın alt kısmında ya da bir yönde daha yoğun |
| 3 | Yarısından fazlasında çiçek ve genç sürgün kaybı; salkımlar kahverengi ya da siyah, kurumuş ve sarkık |

- Geç don genelde bahçenin çukur kısımlarında ve tacın alt kısmında kümelenir. Parsel karnesindeki mekânsal desen bunu gösterir.
- Don belirtisi birkaç gün içinde görünür, iki üç hafta sonra kararmış salkımlar dökülür. Sahipten ya da bölgeden "don oldu" haberi gelirse operasyon 3–10 gün içinde taç ve salkım odaklı kısa bir **ek ziyaret** planlar.
- Göz kurdunun kuruttuğu sürgün ucu ve mantar kaynaklı salkım yanıklığı dondan ayırt edilemeyebilir; ayrımı uzman yapar.

### 4.6 Zararlı belirtisi (ilkbahar, yaz)

İki parça olarak kaydedilir: şiddet (yok / hafif / belirgin) ve tür.

| Tür | Ne zaman | Görünür belirti (görüntüden) | Personelin görebileceği |
| --- | --- | --- | --- |
| Psilla (`psylla`) | İlkbahar sonu, yaz (en yoğun Haziran–Ağustos), hasat başı | Yaprakta parlaklık ve yapışkanlık (bal çiği); yaprakta ya da ağaç altında beyaz, şeker tanesi gibi pul; üstünde siyah küf (fumajin); ağır durumda sararma ve yaz ortasında yaprak dökümü | Yapışkanlık, beyaz pul, siyah is |
| Göz kurdu (`bud_borer`) | İlkbahar, yaz başı | Sürgün ucunda ya da tomurcukta kuruma; kurumuş uçta küçük delik; sürgünün kolayca kırılması | Ucu kurumuş sürgün |
| Kokarca (`stink_bug`; "kımıl" değil) | Yaz; izleri hasatta | Meyve kabuğunda küçük koyu emgi noktaları; yere erken dökülmüş yeşil meyve. Boş ya da lekeli iç ancak meyve kırılınca görülür | Yerde yeşil meyve |
| Diğer (`other`) | Tümü | Uzman notla yazar (yaprak lekesi, kabuklu bit, gövde kurdu gibi) | — |

- **Şiddet:** "Hafif", birkaç dalda belirti demektir. "Belirgin", tacın genelinde ya da çok sayıda dalda.
- Tür kesin değilse "diğer" seçilir ve not yazılır.
- Denetim teşhis koymaz (ilke 2). Türün yanında "görünür belirti" ibaresi yer alır.
- Zararlı belirtisi hasat ziyaretinde de girilebilir (Ağustos başında psilla hâlâ etkilidir).

### 4.7 Meyve yükü (yaz)

| Değer | Tanım |
| --- | --- |
| 0 | Salkım yok ya da tek tük |
| 1 | Az: dalların kabaca üçte birinden azında salkım |
| 2 | Orta: dalların üçte biri ile üçte ikisi arasında salkım |
| 3 | Yüklü: dalların üçte ikisinden fazlasında salkım; dallar yükten eğilmiş olabilir |

- Antep fıstığında var yılı / yok yılı (periyodisite) olağandır. Düşük meyve yükü tek başına bir sorun değildir ve genel sınıfı etkilemez.
- **Erkek ağaçlar** bu ölçeğe girmez ve karne dağılımına katılmaz.
- Parsel karnesinde dağılım olarak gösterilir. Önceki yılın aynı ziyaretiyle karşılaştırılır; var/yok yılları birbirini izlediği için yorum **iki yıl önceki** aynı ziyaretle yapılır (öneri; karnede şimdilik yalnız önceki yıl gösteriliyor).
- Yaz ziyareti için Temmuz uygundur; Haziran'da meyve dökümü sürüyor olabilir.

### 4.8 Hasat sonrası (hasat)

| Gösterge | Değerler |
| --- | --- |
| Hasat tamam mı | Tamam / Eksik / Belirsiz |
| Dal kırığı | Var / Yok |
| Hırsızlık izi | Var / Yok: hasat zamanından önce toplanmış salkımlar, kırılmış dallar, ağaç altında yaprak ve sap yığını |

Dal kırığı "var" ise ağaç için bir bulgu yazılır. Hırsızlık izi parsel düzeyinde bulgudur (bkz. [8](#8-bulgular-ve-öneriler)).

- **Zamanlama (v0.2):** "Kapsamlı" pakette Ağustos başında bir hasat öncesi ziyareti vardır (bölüm 2, #5; yaz mevsimi). Hırsızlık izi, dal kırığı ve ağaç altı yığın o ziyarette de girilir; hasat sonrası ziyareti (#6) bunu karşılaştırır. Diğer paketlerde v0.1 kuralı geçerlidir.
- **Zamanlama (v0.1):** Paket dört ziyarette kalır; hasat ziyareti **hasattan sonra** (Eylül sonu–Ekim) yapılır. Hırsızlık hasattan önce olduğu için bu ziyarette yalnız "olası iz" görülebilir; bulgu **orta** önemle gider, uzman en az iki ölçütle emin olursa yüksek.
- **Hırsızlık izi ölçütleri:** Ağaç altındaki yaprak, sap ve kırık dal yığını tek başına iz sayılmaz (meşru hasattan da kalır). En az biri gerekir: hasat zamanından önce boşaltılmış salkım sapları; komşu ağaçlar dolu iken tek tük boşaltılmış ağaçlar; tel ya da çitte yeni açılmış geçit.

### 4.9 Dip sürgünü (tüm ziyaretler)

Gövde dibinden ya da kökten çıkan ince sürgünler. Bakım göstergesidir; **genel sınıfı etkilemez**, karnede bakım uyumunda görünür.

| Değer | Kod | Görünür ölçüt |
| --- | --- | --- |
| Yok | `none` | Dipte ve taç altındaki toprakta ince sürgün yok |
| Birkaç | `few` | 1–5 ince sürgün (kalem kalınlığında ya da daha ince), boyu diz hizasını geçmiyor |
| Yoğun | `dense` | 5'ten fazla sürgün, dibi saran bir öbek, ya da bel hizasını geçen ya da bilek kalınlığına ulaşmış sürgün |

- **Nasıl bakılır:** En iyi hasat ziyaretinde görülür (yaprak var, ot kurumuş). Kışın yapraksız ince sürgünler panoramada zor seçilir; yakın plan sorusuyla desteklenir. Dip görünmüyorsa değer girilmez.
- **Aşı altı:** Sürgün aşı yerinin altından (anaçtan) çıkıyorsa uzman notta yazar; bırakılırsa aşısız ikinci bir gövdeye dönüşebilir.
- **Sahibe:** "14 ağacın dibinde yoğun dip sürgünü görüldü. Dip sürgünleri ağacın suyunu ve besinini paylaşır; temizlenmesini bahçıvanınızla konuşabilirsiniz."

### 4.10 Kuruma deseni (tüm ziyaretler; kışın sadece uzman)

Kurumanın **nasıl** dağıldığını söyler. **Ne kadar** kuru olduğu kuru dal ölçeğinde kalır (4.1); desen ancak kuru dal 1 ve üstüyse girilir.

| Değer | Kod | Görünür ölçüt |
| --- | --- | --- |
| Desen yok | `none` | Kuru dal yok ya da dağınık |
| Uçlardan geriye | `tip_dieback` | Birçok dalda kuruma uçtan başlıyor, dal dipleri canlı |
| Tek taraflı | `one_sided` | Tacın bir yönü ya da bir ana kol tümüyle kuru, diğer taraf canlı |
| Tepeden aşağı | `top_down` | Tacın üstü kuru ya da seyrek, altı canlı |
| Üstü kuru, dibi canlı | `top_dead_base_alive` | Aşılı taç ve gövdenin üstü kuru, dipten canlı sürgün çıkıyor |

- **Dalda asılı kuru yaprak** (`dried_leaves_attached`, evet/hayır; ilkbahar, yaz, hasat): kurumuş kahverengi yapraklar dökülmeden dalda duruyor. Ani kuruma belirtisidir; desenden bağımsız işaretlenir.
- **Genel sınıfa etkisi:** Tek taraflı ya da tepeden aşağı desen en az **Dikkat**; dalda asılı kuru yaprak en az **Sorunlu** (bölüm 5).
- **Kışın** desen yalnız uzman tarafından, yakın plan kanıtıyla girilir; AI kışın önermez.
- **Sınır:** Ağaç bütünüyle ölüyse sınıf Kuru'dur; desen o zaman yalnız `top_dead_base_alive` olabilir. Ağaç yerinde değilse sınıf Yok'tur, hiçbir ölçek girilmez.

## 5. Genel sınıf kuralı

Ağacın her ziyaretteki genel sınıfı aşağıdaki kurallarla çıkar. Kurallar yukarıdan aşağı okunur; ilk tutan kural geçerlidir.

| Sıra | Sınıf | Kural |
| --- | --- | --- |
| 1 | **Yok** | Konumda ağaç görünmüyor. En az iki yönün kesitiyle doğrulanmış ve uzman onaylamış olmalı |
| 2 | **Kuru** | Yapraklı dönemde aşılı kısımda (taç ve gövde) canlı sürgün ya da yaprak yok; dipten ya da anaçtan çıkan sürgünler ağacı canlı saymaz. Veya uzman kuru beyan etmiş |
| 3 | **Sorunlu** | Herhangi bir 0–3 ölçek 3; ya da dalda asılı kuru yaprak |
| 4 | **Dikkat** | Herhangi bir 0–3 ölçek 2; zararlı belirtisi belirgin; ya da kuruma deseni tek taraflı veya tepeden aşağı |
| 5 | **Sağlıklı** | Diğer bütün durumlar |

**Zararlı belirtisi (v0.1):** Hafif belirti ağacın sınıfını değiştirmez; parsel ya da bölge düzeyinde `pest_sign` bulgusu olarak yazılır. Yaz ziyaretinde hafif psilla neredeyse her ağaçta görülebildiği için, aksi halde parselin çoğu Dikkat olurdu. Belirgin belirti yaprak dökümü ya da sürgün kaybıyla birlikteyse uzman ağacı Sorunlu yapabilir. `methodology-v0`'da hafif belirti Dikkat, belirgin belirti Sorunlu sayılıyordu; o sürümle planlanmış ziyaretler o kuralla kalır.

**Kenar durumlar:**
- **Kışın kuru kararı (v0.1):** Yapraksız dönemde canlıyla kuru ayrımı zordur. Kışın "kuru" sınıfını **sadece uzman** verir; AI kışın kuru önermez (önerirse Sorunlu ve kuru dal 3'e çevrilir ve işaretlenir).
  1. **Kanıt:** Gövde ve dip yakın planı, artı farklı yönlerden **en az üç dal ucunun** yakın planı.
  2. **Personel testleri** (her dal için): dolgun tomurcuk var mı; kalem kalınlığındaki dal bükülünce esniyor mu, "çıt" diye kırılıyor mu; kabuk 1 cm kazınınca altı yeşil ve nemli mi, kahverengi ve kuru mu (kazınan yer çekilir).
  3. **Karar:** Üç dalın hepsinde tomurcuk yok, dal kırılıyor ve kabuk altı kahverengiyse, gövdede de canlı belirti yoksa uzman Kuru verebilir. Bulgu ve notta "kış gözlemi; ilkbaharda doğrulanacak" yazılır.
  4. **Dip sürgünü istisnası:** Aşılı kısım kuru, anaçtan canlı sürgün varsa sınıf Kuru, desen `top_dead_base_alive`, not "anaç canlı"; `regraft_candidate` bilgi bulgusu yazılabilir.
  5. **Kanıt eksikse:** Kışın Kuru verilmez; ağaç kuru dal 3 ile Sorunlu olur, not düşülür ve ilkbahar yakın plan listesine girer.
  6. **Ani değişim:** Önceki yapraklı ziyarette yapraklı olan ağaç şimdi kuru görünüyorsa zorunlu incelemeye girer ve bulgu yüksek önemle değerlendirilir.
  - Kazıma ağaçta küçük bir yara açar; yalnız kuru şüphesi olan ağaçta yapılır ve giriş izni beyanında "canlılık kontrolü için küçük kabuk kazıması" yazılır.
- **Kuru → Yok:** Bir sonraki ziyarette sökülmüş bulunan kuru ağaç "yok" olur. Bu bir kötüleşme sayılmaz.
- **Yok → yeni ağaç:** Boş yere fidan dikildiyse yere yeni bir ağaç kaydı açılır. Eski kaydın durumu "kayıp" kalır.
- **Ölçek girilmediyse:** Sınıf, girilen ölçeklerden çıkar. Hiçbir ölçek girilemediyse (ör. görüntü yok) sınıf verilmez ve ağaç "değerlendirilmedi" olarak görünür. Yayından önce uzman bu ağaçlar için ya sınıf girer ya da ek ziyaret ister.
- **Budama, meyve yükü ve dip sürgünü** genel sınıfı etkilemez.

**Değişim:** Ziyaretler arası değişim bu sırayla okunur: sağlıklı < dikkat < sorunlu < kuru = yok. Sahibe "kötüleşen" ve "iyileşen" ağaç sayısı olarak gösterilir.

## 6. Kaynaklar ve karar zinciri

| Kaynak | Kim | Ne üretir | Sahibe görünür mü |
| --- | --- | --- | --- |
| Personel (`staff`) | Saha personeli | Evet/hayır gözlem cevapları, yakın plan fotoğraflar, "Sorun gördüm" işareti | Kanıt olarak, uzman yayımladıktan sonra |
| Algoritma (`algorithm`) | İşleme hattı | Konum, kesit, kalite skoru, ileride taç çapı gibi ölçümler | Kanıt olarak |
| AI (`ai`) | AI ön değerlendirme | Ölçek önerisi, 0–1 güven skoru, tutarsızlık bayrağı | Hayır. Sadece uzmanın gördüğü bir öneridir |
| Uzman (`expert`) | Ziraat mühendisi | Ölçek ve sınıf kararı, bulgu, öneri, imza | Evet |

**Aynı ziyarette birden çok sonuç varsa:** Uzman > algoritma > AI önceliği geçerlidir. Ziyaretler arasında en yeni ziyaret geçerlidir.

**Zorunlu inceleme:** Aşağıdaki ağaçlar mutlaka uzmanın önüne gelir.
- AI güveni eşiğin altında olanlar. İlk eşik %70; uzman panelinde "düşük güven" filtresi bununla çalışıyor.
- AI'ın sorunlu, kuru ya da yok önerdiği ağaçlar.
- Önceki ziyarete göre sınıfı değişenler.
- Personel cevabıyla AI önerisi çelişenler.
- Personelin "Sorun gördüm" dedikleri.
- AI'ın kuru dal ya da gövde ölçeğine **2 ve üstü** verdiği ağaçlar (v0.1): görüntüden en zor değerlendirilen ölçekler. AI tarafında bu ağaçlar ayrıca güçlü modele gider.
- İşleme hattının "ağaç görünmüyor" dediği ağaçlar (`tree_visible = no`, aşağıda "Ağaç var/yok kontrolü"). "Yok" sınıfını yine yalnız uzman verir (bölüm 5).

**Ağaç var/yok kontrolü (işleme hattı):** Hat, envanterdeki her aktif ağacın kesitlerinde ağacın görünüp görünmediğini basit bir görüntü sinyaliyle ölçer ve ağaç başına bir `algorithm` ölçümü yazar: `tree_visible` = evet / hayır / belirsiz (yöntem `crop_greenness`, sürümlü).
- **Sinyal:** Kesitte ağacın konumuna düşen kutulardaki yeşil piksel oranı. Üst taç kutusu (yerden 2,5–4 m, ±1,5 m) dolu ise ağaç görünür: arka sıradaki ağaç daha uzakta olduğu için bu kutuya yetişmez. Bütün kutu (0,5–4 m) neredeyse hiç yeşil değilse o yönden ağaç yoktur; arası belirsizdir. Zayıf kesit (skor < 0,2), karanlık ya da patlamış görüntü kullanılmaz.
- **Karar:** Bir yönden taç görünüyorsa "evet". "Hayır" için hiçbir yönden taç görünmemeli ve en az iki farklı yönden kesit boş olmalı: yerinde duran ağaç her yönden kutuyu doldurur, arka plandaki ağaç ise o yönü yalnız "belirsiz" yapar. Diğer her durum "belirsiz". Yanlış "yok" demek, "belirsiz" demekten kötüdür; tacı küçük genç ağaç ya da arkada başka ağaç olan boşluk "belirsiz" kalır.
- **Mevsim:** Yapraksız dönemde (Kasım–Mart) yeşillik bir şey söylemez; bütün ağaçlar "belirsiz" yazılır.
- **Sınırlar:** Model değildir. Yeşil ot, arka plandaki ağaçlar ve gölge sinyali şaşırtabilir; sık dikimli bahçede eksik ağaç çoğunlukla "belirsiz" çıkar. Gövde tespit modeli (ofis aracındaki `trunk_label` etiketleriyle eğitilecek) bunun yerini alacak; o zaman yöntem ve sürümü değişir, eski ölçümler kalır.
- **Boş yerler:** Envanterde boş olan bir yerin kesitlerinde (fidan kutusu: yerden 0,2–2 m, ±1 m) en az iki yönden yeşillik varsa yere `tree_visible = evet` yazılır: "yeni dikim olabilir". Uzmana öneri olarak gösterilir; envanter kendiliğinden değişmez. Uzman doğruysa yeni dikim bulgusu yazar ya da doğrulama ister.

**Toplu onay ve kalite örneklemi:** Kalan ağaçlar toplu onaylanabilir; bu ağaçların rastgele **%10'u, en az 20 ağaç** yine uzmana gösterilir (v0'da %5).
- **Önce örneklem:** Toplu onay, örneklemdeki bütün ağaçlara tek tek bakıldıktan sonra açılır.
- **Durdurma kuralı:** Örneklemde uzman ile AI'ın sınıfı %85'ten az uyuşuyorsa o ziyarette toplu onay kapanır; kalan ağaçlara tek tek bakılır. Eşik, MVP başarı ölçütündeki "gözlem uyumu %85" ile aynıdır.
- **Mevsimin ilk ziyareti:** Bu metodoloji sürümüyle o mevsimden yayımlanmış bir ziyaret yoksa toplu onay kapalıdır; her mevsimin görüntüsü farklıdır ve AI'ın o mevsimdeki başarısı bilinmez.
- **Güven eşiği:** %70 başlangıç değeridir; pilotta uzman kararlarıyla AI'ın güven aralıkları eşleştirilip uyumun %90'ı geçtiği aralığın altına konur. Aynı mevsimde art arda iki ziyarette örneklem uyumu %90'ı geçerse örneklem %5'e inebilir (henüz uygulanmadı; elle karar).
- Toplu onaylanan sonuç sahibe "otomatik onay" olarak, uzman incelemesinden ayrı görünür.

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
- Her çekimde ekranda "böyle çek" referans çizimi durur: yandan görünüş (mesafe, telefon yüksekliği, bakış, güneş arkada) ve ekranda ne görünmeli, yanında sık yapılan hatanın küçük resmi. Tarifler: [uzman-ajan-onerileri.md](uzman-ajan-onerileri.md), bölüm 4.
- **Sıra:** Önce uzak (taç), sonra orta (gövde), en son yakın; personel ağaca yaklaşırken çeker.
- **Yön:** Gövde ve taç ağacın **güney tarafından, kuzeye bakarak** çekilir; güneş arkada kalır ve her ziyaret aynı yüzü gösterir. Sıra düzeni izin vermezse en yakın koridor kullanılır.

**Mevsime göre çekimler ve sorular** (saha uygulaması `winter-v0.2`, `spring-v0.2`, `summer-v0.3`, `harvest-v0.1` protokolleri). Her soruda **"Göremedim"** seçeneği vardır; o zaman ölçüm yazılmaz, cevap kayıtta "görülemedi" olarak kalır. Sorular personelin gördüğünü ya da dokunduğunu sorar, ziraat terimi içermez.

| Mevsim | Çekimler | Sorular (metrik kodu) |
| --- | --- | --- |
| Kış | 1. Taç, 6–8 m · 2. Gövde ve dip, 1–1,5 m, diz hizasından · 3. Varsa yara, oyuk ya da zamk; yoksa bir dal ucu ve tomurcuğu, 30–50 cm, yanında el · (4. Kuru şüphesinde: üç dal ucu ve kazıma yeri) | Gövdede yara, oyuk ya da kabuğu kalkmış yer var mı? (`trunk_damage_present`) · Gövdenin dibinden ya da topraktan ince dallar çıkıyor mu; yok / birkaç / çok (`basal_sprout_level`) · Açık renkli, yeni kesilmiş dal yeri var mı? (`fresh_cut_present`) · Kuru görünen kalın dal (kol) var mı? (`dead_scaffold_present`) · Gövdede ya da dipte reçine gibi sertleşmiş damla var mı? (`gum_present`) · Kuru şüphesinde: Baktığın üç dal ucundan herhangi birinde dolgun ya da kabaran tomurcuk var mı? (`dead_test_live_bud`, v0.2; v0.1'de ters soru `dead_test_no_buds`) · `dead_test_snaps` · `dead_test_brown_cambium` |
| İlkbahar (Nisan ortası–Mayıs ortası) | 1. Taç · 2. Çiçek ya da sürgün salkımı, 20–30 cm, arkasında avuç · 3. Yaprak, 20–30 cm, alt yüzü dahil | Çiçek salkımı var mı? (`flower_cluster_present`) · Salkıma dokununca eline sarı toz bulaşıyor mu? (`pollen_present`) · Kararmış ya da kurumuş salkım veya sürgün var mı? (`frost_damage_present`) · Ucu kurumuş genç sürgün var mı? (`shoot_tip_dieback_present`) · Yapraklar yapışkan ya da parlak mı? (`honeydew_present`) · Yaprakta siyah is var mı? (`sooty_mould_present`) · **Parsel sorusu** (ziyarette bir kez): Bahçede yabani ot ne boyda? (`weed_height`, `spring-v0.2`) |
| Yaz (Temmuz; v0.2'de Ağustos başı da) | 1. Taç · 2. Meyve salkımı, 30 cm, dış kısımdan ilk salkım · 3. Yaprak, üst ve alt yüz | Meyve salkımı var mı? (`fruit_present`) · Yapraklar yapışkan ya da parlak mı? · Beyaz, şeker tanesi gibi pul var mı? (`white_flakes_present`) · Siyah is var mı? · Ağaç altında çok sayıda yeşil meyve var mı? (`green_fruit_drop_present`) · Dallarda kurumuş yaprak asılı mı? (`dried_leaves_attached`) · Dalda erken boşaltılmış salkım sapı var mı? (`early_emptied_cluster_present`, v0.2) · **Parsel sorusu** (ziyarette bir kez): Tel ya da çitte yeni açılmış geçit var mı? (`fence_breach_present`, v0.2) · **Parsel sorusu:** Bahçede yabani ot ne boyda? (`weed_height`, `summer-v0.3`) |
| Hasat (hasattan sonra) | 1. Taç · 2. Varsa kırık dal, bağlantı yeriyle 1–2 m · 3. Ağaç altı, 2–3 m, 45° aşağı | Salkımların hepsi toplanmış mı? (`harvest_complete`) · Kırık ya da yarılmış dal var mı? (`branch_break`) · Ağaç altında yaprak, sap ya da kopmuş dal yığını var mı? (`debris_under_tree_present`) · Çevrede diz boyunu aşan kuru ot ya da yığın var mı? (`dry_weeds_present`) |

Personel isterse sesli not bırakır. `methodology-v0` ziyaretlerinin eski soru kodları (`dead_branch_present`, `root_sucker_present`, `pruned`, `pest_sign_present`, `drought_stress_sign`, `theft_sign_present`) kayıtta kalır.

**Parsel soruları (v0.2):** Bazı sorular bir ağaca değil parselin tamamına aittir. Saha uygulaması bunları yakın plan listesinin başında bir kez sorar; cevap ağaçsız bir personel ölçümü olarak yazılır (`measurement` konusu parsel), "Göremedim" parsel için `closeup_unseen` olayına girer ([arayuzler.md](arayuzler.md)). Parsel soruları yazın tel ya da çit geçidi ve ilkbahar ile yazın yabani ot boyudur.

**Yabani ot boyu (`spring-v0.2`, `summer-v0.3`):** "Bahçede yabani ot ne boyda?" Seçenekler: **kısa** (bileğe kadar), **orta** (dize kadar), **uzun** (dizi aşıyor). Personel parselin genelini düşünerek bir kez cevaplar. Cevap parsel konulu kategori ölçümü olarak yazılır (`weed_height`: `short`, `medium`, `tall`); "Göremedim" ölçüm yazmaz. Bakım uyumu satırında (bölüm 9) gösterilir ve yabani ot biçme hizmetinin önerisini besler: yayımlanmış ziyarette ot orta ya da uzunsa ve hizmetin sezonu açıksa sahip öneri kartı görür ([MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme)). Genel sınıfı etkilemez.

**Ön kontrol (v0.2):** Saha personeli taramaya başlamadan "son günlerde ilaçlama yapıldıysa etiketteki tekrar giriş süresi geçti" ya da "ilaçlama yapılmadı" diye onaylar; süre bilinmiyorsa en az 48 saat geçmiş olmalıdır, yapraklar ıslaksa ya da ilaç kokusu varsa girilmez. Hasat mevsimindeki taramada ayrıca hasadın bittiğini ve çöplemenin bitip bitmediğini seçer ("hasat bitti, çöpleme de bitti", "çöpleme sürüyor", "çöpleme yapılmayacak"); hasat sürüyorsa seçenek yoktur, bahçeye girilmez. Cevaplar `session_start` olayında kayıtlıdır. Ekranda ziyaret kuralları (bölüm 2) hatırlatılır. Köpek, yılan ve sıcak çarpması eğitim konusudur.

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
| `dead_tree` | Kurumuş ağaç | Orta; ani (önceki yapraklı ziyarette canlıydı) ya da kümelenmiş (bir bölgede 2+ yeni kuruma) ise Yüksek (v0.1) |
| `missing_tree` | Kaybolan ağaç (önceki ziyarette vardı) | Yüksek |
| `dead_branch` | Kuru dal (ölçek 2–3) | Orta |
| `trunk_damage` | Gövde yarası, oyuk, kabuk soyulması | Orta |
| `pest_sign` | Zararlı belirtisi (tür notta) | Orta; belirgin ve parselde yaygın psillada Yüksek (v0.1) |
| `frost_damage` | Don hasarı | Orta |
| `branch_break` | Dal kırığı | Orta |
| `theft_trace` | Hırsızlık izi | Orta ("olası iz"); uzman en az iki ölçütle emin olursa Yüksek (v0.1) |
| `fire_risk` | Kuru ot, yanıcı yığın | Yüksek (hasat dönemi) |
| `drought_stress` | Kuraklık stresi (parsel ya da bölge) | Orta |
| `irrigation_leak` | Sulama sızıntısı ya da arıza | Düşük |
| `unpruned` | Budanmamış ağaçlar (parsel ya da bölge) | Bilgi (v0.1; fıstıkta her yıl budama şart değil) |
| `canopy_dieback` | Belirgin kuruma deseni (4.10) | Orta; dalda asılı kuru yaprak varsa Yüksek |
| `basal_sprouts` | Yoğun dip sürgünü (4.9) | Düşük; çoğunlukla bölge ya da parsel düzeyinde tek bulgu |
| `regraft_candidate` | Aşılı kısmı kurumuş, anacı canlı ağaç | Bilgi ("yeniden aşılama sorulabilir") |
| `ungrafted_tree` | Aşısız ağaç | Bilgi; envanter raporunda toplu |
| `pollinizer_ratio` | Erkek ağaç oranı ya da dağılımı alışılmış aralığın dışında | Bilgi; ilkbahardan sonra, parsel düzeyi |
| `animal_damage` | Hayvan zararı: otlatma, kemirme, kabuk soyma | Orta (fidanda Yüksek) |
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
- Ağırlıklar (v0.1): sağlıklı 100, dikkat **70**, sorunlu **25**, kuru 0, yok 0. Değerlendirilmemiş ağaçlar hesaba girmez. (v0: 100 / 60 / 20 / 0.) Gerekçe: Dikkat "bu sezon müdahale önerilir" demek ve çoğunlukla geri döndürülebilir; hepsi Dikkat olan bir parselin 60 alması başarısızlık gibi okunur.
- **"Yok" sınıfı (v0.1):** Yalnız ağacın kaybolduğu ziyarette 0 ile hesaba girer; önceki değerlendirilmiş ziyarette de "yok" olan ağaç skora girmez. Yıllar önce kaybolmuş bir ağaç her karnede skoru düşürmez; boş yerler envanter boyutunda zaten görünür.
- **Trend (v0.1):** Skor değişimi **geçen yılın aynı mevsimindeki** ziyaretle (10–14 ay önce) karşılaştırılır; kış skoru yaz skorundan daha az ölçeğe dayandığı için farklı mevsimler karşılaştırılmaz. Böyle bir ziyaret yoksa ok gösterilmez, "karşılaştırma geçen yılın aynı mevsimiyle yapılır" yazılır. (v0: önceki ziyaret.)
- **Değerlendirilemeyen ağaçlar:** Oranları %5'i geçerse skorun yanında uyarı çıkar.
- Erkek ağaçlar, fidanlar ve yaşlı ağaçlar ayrıca ağırlıklandırılmaz.

**Boyutlar:**

| Boyut | Gösterge |
| --- | --- |
| Envanter | Yer, ağaç, boş yer, ara ağaç; kaybolan ve yeni ağaçlar |
| Bahçe yapısı | Dişi/erkek oranı (önerilen 1 erkeğe 8–10 dişi), aşısız ağaç sayısı, yaş dağılımı |
| Sağlık | Beş sınıfın dağılımı ve önceki ziyarete göre değişimi |
| Mekânsal desen | 10×10 m hücrelerde sorunların kümelenmesi |
| Bakım uyumu | Budama oranı (kış), yabani ot boyu (ilkbahar, yaz), hasadın tamamlanması (hasat). Bu dönemde bir bakım işini (ör. ot biçme) orchadOS kendisi yaptıysa satır bunu tarihiyle açıkça yazar |
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
| Kapsama | İşleme hattı | Her aktif ağacın en az iki yönden kesiti olmalı. Eşiğin altındaki parsel için yeniden tarama görevi açılır (periyodik ziyarette ağaçların %95'i, envanterde %98'i). Ayrıntı aşağıda |
| Uzman | Uzman paneli | Her aktif ağacın uzman kararı olmadan yayın yapılmaz |

**Kapsama kapısının ayrıntısı** (işleme hattı, `coverage` aşaması; parametreler hattın parametre dosyasında, raporda saklanır):
- **Yeterli kesit:** Kesit skoru (ideal 4 m mesafeye yakınlık × panorama kalitesi) en az 0,2; kalite 1'de yaklaşık 0,2–7,8 m.
- **İki yön:** Yeterli kesitler en az iki farklı yönden (K, D, G, B) gelmeli ve ikisi arasında ağaçtan bakışta en az 150° olmalı, yani ağacın karşı yüzleri görülmeli. Tek bir koridordan eğik bakışlar (8 m sırada en çok 118°) ağacın öbür yüzü sayılmaz.
- **Parsel:** Kapsanan aktif ağaç oranı eşiği geçmeli: periyodik ziyarette %95, envanterde **%98** (envanterde kaçırılan ağaç sonraki bütün ziyaretlere eksik taşınır).
- **Kör nokta:** Kapsanmayan ağaçların toplandığı hücre (en az 2 kapsanmayan ağaç ve hücrenin en az yarısı). Hücre 10×10 m'dir, yakın plan örneklemininkiyle aynı (bölüm 7). Ağaçlar arası ortanca en yakın komşu mesafesi **8 m'yi aşıyorsa** hücre **20×20 m** olur: geniş aralıklı bahçede 10 m'lik hücreye 1–2 ağaç düşer ve kural kör noktayı yakalamaz. Hücre boyu raporda saklanır.
- **Fidanlar:** Envanterde kapsanmayan her fidan ya da boş yer doğrulama turuna girer.
- **Yeniden tarama görevi:** Oran eşiğin altındaysa ya da kör nokta varsa operasyona "ek ziyaret" isteği otomatik açılır (kaynak: işleme hattı; eksik ağaçlar ve hücreler notta). Bir ziyaret için tek istek açılır.
- **Envanter:** Envanter taramasının kapsaması eşiğin altındaysa uzman envanteri onaylayamaz; ya ek tarama yapılır ya da uzman kapsamayı gerekçesini yazarak kabul eder (gerekçe kayıtta kalır).

## 11. Kararların durumu

27 Ekim 2026'da işletme, uzman ajanın önerilerini ([uzman-ajan-onerileri.md](uzman-ajan-onerileri.md); öneri, gerekçe, güven) bu sürüm için kabul etti. Bir ziraat mühendisi tarafından doğrulanmadılar; pilot uzmanın düzeltmeleri yeni sürüme girer.

- [x] Ölçek tanımları ve sınır değerleri (bölüm 4) — ana kol kuralı, avuç ölçüsü, oranlar, sınırdaki vakada üst değer
- [x] Zararlı belirtisi türleri ve görünür belirtileri (4.6) — "Kokarca", hafif belirti sınıfı değiştirmez
- [x] Büyüklük sınıfı eşikleri (bölüm 3)
- [x] Kışın kuru kararının kanıt kuralı (bölüm 5) — üç dal, tomurcuk, bükme, kazıma
- [x] Yakın plan çekimleri ve soruları (bölüm 7) — "Göremedim" seçeneği, güneyden çekim, "böyle çek" çizimleri
- [x] Bulgu türleri listesi ve tipik önemleri (bölüm 8)
- [x] Genel durum skoru (bölüm 9) — 100 / 70 / 25 / 0, "yok" yalnız kaybolduğu ziyarette, aynı mevsimle trend
- [x] AI güven eşiği ve kalite örneklemi (bölüm 6) — %70 eşik pilotta ayarlanacak; %10 / en az 20, %85 durdurma, mevsimin ilk ziyaretinde toplu onay kapalı, zor ölçekler zorunlu inceleme
- [x] Kapsama eşiği (bölüm 10) — periyodik %95, envanter %98, geniş aralıkta 20×20 m hücre
- [x] Tarama yöntemi ve kamera yüksekliği (bölüm 1) — 27 Ekim 2026, işletme kararı: üç yöntem de kullanılır (yürüyüş/sırt direği, motosiklet, robot); kamera yüksekliği ayarlanabilir, sabit bir sayı yok. Personel ön kontrolde yöntemi seçer ve merceğin yerden yüksekliğini ölçüp girer (0,50–3,50 m); telefon parseldeki son taramanın değerlerini önerir, yöntem farklıysa ya da yükseklik 25 cm'den fazla değiştiyse uyarır. İşleme hattı kesitleri ve ağaç var/yok kutularını (yerden 2,5–4 m) bu ölçülen yükseklikle izdüşürür; kutular yerden yükseklikle tanımlı; kamera yükselip alçaldıkça görüntüdeki yerleri değişir ama ağacın hep aynı bölümüne bakarlar. Uzman paneli, önceki ziyaret başka yöntemle ya da 25 cm'den fazla farklı yükseklikle çekildiyse uyarır. Robotta yükseklik kitin kalibrasyonundan (`kit_mount`) okunabilir; şimdilik o da elle girilir
- [x] Referans fotoğrafların seçim ölçütleri (Ek A) — fotoğrafların kendisi henüz yok

- [x] Ziyaret takvimi ve ay–mevsim eşlemesi (bölüm 2) — 28 Ekim 2026, uzman ajan kararı (v0.2): 6 ziyaretlik "Kapsamlı" takvim, Mart kış, Ağustos yaz, ziyaret kuralları. Pilot uzmana sorular: [uzman-ajan-onerileri.md](uzman-ajan-onerileri.md) bölüm 7.

**Açık kalanlar:**
- **Yönteme göre ayar:** Motosikletin titreşimi ve hızı ile robotun alçak montajı kesit kalitesini ve var/yok sinyalini nasıl etkiliyor, pilotta yöntem başına ölçülecek. Gerekirse yönteme göre ayrı eşikler gelir.
- **Yabani ot ve toprak işleme:** Bakım uyumu satırı için önerilen `weed_cover` (az / orta / yoğun) yerine 2 Kasım 2026'da parsel sorusu `weed_height` (kısa / orta / uzun; bölüm 7) geldi; ilkbahar ve yaz ziyaretlerinde sorulur. Hasattaki kuru ot ve yangın riski `dry_weeds_present` ile kalır. Toprak işleme için ölçüm henüz yok.
- **Karazenk:** v0.2 ilkbahar ziyaretinin odağında; `pest_sign_type`'ta ayrı kodu (`leafhopper`) yok, şimdilik `other` girilir.
- **Ziyaretin takvim satırı:** Hangi ziyaretin #1–#6 olduğu kayıtlı değil, mevsim aydan çıkıyor. Raporda "uyanma" ya da "hasat öncesi" diye adlandırmak için `session.visit_slot` (boş olabilir) alanı önerildi.
- **Ofis kişisinin kaynağı:** Envanterde ofiste girilen özellikler şimdilik `staff` kaynağıyla yazılıyor; ayrı bir `office` kaynağı gerekip gerekmediği açık.
- **Gövde ölçeğinin anlamı değişti:** v0.1'de dip sürgünü `trunk_base_scale`'den çıktı; kod adı aynı kaldı. Ağaç karnesinde v0 ve v0.1 değerleri sürümüyle okunmalı.
- **Örneklemin %5'e inmesi** ve **meyve yükünün iki yıl önceyle yorumlanması** henüz kodda yok.
- **Referans fotoğraflar:** Pilot bahçelerden toplanacak (Ek A).

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
| Dip sürgünü | `basal_sprout_level` | Kategori: `none`, `few`, `dense` | Tümü | Var |
| Kuruma deseni | `dieback_pattern` | Kategori: `none`, `tip_dieback`, `one_sided`, `top_down`, `top_dead_base_alive` | Tümü (kışın sadece uzman) | Var |
| Dalda asılı kuru yaprak | `dried_leaves_attached` | Evet/hayır | İlkbahar, yaz, hasat | Var |
| Budama | `pruning_status` | Kategori: `done`, `partial`, `not_done` | Kış | Var |
| Taç doluluğu | `crown_density_scale` | Ölçek 0–3 | İlkbahar, yaz | Var |
| Don hasarı | `frost_damage_scale` | Ölçek 0–3 | İlkbahar, kış (v0.2; kışın yalnız uzman) | Var |
| Zararlı belirtisi | `pest_sign_severity` + `pest_sign_type` | Kategori: `none`, `mild`, `marked` · kategori: `psylla`, `bud_borer`, `stink_bug`, `other` | İlkbahar, yaz | Var |
| Meyve yükü | `fruit_load_scale` | Ölçek 0–3 | Yaz | Var |
| Hasat tamam mı | `harvest_complete` | Evet/hayır | Hasat | Var |
| Dal kırığı | `branch_break` | Evet/hayır | Yaz (v0.2), hasat | Var |
| Hırsızlık izi | `theft_trace` | Evet/hayır (parsel) | Yaz (v0.2), hasat | Var |
| Yabani ot boyu | `weed_height` | Kategori: `short`, `medium`, `tall` (parsel) | İlkbahar, yaz | Var (İP15) |
| Ağaç görünüyor mu (işleme hattı) | `tree_visible` | Kategori: `yes`, `no`, `unsure` (ağaç ya da boş yer) | Tümü (yapraksız dönemde hep `unsure`) | Var |

Uzman panelinde bir düzeltme için mevsimin ölçeklerinden en az birinin girilmesi gerekir; görüntüden karar verilemeyen ölçek boş bırakılır (bölüm 4).

`tree_visible` bir ölçek değil, kalite ve envanter sinyalidir: kaynağı `algorithm` (işleme hattı, `crop_greenness`), karnede gösterilmez, genel sınıfı doğrudan belirlemez. "Hayır" ağacı zorunlu incelemeye sokar (bölüm 6); boş bir yerde "evet" yeni dikim önerisidir. AI ön değerlendirmesinin kendi "ağaç görünüyor mu" cevabı ayrı tutulur (`ai_assessment_detail.tree_visible`).
