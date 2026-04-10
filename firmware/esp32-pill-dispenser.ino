#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

String wifiSsid = "YOUR_WIFI_NAME";
String wifiPassword = "YOUR_WIFI_PASSWORD";
String apiBaseUrl = "http://YOUR_PC_IP:5000/api";
String deviceId = "smartpill-esp32-001";
String pairingCode = "";
bool setupMode = false;

const int SERVO_PIN = 18;
const int IR_SENSOR_PIN = 34;
const int BUZZER_PIN = 25;
const int LED_PIN = 26;

struct PendingReport {
  bool inUse;
  String endpoint;
  String body;
};

Servo dispenserServo;
WebServer setupServer(80);
PendingReport pendingReports[8];
unsigned long lastPollAt = 0;
unsigned long lastWiFiRetryAt = 0;
unsigned long lastHeartbeatAt = 0;
const unsigned long POLL_INTERVAL_MS = 15000;
const unsigned long PICKUP_WINDOW_MS = 120000;
const unsigned long ALERT_STATE_POLL_MS = 2000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 8000;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

void setAlertState(bool buzzerActive, bool ledActive) {
  digitalWrite(LED_PIN, ledActive ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, buzzerActive ? HIGH : LOW);
}

bool pickupDetected() {
  return digitalRead(IR_SENSOR_PIN) == LOW;
}

void dispensePills() {
  dispenserServo.write(0);
  delay(700);
  dispenserServo.write(90);
}

bool connectWiFi(bool forceRetry = false) {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  const unsigned long now = millis();

  if (!forceRetry && now - lastWiFiRetryAt < WIFI_RETRY_INTERVAL_MS) {
    return false;
  }

  lastWiFiRetryAt = now;
  WiFi.disconnect();
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  const unsigned long started = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
  }

  return WiFi.status() == WL_CONNECTED;
}

bool enqueuePendingReport(const String& endpoint, const String& body) {
  for (PendingReport& report : pendingReports) {
    if (!report.inUse) {
      report.inUse = true;
      report.endpoint = endpoint;
      report.body = body;
      return true;
    }
  }

  return false;
}

bool sendJson(const String& endpoint, const String& body) {
  if (!connectWiFi()) {
    return false;
  }

  HTTPClient http;
  http.begin(apiBaseUrl + endpoint);
  http.addHeader("Content-Type", "application/json");
  const int statusCode = http.POST(body);
  http.end();

  return statusCode >= 200 && statusCode < 300;
}

void queueOrSendJson(const String& endpoint, const String& body) {
  if (!sendJson(endpoint, body)) {
    enqueuePendingReport(endpoint, body);
  }
}

void flushPendingReports() {
  if (!connectWiFi()) {
    return;
  }

  for (PendingReport& report : pendingReports) {
    if (!report.inUse) {
      continue;
    }

    if (sendJson(report.endpoint, report.body)) {
      report.inUse = false;
      report.endpoint = "";
      report.body = "";
    }
  }
}

bool fetchRemoteAlertState(const String& eventId, bool& buzzerActive, bool& ledActive) {
  if (!connectWiFi()) {
    return false;
  }

  HTTPClient http;
  http.begin(apiBaseUrl + "/device/alerts/" + eventId + "/state");
  const int statusCode = http.GET();

  if (statusCode != 200) {
    http.end();
    return false;
  }

  DynamicJsonDocument response(512);
  const DeserializationError error = deserializeJson(response, http.getString());
  http.end();

  if (error) {
    return false;
  }

  buzzerActive = response["alertState"]["buzzer"].as<bool>();
  ledActive = response["alertState"]["led"].as<bool>();
  return true;
}

void handleDoseQueue() {
  flushPendingReports();

  if (!connectWiFi()) {
    return;
  }

  HTTPClient http;
  http.begin(apiBaseUrl + "/device/queue");
  const int statusCode = http.GET();

  if (statusCode != 200) {
    http.end();
    return;
  }

  DynamicJsonDocument response(4096);
  const DeserializationError error = deserializeJson(response, http.getString());
  http.end();

  if (error) {
    return;
  }

  JsonArray queue = response.as<JsonArray>();

  for (JsonObject item : queue) {
    const String eventId = item["eventId"].as<String>();
    bool buzzerActive = item["hardware"]["buzzer"].as<bool>();
    bool ledActive = item["hardware"]["led"].as<bool>();
    bool wasPickedUp = false;

    dispensePills();
    setAlertState(buzzerActive, ledActive);

    DynamicJsonDocument dispenseBody(256);
    dispenseBody["eventId"] = eventId;
    String payload;
    serializeJson(dispenseBody, payload);
    queueOrSendJson("/device/dispense", payload);

    unsigned long started = millis();
    unsigned long lastAlertPollAt = 0;

    while (millis() - started < PICKUP_WINDOW_MS) {
      if (millis() - lastAlertPollAt >= ALERT_STATE_POLL_MS) {
        lastAlertPollAt = millis();
        flushPendingReports();
        fetchRemoteAlertState(eventId, buzzerActive, ledActive);
        setAlertState(buzzerActive, ledActive);
      }

      if (pickupDetected()) {
        wasPickedUp = true;
        setAlertState(false, false);

        DynamicJsonDocument pickupBody(256);
        pickupBody["eventId"] = eventId;
        pickupBody["pickupDetected"] = true;
        pickupBody["sensorState"] = "pickup_confirmed";
        String pickupPayload;
        serializeJson(pickupBody, pickupPayload);
        queueOrSendJson("/device/pickup", pickupPayload);
        break;
      }

      delay(500);
    }

    if (!wasPickedUp) {
      setAlertState(false, false);

      DynamicJsonDocument pickupBody(256);
      pickupBody["eventId"] = eventId;
      pickupBody["pickupDetected"] = false;
      pickupBody["sensorState"] = "not_picked_up";
      String pickupPayload;
      serializeJson(pickupBody, pickupPayload);
      queueOrSendJson("/device/pickup", pickupPayload);
    }
  }
}

bool startProvisioningSession() {
  if (!connectWiFi(true)) {
    return false;
  }

  HTTPClient http;
  http.begin(apiBaseUrl + "/devices/provisioning/start");
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument request(256);
  request["deviceId"] = deviceId;
  request["firmwareVersion"] = "1.0.0";
  String body;
  serializeJson(request, body);

  const int statusCode = http.POST(body);

  if (statusCode != 200) {
    http.end();
    return false;
  }

  DynamicJsonDocument response(512);
  const DeserializationError error = deserializeJson(response, http.getString());
  http.end();

  if (error) {
    return false;
  }

  pairingCode = response["pairingCode"].as<String>();
  return pairingCode.length() > 0;
}

void handleSetupRoot() {
  String html = "<html><body style='font-family:sans-serif;padding:24px;background:#102018;color:#eef4df;'>";
  html += "<h1>Smart Pill Setup</h1>";
  html += "<p>Join this hotspot, then use the pairing code below in the dashboard.</p>";
  html += "<p><strong>Device ID:</strong> " + deviceId + "</p>";
  html += "<p><strong>Pairing code:</strong> " + pairingCode + "</p>";
  html += "<form method='POST' action='/configure'>";
  html += "<label>Home Wi-Fi SSID<br><input name='ssid' /></label><br><br>";
  html += "<label>Home Wi-Fi Password<br><input name='password' type='password' /></label><br><br>";
  html += "<label>Backend API URL<br><input name='apiUrl' value='" + apiBaseUrl + "' /></label><br><br>";
  html += "<button type='submit'>Save and restart</button></form></body></html>";
  setupServer.send(200, "text/html", html);
}

void handleSetupSave() {
  wifiSsid = setupServer.arg("ssid");
  wifiPassword = setupServer.arg("password");
  apiBaseUrl = setupServer.arg("apiUrl");
  setupServer.send(200, "text/html", "<html><body><h2>Settings saved. Restart the device.</h2></body></html>");
}

void startSetupMode() {
  setupMode = true;
  WiFi.disconnect(true);
  WiFi.softAP("SmartPill-Setup");
  setupServer.on("/", HTTP_GET, handleSetupRoot);
  setupServer.on("/configure", HTTP_POST, handleSetupSave);
  setupServer.begin();
}

void sendHeartbeat() {
  if (millis() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) {
    return;
  }

  lastHeartbeatAt = millis();

  DynamicJsonDocument heartbeat(256);
  heartbeat["deviceId"] = deviceId;
  heartbeat["firmwareVersion"] = "1.0.0";
  heartbeat["wifiSsid"] = wifiSsid;
  String body;
  serializeJson(heartbeat, body);
  queueOrSendJson("/devices/heartbeat", body);
}

void setup() {
  pinMode(IR_SENSOR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  dispenserServo.attach(SERVO_PIN);
  dispenserServo.write(90);
  setAlertState(false, false);

  if (!connectWiFi(true) || !startProvisioningSession()) {
    startSetupMode();
  }
}

void loop() {
  if (setupMode) {
    setupServer.handleClient();
    return;
  }

  flushPendingReports();
  sendHeartbeat();

  if (millis() - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = millis();
    handleDoseQueue();
  }
}