# LiDAR kayıt adımı: ham MCAP'ten kayıtlı nokta bulutuna (tasarım)

18 Kasım 2026 · Yusuf (sahip kararları) · Claude (tasarım)

## 1. Amaç ve neden

Pi kayıt servisi ([2026-11-16-pi-kayit-yazilimi-design.md](2026-11-16-pi-kayit-yazilimi-design.md)) LiDAR'ı ham olarak (`lidar/raw/bag*/…mcap`: L2 noktaları ve IMU'su, ayrıca ham UBX) kaydediyor. LiDAR ölçümleri (İP16, [lidar-olcumleri.md](../../lidar-olcumleri.md)) ve 3D dünya (İP17, [3d-dunya.md](../../3d-dunya.md)) ise tek ve konumlanmış bir nokta bulutu bekliyor ([arayuzler.md](../../arayuzler.md#kayıtlı-nokta-bulutu)). Aradaki "kayıt adımı" yazılmadı. Bu adım olmadan kit LiDAR'ı kaydeder ama sahibe ne ölçüm ne de 3D dünya ulaşır.

**Sahip kararları (18 Kasım 2026):**

1. Adım, pilotta her taramada kendiliğinden çalışan, sürümlü bir hat aşamasıdır. Tek seferlik bir deneme kurulumu değildir.
2. **Karma kalite kapısı:** Açıkça kötü bulut otomatik reddedilir. Sınırdaki bulut operasyona düşer; bir kişi kabul ya da ret der. Açıkça iyi bulut otomatik kabul edilir. Eşikler pilot verisiyle sıkılaştırılır. Gerekçe: 5 Kasım kararıyla LiDAR ölçümleri sahibe uzman onayı beklemeden gider. Bu yüzden kayıt adımı, ölçümlerin önündeki tek kalite kapısıdır.
3. **Ön uç değiştirilebilir:** LiDAR ve IMU'dan yörünge çıkaran SLAM ("ön uç") kendi container'ında çalışır ve ortak bir biçimde çıktı verir. İlk ön uç Unitree'nin L2 ayarlı Point-LIO'su, yedek aday GLIM. İlk gerçek kayıtlarda ikisi karşılaştırılır.
4. Claude'un önerileri, sahip onayıyla:
   - Sınırdaki bulutun kararı personelin 3D dünya ekranında verilir.
   - Adım PPK'sız da çalışır (TUSAGA hesabı açılana kadar).
   - CI'da sentetik bir hareketli LiDAR kaydıyla uçtan uca test edilir.
   - LiDAR yörüngesiyle kamera ve panorama konumlarını iyileştirmek bu sürümde yoktur.

## 2. Hedefler, hedef dışı, anti-hedefler

**Hedefler**
- `orchados-pipeline lidar register <oturum>`: ham kayıttan `cloud.ply`, `cloud.json` ve kalite raporu `registration.json` üretir; her çıktı yöntem sürümünü ve parametre hash'ini taşır.
- `orchados-pipeline lidar process <oturum>`: register → (reddedilmediyse) crown ve world → upload zinciri. İşleme makinesinin akışı (`deploy/processing/orchados-process`) `lidar/raw` olan her oturumda bunu çalıştırır.
- Veritabanında kayıt kararının izi (`lidar_registration`) ve kapı: kabul edilmemiş bir kaydın ölçümleri ve 3D dünya bulutu parsel okuyucularına (sahip, hissedar, izleyici, demo) görünmez.
- Personel 3D dünyasında inceleme: kalite özeti, operasyon için "Kabul et" ve "Reddet".
- Sentetik hareketli tarama (`lidar synth --moving`) ve sahte ön uç ile CI'da uçtan uca test; Point-LIO container'ı için ayrı bir duman testi.

**Hedef dışı (bu sürüm)**
- LiDAR yörüngesiyle panorama ve kamera pozlarını, gövde üçgenlemesini iyileştirmek.
- Döngü kapatma (loop closure). Bunun yerine PPK bağı var; sıra benzerliğinden doğan hatalar kalite raporunda yakalanır.
- GLIM ön ucunun yazılması (ilk gerçek veriden sonra; arayüz ona hazır).
- Kış iskeleti ve budama analizinin otomatik zincire girmesi (araştırma olarak elle kalır).

**Anti-hedefler**
- Sahibe yanlış ölçüm gitmesi. Kapı her belirsizlikte "inceleme"ye düşer, "kabul"e değil.
- Ham `cloud.ply`'nin, yörüngenin ya da zamanın sahibe açılması (H05).
- Yeniden işlemenin eski sonucu silmesi. Her kayıt sürümü kendi klasöründedir; veritabanında satır eklenir.
- GPL kodun hattın Python koduna karışması. Ön uç yalnız ayrı bir süreç ve container olarak çağrılır.

## 3. Kısıtlar

- **Zaman:** Pi'ın saati PPS ile GPS'e kilitli. MCAP'teki `log_time` Pi saatidir (UTC, ns). L2 sürücüsünün `header.stamp`'ı LiDAR'ın kendi saatinden gelebilir; bu saatin yarı hızda aktığı bir rapor var (unilidar_sdk2 #25). Ön uca giden damgalar Pi saatinde olmalıdır (§5.2).
- **Sürücü hataları:** ROS 2 sürücüsü IMU paketini iki kez okuyup birini kaybediyor (#33), kuaternyon sırası yanlış (#14). Kit kurulumunda düzeltilir (§9). Hat, IMU hızı beklenenin altındaysa ön ucu çalıştırmaz ve raporda `imu_rate_low` ile reddeder.
- **Kesintiler:** Kayıtta LiDAR kesintileri (`recording.json` `gaps`) ve `ros2 bag` yeniden başlatmaları (`bag.N/`) olabilir. SLAM kesintiyi aşamaz; oturum kesintilerden parçalara bölünür ve her parça ayrı çalışır.
- **Boyut:** Oturum 1–2 saat; nokta ~64.000/s. Bellek, bulutun tamamını bir kerede tutmayacak biçimde kullanılır: anahtar kareler diskte, bulut parça parça yazılır.
- **Lisans:** Point-LIO ve ROS 2 portu GPL-2. Ön uç imajı ayrı derlenir, kaynakları açık depolardan sabit commit'le alınır. İmaj herkese açık bir kayda gönderilmez.
- **Kurallar** (CLAUDE.md): ölçümler sürümlü; medya değiştirilemez; saha verisi repoya girmez (testler sentetik); yeni tablo `attach_demo_guard` çağırır; migration zaman damgası en yeniden sonra.

## 4. Yaklaşımlar

Ortak kısım her yolda aynı ve bizim yazdığımız Python koddur: PPK ile birleştirme (GTSAM poz grafiği), bulutu kurma, kalite raporu ve kapı. Yollar ön uçta ayrılır.

| | A. Point-LIO (L2 ayarı) | B. GLIM | C. KISS-SLAM |
| --- | --- | --- | --- |
| L2 uyumu | Unitree'nin L2 ayar dosyası; sürücünün nokta alanları (`ring`, `time`) birebir | Genel; L2'de çözülmemiş bir kayma raporu (#248) | IMU yok |
| Çalışma | ROS 2 portu (Humble'da denenmiş), kayıttan oynatma | Kaydı doğrudan okuyan çevrimdışı mod | `pip`, ROS'suz |
| Lisans | GPL-2, ayrı container | Çekirdek MIT | MIT |
| Değerlendirme | **Seçildi**, ilk ön uç | Yedek, sonraki iş | Elendi: titreşimde ve seyrek bulutta IMU'suz yöntem zayıf |

LIO-SAM da elendi: GPS desteği hazır ve lisansı serbest, ama 9 eksenli IMU istiyor, L2'nin IMU'su 6 eksenli.

## 5. Yapı

### 5.1 Akış

```
lidar/raw/bag*/…mcap ──► segment ──► ön uç (container) ──► anahtar kareler
gnss/gnss.ubx ──► position aşaması ──► trajectory.json ───┐        │
                                                          ▼        ▼
                                              birleştirme (GTSAM, PPK)
                                                          │
                                       bulut (ENU) + kalite raporu + karar
                                                          │
                     <oturum>.processed/lidar/registration/<sürüm>/
                         cloud.ply  cloud.json  registration.json
```

### 5.2 Parçalara ayırma ve damgalar

- **Parçalar:** `recording.json`'daki `gaps` ve `segments` (bag klasörleri) okunur. 2 sn'den uzun her LiDAR kesintisi ve her `bag.N/` başlangıcı yeni bir parça açar. 20 sn'den kısa parçalar atlanır ve rapora yazılır.
- **Damgalar:** Hat her parçada `header.stamp` ile `log_time`'ı karşılaştırır. Fark 50 ms'den büyükse ya da eğim 1'den 10⁻⁴'ten fazla saparsa ön uca giden geçici bir MCAP yazılır. Bu kopyada `header.stamp` ve noktaların göreli `time` alanı aynı kalır, yalnız mesajın damgası `log_time`'a taşınır. Hangi parçada ne yapıldığı rapora yazılır.
- **IMU hızı:** Parçanın IMU mesaj hızı beklenen hızın yarısının altındaysa (beklenen değer parametredir; sürücü düzeltildikten sonra masada ölçülür) parça `imu_rate_low` ile atlanır.

### 5.3 Ön uç sözleşmesi

Hat ön ucu bir arayüzün arkasından çağırır: `Frontend.run(session_dir, segments, work_dir) -> FrontendResult`. Uygulamalar şunlar:
- `fake`: Sentetik oturumun gerçek yörüngesine sürüklenme ve gürültü ekleyerek anahtar kare üretir. Yalnız testler için.
- `point_lio`: `docker run` ile ön uç imajını çağırır.
- `glim`: Sonraki iş.

Çıktı `work_dir/frontend/` klasörüne yazılır:

- `frontend.json` (`schema: orchados.lio_frontend/1`): `method`, `method_version`, `config_hash` ve parça listesi. Her parça için `index`, `start_gps_ns`, `end_gps_ns`, `keyframe_count`, `status` (`ok`, `failed`) ve `message` bulunur. Bunlara ek olarak `imu_rate_hz` ve `points_total`.
- `keyframes.csv`: `segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan`. Poz, parçanın kendi odometri çerçevesinde LiDAR gövdesinin pozudur; `scan` dosya adıdır.
- `scans/<segment>_<index>.npz`: `xyz` (N×3 float32, LiDAR gövde çerçevesi, anahtar kare anına göre bozulması giderilmiş) ve `intensity` (N float32).

Anahtar kare aralığı ön ucun parametresidir. Başlangıç değeri 0,5 m, 10° ya da 1 sn'den hangisi önce gelirse.

### 5.4 Point-LIO ön uç imajı

- Konum `deploy/lidar-frontends/point-lio/`: ROS 2 Humble tabanı, sabit bir commit'te `dfloreaa/point_lio_ros2` ve L2 ayar dosyası.
- Giriş noktası her parça için şunları yapar: `ros2 bag play --clock` (hız parametre, başlangıç 1,0), Point-LIO ve küçük bir kaydedici düğüm. Kaydedici odometriyi ve gövde çerçevesindeki taramaları dinleyip §5.3 biçiminde yazar.
- **Belirlenimlilik:** Kayıttan oynatma gerçek zamana bağlıdır, aynı girdi iki çalıştırmada birebir aynı sonucu vermeyebilir. Kalite raporu her çalıştırmayı ayrı değerlendirir; sürüm etiketi imajın içerik hash'idir.
- **Çağırma:** İşleme container'ı ön ucu kardeş container olarak Docker soketi üzerinden ya da makinede doğrudan çalıştırır. Hangisinin kullanılacağı işleme makinesinin betiğinde (`deploy/processing/`) belirlenir.

### 5.5 Birleştirme

- **Poz grafiği (GTSAM, Python):** Anahtar kareler düğümdür. Ardışık kareler arasında ön ucun göreli pozundan bir bağ (between factor) kurulur. Gürültüsü parametredir: metre başına ve derece başına sigma. Her parça kendi bağ zinciridir; parçalar birbirine yalnız GNSS ile bağlanır.
- **GNSS bağı:** Yörüngeden (`trajectory.json`) anahtar kare anına aradeğerlenen konum, kaldıraç kolu (LiDAR gövdesinden anten faz merkezine vektör, parametre; kalibrasyonda ölçülür) üzerinden düğüme bağlanır. Sigma çözüm kalitesinden ve yörüngenin `sd_*` alanlarından gelir; fix, float ve single'ın tavanları parametredir. Huber çekirdeği kullanılır.
- **PPK'sız:** NAV-PVT yörüngesi aynı yolla kullanılır; sigmalar büyük olduğu için bulut yalnız metre düzeyinde konumlanır.
- **Çıktı:** Her anahtar karenin ENU'daki pozu. Orijin, `LocalFrame` ile yörüngenin ilk geçerli noktasıdır.

### 5.6 Bulut

- Her taramanın noktaları kendi pozuyla ENU'ya taşınır ve `cloud.ply`'ye parça parça eklenir (`x,y,z` float, `intensity` float).
- Kitin kendisine (direk, kamera, anten) düşen noktalar atılır: LiDAR'a 0,4 m'den yakın noktalar ve tepe konisi (parametreler).
- 1 cm'lik vokselde yinelenen noktalar birleştirilir; ham sözleşme bozulmaz, yalnız boyut sınırlanır.
- `cloud.json` sözleşmedeki alanları taşır:
  - `registration_method`: `point_lio+gtsam_ppk`; PPK yoksa `point_lio+gtsam_navpvt`.
  - `registration_version`: hattın sürümü, artı imaj hash'inin ilk 12 hanesi.
  - `point_sigma_m`: GNSS artıklarının p95'i ile ön ucun nokta gürültüsünün karesel toplamı.

### 5.7 Kalite raporu ve karar

`registration.json` (`schema: orchados.lidar_registration/1`):
- `producer`, `session_id`, `parcel_id`, `method`, `method_version`, `params_hash`, `ppk_status`;
- `segments` (§5.2'deki parça listesi ve atlananlar);
- `metrics`:
  - `gnss_residual_rms_m`, `gnss_residual_p95_m`, `gnss_residual_max_m`: birleştirmeden sonra, yalnız fix noktalarında; PPK yoksa bütün noktalarda;
  - `lio_drift_m_per_100m`: birleştirmeden önce, her parçanın GNSS'e tek bir katı hizalanmasından sonraki sapma;
  - `lio_coverage`: ön ucun pozladığı süre ÷ kayıt süresi;
  - `trunk_spread_p95_m` ve `trees_checked`;
  - `gaps_s_total`;
- `verdict` (`accepted_auto`, `review`, `rejected_auto`), `reasons` (kodlar) ve kullanılan `thresholds`.

**Gövde tutarlılığı:** Envanterdeki (`trees.json`) her ağaç için, gövde konumuna 1 m içinde ve yerden 0,5–1,5 m yükseklikte kalan noktalar geçişlere ayrılır. Bir geçiş, LiDAR'ın ağaca 10 m'den yakın olduğu kesintisiz bir süredir. En az iki geçişte görülen ağaçlarda geçişlerin gövde merkezleri arasındaki en büyük uzaklık alınır; p95'i `trunk_spread_p95_m`'dir. Bu ölçüt sıra benzerliğinden doğan çift ağaç hatasını ve kaymayı yakalar.

**Başlangıç eşikleri** (parametre; ilk gerçek taramalarla ayarlanır):

| Karar | Koşul |
| --- | --- |
| `rejected_auto` | `lio_coverage` < 0,5; ya da `gnss_residual_p95_m` > 1,0 (PPK'lı); ya da `trunk_spread_p95_m` > 0,5; ya da hiç parça çalışmadı |
| `accepted_auto` | PPK'lı **ve** `gnss_residual_p95_m` ≤ 0,15 **ve** `trunk_spread_p95_m` ≤ 0,15 (en az 10 ağaç) **ve** `lio_coverage` ≥ 0,9 |
| `review` | Geri kalan her durum. PPK'sız bir bulut hiçbir zaman `accepted_auto` olmaz |

### 5.8 Veritabanı ve kapı

Önce [veri-modeli.md](../../veri-modeli.md) güncellenir, sonra migration yazılır.

- **`public.lidar_registration`:**
  - Kimlik ve köken: `id`, `session_id`, `method`, `method_version`, `params_hash`, `ppk_status`.
  - Kalite: `metrics jsonb`, `auto_verdict`, `reasons text[]`.
  - Karar: `status` (`accepted`, `rejected`, `pending_review`), `decided_by`, `decided_at`, `decision_note`, `created_at`.
  - Tekillik `(session_id, method, method_version, params_hash)`.
  - `auto_verdict`'ten başlangıç durumu: `accepted_auto` → `accepted`, `rejected_auto` → `rejected`, `review` → `pending_review`.
  - Satır silinmez. Karar yalnız aşağıdaki fonksiyonla değişir ve yalnız `pending_review`'dan bir kez değişir.
  - Migration `attach_demo_guard` çağırır.
- **`record_lidar_registration(p_session_id, p_payload)`:** Yalnız operasyon kullanıcısı çağırır (hat). Tekrar güvenlidir.
- **`decide_lidar_registration(p_id, p_accept, p_note)`:** Yalnız operasyon rolü çağırır. Ret notu zorunludur.
- **Ölçümler:** `record_lidar_measurements` payload'ı `registration_id` alır. LiDAR yöntemli ölçüm satırı hangi kayıttan geldiğini taşır. Parcel okuyucuları, kaydı `accepted` olmayan LiDAR ölçümlerini görmez; personel hepsini görür. Mekanizmayı (sütun ve RLS, ya da görünüm) uygulayıcı seçer. pgTAP ile denetlenir: sahip, hissedar ve demo kullanıcısı bekleyen ya da reddedilmiş bir kaydın ölçümünü ve `world_cloud`'unu göremez.
- **3D dünya bulutu:** `world_cloud` asset'i `pose.registration_id` taşır. Parsel okuyucusunun okuma kuralı, kaydın `accepted` olmasını da şart koşar. Personel bekleyen bulutu görür; inceleme bunun için var.
- **Kabulden sonra:** Ölçümler ve bulut zaten yüklü olduğu için kabul anında görünür olurlar; hattı yeniden çalıştırmak gerekmez.

### 5.9 Arayüz (personel)

- **Personel dünyası** ([3d-dunya.md](../../3d-dunya.md) §9.4): Seçili ziyaretin kaydı `pending_review` ise üstte "LiDAR kaydı incelemede" bandı çıkar. Bantta kalite özeti (GNSS sapması, gövde tutarlılığı, kapsama, PPK durumu ve nedenler) gösterilir. Operasyon rolüne "Kabul et" ve "Reddet" düğmeleri görünür; ret için not istenir. `rejected` kayıtta "LiDAR kaydı reddedildi" ve not, `accepted` kayıtta karar ve karar veren görünür.
- **Operasyon panosu:** "İncelemede bekleyen LiDAR kayıtları" listesi. Her satırda parsel, ziyaret, tarih ve nedenler bulunur; satır personel dünyasını açar.

### 5.10 Hatta bağlama

- `lidar register` ve `lidar process` komutları (`services/pipeline/src/orchados_pipeline/lidar/`).
- Çıktı klasörü: `<oturum>.processed/lidar/registration/<method>-<method_version>-<params_hash[:8]>/`.
- **Ölçüm aşamalarının bulutu bulması:** `lidar crown` ve `lidar world` gibi aşamalar buluta `--cloud <klasör>` ile ulaşır. Verilmezse önce oturum klasöründeki `lidar/cloud.ply`'ye bakılır (sentetik ve eski düzen). O da yoksa reddedilmemiş en yeni kayıt klasörü kullanılır. Bu değişiklik önce [arayuzler.md](../../arayuzler.md#kayıtlı-nokta-bulutu)'ye yazılır.
- `lidar upload` kayıt raporunu da yükler (`record_lidar_registration`). Ölçümlere ve `world_cloud`'a `registration_id` ekler. `rejected_auto` bir kaydın ölçümleri yüklenmez.
- İşleme makinesi akışı: `lidar/raw` varsa `position`'dan sonra `lidar process` çalışır.

### 5.11 Yeniden çalıştırma, ilk tarama, saat, eski satırlar

Bu dört karar uygulayıcı denetiminden sonra Claude tarafından verildi; sahip sabah gözden geçirecek.

- **Her çalıştırmanın kendi kimliği var:** `register` her çalıştırmada bir `run_id` (uuid) üretir.
  - Klasör adı: `<method>-<method_version>-<params_hash[:8]>-<run_id[:8]>/`.
  - Tablonun tekillik anahtarı `run_id`'dir. Aynı girdi ve aynı parametrelerle yeniden çalıştırmak yeni bir kayıt açar, eskisini silmez.
  - **Bir oturumda tek geçerli kabul:** Bir kayıt `accepted` olunca (otomatik ya da operasyon kararıyla) aynı oturumun önceki `accepted` kaydı `superseded` olur. Sahip yalnız geçerli kabulün ölçümlerini ve bulutunu görür.
  - `record_lidar_measurements`'ın "zaten var" denetimi `registration_id`'yi de anahtara katar. Böylece yeni çalıştırmanın ölçümleri eskilerin yerine yazılmaz, yanına eklenir.
  - Personel bandı ziyaretin en yeni kaydını gösterir; varsa önceki kayıtların sayısı ve durumları özetlenir.
- **İlk tarama (envanter yokken):** Gövde tutarlılığı envantere değil buluttaki gövde adaylarına dayanır. Yerden 0,5–1,5 m yükseklikteki noktalar 0,3 m'lik hücrelerde kümelenir; dikey, ince kümeler gövde adayıdır. Bu yüzden kalite kararı ilk taramada da verilir.
  - Taç ölçümleri ağaç kimliği ister. Envanter yoksa `lidar process` yalnız kaydı ve 3D dünyayı üretir; crown atlanır ve rapora yazılır.
  - Envanter kaydedildikten sonra operasyon, `lidar process <oturum> --reuse-registration` ile aynı (reddedilmemiş en yeni) kaydın bulutundan crown'ı çalıştırıp yükler. Yeni kayıt açılmaz. Bunun kendiliğinden tetiklenmesi sonraki iştir.
- **Saat kilitli değilse:** `recording.json`'da `clock_state_at_start` `pps` değilse, ya da `recording.json` yoksa (güç kesintisi) kayıt yine çalışır. Bu durumda karar en iyi ihtimalle `review` olur ve nedeni `clock_unlocked` ya da `no_recording_json` diye yazılır. `recording.json` yoksa parçalar yalnız MCAP'ten çıkarılır. Saat kaymasını kendiliğinden kestirmek bu sürümde yok.
- **Kayıtsız eski satırlar:** `registration_id`'si boş LiDAR ölçümleri ve `world_cloud`'lar bugünkü gibi görünür kalır; bunlar demo ve sentetik veridir. Gerçek kit verisinin hep bir kaydı olur, çünkü `lidar upload` kayıtsız ölçüm yüklemeyi `--allow-unregistered` verilmedikçe reddeder. Demo yükleyicisi bu bayrağı kullanır.

## 6. Test

- **Sentetik hareketli tarama** (`lidar synth --moving <klasör>`): Sıralar boyunca bir yol üretir ve şunları yazar:
  - L2 benzeri taramalar (yarım küre, 64.000 nokta/s, 10 Hz mesaj, noktada göreli `time` ve `ring`);
  - türevlerden IMU, gürültüyle;
  - kitin konu adları ve mesaj tipleriyle bir MCAP (ROS'suz; `mcap-ros2-support`);
  - `gnss/gnss.ubx` (NAV-PVT), `recording.json`, `trees.json` ve gerçek yörünge (`truth.json`, sözleşme dışı).
- **Sahte ön uçla uçtan uca (CI):** register'ın çıktıları kontrol edilir: bulut gerçek ağaçlarla santimetre düzeyinde örtüşüyor; karar beklenen gibi. Ayrıca şu durumlar denenir: kesinti, `bag.1`, damga kayması, düşük IMU hızı, PPK'sız, sürüklenme eklenmiş ön uç (`review`, `rejected_auto`) ve çift ağaç.
- **Point-LIO imajı:** Ayrı bir duman testi. Kısa bir sentetik kayıtla çalışıp §5.3 biçiminde çıktı verdiği denetlenir. Ağırdır, elle ya da ayrı bir iş akışında çalışır.
- **Veritabanı:** pgTAP. Kapı (okuyucu rolleri), karar fonksiyonunun yetkisi ve tek seferliği, demo kilidi.
- **Web:** Birim ve entegrasyon testleri. Bant ve düğmelerin role göre görünmesi; kabul ya da retten sonra durum.
- **Gerçek veri:** İlk masa ve koridor kayıtlarında eşikler ve ön uç ayarları; Point-LIO ile GLIM karşılaştırması. Yazılımın dışında, plan Görev 17'de ve Kapı 1'de yapılır.

## 7. Uygulayıcıya bırakılanlar

Point-LIO parametreleri; anahtar kare aralığı; poz grafiği sigmaları; voksel boyutu; kaldıraç kolu varsayılanı (kalibrasyon kaydından okunana kadar parametre); ön ucun kardeş container mı doğrudan mı çağrılacağı; kapının veritabanındaki mekanizması (§5.8'deki şartlarla); bant ve pano metinleri.

## 8. Riskler

| Risk | Etki | Önlem |
| --- | --- | --- |
| L2 IMU hataları (#9: yan açılışta ivme, #25: zaman tabanı) | Ön uç ıraksar | Damga kontrolü (§5.2), IMU hızı kapısı, kalite kapısı; masada doğrulama |
| Sıra benzerliği | Çift ağaç, kayma | PPK bağı, gövde tutarlılığı ölçütü |
| Motosiklet titreşimi | Gürültülü IMU, duvar ikilenmesi (#27) | Sönümleyici; ilk taramada ölçülür; eşikler |
| Point-LIO ROS 2 portu Humble'da denenmiş | Derleme ve çalışma sorunu | Ayrı imaj, Humble tabanı |
| Kayıttan oynatmanın belirlenimsizliği | Aynı girdiye farklı sonuç | Her çalıştırma ayrı kayıt, rapor ve sürüm |
| Uzun oturumda bellek | Çökme | Parça ve anahtar kare diskte, bulut parça parça yazılır |

## 9. Ön koşul: kit sürücüsü düzeltmesi

`services/kit-recorder/setup/install.sh` L2 sürücüsünü düzeltilmemiş haliyle derliyor. Kurulum iki yamayı uygular: unilidar_sdk2 PR #33'teki IMU'nun iki kez okunması ve #14'teki kuaternyon sırası. Ayrıca Görev 17'ye iki masa kontrolü eklenir: `/unilidar/imu` hızı ve L2 yan dururken ivme değerleri (#9). Bu iş kayıt adımından bağımsızdır ve ondan önce yapılır.
