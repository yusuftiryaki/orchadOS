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
| Tarif sürümü | `ORCHADOS_RECIPE_VERSION=1` (Dockerfile) |

`frontend.json`'daki `method_version` `<commit[:7]>-r<tarif>` biçimindedir (şu an `a8e2d0d-r1`); `config_hash` ayar dosyasının SHA-256'sıdır. Tarif, yama, ayar ya da kaydedici sonuçları değiştirebilecek biçimde değişirse `ORCHADOS_RECIPE_VERSION` artırılır.

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

Unitree'nin ROS 1 L2 dosyasındaki değerler: konular `/unilidar/cloud` ve `/unilidar/imu`, `lidar_type: 5` (alanlar `x, y, z, intensity, ring (uint16), time (float32)`), `timestamp_unit: 0` (nokta `time`'ı saniye, `header.stamp`'a göre), `scan_line: 18`, `blind: 0.5`, IMU 250 Hz (`imu_time_inte: 0.004`), `acc_norm: 9.81` (m/s²), IMU→LiDAR dış parametreleri `extrinsic_T: [0.007698, 0.014655, -0.00667]`, `extrinsic_R: I`, `extrinsic_est_en: false`. Unitree'nin launch dosyasından `filter_size_surf/map: 0.4`, `init_map_size: 10`, `point_filter_num: 1`.

Bizim değişikliklerimiz: `odom_only: false` (gövde taraması için gerekli); `publish_odometry_without_downsample: false` (taramada bir odometri, taramayla aynı damga); `scan_bodyframe_pub_en: true`; `path_en: false` (yol mesajı sınırsız büyür); `pcd_save_en: false` (harita bellekte birikir). ROS 2 tam sayıyı ondalık parametreye kabul etmediği için tüm ondalık değerler noktalı yazılır.

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
  "keyframe": {"dist_m": 0.5, "angle_deg": 10, "dt_s": 1.0}
}
```

- `mcap`: göreli yollar `/in/session`'a göredir; mutlak yollar olduğu gibi kullanılır (ör. hattın damgaları düzeltilmiş geçici kopyası başka bir bağlamayla verilirse).
- Zaman: kayıttaki damgalar Unix (UTC) ns'dir; `gps_ns = unix_ns − 315964800·10⁹ + 18·10⁹`.
- Her dosya ilk mesajının zamanına göre sıralanır ve `--start-offset` ile parçanın başından oynatılır. Humble'ın `ros2 bag play`'inde süre sınırı yok; kaydedici `/clock` parça sonunu 0,5 sn geçince işaret bırakır, giriş noktası oynatıcıyı durdurur. Parça dışındaki odometri ve taramalar yazılmaz.

**Çıkış** `/out/`:

- `frontend.json`: `schema: orchados.lio_frontend/1`, `method: point_lio`, `method_version`, `config_hash`, `segments[]` (`index`, `start_gps_ns`, `end_gps_ns`, `keyframe_count`, `status` `ok`/`failed`, `message` (başarılıysa `null`), ayrıca `imu_rate_hz`, `points_total`, `keyframes_recorded`, `odometry_count`), `imu_rate_hz` (parçaların toplamından), `points_total` (parça pencerelerindeki giriş noktaları), `rate`, `keyframe`, `source`.
- `keyframes.csv`: `segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan`. Poz, parçanın kendi odometri çerçevesinde **LiDAR gövdesinin** pozudur: `T_WL = T_WI · T_IL`. Çerçevenin eksenleri Point-LIO'nun `camera_init`'idir (yerçekimine hizalı); başlangıç noktası parçanın ilk anahtar karesindeki LiDAR konumuna taşınır. Yalnız `ok` parçaların satırları yazılır.
- `scans/<segment>_<index>.npz`: `xyz` (N×3 float32, LiDAR gövde çerçevesi, anahtar kare anına göre düzeltilmiş), `intensity` (N float32). Başarısız parçaların taramaları silinir.
- `logs/`: parça başına Point-LIO, kaydedici ve oynatıcı günlükleri (sözleşme dışı, hata ayıklama için). `.work/`: ara dosyalar.

### Kaydedici nasıl çalışır

- Point-LIO'nun durumu IMU pozudur: `/aft_mapped_to_init` (`nav_msgs/Odometry`, taramanın bitiş zamanıyla damgalı) ve `/cloud_registered_body` (taramanın tamamı, IMU gövde çerçevesinde, aynı damga). Kaydedici ikisini damgayla eşler.
- **Anahtar kare:** son anahtar kareye göre LiDAR ≥ `dist_m` yer değiştirdiyse, ≥ `angle_deg` döndüyse ya da ≥ `dt_s` geçtiyse. Parçanın ilk eşleşen taraması her zaman anahtar karedir.
- **Bozulma düzeltmesi:** Tarama boyunca gövde hızı sabit kabul edilir. Hız, önceki taramanın pozundan (0,3 sn içindeyse) ortalama olarak, yoksa Point-LIO'nun hız çıktısından (`twist`) alınır. Her nokta, `curvature` alanındaki zamanıyla tarama sonundaki gövde çerçevesine taşınır (`p' = Exp(−ω·dt)·p − (v·dt − dt²/2·ω×v)`), sonra IMU çerçevesinden LiDAR çerçevesine (`p_L = R_extᵀ(p_I − T_ext)`).
- **Ölçümler:** `/unilidar/imu` damgalarından IMU hızı, `/unilidar/cloud`'dan nokta sayısı (parça penceresi içinde).

### Parça durumu

Parça `failed` olur ve `message` nedeni yazar: MCAP yok ya da okunamıyor, Point-LIO başlangıçta ya da oynatma sırasında öldü (çıkış kodu), Point-LIO 60 sn içinde ayağa kalkmadı (`READY_TIMEOUT_S`), pencerede odometri yok, pencerede anahtar kare yok, oynatma bittikten sonra Point-LIO 600 sn hâlâ yayımlıyor (`RECORDER_MAX_WAIT_S`). Oynatma bittikten sonra kaydedici, Point-LIO 5 sn (`RECORDER_IDLE_S`) sessiz kalınca durur; Point-LIO önce SIGINT, 10 sn sonra SIGKILL ile kapatılır.

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
- Point-LIO SIGINT ile temiz kapanıyor ("catch sig 2"); `entrypoint.sh` ve `smoke.sh` shellcheck'ten geçiyor.

## Bilinen eksikler

- **Gerçek L2 verisiyle çalıştırılmadı.** L2 sürücüsünün `header.stamp` ve nokta `time` anlamı (taramanın başı mı, göreli saniye mi), IMU ekseni ve birimleri, dış parametrelerin işareti yalnız Unitree'nin dosyasına dayanıyor; masada doğrulanır (plan Görev 17).
- Hattın sentetik hareketli taraması (`lidar synth --moving`, ayrı dalda) bu makinede çalıştırılamadı (uv yok); duman testi bu imajın kendi küçük kaydıyla yapıldı. O oturumla: `smoke.sh --no-build <oturum>`.
- Hattın çağırıcısı (`services/pipeline/…/lidar/frontend/point_lio.py`) bu işte yok.
- `method_version` = commit + tarif sürümü. Tasarım (§5.4) sürüm etiketini imajın içerik hash'i olarak anıyor; konteyner kendi imaj kimliğini bilmediği için bunu çağırıcı (`docker image inspect`) eklemeli.
- `plan` dosyanın yalnız ilk damgasını okur; pencere dosyanın bitişinden sonraysa mesaj "veri yok" yerine "odometri yok" olur.
- Kayıttan oynatma gerçek zamana bağlı ve belirlenimsiz (§5.4); 1–2 saatlik oturumda süre, bellek (Point-LIO haritası) ve hız 1,0'dan büyükken Point-LIO'nun yetişip yetişmediği denenmedi. Point-LIO ana döngüsü 5 kHz'de döner, bir çekirdeği meşgul eder.
- Her parçanın ilk anahtar karesi Point-LIO'nun IMU başlatmasından sonradır (~0,4 sn); parçanın ilk anını kaçırır.
- İmaj boyutu küçültülebilir (PCL `io` bağımlılığını yamayla kaldırmak VTK'yı düşürür); şimdilik yapılmadı.
