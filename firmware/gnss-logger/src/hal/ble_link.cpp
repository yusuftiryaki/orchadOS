#include "ble_link.h"

#include <NimBLEDevice.h>
#include <esp_mac.h>

#include <cstring>

namespace gl {

namespace {

BleLink::CommandQueue* g_queue = nullptr;
NimBLECharacteristic* g_status = nullptr;
NimBLEServer* g_server = nullptr;

class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    if (!g_queue) return;
    const NimBLEAttValue v = c->getValue();
    RawCommand cmd{};
    cmd.len = static_cast<uint16_t>(v.length());
    cmd.oversized = v.length() > sizeof(cmd.data);
    std::memcpy(cmd.data, v.data(), cmd.oversized ? 2 : v.length());
    g_queue->push(cmd);
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer*) override {
    // Recording is independent of the link; just advertise again.
    NimBLEDevice::startAdvertising();
  }
};

}  // namespace

void BleLink::begin(CommandQueue* queue) {
  g_queue = queue;
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_BT);
  char name[24];
  snprintf(name, sizeof(name), "orchados-gnss-%02X%02X", mac[4], mac[5]);

  NimBLEDevice::init(name);
  NimBLEDevice::setMTU(247);
  g_server = NimBLEDevice::createServer();
  g_server->setCallbacks(new ServerCallbacks());
  NimBLEService* svc = g_server->createService(ble::kServiceUuid);
  g_status = svc->createCharacteristic(
      ble::kStatusUuid, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* cmd = svc->createCharacteristic(
      ble::kCommandUuid, NIMBLE_PROPERTY::WRITE, ble::kMaxCommandLen);
  cmd->setCallbacks(new CommandCallbacks());
  svc->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(ble::kServiceUuid);
  adv->setScanResponse(true);
  adv->start();
}

void BleLink::publishStatus(const uint8_t* data, size_t len) {
  if (!g_status) return;
  g_status->setValue(data, len);
  if (connected()) g_status->notify();
}

bool BleLink::connected() const {
  return g_server && g_server->getConnectedCount() > 0;
}

}  // namespace gl
