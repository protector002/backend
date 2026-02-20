// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'secret';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRES });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, phone, church_role } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const role = ['pastor', 'leader', 'admin'].includes(church_role) ? church_role : 'member';

    db.prepare(`
      INSERT INTO users (id, full_name, email, phone, password_hash, church_role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, full_name, email, phone || null, hash, role);

    const user = db.prepare('SELECT id, full_name, email, phone, church_role, avatar_url, bio, created_at FROM users WHERE id = ?').get(id);
    const token = signToken(id);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    const { password_hash, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, (req, res) => {
  const { full_name, bio, avatar_url, church_role } = req.body;
  db.prepare(`
    UPDATE users SET full_name = COALESCE(?, full_name),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      church_role = COALESCE(?, church_role)
    WHERE id = ?
  `).run(full_name, bio, avatar_url, church_role, req.user.id);

  const updated = db.prepare('SELECT id, full_name, email, phone, church_role, avatar_url, bio FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: updated });
});

module.exports = router;
