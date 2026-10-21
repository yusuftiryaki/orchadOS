# İP9 – AI Ön Değerlendirme (AI Worker) v0.1

- **Klasör:** `services/ai-worker/`. Ayrıca:
    - Şema gerekirse: `supabase/migrations/20261023150xxx_*.sql`, `supabase/tests/24_*.test.sql`, ardından `pnpm web:typegen`. Seed'e dokunma.
    - `.github/workflows/ci-ai-worker.yml`: yeni iş akışı. `ci-pipeline.yml` örnek alınabilir.
    - `docs/arayuzler.md`: AI çıktısının veritabanına yazılış biçimi için bir bölüm.
- **Aynı anda çalışan oturumlar:** `apps/web/`, `apps/field/`, `services/pipeline/`, `firmware/`. Bunlara dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 4: AI ön değerlendirme
    - `docs/metodoloji.md`: bölüm 4–6 ve Ek B
    - `docs/teknik-mimari.md`: "AI ve LLM maliyeti" ve KVKK
    - `docs/arayuzler.md`: "Asset `pose` alanı"
    - `services/pipeline/README.md`: yükleme ve kesitler
    - `supabase/migrations/`
- **Claude API:** Ortamda `claude-api` becerisi varsa önce onu yükle; yoksa güncel belgeleri oku.
    - Modeller: Triaj için `claude-haiku-5-5`, belirsiz vakalar için `claude-sonnet-5-5`; zor vakalarda `claude-opus-5-5` seçeneği yapılandırmada dursun.
    - İstekler Message Batches API ile; ortak ön ek (ölçek tanımları, referans görseller) prompt caching ile önbellekte.

## Amaç

Bir tarama ziyareti işlenip yüklenince (`processed`), her ağaç için bir AI ön değerlendirmesi üretilir:
- Ölçek önerileri ve güven skoru
- Ağaç görünüyor mu?
- Tutarsızlık bayrakları

Sonuç uzman panelinde öneri olarak görünür; sahibe asla görünmez. AI teşhis koymaz, sadece görünür belirtileri işaretler.

## Kurallar (değişmez)

- **Kişisel veri LLM'e gitmez:** Sahip adı, telefonu, tapu bilgisi, parsel adı ve köy, soru metinleri. İsteğe sadece ağaç kodu, mevsim, görüntüler, ölçek tanımları ve personelin evet/hayır cevapları girer.
- **Görüntüler:** Ağaç kesitleri. Yakın planlarda kişi görünebilir; yüz bulanıklaştırma henüz yok. Bu yüzden v0.1'de **yakın plan fotoğrafları gönderilmez**, sadece panorama kesitleri gönderilir. Bulanıklaştırılmamış diye işaretli kesit de gönderilmez.
- **AI satırları:** `assessment.source = ai`, `measurement.source = ai`. Model adı ve sürümü, istem sürümü ve maliyeti kaydedilir. Uzman kararının yerine geçmez.
- **API anahtarı** ortam değişkeninden okunur (`ANTHROPIC_API_KEY`). Repoya, CI'a ve loglara girmez. CI'da gerçek API çağrısı yapılmaz.

## Yapılacaklar

1. **İstem:**
    - Sistem istemi:
        - Ölçek tanımları, mevsime göre (`metric_definition` + `docs/metodoloji.md`)
        - Genel sınıf kuralı
        - Çıktı şeması
        - "Teşhis koyma, görünür belirtiyi söyle" ve "emin değilsen değer verme" kuralları
    - İstem sürümlüdür (`prompt_version`); metodoloji sürümüne bağlıdır.
    - **Kullanıcı mesajı:**
        - Bu ziyaretin dört yön kesitlerinden bir mozaik
        - Önceki yayımlanmış ziyaretin aynı mozaiği (varsa)
        - Personelin cevapları (varsa)
    - Mozaik yerelde üretilir, ör. 1024×1024.
    - Referans görseller henüz yok (`docs/metodoloji.md` Ek A). Önbellekli ön ek şimdilik sadece metin; görseller eklenince istem sürümü artar.
2. **Çıktı** (yapılandırılmış JSON; şemayla doğrulanır):
    - Mevsimin ölçekleri için değer ya da boş, her birine 0–1 güven
    - Önerilen genel sınıf ve güveni
    - `tree_visible`: evet / hayır / belirsiz
    - Bayraklar: personel cevabıyla çelişki, önceki ziyarete göre büyük değişim, kötü görüntü
    - Kısa gerekçe (sadece uzmana)
3. **Triaj:**
    - Önce Haiku. Güveni eşiğin altındakiler, sorunlu/kuru/yok önerilenler ve bayraklılar Sonnet'e gider; eşik yapılandırmada.
    - Hangi modelin son kararı verdiği kaydedilir.
4. **Akış** (komut satırı; işleme istasyonunda çalışır):
    - `ai-worker run --session-id <uuid>`:
        1. Ziyaretin kesitlerini indirir: imzalı adresler, ops kimliği.
        2. Batch'i gönderir.
        3. Bitince sonuçları yazar: `assessment` (source `ai`), `measurement` (source `ai`), `measurement_evidence` (kesitler), `assessment_measurement`.
    - Batch kimliği yerelde saklanır; yarıda kesilen iş kaldığı yerden devam eder (`ai-worker resume`).
    - Tekrar çalıştırma aynı istem ve model sürümüyle yeni satır açmaz.
    - **Maliyet raporu:** İstek sayısı, token ve önbellek kullanımı, tahmini $.
5. **Değerlendirme seti:**
    - `ai-worker eval`: Uzman kararı olan ağaçlarda AI önerisini uzman kararıyla karşılaştırır.
    - Çıktı: ölçek başına uyum, sınıf karışıklık matrisi, zorunlu incelemeye düşen oran.
    - Kış denetiminin uzman kararları bu setin ilk verisi olur.
6. **Testler:**
    - Birim: İstem kurulumu (kişisel veri girmiyor), şema doğrulama, triaj kuralları, mozaik, sonuçların satırlara dönüşmesi.
    - Sahte API istemcisiyle uçtan uca: Batch gönder → sonuç → yaz → tekrar çalıştırma.
    - Entegrasyon (yerel Supabase, sahte API):
        - Sentetik bir ziyaretin ağaçlarına AI satırları yazılıyor.
        - Sahip bunları göremiyor.
        - Uzman panelinin okuduğu biçimde.
    - İsteğe bağlı gerçek API testi: `ANTHROPIC_API_KEY` varsa ve açıkça istenirse (`-m live`). CI'da koşmaz.
7. **CI:** `ci-ai-worker.yml`: lint, testler, yerel Supabase'le entegrasyon. Gerçek API yok.
8. **README:** Kurulum, ortam değişkenleri, komutlar, maliyet notu, kişisel veri kuralı.

## Kabul ölçütü

- Lint ve testler geçiyor; Supabase entegrasyon testleri atlanmıyor.
- Hiçbir testte gerçek API çağrısı yok; istemlerde kişisel veri olmadığı testle gösteriliyor.
- Migration eklendiyse `pnpm db:test` geçiyor ve `database.types.ts` güncel.
