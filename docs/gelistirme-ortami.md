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

## Bulut oturumları (Claude Code)

Yazılım iş paketlerinin günlük geliştirmesi Claude Code bulut oturumlarında yapılır: 4 sanal çekirdek, 16 GB RAM, 30 GB disk, Docker var. Bulut ortamı devcontainer kullanmaz; eksik araçlar ortamın kurulum betiğiyle yüklenir.

| Nerede | Ne |
| --- | --- |
| Bulut | İP1 şema, İP4 işleme hattı (küçük örneklerle), İP5/İP7/İP8 web, İP9 AI worker, İP6'nın kod ve testleri |
| Yerel (`core`, `mobile`) | ESP32 flaşlama, saha uygulamasını gerçek telefonda çalıştırma, sonuçları gözle kontrol |
| İşleme istasyonu | Gerçek saha verisi; bulut ortamına konmaz |

**Ortam:** claude.ai/code'da `orchadOS` adlı bir bulut ortamı, ağ erişimi **Trusted**. Kurulum betiği (ortam ayarlarındaki **Setup script** alanı; bu kopya referans içindir):

```bash
#!/usr/bin/env bash
set -euo pipefail
apt-get update
apt-get install -y --no-install-recommends ffmpeg rtklib gdal-bin proj-bin
uv tool install platformio
```

Betik ~5 dakikada bitmezse ortam önbelleğe alınmaz. Supabase imajlarının önbelleğe alınması İP1'de bu betiğe eklenecek.

**Akış:** Bulut oturumu GitHub'dan klonlar, kendi dalında çalışır ve dalı GitHub'a gönderir. Diff claude.ai/code'da incelenir, PR açılır, `main`'e birleştirilir. Yerelde `git pull` ile çekilir. Yerelde yapılan değişiklikler buluta ancak GitHub'a gönderildikten sonra ulaşır.

## Disk ve bakım

- `core` imajı ~1,8 GB, `mobile` imajı ~5 GB. Makinede ~25 GB boş yer var; ikisi birlikte sığar, ama Supabase imajları da birkaç GB ekler.
- Kullanılmayan imaj ve önbellekleri temizlemek için host'ta `docker system prune` kullanılabilir.
- Container'a elle `apt install` ile kurulan şey yeniden derlemede kaybolur. Kalıcı olması gerekiyorsa ilgili `Dockerfile`'a eklenmeli.
- Gerçek saha verisi (ham video, MCAP, GNSS kayıtları) repoya girmez; `.gitignore` bunu engeller. Geliştirmede küçültülmüş örnek kayıtlar kullanılır.

## İP1: Supabase imajları ve bulutta Docker

18 Ekim 2026 · Supabase komut satırı aracı 2.121.0

**Kayıt:** `supabase start` imajları varsayılan olarak **AWS ECR Public** (`public.ecr.aws/supabase/...`) üzerinden çekiyor, Docker Hub'a gitmiyor. Ağ izin listesindeki bu kayıt yeterli; ek ayar gerekmedi. Gerekirse kayıt `SUPABASE_INTERNAL_IMAGE_REGISTRY` ortam değişkeniyle değiştirilebilir (örneğin `ghcr.io`); bu yol denenmedi. İmaj sürümleri komut satırı aracının sürümüne bağlı olduğu için araç `package.json` içinde tam sürümle sabitlendi.

**Çekilen imajlar:**

| İmaj | Kayıt | Diskte | İndirme (sıkıştırılmış) |
| --- | --- | --- | --- |
| `supabase/postgres:17.11.0.004` | public.ecr.aws | 1,70 GB | 368 MB |
| `supabase/storage-api:v1.82.1` | public.ecr.aws | 1,43 GB | 251 MB |
| `supabase/kong:2.8.1` | public.ecr.aws | 203 MB | 49 MB |
| `supabase/gotrue:v2.197.0` | public.ecr.aws | 94 MB | 30 MB |
| `supabase/pg_prove:3.36` (sadece `pnpm db:test`) | public.ecr.aws | 75 MB | 17 MB |
| `supabase/postgrest:v16.4` | public.ecr.aws | 27 MB | 7 MB |
| **Toplam** | | **~3,5 GB** | **~720 MB** |

**Kapalı servisler:** `supabase/config.toml` içinde Studio, Realtime, e-posta test sunucusu (Mailpit), edge runtime, analitik (Logflare + Vector) ve Storage vektör kovaları kapalı; imgproxy zaten kapalı (görsel dönüştürme açık değil). İP1 için Postgres, Auth (GoTrue), PostgREST, Storage ve API ağ geçidi (Kong) yeterli. Bu haliyle yerel kopya ~370 MB RAM kullanıyor. Studio gerekirse `[studio] enabled = true` yapılır.

**Bulutta dockerd:** Bulut ortamında Docker servisi kendiliğinden başlamıyor. `.claude/settings.json` içindeki SessionStart kancası `scripts/cloud-session-start.sh` betiğini çalıştırır:

- Sadece `CLAUDE_CODE_REMOTE=true` iken bir şey yapar; yerelde hemen çıkar.
- `docker info` başarısızsa `dockerd`'yi arka planda başlatır (root ise doğrudan, değilse parolasız `sudo` ile) ve en fazla ~60 sn `docker info` başarılı olana kadar bekler.
- Oturumu asla düşürmez: her durumda 0 ile çıkar. Kayıtlar `/tmp/orchados-session-start.log` ve `/tmp/dockerd.log` dosyalarında.

Elle başlatmak için: `sudo dockerd > /tmp/dockerd.log 2>&1 &` (root ise `sudo` olmadan), ardından `docker info` başarılı olana kadar beklenir.

**Kurulum betiğinde imaj önbelleği (öneri, denenmedi):** İmajların her oturumda yeniden inmemesi için ortamın kurulum betiğine şu satırlar eklenebilir. Ortam önbelleğinin Docker imajlarını da saklayıp saklamadığı doğrulanmalı.

```bash
(dockerd > /tmp/dockerd.log 2>&1 &)
for i in $(seq 30); do docker info > /dev/null 2>&1 && break; sleep 2; done
for img in postgres:17.11.0.004 storage-api:v1.82.1 gotrue:v2.197.0 postgrest:v16.4 kong:2.8.1 pg_prove:3.36; do
  docker pull "public.ecr.aws/supabase/$img"
done
```

**Not:** Bu bölümdeki ölçümler (imaj listesi, boyutlar, RAM) yerel makinede, Docker 29.1.3 ile alındı. Kancanın dockerd başlatan yolu bulut oturumunda henüz denenmedi.
