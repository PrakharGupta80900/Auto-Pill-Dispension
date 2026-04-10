const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  createSchedule,
  deleteSchedule,
  getActiveAlerts,
  getDeviceAlertState,
  getDashboard,
  getDeviceQueue,
  getDeviceSchedules,
  getDoseEvents,
  getSchedules,
  reportDispense,
  reportPickup,
  silenceAlert,
  updateSchedule
} = require("../controllers/scheduleController");

const router = express.Router();

router.get("/dashboard", protect, getDashboard);
router.get("/alerts", protect, getActiveAlerts);
router.post("/alerts/:eventId/silence", protect, silenceAlert);
router.get("/schedules", protect, getSchedules);
router.post("/schedules", protect, createSchedule);
router.put("/schedules/:id", protect, updateSchedule);
router.delete("/schedules/:id", protect, deleteSchedule);

router.get("/dose-events", protect, getDoseEvents);

router.get("/device/queue", getDeviceQueue);
router.get("/device/alerts/:eventId/state", getDeviceAlertState);
router.get("/device/schedules", getDeviceSchedules);
router.post("/device/dispense", reportDispense);
router.post("/device/pickup", reportPickup);

module.exports = router;