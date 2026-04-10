const { sendMissedDoseEmail } = require("./emailService");
const { sendMissedDoseSms } = require("./smsService");

const resolveAlertRecipient = (schedule) => {
  const email = schedule?.caregiver?.email || schedule?.userId || null;
  const phone = schedule?.caregiver?.phone || null;

  if (!email && !phone) {
    return null;
  }

  return {
    email,
    phone,
    name: schedule?.caregiver?.name || "User"
  };
};

const markEventMissedAndNotify = async (event, schedule) => {
  event.alertState = event.alertState || {};
  event.status = "missed";
  event.notes = "Dose missed: pickup not detected within alert window.";
  event.alertState.buzzer = false;
  event.alertState.led = false;
  event.alertState.notificationSent = true;

  const recipient = resolveAlertRecipient(schedule);

  if (!recipient || (event.alertState.emailSent && event.alertState.smsSent)) {
    event.caregiverAlerted = Boolean(event.alertState.emailSent || event.alertState.smsSent);
    return event;
  }

  const [emailDelivery, smsDelivery] = await Promise.allSettled([
    event.alertState.emailSent ? Promise.resolve({ sent: true, skipped: false }) : sendMissedDoseEmail({ recipient, schedule, event }),
    event.alertState.smsSent ? Promise.resolve({ sent: true, skipped: false }) : sendMissedDoseSms({ recipient, schedule, event })
  ]);

  if (emailDelivery.status === "fulfilled") {
    event.alertState.emailSent = Boolean(event.alertState.emailSent || emailDelivery.value.sent);
    event.alertState.emailSentAt = event.alertState.emailSent && !event.alertState.emailSentAt ? new Date() : event.alertState.emailSentAt;
  }

  if (smsDelivery.status === "fulfilled") {
    event.alertState.smsSent = Boolean(event.alertState.smsSent || smsDelivery.value.sent);
    event.alertState.smsSentAt = event.alertState.smsSent && !event.alertState.smsSentAt ? new Date() : event.alertState.smsSentAt;
  }

  const failures = [];

  if (emailDelivery.status === "rejected") {
    failures.push(`email delivery failed: ${emailDelivery.reason.message}`);
  }

  if (smsDelivery.status === "rejected") {
    failures.push(`sms delivery failed: ${smsDelivery.reason.message}`);
  }

  if (failures.length) {
    event.notes = `${event.notes} ${failures.join(" ")}`;
  }

  event.caregiverAlerted = Boolean(event.alertState.emailSent || event.alertState.smsSent);

  return event;
};

module.exports = {
  markEventMissedAndNotify,
  resolveAlertRecipient
};