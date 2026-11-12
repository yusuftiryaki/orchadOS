# Finansal Plan (taslak)

11 Kasım 2026 · Yusuf

TÜBİTAK BiGG iş planının finansal bölümü (AGY112 Bölüm G.3–G.4 ve I) ve KOSGEB başvurusunun bütçe bölümleri bu belgedeki tablolardan doldurulur. **Bütün rakamlar tahmindir.** Fiyatlar lansman fiyat listesinden, birim maliyetler [fiyatlandirma.md](../fiyatlandirma.md) §5'ten gelir; büyüme, personel ve genel giderler bu belge için konmuş varsayımlardır ve kurucu tarafından gözden geçirilmelidir. Başvurudan önce tablolar aylık kırılımla bir hesap tablosuna taşınmalıdır (AGY112 ilk yıl için aylık nakit akışı ister).

## 1. Varsayımlar

| # | Varsayım | Değer | Kaynak |
| --- | --- | --- | --- |
| V1 | Fiyatlar | 2026 lansman listesi, sabit fiyatlarla (enflasyon artışı yok). Tutarlar KDV hariç | [fiyatlandirma.md](../fiyatlandirma.md) §1 |
| V2 | Ortalama bahçe ve paket | 20 dönüm, Standart (yılda 4 ziyaret): **14.400 TL/yıl**; ilk yıl envanter **6.000 TL** | fiyatlandirma §2 |
| V3 | Aktif bahçe (yıl sonu) | 2027: 20 · 2028: 60 · 2029: 150 · 2030: 500 | Varsayım. 2027 pilot ve ilk satışlar; 2030, [teknik-mimari.md](../teknik-mimari.md)'deki S2 ölçeği (500 bahçe) |
| V4 | Yeni bahçe | 2027: 20 · 2028: 40 · 2029: 90 · 2030: 350. Kayıp (bırakan müşteri) yok sayıldı | V3'ten |
| V5 | Ziyaret sayısı | Aktif bahçe × 4 + yeni bahçe × 1 (envanter) | V2–V4 |
| V6 | Ziyaret başına doğrudan saha maliyeti (kit amortismanı hariç) | 2027: 2.000 · 2028: 1.800 · 2029–2030: 1.650 TL | fiyatlandirma §5 (olgunlukta ~1.720 TL, amortisman dahil); ilk yıllar az ziyaret ve yol yüzünden yüksek |
| V7 | Uzman (ziraat mühendisi) ücreti | Ziyaret başına 400 TL | Varsayım. Fiyatlandırma modeli uzmanı ücretsiz sayıyordu; başvurularda lisanslı uzman ücretli kabul edildi |
| V8 | Ödeme payı | Gelirin %5,15'i (iyzico) | fiyatlandirma §5 |
| V9 | Tarama kiti | LiDAR'lı kit ~3.200 $, baz istasyonu ~800 $, kur 1 $ = 45 TL [DOLDURULACAK: güncel kur]: kit **144.000 TL**, baz **36.000 TL**; GPU'lu işleme bilgisayarı 150.000 TL. Kit yılda ~300 ziyaret yapar. Amortisman 5 yıl | [tarama-kiti.md](../tarama-kiti.md), [kit-siparis-listesi.md](../kit-siparis-listesi.md), fiyatlandirma §5 |
| V10 | Altyapı (bulut, AI, SMS, alan adı) | 2027: 150.000 · 2028: 200.000 · 2029: 300.000 · 2030: 500.000 TL | [teknik-mimari.md](../teknik-mimari.md) (50 bahçede bahçe başına yılda ~50 $, ölçekte 20–25 $) ve sabit abonelikler |
| V11 | Personel (yönetim ve yazılım; saha personeli V6'nın içinde) | 2027: 900.000 · 2028: 1.300.000 · 2029: 1.700.000 · 2030: 2.400.000 TL | Varsayım: 2027'de kurucu ve bir mühendis, sonra yılda bir kişi |
| V12 | Pazarlama ve satış | 2027: 50.000 · 2028: 100.000 · 2029: 200.000 · 2030: 400.000 TL | Varsayım |
| V13 | Genel yönetim (muhasebe, hukuk, sigorta, ofis) | 2027: 120.000 · 2028: 150.000 · 2029: 200.000 · 2030: 250.000 TL | Varsayım |
| V14 | Tahsilat | Ödeme ziyaretten önce alınır (ziyaret başına ödeme planı); alacak yok sayıldı | fiyatlandirma §2a |

Hariç tutulanlar: ot biçme hizmeti geliri (fiyatı belirlenmedi, [plan.md](../plan.md) İP15), Temel ve Kapsamlı paket karışımı, fiyat revizyonları, KDV ve işletme sermayesi dalgalanmaları.

## 2. Satış tahmini (AGY112 G.3)

| | 2027 | 2028 | 2029 | 2030 |
| --- | --- | --- | --- | --- |
| Aktif bahçe (yıl sonu) | 20 | 60 | 150 | 500 |
| Alan (dönüm) | 400 | 1.200 | 3.000 | 10.000 |
| Yeni bahçe | 20 | 40 | 90 | 350 |
| Ziyaret | 100 | 280 | 690 | 2.350 |
| Ortalama fiyat (bahçe·yıl) | 14.400 | 14.400 | 14.400 | 14.400 |
| Periyodik ziyaret geliri | 288.000 | 864.000 | 2.160.000 | 7.200.000 |
| Envanter geliri | 120.000 | 240.000 | 540.000 | 2.100.000 |
| **Toplam gelir** | **408.000** | **1.104.000** | **2.700.000** | **9.300.000** |

Pazar payı: 2030'daki 10.000 dönüm, Gaziantep'teki ~1,43 milyon dönüm Antep fıstığı alanının %0,7'si (TÜİK 2024, [Antep Fıstığı Sektör Politika Belgesi 2025–2029](https://www.tarimorman.gov.tr/TAGEM/Belgeler/yayin/Antep%20F%C4%B1st%C4%B1%C4%9F%C4%B1%20Sektor%20Politika%20Belgesi%20(2025-2029).pdf)).

## 3. Birim fiyat ve maliyet (AGY112 G.4)

Standart paket, 20 dönüm, olgunlukta (2029 ve sonrası), bir yıl:

| Kalem | TL |
| --- | --- |
| Satış bedeli (4 ziyaret) | 14.400 |
| Doğrudan saha maliyeti (4 × 1.650) | −6.600 |
| Uzman (4 × 400) | −1.600 |
| Ödeme payı (%5,15) | −742 |
| **Katkı payı** | **5.458 (%38)** |

Fiyat nasıl belirlendi: ikame hizmetlere göre (ZMO arazi raporu, uydu izleme, bekçi, değerleme raporu) ve bahçe ekonomisine göre (brüt gelirin %1,2–2,2'si); ayrıntı [fiyatlandirma.md](../fiyatlandirma.md) §3–§4.

**Başa baş:** 2030'un sabit giderleri (altyapı, personel, pazarlama, genel yönetim, amortisman) ~3,85 milyon TL. Yalnız yenileyen bahçelerle başa baş ~700 bahçedir; 2030'da yeni bahçelerin envanter geliri aradaki farkı kapatır. Birim ekonomiyi iyileştirecek kaldıraçlar: fiyatların her 1 Ocak ve 1 Temmuz'da revizyonu, büyük bahçeler (en az ücretin üstünde dönüm başı fiyat), komşu parsellerde aynı gün çok ziyaret, robotla tarama (operatör başına 2–4 robot, [vizyon.md](../vizyon.md)) ve ot biçme gibi hizmet gelirleri.

## 4. Gelir-gider tablosu

| | 2027 | 2028 | 2029 | 2030 |
| --- | --- | --- | --- | --- |
| Gelir | 408.000 | 1.104.000 | 2.700.000 | 9.300.000 |
| Doğrudan saha maliyeti | 200.000 | 504.000 | 1.138.500 | 3.877.500 |
| Uzman ücreti | 40.000 | 112.000 | 276.000 | 940.000 |
| Ödeme payı | 21.000 | 57.000 | 139.000 | 479.000 |
| Altyapı | 150.000 | 200.000 | 300.000 | 500.000 |
| Personel (yönetim, yazılım) | 900.000 | 1.300.000 | 1.700.000 | 2.400.000 |
| Pazarlama ve satış | 50.000 | 100.000 | 200.000 | 400.000 |
| Genel yönetim | 120.000 | 150.000 | 200.000 | 250.000 |
| **İşletme giderleri toplamı** | **1.481.000** | **2.423.000** | **3.953.500** | **8.846.500** |
| **Gelir − gider** | **−1.073.000** | **−1.319.000** | **−1.253.500** | **+453.500** |

## 5. Yatırım

| Yıl | Alım | Tutar (TL) |
| --- | --- | --- |
| 2027 | 1 LiDAR'lı kit, baz istasyonu, işleme bilgisayarı | 330.000 |
| 2028 | 1 kit (yılda 280 ziyaret, ikinci kit yedek ve tepe dönem için) | 144.000 |
| 2029 | 1 kit (690 ziyaret, 3 kit) | 144.000 |
| 2030 | 5 kit (2.350 ziyaret, 8 kit) ve ikinci işleme bilgisayarı | 870.000 |

Başlangıç yatırım sermayesi tablosu (AGY112 I.1, ilk yıl):

| Kalem | Tutar (TL) | Açıklama |
| --- | --- | --- |
| Kira-depozito | 0 | Ofis yok; işleme bulutta, ekipman kurucuda |
| Makine ve teçhizat | 330.000 | Kit, baz istasyonu, işleme bilgisayarı |
| Kuruluş işlemleri ve harçlar | [DOLDURULACAK] | Anonim şirket kuruluşu ([README.md](README.md) Yol 1); mali müşavirden teklif |
| Genel giderler | 20.000 | Sarf, yedek kart ve SSD |
| Beklenmeyen giderler | 35.000 | ~%10 |
| **Toplam sabit yatırım** | **385.000 + kuruluş** | |

## 6. Kâra geçiş (AGY112 I)

| | 2027 | 2028 | 2029 | 2030 |
| --- | --- | --- | --- | --- |
| Satış gelirleri | 408.000 | 1.104.000 | 2.700.000 | 9.300.000 |
| İşletme giderleri | 1.481.000 | 2.423.000 | 3.953.500 | 8.846.500 |
| Amortisman (5 yıl) | 66.000 | 94.800 | 123.600 | 297.600 |
| Finansman gideri | 0 | 0 | 0 | 0 |
| **Vergi öncesi kâr** | **−1.139.000** | **−1.413.800** | **−1.377.100** | **+155.900** |
| Vergi | 0 | 0 | 0 | 0 (geçmiş yıl zararları mahsup edilir) |

KOSGEB İş Geliştirme Desteği faizsiz olduğu için finansman gideri sıfırdır; geri ödemeler 2030'dan sonra nakit çıkışıdır (§7).

## 7. Nakit ihtiyacı ve finansman

| | 2027 | 2028 | 2029 | 2030 |
| --- | --- | --- | --- | --- |
| Gelir − gider | −1.073.000 | −1.319.000 | −1.253.500 | +453.500 |
| Yatırım | −330.000 | −144.000 | −144.000 | −870.000 |
| **Yıllık nakit ihtiyacı** | **−1.403.000** | **−1.463.000** | **−1.397.500** | **−416.500** |
| Kümülatif | −1.403.000 | −2.866.000 | −4.263.500 | −4.680.000 |

Dört yılda **~4,7 milyon TL** dış finansman gerekir. İki program için finansman yapısı ([README.md](README.md) §3: Yol 1'de önce BiGG, sonra KOSGEB; Yol 2'de yalnız KOSGEB) (AGY112 "İşletme Finansman Yapısı" tablosu bunlardan doldurulur):

| Kaynak | KOSGEB | BiGG |
| --- | --- | --- |
| Program | KOSGEB İş Geliştirme: **2.250.000 TL** (geri ödemeli, faizsiz; +250.000 TL genç girişimciye). Proje giderinin %80'i, harcandıkça ödenir | BiGG Fonu: **1.350.000 TL** (%3 hisse); tetikleyiciyle **1.350.000 TL** devam yatırımı |
| Özkaynak | [DOLDURULACAK] | [DOLDURULACAK] |
| Melek yatırımcı ya da tohum turu | 2029'da ~1,5–2 milyon TL | 2029'da ~1,5–2 milyon TL (BiGG devam yatırımının tetikleyicisi olur) |
| Diğer | TÜBİTAK 1507 hibesi (Ar-Ge giderleri için) | TÜBİTAK 1507 hibesi |

Geri ödeme (KOSGEB İş Geliştirme): Proje 24 ay sürer, geri ödemeler bitişten 12 ay sonra başlar. Proje 2027 ortasında başlarsa geri ödeme 2030 ortasında başlar. Taksit sayısı ve teminat türü Yönerge'nin geri ödeme maddelerinden okunacak [DOLDURULACAK].

## 8. Program bütçeleri

### 8.1 BiGG yatırımının kullanımı (12 aylık teknolojik doğrulama)

| Kalem | Tutar (TL) | Açıklama |
| --- | --- | --- |
| Personel | 720.000 | İki tam zamanlı kişi, 12 ay, kişi başı aylık brüt 30.000 TL: girişimci ve teknik kurucu ortak (ya da işe alınacak bir mühendis); bugün gönüllü olan ekip maaşlı hale gelir |
| Alet, teçhizat, yazılım | 330.000 | LiDAR'lı tarama kiti (144.000), RTK baz istasyonu (36.000), GPU'lu işleme bilgisayarı (150.000) |
| Malzeme ve sarf | 36.000 | Hafıza kartları, SSD, bataryalar, mekanik yedekler |
| Hizmet alımı | 170.000 | Ziraat mühendisi danışmanlığı: metodoloji v1 ve referans ölçümler (90.000); hukuk: KVKK ve sözleşmeler (60.000); GNSS düzeltme verisi ve ölçüm hizmeti (20.000) |
| Bulut ve yazılım abonelikleri | 54.000 | Veritabanı, barındırma, depolama, AI API, 12 ay |
| Saha giderleri | 40.000 | Pilot bahçelerde ~16 ziyaretin saha personeli yevmiyesi |
| **Toplam** | **1.350.000** | |

### 8.2 KOSGEB İş Geliştirme gider bütçesi (24 ay)

| Destek | Gider | Miktar | Tutar (KDV hariç, TL) |
| --- | --- | --- | --- |
| Personel giderleri | Yazılım geliştirici (bilişim personeli; lisans, bilgisayar ya da yazılım mühendisliği) | 1 kişi, 24 ay × 55.000 brüt | 1.320.000 |
| Personel giderleri | Saha ve operasyon teknikeri (harita ya da tarım teknikeri) | 1 kişi, 12 ay × 40.000 brüt | 480.000 |
| Makine-teçhizat | LiDAR'lı tarama kiti (LiDAR + IMU, RTK GNSS alıcı ve anten, 360° kamera, kayıt bilgisayarı, SSD, batarya, direk) | 2 adet | 288.000 |
| Makine-teçhizat | RTK baz istasyonu (alıcı, anten, kaydedici, jalon) | 1 adet | 45.000 |
| Makine-teçhizat | GPU'lu işleme bilgisayarı | 1 adet | 150.000 |
| Makine-teçhizat | Saha telefonu (Android, saha uygulaması ve kaydedici durum ekranı) | 2 adet | 30.000 |
| Yazılım | Bulut erişim hakkı: veritabanı, barındırma, nesne depolama | 24 ay × 4.500 | 108.000 |
| Hizmet alımı: danışmanlık | Hukuk: KVKK, mesafeli sözleşme, hizmet sözleşmeleri | 1 | 75.000 |
| Hizmet alımı: danışmanlık | Ziraat mühendisi: metodoloji v1, referans fotoğraf seti, saha protokolü | 1 | 120.000 |
| Hizmet alımı: test ve analiz | GNSS ve LiDAR ölçüm doğruluğu testi, kalibrasyon | 1 | 30.000 |
| Hizmet alımı: pazarlama | Köy tanıtımları, basılı materyal, dijital tanıtım | 1 | 100.000 |
| Hizmet alımı: tasarım | Marka kimliği, saha levhaları, rapor şablonları | 1 | 40.000 |
| Hizmet alımı: sınai mülkiyet | Marka tescili (TÜRKPATENT) | 1 | 25.000 |
| **Toplam proje gideri** | | | **2.811.000** |
| **Talep edilen destek (%80)** | | | **2.248.800** |

Notlar:
- Girişimci genç ise üst limit 2.500.000 TL'dir; gider bütçesi 3.125.000 TL'ye kadar büyütülebilir (örneğin teknikerin süresi 24 aya çıkarılır).
- Kurucu ve ortakları personel desteğinden yararlanamaz; iki pozisyon da yeni işe alımdır.
- Personel desteği aylık prime esas kazanç × %80'dir; kişi başı aylık üst limit bilişim personeli için brüt asgari ücretin işverene maliyetinin 4 katı, tekniker için 2 katı (mesleki-teknik ortaöğretim mezunuysa 3 katı). Maaşlar bu sınırın altında tutulmalı.
- Saha telefonunun makine-teçhizat, bulut aboneliklerinin "buluttan erişim hakkı" olarak kabul edilip edilmeyeceği KOSGEB müdürlüğüne sorulmalı. Kabul edilmezse tutar personel ya da kite kaydırılır.
- Her kalem için başvurudan önce teklif alınıp forma yazılır (firma, vergi numarası, tarih, iletişim, tutar); belgeler işletmede saklanır ([kontrol-listesi.md](kontrol-listesi.md)).
