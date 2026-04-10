const mongoose = require("mongoose");

const doseEventSchema = new mongoose.Schema(
  {
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
      index: true
    },
    medicineName: {
      type: String,
      required: true,
      trim: true
    },
    compartment: {
      type: Number,
      required: true,
      min: 1
    },
    scheduledTime: {
      type: Date,
      required: true,
      index: true
    },
    dispensedAt: {
      type: Date,
      default: null
    },
    takenAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ["scheduled", "dispensed", "taken", "missed"],
      default: "scheduled",
      index: true
    },
    sensorState: {
      type: String,
      enum: ["unknown", "pill_detected", "pickup_confirmed", "not_picked_up"],
      default: "unknown"
    },
    alertState: {
      buzzer: {
        type: Boolean,
        default: true
      },
      led: {
        type: Boolean,
        default: true
      },
      notificationSent: {
        type: Boolean,
        default: false
      },
      emailSent: {
        type: Boolean,
        default: false
      },
      emailSentAt: {
        type: Date,
        default: null
      },
      smsSent: {
        type: Boolean,
        default: false
      },
      smsSentAt: {
        type: Date,
        default: null
      }
    },
    notes: {
      type: String,
      trim: true
    },
    caregiverAlerted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

doseEventSchema.index({ status: 1, scheduledTime: 1 });

module.exports = mongoose.model("DoseEvent", doseEventSchema);