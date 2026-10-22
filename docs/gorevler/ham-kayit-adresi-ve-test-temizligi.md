# Ham Kayıt Adresi ve Testler İçin Veri Temizliği

- **Klasör:**
    - `services/pipeline/`, `services/ai-worker/` (sadece testlerin temizliği için)
    - `supabase/migrations/20261024130xxx_*.sql`, `supabase/tests/27_*.test.sql`, ardından `pnpm web:typegen`
    - `apps/web/tests/` (sadece test yardımcıları ve onları kullanan testlerin temizlik kısmı)
    - `docs/arayuzler.md`, `docs/bulut-isleme.md`
- **Aynı anda çalışan oturum:** MVP boşluk denetimi (`apps/web/src/**`). Web kaynak koduna dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/bulut-isleme.md` ("Açık noktalar")
    - `services/ingest/README.md`
    - `services/pipeline/README.md` (yükleme)
    - `apps/web/tests/local-db.ts`
    - `supabase/tests/`
- Her madde bitince commit'le ve dalı gönder; PR en sonda.

## 1. Ham kayıtların adresi

İşleme hattı, ham kayıtların `capture.uri` alanına `station://<makine>/<yol>` yazıyor. Bulutta makine geçici; ham dosyaların gerçek yeri ham veri deposundaki anahtar (`raw/<org>/<parcel>/<session>/...`, `orchados-ingest`).

- **Oturum depodan geldiyse:** `upload`, `capture.uri`'yi deponun adresi olarak yazar. Biçimler: `s3://<kova>/<anahtar>`, `az://<kapsayıcı>/<anahtar>`, `file://...` (yerel arka uç). `pull`'ün bıraktığı manifestten okunur.
- **Yerel bir klasörden işlendiyse:** Bugünkü `station://` biçimi kalır.
- Biçimi `docs/arayuzler.md`'ye yaz. `docs/bulut-isleme.md`'deki açık noktayı kapat.
- Testler: Manifestli ve manifestsiz iki durum; entegrasyon testinde satırdaki adres.

## 2. Testler için veri temizliği

Ekleme-yalnız tablolar (`capture`, `asset`, `measurement`, `session_event`, `trunk_label` vb.) yüzünden testler kendi verisini silemiyor. Bu yüzden:
- Web testleri `docker exec ... psql` ile `session_replication_role = replica` altında siliyor (`apps/web/tests/local-db.ts`).
- pgTAP testleri başka takımların bıraktığı satırlardan etkileniyor. Bildirim testi bu yüzden bir kez kırıldı.

**Yapılacak:**
- **Bir veritabanı fonksiyonu:** ör. `testing.purge_org(p_org_id uuid)` ya da `testing.purge_parcels(uuid[])`. Bir test işletmesinin ya da parselinin bütün satırlarını bağımlılık sırasıyla siler: ekleme-yalnız tablolar, depo nesnelerinin satırları, bildirimler, sorular.
    - **Güvenlik:** Fonksiyon sadece yerel ve CI veritabanında var olmalı. Test ve üretim projelerine `deploy-db` ile migration olarak gitmemeli.
    - Önerilen yol: `supabase/tests/` altında ya da `supabase/seed.sql` dışında, `pnpm db:reset` sonrası yüklenen ayrı bir SQL dosyası. Ör. `supabase/testing/purge.sql` ve kökte `pnpm db:testing` komutu.
    - CI iş akışları `db:reset`'ten sonra bunu yükler. Kökteki `package.json`'a komut ve iş akışlarına adım ekleyebilirsin.
    - Alternatif olarak migration'la eklenip `service_role` dışında herkese kapalı tutulabilir. Ama üretimde test silme fonksiyonu bulunması istenmez; kararını gerekçesiyle yaz.
- **Kullananlar:**
    - Web test yardımcıları (`apps/web/tests/local-db.ts`): `docker exec` yerine bu fonksiyon, servis rolüyle.
    - İşleme hattı ve AI worker'ın Supabase testleri: kendi işletmelerini ya da oturumlarını bununla temizlesin.
    - pgTAP testleri (`supabase/tests/*`): başka takımların bıraktığı satırlardan etkilenmemeli. Genel sayım yapan testler kendi verisine filtrelensin ya da başta bu fonksiyonla temizlesin.
- **Sıra bağımsızlığı:** CI'da `pytest` → `db:test` ve `web:test` → `db:test` sıraları da geçmeli. Bunu bir kez yerelde göster ve PR'da yaz.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:test`, `pnpm web:e2e`, `services/pipeline` ve `services/ai-worker` testleri geçiyor.
- Test temizliği hiçbir yerde `docker exec` kullanmıyor (ya da kalan yer gerekçesiyle yazılı).
- Temizlik fonksiyonu test ve üretim projelerine gitmiyor.
