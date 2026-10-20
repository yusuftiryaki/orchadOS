# İP5 v0.2 – Envanter Zinciri

- **Klasör:** `apps/web/`, ve gerekirse `supabase/migrations/20261021120xxx_*.sql` ile `supabase/tests/15_*.test.sql`. Migration ekledikten sonra `pnpm web:typegen` çalıştırıp çıktıyı commit'le.
    - Aynı anda başka bir oturum `services/pipeline/`, `supabase/demo/` ve `.github/workflows/` üzerinde çalışıyor. Bunlara dokunma.
    - O oturum `apps/web/tests/e2e/chain-*` adlı dosyalar ekleyebilir.
    - Seed'i değiştirme.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 2 (envanter)
    - `docs/arayuzler.md`: "Medya depolama" ve "Asset `pose` alanı"
    - `apps/web/README.md`: ofis aracı, uzman paneli ve sahip portalı bölümleri
    - `services/pipeline/README.md`: yükleme bölümü
    - `docs/plan.md`: açık işler

## Amaç

Ofis üçgenleme aracı (İP5 v0.1) şu an panoramaları yerel bir klasörden okuyor. Envanteri iki ayrı yazmayla kaydediyor ve gövde tıklamalarını tarayıcıda bırakıyor. İşleme hattı artık panoramaları depoya yüklüyor (`orchados-pipeline upload`). Bu görevle ofis aracı gerçek zincirin parçası olur:

**envanter taraması → yükleme → ofiste üçgenleme → tek işlemde kayıt → periyodik taramada kesitler bu ağaçlara bağlanır**

## Yapılacaklar

1. **Depodan panorama kaynağı:**
    - `PanoramaSource` arayüzünün ikinci uygulaması. Bir oturumun `kind = panorama` asset'lerini okur: konum, `pose.heading_deg`, `pose.variant`, `pose.gps_time_ns`, kalite.
    - Görüntüler imzalı adresle gelir; ortak yardımcı `src/lib/media/` (`createMediaSigner`) kullanılır.
    - Önce önizleme gösterilir; yakınlaşınca tam çözünürlük, varsa. Tam ve önizleme satırları `gps_time_ns` ile eşleşir.
    - Ofis ekranında oturum seçimi: parselin envanter (`inventory`) oturumları; yoksa en yeni tarama oturumu. Yerel kaynak, geliştirme için ortam değişkeniyle seçilebilir kalsın.
2. **Tek işlemde kayıt** (`save_inventory`):
    - Kullanıcının yetkisiyle çalışan (security invoker) bir veritabanı fonksiyonu. Yerleri, ağaçları ve gövde tıklamalarını tek işlemde yazar.
    - Parselde zaten yer varsa hata verir; mevcut kural korunur.
    - Bir satır geçersizse hiçbir şey yazılmaz.
    - Ofis aracı bu fonksiyona geçer; iki ayrı yazma kalkar.
3. **Gövde tıklamaları etiket olarak:**
    - Her tıklama gövde tespit modeli için bir etikettir: hangi panorama asset'i, panoramadaki yatay ve dikey açı (ya da piksel), hangi ağaç ya da yer, kimin tıkladığı, ne zaman.
    - Kayıt ekleme-yalnız olur. Sadece kurum rolleri görür; sahip ve hissedar görmez.
    - Tablo adını ve alanlarını sen belirle. Önce `docs/veri-modeli.md`'ye kısa bir bölüm ekle (bu dosyayı bu görev için değiştirebilirsin).
4. **Ağaç rengi:**
    - Uzman ve ofis haritasındaki ağaç rengi, `tree_latest_assessment` görünümünden gelsin. Portal bunu zaten yapıyor; aynı mantığı paylaş.
    - `src/lib/parcels.ts`'teki "tree colours" testi buna göre değişir.
5. **Tekrarları kaldır:**
    - Uzman paneli `src/lib/expert/media.ts` yerine `src/lib/media/` kullansın.
    - `fetchAll` kopyaları tek yerde toplansın.
6. **Testler:**
    - Birim: Panorama eşleme (tam ve önizleme, değişken yoksa `full`), oturum seçimi.
    - Entegrasyon (yerel Supabase):
        - Depoya yüklenmiş küçük test panoramalarıyla kaynak okunuyor.
        - `save_inventory` tek işlemde yazıyor. Hatalı bir satırda hiçbir şey yazılmıyor.
        - Yetkisiz rol (sahip, uzman) kaydedemiyor.
        - Tıklamalar saklanıyor; sahip onları göremiyor.
    - Tarayıcı: Mevcut ofis aracı testi depo kaynağıyla da geçmeli. Gerekirse test, panoramaları depoya kendisi yükler.
    - pgTAP: Yeni fonksiyon ve tablo için.
7. **README:**
    - `apps/web/README.md` ofis aracı bölümü: depodan kullanım, yerel kaynak seçimi.
    - `docs/plan.md` açık işlerinden kapananları PR açıklamasında listele.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test`, `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
- PR açıklamasında depodan okunan bir oturumla üçgenleme ve kayıt adımlarının kısa tarifi.
