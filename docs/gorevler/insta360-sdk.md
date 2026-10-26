# Insta360 SDK'nın İşleme Hattına Bağlanması

26 Ekim 2026 · plan

## Gelen paket

`Linux_CameraSDK-2.1.8_MediaSDK-3.1.5.zip`. Yerelde `~/.orchados/sdk/insta360/` altına açıldı.

| Parça | Ne işe yarar | Bizim için |
| --- | --- | --- |
| **Media SDK 3.1.5** (linux64, `.deb` ~2 GB, kurulunca ~11 GB) | `VideoStitcher` / `ImageStitcher`: birleştirme (template, optik akış, dinamik, AI), stabilizasyon, renk, gürültü azaltma. Örnek araç: `MediaSDKTest -inputs a.insv -output a.mp4` | **Asıl parça.** İşleme hattındaki birleştirme adımı |
| **InsMetaData SDK 2.0.2** (3,5 MB) | `.insv` dosyasından jiroskop, GPS, pozlama verisi; ilk zaman damgası; kamera seri numarası | İnce zaman eşleme (jiroskop) ve kayıt doğrulaması |
| **Camera SDK 2.1.8** (x86-64 ve birkaç aarch64 derlemesi) | Kamerayı USB'den sürmek: kayıt başlat/durdur, saat, durum | İşleme hattında gerekmez. Robot reposunun işi (`kit_camera`) |

## Önemli bulgular

- **Sadece seçilen kareler birleştirilebiliyor.** `VideoStitcher::SetExportFrameSequence(indeksler)` + `SetImageSequenceInfo(klasör, JPEG|PNG)` ile videonun tamamı değil, sadece istenen kareler panorama olarak çıkarılabiliyor.
    - İşleme hattı zaten 3–4 m'de bir kare seçiyor; ziyaret başına yüzlerce kare.
    - Bu yolla tam 8K video dışa aktarma adımı kalkar; Insta360 Studio'ya ve Windows makineye gerek kalmaz.
    - Buluta yüklenecek veri de azalabilir.
- **CUDA isteğe bağlı** (`EnableCuda`). Paket bağımlılıklarında OpenGL/Vulkan/EGL kütüphaneleri var; ekransız sunucuda çalışıp çalışmadığı denenmeli.
- **Lisans:** Pakette lisans dosyası yok. SDK repoya, container imajının herkese açık katmanına ve CI'a **girmez**. Yeri bir ortam değişkeniyle verilir (`ORCHADOS_INSTA360_SDK`).
- **Belge** Çince/İngilizce karışık. Örnek kaynaklar: `example/main.cc`, `realtime_stitcher_demo.cc`, `InsMetaDataSDK/example/main.cc`.

## Yapılacaklar (sırayla)

1. **Meta veri aracı** (küçük C++ programı, InsMetaData SDK'ya karşı derlenir): `.insv` → JSON. İçerik:
    - kamera tipi, seri numarası, ilk zaman damgası;
    - jiroskop örnekleri (zaman, x, y, z);
    - GPS (varsa).

   İşleme hattının `sync` aşaması jiroskopu kullanarak QR'dan gelen kaba eşlemeyi inceltir.
2. **Kare birleştirme aracı** (C++, Media SDK'ya karşı): `.insv` + kare indeksleri → her kare için equirectangular JPEG. Birleştirme tipi ve çözünürlük parametre olarak verilir.
3. **İşleme hattında `stitch` aşaması:**
    - Girdi `.insv` ise önce kare seçimi yapılır. Netlik, ham çift balıkgözü görüntü üzerinden hesaplanır; ya da düşük çözünürlüklü bir ön birleştirmeden.
    - Sonra sadece seçilen kareler birleştirilir. Girdi zaten equirectangular MP4 ise bugünkü yol aynen kalır.
    - SDK yoksa açık bir hata verilir ("`.insv` için Insta360 SDK gerekli"). Testler sahte bir araçla koşar; gerçek SDK testleri `-m sdk` işaretiyle, sadece SDK olan makinede.
4. **İşlem container'ı:** Herkese açık imaja SDK konmaz. İki yol var:
    - SDK'yı işlem makinesinde dışarıdan bağlamak (`-v /opt/MediaSDK…`);
    - ya da sadece özel bir kayıt deposunda tutulan, SDK'lı bir türev imaj.

   `docs/bulut-isleme.md` güncellenir; Windows/Studio adımı yedek yol olarak kalır.
5. **Doğrulama:** Gerçek bir `.insv` dosyasıyla. Kameradan bir deneme çekimi gerekiyor; bu yapılana kadar her şey "SDK ile derlendi, gerçek dosyayla denenmedi" diye işaretlenir.

## Sınırlar

- Geliştirme makinesinin diski dar (~17 GB boş). Media SDK'nın kurulumu ~11 GB; yerelde kurulmaz, derleme ve deneme container'da ve gerekirse bulut makinesinde yapılır.
- Gerçek kamera dosyası yok. 1. ve 2. madde derlenip sahte dosyayla sınanabilir, doğruluğu ölçülemez.
