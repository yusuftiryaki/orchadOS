# Geliştirme Ortamı

18 Ekim 2026 · Yusuf

Repo iki devcontainer ile gelir: günlük işlerin çoğu için **core**, sadece saha uygulaması için **mobile**. İkisi ayrı, çünkü Flutter ve Android SDK ~5 GB tutuyor ve geliştirme makinesinde yaklaşık 8 GB RAM var.

## Hangi container ne için

| Container | İçinde | Kullanıldığı yer |
| --- | --- | --- |
| `core` | Node LTS, Python 3.12 + uv, ffmpeg, RTKLIB (`rnx2rtkp`, `convbin`), GDAL/PROJ, psql, PlatformIO, host'un Docker'ına erişim | `apps/web`, `supabase/`, `services/*`, `firmware/` |
| `mobile` | Flutter (stable), Android SDK (komut satırı araçları), JDK 17 | `apps/field` |

Dışarıda kalanlar:
- **ROS 2 ve LiDAR:** hoverboard reposunun container'ı.
- **GPU ile işleme:** İşleme istasyonunda çalışır, bu container'larda yapılmaz.

## Başlangıç

1. Host'ta VS Code ve "Dev Containers" eklentisi (`ms-vscode-remote.remote-containers`) kurulu olmalı.
2. Repoyu aç → **Reopen in Container** → `orchadOS core` ya da `orchadOS mobile` seç.
3. Claude girişi host'tan paylaşılır (`~/.claude`, `~/.claude.json`); container içinde yeniden giriş gerekmez.

## core: Supabase'i yerelde çalıştırmak

Supabase komut satırı aracı, Postgres/PostGIS, Auth ve Storage'ı **host'un Docker'ında** başlatır (docker-outside-of-docker). Bu yüzden:

- Repo container içinde host'taki **aynı mutlak yolda** bağlıdır. Supabase'in bağladığı klasörler ancak böyle doğru çözülür.
- Container host ağını kullanır. Supabase (54321–54324) ve Next.js (3000), host'taki tarayıcıdan doğrudan `localhost` ile açılır.
- Supabase komut satırı aracı, İP1'de projeye geliştirme bağımlılığı olarak eklenecek; böylece sürümü kilit dosyasıyla sabitlenir.

**RAM sıkışırsa:** Supabase'in yerel kopyası 2–3 GB RAM kullanır. Makine zorlanırsa yerel kopya yerine bulutta ücretsiz bir geliştirme projesi kullanılır; bağlantı bilgileri `.env` dosyasına yazılır (repoya girmez).

## core: ESP32 GNSS kaydedici

- `/dev/bus/usb` bağlı olduğu için USB üzerinden konuşan araçlar sorunsuz çalışır, cihaz sonradan takılsa bile.
- ESP32'nin seri portu (`/dev/ttyUSB*` ya da `/dev/ttyACM*`) container başlarken anlık olarak alınır. Flaşlamak için kartı container'ı açmadan önce tak, `.devcontainer/core/devcontainer.json` içindeki `--device` satırını aç ve container'ı yeniden derle.

## mobile: telefona yükleme

- Emülatör yok. Uygulama gerçek bir Android telefonda, USB hata ayıklamasıyla çalıştırılır.
- Önce host'ta `adb kill-server` çalıştır; host'taki adb sunucusu telefonu tutarsa container göremez.
- Container içinde `adb devices` telefonu göstermeli, ardından `flutter run`.
- İlk derleme Gradle bağımlılıklarını indirir ve birkaç dakika sürer.

## Disk ve bakım

- `core` imajı ~1,8 GB, `mobile` imajı ~5 GB. Makinede ~25 GB boş yer var; ikisi birlikte sığar, ama Supabase imajları da birkaç GB ekler.
- Kullanılmayan imaj ve önbellekleri temizlemek için host'ta `docker system prune` kullanılabilir.
- Container'a elle `apt install` ile kurulan şey yeniden derlemede kaybolur. Kalıcı olması gerekiyorsa ilgili `Dockerfile`'a eklenmeli.
- Gerçek saha verisi (ham video, MCAP, GNSS kayıtları) repoya girmez; `.gitignore` bunu engeller. Geliştirmede küçültülmüş örnek kayıtlar kullanılır.
