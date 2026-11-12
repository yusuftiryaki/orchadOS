# TÜBİTAK BiGG: Hızlandırma Programı Başvurusu (Aşama 1)

11 Kasım 2026 · Yusuf

Hızlandırma programına başvuru PRODİS üzerinden, seçilen uygulayıcı kuruluşun formuyla yapılır; form kuruluştan kuruluşa değişir. Uygulayıcı kuruluş başvuruyu dört boyutta, her biri 10 üzerinden puanlar ve her boyuttan **en az 7** ister ([programlar.md](programlar.md) §1.4). Bu taslak o dört boyuta göre yazıldı; formdaki sorular bu bölümlerden doldurulur.

Başvuruyu girişimci olarak Furkan ya da Berkay yapar; diğer iki kişi ekip üyesi olarak özgeçmişleriyle eklenir ([README.md](README.md) §1, §4). Başvurmadan önce [README.md](README.md) §6'daki D1 sorusu uygulayıcı kuruluşa sorulmuş olmalı.

## Künye

| Alan | Değer |
| --- | --- |
| İş fikri adı | orchadOS: Antep fıstığı bahçeleri için ağaç ağaç, kanıta dayalı bağımsız denetim |
| Tematik alan | 1.6 Sürdürülebilir Tarım ve Beslenme › Akıllı ve Temiz Tarım; Bitki Sağlığı |
| Teknoloji alanları | Görüntü işleme, LiDAR nokta bulutu işleme, RTK/PPK GNSS konumlama, yapay zekâ ile görsel ön değerlendirme, web ve mobil yazılım |
| Girişimci | [DOLDURULACAK: Furkan ya da Berkay; üniversite, bölüm, sınıf] |
| Ekip | Yusuf (bilgisayar mühendisi; ürün ve yazılım), [Furkan ya da Berkay], [DOLDURULACAK: danışman ziraat mühendisi] |
| Hızlandırma programı | [DOLDURULACAK: örn. BİGG4FUTURE ya da BİGG AGROFOODSTART] |

## Kısa özet (≈150 kelime)

Gaziantep ve çevresindeki Antep fıstığı bahçelerinin sahipleri çoğunlukla bahçeden uzakta yaşıyor; bahçe hisseli, işleri yevmiyeciler yapıyor ve sahip ağaç sayısını, sınırı, budamanın ya da hasadın nasıl yapıldığını göremiyor. orchadOS, bahçeyi yılda 2–6 kez sırt tipi bir tarama kitiyle (RTK GNSS, 360° kamera, LiDAR) koridor koridor tarıyor. İşleme hattı her ağacı santimetre düzeyinde konumlanmış bir kimlikle eşleştiriyor, ağacın dört yönden fotoğraf kesitlerini ve LiDAR ile taç çapı, boy, taç hacmi, kışın dal iskeleti ve budama ölçümlerini çıkarıyor. Yapay zekâ ön değerlendirme yapıyor, ziraat mühendisi onaylayıp imzalıyor. Sahip, bahçesinin karnesini, sağlık haritasını, ağaç ağaç geçmişini, 360° gezisini ve 3D modelini web portalında görüyor. Hizmet yıllık abonelikle, dönüm başına fiyatlanıyor. Yazılımın büyük kısmı hazır ve bir pilot ortamında yayında; hızlandırma programında saha doğrulaması ve ticari doğrulama yapılacak.

## 1. İş fikrinin içeriği ve niteliği

**Problem.**
- Türkiye dünyadaki Antep fıstığı alanının ~%41'ine sahip (421 bin hektar, 2023); 2024'te 62,4 milyon meyve veren ve 37,8 milyon henüz meyve vermeyen ağaç var. Gaziantep'te ~1,43 milyon dönüm bahçe var ([Antep Fıstığı Sektör Politika Belgesi 2025–2029](https://www.tarimorman.gov.tr/TAGEM/Belgeler/yayin/Antep%20F%C4%B1st%C4%B1%C4%9F%C4%B1%20Sektor%20Politika%20Belgesi%20(2025-2029).pdf), TÜİK).
- Bahçelerin çoğu hisseli ve rızai taksimli; sahiplerin önemli kısmı şehirde ya da başka ilde yaşıyor. Sahip ağaç sayısını ve kesin sınırı çoğunlukla bilmiyor; budama, ilaçlama, hasat ve bekçilik yevmiyecilere ve komşulara emanet.
- Verim yıldan yıla çok oynuyor (2024'te 383 bin ton, 2025'te don ve kuraklıkla %61,5 düşüş). Sahip kaybın nedenini (don, kuraklık, bakımsızlık, hırsızlık) ayıramıyor.
- Bugün sahibin elindeki seçenekler kanıt üretmiyor: bekçi ya da komşunun sözü, uydu izleme (parsel düzeyinde bitki örtüsü indeksi, ağaç yok), tek seferlik bilirkişi ya da değerleme raporu.

**Çözüm.** Periyodik, ağaç düzeyinde, kanıtı gösterilebilen bağımsız denetim:
1. **Envanter (bir kez):** Sınır sahada işaretlenir, bahçe ızgara biçiminde taranır, her ağacın gövde konumu iki panoramadan üçgenlenir; her ağaç sıra ve numarayla kodlanır.
2. **Periyodik ziyaret (yılda 2–6):** Aynı ızgara taranır. Hat her ağacı envanterdeki kimliğine eşleştirir, dört yönden kesit üretir, LiDAR bulutundan ölçüm alır.
3. **Değerlendirme:** Yapay zekâ kalite kontrolü ve görsel ön etiket yapar (teşhis değil), uzman inceler, düzeltir ve raporu imzalar.
4. **Portal:** Parsel karnesi, sağlık haritası, ağaç karnesi ve fotoğraf geçmişi, işaretçili 360° gezi, LiDAR'dan 3D bahçe, PDF rapor.

**Teknoloji ve yenilik.**
- Ağaç **kimliği** yıllar boyu korunur: aynı ağacın kış, ilkbahar, yaz ve hasat görüntüleri ve ölçümleri yan yana gelir. Uydu ve dron üstten bakar; kit ağacı yandan, gövde ve dal yüksekliğinden görür.
- **Düşük maliyetli kit:** Tüketici 360° kamera, küçük bir mekanik olmayan LiDAR (Livox Mid-360 sınıfı), u-blox ZED-F9P tabanlı RTK alıcısı, açık kaynak PPK yazılımı (RTKLIB) ve kendi tasarımımız ESP32 GNSS kaydedici; LiDAR'lı tam kit ~2.400–3.200 $. Kamera dışarıdan tetiklenemediği için zaman eşleme kameraya okutulan GPS saatli QR koduyla yapılır.
- **Ölçülebilir çıktılar:** LiDAR'dan ağaç başına taç çapı, boy, taç hacmi, büyüklük sınıfı önerisi; kışın ana kol sayısı ve odun hacmi; iki kış taraması arasında budama analizi (kesim sayısı, kesilen hacim).
- **Bağımsızlık ve izlenebilirlik:** Her bulgu karneden ağaca, ağaçtan fotoğrafa, fotoğraftan zamana, konuma ve çekene iner. Medya içerik özetiyle adreslenir, değiştirilemez; her ölçüm onu üreten yöntem sürümünü taşır.
- **Robota hazır:** Kayıt ROS 2 ve MCAP üzerinde; aynı kit ileride otonom bir robota takılır, envanter haritası robot haritasıdır.

## 2. Ürün ya da hizmetin pazar durumu

**Müşteri.** Bahçeden uzakta yaşayan ya da bahçeye erişimi kısıtlı Antep fıstığı bahçesi sahipleri; hisseli bahçelerde diğer hissedarlar izleyici olarak eklenir. İkinci halka: bahçe alıp satanlar, mirasçılar, bahçeyi kiraya ya da ortakçıya verenler. Sonraki kurumsal kiracılar: kooperatifler, tarım sigortası, banka teminat değerlemesi, danışmanlar (veri modeli baştan çok kiracılı).

**Pazar büyüklüğü (tahmin).**

| Katman | Tanım | Büyüklük |
| --- | --- | --- |
| Toplam | Türkiye Antep fıstığı alanı × Standart paket fiyatı (720 TL/dönüm·yıl) | 4,21 milyon dönüm → ~3 milyar TL/yıl (kuramsal üst sınır) |
| Hizmet verilebilir | Gaziantep (1,43 milyon dönüm), uzaktaki sahip payı [DOLDURULACAK: saha görüşmelerinden tahmin, örn. %20] | ~286 bin dönüm → ~206 milyon TL/yıl |
| Hedef (2030) | 500 bahçe, 10.000 dönüm | ~9,3 milyon TL/yıl ([finansal-plan.md](finansal-plan.md)) |

**Rakipler ve ikameler.** Türkiye'de fiyatı yayımlanmış bağımsız, periyodik bahçe denetimi bulunamadı. İkameler:

| İkame | Fiyat | Eksik |
| --- | --- | --- |
| Bekçi | Günde ~1.000 TL (2023) | Kanıt yok, bağımsız değil |
| Uydu izleme (örn. Agrovech) | 35–55 TL/dönüm·yıl | Parsel düzeyi; ağaç, gövde ve dal görülmez |
| ZMO tarifesiyle arazi raporu | En az 8.820 TL / rapor | Tek seferlik, ağaç düzeyinde tekrar yok |
| SPK lisanslı değerleme | 17.568–24.051 TL | Tek seferlik, amacı değer |
| Yurt dışında dron ve uydu ile ağaç analizi yapan girişimler | — | Türkiye'de ve Antep fıstığında yok; yandan görüntü ve imzalı uzman değerlendirmesi yok |

orchadOS Standart paketi 20 dönümde dönüm başına yılda 720 TL (KDV hariç): bakımlı bir bahçenin brüt gelirinin ~%1,2'si, ortalama bir kuru bahçeninkinin ~%2,2'si ([fiyatlandirma.md](../fiyatlandirma.md)).

**Talep işareti.** Saha görüşmelerinde sahipler yalnız izlemeye sınırlı, izlemenin üstüne bahçe işlerinin (ot biçme gibi) hizmet olarak eklenmesine ise güçlü ilgi gösterdi; bu yüzden hizmet katmanı eklendi. [DOLDURULACAK: kaç sahiple görüşüldü, kaçı ödeme niyeti bildirdi, sözlü onay veren pilot sahip sayısı.]

## 3. Proje ekibinin yetkinliği ve uyumu

| Kişi | Rol | Yetkinlik |
| --- | --- | --- |
| Furkan ya da Berkay (başvuran) | Girişimci; iş geliştirme, müşteri görüşmeleri, finans ve operasyon | [DOLDURULACAK: bölüm, sınıf, varsa deneyim; bölgeyle bağı] |
| Yusuf | Teknik kurucu; ürün ve yazılım | Bilgisayar mühendisi; orchadOS'un bütün bileşenlerini (web portalı, saha uygulaması, işleme hattı, firmware, veritabanı, yapay zekâ servisi) tasarladı ve geliştirdi. [DOLDURULACAK: iş deneyimi] |
| Diğer öğrenci | Saha operasyonu, kalite ve ölçüm doğrulaması | [DOLDURULACAK: bölüm, sınıf] |
| [DOLDURULACAK] | Danışman ziraat mühendisi | Antep fıstığı bahçe yönetimi; metodolojiyi kesinleştirir, raporları imzalar |
| [DOLDURULACAK] | Saha personeli | Lansman köyünde yaşıyor; eğitimli ve sertifikalı tarar |

Ekip bugün gönüllü çalışıyor; BiGG yatırımıyla girişimci ve bir mühendis maaşlı hale gelir ([finansal-plan.md](finansal-plan.md) §8.1). Ekipteki boşluk: lisanslı ziraat mühendisi henüz bağlanmadı ([MVP.md](../MVP.md) açık sorular); hızlandırma süresinde danışmanlık sözleşmesi yapılacak.

## 4. Ön hazırlık çalışmalarının yeterliliği

**Hazır olanlar (Kasım 2026):**
- **Yazılım:** Sahip portalı (karne, sağlık haritası, ağaç karnesi, 360° gezi, 3D dünya, PDF rapor), uzman paneli (inceleme, yapay zekâyı kabul ya da düzeltme, imza ve yayın), ofis üçgenleme aracı (envanter), operasyon ve back office ekranları, Android saha uygulaması (çevrimdışı çalışma, kaydedici durumu, kapsama haritası, yakın plan akışı), işleme hattı (PPK, zaman eşleme, kare seçimi, panorama, ağaç kesitleri, kapsama, LiDAR ölçümleri), yapay zekâ ön değerlendirme servisi, ESP32 GNSS kaydedici firmware'i. Hepsi otomatik testlerle ve sentetik veriyle sınanıyor.
- **Müşteri süreci:** Self-servis kayıt (SMS doğrulaması), başvuru, teklif, kartla ve havaleyle ödeme, ziyaret başına ödeme planı, makbuz ve iade; hesap açmadan gezilebilen demo turu.
- **Pilot ortamı:** Avrupa'da barındırılan bir pilot ortamı yayında.
- **Fiyat ve ürün:** Üç paketli lansman fiyat listesi, metodoloji taslağı (v0.2: ölçekler, mevsim takvimi), KVKK ve sözleşme metinlerinin taslakları.

**Henüz yapılmayanlar (dürüst durum):**
- Tarama kiti monte edilmedi; gerçek bahçede tarama, PPK ve ağaç eşleştirme doğruluğu ölçülmedi (Kapı 1 hedefi: 20 Aralık 2026).
- Gerçek müşteri ve gelir yok; ilk pilot raporlarının hedefi 8 Mart 2027.
- LiDAR ölçümleri yalnız sentetik ağaçlarda doğrulandı (taç çapında en kötü +%1,8, hacimde +%2,8, boyda −%0,6); gerçek ağaçlarda elle ölçümle karşılaştırma pilotta.
- Metodoloji ve hukuk metinleri lisanslı uzman ve avukat onayı bekliyor.

**Hızlandırma programından beklenen:** Ticari doğrulama (fiyata gerçek sahiplerden cevap, ilk ödeme), pazar büyüklüğünün saha görüşmeleriyle ölçülmesi, finansal model ve yatırımcı sunumu, şirket yapısı ve fikri mülkiyet devri konusunda rehberlik.

## Ek: başvuruda sık sorulan kısa sorular

| Soru | Cevap |
| --- | --- |
| Neden şimdi? | RTK alıcıları, 360° kameralar ve küçük LiDAR'lar son üç yılda tüketici fiyatına indi; görüntüden ön değerlendirme yapabilen yapay zekâ modelleri toplu işlemde düşük maliyetle çalışıyor. Aynı dönemde iklim kaynaklı verim kayıpları sahiplerin bahçeyi görme ihtiyacını artırdı |
| Gelir modeli? | Bahçe başına yıllık abonelik: dönüm × ziyaret başına birim fiyat, en az ücretli; ilk yıl envanter ücreti. Ödeme ziyaret başına bölünür. Ek gelir: ot biçme gibi bahçe hizmetleri |
| Ölçek nasıl büyür? | Darboğaz saha emeği. Aynı köyde komşu parseller, operatör başına çok kit ve sonra robotla tarama; yazılım tarafı binlerce bahçeyi taşıyacak biçimde tasarlandı |
| Neden siz? | [DOLDURULACAK: bölgeyle bağ, bahçe sahipliği, teknik birikim] |
| Fikri mülkiyet | Kaynak kodu, veri modeli, metodoloji ve marka; BiGG'de hepsi kurulacak şirkete devredilir |
