# İP4 – Veritabanına ve Depolamaya Yükleme

- **Klasör:** `services/pipeline/`. İstisnalar:
    - `.github/workflows/ci-pipeline.yml`: entegrasyon testleri için yerel Supabase'i başlatan adımlar eklenebilir.
    - `docs/arayuzler.md`: sadece aşağıdaki "Asset `pose` alanı" bölümü eklenir.
    - Şema değişikliği gerekirse: `supabase/migrations/20261020120xxx_*.sql` ve `supabase/tests/10_*.test.sql`. Başka oturumlar da migration ekliyor; bu ad aralığının dışına çıkma. `apps/web/src/lib/database.types.ts` dosyasını değiştirme; birleştirmede koordinatör yeniden üretir.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `services/pipeline/README.md`, `docs/arayuzler.md` ("Medya depolama"), `docs/veri-modeli.md` (Capture/Asset ayrımı, lineage), `supabase/migrations/` (özellikle `..._acquisition_layer`, `..._product_and_finding_layer`, `..._access_control`, `..._media_storage`), `docs/deployment.md` (ücretsiz katman sınırları)

## Amaç

İşleme hattı çıktılarını şu an yerel bir klasöre yazıyor (`LocalUploader`). Bir oturumun çıktılarını Supabase'e yükleyen gerçek uygulamayı yaz: dosyalar `media` depolama alanına, kayıtlar `capture`, `asset` ve `asset_source` tablolarına. Uzman paneli ve sahip portalı bu kayıtları okuyacak.

## Yapılacaklar

1. **Komut:** `orchados-pipeline upload <çalıştırma klasörü> --session-id <uuid>`
    - Oturumun `org_id` ve `parcel_id` bilgisi veritabanındaki `session` kaydından okunur.
    - `run` komutuna da isteğe bağlı `--upload --session-id ...` eklenebilir.
2. **Kimlik:** Hat, operasyon (`ops`) rolündeki bir kullanıcının kimliğiyle çalışır. Ortam değişkenleri: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORCHADOS_EMAIL`, `ORCHADOS_PASSWORD`. Satır bazlı yetki kuralları geçerli kalır; **servis anahtarı kullanılmaz.** Değerler repoya girmez; README'de `.env` örneği (değersiz) olsun.
3. **Ne yüklenir:**
    - **Ham kayıtlar** (360° video, UBX, events): Dosyalar buluta çıkmaz, işleme istasyonunda kalır. `capture` kaydı açılır; `uri` istasyondaki yeri gösterir (ör. `station://<makine>/<yol>`; biçimi sen belirle, README'ye yaz).
    - **Türetilmiş dosyalar** (panorama, panorama önizlemesi, ağaç kesiti, yörünge): Dosya `media` alanına `org/<org_id>/parcel/<parcel_id>/<sha256>` adıyla yüklenir. `asset.uri` = `storage://media/` + bu ad.
    - **Lineage:** `outputs.json`'daki `derived_from` → `asset_source`.
    - Panorama ve önizleme ayrı `asset` kayıtlarıdır (ikisi de `kind = panorama`); ayrım `pose.variant` ile yapılır (aşağıda). Hangi türlerin yükleneceği bir seçenekle sınırlanabilsin (ör. `--only preview,tree_crop`). Ücretsiz Supabase'te 1 GB alan var; bir tam ziyaret bunu aşar. Varsayılanı ve gerekçesini README'ye yaz.
4. **Ağaç eşleme:** Kesitlerdeki `subject.slot_code` (ör. `S5-12a`), parseldeki `slot` + aktif `tree` kaydıyla eşleştirilir ve `asset.tree_id` doldurulur. Eşleşmeyen kesit yüklenmez, raporda uyarı olarak listelenir.
5. **Yüz bulanıklaştırma kuralı:** `outputs.json`'da bulanıklaştırılmamış diye işaretli panoramalar varsayılan olarak **yüklenmez**; komut hata verir. Sentetik veri için açık bir `--allow-unblurred` seçeneği olsun; README'de sadece sentetik veri için olduğu yazsın.
6. **Tekrar çalıştırma güvenli olmalı:**
    - Aynı çalıştırma iki kez yüklenirse yeni kayıt ya da dosya oluşmaz. Mevcut nesne atlanır; `asset` kaydı oturum + `content_hash` + `pipeline_version` ile bulunur.
    - Yarıda kesilen bir yükleme yeniden çalıştırılınca kaldığı yerden tamamlanır.
    - Hat sürümü değişip yeniden işlenirse eski kayıtlar silinmez; yenileri eklenir (ölçümler sürümlüdür kuralı).
7. **Oturum durumu:** Yükleme tamamlanınca `session.status` = `processed` olur. Durum zaten `in_review` ya da `published` ise değiştirilmez.
8. **Depolama arayüzü:** Yükleme bir `MediaStore` arayüzü arkasında olsun; şimdi Supabase Storage uygulaması. Pilotta Cloudflare R2 gelebilir (`docs/deployment.md`). Mevcut `Uploader`/`LocalUploader` yapısını buna göre düzenle.
9. **Asset `pose` alanı:** Web uygulaması bu alanları okuyacak. `docs/arayuzler.md`'ye "Asset `pose` alanı" bölümü olarak ekle:
    - `panorama`: `variant` (`full` | `preview`; yoksa `full`), `heading_deg`, `height_m`, `sd_h_m`, `quality` (`fix` | `float` | `dgps` | `single`), `gps_time_ns` (metin: 64 bit tamsayı JavaScript'te taşar), `width_px`, `height_px`.
    - `tree_crop`: `direction` (`N`, `S`, ...), `slot_code`, `panorama_asset_id`, `distance_m`, `azimuth_deg`, `yaw_in_panorama_deg`, `pitch_deg`, `fov_deg`, `score`.
    - Konum `asset.position` ve `position_uncertainty_m` sütunlarında; `pose` içinde tekrarlanmaz.
    - Örnek veri `supabase/demo/scans.sql` bu alanların bir kısmını kullanıyor; tutarsızlık görürsen PR'da yaz.
10. **Testler:**
    - Birim: Sahte istemciyle eşleme, tekrar çalıştırma, yarıda kesilme, bulanıklaştırma kuralı, durum geçişi.
    - Entegrasyon: Yerel Supabase'e karşı (`pnpm install && pnpm db:start && pnpm db:reset` kökte). Sentetik oturum → `run` → `upload`. Kontroller:
        - Kayıtlar ve dosyalar oluşuyor.
        - İkinci yükleme hiçbir şey eklemiyor.
        - Oturum yayımlanmadan sahip kullanıcısı (`owner@example.com`) kayıtları ve dosyaları göremiyor.
        - `field@example.com` dosya yükleyemiyor.
      Test, kendi oturumunu ve gerekiyorsa kendi parselini açar. Seed'deki satır sayılarına dayanan başka testler var; seed'i değiştirme. Sentetik oturumun ağaç kodları seed parselindeki kodlarla eşleşmiyorsa test kendi yer ve ağaç kayıtlarını oluşturur.
      Supabase'e ulaşılamıyorsa entegrasyon testleri atlanır (`pytest` işaretiyle).
    - CI: `ci-pipeline.yml` entegrasyon testlerini de koşsun: Node ve pnpm kurulumu, `pnpm install`, `pnpm db:start`, `pnpm db:reset`. `ci-db-web.yml` örnek alınabilir.
11. **README:** Yükleme bölümü: ortam değişkenleri, komut, ne yüklenir ne yüklenmez, ücretsiz katman notu.

## Kabul ölçütü

- `uv run ruff check`, `uv run pytest` geçiyor; yerel Supabase açıkken entegrasyon testleri de geçiyor (atlanmıyor).
- PR'da: sentetik bir oturumun yüklenmesinden sonra tablolardaki satır sayıları ve depolamadaki nesne sayısı.
