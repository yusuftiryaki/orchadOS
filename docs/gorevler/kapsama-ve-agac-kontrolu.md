# İşleme Hattı: Kapsama Raporu, Yeniden Tarama Görevi ve Ağaç Var/Yok Kontrolü

- **Klasör:** `services/pipeline/`. Ayrıca:
    - Şema gerekirse: `supabase/migrations/20261025120xxx_*.sql`, `supabase/tests/28_*.test.sql`, ardından `pnpm web:typegen`. Seed'e dokunma.
    - `supabase/testing/purge.sql`: yeni tablolar `parcel_id`/`session_id` taşımıyorsa.
    - `docs/arayuzler.md`, `docs/metodoloji.md` (bölüm 10, kalite kapıları), `docs/mvp-denetimi.md` (ilgili satırların durumu).
    - Web'de sadece gerekirse ve küçük: Uzman panelinde ve envanter onayında kapsama raporunun gösterilmesi. `apps/web/src/lib/expert/**`, `src/components/expert/**`, `src/app/uzman/**`.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md`: Modül 2 (kabul kriteri) ve Modül 3 (kalite kapısı)
    - `docs/metodoloji.md` bölüm 5 ve 10
    - `docs/mvp-denetimi.md`: satır 62, 81, 93
    - `services/pipeline/README.md`
    - `docs/arayuzler.md`: "Asset `pose` alanı", "Ağaç konumları", "Yakın plan listesi ve uzman istekleri"
    - `supabase/migrations/` (özellikle `..._inventory_approval`, `..._followup_requests` ya da benzeri, `..._parcel_route`)
- Her madde bitince commit'le ve dalı gönder; PR en sonda.

## Amaç

İşleme hattı panoramaları ve kesitleri üretiyor, ama iki kalite kontrolü yapmıyor:
1. **Kapsama:** Bu taramada her aktif ağaç yeterince görüldü mü?
2. **Ağaç var/yok:** Envanterde olan ağaç hâlâ yerinde mi? Boş yere yeni bir ağaç dikilmiş mi?

## Yapılacaklar

1. **Kapsama raporu** (yeni bir aşama ya da `run`'ın parçası):
    - **Ağaç başına:** Kaç yönden kesit var (N, E, S, W); en yakın panoramaya uzaklık; kesitlerin en iyi kalite skoru.
    - **Kural** (`docs/metodoloji.md` bölüm 10): Her aktif ağacın en az iki yönden kesiti olmalı.
        - Parsel eşiği: aktif ağaçların %95'i.
        - Eşik ve "yeterli kesit" tanımı parametre dosyasında olsun; parametre hash'ine girsin.
    - **Kör noktalar:** Kapsanmayan ağaçların haritadaki kümeleri (10×10 m hücreler; aynı hücre kuralı `docs/arayuzler.md`'de).
    - **Çıktı:**
        - `coverage.json`: ağaç başına ayrıntı, parsel özeti, hücreler.
        - Yükleme sırasında veritabanına bir özet: oran, eşik, sonuç, eksik ağaç sayısı. Tabloyu ya da alanı sen belirle (ör. `session` üzerinde bir JSON alan ya da yeni bir tablo); kararı `docs/veri-modeli.md`'ye yaz.
2. **Yeniden tarama görevi:**
    - Kapsama eşiğin altındaysa, ya da kör nokta varsa: Mevcut uzman isteği mekanizmasıyla (`followup_request`, tür "ek ziyaret") otomatik bir istek açılır. Kaynağı "işleme hattı" olarak işaretlenir; eksik ağaçlar ya da hücreler listelenir.
    - Aynı ziyaret için tekrar çalıştırılınca ikinci istek açılmaz.
    - Operasyon bunu panoda uzman istekleri arasında görür. Mevcut ekranda kaynak ayrımı gerekiyorsa küçük bir ekleme yap.
3. **Ağaç var/yok kontrolü** (MVP Modül 4, adım 5):
    - Envanterdeki her aktif ağaç için: Kesitlerde ağaç görülüyor mu?
    - **İlk sürüm basit bir görüntü sinyaliyle yapılsın**, ör. kesit merkezinde gövde/taç bölgesindeki bitki örtüsü oranı (yeşillik/doku). Ya da iki yönden kesitlerin tutarlılığı. Yöntemi ve sınırlarını yaz.
    - Model yok; gövde tespit modeli ileride (`trunk_label` etiketleri) bunun yerini alacak. Yöntem sürümlü olsun (`method`, `method_version`).
    - Kışın yapraksız ağaçta yeşillik sinyali çalışmaz. Mevsime göre yöntem seç ya da kışın "belirsiz" de. Yanlış "yok" demek, "belirsiz" demekten kötüdür.
    - **Sonuç:** Ağaç başına `algorithm` kaynaklı bir ölçüm. Metrik `tree_visible`: evet / hayır / belirsiz. Metrik kaydında yoksa migration'la ekle; `docs/metodoloji.md` Ek B'ye yaz.
    - Kapanan sonuçlar ("görünmüyor") zorunlu inceleme kuralına girsin; kuralı ekle. Uzman sonucu görür ve "Yok" sınıfını yalnız uzman verir (metodoloji bölüm 5).
    - **Boş yerler:** Envanterde boş olan bir yerde ağaç sinyali varsa "yeni dikim olabilir" diye işaretle. Uzmana bir öneri olarak düşsün.
4. **Envanter onayı:** `approve_inventory`, envanter ziyaretinin kapsama raporu eşiğin altındaysa uyarı versin ya da reddetsin; kararını yaz. Rapor yoksa (eski veri) davranış değişmesin.
5. **Sentetik veri ve testler:**
    - `synth` ile bazı ağaçları eksik (kesilmiş), bazı boş yerleri dolu üreten bir seçenek. Bir koridoru atlayan sentetik tarama, kapsama açığı için.
    - **Birim:** Kapsama hesabı, eşik, kör nokta hücreleri, var/yok sinyali; hem sentetik net görüntüler hem belirsiz durumlar.
    - **Entegrasyon (yerel Supabase):**
        - Atlanmış koridorlu bir tarama → kapsama eşiğin altında → ek ziyaret isteği açılıyor; tekrar çalıştırmada ikinci istek yok.
        - Eksik ağaç → `tree_visible = hayır` ölçümü → zorunlu inceleme.
    - **Zincir testi:** Mevcut uçtan uca zincir testine kapsama sonucunun da yazıldığını ekle.
6. **README** ve `docs/mvp-denetimi.md`: ilgili satırların durumu.

## Kabul ölçütü

- `uv run ruff check`, `uv run ruff format --check` ve `uv run pytest` geçiyor; Supabase testleri atlanmıyor.
- `pnpm db:test` geçiyor; migration eklendiyse `database.types.ts` güncel.
- Web'e dokunulduysa `pnpm web:lint`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
