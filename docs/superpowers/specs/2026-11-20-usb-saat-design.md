# Kitin saati PPS'siz: alıcının USB zamanı (kısa tasarım)

Tarih: 20 Kasım 2026. Durum: onaylandı (sahip, 20 Kasım 2026).

## Neden

Radiolink RTK F9P'de zaman darbesi (PPS) hiçbir fişe çıkmıyor; yalnız kartın yeşil GPS LED'ini sürüyor (masada bulundu, 20 Kasım). PPS'i almak için kutu açılıp tel lehimlenmesi gerekiyor. Sahip bunu ve PPS'i fişte veren başka bir kart almayı istemiyor (20 Kasım 2026). Bugünkü tasarımda PPS'siz saat "kaba" sayılıyor: ön kontrolün saat maddesi her taramada geçmiyor, personel onu her seferinde elle atlıyor, kayıt adımı da LiDAR'ı en iyi `review` ile bitiriyor.

**Amaç:** Saat, alıcının USB'den gelen zamanından, sabit gecikmesi düşülerek ayarlanır ve bu durum geçerli bir saat kilidi sayılır. Ön kontrol takılmaz, olaylar ve QR GPS zamanı taşır, kayıt adımı saat yüzünden `review` vermez.

**Hedef değil:** LiDAR ile GNSS arasındaki zaman farkını kayıttan kestirmek (yol B, aşağıda). PPS'in kendisi kalkmaz: tel sonradan takılırsa chrony onu kendiliğinden tercih eder.

**Olmaması gereken:** Doğrulanmamış bir saatin "kilitli" görünmesi. USB zamanı yoksa ya da chrony ona oturmamışsa saat bugünkü gibi kilitsizdir.

## Ölçüm (20 Kasım 2026, geliştirme bilgisayarı, gerçek alıcı)

- NAV-PVT, çözümün zamanından ortalama **~55 ms** sonra USB'den varıyor (51–63 ms; referans bilgisayarın NTP'li saati, chrony'nin RMS hatası 0,08 ms).
- Sabit gecikme düşülünce kalan oynama ±2 ms (std); tam saniye çözümleri (aynı anda RAWX gönderilen) ~7 ms daha geç.
- Etkisi: ±5 ms'lik bir hata yürüyüşte (1 m/s) 5 mm, ATV'de (3 m/s) 1,5 cm kayma.
- L2'nin noktaları zaten Pi'a varış anıyla damgalanıyor (PTP ve PPS girişi yok); bu gecikme PPS'le de bilinmiyordu.

## Yollar

- **A. Canlı düzeltme (seçildi):** chrony alıcının USB zamanını sabit gecikme düşülmüş olarak birincil kaynak alır. Küçük; doğruluk ~±5 ms.
- **B. Sonradan kestirme:** kayıt adımı LiDAR hareketiyle GNSS yörüngesini karşılaştırıp her taramanın zaman farkını bulur. Uçtan uca doğru, ama büyük iş; kamera ve olayları düzeltmez.
- **C. İkisi birden.**

Sahip A'yı seçti: yeterli, gereksiz geliştirme yapılmaz; PPS belki sonra eklenir (20 Kasım 2026).

## Tasarım

1. **chrony** (`setup/chrony-orchados.conf`): `GNSS` SOCK kaynağından `noselect` kalkar, `offset 0.055` eklenir (USB gecikmesi; işaret: alıcı zamanı varıştan önce). PPS satırı aynen kalır (`prefer`, `lock GNSS`): tel takılı değilse kenar gelmez, chrony GNSS'i seçer; takılırsa PPS'i.
2. **Örnekler:** Kayıt servisi tam saniye çözümlerinin (`iTOW % 1000 == 0`) örneğini chrony'ye göndermez; o çözümler RAWX yüzünden ~7 ms daha geç geliyor (Claude'un kararı).
3. **Saat durumu:** `coarse` değeri `usb` olur (kod 1 aynı): chrony GNSS'i seçmiş, eşzamanlı ve tahmini hatası ≤ 5 ms. GNSS seçili ama hata büyükse saat `unlocked`'tır. `pps` (kod 2) aynen. Gerçek bir Pi oturumu henüz kaydedilmediği için `coarse`'u okuyan eski veri yok; değer yeniden adlandırılır (Claude'un kararı).
4. **Kilit = `pps` ya da `usb`.** Bugün `pps`'e bağlı her şey kilide bağlanır:
    - ön kontrolün `clock` maddesi geçer;
    - `clock_unlocked` uyarısı kalkar;
    - durum mesajında `flags` bit3 "saat kilitli" olur ve `gps_time_ns` dolu gelir, böylece telefon QR'ı GPS zamanıyla gösterir;
    - `events.csv`'de `gps_time_ns` yazılır;
    - `pps_lost` / `pps_regained` kilidin kaybı ve dönüşüdür; adlar sözleşmede kalır.
    - Çapa sütunları yalnız PPS'te dolar; `usb`'de boş kalır. Hat ikisi de boşken `gps_time_ns`'i olduğu gibi okur.
5. **Kayıt adımı:** `clock_state_at_start` `pps` ya da `usb` ise `clock_unlocked` nedeni yazılmaz.
6. **Saha uygulaması:** `KitClock.coarse` → `usb`, sağlık "Tamam", metin "USB (PPS yok)".
7. **Gecikmenin ölçümü:** `gnss-check`, sistem saati NTP'yle eşzamanlıysa NAV-PVT'nin varış gecikmesini de basar (ortanca, aralık) ve chrony'deki `offset` ile karşılaştırır. Pi masada internetliyken bir kez çalıştırılır; değer 55 ms'den belirgin farklıysa (> 5 ms) chrony ayarı güncellenir.
8. **Belgeler:** `docs/arayuzler.md` (saat durumu, bit3, `gps_time_ns`, ön kontrolün `clock` tanımı, `clock_unlocked` kuralı, `pps_lost` anlamı); kit kaydedicisi README'si (saat bölümü, PPS isteğe bağlı); `docs/kit-siparis-listesi.md` ve `docs/tarama-kiti.md` (PPS teli artık şart değil; 7.9 isteğe bağlı); Pi kayıt yazılımı tasarımına bir not.

## Kurucuya kalanlar

- Eşik değerleri (5 ms) ve chrony'nin `poll`, `filter`, `precision` seçenekleri; ilk Pi denemesinde `chronyc sources -v` ve `tracking` ile doğrulanır.
- `chronyc tracking`'in tahmini hatası olarak hangi alanların toplanacağı (sistem ofseti, kök gecikmesinin yarısı ve kök dağılımı).
