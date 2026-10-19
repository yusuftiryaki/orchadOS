# supabase

Veritabanı şeması (Postgres + PostGIS), migration'lar, satır bazlı yetki kuralları ve örnek veri.

İş paketi: İP1. Şemanın kaynağı [docs/veri-modeli.md](../docs/veri-modeli.md).

## İçerik

| Yol | Ne |
| --- | --- |
| `config.toml` | Yerel Supabase ayarları; İP1'de gerekmeyen servisler kapalı |
| `migrations/` | Şema: uzantılar ve tipler, konu katmanı (org, parcel, boundary, slot, tree, zone), toplama katmanı (session, device, sensor, rig, calibration, capture), ürün ve bulgu katmanı (asset, metric_definition, measurement, assessment, finding, operation), `private` şeması, yetki kuralları; sonra evet/hayır değerleri ve isteğe bağlı belirsizlik, yayın kuralı, `tree_latest_*` görünümleri, `media` depolama alanı |
| `seed.sql` | Sentetik, deterministik örnek veri: bir org, beş kullanıcı, Gaziantep yakınında ~20 dönümlük bir parsel, 310 yer, 302 aktif ağaç, envanter oturumu, metrik kaydı |
| `tests/` | pgTAP testleri (`pnpm db:test`): şema, kısıtlar, rol bazlı yetki, ölçüm değerleri, yayın kuralı ve görünümler, depolama |

## Yetki modeli

- **Org rolleri** (`membership`): `field_staff`, `expert`, `ops`. Org'un bütün parsellerini görür.
- **Parsel rolleri** (`parcel_access`): `owner`, `viewer`. Sadece kendi parsellerini ve altındaki her şeyi görür. Sahip, kendi parseline izleyici ekleyip çıkarabilir ve sınırı `approve_boundary()` ile onaylar.
- **Yayın kuralı:** Sahip ve izleyici, oturuma bağlı sonuçları (`capture`, `asset`, `measurement`, `assessment`, `finding` ve bağlantı tabloları) ancak oturum `published` olunca görür. Parsel, sınır, yer, ağaç ve oturum satırları bundan etkilenmez. Org rolleri her şeyi görür.
- **Görünümler:** `tree_latest_assessment` (ağaç başına tek değerlendirme) ve `tree_latest_measurement` (ağaç ve metrik başına tek ölçüm). Önce en yeni oturum seçilir; kaynak önceliği (uzman > model > ai; ölçümde uzman > algoritma > personel > ai) yalnızca aynı oturum içinde karar verir ([docs/veri-modeli.md](../docs/veri-modeli.md#kurallar)). `security_invoker` ile çalışırlar; yetki kuralları geçerlidir.
- **Depolama:** Özel `media` alanı, nesne yolu `org/<org_id>/parcel/<parcel_id>/<sha256>` ([docs/arayuzler.md](../docs/arayuzler.md#medya-depolama)). Okuma: org üyeleri her nesneyi; sahip ve izleyici, görebildikleri `asset`/`capture` satırının dosyasını. Yazma: servis rolü ve operasyon, sadece ekleme.
- **Belirsizlik:** Sayı ve ölçek değerlerinde zorunlu, kategori ve evet/hayır (`value_boolean`) değerlerinde boş olabilir.
- `capture`, `asset`, `measurement` ve bağlantı tabloları sadece eklenir; güncelleme ve silme hem yetkiyle hem tetikleyiciyle engellenir.
- `private` şeması (sahip kimliği, telefon, KVKK rızası, tapu ve erişim notu) API'den açılmaz; sadece `service_role` okur. Kullanıcı kendi profilini `my_owner_profile()` ile görür.
