# Hukuki Metin Taslakları

22 Ekim 2026 · Yusuf

> **Bu metinler hukuki görüş değildir.** Avukatın incelemesi için başlangıç taslaklarıdır. Avukat onaylamadan hiçbir sahiple paylaşılmaz, imzalatılmaz ve portalda yayımlanmaz.

| Dosya | Ne | Kim imzalar / okur |
| --- | --- | --- |
| [kvkk-aydinlatma-metni.md](kvkk-aydinlatma-metni.md) | KVKK 10. madde aydınlatma metni | Sahip ve hissedar; portalda ve sözleşme ekinde |
| [acik-riza-metni.md](acik-riza-metni.md) | Açık rıza gerektiren işlemler için ayrı onay | Sahip ve hissedar, isteğe bağlı |
| [hizmet-sozlesmesi-taslagi.md](hizmet-sozlesmesi-taslagi.md) | Denetim hizmeti sözleşmesi. Portalda kurulduğunda mesafeli hizmet sözleşmesi (cayma hakkı, yapılamayan ziyaret iadesi, yenileme; v2'den beri birden fazla bahçe, dönem içinde bahçe ekleme ve bahçe bazında çıkarma); sitede `/mesafeli-satis` | Sahip ve şirket; portalda teklif onayıyla |
| [on-bilgilendirme-formu-taslagi.md](on-bilgilendirme-formu-taslagi.md) | Mesafeli sözleşme öncesi ön bilgilendirme formu; sitede `/on-bilgilendirme` | Sahip; teklif onayından önce ayrıca onaylanır |
| [iptal-iade-politikasi-taslagi.md](iptal-iade-politikasi-taslagi.md) | İptal, cayma, bahçe çıkarma ve iade kuralları, sözleşmenin sade özeti; sitede `/iade` | Herkes |
| [gizlilik-cerez-politikasi-taslagi.md](gizlilik-cerez-politikasi-taslagi.md) | Site ve portal gizlilik ve çerez politikası; sitede `/gizlilik` | Ziyaretçi ve sahip |

Sitedeki sayfalar bu dosyalardan elle aktarılan metni gösterir (`apps/web/src/lib/i18n/messages/legal.ts`); sürümler `apps/web/src/lib/legal/versions.ts` dosyasındadır. Bir metin değişince ikisi birlikte güncellenir ve sürüm adı artırılır. Sürüm adı `-taslak` ile bitiyorsa sayfanın üstünde "taslak" bandı görünür.

**Eski sürümler:** Sürümü artırılan metnin önceki hali silinmez; [arsiv/](arsiv/) klasörüne `<dosya>-v<N>.md` adıyla, başına sürüm adını ve güncel sürüme bağlantıyı yazan bir notla kopyalanır ve bir daha değiştirilmez. Böylece `consent_record.text_version`'daki her sürüm adı bir metne karşılık gelir (sözleşme Md. 16: onaylanan sürüm saklanır). Sitede yalnızca güncel sürüm yayımlanır. Bugünkü arşiv: `mesafeli-v1-taslak`, `onbilgi-v1-taslak`, `iade-v1-taslak`.

Köşeli parantez içindeki yerler doldurulacak. Veri sorumlusu: OBA Bilişim Teknolojileri LTD. (tam unvan ticaret sicilinden kontrol edilmeli).

## Avukata sorulacaklar

1. **Bahçede görüntülenen üçüncü kişiler.** Panoramalarda bahçe işçileri, komşular ve yoldan geçenler tanınabilir şekilde görünebilir. Yüz bulanıklaştırma yapılmıyor (ürün kararı, 21 Ekim 2026).
    - Bu kişiler için aydınlatma nasıl yapılır? Seçenekler: sahip aracılığıyla bilgilendirme, bahçe girişinde bilgilendirme levhası, şirketin internet sitesinde metin.
    - Hukuki sebep meşru menfaat (md. 5/2-f) olabilir mi?
2. **Yurt dışına aktarım** (2024 değişikliği sonrası md. 9). İP12'de yapay zekâ aktarımı için açık rıza sorulmuyor; kayıt formunda ve portalda bu konuda kutu yok. Avukat açık rıza derse önce ai-worker'a rıza denetimi eklenir, kutu ondan sonra açılır (`docs/musteri-yonetimi.md` §2). Aşağıdaki hizmet sağlayıcıların her biri için: yeterlilik kararı yok; standart sözleşme mi gerekir (Kurul'a 5 iş günü içinde bildirim), açık rıza yalnızca arızi durumlarda mı kullanılabilir?
    - **Bulut veritabanı ve dosya deposu** (Supabase): sunucular AB'de (Frankfurt), şirket merkezi ABD/Singapur.
    - **Web barındırma** (Vercel): sunucu bölgesi AB, şirket ABD.
    - **Yapay zekâ ön değerlendirmesi** (Anthropic, ABD): ağaç görüntüleri gönderiliyor. Görüntülerde kişi görünebilir. Ad, telefon, parsel adı ve köy gönderilmiyor.
    - **İşleme için bulut sunucusu:** AWS, Azure ya da Google Cloud; AB bölgesi, sağlayıcı henüz seçilmedi.
    - **SMS** (Netgsm): yurt içi.
3. **VERBİS kaydı** gerekiyor mu? Yıllık çalışan sayısı ve bilanço eşiklerine göre muafiyet var mı?
4. **Saha personeli** için ayrı bir çalışan aydınlatma metni. Konum kaydı (GNSS izi) ve uygulama kayıtları bu kapsama giriyor mu?
5. **Ticari elektronik ileti.** "Rapor hazır" ve "kritik bulgu" mesajları hizmetin parçası olarak izinsiz gönderilebilir mi (6563 sayılı Kanun, İYS)? Tanıtım mesajları için ayrı izin.
6. **Sınır ibaresi.** Haritadaki sınır, sahibin gösterdiği fiili kullanım sınırıdır. Sözleşmedeki ifade tapu ve mülkiyet uyuşmazlıklarında yeterli koruma sağlıyor mu?
7. **Uzman görüşünün niteliği ve sorumluluk sınırı.** Ziraat mühendisinin değerlendirmesi ve önerisi teşhis ya da garanti değil. Sorumluluk sınırlaması geçerli olur mu?
8. **Hisseli tapu ve rızai taksim.** Tapu sahibi olmayan bir hissedarın ya da vekilin hizmet alabilmesi için hangi beyan ya da belge yeterli?
9. **Mesafeli hizmet sözleşmesi ve cayma hakkı (İP12).**
    - Bahçe sahibi tüketici sayılır mı? Tacir ya da şirket müşteride hangi hükümler değişir?
    - Cayma süresi içinde yapılan envanter ziyaretinden sonra cayma hakkı düşer mi, yoksa orantılı bedel mi düşülür? Ön onayın biçimi için 20. soruya bakın (v2'de ayrı kutu yok, teklif onayı açık talep sayılıyor).
    - Ön bilgilendirme formu ve sözleşmenin portalda saklanması, Yönetmelik'teki "kalıcı veri saklayıcısı" şartını karşılıyor mu?
10. **Yenileme.** Portal sözleşmesi kendiliğinden uzamıyor; yenileme teklifi onaylanıp ödenince yeni yıl başlıyor. Kâğıt sözleşmedeki "bildirim yoksa uzar" hükmü korunmalı mı?
11. **Yapılamayan ziyaret iadesi.** Müşteriden kaynaklanan nedenle yapılamayan ziyaret için iade yapmamak tüketici aleyhine haksız şart sayılır mı?
12. **Ödeme kuruluşu (iyzico).** iyzico'ya aktarılan alıcı bilgileri (ad, soyad, telefon, e-posta, adres, IP) için hukuki sebep sözleşmenin ifası mı? TCKN yerine sabit bir değer gönderilmesi (iyzico yazılı teyidi bekleniyor) KVKK açısından sorun yaratır mı?
13. **Çerezler.** Yalnızca zorunlu oturum çerezi ve robot doğrulaması (Cloudflare Turnstile) kullanılıyor. Çerez onay penceresi gerekmez mi? Turnstile yurt dışı aktarım sayılır mı?
14. **e-Arşiv.** Portalda verilen makbuz fatura değil. Faturanın ne zaman ve nasıl düzenleneceği (mali müşavirle birlikte).

### Bahçe ekleme ve çıkarma (İP14)

Tasarım: [docs/bahce-yonetimi.md](../bahce-yonetimi.md) §2, §4–§7, §10, §16, §19. Sürümler: `mesafeli-v2-taslak`, `iade-v2-taslak`, `onbilgi-v2-taslak`. KVKK aydınlatma metni ve açık rıza metni değişmedi (`kvkk-v1-taslak`, `riza-v1-taslak`); KVKK sorusu aşağıda 21'de.

**Bu sorular cevaplanıp metinler onaylanana kadar barındırılan projelerde `org_billing_setting.garden_changes_enabled` kapalı kalır;** müşteri bahçe ekleyemez ve çıkaramaz, ops ek teklif veremez (`docs/deployment.md` › Bahçe ekleme ve çıkarma).

15. **Çoğul bahçe ve Ek-1 (Md. 2).** Tek sözleşmede birden çok bahçe ve Ek-1'in güncellenen bir bahçe listesi olması yeterli mi? Ek siparişle eklenen bahçenin Ek-1'e girmesi için ayrı bir onay ya da imza gerekir mi?
16. **Ek siparişin niteliği ve cayma süresi (Md. 8D/7).** Ek sipariş ayrı bir mesafeli sözleşme mi, mevcut sözleşmeye ek mi? Kendi ödemesi, makbuzu ve 14 günlük cayma süresi var. Süre bugün ödemenin tamamlandığı (siparişin etkinleştiği) günden sayılıyor ve 14. gün dahil (`withdrawal_until` = etkinleşme günü + 14); v2 metinleri de bunu yazıyor. Hizmetin başlangıcı bu günden sonra olabilir: yenilemede yeni yıl önceki yılın bitişinin ertesi günü başlar, ek teklifte daha ileri bir başlangıç günü yazabilir ve iki dönemin birleştirilmesinde ek siparişin hizmeti dönemin bitişinin ertesi günü başlar. Bu durumlarda süre hizmet başlamadan dolabilir. Süre teklifin onaylandığı günden mi, ödeme gününden mi, yoksa hizmetin başladığı günden mi sayılmalı? Hizmet başlangıcından sayılması gerekirse `private.withdrawal_until` de değişir. Ek teklif onayından önce ön bilgilendirme formu yeniden onaylatılmalı mı?
17. **Dönem içi orantılı fiyat (Md. 8D/2–5, Ön Bilgilendirme 3).** Ziyaret hakkının kalan güne göre orantılanması, yarım yukarı yuvarlama ve en az 1 ziyaret; bahçe başına en az ücretin aynı oranla orantılanması (fiyat kararı Yusuf'ta); envanter ücretinin tam alınması; teklif günündeki fiyat listesinin kullanılması; son ek günü ([30] gün) ve dönem kapanınca siparişin iptali ve iadesi. Bu madde ve ön bilgilendirmedeki anlatım tüketiciye yeterince açık mı?
18. **Bahçe bazında fesih (Md. 12/3).** Sözleşmenin bahçe bazında kısmen feshedilebilmesi; [30] günlük bildirim süresi ve "dönem sonunda" seçeneği; talebin Şirket onayı beklemeden çıkış gününde kendiliğinden hüküm doğurması, tarihin yalnızca anlaşmayla değişmesi; ödemesi beklenen siparişteki bahçe için önce o siparişin iptali şartı; son bahçe çıkınca sözleşmenin sona ermesi. İade formülü (kullanılmayan ziyaret × ziyaret bedeli, envanter yapılmadıysa envanter payı) ve Şirket'in kendi yeniden taramalarının kullanılmış ziyaret sayılmaması yeterli ve adil mi?
19. **Yapılamayan ziyaretler ve 8A iadesinin düşülmesi (Md. 8A/5, 12/3).** Çıkarma iadesinden daha önce yapılmış bütün iadelerin (8A dahil) düşülmesi; hizmet dönemi çıkış gününden önce bitmiş satırın çıkarma iadesine girmemesi ve o dönemin yapılamayan ziyaretlerinin yalnızca 8A'ya göre iade edilmesi.
20. **Tek bahçe için açık cayma (Md. 8B/4–5).** Çok bahçeli siparişte cayma hakkının tek bahçe için kullanılabilmesi; caymanın ayrı ve açık bir seçenek olması ("30 gün sonra" ya da "dönem sonunda" seçimi cayma bildirimi sayılmaz); caymada yapılmış envanterin payı ile yapılmış periyodik ziyaretlerin bedelinin düşülmesi (Mesafeli Sözleşmeler Yönetmeliği md. 15/1-ğ). Düşme mi, orantılı bedel mi, yoksa hizmete başlanınca cayma hakkının kullanılamaması mı?
    - **Kullanıcı kararı (28 Ekim):** Düşme koşulsuzdur; envanter sayımı yapıldıysa envanter payı iade edilmez, yapılmış ziyaretlerin bedeli düşülür. Sistem de koşulsuz düşer ve ayrı bir "erken başlama" onayı kaydetmez. Md. 15/1-ğ'nin aradığı tüketici onayı için metinler (Md. 8B/4, Ön Bilgilendirme 5, İade Politikası 2) Sahip'in **teklifi onaylayarak** hizmete cayma süresi içinde başlanmasını açıkça talep ettiğini ve yapılmış hizmetin bedelinin iade edilmeyeceğini kabul ettiğini yazıyor. Teklif onayı (ön bilgilendirme onayıyla birlikte) bu açık talep için yeterli mi, yoksa ayrı bir onay kutusu mu gerekir?
    - Md. 8B/6'ya göre cayma hakkı tacir ya da şirket müşteriye uygulanmaz. Sistem bugün müşterinin tacir olup olmadığına bakmadan cayma seçeneğini gösteriyor. Tacir müşteride seçenek kapatılmalı mı; tacir olup olmadığı (örneğin şirket fatura profili) neye göre belirlenir?
21. **Erişim süresi ve KVKK (Md. 12/4).** Çıkarılan bahçede 90 gün salt okunur erişim (soru ve hissedar daveti kapalı), süre sonunda Sahip'in, davet ettiği hissedarların ve başka sahip kalmıyorsa bütün hissedarların erişiminin kaldırılması; parselde başka sahip varsa onun erişiminin sürmesi; devirde (satış) erişim süresinin 0 olması. Veri silinmiyor, bahçe pasif oluyor. Bu süreler KVKK aydınlatma metnindeki saklama süresi [X] ile nasıl ilişkilendirilir? Aydınlatma metninde ayrıca yazılması gerekir mi (metnin sürümü bu işte değiştirilmedi)? Erişimi kalkan hissedara bildirim gerekir mi (bugün SMS gitmiyor)?
22. **Yenilenmeyen üyelik (Md. 12/4).** Süresi biten ve yenilenmeyen üyelikte erişim bugün kapanmıyor; yalnızca hizmetten çıkarılan bahçede 90 gün sonra kapanıyor. 12/4'ün dönem sonunda da uygulanması gerekir mi? Aynı durum Şirket'in siparişi idari olarak feshetmesinde (`ops_terminate_order`) de var: parsellere dokunulmuyor, erişim kısıtsız sürüyor (soru ve hissedar daveti dahil). v2 metninde 12/4 bu yüzden yalnızca 12/3'e göre çıkarılan bahçeye uygulanıyor. Gerekirse ayrı bir iş olarak yapılacak (`docs/bahce-yonetimi.md` §1, §5.2, §19).

### Bilinen fark (İP14 dışı)

23. **Ödenmeyen sipariş.** Sözleşme (Md. 8/2) ve iade politikası (1. bölüm) "ödeme süresi içinde ödenmeyen sipariş kendiliğinden düşer" diyor; sistem ise süre dolunca siparişi iptal etmiyor, yalnızca hatırlatma gönderiyor (`docs/musteri-yonetimi.md` §5.3). Fark İP12'den kalmadır ve v2 taslaklarında bilerek değiştirilmedi. Avukat hangi davranışın yazılacağına karar verince metin ya da sistem düzeltilir.
