const mongoose = require("mongoose");

const caregiverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    userId: {
      type: String,
      trim: true,
      default: "default-user"
    },
    deviceId: {
      type: String,
      trim: true,
      default: "esp32-001",
      index: true
    },
    medicineName: {
      type: String,
      required: true,
      trim: true
    },
    dosage: {
      type: String,
      required: true,
      trim: true
    },
    compartment: {
      type: Number,
      required: true,
      min: 1
    },
    time: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: (days) => Array.isArray(days) && days.length > 0 && days.every((day) => day >= 0 && day <= 6),
        message: "Select at least one valid day of week"
      }
    },
    alertWindowMinutes: {
      type: Number,
      default: 2,
      min: 1,
      max: 240
    },
    pillCount: {
      type: Number,
      default: 1,
      min: 1
    },
    caregiver: caregiverSchema,
    isActive: {
      type: Boolean,
      default: true
    },
    lastDispensedFor: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

scheduleSchema.index({ isActive: 1, time: 1 });
scheduleSchema.index({ owner: 1, time: 1 });
scheduleSchema.index({ deviceId: 1, time: 1 });

module.exports = mongoose.model("Schedule", scheduleSchema);