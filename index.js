const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});
const webAppUrl = 'https://5084-5-251-196-243.ngrok-free.app';
const app = express();

app.use(express.json());
app.use(cors());

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        await bot.sendMessage(chatId, 'Привет! Нажмите кнопку ниже, чтобы разместить объявление.', {
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
                await bot.sendMessage(chatId, 'Отложенная отправка сообщения');
            }, 3000)
        } catch (e) {
            console.log(e);
        }
    }
});

app.post('/web-data', async (req, res) => {
    const {
        queryId, 
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
        wifi,
        with_child,
        with_pets
    } = req.body;

    console.log('Received data:', req.body);
    
    try {
        const message = `
🏠 *Характеристики жилья*:
- Тип жилья: ${house_type === 'apartment' ? 'Квартира' : house_type}
- Адрес: г.${city}, ${district} р-н, мкрн.${microdistrict}
- Этаж: ${floor_current}/${floor_total}
- Срок аренды: ${duration === 'long_time' ? 'Долгосрочная' : 'Краткосрочная'}
- Цена: ${price} KZT
- Телефон: ${phone}
- Telegram: @${telegram ? tg_username : 'Не указано'}

👨‍👩‍👦 *Удобства*:
${fridge ? '🧊 Холодильник: Да\n' : ''}
${washing_machine ? '🧺 Стиральная машина: Да\n' : ''}
${microwave ? '🍲 Микроволновка: Да\n' : ''}
${dishwasher ? '🍽 Посудомоечная машина: Да\n' : ''}
${iron ? '👕 Утюг: Да\n' : ''}
${tv ? '📺 Телевизор: Да\n' : ''}
${wifi ? '🌐 Wi-Fi: Да\n' : ''}
${stove ? '🔥 Плита: Да\n' : ''}
${kitchen ? '🍴 Кухня: Да\n' : ''}
${wardrobe ? '👗 Гардероб: Да\n' : ''}
${shower ? '🚿 Душ: Да\n' : ''}
${separate_toilet ? '🚽 Разд. санузел: Да\n' : ''}
${sleeping_places ? '🛏 Спальные места: Да\n' : ''}

👥 *Дополнительно*:
${family ? '👪 Для семьи: Да\n' : ''}
${single ? '👤 Для одного: Да\n' : ''}
${with_child ? '👶 С детьми: Да\n' : ''}
${with_pets ? '🐾 С животными: Да\n' : ''}
${smoke_allowed ? '🚬 Курение: Да\n' : ''}
${max_guests ? `👥 Макс. гостей: ${max_guests}\n` : ''}
`;

        //await saveToDatabase(data); // Сохраняем данные в базу
        
        await bot.answerWebAppQuery(queryId, {  // Отправляем сообщение в Telegram
            type: 'article',
            id: queryId,
            title: 'Успешная публикация',
            input_message_content: {
                message_text: message,
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