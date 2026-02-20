// socket/socketHandler.js
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');

const SECRET = process.env.JWT_SECRET || 'secret';

// Track online users: userId -> socketId
const onlineUsers = new Map();

function setupSocket(io) {
  // Authentication middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, SECRET);
      const user = db.prepare('SELECT id, full_name, avatar_url, church_role FROM users WHERE id = ?').get(payload.userId);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    console.log(`🟢 ${socket.user.full_name} connected [${socket.id}]`);

    // Mark user online
    onlineUsers.set(userId, socket.id);
    db.prepare('UPDATE users SET is_online = 1 WHERE id = ?').run(userId);

    // Join all user's conversation rooms
    const convos = db.prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?').all(userId);
    convos.forEach(c => socket.join(`room:${c.conversation_id}`));

    // Broadcast online status to contacts
    socket.broadcast.emit('user:online', { userId, is_online: true });

    // ── MESSAGE:SEND ────────────────────────────────────────────────────────
    socket.on('message:send', ({ conversationId, content, type = 'text', media_url, reply_to_id, tempId }) => {
      try {
        // Verify membership
        const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
        if (!member) return socket.emit('error', { message: 'Not a member of this conversation' });

        const msgId = uuidv4();
        db.prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, type, content, media_url, reply_to_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(msgId, conversationId, userId, type, content, media_url || null, reply_to_id || null);

        const message = db.prepare(`
          SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar, u.church_role as sender_role
          FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
        `).get(msgId);

        // Acknowledge to sender with tempId for optimistic UI
        socket.emit('message:sent', { ...message, tempId });

        // Broadcast to all room members except sender
        socket.to(`room:${conversationId}`).emit('message:received', message);

        console.log(`💬 [${conversationId}] ${socket.user.full_name}: ${content.substring(0, 50)}`);
      } catch (err) {
        console.error('message:send error', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── TYPING INDICATOR ────────────────────────────────────────────────────
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`room:${conversationId}`).emit('typing:start', {
        conversationId,
        userId,
        name: socket.user.full_name,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`room:${conversationId}`).emit('typing:stop', { conversationId, userId });
    });

    // ── MESSAGE:READ ────────────────────────────────────────────────────────
    socket.on('message:read', ({ conversationId, messageIds }) => {
      try {
        for (const msgId of messageIds) {
          db.prepare(`
            INSERT OR REPLACE INTO message_receipts (id, message_id, user_id, status)
            VALUES (?, ?, ?, 'read')
          `).run(uuidv4(), msgId, userId);
        }
        socket.to(`room:${conversationId}`).emit('message:read', { conversationId, userId, messageIds });
      } catch (err) {
        console.error('message:read error', err);
      }
    });

    // ── MESSAGE:DELETE ──────────────────────────────────────────────────────
    socket.on('message:delete', ({ messageId, conversationId }) => {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!msg || msg.sender_id !== userId) return;
      db.prepare('UPDATE messages SET is_deleted = 1, content = ? WHERE id = ?').run('This message was deleted', messageId);
      io.to(`room:${conversationId}`).emit('message:deleted', { messageId, conversationId });
    });

    // ── JOIN NEW ROOM ───────────────────────────────────────────────────────
    socket.on('room:join', ({ conversationId }) => {
      const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
      if (member) socket.join(`room:${conversationId}`);
    });

    // ── CALL SIGNALING ──────────────────────────────────────────────────────
    socket.on('call:offer', ({ targetUserId, offer, type }) => {
      const targetSocket = onlineUsers.get(targetUserId);
      if (targetSocket) {
        io.to(targetSocket).emit('call:incoming', {
          callerId: userId,
          callerName: socket.user.full_name,
          callerAvatar: socket.user.avatar_url,
          offer,
          type, // 'audio' | 'video'
        });
      } else {
        socket.emit('call:unavailable', { targetUserId });
      }
    });

    socket.on('call:answer', ({ callerId, answer }) => {
      const callerSocket = onlineUsers.get(callerId);
      if (callerSocket) io.to(callerSocket).emit('call:answered', { answer, answererId: userId });
    });

    socket.on('call:ice-candidate', ({ targetUserId, candidate }) => {
      const targetSocket = onlineUsers.get(targetUserId);
      if (targetSocket) io.to(targetSocket).emit('call:ice-candidate', { candidate, from: userId });
    });

    socket.on('call:end', ({ targetUserId }) => {
      const targetSocket = onlineUsers.get(targetUserId);
      if (targetSocket) io.to(targetSocket).emit('call:ended', { by: userId });
    });

    socket.on('call:reject', ({ callerId }) => {
      const callerSocket = onlineUsers.get(callerId);
      if (callerSocket) io.to(callerSocket).emit('call:rejected', { by: userId });
    });

    // ── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 ${socket.user.full_name} disconnected`);
      onlineUsers.delete(userId);
      db.prepare('UPDATE users SET is_online = 0, last_seen = datetime(?) WHERE id = ?').run(new Date().toISOString(), userId);
      socket.broadcast.emit('user:online', { userId, is_online: false, last_seen: new Date().toISOString() });
    });
  });

  return io;
}

module.exports = { setupSocket };
