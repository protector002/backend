# ✝ ChurchConnect — Real-Time Church Chat App

A fully functional real-time messaging app for church communities, built with Node.js, Socket.io, SQLite, and vanilla JavaScript.

## Features
- ✅ Register / Login with JWT auth
- ✅ Real-time 1-on-1 and group messaging via Socket.io
- ✅ Typing indicators & read receipts
- ✅ Voice & Video calls (WebRTC)
- ✅ Prayer requests with community praying
- ✅ Church announcements (admin/pastor/leader only)
- ✅ Upcoming events calendar
- ✅ Bible quiz
- ✅ Daily Bible verse
- ✅ Role-based access (Pastor, Leader, Member, Admin)
- ✅ Online presence indicators
- ✅ Zero external database required (uses SQLite)

---

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### 1. Install backend dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and set your JWT_SECRET to something secure
```

### 3. Start the backend
```bash
npm start
# Server runs on http://localhost:4000
```

### 4. Open the frontend
```bash
# Simply open frontend/index.html in your browser
# OR serve it with any static server:
npx serve frontend
# Then visit http://localhost:3000
```

### 5. Connect frontend to backend
If backend is on a different URL, edit the top of `frontend/index.html`:
```js
const API = 'http://your-server-url:4000/api';
const WS  = 'http://your-server-url:4000';
```

---

## Project Structure
```
churchconnect/
├── backend/
│   ├── server.js              # Entry point
│   ├── db.js                  # SQLite setup & schema
│   ├── .env.example           # Environment variables
│   ├── middleware/
│   │   └── auth.js            # JWT authentication
│   ├── routes/
│   │   ├── auth.js            # Register, login, profile
│   │   ├── users.js           # User search & lookup
│   │   ├── conversations.js   # Chats, groups, messages
│   │   └── church.js          # Prayer, events, quiz, verse
│   └── socket/
│       └── socketHandler.js   # All real-time events
└── frontend/
    └── index.html             # Complete single-file frontend
```

---

## API Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/users | All church members |
| GET | /api/users/search?q= | Search members |
| GET | /api/conversations | My conversations |
| POST | /api/conversations | Start chat/group |
| GET | /api/conversations/:id/messages | Load messages |
| GET | /api/church/verse-of-day | Daily Bible verse |
| GET | /api/church/prayers | Prayer requests |
| POST | /api/church/prayers | Submit prayer |
| GET | /api/church/announcements | Church announcements |
| GET | /api/church/events | Upcoming events |
| GET | /api/church/quiz | Bible quiz questions |

---

## Socket.io Events

### Client → Server
| Event | Payload |
|-------|---------|
| `message:send` | `{ conversationId, content, tempId }` |
| `typing:start` | `{ conversationId }` |
| `typing:stop` | `{ conversationId }` |
| `message:read` | `{ conversationId, messageIds }` |
| `message:delete` | `{ messageId, conversationId }` |
| `call:offer` | `{ targetUserId, offer, type }` |
| `call:answer` | `{ callerId, answer }` |
| `call:ice-candidate` | `{ targetUserId, candidate }` |
| `call:end` | `{ targetUserId }` |

### Server → Client
| Event | Description |
|-------|-------------|
| `message:received` | New message in conversation |
| `message:sent` | Confirmation with tempId |
| `message:deleted` | Message removed |
| `typing:start` | User started typing |
| `typing:stop` | User stopped typing |
| `message:read` | Messages read by user |
| `user:online` | User presence changed |
| `call:incoming` | Incoming call |
| `call:answered` | Call accepted |
| `call:ended` | Call terminated |

---

## Deploy to Production

### Backend (Railway / Render / VPS)
```bash
# Set environment variables:
PORT=4000
JWT_SECRET=your_production_secret_here
CLIENT_URL=https://your-frontend-domain.com

# Deploy command:
node server.js
```

### Frontend
Upload `frontend/index.html` to:
- **Netlify**: Drag & drop
- **Vercel**: `vercel deploy`
- **GitHub Pages**: Push to repo
- Update `API` and `WS` constants at top of HTML to your backend URL

### Upgrade path
When ready to scale:
- Replace SQLite with **PostgreSQL** (Supabase is free)
- Add **Cloudinary** for image/video uploads
- Add **Twilio** for SMS OTP
- Add **Firebase Cloud Messaging** for push notifications

---

## Default Church Roles
| Role | Permissions |
|------|-------------|
| `member` | Chat, prayer requests, quiz |
| `leader` | + Create groups, events, announcements |
| `pastor` | + Upload sermons, all leader permissions |
| `admin` | Full access, user management |

Register with role `admin` to get full access on first setup.
