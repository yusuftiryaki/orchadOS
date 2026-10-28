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

## Demo turu

İP13 ([docs/demo-turu.md](../docs/demo-turu.md)): olası müşteriler kısa ömürlü, salt okunur bir demo hesabıyla sentetik bir bahçeyi sahip gözüyle gezer. Herkese açık demo yalnızca kendi Supabase projesinde çalışır; migration'lar ve Edge Function'lar yine her projeye gider, demo org'u olmayan projede hiçbir şey yapmaz.

| Parça | Ne |
| --- | --- |
| `migrations/20261101120000_demo_access.sql` | `private.demo_org`, `demo_parcel`, `demo_session`, `demo_attempt`; `demo_admit`, `demo_start` (servis rolü), `demo_info`, `demo_end`, `demo_hit` (ziyaretçi), temizlik seçimi, cron (`demo-cleanup` 15 dk, `demo-housekeeping` 5 dk), faturalama koruması |
| `migrations/20261101120100_demo_write_guard.sql` | Genel yazma kilidi `zz_demo_read_only` (her tabloda), kısıtlayıcı politikalar, `assert_not_demo` korumaları, bildirimlerin ve AI'ın demo org'larını atlaması |
| `migrations/20261101120200_demo_account_lockdown.sql` | Hesap kilidi (`auth.users` tetikleyicisi), erişim kapsamı tetikleyicileri, demo hesabı döndürmeyen aramalar, `demo-media` kovası, son `demo_housekeeping` |
| `functions/demo-start/` | `start` (Turnstile, IP kovası, hesap, magic link) ve `cleanup` (cron sırrıyla) |
| `functions/_shared/demo.ts` | Saf yardımcılar: istek ayrıştırma, hata kodları, `ipBucket`, `demoMode`, `demoEmail` |
| `testing/demo.sql` | `register_demo_org`, `age_demo_sessions`, `purge_demo_attempts`, `run_demo_housekeeping` (yalnız yerel ve CI) |
| `tests/42_demo_access`, `43_demo_write_guard`, `44_demo_account_lockdown` | pgTAP |

- **Anahtar:** Edge secret `ORCHADOS_DEMO_MODE` (`dev` ya da `public`); tanımsızsa `start` 503 `demo_closed` döner. Yerelde `config.toml` içinde `dev`'dir; Turnstile yerelde yoktur. Ayrıca veritabanında en fazla bir `private.demo_org` satırı `enabled` olabilir.
- **Kimlik:** Demo hesabı `app_metadata.demo = true` taşır; e-postası `ziyaretci-<uuid>@<visitor_email_domain>` (varsayılan `demo.orchados.invalid`), telefonu ve parolası yoktur. Auth'ta dışarıdan kayıt ve anonim giriş kapalı kalır.
- **Yeni tablo kuralı:** Tablo ekleyen her migration `select private.attach_demo_guard('<tablo>');` çağırır. Kullanıcıya erişim ya da kimlik veren tablo ayrıca `select private.attach_demo_account_guard('<tablo>', '<kullanıcı sütunu>');` çağırır. `43_demo_write_guard` eksik tabloyu bulur.
- **Yeni Edge yolu kuralı:** Kullanıcının token'ını doğrulayıp servis rolüyle yazan her yol, `jwtClaims` ve `isDemoClaims` (`_shared/signup.ts`) ile demo token'ını 403 `demo_read_only` ile reddeder.
- **Yerel deneme:** Bir org'u `testing.register_demo_org(org, parseller)` ile kaydedip `POST /functions/v1/demo-start {"action":"start"}` çağırın; dönen `token_hash` ile `verifyOtp({token_hash, type: verification_type})` bir demo oturumu açar. Entegrasyon testi: `apps/web/tests/integration/demo-start.test.ts`.
