# Kitte Raspberry Pi kayıt yazılımı: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pi 5 üzerinde ESP32 kaydedicinin yerini alan, aynı BLE protokolünü konuşup aynı `gnss/` dosyalarını yazan ve buna LiDAR kaydı ile kayıt sağlığı izlemesini ekleyen `services/kit-recorder/` servisi, saha uygulamasındaki karşılığı ve belgeler.

**Architecture:** Saf Python çekirdek (`Recorder`) komutları işler, oturum dosyalarını yazar ve durum mesajını üretir. Donanıma dokunan her şey (seri port, PPS, chrony, SSD, LiDAR/ROS 2, BLE) ince adaptörlerin arkasındadır, testlerde sahteleri kullanılır. Saha uygulaması 51 bayttan uzun durum mesajını "kit uzantısı" olarak okur ve ön kontrol, atlama, uyarı ve özet ekranlarını buna göre gösterir.

**Tech Stack:** Python 3.12, uv, pytest, ruff, pyserial, bless (BlueZ GATT sunucusu), ROS 2 Jazzy (`rclpy`, `ros2 bag`, MCAP; yalnız Pi'da, isteğe bağlı import), chrony, systemd; Flutter/Dart (`apps/field`), `wakelock_plus`, `audioplayers`.

**Spec:** [docs/superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md](../specs/2026-11-16-pi-kayit-yazilimi-design.md). Uygulayıcı planı ve tasarımı birlikte okur.

## Global Constraints

- Belgeler Türkçe; kod, tanımlayıcılar, kod yorumları ve commit mesajları İngilizce (CLAUDE.md).
- Saha verisi repoya girmez. Testler sentetik veriyle yazılır.
- Sözleşme önce [docs/arayuzler.md](../../arayuzler.md)'de değişir, sonra kod (Task 1 her şeyden önce).
- BLE: servis `cdee0001-a1bf-488e-8eda-a2c084827c6c`, durum `cdee0002-…` (read/notify, saniyede 1 ve her komuttan hemen sonra), komut `cdee0003-…` (write). Little-endian. Cihaz adı `orchados-gnss-XXXX` (BT MAC'in son iki baytı, büyük harf onaltılık).
- Durum mesajında `version` = 1 kalır; yalnız sona alan eklenir. İlk 51 bayt [firmware/gnss-logger/README.md](../../../firmware/gnss-logger/README.md) "Durum" tablosuyla birebir aynıdır.
- `events.csv` başlığı birebir: `esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns`.
- `session_start` payload'ı birebir `parcel_id=<parsel>`.
- GPS zamanı: GPS dönemi 1980-01-06 (Unix 315 964 800 s); GPS − UTC = 18 s. `gps_ns = unix_ns − 315_964_800·10⁹ + 18·10⁹`.
- Kit uzantısı olmayan (≤ 51 bayt) durum mesajı ESP32 demektir; uygulama ESP32 ile bugünkü gibi çalışmaya devam eder.
- Atlanabilir ön kontrol maddeleri yalnız LiDAR, LiDAR kipi ve saattir. SSD ve alıcı atlanamaz.
- Python servisleri `requires-python = ">=3.12"`, ruff `line-length = 100`, `select = ["E","F","I","B","UP"]` (services/kit-chip ile aynı).

## Review Focus

1. **Kayıt sırasında BLE bağlantısının kopması:** Kayıt sürmeli, Pi yeniden reklam yapmalı, telefon yeniden bağlanınca durum kaldığı yerden gelmeli. Test: Task 9 `test_ble_disconnect_does_not_stop_recording`.
2. **Oturum ortasında SSD'nin çıkarılması ya da dolması:** Kayıt `sd_error` / `sd_full` ile kapanmalı, `session_stop` yazılabiliyorsa yazılmalı, servis çökmemeli. Test: Task 9 `test_ssd_removed_mid_session_stops_with_sd_error`.
3. **LiDAR'ın veri göndermeye devam edip MCAP'e hiçbir şey yazılmaması** (ros2 bag süreci ölü): Ekran "veri geliyor" derken kayıt boş olabilir; uyarı `lidar_not_written` çıkmalı. Test: Task 8 `test_alert_when_bag_bytes_stall_while_points_arrive`.
4. **Pi'ın, kapanmamış bir oturumla yeniden açılması:** Oturum `power_loss` ile kapatılmalı, yeni kayıt kendiliğinden başlamamalı, aynı `session_id` ile yeniden başlatma `session_exists` almalı. Test: Task 4 `test_recover_closes_open_session_as_power_loss`, Task 9 `test_restart_same_session_id_is_rejected`.
5. **Eski uygulama ya da ESP32 ile karışık kullanım:** Uygulama ESP32'ye atlama baytı göndermemeli; 77 baytlık mesajı eski çözücü 51 bayt gibi okuyabilmeli. Test: Task 13 `start_session sends override byte only to the kit`, `51-byte status has no kit extension`.

---

## Durum mesajı kit uzantısı (Task 1'de arayuzler.md'ye yazılır; Task 3 ve 13 bunu uygular)

Uzunluk 77 bayt. Ofset 0–50 ESP32 ile aynı. Pi'da ilk 51 baytın anlamı:

| Ofset | Alan | Pi'da |
| --- | --- | --- |
| 2 | `flags` | bit0 SSD bağlı, bit1 SSD'de 20 GiB'tan az yer, bit2 SSD hatası, bit3 saat PPS'e kilitli, bit4 bu oturumda veri atıldı, bit5 `gnssFixOK`, bit6 konum geçerli |
| 4 | `pps_state` | `/sys/class/pps/pps0/assert`: 0 hiç görülmedi, 1 kilitli (son kenar < 1,5 s), 2 kayıp |
| 12 | `bytes_written` | `gnss.ubx` baytı (u32, taşarsa doyar) |
| 16 | `sd_free_mib` | SSD boş alanı |
| 20 | `battery_mv` | 0 (ölçülmüyor) |
| 22–24 | `fw_*` | kit-recorder sürümü |
| 31 | `gps_time_ns` | Saat PPS'e kilitliyse sistem saatinden GPS zamanı, değilse 0 |

Uzantı:

| Ofset | Tür | Alan | Değerler |
| --- | --- | --- | --- |
| 51 | u8 | `recorder_kind` | 1 = kit-recorder (Pi) |
| 52 | u8 | `lidar_state` | 0 hiç görülmedi, 1 veri geliyor, 2 kopuk |
| 53 | u8 | `lidar_mode` | 0 bilinmiyor (denetlenmiyor), 1 doğru, 2 yanlış |
| 54 | u8 | `clock_state` | 0 kilitsiz, 1 kaba (yalnız alıcı zamanı), 2 PPS'e kilitli |
| 55 | u8 | `precheck_fail` | Geçmeyen ön kontrol maddeleri (bit maskesi, aşağıda) |
| 56 | u8 | `alerts` | bit0 `lidar_silent`, bit1 `lidar_rate_low`, bit2 `lidar_not_written`, bit3 `gnss_silent`, bit4 `clock_unlocked`, bit5 `ssd_error`, bit6 `ssd_low` |
| 57 | u8 | `overrides` | Bu oturumda atlanan maddeler (ön kontrol maskesi) |
| 58 | u8 | — | 0 (ayrılmış) |
| 59 | u32 | `lidar_points_per_s` | Son 3 sn ortalaması |
| 63 | u16 | `imu_hz` | Son 3 sn ortalaması |
| 65 | u16 | `lidar_gap_count` | Bu oturumda |
| 67 | u16 | `lidar_longest_gap_s` | Bu oturumda, saniye (doyar) |
| 69 | u32 | `lidar_written_mib` | Bu oturumda MCAP'e yazılan |
| 73 | i32 | `clock_offset_us` | chrony'nin sistem saati hatası tahmini; bilinmiyorsa 0 |

**Ön kontrol maskesi** (`precheck_fail`, `overrides`, `start_session`'ın atlama baytı): bit0 `lidar`, bit1 `lidar_mode`, bit2 `clock`, bit3 `ssd`, bit4 `gnss`. Atlanabilir maske `0x07`.

**`start_session` atlama baytı:** `01 seq len session_id len parcel_id [override_mask]`. Bayt yoksa maske 0. Maskede `0x07` dışı bir bit varsa `invalid_argument` (3). Ön kontrolde geçmeyen bir madde maskede yoksa yeni sonuç kodu **10 `precheck_failed`**.

**Yeni olaylar** (`events.csv`): `lidar_lost`, `lidar_regained`, `gnss_lost`, `gnss_regained` (payload boş), `precheck_override` (payload: atlanan madde adları, `;` ile, ör. `lidar;clock`), `ssd_error` yerine mevcut `sd_error` kullanılır (payload `gnss_write`, `events_write`, `sd_full`, `lidar_write`). Saat kilidi kaybı mevcut `pps_lost` / `pps_regained` ile yazılır; tasarımdaki `clock_unlocked` olayı bunlarla karşılanır.

**`gnss/session.json` eklentileri:** `"recorder": "kit-recorder"`, `"precheck_overrides": ["lidar", "clock"]` (boş liste olabilir), `"clock_state_at_start": "pps" | "coarse" | "unlocked"`, `receiver.port` = `"USB"`, `receiver.baud` ve `receiver.detected_baud` = `null`, `stop_reason` için ek değer `power_loss`. `format_version` 1.

**`lidar/raw/recording.json`** (`schema: orchados.lidar_recording/1`): `session_id`, `parcel_id`, `recorder_version`, `start_gps_ns`, `stop_gps_ns` (boş olabilir), `clock_state_at_start`, `precheck_overrides`, `topics` (`points`, `imu`, `ubx`), `segments` (`[{file, bytes}]`), `points_total`, `imu_messages_total`, `gaps` (`[{start_gps_ns, end_gps_ns, duration_s}]`; GPS zamanı yoksa monotonik µs `start_mono_us`, `end_mono_us`), `alerts` (`[{type, first_mono_us, count}]`), `lidar_mode` (`unknown` | `ok` | `wrong`).

**Eşikler** (`orchados_recorder/thresholds.py`, tek yer):

| Ad | Değer |
| --- | --- |
| `LIDAR_EXPECTED_PPS` | 64 000 nokta/sn |
| `LIDAR_MIN_RATE_FRACTION` | 0,5 (altı: ön kontrol geçmez, kayıtta `lidar_rate_low`) |
| `LIDAR_SILENT_S` | 3 |
| `BAG_STALL_S` | 10 |
| `GNSS_SILENT_S` | 3 |
| `PPS_LOST_S` | 1,5 |
| `CLOCK_MAX_OFFSET_US` | 1000 |
| `SSD_MIN_FREE_START_GIB` | 30 |
| `SSD_LOW_GIB` | 20 |
| `SSD_STOP_MIB` | 512 (altında `sd_full` ile durur) |
| `FSYNC_INTERVAL_S` | 1,0 |
| `BAG_SEGMENT_S` | 180 |

---

### Task 1: Sözleşme: arayuzler.md ve firmware README notu (tamamlandı)

**Files:**
- Modify: `docs/arayuzler.md` (giriş paragrafı; "Oturum klasörü"; "`gnss/events.csv`"; "`gnss/session.json`"; "BLE protokolü"; yeni alt bölüm "Kit kaydedicisi (Raspberry Pi)")
- Modify: `firmware/gnss-logger/README.md` (en başa not)

**Interfaces:**
- Produces: yukarıdaki "Durum mesajı kit uzantısı" bölümünün tamamı, Türkçe ve arayuzler.md üslubuyla. Sonraki her görev bu bölüme dayanır.

- [x] **Step 1:** Oturum klasörü ağacına `lidar/raw/bag/*.mcap`, `lidar/raw/bag/metadata.yaml` (ros2 bag'in çıktısı) ve `lidar/raw/recording.json` ekle (tasarımdaki `lidar/raw/<session_id>_<n>.mcap` adı, ros2 bag'in kendi adlandırmasıyla değişti); tabloya satır: üreten "kit kaydedicisi (Pi)", "SSD'nin `/sessions/<session_id>/` klasörü olduğu gibi oturum köküne kopyalanır", zorunlu değil. `gnss/*` satırını "ESP32 ya da kit kaydedicisi" yap; Pi'da kopyanın köke gittiğini yaz.
- [x] **Step 2:** `events.csv` bölümüne yeni olay türlerini ve payload'larını ekle; `esp_micros` ve çapa sütunlarının Pi'da monotonik saat (`CLOCK_MONOTONIC`, µs) ve son PPS kenarı anlamına geldiğini yaz. Saat kilitli değilken `gps_time_ns` ve çapa boş.
- [x] **Step 3:** `gnss/session.json` bölümüne Pi eklentilerini ekle (yukarıdaki liste).
- [x] **Step 4:** BLE bölümüne kit uzantısı tablosunu, ön kontrol maskesini, atlama baytını ve `precheck_failed` (10) kodunu ekle; `recording.json` şemasını "Kit kaydedicisi" alt bölümüne yaz; eşik tablosunu da oraya koy.
- [x] **Step 5:** README'nin başına: "Kitte artık Raspberry Pi kayıt yazılımı (`services/kit-recorder/`) kullanılıyor; aynı protokolü konuşur. Uzantılar docs/arayuzler.md'de. Bu firmware repoda referans ve yedek olarak kalır."
- [x] **Step 6:** `grep -n "precheck_failed\|recorder_kind\|lidar/raw" docs/arayuzler.md` üç terimi de bulmalı.
- [x] **Step 7: Commit** — `git commit -m "Interfaces: kit recorder (Pi) status extension, events and session files"`

### Task 2: kit-recorder paketi, GPS zamanı ve UBX

**Files:**
- Create: `services/kit-recorder/pyproject.toml` (kit-chip'teki gibi; ad `orchados-kit-recorder`, modül `orchados_recorder`, script `orchados-recorder = "orchados_recorder.cli:main"`, bağımlılıklar `pyserial>=3.5`, `bless>=0.2.6`)
- Create: `services/kit-recorder/src/orchados_recorder/__init__.py` (`__version__ = "0.1.0"`)
- Create: `src/orchados_recorder/gpstime.py`, `src/orchados_recorder/ubx.py`, `src/orchados_recorder/thresholds.py`
- Create: `.github/workflows/ci-kit-recorder.yml` (ci-kit-chip.yml'in kopyası, yollar `services/kit-recorder`)
- Test: `services/kit-recorder/tests/test_gpstime.py`, `tests/test_ubx.py`

**Interfaces:**
- Produces:
  - `gpstime.unix_ns_to_gps_ns(unix_ns: int) -> int`, `gps_ns_to_utc_iso(gps_ns: int) -> str` (`"2026-10-18T09:15:02.500Z"` biçimi), `LEAP_SECONDS = 18`
  - `ubx.frame(cls: int, msg_id: int, payload: bytes) -> bytes`, `ubx.checksum(data: bytes) -> tuple[int, int]`
  - `class ubx.Framer` — `feed(data: bytes) -> list[UbxMessage]`; senkron baytına göre hizalanır, bozuk checksum'u atar
  - `@dataclass UbxMessage(cls: int, msg_id: int, payload: bytes)`
  - `@dataclass NavPvt(i_tow_ms, year, month, day, hour, minute, second, valid, t_acc_ns, nano, fix_type, flags, num_sv, lon_e7, lat_e7, height_mm, h_acc_mm)`, `ubx.parse_nav_pvt(payload: bytes) -> NavPvt`, `NavPvt.gnss_fix_ok`, `NavPvt.invalid_llh`, `NavPvt.carr_soln`
  - `ubx.cfg_valset_ram(items: list[tuple[int, int, int]]) -> bytes` (anahtar, değer, bayt boyu)
  - `ubx.is_ack(msg, cls, msg_id) -> bool | None` (ACK True, NAK False, ilgisizse None)
  - `thresholds.py`: yukarıdaki eşik tablosu, birebir adlar

- [x] **Step 1: Write the failing tests**

```python
def test_gps_epoch_offset():
    # 2026-10-18T09:15:02.500Z (README example) in Unix ns
    unix_ns = 1_792_314_902_500_000_000
    assert unix_ns_to_gps_ns(unix_ns) == unix_ns - 315_964_800_000_000_000 + 18_000_000_000
    assert gps_ns_to_utc_iso(unix_ns_to_gps_ns(unix_ns)) == "2026-10-18T09:15:02.500Z"

def test_framer_resyncs_and_drops_bad_checksum():
    good = frame(0x01, 0x07, bytes(92))
    bad = bytearray(frame(0x02, 0x15, b"\x00" * 16)); bad[-1] ^= 0xFF
    msgs = Framer().feed(b"\x00\xb5garbage" + bytes(bad) + good[:10])
    assert msgs == []
    msgs = Framer().feed(b"\x00\xb5garbage" + bytes(bad) + good)
    assert [(m.cls, m.msg_id) for m in msgs] == [(0x01, 0x07)]

def test_framer_handles_split_feeds():
    f = Framer(); data = frame(0x01, 0x07, bytes(92))
    assert f.feed(data[:5]) == [] and len(f.feed(data[5:])) == 1

def test_nav_pvt_fields():  # build a 92-byte payload with known values via struct
    ...  # lat_e7=370662000, lon_e7=373830000, height_mm=892340, fix_type=3, flags=0x81 (gnssFixOK, carrSoln fixed)
    pvt = parse_nav_pvt(payload)
    assert (pvt.lat_e7, pvt.lon_e7, pvt.height_mm) == (370662000, 373830000, 892340)
    assert pvt.gnss_fix_ok and pvt.carr_soln == 2

def test_valset_ram_layout():
    msg = cfg_valset_ram([(0x30210001, 200, 2)])
    assert msg[:4] == bytes([0xB5, 0x62, 0x06, 0x8A])
    assert msg[6:10] == bytes([0x00, 0x01, 0x00, 0x00])  # version 0, layer RAM, reserved
    assert msg[10:16] == (0x30210001).to_bytes(4, "little") + (200).to_bytes(2, "little")
```

- [x] **Step 2:** `cd services/kit-recorder && uv sync && uv run pytest -q` → FAIL (modül yok).
- [x] **Step 3:** Fonksiyonları yaz. NAV-PVT ofsetleri u-blox F9P arayüz tanımına göre (firmware `lib/gnss_core/src/nav_pvt.cpp` aynı ofsetleri kullanır, oradan bak). `carr_soln = (flags >> 6) & 0x3`; `invalid_llh` = `flags3` (ofset 78) bit0.
- [x] **Step 4:** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: package, GPS time and UBX framing"`

### Task 3: BLE protokolü: durum ve komutlar

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/protocol.py`
- Test: `services/kit-recorder/tests/test_protocol.py`

**Interfaces:**
- Consumes: yok.
- Produces:
  - Sabitler: `SERVICE_UUID`, `STATUS_UUID`, `COMMAND_UUID`, `PROTOCOL_VERSION = 1`, `STATUS_LEN = 77`, `RECORDER_KIND_PI = 1`
  - `class Result(IntEnum)`: `OK=0, MALFORMED=1, UNKNOWN_OPCODE=2, INVALID_ARGUMENT=3, ALREADY_RECORDING=4, NOT_RECORDING=5, SD_MISSING=6, SD_FULL=7, SD_ERROR=8, SESSION_EXISTS=9, PRECHECK_FAILED=10, NONE=0xFF`
  - `class Check(IntFlag)`: `LIDAR=1, LIDAR_MODE=2, CLOCK=4, SSD=8, GNSS=16`; `OVERRIDABLE = Check.LIDAR | Check.LIDAR_MODE | Check.CLOCK`
  - `class Alert(IntFlag)`: `LIDAR_SILENT=1, LIDAR_RATE_LOW=2, LIDAR_NOT_WRITTEN=4, GNSS_SILENT=8, CLOCK_UNLOCKED=16, SSD_ERROR=32, SSD_LOW=64`
  - `@dataclass Status` — 51 baytlık tablonun her alanı ve uzantının her alanı (adlar tablolardaki gibi, snake_case)
  - `encode_status(s: Status) -> bytes` (77 bayt)
  - `@dataclass StartSession(seq, session_id, parcel_id, override_mask: int)`, `StopSession(seq)`, `MarkEvent(seq, kind: Literal["corner","qr_sync"], payload: str)`
  - `decode_command(data: bytes) -> tuple[Command | None, int | None, Result]` — (komut, seq, sonuç); kısıtlar README "Komutlar" tablosundaki gibi

- [x] **Step 1: Write the failing tests**

```python
README_STATUS = bytes.fromhex(
    "01 01 69 01 01 03 02 1B 0E 00 00 00 04 03 02 01 30 75 00 00 18 47 00 03 00"
    " 00 00 00 00 07 00 80 D6 D0 38 9D 0C 7D 14 70 DA 17 16 70 31 48 16 B4 9D 0D 00".replace(" ", ""))

def test_first_51_bytes_match_firmware_readme_example():
    s = Status(version=1, recording=True, flags=0x69, rx_config=1, pps_state=1, fix_type=3,
               carr_soln=2, num_sv=27, h_acc_mm=14, bytes_written=0x01020304, sd_free_mib=30000,
               battery_mv=18200, fw=(0, 3, 0), dropped_bytes=0, last_cmd_seq=7, last_cmd_result=0,
               gps_time_ns=1476350122250000000, lat_e7=370662000, lon_e7=373830000,
               height_mm=892340)  # extension fields default to 0
    out = encode_status(s)
    assert len(out) == 77 and out[:51] == README_STATUS and out[51] == RECORDER_KIND_PI

def test_extension_offsets():
    out = encode_status(Status.idle(lidar_points_per_s=64000, imu_hz=200, lidar_gap_count=2,
                                    lidar_longest_gap_s=4, lidar_written_mib=900,
                                    clock_offset_us=-12, alerts=Alert.LIDAR_SILENT,
                                    precheck_fail=Check.CLOCK, overrides=Check.LIDAR))
    assert int.from_bytes(out[59:63], "little") == 64000
    assert int.from_bytes(out[63:65], "little") == 200
    assert out[55] == 4 and out[56] == 1 and out[57] == 1
    assert int.from_bytes(out[73:77], "little", signed=True) == -12

def test_readme_command_vectors():
    cmd, seq, res = decode_command(bytes.fromhex("01070353" "2d31" "04" "502d3132"))
    assert res == Result.OK and cmd == StartSession(7, "S-1", "P-12", 0)
    assert decode_command(bytes.fromhex("0208"))[0] == StopSession(8)
    assert decode_command(bytes.fromhex("0309010133"))[0] == MarkEvent(9, "corner", "3")

def test_start_session_override_byte():
    base = bytes.fromhex("01070353" "2d31" "04" "502d3132")
    assert decode_command(base + b"\x05")[0].override_mask == 5
    assert decode_command(base + b"\x08")[2] == Result.INVALID_ARGUMENT   # SSD not overridable
    assert decode_command(base + b"\x01\x00")[2] == Result.MALFORMED
```
- [x] **Step 2:** `uv run pytest tests/test_protocol.py -q` → FAIL.
- [x] **Step 3:** `protocol.py`'yi yaz. `Status.idle(**overrides)` testler için tüm alanları sıfır/varsayılanla doldurup verilenleri koyan bir sınıf metodu. u32 alanlar `min(v, 0xFFFFFFFF)`, u16 alanlar `min(v, 0xFFFF)` ile doyar.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: BLE status and command codec"`

### Task 4: Oturum dosyaları ve güç kesintisi kurtarma

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/session.py`
- Test: `services/kit-recorder/tests/test_session.py`

**Interfaces:**
- Consumes: `gpstime.gps_ns_to_utc_iso`, `thresholds.FSYNC_INTERVAL_S`
- Produces:
  - `@dataclass TimeStamp(mono_us: int, gps_ns: int | None)`; `@dataclass Anchor(mono_us: int, gps_ns: int)`
  - `class SessionWriter`:
    - `SessionWriter.create(root: Path, session_id: str, parcel_id: str, *, receiver: dict, recorder_version: str, overrides: list[str], clock_state: str, start: TimeStamp, anchor: Anchor | None) -> SessionWriter` — `root/sessions/<id>/gnss/` ve `lidar/raw/` oluşturur; klasör varsa `FileExistsError`; `session.json`'u `stop: null` ile yazar; `session_start` olayını yazar; `overrides` boş değilse hemen ardından `precheck_override` olayını yazar
    - `append_gnss(data: bytes) -> None`, `event(event_type: str, payload: str, at: TimeStamp, anchor: Anchor | None) -> None`, `maybe_fsync(now_mono_us: int) -> None`
    - `close(stop: TimeStamp, reason: str, *, gnss_bytes: int, dropped_bytes: int) -> None` — `session_stop` olayı + `session.json` son hali
    - `lidar_dir: Path`, `write_recording_json(doc: dict) -> None`
  - `recover_open_sessions(root: Path) -> list[str]` — `stop_reason` alanı olmayan ya da `null` olan her oturuma `stop_reason: "power_loss"` ve `gnss_bytes` (dosya boyu) yazar; `stop` `null` kalır (ESP32'de güç kesintisindeki gibi; hattın `LoggerTimestamp`'ı `esp_micros`'u zorunlu tuttuğu için sahte bir zaman yazılmaz); `events.csv`'ye satır eklemez; kapattığı kimlikleri döndürür

- [x] **Step 1: Write the failing tests**

```python
def test_create_writes_esp32_compatible_files(tmp_path):
    w = SessionWriter.create(tmp_path, "S-1", "P-12", receiver=RECEIVER, recorder_version="0.1.0",
                             overrides=["lidar", "clock"], clock_state="pps",
                             start=TimeStamp(10_500_000, 1476350120500000000),
                             anchor=Anchor(10_000_000, 1476350120000000000))
    d = tmp_path / "sessions/S-1"
    rows = (d / "gnss/events.csv").read_text().splitlines()
    assert rows[0] == "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns"
    assert rows[1] == "10500000,1476350120500000000,session_start,parcel_id=P-12,10000000,1476350120000000000"
    assert rows[2].split(",")[2:4] == ["precheck_override", "lidar;clock"]
    meta = json.loads((d / "gnss/session.json").read_text())
    assert meta["stop"] is None and meta["recorder"] == "kit-recorder"
    assert meta["start"]["utc"] == "2026-10-18T09:15:02.500Z"
    assert (d / "lidar/raw").is_dir()

def test_unlocked_clock_leaves_time_and_anchor_empty(tmp_path): ...
    # start=TimeStamp(5, None), anchor=None -> row "5,,session_start,parcel_id=P-12,,"

def test_payload_with_comma_is_quoted(tmp_path): ...  # corner payload 'a,b' -> '"a,b"'

def test_existing_session_folder_is_refused(tmp_path): ...  # second create -> FileExistsError

def test_close_writes_stop(tmp_path): ...  # stop_reason "command", gnss_bytes, last row session_stop,command

def test_recover_closes_open_session_as_power_loss(tmp_path):
    SessionWriter.create(...)  # never closed
    assert recover_open_sessions(tmp_path) == ["S-1"]
    meta = json.loads(...)
    assert meta["stop_reason"] == "power_loss" and meta["stop"] is None
    assert recover_open_sessions(tmp_path) == []
```

- [x] **Step 2:** `uv run pytest tests/test_session.py -q` → FAIL.
- [x] **Step 3:** `session.py`'yi yaz. CSV `csv.writer(lineterminator="\n", quoting=csv.QUOTE_MINIMAL)`. `gnss.ubx` ve `events.csv` ekleme kipinde açık tutulur; `maybe_fsync` son fsync'ten bu yana `FSYNC_INTERVAL_S` geçtiyse ikisini de `flush` + `os.fsync` yapar. `session.json` geçici dosyaya yazılıp `os.replace` ile değiştirilir.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: session files and power-loss recovery"`

### Task 5: Saat (PPS, chrony) ve SSD

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/clock.py`, `src/orchados_recorder/ssd.py`
- Test: `tests/test_clock.py`, `tests/test_ssd.py`

**Interfaces:**
- Consumes: `gpstime.unix_ns_to_gps_ns`, `session.Anchor`, eşikler
- Produces:
  - `parse_pps_assert(text: str) -> tuple[int, int] | None` — `"1700000000.123456789#1234\n"` → `(unix_ns, seq)`; `"0.000000000#0"` → None
  - `@dataclass Tracking(ref_name: str, offset_us: int, leap_ok: bool)`, `parse_chronyc_tracking(csv_line: str) -> Tracking` (`chronyc -c tracking`: alan 1 ref adı, alan 4 sistem saati düzeltmesi saniye, son alan leap durumu; `"Not synchronised"` → `leap_ok=False`)
  - `class ClockState(StrEnum)`: `UNLOCKED="unlocked"`, `COARSE="coarse"`, `PPS="pps"`; protokol kodları 0/1/2
  - `classify_clock(tracking: Tracking | None, pps_age_s: float | None) -> ClockState` — `PPS`: ref adı `"PPS"`, `leap_ok`, `abs(offset_us) <= CLOCK_MAX_OFFSET_US`, `pps_age_s < PPS_LOST_S`; `COARSE`: `leap_ok` ve ref adı `"GNSS"`; yoksa `UNLOCKED`
  - `pps_anchor(assert_unix_ns: int, now_unix_ns: int, now_mono_us: int) -> Anchor` — kenarın monotonik zamanı `now_mono_us − (now_unix_ns − assert_unix_ns)//1000`; GPS zamanı kenarın en yakın tam saniyesine yuvarlanmış `unix_ns_to_gps_ns(...)`
  - `chrony_sock_sample(unix_ns: int, offset_s: float) -> bytes` — `struct.pack("<qqdiiii", sec, usec, offset_s, 0, 0, 0, 0x534F434B)` (40 bayt)
  - `class SystemClock` (gerçek: `/sys/class/pps/pps0/assert`, `chronyc -c tracking`, `time.monotonic_ns`, `time.time_ns`) ve `class FakeClock` (testler; alanları elle ayarlanır). İkisi de: `now_mono_us() -> int`, `now_unix_ns() -> int`, `pps_assert() -> tuple[int, int] | None`, `tracking() -> Tracking | None`
  - `ssd.py`: `@dataclass SsdStatus(present: bool, free_mib: int, error: bool)`, `probe_ssd(mount: Path) -> SsdStatus` (mount noktası değilse `present=False`; `.orchados-probe` dosyasına 4 KiB yazıp fsync ve sil; `OSError` → `error=True`; boş alan `shutil.disk_usage`), `ssd_check_ok(s: SsdStatus) -> bool` (`present and not error and free_mib >= SSD_MIN_FREE_START_GIB*1024`)

- [x] **Step 1: Write the failing tests** — her fonksiyon için birer test; değerler:
  - `parse_pps_assert("1700000000.123456789#1234\n") == (1_700_000_000_123_456_789, 1234)`
  - `parse_chronyc_tracking("50505300,PPS,1,1700000000.1,-0.000012,...,Normal")` → `Tracking("PPS", -12, True)` (gerçek 14 alanlı satırı testte tam yaz)
  - `classify_clock(Tracking("PPS", 800, True), 0.4) == ClockState.PPS`; `Tracking("PPS", 1500, True), 0.4` → `UNLOCKED`; `Tracking("GNSS", 20000, True), None` → `COARSE`; `None, None` → `UNLOCKED`; `Tracking("PPS", 800, True), 2.0` → `UNLOCKED`
  - `pps_anchor(1_700_000_000_000_200_000, 1_700_000_000_300_000_000, 50_000_000) == Anchor(49_700_200, unix_ns_to_gps_ns(1_700_000_000_000_000_000))`
  - `len(chrony_sock_sample(1_700_000_000_250_000_000, -0.002)) == 40` ve son 4 bayt `0x534F434B` little-endian
  - SSD: `tmp_path` mount değil → `present=False`; `monkeypatch` ile `os.path.ismount` True, `disk_usage` 10 GiB → `ssd_check_ok` False; yazma `PermissionError` → `error=True`
- [x] **Step 2:** `uv run pytest tests/test_clock.py tests/test_ssd.py -q` → FAIL.
- [x] **Step 3:** Yaz.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: PPS, chrony and SSD status"`

### Task 6: Alıcı: USB üzerinden yapılandırma ve akış

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/receiver.py`
- Test: `tests/test_receiver.py`

**Interfaces:**
- Consumes: `ubx.Framer`, `ubx.cfg_valset_ram`, `ubx.is_ack`, `ubx.parse_nav_pvt`, `chrony_sock_sample`
- Produces:
  - `USB_CONFIG: list[tuple[int, int, int]]` — `CFG-USBINPROT-UBX 0x10770001=1`, `CFG-USBOUTPROT-UBX 0x10780001=1`, `CFG-USBOUTPROT-NMEA 0x10780002=0`, `CFG-RATE-MEAS 0x30210001=200 (2 bayt)`, `CFG-RATE-NAV 0x30210002=1 (2 bayt)`, `CFG-MSGOUT-UBX_RXM_RAWX_USB 0x209102A7=5`, `CFG-MSGOUT-UBX_RXM_SFRBX_USB 0x20910234=1`, `CFG-MSGOUT-UBX_NAV_PVT_USB 0x20910009=1`, `CFG-TP-TIMEGRID_TP1 0x2005000C=1`
  - `RECEIVER_INFO: dict` — `session.json` `receiver` nesnesi: `model "ZED-F9P"`, `port "USB"`, `baud None`, `meas_period_ms 200`, `rawx_rate_hz 1`, `nav_pvt_rate_hz 5`, `messages ["RXM-RAWX","RXM-SFRBX","NAV-PVT"]`, `nmea False`, `timepulse_grid "GPS"`, `detected_baud None`; `config_status` çalışma anında eklenir
  - `class Transport(Protocol)`: `read(max_bytes: int) -> bytes` (zaman aşımında `b""`), `write(data: bytes) -> None`
  - `class Receiver`:
    - `__init__(transport: Transport, on_bytes: Callable[[bytes], None], on_pvt: Callable[[NavPvt, int], None])` — `on_pvt` ikinci argümanı alındığı anın `unix_ns`'i
    - `configure(attempts: int = 3, timeout_s: float = 1.0) -> str` — `"ok" | "nak" | "no_response"`; VALSET'i gönderir, ACK bekler (aradaki baytlar `on_bytes`'a gitmez, yapılandırma bitene kadar akış kaydedilmez)
    - `poll() -> None` — okunan her baytı `on_bytes`'a verir (kayıt yoksa çağıran atar), NAV-PVT'leri çözer, `last_rx_mono_us` günceller
  - `class SerialTransport` (pyserial, `/dev/serial/by-id/usb-u-blox*` ilk eşleşme ya da yapılandırmadaki yol, `timeout=0.1`; USB koparsa `read` `b""` döndürür ve her çağrıda yeniden açmayı dener, `reconnected` bayrağını bir kez True yapar) ve `class FakeTransport` (testler; `script: list[bytes]`, yazılanları biriktirir, VALSET'e ACK/NAK cevabı programlanabilir, `disconnect()` / `reconnect()`)
  - `Receiver.poll()` taşıyıcı yeniden bağlandığında `configure()`'ı yeniden çalıştırır (alıcı yalnız RAM'e yazıldığı için ayarı kaybetmiş olabilir).

- [x] **Step 1: Write the failing tests**

```python
def test_configure_sends_usb_keys_and_waits_for_ack():
    t = FakeTransport(respond_to_valset="ack")
    assert Receiver(t, lambda b: None, lambda p, n: None).configure() == "ok"
    sent = t.written[0]
    assert (0x209102A7).to_bytes(4, "little") + b"\x05" in sent      # RAWX on USB, 1 Hz
    assert (0x10780002).to_bytes(4, "little") + b"\x00" in sent      # NMEA off on USB

def test_configure_reports_nak_and_no_response(): ...  # "nak" ; respond_to_valset=None -> "no_response"

def test_reconfigures_after_usb_reconnect(): ...  # FakeTransport.disconnect(); poll(); reconnect(); poll() -> a second VALSET in t.written

def test_poll_passes_raw_bytes_through_and_decodes_pvt():
    pvt = frame(0x01, 0x07, PVT_PAYLOAD); rawx = frame(0x02, 0x15, bytes(16))
    got, pvts = [], []
    r = Receiver(FakeTransport(script=[rawx + pvt[:20], pvt[20:]]), got.append, lambda p, n: pvts.append(p))
    r.poll(); r.poll()
    assert b"".join(got) == rawx + pvt and len(pvts) == 1
```

- [x] **Step 2:** `uv run pytest tests/test_receiver.py -q` → FAIL.
- [x] **Step 3:** Yaz.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: receiver configuration over USB and raw stream"`

### Task 7: LiDAR izleme ve MCAP kaydı

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/lidar.py`
- Test: `tests/test_lidar.py`

**Interfaces:**
- Consumes: eşikler
- Produces:
  - `@dataclass LidarConfig(points_topic: str = "/unilidar/cloud", imu_topic: str = "/unilidar/imu", ubx_topic: str = "/orchados/gnss_ubx", mode_command: list[str] | None = None)`
  - `@dataclass LidarSample(mono_us: int, points: int, imu_messages: int)` — son çağrıdan beri gelenler
  - `class LidarMonitor(Protocol)`: `drain() -> LidarSample`, `mode() -> Literal["unknown","ok","wrong"]` (son `apply_mode()` sonucunu döndürür, komut çalıştırmaz), `apply_mode() -> str` (kipi açıp doğrular; `Recorder` açılışta ve her `start_session` başında çağırır), `publish_ubx(data: bytes) -> None`
  - `class RosLidarMonitor` — `rclpy`'yi kurucuda import eder (yoksa `RuntimeError("ROS 2 not available")`); `PointCloud2` için `width*height` sayar, `Imu` mesajlarını sayar; ubx baytlarını `std_msgs/msg/UInt8MultiArray` olarak yayınlar; `mode()`: `mode_command` yoksa `"unknown"`, varsa komutu çalıştırır, çıkış 0 → `"ok"`, 3 → `"wrong"`, diğer → `"unknown"`
  - `class FakeLidarMonitor` — `rate_pps`, `imu_hz`, `silent: bool`, `mode_value` alanlarıyla
  - `class BagRecorder`:
    - `__init__(config: LidarConfig, popen=subprocess.Popen)`
    - `command(out_dir: Path) -> list[str]` — `["ros2","bag","record","-s","mcap","-o",str(out_dir/"bag"),"--max-bag-duration",str(BAG_SEGMENT_S),points_topic,imu_topic,ubx_topic]`
    - `start(out_dir: Path) -> None`, `stop(timeout_s: float = 10) -> None` (SIGINT, bekle, gerekirse SIGKILL), `alive() -> bool`
    - `written_bytes(out_dir: Path) -> int` (`out_dir/bag/*.mcap` toplamı), `segments(out_dir: Path) -> list[dict]` (`[{file: "bag/bag_0.mcap", bytes}]`)
  - `out_dir` = `SessionWriter.lidar_dir` (`lidar/raw/`); bag `lidar/raw/bag/`'e, `recording.json` `lidar/raw/`'a yazılır.

- [x] **Step 1: Write the failing tests**

```python
def test_bag_command_records_three_topics_as_mcap_segments(tmp_path):
    cmd = BagRecorder(LidarConfig()).command(tmp_path)
    assert cmd[:5] == ["ros2", "bag", "record", "-s", "mcap"]
    assert "--max-bag-duration" in cmd and cmd[cmd.index("--max-bag-duration") + 1] == "180"
    assert cmd[-3:] == ["/unilidar/cloud", "/unilidar/imu", "/orchados/gnss_ubx"]

def test_written_bytes_sums_mcap_segments(tmp_path): ...  # two fake .mcap files 10 + 20 bytes -> 30

def test_ros_monitor_requires_rclpy(monkeypatch):
    monkeypatch.setitem(sys.modules, "rclpy", None)
    with pytest.raises(RuntimeError, match="ROS 2 not available"): RosLidarMonitor(LidarConfig())

def test_mode_command_exit_codes(): ...  # use ["sh","-c","exit 0"] / "exit 3" / "exit 1" via a FakeLidarMonitor-free helper `run_mode_command(cmd) -> str`
```

- [x] **Step 2:** `uv run pytest tests/test_lidar.py -q` → FAIL.
- [x] **Step 3:** Yaz. `run_mode_command(cmd: list[str]) -> Literal["unknown","ok","wrong"]` ayrı ve test edilebilir bir fonksiyon olsun; `RosLidarMonitor.apply_mode()` onu çağırır ve sonucu saklar.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: LiDAR monitor and MCAP bag recorder"`

### Task 8: Ön kontrol, canlı uyarılar ve boşluk takibi

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/health.py`
- Test: `tests/test_health.py`

**Interfaces:**
- Consumes: `protocol.Check`, `protocol.Alert`, `clock.ClockState`, `ssd.SsdStatus`, `ssd.ssd_check_ok`, eşikler
- Produces:
  - `@dataclass Snapshot(mono_us: int, lidar_pps: float, imu_hz: float, lidar_last_mono_us: int | None, lidar_mode: str, gnss_last_mono_us: int | None, rx_config: str, clock: ClockState, ssd: SsdStatus, bag_bytes: int, bag_alive: bool)`
  - `precheck_failures(s: Snapshot) -> Check` — `LIDAR`: son veri `LIDAR_SILENT_S`'ten eski ya da `lidar_pps < LIDAR_EXPECTED_PPS*LIDAR_MIN_RATE_FRACTION`; `LIDAR_MODE`: `lidar_mode == "wrong"` (bilinmiyorsa geçer); `CLOCK`: `clock != PPS`; `SSD`: `not ssd_check_ok`; `GNSS`: `rx_config != "ok"` ya da son UBX `GNSS_SILENT_S`'ten eski
  - `class LiveHealth`:
    - `__init__(start_mono_us: int)`
    - `update(s: Snapshot) -> tuple[Alert, list[tuple[str, str]]]` — o anki uyarılar ve yazılacak olaylar (`("lidar_lost","")`, `("lidar_regained","")`, `("gnss_lost","")`, `("gnss_regained","")`, `("sd_error","lidar_write")`); her geçişte bir kez
    - `gap_count: int`, `longest_gap_s: int`, `gaps: list[dict]`, `alert_log: list[dict]` (`recording.json` için)
  - Uyarı kuralları: `LIDAR_SILENT` son veri > `LIDAR_SILENT_S`; `LIDAR_RATE_LOW` veri var ama oran düşük; `LIDAR_NOT_WRITTEN` `bag_alive` değil ya da `bag_bytes` `BAG_STALL_S` boyunca artmadı (oturumun ilk `BAG_STALL_S`'i hariç); `GNSS_SILENT`; `CLOCK_UNLOCKED` `clock != PPS`; `SSD_ERROR`; `SSD_LOW` `free_mib < SSD_LOW_GIB*1024`. Bir LiDAR boşluğu `LIDAR_SILENT` başladığı anda açılır, veri gelince kapanır; süre son veriden ilk yeni veriye kadardır.

- [x] **Step 1: Write the failing tests**

```python
def test_precheck_all_pass(): assert precheck_failures(healthy(t=10_000_000)) == Check(0)
def test_precheck_lidar_rate_low(): assert precheck_failures(healthy(lidar_pps=20_000)) == Check.LIDAR
def test_precheck_unknown_mode_passes(): assert Check.LIDAR_MODE not in precheck_failures(healthy(lidar_mode="unknown"))
def test_precheck_clock_and_ssd(): assert precheck_failures(healthy(clock=ClockState.COARSE, ssd=SsdStatus(True, 10_000, False))) == Check.CLOCK | Check.SSD

def test_lidar_gap_opens_and_closes_once():
    h = LiveHealth(0)
    a, ev = h.update(healthy(t=1_000_000, lidar_last=1_000_000))
    a, ev = h.update(healthy(t=5_000_000, lidar_last=1_000_000))
    assert Alert.LIDAR_SILENT in a and ev == [("lidar_lost", "")]
    a, ev = h.update(healthy(t=6_000_000, lidar_last=1_000_000)); assert ev == []
    a, ev = h.update(healthy(t=7_000_000, lidar_last=7_000_000))
    assert ev == [("lidar_regained", "")] and h.gap_count == 1 and h.longest_gap_s == 6

def test_alert_when_bag_bytes_stall_while_points_arrive():
    h = LiveHealth(0)
    for t in range(1, 25):  # seconds; bag_bytes frozen from t=5
        a, _ = h.update(healthy(t=t * 1_000_000, lidar_last=t * 1_000_000, bag_bytes=min(t, 5) * 10**6))
    assert Alert.LIDAR_NOT_WRITTEN in a and Alert.LIDAR_SILENT not in a

def test_dead_bag_process_is_not_written(): ...  # bag_alive=False -> LIDAR_NOT_WRITTEN immediately after start window
```

- [x] **Step 2:** `uv run pytest tests/test_health.py -q` → FAIL.
- [x] **Step 3:** Yaz. `healthy(...)` test yardımcısı `tests/conftest.py`'de: tüm maddeleri geçen bir `Snapshot` üretip anahtar kelimelerle alan değiştirir.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: pre-check, live alerts and LiDAR gaps"`

### Task 9: Kayıt çekirdeği (`Recorder`)

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/recorder.py`
- Test: `tests/test_recorder.py`

**Interfaces:**
- Consumes: Task 2–8'in hepsi (`Receiver`, `LidarMonitor`, `BagRecorder`, `SessionWriter`, `recover_open_sessions`, clock fonksiyonları, `probe_ssd`, `precheck_failures`, `LiveHealth`, `protocol`)
- Produces:
  - `@dataclass Deps(clock, transport: Transport, lidar: LidarMonitor, bag: BagRecorder, ssd_mount: Path, probe_ssd=probe_ssd)` — testlerde sahteler
  - `class Recorder`:
    - `__init__(deps: Deps, version: str = __version__)` — `recover_open_sessions` çağırır, alıcıyı yapılandırır
    - `handle_command(data: bytes) -> None` — sonucu `last_cmd_seq` / `last_cmd_result`'a yazar
    - `tick() -> bytes` — saniyede bir çağrılır: alıcıyı okur, LiDAR'ı boşaltır, saati ve SSD'yi değerlendirir, kayıttaysa olayları ve fsync'i yapar, durum mesajını (77 bayt) döndürür
    - `pump() -> None` — tick'ler arasında sık çağrılır: alıcıyı okur; kayıttaysa baytları `SessionWriter.append_gnss`'e ve `LidarMonitor.publish_ubx`'e verir (ham UBX hem `gnss.ubx`'te hem MCAP'te)
    - `recording: bool`, `session_id: str | None`
  - Davranış:
    - `start_session`: önce `lidar.apply_mode()`; kayıttaysa `ALREADY_RECORDING`; SSD yoksa `SD_MISSING`, boş alan `SSD_MIN_FREE_START_GIB`'tan azsa `SD_FULL`, hata `SD_ERROR`; `precheck_failures & ~override_mask` boş değilse `PRECHECK_FAILED`; klasör varsa `SESSION_EXISTS`; sonra `SessionWriter.create`, `BagRecorder.start(lidar_dir)`, `OK`
    - `stop_session`: kayıt yoksa `NOT_RECORDING`; bag durdur, `recording.json` yaz, `close(..., "command")`
    - `mark_event`: kayıt yoksa `NOT_RECORDING`; `corner` / `qr_sync` olayı
    - Kayıtta SSD kaybolur ya da yazma hatası → `close(..., "sd_error")` mümkünse, değilse yalnız durum; boş alan `SSD_STOP_MIB` altı → `"sd_full"`
    - Olay zamanı: saat `PPS` ise `TimeStamp(mono, gps)` + çapa; değilse `TimeStamp(mono, None)`, çapa yok

- [x] **Step 1: Write the failing tests** (hepsi sahte saat, `FakeTransport`, `FakeLidarMonitor`, sahte `popen` ve `tmp_path` SSD ile)

```python
def test_full_session_writes_files_and_status(rig):
    rig.cmd("01 07 03 53 2d 31 04 50 2d 31 32")          # start S-1 / P-12
    assert rig.status()[30] == Result.OK and rig.status()[1] == 1
    rig.cmd("03 08 02 " + qr_hex("OQ1:1476350122230:S-1")); rig.run(seconds=5)
    rig.cmd("02 09"); st = rig.status()
    assert st[30] == Result.OK and st[1] == 0
    d = rig.ssd / "sessions/S-1"
    assert [r.split(",")[2] for r in (d / "gnss/events.csv").read_text().splitlines()[1:]] == \
        ["session_start", "qr_sync", "session_stop"]
    assert (d / "gnss/gnss.ubx").stat().st_size > 0
    assert json.loads((d / "lidar/raw/recording.json").read_text())["schema"] == "orchados.lidar_recording/1"

def test_precheck_failure_blocks_start_unless_overridden(rig):
    rig.lidar.silent = True; rig.run(seconds=4)
    assert rig.status()[55] & Check.LIDAR
    rig.cmd("01 07 03 53 2d 31 04 50 2d 31 32"); assert rig.status()[30] == Result.PRECHECK_FAILED
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 01"); assert rig.status()[30] == Result.OK
    assert rig.status()[57] == Check.LIDAR

def test_ssd_cannot_be_overridden(rig): ...  # ssd missing -> SD_MISSING even with mask 0x07
def test_restart_same_session_id_is_rejected(rig): ...  # new Recorder on same SSD -> SESSION_EXISTS
def test_ssd_removed_mid_session_stops_with_sd_error(rig): ...  # probe returns present=False -> recording 0, stop_reason sd_error
def test_ble_disconnect_does_not_stop_recording(rig): ...  # Recorder has no BLE state; run ticks with no commands for 30 s -> still recording, gnss.ubx grows
def test_unlocked_clock_events_have_empty_gps_time(rig): ...  # clock COARSE + override clock -> session_start row has empty gps_time_ns
def test_status_reports_lidar_gap(rig): ...  # silent 5 s mid-session -> st[65:67] == 1, events contain lidar_lost then lidar_regained
```

- [x] **Step 2:** `uv run pytest tests/test_recorder.py -q` → FAIL.
- [x] **Step 3:** `recorder.py`'yi yaz. Açılışta `recover_open_sessions(ssd_mount)` çağrılır. `rig` fixture'ı `tests/conftest.py`'de: `Deps`'i sahtelerle kurar, `cmd(hex)`, `run(seconds)` (her saniye 10 `pump` + 1 `tick`, sahte saati ilerletir, sahte alıcıya saniyede bir RAWX ve beş NAV-PVT verir), `status() -> bytes`.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: recorder core"`

### Task 10: BLE sunucusu, komut satırı ve sahte çalışma

**Files:**
- Create: `services/kit-recorder/src/orchados_recorder/ble.py`, `src/orchados_recorder/config.py`, `src/orchados_recorder/cli.py`
- Create: `services/kit-recorder/config/recorder.toml` (örnek; Pi'da `/etc/orchados/recorder.toml`)
- Test: `tests/test_config.py`, `tests/test_cli.py`

**Interfaces:**
- Consumes: `Recorder`, `Deps`, `protocol` UUID'leri, gerçek ve sahte adaptörler
- Produces:
  - `config.load(path: Path) -> Config` — `[ssd] mount = "/mnt/orchados-ssd"`, `[receiver] port = "auto"`, `[lidar] points_topic`, `imu_topic`, `ubx_topic`, `mode_command = []`, `[chrony] sock = "/run/chrony.gnss.sock"`
  - `ble.device_name(mac: str) -> str` — `"2C:CF:67:12:1A:2B"` → `"orchados-gnss-1A2B"`
  - `ble.run_server(recorder: Recorder, name: str) -> None` (asyncio; `bless`: servis, durum read/notify, komut write; komut geldiğinde `handle_command` ve hemen durum bildirimi; her saniye `tick` ve bildirim). CI'da test edilmez; yalnız `device_name` test edilir.
  - CLI: `orchados-recorder run [--config PATH]` (gerçek donanım + BLE), `orchados-recorder fake-run <ssd_dir> --session-id ID --parcel-id ID --seconds N [--lidar-gap S]` (sahte saat ve kaynaklarla bir oturum yazar; BLE yok), `orchados-recorder version`
  - chrony beslemesi `run` içinde: her NAV-PVT'de (geçerli zaman) `chrony_sock_sample` Unix soketine gönderilir.

- [x] **Step 1: Write the failing tests**

```python
def test_device_name(): assert device_name("2C:CF:67:12:1A:2B") == "orchados-gnss-1A2B"
def test_config_defaults(tmp_path): ...  # empty file -> mount /mnt/orchados-ssd, topics defaults
def test_fake_run_writes_a_session(tmp_path):
    assert main(["fake-run", str(tmp_path), "--session-id", "S-1", "--parcel-id", "P-12",
                 "--seconds", "20", "--lidar-gap", "5"]) == 0
    events = (tmp_path / "sessions/S-1/gnss/events.csv").read_text()
    assert "lidar_lost" in events and "lidar_regained" in events
```

- [x] **Step 2:** `uv run pytest tests/test_config.py tests/test_cli.py -q` → FAIL.
- [x] **Step 3:** Yaz.
- [x] **Step 4:** `uv run pytest -q` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: BLE server, config and CLI"`

### Task 11: Pi kurulumu, servisler ve README

**Files:**
- Create: `services/kit-recorder/setup/install.sh`, `setup/chrony-orchados.conf`, `setup/orchados-recorder.service`, `setup/unilidar.service`, `setup/99-orchados-ssd.rules` (ya da fstab satırı), `setup/config.txt.append`
- Create: `services/kit-recorder/README.md`
- Modify: `CLAUDE.md` ("Komutlar" altına "Kit kaydedicisi (`services/kit-recorder/`)" tablosu)
- Test: `services/kit-recorder/tests/test_setup_files.py`

**Interfaces:**
- Consumes: CLI (`orchados-recorder run`), config yolu `/etc/orchados/recorder.toml`
- Produces (sabitler, README'de de yazılır):
  - `config.txt.append`: `dtoverlay=pps-gpio,gpiopin=18`, `usb_max_current_enable=1`
  - `chrony-orchados.conf`: `refclock SOCK /run/chrony.gnss.sock refid GNSS noselect`, `refclock PPS /dev/pps0 lock GNSS refid PPS prefer`, `makestep 1 -1`
  - SSD: dosya sistemi etiketi `ORCHADOS-SSD`, bağlama noktası `/mnt/orchados-ssd`, `nofail`
  - `unilidar.service`: L2 ROS 2 sürücüsünü başlatır (`ros2 launch` komutu sürücü derlenince README'deki adımla netleşir); `orchados-recorder.service` `After=unilidar.service chrony.service bluetooth.service`, `Restart=always`
  - `install.sh`: tekrar çalıştırılabilir (`set -euo pipefail`; her adım "zaten yapılmışsa atla"); ROS 2 Jazzy (ros-base), `chrony`, `pps-tools`, `bluez`, `uv`; `/opt/orchados/kit-recorder`'a kurulum; `uv venv --system-site-packages` (rclpy için); journald `SystemMaxUse=200M`; kullanılmayan servisleri kapatma (`snapd`, `unattended-upgrades`); L2 sürücüsünü `~/ros2_ws`'de derleme adımı ayrı bir fonksiyon (`build_unilidar`), başarısızlığı açık bir mesajla bildirir

- [x] **Step 1: Write the failing test**

```python
def test_setup_files_pin_contract_values():
    s = Path(__file__).parents[1] / "setup"
    assert "dtoverlay=pps-gpio,gpiopin=18" in (s / "config.txt.append").read_text()
    chrony = (s / "chrony-orchados.conf").read_text()
    assert "refclock PPS /dev/pps0 lock GNSS" in chrony and "/run/chrony.gnss.sock" in chrony
    assert "/run/chrony.gnss.sock" in (Path(__file__).parents[1] / "config/recorder.toml").read_text()
    assert "Restart=always" in (s / "orchados-recorder.service").read_text()
```

- [x] **Step 2:** `uv run pytest tests/test_setup_files.py -q` → FAIL.
- [x] **Step 3:** Dosyaları yaz. README (Türkçe): kart yazma (Ubuntu Server 24.04 arm64, Raspberry Pi Imager), ilk açılış, `sudo ./install.sh`, SSD'yi `ORCHADOS-SSD` etiketiyle biçimlendirme (`mkfs.ext4 -L ORCHADOS-SSD`), PPS teli (GPIO18, pin 12; 3,3 V; seri direnç), servis günlükleri (`journalctl -u orchados-recorder`), ofiste SSD'nin kopyalanması (`orchados-ingest push <ssd> --session-id <id>`), sahte çalışma. CLAUDE.md'ye komut tablosu: `uv sync` / `uv run pytest`, `uv run orchados-recorder fake-run ...`, Pi'da `sudo setup/install.sh`, `systemctl status orchados-recorder`.
- [x] **Step 4:** `uv run pytest -q && bash -n setup/install.sh && (command -v shellcheck && shellcheck setup/install.sh || true)` → PASS.
- [x] **Step 5: Commit** — `git commit -m "kit-recorder: Pi setup, services and README"`

### Task 12: SSD'nin işleme istasyonuna alınması ve hat

**Files:**
- Modify: `services/ingest/src/orchados_ingest/sources.py` (yeni düzen `kit-ssd`), ingest README'si
- Modify: `services/pipeline/src/orchados_pipeline/events.py:31-33` (`KNOWN_TYPES`'a yeni olaylar), `models.py:75` (docstring: "ESP32 GNSS logger or the kit recorder")
- Create: `services/pipeline/tests/data/kit_recorder_session/` (Task 10'daki `fake-run` çıktısının `gnss/` kısmı + elle yazılmış kısa kök `session.json`; MCAP yok)
- Test: `services/ingest/tests/test_sources.py`, `services/pipeline/tests/test_ingest.py`

**Interfaces:**
- Consumes: Task 1'deki klasör yapısı; Task 10'un `fake-run` komutu (fixture üretmek için bir kez)
- Produces: `LAYOUTS` içinde `"kit-ssd"`; `detect`: `sessions/<id>/gnss/` varsa `kit-ssd`, yalnız `sessions/<id>/` varsa `logger-card`. `kit-ssd`: `sessions/<id>/*` → oturum köküne aynı göreli yolla (`gnss/...`, `lidar/raw/...`); kimlikler `sessions/<id>/gnss/session.json`'dan.

- [x] **Step 1: Write the failing tests**

```python
# services/ingest/tests/test_sources.py
def test_kit_ssd_maps_session_to_root(tmp_path):
    s = tmp_path / "sessions/S-1"; (s / "gnss").mkdir(parents=True); (s / "lidar/raw/bag").mkdir(parents=True)
    (s / "gnss/session.json").write_text('{"session_id":"S-1","parcel_id":"P-12"}')
    (s / "gnss/gnss.ubx").write_bytes(b"x"); (s / "lidar/raw/bag/bag_0.mcap").write_bytes(b"y")
    p = plan(tmp_path, "S-1")
    assert p.layout == "kit-ssd"
    assert sorted(f.rel for f in p.files) == ["gnss/gnss.ubx", "gnss/session.json", "lidar/raw/bag/bag_0.mcap"]

# services/pipeline/tests/test_ingest.py
def test_kit_recorder_session_passes_ingest(tmp_path):
    session = copy_fixture("kit_recorder_session", tmp_path)
    manifest = build_manifest(ctx_for(session))
    assert not any("unknown event" in w for w in manifest.warnings)
    assert manifest.logger.recorder == "kit-recorder"   # extra key kept by LoggerSession
```

(`copy_fixture` ve `ctx_for`: `tests/test_ingest.py`'deki mevcut yardımcıları kullan; yoksa fixture klasörünü `tmp_path`'e kopyalayıp `RunContext` kuran iki küçük fonksiyon yaz.)

- [x] **Step 2:** `cd services/ingest && uv run pytest -q` ve `cd services/pipeline && uv run pytest tests/test_ingest.py -q` → FAIL.
- [x] **Step 3:** Yaz; fixture'ı `cd services/kit-recorder && uv run orchados-recorder fake-run <tmp> --session-id kit-00 --parcel-id <fixture parsel> --seconds 10` ile üret ve yalnız `gnss/`'i kopyala (kök `session.json`'u mevcut fixture'lardan birini örnek alarak yaz).
- [x] **Step 4:** İki servisin tüm testleri → PASS.
- [x] **Step 5: Commit** — `git commit -m "ingest and pipeline: accept the kit recorder's SSD session"`

### Task 13: Saha uygulaması: protokol ve sahte kaydedici

**Files:**
- Modify: `apps/field/lib/features/gnss/protocol/gnss_status.dart` (kit uzantısı), `protocol/command_result.dart` (`precheckFailed(10, ...)`), `protocol/gnss_command.dart` (`StartSession.overrideMask`), `gnss_logger.dart` (`startSession` imzası), `ble_gnss_logger.dart` (gerekirse yok), `fake_gnss_logger.dart` (`kit` kipi)
- Test: `apps/field/test/unit/gnss_protocol_test.dart`, `test/unit/gnss_logger_test.dart`

**Interfaces:**
- Produces:
  - `enum KitCheck { lidar(0x01,'LiDAR'), lidarMode(0x02,'LiDAR kipi'), clock(0x04,'Saat (PPS)'), ssd(0x08,'SSD'), gnss(0x10,'GNSS alıcısı') }` + `static const int overridableMask = 0x07`; `static List<KitCheck> fromMask(int)`
  - `enum KitAlert { lidarSilent(0x01,'LiDAR veri göndermiyor'), lidarRateLow(0x02,'LiDAR nokta hızı düşük'), lidarNotWritten(0x04,'LiDAR kaydı yazılmıyor'), gnssSilent(0x08,'GNSS alıcısı sustu'), clockUnlocked(0x10,'Saat GPS\'e kilitli değil'), ssdError(0x20,'SSD hatası'), ssdLow(0x40,'SSD\'de yer azaldı') }` + `fromMask`
  - `enum LidarState { neverSeen, streaming, lost }`, `enum LidarMode { unknown, ok, wrong }`, `enum KitClock { unlocked, coarse, pps }`
  - `class KitStatus` — uzantının alanları (`lidarState`, `lidarMode`, `clock`, `precheckFail: List<KitCheck>`, `alerts: List<KitAlert>`, `overrides: List<KitCheck>`, `lidarPointsPerS`, `imuHz`, `lidarGapCount`, `lidarLongestGapS`, `lidarWrittenMib`, `clockOffsetUs`)
  - `GnssStatus.kit: KitStatus?` (77 bayttan kısa mesajda null), `GnssStatus.lengthWithKit = 77`, `encode(..., KitStatus? kit)` 77 bayt yazar, `bool get isKit => kit != null`
  - `CommandResult.precheckFailed(10, 'Ön kontrol geçmedi')`
  - `StartSession({required seq, required sessionId, required parcelId, int? overrideMask})` — `encode` maske verilmişse sona bir bayt ekler; `decode` bir bayt fazlasını kabul eder, `0x07` dışı bit → `invalidArgument`
  - `GnssLogger.startSession({required String sessionId, required String parcelId, int? overrideMask})`; `GnssLoggerBase` maskeyi yalnız `lastStatus?.status.isKit == true` ise gönderir
  - `FakeGnssLogger({..., KitStatus? kit})` — `kit` verilirse 77 baytlık durum üretir; `startSession` maskesini ve `precheckFail`'i Pi gibi değerlendirir

- [x] **Step 1: Write the failing tests**

```dart
test('77-byte status decodes the kit extension', () {
  final bytes = healthyStatus.encode(includePosition: true, kit: const KitStatus(
    lidarState: LidarState.streaming, lidarMode: LidarMode.unknown, clock: KitClock.pps,
    precheckFail: [KitCheck.clock], alerts: [KitAlert.lidarSilent], overrides: [KitCheck.lidar],
    lidarPointsPerS: 64000, imuHz: 200, lidarGapCount: 2, lidarLongestGapS: 4,
    lidarWrittenMib: 900, clockOffsetUs: -12));
  expect(bytes.length, 77);
  expect(bytes[51], 1);
  final s = GnssStatus.decode(bytes);
  expect(s.kit!.lidarPointsPerS, 64000);
  expect(s.kit!.precheckFail, [KitCheck.clock]);
  expect(s.kit!.clockOffsetUs, -12);
});
test('51-byte status has no kit extension', () {
  expect(GnssStatus.decode(healthyStatus.encode(includePosition: true)).kit, isNull);
});
test('start_session override byte', () {
  const cmd = StartSession(seq: 7, sessionId: 'S-1', parcelId: 'P-12', overrideMask: 0x05);
  expect(cmd.encode(), hex('01 07 03 53 2D 31 04 50 2D 31 32 05'));
  expect(GnssCommand.decode(hex('01 07 03 53 2D 31 04 50 2D 31 32 08')).result,
      CommandResult.invalidArgument);
});
// gnss_logger_test.dart
test('start_session sends override byte only to the kit', () async { ... });
// FakeGnssLogger without kit -> written start command has no trailing byte even when overrideMask: 1 is passed
test('kit refuses start with failed pre-check unless overridden', () async { ... });
// FakeGnssLogger(kit: KitStatus(precheckFail: [KitCheck.lidar], ...)) -> precheckFailed; with overrideMask 0x01 -> ok
```

- [x] **Step 2:** `cd apps/field && flutter test test/unit/gnss_protocol_test.dart test/unit/gnss_logger_test.dart` → FAIL.
- [x] **Step 3:** Yaz. README hex örneği ve mevcut testler değişmeden geçmeli.
- [x] **Step 4:** `flutter analyze && flutter test test/unit` → PASS.
- [x] **Step 5: Commit** — `git commit -m "field: kit recorder status extension and pre-check override"`

### Task 14: Saha uygulaması: ön kontrol ekranı ve atlama

**Files:**
- Modify: `apps/field/lib/features/gnss/gnss_health.dart` (kit sağlık fonksiyonları; akü kit'te atlanır), `lib/features/gnss/gnss_panel.dart` (kit satırları), `lib/features/checklist/precheck_screen.dart` (`PrecheckResult`, kit maddeleri, atlama onayı), `lib/features/session/session_controller.dart` (`confirmPrecheck` + `start` maskeyi geçirir ve `session_start` verisine yazar)
- Test: `apps/field/test/widget/session_screen_test.dart` ya da yeni `test/widget/kit_precheck_test.dart`

**Interfaces:**
- Consumes: Task 13'teki `KitStatus`, `KitCheck`, `startSession(overrideMask:)`
- Produces:
  - `gnss_health.dart`: `bool batteryApplies(GnssStatus s) => !s.isKit`; `Health lidarHealth(GnssStatus s)`, `String lidarLabel(GnssStatus s)` (ör. `"64 bin nokta/sn"`, `"Veri yok"`, `"Kopuk"`), `Health clockHealth(GnssStatus s)` (`pps` ok, `coarse` warn, `unlocked` bad), `String clockLabel(GnssStatus s)` (`"GPS'e kilitli"`, `"Kaba (PPS yok)"`, `"Kilitsiz"`), `sdLabel` kit'te "SSD" metniyle
  - `PrecheckResult`: `batteryOk` kit'te her zaman true; yeni `Set<KitCheck> overrides`; `kitBlocking` = `precheckFail` içinde olup `overrides`'ta olmayan ya da atlanamayan maddeler; `allOk` = mevcut koşullar + `kitBlocking.isEmpty`
  - Ekran: kit bağlıyken "Kit" bölümünde her madde bir `StatusLine`; geçmeyen atlanabilir maddenin altında "Yine de başlat" anahtarı; açılırken onay iletişim kutusu, metinler:
    - LiDAR: "LiDAR kaydı olmadan başlatılsın mı? Bu taramada nokta bulutu olmayacak."
    - LiDAR kipi: "LiDAR kipi doğrulanamadı. Gövdenin alt kısmı kaydedilmeyebilir. Yine de başlatılsın mı?"
    - Saat: "Saat GPS'e kilitli değil. Zaman eşlemesi kaba olacak. Yine de başlatılsın mı?"
    - Düğmeler: "Vazgeç" / "Yine de başlat"
  - SSD ve GNSS alıcısı geçmezse anahtar gösterilmez.
  - `SessionController.confirmPrecheck(..., Set<KitCheck> kitOverrides = const {})`; `start()` maskeyi `startSession`'a geçirir; `session_start` olay verisindeki `precheck` haritasına `'kit_overrides': ['lidar', 'clock']` (boşsa eklenmez).

- [x] **Step 1: Write the failing widget tests**
  - `kit with failed clock shows the override switch and blocks start until confirmed`: `FakeGnssLogger(kit: ...precheckFail: [KitCheck.clock])`; başlat düğmesi pasif; anahtara dokun → iletişim kutusu metni görünür; "Yine de başlat" → düğme aktif.
  - `failed SSD has no override`: `precheckFail: [KitCheck.ssd]` → "Yine de başlat" yok.
  - `kit skips the battery item`: `batteryMv: 0` ve kit → akü maddesi engellemez.
  - `override goes to the logger and the start event`: başlatınca sahte kaydediciye giden komutun son baytı `0x04`; yerel `session_start` olayının verisinde `kit_overrides == ['clock']`.
- [x] **Step 2:** `flutter test test/widget/kit_precheck_test.dart` → FAIL.
- [x] **Step 3:** Yaz.
- [x] **Step 4:** `flutter analyze && flutter test` → PASS.
- [x] **Step 5: Commit** — `git commit -m "field: kit pre-check items and explicit override"`

### Task 15: Saha uygulaması: kayıt sırasında uyarı, ekran açık, özet

**Files:**
- Modify: `apps/field/pubspec.yaml` (`wakelock_plus`, `audioplayers`; sürümleri uygulama anındaki son kararlı sürüme sabitle ve lisanslarını yorumda yaz, mevcut üslupta)
- Create: `apps/field/lib/core/audio/alert_sound.dart`, `apps/field/assets/sounds/alert.wav` (üretici: `apps/field/tool/alert_sound.dart`, 0,4 sn 880 Hz sinüs, 16 bit mono 22 050 Hz; üretilen dosya commit'lenir)
- Modify: `lib/features/session/session_screen.dart` (kit uyarı bandı, LiDAR satırı, ekran açık), `lib/features/session/session_controller.dart` (son kit durumunu durdurma anında saklar), `lib/features/summary/visit_summary_screen.dart` (LiDAR satırı), `lib/app/providers.dart` (`alertSoundProvider`)
- Test: `apps/field/test/widget/session_screen_test.dart`, `test/widget/kit_summary_test.dart`

**Interfaces:**
- Consumes: `KitStatus.alerts`, `KitAlert.label`, Task 14'teki etiket fonksiyonları
- Produces:
  - `abstract interface class AlertSound { Future<void> play(); }`, `class AssetAlertSound implements AlertSound` (audioplayers), `class FakeAlertSound` (çağrı sayar); `alertSoundProvider`
  - Kural: kayıt sırasında yeni bir uyarı biti belirdiğinde ses bir kez çalar; uyarı sürdükçe her 10 sn'de bir tekrar çalar; bant uyarı sürdükçe görünür, hepsi kalkınca kaybolur. Bant metni `KitAlert.label`'ların ` · ` ile birleşimi; renk `Health.bad`.
  - Kayıt sürerken `WakelockPlus.enable()`, durunca ve ekrandan çıkınca `disable()` (Pi ve ESP32 ikisinde de).
  - Durdurma özeti (kit'te): "LiDAR: veri var, 2 boşluk (en uzun 4 sn), 900 MiB" ya da "LiDAR: veri yok"; atlanan maddeler varsa "Atlanan: LiDAR, Saat". ESP32 oturumunda satır yok.

- [x] **Step 1: Write the failing widget tests**
  - `kit alert shows a banner and plays once, again after 10 s`: kayıtta sahte durum `alerts: [lidarSilent]` → bant "LiDAR veri göndermiyor", `FakeAlertSound.count == 1`; sahte saat 10 sn ilerler → 2; uyarı kalkınca bant yok.
  - `ESP32 session shows no LiDAR line`: kit'siz kayıt ve özet → "LiDAR" metni yok.
  - `summary shows LiDAR gaps`: durdurmadan önceki kit durumu `lidarGapCount: 2, lidarLongestGapS: 4, lidarWrittenMib: 900` → özet metni yukarıdaki gibi.
- [x] **Step 2:** `flutter test test/widget/session_screen_test.dart test/widget/kit_summary_test.dart` → FAIL.
- [x] **Step 3:** Yaz. Wakelock çağrıları test ortamında bir sağlayıcı arkasında olsun (`wakelockProvider`), testte sahte.
- [x] **Step 4:** `flutter analyze && flutter test` → PASS.
- [x] **Step 5: Commit** — `git commit -m "field: kit alerts with sound, screen kept on, LiDAR summary"`

### Task 16: Belgeler ve sipariş listesi

**Files:**
- Modify: `docs/kit-siparis-listesi.md`, `docs/tarama-kiti.md`, `docs/MVP.md` (satır 450 civarı "GNSS kaydedici"), `docs/plan.md` (İP2 satırı, ilerleme tablosu, "sırada" listesi, kesme listesi maddesi)

- [x] **Step 1: kit-siparis-listesi.md:**
  - Durum bölümüne: "Elde var: Raspberry Pi 5 8 GB (soğutucu, saat pili, kutu) ve sistem kartı (microSD)".
  - Karar 2: "**Karar verildi (16 Kasım 2026, sahip): TUSAGA-Aktif.** İkinci alıcı ve baz kaydedicisi alınmaz."
  - Bölüm 1: 1.1–1.3 adet 1'e iner (alındı). Bölüm 2 (ESP32 kaydedici elektroniği) kaldırılır; yerine bir cümle: "ESP32 kaydedici kitten çıktı; işini Pi yapıyor ([tasarım](superpowers/specs/2026-11-16-pi-kayit-yazilimi-design.md)). Firmware repoda referans olarak duruyor."
  - Bölüm 3: akü 3 → 2 adet ("ikisi kit"), adaptör 2 adet kalır; 3.4 kalır.
  - Bölüm 4: 4.7 jalon çıkar.
  - Bölüm 7: 7.2 ve 7.3 "Elde var"; 7.9'a açıklama: "Alıcının zaman darbesi (PPS) çıkışından Pi'ın GPIO18'ine (pin 12) tel; 3,3 V ise seri 100–330 Ω direnç, 5 V ise gerilim bölücü".
  - Toplam tablosu ve "Kalanlar, kısaca" yeniden yazılır; "Sipariş sırası" 2. madde güncellenir.
- [x] **Step 2: tarama-kiti.md:** "Zaman senkronizasyonu" 1. madde: gpsd yerine "kayıt servisi alıcının zamanını chrony'ye verir, PPS ile kilitlenir"; "Sahadan merkeze iş akışı" 1. adım: Pi'ın Wi-Fi ağı yerine "telefon Pi'a Bluetooth ile bağlanır, durum saha uygulamasının ön kontrol ekranında"; Raspberry Pi satırında "Henüz alınmadı" → "Elde var"; kayıt yazılımına bağlantı.
- [x] **Step 3: MVP.md:** "GNSS kaydedici | ESP32 + microSD" satırı → "Kayıt bilgisayarı | Raspberry Pi 5 (kit kaydedicisi) | ... | ESP32 kaydedici kitten çıktı (16 Kasım 2026)".
- [x] **Step 4: plan.md:** İP2 tanımı "Kit monte; Pi kayıt yazılımı ham GNSS'i, PPS'i ve LiDAR'ı SSD'ye kaydediyor; telefona Bluetooth ile durum gönderiyor"; ilerleme tablosuna "Pi kayıt yazılımı" satırı (bu dalın durumu); "sırada" listesinde TUSAGA kararı ve kalan siparişler.
- [x] **Step 5:** `grep -n "ESP32" docs/kit-siparis-listesi.md docs/MVP.md docs/plan.md` çıktısını oku; kalan her geçiş "kitten çıktı / referans" anlamında olmalı.
- [x] **Step 6: Commit** — `git commit -m "Docs: TUSAGA decision, ESP32 out of the kit, Pi recorder"`

### Task 17: Donanımda ilk gün (elle, parçalar geldikçe)

Bu görev kod değil, sıralı bir deneme listesi. Sonuçlar `services/kit-recorder/README.md` "Donanım denemeleri" bölümüne ve [kit-siparis-listesi.md](../../kit-siparis-listesi.md) "Doğrulanacaklar"a işlenir.

- [ ] **Step 1 (yalnız Pi):** Ubuntu Server 24.04 kartı, `sudo setup/install.sh`; ikinci çalıştırma hatasız ve değişikliksiz biter. `orchados-recorder.service` çalışıyor; telefon `orchados-gnss-XXXX`'i buluyor; ön kontrolde LiDAR, saat ve GNSS "geçmedi", SSD durumu doğru.
- [ ] **Step 2 (L2 sürücüsü):** `build_unilidar` Jazzy'de derleniyor mu? Derlenmiyorsa hata çıktısını README'ye yaz ve yedek yol (ROS'suz C++ kaydedici) için ayrı bir tasarım notu aç; bu plan orada durur.
- [ ] **Step 3 (L2 bağlı):** `ros2 topic hz /unilidar/cloud` ve `/unilidar/imu`; konu adları farklıysa `recorder.toml`'u ve README'yi düzelt. Nokta hızı ~64 000. Negatif açı kipini SDK ile açıp geri okumayı dene; mümkünse `mode_command`'ı yaz.
- [ ] **Step 4 (F9P USB):** Yapılandırma `ok`; `gnss.ubx`'te RAWX ve SFRBX var (`convbin -r ubx`).
- [ ] **Step 5 (PPS):** Telin yeri, multimetreyle seviye; `sudo ppstest /dev/pps0`; `chronyc sources` PPS'i `*` ile seçiyor; durumda `clock_state = 2`.
- [ ] **Step 6 (iki saat):** Masada iki saatlik kayıt: boşluk yok, `recording.json`'da toplamlar tutarlı, SSD akımı yetiyor (`dmesg`'de USB hatası yok).
- [ ] **Step 7 (arıza):** LiDAR Ethernet'ini 10 sn çek → telefonda uyarı ve ses, sonra `lidar_regained`; SSD'yi çek → `sd_error` ile kapanış; gücü kes → açılışta `power_loss`, yeni kayıt kendiliğinden başlamıyor.
- [ ] **Step 8:** İşleme istasyonunda `orchados-ingest push <ssd> --session-id <id>` ve `orchados-pipeline run` `gnss/` kısmını işliyor.
