# orchadOS Ekran Ekran Kullanım Kılavuzu

29 Ekim 2026

Bu kılavuz, ofiste (operasyon, ofis aracı) ve sahada çalışan personelin kullandığı **her ekranı** ekran görüntüsüyle anlatır. Günlük işin kısa özeti [personel kılavuzunda](../personel-kilavuzu.md); burada her ekranın düğmesi, alanı ve uyarı mesajı tek tek yazılıdır. İkisi aynı terimleri kullanır.

## Bölümler

| Bölüm | Ne anlatır | Kim okur |
| --- | --- | --- |
| [01 · Giriş ve roller](01-giris-ve-roller.md) | Web'e giriş, roller ve bölümler, erişim yok sayfası | Herkes |
| [02 · Operasyon panosu ve menü](02-operasyon-pano.md) | Pano, sayaçlar, yaklaşan ve geciken işler, sol menü | Operasyon |
| [03 · Başvuru, teklif, sipariş, ödeme](03-basvuru-teklif-siparis-odeme.md) | Başvuruyu doğrulama, teklif, sipariş ve ödeme planı, havale, makbuz | Operasyon |
| [04 · Sahip ve parsel](04-sahip-ve-parsel.md) | Telefonla gelen sahibi ve parseli kaydetme, erişim, sınır, sınır itirazı | Operasyon |
| [05 · Ziyaret planlama ve işleme](05-ziyaret-planlama.md) | Ziyaret planlama, bildirim, erteleme, yapılamayan ziyaret, işleme istasyonu | Operasyon |
| [06 · Ofis aracı: gövde üçgenleme](06-ofis-araci-ucgenleme.md) | Envanterde ağaçları panoramadan konumlama, kodlama, boş yer, doğrulama listesi, kayıt, düzenleme sayfası | Ofis aracı kullanıcısı (saha personeli, operasyon) |
| [07 · Saha uygulaması](07-saha-uygulamasi.md) | Telefon uygulamasının bütün ekranları: görevler, ön kontrol, kaydedici, QR saat, tarama, sınır, yakın plan, doğrulama turu, ziyaret özeti | Saha personeli |
| [08 · İade, çıkarma, mutabakat, KVKK](08-iade-cikarma-mutabakat-kvkk.md) | İadeler, bahçe çıkarma, ziyaret mutabakatı, KVKK talepleri, bildirimler, denetim kaydı | Operasyon |
| [09 · Fiyat, ayarlar ve personel](09-fiyat-ayarlar-personel.md) | Paketler ve fiyat listeleri, faturalama ayarları, personel adı ve unvanı | Operasyon |
| [10 · Uzman paneli (özet)](10-uzman-paneli-ozet.md) | Uzmanın işinin size değdiği yerler: kuyruk, takip istekleri, yayın | Ofis ve saha |
| [11 · Sorun giderme](11-sorun-giderme.md) | Sık durumlar ve ne yapılacağı | Herkes |

**Yeni başlayan saha personeli:** 01 → 07 → 11. **Ofis aracını kullanacak olan:** 01 → 06. **Operasyon:** 01 → 02 → 03 → 04 → 05, sonra ihtiyaç oldukça 08–11.

## Nasıl okunur

- Her ekran aynı sırayla anlatılır: **Ne için**, **Kim kullanır**, ekran görüntüsü, **Ekranın bölümleri**, **Nasıl yapılır**, **Düğmeler ve alanlar**, **Uyarılar ve ret mesajları**.
- Ekran görüntülerindeki **pembe numaralar** metindeki "Ekranın bölümleri" listesinin numaralarıdır.
- Tırnak içindeki yazılar ("Ziyaret planla") ekranda gördüğünüz düğme ve alan adlarının aynısıdır.
- Ekran adının altındaki adres (`/operasyon/ziyaret`) tarayıcının adres çubuğunda görünen yoldur.
- Bir özellik bir ayara bağlıysa ya da henüz canlıda değilse metinde açıkça yazılır.

## Ekran görüntüleri hakkında

- Görüntülerdeki bütün kişiler, bahçeler, telefonlar ve tutarlar **sentetiktir** (deneme verisi). Gerçek müşteri verisi yoktur.
- Görüntüler yerel deneme ortamında alındı. Bu ortamda panorama ve kesit dosyaları sentetik üretilir; bazı ekranlarda "Görüntü yok" yer tutucusu görünür. Canlı ortamda orada gerçek görüntü olur.
- Ekranlar yazılım geliştikçe değişebilir. Bir görüntü ekranla uyuşmuyorsa ekran esastır; operasyona bildirin.

## Görüntüleri yeniden üretmek (geliştirici için)

- **Web:** yerel Supabase'i kurun ve örnek veriyi yükleyin: `pnpm db:start && pnpm db:reset && pnpm db:demo`. Sonra kökte `pnpm kilavuz:screens`. Bu komut üretim derlemesini 3300 portunda açar (çalışan varsa onu kullanır), `apps/web/tests/kilavuz/` altındaki senaryoları çalıştırır, görüntüleri `docs/kilavuz/img/` altına yazar ve `pngquant` kuruluysa küçültür. Senaryolar kendi sentetik kayıtlarını açar; normal `pnpm web:e2e` bu klasörü çalıştırmaz. Altlık harita için sunucu OpenStreetMap karolarına ulaşabilmelidir (HTTPS vekili arkasında `NODE_USE_ENV_PROXY=1`).
- **Saha uygulaması:** [07 · Saha uygulaması](07-saha-uygulamasi.md) bölümünün sonundaki nota bakın.
