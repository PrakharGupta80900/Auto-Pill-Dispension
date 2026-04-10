const { BrevoClient } = require("@getbrevo/brevo");

const IST_TIME_ZONE = "Asia/Kolkata";

let brevoClient = null;

const formatDateTime = (value) => new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: IST_TIME_ZONE
}).format(new Date(value));

const getTransactionalEmailApi = () => {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!brevoClient) {
    brevoClient = new BrevoClient({ apiKey });
  }

  return brevoClient.transactionalEmails;
};

const sendMissedDoseEmail = async ({ recipient, schedule, event }) => {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const transactionalApi = getTransactionalEmailApi();

  if (!recipient?.email || !senderEmail || !transactionalApi) {
    return { sent: false, skipped: true };
  }

  const email = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || "Smart Pill Dispenser",
      email: senderEmail
    },
    to: [{
      email: recipient.email,
      name: recipient.name || "User"
    }],
    subject: `Missed dose alert: ${event.medicineName}`,
    htmlContent: `
    <h2>Missed dose alert</h2>
    <p>${event.medicineName} was not picked up within the 2 minute window.</p>
    <p><strong>Dosage:</strong> ${schedule?.dosage || "Not set"}</p>
    <p><strong>Compartment:</strong> ${event.compartment}</p>
    <p><strong>Scheduled time:</strong> ${formatDateTime(event.scheduledTime)} IST</p>
    <p>Please check the dispenser and patient status.</p>
  `,
    textContent: [
      "Missed dose alert",
      `${event.medicineName} was not picked up within the 2 minute window.`,
      `Dosage: ${schedule?.dosage || "Not set"}`,
      `Compartment: ${event.compartment}`,
      `Scheduled time: ${formatDateTime(event.scheduledTime)} IST`,
      "Please check the dispenser and patient status."
    ].join("\n")
  };

  await transactionalApi.sendTransacEmail(email);

  return { sent: true, skipped: false };
};

module.exports = {
  sendMissedDoseEmail
};