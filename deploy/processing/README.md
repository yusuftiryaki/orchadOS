# deploy/processing

Bulutta işleme için container imajı ve makine betikleri. Operasyon adımları, sağlayıcı karşılaştırması ve kota hazırlığı: [docs/bulut-isleme.md](../../docs/bulut-isleme.md).

| Dosya | Ne |
| --- | --- |
| `Dockerfile` | `ghcr.io/yusuftiryaki/orchados-processing`: işleme hattı, AI worker, ingest, RTKLIB, ffmpeg. Taban `nvcr.io` CUDA imajı; Docker Hub yok. Depo kökünden derlenir |
| `orchados-process` | İmajın içinde tek komut: `pull` → `run --trees-from-db [--boundary] --upload` → isteğe bağlı `ai-worker run` |
| `machine.sh` | `<aws\|azure\|gcp> <komut>`: makine aç/başlat/durdur/sil, `run <oturum>`, bütçe, Windows makinesi |
| `providers/*.sh` | Sağlayıcıya özgü ince kısım (aws, az, gcloud CLI'ları) |
| `linux/startup.sh` | Üç sağlayıcıda ortak ilk açılış betiği: NVIDIA sürücüsü, Docker, container toolkit, `orchados-run-job`, boşta bekçisi |
| `windows/studio-job.ps1` | Windows makinesinde kamera orijinallerini indirme, Studio dışa aktarımını `video/` olarak yükleme |
| `machine.env.example`, `process.env.example` | Makine ayarları (gizli bilgi yok) ve iş ortamı (Supabase ops kullanıcısı; repoya girmez) |
| `tests/e2e.sh` | İmajı uçtan uca dener: yerel Supabase + MinIO, sentetik oturum, işlemci |
| `tests/machine-dry-run.sh` | `machine.sh`'i sahte CLI'larla bütün komut yollarından geçirir |

## Komutlar

```bash
# Kökten
docker build -f deploy/processing/Dockerfile -t orchados-processing:dev .
pnpm db:start && pnpm db:reset
deploy/processing/tests/e2e.sh orchados-processing:dev       # ~1 dk
deploy/processing/tests/machine-dry-run.sh
shellcheck -x deploy/processing/{orchados-process,machine.sh,providers/*.sh,linux/startup.sh,tests/*.sh}

# Operasyon
cp deploy/processing/machine.env.example deploy/processing/machine.env
cp deploy/processing/process.env.example deploy/processing/process.env
deploy/processing/machine.sh aws create
deploy/processing/machine.sh aws run <session-id>
```

`e2e.sh` test oturumunu veritabanında bırakır; ardından `pnpm db:test` çalışacaksa önce `pnpm db:reset`.
