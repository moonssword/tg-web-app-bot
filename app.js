const express = require('express');
const cors = require('cors');
const config = require('./config');
const dbManager = require('./db-manager');
const logger = require('./logger');
const { bot, adsData } = require('./bot');
const verifyTelegramAuth = require('./verifyTelegramAuth');

const app = express();
app.use(express.json());
app.use(cors());

app.post('/api/web-data', async (req, res) => {
    const data = req.body;
    const initData = data.initData;
    const parsedInitData = Object.fromEntries(new URLSearchParams(initData));
    const user = parsedInitData.user ? JSON.parse(parsedInitData.user) : null;
    const queryId = parsedInitData.query_id || null;
    data.user = user;
    data.chatId = user.id;
    data.queryId = queryId;

    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }

    if (!verifyTelegramAuth(initData)) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }

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
// Реализовано в web
/* const message_rentIn = `
*Сниму* ${data.house_type === 'apartment' ? data.rooms + '-комн.квартиру' : data.house_type === 'room' ? 'комнату' : 'дом'} ${data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'} в г.${data.city}${data.district ? ', ' + data.district + ' р-н'  : ''}${data.microdistrict ? ', ' + data.microdistrict  : ''}
*Цена:* ${data.price_min}-${data.price_max} ₸
*Телефон:* ${data.phone}
`; */

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
            
        }/*  else if (data.ad_type === 'rentIn') { // Реализовано в web
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
        } */

        return res.status(200).json({});
    } catch (e) {
        console.log('Error:', e);
        logger.error(`Error processing callback query from ${data.chatId}: ${e}`);
        return res.status(500).json({});
    }
});

// Эндпоинт для получения критериев поиска пользователя
app.post('/api/sc', async (req, res) => {
    const { initData } = req.body;
    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }
    const data = Object.fromEntries(new URLSearchParams(initData));
    const isValid = verifyTelegramAuth(initData);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }
    const userId = JSON.parse(data.user).id;
    
    try {
        const searchCriteria = await dbManager.getSearchCriteriaByUserId(userId);

        if (searchCriteria.length === 0) {
            return res.status(404).json({ message: 'No active search criteria found for this user.' });
        }

        res.json({ searchCriteria });
    } catch (err) {
        console.error('Error fetching search criteria:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Эндпоинт для обновления критериев поиска
app.put('/api/sc/', async (req, res) => {
    const updates = req.body;
    const criteriaId = updates.criteria_id;
    const initData = updates.initData;

    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }

    if (!verifyTelegramAuth(initData)) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    delete updates.initData;

    try {
        const updatedCriteria = await dbManager.updateSearchCriteria(criteriaId, updates);
        res.json({ message: 'Criteria updated successfully', updatedCriteria });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Эндпоинт для получения объявлений пользователя
app.post('/api/ads', async (req, res) => {
    const { initData } = req.body;
    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }
    const data = Object.fromEntries(new URLSearchParams(initData));
    const isValid = verifyTelegramAuth(initData);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }
    const userId = JSON.parse(data.user).id;

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
app.put('/api/ads/', async (req, res) => {
    const updates = req.body;
    const adId = updates.ad_id;
    const initData = updates.initData;

    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }

    if (!verifyTelegramAuth(initData)) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    delete updates.initData;

    try {
        const updatedAd = await dbManager.updateAd(adId, updates);
        res.json({ message: 'Ad updated successfully', updatedAd });

        // Деактивация объявления и удаление из канала
        if (!updates.is_active) {
            const targetChannel = updates.tg_channel;
            const messageIds = updates.message_id;
            let successDeleted = false;
            for (const messageId of messageIds) {
                try {
                    const deleteResult = await bot.deleteMessage(targetChannel, messageId);
                    if (deleteResult) successDeleted = true;
                } catch (err) {
                    if (err.response?.body?.error_code === 400 && err.response?.body?.description.includes("message can't be deleted")) {
                        console.error(`Сообщение ${messageId} не может быть удалено: ${err.response.body.description}`);
                    } else {
                        console.error(`Ошибка при удалении сообщения ${messageId}:`, err);
                    }
                    logger.error(`Ошибка при удалении из канала ${targetChannel} сообщения ${messageId}:`, err);
                }
            }
            if (successDeleted) {
                await bot.sendMessage(updates.tg_user_id, '🗑️ Объявление удалено из канала.');
            } else {
                await bot.sendMessage(updates.tg_user_id, '⚠️ Объявление не удалось удалить из канала, так как с момента публикации прошло более 48 часов. Однако оно больше не будет отображаться в поиске.');
            }            
        }

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Эндпоинт для поиска объявлений по параметрам
app.get('/api/search', async (req, res) => {
    try {
        const params = req.query;
        const ads = await dbManager.getAdsByParams(params);

        if (ads.length === 0) {
            return res.status(404).json({ message: 'No ads found matching the given criteria.' });
        }

        res.json({ ads });
    } catch (err) {
        console.error('Error handling search request:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Эндпоинт для сохранения поисковых критериев
app.post('/api/favorites', async (req, res) => {
    const data = req.body;
    const initData = data.initData;
    const parsedInitData = Object.fromEntries(new URLSearchParams(initData));
    const user = parsedInitData.user ? JSON.parse(parsedInitData.user) : null;
    data.user = user;
    data.chatId = user.id;

    if (!initData) {
        return res.status(400).json({ error: 'Telegram init data is required' });
    }

    const isValid = verifyTelegramAuth(initData);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    if (!data) {
        return res.status(400).json({ error: 'Search criteria data is required' });
    }

    delete data.initData;

    try {
        const criteriaId = await dbManager.saveSearchCritireaToDB(data);

        res.json({
            message: 'Search criteria saved successfully',
            criteriaId,
        });
    } catch (error) {
        console.error('Error saving search criteria:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = app;