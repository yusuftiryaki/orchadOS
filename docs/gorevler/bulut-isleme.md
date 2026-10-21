# Bulutta İşleme: Sağlayıcıdan Bağımsız Yükleme, Container ve Makine Betikleri

- **Klasör:**
    - Yeni bir araç: `services/ingest/` (Python, `uv`).
    - Container ve makine betikleri: `deploy/processing/`.
    - `services/pipeline/` ve `services/ai-worker/` içinde sadece paketleme için gereken küçük değişiklikler; ör. giriş noktası, bağımlılık kilidi. Davranış değişmez.
    - CI: `.github/workflows/ci-ingest.yml` ve container imajı için `.github/workflows/build-processing-image.yml`.
    - Dokümanlar: `docs/bulut-isleme.md` (yeni). `docs/teknik-mimari.md`'deki "İşleme pilotta bulutta" bölümüne kısa bir bağlantı.
- **Dokunma:** `apps/`, `supabase/`, `firmware/`.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/teknik-mimari.md`: "İşleme pilotta bulutta", "Veri yaşam döngüsü", KVKK
    - `docs/arayuzler.md`: "Oturum klasörü"
    - `services/pipeline/README.md`
    - `services/ai-worker/README.md`
    - `CLAUDE.md`
- Her madde bitince commit'le ve dalı gönder; PR en sonda.

## Karar (22 Ekim 2026)

Pilotta işleme bulutta yapılır, ama **bulut sağlayıcısı seçilmedi**. Kod hiçbir sağlayıcıya bağlı olmamalı. AWS, Azure ve Google Cloud desteklenir; hangisinin kullanılacağı yapılandırmayla seçilir. Kendi bilgisayarında çalıştırmak da aynı yolla mümkün olmalı.

## Yapılacaklar

1. **Ham veri deposu arayüzü** (`services/ingest/`):
    - Tek bir arayüz: listele, yükle (çok parçalı, kaldığı yerden devam), indir, var mı, sil.
    - **Arka uçlar:**
        - `s3`: AWS S3, Cloudflare R2, Google Cloud Storage (HMAC/uyumluluk modu), MinIO
        - `azure`: Azure Blob Storage
        - `local`: dosya sistemi; geliştirme ve tek bilgisayarda kullanım için
    - Kütüphane seçimi senin; ör. `boto3` + `azure-storage-blob`, ya da `fsspec`/`obstore`. Gerekçesini yaz.
    - **Yapılandırma:** Bir dosya ya da ortam değişkenleri. Arka uç, kova/kapsayıcı, bölge, uç nokta, kimlik.
    - Kimlik bilgileri sağlayıcının standart yollarından okunur: ortam değişkeni, profil, makineye atanmış rol. Repoya girmez.
2. **Yükleme aracı** (`orchados-ingest`):
    - `orchados-ingest push <kart ya da oturum klasörü> --session-id <uuid>`:
        - Oturum klasörünü (`docs/arayuzler.md`) depoya `raw/<org>/<parcel>/<session>/...` düzeninde gönderir.
        - Her dosyanın SHA-256'sını hesaplar ve bir manifest yazar.
        - Kaldığı yerden devam eder, birden çok parçayı aynı anda yükler, ilerlemeyi ve kalan süreyi gösterir.
        - Bant genişliği sınırı seçeneği olsun; ofiste gündüz interneti tıkamamak için.
    - `orchados-ingest pull <session-id> <hedef>`: İşlem makinesinde oturumu indirir ve sağlama toplamlarını doğrular.
    - `orchados-ingest verify`, `list`, `prune --older-than 30d`.
    - **Saklama kuralı:** Ham veri 30 gün. Depoda sağlayıcının yaşam döngüsü kuralıyla da kurulabilir; her sağlayıcı için tarifi belgeye yaz. `prune` her yerde çalışan yedek yoldur.
    - Kişisel veri girmez: Manifestte sadece kimlikler, dosya adları, boyut ve hash.
3. **İşlem container'ı** (`deploy/processing/`):
    - Bir imaj: işleme hattı + AI worker + RTKLIB + ffmpeg. NVIDIA GPU varsa kullanır, yoksa işlemciyle çalışır.
    - İmaj `ghcr.io/yusuftiryaki/orchados-processing` olarak yayımlanır; `main`'de etiketli derleme. Docker Hub'a bağımlı olmasın: temel imajı ghcr, quay ya da ECR Public'ten seç.
    - Tek komutla bir ziyareti işlemek: `pull` → `run --trees-from-db --boundary` → `upload` → isteğe bağlı `ai-worker run`. Ortam değişkenleri belgede.
4. **Makine betikleri** (sağlayıcıya özgü kısım ince kalsın):
    - **Linux GPU makinesi:**
        - Bir cloud-init / başlangıç betiği: NVIDIA sürücüsü, container çalışma zamanı, NVIDIA container toolkit ve imaj.
        - AWS, Azure ve GCP için makineyi açma, durdurma ve silme komutları (her sağlayıcının kendi CLI'ıyla) ve önerilen makine türleri: T4, L4 ya da A10 sınıfı, AB bölgesi.
    - **Windows GPU makinesi** (Insta360 Studio için): Her sağlayıcıda Windows GPU makinesi açma tarifi, sürücü kurulumu ve uzak masaüstü.
        - Studio'nun kurulumu ve dışa aktarma ayarları belgede: equirectangular, çözünürlük, codec.
        - Dışa aktarılan videonun `orchados-ingest push` ile depoya geri yüklenmesi.
    - **Maliyet koruması:** Her tarifte boşta kalan makinenin kapanması (ör. iş bitince kapatma, ya da zamanlayıcı) ve bütçe uyarısının nasıl kurulacağı.
    - Terraform/OpenTofu gibi bir altyapı aracı kullanma kararını sen ver. Pilot için düz CLI betikleri yeterli olabilir; gerekçesini yaz.
5. **Testler:**
    - Birim: Arayüz, manifest, devam ettirme, sağlama toplamı, `prune` tarih hesabı.
    - Entegrasyon:
        - S3 için MinIO, Azure için Azurite. Container'da, imajlar Docker Hub dışından gelsin; bulut oturumunda Docker Hub kapalı.
        - Yükle → yarıda kes → devam et → indir → doğrula.
        - Google Cloud Storage için en az S3 uyumluluk modunun MinIO'yla aynı kod yolunu kullandığını gösteren bir test.
    - Container: CI'da imaj derlenir. Sentetik bir oturum depoya (MinIO) konur, container çekip işler. CI'da yerel Supabase var. GPU yok, işlemciyle çalışır.
6. **Belge** `docs/bulut-isleme.md`, operasyon için adım adım:
    - Kart → yükleme → makine açma → işleme → Supabase → makine kapatma
    - Sağlayıcı seçimi için karşılaştırma tablosu: GPU makine fiyatı, AB bölgesi, Windows GPU, depo ve veri çıkışı ücretleri. Fiyatlar "doğrulanmadı" diye işaretli.
    - Her sağlayıcı için hesap ve kota hazırlığı. Örneğin GPU kotası birçok sağlayıcıda başta 0 gelir.
    - `CLAUDE.md` için önerilen komut satırlarını PR'a yaz.

## Kabul ölçütü

- `services/ingest`: lint ve testler geçiyor; MinIO ve Azurite entegrasyon testleri CI'da atlanmıyor.
- Container imajı CI'da derleniyor ve sentetik bir oturumu baştan sona işliyor.
- Hiçbir testte gerçek bulut hesabı kullanılmıyor; repoda kimlik bilgisi yok.
