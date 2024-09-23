const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});
const webAppUrl = 'https://5084-5-251-196-243.ngrok-free.app';

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        await bot.sendMessage(chatId, 'Привет! Нажмите кнопку ниже, чтобы разместить объявление.', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Разместить объявление', web_app: { url: webAppUrl + '/form' } }]
                ],
                resize_keyboard: true
            }
        });

        await bot.sendMessage(chatId, 'Привет! Нажмите кнопку, чтобы разместить объявление.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Разместить объявление', web_app: { url: webAppUrl + '/form' } }]
                ]
            }
        });
    }


    if(msg?.web_app_data?.data) {
        try {
            const data = JSON.parse(msg?.web_app_data?.data)
            console.log(data)
            await bot.sendMessage(chatId, 'Спасибо за обратную связь!')
            await bot.sendMessage(chatId, 'Ваш город: ' + data?.city);
            await bot.sendMessage(chatId, 'Ваш адрес: ' + data?.district);
            await bot.sendMessage(chatId, 'Ваши фото: ' + data?.photos);

            setTimeout(async () => {
                await bot.sendMessage(chatId, 'Всю информацию вы получите в этом чате');
            }, 3000)
        } catch (e) {
            console.log(e);
        }
    }
});