const DoseEvent = require("../models/doseEvent");
const Schedule = require("../models/schedule");
const { markEventMissedAndNotify } = require("./alertService");

const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

const getISTDateParts = (date = new Date()) => {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);

  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth() + 1,
    day: istDate.getUTCDate(),
    dayOfWeek: istDate.getUTCDay(),
    hours: istDate.getUTCHours(),
    minutes: istDate.getUTCMinutes()
  };
};

const formatDateKey = (date) => {
  const { year, month, day } = getISTDateParts(date);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const buildScheduledDate = (dateKey, time) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - IST_OFFSET_MS);
};

const createDoseEventForSchedule = async (schedule, scheduledDate) => {
  const existing = await DoseEvent.findOne({
    scheduleId: schedule._id,
    scheduledTime: scheduledDate
  });

  if (existing) {
    return existing;
  }

  return DoseEvent.create({
    scheduleId: schedule._id,
    medicineName: schedule.medicineName,
    compartment: schedule.compartment,
    scheduledTime: scheduledDate
  });
};

const ensureDoseEventForNow = async (schedule, now = new Date()) => {
  const dateKey = formatDateKey(now);
  const scheduledDate = buildScheduledDate(dateKey, schedule.time);

  return createDoseEventForSchedule(schedule, scheduledDate);
};

const ensureDoseEventForScheduleTime = async (schedule, scheduledTime) => {
  const scheduledDate = new Date(scheduledTime);

  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Invalid scheduledTime");
  }

  return createDoseEventForSchedule(schedule, scheduledDate);
};

const syncTodayDoseEvents = async (now = new Date()) => {
  const { dayOfWeek } = getISTDateParts(now);
  const schedules = await Schedule.find({
    isActive: true,
    daysOfWeek: dayOfWeek
  }).sort({ time: 1 });

  return Promise.all(schedules.map((schedule) => ensureDoseEventForNow(schedule, now)));
};

const getAlertWindowDeadline = (event, schedule) => {
  const alertWindowMinutes = schedule?.alertWindowMinutes || 2;
  const alertStartTime = event.dispensedAt || event.scheduledTime;
  return new Date(alertStartTime.getTime() + alertWindowMinutes * 60000);
};

const getActiveAlerts = async (now = new Date()) => {
  await syncTodayDoseEvents(now);

  const activeEvents = await DoseEvent.find({
    status: { $in: ["scheduled", "dispensed"] },
    scheduledTime: { $lte: now }
  })
    .populate("scheduleId")
    .sort({ scheduledTime: 1 });

  return activeEvents.filter((event) => {
    if (!event.scheduleId) {
      return false;
    }

    return now <= getAlertWindowDeadline(event, event.scheduleId);
  });
};

const getActiveDoseQueue = async (now = new Date()) => {
  const activeAlerts = await getActiveAlerts(now);

  return activeAlerts
    .filter((event) => event.status === "scheduled")
    .filter((event) => event.scheduleId)
    .map((event) => ({
      schedule: event.scheduleId,
      event
    }));
};

const markMissedDoses = async (now = new Date()) => {
  await syncTodayDoseEvents(now);

  const pendingEvents = await DoseEvent.find({
    status: { $in: ["scheduled", "dispensed"] }
  }).populate("scheduleId");

  const updates = [];

  for (const event of pendingEvents) {
    const schedule = event.scheduleId;

    if (!schedule) {
      continue;
    }

    const deadline = getAlertWindowDeadline(event, schedule);

    if (now > deadline) {
      await markEventMissedAndNotify(event, schedule);
      updates.push(event.save());
    }
  }

  return Promise.all(updates);
};

const buildDashboardMetrics = async (ownerId) => {
  const now = new Date();
  await syncTodayDoseEvents(now);

  const scheduleFilter = ownerId ? { owner: ownerId } : {};
  const schedules = await Schedule.find(scheduleFilter).sort({ time: 1 });
  const scheduleIds = schedules.map((schedule) => schedule._id);
  const doseEventFilter = scheduleIds.length ? { scheduleId: { $in: scheduleIds } } : { _id: null };

  const [doseEvents, missedAlerts] = await Promise.all([
    DoseEvent.find(doseEventFilter).sort({ scheduledTime: -1 }).limit(50),
    DoseEvent.find({
      ...doseEventFilter,
      status: "missed"
    })
      .populate("scheduleId")
      .sort({ scheduledTime: -1 })
      .limit(20)
  ]);

  const activeAlerts = ownerId
    ? (await getActiveAlerts(now)).filter((event) => String(event.scheduleId?.owner) === String(ownerId))
    : await getActiveAlerts(now);

  const stats = doseEvents.reduce(
    (accumulator, event) => {
      accumulator.total += 1;
      accumulator[event.status] += 1;
      return accumulator;
    },
    {
      total: 0,
      scheduled: 0,
      dispensed: 0,
      taken: 0,
      missed: 0
    }
  );

  return {
    stats,
    schedules,
    activeAlerts,
    missedAlerts,
    recentEvents: doseEvents
  };
};

const buildDeviceScheduleSnapshot = async () => {
  const schedules = await Schedule.find({ isActive: true }).sort({ time: 1, updatedAt: 1 });
  const versionSource = schedules.reduce((latest, schedule) => {
    const updatedAt = schedule.updatedAt?.toISOString() || "";
    return updatedAt > latest ? updatedAt : latest;
  }, "");

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Kolkata",
    version: versionSource || new Date(0).toISOString(),
    schedules: schedules.map((schedule) => ({
      scheduleId: schedule._id,
      deviceId: schedule.deviceId || "esp32-001",
      medicineName: schedule.medicineName,
      dosage: schedule.dosage,
      compartment: schedule.compartment,
      time: schedule.time,
      daysOfWeek: schedule.daysOfWeek,
      alertWindowMinutes: schedule.alertWindowMinutes || 2,
      pillCount: schedule.pillCount || 1,
      isActive: schedule.isActive,
      updatedAt: schedule.updatedAt?.toISOString() || null
    }))
  };
};

module.exports = {
  buildDeviceScheduleSnapshot,
  buildDashboardMetrics,
  ensureDoseEventForScheduleTime,
  ensureDoseEventForNow,
  getActiveDoseQueue,
  getActiveAlerts,
  markMissedDoses,
  syncTodayDoseEvents
};