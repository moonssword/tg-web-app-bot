const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const dbManager = require('./db-manager');
const cron = require('node-cron');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  ]
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {polling: true});
const app = express();

app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

let adsData = {};
let photoTimers = {};

// Запускаем задачу оповещения каждые 10 минут
cron.schedule('*/10 * * * *', async () => { 
    //console.log('Starting notification schedule')
    try {
        await dbManager.checkForNewAds(bot);
    } catch (error) {
        logger.error(`Error during notification schedule: ${error}`);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const webAppUrl = `https://${config.DOMAIN}/form?chat_id=${chatId}`;

    try {
        if (text === '/start') {
            await dbManager.createNewUser(msg);
            const sentMessage = await bot.sendMessage(chatId, `Добро пожаловать, ${msg.from.first_name}! Для размещения объявления на канале перейдите на форму ⬇️`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔸Разместить объявление🔸', web_app: { url: webAppUrl} }]
                    ]
                }
            });
            await bot.pinChatMessage(chatId, sentMessage.message_id);
        }

        if ((msg.media_group_id || msg.photo) && adsData[chatId]?.data.ad_type == 'rentOut') {
            const photoArray = msg.photo;
            const largestPhoto = photoArray[photoArray.length - 1];
            const fileId = largestPhoto.file_id;

            if (!adsData[chatId]) {
                adsData[chatId] = { photos: [], photoURLs: [] };
            }

            if (adsData[chatId].photos.length < 10) {
                adsData[chatId].photos.push(fileId);
            }

            if (photoTimers[chatId]) {
                clearTimeout(photoTimers[chatId]);
            }

            savePhotoIDsToDB(chatId, fileId);

            // Устанавливаем новый таймер
            photoTimers[chatId] = setTimeout(() => {

                if (adsData[chatId].photos.length === 10) {
                    approveAD(adsData[chatId], chatId);
                } else {
                    approvePhotoAD(adsData[chatId], chatId);
                }
                delete photoTimers[chatId];
            }, 2000);
        }
    } catch (err) {
        console.error('Ошибка:', err);
        logger.error(`Error processing message from ${chatId}: ${err}`);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке. Пожалуйста, повторите попытку.');
      }
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const callbackData = callbackQuery.data;
    const currentPhotosCount = 10 - adsData[chatId]?.photos?.length;
    const city = adsData[chatId].data.city;
    const targetChannel = config.cityChannels[city];

    //const hasPostedToday = await checkCurrentDayAD(userId);

    try {
        if (callbackData === 'approved') {

            const chatMember = await bot.getChatMember(targetChannel, userId); // Проверка подписки на канал
                
            if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {  // Проверяем статус пользователя
                bot.sendMessage(chatId, `Пожалуйста, подпишитесь на канал ${targetChannel} для продолжения`);
                return;
            }

            if (adsData[chatId].photos && adsData[chatId].message) {
                const adId = await dbManager.saveADtoDB(adsData[chatId].data, adsData[chatId].photoURLs);
                const channelMessageId = await postADtoChannel(adsData[chatId], chatId, targetChannel);
                // await dbManager.checkForNewAds(bot); // Отправка уведомлений об обяъвлении сразу после публикации
                bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Объявление успешно опубликовано', show_alert: false});
                dbManager.updateADpostedData(adId, channelMessageId);
                await bot.deleteMessage(chatId, messageId);
            }
        } else if (callbackData === 'add_photo') {
            if (adsData[chatId].photos && adsData[chatId].message) {
                await bot.sendMessage(chatId, `⬆️ Можете отправить еще ${currentPhotosCount} фотографий`);
            }

        } else if (callbackData === 'receive_notification') {
            const searchCriteriaID = await dbManager.saveSearchCritireaToDB(adsData[chatId].data);
            bot.answerCallbackQuery(callbackQuery.id, {text: '💾 Поиск сохранен', show_alert: false});
            bot.deleteMessage(chatId, messageId);

            const searchText = `Сниму ${adsData[chatId].data.house_type === 'apartment' ? adsData[chatId].data.rooms + '-комн.квартиру' : adsData[chatId].data.house_type === 'room' ? 'комнату' : 'дом'} ${adsData[chatId].data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'} в г.${adsData[chatId].data.city}${adsData[chatId].data.district ? ', ' + adsData[chatId].data.district + ' р-н'  : ''}${adsData[chatId].data.microdistrict ? ', ' + adsData[chatId].data.microdistrict  : ''}
Цена: ${adsData[chatId].data.price_min}-${adsData[chatId].data.price_max} тг.
`;

            const caption = `🔍 Поиск №${searchCriteriaID} сохранен!\n\n\`${searchText}\`\n\nВы можете отписаться от уведомлений👇`;
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌Отписаться', callback_data: `delete_sc_${searchCriteriaID}` }]
                    ]
                }
            };
            await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });

        } else if (callbackData === 'reject_notification') {
            bot.answerCallbackQuery(callbackQuery.id, {text: '🗑️ Поиск удален', show_alert: false});
            bot.deleteMessage(chatId, messageId);

        } else if (callbackData.startsWith('delete_ad_')) {
            const channelMessageId = callbackData.split('_')[2];
            await bot.deleteMessage(targetChannel, channelMessageId);
            await bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Ваше объявление успешно удалено из канала', show_alert: false});
            await bot.sendMessage(chatId, '✅ Ваше объявление удалено из канала');
            await dbManager.deactivateAd(channelMessageId);
            //await bot.deleteMessage(chatId, messageId);

        } else if (callbackData.startsWith('delete_sc_')) {
            const searchCriteriaID = callbackData.split('_')[2];
            await dbManager.deactivateSC(searchCriteriaID);
            await bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Вы отписались от поиска', show_alert: false});
            await bot.sendMessage(chatId, `✅ Вы отписались от поиска №${searchCriteriaID}`);
            await bot.deleteMessage(chatId, messageId);
            await bot.answerCallbackQuery(callbackQuery.id, '✅ Вы отписались от поиска');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        logger.error(`Error processing callback query from ${chatId}: ${err}`);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке. Пожалуйста, повторите попытку.');
      }
});

app.post('/web-data', async (req, res) => {
    const data = req.body;
    const hasPostedToday = await dbManager.checkCurrentDayAD(data.user.id);
    //console.log('Received data:', JSON.stringify(data));

    const roomTypeText = (data.room_type === 'room' ? '' : data.room_type === 'bed_space' ? ' (койко-место)' : '');
    const roomLocationText = data.room_location === 'apartment' ? '' : 
                             data.room_location === 'hostel' ? 'в хостеле' : 
                             data.room_location === 'hotel' ? 'в гостинице' : '';

    try {
        const message = `
🏠 *Сдается* ${data.house_type === 'apartment' ? data.rooms + '-комн.квартира' : data.house_type === 'room' ? 'комната' + roomTypeText + (roomLocationText ? ' ' + roomLocationText : '') : 'дом'} ${data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'}, ${data.area} м², ${data.floor_current}/${data.floor_total} этаж${data.bed_capacity ? ', спальных мест - ' + data.bed_capacity : ''}
*Адрес:* г.${data.city}, ${data.district} р-н, ${data.microdistrict}, ${data.address}
*Сдает:* ${data.author === 'owner' ? 'собственник': 'посредник'}
*Цена:* ${data.price} ₸
*Депозит:* ${data.deposit ? `${data.deposit_value}%` : 'нет'}
*Телефон:* ${data.phone} ${[ data.whatsapp ? `[WhatsApp](https://api.whatsapp.com/send?phone=${data.phone})` : '', data.tg_username ? `[Telegram](https://t.me/${data.tg_username})` : ''].filter(Boolean).join(' ')}
🛋️ *Удобства*: ${[
    data.fridge ? 'холодильник' : '',
    data.washing_machine ? 'стиральная машина' : '',
    data.microwave ? 'микроволновая печь' : '',
    data.dishwasher ? 'посудомоечная машина' : '',
    data.iron ? 'утюг' : '',
    data.tv ? 'телевизор' : '',
    data.wifi ? 'Wi-Fi' : '',
    data.stove ? 'плита' : '',
    data.shower ? 'душ' : '',
    data.separate_toilet ? 'раздельный санузел' : '',
    data.bed_linen ? 'постельное белье' : '',
    data.towels ? 'полотенца' : '',
    data.hygiene_items ? 'средства гигиены' : '',
    data.kitchen ? 'кухня' : '',
    data.wardrobe ? 'хранение одежды' : '',
    data.sleeping_places ? 'спальные места' : ''
].filter(Boolean).join(', ')}
📜 *Правила заселения*: ${[
    data.family ? 'для семьи' : '',
    data.single ? 'для одного' : '',
    data.with_child ? 'можно с детьми' : '',
    data.with_pets ? 'можно с животными' : '',
    data.max_guests ? `макс. гостей: ${data.max_guests}` : ''
].filter(Boolean).join(', ')}
📝 *Описание*
${data.description}
`;

const message_rentIn = `
*Сниму* ${data.house_type === 'apartment' ? data.rooms + '-комн.квартиру' : data.house_type === 'room' ? 'комнату' : 'дом'} ${data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'} в г.${data.city}${data.district ? ', ' + data.district + ' р-н'  : ''}${data.microdistrict ? ', ' + data.microdistrict  : ''}
*Цена:* ${data.price_min}-${data.price_max} ₸
*Телефон:* ${data.phone}
`;

        adsData[data.chatId] = {
            data: data,
            message,
            photos: [],
            photoURLs: []
        };

        if (data.ad_type === 'rentOut') {
            await bot.answerWebAppQuery(data.queryId, {
                type: 'article',
                id: data.queryId,
                title: 'Успешная публикация',
                input_message_content: {
                    message_text: message,
                    parse_mode: 'Markdown'
                }
            });

            if (hasPostedToday.canPost) {
                await bot.sendMessage(data.chatId, '📸 Для продолжения, пожалуйста, отправьте фотографии жилья (до 10 шт.)');
            } else {
                await bot.sendMessage(data.chatId, `⚠️ Разрешена публикация одного объявления в день!\nСледующее объявление может быть размещено ${hasPostedToday.availableToPostDate}`);
            }
            
        } else if (data.ad_type === 'rentIn') {
            await bot.answerWebAppQuery(data.queryId, {
                type: 'article',
                id: data.queryId,
                title: 'Успешная публикация',
                input_message_content: {
                    message_text: message_rentIn,
                    parse_mode: 'Markdown'
                }
            });
            
            await bot.sendMessage(data.chatId, 'Уважаемый пользователь, размещение объявлений о поиске жилья на канале не предусмотрено. Однако вы можете подписаться на уведомления о появлении в базе новых вариантов жилья, соответствующих вашим критериям.', {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🔔Подписаться', callback_data: 'receive_notification' }, { text: '⛔Отказаться', callback_data: 'reject_notification' }],
                  ],
                },
              })
        }


        return res.status(200).json({});
    } catch (e) {
        console.log('Error:', e);
        logger.error(`Error processing callback query from ${chatId}: ${e}`);
        return res.status(500).json({});
    }
});

// Эндпоинт для проверки пользователя
app.get('/userIsValid', (req, res) => {
    const { hash, checkDataString } = req.query;

    const secretKey = crypto.createHmac('sha256', BOT_TOKEN + "WebAppData").digest('hex');

    const calculatedHash = crypto.createHmac('sha256', secretKey).update(checkDataString).digest('hex');

    if (calculatedHash === hash) {
        return res.json({ result: true });
    } else {
        return res.json({ result: false });
    }
});

const PORT = config.PORT;

app.listen(PORT, () => {
    console.log(`Server started on PORT ${PORT} at ${new Date().toLocaleString()}`);
    logger.info(`Server started on PORT ${PORT} at ${new Date().toLocaleString()}`);
  });

// Функция для публикации
async function postADtoChannel(ad, chatId, targetChannel) {
    const mediaGroup = await createMediaGroup(ad);
    const messageOnChannel = await bot.sendMediaGroup(targetChannel, mediaGroup);
    const messageId = messageOnChannel[0].message_id;
    const messageLink = `https://t.me/${targetChannel.replace('@', '')}/${messageId}`;

    const caption = `🎉 Ваше [объявление](${messageLink}) успешно опубликовано!\n\n🏠 После сдачи жилья вы можете удалить объявление из канала ⤵️`;

    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🗑️Удалить объявление', callback_data: `delete_ad_${messageId}` }]
            ]
        }
    };

    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });
    
    console.log(`Объявление ${messageId} опубликовано на канале`);
    return messageId;
}

// Функция для согласования публикации (до 10 фотографий)
async function approvePhotoAD(ad, chatId) {
    const currentPhotosCount = 10 - adsData[chatId].photos.length;
    const mediaGroup = await createMediaGroup(ad);

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, `⬆️ Вы можете добавить еще ${currentPhotosCount} фотографии или опубликовать объявление`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'approved' }, { text: '↩️Добавить фото', callback_data: 'add_photo' }],
              ],
            },
          });
    console.log('Согласование публикации и добавления фотографий');
}

// Функция для согласования публикации (10 фотографий)
async function approveAD(ad, chatId) {
    const mediaGroup = await createMediaGroup(ad);

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, 'Нажмите "Опубликовать" для отправки объявления на канал', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'approved' }],
              ],
            },
          });

    console.log('Согласование публикации');
}

async function createMediaGroup(ad, includeCaption = true) {
    const trimmedMessage = ad.message?.length > 1024 
        ? ad.message.substring(0, ad.message.lastIndexOf(' ', 1024)) + '...' 
        : ad.message;

    return ad.photos.map((fileId, index) => ({
        type: 'photo',
        media: fileId,
        caption: includeCaption && index === 0 ? trimmedMessage : '',
        parse_mode: 'Markdown'
    }));
}

async function savePhotoIDsToDB(chatId, fileId) {

        //const photoUrl = await getPhotoUrl(fileId);
        adsData[chatId].photoURLs.push(fileId);
}

async function getPhotoUrl(fileId) {
    const file = await bot.getFile(fileId);
    return `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}