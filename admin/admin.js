const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  router.get('/users', (req, res) => {
    db.all('SELECT id, username, email, role, active, created_at FROM users ORDER BY created_at DESC', (err, users) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const normalized = (users || []).map(u => ({ ...u, active: u.active === 1 || u.active === '1' || u.active === true }));
      res.json(normalized);
    });
  });

  router.put('/users/:id/role', (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "customer"' });
    }

    db.run('UPDATE users SET role = ? WHERE id = ?', [role, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ message: 'User role updated successfully', role });
    });
  });

  router.delete('/users/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ message: 'User deleted successfully' });
    });
  });

  router.put('/users/:id', (req, res) => {
    const { id } = req.params;
    const { username, email, role, active } = req.body;

    const allowedRoles = ['admin', 'customer'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const fields = [];
    const params = [];
    if (username) { fields.push('username = ?'); params.push(username); }
    if (email) { fields.push('email = ?'); params.push(email); }
    if (typeof active !== 'undefined') { fields.push('active = ?'); params.push(active ? 1 : 0); }
    if (role) { fields.push('role = ?'); params.push(role); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);

    db.run(query, params, function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Username or email already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
      db.get('SELECT id, username, email, role, created_at, active FROM users WHERE id = ?', [id], (gErr, user) => {
        if (gErr) return res.status(500).json({ error: gErr.message });
        res.json({ message: 'User updated', user });
      });
    });
  });

  router.get('/users/:id/orders/count', (req, res) => {
    const { id } = req.params;

    db.get('SELECT COUNT(*) as count FROM orders WHERE user_id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ count: result?.count || 0 });
    });
  });

  router.get('/users/:id/orders/total', (req, res) => {
    const { id } = req.params;

    db.get('SELECT SUM(total_amount) as total FROM orders WHERE user_id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ total: result?.total || 0 });
    });
  });

  router.get('/sales/summary', (req, res) => {
    const summary = {};
    db.get('SELECT SUM(total_amount) as totalRevenue FROM orders', [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      summary.totalRevenue = row?.totalRevenue || 0;
      db.get("SELECT COUNT(*) as active FROM orders WHERE status != 'delivered'", [], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        summary.activeOrders = row2?.active || 0;
        db.get("SELECT COUNT(*) as completed FROM orders WHERE status = 'delivered'", [], (err3, row3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          summary.completedOrders = row3?.completed || 0;
          res.json(summary);
        });
      });
    });
  });

  router.get('/sales/transactions', (req, res) => {
    db.all(
      `SELECT o.id, u.username, o.order_date, o.total_amount, o.status
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.order_date DESC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  router.get('/sales/monthly', (req, res) => {
    db.all(
      `SELECT 
        CAST(strftime('%m', order_date) AS INTEGER) as month,
        CASE CAST(strftime('%m', order_date) AS INTEGER)
          WHEN 1 THEN 'Jan'
          WHEN 2 THEN 'Feb'
          WHEN 3 THEN 'Mar'
          WHEN 4 THEN 'Apr'
          WHEN 5 THEN 'May'
          WHEN 6 THEN 'Jun'
          WHEN 7 THEN 'Jul'
          WHEN 8 THEN 'Aug'
          WHEN 9 THEN 'Sep'
          WHEN 10 THEN 'Oct'
          WHEN 11 THEN 'Nov'
          WHEN 12 THEN 'Dec'
          ELSE 'N/A'
        END as month_name,
        SUM(total_amount) as revenue
       FROM orders
       WHERE order_date >= datetime('now', '-6 months')
       GROUP BY strftime('%m', order_date)
       ORDER BY month ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  router.get('/sales/best-sellers', (req, res) => {
    db.all(
      `SELECT product_name, SUM(quantity) as qty
       FROM order_items
       GROUP BY product_name
       ORDER BY qty DESC
       LIMIT 5`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  router.get('/orders/:orderId', (req, res) => {
    const { orderId } = req.params;
    db.get(
      `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [orderId],
      (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err2, items) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ order, items: items || [] });
        });
      }
    );
  });

  router.get('/overview/metrics', (req, res) => {
    const metrics = { totalRevenue: 0, inventory: 0, totalCustomers: 0 };
    db.serialize(() => {
      db.get('SELECT SUM(total_amount) as totalRevenue FROM orders', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        metrics.totalRevenue = row?.totalRevenue || 0;
        db.get('SELECT COUNT(*) as count FROM products', [], (err2, row2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          metrics.inventory = row2?.count || 0;
          db.get('SELECT COUNT(*) as count FROM users', [], (err3, row3) => {
            if (err3) return res.status(500).json({ error: err3.message });
            metrics.totalCustomers = row3?.count || 0;
            res.json(metrics);
          });
        });
      });
    });
  });

  router.get('/overview/recent-orders', (req, res) => {
    db.all(
      `SELECT o.id, u.username, o.order_date, o.status, o.total_amount
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.order_date DESC LIMIT 5`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  return router;
};
