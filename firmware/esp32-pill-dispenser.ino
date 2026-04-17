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
const int BUZZER_PIN = 23;

Servo dispenserServo;

unsigned long lastPollAt = 0;
const unsigned long POLL_INTERVAL_MS = 5000;
unsigned long lastSensorLogAt = 0;
const unsigned long SENSOR_LOG_INTERVAL_MS = 1000;
unsigned long lastHeartbeatAt = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;
unsigned long lastAlertStatePollAt = 0;
const unsigned long ALERT_STATE_POLL_INTERVAL_MS = 2000;

// Event control
String lastEventId = "";
bool waitingForPickup = false;
String activeEventId = "";
unsigned long pickupStartTime = 0;
const unsigned long PICKUP_WINDOW = 120000;
const unsigned long MEDICINE_FALL_DELAY_MS = 1000;

// 🔥 SERVO TRACK
int currentAngle = 0;

// ================= WIFI =================

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(500);
  }

  return WiFi.status() == WL_CONNECTED;
}

// ================= HTTP =================

bool postJson(String endpoint, DynamicJsonDocument &doc) {
  if (!connectWiFi()) return false;

  HTTPClient http;
  http.begin(apiBaseUrl + endpoint);
  http.addHeader("Content-Type", "application/json");

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  http.end();

  return code >= 200 && code < 300;
}

bool getJson(String endpoint, DynamicJsonDocument &doc) {
  if (!connectWiFi()) return false;

  HTTPClient http;
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

void setAlertState(bool on) {
  digitalWrite(BUZZER_PIN, on ? LOW : HIGH);
}

// IR detection
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

// ================= SERVO (FIXED) =================

void dispensePills() {
  Serial.println("⚙️ Rotating 45°...");

  // STEP FORWARD
  currentAngle += 45;

  // SG90 SAFE LIMIT
  if (currentAngle > 180) {
    currentAngle = 0;
  }

  // ATTACH → MOVE
  dispenserServo.attach(SERVO_PIN);
  dispenserServo.write(currentAngle);

  Serial.print("Angle: ");
  Serial.println(currentAngle);

  delay(700);  // movement time

  // 🔥 CUT SIGNAL
  dispenserServo.detach();

  Serial.println("Servo signal OFF");
}

// ================= PICKUP =================

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
    Serial.println("Medicine removed");

    DynamicJsonDocument doc(256);
    doc["eventId"] = activeEventId;
    doc["deviceId"] = deviceId;
    doc["pickupDetected"] = true;

    postJson("/device/pickup", doc);

    setAlertState(false);
    waitingForPickup = false;
    activeEventId = "";
    return;
  }

  if (millis() - pickupStartTime > PICKUP_WINDOW) {
    Serial.println("Timeout → buzzer OFF");

    setAlertState(false);
    waitingForPickup = false;
    activeEventId = "";
  }
}

// ================= QUEUE =================

void handleDoseQueue() {
  if (!connectWiFi()) return;
  if (waitingForPickup) return;

  HTTPClient http;
  http.begin(apiBaseUrl + "/device/queue?deviceId=" + deviceId);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String response = http.getString();
  http.end();

  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, response)) return;

  JsonArray queue = doc.is<JsonArray>() ? doc.as<JsonArray>() : doc["queue"].as<JsonArray>();

  for (JsonObject item : queue) {
    String eventId = item["eventId"].as<String>();

    if (eventId == lastEventId) continue;

    Serial.println("New Event: " + eventId);

    // 🔥 ROTATE SERVO
    dispensePills();

    // Give the medicine time to fall into place before checking the IR sensor
    delay(MEDICINE_FALL_DELAY_MS);

    // Detect pill
    bool detected = false;
    unsigned long start = millis();

    while (millis() - start < 3000) {
      if (isMedicinePresentStable()) {
        detected = true;
        break;
      }
      delay(50);
    }

    if (detected) {
      Serial.println("Pill detected → buzzer ON");
      setAlertState(true);
    }

    DynamicJsonDocument postDoc(256);
    postDoc["eventId"] = eventId;
    postDoc["deviceId"] = deviceId;

    postJson("/device/dispense", postDoc);

    if (detected) {
      waitingForPickup = true;
      activeEventId = eventId;
      pickupStartTime = millis();
    }

    lastEventId = eventId;
    break;
  }
}

// ================= HEARTBEAT =================

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["deviceId"] = deviceId;
  postJson("/devices/heartbeat", doc);
}

// ================= SETUP =================

void setup() {
  Serial.begin(115200);

  pinMode(IR_SENSOR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  setAlertState(false);

  // Initial position
  dispenserServo.attach(SERVO_PIN);
  dispenserServo.write(0);
  currentAngle = 0;
  delay(500);
  dispenserServo.detach();  // 🔥 start safe

  connectWiFi();
}

// ================= LOOP =================

void loop() {

  if (!waitingForPickup) {
    setAlertState(false);
  }

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