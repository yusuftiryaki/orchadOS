# supabase/testing — testler için veri temizliği

**Sadece yerel ve CI veritabanında.** Test ve üretim projelerine gitmez.

Ekleme-yalnız tablolar (`capture`, `asset`, `measurement`, `session_event`, `trunk_label` …) ve yayın kilidi, hiçbir API kullanıcısının (servis rolü dahil) test verisini silmesine izin vermez. Buradaki fonksiyonlar bir testin satırlarını, **sadece çağıran işlem için** tetikleyiciler kapalıyken (`session_replication_role = replica`) siler.

## Nasıl yüklenir

`supabase/config.toml` → `[db.seed] sql_paths = ["./seed.sql", "./testing/*.sql"]`. `pnpm db:reset` (ve boş bir birimde `pnpm db:start`) migration'lardan ve `seed.sql`'den sonra bu klasörü yükler. Ayrı bir komut gerekmez.

`[api] schemas`'a `testing` eklendi: web ve Python testleri fonksiyonları PostgREST'ten çağırır (`Content-Profile: testing`). Bu ayar değiştiği için mevcut bir yerel yığında bir kez `pnpm db:stop && pnpm db:start && pnpm db:reset` gerekir.

**Neden migration değil:** `deploy-db` iş akışı `supabase db push --include-all` çalıştırır; seed dosyaları `db push`'a girmez (`--include-seed` verilmedikçe). Böylece silme fonksiyonları test ve üretim projelerinde hiç bulunmaz. Migration'la eklenip `service_role` dışına kapatmak da mümkündü, ama servis rolü anahtarı sızarsa ekleme-yalnız verinin ve yayımlanmış raporların izsiz silinmesine yol açacak bir fonksiyon üretimde durmuş olurdu. CI'da (`ci-db-web`) bir adım, `supabase/migrations/` içinde `testing` şemasının yaratılmadığını denetler. `seed.sql` gibi bu klasör de **asla `db push --include-seed` ile uzak bir projeye gönderilmemeli**.

## Fonksiyonlar

| Fonksiyon | Kim | Ne siler |
| --- | --- | --- |
| `testing.purge_sessions(uuid[])` | `service_role` | Oturumlar ve onlara bağlı her şey: `session_id` sütunu olan bütün tablolar (capture, asset, ölçüm, değerlendirme, bulgu, oturum olayı, sınır, bildirim, AI satırları …), sadece bir üst kimlikle bağlı olanlar (lineage, kanıt, değerlendirme girdileri, bulgunun soruları ve cevapları, bildirimin giden mesajları) ve artık hiçbir satırın göstermediği `media` nesneleri. Parsel, yerler ve başka oturumların ağaçları kalır |
| `testing.purge_parcels(uuid[])` | `service_role` | Parseller ve altındaki her şey: `parcel_id` sütunu olan bütün tablolar (`public` ve `private`), parsel satırı, `org/<org>/parcel/<parsel>/` altındaki `media` nesneleri |
| `testing.purge_org(uuid)` | `service_role` | İşletme: önce parselleri (yukarıdaki gibi), sonra `org_id` sütunu olan bütün tablolar (üyelikler, cihazlar, düzenekler, sahip profilleri …), işletme satırı, `org/<org>/` altındaki nesneler. Auth kullanıcıları silinmez (testler Admin API ile siler) |
| `testing.purge_billing_users(uuid[])` | `service_role` | Faturalama testlerinin müşterileri (İP12): `customer_user_id`, `user_id` ya da `subject_id` sütununda bu kimlikler olan her satır (başvuru, teklif, sipariş, ödeme, iade, profiller, rızalar, bekleyen kayıtlar, üyelik ve parsel erişimi), bunlara bağlı bahçe ayrıntıları, ödeme anlık görüntüleri ve olayları, haklarındaki denetim kayıtları. Auth kullanıcısını silmeden önce çağrılır (`customer_user_id` silmeyi engeller) |
| `testing.purge_signup_attempts()` | `service_role` | Kayıt denemesi satırları (oran sınırı), kayıt testleri aynı saat içinde yeniden koşabilsin diye |
| `testing.reset_to_seed()` | `postgres` (pgTAP) | Seed'de olmayan her satırı siler (aşağıda) |

Üçü de silinen tabloları ve satır sayılarını döner. Tablolar sütun adıyla bulunduğu için yeni bir tablo bu dosya değişmeden kapsanır; sadece bir üst kimlikle bağlı yeni bir tablo eklenirse `_delete_children`'a yazılmalıdır (pgTAP: `27_testing_purge.test.sql`).

## pgTAP: `reset_to_seed`

`reset.sql`, yüklendiği anda (seed'den hemen sonra) `public`, `private` ve `storage.objects` tablolarındaki her satırın birincil anahtarını `testing.seed_row`'a yazar. `testing.reset_to_seed()` bunlar dışındaki bütün satırları siler. Her pgTAP dosyası `select plan(...)`'dan sonra bunu çağırır; dosya tek bir işlem olup sonunda geri alındığı için silme de geri alınır. Böylece web, işleme hattı ve AI worker testlerinin ya da `pnpm db:demo`'nun bıraktığı satırlar pgTAP sayımlarını bozmaz. Başka testlerin **değiştirdiği** seed satırları geri getirilmez; auth kullanıcılarına dokunulmaz.

## Kullananlar

- Web testleri: `apps/web/tests/local-db.ts` (`purgeParcels`, `purgeOrg`, `purgeBillingUsers`, `purgeSignupAttempts`, `deleteUsers`), servis rolüyle.
- İşleme hattı ve AI worker: `services/*/tests/supabase_util.py` → `purge_sessions(env, ids)`, servis rolüyle (`SUPABASE_SERVICE_ROLE_KEY` ya da `supabase status`).
- pgTAP: `supabase/tests/*.test.sql` başında `testing.reset_to_seed()`.
