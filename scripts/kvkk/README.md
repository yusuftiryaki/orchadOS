# scripts/kvkk — KVKK başvurularında elle silme ve takma ad betikleri (T11)

Silme ve anonimleştirme işlevi yazılımda yokken KVKK md. 11 başvuruları [KVKK Başvuru Prosedürü](../../docs/hukuk/kvkk-basvuru-proseduru.md)'ne göre elle karşılanır. Bu klasör, prosedürün 7. bölümündeki "gözden geçirilmiş elle silme ve takma ad betikleri"dir ([kararlar.md](../../docs/hukuk/kararlar.md) H26, takip işi T11).

Üç komut vardır:

| Komut | Ne yapar | Dosya |
| --- | --- | --- |
| `inventory` | Kişinin verisinin nerede olduğunu, satır sayılarını, hangi satırların saklama yükümlülüğüyle kaldığını ve neden kaldığını listeler; başvuru defterine yazılır. Elle bakılması gereken saha notlarının kimliklerini verir. Hiçbir şeyi değiştirmez | `inventory.sql` |
| `pseudonymize` | Ekleme-yalnız tablolarda kişinin adını, telefonunu ve e-postasını sabit bir takma adla değiştirir (H26 madde 2, "kayda geçirilen kontrollü istisna") | `pseudonymize.sql` |
| `erase` | Saklama gerekçesi olmayan kişisel veriyi siler ya da boşaltır (H26 madde 3–6) | `erase.sql` |

Ortak hazırlık (`lib/prelude.sql`): parametreler, kişinin parselleri ve org'ları, adları, telefonları ve e-postaları, kişiye bağlı denetim kayıtları, takma adı, süren sözleşme denetimi ve denetim kaydı. Komut dosyaları yalnız bunları okur.

## Güvenlik

- **Varsayılan kuru çalıştırmadır.** Her şey tek bir işlemde ve `ON_ERROR_STOP` ile çalışır; `--apply` verilmezse işlem sonunda geri alınır (`rollback`). Kuru çalıştırma, değişecek satır sayılarını yazar.
- **Hedef:** Varsayılan olarak yerel yığın (`docker exec supabase_db_orchados psql`; kap adı `KVKK_DB_CONTAINER` ile değişir). Barındırılan bir veritabanına yalnızca `--hosted` ile (adres `KVKK_DB_URL` ortam değişkeninden okunur, komut satırında ve süreç listesinde görünmez) ve terminalde sunucu adını yazarak onay verilerek bağlanılır; onaysız ya da terminal dışından çalışmaz. Adres yalnız `postgresql://kullanıcı:parola@sunucu[:port]/veritabanı[?sslmode=…]` biçiminde kabul edilir (parolada `@`, `/`, `?`, `#` yüzde kodlanır); başka bir biçim (ör. `host=… password=…`) adres ekrana yazılmadan reddedilir. Betik adresi ayrıştırıp `PGHOST`, `PGUSER`, `PGPASSWORD` gibi ortam değişkenleriyle `psql`'e verir; ekrana yalnız sunucu, port ve veritabanı adı yazılır. `--db-url <adres>` geriye dönük olarak çalışır ama parolayı süreç listesine koyar; uyarı verir.
- **Takma ad anahtarı:** `KVKK_PSEUDONYM_KEY` (en az 32 karakter, `A-Z a-z 0-9 + / = _ -`) her komutta gerekir. Şirketin parola yöneticisinde saklanır; veritabanına, repoya, başvuru defterine yazılmaz. Anahtar değişirse aynı kişinin yeni takma adı eskisinden farklı olur; bu yüzden değiştirilmez. Anahtar `psql`'e komut satırından değil standart girdiden gider.
- **Kapsam:** Her ifade kişiye (`--subject`) ya da kişiye ve parsele (`--person-name` + `--parcel`) bağlıdır. Demo org'ları (`private.demo_org`, ortak test projesinde de bulunabilir: [demo-turu.md](../../docs/demo-turu.md) §15.1) hiçbir zaman kapsama girmez; demo hesabı ya da demo parseli verilirse betik durur.
- **Saklama yükümlülüğü olan satırlara dokunulmaz:** fatura profili, teklif, sipariş, ödeme, ödeme anlık görüntüsü ve olayları, iade, bahçe çıkarma, rıza ve onay kayıtları (H26 madde 1).
- **Süren sözleşme:** Kişinin ödeme bekleyen ya da süren bir siparişi, ya da kişinin süren bir siparişiyle karşılanmayan ve pasif olmayan bir bahçede sahip erişimi (ops'un kâğıt sözleşmeyle açtığı sahip; iptal edilmiş ya da bitmiş bir çevrim içi siparişten sonra da) varsa `erase` ve `pseudonymize` durur (çıkış kodu 3, `kvkk_active_contract`). H26 madde 3: silme fesihle mümkündür. Yalnızca gerekçesi deftere yazılmış bir istisnada `--force-active --reason "<gerekçe>"` ile geçilir; gerekçe denetim kaydına girer, içine kişisel veri yazılmaz.
- **Sıra:** `erase --apply`, aynı başvuru için önce `pseudonymize --apply` çalışmadıysa durur (`kvkk_pseudonymize_first`): silme, takma ada çevirmenin aradığı adı ve telefonu da siler. Kapsamdaki saha notlarında kişinin adı ya da telefonu hâlâ geçiyorsa da durur (`kvkk_notes_pending`); notlar okunur ve önce `pseudonymize --include-notes --apply` çalıştırılır.
- **Yanlış kişi koruması:** Ayrıntı "Eşleştirme kuralları"nda. Kısaca: ad yalnız tam ad olarak (en az iki sözcük, sözcük sınırında) eşleşir; tek sözcüklü ad hiçbir yerde otomatik değişmez; denetim kaydında yalnız kişiye bağlı satırlar ve yalnız metin değerleri değişir; `--person-name` parselde hesabı olan birinin adıyla aynıysa betik durur (`kvkk_ambiguous_person`).
- **Çıktı:** Yalnızca sayılar, satır kimlikleri ve takma ad yazılır; ad, telefon, e-posta yazılmaz. Çıktı dosyaya kaydedilirse kişisel veri içermez, yine de başvuru defteriyle aynı erişim kısıtıyla tutulur.
- **Denetim kaydı:** Her `--apply`, kapsamdaki her org için bir `public.audit_event` satırı yazar (`private.audit(...)`): `action` `kvkk.pseudonymized` ya da `kvkk.erased`, `actor_role = system`, `details` içinde başvuru numarası (`request`), kişi türü (`user` / `person`), takma ad (`subject_ref`), `--person-name` için parsel kimliği, `--include-notes`, varsa `force_active` ve gerekçesi, ve tablo başına sayılar. Kişisel veri yazılmaz. Kayıt numarası deftere işlenir.

## Komutlar

```bash
scripts/kvkk/run.sh <inventory|erase|pseudonymize> \
  (--subject <auth kullanıcı uuid> | --person-name <ad soyad> --parcel <parsel uuid>) \
  --request <K-yyyy-nnn> [--include-notes] [--apply] \
  [--force-active --reason <gerekçe>] [--hosted | --db-url <postgres url>]
```

Her komuttan önce: `export KVKK_PSEUDONYM_KEY=…` (parola yöneticisinden).

| Seçenek | Anlamı |
| --- | --- |
| `--subject` | Hesabı olan kişi (sahip, hissedar, self-servis müşteri): Auth kullanıcı kimliği. Ops ekranındaki kullanıcı kimliği ya da `select id from auth.users where email = …` |
| `--person-name` + `--parcel` | Hesabı olmayan kişi: sınırı gösteren kişi, sahadaki iletişim kişisi, davet edilip hesabı açılmamış hissedar. Tam ad verilir: en az iki sözcük, her sözcük en az iki harf (tek sözcük başka kişilere de uyar, reddedilir). Ad, boşluk ve büyük-küçük harf farkı (Türkçe I/ı, İ/i dahil) gözetmeden karşılaştırılır. Ad, parselde hesabı olan birinin (sahip, hissedar, siparişi ya da başvurusu olan müşteri) adıyla aynıysa betik durur (`kvkk_ambiguous_person`): kişi hesap sahibiyse `--subject` kullanılır, değilse kim olduğu elle belirlenir |
| `--request` | Başvuru defteri numarası (`K-yyyy-nnn`) |
| `--include-notes` | `pseudonymize`: saha notlarındaki (`field_notice_sign`, `field_notice_verbal`, `field_notice_objection`, `visit_blocked`) ve operasyon notlarındaki (görüntü gizleme, sınır itirazı) ad ve telefon geçişlerini de değiştirir. Önce `inventory`'nin listelediği notlar okunur |
| `--apply` | Değişiklikleri kalıcı yapar; yoksa kuru çalıştırma |
| `--force-active --reason` | Süren sözleşme denetimini gerekçeyle geçer (yalnız `--subject`) |
| `--hosted` | Barındırılan veritabanı; adres `KVKK_DB_URL` ortam değişkeninden (oturum havuzu adresi, `postgres` kullanıcısı); terminalde onay ister |
| `--db-url` | Aynısı, adres komut satırından (önerilmez: parola süreç listesinde görünür) |

Çıkış kodları: `0` tamam, `2` hatalı seçenek, eksik anahtar ya da geçersiz adres (veritabanına gidilmez), `3` veritabanı reddi (süren sözleşme, sıra, bekleyen notlar, belirsiz kişi, tek sözcüklü ad, demo, bulunmayan parsel) ya da SQL hatası; işlem geri alınır.

### Adım adım (yerel örnek)

```bash
export KVKK_PSEUDONYM_KEY=…   # parola yöneticisinden
# 1. Envanter: deftere yazılır, notlar ve "review" satırları okunur.
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

# Barındırılan proje: aynı komutlar, --hosted ile (adres KVKK_DB_URL'de; terminalde onay istenir).
read -rs KVKK_DB_URL && export KVKK_DB_URL
scripts/kvkk/run.sh inventory --subject <uuid> --request K-2026-001 --hosted
```

### Eşleştirme kuralları (yanlış kişiye dokunmamak için)

- **Adlar** yalnız tam ad olarak eşleşir: sözcükler sırasıyla, aralarında herhangi bir boşlukla, öncesinde ve sonrasında harf ya da rakam olmadan. "Ali Can", "Ali Cantürk"e; "Test Müşteri", "Test Müşterisi"ne uymaz. Büyük-küçük harf ve Türkçe I/ı/İ/i farkı gözetilmez.
- **Tek sözcüklü adlar** (ya da tek harfli sözcük içeren adlar) hiçbir yerde otomatik eşleşmez: "Ece" "gece"de, bir uuid'in `4ece` grubunda, "Ali" "Halil"de geçer. Kişinin kayıtlı adı tek sözcükse `inventory` bunu `single-word names of the subject` satırında `review` olarak gösterir; sınır gösterenler ve notlar elle okunur. `--person-name` tek sözcükle hiç çalışmaz.
- **Telefonlar** son on hanesiyle (`+90`/`0` öneki ve ayırıcılar serbest) eşleşir, ama daha uzun bir rakam dizisinin ya da bir uuid grubunun içinde asla. **E-postalar** bütün adres olarak eşleşir.
- **JSON** (oturum olayı yükleri, denetim kaydı `details`): yalnız metin değerleri değişir; anahtarlar, sayılar ve uuid biçimli değerler değişmez.
- **`boundary_pointer`** adı yalnız kişinin tam adına (normalleştirilmiş) eşitse değişir; daha uzun ya da farklı yazılmış ad başka kişidir ve kalır. `inventory` kapsamdaki bütün sınır gösterenleri ve notları kimlikleriyle ve eşleşip eşleşmediğiyle listeler.
- **Denetim kaydı** (`public.audit_event`) yalnız kişiye bağlı satırlarda değişir: `--subject` için yapan ya da konu kişi ya da kişinin kayıtları (sahip profili, başvuru, başvuru bahçesi, teklif, sipariş, ödeme, iade, bahçe çıkarma) ve kişinin sahibi olduğu parseller (`details.parcel_id`); `--person-name` için o parsel. Org'un başka satırlarındaki eşleşmeler adaş olabilir: betik onları değiştirmez, `inventory` kimliklerini `review` olarak listeler, gerekiyorsa karar deftere yazılıp elle ele alınır.
- **`--person-name`**, parselde hesabı olan birinin adıyla aynıysa durur; hesabı olan birinin onayladığı daveti (`user_id` dolu) silmez.
- **Parsel iletişim bilgileri** (`parcel_detail`) toptan yalnız kişi parselin sahibiyken ya da sahibi olmuşken (sahip erişimi, kendi siparişi ya da başvurusu) ve parselde başka taraf yokken silinir. İzleyici ya da davetli olarak bağlı kişinin talebi sahibin parsel verisine dokunmaz; yalnız kişinin kendi iletişim kaydı ve nottaki tam adı ve telefonu değişir.

### Takma ad

`kvkk-` + HMAC-SHA256'nın ilk 8 onaltılık hanesi; anahtar `KVKK_PSEUDONYM_KEY`, girdi `--subject` için kullanıcı kimliği, `--person-name` için boşlukları sadeleştirilmiş küçük harfli ad ile parsel kimliğinin birleşimi. Aynı kişi için her çalıştırmada aynıdır; böylece kayıtlar kendi aralarında bağlantılı kalır.

Bu bir takma addır, anonimleştirme değildir (H26 madde 2 bunu kabul eder): anahtarı bilen biri, aday bir ad ya da kullanıcı kimliği için takma adı yeniden üretip eşleştirebilir. Anahtar veritabanında olmadığından org personeli (ops, saha) denetim kaydındaki parsel kimliğiyle bir ad listesini deneyerek takma adı çözemez. Kullanıcı kimliği ise saklanan fatura, rıza ve sipariş kayıtlarında kalır ve fatura profili adı taşır: hesabı olan kişi için takma ad, bu saklanan kayıtlar üzerinden kişiye bağlanabilir. Bu kayıtların erişimi ispat ve vergi denetimiyle sınırlıdır (H26 madde 1).

### Auth hesabı: Admin API ile, SQL ile değil

Betik `auth.users`'a dokunmaz. GoTrue kendi şemasındaki satırları (kimlikler, oturumlar, yenileme jetonları, denetim kaydı) birlikte yönetir; doğrudan SQL bu bağları kırabilir ve GoTrue sürümleriyle değişir. `erase --apply`'dan sonra:

Hangisinin uygulanacağını `inventory`'nin `auth.users` satırı yazar (`delete` ya da `BAN and scrub`).

- **Faturalama satırı ve aydınlatma teyidi yoksa** (teklif, sipariş, ödeme, iade, başvuru, bahçe çıkarma `customer_user_id` ile kullanıcıya `on delete restrict` bağlıdır; `private.owner_profile` ise `on delete cascade`): hesap silinir. Supabase panelinde Authentication › Users › kullanıcı › Delete user, ya da `curl -X DELETE "$SUPABASE_URL/auth/v1/admin/users/<uuid>" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"`. Silme üyelikleri ve erişimleri zincirleme siler; rıza kayıtları `subject_id` ile kalır.
- **Faturalama satırı varsa ya da sahip profilinde aydınlatma teyidi (`kvkk_consent = true`) varsa** hesap silinmez: faturalama satırları silmeyi engeller (H26 madde 1); hesabı silmek sahip profilini zincirleme siler ve aydınlatma metninin beyan edilen alınma tarihi (`kvkk_consent_at`, kâğıt alındı tarihi; `consent_record.recorded_at` yalnız giriş zamanıdır) kaybolur, oysa bu satır 10 yıl saklanır (aşağıdaki tablo). Ops'un kâğıt sözleşmeyle kaydettiği, siparişi olmayan pilot sahip de bu gruptadır. Hesap kalıcı olarak kapatılır ve iletişim bilgileri kaldırılır: `PUT /auth/v1/admin/users/<uuid>` gövdesi `{"ban_duration": "876000h", "email": "<takma ad>@kvkk.invalid", "phone": "", "user_metadata": {}}` (panelde: Ban user, sonra e-posta ve telefon). Sonra `inventory` yeniden çalıştırılır; `auth.users` satırı kalır, giriş yapılamaz.
- İşlem deftere yazılır. Hesap silindikten sonra rıza ve denetim kayıtları için aynı `--subject` ile `inventory` yine çalışır.

## Kapsanan tablolar

H26 maddeleri: 1 saklama yükümlülüğü, 2 ekleme-yalnız kayıtlar, 3 süren sözleşme, 4 biten sözleşme, 5 parselde başka sahip ya da hissedar, 6 hissedarın talebi, 7 görüntülerdeki kişiler. "Başka taraf": kişi dışında birinin parselde erişimi ya da süren siparişi olması.

| Tablo / sütun | Kural | H26 | Ayrıntı ve saklama gerekçesi |
| --- | --- | --- | --- |
| `private.owner_profile` `full_name`, `phone`, `email` | sil (ad → takma ad, telefon ve e-posta boş) | 4, 5 | Satır kalır: aydınlatma teyidi (`kvkk_consent`, `kvkk_consent_at`, `kvkk_text_version`) onaydan itibaren 10 yıl saklanır |
| `private.customer_signup` | sil (bekleyen ve tamamlanmış) | 4, 6 | Tamamlanmış kaydın rızaları `private.consent_record`'dadır (kalır) |
| `private.parcel_detail` `site_contact_name`, `site_contact_phone`, `access_note` | sil | 4, 5 | Kişi parselin sahibiyse ya da sahibi olduysa ve başka taraf yoksa üçü de boşalır. Başka taraf varsa ya da kişi parsele yalnız izleyici ya da davetli olarak bağlıysa (sahibin erişimi bitmiş olsa da) yalnız kişinin kendisi olan iletişim kişisi boşalır, erişim notunda kişinin tam adı ve telefonu takma ada çevrilir; sahibin verisi kalır (H25). Tapu ve yetki alanları kalır (H09 ispat). `--person-name`: o kişi olan iletişim kişisi boşalır, nottaki tam ad geçişleri değişir |
| `private.application_garden_detail` `site_contact_*`, `access_note` | sil | 4, 5 | Kişinin başvurularında boşalır; `--person-name` için o parselin başvurularında kişinin geçişleri |
| `public.service_application` `customer_note` | sil | 4 | Başvuru satırı kalır (sözleşmenin kuruluşu) |
| `public.question`, `public.question_reply` (kişinin sahip ya da izleyici olarak yazdıkları) | sil (gövde "[KVKK başvurusu üzerine silindi]", yazar boş) | 5 | Satır silinmez: uzmanın ve diğer sahibin cevapları soruya yabancı anahtarla bağlıdır ve diğer sahibin hizmetine aittir. Kişinin uzman ya da ops olarak yazdığı cevaplar (`author_role` `expert`, `ops`) başka müşterilerin hizmet kaydıdır, kalır (H25); envanterde `keep` |
| `private.viewer_invitation` | sil | 5, 6 | Kişi için açılmış ya da kişinin telefonuna giden (hesaba bağlanmamış) davetler, kişinin gönderdiği ve hiçbir hesabın kabul etmediği davetler; `--person-name` için o parselde o ada açılmış, hesaba bağlanmamış davetler. Kişinin gönderdiği ve başka bir hesabın kabul ettiği davet o hissedarın erişim kaydıdır: kalır, yalnız `invited_by` boşalır |
| `public.parcel_access` | sil | 4, 6 | Kişinin sahip ve izleyici erişimi. Hesap Admin API ile ayrıca silinir ya da kapatılır |
| `private.message_outbox` (`purpose = login_code`) | sil | 4 | Kişinin telefonuna giden giriş kodları |
| `public.session_event` `boundary_pointer` `payload.name` | takma ad | 2 | Ekleme-yalnız. `--subject`: kişinin parsellerinde kişinin tam adına eşit adlar; `--person-name`: o parselde eşit adlar. Rol kalır (H07 ispatı için kaydın kendisi kalır, H25). Eşleşmeyenler (farklı yazım, yalnız ad, başka kişi) `inventory`'de kimlikleriyle `review` |
| `private.boundary_pointer` `name` | takma ad | 2 | `boundary_pointer` olaylarının kopyası (T16; ad ve rol, telefon yok). Olayla aynı kural: yalnız kişinin tam adına eşit ad değişir; rol kalır. Ekleme-yalnız. Diğer adlar `inventory`'de kimlikleriyle `review` |
| `private.media_suppression` `note`, `private.boundary_dispute` `note` | takma ad (`--include-notes`) | 2 | Görüntü gizleme (T20) ve sınır itirazı (T16) kayıtlarındaki operasyon notları; ekleme-yalnız. Kapsamdaki parsellerde kişinin tam adı ve telefonu değişir; diğer notlar `review` olarak listelenir. Bekleyen not varken `erase --apply` durur (`kvkk_notes_pending`) |
| `public.session_event` notları (`field_notice_sign`, `field_notice_verbal`, `field_notice_objection`, `visit_blocked`) | takma ad (`--include-notes`) | 2 | Ekleme-yalnız serbest metin; JSON metin değerlerinde kişinin tam adı ve telefonu (Türk numarasında boşluk, `0`/`+90` farkı gözetmeden) değişir. Yalnız ad, lakap gibi eşleşmeyen geçişler için `inventory` bütün not kimliklerini listeler; elle bakılır |
| `public.audit_event` `details` | takma ad | 2 | Ekleme-yalnız; `details`'e kişisel veri yazılmaz, yine de kişiye bağlı satırlarda (yukarıda "Eşleştirme kuralları") metin değerlerinde geçen ad, telefon ve e-posta değiştirilir. Org'un diğer satırlarındaki eşleşmeler değişmez, `review` olarak listelenir. Satırlar 10 yıl kalır |
| `auth.users` | Admin API (yukarıda) | 4, 5, 6 | Faturalama satırı ya da aydınlatma teyidi varsa silinmez, kapatılır (sahip profili zincirleme silinmesin) |

### Bilerek değiştirilmeyenler

| Tablo | Neden |
| --- | --- |
| `private.billing_profile`, `private.payment_billing_snapshot`, `private.payment_event`, `public.payment`, `public.payment_item`, `public.refund` | Fatura, ödeme ve iade kayıtları; VUK md. 253, TTK md. 82: takvim yılı sonundan itibaren 10 yıl (H26 madde 1) |
| `public.quote`, `public.quote_item`, `public.service_order`, `public.service_order_item`, `public.garden_removal` | Mesafeli sözleşme, sipariş ve iade dayanağı (H26 madde 1); 10 yıl. `garden_removal`'ın `customer_note`, `ops_note`, `notice_channel`, `notice_received_on` sütunları kayıtla birlikte kalır |
| `private.consent_record` | Aydınlatma teyidi ve rıza kayıtları, onaydan itibaren 10 yıl (H26 madde 1–2). Ad, telefon ya da e-posta taşımaz (kimlik ve IP özeti). Portalın ilk giriş teyidi (T15, `source = portal`) ve metin özetleri (`text_sha256`, `display_sha256`) de buradadır |
| `private.contract_document` (+ `contract-documents` kovasındaki PDF'ler) | Sözleşme belgeleri (alıcının adı, adresi, iletişim bilgisi): onaydan itibaren 10 yıl (H12, H25). Süre dolunca satır ve nesne birlikte, denetimli istisnayla silinir (T10) |
| `private.boundary_approval` | Sınır beyanı (T16, H07): kullanıcı kimliği, metin sürümü ve özeti; sözleşmeyle birlikte 10 yıl |
| `private.kvkk_request` | Portal KVKK başvuruları (T11): başvuru defteri kaydı, sonuçlandırılmasından itibaren 10 yıl (saklama ve imha politikası §2.2). Talep metni burada kalır |
| `private.viewer_invitation` `declared_at`, `declaration_version`, `declaration_sha256` | Sahibin davet beyanı (T15): kişisel veri değil; davet satırının kuralına uyar |
| `private.message_outbox` (`purpose = notification`), `public.notification` | Bildirim kayıtları 12 ay (hizmetin ispatı); T09 temizler |
| `public.membership`, `private.staff_profile` | Personel rolleri ve rapordaki ad ve unvan (T23, H05); çalışan başvurusu bu betiklerle değil elle ele alınır |
| Bahçe verileri (parsel, ağaç, ölçüm, değerlendirme, bulgu, rapor, sınır) | Kişisel veri değil ya da raporla 10 yıl saklanır; diğer sahibin hizmetine aittir (H26 madde 5) |
| Görüntüler (panorama, kesit, yakın plan) | Görüntüdeki kişiler H01 gizlemesiyle (T20) karşılanır, bu betiklerle değil (H26 madde 7) |
| `private.signup_attempt`, `private.phone_login_attempt` | Yalnız tek yönlü özet; 2 gün / 1 gün içinde kendiliğinden silinir |
| `private.demo_*` | Demo turu: kişisel veri yok, sentetik veri |

## Yeni tablo eklerken

Yeni bir kişisel veri tablosu ekleyen iş (ör. `claude/hukuk-t03-teklif-kabul`, `claude/hukuk-t23-gorunurluk-kisiler`, `claude/hukuk-t05-bahce-ziyaret-donem`) şunları yapar:

1. **Kural seçimi:** saklama yükümlülüğü varsa `keep` (yalnız envanter), ekleme-yalnız ise `pseudonymize`, değilse `erase`. H26 maddesini ve saklama gerekçesini belirle.
2. **`inventory.sql`:** `-- ===== <şema.tablo> =====` başlıklı bir blok: `pg_temp.kvkk_inv('<şema.tablo>', count(*), '<kural>', '<H26>', '<not>')`. Sorgu `kvkk_param`, `kvkk_parcel`, `kvkk_org`, `kvkk_ident`, `kvkk_name` ve `pg_temp.kvkk_has_match(...)` ile kişiye bağlanır.
3. **`erase.sql` ya da `pseudonymize.sql`:** aynı başlıklı bir blok, "end of blocks" satırından önce. Blok `with changed as (update|delete … returning 1) select pg_temp.kvkk_count('<tablo>', '<işlem>', count(*)::integer) from changed;` biçimindedir. Her koşul kişiye ve `kvkk_org` / `kvkk_parcel`'e bağlanır; demo org'u bunlarda yoktur, doğrudan bir tabloya bakıyorsan `org_id not in (select org_id from private.demo_org)` ekle. Serbest metinde `pg_temp.kvkk_mask(metin, p.pseudonym)`, JSON'da `pg_temp.kvkk_mask_jsonb(json, p.pseudonym)` (yalnız metin değerleri; anahtar ve uuid değişmez), JSON metni taşıyan sütunda `pg_temp.kvkk_mask_payload(...)` / `pg_temp.kvkk_payload_has_match(...)` kullan. Org genelindeki bir tabloda yalnız kişiye bağlı satırları değiştir (`kvkk_audit_scope` örneği); org genelindeki diğer eşleşmeleri `inventory`'de `review` olarak listele. Ekleme-yalnız tablolar yalnız `pseudonymize.sql`'de değişir (orada `session_replication_role = replica` açıktır); `erase.sql`'de tetikleyiciler açıktır.
4. **Kişiyi tanıyan yeni bir alan** (ad, telefon, e-posta) eklendiyse `lib/prelude.sql`'deki `kvkk_ident`'e bir satır; kişinin yeni bir parsel ya da org bağlantısı varsa `kvkk_parcel` / `kvkk_org`'a bir satır.
5. **Bu README:** "Kapsanan tablolar" ya da "Bilerek değiştirilmeyenler" tablosuna bir satır.
6. **Test:** `apps/web/tests/integration/kvkk-scripts.test.ts`'e sentetik bir satır ve bir beklenti (kuru çalıştırma değiştirmez, `--apply` değiştirir, saklananlar kalır), ayrıca bir adaş ya da alt dize satırı ve değişmediği beklentisi (`untouchable()`).

## Testler

- `shellcheck scripts/kvkk/*.sh` (CI: `ci-db-web`).
- `apps/web/tests/integration/kvkk-scripts.test.ts` (`pnpm web:test`; yerel Supabase çalışıyor ve sıfırlanmış olmalı): sentetik bir müşteri, siparişi, ödemesi ve rızaları, hissedar ve daveti, soru ve uzman cevabı, sınırı gösteren kişi ve saha olayları, bir demo org'u ile kuru çalıştırmayı, süren sözleşme reddini (iptal edilmiş siparişten sonraki sahip erişimi dahil), sırayı ve bekleyen notları, hissedar talebini (sahibin erişimi bitmişken), hissedar sürerken sahibin talebini, `--person-name` yolunu ve sahip adıyla çakışma reddini, takma adı, saklananları ve denetim kayıtlarını doğrular. Yanlış kişi regresyonları: daha uzun adaş ("Kemal Bekçioğlu", "Test Müşterisi"), bir sözcüğün içindeki ad ("gece"deki "Ece"), adı ve telefon hanelerini taşıyan uuid'ler, daha uzun rakam dizisindeki telefon, kişiye bağlı olmayan denetim satırı ve başka parseldeki aynı ad hiçbir komutla değişmez.
