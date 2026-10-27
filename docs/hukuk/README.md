# Hukuki Metin Taslakları

22 Ekim 2026 · Yusuf

> **Bu metinler hukuki görüş değildir.** Avukatın incelemesi için başlangıç taslaklarıdır. Avukat onaylamadan hiçbir sahiple paylaşılmaz, imzalatılmaz ve portalda yayımlanmaz.

| Dosya | Ne | Kim imzalar / okur |
| --- | --- | --- |
| [kvkk-aydinlatma-metni.md](kvkk-aydinlatma-metni.md) | KVKK 10. madde aydınlatma metni | Sahip ve hissedar; portalda ve sözleşme ekinde |
| [acik-riza-metni.md](acik-riza-metni.md) | Açık rıza gerektiren işlemler için ayrı onay | Sahip ve hissedar, isteğe bağlı |
| [hizmet-sozlesmesi-taslagi.md](hizmet-sozlesmesi-taslagi.md) | Denetim hizmeti sözleşmesi. Portalda kurulduğunda mesafeli hizmet sözleşmesi (cayma hakkı, yapılamayan ziyaret iadesi, yenileme); sitede `/mesafeli-satis` | Sahip ve şirket; portalda teklif onayıyla |
| [on-bilgilendirme-formu-taslagi.md](on-bilgilendirme-formu-taslagi.md) | Mesafeli sözleşme öncesi ön bilgilendirme formu; sitede `/on-bilgilendirme` | Sahip; teklif onayından önce ayrıca onaylanır |
| [iptal-iade-politikasi-taslagi.md](iptal-iade-politikasi-taslagi.md) | İptal, cayma ve iade kuralları, sözleşmenin sade özeti; sitede `/iade` | Herkes |
| [gizlilik-cerez-politikasi-taslagi.md](gizlilik-cerez-politikasi-taslagi.md) | Site ve portal gizlilik ve çerez politikası; sitede `/gizlilik` | Ziyaretçi ve sahip |

Sitedeki sayfalar bu dosyalardan elle aktarılan metni gösterir (`apps/web/src/lib/i18n/messages/legal.ts`); sürümler `apps/web/src/lib/legal/versions.ts` dosyasındadır. Bir metin değişince ikisi birlikte güncellenir ve sürüm adı artırılır. Sürüm adı `-taslak` ile bitiyorsa sayfanın üstünde "taslak" bandı görünür.

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
    - Cayma süresi içinde, müşterinin isteğiyle yapılan envanter ziyaretinden sonra cayma hakkı düşer mi, yoksa orantılı bedel mi düşülür? Ön onayın biçimi (portalda ayrı kutu) yeterli mi?
    - Ön bilgilendirme formu ve sözleşmenin portalda saklanması, Yönetmelik'teki "kalıcı veri saklayıcısı" şartını karşılıyor mu?
10. **Yenileme.** Portal sözleşmesi kendiliğinden uzamıyor; yenileme teklifi onaylanıp ödenince yeni yıl başlıyor. Kâğıt sözleşmedeki "bildirim yoksa uzar" hükmü korunmalı mı?
11. **Yapılamayan ziyaret iadesi.** Müşteriden kaynaklanan nedenle yapılamayan ziyaret için iade yapmamak tüketici aleyhine haksız şart sayılır mı?
12. **Ödeme kuruluşu (iyzico).** iyzico'ya aktarılan alıcı bilgileri (ad, soyad, telefon, e-posta, adres, IP) için hukuki sebep sözleşmenin ifası mı? TCKN yerine sabit bir değer gönderilmesi (iyzico yazılı teyidi bekleniyor) KVKK açısından sorun yaratır mı?
13. **Çerezler.** Yalnızca zorunlu oturum çerezi ve robot doğrulaması (Cloudflare Turnstile) kullanılıyor. Çerez onay penceresi gerekmez mi? Turnstile yurt dışı aktarım sayılır mı?
14. **e-Arşiv.** Portalda verilen makbuz fatura değil. Faturanın ne zaman ve nasıl düzenleneceği (mali müşavirle birlikte).
