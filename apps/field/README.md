# apps/field — orchadOS Saha

Saha personelinin kullandığı, çevrimdışı çalışan Android uygulaması (Flutter). Bu klasördeki sürüm İP6'nın parçasıdır: ekran akışı, BLE protokolü, QR saat, yerel veritabanı, gönderim kuyruğu, uygulama içi kamera ve cihazda fotoğraf kalite kontrolü hazır; senkronizasyon ve harita sonraki adımlar.

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
| `dart run tool/calibrate_quality.dart` | Sentetik fotoğrafların kalite ölçümlerini yazdırır (eşik ayarı için) |
| `flutter build apk --debug` | Hata ayıklama APK'sı (`build/app/outputs/flutter-apk/app-debug.apk`) |

Derleme ayarları (`--dart-define`):

| Ad | Anlamı |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Verilirse giriş Supabase'e yapılır. Verilmezse çevrimdışı geliştirme kullanıcıları: `field@example.com` / `ops@example.com`, parola `orchados-dev` |
| `FAKE_GNSS` | `true` ise BLE yerine sahte kaydedici |
| `FAKE_CAMERA` | `true` ise kamera yerine sentetik fotoğraf (demo; kalite kontrolü yine çalışır) |

## Mimari

```
lib/
  main.dart                 Gerçek bağımlılıklar (BLE, dosya deposu, drift, Supabase) ProviderScope'a verilir
  app/                      Uygulama kökü, tema, Riverpod sağlayıcıları
  core/
    db/                     drift tabloları, FieldRepository (kayıt + kuyruk tek işlemde), Outbox
    media/                  FieldCamera arayüzü, gerçek kamera (camera paketi), sahte kamera ve
                            sentetik fotoğraf üreteci, içerik hash'iyle adreslenen MediaStore
    quality/                Fotoğraf kalite kontrolü (saf Dart) ve eşik dosyası quality_config.dart
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
    camera/                 Çekim ekranı: önizleme, referans görsel, odak, kalite kontrolü, Kullan / Yeniden çek
    closeup/                Yakın plan ağaç listesi, ağaç gözlem formu, mevsimlik çekim/soru seti
    summary/                Ziyaret özeti
```

- **Durum yönetimi:** Riverpod 3. Donanıma dokunan her şey (`GnssLogger`, `FieldCamera`, `MediaStore`, `AuthRepository`, `Clock`, `PhotoQualityChecker`) bir sağlayıcının arkasında; testler sahtelerini verir.
- **BLE:** Protokol kodu `flutter_blue_plus`'tan bağımsızdır. `GnssLoggerBase` her komuta sıra numarası verir, yazmadan sonra gelen ilk durum mesajında `last_cmd_seq` eşleşince `last_cmd_result`'ı döndürür; 3 sn içinde gelmezse `timeout`. Bağlanınca MTU 247 istenir.
- **Saat:** Firmware 0.2.0'dan beri durum mesajı 39 bayttır ve 31. bayttan itibaren mesajın oluşturulduğu anın GPS zamanını taşır (`gps_time_ns`, u64, 0 = PPS eşlemesi yok; firmware 0.1.0'ın 31 baytlık mesajında alan yoktur). `GpsClock`, GPS zamanı taşıyan her durum mesajından `ofset = kaydedici_GPS − telefon_saati(alış anı)` örneği alır; son 15 örneğin medyanını kullanır (geç gelen bildirimleri eler). 10 dakika örnek gelmezse ya da hiç gelmediyse telefon saati + 18 sn kullanılır ve **"Telefon saati"** olarak işaretlenir (ekranda turuncu şerit, veritabanında `time_source = phone`).
- **QR:** `OQ1:<gps_ms>:<oturum etiketi>` her 100 ms'de yenilenir. Ekrandaki ilk QR karesi çizilir çizilmez o karedeki değer `mark_event(qr_sync, değer)` ile kaydediciye gönderilir ve yerelde olay olarak saklanır.
- **Yerel veritabanı (drift / SQLite):** [docs/veri-modeli.md](../../docs/veri-modeli.md) ile uyumlu:

  | Tablo | Hedef model | Not |
  | --- | --- | --- |
  | `sessions` | Session (`session_type = scan`) | `id` aynı zamanda kaydedicinin `session_id`'si (SD karttaki klasör adı); metodoloji ve uygulama sürümü, kaydedici adı ve firmware sürümü |
  | `session_events` | — (Session'ın olayları) | `session_start`, `corner`, `qr_sync`, `session_stop`; GPS zamanı, zaman kaynağı, kaydedicinin yanıtı |
  | `captures` | Capture (`closeup_photo`, `phone_camera`) | Birincil anahtar dosyanın SHA-256'sı; satır güncellenmez. Çekim zamanı (`gps_time_ms` + `time_source`), kalite kontrolü sonucu ve sürümü (`qc_*`, şema 2) |
  | `measurements` | Measurement (`source = staff`) | Evet/hayır cevabı `value_bool`; `method = field_question`, `method_version` soru setinin sürümü; kanıt fotoğrafların hash listesi |
  | `outbox_entries` | — | Gönderilmeyi bekleyenler kuyruğu; her kayıtla aynı işlemde eklenir |

  Personel adı ya da telefonu tutulmaz; yalnızca giriş yapan kullanıcının kimliği (`operator_id`).
- **Fotoğraf:** Sadece uygulama içi kamera (`FieldCamera`) var; galeriden seçim yolu yok. Kalite kontrolünden geçen ve personelin **Kullan** dediği fotoğrafın SHA-256'sı hesaplanır, dosya `media/<sha256>.jpg` olarak bir kez yazılır. Reddedilen fotoğraf hiçbir yere yazılmaz. Veritabanı satırları ağaç kaydedilirken cevaplarla aynı işlemde eklenir; kaydedilmeden yeniden çekilen fotoğrafın dosyası silinir.
- **Şema sürümü:** 2. Sürüm 1'den geçişte `captures` tablosuna `qc_*` sütunları eklenir (eski satırlarda boş).

## Ekranlar

1. **Giriş:** e-posta + parola (geliştirme).
2. **Bugünkü görevler:** parsel, köy, alan, envanter ya da periyodik ziyaret, mevsim, yakın plan ağaç sayısı; üstte gönderilmeyi bekleyen kayıt sayısı.
3. **Ön kontrol:** kaydediciye bağlan; batarya, SD kart ve GNSS durumu BLE'den otomatik; lens temizliği ve kamera kaydı personel onayıyla. Hepsi tamam olmadan devam edilemez.
4. **Oturum:** canlı GNSS paneli (bağlantı, kayıt ve yazılan veri, fix ve uydu, RTK ve doğruluk, PPS, SD, batarya, saat kaynağı). Sıra zorunlu: Kaydı başlat → Başlangıç QR → (envanterde) Köşe işaretle → Bitiş QR → Kaydı durdur. Kayıt sürerken geri tuşu kapalı. Kaydedici kaydı kendisi durdurursa (SD dolu/hatalı) uyarı çıkar.
5. **QR saat:** tam ekran QR, UTC saat, QR metni, zaman kaynağı şeridi, `qr_sync` gönderim sonucu.
6. **Yakın plan görevi:** ağaç listesi (yer kodu ve seçilme nedeni). Ağaç formu: 2–3 çekim ("böyle çek" örneği ve referans görsel yeriyle) ve 3–4 evet/hayır sorusu (her biri referans görsel yeriyle). Zorunlu çekimler ve tüm sorular tamamlanmadan kaydedilemez. Uyarıyla kabul edilen fotoğraf "Çekildi (uyarıyla)" diye görünür.
7. **Çekim ekranı:** üstte referans görsel ve "Böyle çek: …" yönergesi, ortada canlı önizleme (dokunulan yere odak ve pozlama), altta deklanşör. Çekimden sonra fotoğraf, kalite sonucu ve **Kullan** / **Yeniden çek**. Ret durumunda yalnızca **Yeniden çek** var.
8. **Ziyaret özeti:** kayıt süresi, QR sayısı (telefon saatiyle gösterilenler ayrıca), köşe sayısı, ağaç, fotoğraf, cevap, bekleyen gönderim.

Referans görseller henüz yok (İP10, metodoloji). `ShotSpec.referenceImage` / `YesNoQuestion.referenceImage` alanlarına asset yolu verildiğinde yer tutucunun yerine görsel çıkar.

## Kamera ve kalite kontrolü

**Kamera** (`PluginFieldCamera`, `camera` paketi): arka kamera, 1080p (`ResolutionPreset.veryHigh`), ses kapalı (mikrofon izni istenmez), **flaş kapalı** (her çekimden önce yeniden kapatılır), otomatik odak ve pozlama. Önizlemeye dokunulan nokta odak ve pozlama noktası olur (telefon desteklemiyorsa sessizce atlanır). Uygulama arka plana geçince kamera bırakılır, dönünce yeniden açılır. Eklentinin önbelleğe yazdığı dosya okunduktan sonra silinir; uygulama yalnızca hash'li kopyayı tutar.

**İzin akışı** (`permission_handler`): Çekim ekranı açılınca kamera izni istenir.
- Reddedilirse: "Yakın plan fotoğrafları için kamera izni gerekli" ve **Tekrar dene** (sistem penceresi yeniden çıkar).
- Kalıcı reddedilmişse ("Bir daha sorma" ya da Android'in ikinci reddi): Ayarlar'daki yol yazılır, **Ayarları aç** uygulamanın ayar sayfasını açar. Personel izni verip döndüğünde kamera kendiliğinden açılır.
- Arka kamera yoksa ya da kamera başka uygulamada meşgulse ayrı mesaj ve **Tekrar dene**.

**Kalite kontrolü** (`lib/core/quality/`, saf Dart, `image` paketi): Fotoğraf çözülür, uzun kenarı en çok 480 piksel olacak şekilde blok ortalamasıyla küçültülür ve parlaklık (Rec. 601 luma, 0–255) üzerinde ölçülür:

| Ölçüm | Tanım | Ret | Uyarı |
| --- | --- | --- | --- |
| Netlik | 4 komşulu Laplacian'ın varyansı | < 60 | < 250 |
| Karanlık | Ortalama parlaklık · karanlık kırpılmış piksel oranı (≤ 12) | < 35 · > %50 | < 65 · > %25 |
| Aşırı pozlama | Ortalama parlaklık · parlak kırpılmış piksel oranı (≥ 243) | > 225 · > %40 | > 200 · > %15 |

- **Sonuç:** Herhangi bir ret varsa **Ret**, yoksa herhangi bir uyarı varsa **Uyarı**, değilse **Kabul**. Bulgular önem sırasıyla listelenir: önce retler, aynı düzeyde önce pozlama (karanlık fotoğraf netlikte de düşük ölçülür; personele "karanlık" denmesi daha doğru). Mesajlar sadedir: "Fotoğraf bulanık. Telefonu sabit tutup tekrar çekin.", "Fotoğraf çok karanlık. Işığı arkanıza alıp tekrar çekin." vb.
- **Ret:** fotoğraf kaydedilmez, yalnızca **Yeniden çek**. **Uyarı:** personel fotoğrafa bakıp **Kullan** ya da **Yeniden çek** der; uyarı veritabanına yazılır.
- **Eşikler** tek dosyada: `lib/core/quality/quality_config.dart`. Bir eşik değişince aynı dosyadaki `photoQualityCheckVersion` (şu an `photo-qc-v1`) artırılır.
- **İş parçacığı:** Kontrol `Isolate.run` ile ayrı isolate'te çalışır; arayüz "Fotoğraf kontrol ediliyor" gösterirken donmaz. Testlerde aynı kod aynı isolate'te çalışır (`PhotoQualityChecker(useIsolate: false)`).
- **Kayıt:** Kabul edilen fotoğrafın `captures` satırında: SHA-256, çekim zamanı (deklanşör anında `GpsClock`'tan; kaydediciden GPS zamanı yoksa `time_source = phone`), `qc_verdict` (`accept`/`warn`), `qc_version`, `qc_sharpness`, `qc_brightness`, `qc_dark_ratio`, `qc_bright_ratio`, `qc_findings` (ör. `blurry:warn`; boş = bulgu yok).

**Varsayılan eşiklerin ayarı:** `lib/core/media/synthetic_photo.dart` bahçeye benzer sentetik sahne üretir (gökyüzü, gövde ve dallar, yaprak lekeleri, 3 piksellik kabuk/toprak dokusu; boyutlar çözünürlükle ölçeklenir). Sahne 480×360, 1440×1080 ve 1920×1080'de, 4 farklı tohumla, bulanıklık (480 px genişlikte Gauss yarıçapı) ve pozlama kazancı değiştirilerek ölçüldü (`dart run tool/calibrate_quality.dart`):

| Sahne | Netlik | Ortalama parlaklık | Sonuç |
| --- | --- | --- | --- |
| Net, normal ışık | 590–1340 | 104–115 | Kabul |
| Hafif bulanık (yarıçap 1) | 128–198 | ≈ 108 | Uyarı |
| Bulanık (yarıçap 2) | 31–42 | ≈ 108 | Ret |
| Çok bulanık (yarıçap 3+) | ≤ 13 | ≈ 108 | Ret |
| Loş (kazanç 0,5) | 149–335 | 51–57 | Uyarı (karanlık) |
| Karanlık (kazanç 0,18) | 19–49 | 17–19 | Ret (karanlık) |
| Aşırı pozlanmış (kazanç 1,6 + 90) | 520–930 | ≈ 230; kırpılmış %46–52 | Ret (parlak) |

Eşikler bu kümelerin arasına, iki yana pay bırakarak kondu. **Bunlar sentetik değerlerdir;** gerçek ağaç fotoğraflarıyla (farklı telefonlar, gölge/güneş) ilk saha denemesinde yeniden ayarlanmalı. Laplacian varyansı kontrasta bağlıdır: loş ve hafif bulanık bir fotoğraf (loş sahne, yarıçap 1: 32–51) "bulanık" diye reddedilir.

## Testler

`flutter test` (66 test):

- `test/unit/gnss_protocol_test.dart`: firmware README'sindeki üç komut örneği (`01 07 03 53 2D 31 04 50 2D 31 32` vb.) bayt bayt kodlama ve çözme; firmware birim testindeki 31 baytlık durum vektörü ve 0.2.0'ın 39 baytlık `gps_time_ns`'li biçimi; varsayılan durum; kısa/yanlış sürüm mesajları; sona eklenmiş alanlar; geçersiz argümanlar ve firmware'in sonuç kodları.
- `test/unit/qr_payload_test.dart`: işleme hattı README örneği (`OQ1:1476435618200:synth-00`), etiket kuralları.
- `test/unit/gps_clock_test.dart`: GPS–UTC dönüşümü (kaydedici `session.json` örneği), saat farkı, medyan, eski örnekler, telefon saatine düşme.
- `test/unit/outbox_test.dart`: kuyruğa ekleme sırası, `markSent`/`markFailed`, bekleyen sayısı akışı, başarısız işlemde geri alma, veri modeli alanları.
- `test/unit/gnss_logger_test.dart`: sahte kaydediciyle komut yaşam döngüsü, sıra numarası, zaman aşımı, SD yok.
- `test/widget/session_screen_test.dart`: envanter oturumu baştan sona (başlat, QR ve `qr_sync` değerinin ekrandakiyle aynı olması, köşeler, durdur, yerel olaylar), GPS zamanı yokken telefon saati işareti, başlatma hatası, ön kontrol.
- `test/unit/photo_quality_test.dart`: testte üretilen sentetik görüntülerle netlik (net/hafif bulanık/bulanık, 480 ve 1440 piksel), pozlama (karanlık/loş/normal/aşırı), kırpılmış piksel oranları, eşik kuralları, bulgu sırası, okunamayan dosya, küçültme, isolate ile aynı sonuç. Repoya görüntü eklenmez.
- `test/unit/database_migration_test.dart`: şema 1 veritabanının 2'ye geçişi (eski fotoğraf satırı korunur, `qc_*` boş).
- `test/widget/capture_flow_test.dart`: sahte kamerayla çekim ekranı (referans görsel yeri, yönerge, odak dokunuşu, galeri yok, geri dönünce kayıt yok); ret → yeniden çek → ret → kabul, yalnızca kabul edilen dosyanın yazılması; uyarının kabulü ve veritabanına yazılması; çekim zamanının `GpsClock`'tan gelmesi ve telefon saati işareti; izin reddi ve tekrar deneme; kalıcı ret, ayarlar ve geri dönüş; arka plana geçişte kameranın bırakılması.
- `test/widget/closeup_flow_test.dart`: yakın plan akışı (fotoğraf, yeniden çekim, cevaplar, kayıt, hash doğrulaması, kalite sonucu, kuyruk, özet).
- `test/unit/outbox_test.dart` ayrıca: fotoğraf satırında kalite alanları ve sürüm; reddedilmiş fotoğrafın kaydedilememesi.
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
6. İlk açılışta Android Bluetooth (yakındaki cihazlar) izni ister; kamera izni ilk fotoğraf çekiminde istenir. Android 11 ve öncesinde BLE taraması için konum izni gerekir.
7. Kaydedici açıkken (`orchados-gnss-XXXX`) ön kontrolde **Kaydediciye bağlan**'a bas.

### Kamera ve kalite kontrolünü telefonda deneme

`flutter run --dart-define=FAKE_GNSS=true` ile açıp bir yakın plan görevine gir, bir ağaç seç:

1. **İzin reddi:** İlk **Fotoğraf çek**'te çıkan izin penceresinde **İzin verme** de. "Kamera izni gerekli" ve **Tekrar dene** görünmeli. **Tekrar dene**'de yine reddet (Android 11+ ikinci reddi kalıcı sayar): "Ayarlar → İzinler → Kamera" ve **Ayarları aç** görünmeli. Ayarlardan izni ver, geri dön: önizleme kendiliğinden açılmalı.
2. **Normal ışık:** Gün ışığında bir gövdeyi çek. "Fotoğraf iyi" (yeşil) beklenir. **Kullan** → kartta "Çekildi".
3. **Bulanık:** Çekerken telefonu sallayarak ya da çok yakından (odak mesafesinin altında) çek. "Fotoğraf bulanık" (kırmızı) ve yalnızca **Yeniden çek** beklenir.
4. **Karanlık:** Lensi parmakla kapatarak ya da karanlık odada çek: "Fotoğraf çok karanlık". Akşamüstü gölgede: çoğunlukla "biraz karanlık" uyarısı.
5. **Aşırı pozlama:** Güneşe ya da parlak bir lambaya doğru çek: "Fotoğraf çok parlak".
6. **Odak:** Önizlemede yakın bir dala dokun; sarı kare çıkmalı, odak oraya kaymalı.
7. **Flaş:** Karanlıkta da flaş patlamamalı.
8. **Arka plan:** Önizleme açıkken ana ekrana dön, geri gel: önizleme yeniden açılmalı.

Sonuçlar eşik ayarı için not edilmeli (ölçümler veritabanında `captures.qc_*`).

## Bilinen eksikler

- **Kalite eşikleri sentetik verilerle ayarlandı;** gerçek fotoğraflarla yeniden ayar gerekir (yukarıda).
- **Gerçek kamera (`PluginFieldCamera`) testlerle kapsanmıyor** ve cihazda denenmedi; bu ortamda Android SDK yok, APK derlenmedi. Önizleme oranı dikey kullanıma göre (`1 / aspectRatio`) ayarlandı; yatay kullanım kilitli değil.
- **Kalite kontrolü süresi:** 1080p JPEG'in saf Dart ile çözülmesi telefonda yaklaşık birkaç yüz ms sürer (ölçülmedi). Daha yüksek çözünürlükte süre artar.
- **Referans görseller** hâlâ yer tutucu (İP10).
- **Senkronizasyon yok:** kayıtlar ve kuyruk hazır, yükleyici yok. Fotoğrafın object storage'a, satırların Supabase'e gönderimi İP1 şemasının saha tablolarına bağlı.
- **Kapsama haritası, rota ve "dur-çek-yürü" modu yok** (MVP Modül 3; harita altlığı ve parsel sınırı sync'e bağlı).
- **Görevler sahte:** `FakeTaskRepository` sabit iki görev döndürür.
- **Sesli not, hava durumu, ekipman seri numaraları** ziyaret kaydına henüz eklenmedi.
- **Ekran parlaklığı:** QR ekranında parlaklık otomatik artırılmıyor.
- **flutter_blue_plus lisansı:** paket kişisel, kâr amacı gütmeyen ve eğitim kullanımında ücretsiz; ticari kullanım için ücretli lisans gerekir. Kod `License.nonprofit` ile derleniyor (`flutter_blue_gnss_logger.dart`). Ticari kullanıma geçmeden önce lisans alınmalı ya da BLE paketi değiştirilmeli (yalnızca `FlutterBlueGnssLogger` değişir).
- Gerçek BLE uygulaması (`FlutterBlueGnssLogger`) testlerle kapsanmıyor; cihazla denenmedi. Bağlantı koparsa otomatik yeniden bağlanma yok, personel tekrar **Bağlan**'a basar (kaydedici kayda devam eder).
