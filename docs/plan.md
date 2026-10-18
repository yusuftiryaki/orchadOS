# MVP Geliştirme Planı

18 Ekim 2026 · Yusuf

Hedef, ilk kış denetim raporlarını **8 Mart 2027**'de pilot bahçe sahiplerine teslim etmek (Kapı 2). Bunun için yaklaşık 20 haftada ~55 günlük geliştirme işi gerekiyor. Bu da haftada ~20 saat demek; yan proje için sıkı bir tempo. Plan bu yüzden işleri önceliğe göre sıralar ve geride kalınırsa nelerin kesileceğini baştan söyler.

Ürün tanımı [MVP.md](MVP.md), veri modeli [veri-modeli.md](veri-modeli.md), kit [tarama-kiti.md](tarama-kiti.md) dosyalarında.

## Kilometre taşları

| Tarih | Kilometre taşı | Ne hazır olmalı |
| --- | --- | --- |
| 31 Ekim 2026 | M0 – Geliştirme ortamı | Repo iskeleti, iki devcontainer, şemanın ilk sürümü başlamış |
| 20 Aralık 2026 | M1 – Kapı 1: yöntem kararı | Kit çalışıyor; kendi bahçende tek koridor taraması; PPK, zaman eşleme ve gövde üçgenleme denendi; ağaç eşleştirme doğruluğu ölçüldü |
| 18 Ocak 2027 | M2 – Envantere hazır | Saha uygulamasının envanter modu, işleme hattı, ofis üçgenleme aracı |
| 15 Şubat 2027 | M3 – Kış denetimine hazır | Yakın plan akışı, uzman paneli, pilot envanterleri tamam |
| 8 Mart 2027 | M4 – Kapı 2: ilk raporlar | Sahip portalı; kış raporları uzman imzasıyla teslim |

## Zaman çizelgesi

```mermaid
gantt
    title İlk kış raporları 8 Mart 2027'de teslim
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    section Ortam ve veri
    İP0 Repo ve geliştirme ortamı      :ip0, 2026-10-20, 2026-10-31
    İP1 Veri şeması ve örnek veri      :ip1, 2026-10-27, 2026-11-14
    section Donanım ve deneme
    İP2 Kit siparişi ve teslim süresi  :ip2a, 2026-10-20, 2026-11-15
    İP2 Kit montajı ve GNSS kaydedici  :ip2b, 2026-11-15, 2026-12-05
    İP3 Teknik denemeler               :ip3, 2026-11-20, 2026-12-20
    Kapı 1                             :milestone, k1, 2026-12-20, 0d
    section Yazılım
    İP4 İşleme hattı                   :ip4, 2026-12-01, 2027-01-20
    İP5 Ofis üçgenleme aracı           :ip5, 2026-12-15, 2027-01-20
    İP6 Saha uygulaması                :ip6, 2026-12-01, 2027-02-05
    İP7 Uzman paneli                   :ip7, 2027-01-15, 2027-02-20
    İP8 Sahip portalı                  :ip8, 2027-01-20, 2027-03-05
    section Saha
    Pilot envanterleri                 :env, 2027-01-18, 2027-02-14
    Kış denetimi                       :kis, 2027-02-15, 2027-02-28
    Kapı 2                             :milestone, k2, 2027-03-08, 0d
    section Operasyon
    İP10 Uzman, pilot sahipler, KVKK   :ip10, 2026-10-20, 2027-01-15
    İP11 İşleme istasyonu              :ip11, 2026-12-15, 2027-01-10
```

**Kritik yol:** Kit parçalarının teslim süresi → teknik denemeler → işleme hattı → pilot envanterleri → kış denetimi. Kit siparişi gecikirse her şey kayar; bu yüzden ilk hafta verilmeli.

## İş paketleri

| İP | İş paketi | Öncelik | Tahmini efor | Tamam sayılması için |
| --- | --- | --- | --- | --- |
| İP0 | Repo ve geliştirme ortamı | P0 | 1,5 gün | Repo iskeleti; `core` ve `mobile` devcontainer'ları açılıyor |
| İP1 | Veri şeması ve örnek veri | P0 | 3 gün | Hedef veri modelinin MVP alt kümesi migration olarak yazılı; 300 ağaçlı sentetik bir bahçe örnek verisi; satır bazlı yetki kuralları |
| İP2 | Kit ve GNSS kaydedici | P0 | 5,5 gün | Kit monte; ESP32 ham GNSS'i ve PPS'i microSD'ye kaydediyor; telefona Bluetooth ile durum gönderiyor |
| İP3 | Teknik denemeler | P0 | 5 gün | Tek koridor taraması; PPK çözümü; QR ile zaman eşleme; ~20 ağaçta gövde üçgenleme ve elle ölçümle karşılaştırma; ısınma testi |
| İP4 | İşleme hattı v0.1 | P0 | 8 gün | Alım ve doğrulama, PPK, zaman eşleme, kare seçimi, panorama (4K + 2K), ağaç kesitleri, yükleme; komut satırından çalışıyor |
| İP5 | Ofis üçgenleme aracı | P0 | 6 gün | Harita + iki panorama görünümü; tıklayarak üçgenleme; sıra oturtma, kodlama, boş yerler; doğrulama listesi |
| İP6 | Saha uygulaması v0.1 | P0 | 8 gün | Giriş, günün görevleri, oturum başlat/bitir, QR saat, GNSS durumu, kapsama haritası, sınır köşesi işaretleme, yakın plan akışı, çevrimdışı senkronizasyon |
| İP7 | Uzman paneli v0.1 | P0 | 5 gün | Ziyaret kuyruğu; ağaç başına bu ve önceki ziyaretin kesitleri; ölçek girişi ve onayı; bulgu ve öneri; rapor imzası |
| İP8 | Sahip portalı v0.1 | P0 | 8 gün | Giriş; bahçelerim; parsel karnesi; sağlık haritası; ağaç karnesi; işaretçili panorama gezisi; PDF rapor |
| İP9 | AI worker v0.1 | P1 | 4 gün | Kış etiketlerinden değerlendirme seti; Batch ile ön değerlendirme; uzman paneline öneri olarak düşüyor. İlkbahar denetiminden (15 Nisan) önce |
| İP10 | Operasyon hazırlıkları | P0 | 4 gün + dış süreler | Metodoloji v0 (ölçekler, referans fotoğraflar), KVKK aydınlatma ve rıza metinleri, sözleşme taslağı, uzman anlaşması, pilot sahiplerin onayı |
| İP11 | İşleme istasyonu | P0 | 1 gün | GPU'lu, büyük diskli bir bilgisayar alınmış ya da ayarlanmış; işleme hattı üzerinde çalışıyor |

**Durum (18 Ekim 2026)**

| İP | Durum | Not |
| --- | --- | --- |
| İP0 | Tamam | Repo iskeleti, `core` ve `mobile` devcontainer'ları, bulut ortamı |
| İP1 | Tamam (PR #1) | Şema, satır bazlı yetki, 310 yerli ve 302 aktif ağaçlı sentetik bahçe, 101 pgTAP testi. Açık: yayımlanmamış değerlendirmelerin sahipten gizlenmesi (İP8), depolama alanları ve kuralları (İP4 yükleme) |
| İP2 | Yazılım tamam (PR #2) | 72 birim testi, ESP32 derlemesi. Açık: gerçek donanım testleri (README'deki 12 adım), kit gelince |
| İP4 | Çekirdek tamam (PR #3) | 54 test, uçtan uca sentetik oturum. Açık: veritabanı ve depolamaya yükleme, gerçek PPK denemesi (İP3) |
| Entegrasyon | Açık | İP2 `events.csv` 6 sütun yazıyor, İP4 4 sütun bekliyor; `session.json` alan adları eşleşmeli; QR biçimi (`OQ1:<gps_ms>:<etiket>`) İP6'ya aktarılmalı |

Toplam yaklaşık 55 gün (İP9 hariç).

## Hemen başlaması gereken dış işler

Bunlar takvimi bekletebilecek, başkasına bağlı işler. İlk iki hafta içinde başlatılmalı:

- [ ] Kit parçalarının siparişi (ithalat ve gümrükle 2–4 hafta)
- [ ] 360° kamera üreticisinin SDK başvurusu
- [ ] TUSAGA-Aktif (CORS-TR) abonelik başvurusu, ya da kendi baz istasyonu kararı
- [ ] Uzman (ziraat mühendisi) ile ön görüşme
- [ ] 1–4 pilot bahçe sahibinin sözlü onayı; envanter tarihleri
- [ ] KVKK metinleri için hukukçu görüşü
- [ ] İşleme istasyonu: satın alma mı, mevcut bir bilgisayar mı?

## Geride kalınırsa kesilecekler

Sıra, ilk kesilecekten sona doğru:

1. **Portalda PDF rapor:** Kış raporu portaldan gösterilir, PDF ilkbahara kalır (~1 gün).
2. **Gezide ağaç işaretçileri:** Panoramalar işaretçisiz gezilir, ağaç karnesine haritadan gidilir (~2 gün).
3. **Telefon doğrulamasıyla giriş:** Pilot sahiplere kişiye özel link gönderilir (~1 gün).
4. **Saha uygulamasında kapsama haritası:** Kapsama ofiste işleme sonrası kontrol edilir (~1,5 gün).
5. **Uzman panelinde rahatlık özellikleri:** Toplu onay ve kısayollar sonraya kalır; dört bahçede ~1.200 ağaç elle incelenebilir (~1 gün).

Bunlar yetmezse Kapı 2, ilkbahar denetiminin sonuna (Mayıs 2027) kaydırılır. Kış ziyareti yine yapılır ve veri toplanır; rapor sahiplere ilkbaharla birlikte gider.

## Çalışma düzeni

- **Her iş paketi kendi dalında** geliştirilir ve tamamlanınca `main`'e birleştirilir.
- **Testler:** Her bileşen gerçek donanım olmadan, kısa örnek kayıtlarla ve sentetik veriyle test edilebilir olmalı. İlk örnek kayıtlar İP3'te üretilir ve küçültülmüş halleri repoda değil, ayrı bir depolama alanında tutulur.
- **Haftalık gözden geçirme:** Plan her hafta bu dosyada güncellenir: hangi İP nerede, kesme listesinden bir şey gerekiyor mu?
