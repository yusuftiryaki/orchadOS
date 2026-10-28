# Hukuki Kararlar

28 Ekim 2026

> **Bu kararları kim verdi?** Kullanıcı (Yusuf) şu talimatı verdi: “Hukuk ile ilgili sorular olursa hukuk uzmanı bir ajan yarat ve ondan aldığın kararları doğru kabul ederek ilerle.” Bu belgedeki kararları, bu talimatla görevlendirilen hukuk uzmanı bir yapay zekâ ajanı verdi. Ajan iki bağımsız uzman görüşünü karşılaştırdı. Uzmanların birleştiği yerde ortak görüşü benimsedi; ayrıştıkları yerde gerekçesiyle karar verdi. Talimat gereği kararlar doğru kabul edilir ve **nihai olarak uygulanır**. Kararlar baro kayıtlı bir avukatın imzalı görüşü değildir. Mali müşavirin alanına giren ayrıntılar (fatura belge türleri, eşikler) ayrıca belirtilmiştir.

Kaynak sorular: [README.md](README.md)'deki “Avukata sorulacaklar” listesi (1–23) ve taslaklarla tasarım dokümanları karşılaştırılarak türetilen sorular (H25–H34). Kullanıcının sabit kararları ([bahce-yonetimi.md](../bahce-yonetimi.md) §2) değiştirilmedi: fiyat formülü ve orantı, tek bahçe için cayma ve kesintiler, 90 gün salt okunur erişim. Kararlar bu çerçevenin içinde verildi.

## Nasıl okunur

- Her bölüm bir sorudur. Sırasıyla: soru, karar, dayanak, gerekçe (iki uzman görüşünün uzlaştırılması dahil), metin değişikliği, sistem değişikliği.
- **Metin değişikliği** bölümündeki tırnak içindeki metinler bağlayıcı ifadelerdir; taslaklara bu ifadeyle girer.
- Köşeli parantezli olgusal yer tutucuları ([Adres], [KEP], [alanadi], [Tarih], [Telefon] vb.) Şirket doldurur; bunlar hukuki karar beklemez. Kararı verilen her “[avukat …]” notu metinlerden silinir.
- **Sistem değişikliği** iki gruptur. “Bu iş” etiketli olanlar, metin güncellemesiyle aynı PR'da yapılan küçük değişikliklerdir. “T..” numaralı olanlar ayrı takip işleridir ([Takip işleri](#takip)).

## İçindekiler

- [Yayın şartları](#yayin)
- [Sürüm planı](#surum)
- [H01 – Görüntülerde tanınabilen üçüncü kişiler](#h01)
- [H02 – Yurt dışına aktarım](#h02)
- [H03 – Çerezler ve Cloudflare Turnstile](#h03)
- [H04 – VERBİS kaydı](#h04)
- [H05 – Çalışan ve saha ekibi aydınlatma metni](#h05)
- [H06 – Ticari elektronik ileti ve İYS](#h06)
- [H07 – Sınır ibaresi ve mülkiyet uyuşmazlıkları](#h07)
- [H08 – Uzman görüşünün niteliği ve sorumluluk](#h08)
- [H09 – Hisseli tapu, vekil ve mirasçı: yetki beyanı](#h09)
- [H10 – Tüketici ve tacir; yetkili mahkeme](#h10)
- [H11 – Cayma süresinde hizmete başlama ve açık cayma](#h11)
- [H12 – Kalıcı veri saklayıcısı ve sözleşme teslimi](#h12)
- [H13 – Cayma süresinin başlangıcı ve ek sipariş](#h13)
- [H14 – Yenileme: kendiliğinden uzama yok](#h14)
- [H15 – Sahip kaynaklı yapılamayan ziyaret](#h15)
- [H16 – iyzico ve sabit TCKN](#h16)
- [H17 – Fatura ve e-Arşiv](#h17)
- [H18 – Çoğul bahçe ve Ek-1](#h18)
- [H19 – Ek bahçe fiyatının açıklığı ve son ek günü](#h19)
- [H20 – Bahçe çıkarma ve iade formülü](#h20)
- [H21 – 8A iadelerinin düşülmesi; dönemi biten satır](#h21)
- [H22 – 90 gün salt okunur erişim ve KVKK](#h22)
- [H23 – Yenilenmeyen üyelikte ve idari fesihte erişim](#h23)
- [H24 – Ödenmeyen sipariş](#h24)
- [H25 – Saklama süreleri](#h25)
- [H26 – KVKK başvuruları ve silme](#h26)
- [H27 – Demo turu gizlilik paragrafı](#h27)
- [H28 – Demo vitrini için yazılı izin](#h28)
- [H29 – Havale masrafı](#h29)
- [H30 – Aydınlatma “onayı”](#h30)
- [H31 – Hizmetin geliştirilmesi ve Md. 10/3](#h31)
- [H32 – Sahibin verdiği üçüncü kişi verileri](#h32)
- [H33 – Kayıtta hesap varlığının açığa çıkması](#h33)
- [H34 – Diğer yer tutucular ve şirket bilgileri](#h34)
- [Takip işleri](#takip)

<a id="yayin"></a>
## Yayın şartları

Aşağıdakilerin hepsi tamamlanmadan hiçbir metinden “-taslak” eki kaldırılmaz, metinler gerçek bir müşteriye onaylatılmaz ve barındırılan projelerde `garden_changes_enabled` açılmaz:

1. **Şirket bilgileri:** Ticaret sicilindeki tam unvan, MERSİS, açık adres, telefon, e-posta, KEP, vergi dairesi ve numarası ile alan adı bütün metinlerde ve site altbilgisinde doludur. ETBİS kaydı yapılmıştır (H34, T22).
2. **Yurt dışı aktarım:** Kişisel veri alan her yurt dışı sağlayıcıyla Kurul'un ilan ettiği standart sözleşme imzalanmıştır. Sözleşme imzadan itibaren 5 iş günü içinde Kurum'a bildirilmiştir. Kayıt [yurt-disi-aktarim-kaydi.md](yurt-disi-aktarim-kaydi.md)'dedir. Standart sözleşmeyi imzalamayan sağlayıcıya kişisel veri gitmez (H02, T01). Harita altlığı kendi altyapımızdan sunulur. Cloudflare imzalamadıysa Turnstile yerine kendi barındırdığımız doğrulama devrededir (H03, T12).
3. **Sistem:** T03 (erken başlama onayı), T04 (siparişe özel sözleşme PDF'i), T09 (kısa saklama temizlikleri) ve T21 (üretim kapısı) üretimdedir.
4. **Bahçe ekleme ve çıkarma:** Ayrıca T05 ve T18 üretimdedir.
5. **Tanıtım iletisi onayı:** Kutu yalnızca İYS kaydı ve entegrasyonundan sonra açılır (H06).

**Acil not:** Barındırılan projelerde bugün gerçek kişisel veri varsa 2. madde gecikmeksizin yerine getirilir. O tarihe kadar gerçek bahçe görüntüsü yurt dışındaki yapay zekâ sağlayıcısına gönderilmez; bunu ai-worker kapısı sağlar (H02).

<a id="surum"></a>
## Sürüm planı

| Metin | Eski sürüm | Yeni sürüm | Arşiv dosyası |
| --- | --- | --- | --- |
| KVKK aydınlatma metni | kvkk-v1-taslak | kvkk-v2-taslak | arsiv/kvkk-aydinlatma-metni-v1.md |
| Açık rıza ve ticari elektronik ileti onayı | riza-v1-taslak | riza-v2-taslak | arsiv/acik-riza-metni-v1.md |
| Gizlilik ve çerez politikası | gizlilik-v1-taslak | gizlilik-v2-taslak | arsiv/gizlilik-cerez-politikasi-taslagi-v1.md (v1 sayfasında gösterilen demo paragrafı dahil) |
| Mesafeli hizmet sözleşmesi | mesafeli-v2-taslak | mesafeli-v3-taslak | arsiv/hizmet-sozlesmesi-taslagi-v2.md |
| Ön bilgilendirme formu | onbilgi-v2-taslak | onbilgi-v3-taslak | arsiv/on-bilgilendirme-formu-taslagi-v2.md |
| İptal ve iade politikası | iade-v2-taslak | iade-v3-taslak | arsiv/iptal-iade-politikasi-taslagi-v2.md |
| Bahçede bulunan kişiler için aydınlatma (yeni; sitede `/bahcede-bulunanlar`) | — | bahcede-v1-taslak | — |
| Çalışan ve saha ekibi aydınlatma metni (yeni; iç) | — | personel-v1-taslak | — |
| Demo vitrini görsel ve veri kullanım izni (yeni; iç) | — | vitrin-v1-taslak | — |

Sürümsüz yeni iç belgeler: [kvkk-basvuru-proseduru.md](kvkk-basvuru-proseduru.md), [saklama-imha-politikasi.md](saklama-imha-politikasi.md), [yurt-disi-aktarim-kaydi.md](yurt-disi-aktarim-kaydi.md).

---

<a id="h01"></a>
## H01 – Görüntülerde tanınabilen üçüncü kişiler (işçi, komşu, yoldan geçen)

**Soru.** Panoramalarda tanınabilen, sözleşmenin tarafı olmayan kişiler için (a) hukuki sebep meşru menfaat olabilir mi; (b) aydınlatma hangi yöntemle yapılmalı; (c) Md. 5/4 ve KVKK metni §9 yeterli mi?

**Karar.**
- **(a) Hukuki sebep meşru menfaattir (md. 5/2-f).** Bu kişilerden açık rıza istenmez. Md. 5/2-c yalnızca Sahip için geçerlidir. Denge şu güvencelerle kurulur:
    - Kişiler hedeflenerek çekilmez.
    - Kimlik tespiti, yüz tanıma ya da kişiler hakkında bir değerlendirme yapılmaz. Bu nedenle görüntüler biyometrik veri sayılmaz (md. 6 uygulanmaz).
    - Erişim Sahip, davet ettiği hissedarlar, Uzman, saha personeli ve hizmet sağlayıcılarla sınırlıdır.
    - Ham video en fazla 30 gün tutulur.
    - Bir kişinin itirazında (md. 11) o kişinin göründüğü kare ya da panorama elle gizlenir. Bu talebe bağlı bir işlemdir. Ürün kararı (yüz bulanıklaştırma yapılmaz) değişmez.
- **(b) Katmanlı aydınlatma: üç yöntem birlikte uygulanır.**
    1. **Tarama günü sahada:** Saha ekibi bahçe girişine ya da çalışma noktasına QR kodlu taşınabilir bir levha koyar. Personel görünür bir tanıtım kartı taşır ve bahçede rastladığı kişilere kısa sözlü bilgi verir.
    2. **Sahip aracılığıyla önceden:** Ziyaret tarihi bildirimine (H15) Şirket'in hazırladığı kısa bilgilendirme ve bağlantısı eklenir. Sahip bunu bahçede çalışacak kişilere iletir.
    3. **Sitede:** `/bahcede-bulunanlar` adresinde ayrı bir aydınlatma metni yayımlanır.

  Bahçe girişine kalıcı levha konması gerekmez: tarama yılda birkaç gün sürer ve arazi Şirket'in kontrolünde değildir.
- **(c) Md. 5/4 ve §9 yetersizdir.**
    - Aydınlatma yükümlülüğü Şirket'indir; Sahip yalnızca yardımcıdır.
    - Md. 9/2'deki “Sahip dışındaki üçüncü kişilerle paylaşılmaz” ifadesi gerçeği yansıtmıyor, çünkü görüntüleri hissedarlar ve uzman da görür. İfade düzeltilir.
    - Sahip, Md. 10/1'e göre görüntüleri serbestçe paylaşabildiği için kendi paylaşımındaki sorumluluk ona ait olarak yazılır.
- **Saha talimatı:** Kişi kadraja yakınsa personel geçmesini bekler. Kişi itiraz ederse o bölüm daha sonra taranır.

**Dayanak.** KVKK md. 4/2 (ölçülülük, amaçla sınırlılık), md. 5/2-f, md. 6, md. 10, md. 11; Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ (RG 10.03.2018; verinin elde edildiği anda aydınlatma, katmanlı bilgilendirme); Kurul'un kamera kayıtlarında levha ve ayrıntılı metinden oluşan katmanlı aydınlatmayı kabul eden yaklaşımı.

**Gerekçe.**
- Yüz bulanıklaştırma yapılmadığı için kişiler tanınabilir; görüntüler kişisel veridir.
- Kişiler hizmetin konusu değildir, görüntüye tesadüfen girerler. Kayıt kısa sürer, kişiler hakkında sonuç çıkarılmaz, erişim dar bir çevreyle sınırlıdır. Bu nedenle denge meşru menfaatten yana kurulur.
- Aydınlatma veri sorumlusunun yükümlülüğüdür ve görüntünün çekildiği anda yapılmalıdır. Kırsalda günlük çalışan yevmiyeciye bunu fiilen ulaştıran tek araç, sahadaki levha ve personeldir. Sahip kanalı önceden haber vermeye yarar. Site metni ise ayrıntıyı ve başvuru yolunu verir.
- **Uzlaştırma:** İki uzman bütün noktalarda aynı görüşte. Uzman A'nın “saha uygulamasına kontrol kaydı” önerisi takip işi olarak alındı (T07). O iş bitene kadar Uzman B'nin önerdiği operasyon kontrol listesi uygulanır.

**Metin değişikliği.**
- **KVKK metni §9 (kvkk-v2-taslak), bölümün tamamı:**
  “Tarama sırasında bahçenizde çalışan ya da bulunan kişiler (işçiler, bekçi, komşular, yoldan geçenler) görüntülere girebilir. Bu kişilerin görüntüleri bakımından veri sorumlusu Şirket'tir. Görüntüler yalnızca bahçe denetimi amacıyla, Kanun md. 5/2-f'deki meşru menfaatimize dayanılarak işlenir. Kişiler hedeflenerek çekilmez; kişilerin kimliği tespit edilmez, yüz tanıma yapılmaz ve kişiler hakkında değerlendirme yapılmaz. Görüntüleri yalnızca siz, davet ettiğiniz hissedarlar, uzman, saha personeli ve 5. bölümdeki hizmet sağlayıcılar görür. Yurt dışına aktarım 5. bölümdeki güvencelerle yapılır. Saklama süreleri 7. bölümdedir.
  Bu kişileri bilgilendirmek için:
  - Ziyaret tarihi size önceden bildirilir. Bildirimdeki kısa bilgilendirmeyi bahçede çalışacak kişilere iletmenizi isteriz.
  - Saha personelimiz tarama günü bahçe girişine bilgilendirme levhası koyar, tanıtım kartı taşır ve bahçede rastladığı kişilere kısa sözlü bilgi verir.
  - Ayrıntılı bilgi [Bahçede bulunan kişiler için aydınlatma metni](/bahcede-bulunanlar) sayfasındadır.
  Görüntülerde yer aldığını düşünen kişi 8. bölümdeki yollarla başvurabilir ve görüntüsünün gizlenmesini isteyebilir.”
- **Sözleşme Md. 5/4:** “Şirket'in bildirdiği ziyaret tarihini ve Şirket'in sağladığı kısa bilgilendirmeyi Bahçe'de çalışacak kişilere (işçi, yevmiyeci, bekçi) önceden iletir. Bu yükümlülük, Şirket'in Kanun md. 10'daki aydınlatma yükümlülüğünü ortadan kaldırmaz; Şirket ayrıca sahada bilgilendirme yapar (Madde 9/2).”
- **Sözleşme Md. 9/2:** “Görüntülerde Bahçe'de bulunan kişiler görünebilir. Bu görüntüler yalnızca hizmet amacıyla işlenir. Sahip, Sahip'in davet ettiği hissedarlar, Uzman, saha personeli ve Aydınlatma Metni'nde sayılan hizmet sağlayıcılar dışında kimseyle paylaşılmaz. Şirket görüntülerdeki kişilerin kimliğini tespit etmez. Tarama günü Bahçe girişine bilgilendirme levhası konur.”
- **Sözleşme, yeni Md. 9/5:** “Sahip, Madde 10/1 uyarınca paylaştığı görüntülerde tanınabilen kişiler bakımından kişisel verilerin korunmasına ilişkin mevzuata uymakla kendisi yükümlüdür.”
- **Yeni belge** `docs/hukuk/bahcede-bulunanlar-aydinlatma-metni.md` (bahcede-v1-taslak; sitede `/bahcede-bulunanlar`). Bölümleri:
    1. **Bu metin kimin için:** Şirket'in denetim taraması yaptığı bahçelerde çalışan ya da bulunan kişiler.
    2. **Veri sorumlusu:** Unvan ve iletişim bilgileri ([KVKK metni §1](kvkk-aydinlatma-metni.md) ile aynı).
    3. **Hangi veriler:** 360° panoramalarda ve fotoğraflarda görüntünüz (tanınabilir olabilir); görüntünün çekildiği yer ve zaman.
    4. **Amaç ve hukuki sebep:** Bahçe denetimi, yani ağaçların durumunun değerlendirilmesi ve raporlanması. Hukuki sebep meşru menfaattir (md. 5/2-f). Kişiler hedeflenmez, kimlik tespit edilmez, yüz tanıma yapılmaz, kişiler hakkında değerlendirme yapılmaz.
    5. **Kimler görür, kimlere aktarılır:**
        - Bahçe sahibi, davet ettiği hissedarlar, uzman, saha personeli.
        - Altyapı ve görüntü işleme sağlayıcıları (AB'de) ile yapay zekâ ön değerlendirme sağlayıcısı (ABD). Yurt dışına aktarım standart sözleşme ve Kurum'a bildirimle yapılır (Kanun md. 9). Sağlayıcıların adları KVKK Aydınlatma Metni §5'tedir.
    6. **Ne kadar saklanır:**
        - Ham video: en fazla 30 gün.
        - Panoramalar: hizmet bittikten sonra 2 yıl.
        - Raporda yer alan görüntüler: raporla birlikte 10 yıl.
    7. **Nasıl toplanır:** Tarama ekipmanıyla, otomatik yolla.
    8. **Haklarınız ve başvuru:** md. 11 hakları; başvuru yolları KVKK metni §8 ile aynıdır. Görüntünüzün gizlenmesini isteyebilirsiniz. Başvuru en geç 30 gün içinde ücretsiz sonuçlandırılır.
- **Levha metni** (kullanim-kilavuzu.md saha bölümüne girer): “BAHÇE DENETİM TARAMASI — Bugün bu bahçede, bahçe denetimi amacıyla 360° kamerayla görüntü kaydı yapılmaktadır. Veri sorumlusu: OBA Bilişim Teknolojileri LTD. Ayrıntılı bilgi ve başvuru: [alanadi]/bahcede-bulunanlar · [Telefon] · [QR]”

**Sistem değişikliği.**
- **Bu iş:** `/bahcede-bulunanlar` sayfası. `legal.ts` girdisi, `versions.ts` anahtarı `field_notice` = `bahcede-v1-taslak`, herkese açık yollar listesi.
- **T07:** Ziyaret tarihi bildirimine bağlantı; saha uygulamasında “levha kondu / sözlü bilgi verildi” kaydı.
- **T20:** Ops için panorama ya da kesit gizleme işlevi. O zamana kadar gizleme talepleri geliştirici eliyle karşılanır ve denetim kaydına yazılır.
- **Hemen:** Saha kitine QR kodlu levha ve tanıtım kartı eklenir. Operasyon kontrol listesi kullanılır.

<a id="h02"></a>
## H02 – KVKK md. 9: Yurt dışına aktarım (her sağlayıcı için güvence)

**Soru.** Her sağlayıcı için hangi aktarım mekanizması kullanılmalı? Yapay zekâ aktarımı açık rızaya dayanabilir mi? Açık Rıza md. 1 çıkarılmalı mı? §5'teki yer tutucu nasıl doldurulur? Eksik sağlayıcılar tabloya eklenmeli mi?

**Karar.**
- **Aktarımlar düzenlidir; açık rızaya dayanılamaz.** Bütün sağlayıcılara aktarım düzenli ve sistematiktir. Yeterlilik kararı yoksa açık rıza ve md. 9/6'daki diğer istisnalar yalnızca arızi aktarımda kullanılabilir.
- **Mekanizma standart sözleşmedir (md. 9/4).** Kurul'un ilan ettiği metin değiştirilmeden imzalanır. Şirket veri sorumlusu, sağlayıcı veri işleyen olduğundan “veri sorumlusundan veri işleyene” modülü kullanılır. Sözleşme imzadan itibaren 5 iş günü içinde Kurum'a bildirilir. Bağlayıcı şirket kuralları ve taahhütname küçük bir girişim için uygulanabilir değildir; taahhütname ayrıca Kurul izni gerektirir. Sunucunun AB'de olması aktarımı ortadan kaldırmaz.
- **Sağlayıcı bazında:**
    - **Supabase Inc.:** Standart sözleşme şarttır. İmzalamazsa gerçek kişisel veri Supabase'de tutulmaz. Kişisel veri şeması Türkiye'ye taşınır (teknik-mimari 2. seçenek) ya da imzalayan bir sağlayıcıya geçilir.
    - **Vercel Inc.:** Standart sözleşme şarttır (IP, istek ve oturum trafiği, loglar). İmzalamazsa imzalayan ya da Türkiye'de barındıran bir sağlayıcı kullanılır.
    - **Bulut işleme sağlayıcısı (AWS, Azure ya da GCP):** Seçimin birinci ölçütü Türk standart sözleşmesini imzalamasıdır. İmza ve bildirim tamamlanmadan ham video yüklenmez.
    - **Anthropic PBC:** Standart sözleşme şarttır. Sözleşmede ya da veri işleme ekinde API verisinin model eğitiminde kullanılmayacağı da yazılır. Anthropic imzalamazsa Claude, AB bölgesinde sunan ve standart sözleşmeyi imzalayan bir bulut sağlayıcısı üzerinden kullanılır ya da yerel model (Ollama) kullanılır. Güvence yoksa gerçek bahçe görüntüsü gönderilmez.
    - **Ollama (yerel):** Aktarım yoktur.
    - **Gemini ücretsiz katmanı:** Yalnızca test verisiyle kullanılır; tabloya girmez.
    - **Cloudflare (Turnstile):** Aktarım vardır; standart sözleşme gerekir (H03). Tabloya eklenir.
    - **Netgsm:** Yurt içinde, veri işleyendir; md. 9 uygulanmaz. md. 12/2'ye uygun yazılı veri işleme sözleşmesi imzalanır.
    - **iyzico:** Yurt içinde, bağımsız veri sorumlusudur (H16).
    - **WhatsApp/Meta:** Operasyonun tek kullanımlık parolayı WhatsApp'la iletmesi **derhal durdurulur**. Düzenli bir uygulamadır ve Meta ile standart sözleşme yoktur. Parola SMS ile ya da telefonda sözlü verilir. Şirket operasyonel bildirim, kod, rapor ya da fatura bilgisini WhatsApp'la göndermez. Sitede WhatsApp iletişim kanalı olarak ilan edilmez. İletişim tercihi “WhatsApp” kalabilir; mesajların şimdilik SMS olarak gittiği yazılır.
    - **Google:** Gemini tabloya girmez. Şirket'in e-posta ya da ofis sağlayıcısı (kvkk@ posta kutusu dahil) yurt dışındaysa tabloya eklenir ve standart sözleşme yapılır (T01).
    - **Harici harita altlığı (OSM vb.):** Tarayıcının IP adresi o servise gider. Üretimde kendi altyapımızdan ya da vekil sunucudan sunulur (H03, T12).
- **Açık Rıza Metni md. 1 tamamen çıkarılır.** ai-worker'a rıza denetimi eklenmez ve kayıt formuna kutu konmaz.
- **ai-worker kapısı:** Rıza denetiminin yerine, varsayılan olarak kapalı bir yapılandırma kapısı gelir. Gerçek bahçe verisi, yurt dışındaki bir sağlayıcıya ancak o sağlayıcının standart sözleşme kaydı ortamda tanımlıysa gider (`ORCHADOS_AI_TRANSFER_SAFEGUARD`). Kayıt yoksa yalnızca yerel model ya da test verisi çalışır. Kapı değerlendirme (eval) ve `--no-write` çalıştırmalarını da kapsar.
- **İsteğe bağlı ek risk azaltma:** Kişi görünen kesitlerin yapay zekâya gönderilmemesi (Uzman B, “Yol B”). Standart sözleşmenin yerine geçmez. Takma adlı veri kişisel veri olmaya devam eder. Zorunlu değildir (T26).

**Dayanak.** KVKK md. 9 (7499 sayılı Kanun ile değişik; RG 12.03.2024, yürürlük 01.06.2024): 9/1 yeterlilik, 9/4 uygun güvenceler ve standart sözleşmenin beş iş günü içinde Kurum'a bildirimi, 9/6 arızi aktarım halleri; Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik (RG 10.07.2024, 32598); Kurul'un ilan ettiği standart sözleşme metinleri; md. 12/2 (veri işleyenle sözleşme); md. 18 (bildirim yükümlülüğüne aykırılıkta idari para cezası); md. 4/2-ç (veri en aza indirme).

**Gerekçe.**
- 2024 değişikliğinden sonra açık rıza yalnızca süreklilik göstermeyen, olağan faaliyet akışı dışındaki aktarımlarda dayanaktır.
- Her ziyaretin bütün kesitleri yapay zekâya gider; veritabanı, barındırma ve robot doğrulaması her istekte çalışır. Bunların hepsi olağan faaliyetin parçasıdır.
- Rızaya dayalı bir aktarım, rıza geri alınınca durmak zorunda kalır. Bu ürünü kırılgan yapar ve hukuken de geçersizdir.
- Büyük sağlayıcıların Türk metnini değiştirmeden imzalayıp imzalamayacağı belirsizdir. Bu nedenle karar, imzalanmazsa izlenecek yolu baştan belirler.
- **Uzlaştırma:** İki uzman çekirdekte birleşiyor. Uzman B'nin “Yol B”si (rastgele kimlik, kişi görünen kesitleri göndermeme) md. 9'u devre dışı bırakan bir çözüm olarak kabul edilmedi. Takma adlı veri kişisel veridir ve görüntüdeki arazi yeri ele verebilir. Bu nedenle Yol B yalnızca isteğe bağlı ek önlem olarak alındı. Uzman A'nın yapılandırma kapısı benimsendi. Uzman B'nin Netgsm veri işleme sözleşmesi ve e-posta sağlayıcısı uyarısı eklendi.

**Metin değişikliği.**
- **KVKK metni §5, yurt dışı tablosu:**

| Sağlayıcı | Ne için | Verinin bulunduğu yer | Aktarılan |
| --- | --- | --- | --- |
| [Supabase Inc.] | Veritabanı, dosya deposu, giriş | Avrupa Birliği (Almanya); şirket merkezi ABD | Bu metindeki veriler |
| [Vercel Inc.] | Web sitesinin ve portalın barındırılması | Avrupa Birliği; şirket merkezi ABD | Site ve portal kullanımı sırasında geçen veriler; IP adresi ve istek kayıtları |
| [Bulut işleme sağlayıcısı: seçilince adı yazılır] | Görüntülerin işlenmesi | Avrupa Birliği | Ham video, konum kayıtları ve panoramalar (ham veri en fazla 30 gün) |
| [Anthropic PBC] | Yapay zekâ ön değerlendirmesi | Amerika Birleşik Devletleri | Yalnızca panorama kesitleri ve mozaikleri, ağaç kodu, mevsim, ölçek tanımları ve saha personelinin evet/hayır cevapları. Görüntülerde bahçede bulunan kişiler görünebilir. **Adınız, telefonunuz, tapu bilgileriniz, parsel adı, köy ve sorularınız gönderilmez.** Sonuçlar sağlayıcıda en fazla 29 gün tutulur |
| [Cloudflare Inc.] | Kayıt ve demo sayfalarında robot doğrulaması | ABD ve küresel ağ | IP adresi, tarayıcı ve cihaz bilgisi |

- **Tablonun altındaki metin:** “Bu ülkeler için yeterlilik kararı bulunmamaktadır. Sunucuların Avrupa Birliği'nde olması aktarımı ortadan kaldırmaz. Yurt dışına aktarım, Kanun'un 9. maddesinin 4. fıkrası uyarınca, her sağlayıcıyla Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşme imzalanarak ve sözleşme imzalanmasından itibaren beş iş günü içinde Kişisel Verileri Koruma Kurumu'na bildirilerek yapılır. Standart sözleşmesi bulunmayan bir sağlayıcıya kişisel veri aktarılmaz. Yapay zekâ ön değerlendirmesi başka bir sağlayıcı üzerinden yapılırsa bu tablo güncellenir.”
- **KVKK metni §5, yurt içi Netgsm maddesi:** “SMS hizmet sağlayıcısı: [Netgsm], Şirket adına veri işleyen olarak; telefon numarası ve mesaj metni (mesajda bahçe adı ve portal bağlantısı bulunabilir). İletişim tercihiniz WhatsApp olsa da mesajlar şimdilik SMS olarak gönderilir.”
- **Açık Rıza Metni:** md. 1 ve “Avukata not” silinir. Metnin yeni biçimi H06'dadır (riza-v2-taslak).
- **MVP.md** KVKK adımı 6: “Konum, fotoğraf ve kişisel veriler için aydınlatma metni verilir. Açık rıza yalnızca isteğe bağlı işlemler için ayrıca sorulur. Yurt dışı aktarım standart sözleşmeye dayanır. Görüntülerde kişiler görünebilir; bu, aydınlatma metninde belirtilir. Saklama süreleri Aydınlatma Metni §7'dedir.”
- **musteri-yonetimi.md §2** yapay zekâ maddesi: “Yapay zekâ için yurt dışı aktarım rızaya bağlanmaz. Dayanak, sağlayıcıyla imzalanıp Kurum'a bildirilen standart sözleşmedir (hukuk/kararlar.md H02). ai-worker, standart sözleşme kaydı tanımlı değilse gerçek veriyle yurt dışındaki sağlayıcıyı çağırmaz.”
- **teknik-mimari.md:** “Her şey AB'de” seçeneğindeki “standart sözleşme ve açık rıza ile” ifadesi “standart sözleşme ile (açık rıza kullanılmaz)” olur.
- **bulut-isleme.md:** Sağlayıcı seçim ölçütlerine “KVKK standart sözleşmesini değiştirmeden imzalaması (birinci ölçüt)” eklenir.
- **services/ai-worker/README.md:** “Kişisel veri kuralı” bölümüne yurt dışı aktarım kapısı eklenir.
- **kullanim-kilavuzu.md** “1. Kayıt” adım 4: “Operasyon parolayı sahibe WhatsApp'la iletir” satırı silinir. Yerine “Parola sahibe SMS ile ya da telefonda sözlü iletilir; WhatsApp kullanılmaz” yazılır.
- **demo-turu.md §12** ve **kullanim-kilavuzu.md** “3.4 AI ön değerlendirme”: Kapı notu eklenir.
- **site.ts** iletişim satırı: “Telefon ve WhatsApp” yerine “Telefon”.

**Sistem değişikliği.**
- **Bu iş:**
    - ai-worker kapısı (`ORCHADOS_AI_TRANSFER_SAFEGUARD`; yerel olmayan her sağlayıcı yurt dışı sayılır; `--test-data-only` ile çalışma serbest).
    - İletişim tercihi seçeneğinin yanına “WhatsApp seçseniz de mesajlar şimdilik SMS olarak gönderilir” notu.
- **T01:** Standart sözleşmeler, Kurum'a bildirim, kayıt tablosu.
- **T12:** Harita altlığı ve Turnstile yedeği.
- **T26 (isteğe bağlı):** Kişi algılama.

<a id="h03"></a>
## H03 – Çerezler ve Cloudflare Turnstile

**Soru.** Yalnızca zorunlu oturum çerezi ve Turnstile kullanılırken çerez onay penceresi gerekir mi? Turnstile yurt dışı aktarım mıdır, hukuki sebebi nedir, nasıl yazılmalı?

**Karar.**
- **Çerez onay penceresi gerekmez.** Supabase oturum çerezi ile Turnstile çerezleri ve sinyalleri, istenen hizmetin (giriş, kayıt, demo) sunulması ve güvenliği için kesinlikle gereklidir. Açık rıza aranmaz; aydınlatma yapılır.
- **Hukuki sebepler:** Oturum çerezinde md. 5/2-c, Turnstile'da md. 5/2-f (kötüye kullanımın önlenmesi, bilgi güvenliği).
- **Pencere gösterilmemesinin şartı:** Analitik, reklam ya da izleme çerezi ve harici gömülü içerik kullanılmamasıdır. Biri eklenirse, çalışmadan önce onay mekanizması kurulur.
- **Turnstile md. 9 anlamında yurt dışı aktarımdır** ve düzenlidir. Standart sözleşme imzalanır ve Kurum'a bildirilir. Cloudflare imzalamazsa Turnstile, kendi sunucumuzda çalışan bir robot doğrulamasıyla (açık kaynak proof-of-work) değiştirilir. Oran sınırları ve “gizli anahtar yoksa kayıt kapalı” davranışı korunur.
- **Harici harita altlığı:** Üretimde tarayıcıdan doğrudan üçüncü taraf bir sunucuya gitmez. Kendi altyapımızdan ya da vekil sunucudan sunulur. Bugünkü OSM karo sunucusu varsayılanı yalnızca geliştirme içindir.
- **Sunucu kayıtları:** En fazla 30 gün olarak yazılır. Bu süre Supabase Pro (7 gün), Team (28 gün) ve Vercel planlarını kapsar. Seçilen plan ya da bir log aktarımı (log drain) bu süreyi aşarsa metin önce güncellenir.

**Dayanak.** KVKK md. 5/2-c, 5/2-f, md. 9, md. 10; Kurum'un Çerez Uygulamaları Hakkında Rehberi (kesinlikle gerekli çerezlerde açık rıza aranmaması; analitik ve pazarlama çerezlerinde açık rıza); Aydınlatma Tebliği; Yurt Dışına Aktarım Yönetmeliği.

**Gerekçe.**
- Türkiye'de ayrı bir e-gizlilik düzenlemesi yoktur; çerezler KVKK ve Kurum'un rehberine tabidir.
- Rehber, oturum ve güvenlik çerezlerini rıza gerektirmeyen çerezler arasında sayar.
- Asıl mesele çerez değil, Cloudflare'e giden IP ve cihaz sinyalidir. Bu nedenle md. 9 kuralı uygulanır.
- Log süresinde gerçeği aşağıda gösteren bir ifade (7 gün) aydınlatmayı yanıltıcı yapabilir.
- **Uzlaştırma:** İki uzman bütün esaslarda birleşiyor. Log süresinde Uzman A 7 gün, Uzman B 30 gün önerdi. Metnin plan değişikliğinde de doğru kalması için 30 gün seçildi; plan deployment.md'de sabitlenir.

**Metin değişikliği (gizlilik-v2-taslak).**
- **§2, maddeler sırasıyla:**
    - “Sitenin herkese açık sayfalarında hesap açmadıkça sizden kişisel veri istenmez.”
    - “Sunucu ve altyapı kayıtlarında, güvenlik amacıyla, IP adresi ve istek zamanı en fazla 30 gün tutulur.”
    - “Kayıt formunda ve demo turunu başlatma sayfasında, kötüye kullanımı ve otomatik kayıtları önlemek için Cloudflare Inc.'in Turnstile hizmeti kullanılır. Bu hizmet doğrulama için IP adresinizi, tarayıcı ve cihaz bilgilerinizi işler. Hukuki sebep, bilgi güvenliğine ilişkin meşru menfaatimizdir (KVKK md. 5/2-f). Veriler ABD'de yerleşik sağlayıcıya, Kanun md. 9'a uygun standart sözleşmeyle aktarılır.”
    - “Reklam ve izleme amaçlı üçüncü taraf araç (analitik, reklam pikseli) kullanılmaz.”
- **§3, ilk paragraf:** “Yalnızca sitenin ve portalın çalışması ve güvenliği için kesinlikle gerekli çerezler kullanılır. Oturum çerezi talep ettiğiniz hizmetin sunulması (KVKK md. 5/2-c), robot doğrulaması çerezleri bilgi güvenliği (md. 5/2-f) için kullanılır. Bu çerezler için onayınız istenmez; bu nedenle çerez onay penceresi gösterilmez. Analitik, reklam ya da izleme çerezi kullanılmaz; ileride kullanılırsa önceden onayınız istenir.”
- **§3, çerez tablosu:** Turnstile satırı “Robot doğrulaması (kayıt ve demo turu başlatma sayfaları) · Kısa süreli” olur.
- Bütün “[avukat …]” notları silinir.
- **KVKK metni §5:** Cloudflare satırı (H02).
- **docs/hukuk/README.md** kural: “Siteye yeni bir üçüncü taraf betik, çerez ya da harici kaynak eklenmesi gizlilik metninin güncellenmesine ve sürümünün artırılmasına bağlıdır.”
- **deployment.md** “Log saklama”: Seçilen planlar ve süreler sabitlenir. Gizlilik metninin “en fazla 30 gün” dediği yazılır; log aktarımı kurulursa önce metin değişir. Üretimde `NEXT_PUBLIC_MAP_STYLE_URL` kendi altyapımızı göstermelidir.

**Sistem değişikliği.**
- **Bu iş:** Yok (metin ve doküman).
- **T12:** Harita altlığının kendi altyapımızdan ya da vekil sunucudan sunulması. Cloudflare standart sözleşmeyi imzalamazsa kendi barındırdığımız doğrulamaya geçilmesi.

<a id="h04"></a>
## H04 – VERBİS kaydı

**Soru.** Şirket'in VERBİS'e kayıt yükümlülüğü var mı? Konum, görüntü ve yurt dışı aktarım muafiyeti etkiler mi?

**Karar.**
- **Muafiyet şartları:** Şirket, aşağıdakilerin üçü birlikte sağlandığı sürece VERBİS kaydından muaftır:
    - yıllık çalışan sayısı 50'den az,
    - yıllık mali bilanço toplamı 100 milyon TL'den az,
    - ana faaliyet konusu özel nitelikli kişisel veri işleme değil.
- **LTD için ölçüt:** Şirket bilanço esasına göre defter tutar. Bu nedenle çalışan ve bilanço ölçütleri birlikte aranır.
- **Muafiyeti etkilemeyenler:** Bahçe denetimi özel nitelikli veri işleme faaliyeti değildir. Konum verisi, 360° görüntüler, saha personelinin GNSS izi ve yurt dışı aktarım muafiyeti etkilemez. Yüz tanıma yapılmadığı için görüntüler biyometrik veri sayılmaz.
- **Muafiyetin sınırı:** Muafiyet yalnızca sicil kaydını kaldırır. Aydınlatma, md. 9 bildirimi, veri güvenliği, başvurular ve süreli silme yükümlülükleri sürer.
- **Yıllık kontrol:** Şirket iki rakamı her yıl beyannamelerden (muhtasar ve prim hizmet beyannameleri, kurumlar vergisi beyannamesi ekindeki bilanço) kontrol eder ve yazılı kayda geçirir. Eşiklerden biri aşılırsa kayıt yapılır ve saklama ve imha politikası zorunlu hale gelir.

**Dayanak.** KVKK md. 16 ve 16/2; Veri Sorumluları Sicili Hakkında Yönetmelik; Kurul'un VERBİS istisna kararları; 04.09.2025 tarihli ve 2025/1572 sayılı Kurul kararı (ana faaliyeti özel nitelikli veri işleme olmayanlar için 50 çalışan / 100 milyon TL; ana faaliyeti özel nitelikli veri işleme olanlar için ayrı alt eşik); 25.12.2025 tarihli ve 2025/2393 sayılı karar ile 12.01.2026 tarihli Kurum duyurusu (bilanço esasına göre defter tutanlarda iki ölçüt birlikte); Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik md. 5.

**Gerekçe.**
- İstisnayı kaldırabilecek tek nitelik ölçütü “ana faaliyetin özel nitelikli veri işleme olması”dır; bu işletmede yoktur.
- Eşikler değişebildiği için yıllık kontrol “muaf sandık” riskini kapatır.
- **Uzlaştırma:** İki uzman aynı görüşte. Kayıttan önce güncel karar metni kvkk.gov.tr'den bir kez kontrol edilir.

**Metin değişikliği.** KVKK metninde değişiklik yok. README'ye şu iç not girer: “VERBİS: Çalışan sayısı 50'den az, bilanço toplamı 100 milyon TL'den az ve ana faaliyet özel nitelikli veri işleme değilse kayıt gerekmez. [Yıl] itibarıyla çalışan [ ], bilanço [ ] TL. Her yıl beyannamelerden sonra kontrol edilir; eşik aşılırsa kayıt yapılır ve saklama ve imha politikası yürürlüğe girer.”

**Sistem değişikliği.** Yok. Şirket eylemi: T22.

<a id="h05"></a>
## H05 – Saha personeli ve uzman için aydınlatma metni

**Soru.** Saha personeli ve uzman için ayrı aydınlatma metni gerekir mi? GNSS izi ve uygulama kayıtları kapsama girer mi? Hukuki sebep ne olmalı?

**Karar.**
- **Ayrı metin:** Evet. Tek bir “Çalışan ve Saha Ekibi Aydınlatma Metni” hazırlanır. Saha personeline ve Şirket çalışanı uzmana işe başlarken imzalı ya da kayıtlı olarak verilir.
- **Kapsam:**
    - kimlik, iletişim, özlük ve bordro bilgileri,
    - kullanıcı hesabı ve giriş kayıtları,
    - tarama sırasında tutulan GNSS ham kaydı ve izi,
    - medya kayıtlarındaki “çeken” bilgisi, zaman ve kalite kayıtları,
    - denetim kaydı (aktör, rol, zaman),
    - personelin göründüğü görüntüler,
    - uzmanın raporda görünen adı, unvanı ve onayı.
- **Hukuki sebepler:**
    - Hesap, görev ataması, “çeken” bilgisi ve tarama kaydı: iş sözleşmesinin ifası (md. 5/2-c).
    - SGK, vergi ve iş sağlığı ve güvenliği kayıtları: hukuki yükümlülük (md. 5/2-ç).
    - Denetim kaydı, kalite kontrolü ve uyuşmazlıkta ispat: meşru menfaat (md. 5/2-f).
    - İş ilişkisinde açık rıza istenmez.
- **GNSS'in sınırı:** GNSS izi yalnızca tarama sırasında, Şirket ekipmanıyla ve bahçe ölçümü için tutulur. Mesai dışında ya da kişisel cihazda konum toplanmaz. İz sürekli takip ya da performans değerlendirmesi için kullanılmaz; böyle bir kullanım düşünülürse metin önceden güncellenir.
- **Uzmanın statüsü:**
    - Şirket çalışanıysa bu metin uygulanır.
    - Bağımsız mühendis ya da başka bir şirketse, müşteri verileri bakımından veri işleyendir. md. 12/2'ye uygun yazılı veri işleme ve gizlilik sözleşmesi imzalanır: talimatla işleme, gizlilik, alt işleyen yasağı, güvenlik, ihlal bildirimi, sözleşme sonunda silme ya da iade. Kendi verileri için aynı metin ona da verilir.
- **Raporda uzman adı:** Raporu onaylayan uzmanın adı ve unvanı, demo dışında raporda ve portalda gösterilir. Bu sözleşmenin vaadidir (uzman imzalı rapor) ve sorumluluk zincirinin gereğidir.
- **Sahiplere personel izi gösterilmez.** Sahipler yalnızca sınırı ve ağaç konumlarını görür.

**Dayanak.** KVKK md. 4, 5/2-c, 5/2-ç, 5/2-f, md. 10, md. 12/1–2; Aydınlatma Tebliği; Kurum'un Açık Rıza Rehberi (iş ilişkisinde rızanın özgürlüğü); 4857 sayılı İş Kanunu md. 75; 6331 sayılı İSG Kanunu.

**Gerekçe.**
- “Çeken” bilgisi ve GNSS izi belirli bir çalışanla ilişkilidir; o çalışanın kişisel verisidir.
- Müşteri aydınlatma metni çalışan ilişkisini kapsamaz.
- Konum kaydını iş süresi ve iş amacıyla sınırlamak ölçülülüğü sağlar.
- **Uzlaştırma:** Uzman A iki ayrı metin, Uzman B tek metin önerdi. İş ilişkisinin farkları tek metinde ayrı bir bölümle karşılanabildiği için tek metin seçildi. Uzman A'nın uzman adının gösterilmesi ve GNSS izinin sahiplere gösterilmemesi önerileri benimsendi.

**Metin değişikliği.**
- **Yeni belge** `docs/hukuk/calisan-aydinlatma-metni.md` (personel-v1-taslak). Bölümleri: veri sorumlusu; işlenen veriler (kapsam listesi); amaçlar; hukuki sebepler; alıcılar (SGK, vergi idaresi, mali müşavir, H02'deki altyapı sağlayıcıları ve yurt dışı aktarım); saklama süreleri; md. 11 hakları ve başvuru.
    - Saklama süreleri:
        - ham GNSS ve video: en fazla 30 gün,
        - “çeken” bilgisi ve denetim kaydı: ilgili raporla birlikte 10 yıl,
        - özlük: iş ilişkisinin sona ermesinden sonra 10 yıl.
    - Zorunlu cümleler:
        - “Konumunuz yalnızca bahçe taraması sırasında, Şirket ekipmanıyla ve bahçe ölçümü amacıyla kaydedilir. Mesai dışında ya da kişisel cihazınızda konum toplanmaz. Konum kaydınız sürekli takip ya da performans değerlendirmesi için kullanılmaz.”
        - “Raporu onaylayan uzman olarak adınız ve unvanınız raporlarda bahçe sahibine ve davet ettiği hissedarlara gösterilir.”
    - Ayrı bölüm: “Şirket çalışanı olmayan uzman ve saha görevlileri.” Veri işleyen sıfatı ve yazılı sözleşme yükümlülüğü burada yazılır.
- **KVKK metni §5, yurt içi ilk madde:** “Hizmeti birlikte yürüttüğümüz uzman (ziraat mühendisi) ve saha personeli: Şirket çalışanı olarak ya da Şirket adına ve talimatıyla çalışan veri işleyen olarak; yalnızca görev için gerekli bilgiler.”

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T23 (doğrulama):**
    - Yayımlanan rapor PDF'inde ve portalda onaylayan uzmanın adı ve unvanı gösteriliyor mu? Gösterilmiyorsa eklenir.
    - Sahiplere personelin GNSS izi gösterilmiyor mu? Gösteriliyorsa kaldırılır.
- **T02:** Uzman dışarıdan çalışıyorsa veri işleme sözleşmesi; personel metninin teslimi.

<a id="h06"></a>
## H06 – Ticari elektronik ileti (6563) ve İYS

**Soru.** Hizmet SMS'leri onaysız ve İYS kaydı olmadan gönderilebilir mi? Tanıtım rızası KVKK açık rızası olarak mı, ETK onayı olarak mı kurgulanmalı? İkisi aynı kutuda olabilir mi? İYS pilotta zorunlu mu? Tacirde fark var mı?

**Karar.**
- **Hizmet iletileri:** Önceden onay ve İYS kaydı olmadan gönderilebilir. Kapsam:
    - rapor hazır, kritik bulgu, ziyaret tarihi,
    - teklif hazır, başvuru sonucu, yenileme teklifi hazır,
    - ödeme alındı, iade yapıldı, ödeme hatırlatma,
    - bahçe çıkarma bildirimleri, erişim bitiyor,
    - cayma bildiriminin teyidi, sözleşme kopyası bağlantısı,
    - giriş ve doğrulama kodları.

  Bunlar ya tanıtım amacı taşımadıkları için ticari elektronik ileti değildir, ya da Yönetmelik md. 6/1–2'deki onaysız gönderim halleri kapsamındadır: alınan hizmetin kullanımı, devam eden üyelik, tahsilat, borç hatırlatma ve bilgilendirme. Hissedarlara giden rapor bildirimleri de bilgilendirme iletisidir.
- **Bu iletilerin şartı:** Kampanya, indirim, yeni hizmet ya da çapraz satış içermezler. Yenileme teklifi mesajı tanıtım dili (“kampanyalı fiyat” gibi) kullanmaz.
- **Tanıtım iletisi:** İki ayrı hukuki işlemdir: 6563 md. 6'ya göre ticari elektronik ileti onayı ve KVKK'ya göre pazarlama amaçlı işleme için açık rıza. Tek bir kutuda alınabilir. Şartlar:
    - metin ikisini de açıkça içerir,
    - kanal bazındadır,
    - işaretsiz ve isteğe bağlıdır,
    - hizmete şart bağlanmaz,
    - aydınlatmadan ayrıdır.

  Bugün yalnızca SMS kullanıldığı için kutu “kısa mesaj (SMS)” kanalını kapsar. Başka bir kanal açılırsa metin ve sürüm güncellenir.
- **İYS:** İYS dışında alınan onay, Yönetmelik'teki süre içinde (üç iş günü) İYS'ye kaydedilmezse geçersizdir. Bugün İYS kaydı ve entegrasyonu olmadığından:
    - Tanıtım kutusu kayıt formundan ve Hesabım › İzinler'den **kaldırılır**.
    - Kutu, Şirket İYS'ye kaydolup onayları süresi içinde aktaran ve ret bildirimlerini alan entegrasyon kurulduktan sonra açılır.
    - Pilotta tanıtım iletisi gönderilmediği sürece İYS kaydı zorunlu değildir.
    - Şimdiye kadar toplanmış `explicit_marketing` kayıtları silinmez. Bu kayıtlara dayanılarak ileti gönderilmez. İYS açıldığında onay yeniden sorulur; bu kayıtlar İYS'ye yüklenmez.
- **Tacir:** Mevzuat esnaf ve tacire onaysız ticari ileti gönderilmesine izin verir (ret hakkı saklıdır). Müşterinin tacirliği güvenle ayırt edilemediği için herkese aynı kural uygulanır: tanıtım yalnızca onayla gönderilir.
- **WhatsApp:** Sözleşme Md. 14'te bildirim kanalı olarak gösterilmez (mesajlar şimdilik SMS ile gider; H02).

**Dayanak.** 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun md. 6, 7, 8; Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (RG 15.07.2015, 29417; 2020 değişiklikleri): md. 5 (onay), md. 6/1 (alınan hizmetin kullanımı, bakımı, değişikliği), md. 6/2 (devam eden üyelik, tahsilat, borç hatırlatma ve tanıtım içermeyen bilgilendirmeler), md. 6/3 (esnaf ve tacirler), ret ve İYS hükümleri (onayların süresinde İYS'ye kaydı); KVKK md. 3/1-a, md. 5/1, md. 10; Aydınlatma Tebliği (aydınlatma ile açık rızanın ayrı yapılması).

**Gerekçe.**
- Asıl risk, hizmet şablonlarına zamanla tanıtım dilinin sızmasıdır. Kural metne ve teste bağlanır.
- İYS'ye kaydedilmeyen onay hukuken işe yaramaz. Projenin “işlevi olmayan bir rıza düğmesi yayımlanmaz” ilkesi de kutunun şimdilik kaldırılmasını gerektirir.
- **Uzlaştırma:** Uzman A, KVKK açık rızası ile ETK onayının aynı kutuda açıkça birlikte alınmasını önerdi. Uzman B, ETK onayı ile “kanunda öngörülme” (md. 5/2-a) dayanağını önerdi. Daha koruyucu olduğu için Uzman A'nın kurgusu seçildi. Kutu, Uzman B'nin önerdiği gibi tek ve açık bir onay metnine taşındı. Mevcut onaylar için Uzman B'nin iki seçeneğinden “yeniden sorma” seçildi, çünkü v1 onayları süresinde İYS'ye yüklenmedi.

**Metin değişikliği.**
- **Açık Rıza Metni (riza-v2-taslak; başlık: “Açık Rıza ve Ticari Elektronik İleti Onayı Metni”):**
  “Bu metin, açık rızanıza ve ticari elektronik ileti onayınıza dayanan tek işlemi anlatır: tanıtım iletilerinin gönderilmesi. Hizmetin verilmesi için gereken işlemler (görüntülerin işlenmesi ve hizmet sağlayıcılara aktarımı dahil) açık rızaya dayanmaz; [Aydınlatma Metni](kvkk-aydinlatma-metni.md)'nde yazılı hukuki sebeplere ve güvencelere dayanır.
  > Bu onay, Şirket'in İleti Yönetim Sistemi (İYS) kaydı ve entegrasyonu tamamlandıktan sonra kayıt formunda ve portalda sorulur. O tarihe kadar size tanıtım iletisi gönderilmez.
  **Tanıtım iletileri**
  ☐ OBA Bilişim Teknolojileri LTD.'nin orchadOS hizmetine ilişkin yenilik, kampanya ve tanıtımlarını bana kısa mesajla (SMS) göndermesine ticari elektronik ileti onayı veriyorum ve bu amaçla adımın ve telefon numaramın işlenmesine açık rıza veriyorum. Onayım İleti Yönetim Sistemi'ne (İYS) kaydedilir.
  - Onay vermemem hizmeti almama engel değildir.
  - Onayımı istediğim zaman portaldan (Hesabım › İzinler), İYS üzerinden ya da iletilerdeki ret yoluyla ücretsiz geri alabilirim.
  - “Rapor hazır”, “kritik bulgu”, ziyaret tarihi, teklif, ödeme, iade, hatırlatma ve erişim bildirimleri ile giriş kodları bu onaya bağlı değildir; hizmetin parçası olarak gönderilir ve tanıtım içermez.”

  Altında imza satırı (ad soyad, tarih, imza ya da portal onayı).
- **KVKK metni §3:**
    - Amaç 3: “Hizmete ilişkin bildirimlerin gönderilmesi: rapor hazır, kritik bulgu, ziyaret tarihi, teklif, başvuru sonucu, ödeme, iade, ödeme hatırlatma, bahçe çıkarma ve erişim bildirimleri ile giriş kodları. Bu bildirimler tanıtım içermez.”
    - Yeni amaç 8: “Onay vermeniz halinde tanıtım iletilerinin gönderilmesi. Bu onay, İleti Yönetim Sistemi (İYS) kaydımız tamamlandıktan sonra ayrıca ve isteğe bağlı olarak sorulur.”
- **KVKK metni §4 tablosu:** Yeni satır “8 | Açık rızanız (md. 5/1) ve 6563 sayılı Kanun md. 6 uyarınca ticari elektronik ileti onayınız”.
- **Sözleşme Md. 14:** “Taraflar, Madde 1'deki adreslerini tebligat adresi olarak kabul eder. Hizmete ilişkin bildirimler SMS, e-posta ya da portal üzerinden yapılır; iletişim tercihi WhatsApp olan Sahip'e de bildirimler şimdilik SMS olarak gönderilir. Hizmete ilişkin bildirimler tanıtım içermez.”
- **Sözleşme Ek-4:** “Açık rıza ve ticari elektronik ileti onayı metni (isteğe bağlı; İYS kaydından sonra sorulur).”
- **İade Politikası §6:** “size SMS ya da WhatsApp ile bildirim gelir” yerine “size SMS ile bildirim gelir”.
- **site.ts:** “SMS ya da WhatsApp ile bağlantı” yerine “SMS ile bağlantı”. back-office.ts'deki “müşteriye SMS ya da WhatsApp gider” ifadesi “müşteriye SMS gider” olur.

**Sistem değişikliği.**
- **Bu iş:**
    - Tanıtım kutusu `MARKETING_CONSENT_ENABLED = false` ile gizlenir. Sunucu, kapalıyken bu rızanın verilmesini reddeder; geri almaya izin verir. Daha önce verilmiş rıza portalda yalnızca geri alınabilir olarak gösterilir.
    - Bildirim şablonlarında tanıtım ifadesi olmadığını denetleyen test eklenir.
- **T22:**
    - İYS başvurusu ve entegrasyonu: onayların süresinde yüklenmesi, ret senkronu.
    - Netgsm'de hizmet SMS'lerinin bilgilendirme (ticari olmayan) türüyle gönderildiğinin doğrulanması.

<a id="h07"></a>
## H07 – Sınır ibaresi ve mülkiyet uyuşmazlıkları

**Soru.** “Fiili kullanım sınırı” ibaresi tapu ve mülkiyet uyuşmazlıklarında Şirket'i yeterince korur mu? Ek hüküm gerekir mi?

**Karar.**
- **İbare gereklidir ve korunur, ama tek başına yeterli değildir.** Sözleşme yalnızca taraflar arasında hüküm doğurur; komşuyu, diğer hissedarı ya da mirasçıyı bağlamaz. Mahkemenin raporu ya da haritayı delil olarak istemesini de engellemez.
- **Eklenen hükümler:**
    1. **Sahip'in beyan sorumluluğu:** Sınırın fiilen Sahip'in kullanımındaki alanı yansıttığı ve giriş izni verme yetkisi bulunduğu beyan edilir. Gerçeğe aykırı beyandan doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur.
    2. **Portal onayı ve ücretsiz düzeltme:** Hata eldeki verilerle düzeltilebiliyorsa hemen düzeltilir; sahada ölçüm gerekiyorsa sonraki periyodik ziyarette yapılır. İki durumda da düzeltme ücretsizdir. Doğrulanan alan küçülürse kalan ziyaretlerin bedeli yeni alana göre yeniden hesaplanır ve fark iade edilir. Alan büyürse o dönem için fark istenmez.
    3. **Üçüncü kişi itirazı:**
        - Uyuşmazlık konusu alan değerlendirme dışında bırakılabilir ve raporda “değerlendirilmedi” olarak gösterilir.
        - İtiraz bütün Bahçe'yi kapsıyorsa tarama askıya alınabilir.
        - Askı pencere sonuna kadar sürerse Bahçe Md. 12/3'e göre çıkarılabilir; kullanılmayan ziyaretlerin bedeli iade edilir.
    4. **Ölçümün niteliği:** Kadastro ölçümü değildir; resmi bir sınır belirlemez. Şirket bilirkişi görüşü ya da taraflardan biri lehine kanıt düzenlemez. Kanuni zorunluluklar saklıdır.
    5. **İbarenin yeri:** Her raporda, PDF'in her sayfasında ve harita görünümünde yer alır.

**Dayanak.** TBK md. 1, 20–25, 26–27 (sözleşme serbestisi, genel işlem koşulları), md. 112 vd.; TMK md. 683, 688 vd., 973 vd. (mülkiyet, paylı mülkiyet, zilyetlik); HMK md. 187 vd. (delil serbestisi); 3402 sayılı Kadastro Kanunu ve 5368 sayılı Kanun (resmi ölçüm); 6502 md. 5 ve Haksız Şartlar Yönetmeliği (kusura bağlı beyan sorumluluğu dengelidir).

**Gerekçe.**
- Hisseli ve rızai taksimli bahçelerde en olası uyuşmazlık, yanlış gösterilen sınır yüzünden komşu ağaçlarının raporlara girmesidir.
- Riski, riski yaratan tarafa (sınırı gösterene) yüklemek ve tüketiciye ücretsiz bir düzeltme yolu açmak dengeli bir çözümdür.
- **Uzlaştırma:** Uzman A, Sahip'ten kaynaklanan ve ziyaret gerektiren düzeltmenin ücretli olabileceğini, itirazdaki askının iadesiz olacağını önerdi. Uzman B, ücretsiz düzeltmeyi, alan farkının iadesini ve itirazda iadeli çıkarmayı önerdi. Daha koruyucu olduğu için Uzman B'nin kurgusu seçildi. Ziyaret gerektiren düzeltmenin sonraki periyodik ziyarete bağlanması ürünü yormaz. Uzman A'nın “tartışmalı alan” ve bilirkişi hükmü benimsendi.

**Metin değişikliği.**
- **Sözleşme Md. 6, tamamı:**
  “1. Haritada gösterilen sınır, Sahip'in ya da yetkilendirdiği kişinin gösterdiği **fiili kullanım sınırıdır**. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır. Bu ibare her raporda ve haritada yer alır.
  2. Sahip, gösterdiği ya da yetkilendirdiği kişiye gösterttiği sınırın fiilen kendi kullanımındaki alanı yansıttığını ve bu alana Şirket personelinin girmesine izin vermeye yetkili olduğunu beyan eder. Şirket bu beyanın doğruluğunu araştırmakla yükümlü değildir. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur.
  3. Envanterden sonra Sahip, sınırı ve ağaç listesini portalda inceler ve onaylar. Sahip sonradan bir hata fark ederse (örneğin komşu ağaçlarının envantere girmesi) portaldan bildirir. Hata eldeki verilerle ücretsiz düzeltilir; düzeltme için sahada ölçüm gerekiyorsa bu ölçüm sonraki periyodik ziyarette ücretsiz yapılır. Düzeltme sonucunda doğrulanan alan küçülürse kalan ziyaretlerin bedeli yeni alana göre yeniden hesaplanır ve fark iade edilir; alan büyürse o dönem için fark istenmez.
  4. Bahçe'nin sınırına ya da kullanımına üçüncü bir kişi itiraz ederse Şirket, uyuşmazlık konusu alanı uyuşmazlık çözülene kadar değerlendirme dışında bırakabilir; bu alan raporda “değerlendirilmedi” olarak gösterilir. İtiraz Bahçe'nin tamamını kapsıyorsa Şirket taramayı askıya alabilir. Askı ziyaret penceresinin sonuna kadar sürerse Şirket Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; kullanılmayan ziyaretlerin bedeli iade edilir.
  5. Şirket, raporları ve haritayı sınır ve mülkiyet uyuşmazlıklarında taraflardan biri lehine kanıt ya da bilirkişi görüşü olarak düzenlemez; kanuni zorunluluklar saklıdır.”
- **Ön Bilgilendirme §2** sınır maddesine şu cümle eklenir: “Sınırı siz gösterirsiniz ve envanterden sonra portalda onaylarsınız; sınırın doğruluğu sizin beyanınıza dayanır ve resmi ölçüm değildir.”

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T16:**
    - Sınır onay ekranında beyan metni gösterilir: “Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.” Onay, metin sürümü ve zamanıyla ekleme-yalnız kaydedilir.
    - Envanter kaydında sınırı gösteren kişinin adı ve rolü tutulur.
    - İbare PDF'in her sayfasında ve haritada yer alır.
    - Ops için “sınır itirazı / askı” nedeni eklenir.

<a id="h08"></a>
## H08 – Uzman görüşünün niteliği ve sorumluluk sınırlaması

**Soru.** “Teşhis değildir, tavsiye niteliğindedir” hükmü ile sorumluluğun ödenen bedelle sınırlanması tüketicide ve tacirde geçerli mi? Sorumsuzluk listesi korunabilir mi?

**Karar.**
- **(A) Edimi tanımlayan hükümler korunur ve her müşteride geçerlidir:**
    - teşhis değildir,
    - öneriler tavsiye niteliğindedir ve uygulama kararı Sahip'indir,
    - raporlar ziyaret günündeki görünür durumu yansıtır,
    - görüntüsü alınamayan ağaç “değerlendirilmedi” olarak gösterilir,
    - metodoloji sürümü raporda yazar,
    - kapsam dışı listesi.

  Bunlar sorumsuzluk kaydı değil, edimin tanımıdır. Şirket'in özen borcu saklıdır.
- **(B) Md. 11/2'deki parasal sınır tüketicide kaldırılır.** Hafif kusurda bile bedelle sınırlama haksız şart sayılma riski taşır. Uzmanlık gerektiren hizmet nedeniyle TBK 115/3 riski de vardır.
- **(C) Tacir Sahip'te sınır şu biçimde korunur:**
    - yalnızca hafif kusurda,
    - zararın doğduğu üyelik döneminde ilgili Bahçe için ödenen bedelle,
    - dolaylı zararlar (kâr kaybı, ürün değeri kaybı) hariç,
    - kast, ağır kusur, ölüm ve bedensel zarar bu sınırın dışında.

  Hüküm genel işlem koşulu olarak kalın yazılır. TBK 115/3 tartışması nedeniyle bu sınır orta risklidir; bu risk kabul edildi.
- **(D) Md. 11/3'teki liste** “Şirket'in kusurundan kaynaklanmayan” kaydıyla yeniden yazılır. Mutlak sorumsuzluk ifadesi kullanılmaz.
- **(E)** Mesleki sorumluluk sigortası önerilir (T22).

**Dayanak.** TBK md. 20–25 (genel işlem koşulları; tacirde de uygulanır), md. 115 (özellikle 115/1 ve 115/3), md. 116, md. 502/2 ve 506 (vekalet hükümleri ve özen borcu); 6502 md. 5 ve Tüketici Sözleşmelerindeki Haksız Şartlar Hakkında Yönetmelik (RG 17.06.2014) md. 5 ve Ek liste; TTK md. 18/2.

**Gerekçe.**
- Müşterilerin çoğu gerçek kişidir ve tüketici muamelesi görür (H10).
- Tüketici sözleşmesinde, önceden yazılmış ve bedelle sınırlayan bir şart büyük olasılıkla denetimden geçmez; geçersiz şartın Şirket'e yararı da yoktur.
- Asıl koruma, edimin dar ve açık tanımından gelir. Ürün kaybı, hırsızlık ya da önerinin uygulanmaması zaten Şirket'in edimi dışındadır.
- **Uzlaştırma:** İki uzman aynı sonuca vardı. Uzman B'nin dolaylı zarar hariç tutması ve “her riskin tespiti garanti edilmez” cümlesi ile Uzman A'nın kritik bulgu bildiriminin bekçilik olmadığı cümlesi birleştirildi.

**Metin değişikliği.**
- **Sözleşme Md. 11, tamamı:**
  “1. Şirket hizmeti özenle ve metodolojiye uygun olarak yürütür; kusuruyla neden olduğu zarardan kanuna göre sorumludur.
  2. Şirket'in edimi, Bahçe'nin ziyaret tarihlerindeki görünür durumunun değerlendirilmesi ve raporlanmasıdır. Şirket, kendi kusurundan kaynaklanmayan şu sonuçlardan sorumlu değildir: Bahçe'deki ürün kaybı, hırsızlık, hastalık ve zararlıların kendisi ve sonuçları; Sahip'in önerileri uygulayıp uygulamamasının sonuçları; ziyaret aralarında oluşan ve ziyarette görülemeyen değişiklikler. Ziyaretler ve kritik bulgu bildirimi, Bahçe'deki her riskin tespit edileceğini garanti etmez.
  3. **Sahip tacir Sahip ise (Madde 1): Şirket'in hafif kusurundan doğan sorumluluğu, zararın doğduğu üyelik döneminde ilgili Bahçe için ödenen hizmet bedeliyle sınırlıdır ve dolaylı zararları (kâr kaybı, ürün değeri kaybı) kapsamaz. Bu sınırlama kast ve ağır kusurda, ölüm ve bedensel zararlarda uygulanmaz.**
  4. Tüketici Sahip bakımından kanunun emredici hükümleri saklıdır.”
- **Md. 7/3:** “Değerlendirme hastalık teşhisi, laboratuvar analizi ya da verim garantisi değildir. Uzman önerilerini mesleki özenle verir; öneriler tavsiye niteliğindedir ve uygulanıp uygulanmayacağına Sahip karar verir.”
- **Md. 4/4'ün sonuna:** “Kritik bulgu bildirimi bekçilik ya da sürekli izleme hizmeti değildir; yalnızca ziyarette görülen bulgular için yapılır.”
- “[avukat: geçerliliği]” notu silinir.

**Sistem değişikliği.** Yok. Sözleşme tek metin kalır; 11/3 tacir koşuluyla yazılır.

<a id="h09"></a>
## H09 – Hisseli tapu, rızai taksim, vekil ve mirasçı: yetki beyanı ve belge

**Soru.** Tapu sahibi olmayan bir hissedarın, vekilin ya da mirasçının hizmet alabilmesi için hangi beyan ya da belge yeterlidir? Md. 5/1'deki yer tutucu nasıl doldurulur?

**Karar.**
- **Beyan yeterlidir.** Hizmet bahçe üzerinde bir tasarruf işlemi değildir. Önemli olan, Sahip'in alanı fiilen kullanması ve personelin girişine izin verme yetkisidir. Bu nedenle yazılı yetki beyanı ve zorunlu giriş izni yeterlidir.
- **Belge rutin olarak istenmez ve saklanmaz** (tapu, vekâletname, veraset ilamı, muvafakat). Rutin toplama veri en aza indirme ilkesine aykırıdır ve bu belgeler gereksiz üçüncü kişi verisi içerir.
- **Şüphe ya da itiraz halinde:** Şirket belgeyi görmek isteyebilir. Yalnızca türü, tarihi ve gören kişi kaydedilir; kopya saklanmaz.
- **Hissedar muvafakati aranmaz.** Rızai taksimde paydaşın kendi kullandığı bölüm için beyanı yeterlidir. Paylaşılmamış mirasta mirasçının beyanı yeterlidir. Diğer malik, paydaş ya da mirasçı itiraz ederse Md. 6/4 uygulanır.
- **Seçenekler genişletilir.** Yeni enum değeri açmak yerine mevcut üç değerin etiketleri genişletilir; ayrımı tapu bilgisindeki “hisseli mi” alanı tamamlar. Enum adlarının yeniden düzenlenmesi isteğe bağlıdır (T09'a eklenmedi; gerekmez).

**Dayanak.** TBK md. 1, 12, 26–27, 40; TMK md. 688 vd. (paylı mülkiyet), md. 701 vd. (elbirliği mülkiyeti), md. 973 vd. (zilyetlik); Yargıtay içtihadında rızai (fiili) taksimin paydaşlar arasında kullanım anlaşması sayılması; KVKK md. 4/2-ç; 6502 md. 5.

**Gerekçe.**
- Şirket'in gerçek riski mülkiyetin doğrulanması değil, izinsiz giriş ve üçüncü kişi itirazıdır. Bunu beyan, giriş izni, sınırı gösteren kişinin kaydı ve itiraz prosedürü karşılar.
- Seçeneklerin eksik olması kullanıcıyı gerçeğe aykırı bir seçenek işaretlemeye zorlar ve beyanın değerini düşürür.
- **Uzlaştırma:** İki uzman da belge toplanmamasını ve seçeneklerin genişletilmesini önerdi. Uzman A ve B'nin yeni enum değerleri yerine, aynı sonucu migration olmadan veren etiket genişletmesi seçildi. Bu sonuç “hisseli mi” alanıyla birlikte aynı bilgiyi verir.

**Metin değişikliği.**
- **Sözleşme Md. 5/1:** “Sahip, Bahçe'nin maliki, paydaşı (hisseli tapuda rızai taksimle kullandığı bölüm dahil), mirasçısı ya da malikin veya paydaşların izniyle Bahçe'yi kullanan kişi (vekil, kiracı, ortakçı) olduğunu ve Şirket personelinin Bahçe'ye girmesine izin vermeye yetkili olduğunu beyan eder; dayanağını başvuruda seçer. Şirket belge istemekle yükümlü değildir. Şüphe ya da itiraz halinde tapu kaydı, vekâletname, mirasçılık belgesi ya da kira sözleşmesi gibi dayanak belgesini görmek isteyebilir; görülen belgenin türü ve tarihi kaydedilir, kopyası saklanmaz. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur. Bir malik, paydaş ya da mirasçı itiraz ederse Madde 6/4 uygulanır.”
- **Başvuru formundaki etiketler (portal-billing.ts `authorizationValues`):**
    - `title_holder`: “Tapu sahibiyim ya da hisseli tapuda paydaşım (kullandığım bölüm; rızai taksim dahil)”
    - `heir_declaration`: “Mirasçıyım (paylaşılmamış miras)”
    - `power_of_attorney`: “Malikin ya da paydaşların izniyle kullanıyorum (vekil, kiracı, ortakçı)”
- **Giriş izni kutusu (`entryPermission`):** “Bu bahçeyi seçtiğim dayanakla fiilen kullanıyorum. Ekibinizin envanter ve ziyaretler için bahçeye girmesine izin veriyorum ve buna yetkiliyim.”
- **KVKK metni §2:** “yetki ve giriş izni beyanı” korunur; tapu bilgisi “isteğe bağlı, yalnızca kayıt amaçlı” kalır.

**Sistem değişikliği.**
- **Bu iş:** Etiket değişiklikleri (back office'teki aynı etiketler dahil).
- Belge yükleme eklenmez. “Belge görüldü” notu ops'un mevcut not alanına yazılır.

<a id="h10"></a>
## H10 – Tüketici ve tacir niteliği; cayma; yetkili mahkeme

**Soru.** Bahçe sahibi tüketici sayılır mı? Tacirde ne değişir? Sistem tacirde caymayı kapatmalı mı; tacirlik neye göre belirlenir? Md. 15 nasıl yazılmalı?

**Karar.**
- **Ölçüt:** 6502 md. 3/1-k'dir: kişi ticari ya da mesleki olmayan bir amaçla mı hareket ediyor? Satış için üretim yapan çiftçinin tarımsal girdi niteliğindeki hizmet alımında içtihat çoğunlukla tüketicilik kabul etmez. Ancak küçük, mirasla bahçe edinmiş ya da bahçeden uzakta yaşayan sahipler için içtihat yeknesak değildir ve ispat yükü Şirket'tedir.
- **Tüketici Sahip:** Fatura profili “bireysel” olan bütün gerçek kişiler tüketici muamelesi görür. Ön bilgilendirme, cayma, haksız şart denetimi, hakem heyeti ve tüketici mahkemesi uygulanır; yetki şartı uygulanmaz.
- **Tacir Sahip:** Fatura profili “şirket” olan (unvan ve VKN ile tüzel kişi ya da ticari işletme adına) Sahip sözleşmede “tacir Sahip” sayılır. Ayrı bir beyan kutusu gerekmez. Profil seçeneğinin açıklaması bunu söyler.
- **Bu sınıflandırmanın sınırı:** Yalnızca hangi sözleşme hükümlerinin (11/3, 15/2) uygulanacağını belirler. Sahip'in kanuni niteliği bundan bağımsızdır; tüketici sayılan Sahip'in kanuni hakları saklıdır.
- **Cayma tacirde kapatılmaz.** Şirket aynı hakkı tacir Sahip'e sözleşmeyle tanır. Sistem değişmez.
- **Tacirde değişenler:**
    - kanuni cayma ve ön bilgilendirme yükümlülüğü uygulanmaz (sözleşmesel hak sürer),
    - şart denetimi 6502'ye göre değil, TBK md. 20–25'e göre yapılır,
    - hakem heyeti ve tüketici mahkemesi yerine asliye ticaret ya da asliye hukuk mahkemesi ve ticari arabuluculuk,
    - yetki şartı geçerlidir,
    - Md. 11/3 sorumluluk sınırı uygulanır.
- **Md. 15:** Tüketici için kanuni yollar ve dava şartı arabuluculuk yazılır; Gaziantep yetkisi yalnızca tacir Sahip için yazılır.
- **Kâğıt (pilot) sözleşmeler:** Ops'un köyde, bahçede ya da sahibin evinde imzalattığı sözleşme “işyeri dışında kurulan sözleşme”dir. Ayrı yazılı şekil, cayma formu, nüsha teslimi ve cayma süresi içinde ödeme istenmemesi kuralları uygulanır. Karar:
    - Kâğıt sözleşme yalnızca Şirket'in işyerinde imzalanır.
    - İşyeri dışında sözleşme portalda, teklif onayıyla (mesafeli) kurulur.
    - İşyeri dışı kâğıt sürüm gerekirse ayrıca hazırlanır (T24).

**Dayanak.** 6502 md. 3/1-k ve l, md. 5, md. 47, md. 48, md. 68, md. 73 (tüketicinin yerleşim yeri mahkemesi), md. 73/A (dava şartı arabuluculuk); Mesafeli Sözleşmeler Yönetmeliği md. 5 (RG 24.05.2025, 32909 ile değişik; yürürlük 01.01.2026: başvuru yolları ve arabuluculuk bilgisi); İşyeri Dışında Kurulan Sözleşmeler Yönetmeliği; HMK md. 17 (yetki sözleşmesi yalnızca tacirler ve kamu tüzel kişileri arasında); TTK md. 5/A, 12; TBK md. 20–25.

**Gerekçe.**
- Yanlış sınıflandırmanın maliyeti asimetriktir. Tüketiciye tüketici haklarını tanımamak cayma süresinin bir yıla uzaması, tam iade, idari para cezası ve haksız şartın geçersizliği demektir. Tüketici olmayana bu hakları tanımak ise küçük bir ticari maliyettir.
- Fatura profili türü, sistemde zaten bulunan en nesnel göstergedir.
- **Uzlaştırma:** Uzman A tacir rejimi için “şirket profili + ticari amaç beyanı” ve tacirde caymanın kapatılmasını önerdi. Uzman B şirket profilinin yeterli olduğunu ve caymanın tacire de sözleşmeyle tanınmasını önerdi. Uzman B seçildi. Bu yol müşteri lehinedir, sistem değişikliği gerektirmez ve yanlış sınıflandırmanın zararını en aza indirir. Kâğıt sözleşme riski için iki uzmanın ortak uyarısı “yalnızca işyerinde imza” kuralına bağlandı.

**Metin değişikliği.**
- **Sözleşme Md. 1, sona:** “**Tacir Sahip:** Fatura profilinde şirket olarak (unvan ve vergi kimlik numarasıyla; tüzel kişi ya da ticari işletme adına) kayıtlı Sahip bu sözleşmede “tacir Sahip” sayılır. Diğer bütün Sahiplere tüketici hükümleri uygulanır. Bu sınıflandırma, tüketici sayılan Sahip'in kanuni haklarını sınırlamaz.”
- **Sözleşme girişi:** “Kâğıt üzerinde imza yalnızca Şirket'in işyerinde atılır; işyeri dışında sözleşme portalda kurulur.”
- **Md. 8B/6:** “Sahip tacir Sahip ise (Madde 1), Şirket bu maddedeki cayma hakkını aynı koşullarla sözleşmeye dayanarak tanır.”
- **Md. 15, tamamı:**
  “1. Tüketici Sahip, uyuşmazlıklarda Ticaret Bakanlığı'nca her yıl ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da tüketici işleminin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Bu sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açılmadan önce arabulucuya başvurulması zorunludur; dava, Sahip'in yerleşim yerindeki ya da Şirket'in yerleşim yerindeki tüketici mahkemesinde açılabilir.
  2. Tacir Sahip ile bu sözleşmeden doğan uyuşmazlıklarda Gaziantep mahkemeleri ve icra daireleri yetkilidir; dava şartı arabuluculuğa ilişkin hükümler saklıdır.”
- **Ön Bilgilendirme §6, ikinci madde:** “Tüketici, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da işlemin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açmadan önce arabulucuya başvurmak zorunludur.”
- **Fatura profili seçenekleri (billing.ts `billingPartyKind`):**
    - `individual`: “Bireysel (kendi adınıza)”
    - `company`: “Şirket (tüzel kişi ya da ticari işletmeniz adına; unvan ve VKN ile)”
- **kullanim-kilavuzu.md:** “Kâğıt sözleşme yalnızca Şirket'in işyerinde imzalatılır; sahada ya da sahibin evinde sözleşme kurulacaksa sahip teklifi portalda onaylar.”

**Sistem değişikliği.**
- **Bu iş:** Fatura profili etiketleri.
- Cayma seçeneği herkese gösterilmeye devam eder.

<a id="h11"></a>
## H11 – Cayma süresinde hizmete başlanması; açık cayma; cayma formu

**Soru.** (a) Md. 15/1 istisnası için teklif onayı yeterli mi, ayrı bir kutu mu gerekir? (b) “Cayma sürer ama yapılmış hizmet düşülür” kurgusu nasıl yazılmalı? (c) Bahçe çıkarma formundaki açık cayma seçeneği ve bildirim kanalları yeterli mi; örnek form sunulmalı mı?

**Karar.**
- **Atıf düzeltmesi:** Tüketicinin onayıyla cayma süresinde ifasına başlanan hizmetlere ilişkin istisna, Mesafeli Sözleşmeler Yönetmeliği md. 15/1-**(h)** bendidir. (ğ) bendi elektronik ortamda anında ifa edilen hizmetlere ilişkindir. Bütün metinlerde “15/1-ğ” ifadesi “15/1-(h)” olur.
- **(a) Teklif onayı tek başına yeterli değildir.** Teklif kabul ekranında ayrı, işaretsiz ve **isteğe bağlı** bir kutu ve ayrı bir onay kaydı (`early_performance`) gerekir.
    - Kutu işaretlenmezse teklif yine kabul edilir. Envanter ve ziyaretler cayma süresinin bitiminden sonra planlanır.
    - Kutunun zorunlu olmaması iradenin özgür olduğunu gösterir.
    - Planlama kuralı, cayma süresinde hizmet yapıldığında her zaman bir onay kaydı bulunmasını sağlar. Böylece kullanıcının “koşulsuz düşme” kararı fiilen korunur.
    - Onay kaydı yokken bir şekilde hizmet yapılmışsa caymada tam iade yapılır.
- **(b) Kurgu:**
    - Tüketicinin onayıyla hizmete başlanınca md. 15/1-(h) uyarınca **kanuni cayma hakkı sona erer**.
    - Md. 15/1'in giriş cümlesi “taraflarca aksi kararlaştırılmadıkça” dediği için Şirket, cayma süresinin sonuna kadar **sözleşmeden doğan bir cayma hakkı** tanır.
    - Bu hak kullanılırsa yapılmış envanterin payı ve yapılmış periyodik ziyaretlerin bedeli düşülür. Düşülen tutar yapılmış hizmetin sözleşmedeki bedelidir; cezai şart değildir.
    - Hizmete başlanmadan kullanılan cayma kanunidir ve kesintisiz tam iade gerektirir.

  Kullanıcının sabit kararı (envanter payı iade edilmez, yapılmış ziyaretler koşulsuz düşer) bu kurguyla geçerli biçimde uygulanır.
- **(c) Cayma bildirimi:** Bahçe çıkarma formunda caymanın ayrı ve açık bir seçenek olması, “30 gün sonra” ve “dönem sonunda” seçimlerinin cayma sayılmaması ve bildirimin portal, e-posta ve KEP ile yapılabilmesi uygundur. Eklenenler:
    - posta adresi de bildirim yolu olarak yazılır,
    - Yönetmelik ekindeki örnek cayma formunun uyarlaması sözleşmeye (Ek-7) ve ön bilgilendirmeye eklenir; formun kullanılması zorunlu değildir, açık yazılı beyan yeterlidir,
    - portaldan gelen cayma bildiriminin alındığı gecikmeksizin SMS ile ve portalda teyit edilir,
    - e-posta, KEP ya da postayla gelen ve bir bahçeyi belirten bildirim o bahçe için caymadır; ops bunu bildirimin ulaştığı günle kaydeder ve süre o güne göre değerlendirilir,
    - cayma süresi içinde başka bir çıkarma seçeneği seçen Sahip'e “bu seçim cayma bildirimi değildir; cayma hakkınız sürüyor” uyarısı gösterilir.
- **Geçici kural (T03 gelene kadar):** Ops, cayma süresi bitmeden hiçbir siparişte envanter ya da ziyaret planlamaz.

**Dayanak.** 6502 md. 48/4–5; Mesafeli Sözleşmeler Yönetmeliği (RG 27.11.2014, 29188) md. 5 (cayma ve cayma hakkının kullanılamayacağı hallerin bildirilmesi), md. 9 (14 gün), md. 10 (eksik bilgilendirmede sürenin uzaması), md. 11 (bildirim: yazılı ya da kalıcı veri saklayıcısıyla, ek form ya da açık beyan; internetten caymada teyit), md. 12 (14 gün içinde, aynı yöntemle, masrafsız iade), md. 15/1 giriş cümlesi ve (h) bendi, Ek (örnek cayma formu); 6502 md. 5; TBK md. 20–25.

**Gerekçe.**
- İstisna, tüketicinin hakkını kaybettiği bir haldir. Dar yorumlanır ve ispat yükü Şirket'tedir.
- Birden fazla işlemi aynı anda yapan teklif onayına gömülü bir kabul, ayrı ve bilerek verilmiş bir onay sayılmayabilir. Bu durumda yapılmış hizmetin bedeli düşülemez.
- **Uzlaştırma:** İki uzman aynı kurguya vardı: isteğe bağlı kutu, kanuni hakkın sona ermesi ve sözleşmesel hak. Uzman B'nin posta adresi, uyarı ve bildirim tarihine göre kayıt önerileri ile Uzman A'nın teyit SMS'i birleştirildi.

**Metin değişikliği.**
- **Sözleşme Md. 8B/2:** “Cayma bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazılı olarak yapılır. Ek-7'deki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir Bahçe belirtilmişse cayma yalnızca o Bahçe için kullanılmış olur. Süre içinde gönderilen bildirim yeterlidir. Şirket bildirimin alındığını gecikmeksizin SMS ile ve portalda teyit eder.”
- **Sözleşme Md. 8B/4:** “4. **Hizmete cayma süresi içinde başlanması:** Sahip, teklifi onaylarken ayrı ve işaretsiz bir kutuyu işaretleyerek hizmete (envanter ve periyodik ziyaretler) cayma süresi dolmadan başlanmasını talep edebilir. Bu talep yoksa Şirket cayma süresi bitmeden Bahçe'de envanter ve ziyaret yapmaz. Talep üzerine hizmete başlandığında Mesafeli Sözleşmeler Yönetmeliği md. 15/1-(h) uyarınca kanuni cayma hakkı sona erer. Şirket buna rağmen, cayma süresinin sonuna kadar Sahip'e aynı yollarla kullanılabilecek, sözleşmeden doğan bir cayma hakkı tanır; bu hak bütün bahçeler için ya da 5. fıkraya göre tek bir Bahçe için kullanılabilir. Bu hak kullanılırsa, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli (Madde 8A/2'deki ziyaret bedeliyle) iadeden düşülür ve kalan tutar 3. fıkradaki gibi iade edilir. Düşülen tutar yapılmış hizmetin sözleşmedeki bedelidir, cezai şart değildir. Envanter payı Madde 12/3'teki gibi hesaplanır. Hizmete başlanmadan kullanılan caymada tahsil edilen tutarın tamamı iade edilir.”
- **Teklif kabulündeki kutu metni:** “☐ Hizmete (envanter ve periyodik ziyaretler) 14 günlük cayma süresi dolmadan başlanmasını talep ediyorum. Hizmete başlandığında kanuni cayma hakkımın sona ereceğini; Şirket'in tanıdığı cayma hakkını kullanırsam yapılmış envanterin payının ve yapılmış ziyaretlerin bedelinin iade edilmeyeceğini biliyorum. Bu kutuyu işaretlemezsem envanter cayma süresinden sonra yapılır.”
- **Md. 8B/5:** Avukat notu silinir. Sona eklenir: “Cayma süresi içinde başka bir zamanlama seçilirse portal, bu seçimin cayma bildirimi olmadığını ve cayma hakkının sürdüğünü gösterir.”
- **Yeni Ek-7, örnek cayma formu:** “(Mesafeli Sözleşmeler Yönetmeliği ekindeki formun uyarlamasıdır; kullanılması zorunlu değildir.) Kime: OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]. Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim. Sipariş numarası ve ödeme tarihi: … Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı): … Hizmetin bedeli: … Adı soyadı: … Adresi: … İmzası (yalnızca kâğıt üzerinde gönderilirse): … Tarih: …”
- **Ön Bilgilendirme §5:**
    - Bildirim maddesi 8B/2 gibi yazılır.
    - “Hizmete cayma süresi içinde başlanması” maddesi şöyle olur: “Teklifi onaylarken ayrı bir kutuyu işaretleyerek hizmete cayma süresi dolmadan başlanmasını isteyebilirsiniz. İstemezseniz envanter cayma süresinden sonra yapılır. Onayınızla hizmete başlandığında kanuni cayma hakkınız sona erer (Yönetmelik md. 15/1-(h)). Şirket'in tanıdığı cayma hakkı ise cayma süresinin sonuna kadar sürer; bu hakkı kullanırsanız yapılmış envanterin payı ve yapılmış ziyaretlerin bedeli iadeden düşülür.”
    - Örnek cayma formu forma eklenir.
- **İade Politikası §2:** Son madde aynı kurguyla değişir: ayrı kutu, istenmezse envanter cayma süresinden sonra, kanuni hakkın sona ermesi, Şirket'in tanıdığı hak ve kesintiler. Bildirim maddesine posta adresi ve örnek form eklenir.
- Bütün “[avukat …]” notları silinir; “15/1-ğ” atıfları “15/1-(h)” olur (bahce-yonetimi.md §2 dahil).
- **kullanim-kilavuzu.md:** “T03 yayına alınana kadar cayma süresi (sipariş etkinleşmesinden itibaren 14 gün) bitmeden envanter ya da ziyaret planlanmaz. E-posta, KEP ya da postayla gelen cayma, bildirimin ulaştığı gün not edilerek geliştiriciye iletilir.”

**Sistem değişikliği.**
- **Bu iş:** Yok (metin ve kılavuz kuralı).
- **T03:**
    - `consent_kind` `early_performance` değeri; kabul ekranında isteğe bağlı kutu ve kaydı.
    - Onay yoksa `withdrawal_until` bitmeden envanter ve ziyaret planlama engeli.
    - removal-v1 cayma kesintilerinin yalnızca onay varsa uygulanması.
    - Cayma teyit SMS'i.
    - Ops'un posta, e-posta ya da KEP ile gelen caymayı bildirim tarihiyle kaydetmesi.
    - Cayma süresi içinde diğer seçeneklerde uyarı.

<a id="h12"></a>
## H12 – Kalıcı veri saklayıcısı ve sözleşme ile ön bilgilendirmenin teslimi

**Soru.** Metinlerin portalda ve sitede sürüm adıyla saklanması kalıcı veri saklayıcısı şartını karşılar mı? PDF verilmeli mi? Sürüm adı ve arşiv dosyası ispat için yeterli mi? Saklama süresi nedir?

**Karar.**
- **Bugünkü yöntem yeterli değildir.** Portal ilke olarak kalıcı veri saklayıcısı olabilir; tanım internet ve kısa mesajı da sayar. Ancak sitede yalnızca güncel genel metin yayımlanıyor ve onay kaydı yalnızca sürüm adını tutuyor. Tüketiciye verilen, değiştirilmeden saklanıp aynen erişilebilen ve ona özgü bir kopya yok: taraflar, bahçe satırları, toplam fiyat ve cayma son günü bu kopyada bulunmalıdır.
- **Gereken (T04):** Her teklif kabulünde (ilk, ek ve yenileme) o siparişin bilgileriyle doldurulmuş Ön Bilgilendirme Formu ve Mesafeli Sözleşme PDF'i üretilir. PDF'te taraflar, bahçe satırları, tutarlar, KDV, toplam, hizmet dönemi, ziyaret hakkı, cayma süresi ve son günü ile sürüm adı yer alır.
    - Değiştirilemez biçimde saklanır.
    - Portalda “Hesabım › Sözleşmelerim” altında indirilebilir.
    - Kabulden hemen sonra SMS ile bağlantısı gönderilir. E-posta kanalı zorunlu değildir; SMS ve portal birlikte yeterlidir.
    - Erişimi kapanmış müşteriye talep halinde kopya verilir.
- **İspat:** Onay kaydına sürüm adının yanında gösterilen metnin SHA-256 özeti ve PDF'in kimliği ile özeti yazılır. Arşiv dosyaları yedek ispat olarak kalır.
- **Saklama süresi:** Yönetmelik en az 3 yıl ister. Genel zamanaşımı ve ticari belge saklama nedeniyle onay tarihinden itibaren 10 yıl saklanır.

**Dayanak.** Mesafeli Sözleşmeler Yönetmeliği md. 4/1-c (kalıcı veri saklayıcısı tanımı), md. 5 (ön bilgilendirme; sözleşmenin ayrılmaz parçası; ispat yükü satıcıda), md. 6–7 (yazılı ya da kalıcı veri saklayıcısıyla bilgilendirme ve teyit; teyit yoksa sözleşme kurulmamış sayılır), Yönetmelik'teki üç yıllık bilgi ve belge saklama yükümlülüğü; 6502 md. 4/1 ve md. 48; TBK md. 146; TTK md. 82; VUK md. 253.

**Gerekçe.**
- Bir uyuşmazlıkta Şirket, müşteriye gösterilen fiyatı ve şartları ona özgü, tarihli ve değiştirilmemiş bir belgeyle ispat etmelidir.
- Gerekli altyapı (makbuz PDF'i, özel ve önbelleksiz sunum, SMS) zaten var.
- **Uzlaştırma:** İki uzman aynı sonuca vardı.

**Metin değişikliği.**
- **Sözleşme Md. 16:** “Bu sözleşme 16 maddeden ve eklerden oluşur. Kâğıt üzerinde [Tarih]'te iki nüsha olarak imzalanmıştır; portalda kurulduğunda teklifin onaylandığı anda kurulur ve yürürlüğe girer. Onaylanan sözleşme ve Ön Bilgilendirme Formu, Sahip'e özgü bilgiler ve teklif satırlarıyla birlikte PDF olarak Sahip'in portalında “Sözleşmelerim” bölümünde değiştirilmeden saklanır ve indirilebilir; bağlantısı onaydan sonra Sahip'e SMS ile gönderilir. Şirket bu kayıtları onay tarihinden itibaren 10 yıl saklar ve portal erişimi sona ermiş olsa bile Sahip'in talebi üzerine bir kopyasını verir.”
- **Ön Bilgilendirme**, onay cümlesinden önce: “Bu formun ve sözleşmenin size özgü kopyası onaydan sonra portalınızda (Hesabım › Sözleşmelerim) saklanır ve bağlantısı SMS ile gönderilir.” Onay cümlesi şöyle olur: “Bu formu okudum ve sözleşme kurulmadan önce bilgilendirildiğimi teyit ederim.”
- **KVKK metni §7:** İlgili satır (H25).
- **README “Eski sürümler”:** “Arşiv dosyası tek başına ispat için yeterli değildir; asıl kayıt siparişe özel PDF ve onun özetidir (T04).”

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T04:** Kabulde siparişe özel PDF; değiştirilemez özel depo; `text_sha256`, PDF kimliği ve özeti; Sözleşmelerim sayfası; kabul sonrası SMS; ön bilgilendirme ekranının teklif verileriyle doldurulması; arşiv ile sürüm eşleşmesi testi.

<a id="h13"></a>
## H13 – Cayma süresinin başlangıcı; ek siparişin niteliği; ek siparişte ön bilgilendirme

**Soru.** (a) Cayma süresi hangi günden sayılmalı? Hizmet başlamadan dolması kabul edilebilir mi? (b) Ek sipariş ayrı bir mesafeli sözleşme mi? (c) Ek ve yenileme tekliflerinde ön bilgilendirme yeniden onaylatılmalı mı?

**Karar.**
- **(a) Kanuni süre sözleşmenin kurulduğu gün başlar.** Portalda bu gün teklifin onaylandığı gündür. Sistem süreyi ödemenin tamamlandığı (siparişin etkinleştiği) günden sayıyor. Bu gün onay gününe eşit ya da ondan sonradır. Dolayısıyla tüketiciye kanunun öngördüğünden uzun bir süre verilir; bu geçerlidir.
    - `private.withdrawal_until` **değişmez**.
    - Metin bunun Sahip lehine bir uzatma olduğunu açıkça yazar.
    - Sürenin hizmet başlamadan dolması (yenileme, ileri başlangıçlı ek teklif, dönem birleştirme) kabul edilebilir.
    - Hizmet başlamadan vazgeçen Sahip, Md. 12/3'e göre (“hemen” seçeneği dahil, H20) bahçeyi çıkarır. Hiç ziyaret yapılmadığı için tam iade alır; ödenmiş ama başlamamış yenileme tamamen iade edilir.
- **(b) Ek sipariş ayrı bir mesafeli sözleşmedir.** Çerçeve sözleşmeye bağlıdır; kendi teklifi, kabulü, bedeli, ödemesi, ön bilgilendirmesi ve cayma süresi vardır. Ek siparişte cayma ana siparişi, ana siparişte cayma ek siparişi etkilemez.
- **(c) Evet.** Her ek ve yenileme teklifinin onayından önce, o teklifin bilgileriyle doldurulmuş ön bilgilendirme gösterilir ve ayrıca onaylanır. Sistem iki onayı her kabulde zaten yeniden kaydediyor; bu doğrudur. Eksik olan, teklife özgü içerik ve PDF'tir (T04).

**Dayanak.** Mesafeli Sözleşmeler Yönetmeliği md. 5, 7, 9 (hizmette süre sözleşmenin kurulduğu gün başlar), md. 15/1 giriş cümlesi; 6502 md. 48 (asgari koruma; tüketici lehine genişletme serbesttir); TBK md. 1–4, 26.

**Gerekçe.**
- Kanun asgari süreyi belirler. Daha geç bir başlangıç tüketici aleyhine değildir.
- Hizmet başlangıcından saymak kanunen gerekmez ve yeni karmaşa yaratır. Hizmet başlamadan vazgeçme halini Md. 12/3'teki tam iade karşılar.
- **Uzlaştırma:** İki uzman aynı görüşte.

**Metin değişikliği.**
- **Sözleşme Md. 8B/1:** “Sözleşme portalda kurulmuşsa Sahip, 14 gün içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden cayabilir. Kanuni cayma süresi sözleşmenin kurulduğu (teklifin onaylandığı) gün başlar; Şirket, Sahip lehine olarak süreyi ödemenin tamamlandığı (siparişin etkinleştiği) günden başlatır. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre bu günden sayılır. Sürenin son günü ödeme gününden 14 gün sonraki gündür ve süreye dahildir; örneğin ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart. Cayma süresi hizmet başlamadan dolmuşsa Sahip Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; hiç ziyaret yapılmadığı için envanter payı dışındaki tutarın tamamı, envanter de yapılmadıysa satırın tamamı, ödenmiş ve başlamamış yenilemede satırın tamamı iade edilir. Ek siparişin cayma süresi Madde 8D/7'dedir.”
- **Sözleşme Md. 8D/7:** “7. **Ek siparişin niteliği, ödemesi ve cayma süresi:** Ek sipariş, bu sözleşmenin hükümlerine tabi; kendi teklifi, ön bilgilendirmesi, onayı, bedeli, ödemesi, makbuzu ve cayma süresi olan ayrı bir mesafeli sözleşmedir. Her ek teklif onayından önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve ayrıca onaylanır. Cayma süresi, Madde 8B/1'deki gibi ek siparişin ödemesinin tamamlandığı (ek siparişin etkinleştiği) günden itibaren 14 gündür; son gün dahildir. Ek siparişte cayma diğer siparişleri, diğer siparişlerde cayma ek siparişi etkilemez. Cayma Madde 8B'ye göre kullanılır.”
- **Sözleşme Md. 12/2'ye:** “Yenileme, ayrı bir mesafeli sözleşmedir; onaydan önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve onaylanır, yeni bir cayma süresi başlar (Madde 8B/1).”
- **Ön Bilgilendirme başlık notu:** “Bu form her teklifin (ilk, ek ve yenileme) onayından önce o teklifin bilgileriyle gösterilir ve ayrıca onaylanır.”
- **Ön Bilgilendirme §5 ilk madde ve İade Politikası §2:** Kanuni sürenin kuruluştan başladığı ve Şirket'in lehe uzatma yaptığı cümlesi eklenir; avukat notları silinir.
- **bahce-yonetimi.md §2:** “Sürenin kabul gününden mi başlayacağına avukat karar verir” cümlesi “Karar: süre etkinleşme gününden sayılmaya devam eder (Sahip lehine uzatma; hukuk/kararlar.md H13)” olur.

**Sistem değişikliği.** Yok (`withdrawal_until` aynı kalır). Teklife özgü ön bilgilendirme ve PDF: T04.

<a id="h14"></a>
## H14 – Yenileme: kendiliğinden uzama yok

**Soru.** Kâğıt sözleşmedeki “bildirim yoksa uzar” hükmü korunmalı mı? Yenilemenin yeni bir mesafeli sözleşme olarak kurulması doğru mu?

**Karar.**
- **Tek kural:** Portal ve kâğıt, iki yolda da sözleşme kendiliğinden uzamaz. Kâğıt sözleşmedeki uzama hükmü yeni kâğıt sürümlerinde yer almaz.
- **Yenileme yeni bir sözleşmedir.** O gün yayımlı fiyat listesiyle verilen yenileme teklifinin onaylanıp ödenmesiyle kurulur. Portalda kurulursa yeni ön bilgilendirme, yeni onay kayıtları ve yeni bir 14 günlük cayma süresi uygulanır; bu kurgu doğrudur.
- **v1 kâğıt sözleşmeyi imzalamış pilot sahipleri:** Şirket uzamaya dayanmaz. Dönem bitmeden yenilemenin portaldaki teklifle yapılacağını SMS ile bildirir. Tüketici lehine bir feragat olduğu için ayrıca imza gerekmez.
- **Süre:** Sözleşme süresi bir yılı aşmaz.

**Dayanak.** TBK md. 1–4, 26–27; 6502 md. 5 ve Haksız Şartlar Yönetmeliği (açık irade olmadan uzama ve yeni fiyatla bağlanma); 6502 md. 48 ve Mesafeli Sözleşmeler Yönetmeliği md. 5, 7, 9; 6502 md. 52 ve Abonelik Sözleşmeleri Yönetmeliği (bir yılı aşan belirli süreli abonelikte fesih hakkı riski).

**Gerekçe.**
- Kart saklanmadığı için uzayan sözleşmenin bedeli tahsil de edilemez.
- İki ayrı rejim (uzayan ve uzamayan) yönetilemez.
- Sessizlikle yeni yılın bedeline bağlanmak haksız şart riski taşır.
- **Uzlaştırma:** İki uzman aynı görüşte.

**Metin değişikliği.**
- **Sözleşme Md. 12/2:**
    - “[45]” yerine “45”.
    - Avukat notu silinir.
    - Eklenir: “Bu kural kâğıt üzerinde kurulan sözleşmeler için de geçerlidir.”
    - H13'teki yenileme cümlesi eklenir.
    - “Sahip yenileme teklifini onaylamazsa hizmet yılın sonunda biter ve 4. fıkra uygulanır” cümlesi korunur.
- **Md. 12/1:** H34'teki metin.
- **Kâğıt sözleşme:** Şablonu v3 metninden üretilir. `arsiv/hizmet-sozlesmesi-taslagi-v1.md` değişmez.
- **v1 sahiplerine gidecek bildirim** (kullanim-kilavuzu.md'ye girer): “orchadOS: Sözleşmeniz [bitiş tarihi]'nde sona erecek ve kendiliğinden uzamayacak. Devam etmek isterseniz bitişten önce portalınızdaki yenileme teklifini onaylayabilirsiniz; onaylayıp ödemedikçe yeni yıl başlamaz ve sizden bedel istenmez.”

**Sistem değişikliği.** Yok. Ops eylemi: v1 sahiplerine ilk yenileme tekliflerinden önce bildirim gönderilir ve not edilir (T22).

<a id="h15"></a>
## H15 – Sahip kaynaklı yapılamayan ziyaret; hava, Şirket ve mücbir sebep

**Soru.** Sahip'ten kaynaklanan nedenle yapılamayan ziyaret için hiç iade yapılmaması haksız şart mı? Hava ya da Şirket kaynaklı kurgu ve 14 günlük iade uygun mu?

**Karar.**
- **Bugünkü mutlak hal haksız şart riski taşır.** “Erişim” kelimesi hem iade edilen (8A/1) hem iade edilmeyen (8A/3) halde geçtiği için belirsizdir; belirsiz şart tüketici lehine yorumlanır.
- **Kural şu denge şartlarıyla korunur:**
    1. Ziyaret tarihi en az 3 gün önce SMS ya da telefonla bildirilir.
    2. Sahip ziyaretten en geç 24 saat önce bir kez erteleme isteyebilir; ziyaret aynı pencerede yeniden planlanır.
    3. Sahip kaynaklı engel (kapalı kapı, anahtar ya da bekçi yok, sınırı gösterecek kişi yok) zaman damgalı fotoğraf ve notla belgelenir ve aynı gün Sahip'e bildirilir.
    4. Şirket aynı pencere içinde en az bir yeni tarih önerir.
    5. Önerilen tarihte de aynı nedenle ziyaret yapılamazsa ziyaret yapılmış sayılır ve iade edilmez (alacaklının temerrüdü).
    6. Pencere içinde yeni tarih önerilemiyorsa Şirket kaynaklı hal gibi işlenir: iade ya da aktarma.
- **Hava, Sahip'ten kaynaklanmayan erişim engeli ve Şirket kaynaklı hal:** “Aynı pencerede yeniden planlama; olmazsa iade ya da Sahip isterse sonraki pencereye aktarma” kurgusu uygundur. Aktarma Sahip'in açık talebiyle yapılır, kaydedilir ve dönemin son penceresinden sonraya yapılamaz. Pencere bitiminden sonra 14 gün içinde iade uygundur. İadeyi Şirket kendiliğinden başlatır (H21).
- **Mücbir sebep:** Yalnızca askı, pencere kapanınca tüketiciyi bedelsiz bırakır. Bu nedenle mücbir sebeple pencere içinde yapılamayan ziyaret de 8A/2'ye göre iade edilir ya da aktarılır.

**Dayanak.** 6502 md. 5 ve Haksız Şartlar Yönetmeliği md. 5 ve Ek liste; TBK md. 2, 20–25, 23 (belirsiz hükmün düzenleyen aleyhine yorumu), md. 106–108 (alacaklının temerrüdü), md. 136 (ifa imkânsızlığında karşı edimin iadesi).

**Gerekçe.**
- Peşin ödenmiş edimin bedelini alıkoymak, ancak engel gerçekten Sahip'ten kaynaklandığında ve Şirket makul çabayı gösterdiğinde haklıdır.
- Bildirim, erteleme hakkı, belgeleme ve ikinci deneme bunu ispatlanabilir kılar ve operasyonu ağırlaştırmaz.
- **Uzlaştırma:** Uzman A'nın “en az bir alternatif tarih” zorunluluğu ile Uzman B'nin erteleme hakkı ve mücbir sebep iadesi birleştirildi. Pencerede yer kalmazsa ne olacağı belirsiz kalmasın diye, en koruyucu sonuç olan iade ya da aktarma açıkça yazıldı.

**Metin değişikliği.**
- **Sözleşme Md. 8A, 1–4. fıkralar** (5 ve 6 H21'de):
  “1. **Ziyaret tarihi:** Şirket her periyodik ziyaretin tarihini Sahip'e en az 3 gün önce SMS ya da telefonla bildirir. Sahip ziyaretten en geç 24 saat önce bir kez erteleme isteyebilir; ziyaret aynı pencere içinde yeniden planlanır.
  2. **Sahip'ten kaynaklanmayan nedenler:** Hava, Sahip'ten kaynaklanmayan erişim engelleri (yolun kapanması, sel, resmi yasak gibi), mücbir sebep ya da Şirket'ten kaynaklanan bir nedenle yapılamayan ziyaret aynı ziyaret penceresi içinde yeniden planlanır. Pencere içinde yapılamazsa o ziyaretin bedeli Sahip'e iade edilir. Ziyaret bedeli, Bahçe'nin teklif satırındaki tutardan envanter payı çıkarıldıktan sonra kalanın, o satırdaki ziyaret hakkına bölünmesiyle bulunur. Tam yıllık siparişte bu, yıllık bedelin (envanter ücreti hariç) paketteki yıllık ziyaret sayısına bölünmesidir. Şirket iadeyi Sahip'in talebini beklemeden başlatır; iade, ödemenin yapıldığı yöntemle ve pencerenin bitiminden sonra en geç 14 gün içinde yapılır. Sahip isterse, iade yerine ziyaret aynı üyelik dönemindeki bir sonraki pencereye aktarılır; aktarma Sahip'in portal ya da yazılı talebiyle yapılır ve dönemin son penceresinden sonraya aktarma yapılmaz.
  3. **Sahip'ten kaynaklanan nedenler:** Sahip'in Madde 5/2–3'teki yükümlülüklerini (erişimin sağlanması: kapı, anahtar, bekçi; sınırı gösterecek kişinin bulunması) bildirilen ziyaret gününde yerine getirmemesi nedeniyle ziyaret yapılamazsa Şirket durumu belgeler (zaman damgalı fotoğraf ve not), aynı gün Sahip'e bildirir ve aynı pencere içinde en az bir yeni tarih önerir. Önerilen tarihte de ziyaret aynı nedenle yapılamazsa ziyaret yapılmış sayılır ve iade yapılmaz. Pencere içinde yeni bir tarih önerilemiyorsa 2. fıkra uygulanır.
  4. Mücbir sebep halinde Madde 13 ve bu maddenin 2. fıkrası uygulanır.”
- **Md. 13'e:** “Mücbir sebep nedeniyle ziyaret penceresi içinde yapılamayan ziyaret için Madde 8A/2 uygulanır.”
- **İade Politikası §3:** Aynı kurguyla sadeleştirilir. Örnek madde: “Sizden kaynaklanan nedenle yapılamayan ziyaret, size önceden bildirilmiş ve en az bir kez yeniden denenmiş olmasına rağmen yapılamadıysa iade edilmez.”
- **kullanim-kilavuzu.md “3.1 Planlama”:** “Her ziyaretin tarihi sahibe en az 3 gün önce SMS ya da telefonla bildirilir, bildirim ziyaret notuna yazılır. Bildirime bahçede çalışanlar için kısa bilgilendirme ve /bahcede-bulunanlar bağlantısı eklenir.” “3.2 Sahada”: Sahip kaynaklı engelde fotoğraf, not, aynı gün bildirim ve yeni tarih önerisi.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T07:**
    - En az 3 gün önce giden `visit_scheduled` SMS şablonu.
    - Yapılamayan ziyaret kaydında neden (customer, company, weather, force_majeure) ve kanıt.
    - `customer` nedeninde “bildirildi” ve “yeni tarih önerildi” işaretlerinin zorunlu olması.
    - 8A/3'e göre yapılmış sayılan ziyaretin çıkarma hesabında kullanılmış sayılması.

  O zamana kadar bu işlemler ops kılavuzuyla elle yapılır.

<a id="h16"></a>
## H16 – Ödeme kuruluşuna (iyzico) aktarım ve sabit TCKN

**Soru.** iyzico'ya aktarımın hukuki sebebi ne? iyzico veri işleyen mi, veri sorumlusu mu? Sabit “11111111111” sorun yaratır mı? Gerçek TCKN şifresiz ve yazılı risk kabulüyle tutulabilir mi?

**Karar.**
- **Hukuki sebep:** Aktarım sözleşmenin kurulması ve ifasına, yani bedelin tahsiline dayanır (md. 5/2-c).
- **iyzico'nun sıfatı:** iyzico, ödeme hizmeti ve kendi yasal yükümlülükleri (müşterini tanı, işlem kaydı, suç gelirlerinin aklanmasının önlenmesi) bakımından **bağımsız veri sorumlusudur**; kendi dayanağı md. 5/2-ç'dir. Veri işleyen sözleşmesi gerekmez. Üye işyeri sözleşmesindeki KVKK hükümleri yeterlidir.
- **Sabit “11111111111”:** KVKK md. 4'teki doğruluk ilkesini ihlal etmez. Bir kişiye ait yanlış bir veri değil, açıkça “bilinmiyor” anlamında bir yer tutucudur. Veri en aza indirmeye de uygundur. Ödeme mevzuatına uygunluk iyzico'nun sorumluluğundadır. Bu nedenle iyzico'nun yazılı teyidi (e-posta yeterlidir) pilot kapısı olarak kalır; teyit gelmeden canlıda kullanılmaz.
- **Gerçek TCKN istenirse:** “Yazılı risk kabulü” md. 12'deki uygun güvenlik düzeyini **karşılamaz**.
    - Tercih edilen yol: TCKN saklanmaz, ödeme anında alınıp yalnızca iyzico'ya iletilir. Şirket'te yalnızca son dört hane kalır.
    - Saklamak zorunluysa: Uygulama ya da sütun düzeyinde şifreleme (anahtar veritabanı dışında, Vault ya da Edge sırrı), erişimin ödeme çağrısıyla sınırlanması ve TCKN'nin hiçbir log, olay yükü ya da hata mesajına girmemesi şarttır.
    - Bunlardan biri yapılmadan `identity_number_required` açılmaz.

**Dayanak.** KVKK md. 4/2 (doğruluk, ölçülülük), md. 5/2-c ve ç, md. 10, md. 12/1; Kurum'un Kişisel Veri Güvenliği Rehberi; 6493 sayılı Kanun ve Ödeme Hizmetleri Yönetmeliği; 5549 sayılı Kanun ve Tedbirler Yönetmeliği.

**Gerekçe.**
- Ödeme kuruluşu, işleme amacını ve aracını kendi lisans yükümlülükleri nedeniyle belirler; bu bağımsız veri sorumluluğunun ölçütüdür.
- TCKN kimlik hırsızlığında kullanılabilen kritik bir veridir. Bir ihlalde “riski kabul etmiştik” demek, “gerekli teknik tedbir alınmadı” tespitini önlemez.
- **Uzlaştırma:** İki uzman aynı görüşte.

**Metin değişikliği.**
- **KVKK metni §5, iyzico maddesine:** “Ödeme kuruluşu, ödeme hizmetleri ve suç gelirlerinin aklanmasının önlenmesi mevzuatından doğan kendi yükümlülükleri için bu verileri bağımsız veri sorumlusu olarak işler; ayrıntılar ödeme kuruluşunun aydınlatma metnindedir.”
- **KVKK metni §2 Finans:** “T.C. kimlik numarası yalnızca ödeme kuruluşu zorunlu tutarsa ödeme sırasında alınır ve ödeme kuruluşuna iletilir; Şirket'te yalnızca son dört hanesi saklanır.”
- **KVKK metni §4:** Tablonun altına “Ödeme kuruluşuna aktarım sözleşmenin ifasına (c) dayanır” cümlesi girer (H31 notlarıyla birlikte).
- **musteri-yonetimi.md §2, §16, §19:** “şifreleme ya da yazılı risk kabulü” ifadesi “TCKN'nin saklanmadan iletilmesi ya da şifreli saklanması; yazılı risk kabulü yeterli değildir (hukuk/kararlar.md H16)” olur.

**Sistem değişikliği.**
- **Bu iş:** Yok (bayrak varsayılan kapalı).
- **T13:** Bayrak açılmadan önce saklamadan iletme yolu ya da şifreleme; olay yükü izinli liste testine TCKN deseni.

<a id="h17"></a>
## H17 – Fatura ve e-Arşiv (hukuki çerçeve; ayrıntı mali müşavirde)

**Soru.** Fatura ne zaman ve nasıl düzenlenmeli? İadelerde ne yapılmalı? Md. 8/3 nasıl doldurulur?

**Karar.**
- **Zamanlama:** Peşin ve yıllık tahsil edilen bedel için, ödeme tamamlanınca o siparişin tamamı üzerinden **tek fatura**, ödeme günü ya da en geç 7 gün içinde düzenlenir. Hizmetten önce düzenlenen faturada KDV belge tarihinde doğar. Ziyaret bazında faturalama yapılmaz. Ek sipariş ve yenileme kendi ödemeleriyle ayrı faturalanır.
- **Biçim:** Şirket baştan e-Arşiv Fatura ve e-Fatura uygulamasına geçer (özel entegratör ya da GİB portalı). Alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv Fatura düzenlenir. Bireysel alıcıda TCKN toplanmadığı için GİB'in bilinmeyen TCKN için kabul ettiği değer kullanılır; tutar sınırı varsa mali müşavir belirler. Fatura portalda ve SMS bağlantısıyla iletilir.
- **İadeler:**
    - Fatura düzenlenmeden yapılan aynı gün tam iptalde (void) fatura düzenlenmez.
    - Fatura düzenlendikten sonraki tam iptalde süresi içinde e-Arşiv iptali, süre geçmişse düzeltme belgesi düzenlenir.
    - Bahçe çıkarma, cayma, 8A ve fazla ödeme iadeleri bedelde sonradan meydana gelen değişikliktir; matrah ve KDV düzeltilir. Şirket müşteri e-Fatura mükellefiyse iade faturası düzenler. Nihai tüketicide Şirket iadeyi mevzuata uygun belgeyle (iade belgesi, dekont ve iade kaydı) belgeler.
    - Belge türleri mali müşavirle kesinleşir. Sistemdeki satır ve KDV bazında iade hesabı düzeltme için yeterli veriyi sağlar.
- **Makbuz:** Zaten “fatura değildir / fatura yerine geçmez” diyor; değişmez.

**Dayanak.** 213 sayılı VUK md. 229–232 (231/5: hizmetin yapıldığı tarihten itibaren azami 7 gün), md. 242, md. 253; 509 sıra no'lu VUK Genel Tebliği ve değişiklikleri (e-Fatura ve e-Arşiv; internet satışları; bilinmeyen TCKN; iptal); 3065 sayılı KDV Kanunu md. 10/a, md. 35; TTK md. 64, 82.

**Gerekçe.**
- Tek fatura, tahsilatı ve KDV'yi aynı ana bağlar ve makbuzla birebir eşleşir.
- e-Belge'ye baştan geçmek eşik takibinde hata riskini ortadan kaldırır.
- **Uzlaştırma:** İki uzman aynı çerçevede birleşiyor; belge türü ayrıntısı mali müşavire bırakıldı.

**Metin değişikliği.**
- **Sözleşme Md. 8/3:** “3. **Belge:** Her ödeme için portalda bir makbuz verilir; makbuz fatura değildir. Fatura, ödemenin tamamlandığı gün ya da en geç 7 gün içinde, Sahip'in fatura profilindeki bilgilerle elektronik ortamda düzenlenir (e-Fatura mükellefi Sahip'e e-Fatura, diğerlerine e-Arşiv Fatura) ve portalda ve SMS bağlantısıyla iletilir. İadelerde vergi mevzuatına uygun düzeltme belgesi düzenlenir; her iadenin KDV payı ayrıca gösterilir.”
- **Ön Bilgilendirme §4'e:** “Fatura ödemeden sonra elektronik olarak düzenlenir ve portalda sunulur.”
- Avukat ve mali müşavir notu silinir.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T14:** Pilotta mali müşavir faturayı elle ve 7 gün içinde düzenler. Fatura numarası ödeme kaydına not edilir. Ops panosunda fatura ve iade düzeltme görevi açılır. Sonra entegratör API'sine geçilir.

<a id="h18"></a>
## H18 – Çoğul bahçe ve Ek-1 bahçe listesi

**Soru.** Tek sözleşmede birden çok bahçe ve güncellenen Ek-1 yeterli mi? Ek bahçe için ayrı imza gerekir mi? “Her hüküm her Bahçe için ayrı” ifadesi uygun mu?

**Karar.**
- **Yeterlidir.** Bu sözleşme türü şekle bağlı değildir; elektronik kabulle kurulur.
- **Ek bahçe:** Ek teklifin kabulü (ön bilgilendirme ve mesafeli sözleşme onaylarıyla) bahçenin Ek-1'e girmesi için yeterlidir; ayrı imza gerekmez. Kâğıtla başlamış sözleşmede portaldan eklenen bahçe de bir mesafeli ek sözleşmedir.
- **Ek-1'in değişmesi:** Ek-1 Şirket'in tek taraflı kararıyla değişmez; yalnızca teklif kabulüyle ya da Md. 12/3'e göre değişir. Her değişikliğin tarihli kaydı silinmeden saklanır.
- **“Her hüküm her Bahçe için ayrı” ifadesi** uygundur. Sözleşmenin bütününe ilişkin maddeler bunun dışında tutulur. Bir Bahçe'deki fesih, cayma ya da yapılamayan ziyaret diğer bahçeleri etkilemez.

**Dayanak.** TBK md. 1–4, 12, 20–26; 6502 md. 48 ve Mesafeli Sözleşmeler Yönetmeliği md. 5–7; Haksız Şartlar Yönetmeliği (sözleşme konusunun tek taraflı değiştirilmesi); HMK md. 199.

**Gerekçe.**
- İspat açısından önemli olan, hangi bahçenin hangi tarihte hangi onayla listeye girip çıktığıdır. Değişmez teklif satırları, onay kayıtları ve T04'teki PDF bunu sağlar.
- **Uzlaştırma:** Uzman A'nın istisna listesi ile Uzman B'nin “diğer bahçeleri etkilemez” ve “tek taraflı değiştirilemez” cümleleri birleştirildi.

**Metin değişikliği.**
- **Sözleşme Md. 2, ikinci paragraf:** “Üyelik dönemi içinde Madde 8D'ye göre eklenen bahçeler, ek teklifin Sahip tarafından onaylanmasıyla ve ek siparişin başladığı gün Ek-1'e girer; ayrıca bir imza gerekmez. Madde 12/3'e göre hizmetten çıkarılan bahçe Ek-1'de çıkış tarihiyle gösterilir. Ek-1 bunlar dışında değiştirilemez; geçmiş kayıtları silinmez. Bu sözleşmenin hükümleri, aksi yazılmadıkça ve sözleşmenin bütününe ilişkin hükümler (Madde 1, 9, 10, 13, 14, 15, 16) dışında, her Bahçe için ayrı ayrı uygulanır; bir Bahçe için yapılan fesih, cayma ya da yapılamayan ziyaret diğer bahçeleri etkilemez.”
- **Ek-1 açıklamasına:** “Portalda güncel liste ve geçmişi Hesabım › Bahçelerim'dedir; her siparişin sözleşme kopyasında o tarihteki bahçe satırları yer alır.”
- Avukat notu silinir.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T23 (doğrulama):** Hesabım › Bahçelerim'de çıkarılan bahçeler çıkış tarihiyle görünüyor mu? Görünmüyorsa eklenir.
- **T04:** Sipariş PDF'i bahçe satırlarını içerir.

<a id="h19"></a>
## H19 – Dönem içi eklenen bahçenin orantılı fiyatı: açıklık ve son ek günü

**Soru.** (a) 8D ve Ön Bilgilendirme §3'teki anlatım “toplam fiyat” ve açıklık şartını karşılıyor mu? (b) Son ek günü ve dönem kapanınca iptal ile tam iade uygun mu? (c) Envanterin yeniden kullanım süresi yazılmalı mı?

**Karar.**
- **(a) Yeterlidir.** Asıl şart, vergiler dahil toplam fiyatın sözleşmeden önce rakamla gösterilmesidir; teklif bunu yapıyor. Formül ek bilgidir. Şu eklemelerle kesinleşir:
    - Ek teklif ekranı ve PDF'i hesabı **rakamla** gösterir: kalan gün ve dönem günü, ham sonuç ve yuvarlanmış ziyaret hakkı, ziyaret tutarı, orantılı en az ücret ve hangisinin alındığı, envanter, KDV, toplam, aynı bahçenin tam yıllık bedeli, fiyat listesinin adı.
    - Yuvarlama örnekle yazılır: 2,35 → 2; 2,5 → 3.
    - Teklif, dönemde kalan ziyaret pencerelerini adlarıyla gösterir.
    - Şirket ek teklifin başlangıç gününü, ziyaret hakkı kalan pencere sayısını aşmayacak biçimde belirler. Bu, kabul edilmiş riskteki “ops başlangıcı öteler” önleminin yazılı hale gelmesidir. Formül değişmez; kullanıcının fiyat kararı korunur.
    - Bağlayıcı olan teklifteki toplamdır; başka bedel istenmez.
- **(b) Uygundur.** Teklifin geçerlilik süresini belirlemek Şirket'in serbestisidir. Dönem kapandığı için başlamayan ek siparişin iptali ve tam iadesi tüketici lehine bir bozucu şarttır. Eksikler: iptalin SMS ile bildirilmesi ve iadenin en geç 14 gün içinde, aynı yöntemle ve masrafsız yapılması.
- **(c) Evet, yazılmalıdır.** Belirsiz kalırsa düzenleyen aleyhine yorumlanır. Kural:
    - Son yayımlanmış envanterin tarihinden itibaren **24 ay** içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz.
    - Bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti teklifte gerekçesiyle ayrı satır olarak gösterilir.
    - Süre bir iş parametresidir; Yusuf değiştirebilir, değişiklik metin sürümünü artırır.
    - Sistem bugün süre sınırı olmadan hiç ücret almıyor. Bu Sahip lehinedir ve T18'e kadar sorun değildir.

**Dayanak.** Mesafeli Sözleşmeler Yönetmeliği md. 5/1 (vergiler dahil toplam fiyat), md. 6 (açık ve anlaşılır bilgilendirme), md. 12 (iade süresi, kıyasen); 6502 md. 5, md. 62 ve Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği (aldatıcı uygulama); TBK md. 3–4 (süreli öneri), md. 23, md. 170–171 (bozucu şart).

**Gerekçe.**
- Tüketicinin anlaması için en etkili yol, kendi teklifindeki sayıların dökümüdür.
- Kalan pencere sayısını aşan bir ziyaret hakkı satmak, sonradan iade edilse bile “bilerek yapılamayacak hizmet satmak” olarak görülebilir.
- **Uzlaştırma:**
    - Kalan pencere kontrolü (Uzman B) formülü değiştirmeden, başlangıç günü kuralı olarak alındı.
    - Envanter süresinde Uzman A çıkıştan 2 yıl, Uzman B son yayımlanmış envanterden 24 ay önerdi. Envanterin güncelliğini ölçtüğü için Uzman B seçildi.

**Metin değişikliği.**
- **Sözleşme Md. 8D/2'nin sonuna:** “Ek teklif hesabın adımlarını rakamla gösterir: kalan gün ve dönemin toplam günü, ham sonuç ve yuvarlanmış ziyaret hakkı (örneğin 2,35 → 2; 2,5 → 3), ziyaret tutarı, orantılı en az ücret ve hangisinin alındığı, envanter ücreti, KDV, toplam ve aynı bahçenin tam yıllık bedeli; ayrıca kullanılan fiyat listesinin adını ve dönemde kalan ziyaret pencerelerini yazar. Şirket ek teklifin başlangıç gününü, ziyaret hakkı dönemde kalan ziyaret pencerelerinin sayısını aşmayacak biçimde belirler. Sahip'ten teklifte yazan toplam dışında bir bedel istenmez.”
- **Md. 8D/3:** Envanter cümlesi şöyle olur: “Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır. Daha önce hizmetten çıkarılıp, son yayımlanmış envanterinin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti ek teklifte gerekçesiyle ayrı satır olarak gösterilir.” “[avukat/fiyat]” notu silinir.
- **Md. 8D/5:** “[30]” yerine “30”; not silinir.
- **Md. 8D/6'ya:** “İptal Sahip'e SMS ile bildirilir; tutar en geç 14 gün içinde ödemenin yapıldığı yöntemle ve masrafsız iade edilir.”
- **Ön Bilgilendirme §3, ek teklif maddesine:** “Ek teklif hesabı rakamla gösterir (kalan gün, ziyaret hakkı ve yuvarlama, ziyaret tutarı, orantılı en az ücret, envanter, KDV, toplam) ve dönemde kalan ziyaret pencerelerini yazar. Yuvarlamada 2,5 ve üstü yukarı, altı aşağı yuvarlanır. Bağlayıcı olan teklifteki toplamdır.” Envanter cümlesi 8D/3 gibi olur. Notlar silinir.
- **İade Politikası §1:** Ek teklif maddesine “İptal size SMS ile bildirilir ve tutar en geç 14 gün içinde iade edilir” eklenir. §5'teki “yeniden eklemek” maddesine 24 ay kuralı eklenir.
- **bahce-yonetimi.md §19:** “envanterin yeniden kullanımda kaç yıl geçerli sayılacağı” sorusu “24 ay (hukuk/kararlar.md H19)” olarak kapatılır.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T18:**
    - Ek teklif ekranında ve PDF'te hesap dökümü ve kalan pencere adları.
    - Hak kalan pencere sayısını aşıyorsa ops'a uyarı.
    - `inventory_reuse_months = 24` ayarı ve kontrolü.
    - `order_closed` iptalinde SMS.

<a id="h20"></a>
## H20 – Bahçe bazında kısmi fesih ve iade formülü

**Soru.** (a) Kısmi fesih, 30 günlük bildirim, “dönem sonunda”, kendiliğinden hüküm doğurma, bekleyen sipariş şartı ve son bahçeyle sona erme uygun mu? (b) İade formülü adil mi? (c) Şirket'in aynı süreyle tek taraflı çıkarması geçerli mi?

**Karar.**
- **(a) Kısmi fesih geçerlidir.** Ancak Sahip'e zorunlu 30 günlük bildirim süresi koymak risklidir. Bu hizmet, vekalet hükümlerinin uygulandığı bir işgörme sözleşmesidir; vekalet veren sözleşmeyi her zaman sona erdirebilir ve bu hak emredici kabul edilir. Karar:
    - Sahip **dilediği zaman** feshedebilir. Seçeneklere “hemen (çıkış günü yarın)” eklenir.
    - “30 gün sonra” ve “dönem sonunda” kalır; **varsayılan seçenek kaldırılır**, Sahip açıkça seçer.
    - Talebin onay beklemeden çıkış gününde hüküm doğurması, tarihin yalnızca anlaşmayla değişmesi, Sahip'in çıkış gününe kadar geri alabilmesi, SMS ve portal bildirimi ve son bahçe çıkınca sözleşmenin sona ermesi uygundur.
    - Bekleyen sipariş şartı uygundur. İptal bedelsiz ve tek adımdır; portal aynı akışta “bekleyen siparişi iptal et ve devam et” seçeneğini sunar.
- **(b) Formül adildir ve sabit kararlarla uyumludur.** Kullanılmayan ziyaretler iade edilir. Envanter yapılmadıysa payı iade edilir, yapıldıysa edilmez. Şirket'in yeniden taramaları sayılmaz; aynı gün iki tarama tek ziyarettir. Düzeltmeler:
    - İade “satır tutarı − envanter payı (yapıldıysa) − kullanılmış ziyaret × ziyaret bedeli − önceki iadeler” olarak hesaplanır. Böylece kuruş yuvarlamasından kalan fark Sahip'e kalır.
    - Raporu yayımlanamayan ziyaret (örneğin veri kaybı) kullanılmış sayılmaz. Bu durumda fark ayrıca iade edilir (ops elle).
    - 8A/3'e göre yapılmış sayılan ziyaret kullanılmış sayılır.
- **(c) Şirket'in sebepsiz tek taraflı çıkarması haksız şart riski taşır.** Aynı hakkın tüketiciye de tanınması bunu gidermez. Şirket yalnızca şu haklı sebeplerle çıkarabilir:
    - hizmet bölgesi dışında kalma,
    - Sahip'in Md. 5 yükümlülüklerinin esaslı ya da tekrarlanan ihlali (örneğin iki pencere boyunca erişim sağlanamaması),
    - yetkisizlik ya da Md. 6/4'teki üçüncü kişi itirazı,
    - personel güvenliğini tehdit eden durum,
    - devir,
    - mükerrer kayıt,
    - Şirket'in bölgede hizmeti bütünüyle sona erdirmesi.

  Bildirim en az 30 gündür. Güvenlik tehdidi, mükerrer kayıt ve yetki ya da itiraz hallerinde bildirim süresi aranmaz. Anlaşmayla çıkarmada Sahip'in onayı yazılı kaydedilir. İade, kullanılmayan bütün ziyaretlerin bedelidir; bildirim süresinde Şirket ziyaret yapmazsa o ziyaretler kullanılmamış sayılır.
- **Garden anahtarı:** Bu değişiklikler (T05) gelmeden `garden_changes_enabled` açılmaz. Anahtar zaten kapalıdır.

**Dayanak.** TBK md. 502/2, 512 (vekalet veren ve vekilin her zaman tek taraflı sona erdirme hakkı), md. 2, 20–25, 77 vd.; 6502 md. 5 ve Haksız Şartlar Yönetmeliği md. 5 ve Ek liste (sağlayıcıya takdire bağlı fesih yetkisi veren şartlar); 6502 md. 52 ve Abonelik Sözleşmeleri Yönetmeliği (kıyasen: alınmayan dönemin bedelini ödememe, fesih yolunun kuruluştan ağır olmaması).

**Gerekçe.**
- Kullanılmayan ziyaret zaten iade edildiğine göre, 30 günlük süre Şirket'e yalnızca o süre içindeki ziyaretin bedelini kazandırır. Bu hem zayıf bir korumadır hem de haksız şart riskini artırır.
- Sebepleri sayılan Şirket feshi gerçek ihtiyaçları karşılar ve denetimden geçer.
- **Uzlaştırma:**
    - Uzman A 30 günlük süreyi yeterli gördü. Uzman B, TBK 512 nedeniyle “hemen” seçeneğini ve varsayılanın kaldırılmasını önerdi. Daha koruyucu olduğu ve kullanılmayan ziyaretler zaten iade edildiği için ürünü bozmadığından Uzman B seçildi.
    - Haklı sebep listeleri birleştirildi.
    - Uzman A'nın “raporu yayımlanmayan ziyaret” düzeltmesi ve iki uzmanın ortak yuvarlama düzeltmesi alındı.

**Metin değişikliği.**
- **Sözleşme Md. 12/3:**
    - Giriş: “Sahip sözleşmeyi bütün bahçeler için ya da yalnızca bir Bahçe için dilediği zaman feshedebilir; fesih, Sahip'in seçtiği çıkış gününde hüküm doğurur. Şirket ise yalnızca aşağıda sayılan sebeplerle feshedebilir. Bahçe bazında fesih “bahçe çıkarma”dır.”
    - Seçenekler: “(varsayılan seçenek yoktur)”. Yeni “**hemen:** çıkış günü talep gününün ertesi günüdür”. “[30]” yerine “30”.
    - “**Şirket'in çıkarması:**” paragrafı (c)'deki sebepler, süreler, yazılı onay ve iade kuralıyla yeniden yazılır. Devir cümlesi korunur.
    - Bekleyen sipariş paragrafına: “Portal, aynı işlemde bekleyen siparişi iptal etme seçeneği sunar.”
    - İade hesabı:
        - Ziyaret bedeli kuruşa aşağı yuvarlanır.
        - “İade = satır tutarı − (envanter yapıldıysa) envanter payı − kullanılmış ziyaret sayısı × ziyaret bedeli; böylece yuvarlamadan kalan kuruş farkı Sahip lehine iadeye girer. Hiç ziyaret yapılmadıysa satır tutarının envanter payı dışındaki tamamı, envanter de yapılmadıysa satırın tamamı iade edilir.”
        - Önceki iadeler cümlesi H21'deki gibidir.
    - Kullanılmış ziyaret paragrafına: “Madde 8A/3'e göre yapılmış sayılan ziyaret de kullanılmış sayılır. Raporu yayımlanamayan (örneğin veri kaybı nedeniyle) ziyaret kullanılmış sayılmaz; bu durumda fark Şirket tarafından ayrıca iade edilir.”
    - Örnekler aynı sonuçları verir (9.000,00 TL; 6.000,00 TL).
    - “[14]” yerine “14”. Avukat notları silinir.
- **İade Politikası §4:**
    - İlk madde: “Sözleşmeyi bütün bahçeleriniz için ya da yalnızca bir bahçe için dilediğiniz zaman feshedebilirsiniz; çıkış gününü siz seçersiniz.”
- **İade Politikası §5:**
    - Zaman tablosunda varsayılan ifadesi kalkar.
    - En üste “Hemen | Talebin ertesi günü | Kullanılmayan ziyaretler” satırı eklenir.
    - İade hesabı ve kullanılmış ziyaret maddeleri yukarıdaki gibi güncellenir.
    - Şirket'in çıkarabileceği haller kısa bir maddeyle yazılır.
- **bahce-yonetimi.md §2:** Çıkış seçenekleri notuna “Karar: “hemen” seçeneği eklenecek, varsayılan kalkacak (hukuk/kararlar.md H20, T05)” yazılır.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T05:**
    - “Hemen” seçeneği; varsayılan seçimin kaldırılması.
    - removal-v1 hesabının “kalan” yöntemine çevrilmesi.
    - Ops çıkarma nedenlerinin haklı sebeplerle sınırlanması (yeni neden değerleri; “anlaşmayla”da Sahip onayı notu zorunlu).
    - Bekleyen siparişi aynı akışta iptal seçeneği.

  O zamana kadar anahtar kapalıdır. Ops kılavuzuna “Şirket'in çıkarması yalnızca sayılan sebeplerle ve sebebi notta yazarak yapılır” kuralı girer.

<a id="h21"></a>
## H21 – 8A iadelerinin çıkarma iadesinden düşülmesi; dönemi biten satır

**Soru.** Önceki 8A iadelerinin düşülmesi ve dönemi biten satırın çıkarma iadesine girmemesi uygun ve açık mı?

**Karar.**
- **Uygundur.** 8A ile iade edilen ziyaret çıkarma hesabında kullanılmamış sayılır. Düşme, aynı ziyaretin bedelinin iki kez iade edilmesini önler; toplam iade yapılmamış ziyaretlerin bedeline eşit olur.
- **Düşülen iadeler:** Yalnızca aynı Bahçe'nin satırına ait ziyaret ve hizmet bedeli iadeleridir. Fazla ödeme ya da ödeme kuruluşu uyumsuzluğu gibi Şirket kaynaklı iadeler düşülmez. Bu kodla uyumludur.
- **Dönemi biten satır:** Çıkarma iadesine girmemesi uygundur, **ancak** o dönemin yapılamayan ziyaretleri için 8A iadesi Sahip'in talebine ya da ops'un hatırlamasına bırakılamaz. Şirket her pencere ve dönem sonunda yapılamayan ziyaretleri kendiliğinden tespit eder ve 14 gün içinde iade eder ya da Sahip'in isteğiyle aktarır. “Dönem sonunda” seçeneğinde de aynı kural uygulanır.

**Dayanak.** TBK md. 77 vd. (sebepsiz zenginleşme), md. 112, md. 136, md. 2, md. 23; 6502 md. 5.

**Gerekçe.**
- Hesap mantığı doğrudur. Asıl risk uygulamadadır: 8A iadesi kendiliğinden açılmazsa tüketici fiilen hiç iade alamaz ve kural haksız hale gelir.
- **Uzlaştırma:** İki uzman aynı görüşte. Uzman B'nin düşülen iade türü sınırlaması metne alındı.

**Metin değişikliği.**
- **Sözleşme Md. 8A/5:** “5. Bu madde uyarınca bir Bahçe için yapılmış iade, aynı Bahçe daha sonra hizmetten çıkarılırsa Madde 12/3'e göre hesaplanan iadeden düşülür. Bedeli bu maddeye göre iade edilmiş ziyaret, Madde 12/3'teki hesapta kullanılmamış ziyaret sayılır; düşme, aynı ziyaretin bedelinin iki kez iade edilmesini önler.”
- **Yeni Md. 8A/6:** “6. Şirket, her ziyaret penceresinin ve hizmet döneminin sonunda yapılamayan ziyaretleri kendiliğinden tespit eder; Sahip'in talebini beklemeden bu maddeye göre iade eder ya da Sahip isterse aktarır.”
- **Md. 12/3, önceki iadeler maddesi:** “Bu Bahçe'nin satırı için daha önce yapılmış ya da başlatılmış ziyaret ve hizmet bedeli iadeleri, Madde 8A iadeleri dahil, sonuçtan düşülür. Madde 8A'ya göre bedeli iade edilmiş ziyaret bu hesapta kullanılmamış ziyaret sayılır. Fazla ödemenin iadesi gibi Şirket kaynaklı iadeler düşülmez. Sonuç sıfırdan küçükse iade yapılmaz.”
- **Md. 12/3, dönemi biten satır:** “... o dönemde yapılamayan ziyaretlerin bedeli Madde 8A'ya göre, Sahip'in talebi beklenmeden iade edilir. “Dönem sonunda” seçeneğinde de aynı kural uygulanır.”
- **İade Politikası §3 ve §5'e:** “Yapılamayan ziyaretleri biz tespit eder, sizin talebinizi beklemeden iade ederiz.”
- Notlar silinir.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T06:** Housekeeping bir siparişi `completed` yaptığında ve “dönem sonunda” çıkışlarda bir kontrol çalışır. Yapılmış periyodik ziyaret sayısı haktan az olan ve 8A iadesi ya da aktarma kaydı bulunmayan satırlar için ops görevi açılır; 14 gün sayacı ve gecikme uyarısı vardır. İade açma elle kalabilir.

  O zamana kadar ops her dönem sonunda listeyi elle çıkarır (kılavuz).

<a id="h22"></a>
## H22 – Çıkarılan bahçede 90 gün salt okunur erişim ve KVKK saklama süresi

**Soru.** (a) 90 günlük erişim saklama süresiyle nasıl ilişkilendirilir; aydınlatma metnine yazılmalı mı? (b) Süre sonunda kaldırılan erişimler ve devirde 0 gün uygun mu? (c) Erişimi kalkan hissedara bildirim gerekir mi? (d) Yeni sahip eski raporlara erişmemeli mi?

**Karar.**
- **(a) Erişim ve saklama ayrıdır.** 90 gün sözleşmesel bir **erişim** süresidir. Saklama süresi değildir ve onu belirlemez. Erişim kalktıktan sonra veriler §7'deki süreler boyunca saklanır, sonra silinir ya da anonim hale getirilir. Bu ayrım aydınlatma metnine yazılır ve sürüm artırılır (kvkk-v2-taslak).
- **(b) Kurgu uygundur.** Sahip'in, davet ettiği hissedarların ve başka sahip yoksa bütün hissedarların erişimi kalkar; başka sahip varsa onun erişimi sürer. Kayıtlar:
    - Kendi sözleşmesi süren başka bir sahibin erişimi, Şirket'in “bütün erişimleri kaldırma” kararıyla kaldırılamaz. Bu yetki yalnızca kendi sözleşmesi bitmiş kişilere ya da yazılı gerekçeyle (devir, uyuşmazlık, mükerrer kayıt) kullanılır.
    - Kalan sahibe, çıkan Sahip'in soruları, cevapları ve kendisine ait bilgileri açılmaz. Bahçe raporlarının içeriği aynı bahçenin sahibi olarak görülebilir.
    - Devirde erişimin çıkış gününde kalkması uygundur. Çıkıştan önce Sahip'e “raporlarınızı indirin” SMS'i gider; sonrasında kopya talep halinde verilir.
- **(c) Bildirim zorunlu değildir.** Hissedar sözleşmenin tarafı değildir; erişimin kapanması yeni bir işleme değildir. Salt okunur dönemde portalda bilgi bandı göstermek önerilir; zorunlu değildir.
- **(d) Doğrudur.** Yeni sahip eski raporlara erişmez. Raporlar önceki sahibin verilerini ve gizli tutulan bilgileri içerir. Paylaşım ancak önceki sahibin yazılı izniyle olur. “Yeni sahip yeni parsel alır” kuralı doğrudur.

**Dayanak.** KVKK md. 4/2-ç ve d, md. 5/2-c ve e, md. 7, md. 8, md. 10/1, md. 12; Aydınlatma Tebliği; Kişisel Verilerin Silinmesi Yönetmeliği md. 7; Sözleşme Md. 9/3; TBK md. 26, 146.

**Gerekçe.**
- İki süreyi karıştırmak “90 gün sonra veriniz silinir” gibi yanlış bir izlenim yaratır.
- Çok sahipli parselde asıl risk, bir sahibin kişisel içeriğinin diğerine açılmasıdır; bunun dayanağı yoktur.
- **Uzlaştırma:**
    - Uzman A, kalan sahibin yalnızca kendi siparişlerine ait raporları görmesini önerdi. Uzman B, kalan sahibin erişiminin kendi sözleşmesine dayandığını vurguladı.
    - Rapor içeriği bahçe verisi olduğundan ve aynı bahçenin sahipleri arasında paylaşımı Md. 9/4 ve aydınlatma metninde yazılı olduğundan, sınırlama Sahip'e özgü kişisel içerikle (soru-cevap, ad, fatura) yapıldı. Sipariş bazında rapor ayrımı gerekmez.
    - Devir SMS'i iki uzmanın ortak önerisidir.

**Metin değişikliği.**
- **KVKK metni §7'ye satır:** “Portal erişimi | Bahçe hizmetten çıkarıldıktan ya da sözleşme sona erdikten sonra 90 gün salt okunur (devirde erişim çıkış gününde kalkar); sonra kapanır. Erişimin kapanması verilerin silinmesi anlamına gelmez; veriler bu tablodaki süreler boyunca saklanır.”
- **Sözleşme Md. 12/4:** H23'teki giriş cümlesiyle yeniden yazılır. Eklenen cümleler:
    - “Erişim süresinin bitmesi verilerin silinmesi değildir; veriler Aydınlatma Metni §7'deki süreler boyunca saklanır ve sürenin sonunda silinir ya da anonim hale getirilir.”
    - “Bahçe'de hizmet alan başka bir sahip varsa onun erişimi kendi sözleşmesi süresince sürer; çıkan Sahip'in soruları, cevapları ve kendisine ait bilgileri ona açılmaz. Şirket, kendi sözleşmesi sürmeyen kişilerin erişimini ya da yazılı bir gerekçeyle (devir, uyuşmazlık, mükerrer kayıt) bütün erişimleri kaldırabilir.”
    - “Devirde Şirket, çıkış gününden önce Sahip'e raporlarını indirebileceğini SMS ile bildirir; sonrasında raporların bir kopyası Sahip'in talebi üzerine verilir. Bahçe'yi devralan kişi, önceki Sahip'in raporlarına ve verilerine erişemez; önceki Sahip'in yazılı izni saklıdır.”
    - “[90]” yerine “90”.
    - Avukat notları silinir.
- **İade Politikası §5 “Çıkıştan sonra”:** Aynı cümleler sade dille yazılır.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T23 (doğrulama):** Çok sahipli parselde soru-cevapların yalnızca soran sahibin tarafında görünmesi; devir nedenli çıkarmada “raporlarınızı indirin” SMS'i (yoksa eklenir).
- Hissedar bilgi bandı isteğe bağlıdır. Ops'un `revoke_all_access` kullanımı kılavuzda yukarıdaki sınırla yazılır.

<a id="h23"></a>
## H23 – Yenilenmeyen üyelik ve idari fesihte erişim

**Soru.** Süresi biten ve yenilenmeyen üyelikte ve idari fesihte Md. 12/4 uygulanmalı mı?

**Karar.**
- **Gereklidir.** Md. 12/4, sözleşmenin bir Bahçe için sona erdiği **bütün hallerde** uygulanır: bahçe çıkarma, son bahçenin çıkması, süresinin dolması ve yenilenmemesi, Şirket'in feshi (`ops_terminate_order`) ve ops'un pasife aldığı pilot parselleri. Hepsinde 90 gün salt okunur erişim tanınır, soru ve hissedar daveti kapatılır, süre sonunda erişim kaldırılır ve veriler §7 süreleriyle saklanır.
- **Gerekçesi:** Sona ermiş sözleşmede soru sorma ve hissedar davetinin açık kalması, sözleşmeye dayanmayan yeni işleme demektir (yeni hissedar verisi, yeni sorular, görüntülerdeki üçüncü kişilerin süresiz paylaşımı).
- **Yeniden açılma:** Erişim süresi içinde yenileme onaylanıp ödenirse erişim yeniden tam açılır.
- **Zaman:** İlk portal dönemi en erken bir yıl sonra biter. İş, ilk `service_end` tarihinden en az 30 gün önce üretimde olmalıdır (T08). O tarihe kadar `ops_terminate_order` gerçek müşteride kullanılmaz. Zorunlu kalınırsa 90 gün sonunda erişim geliştirici eliyle kaldırılır ve denetim kaydına yazılır.

**Dayanak.** KVKK md. 4/2-ç ve d, md. 5/2-c, md. 7, md. 8, md. 12; TBK md. 20–25, md. 23.

**Gerekçe.**
- Md. 12/2 “4. fıkra uygulanır” derken sistemin uygulamaması, Şirket aleyhine yorumlanacak bir çelişkidir.
- Tek kural basit ve tutarlıdır; ilk dönem bitişi uzak olduğu için pilotu engellemez.
- **Uzlaştırma:** İki uzman aynı görüşte.

**Metin değişikliği.**
- **Sözleşme Md. 12/4, giriş:** “4. **Sözleşme bir Bahçe için sona erdiğinde** (3. fıkraya göre çıkarma, son Bahçe'nin çıkmasıyla sona erme, süresinin dolması ve yenilenmemesi ya da Şirket'in feshi dahil):”
    - İlk maddeye: “Erişim süresi içinde yenileme teklifi onaylanıp ödenirse erişim yeniden tam açılır.”
    - Sondaki “[Avukat: yenilenmeyen …]” notu silinir.
- **Md. 12/2'nin son cümlesi** korunur.
- **İade Politikası §5:** “Çıkıştan sonra” başlığı “Hizmet bittikten sonra” olur; kural bütün sona erme hallerine yazılır.
- **bahce-yonetimi.md §1, §19 ve musteri-yonetimi.md §19:** “Yenilenmeyen üyelik” kabul edilen risk maddeleri “Karara bağlandı: 12/4 bütün sona erme hallerine uygulanır; T08 ilk dönem bitişinden önce” notuna çevrilir.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T08:** Housekeeping `completed` yaptığında ve `ops_terminate_order` çalıştığında, başka aktif siparişte olmayan parseller için mevcut çıkarma erişim akışı yeniden kullanılır: salt okunur, `removal_access_days` sonra kaldırma, bitişten 7 gün önce SMS. Yenileme ödenirse yeniden açılır. Pilot parsellerinin pasife alınması da bu akışa bağlanır.

<a id="h24"></a>
## H24 – Ödenmeyen siparişin “kendiliğinden düşmesi”

**Soru.** Metin “kendiliğinden düşer” diyor, sistem iptal etmiyor. Hangisi tercih edilmeli; hukuki durum nasıl yazılmalı?

**Karar.**
- **Metin sisteme uydurulur; otomatik iptal zorunlu değildir.**
- **Kurgu:**
    - Sözleşme teklif onayıyla kurulur. Bedel peşindir; hizmet ödeme olmadan başlamaz (ödemezlik def'i).
    - Ödeme süresi içinde ödeme yapılmazsa Şirket ek süre vermeden siparişi iptal ederek sözleşmeden dönebilir ya da süreyi uzatabilir; uzatma bildirilir. Sahip de ödemeden önce siparişi bedelsiz iptal edebilir.
    - Sipariş iptal edilmedikçe geç gelen ödeme kabul edilir ve siparişi etkinleştirir; ek siparişte 8D/5–6 saklıdır.
    - Ödenmeyen sipariş için taraflar birbirinden bedel, faiz ya da tazminat istemez. Şirket ödenmeyen bedel için takip yapmaz.
- **Kabul düğmesi:** Onayın ödeme yükümlülüğü doğurduğunu açıkça söyler.

**Dayanak.** TBK md. 1, 97 (ödemezlik def'i), md. 117–118, md. 123–125 (temerrüt ve sözleşmeden dönme), md. 170–171; 6502 md. 5; Mesafeli Sözleşmeler Yönetmeliği md. 5–7 (siparişin ödeme yükümlülüğü doğurduğunun açıkça bildirilmesi).

**Gerekçe.**
- İki yol da hukuken geçerlidir. Metni sisteme uydurmak tüketici aleyhine hiçbir sonuç doğurmaz ve geç havaleyi kabul etme ile süre uzatma esnekliğini korur.
- “Borçlu muyum” belirsizliğini, Şirket'in bedel istememe taahhüdü giderir. Bahçe çıkarmayı engelleyen bekleyen siparişi Sahip tek adımda iptal edebilir.
- **Uzlaştırma:** Uzman A otomatik iptali (bozucu şart), Uzman B metnin sisteme uydurulmasını önerdi. Uzman B seçildi. Koruma düzeyi eşittir, kod değişikliği gerekmez, geç havalelerin otomatik iadeye düşüp müşteriyi yeniden teklif almaya zorlaması önlenir.

**Metin değişikliği.**
- **Sözleşme Md. 8/2:** H29'daki masraf cümlesiyle birlikte şöyle olur: “2. **Ödeme:** Teklif onaylandıktan sonra peşin ve tek çekimdir: kartla (3D Secure, [ödeme kuruluşu: iyzico] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz. Şirket, ödeme yöntemlerinin hiçbiri için toplam bedelin dışında ücret almaz; havale/EFT ile ödemede Sahip'in kendi bankasının alabileceği gönderim ücreti Sahip'e aittir. Hizmet, ödeme tamamlanmadan başlamaz. Ödeme siparişte yazan ödeme süresi içinde yapılmazsa Şirket ek süre vermeden siparişi iptal edebilir ya da ödeme süresini uzatabilir; uzatma Sahip'e bildirilir. Sahip de ödemeden önce siparişi bedelsiz iptal edebilir (Madde 8C/1). Sipariş iptal edilmedikçe süre geçtikten sonra yapılan ödeme kabul edilir ve sipariş etkinleşir; ek siparişte Madde 8D/5 ve 8D/6 saklıdır. Ödenmeyen sipariş için taraflar birbirinden bedel, faiz ya da tazminat istemez.”
- **İade Politikası §1:** “Ödeme süresi içinde ödenmeyen sipariş kendiliğinden düşer” cümlesi şöyle olur: “Ödeme süresi içinde ödemezseniz siparişinizi iptal edebilir ya da ödeme sürenizi uzatabiliriz; iptal edilmedikçe geç gelen ödemeniz kabul edilir. Ödenmeyen sipariş için sizden bir bedel istenmez.” Başlık notundaki fark açıklaması silinir.
- **Ön Bilgilendirme §4'e:** “Teklifi onaylamak ödeme yükümlülüğü doğurur. Ödeme süresi içinde ödenmeyen siparişi Şirket iptal edebilir ya da süreyi uzatabilir; ödenmeyen sipariş için sizden bir bedel istenmez.”
- **README madde 23:** “Karara bağlandı (H24): metin sisteme uyduruldu.”

**Sistem değişikliği.**
- **Bu iş:** Kabul düğmesi “Teklifi kabul et (ödeme yükümlülüğü doğar)” olur. Altındaki not: “Kabulle sözleşme kurulur ve ödeme adımına geçersiniz. Ödeme süresi içinde ödemezseniz siparişi iptal edebilir ya da ödeme sürenizi uzatabiliriz; sizden bir bedel istenmez.”
- Otomatik iptal eklenmez. Ödeme süresi geçmiş siparişler listesi isteğe bağlıdır.

<a id="h25"></a>
## H25 – Saklama süreleri ve “veri silinmez” kuralı

**Soru.** §7 ve gizlilik §2'deki süreler nasıl doldurulmalı? “Veri silinmez” kuralı md. 4/2-d ve md. 7 ile nasıl bağdaştırılmalı? Saklama ve imha politikası gerekli mi?

**Karar.**
- **Süreler:** KVKK metni §7 aşağıdaki tabloyla yeniden yazılır. Her süre ya bir mevzuat yükümlülüğüne ya da hakkın korunmasına (zamanaşımı) dayanır.
- **Metin sisteme uyar:** Metin, sistemdeki daha kısa fiili sürelere uydurulur (kayıt denemesi özeti 2 gün). Sistem, metinden uzun tuttuğu yerlerde (bildirim kayıtları ve oturum IP'leri süresiz) metne uydurulur (T09).
- **“Veri silinmez” kuralı:** Yeniden tanımlanır: “Veriler sözleşme, erişim ve saklama süresi içinde silinmez; saklama süresi dolunca silinir ya da anonim hale getirilir.” Süresiz saklama md. 4/2-d'ye aykırıdır. KVKK kuralı ürün kuralına üstün gelir.
- **İlk silme vadeleri:** Görüntüler için en erken 2029'dur (ilk dönem 2027'de biter, +2 yıl). Bu nedenle uzun vadeli imha işlevi pilotu engellemez, ama o tarihten önce yapılır (T10). Kısa süreli temizlikler kvkk-v2 yayımlanmadan önce yapılır (T09).
- **Saklama ve imha politikası:** VERBİS'ten muaf veri sorumlusu için zorunlu değildir. Yine de kısa bir iç politika hazırlanır. Periyodik imha en fazla 6 ayda bir yapılır.
- **Anonim istatistik:** Ağaç ölçümleri ve bulgular, konum ve sahip bağlantısı çıkarılıp toplu istatistiğe dönüştürülerek (gerçekten anonim hale getirilerek) süresiz saklanabilir. Konumu ya da parseli taşıyan veri anonim sayılmaz (H31).

| Veri | Süre |
| --- | --- |
| Ham video ve konum (GNSS) kayıtları | İşlenip kalite kontrolünden geçtikten sonra en fazla 30 gün |
| Panoramalar, panorama kesitleri ve raporda kullanılmayan diğer görüntüler | Sözleşme süresince ve Bahçe'nin hizmetten çıkmasından ya da sözleşmenin sona ermesinden sonra 2 yıl |
| Raporlar (PDF ve rapor verisi, raporda gösterilen ağaç görüntüleri dahil), uzman değerlendirmeleri, portal soruları ve cevapları | Sözleşme süresince ve sona ermesinden sonra 10 yıl |
| Kimlik, iletişim ve fatura profili bilgileri | Sözleşme süresince ve sona ermesinden sonra 10 yıl |
| Fatura, ödeme ve iade kayıtları, makbuzlar | İşlemin yapıldığı takvim yılının sonundan itibaren 10 yıl |
| Mesafeli sözleşme ve ön bilgilendirme metinleri ve onayları, aydınlatma teyidi ve rıza kayıtları | Onay tarihinden itibaren 10 yıl |
| İşlem (denetim) kayıtları | Kaydın oluşturulmasından itibaren 10 yıl |
| Sınırı gösteren kişinin telefonu | Sözleşme süresince; Bahçe'nin erişim süresinin sonunda silinir. Envanter kaydındaki adı ve rolü raporla birlikte saklanır |
| Tamamlanmamış kayıtlar (telefonu doğrulanmamış hesap) | 24 saat; sonra silinir |
| Kayıt denemesi özetleri (IP, telefon ve e-posta özeti) | 2 gün |
| Giriş doğrulama kodlarının gönderim kaydı | 7 gün (telefonla giriş denemesi kayıtları 1 gün) |
| Bildirim kayıtları | 12 ay |
| Oturum kayıtları (IP adresi, tarayıcı bilgisi) | Oturum sona erdikten sonra en fazla 30 gün |
| Sunucu ve altyapı kayıtları (IP adresi, istek zamanı) | En fazla 30 gün |
| Yapay zekâ sağlayıcısındaki sonuçlar | En fazla 29 gün |
| Portal erişimi (salt okunur) | H22'deki satır |

Tablonun altına: “Süre dolunca veriler, en geç altı ayda bir yapılan periyodik imhayla silinir, yok edilir ya da anonim hale getirilir. Bahçeye ait ölçüm ve bulgular, konum ve sizinle bağlantısı çıkarılıp toplu istatistiğe dönüştürülerek anonim hale getirildikten sonra saklanabilir.”

**Dayanak.** KVKK md. 4/2-d, md. 5/2-ç ve e, md. 7, md. 10; Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik (RG 28.10.2017) md. 5, 7, 11 (periyodik imha en fazla 6 ay), md. 12; VUK md. 253; TTK md. 82; TBK md. 146–147; Mesafeli Sözleşmeler Yönetmeliği (3 yıllık saklama); 4857 sayılı Kanun md. 75; 5651 sayılı Kanun (Şirket için zorunlu log süresi doğurmaz).

**Gerekçe.**
- Rapor, Şirket'in hizmeti ifa ettiğinin ispatıdır; uzun saklanır.
- Kişilerin görünebildiği panoramalar ispat için zorunlu değildir; kısa süre ölçülülüğü sağlar.
- Metin ile sistem arasındaki farklar giderilmezse aydınlatma gerçeği yansıtmaz.
- **Uzlaştırma:**
    - Panoramalarda Uzman A raporda kullanılmayanlar için 3 yıl, Uzman B bütün görüntüler için 2 yıl önerdi. Raporda gösterilen görüntüler raporla 10 yıl kalır; diğerleri için daha koruyucu olan 2 yıl seçildi.
    - Sunucu kayıtlarında H03 gereği 30 gün seçildi.
    - Sınırı gösteren kişinin telefonu silinir (Uzman B). Adı ve rolü H07'deki ispat ihtiyacı nedeniyle raporla saklanır.
    - Onay ve denetim kayıtlarında başlangıç anı kaydın niteliğine göre belirlendi.

**Metin değişikliği.**
- **KVKK metni §7:** Yukarıdaki tablo ve alt metin.
- **Gizlilik §2:** “en fazla 30 gün” (H03). **Gizlilik §4:** “Kayıt denemelerinin kötüye kullanımını önlemek için IP adresinin, telefonun ve e-postanın anahtarlı tek yönlü özeti 2 gün tutulur.”
- **bahce-yonetimi.md §2 “Veri silinmez” maddesine not:** “Kural, KVKK gereği “sözleşme, erişim ve saklama süresi içinde silinmez; süre dolunca silinir ya da anonim hale getirilir” olarak okunur (hukuk/kararlar.md H25).”
- **MVP.md:** “Saklama süresi sözleşmede yazılır” ifadesi “Saklama süreleri KVKK Aydınlatma Metni §7'dedir; sözleşme Md. 12/4 buna atıf yapar” olur.
- **Yeni iç belge** `docs/hukuk/saklama-imha-politikasi.md`: amaç ve kapsam; süre tablosu (§7 ve iç kayıtlar); sorumlular (Şirket yetkilisi, geliştirici); imha yöntemleri (silme, yok etme, anonim hale getirme; yedeklerde süre); periyodik imha (en fazla 6 ayda bir); talep üzerine silme (H26); kayıt (imha tutanağı).

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T09:**
    - `public.notification` için 12 aydan eski kayıtları silen iş.
    - `auth.sessions` için sona ermiş ve 30 günden eski oturumları silen iş.
    - Telefonu doğrulanmamış hesap temizliğinin barındırılan ortamda zorunlu olması (dağıtım kontrolü).
    - Demo GoTrue denetim kayıtlarının en fazla 30 günde temizlenmesi.
    - Erişim sonunda saha kişisi telefonunun silinmesi.
    - Sözleşme sona erme tarihinin parsel ve sahip bazında saklanması.
- **T10:** 2 ve 10 yıllık imha ve anonimleştirme; 6 aylık periyodik imha.
- **T25:** CLAUDE.md'deki kuralın Yusuf tarafından güncellenmesi.

<a id="h26"></a>
## H26 – KVKK md. 11 başvuruları: silme işlevi olmadan pilota çıkış

**Soru.** Silme ve anonimleştirme işlevi olmadan, talepler elle karşılanarak pilota çıkılabilir mi? Saklama yükümlülüğü olan veriler, ekleme-yalnız kayıtlar ve ortak bahçe verileri nasıl ele alınır? Kimlik doğrulama nasıl yapılır?

**Karar.**
- **Kabul edilebilir.** Kanun bir yazılım işlevi değil, 30 gün içinde ücretsiz ve gerekçeli bir cevap ister. Şartlar:
    - yazılı bir başvuru prosedürü,
    - başvuru defteri (geliş tarihi, doğrulama yöntemi, değerlendirme, karar, cevap tarihi),
    - önceden yazılmış ve gözden geçirilmiş elle silme ve takma ad betikleri (T11).
- **Kimlik doğrulama:** Kayıtlı e-posta kanunda sayılan bir başvuru yoludur. Ancak e-posta doğrulanmadığı için cevap vermeden önce kayıtlı telefona SMS kodu gönderilir ya da teyit portal oturumundan alınır. Yazılı başvuruda ıslak imza ve kimlik bilgileri, KEP ya da güvenli elektronik imza yeterlidir.
- **Silme talebinin ayrıştırılması:**
    1. **Saklama yükümlülüğü olan veriler** (fatura, ödeme ve iade, mesafeli sözleşme ve ön bilgilendirme onayları, makbuz): Silinmez. Erişimleri yalnızca ispat ve mali denetim amacıyla sınırlanır; talep bu kısım için gerekçeyle reddedilir.
    2. **Ekleme-yalnız denetim ve rıza kayıtları:** Hakların korunması için saklanır. Gerekirse kimliği belirleyen alanlar, kayda geçirilen kontrollü bir istisnayla takma ada çevrilir.
    3. **Sözleşme sürerken:** Hizmet için gerekli veriler silinemez; silmenin fesihle mümkün olduğu bildirilir.
    4. **Sözleşme bitmişse ve saklama gerekçesi yoksa:** Veri silinir ya da anonim hale getirilir. Bu, KVKK'nın üstün geldiği “veri silinmez” istisnasıdır.
    5. **Parselde sözleşmesi süren başka sahip ya da hissedar varsa:** Yalnızca talep edenin kişisel verileri (adı, telefonu, hesabı, soruları, kendi siparişlerinin kişisel bağlantıları) silinir. Diğer sahibin hizmetine ait bahçe verileri korunur.
    6. **Hissedarın talebi:** Hesabı ve davet bağlantısı silinir.
    7. **Görüntülerdeki üçüncü kişiler:** Talepleri H01'deki gizleme yoluyla karşılanır.
- **Rıza geri alma:** Portalda vardır; e-posta talebiyle elle de yapılır.

**Dayanak.** KVKK md. 7, 11, 13 (30 gün; gerekçeli ret), md. 28/2, md. 5/2-ç ve e, md. 12; Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ (RG 10.03.2018; başvuru yolları: yazılı, KEP, güvenli elektronik imza, mobil imza, ilgili kişinin daha önce bildirdiği ve sistemde kayıtlı e-posta, başvuru amacına yönelik yazılım; cevap ve ücret); Kişisel Verilerin Silinmesi Yönetmeliği md. 7–12.

**Gerekçe.**
- Pilotta başvuru sayısı çok azdır.
- Asıl risk, kimliği doğrulanmamış birine veri vermek ve saklama yükümlülüğü olan veriyi silmektir; ikisini de prosedür kontrol eder.
- **Uzlaştırma:** İki uzman aynı görüşte. Portal başvuru formu takip işine alındı.

**Metin değişikliği.**
- **KVKK metni §8, “Başvuru” bölümü:**
  “Haklarınız için başvurunuzu, kimliğinizi doğrulayan bilgilerle şu yollarla yapabilirsiniz:
  - yazılı olarak [adres]'e,
  - kayıtlı elektronik posta ile [KEP]'e,
  - güvenli elektronik ya da mobil imzayla,
  - ya da sistemimizde kayıtlı e-posta adresinizden [kvkk@alanadi]'ye.
  E-postayla yapılan başvurularda kimliğinizi doğrulamak için kayıtlı telefonunuza bir kod gönderilir. Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır. Mevzuat gereği saklamak zorunda olduğumuz veriler (fatura, ödeme ve sözleşme kayıtları gibi) saklama süresi dolmadan silinmez; bu durumda gerekçesi size bildirilir ve bu veriler yalnızca o amaçla saklanır. Bahçede hizmeti süren başka bir sahip varsa onun hizmetine ait bahçe verileri korunur; sizin kişisel verileriniz silinir.”
- **Yeni iç belge** `docs/hukuk/kvkk-basvuru-proseduru.md`:
    - başvuru kanalları ve alan kişi,
    - kimlik doğrulama (SMS kodu, portal oturumu, ıslak imza, KEP),
    - başvuru defteri alanları,
    - 30 gün sayacı,
    - karar ağacı (ayrıştırma listesi),
    - cevap şablonları (kabul, kısmi ret, ret),
    - elle silme ve takma ad adımları (T11) ve denetim kaydı.

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T11:**
    - Gözden geçirilmiş elle silme ve takma ad betikleri: `owner_profile`, `parcel_detail` iletişim bilgileri, sorular, hissedar daveti; ekleme-yalnız tablolarda takma ada çevirme; çalıştırılınca denetim kaydı.
    - Sonra portalda “KVKK başvurusu” formu (30 gün sayacıyla ops görevi).

<a id="h27"></a>
## H27 – Demo turu: gizlilik metnine eklenecek demo paragrafı

**Soru.** Demo paragrafı yeterli mi; ayrı aydınlatma gerekir mi? Hukuki sebepler, süreler ve aktarım nasıl yazılmalı? Paragraf docs/hukuk kaynağına girmeli ve sürüm artırılmalı mı?

**Karar.**
- **Ayrı metin gerekmez.** Demo başlatma sayfasındaki kısa metin birinci katman olarak uygundur. Gizlilik politikasındaki “Demo turu” bölümü ikinci katmandır ve Tebliğ'in asgari içeriğini tam karşılayacak biçimde tamamlanır: amaç, hukuki sebep, alıcılar ve yurt dışı aktarım, toplama yöntemi, süreler, haklar.
- **Hukuki sebepler:** Demo oturumu ve geçici hesap için md. 5/2-c (ziyaretçinin talep ettiği demo hizmetinin sunulması). IP özeti, Turnstile ve loglar için md. 5/2-f.
- **IP özeti:** HMAC özeti geri döndürülebildiği için takma adlı kişisel veridir. “Takma adlandırılmış” ifadesi doğrudur; “anonim olmayan” notu eklenir.
- **“Kısa süre” ifadesi** somut sürelerle değişir:
    - oturum kaydındaki ham IP ve tarayıcı bilgisi, oturum süresinin (3 saat) bitiminden sonra en geç 20 dakika içinde hesapla birlikte silinir,
    - altyapı kayıtlarında en fazla 30 gün kalır,
    - giriş sisteminin denetim kayıtlarındaki IP en fazla 30 gün içinde silinir.
- **Aktarım:** Cloudflare, Supabase ve Vercel; H02 kuralı. Standart sözleşmeler demo projesini de kapsamalıdır.
- **Kaynak ve sürüm:** Paragraf docs/hukuk kaynağına girer; gizlilik metni gizlilik-v2-taslak olur, v1 arşive alınır.

**Dayanak.** KVKK md. 3/1, 4, 5/2-c ve f, 9, 10; Aydınlatma Tebliği (asgari içerik, katmanlı aydınlatma); Kurum'un Çerez Rehberi ve Anonimleştirme Rehberi.

**Gerekçe.**
- Demo kişisel bilgi istemez, ama IP ve tarayıcı bilgisi kişisel veridir.
- Mevcut paragraf “ne”yi söylüyor, “neden, hangi sebeple, kime ve ne kadar” sorularını tam cevaplamıyor.
- Kaynak ile yayımlanan metnin ayrışması sürüm ve arşiv düzenini bozar.
- **Uzlaştırma:** İki uzman aynı görüşte. Altyapı log süresi H03 gereği 30 gün yazıldı.

**Metin değişikliği.**
- **Gizlilik politikası (gizlilik-v2-taslak):** Yeni “5. Demo turu” bölümü eklenir; “Haklarınız” 6, “Değişiklikler” 7 olur. Bölümün metni:
  “- Demo turu, hesap açmadan ürünü denemeniz için ayrı bir ortamda (demo.[alanadi]) sunulur. Sizden ad, telefon ya da e-posta istenmez. Demo, oturum süresi (3 saat) dolunca silinen geçici bir hesapla açılır; hesabın e-posta adresi rastgeledir ve teslim edilemez. Demodaki kişiler kurgusal, görüntüler sentetiktir.
  - **İşlenen veriler:** IP adresiniz, tarayıcı ve cihaz bilgileriniz, robot doğrulamasının sonucu.
  - **Amaç ve hukuki sebep:** Demo oturumunun açılması ve sürdürülmesi (talep ettiğiniz hizmetin sunulması, KVKK md. 5/2-c); kötüye kullanımın önlenmesi ve bilgi güvenliği (meşru menfaatimiz, md. 5/2-f).
  - **Süreler:** IP adresinizin takma adlandırılmış özeti (anahtarlı özet; IPv6'da /64 önekinin özeti) 48 saat tutulur. Bu özet anonim değildir; anahtarına sahip olan tarafından adresle eşleştirilebileceği için kişisel veri sayılır. Ham IP adresi ve tarayıcı bilgisi oturum kaydında, oturum süresinin bitiminden sonra en geç 20 dakika içinde hesapla birlikte silinir. Giriş sisteminin denetim kayıtlarındaki IP adresi en fazla 30 gün içinde silinir. Altyapı sağlayıcılarımızın sunucu kayıtlarında IP adresi en fazla 30 gün kalır.
  - **Çerezler:** Yalnızca oturumu açık tutan zorunlu bir oturum çerezi ve robot doğrulaması çerezleri kullanılır; onayınız istenmez.
  - **Aktarım:** Robot doğrulaması Cloudflare Inc. (ABD), barındırma Supabase Inc. ve Vercel Inc. (sunucular AB'de, şirketler ABD'de) tarafından sağlanır. Aktarım KVKK md. 9'a uygun standart sözleşmeyle yapılır.
  - Demo turunda hiçbir veri yapay zekâ hizmetine gönderilmez ve analitik kullanılmaz.
  - Haklarınız için 6. bölüme bakınız.”
- **Demo başlatma sayfası (demo.ts, kısa metin):**
    - 1. madde aynı kalır.
    - 2. madde: “Kötüye kullanımı önlemek için IP adresinizin takma adlandırılmış (anonim olmayan) bir özeti 48 saat tutulur (IPv6'da /64 öneki).”
    - 3. madde: “Ham IP adresi, oturum süresi bitince en geç 20 dakika içinde demo hesabıyla birlikte silinir; altyapı kayıtlarında en fazla 30 gün kalır.”
    - 4. madde: “Robot doğrulaması (Turnstile) Cloudflare Inc. (ABD) tarafından sağlanır; aktarım KVKK md. 9'a uygun standart sözleşmeyle yapılır.”
- **demo-turu.md §12:** Paragrafın artık gizlilik-v2-taslak'ın 5. bölümü olduğu yazılır.

**Sistem değişikliği.**
- **Bu iş:** Demo paragrafı `legal.ts` gizlilik metnine taşınır, `/gizlilik` sayfasındaki ekleme kaldırılır, `demo.ts` kısa metni güncellenir, sürüm ve arşiv güncellenir.
- **T09:** Demo GoTrue denetim kaydı temizliğinin barındırılan demo projesinde çalıştığının doğrulanması; çalışmıyorsa en fazla 30 günlük periyodik temizlik.

<a id="h28"></a>
## H28 – Demo vitrini için gerçek bahçe sahibinden yazılı izin

**Soru.** İzin metni nasıl olmalı? Tanınabilir çevreyi açıkça kapsamalı mı? Üçüncü kişiler ve komşu parseller için ne gerekir?

**Karar.**
- **Yazılı açık rıza:** Islak imzalı form ya da portalda ayrı ve kayıtlı onay. Hizmete bağlanmaz; vermemek hizmeti etkilemez; geri alınabilir.
- **İzinde açıkça yazılması gerekenler:**
    - hangi bahçe ve hangi veriler,
    - herkese açık demo sitesi ve tanıtım amacı,
    - herkesin görebileceği ve kopyalayabileceği,
    - konum kaydırılsa bile tepe, bina, yol ve komşu parsellerden yerin ve Sahip'in bulunabileceği (bu yazılmazsa rıza “bilgilendirilmiş” sayılmaz),
    - uygulanacak önlemler,
    - süre: en fazla 3 yıl ya da geri alınana kadar,
    - geri almada en geç 30 gün içinde kaldırma ve önceden kopyalanmış içeriğin geri alınamayacağı,
    - karşılık (varsa),
    - Sahip'in yetkisi.

  Hisseli bahçede diğer paydaşlar bilgilendirilir; tercihen tek malikli ya da tek kullanıcılı bahçe seçilir.
- **Görüntülerdeki üçüncü kişiler:** Herkese açık yayın için meşru menfaat yeterli değildir; Sahip onlar adına rıza veremez.
    - Varsayılan: Kişi görünen kareler vitrine **konmaz**.
    - Kaçınılmazsa yüz, plaka ve tanınmaya yetecek beden ve kıyafet ayrıntısı bulanıklaştırılır. Küçük bir köyde yüz bulanıklaştırması tek başına yetmeyebilir.
    - Konut avlusu ve pencere içini gösteren kareler çıkarılır.
- **Komşu parseller:** Yalnızca arka plan olarak görünebilir. Komşu parselin adı, sahibi, TKGM poligonu, sınırı, ağaç kodları ve değerlendirmeleri gösterilmez.
- **Kişisel bilgilerin temizlenmesi yetmez tek başına.** Kişi verilerinin çıkarılması, EXIF/XMP silme ve konum kaydırma gereklidir; yeterliliği rıza ve kare seçimi kurallarıyla birlikte sağlanır.

**Dayanak.** KVKK md. 3/1-a, 4, 5/1, 7, 9, 10, 11; Kurum'un Açık Rıza Rehberi ve Anonimleştirme Rehberi; TMK md. 24–25; 5846 sayılı FSEK; Sözleşme Md. 10/3.

**Gerekçe.**
- Herkese açık yayın hizmet amacından tamamen ayrı ve geri dönüşü olmayan bir amaçtır; açık rıza dışında bir dayanakla savunulamaz.
- Üçüncü kişilerden rıza almak pratik değildir; onları vitrinden çıkarmak en düşük riskli yoldur.
- **Uzlaştırma:** İki uzman aynı görüşte. Uzman A'nın paydaş bilgilendirmesi ile Uzman B'nin 3 yıllık süre ve “kareyi tamamen dışarıda bırakma” varsayılanı birleştirildi.

**Metin değişikliği.**
- **Yeni belge** `docs/hukuk/demo-vitrin-izni.md` (vitrin-v1-taslak):
  “**DEMO VİTRİNİ İÇİN GÖRSEL VE VERİ KULLANIM İZNİ** — Ben, [ad soyad], [il/ilçe/köy]'de bulunan ve [Ek-1 kaydı] ile hizmet aldığım bahçeye ait (a) [tarih aralığı] tarama görüntülerinin (360° panoramalar, ağaç ve yakın plan görüntüleri), (b) ağaç ölçümleri, sınıfları ve uzman değerlendirmelerinin, (c) örnek raporların, OBA Bilişim Teknolojileri LTD. tarafından herkese açık demo sitesinde ([demo.alanadi]) ve ürün tanıtımında örnek bahçe olarak kullanılmasına açık rızamla izin veriyorum.
  Şunları biliyorum:
  - Bu içerikler herkese açıktır; bütün ziyaretçiler aynı içeriği görür, kopyalayabilir.
  - Şirket adımı, telefonumu, parsel ve köy adını ve notlardaki kişi adlarını çıkaracak, bahçenin konumunu kaydıracak, görüntülerin konum bilgisini silecek, kişi görünen kareleri kullanmayacak, kaçınılmaz durumlarda yüzleri ve plakaları tanınmayacak hale getirecek ve komşu parsellere ait bilgileri göstermeyecektir.
  - Buna rağmen görüntülerdeki tepeler, binalar, yollar ve komşu araziler nedeniyle bahçemin yeri bulunabilir ve bahçe benimle ilişkilendirilebilir.
  - İçerik en fazla [3] yıl ya da iznimi geri alana kadar yayımlanır.
  - İznimi istediğim zaman [kvkk@alanadi] adresine ya da portala yazarak geri alabilirim; içerik en geç 30 gün içinde kaldırılır. Daha önce görüntülenmiş ya da indirilmiş kopyalar Şirket'in kontrolünde değildir.
  - Bu bahçe üzerinde bu izni vermeye yetkiliyim; bahçe hisseliyse diğer paydaşları bilgilendirdim.
  - İzin vermemem ya da geri almam hizmetimi etkilemez.
  [Karşılık: yok / …] · Tarih · İmza ya da portal onayı”
- **Sözleşme Md. 10/3:** H31'deki metin. Tanıtım ve yayının ayrı yazılı izne bağlı olduğu cümlesini içerir.
- **demo-turu.md §7:** “Kişi görünen kareler vitrine konmaz; kaçınılmazsa yüz, plaka ve tanınmaya yetecek ayrıntı bulanıklaştırılır. Komşu parsel bilgileri gösterilmez. İzin metni: hukuk/demo-vitrin-izni.md.”

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T17:**
    - Vitrin dışa aktarma aracı kişi görünen kareleri varsayılan olarak dışarıda bırakır; kare başına elle onay listesi tutulur.
    - Komşu parsel ve TKGM katmanı kapalıdır.
    - İzin kaydı (sürüm, kapsam) olmadan çalışmaz.
    - Geri alma için `demo-media` ve demo veritabanından kaldırma ve CDN önbelleğini temizleme runbook'u (en fazla 30 gün).

<a id="h29"></a>
## H29 – Havale/EFT masrafı ve “ek masraf yoktur” beyanı

**Soru.** Havale masrafı tüketiciye bırakılabilir mi; ön bilgilendirmede yazılmalı mı? Havale iadesinin masrafını kim üstlenir?

**Karar.**
- **Ödemede:** Sahip'in kendi bankasının aldığı gönderim ücreti Sahip'e bırakılabilir. Bu ücret Şirket'in tahsil ettiği bir bedel değildir. Ancak “Ek masraf yoktur” cümlesi yanıltıcı olabileceği için açıkça yazılır. Şirket hiçbir yöntem için ek ücret (komisyon, kart ücreti) almaz.
- **İadede:** Bütün iadeler (cayma, 8A, bahçe çıkarma, `order_closed`, fazla ödeme) tutarın tamamıyla ve Sahip'e masraf yüklenmeden yapılır. Havale iadesinde gönderim ücretini Şirket öder; Sahip'in hesabına iade tutarının tamamı ulaşır.

**Dayanak.** Mesafeli Sözleşmeler Yönetmeliği md. 5/1 (vergiler dahil toplam fiyat; ek masrafların bildirilmesi; bildirilmeyen masraftan tüketicinin sorumlu olmaması), md. 6, md. 12 (iadenin tüketiciye masraf ya da yükümlülük getirilmeden yapılması); 6502 md. 5, md. 48; Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği.

**Gerekçe.**
- Cayma için kanun açıktır. Diğer iadelerde eksik tutar tartışma ve haksız şart riski doğurur; Şirket'e maliyeti küçüktür.
- **Uzlaştırma:** İki uzman aynı görüşte.

**Metin değişikliği.**
- **Ön Bilgilendirme §3, son madde:** “Teklifte yazan toplam bedel dışında Şirket'e ödeyeceğiniz başka bir ücret yoktur. Kartla ödemede ek ücret alınmaz. Havale ya da EFT ile ödemede kendi bankanızın alabileceği gönderim ücreti size aittir.” Avukat notu silinir.
- **Sözleşme Md. 8/2:** H24'teki metin (masraf cümlesi dahil). Md. 8B/3 korunur.
- **İade Politikası §6'ya:** “Bütün iadeler tutarın tamamıyla ve size masraf yüklenmeden yapılır; havale ile iadede gönderim ücretini Şirket öder ve iade tutarının tamamı hesabınıza ulaşır.”

**Sistem değişikliği.**
- **Bu iş:** Portaldaki havale açıklamasının sonuna “Bankanızın alabileceği gönderim ücreti size aittir; Şirket ek ücret almaz” notu eklenir.
- **Ops kılavuzu:** “Havale iadesi tam tutarla gönderilir; banka ücreti Şirket'e ayrı gider olarak yazılır.”

<a id="h30"></a>
## H30 – Aydınlatma “onayı”nın rıza kaydı gibi alınması (türetilmiş soru)

**Soru.** Zorunlu “aydınlatma metnini okudum” kutusunun rıza tablosunda tutulması ve “KVKK onayı / rızası” olarak anılması uygun mu? Hizmet şartı yapılabilir mi? Pilot sahiplerde ne yapılmalı?

**Karar.**
- **Aydınlatma bir rıza ya da onay değildir.** Veri sorumlusunun tek taraflı bilgilendirme yükümlülüğüdür. “KVKK onayı” ya da “rızası” diye anılması, verinin açık rızaya dayandığı izlenimini yaratır ve aydınlatma ile açık rızanın ayrı tutulması ilkesine aykırı görünür.
- **Doğru kurgu:**
    - Kutu “okudum” **teyididir**.
    - Zorunlu tutulabilir; teklif kabulünün ve hizmetin şartı yapılabilir, çünkü bir izin değil, bilgilendirmenin ispatıdır.
    - Kaydın `consent_record` tablosunda `kvkk_notice` türüyle tutulması teknik olarak sorun değildir.
    - Arayüzde, metinlerde, dokümanlarda ve ops dilinde aydınlatma için “onay” ya da “rıza” kelimesi kullanılmaz.
- **Pilot ve kâğıt sahipler:** Ops “KVKK onayı almaz”. Aydınlatma metnini basılı verir ya da SMS bağlantısıyla gönderir. Alındığını sahibin imzasıyla (alındı) ya da tarihli bir kayıtla tutar. İlk portal girişinde teyit kaydı yoksa teyit ekranı gösterilir (T15).
- **Alan adları:** `kvkk_consent` alanlarının yeniden adlandırılması zorunlu değildir. Etiketler ve yorumlar düzeltilir.

**Dayanak.** KVKK md. 3/1-a, md. 5, md. 10; Aydınlatma Tebliği (aydınlatmanın açık rızadan ayrı yapılması; ispat yükü); Kurum'un Açık Rıza Rehberi (açık rızanın hizmet şartına bağlanmaması; aydınlatmanın rıza gibi kurgulanmaması).

**Gerekçe.**
- “KVKK rızası” adlı bir kaydı geri alan kişi, sözleşmeye dayanan işlemlerin de durmasını bekleyebilir.
- Adlandırmayı düzeltmek düşük maliyetlidir ve ürünü durdurmaz.
- **Uzlaştırma:** İki uzman aynı görüşte. Yeniden adlandırma migration'ı isteğe bağlı bırakıldı.

**Metin değişikliği.**
- **Arayüz metinleri:**
    - kayıt formu kutusu “KVKK aydınlatma metnini okudum.” (değişmez),
    - kayıt hata mesajı “Devam etmek için aydınlatma metnini okuduğunuzu işaretleyin.”,
    - portal düğmesi “Onayla” yerine “Kaydet”,
    - teklif sayfasında “Teklifi kabul etmeden önce metni okuyup kaydedin.”,
    - başka kuruluş uyarısı “Bu teklif için aydınlatma metnini okuduğunuza dair kayıt yok ve buradan kaydedilemiyor. Lütfen bizimle iletişime geçin.”,
    - rıza türü etiketi `kvkk_notice` “Aydınlatma metni (okundu teyidi)”.
- **Ops (tr.ts):**
    - “KVKK onayı” yerine “Aydınlatma metni”,
    - “Aydınlatma metni okundu, açık rıza alındı” yerine “Aydınlatma metni verildi (okundu teyidi)”,
    - “Onay tarihi” yerine “Teyit tarihi”,
    - “Onaylanan metin sürümü” yerine “Aydınlatma metni sürümü”,
    - hissedar davetleri ipucu: “Sahiplerin portaldan davet ettiği hissedarlar. Kişiyi arayın; numarasının sahipten alındığını söyleyin, aydınlatma metninin bağlantısını SMS ile iletin ve okuduğunu kaydedin. Hesap telefonla açılır ve hissedar parsele izleyici olarak eklenir.”
- **kullanim-kilavuzu.md “1. Kayıt” adım 1:** “Sahiple telefonda ya da yüz yüze görüşülür. Ad, telefon ve iletişim tercihi alınır. Aydınlatma metni sahibe verilir (basılı ya da SMS bağlantısı) ve aldığı imzalı alındıyla ya da tarihli bir kayıtla tutulur. İsteğe bağlı açık rızalar ayrıca sorulur (bugün sorulan yoktur; hukuk/kararlar.md H06, H31).” Diyagramdaki “KVKK onayı” yerine “aydınlatma metni” yazılır.
- **Kâğıt alındı şablonu** (kılavuza girer): “Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni'nin (sürüm …) bir nüshasını aldım ve okudum. Ad soyad / Tarih / İmza.”
- **MVP.md veri modeli Owner:** “KVKK rızası ve tarihi” yerine “Aydınlatma metni okundu teyidi (metin sürümü, tarih); isteğe bağlı açık rızalar ayrı”.
- **musteri-yonetimi.md §1, §4, §6.4:** “aydınlatma onayı” ifadeleri “aydınlatma teyidi” olur.

**Sistem değişikliği.**
- **Bu iş:** Etiket ve mesaj değişiklikleri.
- **T15:** Ops'un açtığı sahiplerde ve hissedarlarda ilk girişte teyit ekranı. Alan adı göçü isteğe bağlıdır.

<a id="h31"></a>
## H31 – “Hizmetin geliştirilmesi” açık rızası ile Md. 10/3 (türetilmiş soru)

**Soru.** Kimliksizleştirilmiş görüntüler gerçekten anonim mi? Geliştirme kullanımı açık rızaya mı, meşru menfaate mi dayanmalı? İki metin nasıl uyumlu olur?

**Karar.**
- **Anonim değildir.** Görüntülerde kişiler görünebilir; konum yeniden bulunabilir ve bahçe parsel ya da tapu kaydıyla eşleştirilebilir. “Kimliksizleştirme” yalnızca takma adlandırmadır; veri kişisel veri olarak kalır. Md. 10/3'teki varsayım hatalıdır.
- **Şirket içi geliştirme meşru menfaate dayanır (md. 5/2-f).** Kapsam: yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve kalibrasyonu, değerlendirme (eval), istem ve metodoloji geliştirme, kalite ölçümü. Güvenceler:
    - erişim sınırlıdır,
    - Sahip'in adı, iletişim ve tapu bilgisiyle ilişkilendirilmez,
    - yalnızca gerekli görüntüler kullanılır,
    - Şirket dışına verilmez ve yayımlanmaz,
    - itiraz hakkı vardır.

  Yurt dışındaki sağlayıcının kullanımı (eval dahil) H02 kapısına tabidir.
- **Açık rıza yalnızca dışa dönük kullanımlar için istenir:** Şirket dışına verme (araştırma kurumu, veri seti paylaşımı), yayın ve tanıtım (H28), Şirket dışındaki bir sağlayıcının modelinin bu verilerle eğitilmesi. Bu işler için o zaman ayrı ve belirli bir rıza metni hazırlanır.
- **Açık Rıza md. 2 kaldırılır.** Bugün bu amaçla işlem yok. Başka bir dayanak varken rıza istemek yanıltıcıdır, çünkü kişi rızayı geri alınca işlemin duracağını sanır. Mevcut `explicit_service_improvement` kayıtları silinmez, ama hiçbir işlemin dayanağı olarak kullanılmaz. “Her geliştirme işi `my_consents` denetler” kuralı kaldırılır.

**Dayanak.** KVKK md. 3/1 (anonim hale getirme), md. 4/2-b ve c, md. 5/2-f, md. 7, md. 10, md. 11/1; Kişisel Verilerin Silinmesi Yönetmeliği md. 10; Kurum'un Anonimleştirme Rehberi, Açık Rıza Rehberi ve meşru menfaat dengesi kararları; Sözleşme Md. 10/3.

**Gerekçe.**
- Rızaya dayalı bir geliştirme kurgusu, her geri almada modellerin, değerlendirme setlerinin ve metodoloji kayıtlarının ayıklanmasını gerektirir. Bu küçük bir girişim için işletilemez; uzman kararları zaten istem geliştirmede kullanılıyor (PR #47).
- Şirket içi kendi hizmetini geliştirmek, sınırlı ve tedbirli yapıldığında meşru menfaatin tipik örneğidir.
- **Uzlaştırma:** Uzman A md. 2'yi kaldırmayı, Uzman B md. 2'yi dışa paylaşıma daraltıp yeniden sormayı önerdi. Bugün dışa paylaşım planı olmadığından, daraltılmış bir kutu “işlevi olmayan rıza düğmesi” olurdu. Bu nedenle Uzman A seçildi; dışa paylaşım için ihtiyaç doğunca ayrı metin hazırlanır.

**Metin değişikliği.**
- **Sözleşme Md. 10/3:** “3. Şirket, hizmetin ve değerlendirme yöntemlerinin geliştirilmesi (yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve kalibrasyonu, metodoloji güncellemesi, kalite ölçümü dahil) amacıyla Bahçe'ye ait görüntüleri ve değerlendirmeleri yalnızca Şirket içinde, erişimi sınırlı olarak ve Sahip'in adı, iletişim ve tapu bilgileriyle ilişkilendirmeden kullanabilir (KVKK md. 5/2-f; Sahip itiraz edebilir). Bu veriler Şirket dışındaki kişilerle paylaşılmaz ve yayımlanmaz; yurt dışındaki hizmet sağlayıcıların kullanımı Aydınlatma Metni'ndeki güvencelere tabidir. Görüntülerin ya da Bahçe verilerinin Şirket dışına verilmesi, yayımlanması ya da tanıtımda (örneğin demo vitrininde) kullanılması Sahip'in ayrı yazılı açık rızasına bağlıdır. Konum ve kişi bağlantısı çıkarılarak tamamen anonim hale getirilmiş toplu istatistikler bu sınırlamaya tabi değildir.”
- **KVKK metni §3 amaç 6:** “Hizmet kalitesinin ölçülmesi ve iyileştirilmesi; değerlendirme yöntemlerinin ve yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve geliştirilmesi (yalnızca Şirket içinde; adınız, iletişim ve tapu bilgilerinizle ilişkilendirilmeden).”
- **KVKK metni §4:** 5 ve 6 meşru menfaat (f) kalır. Tablonun altına: “Bahçede bulunan diğer kişilerin görüntüleri meşru menfaate (f) dayanır (9. bölüm). Ödeme kuruluşuna aktarım sözleşmenin ifasına (c) dayanır. Meşru menfaate dayanan işlemlere Kanun md. 11 uyarınca itiraz edebilirsiniz. Açık rızaya dayanan tek işlem 8. amaçtır; isteğe bağlıdır ve hizmeti almanıza engel değildir ([Açık Rıza Metni](acik-riza-metni.md)).” Eski “Açık rızanıza dayanan işlemler …” paragrafının yerine geçer.
- **KVKK metni §2, son paragraf:** “Bahçenize ait ölçümler, ağaç değerlendirmeleri ve bulgular, size ait bir bahçeyle ilişkilendirildikleri sürece kişisel veri gibi korunur.”
- **Açık Rıza Metni:** md. 2 silinir (H06'daki yeni metin).
- **Sözleşme Ek-4** açıklaması H06'daki gibidir.
- **musteri-yonetimi.md §2:** “Hizmetin geliştirilmesi ve tanıtım rızaları kaydedilir … `my_consents`” maddesi şöyle olur: “Hizmetin geliştirilmesi rızası sorulmaz; Şirket içi geliştirme meşru menfaate dayanır (hukuk/kararlar.md H31). Tanıtım onayı İYS'den sonra sorulur (H06). Eski kayıtlar silinmez, dayanak olarak kullanılmaz.”
- **services/ai-worker/README.md:** “Değerlendirme ve istem geliştirme verileri repo dışında, erişimi kısıtlı bir yerde tutulur; sahip ve parsel kimliği yerine kod kullanılır.”

**Sistem değişikliği.**
- **Bu iş:** `explicit_service_improvement` kutusu kayıt formundan ve Hesabım › İzinler'den kaldırılır. Daha önce verilmişse yalnızca geri alınabilir olarak gösterilir. Sunucu yeni verilmesini reddeder.
- Eval ve geliştirme dışa aktarımları repo dışında tutulur (kural).

<a id="h32"></a>
## H32 – Sahibin verdiği üçüncü kişi verileri: hissedarlar, sınırı gösteren kişi, erişim notu (türetilmiş soru)

**Soru.** Hissedarlar, sınırı gösteren kişi ve erişim notundaki kişiler için aydınlatmayı kim yapar? Sahip'e beyan ettirilmeli mi? Hissedarın raporları görmesi paylaşım sorunu yaratır mı?

**Karar.**
- **(a) Hissedarlar:** Veri (ad, telefon) Sahip'ten alındığı için Şirket aydınlatmayı **ilk iletişimde** yapar.
    - Ops'un ilk araması ve davet SMS'i, numaranın Sahip'ten alındığını ve hangi bahçe için davet edildiğini söyler; aydınlatma metninin bağlantısını içerir.
    - Hissedar ilk girişte okundu teyidi verir.
    - Hukuki sebep: Sahip'in sözleşmesinin ifası (5/2-c) ve meşru menfaat (5/2-f).
    - Hissedar raporları görür; Sahip'in fatura ve iletişim bilgilerini görmez.
    - Çok sahipli parselde bir sahibin davet ettiği hissedar diğer sahibin soru-cevaplarını ve kişisel bilgilerini görmez.
    - Raporların hissedarla paylaşılması, Sahip'in kendi hizmetinin sonucunu kendi seçtiği kişiyle paylaşmasıdır (Md. 10/1); davet edilmemiş diğer tapu malikleri için bir paylaşım sorunu doğmaz.
- **(b) Sınırı gösteren kişi:** İlk iletişimde (telefonda ya da sahada) kısa sözlü bilgi verilir ve istenirse bağlantı gönderilir. Hukuki sebep meşru menfaattir (5/2-f). Telefonu H25'teki süreyle silinir.
- **(c) Erişim notu:** Kapı, anahtar ve yol bilgisiyle sınırlı tutulur; gereksiz kişi bilgisi yazılmaz.
- **Sahip'e beyan hükmü eklenir.** Şirket'in aydınlatma yükümlülüğünün yerine geçmez, onu tamamlar.

**Dayanak.** KVKK md. 4/2-ç, md. 5/2-c ve f, md. 8, md. 10, md. 12; Aydınlatma Tebliği (veri ilgili kişiden elde edilmediğinde: iletişim için kullanılacaksa ilk iletişimde, aktarılacaksa en geç ilk aktarımda); Sözleşme Md. 9/3–4, 10/1.

**Gerekçe.**
- Verinin üçüncü bir kişiden alınması aydınlatmayı kaldırmaz, zamanını ilk iletişim anına kaydırır.
- Sahip'in beyanı, yetkisiz kaynaktan veri alındığı iddiasına karşı dayanaktır.
- **Uzlaştırma:** İki uzman aynı görüşte. Bugün hissedar onboarding'i ops'un aramasıyla yürüdüğünden, aydınlatma hem aramaya hem de davet SMS'ine bağlandı.

**Metin değişikliği.**
- **Sözleşme Md. 9/4:** “4. **Hissedarlar:** Sahip, portalda hissedarlarını izleyici olarak ekleyebilir. Hissedarlar Bahçe'nin raporlarını görür; Sahip'in fatura ve iletişim bilgilerini ve soru-cevaplarını görmez. Sahip, davet ettiği kişinin Bahçe'de hakkı bulunduğunu ve telefon numarasını Şirket'e vermeye yetkili olduğunu beyan eder. Şirket hissedarı ilk iletişimde Aydınlatma Metni hakkında bilgilendirir.”
- **Sözleşme, yeni Md. 5/6:** “6. Sahip, sınırı gösterecek kişi ya da hissedar olarak bilgilerini Şirket'e verdiği kişileri, bilgilerinin hizmetin yürütülmesi amacıyla Şirket'e verildiği ve Şirket'in kendileriyle iletişime geçebileceği konusunda bilgilendirir. Erişim notuna bu amaçla gerekli olmayan kişisel bilgi yazmaz. Bu yükümlülük, Şirket'in bu kişileri ilk iletişimde bilgilendirme yükümlülüğünü ortadan kaldırmaz.”
- **KVKK metni §2'ye satır:** “Sizin verdiğiniz üçüncü kişi bilgileri | Hissedarlarınızın ve sahada sınırı gösteren kişinin adı ve telefonu. Bu bilgileri sizden alırız; bu kişileri ilk iletişimde ayrıca bilgilendiririz.”
- **KVKK metni §5, yurt içine:** “Davet ettiğiniz hissedarlar: Bahçe'nin raporlarını görür; fatura ve iletişim bilgilerinizi görmez.”
- **KVKK metni §6'ya:** “Hissedarlarınızın ve sahada sınırı gösterecek kişinin bilgilerini sizden alırız.”
- **Erişim notu ipucu (portal-billing.ts `accessNoteHint`):** “Yol tarifi, kapı, anahtar gibi bilgiler. Gerekmedikçe kişi bilgisi yazmayın.”
- **tr.ts hissedar davetleri ipucu:** H30'daki metin.
- **kullanim-kilavuzu.md:** Saha kişisi ilk arandığında okunacak kısa bilgilendirme: “Numaranızı bahçe sahibi bize verdi. orchadOS bahçe denetimi için sizi ziyaret günü aramak ve sınırı göstermeniz için kullanıyoruz. Ayrıntılı bilgi: [alanadi]/kvkk.”

**Sistem değişikliği.**
- **Bu iş:** İpucu ve etiket metinleri.
- **T15:**
    - Hissedar davet SMS şablonunda aydınlatma bağlantısı ve “numaranız … tarafından verildi” ifadesi. Örnek: “orchadOS: {parcel_name} bahçesinin sahibi sizi raporları görmeniz için davet etti; numaranızı bize o verdi. Kişisel verileriniz: {aydinlatma_link} Giriş: {link}”
    - Hissedarın ilk girişinde teyit ekranı.
    - Davet formunda Sahip için zorunlu beyan kutusu: “Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim.”
- **T23:** Soru-cevap görünürlüğünün testi.

<a id="h33"></a>
## H33 – Kayıtta hesap varlığının açığa çıkması (türetilmiş soru)

**Soru.** `email_taken` ve `phone_registered` hataları KVKK md. 12 açısından kabul edilebilir mi?

**Karar.**
- **Pilotta kabul edilebilir bir düşük risktir.** Mevcut önlemler (Turnstile, IP, telefon ve e-posta özetiyle oran sınırı, telefon başına sınır, yanıt ve loglarda kişisel veri olmaması) pilot ölçeğinde yeterlidir.
- **Genel lansmandan önce düzeltme zorunludur.** Herkese açık self-servis kayıt duyurulmadan önce düzeltilir. Bir numaranın kayıtlı olduğunun açığa çıkması, o kişinin bahçe denetim müşterisi olduğunu ifşa eder.
- **Düzeltme:**
    - Kayıtlı telefon için de “doğrulama kodu gönderildi” akışı izlenir; kod yalnızca telefon sahibine gider.
    - E-posta çakışması ayırt edilebilir bir hata olarak gösterilmez. Genel mesaj kullanılır: “Kayıt tamamlanamadı; bu bilgilerle hesabınız varsa telefonunuzla giriş yapın.”
    - İki durumda yanıt süresi benzer tutulur.
- **Oran sınırları:** Üretimde etkin tutulur.

**Dayanak.** KVKK md. 12/1; Kurum'un Kişisel Veri Güvenliği Rehberi (risk temelli teknik ve idari tedbirler).

**Gerekçe.**
- Pilotta kullanıcı az ve kayıt çoğunlukla ops eliyle yapılır.
- Kayıt herkese açıldığında numara tarayan otomatik denemeler gerçekçi hale gelir. O noktada bilinen ve düzeltilmemiş bir açık savunulamaz.
- **Uzlaştırma:** Uzman A düzeltmeyi isteğe bağlı, Uzman B genel lansmandan önce zorunlu saydı. Pilotu engellemeyen ve daha koruyucu olan Uzman B seçildi.

**Metin değişikliği.** musteri-yonetimi.md §19'daki kabul edilen risk notuna: “Hukuki değerlendirme (hukuk/kararlar.md H33): pilotta kabul edilebilir; genel lansmandan önce düzeltilir (T19).”

**Sistem değişikliği.**
- **Bu iş:** Yok.
- **T19:** Genel lansmandan önce.

<a id="h34"></a>
## H34 – Diğer yer tutucular: hukuki sınırı olan süreler ve şirket bilgileri

**Soru.** Hangi yer tutucuların hukuki asgari ya da azami değeri var; ne olmalı? Satıcı bilgileri eksikken metin yayımlanabilir mi?

**Karar.**

**Süreler:**
- **Cayma iadesi:** 14 gün (Yönetmelik; sabit).
- **8A/2 ve 12/3 iade süresi:** Kanuni süre yoktur; 14 gün uygundur ve bütün iadelerde aynı süre kullanılır.
- **12/3 bildirim süresi:** Sahip için “hemen” seçeneği eklenir (H20). “30 gün sonra” seçeneği 30 gün kalır. Şirket için en az 30 gün ve yalnızca haklı sebeplerle.
- **12/2 yenileme teklifi:** Kanuni süre yoktur; 45 gün uygundur.
- **12/4 erişim:** 90 gün (kullanıcı kararı).
- **12/1 süre:** **Hukuki sınırı vardır.** Hizmet yılı 1 yılı aşmamalıdır; köşeli parantez kaldırılır. Md. 12/1'deki “kurulduğu tarihten (portalda ödeme gününden)” ifadesi Md. 16 ile çelişir. Düzeltme: sözleşme onayla kurulur; hizmet yılı Md. 8/5'e göre başlar ve 1 yıl sürer.
- **4/3 rapor süresi:** Kanuni süre yoktur, ama ön bilgilendirmede ifa süresi olarak bağlayıcıdır ve boş bırakılamaz. 15 iş günü yazılır; operasyon daha kısasını taahhüt edebilir.
- **4/2 ziyaret sayısı:** Paket belirler. Metin “paketteki sayıda; teklifte yazar” olarak yazılır.
- **8D/5 son ek günü:** 30 gün uygundur.
- **8/4 pilot dönemi:** Boş ya da seçenekli bırakılamaz; fiyat ve ifa koşulu ön bilgilendirmenin zorunlu içeriğidir. Ücretsizse “ücretsiz” ve süresi, indirimliyse oranı ve süresi kesin yazılır. Pilot sonunda ücretli döneme kendiliğinden geçilmez. Değer bir iş kararıdır (Yusuf).

**Satıcı bilgileri:** Unvan, MERSİS, açık adres, telefon, e-posta, KEP, vergi dairesi ve numarası eksikken metin **yayımlanamaz ve teklif kabulü alınamaz**. Bunlar ön bilgilendirmenin ve elektronik ticaret mevzuatının zorunlu içeriğidir. Eksiklik idari para cezası doğurur ve ön bilgilendirme eksik sayılırsa cayma süresini bir yıla kadar uzatabilir. Taslak metin yalnızca geliştirme ve demo ortamlarında taslak bandıyla gösterilir.

**Üretim kapısı:** Barındırılan üretimde, “-taslak” sürümlü bir zorunlu metin ya da eksik şirket bilgisiyle teklif kabulü engellenir (T21).

**ETBİS:** Portalda satış başlamadan ETBİS'e kayıt yapılır (T22).

**Dayanak.** Mesafeli Sözleşmeler Yönetmeliği md. 5/1 (satıcı kimliği, MERSİS, adres ve iletişim; toplam fiyat; ifa), md. 6–7, md. 10, md. 12; 6502 md. 48, md. 52, md. 77; 6563 sayılı Kanun md. 3 (genel bilgi verme yükümlülüğü) ve elektronik ticarette hizmet sağlayıcılara ilişkin yönetmelik (ETBİS kaydı); TTK md. 39–40; TBK md. 512.

**Gerekçe.**
- Sürelerin çoğu iş kararıdır. Hukuken kritik olanlar boş ya da seçenekli bırakılan zorunlu bilgiler ve iç çelişkilerdir.
- Kapı, “onaylanmadan yayımlanmaz” kuralını otomatik hale getirir.
- **Uzlaştırma:**
    - Rapor süresinde Uzman A 15, Uzman B 10 iş günü önerdi. Taahhüdün tutulamaması sözleşmeye aykırılık doğurduğundan 15 iş günü seçildi.
    - Uzman B'nin 12/1–16 çelişkisi ve ETBİS uyarısı ile Uzman A'nın şirket bilgisi kapısı birleştirildi.

**Metin değişikliği.**
- **Md. 12/1:** “1. Sözleşme, kurulduğu anda (portalda teklifin onaylanmasıyla, kâğıtta imzayla) yürürlüğe girer. Hizmet yılı Madde 8/5'e göre başlar ve 1 yıl sürer; bu süre bir yılı aşmaz. Ek siparişler bu sürenin sonunda biter (Madde 8D).”
- **Md. 4/2:** “2. **Periyodik ziyaretler:** Yılda paketteki sayıda periyodik ziyaret yapılır; sayı teklifte yazar. Dört ziyaretli pakette kış, ilkbahar, yaz ve hasat pencerelerinde birer ziyaret yapılır. Ziyaret pencereleri Ek-2'dedir; kesin tarihler Şirket tarafından hava ve erişim koşullarına göre belirlenir ve Madde 8A/1'e göre önceden bildirilir.”
- **Md. 4/3:** “3. **Rapor:** Her ziyaretten sonra en geç 15 iş günü içinde portalda yayımlanır.” Aynı süre Ön Bilgilendirme §4'e girer.
- **Md. 8/4:** “4. **Pilot dönemi:** [Şirket kararıyla doldurulur: “[başlangıç]–[bitiş] arasında kurulan sözleşmelerde ilk hizmet yılının bedeli ücretsizdir” ya da “… %[oran] indirimlidir”; envanter ücreti [alınmaz / …]]. Pilot sonunda ücretli döneme kendiliğinden geçilmez; devam için yenileme teklifi onaylanır ve ödenir. İndirim teklif satırında ayrıca gösterilir.” (Köşeli parantez iş kararıdır; yayın şartıdır.)
- **Köşeli parantezlerin kaldırılması:** 8A/2 “14 gün”, 12/3 “30 gün” ve “14 gün”, 12/2 “45 gün”, 12/4 “90 gün”, 8D/5 “30 gün”.
- **Şirket bilgileri:** Ön Bilgilendirme §1, Sözleşme Md. 1, KVKK metni §1, gizlilik §1 ve site altbilgisi Şirket bilgileriyle doldurulur (T22).
- **README giriş notu:** Kararların uygulandığı ve “-taslak” ekinin [yayın şartları](#yayin) tamamlanınca kaldırılacağı yazılır.

**Sistem değişikliği.**
- **Bu iş:** Yok. Ayarlar (`removal_notice_days` 30, `removal_access_days` 90, `addon_min_days` 30) metinle uyumludur.
- **T21:** Üretim kapısı. Şirket bilgilerinin tek ayardan okunması. Site altbilgisi.
- **T22:** Şirket bilgileri ve ETBİS.

---

<a id="takip"></a>
## Takip işleri

Bu belgeyle birlikte yapılan PR yalnızca metinleri ve küçük değişiklikleri içerir. Aşağıdakiler ayrı işlerdir. “Yayın şartı” etiketlileri, metinlerden “-taslak” eki kaldırılmadan önce biter.

| No | İş | Karar | Şart / zaman |
| --- | --- | --- | --- |
| T01 | Standart sözleşmeler: Supabase, Vercel, Cloudflare, Anthropic (ya da kullanılacak YZ sağlayıcısı), bulut işleme, yurt dışındaysa e-posta/ofis sağlayıcısı. İmzadan sonra 5 iş günü içinde Kurum'a bildirim; yurt-disi-aktarim-kaydi.md; ai-worker kapısının açılması | H02, H03, H27 | Yayın şartı; acil |
| T02 | Netgsm ve dışarıdan çalışan uzmanla veri işleme sözleşmesi; personel metninin teslimi | H02, H05 | Pilottan önce |
| T03 | Erken başlama onayı, planlama engeli, cayma kesintisinin onaya bağlanması, cayma teyit SMS'i, bildirim tarihine göre ops kaydı, uyarı | H11 | Yayın şartı |
| T04 | Siparişe özel sözleşme ve ön bilgilendirme PDF'i, hash, Sözleşmelerim, SMS, teklif verileriyle ön bilgilendirme, arşiv hash testi | H12, H13, H18 | Yayın şartı |
| T05 | Bahçe çıkarma: “hemen”, varsayılanın kaldırılması, kalan yöntemiyle iade, haklı sebep nedenleri, bekleyen siparişi aynı akışta iptal | H20 | `garden_changes_enabled` öncesi |
| T06 | Dönem sonu 8A mutabakatı (ops görevi, 14 gün sayacı) | H21 | İlk dönem sonundan önce |
| T07 | Ziyaret tarihi SMS'i (en az 3 gün önce, bağlantılı); yapılamayan ziyaret nedeni ve kanıtı; saha uygulamasında levha ve sözlü bilgi kaydı | H01, H15 | Pilot sırasında; o zamana kadar elle |
| T08 | 12/4'ün bütün sona erme hallerine uygulanması; yenilemede yeniden açma; pilot parselleri | H23 | İlk `service_end`'den en az 30 gün önce |
| T09 | Kısa saklama temizlikleri: bildirim 12 ay, oturum 30 gün, doğrulanmamış hesap cron'u zorunlu, demo denetim kaydı, saha kişisi telefonu, sona erme tarihi | H25, H27 | Yayın şartı (ilk dördü) |
| T10 | Uzun vadeli imha ve anonimleştirme (2 ve 10 yıl), 6 aylık periyodik imha | H25 | 2028 sonundan önce |
| T11 | KVKK başvurusu: elle silme ve takma ad betikleri; sonra portal formu | H26 | Betikler pilottan önce |
| T12 | Harita altlığı kendi altyapımızdan; Cloudflare imzalamazsa kendi doğrulamamız | H03 | Yayın şartı |
| T13 | TCKN: saklamadan iletme ya da şifreleme; TCKN deseni testi | H16 | `identity_number_required` açılmadan önce |
| T14 | Fatura: pilotta elle; ops görevi; sonra entegratör | H17 | İlk ücretli ödemeden önce süreç |
| T15 | Hissedar davet SMS'i, ilk girişte aydınlatma teyidi (hissedar ve ops'un açtığı sahipler), davet beyan kutusu | H30, H32 | Pilot sırasında |
| T16 | Sınır onay beyanı ve sürüm kaydı; ibarenin her PDF sayfasında ve haritada olması; sınır itirazı nedeni | H07 | Pilot sırasında |
| T17 | Demo vitrini dışa aktarma kuralları, izin kaydı, geri alma runbook'u | H28 | Gerçek bahçe vitrine girmeden önce |
| T18 | Ek teklif hesap dökümü, kalan pencereler ve uyarı, `inventory_reuse_months = 24`, `order_closed` SMS'i | H19 | `garden_changes_enabled` öncesi |
| T19 | Kayıtta hesap varlığını gizleme | H33 | Genel lansmandan önce |
| T20 | Ops için panorama ve kesit gizleme işlevi | H01, H26 | Pilot sırasında; o zamana kadar geliştirici eliyle |
| T21 | Üretim kapısı (`legal_texts_not_final`), şirket bilgilerinin tek ayardan okunması, site altbilgisi | H34 | Yayın şartı |
| T22 | Şirket ve insan eylemleri: şirket bilgileri; ETBİS; İYS kaydı ve entegrasyonu; iyzico TCKN teyidi; VERBİS yıllık kontrolü; mesleki sorumluluk sigortası; v1 kâğıt sahiplerine uzama bildirimi; pilot fiyat kararı (8/4); Şirket merkezi Gaziantep değilse Md. 15/2; Netgsm bilgilendirme türü | H04, H06, H08, H14, H16, H34 | Kalem kalem |
| T23 | Doğrulamalar: rapor ve PDF'te uzman adı ve unvanı; sahiplere GNSS izinin gösterilmemesi; çok sahipli parselde soru-cevap görünürlüğü; devir “raporlarınızı indirin” SMS'i; Bahçelerim'de çıkarılan bahçeler | H05, H18, H22, H32 | Pilottan önce |
| T24 | İşyeri dışında kâğıt sözleşme gerekirse uyumlu kâğıt sürüm (cayma formu, nüsha, cayma süresinde ödeme alınmaması) | H10 | Gerekirse |
| T25 | CLAUDE.md'deki “veri silinmez” kuralının “saklama süresi içinde silinmez” olarak güncellenmesi (Yusuf) | H25 | Bir sonraki doküman güncellemesinde |
| T26 | İsteğe bağlı: kişi görünen kesitlerin yapay zekâya gönderilmemesi (yerel kişi algılama) | H02 | İsteğe bağlı |