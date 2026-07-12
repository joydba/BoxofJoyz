require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const pool = require('./db');
const { notifyAdminWhatsApp, broadcastWhatsApp } = require('./notify');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// ---------- AUTH ----------

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_admin',
      [name, email, phone || null, hash]
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin;

    notifyAdminWhatsApp(
      `New JoyBox signup: ${name} (${email})${phone ? ', ' + phone : ''}`
    ); // fire-and-forget, doesn't block the response

    res.json({ user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin;
    res.json({ user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, isAdmin: req.session.isAdmin } });
});

// ---------- MENU (public) ----------

app.get('/api/menu/today', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dm.id AS daily_menu_id, d.name, d.description, d.price, d.image_url,
              dm.quantity_available, dm.quantity_sold,
              (dm.quantity_available - dm.quantity_sold) AS remaining
       FROM daily_menu dm
       JOIN dishes d ON d.id = dm.dish_id
       WHERE dm.menu_date = CURRENT_DATE
       ORDER BY dm.id`
    );
    res.json({ menu: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load menu' });
  }
});

// ---------- ORDERS ----------

app.post('/api/orders', requireLogin, async (req, res) => {
  const { daily_menu_id, quantity = 1, delivery_address, phone, payment_method = 'cod' } = req.body;

  if (!delivery_address || !phone) {
    return res.status(400).json({ error: 'Delivery address and phone are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic: only succeeds if enough stock remains. Prevents overselling
    // even if two people order the last dish at the same moment.
    const update = await client.query(
      `UPDATE daily_menu
       SET quantity_sold = quantity_sold + $1
       WHERE id = $2 AND menu_date = CURRENT_DATE
         AND quantity_sold + $1 <= quantity_available
       RETURNING id`,
      [quantity, daily_menu_id]
    );

    if (update.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sold out or invalid item' });
    }

    const order = await client.query(
      `INSERT INTO orders (user_id, daily_menu_id, quantity, delivery_address, phone, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [req.session.userId, daily_menu_id, quantity, delivery_address, phone, payment_method]
    );

    await client.query('COMMIT');
    res.json({ order: order.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Order failed' });
  } finally {
    client.release();
  }
});

app.get('/api/orders/mine', requireLogin, async (req, res) => {
  const result = await pool.query(
    `SELECT o.id, o.quantity, o.status, o.created_at, o.payment_method, o.delivery_address, o.phone,
            d.name, dm.menu_date, (d.price * o.quantity) AS total
     FROM orders o
     JOIN daily_menu dm ON dm.id = o.daily_menu_id
     JOIN dishes d ON d.id = dm.dish_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [req.session.userId]
  );
  res.json({ orders: result.rows });
});

// ---------- ADMIN ----------

// Create a dish in the catalog (do this once per dish, reuse across days)
app.post('/api/admin/dishes', requireLogin, requireAdmin, async (req, res) => {
  const { name, description, price, image_url } = req.body;
  const result = await pool.query(
    `INSERT INTO dishes (name, description, price, image_url) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, description, price, image_url]
  );
  res.json({ dish: result.rows[0] });
});

app.get('/api/admin/dishes', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM dishes ORDER BY name');
  res.json({ dishes: result.rows });
});

// See how many users have signed up, and their order counts
app.get('/api/admin/users', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.created_at,
            COUNT(o.id) AS order_count,
            COALESCE(SUM(o.quantity), 0) AS total_items_ordered
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json({ users: result.rows });
});

// Combined activity feed: signups and orders, most recent first
app.get('/api/admin/activity', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT 'signup' AS type, u.name AS user_name, u.email AS user_email,
            NULL AS detail, u.created_at
     FROM users u
     UNION ALL
     SELECT 'order' AS type, u.name AS user_name, u.email AS user_email,
            d.name || ' × ' || o.quantity || ' (₹' || (d.price * o.quantity) || ', ' || o.payment_method || ')' AS detail,
            o.created_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     JOIN daily_menu dm ON dm.id = o.daily_menu_id
     JOIN dishes d ON d.id = dm.dish_id
     ORDER BY created_at DESC
     LIMIT 200`
  );
  res.json({ activity: result.rows });
});

// List what's currently on today's menu, for the admin panel
app.get('/api/admin/menu/today', requireLogin, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT dm.id, d.name, dm.quantity_available, dm.quantity_sold
     FROM daily_menu dm
     JOIN dishes d ON d.id = dm.dish_id
     WHERE dm.menu_date = CURRENT_DATE
     ORDER BY dm.id`
  );
  res.json({ menu: result.rows });
});

// Remove a dish from today's menu. If orders already exist against it,
// we can't delete the row (order history references it), so instead we
// mark it sold out — it disappears from ordering but past orders stay intact.
app.delete('/api/admin/menu/today/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const deleteResult = await pool.query(
      `DELETE FROM daily_menu WHERE id = $1 AND menu_date = CURRENT_DATE RETURNING id`,
      [id]
    );
    if (deleteResult.rows.length > 0) {
      return res.json({ removed: true, method: 'deleted' });
    }
    return res.status(404).json({ error: 'Not found on today\'s menu' });
  } catch (err) {
    if (err.code === '23503') {
      // Foreign key violation - orders reference this item, so mark it
      // sold out instead of deleting it.
      await pool.query(
        `UPDATE daily_menu SET quantity_available = quantity_sold WHERE id = $1 AND menu_date = CURRENT_DATE`,
        [id]
      );
      return res.json({ removed: true, method: 'marked_sold_out' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not remove item' });
  }
});

// Set today's menu: max 2 dishes enforced here
app.post('/api/admin/menu/today', requireLogin, requireAdmin, async (req, res) => {
  const { dish_id, quantity_available } = req.body;
  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM daily_menu WHERE menu_date = CURRENT_DATE`
    );
    const existingCount = parseInt(countResult.rows[0].count, 10);

    const already = await pool.query(
      `SELECT id FROM daily_menu WHERE menu_date = CURRENT_DATE AND dish_id = $1`,
      [dish_id]
    );

    if (already.rows.length === 0 && existingCount >= 2) {
      return res.status(400).json({ error: 'Only 2 dishes allowed per day' });
    }

    const isNewToday = already.rows.length === 0;

    const result = await pool.query(
      `INSERT INTO daily_menu (menu_date, dish_id, quantity_available)
       VALUES (CURRENT_DATE, $1, $2)
       ON CONFLICT (menu_date, dish_id)
       DO UPDATE SET quantity_available = EXCLUDED.quantity_available
       RETURNING *`,
      [dish_id, quantity_available]
    );
    res.json({ menuItem: result.rows[0] });

    // Only notify on the first time this dish goes live today, not on every
    // quantity edit — avoids spamming users if you tweak the number later.
    if (isNewToday) {
      const dishResult = await pool.query('SELECT name FROM dishes WHERE id = $1', [dish_id]);
      const dishName = dishResult.rows[0]?.name || 'A dish';
      const usersResult = await pool.query(
        `SELECT phone FROM users WHERE phone IS NOT NULL AND phone <> ''`
      );
      const numbers = usersResult.rows.map(r => `whatsapp:${r.phone}`);
      broadcastWhatsApp(
        numbers,
        `🍲 Today's JoyBox is live! "${dishName}" — ${quantity_available} available. Order now before it's gone: https://boxofjoyz.onrender.com`
      );
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update menu' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
