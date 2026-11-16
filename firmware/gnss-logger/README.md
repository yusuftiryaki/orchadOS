# firmware/gnss-logger

> **Not (16 Kasım 2026):** LiDAR'lı kitte kayıt Raspberry Pi'daki kayıt servisiyle (`services/kit-recorder/`) yapılıyor; ESP32 kitten çıktı. Pi aynı BLE protokolünü konuşur ve aynı dosyaları yazar; eklentileri [docs/arayuzler.md → Kit kaydedicisi](../../docs/arayuzler.md#kit-kaydedicisi-raspberry-pi)'nde. Bu firmware ve bu README protokolün ve dosya biçimlerinin kaynağı olarak repoda kalır.

ESP32 GNSS kaydedici (PlatformIO, Arduino framework). LiDAR'sız tarama kitinde Raspberry Pi'ın yerini alır: RTK alıcısının (u-blox ZED-F9P) ham verisini (UBX) ve PPS zamanını microSD karta yazar, olayları (oturum başlangıcı/bitişi, sınır köşesi, QR saat işareti) kaydeder ve personelin telefonuna Bluetooth Low Energy (BLE) ile durum gönderir. Konumlar sonradan PPK ile santimetreye düzeltilir.

İş paketi: İP2. Bkz. [docs/tarama-kiti.md](../../docs/tarama-kiti.md), [docs/MVP.md](../../docs/MVP.md) Modül 2 ve 3.

## Klasör yapısı

| Yol | İçerik |
| --- | --- |
| `include/pins.h` | Tüm pin atamaları ve batarya gerilim bölücü değerleri |
| `include/app_config.h` | Baud, ölçüm hızı, tampon boyutları, flush aralığı, watchdog süresi |
| `lib/gnss_core/` | Donanımdan bağımsız mantık: UBX ayrıştırma, NAV-PVT, CFG-VALSET, alıcı yapılandırması, PPS–GPS zaman eşleme, çift tampon, halka tampon, `events.csv`/`session.json` biçimi, oturum kaydedici, BLE protokolü |
| `lib/gnss_core/src/hal.h` | İnce HAL arayüzleri (saat, seri port, depolama) |
| `src/hal/` | ESP32 uygulamaları: UART, SD kart, BLE (NimBLE) |
| `src/main.cpp` | Görevler, PPS kesmesi, watchdog, LED |
| `test/` | `native` ortamında Unity birim testleri (sahte HAL ile) |

## Bağlantı tablosu

Kart: ESP32-WROOM-32 geliştirme kartı (`esp32dev`). Tüm sinyaller 3,3 V.

| ESP32 pini | Bağlandığı yer | Not |
| --- | --- | --- |
| GPIO16 (RX2) | ZED-F9P UART1 TXD | ESP32 `Serial2` |
| GPIO17 (TX2) | ZED-F9P UART1 RXD | |
| GPIO4 | ZED-F9P TIMEPULSE (PPS) | Yükselen kenarda kesme |
| GPIO18 | microSD SCK | VSPI |
| GPIO19 | microSD MISO | |
| GPIO23 | microSD MOSI | |
| GPIO5 | microSD CS | |
| GPIO34 | Batarya gerilim bölücü orta noktası | ADC1; 220 kΩ (batarya +) / 33 kΩ (GND). 18 V akünün tam dolu ~21 V'u pinde ~2,7 V eder |
| GPIO2 | Durum LED'i (+ seri direnç) | Çoğu geliştirme kartında kart üstü LED |
| GND | ZED-F9P GND, SD GND, bölücü GND | Ortak toprak şart |

Alıcı tarafında ESP32'ye ZED-F9P'nin **UART1** portu bağlanır (UBX giriş/çıkışı olan ana port). Alıcının UART2'si kullanılacaksa `platformio.ini` içinde `-D GNSS_RECEIVER_UART=2` verilir; yapılandırma anahtarları buna göre seçilir.

## Komutlar

```bash
cd firmware/gnss-logger
pio run -e esp32dev                    # derleme
pio run -e esp32dev -t upload          # flaşlama (USB ile bağlı kart)
pio device monitor -e esp32dev         # seri konsol, 115200 baud
pio test -e native                     # birim testleri (donanımsız)
```

RAWX hızını 5 Hz yapmak için `platformio.ini` içinde `-D GNSS_RAW_RATE_HZ=5`.

## Çalışma şekli

**Açılışta alıcı yapılandırması.** Firmware UBX-CFG-VALSET ile, sadece RAM katmanına (her açılışta yeniden) şunları yazar:

| Anahtar | Değer |
| --- | --- |
| `CFG-UARTxINPROT-UBX`, `CFG-UARTxOUTPROT-UBX` | 1 |
| `CFG-UARTxOUTPROT-NMEA` | 0 (NMEA kapalı) |
| `CFG-RATE-MEAS` / `CFG-RATE-NAV` | 200 ms / 1 (5 Hz) |
| `CFG-MSGOUT-UBX_RXM_RAWX_UARTx` | 5 (1 Hz) ya da 1 (5 Hz) |
| `CFG-MSGOUT-UBX_RXM_SFRBX_UARTx` | 1 (her alt çerçeve; efemeris için hepsi gerekir) |
| `CFG-MSGOUT-UBX_NAV_PVT_UARTx` | 1 (5 Hz) |
| `CFG-TP-TIMEGRID_TP1` | 1 (PPS GPS saniyesine hizalı) |

Baud keşfi: önce hedef baud (460800) denenir; alıcı ESP32 yeniden başlasa da enerjili kaldığı sürece RAM ayarını korur. Yanıt yoksa 38400 (fabrika), 9600, 115200, 230400'de `CFG-UARTx-BAUDRATE=460800` gönderilir, ESP32 460800'e geçer ve yapılandırma tekrar gönderilir. ACK gelirse tamam; NAK ya da üç turda yanıt yoksa durum karakteristiğinde `rx_config` hata olur ve LED hızlı yanıp söner.

**Kayıt.** UART görevi alıcıdan gelen baytları olduğu gibi çift tampona (2 × 16 KB) koyar; aynı akıştan NAV-PVT'yi ayrıştırır. Kayıt görevi dolan ya da 500 ms'yi geçen tamponu karta yazar ve her yazmadan sonra `flush` eder. Güç kesilirse en fazla ~1 saniyelik veri kaybolur. Her iki tampon da doluysa (kart takıldıysa) gelen baytlar atılır ve `dropped_bytes` sayacına eklenir. UART sürücüsünün kendi tamponu 16 KB'tır.

**Zaman.** PPS kesmesi her yükselen kenarda `esp_timer_get_time()` (64 bit mikrosaniye, taşmaz) değerini yakalar. Tam saniyeye düşen (iTOW % 1000 = 0) ve zamanı çözülmüş NAV-PVT, kenardan sonraki 950 ms içinde gelirse o kenarla eşlenir: **çapa** = (kenarın `esp_micros`'u, o saniyenin GPS zamanı). Sonraki kenarlar tam saniye aralığında (±50 ms) geldikçe çapa NAV-PVT onayı olmadan en fazla 10 saniye ileri taşınır. Bir olayın GPS zamanı `çapa_gps + (olay_micros − çapa_micros) × 1000` ns'dir; PPS kilitli değilse ya da olay çapadan 2 saniyeden uzaksa boş bırakılır. 1,5 saniye kenar gelmezse `pps_lost`, geri gelince `pps_regained` olayı yazılır.

GPS haftası NAV-PVT'nin UTC tarihinden ve sabit artık saniye değerinden (GPS − UTC = 18 s) bulunur, sonra iTOW ile uzlaştırılır; böylece hafta sınırında kayma olmaz. Yeni bir artık saniye ilan edilirse `nav_pvt.h` içindeki `kGpsUtcLeapSeconds` güncellenmelidir (yalnızca `session.json`'daki UTC metnini etkiler, `gps_time_ns` iTOW'a dayanır).

**Sağlamlık.**
- Görev watchdog'u (15 s) UART ve kayıt görevlerini izler; takılırsa kart yeniden başlar.
- SD kart yoksa, takılamıyorsa ya da boş alan 256 MiB'tan azsa kayıt başlamaz; komut sonucu ve durum bayrakları bunu bildirir.
- Kayıt sırasında tahmini boş alan 16 MiB'ın altına düşerse `sd_error,sd_full` yazılır ve oturum kapatılır. Yazma hatasında `sd_error` (mümkünse) yazılır, oturum kapatılır; kart sonraki kontrolde yeniden bağlanır.
- BLE bağlantısı koparsa kayıt devam eder, cihaz yeniden reklam yapar.
- Mevcut bir oturum klasörü asla üzerine yazılmaz (`session_exists`).

**LED.**

| Desen | Anlam |
| --- | --- |
| Sürekli yanık | Açılış, alıcı yapılandırılıyor |
| 1 Hz, yarı yanık | Hazır, kayıt yok |
| Yanık, her saniye 100 ms sönük | Kayıt sürüyor |
| 5 Hz hızlı | Hata: alıcı yapılandırılamadı, SD yok/dolu/hatalı |

## Dosya biçimleri

Her oturum `/sessions/<session_id>/` klasörüne yazılır.

### `gnss.ubx`

Alıcının UART'tan gönderdiği ham bayt akışı, hiç değiştirilmeden (RXM-RAWX, RXM-SFRBX, NAV-PVT ve varsa ACK mesajları). İlk bayt bir çerçevenin ortasına denk gelebilir; RTKLIB `convbin` gibi araçlar senkron baytına göre yeniden hizalanır. Örnek: `convbin -r ubx gnss.ubx`.

### `events.csv`

UTF-8, RFC 4180 (virgül, tırnak içeren alanlar tırnaklanır). Başlık satırı:

```
esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns
```

| Sütun | Anlamı |
| --- | --- |
| `esp_micros` | Olayın ESP32 açılıştan beri mikrosaniyesi |
| `gps_time_ns` | GPS dönemi başlangıcından (1980-01-06) beri nanosaniye; PPS eşlemesi yoksa boş |
| `event_type` | `session_start`, `session_stop`, `corner`, `qr_sync`, `pps_lost`, `pps_regained`, `sd_error` |
| `payload` | Olaya göre metin (aşağıda) |
| `pps_esp_micros`, `pps_gps_time_ns` | Satır yazılırken geçerli çapa: son PPS kenarının `esp_micros`'u ve GPS zamanı. Çapa yoksa boş. `gps_time_ns` boş olsa bile (PPS kaybı) çapa varsa yazılır; işleme hattı dönüşümü yeniden yapabilir |

| Olay | `payload` |
| --- | --- |
| `session_start` | `parcel_id=<parsel>` |
| `session_stop` | Neden: `command`, `sd_full`, `sd_error` |
| `corner` | Telefondan gelen metin (ör. köşe numarası) |
| `qr_sync` | Telefonun o anda gösterdiği QR'ın metninin tamamı: `OQ1:<gps_time_ms>:<oturum_etiketi>` ([docs/arayuzler.md](../../docs/arayuzler.md#qr-saat-kodu)) |
| `pps_lost`, `pps_regained` | Boş |
| `sd_error` | `gnss_write`, `events_write` ya da `sd_full` |

Örnek:

```
esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns
10500000,1476350120500000000,session_start,parcel_id=P-12,10000000,1476350120000000000
12250000,1476350122249980000,qr_sync,OQ1:1476350122230:S-1,12000020,1476350122000000000
```

### `session.json`

Oturum başında yazılır (`stop: null`), bitişte yeniden yazılır.

```json
{
  "format_version": 1,
  "session_id": "S-1",
  "parcel_id": "P-12",
  "firmware_version": "0.3.0",
  "receiver": {"model": "ZED-F9P", "port": "UART1", "baud": 460800, "meas_period_ms": 200, "rawx_rate_hz": 1, "nav_pvt_rate_hz": 5, "messages": ["RXM-RAWX", "RXM-SFRBX", "NAV-PVT"], "nmea": false, "timepulse_grid": "GPS", "config_status": "ok", "detected_baud": 38400},
  "gps_utc_leap_seconds": 18,
  "start": {"esp_micros":10500000,"gps_time_ns":1476350120500000000,"utc":"2026-10-18T09:15:02.500Z"},
  "stop": {"esp_micros":7210500000,"gps_time_ns":null,"utc":null},
  "stop_reason": "command",
  "gnss_bytes": 73400320,
  "dropped_bytes": 0
}
```

`config_status`: `ok`, `no_response`, `nak`, `invalid_settings`. `gps_time_ns` ve `utc`, o anda PPS eşlemesi yoksa `null`'dır.

## BLE protokolü

Cihaz adı `orchados-gnss-XXXX` (XXXX: BT MAC adresinin son iki baytı). Tüm çok baytlı alanlar **little-endian**. Mesajlar kompakt ikili biçimdedir (JSON değil): durum her saniye gönderildiği için küçük kalır, ESP32'de ayrıştırıcı gerekmez, Dart tarafında `ByteData` ile kolayca okunur.

| | UUID | Özellik |
| --- | --- | --- |
| Servis | `cdee0001-a1bf-488e-8eda-a2c084827c6c` | |
| Durum | `cdee0002-a1bf-488e-8eda-a2c084827c6c` | read, notify (saniyede 1 ve her komuttan hemen sonra) |
| Komut | `cdee0003-a1bf-488e-8eda-a2c084827c6c` | write (yanıtlı yazma önerilir) |

**MTU:** Durum 51 bayt, en uzun komut 204 bayt. Uygulama bağlanınca MTU ≥ 247 istemelidir (Android'de `requestMtu(247)`; iOS kendisi anlaşır). Firmware 247 önerir.

### Durum (51 bayt, protokol sürümü 1)

| Ofset | Tür | Alan | Açıklama |
| --- | --- | --- | --- |
| 0 | u8 | `version` | 1 |
| 1 | u8 | `recording` | 0 boşta, 1 kayıtta |
| 2 | u8 | `flags` | bit0 SD var, bit1 SD alanı az (< 256 MiB), bit2 SD hatası, bit3 GPS zaman eşlemesi var, bit4 bu oturumda veri atıldı, bit5 `gnssFixOK`, bit6 konum geçerli (ofset 39–50) |
| 3 | u8 | `rx_config` | 0 bekliyor, 1 tamam, 2 yanıt yok, 3 NAK, 4 geçersiz ayar |
| 4 | u8 | `pps_state` | 0 hiç görülmedi, 1 kilitli, 2 kayıp |
| 5 | u8 | `fix_type` | NAV-PVT `fixType`: 0 yok, 2 2D, 3 3D, 4 GNSS+DR, 5 sadece zaman |
| 6 | u8 | `carr_soln` | RTK: 0 yok, 1 float, 2 fixed |
| 7 | u8 | `num_sv` | Çözümde kullanılan uydu sayısı |
| 8 | u32 | `h_acc_mm` | Yatay doğruluk (mm); NAV-PVT gelmediyse `0xFFFFFFFF` |
| 12 | u32 | `bytes_written` | Bu oturumda `gnss.ubx`'e yazılan bayt |
| 16 | u32 | `sd_free_mib` | SD boş alanı (MiB); kayıtta tahmini |
| 20 | u16 | `battery_mv` | Batarya gerilimi (mV) |
| 22 | u8 ×3 | `fw_major`, `fw_minor`, `fw_patch` | Firmware sürümü |
| 25 | u32 | `dropped_bytes` | Bu oturumda tampon taşmasıyla atılan bayt |
| 29 | u8 | `last_cmd_seq` | Son işlenen komutun sıra numarası |
| 30 | u8 | `last_cmd_result` | Son komutun sonucu (aşağıda); açılıştan beri komut yoksa `0xFF` |
| 31 | u64 | `gps_time_ns` | Mesajın oluşturulduğu anın GPS zamanı (GPS dönemi başlangıcından beri ns): `çapa_gps + (şimdi − çapa_micros) × 1000`. PPS eşlemesi yoksa (bit3 = 0) `0` |
| 39 | i32 | `lat_e7` | Son NAV-PVT'nin enlemi (1e-7 derece). Konum geçerli değilse (bit6 = 0) `0` |
| 43 | i32 | `lon_e7` | Son NAV-PVT'nin boylamı (1e-7 derece); geçerli değilse `0` |
| 47 | i32 | `height_mm` | Son NAV-PVT'nin elipsoit üstü yüksekliği (mm); geçerli değilse `0` |

Uygulama alan eklenirse sürüm numarasını kontrol etmeli; aynı sürümde yalnızca sona alan eklenir, bu yüzden 51 bayttan uzun durum mesajları kabul edilmelidir. Alanlar sonradan eklendi:

| Firmware | Uzunluk | Eklenen |
| --- | --- | --- |
| 0.1.0 | 31 bayt | |
| 0.2.0 | 39 bayt | `gps_time_ns` |
| 0.3.0 | 51 bayt | Konum bloğu (`lat_e7`, `lon_e7`, `height_mm`) ve `flags` bit6 |

Kısa bir mesajda eksik alanlar yok sayılır: 31 baytta zaman eşlemesi bilinmiyor kabul edilir; 51 bayttan kısa mesajda konum "yok"tur (bit6 da yok sayılır).

**Konum:** Kaynak, durum mesajı oluşturulurken elimizdeki son NAV-PVT'dir (5 Hz, yani en fazla ~200 ms eski). Konum yalnızca `gnssFixOK` (bit5) ve `fix_type` 2, 3 ya da 4 iken ve NAV-PVT `invalidLlh` bayrağı kalkıkken geçerlidir; o zaman bit6 1 olur. Aksi halde (hiç NAV-PVT gelmedi, fix yok, sadece zaman) üç alan `0`, bit6 `0`'dır. Konum PPK öncesidir (alıcının anlık çözümü); doğruluğu `h_acc_mm`'dedir, RTK durumu `carr_soln`'dadır.

`gps_time_ns`, `bit3` (GPS zaman eşlemesi var) ile aynı hesaptan gelir: ikisi her zaman birlikte doludur ya da boştur. Değer, olaylardaki `gps_time_ns` ile aynı kurala uyar (çapadan en fazla 2 sn uzaklık). Telefon bunu, bildirimin alındığı anla karşılaştırıp kendi saatinin GPS zamanına ofsetini bulur; BLE bildirim gecikmesi (tipik olarak < 50 ms) bu ofsete eklenir.

Örnek (onaltılık, 51 bayt): kayıtta; SD var, zaman eşlemesi var, `gnssFixOK`, konum geçerli (`flags` 0x69); 3D fix, RTK fixed, 27 uydu, 14 mm; firmware 0.3.0; son komut seq 7 `ok`; GPS zamanı 1476350122250000000 ns; 37,0662000° K, 37,3830000° D, 892,340 m:

```
01 01 69 01 01 03 02 1B  0E 00 00 00  04 03 02 01  30 75 00 00  18 47  00 03 00
00 00 00 00  07 00  80 D6 D0 38 9D 0C 7D 14  70 DA 17 16  70 31 48 16  B4 9D 0D 00
```

### Komutlar

Her komut `[opcode u8][seq u8]` ile başlar. `seq` uygulamanın seçtiği sıra numarasıdır; sonucu durumdaki `last_cmd_seq`/`last_cmd_result` ile takip edilir. Metinler `[uzunluk u8][bayt…]` biçimindedir.

| Komut | Bayt düzeni | Kısıtlar |
| --- | --- | --- |
| `start_session(session_id, parcel_id)` | `01 seq len session_id len parcel_id` | `session_id`: 1–36 karakter, `[A-Za-z0-9_-]` (UUID uygun; klasör adı olur). `parcel_id`: 1–64 yazdırılabilir ASCII |
| `stop_session` | `02 seq` | |
| `mark_event(type, payload)` | `03 seq type len payload` | `type`: `01` corner, `02` qr_sync. `payload`: 0–200 bayt UTF-8, kontrol karakteri yok |

`qr_sync`, telefon QR kodunu ekranda gösterdiği anda gönderilir; olayın `esp_micros`'u komutun işlendiği andır (BLE gecikmesi tipik olarak < 50 ms). Payload, o anda gösterilen QR'ın metninin tamamıdır (`OQ1:...`).

Örnekler (onaltılık):

```
01 07 03 53 2D 31 04 50 2D 31 32      start_session("S-1", "P-12"), seq 7
02 08                                 stop_session, seq 8
03 09 01 01 33                        mark_event(corner, "3"), seq 9
```

### Sonuç kodları

| Kod | Anlam |
| --- | --- |
| 0 | `ok` |
| 1 | `malformed` (eksik/fazla bayt) |
| 2 | `unknown_opcode` |
| 3 | `invalid_argument` |
| 4 | `already_recording` |
| 5 | `not_recording` |
| 6 | `sd_missing` |
| 7 | `sd_full` |
| 8 | `sd_error` |
| 9 | `session_exists` |
| 255 | Henüz komut yok |

## Testler

`pio test -e native` şu konuları kapsar: UBX çerçeve ayrıştırma (parçalı, gürültülü, bozuk sağlama toplamlı, aşırı büyük ve uzunluğu bozuk çerçeveler), elle hazırlanmış NAV-PVT çerçevesinin alanları ve GPS zamanı, CFG-VALSET mesajlarının bayt bayt doğruluğu (beklenen baytlar Python ile bağımsız üretildi), sahte alıcıyla baud keşfi/ACK/NAK, PPS–GPS eşleme, çapa taşıma, PPS kaybı ve geri gelmesi, olay satırı biçimi ve kaçışlar, BLE komut/durum kodlama-çözme (durumdaki `gps_time_ns` ofseti, çapadan hesabı, eşleme yokken 0 ve 31 baytlık eski mesaj; konum bloğunun ofsetleri ve uç değerleri, NAV-PVT'den doldurulması, fix yokken sıfır ve bit6 kapalı, 39 baytlık eski mesajda konum yok; README'deki örnek mesaj), halka ve çift tampon, sahte SD kartla oturum yaşam döngüsü (kart yok, dolu, yazma hatası, mevcut oturum).

## Bilinen sınırlar

- Watchdog ya da güç kesintisiyle yeniden başlarsa açık oturum devam ettirilmez; dosyalar son flush'a kadar sağlamdır, `session.json`'da `stop` `null` kalır. Telefon yeni bir oturum başlatmalıdır.
- `gnss.ubx` oturum başında bir UBX çerçevesinin ortasından başlayabilir.
- Boş alan kayıt sırasında ölçülmez, yazılan bayttan tahmin edilir (büyük FAT kartlarda ölçüm saniyeler sürebilir).
