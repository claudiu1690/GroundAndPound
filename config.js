module.exports = {
    port: process.env.PORT || 4000,
    database: {
        url: process.env.MONGODB_URI || 'mongodb://localhost:27017/mmaGame',
        options: {}
    },
    jwtSecret: process.env.JWT_SECRET || 'gnp_super_secret_key_change_in_prod_2026',
    jwtExpiresIn: '30d',
};
