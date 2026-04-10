const crypto = require("crypto");
const Device = require("../models/device");

const generatePairingCode = () => crypto.randomInt(100000, 999999).toString();

const sanitizeDevice = (device) => ({
  id: device._id,
  deviceId: device.deviceId,
  name: device.name,
  wifiSsid: device.wifiSsid,
  owner: device.owner,
  lastSeenAt: device.lastSeenAt,
  firmwareVersion: device.firmwareVersion,
  setupCompletedAt: device.setupCompletedAt,
  paired: Boolean(device.owner)
});

exports.getMyDevices = async (req, res) => {
  try {
    const devices = await Device.find({ owner: req.user._id }).sort({ updatedAt: -1 });
    res.json(devices.map(sanitizeDevice));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.claimDevice = async (req, res) => {
  try {
    const { pairingCode, name } = req.body;

    if (!pairingCode) {
      return res.status(400).json({ error: "pairingCode is required" });
    }

    const device = await Device.findOne({ pairingCode: pairingCode.trim() });

    if (!device || !device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    device.owner = req.user._id;
    device.name = name?.trim() || device.name;
    device.setupCompletedAt = new Date();
    device.pairingCode = null;
    device.pairingCodeExpiresAt = null;
    await device.save();

    res.json({
      message: "Device paired successfully",
      device: sanitizeDevice(device)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.beginDeviceProvisioning = async (req, res) => {
  try {
    const { deviceId, firmwareVersion } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    const pairingCode = generatePairingCode();
    const device = await Device.findOneAndUpdate(
      { deviceId: deviceId.trim() },
      {
        $set: {
          deviceId: deviceId.trim(),
          firmwareVersion: firmwareVersion || null,
          pairingCode,
          pairingCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          lastSeenAt: new Date()
        },
        $setOnInsert: {
          name: "Smart Pill Dispenser"
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    res.json({
      deviceId: device.deviceId,
      pairingCode: device.pairingCode,
      expiresAt: device.pairingCodeExpiresAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.completeDeviceProvisioning = async (req, res) => {
  try {
    const { deviceId, pairingCode, wifiSsid } = req.body;

    if (!deviceId || !pairingCode) {
      return res.status(400).json({ error: "deviceId and pairingCode are required" });
    }

    const device = await Device.findOne({ deviceId: deviceId.trim(), pairingCode: pairingCode.trim() });

    if (!device || !device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    res.json({
      paired: Boolean(device.owner),
      ownerLinked: Boolean(device.owner),
      deviceName: device.name,
      wifiSsid: wifiSsid || device.wifiSsid || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.heartbeatDevice = async (req, res) => {
  try {
    const { deviceId, firmwareVersion, wifiSsid } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId: deviceId.trim() },
      {
        $set: {
          lastSeenAt: new Date(),
          firmwareVersion: firmwareVersion || null,
          wifiSsid: wifiSsid || null
        }
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    res.json({ ok: true, paired: Boolean(device.owner) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};