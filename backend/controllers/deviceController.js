const Device = require("../models/device");

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
          deviceId: deviceId.trim(),
          name: "Smart Pill Dispenser",
          lastSeenAt: new Date(),
          firmwareVersion: firmwareVersion || null,
          wifiSsid: wifiSsid || null
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    res.json({ ok: true, deviceId: device.deviceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};