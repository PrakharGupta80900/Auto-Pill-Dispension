#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

String wifiSsid = "test";
String wifiPassword = "gupta80900";
String apiBaseUrl = "http://10.224.38.158:5000/api";
String deviceId = "esp32-001";
String firmwareVersion = "1.0.0";

const int SERVO_PIN = 18;
const int IR_SENSOR_PIN = 34;
const int BUZZER_PIN = 25;

Servo dispenserServo;

unsigned long lastPollAt = 0;
const unsigned long POLL_INTERVAL_MS = 5000;
unsigned long lastSensorLogAt = 0;
const unsigned long SENSOR_LOG_INTERVAL_MS = 1000;
unsigned long lastHeartbeatAt = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;
unsigned long lastAlertStatePollAt = 0;
const unsigned long ALERT_STATE_POLL_INTERVAL_MS = 2000;

// Servo slots
int currentSlot = 0;
const int totalSlots = 4;

// Event control
String lastEventId = "";
bool waitingForPickup = false;
String activeEventId = "";
unsigned long pickupStartTime = 0;
const unsigned long PICKUP_WINDOW = 120000; // 2 min

bool postJson(String endpoint, DynamicJsonDocument &doc) {
  if (!connectWiFi()) return false;

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(apiBaseUrl + endpoint);
  http.addHeader("Content-Type", "application/json");

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  http.end();

  if (code < 200 || code >= 300) {
    Serial.print("HTTP POST failed: ");
    Serial.println(code);
    return false;
  }

  return true;
}

bool getJson(String endpoint, DynamicJsonDocument &doc) {
  if (!connectWiFi()) return false;

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(apiBaseUrl + endpoint);

  int code = http.GET();

  if (code != 200) {
    http.end();
    return false;
  }

  String response = http.getString();
  http.end();

  return deserializeJson(doc, response) == DeserializationError::Ok;
}

// ================= HARDWARE =================

// LOW-trigger buzzer
void setAlertState(bool on) {
  digitalWrite(BUZZER_PIN, on ? LOW : HIGH);
}

// ✅ STRONG STABLE DETECTION
bool isMedicinePresentStable() {
  int count = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(IR_SENSOR_PIN) == LOW) count++;
    delay(20);
  }
  return count >= 4;
}

bool isMedicineRemovedStable() {
  int count = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(IR_SENSOR_PIN) == HIGH) count++;
    delay(20);
  }
  return count >= 4;
}

// Servo rotation
void dispensePills() {
  Serial.println("⚙️ Rotating to next compartment...");

  currentSlot = (currentSlot + 1) % totalSlots;
  int angle = map(currentSlot, 0, totalSlots - 1, 0, 180);

  dispenserServo.write(angle);

  Serial.print("Slot: ");
  Serial.print(currentSlot);
  Serial.print(" | Angle: ");
  Serial.println(angle);

  delay(800);
}

// ================= WIFI =================

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.println("Connecting to WiFi...");
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    return true;
  }

  Serial.println("\nWiFi Failed!");
  return false;
}

// ================= PICKUP LOGIC =================

void processPickupState() {
  if (!waitingForPickup) return;

  if (millis() - lastAlertStatePollAt >= ALERT_STATE_POLL_INTERVAL_MS) {
    lastAlertStatePollAt = millis();

    DynamicJsonDocument alertDoc(512);
    if (getJson("/device/alerts/" + activeEventId + "/state?deviceId=" + deviceId, alertDoc)) {
      bool remoteBuzzer = alertDoc["alertState"]["buzzer"] | false;
      setAlertState(remoteBuzzer);
    }
  }

  if (isMedicineRemovedStable()) {
    Serial.println("Medicine removed from tray");

    DynamicJsonDocument doc(256);
    doc["eventId"] = activeEventId;
    doc["deviceId"] = deviceId;
    doc["pickupDetected"] = true;
    doc["sensorState"] = "pickup_confirmed";

    postJson("/device/pickup", doc);

    setAlertState(false);
    waitingForPickup = false;
    activeEventId = "";
    return;
  }

  if (millis() - pickupStartTime > PICKUP_WINDOW) {
    Serial.println("Pickup timeout: buzzer OFF");

    DynamicJsonDocument doc(256);
    doc["eventId"] = activeEventId;
    doc["deviceId"] = deviceId;
    doc["pickupDetected"] = false;
    doc["sensorState"] = "not_picked_up";
    postJson("/device/pickup", doc);

    setAlertState(false);
    waitingForPickup = false;
    activeEventId = "";
  }
}

// ================= MAIN QUEUE =================

void handleDoseQueue() {
  if (!connectWiFi()) return;
  if (waitingForPickup) return;

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(apiBaseUrl + "/device/queue?deviceId=" + deviceId);

  Serial.println("Checking schedule");

  int code = http.GET();

  if (code != 200) {
    Serial.print("Queue error: ");
    Serial.println(code);
    http.end();
    return;
  }

  String response = http.getString();
  http.end();

  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, response)) {
    Serial.println("Queue JSON parse error");
    return;
  }

  JsonArray queue;
  if (doc.is<JsonArray>()) {
    queue = doc.as<JsonArray>();
  } else if (doc["queue"].is<JsonArray>()) {
    queue = doc["queue"].as<JsonArray>();
  } else {
    Serial.println("Queue payload format not supported");
    return;
  }

  for (JsonObject item : queue) {
    String eventId = item["eventId"].as<String>();
    if (eventId.length() == 0) continue;

    if (eventId == lastEventId) continue;

    Serial.println("New schedule event: " + eventId);

    // STEP 1: ROTATE
    dispensePills();

    // STEP 2: WAIT FOR MEDICINE DETECTION (FIXED)
    bool detected = false;
    unsigned long waitStart = millis();

    while (millis() - waitStart < 3000) {
      if (isMedicinePresentStable()) {
        detected = true;
        break;
      }
      delay(50);
    }

    // STEP 3: BUZZER CONTROL
    if (detected) {
      Serial.println("Medicine detected: buzzer ON");
      setAlertState(true);
    } else {
      Serial.println("Medicine not detected");
      setAlertState(false); // failsafe
    }

    // STEP 4: BACKEND UPDATE
    DynamicJsonDocument postDoc(256);
    postDoc["eventId"] = eventId;
    postDoc["deviceId"] = deviceId;
    postDoc["medicineDetected"] = detected;
    postDoc["sensorState"] = detected ? "pill_detected" : "pill_not_detected";

    postJson("/device/dispense", postDoc);

    // STEP 5: START PICKUP WINDOW
    if (detected) {
      waitingForPickup = true;
      activeEventId = eventId;
      pickupStartTime = millis();
    } else {
      waitingForPickup = false;
      activeEventId = "";
    }

    // Mark as processed only after physical dispense attempt.
    lastEventId = eventId;

    break;
  }
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["deviceId"] = deviceId;
  doc["firmwareVersion"] = firmwareVersion;
  doc["wifiSsid"] = WiFi.SSID();
  postJson("/devices/heartbeat", doc);
}

// ================= SETUP =================

void setup() {
  Serial.begin(115200);

  WiFi.mode(WIFI_STA);

  pinMode(IR_SENSOR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  delay(1000); // 🔥 stabilize pins
  setAlertState(false); // OFF initially

  dispenserServo.attach(SERVO_PIN);
  dispenserServo.write(0);

  connectWiFi();
}

// ================= LOOP =================

void loop() {

  // 🔥 FAILSAFE: ensure buzzer OFF when idle
  if (!waitingForPickup) {
    setAlertState(false);
  }

  // Throttle sensor logs to avoid flooding serial output.
  if (millis() - lastSensorLogAt >= SENSOR_LOG_INTERVAL_MS) {
    lastSensorLogAt = millis();
    Serial.print("IR: ");
    Serial.println(digitalRead(IR_SENSOR_PIN));
  }

  processPickupState();

  if (millis() - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = millis();
    handleDoseQueue();
  }

  if (millis() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = millis();
    sendHeartbeat();
  }
}