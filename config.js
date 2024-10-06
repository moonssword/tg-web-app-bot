require('dotenv').config();

module.exports = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHANNEL: process.env.TELEGRAM_CHANNEL,
    DOMAIN: process.env.DOMAIN,
    PORT: process.env.PORT,
    DB_CONFIG: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    },
    cityChannels: JSON.parse(process.env.CITY_CHANNELS || '{}'),
    CHECK_INTERVAL:'24 hours', // '10 seconds', '5 minutes', '24 hours', '7 days', '1 month', '1 year','1 day 3 hours 15 minutes'
};