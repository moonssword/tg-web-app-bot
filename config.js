require('dotenv').config();

module.exports = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHANNEL: process.env.TELEGRAM_CHANNEL,
    DB_CONFIG: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    },
    cityChannels: {
        'Алматы': '@testtest123422dsdfv',
        'Астана': '@qertqertqert',
        'Шымкент': '@channel_shymkent',
    }
};