// routes/users.js
const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/search?q=
router.get('/search', authenticate, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const users = db.prepare(`
    SELECT id, full_name, email, church_role, avatar_url, bio, is_online, last_seen
    FROM users
    WHERE (full_name LIKE ? OR email LIKE ?)
      AND id != ?
    LIMIT 20
  `).all(q, q, req.user.id);
  res.json({ users });
});

// GET /api/users/:id
router.get('/:id', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, full_name, email, church_role, avatar_url, bio, is_online, last_seen
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// GET /api/users — all church members
router.get('/', authenticate, (req, res) => {
  const users = db.prepare(`
    SELECT id, full_name, email, church_role, avatar_url, bio, is_online, last_seen
    FROM users WHERE id != ?
    ORDER BY full_name ASC
  `).all(req.user.id);
  res.json({ users });
});

module.exports = router;
