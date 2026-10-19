# İP6 – Gerçek Kamera ve Fotoğraf Kalite Kontrolü

- **Klasör:** `apps/field/` (sadece burası)
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `apps/field/README.md`, `docs/MVP.md` Modül 3 (yakın plan protokolü ve kalite kapısı), `docs/arayuzler.md`
- **Ortam:** Flutter kurulu değil; GitHub'dan `stable` kur. `flutter build apk` gerekmez.

## Amaç

Yakın plan çekimleri şu an sahte `FieldCamera` ile çalışıyor. Gerçek kamerayı bağla ve fotoğrafı kaydetmeden önce cihazda kalite kontrolü yap. Bulanık ya da karanlık fotoğraf kabul edilmez.

## Yapılacaklar

1. **Gerçek kamera:**
    - `camera` paketiyle `FieldCamera` arayüzünün gerçek uygulaması: önizleme, çekim, arka kamera, flaş kapalı varsayılan, odak ve pozlamanın dokunarak ayarlanması.
    - İzin akışı ve izin reddedildiğinde açık bir yönlendirme.
    - **Galeriden seçim yolu olmayacak**; mevcut kural korunur.
2. **Çekim ekranı:**
    - Ekranda o çekimin "böyle çek" referans görseli için yer ve kısa yönerge.
    - Çekimden sonra küçük bir onay görünümü: "Kullan" ya da "Yeniden çek".
3. **Kalite kontrolü** (saf Dart, `image` paketiyle, küçültülmüş görüntü üzerinde):
    - **Netlik:** Laplacian varyansı.
    - **Karanlık ve aşırı pozlama:** Ortalama parlaklık ve kırpılmış piksel oranı.
    - **Sonuç:** "Kabul", "Uyarı" ya da "Ret", nedeniyle birlikte. Ret durumunda fotoğraf kaydedilmez ve personele sade bir mesaj gösterilir ("Fotoğraf bulanık, telefonu sabit tutup tekrar çekin" gibi).
    - Eşikler tek bir yapılandırma dosyasında olsun. Varsayılan değerleri sentetik görüntülerle ayarla ve README'ye yaz.
    - Hesaplama ana iş parçacığını kilitlememeli (isolate).
4. **Kayıt:**
    - Kabul edilen fotoğrafın SHA-256'sı, çekim zamanı (`GpsClock`'tan; telefon saatine düşüldüyse işaretli), kalite skorları ve kontrolün sürümü `captures` kaydına yazılsın.
    - Gerekirse yerel veritabanı şemasını güncelle; drift kodunu yeniden üret ve commit'le.
5. **Testler:**
    - Birim: Sentetik görüntülerle kalite metrikleri. Net/bulanık, karanlık/normal/aşırı pozlanmış örnekler; testte üretilir, repoya görüntü eklenmez.
    - Arayüz: Sahte kamerayla ret, uyarı ve kabul akışları; yeniden çekim.
6. **README:**
    - Kamera ve kalite kontrolü bölümü.
    - Yerelde telefonda denenecek adımlar: farklı ışıkta çekim, bulanık çekim, izin reddi.

## Kabul ölçütü

- `flutter analyze` temiz, `flutter test` tamamen geçiyor.
- Üretilen dosyalar commit'li; temiz bir klonda `dart run build_runner build` sonrasında `git status` boş.
