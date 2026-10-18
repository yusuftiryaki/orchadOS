# İP2 – ESP32 GNSS Kaydedici Firmware'i

- **Dal:** `ip2-gnss-logger`
- **Klasör:** `firmware/gnss-logger/` (sadece burası)
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/tarama-kiti.md` (özellikle LiDAR'sız kit ve zaman senkronizasyonu), `docs/MVP.md` Modül 2 ve 3

## Amaç

LiDAR'sız tarama kitinde Raspberry Pi yok. ESP32, RTK alıcısının (u-blox ZED-F9P) ham GNSS verisini ve PPS zamanını microSD karta yazar, olayları (oturum başlangıcı/bitişi, sınır köşesi, QR saat işareti) kaydeder ve personelin telefonuna Bluetooth Low Energy (BLE) üzerinden durum bilgisi gönderir. Bu veriler sonradan PPK ile santimetre konuma çevrilir.

## Donanım varsayımları

- ESP32 geliştirme kartı (ESP32-WROOM-32, PlatformIO ortamı `esp32dev`, Arduino framework).
- ZED-F9P, UART2 üzerinden (varsayılan 460800 baud; başlangıçta alıcı 38400'de olabilir, firmware baud'u ayarlamalı).
- ZED-F9P'nin TIMEPULSE (PPS) çıkışı bir GPIO'ya, kesme ile.
- microSD kart SPI üzerinden.
- Batarya gerilimi bir ADC pininden, gerilim bölücüyle.
- Bir durum LED'i.
- Pin seçimlerini sen yap; `README.md`'de bağlantı tablosu olarak belgele ve tek bir başlık dosyasında topla.

## İşlevler

1. **Alıcı yapılandırması (açılışta):** UBX-CFG-VALSET ile:
    - RXM-RAWX ve RXM-SFRBX çıkışını aç (PPK için ham ölçümler), 1 Hz başla, 5 Hz'e ayarlanabilir olsun.
    - NAV-PVT'yi aç (5 Hz).
    - NMEA çıkışını UART2'de kapat.
    - Yapılandırma başarısızsa durumu BLE'ye ve LED'e yansıt.
2. **Kayıt:** Oturum başladığında `/sessions/<oturum_kimliği>/` klasörü açılır:
    - `gnss.ubx`: UART'tan gelen ham bayt akışı, olduğu gibi. Çift tamponlu yazma, en geç her saniye `flush`. Güç kesilirse en fazla son ~1 saniyelik veri kaybolsun.
    - `events.csv`: `esp_micros, gps_time_ns (PPS'e dayalı, yoksa boş), event_type, payload`. Olay türleri: `session_start`, `session_stop`, `corner`, `qr_sync`, `pps_lost`, `pps_regained`, `sd_error`.
    - `session.json`: oturum kimliği, parsel kimliği, firmware sürümü, alıcı yapılandırması, başlangıç ve bitiş zamanı.
3. **Zaman:** Her PPS kenarında `esp_micros` yakalanır ve en son NAV-PVT'nin GPS zamanıyla eşleştirilir. Böylece her olay GPS zamanına çevrilebilir. Eşleme ilişkisi (son PPS'in micros değeri + GPS saniyesi) olay satırına yazılır.
4. **BLE GATT servisi:**
    - **Durum karakteristiği** (notify, saniyede 1): kayıt durumu, konum çözüm türü (fix type ve RTK durumu `carrSoln`), uydu sayısı, yatay doğruluk (hAcc), PPS durumu, yazılan bayt, SD boş alanı, batarya gerilimi, firmware sürümü.
    - **Komut karakteristiği** (write): `start_session(session_id, parcel_id)`, `stop_session`, `mark_event(type, payload)`. `qr_sync` olayı telefon QR kodu gösterdiği anda gönderilir.
    - UUID'leri ve mesaj biçimini (kompakt ikili ya da kısa JSON, kararı sen ver) `README.md`'de belgele; saha uygulaması (İP6) bu belgeye göre yazılacak.
5. **Sağlamlık:** Watchdog; SD kart yoksa ya da doluysa kayıt başlamasın ve durum bunu bildirsin; UART taşmasına karşı yeterli tampon; bağlantı koparsa kayıt devam etsin.

## Mimari ve test

- Donanıma bağlı kodu (UART, SD, BLE, GPIO) ince bir HAL katmanının arkasına koy. Mantık (UBX ayrıştırma, sağlama toplamı, NAV-PVT çözme, CFG-VALSET mesajı oluşturma, olay kaydı biçimi, BLE mesaj kodlama/çözme, PPS–GPS zaman eşleme, halka tampon) donanımsız test edilebilir olsun.
- PlatformIO'da iki ortam:
    - `esp32dev`: derlenmeli (`pio run -e esp32dev`).
    - `native`: Unity ile birim testleri (`pio test -e native`).
- Testler en azından şunları kapsasın:
    - UBX çerçeve ayrıştırma; parçalı gelen ve bozuk sağlama toplamlı çerçeveler
    - NAV-PVT alanlarının çözülmesi; gerçek biçimde, elle hazırlanmış örnek çerçeveyle
    - CFG-VALSET mesajlarının bayt bayt doğruluğu
    - PPS–GPS zaman eşlemesi ve PPS kaybı
    - Olay satırı biçimi
    - BLE komutlarının kodlanması ve çözülmesi

## Kabul ölçütü

- `pio run -e esp32dev` başarılı.
- `pio test -e native` başarılı.
- `firmware/gnss-logger/README.md` Türkçe olarak şunları içeriyor: bağlantı tablosu, derleme/flaş/test komutları, dosya biçimleri, BLE protokolü (UUID'ler, karakteristikler, mesajlar).
- Flaşlama ve gerçek donanım testi bu görevin dışında (bulutta USB yok); PR açıklamasında yerelde yapılacak donanım test adımlarını listele.
