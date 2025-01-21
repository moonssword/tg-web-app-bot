require('dotenv').config();

module.exports = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN,
    TELEGRAM_CHANNEL: process.env.TELEGRAM_CHANNEL,
    ADMIN_ID: process.env.ADMIN_ID,
    MODERATOR_ID: process.env.MODERATOR_ID,
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
    CHECK_INTERVAL:process.env.CHECK_INTERVAL, // '10 seconds', '5 minutes', '24 hours', '7 days', '1 month', '1 year','1 day 3 hours 15 minutes'
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY
};