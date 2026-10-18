# Entegrasyon – GNSS Kaydedici (İP2) ile İşleme Hattı (İP4) Arasındaki Arayüzler

- **Klasörler:** `services/pipeline/` ve yeni dosya `docs/arayuzler.md`. `firmware/gnss-logger/` **değişmez**; o tarafın biçimleri kaynak kabul edilir.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `firmware/gnss-logger/README.md` (dosya biçimleri ve BLE protokolü, **kaynak**), `services/pipeline/README.md`, `docs/MVP.md` Modül 3

## Sorun

İki bileşen ayrı ayrı yazıldı ve testlerini geçiyor, ama birbirine bağlanınca çalışmaz:

1. **`events.csv` sütunları:** İP2 altı sütun yazıyor (`esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns`), başlık satırıyla. İP4'ün ayrıştırıcısı (`events.py`) tam dört sütun bekliyor.
2. **`session.json`:** ESP32'nin yazdığı `session.json` (oturum kimliği, parsel kimliği, firmware, alıcı yapılandırması, başlangıç/bitiş) ile İP4'ün beklediği `session.json` (`session_id`, `parcel_id`, `camera_height_m`, yaw ofseti vb.) aynı dosya değil. Kamera yüksekliği ve yaw ofseti gibi alanları ESP32 bilmiyor.
3. **QR saat biçimi:** İP4 `OQ1:<gps_time_ms>[:<session_id'nin ilk 8 karakteri>]` biçimini tanımladı. İP2'de `qr_sync` olayının payload'ına QR'da gösterilen değer yazılıyor. Bu iki tanımın ve saha uygulamasının (İP6) ortak tek bir belgede durması gerekiyor.

## Yapılacaklar

1. **`docs/arayuzler.md` (Türkçe):** Bileşenler arası sözleşmelerin tek kaynağı. İçeriği:
    - **Oturum klasörünün yapısı:** Kim neyi üretir: saha uygulaması, ESP32, kamera, operasyon.
    - **`gnss/events.csv`:** İP2 README'sine atıf; sütunlar ve anlamları.
    - **İki ayrı oturum dosyası:** `gnss/session.json` (ESP32 yazar) ile kök `session.json` (saha uygulaması ve operasyon yazar: oturum kimliği, parsel, kit ve kalibrasyon sürümü, kamera yüksekliği, yaw ofseti, personel). Alan tablolarıyla.
    - **QR saat kodu biçimi** ve yenileme hızı.
    - **BLE protokolü:** İP2 README'sine atıf.
    - **Zaman tanımı:** GPS dönemi başlangıcından beri nanosaniye, artık saniyesiz.

    Belirsiz alanlarda karar ver ve "karar" olarak işaretle.
2. **İşleme hattını İP2 biçimlerine uydur:**
    - `events.csv`: Başlıklı altı sütunlu biçimi oku. Eski dört sütunlu biçimi okumaya gerek yok, ama açık bir hatayla reddet.
    - `gps_time_ns` boşsa ve çapa (`pps_*`) doluysa, GPS zamanını İP2 README'sindeki formülle yeniden hesapla; hesaplanan değeri işaretle.
    - `gnss/session.json`'u ve kök `session.json`'u ayrı modellerle oku ve birleştir. Çakışan alanlarda (oturum ve parsel kimliği) uyuşmazlık hata versin.
    - QR payload'ı içeren `qr_sync` olaylarını, videodaki QR okumalarıyla çapraz kontrol için kullan: QR değeri ile olayın GPS zamanı arasındaki fark raporlansın ve büyükse uyarı versin.
3. **Sözleşme testleri:**
    - `firmware/gnss-logger/README.md`'deki örnek `events.csv` ve `session.json` bloklarını test örneği olarak kullan; README'den okuyarak ya da birebir kopyalayarak, kararı sen ver.
    - İşleme hattı bunları sorunsuz okumalı.
    - Sentetik oturum üretici (`synth`) artık İP2 biçiminde `events.csv` ve `gnss/session.json` üretmeli; uçtan uca test bu biçimle çalışmalı.
4. **README güncellemesi:** `services/pipeline/README.md`'deki girdi biçimleri bölümü `docs/arayuzler.md`'ye atıf yapsın.

## Kabul ölçütü

- `cd services/pipeline && uv run pytest` tamamen geçiyor.
- `uv run orchados-pipeline synth /tmp/s && uv run orchados-pipeline run /tmp/s` çalışıyor ve üretilen oturumdaki `events.csv` İP2 biçiminde.
- `docs/arayuzler.md` mevcut; `services/pipeline/README.md` ona atıf yapıyor.
