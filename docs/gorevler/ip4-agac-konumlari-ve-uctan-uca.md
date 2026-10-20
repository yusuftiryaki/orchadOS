# İP4 v0.2 – Ağaç Konumları Veritabanından ve Uçtan Uca Test

- **Klasör:** `services/pipeline/`. Ayrıca şunlara dokunabilirsin:
    - `supabase/demo/`
    - `.github/workflows/ci-pipeline.yml`, ya da yeni bir `ci-chain.yml`
    - `apps/web/tests/e2e/chain-*` dosyaları (sadece tarayıcı testi gerekirse)
    - `docs/arayuzler.md`
    - Gerekirse şema: `supabase/migrations/20261021130xxx_*.sql` ve `supabase/tests/16_*.test.sql`. Migration eklersen `pnpm web:typegen` çalıştır ve çıktıyı commit'le.
- **Dokunmayacakların:** Aynı anda başka bir oturum `apps/web/` üzerinde çalışıyor (ofis aracı, `save_inventory`). Web kaynak koduna ve seed'e dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `services/pipeline/README.md`
    - `docs/arayuzler.md`
    - `docs/veri-modeli.md`: yayın kuralı
    - `apps/web/README.md`: uzman paneli ve sahip portalı bölümleri
    - `supabase/migrations/20261020130000_expert_review_and_publication.sql`: `save_expert_assessment` ve `publish_session`
    - `supabase/demo/scans.sql`

## Amaç

Bileşenler tek tek test edildi ama zincir uçtan uca hiç koşmadı. İki eksik var:

1. İşleme hattı ağaç kesitlerini, sentetik oturumun kendi ağaç listesine göre kesiyor. Gerçek kullanımda ağaç konumları envanterden, yani veritabanındaki `slot` ve `tree` kayıtlarından gelmeli.
2. Tarama → işleme → yükleme → uzman kararı → yayın → sahibin görmesi zincirini doğrulayan bir test yok.

## Yapılacaklar

1. **Ağaç konumları veritabanından:**
    - `run` ve `upload` için bir seçenek, ör. `--trees-from-db`. Parseldeki aktif ağaçları yer kodları ve konumlarıyla okur: `slot.position`, `position_uncertainty_m` ve gerekirse `local_x_m`/`local_y_m`.
    - Kesit aşaması bu listeyi kullanır. Kesitlerin `subject` alanında veritabanındaki `tree_id` ve `slot_code` olur.
    - Yeri olmayan parselde (envanter öncesi) kesit üretilmez; sadece panorama üretilir. Bu bir hata değil, durum olarak raporlanır.
    - Envanter oturumunda (`kind = inventory`) zaten kesit üretilmez; sadece panorama üretilir.
    - Veritabanından okumak için yükleme modülündeki istemci ve kimlik kullanılır (ops kullanıcısı, servis anahtarı yok).
2. **Sentetik veriyi parsele uydurma:**
    - `synth` komutuna, sahneyi verilen bir parselin ağaç konumlarıyla kuran bir seçenek ekle.
    - Bütün parsel yerine birkaç sıra seçilebilsin (ör. `--rows 1-2`); sentetik video küçük kalsın.
    - Böylece sentetik bir taramanın kesitleri seed parselindeki gerçek ağaçlara bağlanır.
3. **Uçtan uca zincir testi:** Yerel Supabase'e karşı, pytest olabilir. Adımlar:
    1. Seed parselinde yeni bir `periodic_scan` oturumu (`planned`).
    2. `synth` (parsele uydurulmuş) → `run --trees-from-db` → `upload`. Oturum `processed` olur.
    3. Uzman kullanıcısıyla:
        - Oturumu `in_review`'a al.
        - Kesiti olan her ağaç için `save_expert_assessment` çağır.
        - Kalan aktif ağaçlar için de değerlendirme yaz; `publish_session` her aktif ağacı istiyor.
        - `publish_session` çağır.
    4. Sahip kullanıcısıyla:
        - Ziyaretin değerlendirmeleri `tree_latest_assessment`'te görünüyor.
        - Kesit asset'leri görünüyor; bir kesitin imzalı adresinden inen dosya, yüklenen dosyayla aynı (hash).
    5. Yayından önce sahibin hiçbir şey görmediği de aynı testte denetlenir.
    - Test kendi oturumunu açar. Seed satır sayılarına dayanan diğer testleri bozmamalı: `pnpm db:test`'in de geçtiğini göster. Ekleme-yalnız tablolar yüzünden test verisi kalıcı olur; bunun diğer testleri etkilemediğini doğrula, etkiliyorsa çözümünü yaz.
    - CI'da her PR'da koşsun (`ci-pipeline.yml` zaten yerel Supabase'i başlatıyor). Süreyi PR'da yaz. 5 dakikayı geçiyorsa sadece `main`'de ve `supabase/` ya da `services/pipeline/` değiştiğinde koşsun.
4. **Örnek veri sözleşmeye uysun:** `supabase/demo/scans.sql`'deki `pose` alanları `docs/arayuzler.md`'deki "Asset `pose` alanı" bölümüne uysun:
    - `variant`, `gps_time_ns`, `width_px` ve `height_px` olsun; önizleme satırları da eklensin.
    - Kesitlerde `panorama_asset_id`, `azimuth_deg`, `yaw_in_panorama_deg`, `pitch_deg` ve `score` olsun.
    - MIME türü hattın ürettiğiyle aynı olsun.
    - `pnpm db:reset && pnpm db:demo` çalışmaya devam etsin.
    - Örnek veri, Supabase test projesine de aynı SQL ile yüklenebilmeli: seed'in veri kısmıyla aynı oturumda çalıştırılabilsin (`create or replace function pg_temp...`).
5. **README:** İşleme hattı README'sine veritabanından ağaç konumları ve uçtan uca test bölümleri.

## Kabul ölçütü

- `uv run ruff check`, `uv run ruff format --check` ve `uv run pytest` geçiyor; zincir testi yerel Supabase açıkken atlanmıyor.
- `pnpm db:test` geçiyor. Migration eklendiyse `database.types.ts` güncel.
- PR açıklamasında zincir testinin adım adım çıktısının özeti ve süresi.
