const express = require("express");

const {
  heartbeatDevice
} = require("../controllers/deviceController");

const router = express.Router();

router.post("/heartbeat", heartbeatDevice);

module.exports = router;