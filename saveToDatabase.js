const { Pool } = require('pg');
const dbConfig = require('./pg_config'); // Ваш файл конфигурации для базы данных

const pool = new Pool(dbConfig);

// Функция для сохранения данных в базу
async function saveToDatabase(data) {
    const {
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
    } = data;

    const query = `
        INSERT INTO ads (
            dishwasher, district, duration, family, floor_current, floor_total, 
            fridge, house_type, iron, kitchen, max_guests, microdistrict, 
            microwave, phone, price, rooms, separate_toilet, shower, 
            single, sleeping_places, smoke_allowed, stove, telegram, 
            tg_username, tv, wardrobe, washing_machine, whatsapp, wifi, 
            with_child, with_pets
        ) 
        VALUES (
            $1, $2, $3, $4, $5, $6, 
            $7, $8, $9, $10, $11, $12, 
            $13, $14, $15, $16, $17, $18, 
            $19, $20, $21, $22, $23, $24, 
            $25, $26, $27, $28, $29, $30, $31
        )
        RETURNING id;
    `;

    const values = [
        dishwasher, district, duration, family, floor_current, floor_total, 
        fridge, house_type, iron, kitchen, max_guests, microdistrict, 
        microwave, phone, price, rooms, separate_toilet, shower, 
        single, sleeping_places, smoke_allowed, stove, telegram, 
        tg_username, tv, wardrobe, washing_machine, whatsapp, wifi, 
        with_child, with_pets
    ];

    try {
        const result = await pool.query(query, values);
        console.log('Ad inserted with ID:', result.rows[0].id);
    } catch (err) {
        console.error('Error inserting data:', err);
    }
}

// перенести в index.js
app.post('/web-data', async (req, res) => {
    const data = req.body; // Получаем все данные из запроса

    try {
        await saveToDatabase(data); // Сохраняем данные в базу
        await bot.answerWebAppQuery(data.queryId, {
            type: 'article',
            id: data.queryId,
            title: 'Успешная публикация',
            input_message_content: {
                message_text: 'Ваши данные успешно сохранены!'
            }
        });
        return res.status(200).json({});
    } catch (e) {
        console.error('Error:', e);
        return res.status(500).json({ error: 'Ошибка сохранения данных в базе' });
    }
});
