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

## Özet

- Bu görevde 30'a yakın madde "yok" ya da "kısmen"den "var"a geçti: parsel yaşam döngüsü, hissedar daveti, karne boyutları, 10×10 m ısı haritası, harita ziyaret seçici, değişenler filtresi ve kapsama katmanı, gezide zamanda gezinme ve bakış yönü, kanıt bilgisi ve hash doğrulaması, uzman istekleri (ek ziyaret, yakın plan, doğrulama), kritik bulgunun rapordan önce onayı, genel sınıf kuralı önerisi, sunucuda yakın plan listesi.
- **Sonraki iş (başka bileşen):** saha uygulamasının `closeup_list`'i indirmesi ve "Sorun gördüm" düğmesi, sesli not, hava ve ekipman kaydı; bunlar `apps/field/` klasöründe, bu görevin kapsamı dışında. İşleme hattının kapsama raporu, yeniden tarama görevi ve ağaç var/yok kontrolü sonraki görevde (kapsama görevi) geldi.
- **Yok kalanlar ve gerekçeleri:** TKGM arka planı (dış hesap ve kullanım koşulu), hizmet paketi (pilotta elle), gövde tespit modelinin öneri yapması (etiketli veri birikmeli), donanım gerektiren maddeler.

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
| Sahibin hissedarı izleyici olarak eklemesi | Portal karnesi "Hissedarlar" (`viewers-card.tsx`), `/operasyon` "Hissedar davetleri"; `owner_invite_viewer`, `ops_resolve_viewer_invitation` (`mig/20261024120100`) | var (bu görev) | Sahip ad ve telefonla davet eder, operasyon hissedarı arayıp KVKK onayını alır, hesabı telefonla açar; sahip hissedarı kaldırabilir. Karar: sahip bir numaranın hesabı olup olmadığını öğrenmez, her davet operasyondan geçer. `26_viewer_invitations`, `viewer-invitations.test.ts`, `mvp-audit.spec.ts` |
| Parsel yaşam döngüsü: kayıt → envanter planlandı | `private.sync_parcel_inventory_status` | var | `17_operations.test.sql` |
| … → envanter tamamlandı | `approve_inventory` | var | `18_inventory_approval.test.sql` |
| … → aktif izleme → pasif | İlk yayımlanan periyodik taramada `active_monitoring` (tetikleyici); `ops_set_parcel_passive`, `/operasyon/parsel/<p>` düğmesi (`mig/20261024120000`) | var (bu görev) | Pasif parsele ziyaret planlanamaz; planlı ziyaret varken pasif yapılamaz; sürdürünce ziyaretlere göre adıma döner. `26_parcel_lifecycle`, `parcel-lifecycle.test.ts` |
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
| Ağaç özelliklerinin ilk değerlendirmesi (yaş, aşı, dip sürgünü, kuruma) | `/ofis/.../envanter/duzenle`; uzman paneli | var | Yaş, aşı ve gövde yapısı (tek/çok gövdeli) ofiste ağacın özelliği. Dip sürgünü (`basal_sprout_level`) ve kuruma deseni (`dieback_pattern`, `dried_leaves_attached`) ziyaret ölçümü: uzman girer, AI önerir (metodoloji 4.9–4.10). Tanımlar uzman ajan önerisi, pilot uzmanın onayını bekliyor |
| Altyapı (kuyu, havuz, hat, çit, kapı, kulübe) | `zone`, düzenleme ekranı | var | |
| Doğrulama listesi | `verification_item`, `create_verification_tour` | var | |
| Saha doğrulama turu | `field/features/verification` | var · donanım | |
| Uzmanın envanter onayı, sahibin sınır onayı | `approve_inventory`, `approve_boundary` | var | |
| Referans sıralarla doğrulama (pilot) | — | donanım | Yazılım dışı ölçüm; ikinci RTK alıcısı ve jalon |
| Çıktı: envanter özeti (yer, ağaç, boş, ara, aşısız, yaş dağılımı) | `web/lib/expert/inventory-checks.ts`, portal | var | |
| Çıktı: envanter raporu PDF | Portal karnesi yazdırılabilir | kısmen · sonraki iş | Ayrı bir envanter raporu sayfası yok; karnedeki envanter özeti yazdırılır |
| Kabul kriteri: kapsamanın kalite kapısından geçmesi | `approve_inventory`, `waive_coverage`, `coverage_report` | var (kapsama görevi) | Envanter taramasının en yeni kapsama raporu eşiğin altındaysa onay reddedilir; uzman gerekçeyle kabul edebilir (kayıtta kalır). Raporu olmayan eski veride davranış aynı. Envanter kaydedildikten sonra kapsamayı `orchados-pipeline coverage --trees-from-db` + `upload` ile ölçmek operasyonun adımı (`services/pipeline/README.md`) |

## Modül 3 – Periyodik tarama

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Ön kontrol (zorunlu liste) | `field/features/precheck` | var · donanım | |
| QR ile zaman eşleme | `field`, `pipeline/timesync` | var · donanım | |
| Sabit grid rotası, kalan rota | `field/features/route`, `parcel_route` | var | `25_parcel_route.test.sql` |
| Dur-çek-yürü | `field/features/route/beeper.dart` | var · donanım | |
| Yakın plan listesi: önceki ziyaretin dikkat/sorunlu/kuru ağaçları | `closeup_list` (`mig/20261024120200`); telefonda da `closeup_selection.dart` | var (bu görev: sunucuda) | |
| Yakın plan listesi: %10 tabakalı örneklem (10×10 m) | `closeup_list` | var (bu görev) | Hücre başına bir ağaç sırayla, ziyarete göre tekrarlanabilir. Saha uygulaması hâlâ kendi (tabakasız) örneklemini kullanıyor: sonraki iş |
| Yakın plan listesi: "Sorun gördüm" | `closeup_list` `staff_problem` nedeni; `problem_seen` metriği; saha uygulamasında taramada düğme | var | Saha uygulaması en yakın ağaçlardan seçtirir, çevrimdışıyken de listeye ekler |
| Listenin sunucuda üretilmesi ve saha uygulamasına inmesi | `closeup_list` RPC; `/operasyon/ziyaret/<z>` "Yakın plan listesi"; sözleşme `docs/arayuzler.md` "Yakın plan listesi ve uzman istekleri" | var | Saha uygulaması listeyi `closeup_list`ten indirir; sunucu veremezse yerel seçime döner |
| Yakın plan protokolü: 2–3 çekim, "böyle çek", 3–4 soru | `field/features/closeup` | kısmen · sonraki iş | Referans görsellerin yeri var, görseller yok (metodoloji Ek A) |
| Sesli not | Saha uygulaması yakın plan ekranı; `capture.kind = audio_note` | var | Telefonda (gerçek mikrofonla) henüz denenmedi |
| Galeriden yükleme yok | `field/features/camera` | var | |
| Cihazda kalite kapısı (bulanık/karanlık ret, zorunlu adım) | `field/features/camera` | var | |
| İşlemeden sonra panorama kalite skoru | `pipeline/panoramas.py` | var | |
| Kapsama haritası ve yeniden tarama görevi (işleme sonrası) | Portalda kapsama katmanı; `pipeline/coverage.py` → `coverage.json`, `coverage_report`; otomatik `followup_request` (`origin = pipeline`) | var (kapsama görevi) | Ağaç başına yönler ve iki yüz kuralı, %95 eşik, 10×10 m kör nokta hücreleri. Eşiğin altında ya da kör noktada ek ziyaret isteği açılır (ziyaret başına bir); operasyon panosunda "İşleme hattı (kapsama)" kaynağıyla. Uzman özetinde "İşleme hattı" bölümü. Portal karnesinin "Denetim güveni" satırı rapordaki oranı henüz okumuyor: sonraki iş |
| Yükleme: kart ofise, yakın plan senkronizasyonu | `orchados-ingest`, `field/core/sync` | var | |
| Ziyaret kaydı: personel, tarih, başlangıç/bitiş | `session` | var | |
| Ziyaret kaydı: hava, ekipman seri numaraları, sahada yaşanan sorunlar | Ziyaret özetinde form; `visit_log` olayı + `session.weather` | var | Kaydedicinin adı ve sürümü kendiliğinden, kamera seri numarası elle |

## Modül 4 – Değerlendirme akışı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Stitch | Kameranın masaüstü yazılımı | donanım | SDK başvurusu açık |
| PPK, zaman eşleme, kare seçimi, panorama katmanları | `pipeline` | var · donanım | Sentetik veriyle |
| Ağaç eşleştirme: dört yönden kesit | `pipeline/crops.py` | var | |
| Sıra dizilişi karşılaştırması, ağaç var/yok | `pipeline/presence.py` (`crop_greenness`), `tree_visible` metriği (`algorithm`); AI `tree_visible`; uzman "Yok" sınıfı | var (kapsama görevi) · ilk sürüm | Model yok, kesitlerde yeşillik sinyali: evet / hayır / belirsiz; kışın belirsiz. "Hayır" zorunlu incelemeye girer; boş yerde sinyal "yeni dikim olabilir" önerisi. Gövde tespit modeli (`trunk_label`) sonraki iş; eşikler pilotta gerçek kesitlerle ayarlanmalı |
| AI ön değerlendirme: ölçek önerisi, güven, "ağaç görünüyor mu", tutarsızlık bayrakları, kaskad | `services/ai-worker`, `save_ai_assessment` | var | Gerçek API ile denenmedi |
| Zorunlu inceleme kuralları | `web/lib/expert/mandatory-review.ts` | var | |
| Toplu onay ve %5 kalite örneklemi | `bulk_approve_trees` | var | |
| Uzman: onay/düzeltme, bulgu ve öneri, imza | `/uzman/ziyaret/<z>` | var | |
| Uzman: "Ek ziyaret iste" | Özet sayfası "Ek ziyaret iste"; `request_followup`; `/operasyon` "Uzman istekleri" → `ops_plan_followups` | var (bu görev) | İstek ziyaret taranınca tamamlanır |
| Uzman: ağacı sonraki ziyaretin yakın plan listesine ya da doğrulama görevine ekleme | Ağaç panelinde "Takip istekleri" (`followup-panel.tsx`) | var (bu görev) | Yakın plan isteği listeye `expert_request` olarak girer, ağacın sonraki yakın planı gelince tamamlanır; doğrulama isteği operasyonun bağladığı turda kalem olur |
| Ölçekler (metrik kaydı) | `mig/20261021180000_metric_registry.sql` | var | |
| Genel sınıf kuralı | `web/lib/expert/class-rule.ts`; inceleme ekranında "Kurala göre sınıf" | var (bu görev) | Kural 3–5 ölçeklerden öneri olarak gösterilir; Yok ve Kuru uzmanın kararı |
| Metodoloji sürümü her karnede | `session.methodology_version`, portal | var | |
| Uzman kararlarının etiketli veri olarak saklanması | Ekleme-yalnız `assessment`, `measurement` | var | |

## Modül 5 – Durum izleme portalı

| Özellik | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Bahçelerim: son ziyaret, skor, kritik bulgu sayısı | `/portal` | var | |
| Karne: genel durum skoru ve trendi | `web/lib/portal/score.ts` | var | |
| Karne satırından haritayı filtreli açma | `?sinif=` | var | Sadece sağlık sınıfları |
| Boyut: Envanter (yer, ağaç, boş, ara; kaybolan ve yeni) | Karne "Boyut boyut" (`dimensions.tsx`, `web/lib/portal/dimensions.ts`) | var (bu görev) | Kaybolan: kayıp işaretli ya da bu denetimde yeni "yok"; yeni: önceki denetimden sonra envantere giren |
| Boyut: Bahçe yapısı (dişi/erkek oranı, aşısız, yaş dağılımı) | Karne "Boyut boyut" | var (bu görev) | 1 erkeğe N dişi ve 8–10 önerisine göre yorum; cinsiyet bilinmiyorsa ilkbahar notu |
| Boyut: Sağlık dağılımı ve değişimi | Karne | var | |
| Boyut: Mekânsal desen (10×10 m ısı haritası) | `web/lib/portal/cells.ts`; karne satırı ve harita katmanı | var (bu görev) | "Sorunların yarısı N hücrenin K'sında", sıcak hücre sayısı |
| Boyut: Bakım uyumu (budama oranı, hasat) | Karne "Boyut boyut" | var (bu görev) | Toprak işleme ve yabani ot için metrik yok (metodolojide tanımlı değil) |
| Boyut: Zararlı belirtileri (sayı, tür, bölge) | Karne "Boyut boyut" | var (bu görev) | Bölge sıra numarasıyla |
| Boyut: Meyve yükü (dağılım, var/yok yılı) | Karne "Boyut boyut" | var (bu görev) | 300–430 gün önceki yayımlanmış ziyaretle karşılaştırma |
| Boyut: Denetim güveni | Karne | var (bu görev) | Panorama ve yakın plan sayısı, imza tarihi eklendi; imzalayanın adı gösterilmiyor (uzman profili tablosu yok) |
| Sağlık haritası: sınıf rengi, boş yer işareti, sınıf filtresi | `health-map.tsx` | var | |
| Katman: hücre ısı haritası | `health-map.tsx`, `?katman=isi` | var (bu görev) | |
| Katman: kapsama izi | `health-map.tsx`, `?katman=kapsama` | var (bu görev) | Panorama sırasıyla iz; ağaçlar iki yön / tek yön / hiç halkasıyla |
| Katman: bahçe sınırı | `portal-map.tsx` | var | |
| Filtre: "bu ziyarette değişenler" | `health-map.tsx`, `?degisen=1` | var (bu görev) | |
| Filtre: ziyaret seçici | `health-map.tsx`, `?ziyaret=` | var (bu görev) | Varsayılan "Son durum" |
| 360° gezi: haritadan nokta, oklar, ağaç işaretçileri | `tour.tsx` | var | |
| 360° gezi: mini harita ve bakış yönü | Gezi haritasında pembe görüş üçgeni | var (bu görev) | |
| 360° gezi: zamanda gezinme | Gezide ziyaret seçici (`sameSpot`) | var (bu görev) | Aynı noktanın 15 m içindeki panoraması aynı yöne bakarak açılır; yoksa en yakını ve not |
| Ağaç karnesi: kimlik, son ölçekler ve sınıf | `tree-card.tsx` | var | |
| Ağaç karnesi: sınıf zaman çizelgesi | Renkli çizelge + tablo | var (bu görev: çizelge) | |
| Ağaç karnesi: fotoğraf geçmişi, dört yön, yakın planlar | `tree-card.tsx` | var | |
| Ağaç karnesi: kanıt bilgisi (tarih, saat, konum, çeken, hash doğrulaması) | "Kanıt bilgisi" (`tree-card.tsx`, `hash-check.tsx`, `web/lib/portal/evidence.ts`) | var (bu görev) | Kesitte zaman kaynak panoramanın GPS zamanından, çeken ziyaretin sorumlusu. Karar: personel adı yerine kısa kod (`#A1B2`) |
| Ziyaret raporu: önem sırasıyla bulgular, ağaç karnesine bağlantı | Karne | var | |
| Ziyaret raporu: kapsama haritası | Karnede "Kapsama haritası" bağlantısı → kapsama katmanı | var (bu görev) | |
| Ziyaret raporu: uzman imzası, PDF | Karne, yazdırma | kısmen | İmza tarihi eklendi (bu görev); PDF tarayıcının yazdırmasıyla |
| Bildirim: "Rapor hazır" | `notification` tetikleyicisi | var | |
| Bildirim: kritik bulgu, raporu beklemeden | `approve_finding`; uzman panelinde "Onayla ve sahibe hemen bildir" | var (bu görev) | Sahip yayımlanmamış ziyaretin bulgusunu portalda henüz göremez (bilinen sınır) |
| Soru bırakma | `question`, `/uzman/sorular` | var | |

## Veri modeli

| Varlık | Nerede | Durum | Not |
| --- | --- | --- | --- |
| Owner, Parcel, ParcelAccess, Boundary, Slot, Tree | `mig/20261018120100_subject_layer.sql` | var | |
| Visit (`session`), Track, Panorama, Media | `session`, `capture`, `asset` | var | Track = `asset.kind = trajectory` |
| Observation | `measurement` (`source = staff`), sesli not `capture` | var | |
| Assessment, Finding, Comment | `assessment`, `finding`, `question` | var | |
| ParcelScore | Sorgu anında hesaplanıyor | kısmen | Saklanmıyor; skor metodoloji sürümüyle her açılışta yeniden hesaplanır. Karar: ağırlıklar kesinleşene kadar saklanmaz |
| 10×10 m hücreler tabloda değil, sorgu anında | `web/lib/portal/cells.ts`, `closeup_list` | var (bu görev) | Aynı kural iki yerde (`docs/arayuzler.md`) |

## Plan dosyasındaki kesme listesi

| Madde | Durum | Not |
| --- | --- | --- |
| Portalda PDF rapor | kısmen | Tarayıcının yazdırma penceresiyle PDF; kesme listesinin ilk maddesi, ayrı PDF üretimi ilkbahara kalabilir |
| Gezide ağaç işaretçileri | var | |
| Telefon doğrulamasıyla giriş | var | |
| Saha uygulamasında kapsama haritası | var | |
| Uzman panelinde toplu onay ve kısayollar | var | |
