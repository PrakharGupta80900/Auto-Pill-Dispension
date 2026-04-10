const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Schedule = require("../models/schedule");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET || "smart-pill-secret", {
    expiresIn: "7d"
  });

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  mobile: user.mobile,
  email: user.email
});

exports.register = async (req, res) => {
  try {
    const { name, mobile, email, password } = req.body;
    const normalizedEmail = email?.trim();

    if (!name || !mobile || !normalizedEmail || !password) {
      return res.status(400).json({
        error: "name, mobile, email, and password are required"
      });
    }

    const existingUser = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" }
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      mobile,
      email: normalizedEmail,
      password: hashedPassword
    });

    res.status(201).json({
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
};

exports.updateCurrentUser = async (req, res) => {
  try {
    const { name, mobile, email } = req.body;
    const normalizedEmail = email?.trim();

    if (!name || !mobile || !normalizedEmail) {
      return res.status(400).json({ error: "name, mobile, and email are required" });
    }

    const existingUser = await User.findOne({
      _id: { $ne: req.user._id },
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" }
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    req.user.name = name.trim();
    req.user.mobile = mobile.trim();
    req.user.email = normalizedEmail;
    await req.user.save();

    await Schedule.updateMany(
      { owner: req.user._id },
      {
        $set: {
          userId: req.user.email,
          "caregiver.name": req.user.name,
          "caregiver.phone": req.user.mobile,
          "caregiver.email": req.user.email
        }
      }
    );

    res.json({
      user: sanitizeUser(req.user),
      message: "Profile updated successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};