# İP6 – Çevrimdışı Senkronizasyon ve Açık İşler

- **Klasör:** `apps/field/`. İstisnalar:
    - **Şema:** Gerekirse `supabase/migrations/20261020150xxx_*.sql` ve `supabase/tests/13_*.test.sql`. Bu ad aralığının dışına çıkma; seed'i değiştirme. Migration eklersen `pnpm web:typegen` ile `apps/web/src/lib/database.types.ts`'yi yeniden üret ve commit'le (web'in başka dosyasına dokunma).
    - `docs/arayuzler.md`: Saha uygulaması ile veritabanı arasındaki eşlemeyi anlatan bir bölüm eklenebilir.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `apps/field/README.md`, `docs/MVP.md` Modül 3, `docs/arayuzler.md`, `docs/veri-modeli.md`, `supabase/migrations/` (özellikle `..._access_control`, `..._media_storage`, `..._boolean_metric_value`)
- **Ortam:** Flutter kurulu değil; GitHub'dan 3.47.7 (`ci-field.yml` ile aynı) kur. Android SDK için `.devcontainer/mobile/Dockerfile`'a bak.

## Amaç

Saha uygulaması her şeyi yerel veritabanına yazıp gönderilecekler kuyruğuna (`Outbox`) ekliyor; kuyruğu sunucuya gönderen kısım yok. Bahçede internet çoğu zaman yok ya da zayıf. Bağlantı gelince kuyruk kendiliğinden, sırayla ve kayıpsız gönderilmeli. Aynı kayıt iki kez gönderilse de sunucuda tek kayıt olmalı.

## Yapılacaklar

1. **Günün görevleri sunucudan:**
    - Personele atanmış (`lead_user_id`) ya da kurumunun `planned` durumdaki ziyaretleri, parsel bilgisi, yer ve ağaç kodlarıyla birlikte indirilir.
    - Çevrimdışıyken son indirilen liste kullanılır. Sahte görev deposu geliştirme için kalsın.
2. **Gönderim** (`SyncWorker`):
    - Kuyruktaki kayıtlar eklenme sırasıyla gönderilir. Eşlemeler:
        - Oturum → `session`: durum `captured`, başlangıç ve bitiş zamanları.
        - Oturum olayları: Veritabanında karşılığı yok. Nereye yazılacağına karar ver (`capture.metadata`, `session` alanları ya da yeni bir tablo) ve gerekçeyi yaz.
        - Yakın plan fotoğrafları → `capture` + `media` alanına dosya (`org/<org_id>/parcel/<parcel_id>/<sha256>`).
        - Personel cevapları → `measurement`, `source = staff`.
    - **Tekrar güvenli:** Kimlikler (uuid) cihazda üretilir. Tekrar gönderilen kayıt hata vermez, yeni satır da açmaz.
    - **Hata ve tekrar:** Ağ hatasında artan bekleme süresiyle yeniden dener. Kalıcı hatada (yetki, doğrulama) kayıt "başarısız" olarak işaretlenir, sebebi saklanır, kuyruğun geri kalanı durmaz. Personele sade bir uyarı gösterilir.
    - **Ne zaman çalışır:** Uygulama açılınca, bağlantı geri gelince, ziyaret bitince ve elle "Şimdi gönder" ile.
    - **Ekranda durum:** Bekleyen, gönderilen ve başarısız kayıt sayısı. Ziyaret özeti ekranında "her şey gönderildi" bilgisi.
    - Fotoğraf dosyası, gönderildiği doğrulanmadan telefondan silinmez.
3. **Yetki boşluğu:** `media` alanına şu an sadece `ops` yükleyebiliyor. Saha personelinin (`field_staff`) kendi kurumunun yoluna dosya **ekleyebilmesi** için migration yaz. Güncelleme ve silme yine yok. pgTAP testi ekle: personel ekleyebiliyor, başka kurumun yoluna ekleyemiyor, güncelleyemiyor.
4. **Açık işler** (`docs/plan.md`):
    - **APK derlemesi:** `main`'de `flutter build apk --debug` kırık. `permission_handler_android`, `compileSdk` 37 istiyor, proje 36 ile derleniyor. Paketi uyumlu bir sürüme sabitle ya da Android Gradle eklentisini ve `compileSdk`'yı yükselt; hangisini ve neden seçtiğini yaz. CI artık APK'yı her PR'da derliyor; PR'da bu adım geçmeli.
    - **README ve `GnssStatus` yorumu:** Firmware 0.2.0'dan beri durum mesajında GPS zamanı var (39 bayt, 31. bayttan itibaren `gps_time_ns`). Hâlâ "önerilen" diye anlatılıyor; düzelt.
    - **Evet/hayır cevapları:** Sunucuya `value_boolean` olarak gönderilsin (`value_bool` değil).
    - **`flutter_blue_plus` lisansı:** Ticari kullanımda ücretli. Kod değiştirme. Alternatifleri (ör. `flutter_reactive_ble`, `universal_ble`) karşılaştır ve PR açıklamasında öneri yap: lisans, bakım durumu, değişikliğin boyutu.
5. **Testler:**
    - Birim: Sahte bir sunucu istemcisiyle sıra, tekrar gönderim, ağ hatasında bekleme, kalıcı hatada kuyruğun devamı, uygulama kapanıp açılınca kaldığı yerden devam.
    - Arayüz: Gönderim durumu göstergesi, "Şimdi gönder".
    - Entegrasyon (yerel Supabase, isteğe bağlı): Ortamda Supabase varsa `field@example.com` ile gerçek gönderim. CI'da Supabase yok; bu testler ortam değişkeni yoksa atlanır.
6. **README:** Senkronizasyon bölümü ve telefonda deneme adımları (uçak modu → çekim → bağlantı → gönderim).

## Kabul ölçütü

- `flutter analyze` temiz, `flutter test` geçiyor.
- `flutter build apk --debug` geçiyor. Bulutta Maven 429 hatası alırsan PR'da yaz; CI'daki derleme belirleyicidir.
- Üretilen dosyalar commit'li; temiz klonda `dart run build_runner build` sonrası `git status` boş.
- Migration eklendiyse `pnpm db:test` geçiyor ve `database.types.ts` güncel.
