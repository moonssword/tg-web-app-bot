const app = require('./app');
const bot = require('./bot');
const config = require('./config');
const logger = require('./logger');

//bot.start();

app.listen(config.PORT, () => {
    console.log(`Server started on PORT ${config.PORT} at ${new Date().toLocaleString()}`);
    logger.info(`Server started on PORT ${config.PORT} at ${new Date().toLocaleString()}`);
  });
