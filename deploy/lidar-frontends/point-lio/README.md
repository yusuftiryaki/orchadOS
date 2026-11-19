# Point-LIO ön uç imajı (Unitree L2)

LiDAR kayıt adımının ilk ön ucu (tasarım: `docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md` §5.3–5.4, plan Görev 9). İmaj, oturumun ham MCAP kaydını parça parça Point-LIO'ya oynatır ve her parçanın anahtar karelerini `orchados.lio_frontend/1` biçiminde yazar. PPK ile birleştirme, bulut ve kalite raporu hattın işidir (`services/pipeline`); imaj yalnız LiDAR-IMU odometrisini ve gövde çerçevesindeki taramaları üretir.

## Lisans

Point-LIO (`hku-mars/Point-LIO`) ve kullandığımız ROS 2 portu (`dfloreaa/point_lio_ros2`) GPL-2.0'dır. Bu yüzden:

- Kaynaklar açık depolardan **sabit commit'le** derleme sırasında alınır; repoda yalnız tarif (Dockerfile), küçük bir yama (`patches/`), ayar dosyası ve kendi betiklerimiz durur.
- İmaj içinde yamalı kaynak durur (`/opt/point_lio_ws/src/point_lio`), yani dağıtılırsa karşılık gelen kaynak yanındadır.
- İmaj **herkese açık bir kayda gönderilmez**; işleme makinesinde yerelde derlenir.
- Hat ön ucu ayrı bir süreç olarak (`docker run`) çağırır; hattın kodu Point-LIO'ya bağlanmaz.

## Sabitlenen sürümler

| Ne | Sürüm |
| --- | --- |
| Taban imaj | `ros:humble-ros-base-jammy@sha256:d9f14e84747bea639a65e00cf871d2c68ae55385d2acf6239614de0cadb41dcc` |
| Point-LIO ROS 2 portu | `https://github.com/dfloreaa/point_lio_ros2` @ `a8e2d0d5090af97ead8dd4fac3d37cf3dbb33ff7` (2025-08-14) |
| L2 ayarlarının kaynağı | `https://github.com/unitreerobotics/point_lio_unilidar` @ `18ed5976d8fab2bd8a5148c26a40692bd3c0dc91`: `config/unilidar_l2.yaml`, `launch/mapping_unilidar_l2.launch` |
| Tarif sürümü | `ORCHADOS_RECIPE_VERSION=2` (Dockerfile; 2: `blind_m`, anahtar kare taraması aradaki taramaları da taşır) |

İmajın yazdığı `method_version` `<commit[:7]>-r<tarif>` biçimindedir (şu an `a8e2d0d-r2`). Hattın çağırıcısı bunun önüne imaj kimliğinin (`docker image inspect`, içerik hash'i) ilk 12 hanesini ekler: `885990e2c016-a8e2d0d-r2` (tasarım §5.4, §5.6). `config_hash`, ayar dosyasının SHA-256'sı ile çalışma anındaki `blind_m`'den hesaplanır. Tarif, yama, ayar ya da kaydedici sonuçları değiştirebilecek biçimde değişirse `ORCHADOS_RECIPE_VERSION` artırılır.

## İçerik

| Dosya | Ne |
| --- | --- |
| `Dockerfile` | İki aşama: derleme (PCL geliştirme paketleri, `colcon build`, `MAKEFLAGS=-j2`) ve çalışma (yalnız ikilinin yüklediği kütüphanelerin paketleri, `rosbag2` MCAP eklentisi, numpy) |
| `patches/0001-…patch` | Porta iki değişiklik: kullanılmayan `pcl_ros` bağımlılığını kaldırır; `/cloud_registered_body`'de her noktanın zamanını (`curvature`, tarama başından ms) korur. Point-LIO taramayı kendisi düzeltmez (nokta nokta günceller); kaydedici bu zamanla düzeltir |
| `config/unilidar_l2.yaml` | L2 ayarları (aşağıda) |
| `config/qos_overrides.yaml` | `ros2 bag play` iki girişi güvenilir (reliable) yayımlar; sürücü best-effort kaydettiyse Point-LIO'nun IMU aboneliği yine veri alır |
| `entrypoint.sh` | Parça döngüsü: Point-LIO + kaydedici + `ros2 bag play`, bitiş, durum |
| `keyframe_recorder.py` | `plan` (parçalar, dosyalar, başlangıç ofsetleri), `record` (ROS 2 düğümü: anahtar kareler), `finalize` (`frontend.json`, `keyframes.csv`) |
| `tools/make_test_bag.py` | Duman testi için küçük sentetik L2 kaydı (imaj içinde, rosbag2 ile) |
| `tools/session_segments.py` | Bir oturum klasörü için her `lidar/raw/bag*/` klasörüne bir parça (yalnız duman testi) |
| `tools/check_output.py` | Çıktıyı sözleşmeye göre denetler; sentetik kayıtta gerçek yörüngeyle karşılaştırır |
| `smoke.sh` | Derler, çalıştırır, denetler |

### L2 ayarları

Unitree'nin ROS 1 L2 dosyasındaki değerler: konular `/unilidar/cloud` ve `/unilidar/imu`, `lidar_type: 5` (alanlar `x, y, z, intensity, ring (uint16), time (float32)`), `timestamp_unit: 0` (nokta `time`'ı saniye, `header.stamp`'a göre), `scan_line: 18`, `blind: 0.5` (çalışırken `blind_m` ile ezilir, aşağıda), IMU 250 Hz (`imu_time_inte: 0.004`), `acc_norm: 9.81` (m/s²), IMU→LiDAR dış parametreleri `extrinsic_T: [0.007698, 0.014655, -0.00667]`, `extrinsic_R: I`, `extrinsic_est_en: false`. Unitree'nin launch dosyasından `filter_size_surf/map: 0.4`, `init_map_size: 10`, `point_filter_num: 1`.

Bizim değişikliklerimiz: `odom_only: false` (gövde taraması için gerekli); `publish_odometry_without_downsample: false` (taramada bir odometri, taramayla aynı damga); `scan_bodyframe_pub_en: true`; `path_en: false` (yol mesajı sınırsız büyür); `pcd_save_en: false` (harita bellekte birikir). ROS 2 tam sayıyı ondalık parametreye kabul etmediği için tüm ondalık değerler noktalı yazılır.

**Kör menzil (`blind_m`):** Giriş noktası Point-LIO'yu `-p preprocess.blind:=<blind_m>` ile başlatır (`segments.json`, varsayılan 0,6 m). Point-LIO ham noktaları LiDAR çerçevesinde, bozulma düzeltmesinden önce bu menzilde atar. Kitin direği ve bağlantısı böylece taramaya girmez. Atılmasaydı hareket hâlindeki bir anahtar karede düzeltmeyle yol boyunca yayılır, hattın tepe konisi maskesinden kaçardı. Değer, sahte ön ucun `blind_m=0.6`'sıyla aynıdır. Sentetik direk 0,15–0,55 m'de nokta döndürür; Unitree'nin 0,5'i 0,50–0,55 m'deki direk noktalarını bırakıyordu (226 anahtar karede 2.240 nokta), 0,6 hiçbirini bırakmıyor.

## Giriş ve çıkış

```
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v <oturum>:/in/session:ro \
  -v <segments.json>:/in/segments.json:ro \
  -v <iş klasörü>:/out \
  orchados-lio-point-lio:local
```

`--network none`: DDS keşfi container içinde kalır (imajda ayrıca `ROS_LOCALHOST_ONLY=1`). Paralel çalışan iki ön uç birbirini görmez.

**Giriş** `/in/segments.json`:

```json
{
  "segments": [
    {"index": 0, "mcap": ["lidar/raw/bag/bag_0.mcap"], "start_gps_ns": 1479035218000000000, "end_gps_ns": 1479035231000000000}
  ],
  "rate": 1.0,
  "keyframe": {"dist_m": 0.5, "angle_deg": 10, "dt_s": 1.0},
  "blind_m": 0.6
}
```

- `mcap`: göreli yollar `/in/session`'a göredir; mutlak yollar olduğu gibi kullanılır (hattın damgaları düzeltilmiş geçici kopyaları `/in/restamped` ya da `/in/extra/<n>` bağlamasıyla verilir).
- `blind_m`: Point-LIO'nun kör menzili, metre (yoksa 0,6).
- Zaman: kayıttaki damgalar Unix (UTC) ns'dir; `gps_ns = unix_ns − 315964800·10⁹ + 18·10⁹`.
- Her dosya ilk mesajının zamanına göre sıralanır ve `--start-offset` ile parçanın başından oynatılır. Humble'ın `ros2 bag play`'inde süre sınırı yok; kaydedici `/clock` parça sonunu 0,5 sn geçince işaret bırakır, giriş noktası oynatıcıyı durdurur. Parça dışındaki odometri ve taramalar yazılmaz.

**Çıkış** `/out/`:

- `frontend.json`: `schema: orchados.lio_frontend/1`, `method: point_lio`, `method_version`, `config_hash`, `blind_m`, `segments[]` (`index`, `start_gps_ns`, `end_gps_ns`, `keyframe_count`, `status` `ok`/`failed`, `message` (başarılıysa `null`), ayrıca `imu_rate_hz`, `points_total`, `keyframes_recorded`, `odometry_count`), `imu_rate_hz` (parçaların toplamından), `points_total` (parça pencerelerindeki giriş noktaları), `rate`, `keyframe`, `source`.
- `keyframes.csv`: `segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan`. Poz, parçanın kendi odometri çerçevesinde **LiDAR gövdesinin** pozudur: `T_WL = T_WI · T_IL`. Çerçevenin eksenleri Point-LIO'nun `camera_init`'idir (yerçekimine hizalı); başlangıç noktası parçanın ilk anahtar karesindeki LiDAR konumuna taşınır. Yalnız `ok` parçaların satırları yazılır.
- `scans/<segment>_<index>.npz`: `xyz` (N×3 float32, LiDAR gövde çerçevesi, anahtar kare anına göre düzeltilmiş), `intensity` (N float32). Anahtar karenin kendi taraması ve bir sonraki anahtar kareye kadarki bütün taramalar (sahte ön uçtaki gibi; aradaki taramalar kaybolmaz). Başarısız parçaların taramaları silinir; taraması yazılamamış satır düşer.
- `logs/`: parça başına Point-LIO, kaydedici ve oynatıcı günlükleri (sözleşme dışı, hata ayıklama için). `.work/`: ara dosyalar.

### Kaydedici nasıl çalışır

- Point-LIO'nun durumu IMU pozudur: `/aft_mapped_to_init` (`nav_msgs/Odometry`, taramanın bitiş zamanıyla damgalı) ve `/cloud_registered_body` (taramanın tamamı, IMU gövde çerçevesinde, aynı damga). Kaydedici ikisini damgayla eşler.
- **Anahtar kare:** son anahtar kareye göre LiDAR ≥ `dist_m` yer değiştirdiyse, ≥ `angle_deg` döndüyse ya da ≥ `dt_s` geçtiyse. Parçanın ilk eşleşen taraması her zaman anahtar karedir.
- **Anahtar kare taraması:** Penceredeki her tarama düzeltilir, odometri pozuyla o anki anahtar karenin LiDAR çerçevesine taşınır ve o karenin taramasına eklenir; dosya bir sonraki anahtar kare başlarken (ya da kaydedici dururken) yazılır. Tarif 1 yalnız anahtar karenin kendi taramasını yazıyordu: 1,5 m/sn'de taramaların ~%75'i (sentetik oturumda bulutun 4,7 M yerine 1,4 M noktası) kayboluyordu.
- **Bozulma düzeltmesi:** Tarama boyunca gövde hızı sabit kabul edilir. Hız, önceki taramanın pozundan (0,3 sn içindeyse) ortalama olarak, yoksa Point-LIO'nun hız çıktısından (`twist`) alınır. Her nokta, `curvature` alanındaki zamanıyla tarama sonundaki gövde çerçevesine taşınır (`p' = Exp(−ω·dt)·p − (v·dt − dt²/2·ω×v)`), sonra IMU çerçevesinden LiDAR çerçevesine (`p_L = R_extᵀ(p_I − T_ext)`).
- **Ölçümler:** `/unilidar/imu` damgalarından IMU hızı, `/unilidar/cloud`'dan nokta sayısı (parça penceresi içinde).

### Parça durumu

Parça `failed` olur ve `message` nedeni yazar: MCAP yok ya da okunamıyor, Point-LIO başlangıçta ya da oynatma sırasında öldü (çıkış kodu), Point-LIO 60 sn içinde ayağa kalkmadı (`READY_TIMEOUT_S`), pencerede odometri yok, pencerede anahtar kare yok, oynatma bittikten sonra Point-LIO 600 sn hâlâ yayımlıyor (`RECORDER_MAX_WAIT_S`). Oynatma bittikten sonra kaydedici, Point-LIO 5 sn (`RECORDER_IDLE_S`) sessiz kalınca durur; Point-LIO önce SIGINT, 10 sn sonra SIGKILL ile kapatılır.

## Hattan çağırma

Hat ön ucu `services/pipeline/src/orchados_pipeline/lidar/frontend/point_lio.py` (`PointLioFrontend`) ile çağırır:

```
uv run orchados-pipeline lidar register <oturum> --frontend point_lio   # ya da lidar process
ORCHADOS_POINT_LIO_IMAGE=<imaj> ...                                      # varsayılan orchados-lio-point-lio:local
```

- `PointLioFrontend(image=$ORCHADOS_POINT_LIO_IMAGE or "orchados-lio-point-lio:local", rate=1.0, docker="docker", *, blind_m=0.6, keyframe_*, docker_args=(), timeout_s=None)`.
- Önce `docker image inspect` (imaj kimliği, `POINT_LIO_COMMIT`, `ORCHADOS_RECIPE_VERSION`). Docker yoksa ya da imaj yoksa açık bir hata verir (imajı derleme komutuyla); komut satırı `lidar register/process` bunu yazar ve 2 ile çıkar, yarım kayıt klasörü kalmaz.
- `<iş>/point_lio/segments.json` yazılır. Oturumun içindeki bag klasörleri `/in/session`'a göreli verilir. Damgası düzeltilecek (§5.2) ve hâlâ oturumu gösteren parçanın kopyası `write_restamped` ile `<iş>/point_lio/restamped/`'e yazılır ve `/in/restamped`'e bağlanır. Oturum dışındaki klasörler (ör. `registration.run`'ın zaten düzelttiği kopyalar) `/in/extra/<n>`'e salt okunur bağlanır.
- `docker run --rm --network none --user <uid>:<gid> --name orchados-point-lio-<rastgele> -v <oturum>:/in/session:ro -v <segments.json>:/in/segments.json:ro [-v …:/in/restamped:ro] [-v …:/in/extra/<n>:ro] -v <iş>/frontend:/out <imaj>`. Çıktı `<iş>/point_lio/docker.log`'a gider; sıfırdan farklı çıkışta günlüğün son 30 satırıyla hata verilir. Düzeltilmiş kopyalar çalıştırmadan sonra silinir.
- Çıktı `read_frontend_output` ile okunur; `frontend.json`'a `image` (`name`, `id`, imajın kendi sürümü) eklenir, `method_version` imaj kimliğiyle yazılır. `blind_m` taşımayan (tarif 1) bir imajın çıktısı reddedilir: direk taramada kalırdı. Başarısız parçalar (`status: failed`, `message`) kayıt raporuna olduğu gibi geçer.
- Birim testleri Docker'sız: sahte bir `docker` çalıştırılabiliri (`tests/lidar/test_frontend_point_lio.py`).

## Derleme ve duman testi

```
docker build -t orchados-lio-point-lio:local deploy/lidar-frontends/point-lio
deploy/lidar-frontends/point-lio/smoke.sh                 # derle + sentetik kayıt + denetim
deploy/lidar-frontends/point-lio/smoke.sh --no-build <oturum klasörü>
```

Duman testi ağırdır; CI'da çalışmaz, elle ya da ayrı bir iş akışında çalıştırılır. Geçici dosyalar `.smoke/`'tadır (git dışı).

## Doğrulananlar

Bu makinede (8 çekirdek, 7,7 GB RAM, 2026-11-19) yapılanlar:

- **Derleme:** `docker build` tamamlandı. Point-LIO derlemesi (`colcon`, `-j2`) yaklaşık 2 dk; paket indirmeleriyle ilk derleme ~15 dk. Çalışma imajı 1,69 GB (taban imaj dahil; PCL'in `io` kütüphanesi VTK'nın çalışma paketlerini çekiyor). Derleme aşamasının sonunda ve çalışma imajında ikilinin bütün kütüphaneleri bulunuyor (`ldd`, eksik yok).
- **Duman testi** (`smoke.sh`, `tools/make_test_bag.py` ile 24 sn'lik sentetik kayıt, iki örtüşen parça: 0–13 sn ve 11–24 sn, hız 1,0): iki parça `ok`, 14 + 14 anahtar kare, `imu_rate_hz` 250, `points_total` 1.670.400; çıktı sözleşmeye uygun (`tools/check_output.py`: başlık, damgaların parça içinde olması, birim kuaternyon, her satırın taraması, `xyz` N×3 float32, `intensity` N float32). Ön uç 44 sn sürdü.
- **Doğruluk (sentetik):** Anahtar kare konumları, ilk anahtar kareye göre gerçek LiDAR yörüngesinden ortalama 5 mm / en çok 12 mm (parça 0, 5,6 m yol) ve ortalama 14 mm / en çok 20 mm (parça 1, hareket hâlindeyken başlıyor, 7,0 m yol) sapıyor. Hareket hâlindeki anahtar karelerde duvar, zemin ve tavan noktalarının düzlemden sapması (std ~1,5 cm) duran ilk karedekiyle aynı: bozulma düzeltmesi çalışıyor (düzeltmesiz 0,6 m/sn'de 6 cm'lik yayılma beklenirdi). Düzeltme formülü ayrıca sayısal olarak denendi (1 m/sn ve 0,55 rad/sn'de 0,05 mm).
- **Hata yolları** (hız 2,0): kayıttan sonraya düşen pencere `failed` / "no odometry from point_lio in the segment window"; olmayan MCAP `failed` / "missing MCAP …"; kaydın son 3 sn'sini kapsayan pencere `ok` (3 anahtar kare). Başarısız parçaların satırları ve taramaları çıktıda yok.
- **Tarif 2** (`blind_m`, birikimli anahtar kare taraması) aynı makinede yeniden derlendi (önbellekle ~3 dk, imaj kimliği `885990e2c016`, 1,69 GB). Duman testi aynı sonucu verdi (14 + 14 anahtar kare; ortalama 5 / 14 mm, en çok 12 / 20 mm).
- Point-LIO SIGINT ile temiz kapanıyor ("catch sig 2"); `entrypoint.sh` ve `smoke.sh` shellcheck'ten geçiyor.

### Uçtan uca: hat + imaj (tarif 2, sentetik hareketli tarama)

`lidar synth --moving` ile üretilen oturumlar, `lidar register <oturum> --frontend point_lio` ve karşılaştırma için `--frontend fake` (2026-11-19, aynı makine). Tüm süreler duvar saati; Point-LIO kaydı gerçek zamanda oynatır (hız 1,0).

**Oturum A:** `--rows 2 --trees-per-row 6`: 91 sn, 135 m yol, 12 ağaç, 64.000 nokta/sn, IMU 250 Hz, PPK; tek parça, damga düzeltmesi yok (109 MB).

| | `point_lio` | `fake` |
| --- | --- | --- |
| Karar | `accepted_auto` | `accepted_auto` |
| Anahtar kare | 226 (1/1 parça) | 227 |
| GNSS artığı p95 / RMS / en çok | 0,0182 / 0,0117 / 0,0599 m | 0,0253 m (p95) |
| Gövde yayılımı p95 | 0,0109 m (10 ağaç) | 0,0062 m (10 ağaç) |
| Kapsama | 0,994 | 0,997 |
| LIO sürüklenmesi | 0,070 m/100 m | — |
| Bulut noktası | 4.762.213 | 4.706.909 |
| Süre | 119 sn (ön uç ~100 sn) | 11 sn |

**Oturum B:** aynı boyut, `--second-bag 45 --gap 70,73 --stamp-offset 0.3 --seed 3`: üç parça (45 sn, 25 sn, 17,5 sn `too_short` atlandı), çalışan iki parçanın damgası düzeltildi (`registration.run`'ın kopyaları, `/in/extra/<n>` üzerinden).

| | `point_lio` | `fake` |
| --- | --- | --- |
| Karar | `review` (`few_trees_checked`, `low_coverage`, `restamped`) | aynı |
| Anahtar kare | 174 (2/3 parça) | 176 |
| GNSS artığı p95 | 0,0228 m | 0,0244 m |
| Gövde yayılımı p95 | 0,0153 m (6 ağaç) | 0,0054 m (6 ağaç) |
| Kapsama | 0,758 | 0,768 |
| Süre | 115 sn | 20 sn |

- **Ön ucun kendi doğruluğu** (birleştirmeden önce, her parçanın anahtar kareleri gerçek yörüngeye tek katı dönüşümle oturtulunca): A'da 135 m'de ortalama 5,4 cm, p95 8,8 cm, en çok 9,5 cm; ardışık kare adımlarında ortalama 4,4 mm; eğim hatası 0,02°. B'de parça 0 (67 m) ortalama 4,1 / en çok 8,0 cm, hareket hâlinde başlayan parça 1 (36 m) ortalama 3,4 / en çok 5,0 cm.
- **Birleştirmeden sonra** ENU pozları gerçek yörüngeden (sabit çerçeve farkı çıkarılınca) ortalama 0,6–0,7 cm, p95 1,1–1,2 cm, en çok 4,9–5,7 cm sapıyor (sahte ön uçta 0,5 / 0,9 / 1,3 cm).
- **Kit maskesi:** Taramalarda LiDAR'a 0,6 m'den yakın nokta ve 3 m içinde yukarı doğru 15°'lik konide nokta yok. Tarif 1'in `blind: 0.5`'iyle 2.240 direk noktası kalıyordu.
- Point-LIO bu sentetik L2 benzeri veride ıraksamadı; damga, dış parametre, IMU birimi ya da nokta zamanı için düzeltme gerekmedi. Tarif 1'den tarif 2'ye iki değişiklik var: `blind_m` ve anahtar kare taramasının aradaki taramaları da taşıması. Tarif 1 taramaların yalnız ~%25'ini yazıyordu (bulutta 1,36 M nokta).

## Bilinen eksikler

- **Gerçek L2 verisiyle çalıştırılmadı.** L2 sürücüsünün `header.stamp` ve nokta `time` anlamı (taramanın başı mı, göreli saniye mi), IMU ekseni ve birimleri, dış parametrelerin işareti yalnız Unitree'nin dosyasına dayanıyor; masada doğrulanır (plan Görev 17).
- Sentetik oturum, simülatörün kendi varsayımlarıyla (nokta `time` alanı damgaya göre saniye, IMU m/s² ve yerçekimi, dış parametre birim) üretildi; imajın ayarlarıyla aynı varsayımlar olduğu için uçtan uca sonuç bu varsayımların doğruluğunu kanıtlamaz.
- **Kardeş container:** İşleme container'ı Docker soketiyle çağırırsa (`deploy/processing/`) `-v` yolları ana makinenin yollarıdır; çağırıcı bugün kendi gördüğü yolları verir. İki yolun aynı olduğu bağlama gerekir ya da bir yol eşlemesi eklenmeli; denenmedi.
- Komut satırında imaj dışındaki ayarlar (`rate`, `blind_m`) için seçenek yok; `ORCHADOS_POINT_LIO_IMAGE` ortam değişkeni imajı seçer.
- `plan` dosyanın yalnız ilk damgasını okur; pencere dosyanın bitişinden sonraysa mesaj "veri yok" yerine "odometri yok" olur.
- Kayıttan oynatma gerçek zamana bağlı ve belirlenimsiz (§5.4); 1–2 saatlik oturumda süre, bellek (Point-LIO haritası) ve hız 1,0'dan büyükken Point-LIO'nun yetişip yetişmediği denenmedi. Point-LIO ana döngüsü 5 kHz'de döner, bir çekirdeği meşgul eder.
- Her parçanın ilk anahtar karesi Point-LIO'nun IMU başlatmasından sonradır (~0,4 sn); parçanın ilk anını kaçırır.
- İmaj boyutu küçültülebilir (PCL `io` bağımlılığını yamayla kaldırmak VTK'yı düşürür); şimdilik yapılmadı.
