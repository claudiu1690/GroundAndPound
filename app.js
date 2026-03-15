const express = require("express");
const cors = require("cors");
const fighterRoutes = require("./routes/fighterRoutes");
const gymRoutes = require("./routes/gymRoutes");
const fightRoutes = require("./routes/fightRoutes");
const questRoutes = require("./routes/questRoutes");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const mongoose = require("mongoose");
const config = require("./config");
const swagger = require("./swagger");
const scheduler = require("./modules/scheduler");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public — no auth required
app.use("/auth", authRoutes);

// Protected — JWT required for all game routes
app.use("/fighters", authMiddleware, fighterRoutes);
app.use("/gyms", authMiddleware, gymRoutes);
app.use("/fights", authMiddleware, fightRoutes);
app.use("/quests", authMiddleware, questRoutes);

swagger(app);

mongoose.connect(config.database.url, config.database.options)
    .then(() => {
        console.log("Connected to MongoDB");
        scheduler.startEnergyIncrementScheduler();
        app.listen(config.port, () => {
            console.log(`Ground & Pound API running on port ${config.port}`);
            console.log(`Swagger UI: http://localhost:${config.port}/api-docs`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err);
    });
