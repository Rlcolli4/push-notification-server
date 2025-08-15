const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

/**
 * Configuration
 * 
 * Environment Variables:
 * - PORT: Server port (default: 3000)
 * - CHAT_SESSIONS_DIR: Directory to store chat sessions (default: ./chat_sessions)
 * - CORS_ORIGIN: CORS origin setting (default: "*")
 * - MAX_MESSAGE_LENGTH: Maximum allowed message length (default: 1000)
 * - SESSION_CLEANUP_INTERVAL: Session cleanup interval in milliseconds (default: 24 hours)
 * 
 * Example usage:
 * PORT=8080 CHAT_SESSIONS_DIR=/var/chat_sessions CORS_ORIGIN=http://localhost:3000 node server.js
 */
const PORT = process.env.PORT || 3000;
const CHAT_SESSIONS_DIR = process.env.CHAT_SESSIONS_DIR || path.join(__dirname, 'chat_sessions');
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_MESSAGE_LENGTH = process.env.MAX_MESSAGE_LENGTH || 2000;
const SESSION_CLEANUP_INTERVAL = process.env.SESSION_CLEANUP_INTERVAL || 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active connections
const activeConnections = new Map(); // machineId -> socket
const userSessions = new Map(); // userId -> machineId

// Ensure chat sessions directory exists
fs.ensureDirSync(CHAT_SESSIONS_DIR);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle test messages (for debugging)
  socket.on('test', (data) => {
    console.log('🧪 Test message received:', data);
    socket.emit('test_response', { message: 'Test response from server', timestamp: new Date().toISOString() });
  });

  // Handle user registration
  socket.on('register_user', (data) => {
    const { machineId, userId } = data;

    console.log('📝 Registration attempt received:', data);
    console.log('🔌 Socket ID:', socket.id);

    if (!machineId || !userId) {
      console.log('❌ Registration validation failed');
      socket.emit('registration_error', { message: 'Machine ID and User ID are required' });
      return;
    }

    // Store the connection
    activeConnections.set(machineId, socket);
    userSessions.set(userId, machineId);

    console.log(`✅ User ${userId} registered on machine ${machineId}`);
    console.log(`📊 Active connections: ${activeConnections.size}, Active users: ${userSessions.size}`);
    socket.emit('registration_success', { message: 'User registered successfully' });
  });

  // Handle chat session creation
  socket.on('create_chat_session', async (data) => {
    const { machineId, senderUserId, receiverUserId } = data;

    if (!machineId || !senderUserId || !receiverUserId) {
      socket.emit('session_error', { message: 'Machine ID, Sender User ID, and Receiver User ID are required' });
      return;
    }

    try {
      const sessionId = uuidv4();
      const sessionData = {
        sessionId,
        machineId,
        senderUserId,
        receiverUserId,
        createdAt: new Date().toISOString(),
        messages: [],
        participants: [senderUserId, receiverUserId]
      };

      // Create session folder and file
      const sessionFolder = path.join(CHAT_SESSIONS_DIR, sessionId);
      const sessionFile = path.join(sessionFolder, 'session.json');

      await fs.ensureDir(sessionFolder);
      await fs.writeJson(sessionFile, sessionData, { spaces: 2 });

      console.log(`Chat session created: ${sessionId}`);
      socket.emit('session_created', { sessionId, sessionData });

      // Notify receiver if they're online
      const receiverMachineId = userSessions.get(receiverUserId);
      if (receiverMachineId && activeConnections.has(receiverMachineId)) {
        const receiverSocket = activeConnections.get(receiverMachineId);
        receiverSocket.emit('new_chat_session', {
          sessionId,
          senderUserId,
          message: `New chat session from ${senderUserId}`
        });
      }
    } catch (error) {
      console.error('Error creating chat session:', error);
      socket.emit('session_error', { message: 'Failed to create chat session' });
    }
  });

  // Handle sending messages
  socket.on('send_message', async (data) => {
    const { sessionId, senderUserId, receiverUserId, message, machineId } = data;

    if (!sessionId || !senderUserId || !receiverUserId || !message || !machineId) {
      socket.emit('message_error', { message: 'All fields are required' });
      return;
    }

    try {
      const sessionFile = path.join(CHAT_SESSIONS_DIR, sessionId, 'session.json');

      // Check if session exists
      if (!await fs.pathExists(sessionFile)) {
        socket.emit('message_error', { message: 'Chat session not found' });
        return;
      }

      // Read and update session
      const sessionData = await fs.readJson(sessionFile);
      const newMessage = {
        id: uuidv4(),
        senderUserId,
        receiverUserId,
        message,
        timestamp: new Date().toISOString(),
        machineId
      };

      sessionData.messages.push(newMessage);
      await fs.writeJson(sessionFile, sessionData, { spaces: 2 });

      // Notify sender of successful message
      socket.emit('message_sent', { messageId: newMessage.id, sessionId });

      // Try to push notification to receiver
      const receiverMachineId = userSessions.get(receiverUserId);
      if (receiverMachineId && activeConnections.has(receiverMachineId)) {
        const receiverSocket = activeConnections.get(receiverMachineId);
        receiverSocket.emit('new_message', {
          sessionId,
          message: newMessage,
          senderUserId
        });
        console.log(`Message pushed to ${receiverUserId} on machine ${receiverMachineId}`);
      } else {
        // Receiver is offline
        socket.emit('receiver_unavailable', {
          message: `${receiverUserId} is currently unavailable for messages`,
          receiverUserId
        });
        console.log(`Receiver ${receiverUserId} is offline`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', { message: 'Failed to send message' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Remove from active connections
    for (const [machineId, socketInstance] of activeConnections.entries()) {
      if (socketInstance === socket) {
        activeConnections.delete(machineId);

        // Remove from user sessions
        for (const [userId, userMachineId] of userSessions.entries()) {
          if (userMachineId === machineId) {
            userSessions.delete(userId);
            console.log(`User ${userId} disconnected from machine ${machineId}`);
            break;
          }
        }
        break;
      }
    }
  });
});

// REST API endpoints
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionFile = path.join(CHAT_SESSIONS_DIR, sessionId, 'session.json');

    if (!await fs.pathExists(sessionFile)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = await fs.readJson(sessionFile);
    res.json(sessionData);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.get('/api/users/:userId/sessions', async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = [];

    // Read all session folders
    const sessionFolders = await fs.readdir(CHAT_SESSIONS_DIR);

    for (const folder of sessionFolders) {
      const sessionFile = path.join(CHAT_SESSIONS_DIR, folder, 'session.json');
      if (await fs.pathExists(sessionFile)) {
        const sessionData = await fs.readJson(sessionFile);
        if (sessionData.participants.includes(userId)) {
          sessions.push({
            sessionId: sessionData.sessionId,
            participants: sessionData.participants,
            createdAt: sessionData.createdAt,
            lastMessage: sessionData.messages[sessionData.messages.length - 1] || null
          });
        }
      }
    }

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ error: 'Failed to fetch user sessions' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'Server is running',
    activeConnections: activeConnections.size,
    activeUsers: userSessions.size,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Chat sessions directory: ${CHAT_SESSIONS_DIR}`);
  console.log(`🌐 CORS origin: ${CORS_ORIGIN}`);
  console.log(`📝 Max message length: ${MAX_MESSAGE_LENGTH}`);
  console.log(`⏰ Session cleanup interval: ${SESSION_CLEANUP_INTERVAL / (1000 * 60 * 60)} hours`);
});
