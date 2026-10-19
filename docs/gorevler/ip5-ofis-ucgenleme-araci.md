# İP5 – Ofis Üçgenleme Aracı

- **Klasör:** `apps/web/` (sadece burası). `supabase/` ve `services/pipeline/` değişmez. Aynı anda başka bir oturum şemaya migration ekliyor; şema değişikliği gerekirse PR'da yaz, kendin ekleme.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/MVP.md` Modül 2 (envanter: ofiste üçgenleme, kodlama, boş yerler, doğrulama listesi, kodlama kuralı), `docs/arayuzler.md`, `services/pipeline/README.md` (çıktı biçimleri: `outputs.json`, panorama yan dosyaları), `apps/web/README.md`, `supabase/migrations/`

## Amaç

Envanterde ağaç konumları sahada ağaç ağaç alınmaz. Ofisteki kişi, grid taramanın panoramalarında her ağacın gövdesine iki farklı panoramadan tıklar; yazılım konumu üçgenler. Ardından sıralar oturtulur, yerlere kod verilir, boş yerler bulunur ve sahada bakılacak ağaçların doğrulama listesi çıkar. Araç `/ofis` bölümünde, saha personeli ve operasyon rolleri için.

## Veri kaynağı

İşleme hattının veritabanına ve depolamaya yükleme kısmı henüz yok. Panoramalar bir arayüz arkasından okunsun:
- `PanoramaSource` arayüzü: oturumun panorama listesi (konum, yön, zaman, kalite) ve görüntüleri.
- **Yerel uygulaması:** Ortam değişkeniyle verilen bir işleme hattı çıktı klasöründen okur ve bir Next.js route handler üzerinden sunar. Sadece geliştirmede açık.
- Depolamadan okuyan uygulaması sonraki işte gelecek.
- **Geliştirme verisi:** `services/pipeline` içinde `uv run orchados-pipeline synth <klasör> && uv run orchados-pipeline run <klasör>` ile üretilir. Bunu yapan bir betiği `apps/web/scripts/` altına koy.

## Yapılacaklar

1. **Ekran düzeni:**
    - Solda parsel haritası: sınır, panorama noktaları, üçgenlenmiş ağaçlar.
    - Sağda iki panorama görünümü, Photo Sphere Viewer ile. Haritada bir noktaya tıklayınca en yakın iki panorama açılır.
2. **Üçgenleme:**
    - Kullanıcı iki (ya da daha fazla) panoramada gövdeye tıklar. Her tık, panoramanın konumu ve yönünden bir yön çizgisine çevrilir.
    - Çizgiler parselin yerel metrik koordinat sisteminde en küçük kareler yöntemiyle kesiştirilir. Sonuç: konum ve belirsizlik.
    - Belirsizlik eşiği aşılırsa ya da çizgiler neredeyse paralelse kullanıcı uyarılır.
    - Haritada noktayı elle kaydırma ve silme mümkün.
    - Hesaplama saf TypeScript fonksiyonu olsun ve birim testleri bulunsun.
3. **Sıra oturtma ve kodlama** (`docs/MVP.md` Modül 2'deki kurala göre):
    - Ağaç konumlarına sıra doğruları oturt; sıra yönü ve başlangıç köşesi parsel kaydından gelir. Yoksa kullanıcı seçer.
    - Sıra ve pozisyon numarası ver. Sıra arasındaki ağaçlar için harfli kod (`S5-12a`).
    - Beklenen ama ağaç bulunmayan pozisyonlar "boş yer" olarak işaretlensin.
    - Gürültülü, eksik ve ara ağaçlı sentetik ızgaralarla birim testleri.
4. **Doğrulama listesi:** Belirsizliği yüksek ağaçlar, boş yerler ve kullanıcının "emin değilim" diye işaretledikleri. Listelenebilir ve dışa aktarılabilir (CSV) olsun.
5. **Kaydetme:**
    - Önizleme ve onaydan sonra yer ve ağaç kayıtları, envanter oturumuna bağlı olarak veritabanına yazılır. Kullanıcının kendi yetkisiyle; servis anahtarı kullanılmaz.
    - Parselde zaten yer ve ağaç varsa kaydetme engellenir ve nedeni açıkça gösterilir. Mevcut envanteri değiştirme akışı sonraya kalır.
6. **Testler:**
    - Birim: üçgenleme, sıra oturtma, kodlama, boş yer bulma.
    - Yerel Supabase'e karşı entegrasyon: Testin kendisinin oluşturduğu, yeri olmayan bir parselde kaydetme; yetkisiz rolün kaydedememesi.
    - Tarayıcı testi: Ortamda Chromium varsa (`/opt/pw-browsers`) sentetik oturumla tıklayıp kaydetme akışı.
7. **README:** Aracın kullanımı ve geliştirme verisinin üretilmesi; `apps/web/README.md`'ye bölüm olarak.

## Kabul ölçütü

- `pnpm web:lint`, `pnpm web:build` ve `pnpm web:test` geçiyor; tarayıcı testi varsa `pnpm web:e2e` de.
- Sentetik oturumla elle denendiğinde 12 sentetik ağaç üçgenlenip kodlanabiliyor. PR'da kısa tarifi ya da ekran görüntüsü.
