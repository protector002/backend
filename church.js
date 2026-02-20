// routes/church.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Bible Verse of the Day ──────────────────────────────────────────────────
const DAILY_VERSES = [
  { reference: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
  { reference: 'Philippians 4:13', text: 'I can do all this through him who gives me strength.' },
  { reference: 'Psalm 23:1', text: 'The LORD is my shepherd, I lack nothing.' },
  { reference: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.' },
  { reference: 'Romans 8:28', text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
  { reference: 'Isaiah 40:31', text: 'But those who hope in the LORD will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.' },
  { reference: 'Proverbs 3:5-6', text: 'Trust in the LORD with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.' },
  { reference: 'Matthew 28:19-20', text: 'Go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you.' },
  { reference: 'Joshua 1:9', text: 'Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.' },
  { reference: '1 Corinthians 13:4-5', text: 'Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It does not dishonor others, it is not self-seeking, it is not easily angered, it keeps no record of wrongs.' },
  { reference: 'Psalm 46:1', text: 'God is our refuge and strength, an ever-present help in trouble.' },
  { reference: 'Ephesians 2:8-9', text: 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.' },
  { reference: 'Matthew 6:33', text: 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.' },
  { reference: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control. Against such things there is no law.' },
];

router.get('/verse-of-day', authenticate, (req, res) => {
  const dayIndex = new Date().getDate() % DAILY_VERSES.length;
  res.json({ verse: DAILY_VERSES[dayIndex] });
});

// ── Prayer Requests ──────────────────────────────────────────────────────────
router.get('/prayers', authenticate, (req, res) => {
  const prayers = db.prepare(`
    SELECT p.*, 
      CASE WHEN p.is_anonymous = 1 THEN 'Anonymous' ELSE u.full_name END as author_name,
      CASE WHEN p.is_anonymous = 1 THEN NULL ELSE u.avatar_url END as author_avatar
    FROM prayer_requests p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT 50
  `).all();
  res.json({ prayers });
});

router.post('/prayers', authenticate, (req, res) => {
  const { title, body, is_anonymous = false } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO prayer_requests (id, user_id, title, body, is_anonymous) VALUES (?, ?, ?, ?, ?)`).run(id, req.user.id, title, body, is_anonymous ? 1 : 0);
  const prayer = db.prepare('SELECT * FROM prayer_requests WHERE id = ?').get(id);
  res.status(201).json({ prayer });
});

router.post('/prayers/:id/pray', authenticate, (req, res) => {
  db.prepare('UPDATE prayer_requests SET pray_count = pray_count + 1 WHERE id = ?').run(req.params.id);
  const prayer = db.prepare('SELECT pray_count FROM prayer_requests WHERE id = ?').get(req.params.id);
  res.json({ pray_count: prayer?.pray_count });
});

router.patch('/prayers/:id/answered', authenticate, (req, res) => {
  const prayer = db.prepare('SELECT * FROM prayer_requests WHERE id = ?').get(req.params.id);
  if (!prayer) return res.status(404).json({ error: 'Not found' });
  if (prayer.user_id !== req.user.id && req.user.church_role === 'member') {
    return res.status(403).json({ error: 'No permission' });
  }
  db.prepare('UPDATE prayer_requests SET is_answered = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Announcements ────────────────────────────────────────────────────────────
router.get('/announcements', authenticate, (req, res) => {
  const items = db.prepare(`
    SELECT a.*, u.full_name as author_name, u.avatar_url as author_avatar, u.church_role
    FROM announcements a
    JOIN users u ON u.id = a.author_id
    ORDER BY a.created_at DESC LIMIT 30
  `).all();
  res.json({ announcements: items });
});

router.post('/announcements', authenticate, authorize('admin', 'pastor', 'leader'), (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const id = uuidv4();
  db.prepare('INSERT INTO announcements (id, author_id, title, body) VALUES (?, ?, ?, ?)').run(id, req.user.id, title, body);
  const item = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.status(201).json({ announcement: item });
});

// ── Events ───────────────────────────────────────────────────────────────────
router.get('/events', authenticate, (req, res) => {
  const events = db.prepare(`
    SELECT e.*, u.full_name as creator_name
    FROM events e LEFT JOIN users u ON u.id = e.created_by
    WHERE datetime(e.starts_at) >= datetime('now', '-1 day')
    ORDER BY e.starts_at ASC LIMIT 20
  `).all();
  res.json({ events });
});

router.post('/events', authenticate, authorize('admin', 'pastor', 'leader'), (req, res) => {
  const { title, description, event_type = 'service', location, starts_at, ends_at } = req.body;
  if (!title || !starts_at) return res.status(400).json({ error: 'Title and start time required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO events (id, title, description, event_type, location, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, title, description, event_type, location, starts_at, ends_at, req.user.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.status(201).json({ event });
});

// ── Bible Quiz ───────────────────────────────────────────────────────────────
const QUIZ_QUESTIONS = [
  { id: 1, question: 'How many days did God take to create the world?', options: ['5', '6', '7', '8'], answer: 1 },
  { id: 2, question: 'Who was swallowed by a great fish?', options: ['Elijah', 'Moses', 'Jonah', 'Noah'], answer: 2 },
  { id: 3, question: 'How many disciples did Jesus have?', options: ['10', '11', '12', '13'], answer: 2 },
  { id: 4, question: 'Who built the ark?', options: ['Abraham', 'Moses', 'David', 'Noah'], answer: 3 },
  { id: 5, question: 'What is the first book of the Bible?', options: ['Exodus', 'Genesis', 'Psalms', 'Matthew'], answer: 1 },
  { id: 6, question: 'Who was the first king of Israel?', options: ['David', 'Solomon', 'Saul', 'Moses'], answer: 2 },
  { id: 7, question: 'In which city was Jesus born?', options: ['Jerusalem', 'Nazareth', 'Bethlehem', 'Jericho'], answer: 2 },
  { id: 8, question: 'How many books are in the New Testament?', options: ['25', '27', '29', '31'], answer: 1 },
];

router.get('/quiz', authenticate, (req, res) => {
  const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 5);
  const questions = shuffled.map(({ answer, ...q }) => q); // Don't send answers
  res.json({ questions });
});

router.post('/quiz/submit', authenticate, (req, res) => {
  const { answers } = req.body; // { questionId: selectedIndex }
  let score = 0;
  for (const q of QUIZ_QUESTIONS) {
    if (answers[q.id] === q.answer) score++;
  }
  res.json({ score, total: Object.keys(answers).length, percentage: Math.round((score / Object.keys(answers).length) * 100) });
});

module.exports = router;
