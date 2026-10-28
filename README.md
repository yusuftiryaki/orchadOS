# orchadOS

Gaziantep'teki Antep fıstığı bahçe sahipleri için bağımsız, kanıta dayalı bahçe denetim hizmeti. Kendi saha personelimiz bahçeyi periyodik olarak 360° kamera ve GPS ile tarar; AI ön değerlendirmeyi yapar, uzman onaylar. Sahip; parsel karnesini, sağlık haritasını, bahçe gezisini ve ağaç karnesini web portalında görür.

## Repo yapısı

| Klasör | İçerik |
| --- | --- |
| `apps/web` | Next.js: sahip portalı, uzman paneli, ofis üçgenleme aracı |
| `apps/field` | Flutter saha uygulaması |
| `services/pipeline` | Python işleme hattı |
| `services/ai-worker` | AI ön değerlendirme |
| `supabase` | Veritabanı şeması ve migration'lar |
| `firmware/gnss-logger` | ESP32 GNSS kaydedici |
| `docs` | Tüm dokümanlar |

## Dokümanlar

- [MVP geliştirme planı](docs/plan.md): İş paketleri, kilometre taşları (ilk kış raporları 8 Mart 2027), geride kalınırsa kesilecekler.
- [Geliştirme ortamı](docs/gelistirme-ortami.md): `core` ve `mobile` devcontainer'ları, yerel Supabase, ESP32 ve telefon bağlantısı.
- [MVP dokümanı](docs/MVP.md): Ürün tanımı, kapsam, modüller (kayıt, envanter, periyodik tarama, değerlendirme, portal), veri modeli, yol haritası.
- [Teknik mimari ve maliyet fizibilitesi](docs/teknik-mimari.md): Ölçeklenebilir mimari, veri hacmi, depolama, veritabanı, işlem gücü, LLM maliyeti, KVKK.
- [Hedef veri modeli](docs/veri-modeli.md): Sensörden bağımsız model; konu, toplama, ürün ve bulgu katmanları, metrik kaydı, MVP'den geçiş.
- [Tarama kiti](docs/tarama-kiti.md): RTK + 360° kamera + LiDAR + Raspberry Pi 5 kitinin bileşenleri, montajı, zaman senkronizasyonu, sahadan merkeze iş akışı ve maliyeti.
- [Müşteri edinme ve yönetimi (İP12)](docs/musteri-yonetimi.md): Tanıtım sitesi, self-servis kayıt, başvuru → teklif → ödeme (iyzico, havale), müşteri portalı ve back office tasarımı.
- [Demo turu (İP13)](docs/demo-turu.md): Hesap açmadan ve ödeme yapmadan sahip portalını sentetik bir demo bahçesinde deneme: 360° gezi, karneler, raporlar, rehberli tur.
- [Bahçe ekleme ve çıkarma (İP14)](docs/bahce-yonetimi.md): Çok bahçeli üyelik; dönem içinde orantılı ek teklifle bahçe ekleme, iade hesabıyla bahçe çıkarma, ortak yenileme.
- [Uzun vadeli vizyon](docs/vizyon.md): Robotik saha operasyonu, ML değerlendirme, detaylı ağaç ölçümleri, birleşik tarama kiti (RTK + 360° + LiDAR), çok üreticili robot filosu.
