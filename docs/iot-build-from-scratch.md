# Smart Pill IoT Build From Scratch

This guide matches the current codebase in this repository. It shows how to build the ESP32-based dispenser end to end and connect it to the backend and dashboard.

## 1. What the current system does

The IoT part of this project works like this:

1. The backend creates due dose events and exposes them at `GET /api/device/queue`.
2. The ESP32 polls that queue every 15 seconds.
3. When a dose is due, the ESP32 rotates a servo, turns on a buzzer and LED, and waits up to 2 minutes for pickup.
4. The ESP32 reports `dispensed` and then `pickup` status back to the backend.
5. The backend marks the dose as `taken` or `missed`.
6. The frontend dashboard shows active alerts and missed alerts.

## 2. Parts list

Minimum parts for the current firmware:

- 1 x ESP32 development board
- 1 x SG90 or MG90S style servo motor
- 1 x IR obstacle or break-beam style sensor with digital output
- 1 x active buzzer module
- 1 x LED
- 1 x 220 ohm resistor for the LED
- Jumper wires
- Breadboard or perfboard
- Stable 5V power source for the servo
- USB cable for the ESP32

Recommended but not optional in practice:

- Common ground between ESP32 and external 5V servo supply
- Separate 5V supply for the servo instead of powering the servo directly from the ESP32 board

## 3. Pin mapping used by the firmware

The current sketch uses these pins:

- Servo signal: GPIO 18
- IR sensor digital output: GPIO 34
- Buzzer: GPIO 25
- LED: GPIO 26

If you change any pin, update the constants at the top of `firmware/esp32-pill-dispenser.ino`.

## 4. Wiring

Wire the hardware like this:

### ESP32 to servo

- Servo signal wire to GPIO 18
- Servo VCC to external 5V
- Servo GND to external power ground
- ESP32 GND to the same common ground

Do not rely on the ESP32 3.3V pin to drive the servo. That is a common failure point.

### ESP32 to IR sensor

- Sensor VCC to the module's supported supply voltage
- Sensor GND to ESP32 GND
- Sensor digital OUT to GPIO 34

The current firmware treats pickup as detected when the sensor output reads `LOW`.

### ESP32 to buzzer

- Active buzzer signal to GPIO 25
- Buzzer VCC to the module's rated voltage
- Buzzer GND to common ground

The sketch drives the buzzer with a simple HIGH or LOW output. That means you should use an active buzzer module, not a passive piezo that expects a generated tone.

### ESP32 to LED

- GPIO 26 to 220 ohm resistor
- Resistor to LED anode
- LED cathode to GND

## 5. Build the pill dispensing mechanism

The repository only contains the control software. You still need a mechanical path that lets the servo release one dose into a pickup tray.

Minimum workable mechanical design:

1. Create one storage compartment per medicine lane.
2. Add a servo-driven flap or wheel that opens briefly when the servo rotates.
3. Route the dropped pill into a tray where the IR sensor can detect pickup.
4. Make sure the IR sensor watches the pickup zone, not the storage compartment.

The current firmware rotates the servo from 90 degrees to 0 degrees, waits 700 ms, then returns to 90 degrees. Tune the angles and delay if your mechanism differs.

## 6. Software architecture you need running

You need three parts:

- MongoDB
- Backend Express API on port 5000
- Frontend Vite app for user registration, schedules, and dashboard

The ESP32 talks only to the backend API. The browser is not required for the device buzzer to operate.

## 7. Backend setup

From the workspace root:

```bash
npm --prefix backend install
```

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/smartpill
JWT_SECRET=smart-pill-secret
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=alerts@example.com
BREVO_SENDER_NAME=Smart Pill Dispenser
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_NUMBER=+1234567890
```

Start MongoDB, then start the backend:

```bash
npm --prefix backend run dev
```

Expected result:

- API root responds at `http://localhost:5000/`
- Device queue responds at `http://YOUR_PC_IP:5000/api/device/queue`

If Twilio is configured, the backend can also send SMS alerts for missed pickup events using the registered mobile number or caregiver phone number.

## 8. Frontend setup

Install and run the dashboard:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

From there:

1. Register a user account.
2. Log in.
3. Create at least one schedule.

The schedule data created here is what the ESP32 later consumes through the backend.

## 9. Find your PC IP address on Windows

The ESP32 cannot use `localhost` to reach your backend. It needs your computer's LAN IP.

In PowerShell:

```powershell
ipconfig
```

Use the IPv4 address of your active Wi-Fi adapter, for example `192.168.1.20`.

Your ESP32 firmware base URL should then look like this:

```cpp
const char* API_BASE_URL = "http://192.168.1.20:5000/api";
```

The ESP32 and your computer must be on the same local network.

## 10. Flash the ESP32

Open `firmware/esp32-pill-dispenser.ino` in Arduino IDE.

Install these libraries through Library Manager:

- ArduinoJson
- ESP32Servo

Then edit these values in the sketch:

- `deviceId`
- default `apiBaseUrl` if needed

Make sure your board selection is correct for your ESP32 model, then upload the sketch.

## 10A. First-time buyer setup flow

The current firmware now supports first-time setup mode for a customer:

1. On first boot, the device tries Wi-Fi and backend provisioning.
2. If that fails, it starts an access point named `SmartPill-Setup`.
3. The user connects to that access point.
4. They open the setup page hosted by the ESP32.
5. They enter:
  - home Wi-Fi SSID
  - home Wi-Fi password
  - backend API URL
6. The device requests a pairing code from the backend.
7. The user logs into the dashboard and enters that pairing code in the `First-Time Device Connection` panel.
8. After pairing, the device appears under `Your Devices` in the dashboard.

## 11. How the firmware behaves

The current firmware logic is:

1. Connect to Wi-Fi.
2. Every 15 seconds call `GET /api/device/queue`.
3. For each due event:
4. Rotate the servo.
5. Turn on buzzer and LED.
6. Send `POST /api/device/dispense` with the `eventId`.
7. Watch the IR sensor for up to 2 minutes.
8. If pickup is detected, send `POST /api/device/pickup` with `pickupDetected: true`.
9. If pickup is not detected, send `POST /api/device/pickup` with `pickupDetected: false`.

The relevant API endpoints already exist in the backend:

- `GET /api/device/queue`
- `POST /api/devices/provisioning/start`
- `POST /api/devices/claim`
- `POST /api/devices/heartbeat`
- `POST /api/device/dispense`
- `POST /api/device/pickup`

## 12. First end-to-end test

Use this exact test flow:

1. Start MongoDB.
2. Start the backend.
3. Start the frontend.
4. Power the ESP32 and open the Serial Monitor.
5. Register and log in from the dashboard.
6. Create a schedule a few minutes ahead in IST.
7. Wait for the due time.
8. Confirm the servo rotates.
9. Confirm the buzzer and LED turn on.
10. Pick up the pill from the tray before 2 minutes.
11. Check that the event becomes `taken` in the dashboard.

Then test the missed path:

1. Create another near-future schedule.
2. Do not pick up the pill.
3. Wait more than 2 minutes.
4. Confirm the event becomes `missed`.
5. If Brevo is configured, confirm the alert email is sent.
6. If Twilio is configured, confirm the SMS alert is delivered.

## 13. Common failure points

### Servo twitches or resets the ESP32

Cause:

- Servo drawing too much current from the ESP32 or USB rail

Fix:

- Use a separate 5V supply for the servo
- Share ground with the ESP32

### ESP32 never reaches the backend

Cause:

- `API_BASE_URL` still points to placeholder text or `localhost`
- PC firewall is blocking inbound port 5000
- ESP32 and laptop are on different networks

Fix:

- Use the PC's Wi-Fi IPv4 address
- Allow Node.js or port 5000 through Windows Firewall
- Keep both devices on the same LAN

### Pickup is always detected or never detected

Cause:

- IR sensor logic level is reversed or sensor placement is wrong

Fix:

- Check the sensor output on the serial console
- If your sensor is active HIGH instead of active LOW, invert `pickupDetected()`

Current code:

```cpp
bool pickupDetected() {
  return digitalRead(IR_SENSOR_PIN) == LOW;
}
```

### Buzzer does not make sound

Cause:

- Passive buzzer used with simple digital HIGH or LOW control

Fix:

- Use an active buzzer module or rewrite the firmware to generate tones

### No schedules ever reach the device

Cause:

- No registered user
- No saved schedule
- Scheduled time not yet due
- Backend or MongoDB not running

Fix:

- Confirm user registration and login work
- Confirm schedules appear in the dashboard
- Confirm the backend is running and connected to MongoDB

## 14. Recommended improvements before real deployment

The current project is a working prototype. Before building a more reliable dispenser, you should address these gaps:

- Add authentication or a device secret to the `/api/device/*` endpoints
- Add serial logging in the firmware for Wi-Fi, HTTP, and sensor diagnostics
- Add retry handling for failed `POST` requests from the ESP32
- Add protection hardware if the buzzer or servo current is too high for direct GPIO drive
- Add per-compartment servo control if you want more than one physical medicine lane
- Add RTC or NTP status reporting from the device for stronger timing diagnostics

## 15. Minimal checklist

You are ready for a first prototype if all of these are true:

- MongoDB is running
- Backend is running on port 5000
- Frontend is running and you can register/login
- ESP32 is on the same Wi-Fi network as the backend host
- `API_BASE_URL` points to your PC IP, not `localhost`
- Servo has a stable 5V supply
- Sensor output is wired to GPIO 34
- Buzzer is an active buzzer on GPIO 25
- LED is on GPIO 26 with a resistor
- A test schedule appears in the dashboard

Once these are in place, the existing codebase is enough to run the current IoT prototype.