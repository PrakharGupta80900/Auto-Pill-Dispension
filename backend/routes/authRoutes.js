const express = require("express");

const { getCurrentUser, login, register, updateCurrentUser } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getCurrentUser);
router.put("/me", protect, updateCurrentUser);

module.exports = router;