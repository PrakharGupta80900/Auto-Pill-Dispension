const express = require("express");

const {
  beginDeviceProvisioning,
  claimDevice,
  completeDeviceProvisioning,
  getMyDevices,
  heartbeatDevice
} = require("../controllers/deviceController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/mine", protect, getMyDevices);
router.post("/claim", protect, claimDevice);
router.post("/provisioning/start", beginDeviceProvisioning);
router.post("/provisioning/complete", completeDeviceProvisioning);
router.post("/heartbeat", heartbeatDevice);

module.exports = router;