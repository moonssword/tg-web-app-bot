const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});
const app = express();

app.use(express.json());
app.use(cors());

let adsData = {};
let photoTimers = {};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const webAppUrl = `https://5084-5-251-196-243.ngrok-free.app/form?chat_id=${msg.chat.id}`;

    if (text === '/start') {
        await bot.sendMessage(chatId, 'Привет! Нажмите кнопку ниже, чтобы разместить объявление.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Разместить объявление', web_app: { url: webAppUrl} }]
                ]
            }
        });
    }

    if (msg.media_group_id || msg.photo) {
        const photoArray = msg.photo;
        const largestPhoto = photoArray[photoArray.length - 1];
        const fileId = largestPhoto.file_id;

        if (!adsData[chatId]) {
            adsData[chatId] = { photos: [] };
        }

        if (adsData[chatId].photos.length < 10) {
            adsData[chatId].photos.push(fileId);
        }

        if (photoTimers[chatId]) {
            clearTimeout(photoTimers[chatId]);
        }

        // Устанавливаем новый таймер
        photoTimers[chatId] = setTimeout(() => {
            // Когда таймер завершится, вызываем approvePhotoAD
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

    try {
        if (data === 'approved') {
            if (adsData[chatId].photos && adsData[chatId].message) {
                postADtoChannel(adsData[chatId], chatId);
            }
        } else if (data === 'add_photo') {
            await bot.sendMessage(chatId, '⬆️ Добавьте до 10 фотографий или опубликуйте объявление на канале');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при обработке колбэк-данных.');
      }
});

app.post('/web-data', async (req, res) => {
    const {
        chatId,
        queryId,
        city,
        dishwasher,
        district,
        duration,
        family,
        floor_current,
        floor_total,
        fridge,
        house_type,
        iron,
        kitchen,
        max_guests,
        microdistrict,
        microwave,
        phone,
        price,
        rooms,
        separate_toilet,
        shower,
        single,
        sleeping_places,
        smoke_allowed,
        stove,
        telegram,
        tg_username,
        tv,
        wardrobe,
        washing_machine,
        whatsapp,
        wifi,
        with_child,
        with_pets
    } = req.body;

    console.log('Received data:', req.body);
    
    try {
        const message = `
🏠 *Характеристики жилья*:
- Тип жилья: ${house_type === 'apartment' ? 'Квартира' : house_type}
- Адрес: г.${city}, ${district} р-н, ${microdistrict}
- Этаж: ${floor_current}/${floor_total}
- Срок аренды: ${duration === 'long_time' ? 'Долгосрочная' : 'Краткосрочная'}
- Цена: ${price} KZT
- Телефон: ${phone}
- [WhatsApp](https://api.whatsapp.com/send?phone=${phone}&text=Здравствуйте!)
- [Telegram](https://t.me/${tg_username})

👨‍👩‍👦 *Удобства*:
- Холодильник: ${fridge ? 'Да' : 'Нет'}
- Стиральная машина: ${washing_machine ? 'Да' : 'Нет'}
- Микроволновка: ${microwave ? 'Да' : 'Нет'}
- Посудомоечная машина: ${dishwasher ? 'Да' : 'Нет'}
- Утюг: ${iron ? 'Да' : 'Нет'}
- Телевизор: ${tv ? 'Да' : 'Нет'}
- Wi-Fi: ${wifi ? 'Да' : 'Нет'}
- Плита: ${stove ? 'Да' : 'Нет'}
- Кухня: ${kitchen ? 'Да' : 'Нет'}
- Гардероб: ${wardrobe ? 'Да' : 'Нет'}
- Душ: ${shower ? 'Да' : 'Нет'}
- Раздельный санузел: ${separate_toilet ? 'Да' : 'Нет'}
- Спальные места: ${sleeping_places ? 'Да' : 'Нет'}

👥 *Дополнительно*:
- Для семьи: ${family ? 'Да' : 'Нет'}
- Для одного: ${single ? 'Да' : 'Нет'}
- Можно с детьми: ${with_child ? 'Да' : 'Нет'}
- Можно с животными: ${with_pets ? 'Да' : 'Нет'}
- Курение разрешено: ${smoke_allowed ? 'Да' : 'Нет'}
- Максимальное количество гостей: ${max_guests}
`;


        //await saveToDatabase(data); // Сохраняем данные в базу
        
        adsData[chatId] = {
            message,
            photos: []
        };

        await bot.answerWebAppQuery(queryId, {  // Отправляем сообщение в Telegram
            type: 'article',
            id: queryId,
            title: 'Успешная публикация',
            input_message_content: {
                message_text: 'Мы получили ваше объявление, осталось добавить фотографии. Пожалуйста, прикрепите до 10 фотографий',
                parse_mode: 'Markdown'
            }
        });

        return res.status(200).json({});
    } catch (e) {
        console.log('Error:', e);
        return res.status(500).json({});
    }
});


const PORT = 8000;

app.listen(PORT, () => console.log('server started on PORT ' + PORT))

async function postADtoChannel(ad, chatId) {
    const trimmedMessage = ad.message?.length > 1024 
        ? ad.message.substring(0, ad.message.lastIndexOf(' ', 1024)) + '...' 
        : ad.message;

    const mediaGroup = ad.photos.map((fileId, index) => ({
        type: 'photo',
        media: fileId,
        caption: index === 0 ? trimmedMessage : '',
        parse_mode: 'Markdown'
    }));

    const messageOnChannel = await bot.sendMediaGroup(process.env.TELEGRAM_CHANNEL, mediaGroup);
    const messageId = messageOnChannel[0].message_id;
    const messageLink = `https://t.me/${process.env.TELEGRAM_CHANNEL.replace('@', '')}/${messageId}`;
    await bot.sendMessage(chatId, `Ваше [объявление](${messageLink}) опубликовано на канале`, {parse_mode: 'Markdown'});

    console.log(`Объявление опубликовано на канале`);
}

async function approvePhotoAD(ad, chatId) {
    const trimmedMessage = ad.message?.length > 1024 
        ? ad.message.substring(0, ad.message.lastIndexOf(' ', 1024)) + '...' 
        : ad.message;

    const mediaGroup = ad.photos.map((fileId, index) => {
        return {
            type: 'photo',
            media: fileId,
            caption: index === 0 ? trimmedMessage : '',
            parse_mode: 'Markdown',
        };
    });

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, '⬆️ Добавьте до 10 фотографий или опубликуйте объявление на канале', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'approved' }, { text: '↩️Добавить фото', callback_data: 'add_photo' }],
              ],
            },
          });

    console.log('Согласование публикации и добавления фотографий');
}

async function approveAD(ad, chatId) {
    const trimmedMessage = ad.message?.length > 1024 
        ? ad.message.substring(0, ad.message.lastIndexOf(' ', 1024)) + '...' 
        : ad.message;

    const mediaGroup = ad.photos.map((fileId, index) => {
        return {
            type: 'photo',
            media: fileId,
            caption: index === 0 ? trimmedMessage : '',
            parse_mode: 'Markdown',
        };
    });

    await bot.sendMediaGroup(chatId, mediaGroup);

    await bot.sendMessage(chatId, '⬆️ Добавьте до 10 фотографий или опубликуйте объявление на канале', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅Опубликовать', callback_data: 'approved' }],
              ],
            },
          });

    console.log('Согласование публикации');
}