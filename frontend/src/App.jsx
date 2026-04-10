import { useEffect, useRef, useState } from "react";
import api from "./api";

const IST_TIME_ZONE = "Asia/Kolkata";
const TOKEN_KEY = "smart-pill-token";
const USER_KEY = "smart-pill-user";

const emptyScheduleForm = {
  medicineName: "",
  dosage: "1 tablet",
  compartment: 1,
  time: "08:00",
  daysOfWeek: [],
  alertWindowMinutes: 2,
  pillCount: 1
};

const emptyRegisterForm = {
  name: "",
  mobile: "",
  email: "",
  password: ""
};

const emptyLoginForm = {
  email: "",
  password: ""
};

const createProfileForm = (currentUser) => ({
  name: currentUser?.name || "",
  mobile: currentUser?.mobile || "",
  email: currentUser?.email || ""
});

const emptyDashboard = {
  stats: { total: 0, scheduled: 0, dispensed: 0, taken: 0, missed: 0 },
  activeAlerts: [],
  missedAlerts: [],
  schedules: [],
  recentEvents: []
};

const emptyDevicePairForm = {
  pairingCode: "",
  name: "Home Pill Dispenser"
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: IST_TIME_ZONE
  }).format(new Date(value));
};

const mapScheduleToForm = (schedule) => ({
  medicineName: schedule.medicineName || "",
  dosage: schedule.dosage || "1 tablet",
  compartment: schedule.compartment || 1,
  time: schedule.time || "08:00",
  daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [],
  alertWindowMinutes: 2,
  pillCount: schedule.pillCount || 1
});

const StatCard = ({ label, value, accent, action }) => (
  <article className="stat-card" style={{ "--accent": accent }}>
    <div className="stat-card-header">
      <p>{label}</p>
      {action ? action : null}
    </div>
    <strong>{value}</strong>
  </article>
);

const playAlertTone = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const gainNode = context.createGain();
  const oscillator = context.createOscillator();

  oscillator.type = "square";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.0001;

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  const now = context.currentTime;
  const stopAt = now + 5;

  gainNode.gain.exponentialRampToValueAtTime(0.14, now + 0.03);

  for (let pulseAt = now + 0.5; pulseAt < stopAt; pulseAt += 0.75) {
    gainNode.gain.exponentialRampToValueAtTime(0.04, pulseAt - 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.16, pulseAt);
  }

  gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.start(now);
  oscillator.stop(stopAt);
  oscillator.onended = () => context.close();
};

const playMissedAlertTone = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const gainNode = context.createGain();
  const oscillator = context.createOscillator();

  oscillator.type = "sawtooth";
  oscillator.frequency.value = 660;
  gainNode.gain.value = 0.0001;

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  const now = context.currentTime;
  const pulses = [0, 0.55, 1.1, 1.65];

  pulses.forEach((offset) => {
    gainNode.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
  });

  oscillator.start(now);
  oscillator.stop(now + 2.1);
  oscillator.onended = () => context.close();
};

const notify = (title, body) => {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  new Notification(title, { body });
};

const saveSession = ({ token, user }) => {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const clearSession = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};

const readStoredUser = () => {
  const raw = window.localStorage.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function AuthScreen({
  authMode,
  authMessage,
  authSubmitting,
  loginForm,
  registerForm,
  onAuthModeChange,
  onLoginChange,
  onRegisterChange,
  onLoginSubmit,
  onRegisterSubmit
}) {
  const isLogin = authMode === "login";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-spotlight">
          <span className="eyebrow">Smart IoT Pill Care</span>
          <p className="auth-kicker">Connected medicine schedules with device alerts, pickup tracking, and caregiver escalation.</p>
          <h1>{isLogin ? "Stay on top of every dose." : "Set up your dispenser in minutes."}</h1>
          <p className="auth-lead">
            {isLogin
              ? "Open your dashboard to review schedules, active alerts, and missed doses from one place."
              : "Create your account to register medicine schedules and route missed-pickup alerts to the right contact automatically."}
          </p>

          <div className="auth-metrics">
            <article>
              <strong>24/7</strong>
              <span>Device-led reminders</span>
            </article>
            <article>
              <strong>2 min</strong>
              <span>Pickup confirmation window</span>
            </article>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <strong>Smart scheduling</strong>
              <span>Store medicine name, compartment, dosage, and active days in one schedule plan.</span>
            </div>
            <div className="auth-feature-item">
              <strong>Hardware alerts</strong>
              <span>An automatic dispenser that helps you take medicine on time.</span>
            </div>
            <div className="auth-feature-item">
              <strong>Caregiver visibility</strong>
              <span>Missed doses can surface on the dashboard and escalate through backend notifications.</span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-panel-header">
            <div>
              <span className="auth-panel-label">{isLogin ? "Welcome back" : "New account"}</span>
              <h2>{isLogin ? "Login" : "Register"}</h2>
            </div>

            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button
                className={isLogin ? "day-pill active" : "day-pill"}
                type="button"
                onClick={() => onAuthModeChange("login")}
                aria-pressed={isLogin}
              >
                Login
              </button>
              <button
                className={!isLogin ? "day-pill active" : "day-pill"}
                type="button"
                onClick={() => onAuthModeChange("register")}
                aria-pressed={!isLogin}
              >
                Register
              </button>
            </div>
          </div>

          <div className={`auth-form-stage ${isLogin ? "login-active" : "register-active"}`}>
            <form className={`auth-form auth-pane ${isLogin ? "auth-pane-active" : "auth-pane-hidden"}`} onSubmit={onLoginSubmit}>
              <label>
                <span>Email address</span>
                <input name="email" type="email" placeholder="you@example.com" value={loginForm.email} onChange={onLoginChange} required />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" placeholder="Enter your password" value={loginForm.password} onChange={onLoginChange} required />
              </label>
              <button className="primary-button auth-submit" type="submit" disabled={authSubmitting && isLogin}>
                {authSubmitting && isLogin ? "Signing in..." : "Access dashboard"}
              </button>
            </form>

            <form className={`auth-form auth-pane ${!isLogin ? "auth-pane-active" : "auth-pane-hidden"}`} onSubmit={onRegisterSubmit}>
              <div className="auth-field-grid">
                <label>
                  <span>Full name</span>
                  <input name="name" placeholder="Patient or caregiver name" value={registerForm.name} onChange={onRegisterChange} required />
                </label>
                <label>
                  <span>Mobile</span>
                  <input name="mobile" placeholder="Primary contact number" value={registerForm.mobile} onChange={onRegisterChange} required />
                </label>
              </div>
              <label>
                <span>Email address</span>
                <input name="email" type="email" placeholder="alerts@example.com" value={registerForm.email} onChange={onRegisterChange} required />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" placeholder="Create a secure password" value={registerForm.password} onChange={onRegisterChange} required />
              </label>
              <p className="auth-note">Your registered details become the default alert contact for missed pickup notifications.</p>
              <button className="primary-button auth-submit" type="submit" disabled={authSubmitting && !isLogin}>
                {authSubmitting && !isLogin ? "Creating account..." : "Create account"}
              </button>
            </form>
          </div>

          {authMessage ? <p className="form-message auth-message">{authMessage}</p> : null}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(() => readStoredUser());
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [form, setForm] = useState(emptyScheduleForm);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(() => createProfileForm(readStoredUser()));
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [missedAlertsOpen, setMissedAlertsOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  const [devicePairForm, setDevicePairForm] = useState(emptyDevicePairForm);
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  const [pairDeviceOpen, setPairDeviceOpen] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(readStoredUser()));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const alertedEventsRef = useRef(new Set());
  const missedAlertedEventsRef = useRef(new Set());
  const profileMenuRef = useRef(null);

  const loadDashboard = async () => {
    setLoading(true);
    const [dashboardResponse, devicesResponse] = await Promise.all([
      api.get("/dashboard"),
      api.get("/devices/mine")
    ]);
    setDashboard(dashboardResponse.data);
    setDevices(devicesResponse.data);
    setLoading(false);
  };

  const bootstrapUser = async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      saveSession({ token, user: data.user });
      await loadDashboard();
    } catch {
      clearSession();
      setUser(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    bootstrapUser().catch(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadDashboard().catch(() => {});
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    setProfileForm(createProfileForm(user));
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    dashboard.activeAlerts.forEach((alert) => {
      if (alertedEventsRef.current.has(alert.eventId)) {
        return;
      }

      alertedEventsRef.current.add(alert.eventId);
      playAlertTone();
      notify("Medicine time", `${alert.medicineName} is due now.`);
      setMessage(`Medicine due now: ${alert.medicineName}.`);
    });
  }, [dashboard.activeAlerts]);

  useEffect(() => {
    dashboard.missedAlerts.forEach((event) => {
      if (missedAlertedEventsRef.current.has(event._id)) {
        return;
      }

      missedAlertedEventsRef.current.add(event._id);
      playMissedAlertTone();
      notify("Missed medicine alert", `${event.medicineName} was not picked up within 2 minutes.`);
      setMessage(`Missed pickup alert for ${event.medicineName}. Software beep triggered.`);
    });
  }, [dashboard.missedAlerts]);

  useEffect(() => {
    if (!dashboard.missedAlerts.length) {
      setMissedAlertsOpen(false);
    }
  }, [dashboard.missedAlerts.length]);

  const resetScheduleForm = () => {
    setForm(emptyScheduleForm);
    setEditingScheduleId(null);
    setScheduleFormOpen(false);
  };

  const handleRegisterChange = (event) => {
    const { name, value } = event.target;
    setRegisterForm((current) => ({ ...current, [name]: value }));
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
  };

  const handleScheduleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((current) => ({ ...current, [name]: value }));
  };

  const handleDevicePairChange = (event) => {
    const { name, value } = event.target;
    setDevicePairForm((current) => ({ ...current, [name]: value }));
  };

  const toggleDay = (index) => {
    setForm((current) => {
      const exists = current.daysOfWeek.includes(index);
      const daysOfWeek = exists
        ? current.daysOfWeek.filter((day) => day !== index)
        : [...current.daysOfWeek, index].sort((a, b) => a - b);

      return { ...current, daysOfWeek };
    });
  };

  const handleEditSchedule = (schedule) => {
    setForm(mapScheduleToForm(schedule));
    setEditingScheduleId(schedule._id);
    setScheduleFormOpen(true);
    setMessage(`Editing schedule for ${schedule.medicineName}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAuthSuccess = async (payload) => {
    saveSession(payload);
    setUser(payload.user);
    setAuthMessage("");
    setRegisterForm(emptyRegisterForm);
    setLoginForm(emptyLoginForm);
    await loadDashboard();
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      const { data } = await api.post("/auth/register", registerForm);
      await handleAuthSuccess(data);
    } catch (error) {
      setAuthMessage(error.response?.data?.error || "Registration failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      const { data } = await api.post("/auth/login", loginForm);
      await handleAuthSuccess(data);
    } catch (error) {
      setAuthMessage(error.response?.data?.error || "Login failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setProfileForm(createProfileForm(null));
    setDashboard(emptyDashboard);
    alertedEventsRef.current.clear();
    missedAlertedEventsRef.current.clear();
    setProfileMenuOpen(false);
    setMessage("");
    setLoading(false);
    resetScheduleForm();
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileSubmitting(true);

    try {
      const { data } = await api.put("/auth/me", profileForm);
      const token = window.localStorage.getItem(TOKEN_KEY);
      setUser(data.user);

      if (token) {
        saveSession({ token, user: data.user });
      }

      setMessage(data.message || "Profile updated.");
      setProfileMenuOpen(false);
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
        return;
      }

      setMessage(error.response?.data?.error || "Failed to update profile.");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.daysOfWeek.length) {
      setMessage("Select at least one active day.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const payload = {
      medicineName: form.medicineName,
      dosage: form.dosage,
      compartment: Number(form.compartment),
      time: form.time,
      daysOfWeek: form.daysOfWeek,
      alertWindowMinutes: 2,
      pillCount: Number(form.pillCount)
    };

    try {
      if (editingScheduleId) {
        await api.put(`/schedules/${editingScheduleId}`, payload);
        setMessage(`Schedule updated for ${form.medicineName}.`);
      } else {
        await api.post("/schedules", payload);
        setMessage("Schedule created.");
      }

      resetScheduleForm();
      await loadDashboard();
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      setMessage(error.response?.data?.error || "Failed to save schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId, medicineName) => {
    const confirmed = window.confirm(`Delete the schedule for ${medicineName}?`);

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/schedules/${scheduleId}`);

      if (editingScheduleId === scheduleId) {
        resetScheduleForm();
      }

      setMessage(`Deleted schedule for ${medicineName}.`);
      await loadDashboard();
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      setMessage(error.response?.data?.error || "Failed to delete schedule.");
    }
  };

  const handleSilenceAlert = async (eventId, medicineName) => {
    try {
      await api.post(`/alerts/${eventId}/silence`);
      setDashboard((current) => ({
        ...current,
        activeAlerts: current.activeAlerts.map((alert) => (
          alert.eventId === eventId
            ? {
                ...alert,
                alertState: {
                  ...alert.alertState,
                  buzzer: false
                }
              }
            : alert
        ))
      }));
      setMessage(`Buzzer silenced for ${medicineName}.`);
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
        return;
      }

      setMessage(error.response?.data?.error || "Failed to silence buzzer.");
    }
  };

  const handleDevicePairSubmit = async (event) => {
    event.preventDefault();
    setDeviceSubmitting(true);

    try {
      const { data } = await api.post("/devices/claim", devicePairForm);
      setDevices((current) => [data.device, ...current.filter((device) => device.deviceId !== data.device.deviceId)]);
      setDevicePairForm(emptyDevicePairForm);
      setPairDeviceOpen(false);
      setMessage(data.message || "Device paired successfully.");
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
        return;
      }

      setMessage(error.response?.data?.error || "Failed to pair device.");
    } finally {
      setDeviceSubmitting(false);
    }
  };

  if (!user) {
    return (
      <AuthScreen
        authMode={authMode}
        authMessage={authMessage}
        authSubmitting={authSubmitting}
        loginForm={loginForm}
        registerForm={registerForm}
        onAuthModeChange={setAuthMode}
        onLoginChange={handleLoginChange}
        onRegisterChange={handleRegisterChange}
        onLoginSubmit={handleLoginSubmit}
        onRegisterSubmit={handleRegisterSubmit}
      />
    );
  }

  return (
    <main className="shell">
      <header className="navbar">
        <div className="nav-brand">
          <span className="eyebrow">Smart IoT Pill Care</span>
          <strong>Pill Dispenser Dashboard</strong>
        </div>

        <div className="profile-menu" ref={profileMenuRef}>
          <button className="profile-toggle" type="button" onClick={() => setProfileMenuOpen((current) => !current)}>
            <span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="profile-summary">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </button>

          {profileMenuOpen ? (
            <form className="profile-dropdown" onSubmit={handleProfileSubmit}>
              <div className="profile-dropdown-header">
                <p>Profile</p>
                <small>Edit your contact details used across schedules and alerts.</small>
              </div>

              <label>
                <span>Name</span>
                <input name="name" value={profileForm.name} onChange={handleProfileChange} required />
              </label>

              <label>
                <span>Mobile</span>
                <input name="mobile" value={profileForm.mobile} onChange={handleProfileChange} required />
              </label>

              <label>
                <span>Email</span>
                <input name="email" type="email" value={profileForm.email} onChange={handleProfileChange} required />
              </label>

              <div className="profile-actions">
                <button className="primary-button profile-save-button" type="submit" disabled={profileSubmitting}>
                  {profileSubmitting ? "Saving..." : "Save profile"}
                </button>
                <button className="ghost-button" type="button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </header>

      <section className="instruction-banner">
        <div>
          <span className="eyebrow">How To Create A Schedule</span>
          <h2>Add medicine details, choose compartment and time, then save the schedule.</h2>
        </div>
        <p>
          Use the form below to enter the medicine name, dosage, compartment number, active days, and IST time. After saving, the dispenser will alert at the scheduled time and track pickup for 2 minutes.
        </p>
      </section>

      <section className="dashboard-actions-bar">
        <button className="primary-button" type="button" onClick={() => setPairDeviceOpen((current) => !current)}>
          {pairDeviceOpen ? "Close Pair Device" : "+ Pair Device"}
        </button>
        <button
          className="ghost-button"
          type="button"
          disabled={!devices.length}
          onClick={() => setScheduleFormOpen((current) => !current)}
        >
          {scheduleFormOpen ? "Close Schedule" : "+ Schedule"}
        </button>
        {!devices.length ? <p className="dashboard-actions-note">Pair a device first to create schedules.</p> : null}
      </section>

      <section className="content-grid device-onboarding-grid">
        {pairDeviceOpen ? (
          <section className="panel device-pair-panel">
            <div className="panel-heading">
              <h2>First-Time Device Connection</h2>
              <p>Power on the dispenser, join its setup hotspot, then enter the pairing code shown on the device setup screen here.</p>
            </div>

            <form className="auth-form" onSubmit={handleDevicePairSubmit}>
              <label>
                <span>Pairing code</span>
                <input name="pairingCode" placeholder="6-digit code" value={devicePairForm.pairingCode} onChange={handleDevicePairChange} required />
              </label>
              <label>
                <span>Device name</span>
                <input name="name" placeholder="Kitchen dispenser" value={devicePairForm.name} onChange={handleDevicePairChange} required />
              </label>
              <button className="primary-button" type="submit" disabled={deviceSubmitting}>
                {deviceSubmitting ? "Pairing..." : "Pair device"}
              </button>
            </form>
          </section>
        ) : null}

        <section className="panel list-panel">
          <div className="panel-heading">
            <h2>Your Devices</h2>
            <p>{devices.length ? `${devices.length} paired device(s)` : "No devices paired yet"}</p>
          </div>

          <div className="schedule-list">
            {devices.map((device) => (
              <article key={device.deviceId} className="schedule-item device-item">
                <div>
                  <strong>{device.name}</strong>
                  <p>{device.deviceId}</p>
                </div>
                <div className="schedule-meta">
                  <span className={`status-pill ${device.paired ? "taken" : "missed"}`}>{device.paired ? "paired" : "pending"}</span>
                  <small>Last seen: {formatDateTime(device.lastSeenAt)}</small>
                </div>
              </article>
            ))}
            {!devices.length ? <p>Pair your first dispenser using the 6-digit code shown during device setup.</p> : null}
          </div>
        </section>
      </section>

      <section className="stats-grid">
        <StatCard label="Total Events" value={dashboard.stats.total} accent="#264653" />
        <StatCard label="Scheduled" value={dashboard.stats.scheduled} accent="#f4a261" />
        <StatCard label="Dispensed" value={dashboard.stats.dispensed} accent="#2a9d8f" />
        <StatCard label="Taken" value={dashboard.stats.taken} accent="#3a86ff" />
        <StatCard
          label="Missed"
          value={dashboard.stats.missed}
          accent="#e63946"
          action={dashboard.missedAlerts.length ? (
            <button
              className="stat-eye-button"
              type="button"
              aria-label={missedAlertsOpen ? "Hide missed pickup alerts" : "Show missed pickup alerts"}
              onClick={() => setMissedAlertsOpen((current) => !current)}
            >
              {missedAlertsOpen ? "Hide" : "View"}
            </button>
          ) : null}
        />
      </section>

      {dashboard.activeAlerts.length ? (
        <section className="panel alert-panel">
          <div className="panel-heading">
            <h2>Active Alerts</h2>
            <p>The browser alarm sounds for 5 seconds. The ESP32 buzzer stays active until pickup or for a maximum of 2 minutes, and it can be silenced from here.</p>
          </div>

          <div className="schedule-list">
            {dashboard.activeAlerts.map((alert) => (
              <article key={alert.eventId} className="schedule-item alert-item">
                <div>
                  <strong>{alert.medicineName}</strong>
                  <p>Compartment {alert.compartment} • Due {formatDateTime(alert.scheduledTime)}</p>
                </div>
                <div className="schedule-meta">
                  <span className={`status-pill ${alert.status}`}>{alert.status}</span>
                  <small>
                    {alert.alertState?.buzzer
                      ? "Buzzer is active on the IoT device until pickup or the 2 minute limit."
                      : "Buzzer has been silenced in software. Tray pickup monitoring remains active."}
                  </small>
                  <div className="schedule-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!alert.alertState?.buzzer}
                      onClick={() => handleSilenceAlert(alert.eventId, alert.medicineName)}
                    >
                      {alert.alertState?.buzzer ? "Silence buzzer" : "Buzzer silenced"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {dashboard.missedAlerts.length && missedAlertsOpen ? (
        <section className="panel missed-panel">
          <div className="panel-heading">
            <h2>Missed Pickup Alerts</h2>
            <p>If the tray does not detect pickup within 2 minutes, the dashboard raises a browser notification and software beep here.</p>
          </div>

          <div className="schedule-list">
            {dashboard.missedAlerts.map((event) => (
              <article key={event._id} className="schedule-item missed-item">
                <div>
                  <strong>{event.medicineName}</strong>
                  <p>Compartment {event.compartment} • Due {formatDateTime(event.scheduledTime)}</p>
                </div>
                <div className="schedule-meta">
                  <span className="status-pill missed">missed</span>
                  <small>Alert target: {user.email}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-grid">
        {scheduleFormOpen && devices.length ? (
          <form className="panel schedule-form" onSubmit={handleSubmit}>
            <div className="panel-heading">
              <h2>{editingScheduleId ? "Edit Schedule" : "Create Schedule"}</h2>
              <p>Assign medicine, time, and compartment. Alerts route to your registered account automatically.</p>
            </div>

            <div className="field-grid">
              <label>
                <span>Medicine</span>
                <input name="medicineName" value={form.medicineName} onChange={handleScheduleChange} required />
              </label>
              <label>
                <span>Dosage</span>
                <input name="dosage" value={form.dosage} onChange={handleScheduleChange} required />
              </label>
              <label>
                <span>Compartment</span>
                <input name="compartment" type="number" min="1" value={form.compartment} onChange={handleScheduleChange} required />
              </label>
              <label>
                <span>Time</span>
                <input name="time" type="time" value={form.time} onChange={handleScheduleChange} required />
              </label>
              <label>
                <span>Pill Count</span>
                <input name="pillCount" type="number" min="1" value={form.pillCount} onChange={handleScheduleChange} />
              </label>
              <label>
                <span>Alert Recipient</span>
                <input value={`${user.name} • ${user.mobile}`} disabled />
              </label>
            </div>

            <div className="days-picker">
              <span>Active Days</span>
              <div>
                {dayLabels.map((label, index) => (
                  <button key={label} className={form.daysOfWeek.includes(index) ? "day-pill active" : "day-pill"} type="button" onClick={() => toggleDay(index)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingScheduleId ? "Update Schedule" : "Save Schedule"}
              </button>

              <button className="ghost-button form-secondary-button" type="button" onClick={resetScheduleForm}>
                {editingScheduleId ? "Cancel Edit" : "Close Schedule"}
              </button>
            </div>

            {message ? <p className="form-message">{message}</p> : null}
          </form>
        ) : (
          <section className="panel schedule-form schedule-empty-panel">
            <div className="panel-heading">
              <h2>Schedule Setup</h2>
              <p>{devices.length ? "Use + Schedule to add a medicine plan for your paired dispenser." : "Pair a device first, then schedule creation will become available."}</p>
            </div>
          </section>
        )}

        <section className="panel list-panel">
          <div className="panel-heading">
            <h2>Your Schedules</h2>
            <p>{loading ? "Loading..." : `${dashboard.schedules.length} configured schedule(s) • All times in IST`}</p>
          </div>

          <div className="schedule-list">
            {dashboard.schedules.map((schedule) => (
              <article key={schedule._id} className="schedule-item">
                <div>
                  <strong>{schedule.medicineName}</strong>
                  <p>{schedule.dosage} • Compartment {schedule.compartment}</p>
                </div>
                <div className="schedule-meta">
                  <span>{schedule.time} IST</span>
                  <small>{schedule.daysOfWeek.map((day) => dayLabels[day]).join(", ")}</small>
                  <div className="schedule-actions">
                    <button className="ghost-button" type="button" onClick={() => handleEditSchedule(schedule)}>
                      Edit
                    </button>
                    <button className="danger-button" type="button" onClick={() => handleDeleteSchedule(schedule._id, schedule.medicineName)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!dashboard.schedules.length && !loading ? <p>No schedules yet.</p> : null}
          </div>
        </section>
      </section>

      <section className="panel event-panel">
        <div className="panel-heading">
          <h2>Recent Dose Events</h2>
          <p>Shows the latest schedule events for your account, including dispensed, taken, and missed doses.</p>
        </div>

        <div className="event-table">
          <div className="event-row event-head">
            <span>Medicine</span>
            <span>Status</span>
            <span>Scheduled</span>
            <span>Taken</span>
          </div>
          {dashboard.recentEvents.map((event) => (
            <div className="event-row" key={event._id}>
              <span>{event.medicineName}</span>
              <span className={`status-pill ${event.status}`}>{event.status}</span>
              <span>{formatDateTime(event.scheduledTime)}</span>
              <span>{formatDateTime(event.takenAt)}</span>
            </div>
          ))}
          {!dashboard.recentEvents.length && !loading ? <p>No dose events yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
