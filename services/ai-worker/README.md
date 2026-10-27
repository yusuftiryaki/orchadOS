# services/ai-worker

AI ön değerlendirme (İP9, v0.1). İşlenmiş bir tarama ziyaretinin her aktif ağacı için kesitlerden bir öneri üretir: mevsimin ölçekleri için değer ve güven, önerilen genel sınıf, "ağaç görünüyor mu?", tutarsızlık bayrakları ve uzmana kısa bir gerekçe. Sonuç uzman panelinde öneri olarak görünür; **sahibe hiçbir zaman görünmez**. AI teşhis koymaz, sadece görünür belirtileri işaretler.

İstekler Claude Message Batches API ile gider (%50 indirim). Önce Claude Haiku 5.5 her ağaca bakar; belirsiz ve sorunlu vakalar Claude Sonnet 5.5'e gider. Claude Opus 5.5 üçüncü aşama olarak yapılandırmada durur, varsayılan kapalı.

## Kurulum

İşleme istasyonunda (ya da `core` devcontainer'da):

```bash
cd services/ai-worker
uv sync
uv run ai-worker --help
```

Python 3.12+, `uv`. Bağımlılıklar: `anthropic` (resmi SDK), `httpx`, `pillow`, `pydantic`.

### Ortam değişkenleri

Değerler repoya, CI'a ve loglara girmez. Örnek `.env` (değersiz):

```bash
# Supabase: ops rolünde bir kullanıcı (servis anahtarı kullanılmaz; satır bazlı yetki geçerli)
SUPABASE_URL=
SUPABASE_ANON_KEY=
ORCHADOS_EMAIL=
ORCHADOS_PASSWORD=
# Claude API anahtarı; SDK ortamdan okur
ANTHROPIC_API_KEY=
# İsteğe bağlı: iş durumu klasörü (varsayılan ~/.local/state/orchados-ai-worker)
AI_WORKER_STATE_DIR=
```

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `uv run ai-worker run --session-id <uuid>` | Ziyareti değerlendirir: kesitleri indirir, mozaikleri kurar, Haiku batch'ini, sonra Sonnet batch'ini gönderir, bitince satırları yazar, maliyet raporu basar |
| `uv run ai-worker run --session-id <uuid> --no-wait` | Batch'i gönderir ve çıkar; sonra `resume` |
| `uv run ai-worker resume --session-id <uuid>` | Yarıda kalan işi kaldığı yerden sürdürür (batch bekleme, sonuç toplama, yazma) |
| `uv run ai-worker run --session-id <uuid> --no-write` | Sonuçları sadece yerel iş klasöründe tutar; yayımlanmış ziyaretler (değerlendirme seti) için |
| `uv run ai-worker eval --session-id <uuid> [--session-id ...]` | AI önerisini uzman kararıyla karşılaştırır |
| `uv run ai-worker eval --parcel-id <uuid> [--from-state]` | Parselin bütün ziyaretleri; `--from-state` ile `--no-write` cevapları da |
| `uv run pytest` | Testler (yerel Supabase yoksa entegrasyon testleri atlanır) |
| `uv run ai-worker run --session-id <uuid> --config configs/ollama-gemma3.json` | Yerel ücretsiz modelle (aşağıda, "Ücretsiz sağlayıcılar") |
| `uv run pytest -m live` | İsteğe bağlı gerçek API testi; `ANTHROPIC_API_KEY` gerekir, CI'da koşmaz |
| `uv run ruff check . && uv run ruff format --check .` | Lint |

`run` seçenekleri: `--config <json>` (yapılandırma), `--with-opus` (üçüncü aşama), `--threshold 0.7` (triaj eşiği), `--limit N` (deneme için en çok N ağaç), `--state-dir`, `--json`.

## Akış

1. **Okuma** (ops kimliği, PostgREST): oturum (durum `processed` ya da `in_review`, metodoloji sürümü, zaman → mevsim), aktif ağaçlar ve yer kodları, ziyaretin ağaç kesitleri (`asset.kind = tree_crop`), personelin evet/hayır cevapları, metrik kaydı. Önceki yayımlanmış ziyaretin kesitleri de okunur.
2. **Kesitler** imzalı adreslerle indirilir, SHA-256'ları `content_hash` ile denetlenir. Her ağaç için yön başına bir kesit seçilir (en yeni, sonra en yüksek kalite).
3. **Mozaik** yerelde üretilir: 1024×1024, 2×2 (sol üst N, sağ üst E, sol alt S, sağ alt W), her karede yön harfi, eksik yön gri. Önceki ziyaretin aynı mozaiği ikinci görsel olur.
4. **Aşama 1:** Bütün ağaçlar Haiku'ya, tek batch (256 MB sınırına göre gerekirse birkaç batch).
5. **Triaj** (`triage.py`): şunlar Sonnet'e gider:
    - cevap yok (hata, ret, şemaya uymayan cevap)
    - sınıf güveni eşiğin altında (varsayılan 0,70; `docs/metodoloji.md` bölüm 6) ya da sınıf yok
    - önerilen sınıf sorunlu, kuru ya da yok
    - herhangi bir bayrak
    - ağaç net görünmüyor
    - sınıf, cevabın kendi ölçeklerinden çıkmıyor (genel sınıf kuralı 3–5)
    - (`methodology-v0.1`) kuru dal ya da gövde ve kök boğazı ölçeği 2 ya da üstü: görüntüden en zor değerlendirilen iki ölçek, güven ne olursa olsun Sonnet'e gider (`hard_scale_dead_branch_scale`, `hard_scale_trunk_base_scale`; `docs/uzman-ajan-onerileri.md` 1.8)
6. **Aşama 2:** Sonnet. (`--with-opus` ile: Sonnet'in de cevap veremediği ya da güveni 0,50'nin altında kalan vakalar Opus'a.)
7. **Yazma:** Her ağacın son kullanılabilir cevabı `save_ai_assessment` ile tek işlemde yazılır. Sonraki aşama başarısız olursa önceki cevap geçerlidir. Hiç cevap alınamayan ağaç yazılmaz; uzman sıfırdan bakar (panelde "düşük güven").

Satırların biçimi: [docs/arayuzler.md, "AI ön değerlendirme satırları"](../../docs/arayuzler.md#ai-ön-değerlendirme-satırları). Kısaca: `assessment` (`source = ai`, sınıf, güven, model adı ve sürümü, metodoloji sürümü, gerekçe `notes`'ta), `measurement` (`source = ai`, `method = ai_preassessment`, `method_version` = istem sürümü, güven), kesitler kanıt olarak, ayrıca `ai_assessment_detail` (görünürlük, bayraklar, triaj yolu, token ve maliyet).

### Tekrar çalıştırma ve kaldığı yerden devam

- İş durumu yerelde tutulur: `<state dir>/<session id>/<anahtar>/state.json` (batch kimlikleri, her aşamanın cevapları, yazılan satırlar), `mosaics/`, `report.json`. Her adım bir sonrakinden önce kaydedilir.
- `resume` bekleyen batch'i yoklar, sonuçları toplar, sonraki aşamayı gönderir, yazılmamış satırları yazar. Batch sonuçları API tarafında 29 gün durur.
- Aynı istem sürümü ve model kaskadıyla tekrar çalıştırma yeni satır açmaz ve istek göndermez: veritabanında sonucu olan ağaçlar atlanır (başka bir istasyondan çalıştırılsa da); veritabanı fonksiyonu da aynı anahtarla ikinci kez yazmaz.
- Cevap alınamayan ağaçlar bir sonraki `run`'da yeniden denenir.
- İstem ya da kaskad değişince (`prompt_version`, `config_key`) yeni satırlar eklenir; eskiler kalır.

## Ücretsiz sağlayıcılar (akışı denemek için)

Anthropic anahtarı olmadan da akış uçtan uca çalışır. `provider.kind = "openai"` olan bir yapılandırma, istekleri OpenAI uyumlu bir sohbet ucuna gönderir (`openai_compat.py`). İstemler ve çıktı şeması aynıdır; cevaplar Messages API biçimine çevrilir, yazma ve `eval` değişmez. Batch yoktur: istekler tek tek gider, cevaplar `<state dir>/openai-results/` altında saklanır, `resume` onları bulur. Fiyat tablosunda olmayan modellerin maliyeti 0 raporlanır.

| Yapılandırma | Ne | Veri nereye gider | Ne zaman |
| --- | --- | --- | --- |
| `configs/ollama-gemma3.json` | Yerel [Ollama](https://ollama.com), `gemma3:4b` (görsel destekli, ~3,3 GB) | Makineden çıkmaz | Akış denemesi, gerçek kesitlerle de kullanılabilir |
| `configs/gemini-free.json` | Google Gemini ücretsiz katmanı, OpenAI uyumlu uç (`GEMINI_API_KEY`) | Google'a; ücretsiz katmanda istekler ürün geliştirmede kullanılabilir | **Sadece test verisi:** `--test-data-only` olmadan çalışmaz |

```bash
# Yerel Ollama (CPU'da da çalışır; 8 GB RAM'li dizüstünde ağaç başına ~2 dk)
docker run -d --name orchados-ollama -p 127.0.0.1:11434:11434 -v orchados-ollama:/root/.ollama ollama/ollama
docker exec orchados-ollama ollama pull gemma3:4b
uv run ai-worker run --session-id <uuid> --config configs/ollama-gemma3.json --limit 3

# Gemini ücretsiz katmanı, sadece sentetik/test ziyareti
GEMINI_API_KEY=… uv run ai-worker run --session-id <uuid> --config configs/gemini-free.json --test-data-only
```

- **Model kalitesi:** Küçük yerel modelin cevapları uzmanla karşılaştırma için değil, akışı (istem → şema → satırlar → uzman paneli) çalıştırmak içindir. Ollama yapılandırmasında ikinci aşama kapalıdır (`"review": null`): aynı küçük modele ikinci kez sormak bir şey katmaz.
- **Gemini model adları** sık değişir; yapılandırma `gemini-flash-lite-latest` / `gemini-flash-latest` takma adlarını kullanır. Güncel liste: `curl -H "Authorization: Bearer $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/openai/models`. Ücretsiz katmanın dakika sınırı için istekler arası `request_interval_s` (7 sn) beklenir; 429 ve 5xx cevapları geri çekilerek yeniden denenir.
- **Kişisel veri kuralı** burada da aynıdır: istekte yalnızca ağaç kodu, mevsim, mozaikler, ölçek tanımları ve evet/hayır cevapları vardır (`tests/test_openai_compat.py` denetler). Gerçek bahçe görüntüleri, istekleri eğitimde kullanmayan sağlayıcıya gider (yerel model ya da ücretli API).

## İstem

- **Sürüm:** `prompt_version = ai-<PROMPT_REVISION>/<metodoloji sürümü>`, ör. `ai-v0.3/methodology-v0.1`. İstem metni, ölçek tanımları (`methodology.py`) ya da çıktı şeması değişirse `prompt.PROMPT_REVISION` artar. Bilinmeyen bir metodoloji sürümü hata verir.
- **Metodoloji sürümüne bağlı kurallar** (`methodology.py`): metodoloji sürümleri arasında değişen her kural ve metin sürüm anahtarlı tutulur; `methodology-v0` ile planlanmış ziyaret kendi kurallarıyla değerlendirilir. `methodology-v0.1`'de (uzman ajan kararları, `docs/uzman-ajan-onerileri.md` 1.1, 1.4, 1.8):
    - Ölçek değerleri için görünür ölçütler: kuru dalda "ana kol" kuralı (bir ana kol tümüyle kuru ⇒ en az 2, iki ve fazlası ⇒ 3) ve sık hatalar (gölgedeki iç dallar, kışın ıslak koyu dallar, arka sıradaki ağacın dalları); gövde ve kök boğazında avuç içi ölçüsü, dip sürgünü bu ölçekte değil; taç doluluğunda gökyüzü boşlukları, parsel içi karşılaştırma, erkek ağaç ve fidan kendi grubuyla, yüklü ağaç seyrek sayılmaz; don hasarında %10 / %50; zararlıda görünür belirti tablosu (kokarca dahil), hafif belirti sınıfı değiştirmez; meyve yükünde dalların üçte biri / üçte ikisi, erkek ağaç ölçeğe girmez; budamada taze kesim rengi; hasatta ağaç altı artığı tek başına bir şey söylemez (`_SCALE_TEXTS_V01`).
    - Ortak kural: iki değer arasında kalınırsa kanıt iyiyse üst değer, zayıfsa değer yok (`COMMON_RULES`).
    - Kışın kuru (`NO_AI_DEAD_IN_SEASON`): AI kışın `dead` sınıfı vermez; istem bunu söyler. Cevap yine de `dead` derse worker cevabı toplarken (`schema.apply_worker_rules`) sınıfı `problem` yapar, `dead_branch_scale` 3 olur (model 3 vermediyse sınıf güveniyle), cevaba `winter_dead_downgraded` bayrağı ve gerekçeye Türkçe bir not eklenir. Bayrak triajda `flag_winter_dead_downgraded` olarak cevabı Sonnet'e de gönderir. `methodology-v0` ziyaretlerinde cevap olduğu gibi kalır.
    - Zor ölçekler (`HARD_SCALES`): bkz. "Akış", triaj.
- **Sistem istemi** (önbellekli ön ek): mevsimin ölçek tanımları (`metric_definition` + `docs/metodoloji.md` bölüm 4, metodoloji sürümünün metinleriyle), 0–3 ortak kuralı ve sürümün ek ortak kuralları, genel sınıf kuralı, "teşhis koyma, görünür belirtiyi söyle" ve "emin değilsen değer verme" kuralları, personel sorularının kod sözlüğü, çıktı tanımı. Mevsim ve metodoloji sürümüne göre sabittir; ziyaretin bütün ağaçlarında aynıdır. Referans görseller (`docs/metodoloji.md` Ek A) henüz yok; eklenince bu ön eke girer ve istem sürümü artar.
- **Kullanıcı mesajı:** ağaç kodu ve mevsim, bu ziyaretin mozaiği, varsa önceki yayımlanmış ziyaretin mozaiği, varsa personelin evet/hayır cevapları (`kod: yes/no`).
- **Çıktı:** yapılandırılmış JSON (`output_config.format`, şema `schema.py`); yerelde ayrıca metrik kaydına göre doğrulanır (aralık, kategori, 0–1 güven). Ölçek başına değer ya da boş + güven, sınıf + güven, `tree_visible` (yes/no/unsure), bayraklar (`staff_answer_conflict`, `large_change_from_previous`, `poor_image`), Türkçe kısa gerekçe. Worker'ın kendi bayrağı (`winter_dead_downgraded`) şemada modele sunulmaz; model cevabında gelirse atılır.
- Kışın "kuru" sınıfını sadece uzman verir; istem AI'a kışın `dead` önermemesini söyler, `methodology-v0.1`'de worker bunu cevapta da uygular (yukarıda).

## Kişisel veri kuralı

- İsteğe sadece şunlar girer: ağaç (yer) kodu, mevsim, kesit mozaikleri, ölçek tanımları ve personelin evet/hayır cevapları (metrik kodu + cevap).
- Sahip adı, telefonu, tapu bilgisi, parsel adı, köy ve soru metinleri **gönderilmez**. Worker bunları okumaz bile: katalog arayüzü (`catalog.py`) sadece ağaç kimliği ve kodu, kesitler, cevaplar ve metrik kodlarını okur; metrik kaydının ad ve açıklama alanları istenmez. Testler bunu sahte veriyle ve yerel Supabase'in seed verisiyle denetler (`test_worker.py::test_no_personal_data_in_requests`, `test_supabase.py::test_no_personal_data_left_the_database`).
- **Görüntüler:** Sadece panorama kesitleri; ziyaretin bütün kesitleri gönderilir. Yakın plan fotoğraflar v0.1'de gönderilmez; bu bir kapsam kararıdır: yakın plan analizi sonraki sürümde.
- `ANTHROPIC_API_KEY` sadece ortamdan okunur; loglanmaz, iş durumuna yazılmaz. İş durumu klasöründe kişisel veri yoktur.

## Maliyet notu

Fiyatlar Anthropic'in 6 Ekim 2026 liste fiyatları (`config.PRICES`), Batch indirimiyle (%50). Önbellek okuması girdi fiyatının %10'u (Opus 5.5'te %5), önbellek yazımı 1,25 katı.

| Model | Batch girdi / çıktı $/MTok |
| --- | --- |
| Claude Haiku 5.5 | 0,05 / 0,25 |
| Claude Sonnet 5.5 | 1,00 / 5,00 |
| Claude Opus 5.5 | 2,00 / 10,00 |

- Her `run` istek sayısını, girdi/çıktı tokenlarını, önbellekten okunan ve yazılan tokenları ve tahmini doları model model basar; `report.json`'a ve ağaç başına `ai_assessment_detail.cost_usd`'ye yazar.
- Kaba hesap (`docs/teknik-mimari.md`, strateji C): 300 ağaçlık bir ziyaret, iki mozaik (~2.800 görsel token) + ~2.000 token önbellekli ön ek + ~400 token metin; Haiku'da ~800, Sonnet'te ~1.500 çıktı tokenı; %20'si Sonnet'e → ziyaret başına ~0,5 $. Belgedeki ~1,5 $ referans görselli 15.000 tokenlık ön eki varsayıyor.
- Önbellek: sistem istemi ziyaretin bütün isteklerinde aynıdır. Batch'te önbellek isabeti garanti değildir; gerçek oran rapordaki "cache hits" satırında görünür.
- Thinking her üç modelde de açıktır (adaptive); derinlik `effort` ile ayarlanır (Haiku `low`, Sonnet `medium`, Opus `medium`). Düşünme tokenları çıktı fiyatından ödenir.
- Model seçimi `ai-worker eval` ile ölçülerek yapılmalı (`docs/teknik-mimari.md`, "Model seçimi kalite ölçümüyle yapılır").

## Değerlendirme (`eval`)

Uzman kararı olan ağaçlarda:
- **Ölçek başına:** AI'ın değer verdiği yerlerde uzmanla tam uyum oranı, 0–3 ölçeklerde ±1 uyum, AI'ın değer verdiği oran.
- **Sınıf karışıklık matrisi** (satır AI, sütun uzman) ve sınıf uyumu; son kararı veren modele göre uyum.
- **Zorunlu incelemeye düşen oran** (`docs/metodoloji.md` bölüm 6): düşük güven, sorunlu/kuru/yok önerisi, personel çelişkisi ve diğer bayraklar, önceki yayımlanmış ziyarete göre sınıf değişimi. "Sorun gördüm" işareti veritabanında henüz yok, sayılmaz.
- Toplu onaylı (`auto_approved`) uzman satırları AI'ın kopyası olduğu için hesaba girmez.

Kış denetiminin uzman kararları setin ilk verisidir. O ziyaretler AI çalışmadan yayımlanmışsa: `ai-worker run --session-id <uuid> --no-write` (yayımlanmış ziyarete satır yazılmaz, cevaplar iş klasöründe kalır), sonra `ai-worker eval --session-id <uuid> --from-state`.

## Modüller

| Dosya | İçerik |
| --- | --- |
| `methodology.py` | Ölçeklerin istemdeki metinleri, mevsim takvimi, genel sınıf kuralı, personel soru kodları; metodoloji sürümüne bağlı kurallar |
| `prompt.py` | Sistem istemi, kullanıcı mesajı, istek parametreleri, istem sürümü |
| `schema.py` | Çıktı JSON şeması, doğrulama, worker'ın cevaba uyguladığı kurallar (kışın kuru) |
| `mosaic.py` | Dört yön mozaiği |
| `triage.py` | Triaj kuralları, son cevabın seçimi |
| `config.py` | Modeller, eşikler, fiyatlar; `--config` JSON'u bu alanları değiştirir |
| `catalog.py`, `supabase.py` | Veritabanı okuma/yazma (ops kimliği) |
| `api.py` | Message Batches API (resmi SDK) |
| `state.py` | Yerel iş durumu |
| `rows.py` | Cevaptan `save_ai_assessment` argümanları |
| `cost.py` | Token ve maliyet raporu |
| `worker.py` | Akış |
| `evaluate.py` | Değerlendirme |

## Testler

- **Birim:** istem kurulumu, sürüme göre ölçek metinleri ve kişisel veri (`test_prompt.py`), şema doğrulama ve kışın kuru kuralı (`test_schema.py`), triaj kuralları (`test_triage.py`), mozaik, cevabın satırlara dönüşmesi (`test_rows.py`), değerlendirme (`test_evaluate.py`), SDK ile batch istemcisi sahte HTTP taşıyıcısıyla (`test_api.py`).
- **Uçtan uca, sahte API ile** (`test_worker.py`): batch gönder → sonuç → yaz → tekrar çalıştır; `--no-wait` + `resume`; yazma sırasında kesilme; Sonnet reddi; cevapsız ağacın yeniden denenmesi; yayımlanmış ziyaret; batch bölme; Opus aşaması; `methodology-v0.1` kış ziyaretinde kuru cevabın sorunluya çevrilmesi ve zor ölçeklerin Sonnet'e gitmesi.
- **Entegrasyon** (`test_supabase.py`, `supabase` işareti): yerel Supabase'te kendi ziyaretini açar, seed parselinin üç ağacına kesit yükler, sahte API ile çalıştırır; satırların yazıldığını, tekrar çalıştırmanın bir şey eklemediğini, sahip ve hissedarın hiçbir AI satırını görmediğini, uzman panelinin sorgularının öneriyi okuduğunu, saha personelinin yazamadığını ve `eval`'ı denetler. Önce kökte `pnpm install && pnpm db:start && pnpm db:reset`. Supabase'e ulaşılamazsa atlanır; CI'da atlanırsa iş başarısız olur. Test oturumları sonunda silinir (`ORCHADOS_TEST_KEEP_DATA=1` ile kalır).
- **Gerçek API** (`test_live.py`, `-m live`): bir sentetik ağaçla tek istek ve token sayımı. Sadece `ANTHROPIC_API_KEY` varsa ve açıkça istenirse.
- Veritabanı tarafı: `supabase/tests/24_ai_preassessment.test.sql` (`pnpm db:test`).

## Bilinen eksikler

- **Referans görseller** (Ek A) yok; önbellekli ön ek sadece metin.
- **Yakın plan fotoğraflar** gönderilmiyor; yakın plan analizi sonraki sürümde.
- **"Sorun gördüm" işareti** veritabanında yok; ne isteğe ne değerlendirmeye giriyor.
- **Güven kalibrasyonu:** Modelin verdiği güven ham değerdir; eşik (0,70) ve triaj pilotta `eval` ile ayarlanmalı.
- **Ölçek belirsizliği:** `uncertainty`, güvenden türetilen bir yaklaşık değerdir (`rows.uncertainty`), istatistiksel bir aralık değildir.
- **Retler:** Batch API sunucu tarafı model yedeğini (`fallbacks`) desteklemiyor; reddedilen istek bir sonraki aşamaya ya da sonraki `run`'a kalır.
- **Zor ölçekler `eval`'da:** `methodology-v0.1`'in "kuru dal ve gövde 2+ zorunlu inceleme" kuralı (uzman ajan 1.8) şimdilik yalnız triajda; `eval`'ın zorunlu inceleme oranı uzman panelinin kurallarını izler ve bunu saymaz. `winter_dead_downgraded` bayrağı orada "diğer bayrak" sayılır.
- **Kuyruk:** v0.1'de iş elle başlatılır (`run`). Ziyaret `processed` olunca kendiliğinden başlatan bir tetikleyici yok.
