# MVP Boşluk Denetimi

22 Ekim 2026 · görev: [gorevler/mvp-denetimi.md](gorevler/mvp-denetimi.md)

Bu belge [MVP.md](MVP.md)'deki her özelliğin kodda karşılığı olup olmadığını madde madde denetler. "Var" denmesi için kod ve testi görüldü; README'ye güvenilmedi.

**Durum:**
- **var:** kodu ve testi var.
- **kısmen:** çalışıyor ama bir parçası eksik ya da geçici bir yolla yapılıyor; eksik kısım notta.
- **yok:** yazılmadı; gerekçe notta.
- **donanım:** gerçek kamera, GNSS alıcısı ya da telefon gerektirir; yazılımı sentetik veriyle denenmiş olabilir, gerçek donanımla denenmedi.
- **sonraki iş:** bu görevde yapılmadı, çünkü başka bir bileşen (saha uygulaması, işleme hattı) ya da dış bir karar gerektiriyor; gerekçe notta.
- **(bu görev)**: bu denetimde eklendi ya da tamamlandı.

Kısaltmalar: `web/` = `apps/web/src/`, `field/` = `apps/field/lib/`, `pipeline/` = `services/pipeline/src/orchados_pipeline/`, `mig/` = `supabase/migrations/`, `pgtap/` = `supabase/tests/`.

## Modül 1 – Arazi sahibi kaydı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Kaydı operasyon açar, self-servis kayıt yok | `/operasyon/sahip/yeni`; `[auth] enable_signup = false` | var | `operations-screens.test.ts`, `operations-registration.spec.ts` |
| Sahip bilgileri: ad, telefon, e-posta, iletişim tercihi | `web/components/operations/owner-form.tsx`, `private.owner_profile` | var | Kişisel veri `private` şemasında; `17_operations.test.sql` |
| Parsel bilgileri: il/ilçe/köy, tapu (ada/parsel, hisse, rızai taksim), alan, sulu/kıraç, tahmini ağaç, erişim notu, sınırı gösterecek kişi | `/operasyon/parsel/yeni`, `register_parcel`, `private.parcel_detail` | var | |
| Kaba sınır (`owner_declared`, sürüm 1) | `boundary-draw-map.tsx`, `add_owner_declared_boundary` | var | |
| TKGM poligonu arka plan olarak | — | yok | TKGM servisi için hesap ve kullanım koşulu kararı gerekiyor (dış iş). Harita altlığı `NEXT_PUBLIC_MAP_STYLE_URL` ile değiştirilebilir; TKGM katmanı bir stil katmanı olarak eklenebilir |
| Yetki ve giriş izni (tapu sahibi, vekâlet, varis; giriş izni tarihi) | `parcel_detail.authorization_basis`, `entry_permission_at` | var | |
| KVKK onayı, tarihi, metin sürümü | `owner_profile.kvkk_*` | var | Metnin kendisi hukuk görüşüne bağlı (İP10) |
| Hizmet paketi (ziyaret tipleri, fiyat) | — | yok | Pilotta faturalandırma elle (MVP kapsam tablosu: ödeme altyapısı yok). Paket ve fiyat açık soru |
| Portal daveti; telefonla giriş | `invite-user` Edge Function, `/giris` telefon | var | Gerçek SMS için Netgsm hesabı gerekiyor |
| Sahibin hissedarı izleyici olarak eklemesi | Veritabanı kuralı var (`parcel_access_insert`: sahip `viewer` ekleyebilir); arayüz yok | kısmen | Sahip başkasının hesap kimliğini bilemediği için kural tek başına kullanılamıyor. Hissedarları operasyon ekliyor |
| Parsel yaşam döngüsü: kayıt → envanter planlandı | `private.sync_parcel_inventory_status` | var | `17_operations.test.sql` |
| … → envanter tamamlandı | `approve_inventory` | var | `18_inventory_approval.test.sql` |
| … → aktif izleme → pasif | Enum değerleri var; geçiş yok | yok | |
| Sınır notu her raporda | Portal sınır kartı | var | |

## Modül 2 – Envanter çıkarımı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Kaba sınır ve altlığın cihaza indirilmesi | `field/features/tasks`, çevrimdışı önbellek | var | Telefonda denenmedi (donanım) |
| Sınır yürüyüşü, köşe işareti, sınır işareti fotoğrafı | `field/features/boundary`, `session_event` | var · donanım | |
| Köşelerin PPK ile düzeltilmesi, sınır sürümü | `pipeline/boundary.py`, `add_field_survey_boundary` | var · donanım | Sentetik veriyle |
| Grid tarama, "sıfır noktası" görüntüleri | Saha + işleme hattı | var · donanım | |
| Ofiste gövde üçgenleme | `/ofis/parsel/<p>/envanter` | var | `office-tool.spec.ts` |
| Tıklamaların etiketli veri olması | `trunk_label` | var | |
| Gövde tespit modelinin konum önermesi | — | yok | Model eğitimi için etiketli veri birikmeli (MVP: "kendi AI modeli yok") |
| Sıra oturtma, kodlama, boş yer | `web/lib/office/rows.ts` | var | |
| Ağaç özelliklerinin ilk değerlendirmesi (yaş, aşı, dip sürgünü, kuruma) | `/ofis/.../envanter/duzenle` | kısmen | Yaş ve aşı var; dip sürgünü ve belirgin kuruma doğrulama listesinde "çok gövdeli" nedeniyle; ayrı alan yok |
| Altyapı (kuyu, havuz, hat, çit, kapı, kulübe) | `zone`, düzenleme ekranı | var | |
| Doğrulama listesi | `verification_item`, `create_verification_tour` | var | |
| Saha doğrulama turu | `field/features/verification` | var · donanım | |
| Uzmanın envanter onayı, sahibin sınır onayı | `approve_inventory`, `approve_boundary` | var | |
| Referans sıralarla doğrulama (pilot) | — | donanım | Yazılım dışı ölçüm; ikinci RTK alıcısı ve jalon |
| Çıktı: envanter özeti (yer, ağaç, boş, ara, aşısız, yaş dağılımı) | `web/lib/expert/inventory-checks.ts`, portal | var | |
| Çıktı: envanter raporu PDF | Portal karnesi yazdırılabilir | kısmen | Ayrı bir envanter raporu sayfası yok; karnedeki envanter özeti yazdırılır |
| Kabul kriteri: kapsamanın kalite kapısından geçmesi | `approve_inventory` | kısmen | Onay açık kalem ve yer arar; işleme hattının kapsama raporu yok (Modül 3, kalite kapısı) |

## Modül 3 – Periyodik tarama

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Ön kontrol (zorunlu liste) | `field/features/precheck` | var · donanım | |
| QR ile zaman eşleme | `field`, `pipeline/timesync` | var · donanım | |
| Sabit grid rotası, kalan rota | `field/features/route`, `parcel_route` | var | `25_parcel_route.test.sql` |
| Dur-çek-yürü | `field/features/route/beeper.dart` | var · donanım | |
| Yakın plan listesi: önceki ziyaretin dikkat/sorunlu/kuru ağaçları | `field/features/tasks/closeup_selection.dart` | var | Telefonda hesaplanıyor |
| Yakın plan listesi: %10 tabakalı örneklem (10×10 m) | Aynı yer | kısmen | %10 rastgele örneklem var; hücre tabakalaması yok |
| Yakın plan listesi: "Sorun gördüm" | — | yok | Saha uygulamasında düğme yok; `problem_seen` metriği ve uzman kuralı var |
| Listenin sunucuda üretilmesi | — | yok | Liste telefonda üretiliyor |
| Yakın plan protokolü: 2–3 çekim, "böyle çek", 3–4 soru | `field/features/closeup` | kısmen | Referans görsellerin yeri var, görseller yok (metodoloji Ek A) |
| Sesli not | — | yok | Saha uygulamasında yok (`apps/field/README.md`, bilinen sınırlar) |
| Galeriden yükleme yok | `field/features/camera` | var | |
| Cihazda kalite kapısı (bulanık/karanlık ret, zorunlu adım) | `field/features/camera` | var | |
| İşlemeden sonra panorama kalite skoru | `pipeline/panoramas.py` | var | |
| Kapsama haritası ve yeniden tarama görevi (işleme sonrası) | — | yok | Sahadaki anlık kapsama (`coverage` olayı) var; işleme hattının kapsama raporu yok |
| Yükleme: kart ofise, yakın plan senkronizasyonu | `orchados-ingest`, `field/core/sync` | var | |
| Ziyaret kaydı: personel, tarih, başlangıç/bitiş | `session` | var | |
| Ziyaret kaydı: hava, ekipman seri numaraları, sahada yaşanan sorunlar | `session.weather` sütunu var | kısmen | Saha uygulaması doldurmuyor |

## Modül 4 – Değerlendirme akışı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Stitch | Kameranın masaüstü yazılımı | donanım | SDK başvurusu açık |
| PPK, zaman eşleme, kare seçimi, panorama katmanları | `pipeline` | var · donanım | Sentetik veriyle |
| Ağaç eşleştirme: dört yönden kesit | `pipeline/crops.py` | var | |
| Sıra dizilişi karşılaştırması, ağaç var/yok | AI `tree_visible`, uzman "Yok" sınıfı | kısmen | İşleme hattında otomatik var/yok kontrolü yok |
| AI ön değerlendirme: ölçek önerisi, güven, "ağaç görünüyor mu", tutarsızlık bayrakları, kaskad | `services/ai-worker`, `save_ai_assessment` | var | Gerçek API ile denenmedi |
| Zorunlu inceleme kuralları | `web/lib/expert/mandatory-review.ts` | var | |
| Toplu onay ve %5 kalite örneklemi | `bulk_approve_trees` | var | |
| Uzman: onay/düzeltme, bulgu ve öneri, imza | `/uzman/ziyaret/<z>` | var | |
| Uzman: "Ek ziyaret iste" | — | yok | |
| Uzman: ağacı sonraki ziyaretin yakın plan listesine ekleme | — | yok | Metodoloji 7, madde 4 |
| Ölçekler (metrik kaydı) | `mig/20261021180000_metric_registry.sql` | var | |
| Genel sınıf kuralı | Uzman sınıfı elle seçer | kısmen | Kural ölçeklerden otomatik önerilmiyor |
| Metodoloji sürümü her karnede | `session.methodology_version`, portal | var | |
| Uzman kararlarının etiketli veri olarak saklanması | Ekleme-yalnız `assessment`, `measurement` | var | |

## Modül 5 – Durum izleme portalı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Bahçelerim: son ziyaret, skor, kritik bulgu sayısı | `/portal` | var | |
| Karne: genel durum skoru ve trendi | `web/lib/portal/score.ts` | var | |
| Karne satırından haritayı filtreli açma | `?sinif=` | var | Sadece sağlık sınıfları |
| Boyut: Envanter (yer, ağaç, boş, ara) | Envanter özeti (onaylıysa) | kısmen | Kaybolan ve yeni ağaçlar (önceki ziyarete göre) yok |
| Boyut: Bahçe yapısı (dişi/erkek oranı, aşısız, yaş dağılımı) | Envanter özeti | kısmen | Dişi/erkek oranı yok |
| Boyut: Sağlık dağılımı ve değişimi | Karne | var | |
| Boyut: Mekânsal desen (10×10 m ısı haritası) | — | yok | |
| Boyut: Bakım uyumu (budama oranı, hasat) | Genel ölçüm özeti | kısmen | Ölçümler sayılıyor ama "oran" olarak ayrı satır yok |
| Boyut: Zararlı belirtileri (sayı, tür, bölge) | Genel ölçüm özeti | kısmen | Tür ve bölge yok |
| Boyut: Meyve yükü (dağılım, var/yok yılı) | Genel ölçüm özeti | kısmen | Önceki yılın aynı ziyaretiyle karşılaştırma yok |
| Boyut: Denetim güveni | Karne | kısmen | Panorama ve yakın plan sayısı ile uzman imzası satırda yok |
| Sağlık haritası: sınıf rengi, boş yer işareti, sınıf filtresi | `health-map.tsx` | var | |
| Katman: hücre ısı haritası | — | yok | |
| Katman: kapsama izi | — | yok | |
| Katman: bahçe sınırı | `portal-map.tsx` | var | |
| Filtre: "bu ziyarette değişenler" | — | yok | |
| Filtre: ziyaret seçici | — | yok | Harita her zaman son değerlendirmeyi gösteriyor |
| 360° gezi: haritadan nokta, oklar, ağaç işaretçileri | `tour.tsx` | var | |
| 360° gezi: mini harita ve bakış yönü | Gezi yanında harita | kısmen | Bakış yönü gösterilmiyor |
| 360° gezi: zamanda gezinme | — | yok | Gezi sadece son ziyareti gösteriyor |
| Ağaç karnesi: kimlik, son ölçekler ve sınıf | `tree-card.tsx` | var | |
| Ağaç karnesi: sınıf zaman çizelgesi | Tablo | var | |
| Ağaç karnesi: fotoğraf geçmişi, dört yön, yakın planlar | `tree-card.tsx` | var | |
| Ağaç karnesi: kanıt bilgisi (tarih, saat, konum, çeken, hash doğrulaması) | Hash'in ilk 8 hanesi | kısmen | Tarih, saat, konum, çeken ve doğrulama yok |
| Ziyaret raporu: önem sırasıyla bulgular, ağaç karnesine bağlantı | Karne | var | |
| Ziyaret raporu: kapsama haritası | — | yok | |
| Ziyaret raporu: uzman imzası, PDF | Karne, yazdırma | kısmen | İmzalayan ve imza tarihi karnede yazmıyor |
| Bildirim: "Rapor hazır" | `notification` tetikleyicisi | var | |
| Bildirim: kritik bulgu, raporu beklemeden | `approve_finding` | kısmen | Veritabanı hazır; uzman panelinde bulguyu raporsuz onaylayan düğme yok |
| Soru bırakma | `question`, `/uzman/sorular` | var | |

## Veri modeli

| Varlık | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Owner, Parcel, ParcelAccess, Boundary, Slot, Tree | `mig/20261018120100_subject_layer.sql` | var | |
| Visit (`session`), Track, Panorama, Media | `session`, `capture`, `asset` | var | Track = `asset.kind = trajectory` |
| Observation | `measurement` (`source = staff`) | var | Sesli not yok |
| Assessment, Finding, Comment | `assessment`, `finding`, `question` | var | |
| ParcelScore | Sorgu anında hesaplanıyor | kısmen | Saklanmıyor; skor metodoloji sürümüyle her açılışta yeniden hesaplanır. Karar: ağırlıklar kesinleşene kadar saklanmaz |
| 10×10 m hücreler tabloda değil, sorgu anında | — | yok | Hücre hesabı yok (Modül 5, mekânsal desen) |

## Plan dosyasındaki kesme listesi

| Madde | Durum | Not |
| --- | --- | --- |
| Portalda PDF rapor | kısmen | Tarayıcının yazdırma penceresiyle PDF |
| Gezide ağaç işaretçileri | var | |
| Telefon doğrulamasıyla giriş | var | |
| Saha uygulamasında kapsama haritası | var | |
| Uzman panelinde toplu onay ve kısayollar | var | |
