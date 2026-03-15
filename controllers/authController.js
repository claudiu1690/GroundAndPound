const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const fighterService = require("../services/fighterService");
const config = require("../config");

function signToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, fighterId: user.fighterId },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
    );
}

async function register(req, res) {
    try {
        const { email, password, fighter } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and password are required" });
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (!fighter?.firstName || !fighter?.lastName || !fighter?.weightClass || !fighter?.style)
            return res.status(400).json({ message: "Fighter first name, last name, weight class, and style are required" });

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing)
            return res.status(409).json({ message: "An account with this email already exists" });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, passwordHash });

        // Create the fighter linked to this account
        const newFighter = await fighterService.createFighter({ ...fighter, userId: user._id });
        user.fighterId = newFighter._id;
        await user.save();

        const token = signToken(user);
        res.status(201).json({ token, fighterId: newFighter._id });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ message: err.message || "Internal server error" });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and password are required" });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user)
            return res.status(401).json({ message: "Invalid email or password" });

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            return res.status(401).json({ message: "Invalid email or password" });

        const token = signToken(user);
        res.json({ token, fighterId: user.fighterId });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { register, login };
