// DYNAMIS ZELOS — experimental MyoWare 2.0 Wireless Shield firmware.
// See LICENSE, docs/HARDWARE.md and docs/SAFETY.md before assembling hardware.
// Remove this shield from the sensor before programming or charging.
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <atomic>
#include <esp_timer.h>
#include "protocol.h"

#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "This reference build targets the original ESP32-WROOM, not ESP32-C3/S3."
#endif

// These are GPIO numbers, not board-dependent A4/A3 aliases.
constexpr uint8_t kRawPin = 36;
constexpr uint32_t kPeriodUs = 1000000 / zelos::kSampleRateHz;
constexpr uint32_t kMaxPacketAgeUs = 250000;
constexpr uint32_t kTimingToleranceUs = 250;
constexpr char kServiceUuid[] = "8f7e1000-6f4b-4a3e-9e9a-3c7b2d1a0001";
constexpr char kDataUuid[] = "8f7e1001-6f4b-4a3e-9e9a-3c7b2d1a0001";

struct Frame {
  uint8_t bytes[zelos::kPacketBytes];
  uint32_t firstSampleUs;
  uint32_t epoch;
};
QueueHandle_t frames = nullptr;
TaskHandle_t sampler = nullptr;
esp_timer_handle_t sampleTimer = nullptr;
BLECharacteristic* dataCharacteristic = nullptr;
BLE2902* subscription = nullptr;
std::atomic<bool> connected{false};
std::atomic<bool> subscribed{false};
std::atomic<bool> restartAdvertising{false};
std::atomic<uint32_t> connectionEpoch{0};
std::atomic<uint32_t> acquired{0};
std::atomic<uint32_t> missedTimerTicks{0};
std::atomic<uint32_t> timingBreaks{0};
std::atomic<uint32_t> queueDrops{0};
std::atomic<uint32_t> staleDrops{0};
std::atomic<uint32_t> notifyErrors{0};
std::atomic<uint32_t> notifyAccepted{0};
std::atomic<uint32_t> maxSpacingErrorUs{0};

class ConnectionCallbacks final : public BLEServerCallbacks {
  void onConnect(BLEServer* server, esp_ble_gatts_cb_param_t* param) override {
    subscribed.store(false);
    connectionEpoch.fetch_add(1);
    connected.store(true);
    // Request 7.5–15 ms, zero peripheral latency, 4 s supervision timeout.
    // The central may refuse; throughput must be measured on the actual host.
    server->updateConnParams(param->connect.remote_bda, 6, 12, 0, 400);
  }
  void onDisconnect(BLEServer*) override {
    connected.store(false);
    subscribed.store(false);
    connectionEpoch.fetch_add(1);
    restartAdvertising.store(true);
  }
};

class SubscriptionCallbacks final : public BLEDescriptorCallbacks {
  void onWrite(BLEDescriptor*) override {
    subscribed.store(subscription->getNotifications());
    connectionEpoch.fetch_add(1);  // Never replay pre-subscription samples.
  }
};

class DataCallbacks final : public BLECharacteristicCallbacks {
  void onStatus(BLECharacteristic*, Status status, uint32_t) override {
    if (status == SUCCESS_NOTIFY) notifyAccepted.fetch_add(1);
    else notifyErrors.fetch_add(1);
    // SUCCESS_NOTIFY means accepted by the stack, not received by the browser.
  }
};

void timerTick(void*) {
  // ESP_TIMER_TASK callback (not ISR): wake a separate acquisition task only.
  xTaskNotifyGive(sampler);
}

void sampleTask(void*) {
  uint16_t values[zelos::kSamplesPerPacket] = {};
  uint8_t count = 0;
  uint16_t sequence = 0;
  uint32_t firstUs = 0;
  uint32_t previousUs = 0;
  uint32_t epoch = connectionEpoch.load();
  bool havePrevious = false;

  for (;;) {
    const uint32_t ticks = ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    const uint32_t now = static_cast<uint32_t>(esp_timer_get_time());
    if (ticks > 1) missedTimerTicks.fetch_add(ticks - 1);
    const uint32_t currentEpoch = connectionEpoch.load();
    if (currentEpoch != epoch) {
      epoch = currentEpoch;
      count = 0;
      havePrevious = false;
      ++sequence;
      xQueueReset(frames);
    }
    if (!connected.load() || !subscribed.load()) {
      count = 0;
      havePrevious = false;
      continue;
    }
    uint32_t error = 0;
    if (havePrevious) {
      const uint32_t spacing = now - previousUs;  // Safe across 32-bit wrap.
      error = spacing > kPeriodUs ? spacing - kPeriodUs : kPeriodUs - spacing;
      if (error > maxSpacingErrorUs.load()) maxSpacingErrorUs.store(error);
    }
    if (ticks > 1 || error > kTimingToleranceUs) {
      // Do not invent samples to catch up. Discard the incomplete batch and
      // reserve a sequence number so the receiver sees a discontinuity.
      timingBreaks.fetch_add(1);
      count = 0;
      ++sequence;
    }
    previousUs = now;
    havePrevious = true;
    if (count == 0) firstUs = now;
    values[count++] = static_cast<uint16_t>(analogRead(kRawPin));
    acquired.fetch_add(1);
    if (count == zelos::kSamplesPerPacket) {
      Frame frame{};
      frame.firstSampleUs = firstUs;
      frame.epoch = epoch;
      if (zelos::encodePacket(frame.bytes, sizeof(frame.bytes), sequence++, firstUs, values)) {
        if (xQueueSend(frames, &frame, 0) != pdTRUE) queueDrops.fetch_add(1);
      }
      count = 0;
    }
  }
}

void fail(const char* reason) {
  Serial.println(reason);
  while (true) delay(1000);
}

void setup() {
  Serial.begin(115200);
  pinMode(kRawPin, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(kRawPin, ADC_11db);
  // Warm up ADC initialization before starting the timing loop.
  analogRead(kRawPin);
  frames = xQueueCreate(64, sizeof(Frame));
  if (!frames) fail("ERROR: cannot allocate sample queue");

  char name[24];
  snprintf(name, sizeof(name), "ZELOS-%04X", static_cast<unsigned>(ESP.getEfuseMac() & 0xffff));
  BLEDevice::init(name);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  BLEService* service = server->createService(kServiceUuid);
  dataCharacteristic = service->createCharacteristic(kDataUuid, BLECharacteristic::PROPERTY_NOTIFY);
  dataCharacteristic->setCallbacks(new DataCallbacks());
  subscription = new BLE2902();
  subscription->setCallbacks(new SubscriptionCallbacks());
  dataCharacteristic->addDescriptor(subscription);
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(kServiceUuid);
  advertising->setScanResponse(true);
  advertising->start();

  if (xTaskCreatePinnedToCore(sampleTask, "zelos-acquire", 4096, nullptr, 4, &sampler, 1) != pdPASS)
    fail("ERROR: cannot create acquisition task");
  esp_timer_create_args_t args{};
  args.callback = &timerTick;
  args.dispatch_method = ESP_TIMER_TASK;
  args.name = "zelos-1khz";
  args.skip_unhandled_events = false;
  if (esp_timer_create(&args, &sampleTimer) != ESP_OK ||
      esp_timer_start_periodic(sampleTimer, kPeriodUs) != ESP_OK)
    fail("ERROR: cannot start sample timer");

  Serial.printf("%s | RAW GPIO36 | protocol v1 | target 1000 Hz\n", name);
  Serial.println("Bench diagnostics only: remove shield from sensor before USB connection.");
}

void loop() {
  if (restartAdvertising.exchange(false)) {
    subscription->setNotifications(false);
    BLEDevice::startAdvertising();
  }
  Frame frame{};
  if (xQueueReceive(frames, &frame, pdMS_TO_TICKS(2)) == pdTRUE &&
      connected.load() && subscribed.load() && frame.epoch == connectionEpoch.load()) {
    const uint32_t age = static_cast<uint32_t>(esp_timer_get_time()) - frame.firstSampleUs;
    if (age <= kMaxPacketAgeUs) {
      dataCharacteristic->setValue(frame.bytes, sizeof(frame.bytes));
      dataCharacteristic->notify();  // Never called from the sampling task.
    } else {
      staleDrops.fetch_add(1);
    }
  }
  static uint32_t lastReportMs = 0;
  const uint32_t nowMs = millis();
  if (nowMs - lastReportMs >= 5000) {
    lastReportMs = nowMs;
    Serial.printf("samples=%lu missed_ticks=%lu timing_breaks=%lu max_spacing_error_us=%lu queue_drops=%lu stale_drops=%lu notify_accepted=%lu notify_errors=%lu\n",
      static_cast<unsigned long>(acquired.load()), static_cast<unsigned long>(missedTimerTicks.load()),
      static_cast<unsigned long>(timingBreaks.load()), static_cast<unsigned long>(maxSpacingErrorUs.load()),
      static_cast<unsigned long>(queueDrops.load()), static_cast<unsigned long>(staleDrops.load()),
      static_cast<unsigned long>(notifyAccepted.load()), static_cast<unsigned long>(notifyErrors.load()));
  }
}
