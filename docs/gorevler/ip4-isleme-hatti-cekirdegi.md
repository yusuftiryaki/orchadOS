# İP4 – İşleme Hattı Çekirdeği

- **Dal:** `ip4-pipeline-core`
- **Klasör:** `services/pipeline/` (sadece burası)
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/teknik-mimari.md` (veri hacmi, işlem gücü, panorama dosya biçimi kararı), `docs/tarama-kiti.md` (zaman senkronizasyonu), `docs/MVP.md` Modül 2, 3 ve 4 (işleme hattı), `docs/veri-modeli.md` (capture/asset/lineage kavramları)

## Amaç

İşleme istasyonunda çalışacak Python işleme hattının çekirdeği: bir saha oturumunun ham verisinden konumlu panoramalar ve ağaç kesitleri üretmek. Veritabanına ve depolamaya yükleme bu görevin dışında; İP1 şeması birleşince eklenecek. Şimdilik çıktılar yerel bir klasöre ve bir manifest dosyasına yazılır, yükleme için bir arayüz bırakılır.

## Kapsam dışı

- **360° videonun stitch'i:** Girdi olarak kameranın masaüstü yazılımından dışa aktarılmış **equirectangular MP4** varsayılır. Ham `.insv` işlenmez.
- Veritabanı ve object storage'a yükleme (sadece arayüz).
- GPU gerektiren modeller (yüz bulanıklaştırma, ağaç tespiti); arayüz bırak, uygulama sonraya.

## Girdi: oturum klasörü

```
<oturum>/
  session.json        oturum kimliği, parsel kimliği, kamera yüksekliği vb.
  gnss/gnss.ubx       ESP32 GNSS kaydedicisinden (İP2) ham UBX
  gnss/events.csv     esp_micros, gps_time_ns, event_type, payload (İP2 biçimi)
  video/*.mp4         equirectangular 360° video (bir ya da birden çok parça)
  base/*.obs|*.rnx    (opsiyonel) baz istasyonu ya da CORS RINEX verisi
```

İP2 biçimleri henüz kesinleşmedi; `events.csv` için `docs/gorevler/ip2-gnss-kaydedici.md` dosyasındaki tanımı esas al ve ayrıştırıcıyı tek bir modülde tut.

## Aşamalar

1. **Alım (`ingest`):** Klasörü doğrula, dosyaların SHA-256'sını ve boyutlarını içeren bir `manifest.json` üret, eksik ya da bozuk girdiyi açık bir hatayla bildir.
2. **Konum (`position`):**
    - Baz verisi varsa RTKLIB ile PPK: `convbin` ile UBX → RINEX, `rnx2rtkp` ile çözüm. Komutları ve yapılandırmayı üreten, çıktı `.pos` dosyasını ayrıştıran bir sarmalayıcı yaz.
    - Baz verisi yoksa NAV-PVT'den doğrudan yörünge çıkar ve kalite bayrağını "PPK yok" olarak işaretle.
    - Çıktı: zaman (GPS, ns), enlem, boylam, yükseklik, çözüm kalitesi (fix/float/single), standart sapmalar.
3. **Zaman eşleme (`sync`):**
    - Videonun başında ve sonunda QR kodları ara. QR içeriği GPS zamanını taşır; biçimi sen tanımla ve README'de belgele, çünkü saha uygulaması bunu üretecek.
    - Kamera saati ile GPS saati arasındaki farkı ve doğrusal kaymayı hesapla.
    - **İnce eşleme için arayüz:** Kamera jiroskobu ile bir referans açısal hız sinyali arasında çapraz korelasyonla gecikme bulan fonksiyonu yaz ve sentetik sinyallerle test et. Kamera jiroskop verisinin dosyadan okunması sonraya kalır.
4. **Kare seçimi (`frames`):**
    - Videodan aday kareleri ffmpeg ya da OpenCV ile çıkar.
    - Her karenin konumunu yörüngeden zaman enterpolasyonuyla bul. Yönü, hareket yönünden çıkar.
    - Netlik skoru hesapla (Laplacian varyansı).
    - Yörünge boyunca her 3,5 m'lik dilimde (parametre) en net kareyi seç.
5. **Panorama üretimi (`panoramas`):**
    - Seçilen kareleri 4K (3840×1920) ve 2K WebP olarak yaz.
    - Her panorama için yan dosya JSON: konum, yön, zaman, kalite skoru, kaynak video ve kare numarası, hat sürümü.
6. **Ağaç kesitleri (`crops`):**
    - Girdi olarak ağaç konumlarını içeren bir JSON al: ağaç kimliği, yer kodu, enlem, boylam. İP1'den sonra veritabanından gelecek.
    - Her ağaç için yakındaki panoramalardan, kameradan ağaca olan açıyı ve mesafeyi hesapla.
    - Equirectangular görüntüden ağaca bakan perspektif (gnomonik) bir kesit çıkar.
    - Dört ana yönden en iyi kesiti seç; 1024×1024 JPEG ve yan dosya JSON yaz.
7. **Çıktı manifesti:** Üretilen tüm dosyaları; türlerini, hash'lerini, kaynaklarını (lineage) ve hat sürümünü içeren `outputs.json`. `docs/veri-modeli.md`'deki capture/asset kavramlarıyla uyumlu olsun. Yükleme için bir `Uploader` arayüzü ve yerel dosya sistemine yazan bir sahte uygulaması.

## Yapı

- `uv` ile yönetilen Python paketi (`pyproject.toml`, `uv.lock`), paket adı `orchados_pipeline`.
- Komut satırı aracı `orchados-pipeline`; her aşama alt komut olsun, ayrıca hepsini sırayla çalıştıran `run`.
- Her aşama saf fonksiyonlar + ince bir komut satırı katmanı. Aşamalar arası veri biçimleri pydantic ya da dataclass modelleriyle tanımlı.
- Her çıktı, hat sürümünü ve parametrelerin hash'ini taşısın; aynı girdi ve parametrelerle tekrar çalıştırmak aynı çıktıyı üretsin.

## Test

- `uv run pytest` ile çalışır.
- Testler sentetik veriyle:
    - Testin kendisi tarafından üretilen kısa bir equirectangular video: OpenCV ile çizilmiş basit sahne, başta ve sonda QR kodlu kareler, bazı karelerde kasıtlı bulanıklık.
    - Sentetik yörünge.
    - Elle hazırlanmış küçük bir `.pos` örneği.
    - Sentetik ağaç konumları.
- En azından şunlar kapsansın:
    - Manifest ve hash'ler
    - `.pos` ayrıştırma
    - NAV-PVT'den yörünge (İP2'nin örnek çerçevesi yoksa kendi ürettiğin geçerli çerçeveyle)
    - QR'dan zaman farkı ve kayma
    - Çapraz korelasyonla gecikme
    - Netlik skorunun bulanık kareyi elemesi
    - Mesafe dilimlerine göre kare seçimi
    - Açı ve mesafe hesabı ile gnomonik kesitin doğru yöne bakması
    - Uçtan uca `run`, sentetik oturum üzerinde
- RTKLIB gerektiren testler, araç yoksa atlanmalı (skip), başarısız olmamalı.

## Kabul ölçütü

- `uv run pytest` tamamen geçiyor.
- `uv run orchados-pipeline run <sentetik oturum>` uçtan uca çalışıyor.
- `services/pipeline/README.md` Türkçe olarak şunları içeriyor: aşamalar, girdi/çıktı biçimleri, QR zaman kodu biçimi, komutlar, bilinen sınırlar.
