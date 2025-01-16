const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const dbManager = require('./db-manager');
const logger = require('./logger');
const { startNotificationTask } = require('./notifications');


const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {polling: true});

// Отправка уведомлений о новых объявлениях
startNotificationTask(bot);

let adsData = {};
let photoTimers = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const webAppUrl = `https://${config.DOMAIN}/form?chat_id=${chatId}`;

    try {
        if (text === '/start') {
            await dbManager.createNewUser(msg);
            const sentMessage = await bot.sendMessage(chatId, `📰 Для размещения объявления перейдите на форму`, {
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

                if (parts.length < 4) {
                    await bot.sendMessage(chatId, '❗ Неверный формат команды. Ожидается: /reject_ad_chatId_adId');
                    return;
                }

                const chatIdToReject = parts[2];
                const adId = parts[3];

                try {
                    await bot.sendMessage(chatId, `❗ Объявление ${adId} отклонено`);
                    await bot.sendMessage(chatIdToReject, '‼️ Объявление было отклонено модератором.');
                    await dbManager.updateAd(adId, { is_active: false });
                } catch (error) {
                    console.error('Ошибка при отклонении объявления:', error);
                    await bot.sendMessage(chatId, '❗ Произошла ошибка при отклонении объявления.');
                }
            }
        } else if (text === '/test') {
            await bot.sendMessage(chatId, 'Open', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Main', web_app: { url: `https://${config.DOMAIN}`} }],
                        [{ text: 'Ads', web_app: { url: `https://${config.DOMAIN}/ads`} }]
                    ]
                }
            });
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
                await bot.sendMessage(chatId, '⏳ Объявление находится на модерации...');
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

            const webAppUrlSC = `https://${config.DOMAIN}/autosearch`;
            const caption = `💾 Настройки фильтров сохранены. Мы сообщим о новых объявлениях.\n\n\`${searchText}\``;
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔖Сохраненные поиски', web_app: { url: webAppUrlSC} }]
                    ]
                }
            };
            await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...inlineKeyboard });

        } else if (callbackData === 'reject_notification') {
            bot.answerCallbackQuery(callbackQuery.id, {text: '🗑️ Поиск удален', show_alert: false});
            bot.deleteMessage(chatId, messageId);

        }
    } catch (err) {
        console.error('Ошибка:', err);
        logger.error(`Error processing callback query from ${chatId}: ${err}`);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке. Пожалуйста, повторите попытку.');
      }
});

// Функция для отправки объявления модератору
async function sendToModerate(ad, chatId, adId, userId, username) {
    const mediaGroup = await createMediaGroup(ad);
    await bot.sendMediaGroup(config.MODERATOR_ID, mediaGroup);

    const moderationMessage = `🔍 Новое объявление от пользователя @${username} ID:${userId}`;
    const inlineKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Подтвердить', switch_inline_query_current_chat: `/approve_ad_${chatId}_${adId}` },
                    { text: '❌ Отклонить', switch_inline_query_current_chat: `/reject_ad_${chatId}_${adId}` }
                ]
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

    const webAppUrlADS = `https://${config.DOMAIN}/ads`;
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

module.exports = { bot, adsData };