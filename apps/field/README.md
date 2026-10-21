# apps/field — orchadOS Saha

Saha personelinin kullandığı, çevrimdışı çalışan Android uygulaması (Flutter). Bu klasördeki sürüm İP6'nın parçasıdır: ekran akışı, BLE protokolü, QR saat, yerel veritabanı, gönderim kuyruğu, uygulama içi kamera, cihazda fotoğraf kalite kontrolü, sunucudan günün görevleri, çevrimdışı senkronizasyon ve envanterin saha tarafı (doğrulama turu, sınır yürüyüşünde köşe işaretleme, taramada kapsama haritası) ve sabit grid rotası (yönlendirme, dur-çek-yürü) hazır; harita altlığı sonraki adım.

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
| `ORCHADOS_TEST_SUPABASE_URL=… ORCHADOS_TEST_SUPABASE_KEY=… flutter test test/integration` | Yerel Supabase'e `field@example.com` ile gerçek gönderim: ziyaret ve doğrulama turu (aşağıda, "Testler"); değişkenler yoksa atlanır |
| `dart run build_runner build` | drift kodunu yeniden üretir (`lib/core/db/database.g.dart`); tablo değişince çalıştır ve üretilen dosyayı da commit'le |
| `flutter run` | Bağlı telefonda çalıştırır (BLE ile gerçek kaydedici) |
| `flutter run --dart-define=FAKE_GNSS=true` | Sahte kaydediciyle çalıştırır (emülatör, demo) |
| `dart run tool/calibrate_quality.dart` | Sentetik fotoğrafların kalite ölçümlerini yazdırır (eşik ayarı için) |
| `flutter build apk --debug` | Hata ayıklama APK'sı (`build/app/outputs/flutter-apk/app-debug.apk`) |

Derleme ayarları (`--dart-define`):

| Ad | Anlamı |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_KEY` | Verilirse giriş Supabase'e yapılır, görevler sunucudan iner ve kuyruk gönderilir. Verilmezse çevrimdışı geliştirme kullanıcıları (`field@example.com` / `ops@example.com`, parola `orchados-dev`) ve iki örnek görev; gönderim kapalıdır (kayıtlar kuyrukta bekler) |
| `FAKE_GNSS` | `true` ise BLE yerine sahte kaydedici. Sahte kaydedici konum da gönderir: örnek parselin (sentetik, Gaziantep yakını) koridorlarında 1,2 m/sn yürür; kapsama ve köşe ekranları kaydedicisiz denenebilir |
| `FAKE_CAMERA` | `true` ise kamera yerine sentetik fotoğraf (demo; kalite kontrolü yine çalışır) |

## Mimari

```
lib/
  main.dart                 Gerçek bağımlılıklar (BLE, dosya deposu, drift, Supabase) ProviderScope'a verilir
  app/                      Uygulama kökü, tema, Riverpod sağlayıcıları
  core/
    db/                     drift tabloları, FieldRepository (kayıt + kuyruk tek işlemde), Outbox
    geo/                    Yerel düzlem izdüşümü, uzaklık, yön (8 yön, Türkçe), poligon alanı, GeoJSON
    media/                  FieldCamera arayüzü, gerçek kamera (camera paketi), sahte kamera ve
                            sentetik fotoğraf üreteci, içerik hash'iyle adreslenen MediaStore
    quality/                Fotoğraf kalite kontrolü (saf Dart) ve eşik dosyası quality_config.dart
    sync/                   SyncWorker (kuyruğu gönderir), SyncServer arayüzü ve Supabase uygulaması,
                            yerel satır → sunucu satırı eşlemeleri (sync_rows.dart), bağlantı izleme
    time/                   Clock, GPS zamanı dönüşümleri, GpsClock (telefon–GPS saat farkı)
    ui/                     Büyük düğme, referans görsel yeri, durum satırı
  features/
    auth/                   Giriş ekranı, AuthRepository (Supabase / geliştirme)
    tasks/                  Görev modeli (yerler, sınır, doğrulama kalemleri), sunucudan görevler +
                            çevrimdışı önbellek, yakın plan ağacı seçimi, örnek görevler ve sentetik
                            örnek parsel (sample_parcel.dart), "Bugünkü görevler"
    checklist/              Ön kontrol
    session/                SessionController (komut sırası, yerel kayıt), oturum ekranı
    qr_clock/               QR biçimlendirici, QR saat ekranı
    gnss/
      protocol/             Saf Dart BLE protokolü: durum çözme, komut kodlama/çözme, UUID'ler
      gnss_logger.dart      GnssLogger arayüzü + ortak komut takibi (GnssLoggerBase)
      flutter_blue_gnss_logger.dart   flutter_blue_plus uygulaması
      fake_gnss_logger.dart Sahte kaydedici (aynı baytları çözer, firmware gibi yanıt verir)
    camera/                 Çekim ekranı: önizleme, referans görsel, odak, kalite kontrolü, Kullan / Yeniden çek;
                            takePhoto (çek, hash'le, depoya yaz)
    verification/           Doğrulama turu ve kalem ekranı, yer tarifi (route_hint.dart)
    boundary/               Köşe modeli (boundary_corners.dart), Sınır ve Köşe ekranları
    coverage/               Kapsama hesabı (coverage.dart, saf Dart), kapsama kartı
    route/                  Grid rotası: üretim (grid_route.dart) ve yönlendirme (route_guide.dart, saf Dart),
                            saklı rota seçimi (route_store.dart), rota kartı, dur-çek-yürü bip sesi (beeper.dart)
    map/                    Çevrimdışı vektör harita (CustomPainter): sınır, yerler, iz, konum
    closeup/                Yakın plan ağaç listesi, ağaç gözlem formu, mevsimlik çekim/soru seti
    summary/                Ziyaret özeti
    sync/                   Gönderim durumu kartı (bekleyen / gönderilen / başarısız, "Şimdi gönder")
```

- **Durum yönetimi:** Riverpod 3. Donanıma dokunan her şey (`GnssLogger`, `FieldCamera`, `MediaStore`, `AuthRepository`, `Clock`, `PhotoQualityChecker`) bir sağlayıcının arkasında; testler sahtelerini verir.
- **BLE:** Protokol kodu `flutter_blue_plus`'tan bağımsızdır. `GnssLoggerBase` her komuta sıra numarası verir, yazmadan sonra gelen ilk durum mesajında `last_cmd_seq` eşleşince `last_cmd_result`'ı döndürür; 3 sn içinde gelmezse `timeout`. Bağlanınca MTU 247 istenir.
- **Saat:** Firmware 0.2.0'dan beri durum mesajı 39 bayttır ve 31. bayttan itibaren mesajın oluşturulduğu anın GPS zamanını taşır (`gps_time_ns`, u64, 0 = PPS eşlemesi yok; firmware 0.1.0'ın 31 baytlık mesajında alan yoktur). `GpsClock`, GPS zamanı taşıyan her durum mesajından `ofset = kaydedici_GPS − telefon_saati(alış anı)` örneği alır; son 15 örneğin medyanını kullanır (geç gelen bildirimleri eler). 10 dakika örnek gelmezse ya da hiç gelmediyse telefon saati + 18 sn kullanılır ve **"Telefon saati"** olarak işaretlenir (ekranda turuncu şerit, veritabanında `time_source = phone`).
- **QR:** `OQ1:<gps_ms>:<oturum etiketi>` her 100 ms'de yenilenir. Ekrandaki ilk QR karesi çizilir çizilmez o karedeki değer `mark_event(qr_sync, değer)` ile kaydediciye gönderilir ve yerelde olay olarak saklanır.
- **Yerel veritabanı (drift / SQLite):** [docs/veri-modeli.md](../../docs/veri-modeli.md) ile uyumlu:

  | Tablo | Hedef model | Not |
  | --- | --- | --- |
  | `sessions` | Session (`session_type = scan`) | `id` aynı zamanda kaydedicinin `session_id`'si (SD karttaki klasör adı); metodoloji ve uygulama sürümü, kaydedici adı ve firmware sürümü |
  | `session_events` | — (Session'ın olayları) | `session_start`, `corner`, `boundary_corners`, `qr_sync`, `route`, `route_progress`, `coverage`, `session_stop`; GPS zamanı, zaman kaynağı, kaydedicinin yanıtı; ayrıntılar `data_json`'da (şema 4) |
  | `captures` | Capture (`closeup_photo`, `phone_camera`) | Birincil anahtar dosyanın SHA-256'sı; satır güncellenmez. Çekim zamanı (`gps_time_ms` + `time_source`), kalite kontrolü sonucu ve sürümü (`qc_*`, şema 2) |
  | `measurements` | Measurement (`source = staff`) | Evet/hayır cevabı `value_boolean` (sunucudaki sütunla aynı ad); `method = field_question`, `method_version` soru setinin sürümü; kanıt fotoğrafların hash listesi |
  | `outbox_entries` | — | Gönderilmeyi bekleyenler kuyruğu; her kayıtla aynı işlemde eklenir. `sent_at` (gönderildi), `failed_at` + `last_error` (sunucu kalıcı olarak reddetti), `attempts` |
  | `task_cache` | — | Kullanıcı başına son indirilen görev listesi (JSON; yerler, sınır ve doğrulama kalemleri dahil); çevrimdışı kullanılır |
  | `parcel_routes` | ParcelRoute (`public.parcel_route`) | Bu telefonda oluşturulan rota sürümleri (şema 5): kimlik, parsel, sürüm (gönderilince sunucununki), içerik hash'i, üretici sürümü, rota JSON'u, ilk kullanan ziyaret, `synced`. Gönderilmeden ikinci bir ziyaret aynı rotayı buradan alır |
  | `verification_results` | `record_verification_result` çağrısı | Doğrulama kalemi sonucu (şema 4): kalem, ağaç var/yok, not, yakın planın hash'i. Aynı kaleme ikinci sonuç yeni satırdır; en yenisi geçerli |

  Personel adı ya da telefonu tutulmaz; yalnızca giriş yapan kullanıcının kimliği (`operator_id`).
- **Fotoğraf:** Sadece uygulama içi kamera (`FieldCamera`) var; galeriden seçim yolu yok. Kalite kontrolünden geçen ve personelin **Kullan** dediği fotoğrafın SHA-256'sı hesaplanır, dosya `media/<sha256>.jpg` olarak bir kez yazılır. Reddedilen fotoğraf hiçbir yere yazılmaz. Veritabanı satırları ağaç kaydedilirken cevaplarla aynı işlemde eklenir; kaydedilmeden yeniden çekilen fotoğrafın dosyası silinir.
- **Şema sürümü:** 5. Sürüm 1'den geçişte `captures` tablosuna `qc_*` sütunları eklenir (eski satırlarda boş). Sürüm 3'te `measurements.value_bool` → `value_boolean` adını alır, `outbox_entries.failed_at` ve `task_cache` eklenir. Sürüm 4'te `session_events.data_json` ve `verification_results` eklenir. Sürüm 5'te `parcel_routes` eklenir.

## Ekranlar

1. **Giriş:** e-posta + parola (geliştirme).
2. **Bugünkü görevler:** üstte gönderim kartı (bekleyen, gönderilen, başarısız sayısı, durum satırı, **Şimdi gönder**); altında parsel, köy, alan, envanter, periyodik ziyaret ya da doğrulama turu, mevsim, yakın plan ağaç sayısı (turda "3 / 12 kaleme bakıldı"), planlanan gün ve "Size atanmış". Sunucuya ulaşılamazsa son indirilen liste ve bir not gösterilir; aşağı çekince liste yenilenir. Bu telefonda kaydedilmiş ziyaret "Tamamlandı" görünür; doğrulama turu bütün kalemlerine bakılınca. Doğrulama turu ön kontrolsüz, doğrudan tur ekranına açılır.
3. **Ön kontrol:** kaydediciye bağlan; batarya, SD kart ve GNSS durumu BLE'den otomatik; lens temizliği ve kamera kaydı personel onayıyla. Hepsi tamam olmadan devam edilemez.
4. **Oturum:** canlı GNSS paneli (bağlantı, kayıt ve yazılan veri, fix ve uydu, RTK ve doğruluk, PPS, SD, batarya, saat kaynağı) ve kayıt başlayınca **rota kartı** ve **kapsama kartı** (aşağıda, "Rota" ve "Kapsama"). Sıra zorunlu: Kaydı başlat → Başlangıç QR → (envanterde) **Sınır** → Bitiş QR → Kaydı durdur. Kayıt sürerken geri tuşu kapalı. Kaydedici kaydı kendisi durdurursa (SD dolu/hatalı) uyarı çıkar. Envanterde kayıt durduktan sonra da köşeler düzenlenebilir.
5. **QR saat:** tam ekran QR, UTC saat, QR metni, zaman kaynağı şeridi, `qr_sync` gönderim sonucu.
6. **Yakın plan görevi:** ağaç listesi (yer kodu ve seçilme nedeni). Ağaç formu: 2–3 çekim ("böyle çek" örneği ve referans görsel yeriyle) ve 3–4 evet/hayır sorusu (her biri referans görsel yeriyle). Zorunlu çekimler ve tüm sorular tamamlanmadan kaydedilemez. Uyarıyla kabul edilen fotoğraf "Çekildi (uyarıyla)" diye görünür.
7. **Çekim ekranı:** üstte referans görsel ve "Böyle çek: …" yönergesi, ortada canlı önizleme (dokunulan yere odak ve pozlama), altta deklanşör. Çekimden sonra fotoğraf, kalite sonucu ve **Kullan** / **Yeniden çek**. Ret durumunda yalnızca **Yeniden çek** var.
8. **Ziyaret özeti:** kayıt süresi, QR sayısı (telefon saatiyle gösterilenler ayrıca), köşe sayısı ve yaklaşık alan (envanter), rota ("12 / 24 koridor" ve atlanan koridorlar), kapsama ("Yerlerin %96'sının 4 m yakınından geçildi"; %95'in altında kırmızı uyarı ve kaçırılan yerler), ağaç, fotoğraf, cevap; bu ziyaretin gönderim kartı (hepsi gidince "Bu ziyaretin her şeyi gönderildi"). **Ziyareti bitir** gönderimi başlatır.
9. **Sınır** (envanter): canlı konum kalitesi, büyük **Köşe** düğmesi, köşelerden çizilen yaklaşık poligon ve alan, köşe listesi (yukarı/aşağı, **Son köşeyi sil**). Köşeye dokununca **Köşe** ekranı: sınır işareti (sınır taşı, çit, duvar, yol, komşu bahçe, diğer), fotoğraf, not.
10. **Doğrulama turu:** "3 / 12 kaleme bakıldı", gönderilemeyenler (kırmızı, sade mesajla), açık kalemler (yürüme sırasıyla; kod, yer tarifi, nedenler, ofisin notu, konum varsa uzaklık ve yön), bakılanlar; turun gönderim kartı ve **Turu bitir**.
11. **Kalem:** yer tarifi ve canlı uzaklık, nedenler ve ofisin notu, kayıttaki durum (ağaç var / boş yer), **Ağaç var** / **Ağaç yok**, isteğe bağlı yakın plan, not, **Kaydet**.

Referans görseller henüz yok (İP10, metodoloji). `ShotSpec.referenceImage` / `YesNoQuestion.referenceImage` alanlarına asset yolu verildiğinde yer tutucunun yerine görsel çıkar.

## Senkronizasyon

Saha uygulaması sunucuyla yalnızca giriş yapan kullanıcının belirteciyle PostgREST ve Storage üzerinden konuşur (servis anahtarı yok); ne yazabileceğine satır bazlı yetki kuralları karar verir. Sözleşme: [docs/arayuzler.md](../../docs/arayuzler.md), "Saha uygulaması ve veritabanı".

### Günün görevleri (`SupabaseTaskSource`, `CachedTaskRepository`)

- **Görev = planlanmış ziyaret:** `public.session`, `status = planned`, tür `inventory`, `periodic_scan` ya da `verification`, `planned_date` bugünden en çok 7 gün sonrası (geçmiş günler dahil: gecikmiş ziyaret). Satır bazlı yetki listeyi kullanıcının kurumuna sınırlar. Ziyaret lideri (`lead_user_id`) giriş yapan kullanıcı olanlar önce gelir ve "Size atanmış" yazar.
- **Parsel bilgisi:** ad, köy, tahmini alan (`estimated_area_m2` / 1000 = dönüm). **Mevsim:** ziyaret satırında mevsim yok; planlanan günün ayından çıkar (Aralık–Şubat kış, Mart–Mayıs ilkbahar, Haziran–Temmuz yaz, Ağustos–Kasım hasat).
- **Ağaçlar ve yakın plan listesi (periyodik ziyaret):** parselin aktif ağaçları yer kodlarıyla (`tree` + `slot`) ve son genel sınıfları (`tree_latest_assessment`) iner. Liste: önce son sınıfı Dikkat, Sorunlu ya da Kuru olanlar, sonra ağaçların %10'u kadar rastgele örneklem. Örneklem ziyaret ve ağaç kimliğinin hash'iyle seçilir; aynı ziyareti indiren her telefon aynı listeyi görür. Metodolojideki 10×10 m hücre tabakalaması ve "Sorun gördüm" ağaçları henüz yok.
- **Yerler ve sınır (her görev):** parselin bütün yerleri (`slot`: kod, sıra, pozisyon, GeoJSON konum, belirsizlik; 1000'lik sayfalar) ve en yüksek sürümlü sınırı (`boundary.geom`, GeoJSON poligon). Harita, kapsama ve yer tarifi bunlarla çalışır; ilk envanterde ikisi de boş olabilir.
- **Doğrulama kalemleri (tur):** `verification_item`, `status = open`; kalemin yeri parselin yer listesinden bulunur. Sıra: sıra numarası, pozisyon, kod.
- **Çevrimdışı:** her başarılı indirmede liste kullanıcı başına `task_cache`'e yazılır. Sunucuya ulaşılamazsa (20 sn) son liste gösterilir. Başka bir kullanıcı aynı telefonda öbürünün listesini görmez.
- **Kayıt kimliği:** ziyaretin kimliği (`session.id`) telefondaki oturumun ve kaydedicinin `session_id`'si olur. Aynı ziyaret aynı telefonda ikinci kez başlatılamaz (kaydedici de `session_exists` der).
- Supabase ayarlı değilse `FakeTaskRepository`'nin üç örnek görevi kullanılır (geliştirme): periyodik ziyaret ve doğrulama turu sentetik örnek parselde (10 sıra × 22 yer, sınır), envanter yer ve sınır olmadan. Bu görevlerin sunucuda karşılığı yoktur; gönderilirse `visit_not_found` ile reddedilir.

### Gönderim (`SyncWorker`)

Her kayıt yerel veritabanına yazılırken aynı işlemde kuyruğa (`outbox_entries`) eklenir. `SyncWorker` kuyruğu **eklenme sırasıyla** gönderir:

| Kuyruktaki | Sunucuda | Yazma |
| --- | --- | --- |
| Oturum (`session`) | Planlanmış ziyaret: `public.session` | `update`: `started_at`, `methodology_version`; kayıt durunca ayrıca `status = captured`, `ended_at`. Yalnızca ziyaret `planned` ya da `captured` iken; işlenmiş, incelemede ya da yayımlanmış ziyarete dokunulmaz (gönderilmiş sayılır). Ziyaret yoksa ya da iptal edilmişse kalıcı hata |
| Oturum olayı (`session_event`) | `public.session_event` (yeni tablo) | Kimlik telefondan; `on conflict (id) do nothing` |
| Yakın plan fotoğrafı (`capture`) | Dosya: `media` alanında `org/<org_id>/parcel/<parcel_id>/<sha256>`; satır: `public.capture` (`kind = photo`) | Önce dosya (aynı yol zaten varsa yüklenmiş sayılır), sonra satır: `on conflict (session_id, content_hash) do nothing`. Satır kimliği `uuid v5(oturum/sha256)`. Telefona özgü alanlar `metadata`'da: çekim kodu, yer kodu, GPS zamanı, zaman kaynağı, kalite kontrolü |
| Personel cevabı (`measurement`) | `public.measurement`, `source = staff` | Kimlik telefondan; `on conflict (id) do nothing`. Evet/hayır → `value_boolean`; `metric_definition_id` koddan bulunur |
| Sınır işareti fotoğrafı, doğrulama yakın planı (`capture`) | Yakın plan fotoğrafıyla aynı | `tree_id` yok; `metadata.local_kind` `boundary_photo` (`corner_event_id`) ya da `verification_photo` (`slot_id`) |
| Grid rotası (`parcel_route`) | `save_parcel_route(p_id, p_parcel_id, p_session_id, p_route, p_content_hash)` → `public.parcel_route` | Ziyaret satırından sonra, `route` olayından önce kuyruğa girer. Dönen sürüm telefondaki satıra yazılır (başka telefon önce sakladıysa bir üst sürüm olur). `not_found`, `forbidden`, `session_invalid`, `invalid_input` kalıcı hatadır |
| Doğrulama sonucu (`verification_result`) | `record_verification_result(p_item_id, p_tree_present, p_note, p_closeup_capture_id)` | Fotoğraf önce gider (aynı işlemde, önce kuyruğa girer). `item_closed`, `not_found`, `forbidden`, `invalid_input` kalıcı hatadır; nedeni turda sade bir mesajla görünür |

- **Tekrar güvenli:** Bütün kimlikler telefonda üretilir; aynı kaydın ikinci gönderimi hata vermez, yeni satır açmaz. Uygulama yazmayla `markSent` arasında kapansa da sunucuda tek kayıt olur.
- **Hata ve tekrar:** Ağ hatası, zaman aşımı, sunucu 5xx/429 ya da süresi geçmiş giriş *geçicidir*: kayıt kuyrukta kalır (`attempts`, `last_error`), tur durur (sıradaki kayıtlar da aynı sebeple düşer; sıra önemli) ve 2 sn, 4 sn, 8 sn … en çok 5 dk sonra yeniden denenir. Yetki (`42501`), doğrulama (`23xxx`, `22P02`), bilinmeyen ziyaret ya da metrik *kalıcıdır*: kayıt `failed_at` ve sebebiyle işaretlenir, tur sıradakiyle devam eder. Personel "N kayıt sunucuya kabul edilmedi… ofise haber verin" uyarısını görür; **Ayrıntılar**'da sebepler ve **Yeniden dene** (ofis sebebi düzeltince) var.
- **Ne zaman:** uygulama açılınca (giriş yapılmışsa), bağlantı geri gelince (`connectivity_plus`), ziyaret bitince (**Ziyareti bitir**) ve **Şimdi gönder** ile. Bir tur sürerken gelen istek turu bir kez daha döndürür.
- **Fotoğraf dosyası:** yüklemeden önce dosyanın hash'i yeniden hesaplanır (uyuşmazsa yüklenmez, `hash_mismatch`). Dosya telefondan ancak yükleme, `capture` satırı ve nesnenin sunucuda var olduğu kontrolü üçü de başarılı olunca silinir. Kontrol tutmazsa dosya kalır ve kayıt yeniden denenir.
- **Durum:** gönderim kartı kuyruğun tamamını (görevler ekranı) ya da bir ziyaretin kayıtlarını (özet ekranı) sayar.

### Telefonda deneme (uçak modu → çekim → bağlantı → gönderim)

Yerel Supabase'e bağlanarak (yukarıda "Telefonda çalıştırma", 5. adım):

1. Bilgisayarda `pnpm db:start && pnpm db:reset`. Operasyon ekranından (`/operasyon`, `ops@example.com`) örnek parsele bugün için **periyodik** bir ziyaret planla, lider `field@example.com`.
2. Uygulamada `field@example.com` ile giriş yap. Görev listesinde ziyaret "Bugün · Size atanmış" ve yakın plan ağaç sayısıyla görünmeli. Gönderim kartı "Gönderilecek kayıt yok".
3. **Uçak modunu aç.** Listeyi aşağı çek: "Sunucuya ulaşılamadı. Son indirilen liste gösteriliyor" notu çıkmalı, görev yerinde kalmalı.
4. Ziyareti yap (`FAKE_GNSS=true` ile kaydedicisiz): kaydı başlat, QR'lar, bir ağaçta fotoğraflar ve cevaplar, kaydı durdur, **Ziyareti bitir**. Kartta bekleyen sayısı artmalı, durum "İnternet yok ya da zayıf; … yeniden denenecek" olmalı.
5. Uygulamayı kapatıp aç (kuyruk kalıcı): sayılar aynı kalmalı.
6. **Uçak modunu kapat.** Birkaç saniye içinde kendiliğinden göndermeli; kart "Her şey gönderildi", başarısız 0. (Bağlantı olayı kaçarsa **Şimdi gönder**.)
7. Sunucuda kontrol (Studio kapalı; `psql` ya da `docker exec -it supabase_db_orchados psql -U postgres`): ziyaret `captured` ve başlangıç/bitiş dolu; `session_event`, `capture` ve `measurement` (`value_boolean`) satırları; `storage.objects`'te `org/…/parcel/…/<sha256>`. Telefonun `media/` klasöründeki gönderilmiş fotoğraflar silinmiş olmalı.
8. **Kalıcı hata:** Bir ziyaret daha planla, uçak modunda kaydı başlat ve bitir. Bu arada ofiste o ziyareti iptal et. Uçak modunu kapatınca ziyaret kayıtları "Başarısız" sayısına düşmeli (ayrıntıda `visit_cancelled`), uyarı görünmeli ve gönderim takılmadan sürmeli. Olay, fotoğraf ve cevaplar sunucuya yine yazılır: iptal edilen ziyaret satırı silinmez, veri kaybolmaz.

## Kaydediciden konum

Köşe, kapsama izi ve doğrulama turunda yere uzaklık için alıcının konumu gerekir. Firmware 0.2.0'ın durum mesajında (39 bayt) konum yok. Uygulama, durum mesajının sonuna eklenmesi önerilen 12 baytı okur: 39'da `lat_e7`, 43'te `lon_e7`, 47'de `height_mm` (i32, NAV-PVT; toplam 51 bayt, [docs/arayuzler.md](../../docs/arayuzler.md) "BLE protokolü"). Konum yalnızca `gnssFixOK` ve `fix_type` 2–4 iken geçerlidir. Firmware bunu gönderene kadar: köşeler yalnızca GPS zamanıyla kaydedilir ("konum yok"; PPK sonrası ofiste bulunur), kapsama kartı "Kaydediciden konum gelmiyor" der, turda uzaklık yerine "kod ve sıra sayımıyla bulun" yazar. Sahte kaydedici (`FAKE_GNSS`) konumu gönderir.

Telefonun kendi GPS'i kullanılmıyor (bilerek): konum izni, farklı anten ve farklı zaman tabanı demek; tarama kitindeki RTK anteni daha doğru ve PPK ile aynı kaynaktır.

## Doğrulama turu

Ofisin oluşturduğu tur (`kind = verification`) günün görevlerinde ayrı bir tür olarak görünür; kayıt, ön kontrol ve QR yoktur. Sözleşme: [docs/arayuzler.md](../../docs/arayuzler.md), "Doğrulama kalemleri".

- **Sıra:** açık kalemler sıra numarası, pozisyon ve koda göre (S2-4, S2-9, S5-12, S5-12a). Personel bahçede sırayla yürür.
- **Yer tarifi:** "S5 sırasında, güneyden 12. yer". Yön, o sırada pozisyonu en küçük ve en büyük konumlu iki yerden çıkar: pozisyon 1'in bulunduğu uç (8 yön). Sırada iki konumlu yer yoksa "sıra başından". Ara ağaç (S5-12a): "12. ile 13. yer arasında". Boş yerler de sayılır (yer kodları boş yerde de korunur; personele ayrıca yazılır).
- **Uzaklık:** kaydedici konum gönderiyorsa yere uzaklık ve yön ("38 m kuzeydoğuda"; 3 m içinde "Buradasınız"). Telefonun pusulası kullanılmaz: yön kuzeye göredir.
- **Sonuç:** **Ağaç var** / **Ağaç yok** zorunlu; yakın plan isteğe bağlı (aynı kamera ve kalite kontrolü, `verification_closeup`), not isteğe bağlı. Kaydedilince yerel veritabanına ve kuyruğa yazılır, bağlantı varsa hemen gönderilir. Kaydedilmeden çıkılırsa çekilen fotoğrafın dosyası silinir.
- **Aynı kaleme yeniden bakmak:** bakılan kalem açılıp yeniden kaydedilebilir; yeni sonuç sırayla gönderilir, sunucuda en yenisi geçerlidir.
- **Kapatılmış kalem:** ofis kalemi bu arada kapattıysa sunucu `item_closed` der. Kayıt "başarısız" olur, tur ekranında "Gönderilemeyenler" altında "Ofis bu kalemi kapatmış; sonucunuz kaydedilmedi. Gerekirse ofise haber verin." görünür. Diğer nedenler (`not_found`, `forbidden`, `invalid_input`) için de sade mesaj var.
- **Bitiş:** bütün kalemlere bakılınca görev "Tamamlandı" olur; sunucuda tur kendiliğinden `captured` olur (uygulama `session`'a yazmaz). **Turu bitir** gönderimi başlatır.
- **Telefonda tur oturumu:** fotoğrafların bağlanacağı yerel bir `sessions` satırı (`session_type = verification`) açılır; kuyruğa girmez.

## Sınır yürüyüşü ve köşeler

Envanter oturumunda Başlangıç QR'dan sonra **Sınır** adımı açılır. Biçim: [docs/arayuzler.md](../../docs/arayuzler.md), "Sınır köşeleri ve kapsama".

- **Köşe:** her basışta kaydediciye `mark_event(corner, "<n>")` gider ve yerelde `corner` olayı yazılır: basış anının GPS zamanı (`GpsClock`), kaydedicinin son durum mesajındaki konum ve kalite (RTK durumu, yatay doğruluk, uydu sayısı, mesajın GPS zamanı ve yaşı). Mesaj 5 sn'den eskiyse ya da konum yoksa konum boş kalır; köşe yine kaydedilir. `n` oturumda tekildir (silinen numara yeniden kullanılmaz).
- **Düzeltme:** köşe sırası yukarı/aşağı oklarla değişir; yalnızca listenin son köşesi silinebilir (onaylı). Her köşeye sınır işareti (sınır taşı, çit, duvar, yol, komşu bahçe, diğer), not ve fotoğraf (`boundary_marker`, kalite kontrollü) eklenebilir.
- **Kayıt:** her düzenleme `boundary_corners` olayıdır ve listenin tamamını taşır (fotoğraf aynı işlemde). Olay tablosu ekleme-yalnızdır; en yeni liste geçerlidir. Köşelerin kesin konumu işleme hattında PPK yörüngesinden GPS zamanıyla bulunur; sınır sürümünü (`boundary`) ofis ya da hat oluşturur. Uygulama `boundary`'ye yazmaz.
- **Poligon ve alan:** konumlu köşelerden (en az 3) çizilen yaklaşık poligon ve alanı (m² ve dönüm; yerel düzlemde shoelace). Kesişen poligon (yanlış sıra) küçük ya da sıfır alan verir: sıra düzeltilince alan doğru çıkar. Özet ekranında köşe sayısı ve alan.

## Kapsama

Kayıt başlayınca oturum ekranında kapsama kartı açılır:

- **Harita:** parselin sınırı (sunucudaki son sürüm; yoksa bu oturumun köşeleri), yerler (kapsanan yeşil, diğerleri gri), personelin izi (turuncu) ve son konum (mavi). İz kaydedicinin durum mesajlarındaki konumlardan çizilir (yaklaşık 1 Hz, 0,5 m'den kısa adımlar atlanır, 10 sn'den uzun boşluk ya da 30 m'den büyük sıçrama birleştirilmez).
- **Kural:** iz bir yerin 4 m yakınından geçtiyse yer kapsanmıştır. İzin her parçası sıra doğrultusuna göre sınıflanır: ±30° içinde "sıra boyunca", dikmeye ±30° içinde "dik". Bir sıranın yerlerinin %95'i sıra boyunca geçişle kapsandıysa sıra, bir pozisyon numarasının yerleri dik geçişle kapsandıysa dik koridor biter. Kartta "Sıra boyunca: 4 / 10 sıra" ve "Dik koridorlar: 3 / 22" ile koridor kutucukları (yeşil bitti, sarı kısmen, gri hiç) görünür.
- **Oran:** "Yerlerin %62'sinin 4 m yakınından geçildi." %95'in altında uyarı. Yer konumu yoksa yalnızca iz ve uzunluğu.
- **Kayıt:** kayıt durdurulurken (kaydediciden en az bir konum geldiyse) `coverage` olayı yazılır: oran, biten sıra ve dik koridorlar, kaçırılan yer kodları, iz uzunluğu. Özet ekranı bunu okur. İz noktaları telefonda yalnızca bellekte tutulur (ham GNSS SD kartla gelir).
- **Harita paketi yok:** çizim `CustomPainter` ile, kuzey yukarı, ölçek çubuğuyla; altlık (uydu/OSM karoları) yok. Böylece internet olmadan aynı çalışır ve lisans gerekmez. Altlık istenirse `flutter_map` (BSD-3) ve çevrimdışı karo paketi eklenebilir; OSM karolarının kullanım koşulları toplu indirmeye izin vermediği için kendi karo kaynağı gerekir.

## Rota

MVP Modül 3: her parselin sabit bir grid rotası vardır; önce sıra boyunca bütün koridorlar, sonra dik koridorlar, en son kenarlar. Biçim ve saklama: [docs/arayuzler.md](../../docs/arayuzler.md), "Grid rotası".

**Üretim** (`lib/features/route/grid_route.dart`, saf Dart, `grid-route-v1`). Hesap, sıra yönüne döndürülmüş yerel düzlemde yapılır (`u` sıra boyunca, `v` sıralara dik).

- **Sıra yönü**, öncelik sırasıyla: konumlu yerler (her sıranın ilk ve son yerinden ortalama yön), `parcel.row_azimuth_deg`, personelin haritada iki dokunuşla belirlediği yön, sınırın en uzun kenarı (tahmin).
- **Envanter sonrası** (aynı sırada en az iki konumlu yer): her sıranın çizgisi o sıranın yerlerinin medyanından; ara ağaçlar (S5-12a) dışarıda. Sıra aralığı komşu sıra çizgileri arasındaki farkların medyanı, ağaç aralığı pozisyon adımı başına fark (eksik yer iki adım sayılır). Sıra boyu koridorlar iki komşu sıranın tam ortasından (tek sıra varsa iki yanından), uç ağaçların `max(ağaç aralığı / 2, 4 m)` ötesine kadar. Dik koridorlar pozisyon çiftlerinin (1–2, 3–4, …) ortasından: iki pozisyon da kapsama yarıçapında (4 m) kaldıkça bir koridor iki pozisyona yeter, yoksa her aralığa bir koridor; tek kalan son pozisyon son aralığı paylaşır. Eksik ve ara ağaçlar koridorları kaydırmaz.
- **Envanter öncesi** (ilk tarama): sınır (sunucudaki son sürüm, yoksa bu oturumun köşeleri) ve sıra yönü. Aralık `sqrt(alan / parcel.estimated_tree_count)` (4–12 m), bilinmiyorsa 8 m. Sıra boyu koridorlar kenardan bir aralık içeriden başlayıp her aralıkta bir; dik koridorlar iki aralıkta bir.
- **Kırpma:** her koridor sınırın içinde kalan en uzun parçasıdır, sınırdan 1,5 m içeride biter; 2 m'den kısa olanlar atılır. Sınır yoksa yerlerin çevresindeki dikdörtgen kullanılır.
- **Kenarlar:** sınır 1,5 m içeri alınır ve 30°'den keskin dönen köşelerden kenar koridorlarına bölünür (eğri bir sınır çoklu çizgi olur).
- **Sıra (serpantin):** başlangıç köşesi `parcel.numbering_origin_corner` (yoksa güneybatı). Sıra boyu koridorlar o köşeye yakın taraftan başlar, her koridora bir öncekinin bittiği uca yakın uçtan girilir (gidiş-dönüş); dikler son sıra boyu koridorun bittiği taraftan, kenarlar son dik koridorun bitişine en yakın köşeden ve oradan yakın olan yönde.
- **Sabitlik:** girdi sırası (yerlerin sırası, sınırın başlangıç köşesi ve yönü) sonucu değiştirmez; koordinatlar 1e-7°'ye, ölçüler 0,01 m'ye yuvarlanır; aynı girdi aynı JSON ve aynı SHA-256'yı verir.

**Hangi rota** (`route_store.dart`): kayıt başlarken parselin en yeni rotası (sunucudan indirilen ya da bu telefonda oluşturulup henüz gönderilmemiş) aynen kullanılır. İstisna: o rota envanterden önce sınırdan üretildiyse ve parselde artık konumlu yerler varsa yeni (envanter) rota üretilir. Rota yoksa üretilir ve bir sonraki sürüm olarak saklanır. Sıra yönü yer konumlarından ya da parsel kaydından geliyorsa rota hemen kullanılır; tahmin ya da personel yönüyse rota kesik çizgiyle **öneri** olarak çizilir, personel **Yönü düzelt** (haritada aynı sıranın iki ucuna dokunur) ve **Rotayı kullan** der. Kullanılmaya başlanan rota `route` olayıyla kaydedilir; ziyaret boyunca değişmez (yeni köşe eklense de).

**Rota kartı** (oturum ekranı):

- Sıradaki koridor ("4. S3 ile S4 arası", türü), "3 / 24 koridor bitti · 1 atlandı", parselin rota sürümü.
- Koridora girmeden: başlangıcına uzaklık ve yön ("Koridorun başına 38 m, kuzeydoğuda"; 3 m içinde "başındasınız"). Koridorda: yürünen oran. Başladıktan sonra koridordan 6 m'den fazla uzaklaşınca kırmızı uyarı ("Koridordan 9 m saptınız").
- Kalan koridor sayısı, mesafe (kalan koridorlar ve aralarındaki geçişler) ve süre (1,2 m/sn).
- **Atla** (koridor "atlandı" olur, sıradakine geçilir) ve **Önceki koridor** (bir öncekine dönülür, o koridor baştan sayılır). Atlananlar ziyaret özetinde listelenir.
- **Harita:** kapsama haritasının üstünde koridorlar: sıradaki kalın mavi, bitenler soluk yeşil, atlananlar kesik kırmızı, kalanlar ince.
- **Koridor bitti:** koridorun %95'i, koridora 4 m'den yakın konumlarla (her iki yönde) yüründüyse. 30 m'den büyük sıçramanın arası sayılmaz. Yalnızca sıradaki koridor izlenir.
- **Dur-çek-yürü** (taşlı bölümler): anahtar açılınca her 4 m yürüyüşte bip (Android `ToneGenerator`, `MainActivity`'deki `orchados/beep` kanalı, ses paketi yok) ve titreşim; kartta 2 sn "DUR", sonra "Yürü · sonraki bip 1,6 m". 0,3 m'den kısa adımlar (yerinde GNSS gürültüsü) sayılmaz. Anahtar kapatılabilir.
- **Kayıt:** kayıt durdurulurken `route_progress` olayı (biten, atlanan, kalan koridorlar).

### Rotayı telefonda deneme

**Sunucusuz** (`flutter run --dart-define=FAKE_GNSS=true --dart-define=FAKE_CAMERA=true`):

1. "Kızılburç P-12 · Periyodik ziyaret" → ön kontrol → **Kaydı başlat**. Rota kartı "1. S1 ile S2 arası" ve başlangıca uzaklık göstermeli; haritada 9 sıra boyu, 11 dik, 4 kenar koridoru, ilki kalın mavi. Sahte kaydedici koridorlarda yürüdükçe ilk koridor soluklaşmalı, sayaç "1 / 24 koridor bitti" olmalı. (Sahte yürüyüş rotadan farklı bir sıra izler; arada sapma uyarısı görmek normal.)
2. **Atla** → sıradaki koridor değişir, haritada atlanan kesik kırmızı; **Önceki koridor** → geri döner.
3. **Dur-çek-yürü**'yü aç: her 4 m'de bip ve "DUR". Kapat: bip durur.
4. Bitiş QR → durdur → özette "Rota … koridor" ve atlananlar.
5. Bu telefonda oluşturulan rota `parcel_routes`'ta kalır; aynı parselin sonraki ziyaretleri onu kullanır (sunucusuz ikinci ziyaret için aşağıdaki yerel Supabase adımı).
6. **Envanter öncesi:** "Yukarıbayır P-31 · Envanter" → başlat → kartta "Rota için parselin sınırı gerekli". Sınır adımında 4 köşe işaretle: rota kesik çizgiyle öneri olarak çıkar. **Yönü düzelt** → haritada bir sıranın iki ucuna dokun → çizgiler döner → **Rotayı kullan**.

**Yerel Supabase'e karşı** (`pnpm db:start && pnpm db:reset`, yukarıda "Telefonda çalıştırma", 5. adım): örnek parsele iki periyodik ziyaret planla. Birincisini yap ve gönder: `parcel_route`'ta sürüm 1 ve `session_event`'te `route` ile `route_progress` satırları olmalı. Listeyi yenile, ikinci ziyareti başlat: aynı rota ("sürüm 1") gelmeli; başka bir telefonda da aynısı.

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

`flutter test` (186 test; üç entegrasyon testi ortam değişkeni yoksa atlanır):

- `test/unit/gnss_protocol_test.dart`: firmware README'sindeki üç komut örneği (`01 07 03 53 2D 31 04 50 2D 31 32` vb.) bayt bayt kodlama ve çözme; firmware birim testindeki 31 baytlık durum vektörü ve 0.2.0'ın 39 baytlık `gps_time_ns`'li biçimi; varsayılan durum; kısa/yanlış sürüm mesajları; sona eklenmiş alanlar; geçersiz argümanlar ve firmware'in sonuç kodları.
- `test/unit/qr_payload_test.dart`: işleme hattı README örneği (`OQ1:1476435618200:synth-00`), etiket kuralları.
- `test/unit/gps_clock_test.dart`: GPS–UTC dönüşümü (kaydedici `session.json` örneği), saat farkı, medyan, eski örnekler, telefon saatine düşme.
- `test/unit/outbox_test.dart`: kuyruğa ekleme sırası, `recordAttempt` (geçici hata, kuyrukta kalır), `markSent`, `markFailed` (kalıcı hata, kuyruktan çıkar) ve `requeueFailed`, toplam ve ziyaret bazlı sayılar, bekleyen sayısı akışı, başarısız işlemde geri alma, veri modeli alanları.
- `test/unit/gnss_logger_test.dart`: sahte kaydediciyle komut yaşam döngüsü, sıra numarası, zaman aşımı, SD yok.
- `test/widget/session_screen_test.dart`: envanter oturumu baştan sona (başlat, QR ve `qr_sync` değerinin ekrandakiyle aynı olması, köşeler, durdur, yerel olaylar), GPS zamanı yokken telefon saati işareti, başlatma hatası, ön kontrol.
- `test/unit/photo_quality_test.dart`: testte üretilen sentetik görüntülerle netlik (net/hafif bulanık/bulanık, 480 ve 1440 piksel), pozlama (karanlık/loş/normal/aşırı), kırpılmış piksel oranları, eşik kuralları, bulgu sırası, okunamayan dosya, küçültme, isolate ile aynı sonuç. Repoya görüntü eklenmez.
- `test/unit/database_migration_test.dart`: şema 1 veritabanının 3'e geçişi (eski fotoğraf satırı korunur, `qc_*` boş; eski cevap `value_boolean`'da; kuyruk satırı bekliyor; görev önbelleği boş).
- `test/unit/sync_worker_test.dart` (sahte sunucu `test/support/fake_sync_server.dart`): kuyruk sırası ve satır eşlemeleri (ziyaret, olay, dosya yolu, `capture`, `value_boolean`), her şeyin yeniden gönderiminde sunucuda yeni satır olmaması, ağ hatasında durma ve artan bekleme (2 → 4 sn), bekleme sınırı, kalıcı hatada işaretleme ve kuyruğun devamı, **Yeniden dene**, bilinmeyen/iptal edilmiş ziyaret ve bilinmeyen metrik, işlenmiş ziyaret, süren kayıt, doğrulanmadan silinmeyen fotoğraf, hash uyuşmazlığı, uygulama kapanıp açılınca kaldığı yerden devam, tur sürerken gelen istek.
- `test/unit/supabase_sync_server_test.dart`: Supabase hatalarının geçici/kalıcı ayrımı.
- `test/unit/task_repository_test.dart`: görevlerin önbelleğe yazılması, çevrimdışı son liste, başka kullanıcı, JSON, mevsim, yakın plan seçimi (işaretliler önce, %10 örneklem, aynı ziyarette aynı liste).
- `test/widget/sync_status_test.dart`: gönderim kartı (sayılar, durum satırı), açılışta çevrimdışı → **Şimdi gönder** → "Her şey gönderildi", kalıcı hata uyarısı, ayrıntılar ve yeniden deneme, bağlantı gelince gönderim, sunucu yokken kapalı düğme, ziyaret kartı.
- `test/widget/today_screen_test.dart`: sunucudan görev ("Bugün · Size atanmış"), çevrimdışı not ve son liste.
- `test/widget/session_screen_test.dart` ayrıca: planlanmış ziyaretin kimliğiyle kayıt (kaydediciye de o gider), aynı ziyaretin ikinci kez başlatılamaması.
- `test/integration/supabase_sync_test.dart`: yerel Supabase'de ops bugün için bir ziyaret planlar; `field@example.com` görevleri indirir, ziyareti telefonda kaydeder ve gönderir; ziyaret `captured`, olay, fotoğraf (dosya baytları aynı), iki cevap `value_boolean` ile; her şey ikinci kez gönderilince satır sayısı değişmez. Çalıştırma: `ORCHADOS_TEST_SUPABASE_URL=http://127.0.0.1:54321 ORCHADOS_TEST_SUPABASE_KEY=<pnpm db:status'taki publishable anahtar> flutter test test/integration`. Her çalıştırma yeni bir ziyaret ve satırlar bırakır (ekleme-yalnız tablolar); ardından `pnpm db:test` çalıştırılacaksa önce `pnpm db:reset`.
- `test/widget/capture_flow_test.dart`: sahte kamerayla çekim ekranı (referans görsel yeri, yönerge, odak dokunuşu, galeri yok, geri dönünce kayıt yok); ret → yeniden çek → ret → kabul, yalnızca kabul edilen dosyanın yazılması; uyarının kabulü ve veritabanına yazılması; çekim zamanının `GpsClock`'tan gelmesi ve telefon saati işareti; izin reddi ve tekrar deneme; kalıcı ret, ayarlar ve geri dönüş; arka plana geçişte kameranın bırakılması.
- `test/widget/closeup_flow_test.dart`: yakın plan akışı (fotoğraf, yeniden çekim, cevaplar, kayıt, hash doğrulaması, kalite sonucu, kuyruk, özet).
- `test/unit/outbox_test.dart` ayrıca: fotoğraf satırında kalite alanları ve sürüm; reddedilmiş fotoğrafın kaydedilememesi.
- `test/widget/login_flow_test.dart`: giriş ve görev listesi.
- `test/unit/route_hint_test.dart`: yer tarifi (güneyden/kuzeyden/doğudan sayım, ara ağaç, konumsuz sıra), uzaklık ve yön, yürüme sırası, doğrulama görevinin JSON'u.
- `test/unit/verification_sync_test.dart`: tur oturumunun kuyruğa girmemesi, fotoğraflı sonuçta önce `capture` sonra fonksiyon çağrısı ve `p_closeup_capture_id`, notsuz/fotoğrafsız sonuç, aynı kaleme iki sonuç, `item_closed` kalıcı hatası ve nedeninin tura ulaşması, fonksiyon hatalarının sınıflanması.
- `test/widget/verification_tour_test.dart`: tur akışı (sıra, tarif, konum gelince uzaklık; ağaç var + fotoğraf + not, ağaç yok, üçüncü kalem, "Bütün kalemlere bakıldı", **Turu bitir**), çevrimdışı bekleme ve kapatılmış kalem mesajı, görev listesinde tur türü.
- `test/unit/boundary_corners_test.dart`: poligon alanı (dikdörtgen, üçgen, m²/dönüm, etiket), köşe listesi (taşıma, son köşeyi silme, tekil numara), düzenleme olayının JSON'u, durum mesajından köşe konumu (taze, eski, konumsuz, fix yok; 51 baytlık mesaj), olaylardan listeyi yeniden kurma ve sunucu satırı.
- `test/widget/boundary_test.dart`: köşe işaretleme (4 köşe, yanlış sıra → sıfır alan, sıra düzeltme → 1 000 m², beşinci köşeyi silme, sınır işareti + fotoğraf + not, yerel olaylar ve fotoğraf satırı, özet), konum bloğu olmayan kaydediciyle köşe.
- `test/unit/coverage_test.dart`: kapsama kuralı (bütün sıra koridorları, dik koridorlar, 3,9/4,1 m sınırı, zaman boşluğu ve sıçrama, yerinde durma, yer konumu yokken iz, olay verisi, Türkçe yüzde ekleri).
- `test/widget/coverage_test.dart`: kapsama göstergesi (harita katmanları, oran cümlesi, uyarı, sıra ve dik koridor sayıları, durduktan sonra iz eklenmemesi, `coverage` olayı, özetteki oran ve kaçırılan yerler), konumsuz kaydedici.
- `test/unit/grid_route_test.dart`: rota üretimi: dikdörtgen parsel (koridor sırası ve konumları, serpantin, kırpma, kenarlar), döndürülmüş parsel (32°), eksik ve ara ağaçlı sıralar (koridorlar kaymaz), sınırsız envanter, tek sayıda pozisyon, başlangıç köşesi; envanter öncesi (parsel kaydından yön, ağaç sayısından aralık; yön yokken sınırın en uzun kenarı, personelin iki dokunuşu; öncelik sırası; oturumda yürünen sınır; alan yok); sabitlik (aynı girdi aynı JSON ve hash, yer sırası ve sınır başlangıcından bağımsız, JSON gidiş-dönüş).
- `test/unit/route_guide_test.dart`: başlangıca uzaklık ve yön, kalan mesafe ve süre, koridor bitince sıradaki (serpantin), yürünen oran, sapma uyarısı (5 m yok, 9 m var), ters yönde yürüme, başka koridorda yürüme, atla ve geri (sayaçlar, bitiş, sondan geri), sıçrama; dur-çek-yürü (4 m'de bip, yerinde durma, sıçrama, sıfırlama).
- `test/unit/route_store_test.dart`: rota kimliği, hangi rotanın kullanılacağı (envanter rotası kalır, sınır rotası envanterden sonra değişir), sunucu/telefon en yenisi, görev önbelleğinde rota; yerel kayıt, `route` olayı, kuyruk sırası, `save_parcel_route` ve sunucunun verdiği sürüm, tekrar gönderim, kalıcı hata.
- `test/widget/route_test.dart`: rota kartı ve haritadaki koridorlar, koridoru yürüyünce sıradaki, sapma uyarısı, atla/geri, `route_progress` ve özette atlananlar; dur-çek-yürü (bip, "DUR", kapatma); ilk envanter (sınır gelince öneri, iki dokunuşla yön, **Rotayı kullan**, sonra sabit); saklı rotanın aynen kullanılması; ilk rotanın saklanıp aynı telefondaki ikinci ziyarette kullanılması; sınırdan üretilmiş rotanın envanterden sonra yeni sürümle değişmesi.
- `test/integration/route_supabase_test.dart`: yerel Supabase'de ziyaret, rota saklama (`save_parcel_route`), `route` olayı ve sonraki ziyaretin aynı rotayı indirmesi.
- `test/integration/verification_supabase_test.dart`: yerel Supabase'de ops bir tur açar; saha kullanıcısı turu indirir (kalemler, nedenler, GeoJSON yer konumları), ofis bir kalemi kapatır, personel üçüne bakar (biri fotoğraflı); iki sonuç ve fotoğraf yazılır, kapatılmış kalem `item_closed` ile reddedilir, tur `captured` olur.

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

### Kaydediciden konum

Köşe, kapsama izi ve doğrulama turunda yere uzaklık için alıcının konumu gerekir. Firmware 0.2.0'ın durum mesajında (39 bayt) konum yok. Uygulama, durum mesajının sonuna eklenmesi önerilen 12 baytı okur: 39'da `lat_e7`, 43'te `lon_e7`, 47'de `height_mm` (i32, NAV-PVT; toplam 51 bayt, [docs/arayuzler.md](../../docs/arayuzler.md) "BLE protokolü"). Konum yalnızca `gnssFixOK` ve `fix_type` 2–4 iken geçerlidir. Firmware bunu gönderene kadar: köşeler yalnızca GPS zamanıyla kaydedilir ("konum yok"; PPK sonrası ofiste bulunur), kapsama kartı "Kaydediciden konum gelmiyor" der, turda uzaklık yerine "kod ve sıra sayımıyla bulun" yazar. Sahte kaydedici (`FAKE_GNSS`) konumu gönderir.

Telefonun kendi GPS'i kullanılmıyor (bilerek): konum izni, farklı anten ve farklı zaman tabanı demek; tarama kitindeki RTK anteni daha doğru ve PPK ile aynı kaynaktır.

## Doğrulama turu

Ofisin oluşturduğu tur (`kind = verification`) günün görevlerinde ayrı bir tür olarak görünür; kayıt, ön kontrol ve QR yoktur. Sözleşme: [docs/arayuzler.md](../../docs/arayuzler.md), "Doğrulama kalemleri".

- **Sıra:** açık kalemler sıra numarası, pozisyon ve koda göre (S2-4, S2-9, S5-12, S5-12a). Personel bahçede sırayla yürür.
- **Yer tarifi:** "S5 sırasında, güneyden 12. yer". Yön, o sırada pozisyonu en küçük ve en büyük konumlu iki yerden çıkar: pozisyon 1'in bulunduğu uç (8 yön). Sırada iki konumlu yer yoksa "sıra başından". Ara ağaç (S5-12a): "12. ile 13. yer arasında". Boş yerler de sayılır (yer kodları boş yerde de korunur; personele ayrıca yazılır).
- **Uzaklık:** kaydedici konum gönderiyorsa yere uzaklık ve yön ("38 m kuzeydoğuda"; 3 m içinde "Buradasınız"). Telefonun pusulası kullanılmaz: yön kuzeye göredir.
- **Sonuç:** **Ağaç var** / **Ağaç yok** zorunlu; yakın plan isteğe bağlı (aynı kamera ve kalite kontrolü, `verification_closeup`), not isteğe bağlı. Kaydedilince yerel veritabanına ve kuyruğa yazılır, bağlantı varsa hemen gönderilir. Kaydedilmeden çıkılırsa çekilen fotoğrafın dosyası silinir.
- **Aynı kaleme yeniden bakmak:** bakılan kalem açılıp yeniden kaydedilebilir; yeni sonuç sırayla gönderilir, sunucuda en yenisi geçerlidir.
- **Kapatılmış kalem:** ofis kalemi bu arada kapattıysa sunucu `item_closed` der. Kayıt "başarısız" olur, tur ekranında "Gönderilemeyenler" altında "Ofis bu kalemi kapatmış; sonucunuz kaydedilmedi. Gerekirse ofise haber verin." görünür. Diğer nedenler (`not_found`, `forbidden`, `invalid_input`) için de sade mesaj var.
- **Bitiş:** bütün kalemlere bakılınca görev "Tamamlandı" olur; sunucuda tur kendiliğinden `captured` olur (uygulama `session`'a yazmaz). **Turu bitir** gönderimi başlatır.
- **Telefonda tur oturumu:** fotoğrafların bağlanacağı yerel bir `sessions` satırı (`session_type = verification`) açılır; kuyruğa girmez.

## Sınır yürüyüşü ve köşeler

Envanter oturumunda Başlangıç QR'dan sonra **Sınır** adımı açılır. Biçim: [docs/arayuzler.md](../../docs/arayuzler.md), "Sınır köşeleri ve kapsama".

- **Köşe:** her basışta kaydediciye `mark_event(corner, "<n>")` gider ve yerelde `corner` olayı yazılır: basış anının GPS zamanı (`GpsClock`), kaydedicinin son durum mesajındaki konum ve kalite (RTK durumu, yatay doğruluk, uydu sayısı, mesajın GPS zamanı ve yaşı). Mesaj 5 sn'den eskiyse ya da konum yoksa konum boş kalır; köşe yine kaydedilir. `n` oturumda tekildir (silinen numara yeniden kullanılmaz).
- **Düzeltme:** köşe sırası yukarı/aşağı oklarla değişir; yalnızca listenin son köşesi silinebilir (onaylı). Her köşeye sınır işareti (sınır taşı, çit, duvar, yol, komşu bahçe, diğer), not ve fotoğraf (`boundary_marker`, kalite kontrollü) eklenebilir.
- **Kayıt:** her düzenleme `boundary_corners` olayıdır ve listenin tamamını taşır (fotoğraf aynı işlemde). Olay tablosu ekleme-yalnızdır; en yeni liste geçerlidir. Köşelerin kesin konumu işleme hattında PPK yörüngesinden GPS zamanıyla bulunur; sınır sürümünü (`boundary`) ofis ya da hat oluşturur. Uygulama `boundary`'ye yazmaz.
- **Poligon ve alan:** konumlu köşelerden (en az 3) çizilen yaklaşık poligon ve alanı (m² ve dönüm; yerel düzlemde shoelace). Kesişen poligon (yanlış sıra) küçük ya da sıfır alan verir: sıra düzeltilince alan doğru çıkar. Özet ekranında köşe sayısı ve alan.

## Kapsama

Kayıt başlayınca oturum ekranında kapsama kartı açılır:

- **Harita:** parselin sınırı (sunucudaki son sürüm; yoksa bu oturumun köşeleri), yerler (kapsanan yeşil, diğerleri gri), personelin izi (turuncu) ve son konum (mavi). İz kaydedicinin durum mesajlarındaki konumlardan çizilir (yaklaşık 1 Hz, 0,5 m'den kısa adımlar atlanır, 10 sn'den uzun boşluk ya da 30 m'den büyük sıçrama birleştirilmez).
- **Kural:** iz bir yerin 4 m yakınından geçtiyse yer kapsanmıştır. İzin her parçası sıra doğrultusuna göre sınıflanır: ±30° içinde "sıra boyunca", dikmeye ±30° içinde "dik". Bir sıranın yerlerinin %95'i sıra boyunca geçişle kapsandıysa sıra, bir pozisyon numarasının yerleri dik geçişle kapsandıysa dik koridor biter. Kartta "Sıra boyunca: 4 / 10 sıra" ve "Dik koridorlar: 3 / 22" ile koridor kutucukları (yeşil bitti, sarı kısmen, gri hiç) görünür.
- **Oran:** "Yerlerin %62'sinin 4 m yakınından geçildi." %95'in altında uyarı. Yer konumu yoksa yalnızca iz ve uzunluğu.
- **Kayıt:** kayıt durdurulurken (kaydediciden en az bir konum geldiyse) `coverage` olayı yazılır: oran, biten sıra ve dik koridorlar, kaçırılan yer kodları, iz uzunluğu. Özet ekranı bunu okur. İz noktaları telefonda yalnızca bellekte tutulur (ham GNSS SD kartla gelir).
- **Harita paketi yok:** çizim `CustomPainter` ile, kuzey yukarı, ölçek çubuğuyla; altlık (uydu/OSM karoları) yok. Böylece internet olmadan aynı çalışır ve lisans gerekmez. Altlık istenirse `flutter_map` (BSD-3) ve çevrimdışı karo paketi eklenebilir; OSM karolarının kullanım koşulları toplu indirmeye izin vermediği için kendi karo kaynağı gerekir.

## Kamera ve kalite kontrolünü telefonda deneme

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

### Envanteri telefonda deneme (doğrulama turu, köşeler, kapsama)

**Sunucusuz** (`flutter run --dart-define=FAKE_GNSS=true --dart-define=FAKE_CAMERA=true`): örnek görevlerle.

1. **Doğrulama turu:** "Kızılburç P-12 · Doğrulama turu"na gir. 3 kalem S2-4, S2-9, S5-12 sırasıyla görünmeli; S2-4'te "S2 sırasında, güneyden 4. yer", "Boş yer · Fidan olabilir" ve ofisin notu. **Kaydediciye bağlan**: sahte kaydedici örnek parselde yürür, kalemlerde uzaklık ve yön çıkar, yürüdükçe değişir. S2-4'te **Ağaç var**, yakın plan çek, not yaz, **Kaydet**: kalem "Bakılanlar"a geçer ("gönderilecek": sunucu yok). Diğer ikisini de kaydet: "Bütün kalemlere bakıldı".
2. **Kapsama:** "Kızılburç P-12 · Periyodik ziyaret" → ön kontrol → **Kaydı başlat**. Kapsama kartında harita, yerler ve büyüyen iz; birkaç dakika sonra ilk sıra "S1" yeşil olmalı. Bitiş QR → durdur → özette "Yerlerin %…'ının 4 m yakınından geçildi" ve %95 altında uyarı.
3. **Köşeler:** "Yukarıbayır P-31 · Envanter" → başlat → Başlangıç QR → **Sınır**. Sahte kaydedici yürürken 4–5 kez **Köşe**'ye bas (arada birkaç saniye bekle). Poligon ve alan çıkmalı; bir köşeyi yukarı taşı (alan değişir), son köşeyi sil, bir köşeye "Sınır taşı" + fotoğraf + not ekle.

**Yerel Supabase'e karşı** (yukarıda "Telefonda çalıştırma", 5. adım; `pnpm db:start && pnpm db:reset`):

4. Ofis aracında (`/ofis/parsel/<parsel>/envanter`, `ops@example.com`) örnek parsel için doğrulama listesinden bugün tarihli bir tur oluştur ya da `psql` ile: `select create_verification_tour('c0000000-0000-4000-8000-000000000001', '[{"slot_id": "<slot>", "reasons": ["unsure"]}]', current_date);` (ops kullanıcısıyla).
5. Uygulamada `field@example.com` ile giriş: tur "Doğrulama turu" olarak, kalem sayısıyla görünmeli. **Uçak modunda** bir kaleme bak ve kaydet: "gönderilecek". Bu arada ofiste o kalemi kapat (`close_verification_item`). Uçak modunu kapat: kalem "Gönderilemeyenler" altında "Ofis bu kalemi kapatmış…" mesajıyla görünmeli. Diğer kalemler sunucuda `checked`, yakın plan `closeup_capture_id` dolu; bütün kalemler bakılınca tur `captured`.
6. Envanter ziyareti planla, köşeleri işaretle, ziyareti bitir: `session_event`'te `corner` (data'da konum ve kalite; firmware konum göndermiyorsa `position: null`), `boundary_corners` ve (konum geldiyse) `coverage` satırları olmalı.

**Test APK'sı:** `main`'deki her derlemede CI, Supabase test projesine bağlı ikinci bir APK üretir (`orchados-saha-test-apk`; adres ve publishable anahtar depo secret'larından: `SUPABASE_URL`, `SUPABASE_ANON_KEY`). Bu APK'da sahte kaydedici yoktur; gerçek kaydediciyle ya da konumsuz denenir.

## Bilinen eksikler

- **Kalite eşikleri sentetik verilerle ayarlandı;** gerçek fotoğraflarla yeniden ayar gerekir (yukarıda).
- **Gerçek kamera (`PluginFieldCamera`) testlerle kapsanmıyor** ve cihazda denenmedi. Önizleme oranı dikey kullanıma göre (`1 / aspectRatio`) ayarlandı; yatay kullanım kilitli değil.
- **Kalite kontrolü süresi:** 1080p JPEG'in saf Dart ile çözülmesi telefonda yaklaşık birkaç yüz ms sürer (ölçülmedi). Daha yüksek çözünürlükte süre artar.
- **Referans görseller** hâlâ yer tutucu (İP10).
- **Senkronizasyon telefonda denenmedi;** sahte sunucu ve yerel Supabase'e karşı testlerle doğrulandı. Büyük ziyarette (yüzlerce fotoğraf) süre ölçülmedi; fotoğraflar tek tek yüklenir.
- **Cevap–fotoğraf bağı sunucuda yok:** `measurement_evidence` yalnızca `asset`'e bağlanabiliyor; cevap ile fotoğraf sunucuda aynı oturum ve ağaçla eşleşir. Kanıt listesi telefonda (`evidence_json`) kalıyor.
- **Kaydedici konum göndermiyor (firmware 0.2.0):** köşe konumu, kapsama ve turda uzaklık, durum mesajına önerilen konum bloğu gelene kadar yalnızca sahte kaydedicide çalışır (yukarıda, "Kaydediciden konum").
- **Köşeleri işleme hattı henüz okumuyor:** `corner` / `boundary_corners` olaylarından PPK konumuyla `boundary` sürümü oluşturmak sonraki iş (İP4 / ofis). O zamana kadar sınır ofiste çizilir.
- **Kapsama telefonda yaklaşık:** PPK öncesi konum ve basit 4 m kuralı; panoramaların kalitesi ve gerçek görüş hesaba katılmaz. İz noktaları kalıcı değil: uygulama kayıt sırasında kapanırsa kapsama sıfırdan başlar (zaten oturum da yeniden başlatılamıyor).
- **Doğrulama turunda pusula yok:** yön kuzeye göre yazılır; telefonun baktığı yöne göre ok gösterilmiyor.
- **Aynı ziyaret aynı telefonda bir kez kaydedilir.** Kayıt yarıda kalırsa (telefon kapandı) yeniden başlatmak için ofisin yeni ziyaret planlaması gerekir.
- **Harita altlığı yok** (MVP Modül 3). Kapsama ve rota haritası vektör çizimdir.
- **Rota:** sıra yönü ve aralığı envanter öncesi tahmindir; personel yönü düzeltebilir ama aralığı değiştiremez. Sapma ve koridor bitişi PPK öncesi konumla yaklaşıktır. Kenar koridorları sınırı 1,5 m içeriden izler; çit, ağaç ya da kuyu gibi engeller bilinmez. Rota ziyaret ortasında değiştirilemez; yanlış bir rota sürümü ancak ofis yeni bir sürüm eklerse (henüz arayüzü yok) düzelir. Sahte kaydedicinin yürüyüşü rotayı izlemez. Bip sesi `ToneGenerator` ile; cihazda denenmedi.
- **Sesli not, hava durumu, ekipman seri numaraları** ziyaret kaydına henüz eklenmedi.
- **Ekran parlaklığı:** QR ekranında parlaklık otomatik artırılmıyor.
- **flutter_blue_plus lisansı:** paket kişisel, kâr amacı gütmeyen ve eğitim kullanımında ücretsiz; ticari kullanım için ücretli lisans gerekir. Kod `License.nonprofit` ile derleniyor (`flutter_blue_gnss_logger.dart`). Ticari kullanıma geçmeden önce lisans alınmalı ya da BLE paketi değiştirilmeli (yalnızca `FlutterBlueGnssLogger` değişir).
- Gerçek BLE uygulaması (`FlutterBlueGnssLogger`) testlerle kapsanmıyor; cihazla denenmedi. Bağlantı koparsa otomatik yeniden bağlanma yok, personel tekrar **Bağlan**'a basar (kaydedici kayda devam eder).
