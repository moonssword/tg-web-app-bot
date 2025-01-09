const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const dbManager = require('./db-manager');
const cron = require('node-cron');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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

let adsData = {};
let photoTimers = {};

cron.schedule('*/10 * * * *', async () => { 
    //console.log('Starting notification schedule')
    try {
        await dbManager.checkForNewAds(bot); // Периодическая проверка новых объявления и отправка уведомлений
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
            const sentMessage = await bot.sendMessage(chatId, `Добро пожаловать, ${msg.from.first_name}!\n\nЧтобы разместить объявление или подписаться на уведомления о подходящих вариантах, перейдите на форму`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Опубликовать', web_app: { url: webAppUrl} }]
                    ]
                }
            });
            await bot.pinChatMessage(chatId, sentMessage.message_id);
        } else if (text && typeof text === 'string' && text.startsWith('@')) {
            const command = text.replace(/^@\S+\s/, ''); // Удаляет `@название_канала `

            if (command.startsWith('/approve_ad')) { // Подтверждение и публикация
                const parts = command.split('_');

                // Проверка на корректность формата
                if (parts.length < 4) {
                    await bot.sendMessage(chatId, '❗ Неверный формат команды. Ожидается: /approve_ad_chatId_adId');
                    return;
                }

                const chatIdToPost = parts[2];
                const adId = parts[3];

                try {
                    const { messageIds, messageLink } = await postADtoChannel(adId, chatIdToPost);
                    await bot.sendMessage(chatId, `✅ [Объявление](${messageLink}) подтверждено и опубликовано`, { parse_mode: 'Markdown' });
                    await dbManager.updateADpostedData(adId, messageIds);
                } catch (error) {
                    console.error('Ошибка при публикации объявления:', error);
                    await bot.sendMessage(chatId, '❗ Произошла ошибка при публикации объявления.');
                }
            } else if (command.startsWith('/reject_ad')) {  // Отклонение публикации
                const parts = command.split('_');

                // Проверка на корректность формата
                if (parts.length < 4) {
                    await bot.sendMessage(chatId, '❗ Неверный формат команды. Ожидается: /reject_ad_chatId_adId');
                    return;
                }

                const chatIdToReject = parts[2];
                const adId = parts[3];

                try {
                    await bot.sendMessage(chatId, `❗ Объявление ${adId} отклонено`);
                    await bot.sendMessage(chatIdToReject, '‼️ Ваше объявление было отклонено модератором.');
                    await dbManager.updateAd(adId, { is_active: false });
                } catch (error) {
                    console.error('Ошибка при отклонении объявления:', error);
                    await bot.sendMessage(chatId, '❗ Произошла ошибка при отклонении объявления.');
                }
            }
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

            adsData[chatId].photoURLs.push(fileId);

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
    const username = callbackQuery.from.username;
    const callbackData = callbackQuery.data;
    const currentPhotosCount = 10 - adsData[chatId]?.photos?.length;
    const city = adsData[chatId].data.city; // Получение города из временной памяти
    const targetChannel = config.cityChannels[city];

    try {
        if (callbackData === 'send_to_moderate') {

            const chatMember = await bot.getChatMember(targetChannel, userId); // Проверка подписки на канал
            const targetChannelURL = `https://t.me/${targetChannel.replace('@', '')}`;
            if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
                bot.sendMessage(chatId, `⚠️Пожалуйста, подпишитесь на <a href="${targetChannelURL}">канал</a> для продолжения`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Подписаться', url: targetChannelURL }]
                        ]
                    }
                });
                return;
            }

            if (adsData[chatId].photos && adsData[chatId].message) {
                const adId = await dbManager.saveADtoDB(adsData[chatId].data, adsData[chatId].photoURLs, targetChannel);

                // Отправляем администратору
                await sendToModerate(adsData[chatId], chatId, adId, userId, username);
                await bot.sendMessage(chatId, '⏳ Ваше объявление находится на модерации...');
                bot.answerCallbackQuery(callbackQuery.id, { text: '⏳ Объявление отправлено на модерацию', show_alert: false });
                await bot.deleteMessage(chatId, messageId);
            }
        } else if (callbackData === 'add_photo') {
            if (adsData[chatId].photos && adsData[chatId].message) {
                await bot.sendMessage(chatId, `⬆️ Можете отправить еще ${currentPhotosCount} фотографий`);
            }

        } else if (callbackData === 'receive_notification') {
            const chatMember = await bot.getChatMember(targetChannel, userId); // Проверка подписки на канал
            const targetChannelURL = `https://t.me/${targetChannel.replace('@', '')}`;
            if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
                bot.sendMessage(chatId, `⚠️Пожалуйста, подпишитесь на <a href="${targetChannelURL}">канал</a> для продолжения`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Подписаться', url: targetChannelURL }]
                        ]
                    }
                });
                return;
            }

            const searchCriteriaID = await dbManager.saveSearchCritireaToDB(adsData[chatId].data);
            bot.answerCallbackQuery(callbackQuery.id, {text: '💾 Настройки фильтров сохранены', show_alert: false});
            bot.deleteMessage(chatId, messageId);

            const searchText = `Сниму ${adsData[chatId].data.house_type === 'apartment' ? adsData[chatId].data.rooms + '-комн.квартиру' : adsData[chatId].data.house_type === 'room' ? 'комнату' : 'дом'} ${adsData[chatId].data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'} в г.${adsData[chatId].data.city}${adsData[chatId].data.district ? ', ' + adsData[chatId].data.district + ' р-н'  : ''}${adsData[chatId].data.microdistrict ? ', ' + adsData[chatId].data.microdistrict  : ''}
Цена: ${adsData[chatId].data.price_min}-${adsData[chatId].data.price_max} тг.
`;

            const webAppUrlSC = `https://${config.DOMAIN}/autosearch?chat_id=${chatId}`;
            const caption = `💾 Настройки фильтров сохранены. Мы сообщим о новых объявлениях.\n\n\`${searchText}\``;
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔖 Поиски', web_app: { url: webAppUrlSC} }]
                    ]
                }
            };
            await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });

        } else if (callbackData === 'reject_notification') {
            bot.answerCallbackQuery(callbackQuery.id, {text: '🗑️ Поиск удален', show_alert: false});
            bot.deleteMessage(chatId, messageId);

        } else if (callbackData.startsWith('delete_ad_')) {
            /*const messageIds = JSON.parse(callbackData.replace('delete_ad_', ''));
            let successDeleted = false;
            for (const messageId of messageIds) {
                try {
                    const deleteResult = await bot.deleteMessage(targetChannel, messageId);
                    if (deleteResult) successDeleted = true;
                } catch (err) {
                    console.error(`Ошибка при удалении из канала ${targetChannel} сообщения ${messageId}:`, err);
                    logger.error(`Ошибка при удалении из канала ${targetChannel} сообщения ${messageId}:`, err);
                }
            }
            if (successDeleted) {
                await bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Ваше объявление успешно удалено из канала', show_alert: false });
                await bot.sendMessage(chatId, '✅ Ваше объявление удалено из канала');
                await dbManager.deactivateAd(messageIds[0]);
                //await bot.deleteMessage(chatId, messageId);
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, {text: '⚠️ Объявление не найдено или было удалено ранее из канала', show_alert: false });
            }*/

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

app.post('/api/web-data', async (req, res) => {
    const data = req.body;
    const hasPostedToday = await dbManager.checkCurrentDayAD(data.user.id); // Объект {canPost: true/false, availableToPostDate}
    //console.log('Received data:', JSON.stringify(data));

    const roomTypeText = (data.room_type === 'room' ? '' : data.room_type === 'bed_space' ? ' (койко-место)' : '');
    const roomLocationText = data.room_location === 'apartment' ? '' : 
                             data.room_location === 'hostel' ? 'в хостеле' : 
                             data.room_location === 'hotel' ? 'в гостинице' : '';

    try {
        const message = `
🏠 *Сдается* ${data.house_type === 'apartment' ? data.rooms + '-комн.квартира' : data.house_type === 'room' ? 'комната' + roomTypeText + (roomLocationText ? ' ' + roomLocationText : '') : 'дом'} ${data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'}, ${data.area} м², ${data.floor_current}/${data.floor_total} этаж${data.bed_capacity ? ', спальных мест - ' + data.bed_capacity : ''}
*Адрес:* г.${data.city}, ${data.district} р-н, ${data.microdistrict ? data.microdistrict + ', ' : ''} ${data.address}
*Сдает:* ${data.author === 'owner' ? 'собственник': 'посредник'}
*Цена:* ${data.price} ₸
*Депозит:* ${data.deposit ? `${data.deposit_value}%` : 'нет'}
*Контакты:* ${data.call ? data.phone : ''} ${[ data.whatsapp ? `[WhatsApp](https://api.whatsapp.com/send?phone=${data.phone})` : '', data.telegram ? `[Telegram](https://t.me/${data.tg_username ? data.tg_username : data.user.username})` : ''].filter(Boolean).join(' ')}
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
    data.combined_toilet ? 'совмещенный санузел' : '',
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
                    parse_mode: 'Markdown',
        disable_web_page_preview: true
                }
            });

            if (hasPostedToday.canPost) {
                await bot.sendMessage(data.chatId, '📸 Для продолжения, пожалуйста, отправьте фотографии жилья (до 10 шт.)');
            } else {
                await bot.sendMessage(data.chatId, `🕗 Следующая публикация возможна ${hasPostedToday.availableToPostDate}`);
            }
            
        } else if (data.ad_type === 'rentIn') {
            await bot.answerWebAppQuery(data.queryId, {
                type: 'article',
                id: data.queryId,
                title: 'Успешная публикация',
                input_message_content: {
                    message_text: message_rentIn,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                }
            });
            
            await bot.sendMessage(data.chatId, '📰 На данный момент размещение объявлений о поиске жилья на канале не предусмотрено.\nВы можете сохранить поиск в избранное и получать уведомления.', {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '💙 Сохранить поиск', callback_data: 'receive_notification' }, { text: '⛔ Отменить', callback_data: 'reject_notification' }],
                  ],
                },
              })
        }

        return res.status(200).json({});
    } catch (e) {
        console.log('Error:', e);
        logger.error(`Error processing callback query from ${data.chatId}: ${e}`);
        return res.status(500).json({});
    }
});

// Эндпоинт для получения критериев поиска пользователя
app.get('/api/sc', async (req, res) => {
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const searchCriteria = await dbManager.getSearchCriteriaByUserId(userId);

        if (searchCriteria.length === 0) {
            return res.status(404).json({ message: 'No active search criteria found for this user.' });
        }

        res.json({ searchCriteria: searchCriteria || [] });
    } catch (err) {
        console.error('Error fetching search criteria:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Эндпоинт для обновления критериев поиска
app.put('/api/sc/:criteriaId', async (req, res) => {
    const { criteriaId } = req.params;
    const updates = req.body;

    try {
        const updatedCriteria = await dbManager.updateSearchCriteria(criteriaId, updates);
        res.json({ message: 'Criteria updated successfully', updatedCriteria });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Эндпоинт для получения объявлений пользователя
app.get('/api/ads', async (req, res) => {
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const ads = await dbManager.getAdsByUserId(userId);

        if (ads.length === 0) {
            return res.status(404).json({ message: 'No ads found for this user.' });
        }

        res.json({ ads: ads || [] });
    } catch (err) {
        console.error('Error fetching ads:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Эндпоинт для обновления объявления
app.put('/api/ads/:adId', async (req, res) => {
    const { adId } = req.params;
    const updates = req.body;

    try {
        const updatedAd = await dbManager.updateAd(adId, updates);
        res.json({ message: 'Ad updated successfully', updatedAd });

        if (!updates.is_active) {
            const targetChannel = updates.tg_channel;
            const messageIds = updates.message_id;
            let successDeleted = false;
            for (const messageId of messageIds) {
                try {
                    const deleteResult = await bot.deleteMessage(targetChannel, messageId);
                    if (deleteResult) successDeleted = true;
                } catch (err) {
                    console.error(`Ошибка при удалении из канала ${targetChannel} сообщения ${messageId}:`, err);
                    logger.error(`Ошибка при удалении из канала ${targetChannel} сообщения ${messageId}:`, err);
                }
            }
            if (successDeleted) {
                await bot.sendMessage(updates.tg_user_id, '✅ Объявление удалено из канала');
            }
        }

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const PORT = config.PORT;
app.listen(PORT, () => {
    console.log(`Server started on PORT ${PORT} at ${new Date().toLocaleString()}`);
    logger.info(`Server started on PORT ${PORT} at ${new Date().toLocaleString()}`);
  });

// Функция для отправки объявления модератору
async function sendToModerate(ad, chatId, adId, userId, username) {
    const mediaGroup = await createMediaGroup(ad);
    await bot.sendMediaGroup(config.MODERATOR_ID, mediaGroup);

    const moderationMessage = `🔍 Новое объявление от пользователя @${username} ID:${userId}`;
    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Подтвердить', switch_inline_query_current_chat: `/approve_ad_${chatId}_${adId}` }],
                [{ text: '❌ Отклонить', switch_inline_query_current_chat: `/reject_ad_${chatId}_${adId}` }]
            ]
        }
    };

    await bot.sendMessage(config.MODERATOR_ID, moderationMessage, { parse_mode: 'Markdown', ...inlineKeyboard });
}

// Функция для публикации
async function postADtoChannel(adId, chatId) {
    const ad = await getAdDataFromDB(adId);
    const mediaGroup = await createMediaGroup(ad);
    const messageOnChannel = await bot.sendMediaGroup(ad.data.tg_channel, mediaGroup);
    const messageIds = messageOnChannel.map(message => message.message_id);
    const messageLink = `https://t.me/${ad.data.tg_channel.replace('@', '')}/${messageIds[0]}`;

    const caption = `✅ [Объявление](${messageLink}) успешно опубликовано!`;

    const webAppUrlADS = `https://${config.DOMAIN}/ads?chat_id=${chatId}`;
    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📰 Мои объявления', web_app: { url: webAppUrlADS} }]
            ]
        }
    };

    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });
    
    console.log(`Объявление ${messageIds[0]} опубликовано на канале`);
    return { messageIds, messageLink };
}

// Функция для публикации
/*async function postADtoChannel(ad, chatId, targetChannel) {
    const mediaGroup = await createMediaGroup(ad);
    const messageOnChannel = await bot.sendMediaGroup(targetChannel, mediaGroup);
    const messageIds = messageOnChannel.map(message => message.message_id);
    const messageLink = `https://t.me/${targetChannel.replace('@', '')}/${messageIds[0]}`;

    const caption = `🎉 Ваше [объявление](${messageLink}) успешно опубликовано!\n🏠После сдачи жилья вы можете удалить объявление из канала ⤵️`;

    const webAppUrlADS = `https://${config.DOMAIN}/ads?chat_id=${chatId}`;
    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📰 Мои объявления', web_app: { url: webAppUrlADS} }]
            ]
        }
    };

    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });
    
    console.log(`Объявление ${messageIds[0]} опубликовано на канале`);
    return messageIds;
}*/

// Функция для согласования публикации (до 10 фотографий)
async function approvePhotoAD(ad, chatId) {
    const currentPhotosCount = 10 - adsData[chatId].photos.length;
    const mediaGroup = await createMediaGroup(ad);

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, `⬆️ Вы можете добавить еще ${currentPhotosCount} фотографий или опубликовать объявление`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'send_to_moderate' }, { text: '↩️Добавить фото', callback_data: 'add_photo' }],
              ],
            },
          });
    console.log('Согласование публикации и добавления фотографий');
}

// Функция для согласования публикации (10 фотографий)
async function approveAD(ad, chatId) {
    const mediaGroup = await createMediaGroup(ad);

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, 'Нажмите "Опубликовать" для публикации объявления на канале', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'send_to_moderate' }],
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

// Функция для получения данных объявления из БД и формирования сообщения
async function getAdDataFromDB(adId) {
    const ad = await dbManager.getAdById(adId);
    const roomTypeText = ad.room_type === 'room' ? '' : ad.room_type === 'bed_space' ? ' (койко-место)' : '';
    const roomLocationText = ad.room_location === 'apartment' ? '' :
                             ad.room_location === 'hostel' ? 'в хостеле' :
                             ad.room_location === 'hotel' ? 'в гостинице' : '';

    const message = `
🏠 *Сдается* ${ad.house_type === 'apartment' ? ad.rooms + '-комн.квартира' : ad.house_type === 'room' ? 'комната' + roomTypeText + (roomLocationText ? ' ' + roomLocationText : '') : 'дом'} ${ad.duration === 'long_time' ? 'на длительный срок' : 'посуточно'}, ${ad.area} м²${ad.floor_current && ad.floor_total ? `, ${ad.floor_current}/${ad.floor_total} этаж` : ''}${ad.bed_capacity ? ', спальных мест - ' + ad.bed_capacity : ''}
*Адрес:* г.${ad.city}, ${ad.district} р-н, ${ad.microdistrict ? ad.microdistrict + ', ' : ''} ${ad.address}
*Сдает:* ${ad.author === 'owner' ? 'собственник' : 'посредник'}
*Цена:* ${ad.price} ₸
*Контакты:* ${ad.phone} ${[ad.whatsapp ? `[WhatsApp](https://api.whatsapp.com/send?phone=${ad.phone})` : '', ad.telegram && ad.tg_username ? `[Telegram](https://t.me/${ad.tg_username})` : ''].filter(Boolean).join(' ')}
🛋️ *Удобства*: ${[
        ad.toilet ? ad.toilet : '',
        ad.bathroom ? ad.bathroom : '',
        ad.furniture ? ad.furniture : '',
        ad.facilities ? ad.facilities : ''
    ].filter(Boolean).join(', ')}
📜 *Правила заселения*: ${[
        ad.rental_options ? ad.rental_options : ''
    ].filter(Boolean).join(', ')}
📝 *Описание*:
${ad.description ? ad.description : ''}
`;

    return {
        data: ad,
        message: message.trim(),
        photos: ad.photos || [],
        photoURLs: ad.photoURLs || []
    };
}

async function getPhotoUrl(fileId) {
    const file = await bot.getFile(fileId);
    return `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}