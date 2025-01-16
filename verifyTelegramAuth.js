const crypto = require('crypto');
const config = require('./config');

const verifyTelegramAuth = (telegramInitData) => {
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();

    let dataCheckString = '';
    for (const [key, value] of urlParams.entries()) {
        dataCheckString += `${key}=${value}\n`;
    }
    dataCheckString = dataCheckString.slice(0, -1);

    const secret = crypto.createHmac('sha256', 'WebAppData').update(config.TELEGRAM_BOT_TOKEN);
    const calculatedHash = crypto.createHmac('sha256', secret.digest()).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
}

module.exports = verifyTelegramAuth;
