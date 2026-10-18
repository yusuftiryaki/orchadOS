# İP6 – Saha Uygulaması İskeleti (Flutter)

- **Klasör:** `apps/field/` (sadece burası)
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/MVP.md` (Modül 2 envanter, Modül 3 periyodik tarama ve saha uygulaması ekranları), `docs/tarama-kiti.md` (sahadan merkeze iş akışı, zaman senkronizasyonu), `firmware/gnss-logger/README.md` (**BLE protokolü, kaynak**), `services/pipeline/README.md` (**QR saat kodu biçimi, kaynak**), `docs/veri-modeli.md`

## Ortam

- Flutter bulut ortamında kurulu değil. Flutter SDK'yı GitHub'dan (`stable` kanalı) kur; motor dosyaları `storage.googleapis.com`'dan iner (izinli).
- Testler için Android SDK gerekmez. `flutter build apk` denemesi opsiyonel: Android SDK indirmesi ağ kısıtı yüzünden başarısız olursa bunu PR'da raporla, görevi engellemesin.
- Kurulan Flutter sürümünü PR'da yaz.

## Amaç

Mühendis olmayan saha personelinin kullanacağı, çevrimdışı çalışan Android uygulamasının iskeleti. Bu görevde gerçek telefonda çalıştırma ve gerçek BLE cihazı yok; donanıma dokunan her şey bir arayüzün arkasında ve sahte uygulamasıyla test edilir.

## Kararlar (bunlara uy)

- Durum yönetimi için Riverpod; çevrimdışı yerel veritabanı için drift (SQLite).
- BLE için `flutter_blue_plus`; protokol kodlaması ondan bağımsız, saf Dart.
- Supabase istemcisi `supabase_flutter` (giriş ve ileride senkronizasyon).
- Arayüz dili Türkçe. Büyük düğmeler, ikonlar, sade metin; her gözlem sorusu bir referans görsel yeri taşısın (görseller sonra gelecek).

## Yapılacaklar

1. **Proje:**
    - `apps/field` içinde Flutter projesi; uygulama adı "orchadOS Saha".
    - Lint kuralları, klasör yapısı (özellik bazlı).
2. **BLE protokolü (saf Dart):**
    - `firmware/gnss-logger/README.md`'deki durum mesajının çözülmesi ve komutların (oturum başlat/durdur, olay işaretle) kodlanması.
    - **README'deki örnek baytlar test vektörü olarak kullanılsın.**
    - Cihaz bağlantısı `GnssLogger` arayüzü arkasında. `flutter_blue_plus` ile gerçek uygulaması ve testler için sahte uygulaması olsun.
3. **QR saat ekranı:**
    - `services/pipeline/README.md`'deki biçimde (`OQ1:...`), belirtilen yenileme hızında QR kod gösterir.
    - GPS zamanı, telefon saatiyle ESP32'den gelen GPS zamanı arasındaki farktan hesaplanır. Durum mesajında GPS zamanı yoksa telefonun saati kullanılır ve bu açıkça işaretlenir.
    - Ekranda QR gösterildiği anda ESP32'ye `qr_sync` olayı, QR değeriyle birlikte gönderilir.
4. **Ekran akışı** (sahte verilerle çalışır):
    - Giriş: geliştirmede e-posta + parola.
    - Bugünkü görevler: bahçe listesi, envanter ya da periyodik ziyaret.
    - Ön kontrol listesi: lens, batarya, SD kart, GNSS durumu (BLE'den), kamera kayıtta onayı.
    - Oturum ekranı: başlat/durdur, canlı GNSS durum paneli, başlangıç ve bitiş QR'ı, sınır köşesi işaretleme düğmesi (envanter).
    - Yakın plan görevi: ağaç listesi; ağaç başına 2–3 fotoğraf ve 3–4 evet/hayır sorusu.
        - **Fotoğraf sadece uygulama içi kamerayla çekilir; galeriden seçim yok.**
        - Kamera bu görevde bir arayüz arkasında, sahte uygulamasıyla.
    - Ziyaret özeti.
5. **Çevrimdışı kayıt:**
    - Oturumlar, olaylar, gözlemler ve fotoğraf kayıtları yerel veritabanında tutulur.
    - Gönderilmeyi bekleyenler kuyruğu.
    - Senkronizasyonun kendisi sonraya kalır, ama veri modeli `docs/veri-modeli.md` ile uyumlu olsun: Session, Capture, Measurement (kaynak: personel).
    - Her fotoğrafın SHA-256'sı çekim anında hesaplanıp saklanır.
6. **Testler:**
    - Birim testleri: BLE kodlama/çözme (README test vektörleri), QR biçimlendirici, saat farkı hesabı, çevrimdışı kuyruk.
    - Arayüz (widget) testleri: oturum ekranı, sahte BLE cihazıyla; yakın plan akışı.
7. **README (Türkçe):** Kurulum, komutlar, mimari, ekranlar, yerelde telefonda çalıştırma adımları (`mobile` devcontainer'ı, `adb`), bilinen eksikler.

## Kabul ölçütü

- `flutter analyze` temiz.
- `flutter test` tamamen geçiyor.
- PR açıklamasında: `flutter build apk` denendiyse sonucu, yerelde telefonda test için adımlar.
