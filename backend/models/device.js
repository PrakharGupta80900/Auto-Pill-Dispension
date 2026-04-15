const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      default: "Smart Pill Dispenser",
      trim: true
    },
    wifiSsid: {
      type: String,
      default: null,
      trim: true
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    firmwareVersion: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Device", deviceSchema);