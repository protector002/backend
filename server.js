// server.js — ChurchConnect Main Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDB } = require('./db');
const { setupSocket } = require('./socket/socketHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const churchRoutes = require('./routes/church');

const app = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
setupSocket(io);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/church', churchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), app: 'ChurchConnect' });
});

// ── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

initDB();

server.listen(PORT, () => {
  console.log(`
  ✝  ChurchConnect Server Running
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀 HTTP  → http://localhost:${PORT}
  🔌 WS    → ws://localhost:${PORT}
  📦 DB    → SQLite (churchconnect.db)
  `);
});

module.exports = { app, server };
