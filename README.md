# Smart Pill Dispenser

Project structure:

- `backend/` contains the Express, MongoDB, authentication, scheduling, and IoT API code.
- `frontend/` contains the React dashboard.
- `firmware/` contains the ESP32 reference sketch.

## Authentication

Users must register before using the dashboard.

Required registration fields:

- Name
- Mobile
- Email
- Password

Those registered details are used as the default missed-pickup alert recipient for schedules created by that user.

## Run the backend

```bash
npm --prefix backend install
npm --prefix backend run dev
```

Backend environment file: `backend/.env`

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

If Brevo is configured, missed-dose emails are sent to the schedule alert recipient when a pill is not picked up within 2 minutes.

If Twilio is configured, missed-dose SMS messages are sent to the caregiver phone number or registered mobile number when a pill is not picked up within 2 minutes.

## Run the frontend

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

The frontend proxies `/api` to `http://localhost:5000`.

## Build the IoT device

See `docs/iot-build-from-scratch.md` for the full ESP32 hardware, wiring, firmware, backend, and test procedure.

## First-time customer connection

The dispenser setup is now direct:

1. Power on the device.
2. Ensure the ESP32 can reach your backend API URL.
3. Log into the dashboard and create schedules.
4. The device starts normal operation and reports heartbeats to the backend.

## Current flow

1. A user registers with name, mobile, email, and password.
2. The logged-in user creates medicine schedules with medicine, time, dosage, and compartment number.
3. At the scheduled IST time, the ESP32 receives one due dose, dispenses it, and turns on buzzer and LED.
4. The tray sensor checks whether the medicine is picked up within 2 minutes.
5. If pickup is confirmed, the event is marked as taken.
6. If pickup is not confirmed within 2 minutes, the event is marked missed, shown in the dashboard/browser, and sent through configured Brevo email and Twilio SMS alerts.