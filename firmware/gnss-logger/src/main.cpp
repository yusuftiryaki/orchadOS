// orchadOS GNSS logger: ZED-F9P raw data + PPS time to microSD, status over
// BLE. See README.md for wiring, file formats and the BLE protocol.
//
// Tasks:
//   uart   (prio 10) reads the receiver, parses NAV-PVT, fills the SD buffer
//   logger (prio 5)  owns the SD card, time sync, commands and BLE status
//   loop   (prio 1)  drives the LED
// The PPS ISR only timestamps edges.

#include <Arduino.h>
#include <SPI.h>
#include <esp_task_wdt.h>
#include <esp_timer.h>

#include <atomic>

#include "app_config.h"
#include "ble_protocol.h"
#include "double_buffer.h"
#include "hal/ble_link.h"
#include "hal/esp32_hal.h"
#include "indicators.h"
#include "nav_pvt.h"
#include "pins.h"
#include "receiver_config.h"
#include "ring_buffer.h"
#include "session.h"
#include "time_sync.h"
#include "ubx.h"
#include "version.h"

using namespace gl;

namespace {

struct PvtSample {
  NavPvt pvt;
  int64_t rxMicros;
};

// PPS edge, written by the ISR.
portMUX_TYPE g_ppsMux = portMUX_INITIALIZER_UNLOCKED;
volatile int64_t g_ppsEdge = 0;
volatile uint32_t g_ppsCount = 0;

// SD double buffer, shared by the uart and logger tasks under g_bufMux.
portMUX_TYPE g_bufMux = portMUX_INITIALIZER_UNLOCKED;
uint8_t g_bufA[kSdBufferBytes];
uint8_t g_bufB[kSdBufferBytes];
DoubleBuffer g_buffer(g_bufA, g_bufB, kSdBufferBytes);

RingBuffer<PvtSample, 16> g_pvtQueue;  // uart -> logger
BleLink::CommandQueue g_cmdQueue;      // BLE host -> logger

std::atomic<bool> g_recording{false};
std::atomic<bool> g_booting{true};
std::atomic<bool> g_error{false};

ArduinoClock g_clock;
UartPort g_uart(Serial2);
SdStorage g_sd(kPinSdCs, kSdSpiHz);
TimeSync g_time;
Recorder g_recorder(g_sd, g_time);
BleLink g_ble;

cfg::ReceiverSettings g_settings;
ConfigResult g_config;

void IRAM_ATTR onPpsEdge() {
  const int64_t t = esp_timer_get_time();
  portENTER_CRITICAL_ISR(&g_ppsMux);
  g_ppsEdge = t;
  g_ppsCount = g_ppsCount + 1;
  portEXIT_CRITICAL_ISR(&g_ppsMux);
}

void uartTask(void*) {
  esp_task_wdt_add(nullptr);
  static uint8_t payload[128];  // enough for NAV-PVT; RAWX is skipped
  ubx::Parser parser(payload, sizeof(payload));
  static uint8_t chunk[1024];
  for (;;) {
    esp_task_wdt_reset();
    const size_t n = g_uart.read(chunk, sizeof(chunk));
    if (n == 0) {
      vTaskDelay(pdMS_TO_TICKS(2));
      continue;
    }
    const int64_t rx = esp_timer_get_time();
    for (size_t i = 0; i < n; ++i) {
      if (parser.push(chunk[i]) != ubx::Parser::Result::kFrame) continue;
      const ubx::Frame& f = parser.frame();
      if (f.msgClass == ubx::kClassNav && f.msgId == ubx::kIdNavPvt) {
        PvtSample s;
        if (decodeNavPvt(f.payload, f.length, &s.pvt)) {
          s.rxMicros = rx;
          g_pvtQueue.push(s);
        }
      }
    }
    if (g_recording.load()) {
      const uint32_t ms = millis();
      portENTER_CRITICAL(&g_bufMux);
      g_buffer.append(chunk, n, ms);
      portEXIT_CRITICAL(&g_bufMux);
    }
  }
}

// Writes buffered receiver data to the card; with `drain` also the partly
// filled active buffer (used on stop).
void writeBuffered(bool drain) {
  for (int pass = 0; pass < 2; ++pass) {
    const uint8_t* data = nullptr;
    size_t len = 0;
    portENTER_CRITICAL(&g_bufMux);
    if (!g_buffer.ready()) {
      if (drain) {
        g_buffer.swapNow();
      } else {
        g_buffer.swapIfDue(millis(), kSdFlushIntervalMs);
      }
    }
    if (g_buffer.ready()) {
      data = g_buffer.readyData();
      len = g_buffer.readySize();
    }
    portEXIT_CRITICAL(&g_bufMux);
    if (!data) return;
    // Written outside the lock: the producer never touches the standby
    // buffer until release().
    if (g_recorder.recording()) {
      g_recorder.writeGnss(data, len, esp_timer_get_time());
    }
    portENTER_CRITICAL(&g_bufMux);
    g_buffer.release();
    portEXIT_CRITICAL(&g_bufMux);
    if (!drain) return;
  }
}

uint64_t g_droppedAtStart = 0;

uint64_t sessionDropped() {
  portENTER_CRITICAL(&g_bufMux);
  const uint64_t d = g_buffer.dropped();
  portEXIT_CRITICAL(&g_bufMux);
  return d - g_droppedAtStart;
}

ble::ResultCode startSession(const ble::Command& c) {
  portENTER_CRITICAL(&g_bufMux);
  g_buffer.clear();
  g_droppedAtStart = g_buffer.dropped();
  portEXIT_CRITICAL(&g_bufMux);
  const ble::ResultCode r =
      g_recorder.start(c.sessionId, c.parcelId, esp_timer_get_time());
  if (r == ble::ResultCode::kOk) g_recording.store(true);
  return r;
}

ble::ResultCode stopSession(const std::string& reason) {
  if (!g_recorder.recording()) return ble::ResultCode::kNotRecording;
  g_recording.store(false);
  writeBuffered(true);
  g_recorder.setDroppedBytes(sessionDropped());
  return g_recorder.stop(esp_timer_get_time(), reason);
}

ble::ResultCode handleCommand(const RawCommand& raw, uint8_t* seq) {
  *seq = raw.len >= 2 ? raw.data[1] : 0;
  if (raw.oversized) return ble::ResultCode::kMalformed;
  ble::Command c;
  const ble::ResultCode r = ble::decodeCommand(raw.data, raw.len, &c);
  if (r != ble::ResultCode::kOk) return r;
  switch (c.op) {
    case ble::Opcode::kStartSession:
      return startSession(c);
    case ble::Opcode::kStopSession:
      return stopSession("command");
    case ble::Opcode::kMarkEvent:
      return g_recorder.mark(ble::markEventType(c.mark), c.payload,
                             esp_timer_get_time());
  }
  return ble::ResultCode::kUnknownOpcode;
}

uint16_t readBatteryMv() {
  uint32_t sum = 0;
  for (int i = 0; i < 8; ++i) sum += analogReadMilliVolts(kPinBattery);
  return batteryMillivolts(sum / 8, kBatteryDividerTopOhm,
                           kBatteryDividerBottomOhm);
}

void loggerTask(void*) {
  esp_task_wdt_add(nullptr);
  g_recorder.setReceiverInfo(g_settings, g_config);
  g_recorder.refreshCard();

  uint32_t lastPpsCount = 0;
  bool havePvt = false;
  NavPvt lastPvt{};
  uint8_t lastSeq = 0;
  uint8_t lastResult = static_cast<uint8_t>(ble::ResultCode::kNone);
  uint32_t lastStatusMs = 0;
  uint32_t lastCardCheckMs = millis();
  uint16_t batteryMv = readBatteryMv();

  for (;;) {
    esp_task_wdt_reset();
    const int64_t now = esp_timer_get_time();

    portENTER_CRITICAL(&g_ppsMux);
    const uint32_t ppsCount = g_ppsCount;
    const int64_t ppsEdge = g_ppsEdge;
    portEXIT_CRITICAL(&g_ppsMux);
    if (ppsCount != lastPpsCount) {
      lastPpsCount = ppsCount;
      g_time.onPps(ppsEdge);
    }

    PvtSample s;
    while (g_pvtQueue.pop(&s)) {
      g_time.onNavPvt(s.pvt, s.rxMicros);
      lastPvt = s.pvt;
      havePvt = true;
    }

    switch (g_time.update(now)) {
      case TimeSync::Transition::kLost:
        g_recorder.logEvent(EventType::kPpsLost, "", now);
        break;
      case TimeSync::Transition::kRegained:
        g_recorder.logEvent(EventType::kPpsRegained, "", now);
        break;
      case TimeSync::Transition::kNone:
        break;
    }

    bool publishNow = false;
    RawCommand raw;
    while (g_cmdQueue.pop(&raw)) {
      lastResult = static_cast<uint8_t>(handleCommand(raw, &lastSeq));
      publishNow = true;
    }

    writeBuffered(false);
    if (g_recording.load() && !g_recorder.recording()) {
      // The recorder stopped itself (card full or write error).
      g_recording.store(false);
      publishNow = true;
    }
    if (g_recorder.recording()) g_recorder.setDroppedBytes(sessionDropped());

    const uint32_t ms = millis();
    if (!g_recorder.recording() && ms - lastCardCheckMs >= kSdIdleRefreshMs) {
      lastCardCheckMs = ms;
      g_recorder.refreshCard();
    }

    g_error.store(g_config.status != ConfigStatus::kOk ||
                  !g_recorder.sdPresent() || g_recorder.sdError() ||
                  (!g_recorder.recording() && g_recorder.sdLowSpace()));

    if (publishNow || ms - lastStatusMs >= kStatusIntervalMs) {
      lastStatusMs = ms;
      batteryMv = readBatteryMv();
      ble::Status st;
      st.recording = g_recorder.recording() ? 1 : 0;
      // GPS time of the moment the message is built; 0 without a mapping.
      st.gpsTimeNs = ble::statusGpsTimeNs(g_time, esp_timer_get_time());
      const bool timeMapped = st.gpsTimeNs != 0;
      st.flags = (g_recorder.sdPresent() ? ble::flags::kSdPresent : 0) |
                 (g_recorder.sdLowSpace() ? ble::flags::kSdLowSpace : 0) |
                 (g_recorder.sdError() ? ble::flags::kSdError : 0) |
                 (timeMapped ? ble::flags::kTimeMapped : 0) |
                 (g_recorder.meta().droppedBytes > 0 ? ble::flags::kDataDropped
                                                     : 0) |
                 (havePvt && lastPvt.gnssFixOk ? ble::flags::kGnssFixOk : 0);
      st.rxConfig = static_cast<uint8_t>(g_config.status);
      st.ppsState = static_cast<uint8_t>(g_time.ppsState());
      if (havePvt) {
        st.fixType = lastPvt.fixType;
        st.carrSoln = static_cast<uint8_t>(lastPvt.carrSoln);
        st.numSv = lastPvt.numSv;
        st.hAccMm = lastPvt.hAccMm;
      }
      st.bytesWritten = static_cast<uint32_t>(g_recorder.bytesWritten());
      st.sdFreeMib = static_cast<uint32_t>(g_recorder.freeBytes() >> 20);
      st.batteryMv = batteryMv;
      st.fwMajor = kFwMajor;
      st.fwMinor = kFwMinor;
      st.fwPatch = kFwPatch;
      st.droppedBytes = static_cast<uint32_t>(g_recorder.meta().droppedBytes);
      st.lastCmdSeq = lastSeq;
      st.lastCmdResult = lastResult;
      uint8_t buf[ble::kStatusLen];
      ble::encodeStatus(st, buf);
      g_ble.publishStatus(buf, sizeof(buf));
    }

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

}  // namespace

void setup() {
  pinMode(kPinLed, OUTPUT);
  digitalWrite(kPinLed, HIGH);
  Serial.begin(115200);
  Serial.printf("orchadOS gnss-logger %s\n", kFwVersion);

  esp_task_wdt_init(kWatchdogTimeoutS, true);

  analogSetPinAttenuation(kPinBattery, ADC_11db);
  SPI.begin(kPinSdSck, kPinSdMiso, kPinSdMosi, kPinSdCs);

  Serial2.setRxBufferSize(kUartRxBufferBytes);
  Serial2.begin(kGnssBootBaud, SERIAL_8N1, kPinGnssRx, kPinGnssTx);

  g_settings.receiverUart = GNSS_RECEIVER_UART;
  g_settings.baud = kGnssBaud;
  g_settings.measPeriodMs = kGnssMeasPeriodMs;
  g_settings.rawRateHz = GNSS_RAW_RATE_HZ;
  g_settings.pvtRateHz = kGnssPvtRateHz;
  g_config = configureReceiver(g_uart, g_clock, g_settings);
  Serial.printf("receiver config: status=%u baud=%lu attempts=%u\n",
                static_cast<unsigned>(g_config.status),
                static_cast<unsigned long>(g_config.detectedBaud),
                g_config.attempts);
  if (g_config.status != ConfigStatus::kOk) {
    // Keep listening at the target baud; status and LED report the failure.
    g_uart.setBaud(kGnssBaud);
  }

  pinMode(kPinPps, INPUT);
  attachInterrupt(digitalPinToInterrupt(kPinPps), onPpsEdge, RISING);

  g_ble.begin(&g_cmdQueue);

  xTaskCreatePinnedToCore(uartTask, "uart", 4096, nullptr, 10, nullptr, 1);
  xTaskCreatePinnedToCore(loggerTask, "logger", 8192, nullptr, 5, nullptr, 1);
  g_booting.store(false);
}

void loop() {
  const LedMode mode =
      selectLedMode(g_booting.load(), g_error.load(), g_recording.load());
  digitalWrite(kPinLed, ledLevel(mode, millis()) ? HIGH : LOW);
  delay(20);
}
