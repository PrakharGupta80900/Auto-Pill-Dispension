const DoseEvent = require("../models/doseEvent");
const Schedule = require("../models/schedule");
const { markEventMissedAndNotify } = require("../services/alertService");
const {
  buildDeviceScheduleSnapshot,
  buildDashboardMetrics,
  ensureDoseEventForScheduleTime,
  ensureDoseEventForNow,
  getActiveDoseQueue,
  getActiveAlerts
} = require("../services/doseScheduler");

const resolveEventForDeviceReport = async ({ eventId, scheduleId, scheduledTime }) => {
  let event = null;
  let schedule = null;

  if (eventId) {
    event = await DoseEvent.findById(eventId);

    if (event) {
      schedule = await Schedule.findById(event.scheduleId);
      return { event, schedule };
    }
  }

  if (!scheduleId) {
    return { event: null, schedule: null };
  }

  schedule = await Schedule.findById(scheduleId);

  if (!schedule) {
    return { event: null, schedule: null };
  }

  if (scheduledTime) {
    event = await ensureDoseEventForScheduleTime(schedule, scheduledTime);
    return { event, schedule };
  }

  event = await ensureDoseEventForNow(schedule, new Date());
  return { event, schedule };
};

const normalizeDays = (daysOfWeek) => {
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
    return [];
  }

  return daysOfWeek.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
};

exports.createSchedule = async (req, res) => {
  try {
    const {
      medicineName,
      dosage,
      compartment,
      time,
      daysOfWeek,
      alertWindowMinutes,
      pillCount,
      caregiver
    } = req.body;

    if (!medicineName || !dosage || !compartment || !time) {
      return res.status(400).json({
        error: "medicineName, dosage, compartment, and time are required"
      });
    }

    if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) {
      return res.status(400).json({ error: "Select at least one active day" });
    }

    const schedule = await Schedule.create({
      owner: req.user._id,
      userId: req.user.email,
      medicineName,
      dosage,
      compartment,
      time,
      daysOfWeek: normalizeDays(daysOfWeek),
      alertWindowMinutes: 2,
      pillCount,
      caregiver: {
        name: caregiver?.name || req.user.name,
        phone: caregiver?.phone || req.user.mobile,
        email: caregiver?.email || req.user.email
      }
    });

    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSchedules = async (req, res) => {
  try {
    const schedules = await Schedule.find({ owner: req.user._id }).sort({ time: 1 });
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    if (Array.isArray(req.body.daysOfWeek) && !req.body.daysOfWeek.length) {
      return res.status(400).json({ error: "Select at least one active day" });
    }

    const updated = await Schedule.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, { ...req.body, alertWindowMinutes: 2 }, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const deleted = await Schedule.findOneAndDelete({ _id: req.params.id, owner: req.user._id });

    if (!deleted) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    await DoseEvent.deleteMany({ scheduleId: req.params.id });
    res.json({ message: "Schedule deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await buildDashboardMetrics(req.user._id);
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getActiveAlerts = async (req, res) => {
  try {
    const alerts = (await getActiveAlerts(new Date())).filter(
      (event) => String(event.scheduleId?.owner) === String(req.user._id)
    );

    res.json(
      alerts.map((event) => ({
        eventId: event._id,
        scheduleId: event.scheduleId?._id,
        medicineName: event.medicineName,
        compartment: event.compartment,
        scheduledTime: event.scheduledTime,
        status: event.status,
        alertWindowMinutes: event.scheduleId?.alertWindowMinutes || 2,
        caregiverAlerted: event.caregiverAlerted,
        alertState: event.alertState
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDeviceAlertState = async (req, res) => {
  try {
    const event = await DoseEvent.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: "Dose event not found" });
    }

    res.json({
      eventId: event._id,
      status: event.status,
      alertState: {
        buzzer: Boolean(event.alertState?.buzzer),
        led: Boolean(event.alertState?.led)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.silenceAlert = async (req, res) => {
  try {
    const event = await DoseEvent.findById(req.params.eventId).populate("scheduleId");

    if (!event) {
      return res.status(404).json({ error: "Dose event not found" });
    }

    if (String(event.scheduleId?.owner) !== String(req.user._id)) {
      return res.status(404).json({ error: "Dose event not found" });
    }

    if (!["scheduled", "dispensed"].includes(event.status)) {
      return res.status(400).json({ error: "Only active alerts can be silenced" });
    }

    event.alertState.buzzer = false;
    await event.save();

    res.json({
      message: "Buzzer silenced",
      eventId: event._id,
      alertState: event.alertState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDeviceQueue = async (req, res) => {
  try {
    const queue = await getActiveDoseQueue(new Date());

    res.json(
      queue.map(({ schedule, event }) => ({
        eventId: event._id,
        scheduleId: schedule._id,
        medicineName: schedule.medicineName,
        dosage: schedule.dosage,
        pillCount: schedule.pillCount,
        compartment: schedule.compartment,
        scheduledTime: event.scheduledTime,
        status: event.status,
        hardware: {
          servoAction: "rotate",
          buzzer: event.alertState?.buzzer !== false,
          led: event.alertState?.led !== false,
          irSensorRequired: true
        }
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDeviceSchedules = async (req, res) => {
  try {
    const snapshot = await buildDeviceScheduleSnapshot();
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.reportDispense = async (req, res) => {
  try {
    const { scheduleId, eventId, scheduledTime, occurredAt, notes } = req.body;
    const { event, schedule } = await resolveEventForDeviceReport({ eventId, scheduleId, scheduledTime });

    if (!event) {
      return res.status(400).json({ error: "eventId or scheduleId is required" });
    }

    if (scheduleId && !schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    event.status = "dispensed";
    event.dispensedAt = occurredAt ? new Date(occurredAt) : scheduledTime ? new Date(scheduledTime) : new Date();
  event.alertState = event.alertState || {};
  event.alertState.buzzer = event.alertState.buzzer !== false;
  event.alertState.led = true;
    event.alertState.notificationSent = false;
    event.notes = notes || event.notes;
    await event.save();

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.reportPickup = async (req, res) => {
  try {
    const { eventId, scheduleId, scheduledTime, occurredAt, pickupDetected, sensorState } = req.body;

    if (!eventId && !scheduleId) {
      return res.status(400).json({ error: "eventId or scheduleId is required" });
    }

    const { event } = await resolveEventForDeviceReport({ eventId, scheduleId, scheduledTime });

    if (!event) {
      return res.status(404).json({ error: "Dose event not found" });
    }

    if (pickupDetected) {
      event.status = "taken";
      event.takenAt = occurredAt ? new Date(occurredAt) : new Date();
      event.sensorState = sensorState || "pickup_confirmed";
      event.alertState.buzzer = false;
      event.alertState.led = false;
      event.alertState.notificationSent = true;
    } else {
      event.sensorState = sensorState || "not_picked_up";

      if (event.dispensedAt) {
        const schedule = await Schedule.findById(event.scheduleId);
        const deadline = new Date(event.dispensedAt.getTime() + 2 * 60 * 1000);

        if (new Date() >= deadline) {
          await markEventMissedAndNotify(event, schedule);
        }
      }
    }

    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDoseEvents = async (req, res) => {
  try {
    const schedules = await Schedule.find({ owner: req.user._id }).select("_id");
    const scheduleIds = schedules.map((schedule) => schedule._id);
    const doseEvents = await DoseEvent.find({ scheduleId: { $in: scheduleIds } })
      .populate("scheduleId")
      .sort({ scheduledTime: -1 })
      .limit(100);

    res.json(doseEvents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};