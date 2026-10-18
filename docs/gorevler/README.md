# Bulut Ajanları İçin Görev Tanımları

Bu klasördeki her dosya, bir Claude Code bulut oturumuna verilen bir iş paketinin tanımıdır. Oturum, kendisine verilen dosyayı ve aşağıdaki ortak kuralları uygular.

## Ortak kurallar

1. **Önce oku:** `CLAUDE.md`, `docs/plan.md`, görev dosyası ve görev dosyasının işaret ettiği dokümanlar.
2. **Dal:** `main`'den görev dosyasında yazan adla yeni bir dal aç. Sadece bu dalda çalış.
3. **Sadece kendi klasörün:** Görev dosyasında belirtilen klasörün dışındaki dosyalara dokunma. Özellikle `CLAUDE.md`, `docs/plan.md`, kökteki `package.json` ve diğer bileşenlerin klasörleri değişmez; bunları birleştirme sırasında koordinatör günceller. Bu dosyalarda değişiklik gerektiğini düşünüyorsan PR açıklamasına yaz.
4. **Dil:** Kod, tanımlayıcılar, kod yorumları ve commit mesajları İngilizce. Bileşen klasöründeki `README.md` Türkçe.
5. **Commit mesajları** şu satırla biter:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
6. **Gerçek saha verisi yok:** Testler sentetik veriyle ya da test sırasında üretilen küçük örneklerle çalışır. Repoya 1 MB'tan büyük test dosyası eklenmez.
7. **Eksik araçlar:** Ortamda bir araç yoksa kur: `apt-get install` (ffmpeg, rtklib, gdal-bin vb.) ya da `uv tool install platformio`. Kurduğun her şeyi PR açıklamasına yaz.
8. **Soru sorma, karar ver:** Belirsiz noktalarda makul bir karar ver ve PR açıklamasında gerekçesiyle listele.
9. **Bitiş:** Testler geçince dalı GitHub'a gönder ve `main`'e karşı bir PR aç. `gh pr` komutları vekil sunucu tarafından engelleniyor; REST API'yi kullan:
   ```bash
   gh api repos/yusuftiryaki/orchadOS/pulls -f title="..." -f head="<dal>" -f base=main -f body="..."
   ```
10. **PR açıklaması koordinatöre rapordur** ve şunları içerir:
    - Ne yapıldı (kısa)
    - Önemli kararlar ve gerekçeleri
    - Test komutu ve çıktının özeti (kaç test, hepsi geçti mi)
    - Bilinen eksikler, emin olunmayan noktalar, sonraki adımlar
    - Kurulan araçlar
    - Son satır: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
