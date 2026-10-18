# supabase

Veritabanı şeması (Postgres + PostGIS), migration'lar, satır bazlı yetki kuralları ve örnek veri.

İş paketi: İP1. Şemanın kaynağı [docs/veri-modeli.md](../docs/veri-modeli.md).

## İçerik

| Yol | Ne |
| --- | --- |
| `config.toml` | Yerel Supabase ayarları; İP1'de gerekmeyen servisler kapalı |
| `migrations/` | Şema: uzantılar ve tipler, konu katmanı (org, parcel, boundary, slot, tree, zone), toplama katmanı (session, device, sensor, rig, calibration, capture), ürün ve bulgu katmanı (asset, metric_definition, measurement, assessment, finding, operation), `private` şeması, yetki kuralları |
| `seed.sql` | Sentetik, deterministik örnek veri: bir org, beş kullanıcı, Gaziantep yakınında ~20 dönümlük bir parsel, 310 yer, 302 aktif ağaç, envanter oturumu, metrik kaydı |
| `tests/` | pgTAP testleri (`pnpm db:test`) |

## Yetki modeli

- **Org rolleri** (`membership`): `field_staff`, `expert`, `ops`. Org'un bütün parsellerini görür.
- **Parsel rolleri** (`parcel_access`): `owner`, `viewer`. Sadece kendi parsellerini ve altındaki her şeyi görür. Sahip, kendi parseline izleyici ekleyip çıkarabilir ve sınırı `approve_boundary()` ile onaylar.
- `capture`, `asset`, `measurement` ve bağlantı tabloları sadece eklenir; güncelleme ve silme hem yetkiyle hem tetikleyiciyle engellenir.
- `private` şeması (sahip kimliği, telefon, KVKK rızası, tapu ve erişim notu) API'den açılmaz; sadece `service_role` okur. Kullanıcı kendi profilini `my_owner_profile()` ile görür.
