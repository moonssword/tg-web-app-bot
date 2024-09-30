const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.DB_CONFIG);

// Функция для сохранения данных в базу
async function saveADtoDB(data, photoUrls, messageId) {
    const userId = data.user.id;

    // Сначала проверяем, существует ли пользователь
    const userCheckQuery = `SELECT user_id FROM users WHERE tg_user_id = $1`;
    const userCheckValues = [userId];

    const userCheckResult = await pool.query(userCheckQuery, userCheckValues);

    let dbUserId;

    if (userCheckResult.rows.length > 0) {
        // Пользователь существует, берем его user_id
        dbUserId = userCheckResult.rows[0].user_id;
    } else {
        // Пользователь не существует, вставляем его
        const insertUserQuery = `
            INSERT INTO users (tg_user_id, tg_username, first_name)
            VALUES ($1, $2, $3) RETURNING user_id;
        `;
        const insertUserValues = [userId, data.user.username, data.user.first_name];
        const insertUserResult = await pool.query(insertUserQuery, insertUserValues);
        dbUserId = insertUserResult.rows[0].user_id; // Получаем новый user_id
    }

    const {
        dishwasher, district, duration, family, floor_current, floor_total,
        fridge, house_type, iron, kitchen, max_guests, microdistrict,
        microwave, phone, price, rooms, separate_toilet, shower, single,
        sleeping_places, stove, room_type, room_location, tv, bed_linen, towels, hygiene_items,
        wardrobe, washing_machine, wifi, with_child, with_pets,
        city, description, deposit, deposit_value, author, address, area, currency,
        combined_toilet, bath
    } = data;

    //const photos = JSON.stringify(photoUrls);
    const jsonPhotos = Array.isArray(photoUrls) ? JSON.stringify(photoUrls) : '[]';

    const toilet = [
        combined_toilet ? 'совмещенный санузел' : '',
        separate_toilet ? 'раздельный санузел' : ''
    ].filter(Boolean).join(', ');

    const bathroom = [
        bath ? 'ванная' : '',
        shower ? 'душевая кабина' : ''
    ].filter(Boolean).join(', ');

    const furniture = [
        kitchen ? 'кухня' : '',
        wardrobe ? 'хранение одежды' : '',
        sleeping_places ? 'спальные места' : ''
    ].filter(Boolean).join(', ');

    const facilities = [
        fridge ? 'холодильник' : '',
        washing_machine ? 'стиральная машина' : '',
        microwave ? 'микроволновка' : '',
        dishwasher ? 'посудомоечная машина' : '',
        iron ? 'утюг' : '',
        tv ? 'телевизор' : '',
        wifi ? 'Wi-Fi' : '',
        stove ? 'плита' : '',
        shower ? 'душ' : '',
        separate_toilet ? 'раздельный санузел' : '',
        bed_linen ? 'постельное белье' : '',
        towels ? 'полотенца' : '',
        hygiene_items ? 'средства гигиены' : ''
    ].filter(Boolean).join(', ');

    const rental_options = [
        family ? 'для семьи' : '',
        single ? 'для одного' : '',
        with_child ? 'можно с детьми' : '',
        with_pets ? 'можно с животными' : '',
        max_guests ? `макс. гостей: ${max_guests}` : ''
    ].filter(Boolean).join(', ');

    const query = `
        INSERT INTO ads (
            tg_user_id, user_id, district, duration, floor_current, floor_total, 
            house_type, microdistrict, phone, price, rooms, 
            furniture, facilities, rental_options, city, description, 
            deposit, deposit_value, author, address, area, currency,
            toilet, bathroom, photos, message_id, room_type, room_location
        ) 
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 
            $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        )
        RETURNING id;
    `;

    const values = [
        userId, dbUserId, district, duration, floor_current, floor_total, house_type, 
        microdistrict, phone, price, rooms, furniture, facilities, 
        rental_options, city, description, deposit, deposit_value, 
        author, address, area, currency, toilet, bathroom, jsonPhotos, messageId, room_type, room_location
    ];

    try {
        const result = await pool.query(query, values);
        console.log('Ad inserted with ID:', result.rows[0].id);
        return result.rows[0].id;
    } catch (err) {
        console.error('Error inserting data:', err);
    }
}

// Функция для сохранения критерия поиска
async function saveSearchCritireaToDB(data) {
    const userId = data.user.id;

    const userCheckQuery = `SELECT user_id FROM users WHERE tg_user_id = $1`;
    const userCheckValues = [userId];

    const userCheckResult = await pool.query(userCheckQuery, userCheckValues);

    let dbUserId;

    if (userCheckResult.rows.length > 0) {
        // Пользователь существует, берем его user_id
        dbUserId = userCheckResult.rows[0].user_id;
    } else {
        // Пользователь не существует, вставляем его
        const insertUserQuery = `
            INSERT INTO users (tg_user_id, tg_username, first_name)
            VALUES ($1, $2, $3) RETURNING user_id;
        `;
        const insertUserValues = [userId, data.user.username, data.user.first_name];
        const insertUserResult = await pool.query(insertUserQuery, insertUserValues);
        dbUserId = insertUserResult.rows[0].user_id; // Получаем новый user_id
    }
    const {
        dishwasher, district, duration, family,
        fridge, house_type, iron, kitchen, max_guests, microdistrict,
        microwave, phone, price_min, price_max, rooms, separate_toilet, shower, single,
        sleeping_places, stove, tv, bed_linen, towels, hygiene_items,
        wardrobe, washing_machine, wifi, with_child, with_pets,
        city, address, currency,
        combined_toilet, bath, room_type, room_location
    } = data;

    const toilet = [
        combined_toilet ? 'совмещенный санузел' : '',
        separate_toilet ? 'раздельный санузел' : ''
    ].filter(Boolean).join(', ');

    const bathroom = [
        bath ? 'ванная' : '',
        shower ? 'душевая кабина' : ''
    ].filter(Boolean).join(', ');

    const furniture = [
        kitchen ? 'кухня' : '',
        wardrobe ? 'хранение одежды' : '',
        sleeping_places ? 'спальные места' : ''
    ].filter(Boolean).join(', ');

    const facilities = [
        fridge ? 'холодильник' : '',
        washing_machine ? 'стиральная машина' : '',
        microwave ? 'микроволновая печь' : '',
        dishwasher ? 'посудомоечная машина' : '',
        iron ? 'утюг' : '',
        tv ? 'телевизор' : '',
        wifi ? 'Wi-Fi' : '',
        stove ? 'плита' : '',
        shower ? 'душ' : '',
        separate_toilet ? 'раздельный санузел' : '',
        bed_linen ? 'постельное белье' : '',
        towels ? 'полотенца' : '',
        hygiene_items ? 'средства гигиены' : ''
    ].filter(Boolean).join(', ');

    const rental_options = [
        family ? 'для семьи' : '',
        single ? 'для одного' : '',
        with_child ? 'можно с детьми' : '',
        with_pets ? 'можно с животными' : '',
        max_guests ? `макс. гостей: ${max_guests}` : ''
    ].filter(Boolean).join(', ');

    const query = `
        INSERT INTO search_criteria (
            user_id, tg_user_id, district, duration, room_type, room_location,
            house_type, microdistrict, phone, price_min, price_max, rooms, 
            furniture, facilities, rental_options, city, address, currency,
            toilet, bathroom
        ) 
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 
            $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        RETURNING criteria_id;
    `;

    const values = [
        dbUserId, userId, district, duration, room_type, room_location, house_type, 
        microdistrict, phone, price_min, price_max, rooms, 
        furniture, facilities, rental_options, city, address, 
        currency, toilet, bathroom
    ];

    try {
        const result = await pool.query(query, values);
        console.log('Ad inserted with ID:', result.rows[0].criteria_id);
        return result.rows[0].criteria_id;
    } catch (err) {
        console.error('Error inserting data:', err);
    }
}

// Обновление даты публикации
async function updateADpostedDate(adId) {
    const query = `
        UPDATE ads 
        SET tg_posted_date = CURRENT_DATE, is_posted = TRUE
        WHERE id = $1;
    `;
    const values = [adId];

    try {
        await pool.query(query, values);
        console.log('Ad posted date updated');
    } catch (err) {
        console.error('Error updating posted date:', err);
    }
}

// Создание нового пользователя
async function createNewUser(tg_user_id, tg_username, first_name, is_premium) {
    const query = `
        INSERT INTO users (tg_user_id, tg_username, first_name, is_premium) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tg_user_id) 
        DO UPDATE SET 
            tg_username = EXCLUDED.tg_username, 
            first_name = EXCLUDED.first_name, 
            is_premium = EXCLUDED.is_premium
        RETURNING user_id;
    `;
    const values = [tg_user_id, tg_username, first_name, is_premium];

    try {
        const result = await pool.query(query, values);
        return result.rows.length > 0 ? result.rows[0].user_id : null;
    } catch (err) {
        console.error('Error creating user:', err);
    }
}

// Проверка на наличие опубликованного сегодня объявления
async function checkCurrentDayAD(userId) {
    const query = `
        SELECT id 
        FROM ads 
        WHERE tg_user_id = $1 AND tg_posted_date = CURRENT_DATE
        AND is_posted = TRUE;
    `;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        return result.rows.length > 0; // Returns true if an ad is posted today
    } catch (err) {
        console.error('Error checking ads:', err);
        return false;
    }
}



module.exports = { createNewUser, saveADtoDB, updateADpostedDate, checkCurrentDayAD, saveSearchCritireaToDB };