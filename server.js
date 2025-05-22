const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');

const app = express(); // 👈 این باید بالا باشه

const corsOptions = {
  origin: 'https://partner.arnoush.am',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions)); // 👈 حالا اینجا می‌تونه اجرا بشه

app.use(express.json());


// تابع برای لاگ کردن (دیباگ)
function debugLog(message) {
  const logFile = './debug.log'; // ذخیره در پوشه پروژه
  fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
}


// تنظیمات دیتابیس
const dbConfig = {
  host: '46.17.101.71',
  user: 'arnousha_papuser',
  password: 'lHqTGoDMb5bD',
  database: 'arnousha_pap'
};



const JWT_SECRET = 'mysecretkey_arnoush_2025_supersecure';

// میدلویر برای چک کردن توکن
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    debugLog('خطا: توکن وجود نداره');
    return res.status(401).json({ error: 'لطفاً لاگین کنید' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    debugLog(`خطا در تأیید توکن: ${e.message}`);
    res.status(401).json({ error: 'توکن نامعتبر' });
  }
}

// ثبت‌نام (بدون هش کردن رمز)
app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  const db = await mysql.createConnection(dbConfig);

  debugLog(`درخواست ثبت‌نام - یوزرنیم: ${username}`);

  try {
    const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUsers.length > 0) {
      debugLog(`ثبت‌نام ناموفق - یوزرنیم قبلاً وجود داره: ${username}`);
      return res.status(400).json({ error: 'این یوزرنیم قبلاً ثبت شده' });
    }

    await db.query(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, password, role || 'order']
    );

    debugLog(`یوزر جدید ثبت شد: ${username}, نقش: ${role || 'order'}`);
    res.json({ success: true, message: 'یوزر با موفقیت ثبت شد' });
  } catch (e) {
    debugLog(`خطا در ثبت‌نام: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

// لاگین (بدون bcrypt)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await mysql.createConnection(dbConfig);

  debugLog(`درخواست لاگین - یوزرنیم: ${username}, پسورد: ${password}`);

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];

    if (!user) {
      debugLog(`یوزر پیدا نشد: ${username}`);
      return res.status(401).json({ error: 'یوزرنیم یا پسورد اشتباهه' });
    }

    if (password !== user.password) {
      debugLog(`پسورد اشتباه - پسورد دیتابیس: ${user.password}`);
      return res.status(401).json({ error: 'یوزرنیم یا پسورد اشتباهه' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    await db.query('UPDATE users SET token = ? WHERE id = ?', [token, user.id]);

    debugLog(`لاگین موفق - یوزر: ${username}, توکن: ${token}, نقش: ${user.role}`);
    res.json({ success: true, token, role: user.role });
  } catch (e) {
    debugLog(`خطا در لاگین: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

// سوپرمارکت‌ها
app.get('/api/supermarkets', authMiddleware, async (req, res) => {
  const db = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await db.query('SELECT id, name, code, address, latitude, longitude, yandex_navi_link FROM supermarkets ORDER BY name');
    debugLog(`سوپرمارکت‌ها لود شدن: ${rows.length} مورد`);
    res.json(rows);
  } catch (e) {
    debugLog(`خطا در لود سوپرمارکت‌ها: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.post('/api/supermarkets', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی ندارید' });

  const { name, code, address, latitude, longitude, yandex_navi_link } = req.body;
  const db = await mysql.createConnection(dbConfig);

  try {
    await db.query('INSERT INTO supermarkets (name, code, address, latitude, longitude, yandex_navi_link) VALUES (?, ?, ?, ?, ?, ?)',
      [name, code, address, latitude, longitude, yandex_navi_link || '']);
    debugLog(`سوپرمارکت جدید اضافه شد: ${name}`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در اضافه کردن سوپرمارکت: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

// محصولات
app.get('/api/products', authMiddleware, async (req, res) => {
  const db = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await db.query('SELECT id, name, code, weight FROM products ORDER BY code');
    debugLog(`محصولات لود شدن: ${rows.length} مورد`);
    res.json(rows);
  } catch (e) {
    debugLog(`خطا در لود محصولات: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

// سفارش‌ها
app.get('/api/orders', authMiddleware, async (req, res) => {
  const db = await mysql.createConnection(dbConfig);
  try {
    let query = '';
    let params = [];

    if (req.user.role === 'order') {
      query = 'SELECT o.*, s.name AS supermarket, p.name AS product_name, p.weight AS product_weight FROM orders o JOIN supermarkets s ON o.supermarket_id = s.id JOIN products p ON o.product_id = p.id WHERE o.created_by = ? AND o.status = "pending"';
      params = [req.user.id];
    } else if (req.user.role === 'production') {
      query = 'SELECT o.*, s.name AS supermarket, p.name AS product_name, p.weight AS product_weight, COALESCE(SUM(pr.produced_quantity), 0) AS produced FROM orders o JOIN supermarkets s ON o.supermarket_id = s.id JOIN products p ON o.product_id = p.id LEFT JOIN production pr ON o.id = pr.order_id WHERE o.status = "confirmed" GROUP BY o.id';
    } else if (req.user.role === 'delivery') {
      query = 'SELECT o.*, s.name AS supermarket, s.address, s.latitude, s.longitude, s.yandex_navi_link, p.name AS product_name, p.weight AS product_weight, dr.delivery_order FROM orders o JOIN supermarkets s ON o.supermarket_id = s.id JOIN products p ON o.product_id = p.id JOIN delivery_routes dr ON o.supermarket_id = dr.supermarket_id WHERE o.status = "produced" AND DATE(dr.created_at) = CURDATE() ORDER BY dr.delivery_order';
    } else if (req.user.role === 'admin') {
      query = 'SELECT o.*, s.name AS supermarket, p.name AS product_name, p.weight AS product_weight FROM orders o JOIN supermarkets s ON o.supermarket_id = s.id JOIN products p ON o.product_id = p.id';
    }

    const [rows] = await db.query(query, params);
    debugLog(`سفارش‌ها لود شدن برای نقش ${req.user.role}: ${rows.length} مورد`);
    res.json(rows);
  } catch (e) {
    debugLog(`خطا در لود سفارش‌ها: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  if (req.user.role !== 'order') return res.status(403).json({ error: 'دسترسی ندارید' });

  const { supermarket_id, product_id, quantity, order_date, note } = req.body;
  const db = await mysql.createConnection(dbConfig);

  try {
    const [result] = await db.query(
      'INSERT INTO orders (supermarket_id, product_id, quantity, order_date, note, status, created_by) VALUES (?, ?, ?, ?, ?, "pending", ?)',
      [supermarket_id, product_id, quantity, order_date, note, req.user.id]
    );
    const [product] = await db.query('SELECT name FROM products WHERE id = ?', [product_id]);
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [4, `سفارش جدید از ${req.user.username} برای ${product[0].name}`]);
    debugLog(`سفارش جدید ثبت شد - ID: ${result.insertId}, یوزر: ${req.user.username}`);
    res.json({ success: true, order_id: result.insertId });
  } catch (e) {
    debugLog(`خطا در ثبت سفارش: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.put('/api/orders/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'order' && req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی ندارید' });

  const { product_id, quantity, order_date, note } = req.body;
  const db = await mysql.createConnection(dbConfig);

  try {
    await db.query(
      'UPDATE orders SET product_id = ?, quantity = ?, order_date = ?, note = ? WHERE id = ? AND status = "pending"',
      [product_id, quantity, order_date, note, req.params.id]
    );
    debugLog(`سفارش آپدیت شد - ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در آپدیت سفارش: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.put('/api/orders/:id/confirm', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی ندارید' });

  const db = await mysql.createConnection(dbConfig);
  try {
    await db.query('UPDATE orders SET status = "confirmed" WHERE id = ?', [req.params.id]);
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [2, `سفارش ${req.params.id} تأیید شد`]);
    debugLog(`سفارش تأیید شد - ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در تأیید سفارش: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.post('/api/production', authMiddleware, async (req, res) => {
  if (req.user.role !== 'production') return res.status(403).json({ error: 'دسترسی ندارید' });

  const { order_id, produced_quantity } = req.body;
  const db = await mysql.createConnection(dbConfig);

  try {
    await db.query('INSERT INTO production (order_id, produced_quantity) VALUES (?, ?)', [order_id, produced_quantity]);

    const [total] = await db.query('SELECT SUM(produced_quantity) AS total FROM production WHERE order_id = ?', [order_id]);
    const [order] = await db.query('SELECT quantity FROM orders WHERE id = ?', [order_id]);

    if (total[0].total >= order[0].quantity) {
      await db.query('UPDATE orders SET status = "produced" WHERE id = ?', [order_id]);
      await db.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
        [3, `سفارش ${order_id} آماده تحویله`]);
    }
    debugLog(`تولید ثبت شد - سفارش ID: ${order_id}, مقدار: ${produced_quantity}`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در ثبت تولید: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.put('/api/orders/:id/deliver', authMiddleware, async (req, res) => {
  if (req.user.role !== 'delivery') return res.status(403).json({ error: 'دسترسی ندارید' });

  const db = await mysql.createConnection(dbConfig);
  try {
    await db.query('UPDATE orders SET status = "delivered" WHERE id = ?', [req.params.id]);
    await db.query('UPDATE delivery_routes SET delivered_at = NOW() WHERE supermarket_id = (SELECT supermarket_id FROM orders WHERE id = ?)', [req.params.id]);
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [4, `سفارش ${req.params.id} تحویل شد`]);
    debugLog(`سفارش تحویل شد - ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در تحویل سفارش: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.get('/api/delivery_routes', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'delivery') return res.status(403).json({ error: 'دسترسی ندارید' });

  const db = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await db.query('SELECT dr.*, s.name, s.address, s.latitude, s.longitude, s.yandex_navi_link FROM delivery_routes dr JOIN supermarkets s ON dr.supermarket_id = s.id WHERE DATE(dr.created_at) = CURDATE() ORDER BY dr.delivery_order');
    debugLog(`ترتیب تحویل لود شد: ${rows.length} مورد`);
    res.json(rows);
  } catch (e) {
    debugLog(`خطا در لود ترتیب تحویل: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.post('/api/delivery_routes', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی ندارید' });

  const order_data = req.body;
  const db = await mysql.createConnection(dbConfig);

  try {
    await db.query('DELETE FROM delivery_routes WHERE DATE(created_at) = CURDATE()');
    for (let i = 0; i < order_data.length; i++) {
      await db.query('INSERT INTO delivery_routes (supermarket_id, delivery_order, created_at) VALUES (?, ?, NOW())',
        [order_data[i], i + 1]);
    }
    debugLog(`ترتیب تحویل جدید ثبت شد: ${order_data.length} مورد`);
    res.json({ success: true });
  } catch (e) {
    debugLog(`خطا در ثبت ترتیب تحویل: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const db = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    debugLog(`نوتیفیکیشن‌ها لود شدن برای یوزر ${req.user.id}: ${rows.length} مورد`);
    res.json(rows);
  } catch (e) {
    debugLog(`خطا در لود نوتیفیکیشن‌ها: ${e.message}`);
    res.status(500).json({ error: 'خطای سرور' });
  } finally {
    await db.end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`سرور روی پورت ${PORT} اجرا شد`);
  debugLog(`سرور روی پورت ${PORT} اجرا شد`);
});
