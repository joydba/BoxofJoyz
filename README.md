# The JoyBox

Two dishes a day, made properly, ordered until they're gone.

A small Node/Express + vanilla JS app backed by YugabyteDB. Signup, login,
a daily 2-dish board, and an admin page to post today's menu each morning.

## 1. Set up the database

1. In YugabyteDB Aeon, open your Sandbox cluster → **Connect** → note the host, and download your credentials.
2. Connect via Cloud Shell or `ysqlsh` and run:
   ```sql
   CREATE DATABASE joybox;
   \c joybox;
   ```
3. Paste in the contents of `schema.sql` (included in this project) to create the tables.

## 2. Run it locally (optional, to test first)

```bash
cp .env.example .env
# fill in .env with your Aeon connection details
npm install
npm start
```
Visit `http://localhost:3000`.

## 3. Deploy for free — Render (recommended, free forever, not a trial)

1. Push this folder to a new GitHub repo.
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect your repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment**, add the variables from `.env.example` (your real Aeon values).
5. Deploy. Render gives you a live URL like `the-joybox.onrender.com`.

Note: Render's free tier spins the server down after 15 minutes of no traffic,
and takes ~30 seconds to wake back up on the next visit. Fine for a demo/MVP;
upgrade to a paid instance later if you need it always-on.

## 4. Alternative: Railway (true 30-day-style trial)

If you specifically want a trial with more consistent uptime:
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
2. Add the same environment variables.
3. Railway gives ~$5 of free credit, which comfortably covers a small app like
   this for about a month before you'd need to add a card.

## 5. First admin account

Sign up normally through the site with your own email, then in `ysqlsh`:
```sql
UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
```
Log out and back in — you'll see an **Admin** link to post today's two dishes.

## Project structure

```
schema.sql          -- run this once against your database
server.js            -- Express API (auth, menu, orders, admin)
db.js                 -- YugabyteDB connection
public/
  index.html          -- today's 2-dish board + ordering
  signup.html
  login.html
  my-orders.html
  admin.html          -- post today's 2 dishes, add new dishes to catalog
```
