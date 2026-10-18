# apps/field — orchadOS Saha

Saha personelinin kullandığı, çevrimdışı çalışan Android uygulaması (Flutter). Bu klasördeki sürüm İP6 iskeletidir: ekran akışı, BLE protokolü, QR saat, yerel veritabanı ve gönderim kuyruğu hazır; gerçek kamera, senkronizasyon ve harita sonraki adımlar.

Bkz. [docs/plan.md](../../docs/plan.md) (İP6), [docs/MVP.md](../../docs/MVP.md) Modül 2 ve 3, [firmware/gnss-logger/README.md](../../firmware/gnss-logger/README.md) (BLE protokolü), [services/pipeline/README.md](../../services/pipeline/README.md) (QR saat kodu).

## Kurulum

`mobile` devcontainer'ında Flutter ve Android SDK kurulu gelir ([docs/gelistirme-ortami.md](../../docs/gelistirme-ortami.md)). Kendi makinende: Flutter `stable` (3.47 ile denendi, Dart 3.13).

```bash
cd apps/field
flutter pub get
```

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `flutter analyze` | Statik analiz (lint kuralları `analysis_options.yaml`) |
| `flutter test` | Birim ve arayüz testleri (cihaz ya da Android SDK gerekmez) |
| `dart run build_runner build` | drift kodunu yeniden üretir (`lib/core/db/database.g.dart`); tablo değişince çalıştır ve üretilen dosyayı da commit'le |
| `flutter run` | Bağlı telefonda çalıştırır (BLE ile gerçek kaydedici) |
| `flutter run --dart-define=FAKE_GNSS=true` | Sahte kaydediciyle çalıştırır (emülatör, demo) |
| `flutter build apk --debug` | Hata ayıklama APK'sı (`build/app/outputs/flutter-apk/app-debug.apk`) |

Derleme ayarları (`--dart-define`):

| Ad | Anlamı |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Verilirse giriş Supabase'e yapılır. Verilmezse çevrimdışı geliştirme kullanıcıları: `field@example.com` / `ops@example.com`, parola `orchados-dev` |
| `FAKE_GNSS` | `true` ise BLE yerine sahte kaydedici |

## Mimari

```
lib/
  main.dart                 Gerçek bağımlılıklar (BLE, dosya deposu, drift, Supabase) ProviderScope'a verilir
  app/                      Uygulama kökü, tema, Riverpod sağlayıcıları
  core/
    db/                     drift tabloları, FieldRepository (kayıt + kuyruk tek işlemde), Outbox
    media/                  FieldCamera arayüzü (+ sahte), içerik hash'iyle adreslenen MediaStore
    time/                   Clock, GPS zamanı dönüşümleri, GpsClock (telefon–GPS saat farkı)
    ui/                     Büyük düğme, referans görsel yeri, durum satırı
  features/
    auth/                   Giriş ekranı, AuthRepository (Supabase / geliştirme)
    tasks/                  Görev modeli, sahte görevler, "Bugünkü görevler"
    checklist/              Ön kontrol
    session/                SessionController (komut sırası, yerel kayıt), oturum ekranı
    qr_clock/               QR biçimlendirici, QR saat ekranı
    gnss/
      protocol/             Saf Dart BLE protokolü: durum çözme, komut kodlama/çözme, UUID'ler
      gnss_logger.dart      GnssLogger arayüzü + ortak komut takibi (GnssLoggerBase)
      flutter_blue_gnss_logger.dart   flutter_blue_plus uygulaması
      fake_gnss_logger.dart Sahte kaydedici (aynı baytları çözer, firmware gibi yanıt verir)
    closeup/                Yakın plan ağaç listesi, ağaç gözlem formu, mevsimlik çekim/soru seti
    summary/                Ziyaret özeti
```

- **Durum yönetimi:** Riverpod 3. Donanıma dokunan her şey (`GnssLogger`, `FieldCamera`, `MediaStore`, `AuthRepository`, `Clock`) bir sağlayıcının arkasında; testler sahtelerini verir.
- **BLE:** Protokol kodu `flutter_blue_plus`'tan bağımsızdır. `GnssLoggerBase` her komuta sıra numarası verir, yazmadan sonra gelen ilk durum mesajında `last_cmd_seq` eşleşince `last_cmd_result`'ı döndürür; 3 sn içinde gelmezse `timeout`. Bağlanınca MTU 247 istenir.
- **Saat:** `GpsClock`, GPS zamanı taşıyan her durum mesajından `ofset = kaydedici_GPS − telefon_saati(alış anı)` örneği alır; son 15 örneğin medyanını kullanır (geç gelen bildirimleri eler). 10 dakika örnek gelmezse ya da hiç gelmediyse telefon saati + 18 sn kullanılır ve **"Telefon saati"** olarak işaretlenir (ekranda turuncu şerit, veritabanında `time_source = phone`).
- **QR:** `OQ1:<gps_ms>:<oturum etiketi>` her 100 ms'de yenilenir. Ekrandaki ilk QR karesi çizilir çizilmez o karedeki değer `mark_event(qr_sync, değer)` ile kaydediciye gönderilir ve yerelde olay olarak saklanır.
- **Yerel veritabanı (drift / SQLite):** [docs/veri-modeli.md](../../docs/veri-modeli.md) ile uyumlu:

  | Tablo | Hedef model | Not |
  | --- | --- | --- |
  | `sessions` | Session (`session_type = scan`) | `id` aynı zamanda kaydedicinin `session_id`'si (SD karttaki klasör adı); metodoloji ve uygulama sürümü, kaydedici adı ve firmware sürümü |
  | `session_events` | — (Session'ın olayları) | `session_start`, `corner`, `qr_sync`, `session_stop`; GPS zamanı, zaman kaynağı, kaydedicinin yanıtı |
  | `captures` | Capture (`closeup_photo`, `phone_camera`) | Birincil anahtar dosyanın SHA-256'sı; çekim anında hesaplanır; satır güncellenmez |
  | `measurements` | Measurement (`source = staff`) | Evet/hayır cevabı `value_bool`; `method = field_question`, `method_version` soru setinin sürümü; kanıt fotoğrafların hash listesi |
  | `outbox_entries` | — | Gönderilmeyi bekleyenler kuyruğu; her kayıtla aynı işlemde eklenir |

  Personel adı ya da telefonu tutulmaz; yalnızca giriş yapan kullanıcının kimliği (`operator_id`).
- **Fotoğraf:** Sadece uygulama içi kamera arayüzü (`FieldCamera.takePicture`) var; galeriden seçim yolu yok. Fotoğraf çekilince SHA-256 hesaplanır, dosya `media/<sha256>.jpg` olarak bir kez yazılır. Veritabanı satırları ağaç kaydedilirken cevaplarla aynı işlemde eklenir; kaydedilmeden yeniden çekilen fotoğrafın dosyası silinir.

## Ekranlar

1. **Giriş:** e-posta + parola (geliştirme).
2. **Bugünkü görevler:** parsel, köy, alan, envanter ya da periyodik ziyaret, mevsim, yakın plan ağaç sayısı; üstte gönderilmeyi bekleyen kayıt sayısı.
3. **Ön kontrol:** kaydediciye bağlan; batarya, SD kart ve GNSS durumu BLE'den otomatik; lens temizliği ve kamera kaydı personel onayıyla. Hepsi tamam olmadan devam edilemez.
4. **Oturum:** canlı GNSS paneli (bağlantı, kayıt ve yazılan veri, fix ve uydu, RTK ve doğruluk, PPS, SD, batarya, saat kaynağı). Sıra zorunlu: Kaydı başlat → Başlangıç QR → (envanterde) Köşe işaretle → Bitiş QR → Kaydı durdur. Kayıt sürerken geri tuşu kapalı. Kaydedici kaydı kendisi durdurursa (SD dolu/hatalı) uyarı çıkar.
5. **QR saat:** tam ekran QR, UTC saat, QR metni, zaman kaynağı şeridi, `qr_sync` gönderim sonucu.
6. **Yakın plan görevi:** ağaç listesi (yer kodu ve seçilme nedeni). Ağaç formu: 2–3 çekim ("böyle çek" örneği ve referans görsel yeriyle) ve 3–4 evet/hayır sorusu (her biri referans görsel yeriyle). Zorunlu çekimler ve tüm sorular tamamlanmadan kaydedilemez.
7. **Ziyaret özeti:** kayıt süresi, QR sayısı (telefon saatiyle gösterilenler ayrıca), köşe sayısı, ağaç, fotoğraf, cevap, bekleyen gönderim.

Referans görseller henüz yok (İP10, metodoloji). `ShotSpec.referenceImage` / `YesNoQuestion.referenceImage` alanlarına asset yolu verildiğinde yer tutucunun yerine görsel çıkar.

## Testler

`flutter test` (46 test):

- `test/unit/gnss_protocol_test.dart`: firmware README'sindeki üç komut örneği (`01 07 03 53 2D 31 04 50 2D 31 32` vb.) bayt bayt kodlama ve çözme; firmware birim testindeki 31 baytlık durum vektörü; varsayılan durum; kısa/yanlış sürüm mesajları; sona eklenmiş alanlar; geçersiz argümanlar ve firmware'in sonuç kodları.
- `test/unit/qr_payload_test.dart`: işleme hattı README örneği (`OQ1:1476435618200:synth-00`), etiket kuralları.
- `test/unit/gps_clock_test.dart`: GPS–UTC dönüşümü (kaydedici `session.json` örneği), saat farkı, medyan, eski örnekler, telefon saatine düşme.
- `test/unit/outbox_test.dart`: kuyruğa ekleme sırası, `markSent`/`markFailed`, bekleyen sayısı akışı, başarısız işlemde geri alma, veri modeli alanları.
- `test/unit/gnss_logger_test.dart`: sahte kaydediciyle komut yaşam döngüsü, sıra numarası, zaman aşımı, SD yok.
- `test/widget/session_screen_test.dart`: envanter oturumu baştan sona (başlat, QR ve `qr_sync` değerinin ekrandakiyle aynı olması, köşeler, durdur, yerel olaylar), GPS zamanı yokken telefon saati işareti, başlatma hatası, ön kontrol.
- `test/widget/closeup_flow_test.dart`: yakın plan akışı (fotoğraf, yeniden çekim, cevaplar, kayıt, hash doğrulaması, kuyruk, özet).
- `test/widget/login_flow_test.dart`: giriş ve görev listesi.

## Telefonda çalıştırma (yerelde)

1. Telefonda **Geliştirici seçenekleri** → **USB hata ayıklama** açık olsun.
2. Ana makinede adb sunucusu çalışıyorsa durdur: `adb kill-server` (yoksa telefonu o tutar, devcontainer göremez).
3. VS Code'da depoyu **mobile** devcontainer'ında aç (`.devcontainer/mobile`). Konteyner `/dev/bus/usb`'yi bağlar.
4. Telefonu USB ile bağla, telefonda "USB hata ayıklamasına izin ver" onayını ver.
5. Konteynerde:
   ```bash
   adb devices                 # telefon "device" olarak görünmeli
   cd apps/field
   flutter run                 # gerçek kaydediciyle (BLE)
   flutter run --dart-define=FAKE_GNSS=true   # kaydedici olmadan
   ```
   Yerel Supabase'e bağlanmak için (`pnpm db:start`, adres ve anahtar `pnpm db:status`'ta): telefon ve bilgisayar aynı ağda olmalı, `localhost` yerine bilgisayarın ağ adresi verilir:
   ```bash
   flutter run --dart-define=SUPABASE_URL=http://192.168.1.20:54321 --dart-define=SUPABASE_KEY=<anon/publishable anahtar>
   ```
6. İlk açılışta Android Bluetooth (yakındaki cihazlar) ve kamera izni ister. Android 11 ve öncesinde BLE taraması için konum izni gerekir.
7. Kaydedici açıkken (`orchados-gnss-XXXX`) ön kontrolde **Kaydediciye bağlan**'a bas.

## Bilinen eksikler

- **Gerçek kamera yok:** `FieldCamera`'nın yalnızca sahte uygulaması var; telefonda da sahte fotoğraf üretilir. Sonraki adım `camera` paketiyle uygulama içi önizleme ve çekim; bulanık/karanlık fotoğraf kontrolü (MVP kalite kapısı) de onunla gelecek.
- **Senkronizasyon yok:** kayıtlar ve kuyruk hazır, yükleyici yok. Fotoğrafın object storage'a, satırların Supabase'e gönderimi İP1 şemasının saha tablolarına bağlı.
- **Durum mesajında GPS zamanı yok:** firmware'in v1 durum mesajı yalnızca "zaman eşlemesi var" bayrağını taşıyor, zamanın kendisini taşımıyor. Uygulama, durum mesajının sonuna eklenecek `gps_time_ns` (ofset 31, u64, 0 = eşleme yok; mesaj 39 bayt) alanını okuyacak şekilde yazıldı. Firmware bu alanı göndermedikçe QR **telefon saatiyle** gösterilir ve öyle işaretlenir. İşleme hattı QR'daki değeri GPS zamanı kabul eder; telefon saati genelde ağ saatiyle birkaç yüz ms içinde doğrudur ve bu fark hattın kaba eşlemesinde ofset hatası olarak kalır. Firmware değişikliği koordinatöre önerildi (PR açıklaması).
- **Kapsama haritası, rota ve "dur-çek-yürü" modu yok** (MVP Modül 3; harita altlığı ve parsel sınırı sync'e bağlı).
- **Görevler sahte:** `FakeTaskRepository` sabit iki görev döndürür.
- **Sesli not, hava durumu, ekipman seri numaraları** ziyaret kaydına henüz eklenmedi.
- **Ekran parlaklığı:** QR ekranında parlaklık otomatik artırılmıyor.
- **flutter_blue_plus lisansı:** paket kişisel, kâr amacı gütmeyen ve eğitim kullanımında ücretsiz; ticari kullanım için ücretli lisans gerekir. Kod `License.nonprofit` ile derleniyor (`flutter_blue_gnss_logger.dart`). Ticari kullanıma geçmeden önce lisans alınmalı ya da BLE paketi değiştirilmeli (yalnızca `FlutterBlueGnssLogger` değişir).
- Gerçek BLE uygulaması (`FlutterBlueGnssLogger`) testlerle kapsanmıyor; cihazla denenmedi. Bağlantı koparsa otomatik yeniden bağlanma yok, personel tekrar **Bağlan**'a basar (kaydedici kayda devam eder).
