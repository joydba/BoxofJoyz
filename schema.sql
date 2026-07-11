-- ============================================
-- The JoyBox — database structure
-- Two dishes a day, made properly, until they're gone.
-- ============================================
-- Run this against your YugabyteDB Aeon sandbox (ysqlsh or Cloud Shell)
-- Connect first:  \c yugabyte;   (or create a dedicated DB, e.g. joybox)
--   CREATE DATABASE joybox;
--   \c joybox;

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dishes (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL,
  image_url    TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- The daily menu: you (admin) add at most 2 rows per day.
-- quantity_sold is incremented atomically as orders come in so we
-- never oversell a dish.
CREATE TABLE IF NOT EXISTS daily_menu (
  id                  SERIAL PRIMARY KEY,
  menu_date           DATE NOT NULL,
  dish_id             INT NOT NULL REFERENCES dishes(id),
  quantity_available  INT NOT NULL,
  quantity_sold       INT NOT NULL DEFAULT 0,
  UNIQUE (menu_date, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_menu_date ON daily_menu (menu_date);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id),
  daily_menu_id  INT NOT NULL REFERENCES daily_menu(id),
  quantity       INT NOT NULL DEFAULT 1,
  status         VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);

-- Create your first admin account manually after signing up normally, e.g.:
-- UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
