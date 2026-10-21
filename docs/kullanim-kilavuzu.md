# Kullanım Kılavuzu

21 Ekim 2026 · Yusuf

Bu kılavuz orchadOS'un uçtan uca akışını anlatır: bir bahçe sisteme nasıl girer, sahada ve ofiste kim ne yapar, rapor sahibe nasıl ulaşır. Her adımda hangi rolün hangi aracı kullandığı yazılıdır.

Değerlendirme kuralları [metodoloji.md](metodoloji.md)'de, ürün tanımı [MVP.md](MVP.md)'de anlatılır.

> **Durum işaretleri:** Yazılım geliştirme sürüyor. Her adımın yanında bugünkü durumu var:
> - ✅ **Hazır:** Kullanılabilir, test ediliyor.
> - 🟡 **Kısmen:** Çalışıyor ama bir parçası eksik ya da geçici bir yolla yapılıyor.
> - ⬜ **Henüz yok:** Planda var, yazılmadı.

## Roller ve araçlar

| Rol | Kim | Ne yapar | Araç |
| --- | --- | --- | --- |
| **Sahip** | Bahçeden uzakta yaşayan bahçe sahibi | Raporu okur, ağaç ağaç inceler, 360° gezer | Web portalı, `/portal` (telefon ya da bilgisayar) |
| **Hissedar** (izleyici) | Hisseli parselde diğer hissedarlar; sahip ekler | Sahiple aynı ekranları görür, değiştiremez | Web portalı, `/portal` |
| **Saha personeli** | Eğitimli öğrenci ya da okur yazar tarım işçisi | Sınır yürüyüşü, grid tarama, yakın plan, doğrulama turu; ofiste gövde üçgenleme | Saha uygulaması (Android) + tarama kiti; ofis aracı, `/ofis` |
| **Uzman** | Ziraat mühendisi, uzaktan çalışır | Ağaçları inceler, kararı verir, bulgu ve öneri yazar, raporu imzalar | Uzman paneli, `/uzman` |
| **Operasyon** | Başlangıçta kurucu | Sahip ve parsel kaydı, ziyaret planı, işleme hattını çalıştırma, kalite takibi | `/operasyon`, işleme istasyonu (`orchados-pipeline`), ofis aracı |

**Araçlar:**

| Araç | Nerede çalışır | Kim kullanır |
| --- | --- | --- |
| **Tarama kiti** | Motosiklette direk: 360° kamera, RTK GNSS anteni, GNSS kaydedici (ESP32) | Saha personeli |
| **Saha uygulaması** | Personelin Android telefonu; internetsiz çalışır | Saha personeli |
| **İşleme istasyonu** | Ofisteki GPU'lu bilgisayar; komut satırı aracı `orchados-pipeline` | Operasyon |
| **Web uygulaması** | Tarayıcı. Rol bazlı dört bölüm: `/portal`, `/uzman`, `/ofis`, `/operasyon` | Herkes, rolüne göre |
| **Veritabanı ve depo** | Supabase: kayıtlar, satır bazlı yetki, medya deposu | Arka planda; şimdilik operasyon panelden de kullanır |

Web uygulamasında herkes sadece rolünün bölümünü görür. Kullanıcının hangi veriyi göreceğine de veritabanındaki satır bazlı yetki karar verir. Örneğin sahip sadece kendi parselini görür; uzman ve personel ise işletmenin bütün parsellerini.

## Büyük resim

```mermaid
flowchart TD
    K["1 · Kayıt<br/>Operasyon: sahip, parsel, KVKK onayı"] --> E1
    subgraph ENV["2 · Envanter (parsel başına bir kez)"]
        E1["Saha: sınır yürüyüşü + grid tarama"] --> E2["İstasyon: işleme + yükleme"]
        E2 --> E3["Ofis: gövde üçgenleme, kodlama, boş yerler"]
        E3 --> E4["Saha: doğrulama turu"]
        E4 --> E5["Uzman: envanter onayı · Sahip: sınır onayı"]
    end
    E5 --> P1
    subgraph PER["3 · Periyodik ziyaret (yılda 4 kez)"]
        P1["Operasyon: ziyaret planı"] --> P2["Saha: grid tarama + yakın plan"]
        P2 --> P3["İstasyon: işleme + yükleme"]
        P3 --> P4["AI ön değerlendirme"]
        P4 --> P5["Uzman: inceleme, karar, bulgu, imza"]
        P5 --> P6["Sahip: karne, harita, ağaç karnesi, gezi"]
    end
    P6 -. "sonraki ziyaret" .-> P1
```

**Ziyaretin durumu** (veritabanında `session.status`). Ekranlarda ve kuyruklarda bu durumlar görünür:

| Durum | Anlamı | Kim geçirir |
| --- | --- | --- |
| `planned` | Planlandı | Operasyon |
| `captured` | Sahada tarandı, kayıtlar telefondan gönderildi | Saha uygulaması |
| `processed` | İşlendi, panoramalar ve kesitler yüklendi | İşleme hattı |
| `in_review` | Uzman incelemesinde | Uzman paneli (ziyaret açılınca) |
| `published` | Uzman imzaladı; sahip artık görüyor | Sadece uzman, `publish_session` ile |

**Sahip ne zaman görür?** Bir ziyaretin hiçbir sonucunu (fotoğraf, değerlendirme, bulgu) sahip uzman yayımlamadan önce göremez. Bu kural veritabanında uygulanır. Yayın geri alınamaz; yayımlanmış bir ziyaretin uzman kararları değiştirilemez.

## 1. Kayıt

**Kim:** Operasyon · **Araç:** `/operasyon`

1. Sahiple telefonda ya da yüz yüze görüşülür. Ad, telefon, iletişim tercihi ve KVKK onayı alınır. Kişisel bilgiler ayrı, korumalı bir şemada (`private`) tutulur.
2. Her parsel için: il/ilçe/köy, kaba konum ve sınır, tahmini alan ve ağaç sayısı, erişim notu, sınırı sahada gösterecek kişi. Tapu bilgisi sadece kayıt içindir.
3. Kaba sınır haritada çizilir (sınır sürüm 1, kaynağı "sahibin beyanı").
4. Sahibe ve varsa hissedarlara portal erişimi verilir (`parcel_access`: sahip `owner`, hissedar `viewer`).
    - Hesap yoksa açılır; tek kullanımlık parola ekranda bir kez gösterilir.
    - Operasyon parolayı sahibe WhatsApp'la iletir.
    - Hesabı Supabase'deki `invite-user` fonksiyonu açar; servis anahtarı Vercel'e çıkmaz.
5. Envanter ziyareti planlanınca parsel durumu "kayıt"tan "envanter planlandı"ya geçer.

| Adım | Durum |
| --- | --- |
| Veri modeli, kişisel verinin ayrı tutulması, yetki kuralları | ✅ |
| Sahip ve parsel kaydı, kaba sınır, portal erişimi ve hesap açma (`/operasyon`) | ✅ |
| Telefonla (SMS kodu) giriş | ✅ (gerçek SMS için Netgsm hesabı gerekiyor) |

## 2. Envanter

Envanter her parselin dijital haritasını bir kez çıkarır. Sonraki her ziyaret bu haritaya göre eşleşir.

### 2.1 Sahada: sınır ve grid tarama

**Kim:** Saha personeli · **Araç:** saha uygulaması + tarama kiti

1. **Bugünkü görevler:** Uygulamada günün ziyaretleri görünür.
2. **Ön kontrol:** Lens, pil, depolama, GNSS ham kaydı. Liste tamamlanmadan tarama başlamaz.
3. **Kaydediciyi bağla:** Uygulama Bluetooth ile GNSS kaydediciye bağlanır ve konum kalitesini gösterir (fix/float).
4. **QR saat:** Telefonda GPS saatini gösteren QR kodu 360° kameraya okutulur. Böylece video ile GPS zamanı eşlenir.
5. **Sınır yürüyüşü:** Sahibin ya da yetkilendirdiği kişinin gösterdiği sınır boyunca yürünür. Her köşede uygulamada "köşe" işaretlenir; sınır işaretleri fotoğraflanır.
6. **Grid tarama:** Motosikletle önce sıra boyunca, sonra dik koridorlar, en son kenarlar.
7. **Bitir:** Ziyaret özeti ekranında kayıtların gönderildiği görülür. Kameranın hafıza kartı ofise getirilir; ham video telefondan gönderilmez.

| Adım | Durum |
| --- | --- |
| Görevler, ön kontrol, kaydedici bağlantısı, QR saat | ✅ (telefonda henüz denenmedi; kit bekleniyor) |
| GNSS kaydedici yazılımı | ✅ (gerçek donanımda henüz denenmedi) |
| Sunucuya gönderim (senkronizasyon) | ✅ |
| Köşe işaretleme, kapsama haritası ve oranı | ✅ |
| Köşelerin PPK'lı yörüngeden konumlanıp sınır sürümünün yazılması (işleme hattı) | ✅ |
| Sabit grid rotası, dur-çek-yürü | ✅ |

### 2.2 İşleme istasyonunda

**Kim:** Operasyon · **Araç:** `orchados-pipeline`

1. Hafıza kartındaki video ve kaydedicinin microSD'si oturum klasörüne kopyalanır.
2. `orchados-pipeline run <oturum>`. Hat şunları yapar:
    - GNSS'i PPK ile santimetreye düzeltir.
    - Video ile zamanı eşler.
    - Her 3–4 m'de en net kareyi seçer.
    - Panoramaları ve önizlemeleri üretir.
3. `orchados-pipeline upload <çalıştırma> --session-id <ziyaret>`:
    - Panoramalar depoya, kayıtlar veritabanına gider.
    - Ham video istasyonda kalır.
    - Yüzleri bulanıklaştırılmamış görüntü yüklenmez.

| Adım | Durum |
| --- | --- |
| PPK, zaman eşleme, kare seçimi, panorama, yükleme | ✅ Sentetik veriyle |
| Gerçek kamera verisiyle deneme | ⬜ Kit bekleniyor |
| Yüz bulanıklaştırma | ⬜ |

### 2.3 Ofiste: gövde üçgenleme

**Kim:** Saha personeli ya da operasyon · **Araç:** ofis aracı, `/ofis/parsel/<parsel>/envanter`

1. Solda parsel haritası ve panorama noktaları, sağda iki panorama.
2. Her ağacın gövdesine iki farklı panoramada tıklanır; yazılım konumu hesaplar (ağaç başına ~10 sn). Belirsizlik yüksekse ya da açılar uygun değilse uyarı çıkar.
3. **Sıra oturtma ve kodlama:** Yazılım sıra doğrularını oturtur ve kodları verir (S5-12, ara ağaç S5-12a). Beklenen ama ağaç bulunmayan yerler "boş yer" olur.
4. **Doğrulama listesi:** Belirsiz ağaçlar, boş yerler ve "emin değilim" işaretlileri listelenir; CSV olarak alınabilir.
5. **Kaydet:** Yerler ve ağaçlar veritabanına yazılır.

| Adım | Durum |
| --- | --- |
| Üçgenleme, sıra oturtma, kodlama, boş yerler, doğrulama listesi, kayıt | ✅ |
| Panoramaları depodan okuma; tek işlemde kayıt; tıklamaların etiket olarak saklanması | ✅ |
| Ağaç özellikleri (yaş, aşı) ve altyapının ofiste işaretlenmesi | ✅ |
| Ofiste saha sınırı çizimi (sahada köşe işaretleme gelene kadar) | ✅ |

### 2.4 Doğrulama turu ve onaylar

**Kim:** Saha personeli, uzman, sahip

1. **Saha personeli:** Doğrulama listesindeki ağaçlara gider, yakın plan çeker ve soruları cevaplar. Bu tur, ilk periyodik ziyaretle birleştirilebilir.
2. **Uzman:** Kodlamayı ve ağaç özelliklerini kontrol eder, envanter raporunu imzalar.
3. **Sahip:** Sınırı portalda onaylar.

| Adım | Durum |
| --- | --- |
| Sınır onayının veritabanı kuralı (`approve_boundary`) | ✅ |
| Doğrulama turunun ofiste oluşturulması ve kalemlerin kapatılması (telefonla doğrulama) | ✅ |
| Uzmanın envanter onayı (`approve_inventory`; parsel "envanter tamam" olur), sahibin sınır onayı (portal) | ✅ |
| Saha uygulamasında doğrulama turu ekranı | ✅ |

## 3. Periyodik ziyaret

Yılda dört ziyaret: kış, ilkbahar, yaz, hasat. Her ziyarette neye bakıldığı [metodoloji.md](metodoloji.md)'de.

### 3.1 Planlama

**Kim:** Operasyon · **Araç:** `/operasyon`

Parsel için `periodic_scan` türünde, `planned` durumda bir ziyaret açılır; tarihi ve sorumlu personeli girilir. Ziyaret, personelin uygulamasında "bugünkü görevler" listesine düşer.

| Adım | Durum |
| --- | --- |
| Planlama, tarih ve sorumlu değişikliği, iptal; pano (duruma göre sayılar, yaklaşanlar, gecikenler) | ✅ |
| Görevlerin telefona inmesi | ✅ |

### 3.2 Sahada: tarama ve yakın plan

**Kim:** Saha personeli · **Araç:** saha uygulaması + tarama kiti

1. Ön kontrol, kaydedici bağlantısı ve QR saat; envanterle aynı.
2. Grid tarama; envanterle aynı rota, aynı kamera yüksekliği.
3. **Yakın plan listesi:**
    - Önceki ziyarette dikkat, sorunlu ya da kuru olanlar
    - Rastgele örneklem
    - Personelin "Sorun gördüm" dedikleri

   Her ağaçta mevsime göre 2–3 çekim yapılır ve evet/hayır soruları cevaplanır. Bulanık ya da karanlık fotoğraf telefonda reddedilir; fotoğraflar sadece uygulama içinden çekilir.
4. **Bitir:** Kayıtlar internet olunca kendiliğinden gönderilir. Hafıza kartı ofise getirilir.

| Adım | Durum |
| --- | --- |
| Yakın plan akışı, kamera, cihazda kalite kontrolü, gözlem soruları | ✅ |
| Gönderim | ✅ |
| Kapsama haritası, sabit grid rotası | ✅ |

### 3.3 İşleme istasyonunda

**Kim:** Operasyon · **Araç:** `orchados-pipeline`

Envanterle aynı adımlar. Bunlara ek olarak her ağaç için, ağaca en yakın panoramalardan dört yönden **kesit** çıkarılır. Yükleme bitince ziyaret `processed` olur ve uzmanın kuyruğuna düşer.

| Adım | Durum |
| --- | --- |
| Kesitler, yükleme, `processed` durumu | ✅ Sentetik veriyle |
| Ağaç konumlarının envanterden (veritabanından) alınması | ✅ |
| Kapsama raporu ve yeniden tarama görevi | ⬜ |

### 3.4 AI ön değerlendirme

**Kim:** Otomatik

Her ağacın kesitleri, önceki ziyaretin kesitleri ve personelin cevaplarından ölçek önerisi ve güven skoru üretilir. Bu bir **öneridir**: sahibe görünmez, uzman paneline düşer.

| Adım | Durum |
| --- | --- |
| AI ön değerlendirme (`ai-worker run --session-id ...`, işleme istasyonunda) | ✅ Sentetik veriyle; gerçek kesitler yüz bulanıklaştırma gelince gönderilir. İlk kış denetiminde uzman her ağaca kendisi karar verir |

### 3.5 Uzman incelemesi ve yayın

**Kim:** Uzman · **Araç:** uzman paneli, `/uzman`

1. **Ziyaret kuyruğu:** İşlenmiş ve incelemedeki ziyaretler; her birinde incelenen ve kalan ağaç sayısı. Ziyaret açılınca `in_review` olur.
2. **Ağaç ağaç inceleme:**
    - Liste yer koduna göre sıralı. Filtreler: incelenmemiş, AI'ın sorunlu dedikleri, düşük güvenliler.
    - Seçili ağaçta bu ziyaretin ve önceki yayımlanmış ziyaretin kesitleri yan yana durur. Yanlarında AI önerisi, önceki uzman sonucu ve ağaç özellikleri.
3. **Karar:**
    - **AI'ı kabul et** (`A` tuşu): AI'ın önerisi uzman kararı olarak kaydedilir; AI'ın kendi kaydı değişmez.
    - **Düzelt:** Uzman sınıfı seçer (`1`–`5`) ve mevsimin ölçeklerini girer.
    - `J`/`K` tuşlarıyla ağaçlar arasında gezilir.
4. **Bulgu ve öneri:** Ağaca ya da parsele bağlı bulgu yazılır: tür, önem, açıklama, öneri, kanıt kesitleri.
5. **Özet ve imza:**
    - Özette sınıf dağılımı, önceki ziyarete göre değişenler, bulgular ve incelenmemiş ağaçlar görünür.
    - **İmzala ve yayımla:** Her aktif ağacın uzman kararı yoksa yayın reddedilir ve eksikler listelenir.

| Adım | Durum |
| --- | --- |
| Kuyruk, inceleme, kabul/düzelt, bulgu, özet, imza ve yayın, kısayollar | ✅ |
| Zorunlu inceleme kuralları, toplu onay ve %5 kalite örneklemi | ✅ |
| Sahibin sorularını cevaplama (`/uzman`, Sorular) | ✅ |
| Kritik bulgu bildirimi | ✅ |

### 3.6 Sahip raporu okur

**Kim:** Sahip ve hissedar · **Araç:** web portalı, `/portal`

1. **Bahçelerim:** Her parselin son denetim tarihi ve sınıf dağılımı.
2. **Parsel karnesi:**
    - Son denetimde kaç ağaç sağlıklı, dikkat, sorunlu, kuru, yok.
    - Önceki denetime göre kaç ağaç kötüleşti, kaç ağaç iyileşti.
    - Önem sırasıyla bulgular, ziyaret geçmişi.
3. **Sağlık haritası:** Ağaçlar sınıf rengiyle; boş yerler ve bulgular işaretli; sınıfa göre filtre.
4. **Ağaç karnesi:**
    - Kod ve özellikler.
    - Son sınıf ve kimin verdiği; "✓ Uzman onaylı" ayrı gösterilir.
    - Ölçüm geçmişi.
    - Ziyaret ziyaret aynı yönden fotoğraflar.
    - Bulgular ve öneriler.
5. **360° gezi:** Haritada bir noktaya dokununca o noktanın panoraması açılır. Oklarla komşu noktalara geçilir; ağaç işaretçisine dokununca ağaç karnesi açılır.
6. **Yazdır / PDF:** Karne tarayıcıdan PDF olarak kaydedilir.

| Adım | Durum |
| --- | --- |
| Bahçelerim, karne, harita, ağaç karnesi, gezi, yazdırma, telefon görünümü | ✅ |
| Genel durum skoru (0–100) ve denetim güveni | ✅ (ağırlıklar metodolojide kesinleşecek) |
| Soru bırakma | ✅ |
| "Rapor hazır" ve kritik bulgu bildirimleri, operasyonda bildirim listesi | ✅ (gerçek SMS için Netgsm hesabı gerekiyor; o zamana kadar mesajlar kaydediliyor) |

## Rol rol özet

| Rol | Bir ziyarette ne yapar | Ekran |
| --- | --- | --- |
| Operasyon | Ziyareti planlar, kartları alır, işleme ve yüklemeyi çalıştırır, kaliteyi izler | `/operasyon`, işleme istasyonu |
| Saha personeli | Tarar, yakın plan çeker, soruları cevaplar; envanterde ofiste gövde üçgenler | Saha uygulaması, `/ofis` |
| Uzman | İnceler, karar verir, bulgu yazar, imzalar | `/uzman` |
| Sahip, hissedar | Okur, inceler, gezer | `/portal` |

## Test ortamı

- **Web:** https://orchados-orchad-os.vercel.app
    - Vercel koruması açık; şimdilik sadece Vercel hesabıyla giriş yapan görebilir.
    - Her PR'ın ayrı bir önizleme adresi var.
- **Veritabanı:** Supabase test projesi (Stockholm).
    - Sentetik "Örnek Bahçe 1": 303 ağaç ve iki örnek ziyaret. 14 Ekim ziyareti yayımlanmış, 18 Ekim ziyareti uzman incelemesinde.
    - Görüntü dosyaları yok; ekranlarda yer tutucu görünür.
- **Kullanıcılar:** Parolaları ayrıca paylaşılır.

  | Kullanıcı | Rol |
  | --- | --- |
  | `ops@orchados.test` | Operasyon |
  | `uzman@orchados.test` | Uzman |
  | `saha@orchados.test` | Saha personeli |
  | `sahip@orchados.test` | Sahip |
  | `hissedar@orchados.test` | Hissedar |

- **Kendi bilgisayarında:** `pnpm db:start && pnpm db:reset && pnpm db:demo && pnpm web:dev`. Örnek kullanıcılar `owner@`, `viewer@`, `field@`, `expert@` ve `ops@example.com`; parola `orchados-dev`.

**Denemek için kısa bir tur:**
1. `uzman@` ile gir → `/uzman` → 18 Ekim ziyaretini aç.
2. Birkaç ağacı kabul et ya da düzelt; bir bulgu ekle. Yayımlamak için 302 ağacın hepsine karar gerekir.
3. `sahip@` ile gir → `/portal` → Örnek Bahçe 1. 14 Ekim karnesi ve harita görünür; 18 Ekim görünmez.
