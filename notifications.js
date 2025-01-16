const cron = require('node-cron');
const dbManager = require('./db-manager');
const logger = require('./logger');

function startNotificationTask(bot) {
    cron.schedule('*/10 * * * *', async () => {
        try {
            await dbManager.checkForNewAds(bot);
        } catch (error) {
            logger.error(`Error during notification schedule: ${error}`);
        }
    });
}

module.exports = { startNotificationTask };