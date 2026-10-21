# İP6 v0.3: Envanterin Saha Tarafı

- **Klasör:** `apps/field/`. Ayrıca:
    - Gerekirse şema: `supabase/migrations/20261022120xxx_*.sql` ve `supabase/tests/20_*.test.sql`. Test projesine uygulanmış son migration'dan sonra gelmeli. Migration eklersen `pnpm web:typegen` çalıştır ve çıktıyı commit'le.
    - `.github/workflows/ci-field.yml`: test APK'sı için (madde 4).
    - `docs/arayuzler.md`: köşe ve kapsama verisinin biçimi.
    - Seed'i değiştirme.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `apps/field/README.md`
    - `docs/MVP.md` Modül 2 (sınır yürüyüşü, doğrulama turu) ve Modül 3 (rota, kalite kapısı)
    - `docs/arayuzler.md`: "Doğrulama kalemleri", "Saha uygulaması ve veritabanı", "Ağaç konumları"
    - `docs/kullanim-kilavuzu.md` bölüm 2.1 ve 2.4
    - `docs/veri-modeli.md`
- **Ortam:** Flutter 3.47.7 (GitHub'dan; `ci-field.yml` ile aynı). Android SDK için `.devcontainer/mobile/Dockerfile`'a bak.

## Ara gönderimler

Her madde bitince commit'le ve dalı GitHub'a gönder. PR'ı en sonda aç. Bir önceki saha oturumu yarıda kapandı ve hiçbir şey kalmadı.

## Amaç

Envanterin ofis ve uzman tarafı hazır: üçgenleme, doğrulama turu oluşturma, uzman onayı, sahibin sınır onayı. Saha uygulaması envanterde üç şeyi yapamıyor:
1. Sınır yürüyüşünde köşe işaretlemek
2. Ofisin çıkardığı doğrulama turunu yürütmek
3. Taramada nerelerin kapsandığını göstermek

Bu görev bu üçünü ekler.

## Yapılacaklar

1. **Doğrulama turu:**
    - Günün görevlerinde `verification` ziyaretleri ayrı bir görev türü olarak görünür. Sözleşme `docs/arayuzler.md` "Doğrulama kalemleri" bölümünde; ona uy.
    - **Tur ekranı:**
        - Açık kalemlerin listesi; sıra ve pozisyona göre sıralı, personel bahçede sırayla yürüsün.
        - Her kalemde yer kodu, nedeni ve ofisin notu görünür.
        - Personeli yere yönlendirme: "S5 sırasında, güneyden 12. ağaç" gibi bir kod tarifi. GNSS varsa yere uzaklık ve yön.
    - **Kalem sonucu:**
        - "Ağaç var" ya da "Ağaç yok"
        - İsteğe bağlı yakın plan; mevcut kamera ve kalite kontrolü kullanılır
        - Not
    - Sonuç `record_verification_result` ile gönderilir. Fotoğraf önce `capture` olarak yüklenir; senkronizasyon kuyruğuna girer.
    - Çevrimdışı çalışır. `item_closed` gibi hatalar personele sade bir mesajla gösterilir.
2. **Sınır yürüyüşünde köşe işaretleme:**
    - Envanter ziyaretinde bir "Sınır" adımı. Personel her köşede "Köşe" düğmesine basar. O anın GPS zamanı ve kaydedicinin durum mesajındaki konum ve kalite kaydedilir.
    - Köşe sırası düzeltilebilir; son köşe silinebilir.
    - Her köşeye isteğe bağlı fotoğraf ve not eklenebilir: sınır taşı, çit, duvar, yol, komşu bahçe.
    - **Kayıt:** Köşeler senkronizasyonla sunucuya gider. Ham GNSS sonradan PPK ile düzeltilir; o yüzden her köşenin GPS zamanı saklanır, işleme hattı köşeyi düzeltilmiş yörüngeden yeniden konumlar.
        - Nereye kaydedileceğine sen karar ver. Seçenekler: `boundary` için bir taslak, `session_event` ya da yeni bir tablo. Öneri: köşeler olay olarak saklansın; sınır sürümünü ofis ya da işleme hattı oluştursun.
        - Biçimi `docs/arayuzler.md`'ye yaz. İşleme hattının bunu okuması sonraki iş; PR'da not et.
    - Uygulamada köşelerden çizilen yaklaşık bir poligon ve alanı (m² ve dönüm) görünür.
3. **Kapsama haritası:**
    - Tarama sırasında ekranda parselin sınırı ve yerleri (envanter varsa), üstünde personelin geçtiği iz.
    - İz, kaydedicinin durum mesajlarındaki konumlardan çizilir.
    - Önce sıra boyunca, sonra dik koridorlar: hangi koridorların bittiği görülsün. Basit bir kural yeterli: yerin X m yakınından geçildiyse kapsandı.
    - Ziyaret özetinde kapsama oranı, ör. "yerlerin %96'sının 4 m yakınından geçildi". Eşik altındaysa uyarı.
    - **Çevrimdışı harita:** Altlık zorunlu değil. İnternet yoksa sadece vektör çizim (sınır, yerler, iz) gösterilir. Harita paketi seçimini ve lisansını PR'da yaz; ücretli lisanslı paket kullanma.
4. **Test APK'sı:**
    - CI'daki APK şu an sunucu adresi olmadan derleniyor. `main`'de ikinci bir APK da derlensin: `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_KEY=...` ile, Supabase test projesine bağlı.
    - Değerler GitHub secret'larından gelir: `SUPABASE_URL` ve `SUPABASE_ANON_KEY` zaten tanımlı. Publishable anahtar gizli değildir, ama yine de iş akışına düz yazılmaz.
    - Artifact adı `orchados-saha-test-apk`.
5. **Testler:**
    - Birim: Köşe kaydı ve sıralama, poligon alanı, kapsama hesabı, yönlendirme tarifi.
    - Arayüz:
        - Doğrulama turu akışı: var, yok, fotoğraflı, kapatılmış kalem hatası
        - Köşe işaretleme
        - Kapsama göstergesi
    - Entegrasyon (isteğe bağlı): Yerel Supabase'de `record_verification_result` ile gerçek gönderim. Ortam değişkeni yoksa atlanır.
6. **README:**
    - Doğrulama turu, köşe işaretleme ve kapsama bölümleri
    - Telefonda deneme adımları
    - `docs/kullanim-kilavuzu.md` 2.1 ve 2.4 için durum önerisini PR'a yaz; dosyaya dokunma.

## Kabul ölçütü

- `flutter analyze` temiz; `flutter test` geçiyor.
- CI'da `flutter build apk --debug` geçiyor.
- Üretilen dosyalar commit'li; temiz klonda `dart run build_runner build` sonrasında `git status` boş.
- Migration eklendiyse `pnpm db:test` geçiyor ve `database.types.ts` güncel.
