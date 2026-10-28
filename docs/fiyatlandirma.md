# Fiyatlandırma

28 Ekim 2026 · Yusuf

> **Karar (28 Ekim 2026):** Lansman fiyat listesi aşağıdaki üç pakettir. Ürün sahibi pazar çalışmasından sonra karar verdi. Gerekçedeki maliyet ve pazar rakamları **tahmindir**; ziyaret süreleri, bulut ve yapay zekâ fiyatları doğrulanmadı ve pilotta ölçülecek (§8).

Fiyat hesabı `pricing-v1`'dir ([musteri-yonetimi.md](musteri-yonetimi.md) §6.6; dönem içi ek bahçe için `pricing-v2`, [bahce-yonetimi.md](bahce-yonetimi.md) §6). Bu belge rakamları ve gerekçesini tutar; formül orada.

## 1. Fiyat listesi

Tutarlar KDV hariçtir; üstüne %20 KDV eklenir. Birim fiyat **dönüm başına, ziyaret başınadır**. En az ücret yıllık ziyaret tutarına uygulanır. Envanter ücreti bahçe başına, yalnızca ilk yıl alınır.

| Kod | Paket | Periyodik ziyaret / yıl | Mevsimler | Birim fiyat (TL / dönüm·ziyaret) | En az ücret (TL / bahçe·yıl) | Envanter ücreti (TL / bahçe, ilk yıl) |
| --- | --- | --- | --- | --- | --- | --- |
| `temel` | Temel | 2 | Kış, Hasat | 208 | 5.600 | 6.000 |
| `standart` | Standart | 4 | Kış, İlkbahar, Yaz, Hasat | 180 | 11.200 | 6.000 |
| `kapsamli` | Kapsamlı | 6 | Kış, Uyanma, İlkbahar, Yaz, Hasat öncesi, Hasat sonrası | 168 | 16.000 | 6.000 |

- **Kapsamlı paketin takvimi (28 Ekim):** Standart'ın dört ziyareti (#1, #3, #4, #6) ile iki ek ziyaret (#2, #5). Temel ve Standart'ın ayları değişmez.

    | # | Ziyaret | Hedef ay | Pencere | Ana amaç |
    | --- | --- | --- | --- | --- |
    | 1 | Kış (Standart) | Ocak | 15 Ara – 15 Şub | Budama başladı mı, kuru dal, gövde, eksik ya da kesilmiş ağaç |
    | 2 | Uyanma (ek) | Mart sonu | 10 – 31 Mart | Budamanın kesin sonucu, budama artıkları kaldırıldı mı, kış kuru kararlarının doğrulanması |
    | 3 | İlkbahar (Standart) | Nisan sonu | 15 Nis – 15 May | Don, cinsiyet, göz kurdu, karazenk ve psilla 1. döl |
    | 4 | Yaz (Standart) | Temmuz başı–ortası | 1 – 25 Tem | Meyve yükü, psilla piki, kokarca, kuraklık ve sulama |
    | 5 | Hasat öncesi (ek) | Ağustos başı | 1 – 20 Ağu, hasat başlamadan | Hırsızlık dönemi, yangın riski, son meyve yükü |
    | 6 | Hasat sonrası (Standart) | Ekim | 15 Eyl – 31 Eki, hasat bitiminden 3–21 gün sonra | Hasat tamam mı, dal kırığı, hırsızlık karşılaştırması (#5 ile), dip sürgünü |

    - **Neden bu iki ek ziyaret:** #5 hırsızlık ve yangın riskinin en yüksek olduğu hasat öncesini kapsar ve #6'daki hırsızlık karşılaştırmasına taban verir. #2 budamanın kesin sonucunu verir; kış ziyaretinde budama çoğu zaman sürmektedir.
    - **Kaynak ve güven:** Takvim yapay zekâ uzman ajanının kararıdır, lisanslı bir ziraat mühendisinin değil. Güven: #5 yüksek, #2 orta (alternatif: haziran ortası).
    - **Mevsim eşlemesi:** Ayların mevsimlere eşlenmesi (mart → kış, ağustos → yaz) ve ölçütlerin geçerli mevsimleri metodoloji v0.2'de güncellendi ([metodoloji.md](metodoloji.md) bölüm 2; yeni ziyaretler `methodology-v0.2`, eski ziyaretler eski eşlemeyle kalır). Bu belge yalnızca paket takvimini tutar.
- **Envanter dahil:** Üç pakette de `includes_inventory = true`. Bu alan bilgi amaçlıdır: paketin ilk yıl envanter ziyaretini kapsadığını söyler ve teklife ve siparişe dondurulur. Ücreti `private.price_lines` belirler: `p_first_year` doğruysa kalemin `inventory_fee` tutarı eklenir, paketin alanına bakılmaz.
- **Kurucu indirimi yok.** Ayrı bir lansman ya da kurucu indirimi uygulanmaz.
- **Komşu bahçe indirimi:** Aynı köyden yönlendirilen ya da birlikte başvuran komşu bahçelere operasyon teklif başına %10–15 indirim yapabilir. Kod değişikliği yoktur: teklifte `discount_bp` (1000–1500) ve zorunlu indirim açıklaması ("Komşu bahçe indirimi, <köy>") girilir ([musteri-yonetimi.md](musteri-yonetimi.md) §6.6).

## 2. Örnekler

`price_preview` ile yerel veritabanında hesaplandı (§6.6 yuvarlaması). KDV hariç → KDV dahil, TL.

| Alan | Temel | Standart | Kapsamlı |
| --- | --- | --- | --- |
| 20 dönüm, yıllık | 8.320 → **9.984** | 14.400 → **17.280** | 20.160 → **24.192** |
| 20 dönüm, ilk yıl (envanterle) | 14.320 → 17.184 | 20.400 → **24.480** | 26.160 → 31.392 |
| 10 dönüm, yıllık (en az ücret) | 5.600 → 6.720 | 11.200 → **13.440** | 16.000 → 19.200 |
| 50 dönüm, yıllık | 20.800 → 24.960 | 36.000 → 43.200 | 50.400 → 60.480 |

- Envanter ücreti tek başına 6.000 → 7.200 TL'dir (ilk yıl).
- En az ücretin devreden çıktığı alan: Temel ~13,5 dönüm, Standart ~15,6 dönüm, Kapsamlı ~15,9 dönüm. Bunun altındaki bahçe en az ücreti öder.
- Komşu bahçe indirimiyle (%10) Standart, 20 dönüm, ilk yıl: 20.400 − 2.040 = 18.360 → 22.032 TL.

## 2a. Ödeme planı

> **Karar (28 Ekim 2026, ürün sahibi):** İlk yıl envanter ücreti teklif onayında **tek çekimle önden** ödenir. Yıllık tutarın geri kalanı (en az ücret ve indirim uygulanmış ziyaret tutarı, KDV dahil) paketteki **periyodik ziyaret sayısı kadar** ödemeye bölünür: Temel 2, Standart 4, Kapsamlı 6. Bu bir ziyaret başına ödeme planıdır, **kart taksiti değildir**; her ödeme ayrı bir tek çekim kart işlemi ya da havaledir. Faiz, vade farkı ya da ücret yoktur; ödemelerin toplamı peşin fiyata eşittir. Kart taksiti kapsam dışı kalır. Hukuki çerçeve: [hukuk/kararlar.md](hukuk/kararlar.md) H35 (yapay zekâ ajanlarının kararı).

Formül `installments-v1`'dir ([musteri-yonetimi.md](musteri-yonetimi.md) §5.6; tek kaynak `private.installment_schedule`):
- Envanter ödemesi = envanter ücreti − indirim payı + KDV.
- Kalan tutar ziyaret sayısına eşit bölünür; kuruş farkı son ödemeye eklenir (çok bahçeli siparişte satır satır).
- Ziyaret ödemesinin son günü, ziyaretin penceresinin başlangıcından 14 gün öncesidir; bu gün geçmişse onay günüdür. Pencereler §1'deki takvimdir (Temel: Kış, Hasat; Standart: Kış, İlkbahar, Yaz, Hasat; Kapsamlı: altısı).
- Ödenmemiş ziyaret ödemesinin ziyareti yapılmaz; pencere ödemesiz biterse o ziyaret düşer ve ödemesi istenmez.

**Örnekler** (yerel veritabanında `private.installment_schedule` ile hesaplandı; teklif onayı 1 Kasım 2026, ödeme süresi 14 gün; KDV dahil):

| Sipariş | Ödemeler | Toplam |
| --- | --- | --- |
| 20 dönüm, Standart, ilk yıl | Envanter 7.200,00 (15 Kas 2026) + 4 × 4.320,00 (Kış 1 Ara 2026, İlkbahar 1 Nis 2027, Yaz 17 Haz 2027, Hasat 1 Eyl 2027) | 24.480,00 |
| 20 dönüm, Temel, yıllık | 2 × 4.992,00 (Kış 1 Ara 2026, Hasat 1 Eyl 2027) | 9.984,00 |
| 20 dönüm, Kapsamlı, yıllık | 6 × 4.032,00 (Kış 1 Ara 2026, Uyanma 24 Şub, İlkbahar 1 Nis, Yaz 17 Haz, Hasat öncesi 18 Tem, Hasat sonrası 1 Eyl 2027) | 24.192,00 |
| 10 dönüm, Standart, yıllık (en az ücret) | 4 × 3.360,00 | 13.440,00 |
| Ek bahçe, 15 dönüm, Standart, 1 Nisan 2027'den (2 ziyaret) | Envanter 7.200,00 + 2 × 3.360,00 (İlkbahar, Yaz) | 13.920,00 |

- İndirimli siparişte envanter ödemesi de indirimlidir (%10 indirimle 6.480,00 TL).
- Ödeme payı: her ödeme ayrı bir kart işlemi olduğundan iyzico'nun işlem başına sabit ücreti (0,25 TL) ödeme sayısı kadar alınır; Standart 20 dönümde ilk yıl 5 işlem.

## 3. Pazar

- **Yayımlanmış rakip yok:** Türkiye'de bağımsız ve periyodik bahçe denetimi için fiyatı yayımlanmış bir hizmet bulunamadı. Karşılaştırma ikame hizmetlerle yapıldı.
- **ZMO 2026 asgari ücret tarifesi:** Arazi raporu en az 8.820 TL. 20 dönümde yılda 4 ziyaret karşılığı dönüm başına yılda ~1.760 TL. Standart bunun yarısından azdır (720 TL).
- **Uydu izleme** (örneğin Agrovech): dönüm başına yılda 35–55 TL. Ağaç bazında bilgi ve sahada görüntü yok.
- **Bekçi:** günde 1.000 TL (2023 rakamı).
- **SPK lisanslı bahçe değerleme raporu:** 17.568–24.051 TL, tek seferlik.
- **Kaliforniya fıstığı:** bağımsız danışman (PCA) dönüm başına yılda ≈ $8,6 (brüt gelirin ~%0,7); bahçe yöneticileri brüt gelirin %5–10'u.

## 4. Bahçe ekonomisi (2026)

- Kabuklu fıstık bahçe kapısı fiyatı ~570–650 TL/kg.
- Ortalama kuru bahçe ~55 kg/dönüm: brüt gelir dönüm başına yılda ~33.000 TL; bakımlı bahçede ~60.000 TL.
- Standart 20 dönümde dönüm başına yılda 720 TL (KDV hariç): brüt gelirin ~%1,2–2,2'si.

## 5. Maliyet modeli

**Girdiler (ürün sahibi):**
- Saha personeli yevmiyesi 2.500 TL. Uzman desteği ücretsiz.
- Personel lansman köyünde oturuyor; bahçelerin hepsi aynı köyde, komşu parsellerde. Günde 20 dönümde ~3 ziyaret, 10 dönümde ~5 ziyaret; günde ~55–65 dönüm.

**Periyodik ziyaret başına doğrudan maliyet:**

| Bahçe | Olgunlukta (kit yılda ~300 ziyaret) | Pilotta (yılda ~16 ziyaret) |
| --- | --- | --- |
| 10 dönüm | ~1.090 TL | ~2.770 TL |
| 20 dönüm | ~1.720 TL | ~3.410 TL |
| 50 dönüm | ~4.290 TL | ~5.980 TL |

- Pilotta farkı kit amortismanı yapar.
- **Ödeme:** iyzico KDV dahil tutarın %4,29'u + 0,25 TL; net tutarın ~%5,15'i.
- **Brüt marj (Standart, olgunlukta):** 20 dönümde ~%47, 10 dönümde ~%56. Pilotta düşüktür; sebep fiyat değil, kitin az kullanılmasıdır.

## 6. Operasyona etkisi

- **Veri:** Ziyaret başına ~90 GB video. Kit başına 4–6 adet 1 TB kart ve haftalık kart taşıma.
- **Güç:** Kit başına 3–4 batarya.
- **Bağımsızlık riski:** Personel köyde oturuyor. Önlemler: denetlenen bahçelerde başka iş yapmaz, akrabalığını beyan eder, ziyaretler GPS ve kapsama denetiminden geçer, zaman zaman başka bir personel habersiz kontrol yapar.

## 7. Revizyon

- **Takvim:** Her 1 Ocak ve 1 Temmuz'da yeni fiyat listesi sürümü. Artış ≈ önceki 6 ayın TÜFE'si (yıllık ~%30).
- **Ara revizyon:** USD/TRY %10'dan fazla oynarsa.
- **İmzalı teklifler etkilenmez:** `quote.inputs` liste sürümünü ve kalemleri dondurur.
- Yerel seed'deki 1 Ocak 2027 taslağı (~%15 artış: 239 / 207 / 193 TL, en az 6.440 / 12.880 / 18.400 TL, envanter 6.900 TL) örnektir; gerçek revizyon back office'te yapılır.

## 8. Pilotta doğrulanacaklar

- Dönüm başına gerçek sahada kalma süresi.
- Ağaç başına uzman dakikası.
- Ödeme isteği: sahiplerin bu fiyatlara cevabı ([MVP.md](MVP.md) başarı ölçütleri).
- Kart ve havale payı.

## 9. Barındırılan projeler

Seed yalnızca yereldedir. Test ve pilot projelerinde liste back office'te (`/operasyon/fiyat`) girilir ve yayımlanır: [deployment.md](deployment.md) › Lansman fiyat listesi.
