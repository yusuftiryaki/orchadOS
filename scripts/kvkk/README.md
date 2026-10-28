# scripts/kvkk — KVKK başvurularında elle silme ve takma ad betikleri (T11)

Silme ve anonimleştirme işlevi yazılımda yokken KVKK md. 11 başvuruları [KVKK Başvuru Prosedürü](../../docs/hukuk/kvkk-basvuru-proseduru.md)'ne göre elle karşılanır. Bu klasör, prosedürün 7. bölümündeki "gözden geçirilmiş elle silme ve takma ad betikleri"dir ([kararlar.md](../../docs/hukuk/kararlar.md) H26, takip işi T11).

Üç komut vardır:

| Komut | Ne yapar | Dosya |
| --- | --- | --- |
| `inventory` | Kişinin verisinin nerede olduğunu, satır sayılarını, hangi satırların saklama yükümlülüğüyle kaldığını ve neden kaldığını listeler; başvuru defterine yazılır. Elle bakılması gereken saha notlarının kimliklerini verir. Hiçbir şeyi değiştirmez | `inventory.sql` |
| `pseudonymize` | Ekleme-yalnız tablolarda kişinin adını, telefonunu ve e-postasını sabit bir takma adla değiştirir (H26 madde 2, "kayda geçirilen kontrollü istisna") | `pseudonymize.sql` |
| `erase` | Saklama gerekçesi olmayan kişisel veriyi siler ya da boşaltır (H26 madde 3–6) | `erase.sql` |

Ortak hazırlık (`lib/prelude.sql`): parametreler, kişinin parselleri ve org'ları, adları, telefonları ve e-postaları, takma adı, süren sözleşme denetimi ve denetim kaydı. Komut dosyaları yalnız bunları okur.

## Güvenlik

- **Varsayılan kuru çalıştırmadır.** Her şey tek bir işlemde ve `ON_ERROR_STOP` ile çalışır; `--apply` verilmezse işlem sonunda geri alınır (`rollback`). Kuru çalıştırma, değişecek satır sayılarını yazar.
- **Hedef:** Varsayılan olarak yerel yığın (`docker exec supabase_db_orchados psql`; kap adı `KVKK_DB_CONTAINER` ile değişir). Barındırılan bir veritabanına yalnızca `--db-url` ile ve terminalde sunucu adını yazarak onay verilerek bağlanılır; onaysız ya da terminal dışından çalışmaz. Bağlantı adresi ekrana parolasız yazılır.
- **Kapsam:** Her ifade kişiye (`--subject`) ya da kişiye ve parsele (`--person-name` + `--parcel`) bağlıdır. Demo org'ları (`private.demo_org`, ortak test projesinde de bulunabilir: [demo-turu.md](../../docs/demo-turu.md) §15.1) hiçbir zaman kapsama girmez; demo hesabı ya da demo parseli verilirse betik durur.
- **Saklama yükümlülüğü olan satırlara dokunulmaz:** fatura profili, teklif, sipariş, ödeme, ödeme anlık görüntüsü ve olayları, iade, bahçe çıkarma, rıza ve onay kayıtları (H26 madde 1).
- **Süren sözleşme:** Kişinin ödeme bekleyen ya da süren bir siparişi, ya da siparişle bağlı olmayan ve pasif olmayan bir bahçede sahip erişimi (ops'un kâğıt sözleşmeyle açtığı sahip) varsa `erase` ve `pseudonymize` durur (çıkış kodu 3, `kvkk_active_contract`). H26 madde 3: silme fesihle mümkündür. Yalnızca gerekçesi deftere yazılmış bir istisnada `--force-active --reason "<gerekçe>"` ile geçilir; gerekçe denetim kaydına girer, içine kişisel veri yazılmaz.
- **Sıra:** `erase --apply`, aynı başvuru için önce `pseudonymize --apply` çalışmadıysa durur (`kvkk_pseudonymize_first`): silme, takma ada çevirmenin aradığı adı ve telefonu da siler.
- **Çıktı:** Yalnızca sayılar, satır kimlikleri ve takma ad yazılır; ad, telefon, e-posta yazılmaz. Çıktı dosyaya kaydedilirse kişisel veri içermez, yine de başvuru defteriyle aynı erişim kısıtıyla tutulur.
- **Denetim kaydı:** Her `--apply`, kapsamdaki her org için bir `public.audit_event` satırı yazar (`private.audit(...)`): `action` `kvkk.pseudonymized` ya da `kvkk.erased`, `actor_role = system`, `details` içinde başvuru numarası (`request`), kişi türü (`user` / `person`), takma ad (`subject_ref`), `--person-name` için parsel kimliği, `--include-notes`, varsa `force_active` ve gerekçesi, ve tablo başına sayılar. Kişisel veri yazılmaz. Kayıt numarası deftere işlenir.

## Komutlar

```bash
scripts/kvkk/run.sh <inventory|erase|pseudonymize> \
  (--subject <auth kullanıcı uuid> | --person-name <ad soyad> --parcel <parsel uuid>) \
  --request <K-yyyy-nnn> [--include-notes] [--apply] \
  [--force-active --reason <gerekçe>] [--db-url <postgres url>]
```

| Seçenek | Anlamı |
| --- | --- |
| `--subject` | Hesabı olan kişi (sahip, hissedar, self-servis müşteri): Auth kullanıcı kimliği. Ops ekranındaki kullanıcı kimliği ya da `select id from auth.users where email = …` |
| `--person-name` + `--parcel` | Hesabı olmayan kişi: sınırı gösteren kişi, sahadaki iletişim kişisi, davet edilip hesabı açılmamış hissedar. Ad, boşluk ve büyük-küçük harf farkı gözetmeden karşılaştırılır |
| `--request` | Başvuru defteri numarası (`K-yyyy-nnn`) |
| `--include-notes` | `pseudonymize`: saha notlarındaki (`field_notice_verbal`, `field_notice_objection`, `visit_blocked`) ad ve telefon geçişlerini de değiştirir. Önce `inventory`'nin listelediği notlar okunur |
| `--apply` | Değişiklikleri kalıcı yapar; yoksa kuru çalıştırma |
| `--force-active --reason` | Süren sözleşme denetimini gerekçeyle geçer (yalnız `--subject`) |
| `--db-url` | Barındırılan veritabanı (oturum havuzu adresi, `postgres` kullanıcısı); terminalde onay ister |

Çıkış kodları: `0` tamam, `2` hatalı seçenek (veritabanına gidilmez), `3` veritabanı reddi (süren sözleşme, sıra, demo, bulunmayan parsel) ya da SQL hatası; işlem geri alınır.

### Adım adım (yerel örnek)

```bash
# 1. Envanter: deftere yazılır, notlar okunur.
scripts/kvkk/run.sh inventory --subject <uuid> --request K-2026-001
# 2. Kuru çalıştırma: ne değişecek?
scripts/kvkk/run.sh pseudonymize --subject <uuid> --request K-2026-001 --include-notes
scripts/kvkk/run.sh erase --subject <uuid> --request K-2026-001
# 3. İkinci kişinin kontrolünden sonra uygulama (önce takma ad, sonra silme).
scripts/kvkk/run.sh pseudonymize --subject <uuid> --request K-2026-001 --include-notes --apply
scripts/kvkk/run.sh erase --subject <uuid> --request K-2026-001 --apply
# 4. Auth hesabı (aşağıda), sonra cevap.

# Hesabı olmayan kişi (ör. sınırı gösteren bekçi):
scripts/kvkk/run.sh inventory --person-name "Ad Soyad" --parcel <parsel uuid> --request K-2026-002
scripts/kvkk/run.sh pseudonymize --person-name "Ad Soyad" --parcel <parsel uuid> --request K-2026-002 --apply
scripts/kvkk/run.sh erase --person-name "Ad Soyad" --parcel <parsel uuid> --request K-2026-002 --apply

# Barındırılan proje: aynı komutlar, --db-url ile (terminalde onay istenir).
scripts/kvkk/run.sh inventory --subject <uuid> --request K-2026-001 --db-url "$KVKK_DB_URL"
```

### Takma ad

`kvkk-` + SHA-256'nın ilk 8 onaltılık hanesi: `--subject` için kullanıcı kimliğinin, `--person-name` için boşlukları sadeleştirilmiş küçük harfli adın ve parsel kimliğinin birleşiminin özeti. Aynı kişi için her çalıştırmada aynıdır; böylece kayıtlar kendi aralarında bağlantılı kalır, kişiyi göstermez. Özet tuzsuzdur: kullanıcı kimliğini bilen biri takma adı yeniden üretebilir. Kimlik ise ayrıca kişisel veri değildir ve hesap silinince hiçbir kişiye bağlanmaz.

### Auth hesabı: Admin API ile, SQL ile değil

Betik `auth.users`'a dokunmaz. GoTrue kendi şemasındaki satırları (kimlikler, oturumlar, yenileme jetonları, denetim kaydı) birlikte yönetir; doğrudan SQL bu bağları kırabilir ve GoTrue sürümleriyle değişir. `erase --apply`'dan sonra:

- **Faturalama satırı yoksa** (teklif, sipariş, ödeme, iade, başvuru `customer_user_id` ile kullanıcıya `on delete restrict` bağlıdır): hesap silinir. Supabase panelinde Authentication › Users › kullanıcı › Delete user, ya da `curl -X DELETE "$SUPABASE_URL/auth/v1/admin/users/<uuid>" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"`. Silme sahip profilini, üyelikleri ve erişimleri zincirleme siler; rıza kayıtları `subject_id` ile kalır.
- **Faturalama satırı varsa** hesap silinemez (saklama yükümlülüğü, H26 madde 1). Hesap kalıcı olarak kapatılır ve iletişim bilgileri kaldırılır: `PUT /auth/v1/admin/users/<uuid>` gövdesi `{"ban_duration": "876000h", "email": "<takma ad>@kvkk.invalid", "phone": "", "user_metadata": {}}` (panelde: Ban user, sonra e-posta ve telefon). Sonra `inventory` yeniden çalıştırılır; `auth.users` satırı kalır, giriş yapılamaz.
- İşlem deftere yazılır. Hesap silindikten sonra rıza ve denetim kayıtları için aynı `--subject` ile `inventory` yine çalışır.

## Kapsanan tablolar

H26 maddeleri: 1 saklama yükümlülüğü, 2 ekleme-yalnız kayıtlar, 3 süren sözleşme, 4 biten sözleşme, 5 parselde başka sahip ya da hissedar, 6 hissedarın talebi, 7 görüntülerdeki kişiler. "Başka taraf": kişi dışında birinin parselde erişimi ya da süren siparişi olması.

| Tablo / sütun | Kural | H26 | Ayrıntı ve saklama gerekçesi |
| --- | --- | --- | --- |
| `private.owner_profile` `full_name`, `phone`, `email` | sil (ad → takma ad, telefon ve e-posta boş) | 4, 5 | Satır kalır: aydınlatma teyidi (`kvkk_consent`, `kvkk_consent_at`, `kvkk_text_version`) onaydan itibaren 10 yıl saklanır |
| `private.customer_signup` | sil (bekleyen ve tamamlanmış) | 4, 6 | Tamamlanmış kaydın rızaları `private.consent_record`'dadır (kalır) |
| `private.parcel_detail` `site_contact_name`, `site_contact_phone`, `access_note` | sil | 4, 5 | Başka taraf yoksa üçü de boşalır. Başka taraf varsa yalnız kişinin kendisi olan iletişim kişisi boşalır, erişim notunda kişinin adı ve telefonu takma ada çevrilir. Tapu ve yetki alanları kalır (H09 ispat). `--person-name`: o kişi olan iletişim kişisi boşalır, nottaki geçişler değişir |
| `private.application_garden_detail` `site_contact_*`, `access_note` | sil | 4, 5 | Kişinin başvurularında boşalır; `--person-name` için o parselin başvurularında kişinin geçişleri |
| `public.service_application` `customer_note` | sil | 4 | Başvuru satırı kalır (sözleşmenin kuruluşu) |
| `public.question`, `public.question_reply` (kişinin yazdıkları) | sil (gövde "[KVKK başvurusu üzerine silindi]", yazar boş) | 5 | Satır silinmez: uzmanın ve diğer sahibin cevapları soruya yabancı anahtarla bağlıdır ve diğer sahibin hizmetine aittir |
| `private.viewer_invitation` | sil | 6 | Kişinin gönderdiği, kişi için açılmış ya da kişinin telefonuna giden davetler; `--person-name` için o parselde o ada açılmış davetler |
| `public.parcel_access` | sil | 4, 6 | Kişinin sahip ve izleyici erişimi. Hesap Admin API ile ayrıca silinir ya da kapatılır |
| `private.message_outbox` (`purpose = login_code`) | sil | 4 | Kişinin telefonuna giden giriş kodları |
| `public.session_event` `boundary_pointer` `payload.name` | takma ad | 2 | Ekleme-yalnız. `--subject`: kişinin parsellerinde kişinin adına eşit adlar; `--person-name`: o parselde eşit adlar. Rol kalır (H07 ispatı için kaydın kendisi kalır, H25) |
| `public.session_event` notları (`field_notice_verbal`, `field_notice_objection`, `visit_blocked`) | takma ad (`--include-notes`) | 2 | Ekleme-yalnız serbest metin; kişinin adı ve telefonu (Türk numarasında boşluk, `0`/`+90` farkı gözetmeden) değişir. Yalnız ad, lakap gibi eşleşmeyen geçişler için `inventory` bütün not kimliklerini listeler; elle bakılır |
| `public.audit_event` `details` | takma ad | 2 | Ekleme-yalnız; `details`'e kişisel veri yazılmaz, yine de kişinin org'larında geçen ad, telefon ve e-posta değiştirilir. Satırlar 10 yıl kalır |
| `auth.users` | Admin API (yukarıda) | 4, 5, 6 | Faturalama satırı varsa silinemez, kapatılır |

### Bilerek değiştirilmeyenler

| Tablo | Neden |
| --- | --- |
| `private.billing_profile`, `private.payment_billing_snapshot`, `private.payment_event`, `public.payment`, `public.payment_item`, `public.refund` | Fatura, ödeme ve iade kayıtları; VUK md. 253, TTK md. 82: takvim yılı sonundan itibaren 10 yıl (H26 madde 1) |
| `public.quote`, `public.quote_item`, `public.service_order`, `public.service_order_item`, `public.garden_removal` | Mesafeli sözleşme, sipariş ve iade dayanağı (H26 madde 1); 10 yıl |
| `private.consent_record` | Aydınlatma teyidi ve rıza kayıtları, onaydan itibaren 10 yıl (H26 madde 1–2). Ad, telefon ya da e-posta taşımaz (kimlik ve IP özeti) |
| `private.message_outbox` (`purpose = notification`), `public.notification` | Bildirim kayıtları 12 ay (hizmetin ispatı); T09 temizler |
| `public.membership` | Personel rolleri (ops, uzman, saha); çalışan başvurusu bu betiklerle değil elle ele alınır |
| Bahçe verileri (parsel, ağaç, ölçüm, değerlendirme, bulgu, rapor, sınır) | Kişisel veri değil ya da raporla 10 yıl saklanır; diğer sahibin hizmetine aittir (H26 madde 5) |
| Görüntüler (panorama, kesit, yakın plan) | Görüntüdeki kişiler H01 gizlemesiyle (T20) karşılanır, bu betiklerle değil (H26 madde 7) |
| `private.signup_attempt`, `private.phone_login_attempt` | Yalnız tek yönlü özet; 2 gün / 1 gün içinde kendiliğinden silinir |
| `private.demo_*` | Demo turu: kişisel veri yok, sentetik veri |

## Yeni tablo eklerken

Yeni bir kişisel veri tablosu ekleyen iş (ör. `claude/hukuk-t03-teklif-kabul`, `claude/hukuk-t23-gorunurluk-kisiler`, `claude/hukuk-t05-bahce-ziyaret-donem`) şunları yapar:

1. **Kural seçimi:** saklama yükümlülüğü varsa `keep` (yalnız envanter), ekleme-yalnız ise `pseudonymize`, değilse `erase`. H26 maddesini ve saklama gerekçesini belirle.
2. **`inventory.sql`:** `-- ===== <şema.tablo> =====` başlıklı bir blok: `pg_temp.kvkk_inv('<şema.tablo>', count(*), '<kural>', '<H26>', '<not>')`. Sorgu `kvkk_param`, `kvkk_parcel`, `kvkk_org`, `kvkk_ident`, `kvkk_name` ve `pg_temp.kvkk_has_match(...)` ile kişiye bağlanır.
3. **`erase.sql` ya da `pseudonymize.sql`:** aynı başlıklı bir blok, "end of blocks" satırından önce. Blok `with changed as (update|delete … returning 1) select pg_temp.kvkk_count('<tablo>', '<işlem>', count(*)::integer) from changed;` biçimindedir. Her koşul kişiye ve `kvkk_org` / `kvkk_parcel`'e bağlanır; demo org'u bunlarda yoktur, doğrudan bir tabloya bakıyorsan `org_id not in (select org_id from private.demo_org)` ekle. Serbest metinde `pg_temp.kvkk_mask(metin, p.pseudonym)`, JSON'da `pg_temp.kvkk_json(...)` kullan. Ekleme-yalnız tablolar yalnız `pseudonymize.sql`'de değişir (orada `session_replication_role = replica` açıktır); `erase.sql`'de tetikleyiciler açıktır.
4. **Kişiyi tanıyan yeni bir alan** (ad, telefon, e-posta) eklendiyse `lib/prelude.sql`'deki `kvkk_ident`'e bir satır; kişinin yeni bir parsel ya da org bağlantısı varsa `kvkk_parcel` / `kvkk_org`'a bir satır.
5. **Bu README:** "Kapsanan tablolar" ya da "Bilerek değiştirilmeyenler" tablosuna bir satır.
6. **Test:** `apps/web/tests/integration/kvkk-scripts.test.ts`'e sentetik bir satır ve bir beklenti (kuru çalıştırma değiştirmez, `--apply` değiştirir, saklananlar kalır).

## Testler

- `shellcheck scripts/kvkk/*.sh` (CI: `ci-db-web`).
- `apps/web/tests/integration/kvkk-scripts.test.ts` (`pnpm web:test`; yerel Supabase çalışıyor ve sıfırlanmış olmalı): sentetik bir müşteri, siparişi, ödemesi ve rızaları, hissedar ve daveti, soru ve uzman cevabı, sınırı gösteren kişi ve saha olayları, bir demo org'u ile kuru çalıştırmayı, süren sözleşme reddini, sırayı, hissedar talebini, `--person-name` yolunu, takma adı, saklananları ve denetim kayıtlarını doğrular.
