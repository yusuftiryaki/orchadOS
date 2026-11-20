# Saha Uygulaması: Sabit Grid Rotası

- **Klasör:** `apps/field/`. Ayrıca:
    - `docs/arayuzler.md`: rota biçimi için.
    - Şema gerekirse: `supabase/migrations/20261023160xxx_*.sql`, `supabase/tests/25_*.test.sql`, ardından `pnpm web:typegen`.
    - Seed'e dokunma.
- **Aynı anda çalışan oturumlar:** `firmware/` ve `services/pipeline/`, `apps/web/`, `services/ai-worker/`. Bunlara dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `apps/field/README.md`
    - `docs/MVP.md` Modül 3 (tarama protokolü: rota ve hareket)
    - `docs/arayuzler.md`: "Sınır köşeleri ve kapsama", "Ağaç konumları"
    - `docs/veri-modeli.md`
- **Ortam:** Flutter 3.47.7 (GitHub'dan). Her madde bitince commit'le ve dalı gönder; PR en sonda.

## Amaç

MVP'ye göre her parselin sabit bir grid rotası vardır:
- Önce sıra boyunca bütün koridorlar, sonra dik koridorlar, en son kenarlar.
- Karşılaştırılabilirlik için rota parsel başına sabittir.

Saha uygulaması şu an kapsamayı gösteriyor ama rota önermiyor. Bu görev rotayı üretir, ekranda gösterir ve personeli yönlendirir.

## Yapılacaklar

1. **Rota üretimi** (saf Dart, birim testli):
    - **Girdi:** Parselin son sınırı, yer konumları (envanter varsa), sıra yönü (`parcel.row_azimuth_deg`) ve başlangıç köşesi.
    - **Çıktı:** Sıralı bir koridor listesi. Her koridor bir çizgidir: başlangıç, bitiş, türü (sıra boyu / dik / kenar).
    - **Envanter sonrası:** Koridorlar sıraların arasından geçer. Sıra aralığı yer konumlarından bulunur.
    - **Envanter öncesi** (ilk tarama): Sıra yönü ve tahmini aralık, sınırdan ve parsel kaydından gelir. Yoksa personel ekranda sıra yönünü iki dokunuşla belirler.
    - Gidiş-dönüş (serpantin) sırası; ATV, araba ve robotla dönüşleri azaltır.
    - **Sabitlik:** Aynı girdiyle hep aynı rota çıkar. Parsel için ilk kullanılan rota bir sürüm olarak saklanır (bkz. madde 3); sonraki ziyaretler aynı rotayı kullanır.
2. **Ekranda:**
    - Kapsama haritasının üstünde rota: sıradaki koridor vurgulu, biten koridorlar soluk.
    - Kalan koridor sayısı ve tahmini süre.
    - Personel koridordan çok saparsa uyarı. Sıradaki koridorun başlangıcına yön ve uzaklık.
    - Koridoru atlama ve geri dönme mümkün. Atlanan koridorlar ziyaret özetinde listelenir.
    - **"Dur-çek-yürü" modu** (taşlı bölümler için): Her 4 m'de bip sesi. Açılıp kapatılabilir.
3. **Saklama:**
    - Parselin rotası sunucuda saklanır, böylece farklı telefonlardan aynı rota gelir.
    - Nereye: parsele bağlı, sürümlü bir kayıt. Yeni tablo ya da mevcut bir alan; kararı ve gerekçesini yaz.
    - Biçimi `docs/arayuzler.md`'ye ekle.
    - Ziyarette hangi rota sürümünün kullanıldığı oturum olayına yazılır.
4. **Testler:**
    - Birim:
        - Dikdörtgen ve döndürülmüş parsellerde rota
        - Eksik ağaçlı ve ara ağaçlı sıralar
        - Envanter öncesi rota
        - Sabitlik: aynı girdiyle aynı çıktı
        - Sapma ve sıradaki koridorun hesabı
    - Arayüz: Rota görünümü, koridor atlama, dur-çek-yürü göstergesi.
5. **README:** Rota bölümü, telefonda deneme adımları.

## Kabul ölçütü

- `flutter analyze` temiz; `flutter test` geçiyor.
- CI'da APK derlemesi geçiyor.
- Üretilen dosyalar commit'li.
- Migration eklendiyse `pnpm db:test` geçiyor ve `database.types.ts` güncel.
