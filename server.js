const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const dbPath = path.join(__dirname, 'database.db');

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const val = parts.join('=');
    list[key] = decodeURIComponent(val);
  });
  return list;
}

app.use((req, res, next) => {
  try {
    const cookies = parseCookies(req);
    const toExpire = [];
    if (cookies.userId) toExpire.push('userId=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    if (cookies.role) toExpire.push('role=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    if (toExpire.length) {
      const existing = res.getHeader('Set-Cookie') || [];
      const merged = Array.isArray(existing) ? existing.concat(toExpire) : [existing].filter(Boolean).concat(toExpire);
      res.setHeader('Set-Cookie', merged);
    }
  } catch (e) {
    console.error('Failed to clear legacy cookies:', e && e.message);
  }
  next();
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL,
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      price REAL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      price REAL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER DEFAULT 0,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT,
      street TEXT,
      city TEXT,
      state TEXT,
      zipcode TEXT,
      country TEXT,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.all("PRAGMA table_info(addresses)", (err, cols) => {
      if (!err && cols) {
        const hasLabel = cols.some(c => c.name === 'label');
        if (!hasLabel) {
          db.run(`ALTER TABLE addresses ADD COLUMN label TEXT`, (err) => {
            if (err) console.error('Error adding label column to addresses:', err.message);
            else console.log('Added label column to addresses table');
          });
        }
      }
    });

    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (!err && columns) {
        const hasRoleColumn = columns.some(col => col.name === 'role');
        const hasActiveColumn = columns.some(col => col.name === 'active');

        if (!hasRoleColumn) {
          db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'`, (err) => {
            if (err) {
              console.error('Error adding role column:', err);
            } else {
              console.log('Role column added to users table');
            }
          });
        }

        if (!hasActiveColumn) {
          db.run(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`, (err) => {
            if (err) {
              console.error('Error adding active column:', err);
            } else {
              console.log('Active column added to users table');
            }
          });
        }
      }
    });

    db.all('SELECT id, password FROM users', (err, rows) => {
      if (err || !rows) return;
      rows.forEach(r => {
        const pw = String(r.password || '');
        if (!pw.startsWith('$2')) {
          try {
            const hash = bcrypt.hashSync(pw, 10);
            db.run('UPDATE users SET password = ? WHERE id = ?', [hash, r.id], (uErr) => {
              if (uErr) console.error('Failed hashing password for user', r.id, uErr.message);
              else console.log('Hashed password for user', r.id);
            });
          } catch (e) {
            console.error('Hash error for user', r.id, e.message);
          }
        }
      });
    });

    console.log('Database tables initialized');
    logRegisteredRoutes();
  });
}

function seedProducts() {
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (err) {
      console.error('Error checking products:', err);
      return;
    }
    
    if (row.count === 0) {
      const sampleProducts = [
        { name: 'Dog Collar', category: 'Accessories', price: 200, quantity: 20 },
        { name: 'Food Bowl', category: 'Accessories', price: 599, quantity: 14 },
        { name: 'Leash', category: 'Accessories', price: 299, quantity: 3 },
        { name: 'Puppy Kibble', category: 'Food', price: 750, quantity: 0 },
        { name: 'Dog Treats', category: 'Treats', price: 150, quantity: 45 },
        { name: 'Toy Ball', category: 'Accessories', price: 100, quantity: 30 }
      ];
      
      sampleProducts.forEach(prod => {
        db.run(
          'INSERT INTO products (name, category, price, quantity) VALUES (?, ?, ?, ?)',
          [prod.name, prod.category, prod.price, prod.quantity],
          (err) => {
            if (err) console.error('Error inserting product:', err.message);
          }
        );
      });
      console.log('Sample products seeded');
    }
  });
}

function writeProductsJson() {
  db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return console.error('Failed to write products JSON:', err);
    const outPath = path.join(__dirname, 'admin', 'products.json');
    fs.writeFile(outPath, JSON.stringify(rows, null, 2), (err) => {
      if (err) return console.error('Failed to write products.json:', err);
    });
  });
}

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const hashed = bcrypt.hashSync(password, 10);
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashed],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, username, email });
      }
    );
  } catch (e) {
    return res.status(500).json({ error: 'Failed to hash password' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const userRole = user.role || 'customer';
    console.log('User logged in:', { id: user.id, email: user.email, role: userRole });

    const cookies = [
      `sess_uid=${user.id}; HttpOnly; Path=/`,
      `sess_role=${userRole}; HttpOnly; Path=/`
    ];
    res.setHeader('Set-Cookie', cookies);
    res.json({ id: user.id, username: user.username, email: user.email, role: userRole });
  });
});

app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, username, email, created_at FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  let query = 'UPDATE users SET email = ?';
  let params = [email];

  if (password) {
    try {
      const hashed = bcrypt.hashSync(password, 10);
      query += ', password = ?';
      params.push(hashed);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to hash password' });
    }
  }

  query += ' WHERE id = ?';
  params.push(id);

  db.run(query, params, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'User updated successfully' });
  });
});

app.put('/api/users/:id/update', (req, res) => {
  const { id } = req.params;
  const { currentPassword, email, newPassword } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }

  db.get('SELECT password FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ok = bcrypt.compareSync(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    let query = 'UPDATE users SET email = ?';
    let params = [email];

    if (newPassword) {
      try {
        const hashedNew = bcrypt.hashSync(newPassword, 10);
        query += ', password = ?';
        params.push(hashedNew);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to hash new password' });
      }
    }

    query += ' WHERE id = ?';
    params.push(id);

    db.run(query, params, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'User updated successfully' });
    });
  });
});

app.get('/api/addresses/:userId', (req, res) => {
  const { userId } = req.params;

  db.all('SELECT * FROM addresses WHERE user_id = ?', [userId], (err, addresses) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(addresses || []);
  });
});

app.post('/api/addresses', (req, res) => {
  const { user_id, label, street, city, state, zipcode, country } = req.body;

  db.run(
    'INSERT INTO addresses (user_id, label, street, city, state, zipcode, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user_id, label || null, street, city, state, zipcode, country],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/addresses/:id', (req, res) => {
  const { id } = req.params;
  const { label, street, city, state, zipcode, country, is_default } = req.body;

  db.get('SELECT user_id FROM addresses WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Address not found' });

    const userId = row.user_id;

    db.serialize(() => {
      if (is_default === 1 || is_default === true) {
        db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId], (err) => {
          if (err) console.error('Failed to clear default addresses:', err.message);
        });
      }

      const query = `UPDATE addresses SET label = ?, street = ?, city = ?, state = ?, zipcode = ?, country = ?, is_default = ? WHERE id = ?`;
      const params = [label || null, street || null, city || null, state || null, zipcode || null, country || null, is_default ? 1 : 0, id];

      db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ message: 'Address updated successfully' });
      });
    });
  });
});

app.delete('/api/addresses/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM addresses WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Address not found' });
    return res.json({ message: 'Address deleted successfully' });
  });
});

app.get('/api/cart/:userId', (req, res) => {
  const { userId } = req.params;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });
  if (String(authUserId) !== String(userId) && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  db.all('SELECT * FROM cart WHERE user_id = ?', [userId], (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(items || []);
  });
});

app.post('/api/cart', (req, res) => {
  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });

  const { product_id, product_name, quantity, price } = req.body;
  const user_id = parseInt(authUserId);

  const qty = parseInt(quantity) || 1;

  db.get('SELECT * FROM products WHERE id = ?', [product_id], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if ((product.quantity || 0) < qty) return res.status(400).json({ error: 'Insufficient stock' });

    db.get('SELECT * FROM cart WHERE user_id = ? AND product_id = ?', [user_id, product_id], (err2, cartRow) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.serialize(() => {
        if (cartRow) {
          const newQty = (parseInt(cartRow.quantity) || 0) + qty;
          db.run('UPDATE cart SET quantity = ? WHERE id = ?', [newQty, cartRow.id], function(err3) {
            if (err3) return res.status(500).json({ error: err3.message });

            db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, product_id], function(err4) {
              if (err4) return res.status(500).json({ error: err4.message });
              writeProductsJson();
              return res.json({ message: 'Cart updated', id: cartRow.id });
            });
          });
        } else {
          db.run(
            'INSERT INTO cart (user_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)',
            [user_id, product_id, product_name, qty, parseFloat(price) || 0],
            function(err3) {
              if (err3) return res.status(500).json({ error: err3.message });

              db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [qty, product_id], function(err4) {
                if (err4) return res.status(500).json({ error: err4.message });
                writeProductsJson();
                return res.status(201).json({ id: this.lastID });
              });
            }
          );
        }
      });
    });
  });
});

app.delete('/api/cart/:id', (req, res) => {
  const { id } = req.params;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });

  db.get('SELECT * FROM cart WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Cart item not found' });
    if (String(row.user_id) !== String(authUserId) && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const restoreQty = parseInt(row.quantity) || 0;
    if (restoreQty > 0 && row.product_id) {
      db.run('UPDATE products SET quantity = quantity + ? WHERE id = ?', [restoreQty, row.product_id], (invErr) => {
        if (invErr) console.error('Failed to restore inventory on cart deletion:', invErr.message);
        writeProductsJson();

        db.run('DELETE FROM cart WHERE id = ?', [id], (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ message: 'Item removed from cart' });
        });
      });
    } else {
      db.run('DELETE FROM cart WHERE id = ?', [id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Item removed from cart' });
      });
    }
  });
});

app.put('/api/cart/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });

  if (typeof quantity === 'undefined') {
    return res.status(400).json({ error: 'Quantity is required' });
  }

  const newQty = parseInt(quantity);
  if (isNaN(newQty) || newQty < 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  db.get('SELECT * FROM cart WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Cart item not found' });
    if (String(row.user_id) !== String(authUserId) && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const oldQty = parseInt(row.quantity) || 0;
    const diff = newQty - oldQty;

    if (diff === 0) {
      return res.json({ message: 'Cart updated' });
    }

    const adjustInventory = (callback) => {
      if (!row.product_id) return callback();
      if (diff > 0) {
        db.get('SELECT quantity FROM products WHERE id = ?', [row.product_id], (invErr, prod) => {
          if (invErr) return callback(invErr);
          if (!prod) return callback(new Error('Product not found'));
          if (prod.quantity < diff) return callback(new Error('Insufficient stock'));
          db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [diff, row.product_id], callback);
        });
      } else {
        db.run('UPDATE products SET quantity = quantity + ? WHERE id = ?', [Math.abs(diff), row.product_id], callback);
      }
    };

    adjustInventory((invErr) => {
      if (invErr) {
        return res.status(400).json({ error: invErr.message || 'Inventory adjustment failed' });
      }
      writeProductsJson();
      db.run('UPDATE cart SET quantity = ? WHERE id = ?', [newQty, id], function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ message: 'Cart updated' });
      });
    });
  });
});

app.put('/api/cart/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (typeof quantity === 'undefined') {
    return res.status(400).json({ error: 'Quantity is required' });
  }

  db.run('UPDATE cart SET quantity = ? WHERE id = ?', [parseInt(quantity), id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Cart item not found' });
    return res.json({ message: 'Cart updated' });
  });
});

app.get('/api/orders/:userId', (req, res) => {
  const { userId } = req.params;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });
  if (String(authUserId) !== String(userId) && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC', [userId], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(orders || []);
  });
});

app.get('/api/orders/:userId/items/:orderId', (req, res) => {
  const { userId, orderId } = req.params;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });
  if (String(authUserId) !== String(userId) && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ order, items: items || [] });
    });
  });
});

app.put('/api/orders/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  const role = cookies.sess_role;
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });

  db.get('SELECT user_id FROM orders WHERE id = ?', [orderId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Order not found' });

    if (String(row.user_id) !== String(authUserId) && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Order not found or not updated' });
      db.get('SELECT * FROM orders WHERE id = ?', [orderId], (gErr, order) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        res.json({ message: 'Order status updated', order });
      });
    });
  });
});

app.post('/api/orders', (req, res) => {
  const cookies = parseCookies(req);
  const authUserId = cookies.sess_uid;
  console.log('[ORDER] cookies on request:', cookies);
  if (!authUserId) return res.status(401).json({ error: 'Not authenticated' });

  const user_id = parseInt(authUserId, 10);
  if (!Number.isInteger(user_id) || user_id <= 0) {
    console.error('[ORDER] Invalid user id from cookies:', authUserId);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { total_amount } = req.body;

  console.log('[ORDER] Creating order for user:', user_id, 'total:', total_amount);

  db.run(
    'INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, ?)',
    [user_id, total_amount || 0, 'pending'],
    function(err) {
      if (err) {
        console.error('[ORDER] Error inserting order:', err);
        return res.status(500).json({ error: 'Failed to create order' });
      }

      const orderId = this.lastID;
      console.log('[ORDER] Created order:', orderId);

      db.all('SELECT * FROM cart WHERE user_id = ?', [user_id], (err2, items) => {
        if (err2) {
          console.error('[ORDER] Error fetching cart:', err2);
          return res.status(500).json({ error: 'Failed to fetch cart' });
        }

        console.log('[ORDER] Found', items ? items.length : 0, 'items in cart');

        if (!items || items.length === 0) {
          db.run('DELETE FROM cart WHERE user_id = ?', [user_id], (delErr) => {
            if (delErr) console.error('[ORDER] Error clearing empty cart:', delErr);
            console.log('[ORDER] Returning with empty cart');
            return res.status(201).json({ id: orderId, status: 'pending', items: [] });
          });
          return;
        }

        let completed = 0;
        let error = null;

        function insertNext() {
          if (completed >= items.length) {
            if (error) {
              console.error('[ORDER] Error during inserts, not clearing cart');
              return res.status(500).json({ error: 'Failed to save order items' });
            }
            
            db.run('DELETE FROM cart WHERE user_id = ?', [user_id], (delErr) => {
              if (delErr) console.error('[ORDER] Error clearing cart after order:', delErr);
              console.log('[ORDER] Order complete, cart cleared');
              res.status(201).json({ id: orderId, status: 'pending', items });
            });
            return;
          }

          const item = items[completed];
          db.run(
            'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.product_id, item.product_name, item.quantity, item.price],
            (insertErr) => {
              if (insertErr) {
                console.error('[ORDER] Error inserting order item:', insertErr);
                error = insertErr;
              }
              completed++;
              insertNext();
            }
          );
        }

        insertNext();
      });
    }
  );
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route works!' });
});

app.get('/api/products', (req, res) => {
  console.log('[API] GET /api/products - query:', req.query);
  const { search, category } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  let params = [];

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  if (category && category !== 'All' && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, products) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(products || []);
  });
});

app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  });
});

app.post('/api/admin/products', (req, res) => {
  const { name, category, price, quantity } = req.body;

  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO products (name, category, price, quantity) VALUES (?, ?, ?, ?)',
    [name, category, parseFloat(price), parseInt(quantity) || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, name, category, price, quantity });
      writeProductsJson();
    }
  );
});

app.put('/api/admin/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, price, quantity } = req.body;

  const query = 'UPDATE products SET name = ?, category = ?, price = ?, quantity = ? WHERE id = ?';
  const params = [name, category, parseFloat(price), parseInt(quantity), id];

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product updated successfully' });
    writeProductsJson();
  });
});

app.delete('/api/admin/products/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
    writeProductsJson();
  });
});

const adminAuthMiddleware = (req, res, next) => {
  const role = req.headers['x-admin-role'] || req.query.role || (req.cookies && req.cookies.sess_role);
  const userId = req.headers['x-user-id'] || req.query.userId || (req.cookies && req.cookies.sess_uid);

  if (role === 'admin' || req.headers['x-admin-token']) {
    return next();
  }

  console.log('Admin access attempt - role:', role, 'userId:', userId);
  next();
};

app.use('/api/admin', adminAuthMiddleware, require('./admin/admin')(db));

app.get('/api/products', (req, res) => {
  const { search, category } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }
  if (category && category !== 'All' && category !== 'all') { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY created_at DESC';
  db.all(query, params, (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(products || []);
  });
});

app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/user', express.static(path.join(__dirname, 'user')));
app.use('/Homepage', express.static(path.join(__dirname, 'Homepage')));
app.use('/login', express.static(path.join(__dirname, 'login')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Homepage', 'homepage-public.html'), err => {
    if (err) {
      console.error('Error sending root page:', err);
      res.status(500).send('Error loading page');
    }
  });
});

app.all(/.*/, (req, res) => {
  console.log(`[CATCH-ALL] ${req.method} ${req.path}`);
  res.status(404).json({ error: `No route found for ${req.method} ${req.path}` });
});

function logRegisteredRoutes() {
  try {
    const routes = [];
    let stackLength = 0;
    if (app._router && app._router.stack) {
      stackLength = app._router.stack.length;
      app._router.stack.forEach(mw => {
        if (mw.route && mw.route.path) {
          const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
          routes.push(`${methods} ${mw.route.path}`);
        }
      });
    }
    console.log(`(debug) router stack length = ${stackLength}`);
    if (routes.length > 0) {
      console.log('Registered routes:\n' + routes.join('\n'));
    } else {
      console.log('Registered routes: (none found)');
    }
  } catch (e) {
    console.error('Failed to list routes', e);
  }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  logRegisteredRoutes();
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err);
    console.log('Database connection closed');
    process.exit(0);
  });
});
