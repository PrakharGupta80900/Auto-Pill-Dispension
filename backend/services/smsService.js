const twilio = require("twilio");

const IST_TIME_ZONE = "Asia/Kolkata";

let smsClient = null;

const formatDateTime = (value) => new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: IST_TIME_ZONE
}).format(new Date(value));

const getSmsClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  if (!smsClient) {
    smsClient = twilio(accountSid, authToken);
  }

  return smsClient;
};

const sendMissedDoseSms = async ({ recipient, schedule, event }) => {
  const client = getSmsClient();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!recipient?.phone || !fromNumber || !client) {
    return { sent: false, skipped: true };
  }

  const body = [
    "Smart Pill Dispenser alert",
    `${event.medicineName} was not picked up within the 2 minute window.`,
    `Dosage: ${schedule?.dosage || "Not set"}`,
    `Compartment: ${event.compartment}`,
    `Scheduled time: ${formatDateTime(event.scheduledTime)} IST`
  ].join("\n");

  await client.messages.create({
    body,
    from: fromNumber,
    to: recipient.phone
  });

  return { sent: true, skipped: false };
};

module.exports = {
  sendMissedDoseSms
};