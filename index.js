const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { createNewUser, saveADtoDB, checkCurrentDayAD, updateADpostedDate, saveSearchCritireaToDB } = require('./db-manager');

const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {polling: true});
const app = express();

app.use(express.json());
app.use(cors());

let adsData = {};
let photoTimers = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const webAppUrl = `https://5b06-5-251-196-243.ngrok-free.app/form?chat_id=${chatId}`;

    if (text === '/start') {
        await createNewUser(msg.from.id, msg.from.username, msg.from.first_name, !!msg.from.is_premium)
        const sentMessage = await bot.sendMessage(chatId, 'Добро пожаловать! Для размещения объявления на канале перейдите на форму ⬇️', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔸Разместить объявление🔸', web_app: { url: webAppUrl} }]
                ]
            }
        });
        await bot.pinChatMessage(chatId, sentMessage.message_id);
    }

    if (msg.media_group_id || msg.photo) {
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
            delete photoTimers[chatId]; // Удаляем таймер после завершения
        }, 2000);
    }

});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const currentPhotosCount = 10 - adsData[chatId]?.photos?.length;

    const hasPostedToday = await checkCurrentDayAD(userId);

    try {
        switch(data) {
            case 'approved':
                if (!hasPostedToday && adsData[chatId].photos && adsData[chatId].message) {
                    const adId = await saveADtoDB(adsData[chatId].data, adsData[chatId].photoURLs, messageId);
                    postADtoChannel(adsData[chatId], chatId);
                    updateADpostedDate(adId);
                    await bot.deleteMessage(chatId, messageId);
                } else {
                    await saveADtoDB(adsData[chatId].data, adsData[chatId].photoURLs, messageId);
                    await bot.sendMessage(chatId, 'Вы уже публиковали объявление сегодня. Новое объявление сохранено и может быть опубликовано завтра.');
                    await bot.deleteMessage(chatId, messageId);
                }
                break;
            case 'add_photo':
                if (adsData[chatId].photos && adsData[chatId].message) {
                    await bot.sendMessage(chatId, `⬆️ Можете отправить еще ${currentPhotosCount} фотографий`);
                }
                break;
        }
    } catch (err) {
        console.error('Ошибка:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке. Пожалуйста, повторите попытку.');
      }
});

app.post('/web-data', async (req, res) => {
    const data = req.body;
    //console.log('Received data:', JSON.stringify(data));
    try {
        const message = `
🏠 *Сдается* ${data.house_type === 'apartment' ? data.rooms + '-комн.квартира' : data.house_type === 'room' ? 'комната' : 'дом'} ${data.duration === 'long_time' ? 'на длительный срок' : 'посуточно'}, ${data.area} м², ${data.floor_current}/${data.floor_total} этаж
*Адрес:* г.${data.city}, ${data.district} р-н, ${data.microdistrict}, ${data.address}
*Сдает:* ${data.author === 'owner' ? 'собственник': 'посредник'}
*Цена:* ${data.price} ${data.currency}
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
                    message_text: '📝 Текст объявления успешно создан',
                    parse_mode: 'Markdown'
                }
            });

            await bot.sendMessage(data.chatId, '⚠️ Для завершения публикации, пожалуйста, отправьте до 10 фотографий')
            
        } else if (data.ad_type === 'rentIn') {
            await bot.answerWebAppQuery(data.queryId, {
                type: 'article',
                id: data.queryId,
                title: 'Успешная публикация',
                input_message_content: {
                    message_text: 'Вы будете получать уведомления о подходящих вариантах',
                    parse_mode: 'Markdown'
                }
            });

            saveSearchCritireaToDB(data); // Сохраняем поиск в бд
            
            await bot.sendMessage(data.chatId, 'Уважаемый пользователь, в данный момент размещение объявлений о поиске жилья на канале не предусмотрено. Однако вы можете получать уведомления о появлении в базе подходящих вариантов жилья.')
        }


        return res.status(200).json({});
    } catch (e) {
        console.log('Error:', e);
        return res.status(500).json({});
    }
});


const PORT = 8000;

app.listen(PORT, () => console.log('server started on PORT ' + PORT))

// Функция для публикации
async function postADtoChannel(ad, chatId) {
    const mediaGroup = await createMediaGroup(ad);
    const messageOnChannel = await bot.sendMediaGroup(config.TELEGRAM_CHANNEL, mediaGroup);
    const messageId = messageOnChannel[0].message_id;
    const messageLink = `https://t.me/${config.TELEGRAM_CHANNEL.replace('@', '')}/${messageId}`;
    await bot.sendMessage(chatId, `Ваше [объявление](${messageLink}) успешно опубликовано!`, {parse_mode: 'Markdown'});

    console.log(`Объявление опубликовано на канале`);
}

// Функция для публикации (до 10 фотографий)
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

// Функция для публикации (10 фотографий)
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