// routes/conversations.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/conversations — list user's conversations
router.get('/', authenticate, (req, res) => {
  const convos = db.prepare(`
    SELECT c.*, 
      cm.role as my_role,
      (
        SELECT json_object(
          'id', m.id, 'content', m.content, 'type', m.type,
          'sender_id', m.sender_id, 'created_at', m.created_at
        )
        FROM messages m WHERE m.conversation_id = c.id AND m.is_deleted = 0
        ORDER BY m.created_at DESC LIMIT 1
      ) as last_message,
      (
        SELECT COUNT(*) FROM messages m2
        LEFT JOIN message_receipts mr ON mr.message_id = m2.id AND mr.user_id = ?
        WHERE m2.conversation_id = c.id AND m2.sender_id != ? 
          AND m2.is_deleted = 0 AND (mr.status IS NULL OR mr.status != 'read')
      ) as unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
    ORDER BY c.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id);

  // For each conversation, get members
  const result = convos.map(c => {
    const members = db.prepare(`
      SELECT u.id, u.full_name, u.avatar_url, u.church_role, u.is_online, u.last_seen, cm.role
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ?
    `).all(c.id);

    return {
      ...c,
      last_message: c.last_message ? JSON.parse(c.last_message) : null,
      members,
    };
  });

  res.json({ conversations: result });
});

// POST /api/conversations — create direct or group
router.post('/', authenticate, (req, res) => {
  const { type = 'direct', name, description, member_ids = [] } = req.body;

  // For direct chats, check if conversation already exists
  if (type === 'direct' && member_ids.length === 1) {
    const otherId = member_ids[0];
    const existing = db.prepare(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      WHERE c.type = 'direct'
      LIMIT 1
    `).get(req.user.id, otherId);

    if (existing) {
      return res.json({ conversation_id: existing.id, existing: true });
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO conversations (id, type, name, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, type, name || null, description || null, req.user.id);

  // Add creator as admin
  db.prepare(`INSERT INTO conversation_members (id, conversation_id, user_id, role) VALUES (?, ?, ?, 'admin')`).run(uuidv4(), id, req.user.id);

  // Add other members
  for (const uid of member_ids) {
    if (uid !== req.user.id) {
      db.prepare(`INSERT OR IGNORE INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)`).run(uuidv4(), id, uid);
    }
  }

  res.status(201).json({ conversation_id: id, existing: false });
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before;

  // Check membership
  const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this conversation' });

  let query = `
    SELECT m.*, 
      u.full_name as sender_name, u.avatar_url as sender_avatar, u.church_role as sender_role
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ? AND m.is_deleted = 0
  `;
  const params = [id];

  if (before) {
    query += ` AND m.created_at < ?`;
    params.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT ?`;
  params.push(limit);

  const messages = db.prepare(query).all(...params).reverse();

  // Mark as read
  for (const msg of messages) {
    if (msg.sender_id !== req.user.id) {
      db.prepare(`
        INSERT OR REPLACE INTO message_receipts (id, message_id, user_id, status)
        VALUES (?, ?, ?, 'read')
      `).run(uuidv4(), msg.id, req.user.id);
    }
  }

  res.json({ messages });
});

// POST /api/conversations/:id/messages — send message via REST (fallback)
router.post('/:id/messages', authenticate, (req, res) => {
  const { id } = req.params;
  const { content, type = 'text', media_url, reply_to_id } = req.body;

  const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const msgId = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, type, content, media_url, reply_to_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(msgId, id, req.user.id, type, content, media_url || null, reply_to_id || null);

  const message = db.prepare(`
    SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar
    FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
  `).get(msgId);

  res.status(201).json({ message });
});

// DELETE /api/messages/:msgId
router.delete('/messages/:msgId', authenticate, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Cannot delete others messages' });
  db.prepare('UPDATE messages SET is_deleted = 1, content = ? WHERE id = ?').run('This message was deleted', req.params.msgId);
  res.json({ success: true });
});

// GET /api/conversations/:id/members
router.get('/:id/members', authenticate, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.full_name, u.avatar_url, u.church_role, u.is_online, cm.role
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ?
  `).all(req.params.id);
  res.json({ members });
});

// POST /api/conversations/:id/members — add member
router.post('/:id/members', authenticate, (req, res) => {
  const { user_id } = req.body;
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!myRole || !['admin','moderator'].includes(myRole.role)) return res.status(403).json({ error: 'No permission' });

  db.prepare(`INSERT OR IGNORE INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)`).run(uuidv4(), req.params.id, user_id);
  res.json({ success: true });
});

module.exports = router;
