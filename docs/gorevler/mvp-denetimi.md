# MVP Boşluk Denetimi ve Eksiklerin Tamamlanması

- **Klasör:**
    - `apps/web/` (`tests/local-db.ts` hariç; onu başka bir oturum değiştiriyor)
    - Gerekirse şema: `supabase/migrations/20261024120xxx_*.sql`, `supabase/tests/26_*.test.sql`, ardından `pnpm web:typegen`. Seed'e dokunma.
    - `docs/mvp-denetimi.md` (yeni)
    - `docs/kullanim-kilavuzu.md`: sadece durum işaretleri
- **Aynı anda çalışan oturum:** `services/pipeline/`, `supabase/` içinde bir test temizlik fonksiyonu ve `apps/web/tests/local-db.ts`. Bunlara dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md`: tamamı
    - `docs/metodoloji.md`
    - `docs/kullanim-kilavuzu.md`
    - `apps/web/README.md`
    - `apps/field/README.md`
    - `services/pipeline/README.md`
    - `services/ai-worker/README.md`
- Her madde bitince commit'le ve dalı gönder; PR en sonda.

## Amaç

Plandaki bütün iş paketlerinin ilk sürümü yazıldı. `docs/MVP.md`'deki her özelliğin kodda gerçekten karşılığı var mı? Bu görev bunu madde madde denetler ve **donanım gerektirmeyen** eksikleri tamamlar.

## Yapılacaklar

1. **Denetim tablosu** (`docs/mvp-denetimi.md`):
    - `docs/MVP.md`'nin her modülündeki her özellik için bir satır: özellik, nerede yazılı (dosya ya da ekran), durum (var / kısmen / yok), not.
    - "Var" demek için kodu ve testini gör; README'ye güvenme.
    - Donanım gerektirenler (gerçek kamera, GNSS) ayrı işaretlenir.
2. **Bilinen şüpheli maddeler.** Önce bunlara bak:
    - **Parsel karnesi:** 10×10 m hücre ısı haritası, mekânsal desen
    - **Karne boyutları:** Envanter (kaybolan/yeni ağaçlar), bahçe yapısı (dişi/erkek oranı, aşısız, yaş dağılımı), bakım uyumu, zararlı belirtileri, meyve yükü
    - **Sağlık haritası:** "Bu ziyarette değişenler" filtresi, ziyaret seçici, kapsama izi katmanı
    - **360° gezi:** Zamanda gezinme (aynı noktanın farklı ziyaretlerde görülmesi), mini harita ve bakış yönü
    - **Ağaç karnesi:** Sınıf zaman çizelgesi; kanıt bilgisi (tarih, saat, konum, çeken personel, hash doğrulaması); yakın planlar
    - **Ziyaret raporu:** Kapsama haritası
    - **Uzman:** "Ek ziyaret iste". Bir ağacı sonraki ziyaretin yakın plan listesine ya da bir doğrulama görevine ekleme
    - **Yakın plan listesi:** Önceki ziyaretin dikkat/sorunlu/kuru ağaçları, %10 tabakalı örneklem, "Sorun gördüm". Bu listenin sunucuda üretilip saha uygulamasına indiği yer
    - **Hissedar:** Sahibin hissedarı izleyici olarak eklemesi
    - **Parsel yaşam döngüsü:** "aktif izleme" ve "pasif" geçişleri
3. **Eksikleri tamamla:**
    - Donanım gerektirmeyen her "yok" ya da "kısmen" maddeyi yaz. Kesme listesindeki maddeler (`docs/plan.md`) de dahil.
    - Bir madde çok büyükse ya da başka bir bileşen gerektiriyorsa (ör. saha uygulaması), denetim tablosunda gerekçesiyle "sonraki iş" diye işaretle.
    - Yakın plan listesi ve ek ziyaret, saha uygulamasının okuyacağı bir sözleşme gerektirebilir. Gerekirse `docs/arayuzler.md`'ye ekle; saha uygulamasına dokunma.
4. **Testler:** Her eklenen özellik için birim test ve gerektiğinde entegrasyon ya da tarayıcı testi.
5. **Kılavuz:** `docs/kullanim-kilavuzu.md` durum işaretlerini güncelle.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
- `docs/mvp-denetimi.md`'de MVP'nin her maddesi var. "Yok" kalan maddelerin hepsinin gerekçesi yazılı.
