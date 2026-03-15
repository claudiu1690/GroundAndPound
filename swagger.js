const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Ground & Pound: Chronicles of the Cage — API',
            version: '2.0.0',
            description: 'MMA career RPG backend. Create fighters, train at gyms, get fight offers, accept and resolve fights. Energy regenerates 1/min. No levels — progression is Overall Rating only.',
        },
        servers: [
            { url: 'http://localhost:3000', description: 'Development' },
        ],
        tags: [
            { name: 'Fighters', description: 'Create and manage your fighter (character)' },
            { name: 'Gyms', description: 'List and view gyms (train at a gym via Fighters train)' },
            { name: 'Fights', description: 'Get offers, accept fight, camp, resolve fight' },
        ],
    },
    apis: ['./routes/*.js', './swagger/schemas.js'],
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};