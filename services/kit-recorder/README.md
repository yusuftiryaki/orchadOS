# services/kit-recorder — kitteki Raspberry Pi kayıt servisi

LiDAR'lı tarama kitinde kayıt bilgisayarı Raspberry Pi 5'tir. `orchados-recorder` servisi saha uygulamasına ESP32 kaydedici gibi görünür: aynı BLE servisi, aynı cihaz adı biçimi (`orchados-gnss-XXXX`), aynı komutlar ve aynı `gnss/` dosyaları. Buna şunları ekler:

- Unitree L2'nin nokta bulutu ve IMU'sunun MCAP kaydı (`ros2 bag`),
- ön kontrol (LiDAR, LiDAR kipi, saat, SSD, alıcı) ve atlama,
- kayıt sırasında uyarılar ve LiDAR boşluklarının takibi,
- güç kesintisinden sonra açık kalan oturumun `power_loss` ile kapatılması.

Sözleşme (durum mesajının kit uzantısı, olaylar, `session.json` eklentileri, `lidar/raw/recording.json`): [docs/arayuzler.md](../../docs/arayuzler.md#kit-kaydedicisi-raspberry-pi). Tasarım: [docs/superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md](../../docs/superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md).

> **Donanımda denenmedi.** Kayıt çekirdeği sahte saat ve sahte kaynaklarla test edildi. Kurulum betiği, BLE sunucusu, L2 sürücüsü, PPS ve chrony henüz gerçek bir Pi'da çalıştırılmadı (plan, Task 17). Aşağıda "donanımda doğrulanır" diye işaretli değerler o denemede kesinleşir.

## Komutlar (geliştirme makinesi)

```bash
uv sync
uv run pytest                     # donanımsız testler (sahte saat, alıcı, LiDAR, SSD)
uv run ruff check . && uv run ruff format --check .
uv run orchados-recorder version
uv run orchados-recorder fake-run /tmp/ssd --session-id S-1 --parcel-id P-12 --seconds 20 --lidar-gap 5
```

`fake-run` donanımsız, BLE'siz bir oturum yazar: `/tmp/ssd/sessions/S-1/` altında `gnss/` (`gnss.ubx`, `events.csv`, `session.json`) ve `lidar/raw/` (`bag/`, `recording.json`). `--lidar-gap` LiDAR'ı o kadar saniye susturur; `events.csv`'de `lidar_lost` ve `lidar_regained` görünür. Sonunda oturum klasörünü ve birkaç sayıyı JSON olarak basar. İşleme hattının ve yükleme aracının testleri için örnek oturum buradan üretilir.

Pi'da servis `orchados-recorder run --config /etc/orchados/recorder.toml` ile çalışır (systemd, aşağıda).

## Dosyalar

| Dosya | Pi'da nereye | Ne yapar |
| --- | --- | --- |
| `setup/install.sh` | — | Kurulum betiği; tekrar çalıştırılabilir |
| `config/recorder.toml` | `/etc/orchados/recorder.toml` | Servis ayarları; bir kez kopyalanır, sonra elle düzenlenir |
| `setup/orchados-recorder.service` | `/etc/systemd/system/` | Kayıt servisi; `Restart=always` |
| `setup/unilidar.service`, `setup/unilidar.env` | `/etc/systemd/system/`, `/etc/orchados/unilidar.env` | L2'nin ROS 2 sürücüsü; komutu `unilidar.env`'de |
| `setup/patches/unilidar_sdk2-*.patch` | `/opt/orchados/ros2_ws/src/unilidar_sdk2`'e uygulanır | L2 sürücüsünün IMU hatalarına iki yama (aşağıda, "L2 sürücüsü") |
| `setup/orchados-ros-exec` | `/usr/local/bin/` | Bir komutu ROS 2 Jazzy ortamında çalıştırır (iki servis de bunu kullanır) |
| `setup/chrony-orchados.conf` | `/etc/chrony/conf.d/orchados.conf` | Saat: PPS, saniyesi alıcıdan |
| `setup/config.txt.append` | `/boot/firmware/config.txt` sonuna | PPS overlay'i (GPIO18), Pi 5 USB akım ayarı |
| `setup/fstab.append` | `/etc/fstab` | SSD'yi etiketle bağlar (`nofail`) |
| `setup/99-orchados-ssd.rules`, `setup/orchados-ssd-mount.service` | `/etc/udev/rules.d/`, `/etc/systemd/system/` | Açılıştan sonra takılan SSD'yi de bağlar |
| `setup/netplan-orchados-lidar.yaml` | `/etc/netplan/90-orchados-lidar.yaml` | L2 için Ethernet adresi (`192.168.1.2/24`), DHCP de açık |

## Kurulum

İnternet yalnız kurulum sırasında gerekir; sahada Pi internete bağlanmaz. Gizli bilgi gerekmez.

### 1. Kartı yazma

1. Raspberry Pi Imager ile **Ubuntu Server 24.04 LTS (64-bit, arm64)** seçilir. Masaüstü sürümü değil.
2. Imager'ın ayarlarında: makine adı (ör. `orchados-kit-01`), kullanıcı ve parola, SSH açık (tercihen anahtarla), kurulum için Wi-Fi ya da Ethernet.
3. Kart yazılır ve Pi'a takılır.

### 2. İlk açılış

1. Pi açılır; ilk açılışta cloud-init kullanıcıyı ve ağı kurar, birkaç dakika sürer.
2. SSH ile bağlanılır: `ssh <kullanıcı>@orchados-kit-01.local`.
3. Sistem güncellenir ve repo alınır:

```bash
sudo apt update && sudo apt full-upgrade -y && sudo reboot
git clone <orchadOS repo adresi> ~/orchadOS
```

### 3. Kurulum betiği

```bash
sudo ~/orchadOS/services/kit-recorder/setup/install.sh
sudo reboot
```

Betik sırayla şunları yapar; her adım zaten yapılmışsa atlanır, ikinci çalıştırma bir şeyi bozmaz:

1. Paketler: `chrony`, `pps-tools`, `bluez`, derleme araçları.
2. ROS 2 Jazzy (`ros-jazzy-ros-base`, MCAP depolama eklentisi, `ros-dev-tools`).
3. `uv` (sürümü betikte sabit).
4. Servis `/opt/orchados/kit-recorder`'a kopyalanır. Sanal ortam sistem Python'u (3.12) ve `--system-site-packages` ile kurulur, çünkü `rclpy` `/opt/ros`'tan gelir.
5. `/etc/orchados/recorder.toml` ve `/etc/orchados/unilidar.env`: yoksa kopyalanır, varsa dokunulmaz.
6. `/boot/firmware/config.txt`: PPS overlay'i ve USB akım ayarı, işaretli bir blok olarak. Yeniden başlatma gerekir.
7. chrony: `conf.d/orchados.conf`. Ubuntu'nun kendi `makestep` satırı yorum yapılır, çünkü dosyada sonra geldiği için bizimkini ezerdi.
8. Bluetooth açılır.
9. SSD: bağlama noktası, fstab satırı, takınca bağlama kuralı.
10. Ethernet: L2 için sabit adres (yeniden başlatınca geçerli olur).
11. journald en çok 200 MB tutar (kök dosya sistemine az yazılsın; kayıtlar yalnız SSD'ye).
12. Kullanılmayan servisler kapatılır: `snapd`, `unattended-upgrades`, `apt-daily` zamanlayıcıları, cloud-init.
13. L2 sürücüsü sabit bir upstream commit'inden alınır, iki yaması uygulanır ve `/opt/orchados/ros2_ws`'de derlenir (`build_unilidar`, aşağıda). Derlenmezse betik geri kalan her şeyi kurar, sonunda açık bir uyarı verir ve 1 ile çıkar.
14. systemd birimleri kurulur, açılır ve başlatılır.

Seçenek: `--skip-lidar-driver` L2 sürücüsünün derlenmesini atlar (ör. L2'siz, yalnız BLE ve GNSS denemesi).

### 4. Denetim

```bash
systemctl status orchados-recorder unilidar chrony bluetooth
journalctl -u orchados-recorder -f          # servis günlüğü
journalctl -u unilidar -f                   # L2 sürücüsü
sudo ppstest /dev/pps0                       # PPS kenarları (saniyede bir satır)
chronyc sources -v                           # GNSS ve PPS kaynakları; PPS'in başında '*'
chronyc tracking                             # saat hatası
findmnt /mnt/orchados-ssd                    # SSD bağlı mı
```

Telefonda saha uygulaması `orchados-gnss-XXXX` adlı cihazı görür (`XXXX`: Pi'ın Bluetooth adresinin son iki baytı).

### Güncelleme

```bash
cd ~/orchadOS && git pull
sudo services/kit-recorder/setup/install.sh
```

Betik servisi yeniden başlatır. **Kayıt sürerken çalıştırılmaz:** yeniden başlatma açık oturumu `command` ile kapatır.

## SSD

- Dosya sistemi ext4, etiketi **`ORCHADOS-SSD`**. Bağlama noktası `/mnt/orchados-ssd`, `nofail` ile: SSD takılı değilse Pi yine açılır, servis çalışır, ön kontrolün SSD maddesi geçmez (atlanamaz).
- İlk kez biçimlendirme (SSD'deki her şeyi siler; aygıt adını `lsblk` ile doğrulayın):

```bash
lsblk -o NAME,SIZE,MODEL,LABEL
sudo mkfs.ext4 -L ORCHADOS-SSD /dev/sdX1    # bölüm yoksa önce: sudo parted /dev/sdX mklabel gpt mkpart orchados ext4 0% 100%
sudo mount /mnt/orchados-ssd
```

- Açılıştan sonra takılan SSD de kendiliğinden bağlanır (udev kuralı). Çıkarmadan önce servis durdurulur ve SSD ayrılır: `sudo systemctl stop orchados-recorder && sudo umount /mnt/orchados-ssd`. Kayıt sürerken çıkarılırsa oturum `sd_error` ile kapanır; dosyalar o an yazılamadıysa SSD geri takılınca `gnss/session.json`'a `stop_reason: sd_error` yazılır (`stop` `null` kalır).
- Oturumlar `/mnt/orchados-ssd/sessions/<session_id>/` altındadır (`gnss/`, `lidar/raw/`).

## PPS teli

- F9P'nin TIMEPULSE çıkışı Pi'ın **GPIO18'ine (fiziksel pin 12)** bağlanır; toprak ortak (ör. pin 14).
- Seviye **3,3 V** olmalı; Pi'ın GPIO'su 5 V'a dayanmaz. Tele seri bir direnç (ör. 330 Ω–1 kΩ) konur.
- Radiolink modülünde TIMEPULSE'un konnektörde olup olmadığı ve seviyesi parça gelince ölçülür ([docs/kit-siparis-listesi.md](../../docs/kit-siparis-listesi.md), Doğrulanacaklar). Tel bağlanana kadar ön kontrolün saat maddesi onayla atlanarak çalışılır.
- Saat düzeni: chrony'de iki kaynak var. `GNSS`, servisin her NAV-PVT için `/run/chrony.gnss.sock`'a gönderdiği kaba zamandır (USB gecikmesi, onlarca ms); tek başına seçilmez (`noselect`), yalnız PPS kenarının hangi saniyeye ait olduğunu söyler. `PPS` asıl kaynaktır (`lock GNSS`). Seri portun tek sahibi kayıt servisidir; gpsd kullanılmaz.

## L2 sürücüsü

- Sürücü: Unitree `unilidar_sdk2` reposundaki ROS 2 paketi (`unitree_lidar_ros2`), `/opt/orchados/ros2_ws`'de `colcon build` ile derlenir. Unitree yalnız Ubuntu 20.04 ve ROS 2 Foxy'yi doğrulamış; **Pi 5'te Jazzy ile derlenmesi doğrulanmadı**, ilk denenecek iş budur (plan, Task 17). Derlenmezse yedek yol, ROS'suz ve SDK'dan doğrudan MCAP yazan küçük bir C++ programıdır; bu durumda ayrı bir tasarım notu açılır.
- Sürüm ve yamalar: kaynak `unilidar_sdk2`'nin `UNILIDAR_COMMIT` commit'idir (v2.0.10, `install.sh`'ta sabit). Derlemeden önce `setup/patches/`'teki iki yama uygulanır; ikisi de ROS 2 düğümünün IMU hatasıdır ve upstream'de açıktır:
  - `unilidar_sdk2-imu-read-once.patch` ([PR #33](https://github.com/unitreerobotics/unilidar_sdk2/pull/33)): düğüm her IMU paketinde `getImuData()`'yı iki kez çağırıyor, ilki paketi tüketiyordu; `/unilidar/imu` listede görünür ama neredeyse hiç mesaj taşımaz. Yama PR'ın bu dosyadaki değişikliğinin aynısıdır.
  - `unilidar_sdk2-imu-quaternion-order.patch` ([#14](https://github.com/unitreerobotics/unilidar_sdk2/issues/14)): SDK'nın kuaternyonu (w, x, y, z) sırasındadır; ROS 1 sürücüsü ve düğümün kendi `unilidar_imu_initial → unilidar_imu` dönüşümü öyle okur, ROS 2'deki `Imu` mesajı (x, y, z, w) diye okuyordu. Not: SDK'nın `example.h`'ı aynı diziyi "(x, y, z, w)" etiketiyle basıyor; sıra masada doğrulanır (aşağıda).

  Yama zaten uygulanmışsa atlanır; ne uygulanıyor ne de uygulanmış görünüyorsa (kaynak başka) derleme yapılmaz. Kurulum, derlemenin hangi commit ve yamalarla yapıldığını `/opt/orchados/ros2_ws/install/.orchados-unilidar`'a yazar; ikisinden biri değişince sürücü yeniden derlenir. Commit ilerletilecekse yamalar yeni commit'e karşı yeniden üretilir ve upstream'de birleşmiş olanlar listeden çıkarılır.
- Yeniden derlemek için: `sudo rm -rf /opt/orchados/ros2_ws/install /opt/orchados/ros2_ws/build && sudo services/kit-recorder/setup/install.sh`.
- Başlatma komutu `/etc/orchados/unilidar.env`'deki `UNILIDAR_CMD`'dir; varsayılanı `ros2 launch unitree_lidar_ros2 launch.py`. Sürücünün launch dosyası rviz de başlatıyorsa (ros-base'de rviz yok, launch başarısız olur) komut, yalnız sürücü düğümünü çalıştıran bir komutla değiştirilir ve `sudo systemctl restart unilidar` yapılır. **Donanımda doğrulanır.**
- Ağ: L2 Ethernet'ten UDP ile gönderir. Fabrika adresleri L2 `192.168.1.62`, bilgisayar `192.168.1.2` kabul edildi; netplan dosyası Pi'a `192.168.1.2/24`'ü ekler. **Donanımda doğrulanır**; farklıysa netplan dosyası ve sürücünün parametreleri düzeltilir.
- Konular: `/unilidar/cloud` (`PointCloud2`) ve `/unilidar/imu` (`Imu`); servis bunları ve ham UBX'i (`/orchados/gnss_ubx`) kaydeder. Denetim: `orchados-ros-exec ros2 topic hz /unilidar/cloud`. Adlar farklıysa `/etc/orchados/recorder.toml`'daki `[lidar]` ve bu belge düzeltilir.
- Masa kontrolleri (IMU; LiDAR kayıt adımı IMU'ya dayanır, plan Task 17 Step 3). **Donanımda doğrulanır**; ölçülen değerler buraya yazılır:
  - Hız: `orchados-ros-exec ros2 topic hz /unilidar/imu`. PR #33'te SDK örneğiyle ~250 Hz ölçülmüş. Ölçülen: _henüz ölçülmedi_. Bu değer işleme hattının `expected_imu_hz` parametresidir; yamasız sürücüde hız sıfıra yakındır.
  - Kuaternyon sırası: L2 düz ve hareketsizken `orchados-ros-exec ros2 topic echo --once /unilidar/imu`; sonra L2 bilinen bir eksen etrafında ~90° çevrilip tekrar. Mesajdaki dönüşün ekseni ve açısı elle çevrilene uymalı; uymuyor da (x, y, z, w) sırası uyuyorsa kuaternyon yaması geri alınır.
  - Yan dururken ivme ([#9](https://github.com/unitreerobotics/unilidar_sdk2/issues/9)): L2 sırayla dik, iki yanı ve ters dururken açılıp hareketsiz bırakılır; her duruşta `linear_acceleration`'ın büyüklüğü ~9,8 m/s² olmalı ve yukarı bakan eksende toplanmalı. Kullanıcılar L2'nin yan açılışta 15–19 m/s² gösterdiğini bildiriyor; bizdeki birimde de öyleyse sonuç buraya yazılır ve kayıt adımının ön ucu için ayrı karar verilir (L2 dik açılır ya da IMU ivmesi kullanılmaz).
- Negatif açı kipi: `[lidar] mode_command`, kipi açıp denetleyen bir komuttur (çıkış 0 açık, 3 kapalı, diğerleri bilinmiyor). Boşsa kip denetlenmez ve ön kontrol "bilinmiyor"u geçer sayar. SDK ile yazılabilirse donanımda doldurulur.
- Sürücü ile kayıt servisi DDS'i yalnız bu makinede konuşur (`ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST`, `orchados-ros-exec`'te).

## Ayarlar

`/etc/orchados/recorder.toml` (örnek ve varsayılanlar: [config/recorder.toml](config/recorder.toml)). Bilinmeyen bölüm ya da anahtar servisi başlatmaz (yazım hatası yakalansın). Değiştirdikten sonra: `sudo systemctl restart orchados-recorder` (kayıt yokken).

| Bölüm | Anahtar | Varsayılan |
| --- | --- | --- |
| `[ssd]` | `mount` | `/mnt/orchados-ssd` |
| `[receiver]` | `port` | `auto`: ilk `/dev/serial/by-id/usb-u-blox*` |
| `[lidar]` | `points_topic`, `imu_topic`, `ubx_topic` | `/unilidar/cloud`, `/unilidar/imu`, `/orchados/gnss_ubx` |
| `[lidar]` | `mode_command` | `[]` (denetlenmez) |
| `[chrony]` | `sock` | `/run/chrony.gnss.sock` (chrony ayarıyla aynı olmalı) |

## Servis

- `orchados-recorder.service` root olarak çalışır (BlueZ reklamı, alıcının seri portu, `/sys/class/pps`, chrony soketi). `After=unilidar.service chrony.service bluetooth.service` ve SSD'nin bağlama birimi (`mnt-orchados\x2dssd.mount`, yalnız sıralama); bunlardan biri başlamasa ya da SSD takılı olmasa da servis çalışır, eksik olan ön kontrolde görünür.
- `Restart=always`: servis çökerse 2 sn sonra yeniden başlar. Açık bir oturum varsa onu `power_loss` ile kapatır ve **kendiliğinden yeni kayıt başlatmaz**. Bu denetim SSD her bağlandığında (açılışta ya da sonradan takılınca, kayıt yokken) yapılır; aynı `session_id` ile yeniden başlatma `session_exists` alır. Kayıt sürerken BLE bağlantısının kopması kaydı durdurmaz.
- `ros2 bag` kayıt sırasında ölürse oturum sürer: servis onu artan aralıklarla (2, 4, 8, … en çok 60 sn) yeniden başlatır, her seferinde `lidar/raw/` altında yeni bir klasöre (`bag.1/`, `bag.2/`, …); `events.csv`'de `sd_error`/`lidar_write` ve `lidar_bag_restart` görünür ([docs/arayuzler.md](../../docs/arayuzler.md#lidarrawrecordingjson)).
- `systemctl stop` (SIGTERM) açık oturumu `command` ile kapatır; servis beklenmedik bir hatayla sona ererse hata günlüğe yığın iziyle yazılır ve açık oturum `service_error` ile kapanır. `KillMode=mixed`: SIGTERM yalnız servise gider; servis `ros2 bag`'i SIGINT ile durdurur, böylece son MCAP parçası düzgün kapanır.
- Günlükler: `journalctl -u orchados-recorder` (son açılıştan beri: `-b`, canlı: `-f`).

## Ofiste: SSD'nin işleme istasyonuna alınması

SSD işleme istasyonuna takılır ve oturum ham veri deposuna yüklenir ([services/ingest](../ingest/)):

```bash
uv run orchados-ingest push /media/<kullanıcı>/ORCHADOS-SSD --session-id <session_id>
```

Pi'daki `sessions/<session_id>/` klasörü oturum klasörünün köküne olduğu gibi gider (`gnss/...`, `lidar/raw/...`); ESP32 kartındaki gibi `gnss/` altına kopyalanmaz ([docs/arayuzler.md](../../docs/arayuzler.md#kit-kaydedicisi-raspberry-pi)). Yükleme aracının SSD düzenini (`kit-ssd`) tanıması plan Task 12'dedir. SSD'deki bir oturum ancak yüklemesi `orchados-ingest verify <session_id> --deep` ile doğrulandıktan sonra silinir.
