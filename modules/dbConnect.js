const mongoose = require('mongoose');
const config = require('../config');

/**
 * Connects to the MongoDB database using the configuration specified in the config module.
 * @async
 * @returns {Promise<void>} Resolves when the connection is successful, or rejects if there is an error.
 */
const connectDB = async () => {
    try {
        await mongoose.connect(config.database.url, config.database.options);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;