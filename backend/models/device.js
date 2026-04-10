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
    pairingCode: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    pairingCodeExpiresAt: {
      type: Date,
      default: null
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    },
    setupCompletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Device", deviceSchema);