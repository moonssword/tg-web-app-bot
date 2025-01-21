const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.DB_CONFIG);

// Функция для сохранения данных в базу
async function saveADtoDB(data, photoUrls, targetChannel) {
    const userId = data.user.id;
    const source = 'tg';

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
        combined_toilet, bath, bed_capacity, whatsapp, telegram, tg_username
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
            toilet, bathroom, photos, room_type, room_location, bed_capacity, source, tg_channel, whatsapp, telegram, tg_username
        ) 
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 
            $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
        )
        RETURNING id;
    `;

    const values = [
        userId, dbUserId, district, duration, floor_current, floor_total, house_type, 
        microdistrict, phone, price, rooms, furniture, facilities, 
        rental_options, city, description, deposit, deposit_value, 
        author, address, area, currency, toilet, bathroom, jsonPhotos, room_type, room_location, bed_capacity, source, targetChannel, whatsapp, telegram, tg_username ? tg_username : data.user.username
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
        description, dishwasher, district, duration, family,
        fridge, house_type, iron, kitchen, max_guests, microdistrict,
        microwave, phone, price_min, price_max, rooms, separate_toilet, shower, single,
        sleeping_places, stove, tv, bed_linen, towels, hygiene_items,
        wardrobe, washing_machine, wifi, with_child, with_pets,
        city, currency,
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
            furniture, facilities, rental_options, city, currency,
            toilet, bathroom, description, is_active
        ) 
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 
            $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, true
        )
        RETURNING criteria_id;
    `;

    const values = [
        dbUserId, userId, district, duration, room_type, room_location, house_type, 
        microdistrict, phone, price_min, price_max, rooms, 
        furniture, facilities, rental_options, city,
        currency, toilet, bathroom, description
    ];

    try {
        const result = await pool.query(query, values);
        console.log('Search inserted with ID:', result.rows[0].criteria_id);
        return result.rows[0].criteria_id;
    } catch (err) {
        console.error('Error inserting data:', err);
    }
}

// Обновление даты публикации
async function updateADpostedData(adId, messageIds) {
    const query = `
        UPDATE ads 
        SET tg_posted_date = CURRENT_TIMESTAMP, is_posted = TRUE, message_id = $2
        WHERE id = $1;
    `;
    const values = [adId, messageIds];

    try {
        await pool.query(query, values);
        console.log(`Ad ${adId} posted date updated`);
    } catch (err) {
        console.error('Error updating posted data:', err);
    }
}

// Создание нового пользователя
async function createNewUser(msg) {
    const query = `
        INSERT INTO users (tg_user_id, tg_username, first_name, chat_id, is_premium) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tg_user_id) 
        DO UPDATE SET 
            tg_username = EXCLUDED.tg_username, 
            first_name = EXCLUDED.first_name, 
            chat_id = EXCLUDED.chat_id,
            is_premium = EXCLUDED.is_premium
        RETURNING user_id;
    `;

    const values = [msg.from.id, msg.from.username, msg.from.first_name, msg.chat.id, !!msg.from.is_premium];

    try {
        const result = await pool.query(query, values);
        return result.rows.length > 0 ? result.rows[0].user_id : null;
    } catch (err) {
        console.error('Error creating user:', err);
        throw err;
    }
}

// Проверка на наличие опубликованного сегодня объявления
async function checkCurrentDayAD(userId) {
    const query = `
        SELECT id, tg_posted_date
        FROM ads 
        WHERE tg_user_id = $1 
        AND is_posted = TRUE 
        AND tg_posted_date > (CURRENT_TIMESTAMP - INTERVAL '${config.CHECK_INTERVAL}')
        ORDER BY tg_posted_date DESC
        LIMIT 1;
    `;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            const tgPostedDate = result.rows[0].tg_posted_date;
            const postedDate = new Date(tgPostedDate);

            // Разбор config.CHECK_INTERVAL
            const interval = parseInterval(config.CHECK_INTERVAL);
            if (interval) {
                // Добавляем время согласно интервалу
                if (interval.days) postedDate.setDate(postedDate.getDate() + interval.days);
                if (interval.hours) postedDate.setHours(postedDate.getHours() + interval.hours);
                if (interval.minutes) postedDate.setMinutes(postedDate.getMinutes() + interval.minutes);

                // Форматирование даты для отображения
                const formattedDate = `${postedDate.getFullYear()}-${String(postedDate.getMonth() + 1).padStart(2, '0')}-${String(postedDate.getDate()).padStart(2, '0')} ${String(postedDate.getHours()).padStart(2, '0')}:${String(postedDate.getMinutes()).padStart(2, '0')}`;

                return { canPost: false, availableToPostDate: formattedDate }; 
            } else {
                console.error('Invalid CHECK_INTERVAL format');
                return false;
            }
        }

        return { canPost: true };
    } catch (err) {
        console.error('Error checking ads:', err);
        return false;
    }
}

// Функция для парсинга INTERVAL
function parseInterval(interval) {
    const regex = /(\d+)\s*(day|hour|minute|second)s?/g;
    let match;
    const parsedInterval = { days: 0, hours: 0, minutes: 0 };

    while ((match = regex.exec(interval)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'day':
                parsedInterval.days += value;
                break;
            case 'hour':
                parsedInterval.hours += value;
                break;
            case 'minute':
                parsedInterval.minutes += value;
                break;
            default:
                break;
        }
    }

    return parsedInterval;
}

// Функция проверки новых объявлений
async function checkForNewAds(bot) {
    try {
        const users = await pool.query('SELECT * FROM users');

        for (let user of users.rows) {
            const criteria = await pool.query(`
                SELECT * FROM search_criteria 
                WHERE user_id = $1
                AND is_active = true
            `, [user.user_id]);

            for (let searchCriteria of criteria.rows) {
                    const matches = await pool.query(`
                    SELECT * FROM ads 
                    WHERE city = $1
                    AND (district = $2 OR $2 = '' OR district = '' OR district IS NULL)
                    AND (microdistrict = $3 OR $3 = '' OR microdistrict = '' OR microdistrict IS NULL)
                    AND is_posted = true
                    AND is_active = true
                    AND house_type = $4
                    AND (rooms = $5 OR $5 IS NULL AND rooms IS NULL)
                    AND price BETWEEN $6 AND $7
                    -- AND (posted_at >= NOW() - INTERVAL '1 month' OR tg_posted_date >= NOW() - INTERVAL '1 month')
                    AND (posted_at >= $8 OR tg_posted_date >= $8)
                    LIMIT 10
                    `, [
                        searchCriteria.city, 
                        searchCriteria.district,
                        searchCriteria.microdistrict,
                        searchCriteria.house_type,
                        searchCriteria.rooms,
                        searchCriteria.price_min,
                        searchCriteria.price_max,
                        searchCriteria.created_at
                    ]);

                    // Если найдены подходящие объявления
                    if (matches.rows.length > 0) {
                        let messageText = '❗*Появились новые подходящие объявления*\n\n';
                        const notifiedAds = await pool.query(`
                            SELECT ad_id FROM user_notifications 
                            WHERE user_id = $1
                        `, [user.user_id]);

                        const notifiedAdIds = new Set(notifiedAds.rows.map(row => row.ad_id));

                        for (let ad of matches.rows) {
                            if (!notifiedAdIds.has(ad.id)) {
                                const roomLocationText = ad.room_location === 'apartment' ? '' :
                                                         ad.room_location === 'hostel' ? 'в хостеле' :
                                                         ad.room_location === 'hotel' ? 'в гостинице' : '';
                        
                                const adDescription = `${ad.house_type === 'apartment' ? ad.rooms + '-комн.квартира' : ad.house_type === 'room' ? 'комната' + (roomLocationText ? ' ' + roomLocationText : '') : 'дом'} ${ad.duration === 'long_time' ? 'на длительный срок' : 'посуточно'},\nг.${ad.city}, ${ad.district} р-н, ${ad.microdistrict ? ad.microdistrict + ', ' : ''}${ad.address ? ad.address + ', ' : ''}${ad.price} ₸`;
                        
                                const adLink = `https://t.me/${ad.tg_channel.replace('@', '')}/${ad.message_id[0]}`;
                        
                                messageText += `- [${adDescription}](${adLink})\n\n`;
                        
                                // Сохраняем уведомление в базе данных
                                await pool.query(`
                                    INSERT INTO user_notifications (user_id, ad_id) 
                                    VALUES ($1, $2)
                                `, [user.user_id, ad.id]);
                            }
                        }                        

                        if (messageText !== '❗*Появились новые подходящие объявления*\n\n') {
                            // Отправляем уведомление пользователю
                            const webAppUrlSC = `https://${config.DOMAIN}/autosearch`;
                            const inlineKeyboard = {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '🔖Сохраненные поиски', web_app: { url: webAppUrlSC} }]
                                    ]
                                }
                            };
                            await bot.sendMessage(user.tg_user_id, messageText, { parse_mode: 'Markdown', ...inlineKeyboard, disable_web_page_preview: true });

                            // Обновляем дату последнего уведомления
                            const updateCriteriaQuery = `
                                UPDATE search_criteria 
                                SET last_notified = CURRENT_TIMESTAMP 
                                WHERE user_id = $1;
                            `;
                            await pool.query(updateCriteriaQuery, [user.user_id]);
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
        }
    } catch (err) {
        console.error('Error checking for new ads:', err);
    }
}

// Функция для деактивации объявления (заменена функцией updateAD)
/*async function deactivateAd(messageId) {
    const query = `
        UPDATE ads 
        SET is_active = FALSE 
        WHERE $1 = ANY(message_id);
    `;
    const values = [messageId];

    try {
        await pool.query(query, values);
        console.log(`Ad with message_id: ${messageId} deactivated and delete from channel successfully.`);
    } catch (err) {
        console.error('Error deactivating ad:', err);
    }
}*/

// Функция для деактивации поиска
async function deactivateSC(id) {
    const query = `
        UPDATE search_criteria 
        SET is_active = FALSE 
        WHERE criteria_id = $1;
    `;
    const values = [id];

    try {
        await pool.query(query, values);
        console.log(`Search Criteria with criteria_id [${id}] deactivated successfully.`);
    } catch (err) {
        console.error('Error deactivating ad:', err);
    }
}

// Функция для получения критериев поиска по tg_user_id
async function getSearchCriteriaByUserId(userId) {
    const query = `
        SELECT 
            criteria_id, user_id, tg_user_id, price_min, price_max, city, 
            district, microdistrict, duration, description, room_type, 
            room_location, house_type, phone, last_notified, rooms
        FROM search_criteria 
        WHERE tg_user_id = $1 AND is_active = TRUE;
    `;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error fetching search criteria:', err);
        throw new Error('Error fetching search criteria');
    }
}

// Функция для обновления записи в search_criteria
async function updateSearchCriteria(criteriaId, updates) {
    if (!criteriaId) {
        throw new Error('Criteria ID is required');
    }

    if (Object.keys(updates).length === 0) {
        throw new Error('No updates provided');
    }

    const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
    const values = Object.values(updates);

    const query = `
        UPDATE search_criteria
        SET ${setClause}
        WHERE criteria_id = $${values.length + 1}
        RETURNING *;
    `;

    try {
        const result = await pool.query(query, [...values, criteriaId]);
        if (result.rowCount === 0) {
            throw new Error('Criteria not found');
        }
        return result.rows[0]; // Возвращаем обновленную запись
    } catch (err) {
        console.error('Error updating search criteria:', err);
        throw new Error('Error updating search criteria');
    }
}

// Функция для получения объявлений по tg_user_id
async function getAdsByUserId(userId) {
    const query = `
        SELECT *
        FROM ads 
        WHERE tg_user_id = $1 AND is_active = TRUE;
    `;
    const values = [userId];

    try {
        const result = await pool.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error fetching ads:', err);
        throw new Error('Error fetching ads');
    }
}

// Функция для получения объявления по id
async function getAdById(adId) {
    const query = `
        SELECT *
        FROM ads 
        WHERE id = $1;
    `;
    const values = [adId];

    try {
        const result = await pool.query(query, values);
        if (result.rowCount === 0) {
            throw new Error('Ad not found');
        }
        return result.rows[0];
    } catch (err) {
        console.error('Error fetching ad by id:', err);
        throw new Error('Error fetching ad');
    }
}

// Функция для обновления записи в таблице ads
async function updateAd(adId, updates) {
    if (!adId) {
        throw new Error('Ad ID is required');
    }

    if (Object.keys(updates).length === 0) {
        throw new Error('No updates provided');
    }

    const setClause = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
    const values = Object.values(updates);

    const query = `
        UPDATE ads
        SET ${setClause}
        WHERE id = $${values.length + 1}
        RETURNING *;
    `;

    try {
        const result = await pool.query(query, [...values, adId]);
        if (result.rowCount === 0) {
            throw new Error('Ad not found');
        }
        return result.rows[0];
    } catch (err) {
        console.error('Error updating ad:', err);
        throw new Error('Error updating ad');
    }
}

// Функция для поиска объявлений
async function getAdsByParams(params) {
    const query = `
        SELECT * FROM ads 
        WHERE city = $1
        AND (district = $2 OR $2 = '' OR district = '' OR district IS NULL)
        AND (microdistrict = $3 OR $3 = '' OR microdistrict = '' OR microdistrict IS NULL)
        AND is_posted = true
        AND is_active = true
        AND house_type = $4
        AND duration = $5
        AND (rooms = $6 OR $5 IS NULL AND rooms IS NULL)
        AND price BETWEEN $7 AND $8
        AND (posted_at >= NOW() - INTERVAL '1 month' OR tg_posted_date >= NOW() - INTERVAL '1 month')
        LIMIT 20
    `;

    const values = [
        params.city,
        params.district,
        params.microdistrict,
        params.house_type,
        params.duration,
        params.rooms,
        params.price_min,
        params.price_max
    ];

    try {
        const result = await pool.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error in search:', err);
        throw new Error('Error fetching ads');
    }
}

const dbManager = {
    createNewUser,
    saveADtoDB,
    checkCurrentDayAD,
    updateADpostedData,
    saveSearchCritireaToDB,
    checkForNewAds,
    deactivateSC,
    getSearchCriteriaByUserId,
    updateSearchCriteria,
    getAdsByUserId,
    updateAd,
    getAdById,
    getAdsByParams,
  };
  
  module.exports = dbManager;