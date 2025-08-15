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

// Online users tracking file path
const ONLINE_USERS_FILE = path.join(CHAT_SESSIONS_DIR, 'online_users.json');

// Function to manage online users
async function updateOnlineUsers(userId, machineId, socketId, isOnline) {
  try {
    let onlineUsers = {};

    // Read existing online users if file exists
    if (await fs.pathExists(ONLINE_USERS_FILE)) {
      onlineUsers = await fs.readJson(ONLINE_USERS_FILE);
    }

    if (isOnline) {
      // Add/update user as online
      onlineUsers[userId] = {
        machineId,
        socketId,
        lastSeen: new Date().toISOString(),
        status: 'online'
      };
    } else {
      // Remove user from online list
      delete onlineUsers[userId];
    }

    // Write updated online users to file
    await fs.writeJson(ONLINE_USERS_FILE, onlineUsers, { spaces: 2 });

    return onlineUsers;
  } catch (error) {
    console.error('Error updating online users:', error);
    return {};
  }
}

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

  // Handle user registration (getting online)
  socket.on('register_user', async (data) => {
    const { machineId, userId } = data;

    console.log('🌐 User getting online:', data);
    console.log('🔌 Socket ID:', socket.id);

    if (!machineId || !userId) {
      console.log('❌ Registration validation failed');
      socket.emit('registration_error', { message: 'Machine ID and User ID are required' });
      return;
    }

    try {
      // Store the connection
      activeConnections.set(machineId, socket);
      userSessions.set(userId, machineId);

      // Update online users tracking
      await updateOnlineUsers(userId, machineId, socket.id, true);

      console.log(`✅ User ${userId} is now online on machine ${machineId}`);
      console.log(`📊 Active connections: ${activeConnections.size}, Active users: ${userSessions.size}`);
      socket.emit('registration_success', { message: 'You are now online and can receive messages' });
    } catch (error) {
      console.error('Error getting user online:', error);
      socket.emit('registration_error', { message: 'Failed to get online. Please try again.' });
    }
  });

  // Handle chat session creation
  socket.on('create_chat_session', async (data) => {
    const { machineId, senderUserId, receiverUserId } = data;

    if (!machineId || !senderUserId || !receiverUserId) {
      socket.emit('session_error', { message: 'Machine ID, Sender User ID, and Receiver User ID are required' });
      return;
    }

    try {
      // Check if receiver is online by reading the online users file
      let receiverOnline = false;
      let receiverSocketId = null;

      if (await fs.pathExists(ONLINE_USERS_FILE)) {
        const onlineUsers = await fs.readJson(ONLINE_USERS_FILE);
        if (onlineUsers[receiverUserId] && onlineUsers[receiverUserId].status === 'online') {
          receiverOnline = true;
          receiverSocketId = onlineUsers[receiverUserId].socketId;
        }
      }

      if (!receiverOnline) {
        socket.emit('session_error', {
          message: `${receiverUserId} is not currently online. They need to get online first to receive messages.`
        });
        return;
      }

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
      socket.emit('session_created', {
        sessionId,
        sessionData,
        message: `Connected to ${receiverUserId}! They are online and ready to receive messages.`
      });

      // Notify receiver about the new chat session
      const receiverMachineId = userSessions.get(receiverUserId);
      if (receiverMachineId && activeConnections.has(receiverMachineId)) {
        const receiverSocket = activeConnections.get(receiverMachineId);
        receiverSocket.emit('new_chat_session', {
          sessionId,
          senderUserId,
          message: `${senderUserId} wants to start a chat with you!`
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

  // Handle user log off
  socket.on('log_off', async (data) => {
    const { machineId, userId } = data;

    if (!machineId || !userId) {
      socket.emit('log_off_error', { message: 'Machine ID and User ID are required' });
      return;
    }

    try {
      console.log(`🚪 User ${userId} logging off from machine ${machineId}`);

      // Find active chat sessions for this user
      const userChatSessions = [];
      const sessionFolders = await fs.readdir(CHAT_SESSIONS_DIR);

      for (const folder of sessionFolders) {
        if (folder === 'online_users.json') continue; // Skip the online users file

        const sessionFile = path.join(CHAT_SESSIONS_DIR, folder, 'session.json');
        if (await fs.pathExists(sessionFile)) {
          const sessionData = await fs.readJson(sessionFile);
          if (sessionData.participants.includes(userId)) {
            userChatSessions.push(sessionData);
          }
        }
      }

      // Send offline notification to other participants in active sessions
      for (const session of userChatSessions) {
        const otherParticipants = session.participants.filter(p => p !== userId);

        for (const participantId of otherParticipants) {
          const participantMachineId = userSessions.get(participantId);
          if (participantMachineId && activeConnections.has(participantMachineId)) {
            const participantSocket = activeConnections.get(participantMachineId);

            // Add offline message to the session
            const offlineMessage = {
              id: uuidv4(),
              senderUserId: 'System',
              receiverUserId: participantId,
              message: `${userId} has gone offline`,
              timestamp: new Date().toISOString(),
              machineId: 'system',
              type: 'system'
            };

            session.messages.push(offlineMessage);
            await fs.writeJson(path.join(CHAT_SESSIONS_DIR, session.sessionId, 'session.json'), session, { spaces: 2 });

            // Notify the other participant
            participantSocket.emit('new_message', {
              sessionId: session.sessionId,
              message: offlineMessage,
              senderUserId: 'System'
            });

            console.log(`Notified ${participantId} that ${userId} went offline`);
          }
        }
      }

      // Remove user from online users file
      await updateOnlineUsers(userId, machineId, socket.id, false);

      // Remove from active connections and user sessions
      activeConnections.delete(machineId);
      userSessions.delete(userId);

      console.log(`✅ User ${userId} successfully logged off from machine ${machineId}`);
      socket.emit('log_off_success', {
        message: 'Successfully logged off',
        userId,
        machineId
      });

    } catch (error) {
      console.error('Error during log off:', error);
      socket.emit('log_off_error', { message: 'Failed to log off. Please try again.' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);

    // Remove from active connections
    for (const [machineId, socketInstance] of activeConnections.entries()) {
      if (socketInstance === socket) {
        activeConnections.delete(machineId);

        // Remove from user sessions and online users
        for (const [userId, userMachineId] of userSessions.entries()) {
          if (userMachineId === machineId) {
            userSessions.delete(userId);

            // Remove user from online users file
            try {
              await updateOnlineUsers(userId, machineId, socket.id, false);
              console.log(`User ${userId} went offline from machine ${machineId}`);
            } catch (error) {
              console.error(`Error updating online status for ${userId}:`, error);
            }
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

app.get('/api/online-users', async (req, res) => {
  try {
    if (await fs.pathExists(ONLINE_USERS_FILE)) {
      const onlineUsers = await fs.readJson(ONLINE_USERS_FILE);
      res.json(onlineUsers);
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Chat sessions directory: ${CHAT_SESSIONS_DIR}`);
  console.log(`👥 Online users file: ${ONLINE_USERS_FILE}`);
  console.log(`🌐 CORS origin: ${CORS_ORIGIN}`);
  console.log(`📝 Max message length: ${MAX_MESSAGE_LENGTH}`);
  console.log(`⏰ Session cleanup interval: ${SESSION_CLEANUP_INTERVAL / (1000 * 60 * 60)} hours`);
});
