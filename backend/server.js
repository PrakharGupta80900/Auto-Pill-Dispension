require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const connectDB = require("./config/db");
const deviceRoutes = require("./routes/deviceRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const { markMissedDoses, syncTodayDoseEvents } = require("./services/doseScheduler");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api", scheduleRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Smart Pill Dispenser API running");
});

const PORT = process.env.PORT || 5000;

const runDoseSweep = () => {
  syncTodayDoseEvents().catch((error) => {
    console.error("Dose sync failed", error.message);
  });

  markMissedDoses().catch((error) => {
    console.error("Missed-dose sweep failed", error.message);
  });
};

setInterval(() => {
  runDoseSweep();
}, 60 * 1000);

runDoseSweep();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});