# Demo turu verisi (İP13-B)

Demo turunun ([docs/demo-turu.md](../../../docs/demo-turu.md)) gösterdiği sentetik veri kümesi. Ziyaretçi, ücretli bir sahibin portalını bu veriyle gezer. Veri SQL dosyası olarak değil, `orchados-pipeline demo` komutuyla üretilir ve yüklenir; kod `services/pipeline/src/orchados_pipeline/demo/` altındadır ([services/pipeline/README.md](../../../services/pipeline/README.md), "Demo verisi").

`supabase/demo/scans.sql` (seed org'u, yerel geliştirme) ayrı bir şeydir; demo turuyla ilgisi yoktur.

## Ne var

Ayrı bir demo org'u, kurgusal kişiler ve iki parsel. Görüntüler sentetiktir ve üzerlerinde "SENTETIK ORNEK" damgası vardır. Kişi adları "Örnek …" biçimindedir; telefon yoktur; e-postalar yalnızca `demo.orchados.invalid` alan adındadır; ada/parsel bilgisi yoktur, konum temsilîdir (Gaziantep kırsalı). Hiçbir şey LLM'e gönderilmez.

| | A "Örnek Bahçe – Kuzey" | B "Örnek Bahçe – Dere" |
| --- | --- | --- |
| Yerler | 6 sıra × 12 = 72 yer, sıra arası 7 m, ağaç arası 6 m; 70 aktif ağaç (2 boş yer, biri herekli) | 4 × 8 = 32 yer; 31 aktif ağaç |
| Yapı | 7 erkek / 63 dişi (1:9), 3 aşısız, 6 genç, 2 yaşlı, 1 yeni dikim (`S3-11`), 2 çok gövdeli | 3 erkek / 28 dişi, 2 aşısız, 2 genç |
| Sınır | Saha yürüyüşü (sürüm 1), sahip kişisi onaylı | Aynı |
| Envanter | 2025-06-10, onaylı (yayımlanmış): 16 önizleme panorama, kapıyı geçen kapsama raporu (bütün koridorlar, 2 m'de bir kare), gövde etiketleri (her ağaca iki), ilk gözlem değerleri; 2025-06-12 doğrulama turu (4 kalem) | 2026-06-09, onaylı: 8 önizleme, kapsama raporu; doğrulama turu (1 kalem) |
| Periyodik tarama | 2025-07-15 ve 2026-07-14, yayımlanmış; 4 koridor, 8 m'de bir 40 nokta; 2026'da tam (4K) ve önizleme, 2025'te önizleme | 2026-07-16, yayımlanmış; 14 nokta |
| Kesitler | Ağaç başına en iyi iki yön | Aynı |
| Son ziyaretin sınıfları | 54 sağlıklı (yeni dikim dahil), 9 dikkat, 5 sorunlu, 1 kuru (`S4-3`), 1 yok (`S6-2`, kesilmiş); 2025'te 63 / 5 / 2 | 28 / 2 / 1 |
| Ölçümler | Ziyarette aktif ağaç başına, portalın okuduğu ve yazda geçerli her ağaç kodu (aşağıda); meyve yükü ortalaması 2025'te ~2,2, 2026'da ~1,3 (karnede "düşük") | Aynı |
| Bulgular | 2026'da 13 (kuru dal, gövde yarası ve zamk, belirgin kuruma, kuru ağaç, eksik ağaç, psil, yaprak sararması, boş salkım; parsel düzeyinde sulama sızıntısı ve kuru ot), 2025'te 5; hepsinde uzman açıklaması ve önerisi, kanıt bağı | 3 |
| Yakın plan | 9 ağaçta 2–3 fotoğraf (bulgusu olan ağaçlar) | 2 ağaçta 1–2 |
| Sorular | `S3-6`'da sahip sorar, parsel düzeyindeki sulama bulgusunda hissedar sorar; ikisini de uzman cevaplar | Yok |
| Hissedar | "Örnek Hissedar" (viewer, A); bekleyen davet yok (`viewer_invitation.phone` zorunlu) | Yok |
| Meyve türü (sürüm 2) | `antep_fistigi` | Aynı |
| Yabani ot (İP15) | 2026 taramasında `weed_height` = uzun (saha sorusu, `summer-v0.3`); portalda ot biçme kartı (fiyatsız, her gün talep ya da ön talep) | 2026 taramasında kısa; aynı kart |
| Ot biçme işi (İP15) | Yok | `H-2026-000001` (talep `de300000-…-000000000001`, oturum `de200000-…-000000000006`) tamamlandı ve ödendi (2026-06-15 talep, 06-24 iş): `mowing` oturumu (`captured`, `performer = robot`), `operation` (`robot`, `details.robot_model = maraba_i`; veri sürümü 3), talepte robot modeli MARABA-I, tarihçe, öncesi/sonrası sentetik fotoğraf. Talepte fiyat yoktu (tahmin sütunları boş); tutarı operasyon girdi: 3.000 TL KDV dahil. Karnede "bu bakımı orchadOS yaptı" notu |
| Robot notu (İP15) | düz / az / 60 cm | hafif / orta / 45 cm |

Hizmet katmanı (İP15, veri sürümü 2; robot filosu veri sürümü 3): demo org'unun `org_billing_setting` satırı yalnızca `services_enabled` açar (kayıt ve sahte ödeme kapalı), katalog satırı `weed_mowing` (açıklaması işi "otonom robotumuz MARABA-I" yapar diye anlatır), her meyve türü için sezonu (1 Mart–30 Haziran) ve hizmetin robot modeli MARABA-I (`service_type_robot_model`) yükleyiciden gelir (migration'ın tohumu demo org'larını atlar). Fiyat listesi yoktur: portal "Fiyat teklifle bildirilir" gösterir. Planlanmış iş yoktur: sabit geçmiş tarihlerle günü geçmiş ve sonsuza dek açık kalırdı. Ziyaretler geçmişte sabit olduğundan kart güne göre "ön talep" (sezon dışı) ya da "talep edilebilir" (sezonda; gözlem 60 günden eski) durumundadır; demo "önerilen" durumunu iddia etmez, doğrulama kartın var olduğuna bakar.

Öne çıkan ağaç **`S3-6`**: 2025'te sağlıklı, 2026'da sorunlu; kuru dal bulgusu, üç yakın plan, soru dizisi.

## Neden yaz ziyareti

Parsel karnesinin zararlı ve meyve yükü satırları yalnız ilkbahar ve yaz metriklerinden gelir (`pest_sign_*`, `fruit_load_scale`; `metric_definition.valid_seasons`, `apps/web/src/lib/expert/season.ts`: Haziran–Temmuz yaz). Budama kış, hasat tamamlama hasat metriğidir. Ekim ziyareti zararlı ve meyve yükü satırlarını boş bırakırdı. Yazın bakım satırını dip sürgünü doldurur; budama ve hasat satırları gerçek bir sahipte de boştur. İki tarama bir yıl arayla ve aynı mevsimde olduğu için karne puanı `methodology-v0.1`'in "aynı mevsim" karşılaştırmasını, meyve yükü geçen yılla kıyası gösterir.

Yükleyici metrik listesini yükleme anında `metric_definition`'dan okur ve yazılacak kodlar o ziyaretin mevsiminde geçerli değilse durur. Bugünkü kodlar: `dead_branch_scale`, `trunk_base_scale`, `crown_density_scale`, `dieback_pattern`, `dried_leaves_attached`, `basal_sprout_level`, `pest_sign_severity`, `fruit_load_scale` (erkek ağaçlarda yok), belirti olan ağaçlarda `pest_sign_type`; taramalarda ayrıca algoritma kaynaklı `tree_visible`.

## Kimlikler

| Ne | Kimlik |
| --- | --- |
| Demo org'u "orchadOS Demo (örnek veri)" | `de000000-0000-4000-8000-000000000001` (`org_billing_setting` yalnız `services_enabled = true`) |
| Parsel A / B | `de100000-0000-4000-8000-00000000000{1,2}` |
| Sahip, hissedar, uzman, saha, operasyon kişileri | `de900000-0000-4000-8000-00000000000{1..5}`, `ornek-sahip@`, `ornek-hissedar@`, `ornek-uzman@`, `ornek-saha@`, `ornek-operasyon@demo.orchados.invalid` |
| A envanter / A 2025 / A 2026 / B envanter / B 2026 | `de200000-0000-4000-8000-00000000000{1..5}` |
| Öteki satırlar | `uuid5(de0f0000-0000-5000-8000-000000000000, "v<sürüm>:<tür>:<anahtar>")` |

Kişiler `auth.users` + `auth.identities` satırlarıdır: `raw_app_meta_data = {provider, providers, demo_persona: true}` (`demo: true` **değil**), bütün GoTrue metin token sütunları `''`, `encrypted_password = ''`, telefon yok, `banned_until = 2999-01-01`. Hiçbiri giriş yapamaz; tek istisna yükleme sırasında operasyon kişisidir. Uzman, saha ve operasyon kişileri demo org'unun üyesidir; sahip kişisi iki parselin, hissedar kişisi A'nın `parcel_access` satırını taşır.

Tur ayarı (`private.demo_org.tour`): `parcel_id` A, `tree_id` `S3-6`, `session_id` A 2026, `previous_session_id` A 2025, `inventory_session_id` A envanteri.

## Yerelde yükleme

```bash
pnpm db:start && pnpm db:reset
pnpm db:demo-tour                              # full profil: derler (~3 dk) ve yükler, doğrular, açar
pnpm db:demo-tour --profile test --reset-local # CI ve e2e: küçük görüntüler; önce demo org'unu temizler
```

`--reset-local` demo org'unu `testing.purge_org` ile siler (kişiler kalır). `full` ve `test` farklı baytlar üretir; bir veritabanına yalnızca biri yüklenebilir, öteki için `pnpm db:reset` ya da `--reset-local` gerekir. Önbellek `services/pipeline/.demo-build/` altındadır (git'e girmez); ikinci çalıştırma derlemez, satır eklemez, dosya yüklemez.

Akış A'nın kayıt tablosu (`private.demo_org`) ve `demo-media` kovası henüz yoksa yükleyici uyarır; kayıt, ayna ve açma adımlarını atlar, veri ve medya yine yüklenir.

## Barındırılan projeler (`demo-data` iş akışı)

Elle tetiklenir: GitHub → Actions → `demo-data`.

1. `project = test|demo`, `action = load`: tam profili derler (ya da `reuse_build_run_id` ile önceki çalıştırmanın artefaktını indirir), boyut sınırını (150 MB) denetler, derlemeyi 30 gün saklanan artefakt olarak yükler, `demo load --target remote --verify` çalıştırır. Demo projesinde `--demo-only` hep verilir: projede demo org'u dışında bir org varsa hiçbir şey yazılmaz. `dry_run` SQL'i çalıştırıp geri alır.
2. Sonra ayrı bir çalıştırmayla `action = enable`: derleme yapmaz; kayıt satırı yüklü (`loaded_at`) ve doğrulama geçiyorsa demoyu açar, öteki demo org'larını kapatır. `action = disable` yalnızca kapatır.

Bağlantı: `supabase link` sonrası `supabase/.temp/pooler-url`'den oturum modu (5432) ve `PGPASSWORD` (veritabanı parolası). Medya `SUPABASE_URL` ve `SUPABASE_ANON_KEY` ile, operasyon kişisinin o çalıştırmaya özel parolasıyla yüklenir; parola sonunda silinir. Servis rolü anahtarı kullanılmaz. Pilot projesine demo verisi hiç yüklenmez.

Secret'lar: test projesi `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`; demo projesi aynı erişim token'ı ve `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`. Eksikse iş akışı uyarıyla atlanır; demo secret'ı eksikse test secret'ına düşülmez.

## Sürümler

Veri ekleme-yalnızdır ve sabit kimliklerle bir kez yüklenir. Ön kontrol sürüme bakar: sürüm kayıtlı ve `loaded_at` doluysa doğrulama geçtiğinde "already loaded" yazılır (baytlar karşılaştırılmaz; başka makinede derlenen kopya farklı bayt üretebilir). Yarım kalan bir yükleme yalnız aynı derlemeyle (`dataset_sha256`, iş akışında `reuse_build_run_id`) tamamlanır. Yeni bir sürüm yeni satır ekler, ekleme-yalnız satırlara dokunmaz. Sürümler birikimlidir: bugünkü sürüm **3**, önceki sürümlerin bütün satırlarını aynı kimlik ve medya tohumlarıyla (`SEED_VERSION = 1`) içerir; sürüm 2 hizmet katmanını ekler, sürüm 3 işi otonom robot MARABA-I'ye verir (hizmetin robot modeli; sürüm 2 yüklü hedefte katalog açıklaması, işin oturumu, `operation`'ı ve talebi kimlikle adlanmış dört `update`'le güncellenir, docs/demo-turu.md §10.3); son sürümü yüklemek bütün sürümleri sırayla uygulamaktır (`loader.VERSIONS == (DATASET_VERSION,)`). Kimlik anahtarına satırı getiren sürüm girer (`v2:…`), aynı nesnenin yeni sürümü yeni kimliktir.

İleride gerçek bir vitrin bahçesi (`dataset_source = showcase`) yeni bir sürüm olarak eklenebilir; derlemesi repo dışına yazılır (docs/demo-turu.md §10.5).
