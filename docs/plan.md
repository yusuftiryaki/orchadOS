# MVP Geliştirme Planı

18 Ekim 2026 · Yusuf

Hedef, ilk kış denetim raporlarını **8 Mart 2027**'de pilot bahçe sahiplerine teslim etmek (Kapı 2). Bunun için yaklaşık 20 haftada ~55 günlük geliştirme işi gerekiyor. Bu da haftada ~20 saat demek; yan proje için sıkı bir tempo. Plan bu yüzden işleri önceliğe göre sıralar ve geride kalınırsa nelerin kesileceğini baştan söyler.

Ürün tanımı [MVP.md](MVP.md), veri modeli [veri-modeli.md](veri-modeli.md), kit [tarama-kiti.md](tarama-kiti.md) dosyalarında.

## Kilometre taşları

| Tarih | Kilometre taşı | Ne hazır olmalı |
| --- | --- | --- |
| 31 Ekim 2026 | M0 – Geliştirme ortamı | Repo iskeleti, iki devcontainer, şemanın ilk sürümü başlamış |
| 20 Aralık 2026 | M1 – Kapı 1: yöntem kararı | Kit çalışıyor; kendi bahçende tek koridor taraması; PPK, zaman eşleme ve gövde üçgenleme denendi; ağaç eşleştirme doğruluğu ölçüldü |
| 18 Ocak 2027 | M2 – Envantere hazır | Saha uygulamasının envanter modu, işleme hattı, ofis üçgenleme aracı |
| 15 Şubat 2027 | M3 – Kış denetimine hazır | Yakın plan akışı, uzman paneli, pilot envanterleri tamam |
| 8 Mart 2027 | M4 – Kapı 2: ilk raporlar | Sahip portalı; kış raporları uzman imzasıyla teslim |

## Zaman çizelgesi

```mermaid
gantt
    title İlk kış raporları 8 Mart 2027'de teslim
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    section Ortam ve veri
    İP0 Repo ve geliştirme ortamı      :ip0, 2026-10-20, 2026-10-31
    İP1 Veri şeması ve örnek veri      :ip1, 2026-10-27, 2026-11-14
    section Donanım ve deneme
    İP2 Kit siparişi ve teslim süresi  :ip2a, 2026-10-20, 2026-11-15
    İP2 Kit montajı ve GNSS kaydedici  :ip2b, 2026-11-15, 2026-12-05
    İP3 Teknik denemeler               :ip3, 2026-11-20, 2026-12-20
    Kapı 1                             :milestone, k1, 2026-12-20, 0d
    section Yazılım
    İP4 İşleme hattı                   :ip4, 2026-12-01, 2027-01-20
    İP5 Ofis üçgenleme aracı           :ip5, 2026-12-15, 2027-01-20
    İP6 Saha uygulaması                :ip6, 2026-12-01, 2027-02-05
    İP7 Uzman paneli                   :ip7, 2027-01-15, 2027-02-20
    İP8 Sahip portalı                  :ip8, 2027-01-20, 2027-03-05
    section Saha
    Pilot envanterleri                 :env, 2027-01-18, 2027-02-14
    Kış denetimi                       :kis, 2027-02-15, 2027-02-28
    Kapı 2                             :milestone, k2, 2027-03-08, 0d
    section Operasyon
    İP10 Uzman, pilot sahipler, KVKK   :ip10, 2026-10-20, 2027-01-15
    İP11 İşleme istasyonu              :ip11, 2026-12-15, 2027-01-10
    section Müşteri
    İP12 Müşteri edinme ve ödeme       :ip12, 2026-10-28, 2026-11-20
    İP13 Demo turu                     :ip13, 2026-10-28, 2026-11-07
    İP14 Bahçe yönetimi                :ip14, 2026-10-28, 2026-11-09
    İP15 Hizmet katmanı: ot biçme      :ip15, 2026-11-02, 2026-11-08
    section Araştırma
    İP16 LiDAR ölçümleri (yazılım)     :ip16, 2026-11-05, 2026-11-12
    İP17 3D dünya (Faz 1)              :ip17, 2026-11-05, 2026-11-09
```

**Kritik yol:** Kit parçalarının teslim süresi → teknik denemeler → işleme hattı → pilot envanterleri → kış denetimi. Kit siparişi gecikirse her şey kayar; bu yüzden ilk hafta verilmeli.

## İş paketleri

| İP | İş paketi | Öncelik | Tahmini efor | Tamam sayılması için |
| --- | --- | --- | --- | --- |
| İP0 | Repo ve geliştirme ortamı | P0 | 1,5 gün | Repo iskeleti; `core` ve `mobile` devcontainer'ları açılıyor |
| İP1 | Veri şeması ve örnek veri | P0 | 3 gün | Hedef veri modelinin MVP alt kümesi migration olarak yazılı; 300 ağaçlı sentetik bir bahçe örnek verisi; satır bazlı yetki kuralları |
| İP2 | Kit ve GNSS kaydedici | P0 | 5,5 gün | Kit monte; ESP32 ham GNSS'i ve PPS'i microSD'ye kaydediyor; telefona Bluetooth ile durum gönderiyor |
| İP3 | Teknik denemeler | P0 | 5 gün | Tek koridor taraması; PPK çözümü; QR ile zaman eşleme; ~20 ağaçta gövde üçgenleme ve elle ölçümle karşılaştırma; ısınma testi |
| İP4 | İşleme hattı v0.1 | P0 | 8 gün | Alım ve doğrulama, PPK, zaman eşleme, kare seçimi, panorama (4K + 2K), ağaç kesitleri, yükleme; komut satırından çalışıyor |
| İP5 | Ofis üçgenleme aracı | P0 | 6 gün | Harita + iki panorama görünümü; tıklayarak üçgenleme; sıra oturtma, kodlama, boş yerler; doğrulama listesi |
| İP6 | Saha uygulaması v0.1 | P0 | 8 gün | Giriş, günün görevleri, oturum başlat/bitir, QR saat, GNSS durumu, kapsama haritası, sınır köşesi işaretleme, yakın plan akışı, çevrimdışı senkronizasyon |
| İP7 | Uzman paneli v0.1 | P0 | 5 gün | Ziyaret kuyruğu; ağaç başına bu ve önceki ziyaretin kesitleri; ölçek girişi ve onayı; bulgu ve öneri; rapor imzası |
| İP8 | Sahip portalı v0.1 | P0 | 8 gün | Giriş; bahçelerim; parsel karnesi; sağlık haritası; ağaç karnesi; işaretçili panorama gezisi; PDF rapor |
| İP9 | AI worker v0.1 | P1 | 4 gün | Kış etiketlerinden değerlendirme seti; Batch ile ön değerlendirme; uzman paneline öneri olarak düşüyor. İlkbahar denetiminden (15 Nisan) önce |
| İP10 | Operasyon hazırlıkları | P0 | 4 gün + dış süreler | Metodoloji v0 (ölçekler, referans fotoğraflar), KVKK aydınlatma ve rıza metinleri, sözleşme taslağı, uzman anlaşması, pilot sahiplerin onayı |
| İP11 | İşleme istasyonu | P0 | 1 gün | Pilotta bulutta (karar 22 Ekim): ham video ofisten buluttaki depoya yüklenir, GPU'lu sanal makine iş başına açılıp kapanır; işleme hattı orada çalışıyor |
| İP12 | Müşteri edinme ve yönetimi | P1 | 12 gün | Site, self-servis kayıt (SMS doğrulaması, rızalar), başvuru, teklif, kartla (iyzico) ve havaleyle ödeme, makbuz, iade, back office; bayraklar kapalıyken birleşir. Tasarım: `docs/musteri-yonetimi.md` |
| İP13 | Demo turu | P1 | ~7 gün | Bahçe sahibi adayı hesap açmadan ve ödemeden, ayrı demo projesinde (`demo.<alan adı>`) geçici bir hesapla iki sentetik bahçeyi sahip portalında gezer; rehberli tur, filigranlı PDF'ler; demo hesabı hiçbir şey yazamaz; anahtarlar kapalıyken birleşir. Tasarım: [demo-turu.md](demo-turu.md) |
| İP14 | Bahçe yönetimi | P1 | ~8 gün | Müşteri üyeliği boyunca bahçe ekler ve çıkarır: tek üyelik dönemi, ek sipariş ve kalan döneme göre orantılı fiyat (`pricing-v2`), son ek günü; bahçe bazında çıkarma (30 gün, dönem sonu ya da açık cayma), kullanılmayan ziyaret iadesi, 90 gün salt okunur erişim; yenileme bütün bahçeleri kapsar; hukuk taslaklarının ikinci sürümleri; `garden_changes_enabled` kapalıyken birleşir. Tasarım: [bahce-yonetimi.md](bahce-yonetimi.md) |
| İP15 | Hizmet katmanı: yabani ot biçme | P1 | ~6 gün | Sahip, bahçesinin durumuna (saha sorusu `weed_height`) ve mevsime göre ot biçme hizmetini önerilmiş görür ve portaldan talep eder; sezon dışında ön talep. Genel hizmet kataloğu (`service_type`), talep ve tarihçe, fiyat sürümlü fiyat listesinde (`price_list_service_item`, `service-v1`; fiyat belirlenmedi, yayımlı fiyat yoksa "Fiyat teklifle bildirilir" ve ops tutarı elle girer), meyve türüne göre sezon, planlamada `mowing` oturumu, öncesi/sonrası fotoğraf kanıtı, `operation` kaydı, elle ödeme kaydı, parsel başına robot uygunluk notları, bildirimler; karnede "bu işi orchadOS yaptı" uyarısı. İşi otonom robotumuz MARABA-I yapar; sahip robotu seçer, fiyat robota göre (robot filosu ↔ bahçe sahibi eşleştirme, sahip kararı 2 Kasım 2026). Sahip kararıyla (2 Kasım 2026) `services_enabled` her ortamda açık. Tasarım: [MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme) |
| İP16 | LiDAR ölçümleri | P2 (araştırma) | ~5 gün yazılım + pilotta doğrulama | LiDAR'lı kitin kayıtlı nokta bulutundan ağaç başına: yapraklı dönemde taç çapı, boy, taç hacmi ve büyüklük sınıfı önerisi; kışın dal iskeleti (ana kol sayısı, odun hacmi) ve iki kış taraması arasında budama analizi (kesim sayısı, kesilen odun hacmi, `pruning_status` önerisi). Sentetik ağaçlarla test edilmiş hat aşamaları (`orchados-pipeline lidar ...`), ölçümlerin `record_lidar_measurements` ile `algorithm` kaynaklı yazılması. Sahip kararıyla (5 Kasım 2026) doğrulama beklenmeden karnede ve gezide sahibe gösterilir; pilotta referans ağaçlarda elle ölçümle karşılaştırılır. Kayıt adımı (MCAP → SLAM + PPK → `cloud.ply`) ayrı iş. Tasarım: [lidar-olcumleri.md](lidar-olcumleri.md) |
| İP17 | 3D dünya | P2 (araştırma) | ~4 gün (Faz 1) | 360° gezide bir düğmeyle panorama fotoğrafı LiDAR bulutuna dönüşür: ilk kare panoramanın aynısı, kameradan yayılan tarama dalgası, kamera yükselir, bahçe 3D görünür, her ağaçta boy, taç çapı ve taç tabanı çizilir, ağaç seçilince ölçüleri, renk kipleri (fotoğraf, boy, taç çapı), aynı panoramaya geri dönüş. Sahibe yalnız türetilmiş, zamansız web bulutu açılır (`world_cloud`). `orchados-pipeline lidar world`, demo verisi sürüm 5. Faz 2: akıtma, ziyaretler arası büyüme, kış iskeleti ve budama; Faz 3: uzman ve ofis. Tasarım: [3d-dunya.md](3d-dunya.md) |

**Durum (11 Kasım 2026)**

| İP | Durum | Not |
| --- | --- | --- |
| İP0 | Tamam | Repo iskeleti, `core` ve `mobile` devcontainer'ları, bulut ortamı |
| İP1 | Tamam (PR #1, #7) | Şema, satır bazlı yetki, sentetik bahçe; yayımlanmamış sonuçlar sahipten gizli; son değerlendirme/ölçüm görünümleri (önce en yeni oturum, aynı oturumda kaynak önceliği); `media` depolama alanı; 173 pgTAP testi |
| İP2 | Yazılım tamam (PR #2, #7, #22) | Firmware 0.3.0: BLE durum mesajında GPS zamanı ve konum; 74 birim testi, ESP32 derlemesi. Açık: gerçek donanım testleri (README'deki adımlar), kit gelince |
| İP3 | Başlamadı | Teknik denemeler (tek koridor, PPK, QR ile zaman eşleme, gövde üçgenleme doğruluğu, ısınma) kitin montajını bekliyor. Kapı 1'in (20 Aralık) önkoşulu |
| İP4 | Çekirdek + yükleme tamam (PR #3, #4, #11) | 97 test; `upload` komutu: türetilmiş dosyalar `media` alanına, kayıtlar `capture`/`asset`/`asset_source`'a; ham kayıtlar istasyonda kalır. Açık: gerçek PPK denemesi (İP3), büyük ziyarette yükleme süresi |
| Entegrasyon | Tamam (PR #4) | Sözleşmeler `docs/arayuzler.md` içinde |
| İP5 | v0.2 tamam (PR #9, #15) | Ofis üçgenleme aracı: tıklayarak üçgenleme, sıra oturtma ve kodlama, boş yerler, doğrulama listesi (CSV), kayıt; 12 sentetik ağaç 30 cm içinde. v0.2: panoramalar depodan, `save_inventory` tek işlemde, gövde tıklamaları `trunk_label` tablosunda (etiketli veri) |
| İP7 | v0.1 tamam (PR #12) | Ziyaret kuyruğu, ağaç ağaç inceleme (bu ve önceki ziyaretin kesitleri), AI'ı kabul/düzelt, bulgular, `publish_session` ile imza ve yayın; yayın sadece uzmanla, geri alınamaz, sonuçlar yayından sonra donar |
| İP8 | v0.1 tamam (PR #13) | Bahçelerim, parsel karnesi, sağlık haritası, ağaç karnesi ve fotoğraf geçmişi, işaretçili 360° gezi, yazdırma/PDF, telefon görünümü |
| Panorama ve gezi | Tamam (PR #104) | Ofis, uzman ve gezi görüntüleyicileri tek kancada (`use-panorama-viewer`); kapsamlı birim ve tarayıcı testleri, 13 hata düzeltmesi (kilitlenen ofis görüntüleyicisi, WebGL bağlam sızıntısı, adres ve Geri, imza süresi, klavye erişimi, her çizimde yeniden kurulan gezi haritası), önceden imzalama ve indirme. Envanter, test matrisi ve ölçümler: [panorama-gezi.md](panorama-gezi.md) |
| Gezide yakınlaştırma | Tamam (PR #122) | Ağaç işaretçisi ağaca döner ve yakınlaşır; panel (sınıf, uzaklık, soldaki/sağdaki ağaç, ağaç karnesi, genel görünüm); çift tıklamayla yakınlaşma; görüş alanı 10°'ye kadar; yürürken açılış yakınlaştırmasına dönüş, zaman yolculuğunda koruma. Ayrıntı: [panorama-gezi.md](panorama-gezi.md) §1.4 |
| CI | Tamam (PR #10) | Her PR'da bileşen testleri GitHub Actions'ta; migration'lar `main`'den Supabase test projesine; web Vercel'de. Bkz. `docs/deployment.md` |
| İP10 | Metodoloji v0 taslağı (`docs/metodoloji.md`) | Uzmanla kesinleşecek maddeler bölüm 11'de. Rol rol akış: `docs/kullanim-kilavuzu.md` |
| Metodoloji v0.2 | Tamam (PR #90) | "Kapsamlı" paketin 6 ziyaretlik takvimi (uzman ajan kararı, [uzman-ajan-onerileri.md](uzman-ajan-onerileri.md) bölüm 7). Ay–mevsim eşlemesi sürüme bağlı (v0.2: kış Kasım–Mart, yaz Haziran–Ağustos), web, AI worker ve saha uygulamasında ortak test vektörleriyle (`test-vectors/season.json`); saha uygulamasının Kasım tutarsızlığı giderildi. Yeni ziyaretler `methodology-v0.2`. Migration `20261103100800`: hırsızlık izi, dal kırığı, ağaç altı yığın yazın da; don hasarı kışın da (yalnız uzman). Saha: `winter-v0.2` (kabaran tomurcuk), `summer-v0.2` (erken boşaltılmış salkım, parsel sorusu tel/çit geçidi), ön kontrolde tekrar giriş süresi ve hasat/çöpleme. Takip: `leafhopper`, `weed_cover` (İP15'te parsel sorusu `weed_height` olarak), `session.visit_slot` |
| İP12 tasarım | Tamam (PR #52) | `docs/musteri-yonetimi.md` |
| İP12-A1 | Tamam (PR #55) | Veri modeli ve kayıt: bütün faturalama tabloları (14 `public`, 8 `private`), sütun yetkileri, kayıt ve rıza fonksiyonları, `customer-signup` Edge Function, katalog ve başvuru fonksiyonları, `ops_find_user_id` sertleştirmesi, örnek müşteri (`customer@example.com`) |
| İP12-B | Tamam (PR #54) | Ödeme sağlayıcı: iyzico Checkout Form ve sahte sağlayıcı, `payments`, `payment-callback`, `payment-webhook` Edge Function'ları. Açık: iyzico sandbox kontrol listesi (`docs/deployment.md`) |
| İP12-C | Tamam (PR #53) | Herkese açık site, `/kayit` arayüzü, bayraklar, Turnstile widget'ı |
| İP12-A2 | Tamam (PR #56) | Teklif, sipariş, ödeme, makbuz, iade fonksiyonları; bildirimler, `pg_cron` işleri |
| İP12-D | Tamam (PR #58) | Müşteri portalı: başvuru, teklif, sipariş, kartla ve havaleyle ödeme, hesap |
| İP12-E | Tamam (PR #57) | Back office: başvuru inceleme, teklif, havale kaydı, iade, ödeme incelemesi, ayarlar |
| İP12 entegrasyon düzeltmesi | Tamam (PR #61) | Bütünleşik incelemenin bulguları: alıcı e-postası, `payment_in_progress` eşlemesi, Turnstile olmadan kayıt kapalı, geri alma anahtarı, deploy runbook'u (`docs/gorevler/ip12-entegrasyon-duzeltme.md`). Bayraklar barındırılan projelerde hâlâ kapalı |
| İP13 tasarım | Tamam | [demo-turu.md](demo-turu.md) (sürüm 2) |
| İP13-A | Tamam (PR #63) | Demo erişimi: `private.demo_*` tabloları, yazma kilidi, hesap kilidi, erişim kapsamı, `demo-start` Edge Function, `deploy-db-demo` ve pilot denetimleri |
| İP13-B | Tamam (PR #64) | Demo verisi: sentetik medya, `orchados-pipeline demo`, `pnpm db:demo-tour`, `demo-data` iş akışı |
| İP13-C | Tamam (PR #65) | Demo arayüzü: demo sunucusu, `/demo`, oturum kapısı ve bant, rehberli tur, filigranlı PDF, uçtan uca test |
| İP13 entegrasyon düzeltmesi | Tamam (PR #66) | Bütünleşik incelemenin bulguları: sınır bildirimleri (PDF, görüntü), tur metni, bant, tek GitHub Environment modeli (`test`/`demo`/`pilot`), demo kilidinde Vault `orchados_cron_secret`, demo derleme önbelleği, migration zaman damgası denetimi (`docs/gorevler/ip13-entegrasyon-duzeltme.md`) |
| İP13 ortak barındırma | Tamam (PR #77, #80, #83, #84) | Ücretsiz plandaki iki proje sınırı yüzünden demo şimdilik test projesinde: `provision-demo` `host=test\|separate`, repo değişkeni `DEMO_HOST=test` ile `deploy-db-demo`/`demo-data` test secret'larına, `deploy-db`'de ortak demo kilitleri (`scripts/demo-lock-check.sh`), `demo-start`'ta `DEMO_*` secret tercihi ([demo-turu.md](demo-turu.md) §15.1, `docs/gorevler/ip13-demo-ortak-proje.md`). İnceleme düzeltmeleri: ortak kilit `DEMO_*` secret'larını, `public` kipi ve canlı Turnstile anahtarını ister; `provision-demo` kalan `dev` kipini siler, `host=test`'te pilot URL'si ve test ref'i zorunlu; kilit SQL'i yerel veritabanında sınanır (`scripts/test-demo-lock-sql.sh`) |
| Pilot kaydı açılışı | Tamam (PR #109) | Sahip kararı (29 Ekim): pilotta ana sayfa → demo → kayıt yolculuğu açılır, yayın şartları beklenmeden (hukuki metinler değişmez, teknik kapılar atlanmaz). `provision-pilot-signup` iş akışı (Edge secret'ları, Vault, Vercel, `accepts_signups`, `sms_ready` raporu), `deploy-db`/`deploy-db-pilot`'ta Vault `signup_cleanup_url` (test dağıtımının kırmızısı), "Kayıt yakında" sayfasında sonraki adımlar, üç sunuculu e2e (`docs/deployment.md` › Pilot kaydı açma / kapama). Açık (sahip): Netgsm, Turnstile alan adı listesi |
| İP13 yayına alma | Açık (insan eylemi) | Barındırılan projelerde demo kapalı. Sıra: (1) GitHub Environment'ları `test`, `demo`, `pilot` ve secret'ların taşınması, repo düzeyindeki veritabanı secret'larının silinmesi; demo projesi açılana kadar `deploy-db-demo` devre dışı (`docs/deployment.md` › GitHub secret'ları ve ortamları); (2) test projesinde duman testi; (3) demo projesi: Supabase, Vercel (önizlemeler kapalı), DNS, Edge secret'ları, Vault, Auth, harcama tavanı, `demo-data` yükleme ve açma; (4) pilot sitesinde `ORCHADOS_DEMO_URL` ([demo-turu.md](demo-turu.md) §15–§16) |
| Demo verisi v2→v3 yükseltmesi | Tamam (PR #120) | Test projesinde `demo-data load` sürüm 3'te durdu: sentetik medya işlemciye göre farklı bayt üretir (OpenCV float çekirdekleri AVX2/AVX-512/IPP), barındırılan ön kontrol ise baytları karşılaştırıyordu. Tamamlanmış yüklemenin üstünde eski baytlar kalır, yalnız satırların gösterdiği dosyalar yüklenir; `robot_upgrade` talebin ek sözleşme sürümünü de günceller; iş akışı derlemeyi sürümsüz tek klasöre yazar ve artefaktı yine saklar ([demo-turu.md](demo-turu.md) §10.2–10.4) |
| İP14 tasarım | Tamam (PR #68) | [bahce-yonetimi.md](bahce-yonetimi.md) (sürüm 2); dört akış, iki dalga (§17) |
| İP14-A | Tamam (PR #71) | Veri modeli ve sözleşmeler: `garden_removal`, ek sipariş, `pricing-v2`, çıkarma ve iade, housekeeping, migration'lar `20261102120000`–`20261102120400` |
| İP14-B | Tamam (PR #69) | Hukuk taslakları v2 (`mesafeli-v2-taslak`, `iade-v2-taslak`, `onbilgi-v2-taslak`), site metinleri, avukat soruları (`docs/hukuk/README.md` 15–23), doküman güncellemeleri |
| İP14-C | Tamam (PR #74) | Müşteri portalı: üyelik kartı, bahçe ekleme, ek teklif, bahçe çıkarma formu, salt okunur bant |
| İP14-D | Tamam (PR #73) | Back office: çıkarma kuyruğu, ek teklif, üyelik ve bahçeler paneli, yenileme ön seçimi, ayarlar |
| İP14 entegrasyon incelemesi | Tamam (PR #78) | Bütünleşik incelemenin bulguları: kesin başarısız iade çıkarma iadesinden düşülmez, temel sipariş bitince para tutan ek sipariş iptal ve iade edilir, ödeyen ikinci sahibin erişimi korunur, portalda ops'un açtığı çıkarma geri alınamaz (`removal_initiated_by`), anahtar kapalıyken sunucu da ek bahçeyi reddeder ve ops başvuru sayfası İP12 teklifine döner, yenileme ön seçimi ek siparişleri kapsar; migration `20261102120500` (`docs/gorevler/ip14-entegrasyon-duzeltme.md`) |
| Hukuki kararlar | Tamam (PR #76, #79) | [hukuk/kararlar.md](hukuk/kararlar.md) H01–H34 metinlere uygulandı: `kvkk-v2-taslak`, `riza-v2-taslak`, `gizlilik-v2-taslak`, `mesafeli-v3-taslak`, `onbilgi-v3-taslak`, `iade-v3-taslak`, yeni `bahcede-v1-taslak` (`/bahcede-bulunanlar`) ve iç belgeler; isteğe bağlı rıza kutuları kapalı (`MARKETING_CONSENT_ENABLED`). Migration yok. ai-worker yurt dışı aktarım kapısı (`ORCHADOS_AI_TRANSFER_SAFEGUARD`) bu PR'da. Takip işlerinin kod tarafı ayrı PR'larda: T07/T16 saha kayıtları (#88), T16 sınır ibaresi (#87), T11 silme ve takma ad betikleri (#89), T27/T21/T04/T03/T18 (#92), T19/T12/T09 (#93), T04 sözleşme belgeleri ve Sözleşmelerim (#94), T23/T09/T20/T15/T16/T13/T11 (#97), T05/T07/T06/T08/T09/T23 (#100). Takip işlerinin güncel durumu ve son tarihleri (T01–T36) [hukuk/kararlar.md](hukuk/kararlar.md)'de; şirket eylemleri (T01, T22) ve avukat incelemeleri açık |
| Lansman fiyat listesi | Tamam (PR #91) | [fiyatlandirma.md](fiyatlandirma.md): Temel, Standart, Kapsamlı paketleri; seed, testler, `/paketler` (KDV dahil), hukuk metinlerindeki örnekler (`mesafeli-v4-taslak`, `onbilgi-v4-taslak`, `iade-v4-taslak`; yalnızca örnek tutarlar). Migration yok. Barındırılan projelerde liste back office'ten girilir ([deployment.md](deployment.md) › Lansman fiyat listesi) |
| Ziyaret başına ödeme planı | Tamam (PR #98) | `installments-v1`: ilk yıl envanter ödemesi önden, kalan tutar paketteki ziyaret sayısı kadar ödemeye bölünür; ödeme başına kart ya da havale, makbuz, hatırlatma; ödenmemiş ziyaret planlanmaz (ops izniyle istisna), pencere ödemesiz biterse ödeme düşer; çıkarma ve caymada yalnızca ödenen iade edilir ([musteri-yonetimi.md](musteri-yonetimi.md) §5.6, §6.14). Hukuk kararları H35, H36 (yapay zekâ ajanları): `mesafeli-v5-taslak`, `onbilgi-v5-taslak`, `iade-v5-taslak`. Migration'lar `20261104100900`–`20261104101100`. Takip: T28 kalanı, T29–T32 |
| İP14 yayına alma | Açık (insan eylemi) | Barındırılan projelerde `garden_changes_enabled` kapalı. [Yayın şartları](hukuk/kararlar.md#yayin), T05, T18 ve fiyat kararları ([bahce-yonetimi.md](bahce-yonetimi.md) §16, §19) gelince test projesinde duman testi, sonra anahtar açılır (`docs/deployment.md` › Bahçe ekleme ve çıkarma) |
| İP15 | Tamam (PR #113; robot filosu PR #118) | Hizmet katmanı: katalog, talep, tarihçe, kanıt fotoğrafları, robot uygunluk notları, `weed_height` metriği, bildirim şablonları; portalda öneri kartı, talep ve Hizmetlerim; back office'te `/operasyon/hizmet` kuyruğu ve katalog; saha protokolleri `spring-v0.2`, `summer-v0.3`. Hukuk taslakları (bakım hizmeti sözleşme eki, ön bilgilendirme, iptal koşulları) avukat onayı bekliyor. Robot filosu: `robot_model` (MARABA-I), hizmet başına robot modelleri, talepte robot seçimi, robot modeli başına fiyat ("Tüm robotlar" yedek satırı, ops fiyat listesi taslağında), iş kaydında ve oturumda yapan (`robot` varsayılan; ops işi kapatırken "İşi kim yaptı?" ile `crew` seçebilir, sahip görmez), ops kuyruğu ve talep sayfasında robot ve yapan; demo verisi sürüm 3 (iş robotla, katalog açıklaması robotu anlatır) |
| İP15 yayına alma | Açık (insan eylemi) | Sahip kararıyla (2 Kasım 2026) hizmet katmanı her ortamda açık; gerçek müşteri yok. Avukat incelemesi (T34), fiyat ve diğer açık işler sonra yapılır. Fiyat belirlenmedi (2 Kasım 2026): sahadan maliyet ve işçi verimi gelince fiyat listesinin "Hizmet fiyatları" bölümüne girilip yayımlanır; o zamana kadar portal "Fiyat teklifle bildirilir" yazar, ops tutarı elle girer |
| İP16 | Yazılım tamam (PR #123); sahibe gösterim tamam (PR #125, #126) | LiDAR ölçümleri, yazılım tarafı: ortak temel, `lidar crown`, `lidar skeleton`, `lidar pruning`, `lidar upload`; migration `20261107300000` (yeni metrikler, `record_lidar_measurements`). Sahibe gösterim: migration `20261107400000` (boy ve kesim sayısı karnede, `crown_base_height`), ağaç karnesinde kesitler üzerinde taç çizimi, 360° gezide seçilen ağacın değerleri ve çizimi; demo verisi sürüm 4 (taramalarda çizilen ağaçlardan sentetik bulutla taç aşamasının ölçtüğü boy, çap, hacim ve taç tabanı, [demo-turu.md](demo-turu.md) §8.2). Açık: kayıt adımı (MCAP → bulut), LiDAR'lı kitin montajı (motosiklet), gövde çapı ölçüm yüksekliği kararı, pilotta referans ölçümler, ofis ve uzman tarafında kullanım (aşağıda). [lidar-olcumleri.md](lidar-olcumleri.md) |
| İP17 | Faz 1 (PR #129), Faz 2 (PR #130), Faz 2b (PR #131, #133) tamam; pilotta (PR #132, 6 Kasım). Faz 3 tamam (PR #134); bahçede gezinme bu dalda (`claude/clever-darwin-0uj9mi`) | Faz 1: 3D dünya: web bulutu sözleşmesi ([arayuzler.md](arayuzler.md#3d-dünya-bulutu)), `lidar world` (taşıyanın atılması, seyreltme, ağaç ataması, panoramalardan renklendirme), `lidar upload` ile `world_cloud` asset'i; migration `20261107500000` (`asset_kind`), `20261107500100` (sahibe okuma ve imza, gizleme); gezide geçiş efekti ve 3D dünya (`world-view.tsx`, `world-scene.ts`, `lib/world/`); demo verisi sürüm 5 (A'nın iki taramasında sentetik bulut; taç ölçümleri sürüm 4'ten). Sahip kararı (5 Kasım 2026): taramalarda bahçede insan olmadığından bulut sahibe gösterilir; zaman ve iz taşımaz (H05). Faz 2: kademeli yükleme (aralık istekleri), 3D dünyada denetimler arası geçiş, boy değişimi kipi. Faz 2b: bulut dosyasında isteğe bağlı kış iskeleti ve kesim dizileri (`lidar world --skeleton --pruning`), 3D dünyada dal tüpleri, kırmızı budanan dallar ve kesimler; demo verisi sürüm 6 (A'nın iki kış taraması, 20 Ocak ve 24 Şubat 2026). Faz 3: personel ekranları, uzman panelinde ve ofis çalışma alanında aynı dünya (panoramasız açılış, incelemedeki ziyaretler, "Büyüklük sınıfı" renk kipi), uzmanın ağaç incelemesinde LiDAR ölçümleri, büyüklük sınıfı önerisinin tek tıkla kabulü, ofiste öneri sütunu ve toplu uygulama ([3d-dunya.md](3d-dunya.md) §9). Bahçede gezinme (11 Kasım, sahip isteği): göz hizasında yürüme kipi (tuşlar, yön takımı, çift tıklama), zemindeki panorama noktaları ve birine inişle gezinin orada sürmesi ([3d-dunya.md](3d-dunya.md) §10). Açık: oktree, konum denetimi, gerçek LiDAR verisi. [3d-dunya.md](3d-dunya.md) |
| Haritalar | Tamam (PR #102) | Bütün MapLibre haritaları ortak çalışma zamanında (`useMapLibre`): tek yükleme, `style.load`, `setData` ve `feature-state`, altlık ve WebGL hatalarında uyarı, Türkçe denetimler; sınır çiziminde köşe seçme, taşıma, silme ve klavye; kapsamlı e2e (5000 ağaç, telefon, sızıntı). [haritalar.md](haritalar.md) |
| LiDAR'ın ofis ve uzman tarafında kullanımı | Tamam (PR #134) | İP17 Faz 3 ile yapıldı: uzmanın ağaç incelemesinde LiDAR ölçümleri ve büyüklük sınıfı önerisi, ofis çalışma alanında öneri sütunu ve toplu uygulama, ikisinde de 3D dünya ([3d-dunya.md](3d-dunya.md) §9). Açık: envanterde gövde konumunu buluttan bulmak ya da üçgenlemeyi bulutla doğrulamak (konum denetimi, §9.6); gerçek bulut gelince tasarlanır |
| Arayüz yenileme | Tamam (PR #101, #103, #105–#108; 4. dalga PR #121) | Tasarım sistemi ve karşılama sayfası; site, giriş ve kayıt; back office ve operasyon; müşteri portalı; ofis ve uzman ekranları; entegrasyon ve tutarlılık. 4. dalga: müşteri ekranlarının sadeleştirilmesi |
| Auth sertleştirmesi | Tamam (PR #93, #99) | Kayıtta hesap varlığını gizleme ve kalan hesap ele geçirme yolları |
| Kullanım kılavuzları | Tamam (PR #111, #112) | Ofis ve saha personeli kılavuzu; ekran görüntülü, ekran ekran detaylı kılavuz |
| Saha uygulaması dağıtımı | Tamam (PR #72, #81, #85, #95) | Pilot APK'sı GitHub Releases'te, sabit imza anahtarı; açılış hatası beyaz ekran yerine gösteriliyor; release derlemesinde R8'in JNI aramalarını bozması düzeltildi |
| Operasyon ekranları | Tamam (PR #19) | `/operasyon`: pano, sahip ve parsel kaydı, kaba sınır, portal erişimi ve hesap açma, ziyaret planlama |
| Envanter onayı | Tamam (PR #18) | Doğrulama listesi veritabanında (`verification_item`), ofiste ağaç özellikleri, altyapı ve saha sınırı; uzmanın envanter onayı; sahibin sınır onayı. Saha tarafı açık |
| İP6 v0.3 | Tamam (PR #21) | Doğrulama turu ekranı, sahada sınır köşesi, kapsama haritası, test projesine bağlı APK (`docs/gorevler/ip6-envanter-saha.md`) |
| İP9 | v0.1 tamam (PR #23) | `ai-worker`: Haiku triaj → Sonnet, Batch API, önbellekli istem, mozaik, `eval`; kişisel veri ve yakın plan fotoğrafı gönderilmez. Ücretsiz sağlayıcılar (PR #43): yerel Ollama ile uçtan uca denendi. Gerçek Claude API ile ilk deneme ve eşik kalibrasyonu açık |
| Pilot ortamı | Kuruldu (22 Ekim); son sürüm PR #132 (6 Kasım) | `main` → `release` sürümleriyle güncelleniyor (son: 3D dünya ve demo LiDAR verisi, PR #132; öncekiler #110, #114, #116, #119, #127); `main`'de 111 migration. Kayıt açık (PR #109). Kuruluş: Supabase `orchados-pilot` (Frankfurt, Free), Edge Function'lar, giriş/telefon kancası, bildirim kuyruğu (mesajlar kaydediliyor). Vercel `orchados-pilot` (`release`, Frankfurt, koruma açık): https://orchados-pilot-orchad-os.vercel.app. İşletme: OBA Bilişim Teknolojileri LTD.; ilk operasyon kullanıcısı açıldı. Açık: Vercel Pro, medya deposu (Supabase Pro), alan adı, Netgsm |
| Kapsama ve ağaç kontrolü | Tamam (PR #32) | Kapsama raporu, eşik altında otomatik ek ziyaret isteği, ağaç var/yok (`tree_visible`), envanter onayında kapsama kapısı |
| Bulutta işleme | Tamam (PR #29) | Sağlayıcıdan bağımsız: `orchados-ingest` (S3 uyumlu: AWS/R2/GCS/MinIO; Azure Blob; yerel), işlem container'ı (`ghcr.io/yusuftiryaki/orchados-processing`), AWS/Azure/GCP makine betikleri, `docs/bulut-isleme.md`. Sağlayıcı seçimi ve hesap açık |
| Dalga 6 | Tamam | Sınır köşeleri (#22), İP9 (#23), grid rotası (#24), uzman/portal v0.2 (#25), bildirimler ve telefonla giriş (#27; Netgsm iskeleti, gerçek hesap yok). Yüz bulanıklaştırma üründen kaldırıldı (karar 21 Ekim, #28) |
| Dalga 5 | Tamam | İP5 v0.2 (PR #15); İP4 v0.2 (PR #16): ağaç konumları veritabanından, CI'da uçtan uca zincir testi (~70 sn) |
| Dalga 4 | Tamam | İP4 yükleme, İP7, İP8, İP6 senkronizasyon birleşti. Örnek tarama verisi: `pnpm db:demo`. Test ortamı: https://orchados-orchad-os.vercel.app (Vercel koruması açık) |
| İP6 | v0.3 tamam (PR #6, #8, #20, #21, #24, #26) | BLE protokolü, QR saat, ekran akışı, çevrimdışı kuyruk, gerçek kamera ve cihazda kalite kontrolü; 66 test. Senkronizasyon: sunucudan görevler, sıralı ve tekrar güvenli gönderim, saha personelinin fotoğraf yüklemesi; APK CI'da derleniyor. Envanter sahası: doğrulama turu, sınır köşesi, kapsama; sabit grid rotası ve dur-çek-yürü; test projesine bağlı APK. Açık: telefonda ve gerçek kaydediciyle deneme |

**Sıradaki işler (11 Kasım 2026)**

Yazılım M2 ve M3'ün gerektirdiklerinin büyük kısmını karşılıyor; takvimi artık donanım, saha denemeleri ve insan eylemleri belirliyor. 6 Kasım'dan beri açık PR yok.

1. **Kapı 1 (20 Aralık) için kit ve İP3:** kit montajı; firmware'in gerçek donanımda denenmesi; telefonda BLE ile kaydedici; gerçek `.insv` deneme çekimi; tek koridor taraması, PPK, QR ile zaman eşleme ve gövde üçgenleme doğruluğu; ısınma testi. Kalan dış işler aşağıda (kit siparişi, TUSAGA-Aktif, uzman görüşmesi, pilot sahipler).
2. **Yayına alma (insan eylemi):** İP13 demo projesi ve `ORCHADOS_DEMO_URL`; İP14 anahtarı (avukat onayı, T05, T18, T32); İP15 fiyatı ve T33–T36; iyzico sandbox kontrol listesi; Netgsm hesabı ve Turnstile alan adı listesi; Vercel Pro, medya deposu (Supabase Pro), alan adı.
3. **İP9:** gerçek Claude API ile ilk deneme ve eşik kalibrasyonu (kış etiketleri gelince, ilkbahar denetiminden önce).
4. **LiDAR'lı kit (karar 11 Kasım 2026):** LiDAR parçalarının sipariş listesine eklenmesi ([kit-siparis-listesi.md](kit-siparis-listesi.md), [tarama-kiti.md](tarama-kiti.md)); kayıt adımı (MCAP → SLAM + PPK → `cloud.ply`), artık gerçek verinin önündeki iş; motosiklette montaj ve titreşim denemesi; gövde çapı ölçüm yüksekliği kararı. Personel ekranları (İP17 Faz 3) tamam (PR #134); bahçede gezinme bu dalda; sonra oktree ve konum denetimi.

**Sıradaki işler (26 Ekim 2026; çalışma artık yerel makinede, ağır doğrulama CI'da)**

1. ✅ Toparlama: PR #32 sonrası `main` CI yeşil, test projesi güncel.
2. ✅ **Kit kimlik çipi** (PR #33) (robotla bağlantı; sözleşme `hoverboard/docs/kit-soketi.md`, şema 1): `services/kit-chip/` kodlayıcı, çözücü, ortak test vektörleri, çipe yazma aracı. Kalibrasyon kaydından manifest (`orchados-kit from-calibration`, `calibration.chip_id` + `extrinsics.kit_mount`) PR #39. Açık: kit yapılınca gerçek ölçümler ve gerçek DS2431'e ilk yazma.
3. ✅ **Insta360 SDK** (PR #34) (Camera SDK 2.1.8, Media SDK 3.1.5, InsMetaData SDK 2.0.2 geldi; repoya girmez, yerelde `~/.orchados/sdk/insta360/`). Plan: `docs/gorevler/insta360-sdk.md`. İşleme hattı `.insv`'yi doğrudan alıyor, sadece seçilen kareleri `MediaSDKTest` ile birleştiriyor; meta veri aracı (`native/ins_meta_dump`) SDK'ya karşı derlendi. Sahte SDK ile test edildi; doğrulama için gerçek bir `.insv` deneme çekimi gerekiyor. Jiroskopla ince zaman eşleme sonraki iş.
4. ✅ **Saha uygulaması** (PR #35): yakın plan listesinin sunucudan inmesi (`closeup_list`), "Sorun gördüm", sesli not, hava ve ekipman kaydı (ziyaret kaydı). Yazıldı; sesli not telefonda denenmedi.
5. ✅ **Pilota ilk sürüm** (PR #36, 27 Ekim): 37 migration ve Edge Function'lar pilot projesinde, `orchados-pilot` yayında.
6. ✅ **Bakım** (PR #37, #38): Test temizliği yeni tabloları sütun adından kendiliğinden kapsıyor (`supabase/testing/purge.sql`). Tarayıcı testlerinde CI'da bir tekrar ve 60 sn süre; toplu onay testindeki asıl hata (rastgele örneklemde incelenmiş ağaca karar) düzeltildi.

7. ✅ **27 Ekim işleri:** BLE paketi `universal_ble` (PR #41); dip sürgünü, kuruma deseni, gövde yapısı (PR #42); ücretsiz AI sağlayıcıları: yerel Ollama `gemma3:4b` ile uçtan uca denendi, Gemini ücretsiz katmanı yalnız test verisi (PR #43); envanter raporu ve sunucuda PDF (PR #44); web ve saha arayüzlerinde tasarım yenilemesi (PR #45, #46); **metodoloji v0.1**: uzman ajan kararları (PR #47, `docs/uzman-ajan-onerileri.md`), 27 Ekim'de işletme kararıyla kabul edildi; kalan kurallar kodda (zor ölçekler, mevsimin ilk ziyaretinde toplu onay kapalı, "yok" bir kez, aynı mevsimle trend, envanterde %98 ve 20×20 m kör nokta, AI istemi v0.3, yakın plan protokolü v0.1).

8. **İP12 Müşteri edinme ve yönetimi** (27 Ekim): geliştirme bulut oturumlarında; üç dalgada altı akış (`docs/gorevler/ip12-*.md`, tasarım `docs/musteri-yonetimi.md` §17). Dalga 1: A1 veri modeli ve kayıt, B ödeme sağlayıcı, C site ve kayıt arayüzü; dalga 2: A2 teklif, sipariş, ödeme fonksiyonları; dalga 3: D müşteri portalı, E back office.

9. **İP13 Demo turu** (28 Ekim): tasarım `docs/demo-turu.md`; iki dalgada üç akış (`docs/gorevler/ip13-*.md`). Dalga 1: A demo erişimi (veritabanı, Edge, dağıtım denetimleri), B demo verisi; dalga 2: C demo arayüzü ve uçtan uca test. Sonra test projesinde duman testi, demo projesi, en son pilot sitesine link.

10. **İP14 Bahçe yönetimi** (28 Ekim): tasarım `docs/bahce-yonetimi.md`; iki dalgada dört akış (`docs/gorevler/ip14-*.md`). Dalga 1: A veri modeli ve sözleşmeler, B hukuk taslakları ve dokümanlar; dalga 2: C müşteri portalı, D back office. Anahtar avukat onayına kadar kapalı.

11. **İP15 Hizmet katmanı: yabani ot biçme** (2 Kasım): ürün kararı [MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme) Modül 6. Tek dalga: veri modeli ve fonksiyonlar, sahip portalı, back office, saha sorusu, hukuk taslakları ve dokümanlar. Anahtar (`services_enabled`): Sahip kararıyla (2 Kasım 2026) hizmet katmanı her ortamda açık; gerçek müşteri yok. Avukat incelemesi (T34), fiyat ve diğer açık işler sonra yapılır.

**Açık işler**

- [x] **Karar (11 Kasım): kit LiDAR'lı yapılır.** LiDAR ölçümleri (İP16) ve 3D dünya (İP17) pilotun ilk taramasından itibaren gerçek veriyle çalışacak; personelin LiDAR'ı kullanması (İP17 Faz 3) öne alındı. Sipariş listesine LiDAR parçaları eklenmeli; kayıt adımı (MCAP → bulut) kritik yola girer. Ayrıntı: [3d-dunya.md](3d-dunya.md) §9, [lidar-olcumleri.md](lidar-olcumleri.md) §1.
- [x] **Karar (5 Kasım, İP16):** LiDAR ölçümleri (ağaç boyu, taç çapı, taç hacmi, ana kol sayısı, kesim sayısı, budama durumu) doğrulama beklenmeden sahibe gösterilir; uzman bu ölçümleri ayrıca onaylamaz. Ağaç karnesinde kesit fotoğrafları üzerinde, 360° gezide seçilen ağaçta taç çizimiyle. Doğrulama pilotta yapılır; yetersiz çıkan metrik karneden geri alınır. Ayrıntı: [lidar-olcumleri.md](lidar-olcumleri.md) §9.
- [x] **Karar (2 Kasım, İP15):** MVP'ye bir hizmet katmanı eklenir; ilk ve tek hizmet yabani ot biçme. Saha görüşmelerinde sahipler yalnız izlemeye az, bahçe işlerinin hizmet olarak eklenmesine çok ilgi gösterdi. Öneri, ilkbahar ve yaz ziyaretlerindeki parsel sorusuna (`weed_height`) ve hizmetin sezon penceresine dayanır; talep portaldan, çevrimiçi ödeme yok, ödeme elle kaydedilir. İlk sezon işi köydeki saha personeli motorlu tırpanla yapar; maraba robotu yalnız simülasyonda doğrulandığı için robotla biçme vaat edilmez (aynı gün aşağıdaki robot filosu kararıyla değişti). Katalog meyve türünden ve hizmetten bağımsız; karne orchadOS'un kendi yaptığı işi açıkça yazar. Ayrıntı: [MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme), [vizyon.md](vizyon.md).
- [x] **Karar (2 Kasım, İP15, robot filosu):** Sahibe işin personel tarafından motorlu tırpanla yapıldığı söylenmez; ot biçme hizmeti otonom robotumuz MARABA-I'nin yaptığı bir iş olarak sunulur. orchadOS bir robot filosu ↔ bahçe sahibi eşleştirme platformuna dönüşür: sahip işi yapacak robotu seçer, fiyat robotun yeteneğine göre değişir; MARABA-I ilk modeldir, ileride üçüncü taraf işletmeciler katılabilir. İç gerçek kayıtlıdır: işi kimin yaptığı (robot ya da saha ekibi) iş kaydında tutulur, sahibe gösterilmez. Ayrıntı: [MVP.md](MVP.md#modül-6--hizmet-katmanı-yabani-ot-biçme), [vizyon.md](vizyon.md), [veri-modeli.md](veri-modeli.md).
- [x] **Karar (28 Ekim): ödeme planı.** İlk yıl envanter ücreti teklif onayında tek çekimle önden ödenir; kalan yıllık tutar paketteki periyodik ziyaret sayısı kadar ödemeye bölünür (Temel 2, Standart 4, Kapsamlı 6). Ziyaret başına ödeme planıdır, kart taksiti değildir; kart taksiti kapsam dışı. Ayrıntı: [fiyatlandirma.md](fiyatlandirma.md) §2a, [musteri-yonetimi.md](musteri-yonetimi.md) §5.6; hukuki çerçeve [hukuk/kararlar.md](hukuk/kararlar.md) H35.
- [x] **Karar (28 Ekim): hizmet bölgesi belirtilmez; başvuruyu ops değerlendirir.** Site ve hukuk metinleri bölge vaat etmez ve bölge adı vermez; konuma göre ret yazılı iç ölçütle yapılır ([hukuk/kararlar.md](hukuk/kararlar.md) H36).
- [x] **Karar (28 Ekim): lansman fiyat listesi.** Üç paket, tutarlar KDV hariç: Temel (yılda 2 ziyaret, kış ve hasat; 208 TL/dönüm·ziyaret, en az 5.600 TL), Standart (4 ziyaret; 180 TL, en az 11.200 TL), Kapsamlı (6 ziyaret; 168 TL, en az 16.000 TL). Envanter ücreti ilk yıl bahçe başına 6.000 TL. Kurucu indirimi yok; komşu bahçe indirimi (%10–15) teklifte. Liste her 1 Ocak ve 1 Temmuz'da revize edilir. Kapsamlı paketin takvimi: Standart'ın dört ziyareti + mart sonu uyanma + ağustos başı hasat öncesi (yapay zekâ uzman ajanı kararı); metodolojideki mevsim eşlemesi v0.2'de yapıldı (aşağıdaki karar). Ayrıntı ve gerekçe: [fiyatlandirma.md](fiyatlandirma.md).
- [x] **Karar (28 Ekim, metodoloji v0.2):** "Kapsamlı" pakette yılda 6 periyodik ziyaret (Ocak, Mart sonu, Nisan sonu, Temmuz, Ağustos başı, Ekim); Temel #1 + #6, Standart #1, #3, #4, #6. Ay–mevsim eşlemesi: kış Kasım–Mart, ilkbahar Nisan–Mayıs, yaz Haziran–Ağustos, hasat Eylül–Ekim; İP7'deki "Mart ilkbahardır" kararından bilerek ayrılır, eski ziyaretler eski eşlemeyle kalır. Uzman ajan kararı, işletme talimatıyla nihai. Ayrıntı: `docs/metodoloji.md` §2, `docs/uzman-ajan-onerileri.md` §7.
- [x] **Karar (28 Ekim, İP14):** Müşterinin birden fazla bahçesi; üyelik boyunca ekleme ve çıkarma; tek dönem, ek sipariş, orantılı fiyat, bahçe bazında fesih. Ayrıntı: `docs/bahce-yonetimi.md` §2.
- [x] **Karar (27 Ekim, İP12):** Akış başvuru → operasyon onayı → ödeme. Fiyat dönüm başına ve yıllık; paket yıllık periyodik ziyaret sayısı, minimum ücret var; fiyat listesi sürümlü, yayımlanan değişmez. Kartla ödeme iyzico ile (3DS, sağlayıcıdan bağımsız arayüzün arkasında), havaleyi operasyon kaydeder. Ayrıntı: `docs/musteri-yonetimi.md` §2.
- [x] **Envanter kaydı tek işlemde:** *(PR #15)* Yer ve ağaç kaydı şu an iki ayrı ekleme; `save_inventory(...)` adlı, kullanıcının yetkisiyle çalışan tek işlemlik bir veritabanı fonksiyonu.
- [x] **Etiketli veri:** *(PR #15)* Ofis aracındaki gövde tıklamaları (gövde tespit modeli için etiket) şimdilik tarayıcıda; veritabanında saklanmalı.
- [x] **Web:** Ağaç rengi uzman ve ofis tarafında da *(PR #15)* `tree_latest_assessment` görünümüne bağlanmalı (portalda yapıldı).
- [x] **Web:** Medya imzalama iki yerde *(PR #15)*: `src/lib/media/` (portal) ve `src/lib/expert/media.ts`. Uzman paneli ortak yardımcıya geçmeli; `fetchAll` kopyası da birleştirilmeli.
- [x] *(PR #30, #37)* **Testler:** Ekleme-yalnız tablolar yüzünden web testleri kendi işletmelerini kurup `docker exec ... psql` ile temizliyor. Testler için bir temizlik fonksiyonu daha temiz olur.
- [x] *(PR #16)* **Örnek veri:** `supabase/demo/scans.sql` `pose` alanları `docs/arayuzler.md`'deki sözleşmeye tam uymuyor (`variant`, `gps_time_ns`, `panorama_asset_id` eksik; MIME türü WebP olmalı).
- [x] **Karar (21 Ekim): yüz bulanıklaştırma üründen kaldırıldı.** Ertelenmiş bir iş değil; panoramalar ve kesitler bu şart olmadan yüklenir, kesitler AI'a gönderilir. Görüntülerde kişiler görünebileceği aydınlatma metninde belirtilir.
- [x] **Karar (20 Ekim):** Yayından sonra sadece uzman ölçümleri kilitli; saha personelinin geç gelen kayıtları serbest.
- [x] *(PR #20)* **Saha uygulaması:** README ve `GnssStatus` yorumu, firmware 0.2.0'daki GPS zamanı alanını hâlâ "önerilen" diye anlatıyor; evet/hayır cevapları gönderilirken `value_bool` → `value_boolean` eşlemesi.
- [x] *(PR #17)* **Metrik kaydı:** `metric_definition` sadece seed'de; metodolojideki ölçekler (`docs/metodoloji.md` Ek B) referans veri olarak migration'la kurulmalı.
- [x] *(PR #21)* **Saha uygulaması:** Doğrulama turu ekranı; sahada sınır köşesi işaretleme; kapsama haritası.
- [x] *(PR #22)* **İşleme hattı:** Sınır köşelerinden `boundary` sürümü; firmware 0.3.0 durum mesajında konum.
- [x] *(PR #26)* **Saha uygulaması:** Firmware 0.3.0 konum geçerli bayrağı (bit6) kontrol ediliyor.
- [x] *(PR #19)* **Operasyon ekranları:** Sahip/parsel kaydı, portal hesabı (`invite-user` Edge Function), ziyaret planlama ve pano.
- [x] *(PR #41)* **Lisans:** `flutter_blue_plus` (ticari kullanımda ücretli) yerine BSD lisanslı `universal_ble`. Gerçek kaydediciyle telefonda denenmesi kit gelince.
- [x] *(PR #20, `permission_handler` 12'ye sabitlendi)* **Saha uygulaması:** `flutter build apk` CI'da kırık: `permission_handler_android` `compileSdk` 37 istiyor (İP6 senkronizasyon görevinde).

Toplam yaklaşık 55 gün (İP9 hariç).

## Hemen başlaması gereken dış işler

Bunlar takvimi bekletebilecek, başkasına bağlı işler. İlk iki hafta içinde başlatılmalı:

- [ ] Kit parçalarının siparişi (ithalat ve gümrükle 2–4 hafta). Liste: `docs/kit-siparis-listesi.md`
- [x] 360° kamera üreticisinin SDK başvurusu (SDK geldi, PR #34)
- [ ] TUSAGA-Aktif (CORS-TR) abonelik başvurusu, ya da kendi baz istasyonu kararı
- [ ] Uzman (ziraat mühendisi) ile ön görüşme
- [ ] 1–4 pilot bahçe sahibinin sözlü onayı; envanter tarihleri
- [x] KVKK metinleri için hukuki kararlar (28 Ekim, hukuk uzmanı ajan; kullanıcı talimatıyla nihai): `docs/hukuk/kararlar.md`. Kalan şirket eylemleri T01 ve T22 (standart sözleşmeler, şirket bilgileri, ETBİS, İYS)
- [x] İşleme istasyonu: pilotta bulut (22 Ekim). Ofisin yükleme hızı 99 Mbps; 90 GB'lık bir ziyaret ~2 saatte yüklenir. Sağlayıcı sonra seçilecek; araçlar AWS, Azure ve Google Cloud'u destekleyecek (`docs/gorevler/bulut-isleme.md`)

## Geride kalınırsa kesilecekler

Sıra, ilk kesilecekten sona doğru:

1. ~~**Portalda PDF rapor**~~ (yapıldı, PR #44): karne ve envanter raporu sunucuda PDF.
2. **Gezide ağaç işaretçileri:** Panoramalar işaretçisiz gezilir, ağaç karnesine haritadan gidilir (~2 gün).
3. **Telefon doğrulamasıyla giriş:** Pilot sahiplere kişiye özel link gönderilir (~1 gün).
4. **Saha uygulamasında kapsama haritası:** Kapsama ofiste işleme sonrası kontrol edilir (~1,5 gün).
5. **Uzman panelinde rahatlık özellikleri:** Toplu onay ve kısayollar sonraya kalır; dört bahçede ~1.200 ağaç elle incelenebilir (~1 gün).

Bunlar yetmezse Kapı 2, ilkbahar denetiminin sonuna (Mayıs 2027) kaydırılır. Kış ziyareti yine yapılır ve veri toplanır; rapor sahiplere ilkbaharla birlikte gider.

## Çalışma düzeni

- **Her iş paketi kendi dalında** geliştirilir ve tamamlanınca `main`'e birleştirilir.
- **Testler:** Her bileşen gerçek donanım olmadan, kısa örnek kayıtlarla ve sentetik veriyle test edilebilir olmalı. İlk örnek kayıtlar İP3'te üretilir ve küçültülmüş halleri repoda değil, ayrı bir depolama alanında tutulur.
- **Haftalık gözden geçirme:** Plan her hafta bu dosyada güncellenir: hangi İP nerede, kesme listesinden bir şey gerekiyor mu?
