-- Таблица пользователей
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  phone VARCHAR(15),
  tg_id BIGINT UNIQUE,
  tg_username VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_ad_posted TIMESTAMP,
  is_premium BOOLEAN DEFAULT FALSE
);

-- Таблица объявлений
CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  ad_id VARCHAR(20) UNIQUE,
  ad_url TEXT,
  user_id INT REFERENCES users(user_id),
  title TEXT,
  description TEXT,
  price DECIMAL(10, 2),
  city TEXT NOT NULL,
  district TEXT,
  microdistrict TEXT,
  duration TEXT,
  deposit BOOLEAN,
  deposit_value INTEGER,
  house_type TEXT,
  address TEXT, 
  rooms INTEGER,
  floor_current INTEGER,
  floor_total INTEGER,
  area INTEGER,
  condition TEXT,
  phone TEXT,
  author TEXT,
  furniture TEXT,
  facilities TEXT,
  toilet TEXT,
  bathroom TEXT,
  rental_options TEXT,
  promotions JSONB,
  photos JSONB,
  converted_photos JSONB,
  message_id INTEGER,
  tg_posted_date DATE,
  is_posted BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  posted_at DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  currency VARCHAR(10),
  source VARCHAR(50) CHECK (source IN ('parser', 'tg')),
  ad_type VARCHAR(20) CHECK (ad_type IN ('rentIn', 'rentOut'))
);

-- Таблица критериев поиска
CREATE TABLE search_criteria (
  criteria_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  price_min DECIMAL(10, 2),
  price_max DECIMAL(10, 2),
  location VARCHAR(255),
  last_notified TIMESTAMP
);

-- Таблица платежей
CREATE TABLE payments (
  payment_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  amount DECIMAL(10, 2),
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_type VARCHAR(50),
  status VARCHAR(50)
);

-- Таблица подписок
CREATE TABLE subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  subscription_type VARCHAR(50),
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP,
  ad_limit INT
);
