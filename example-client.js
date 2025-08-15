const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const MACHINE_ID = 'example_machine_' + Math.random().toString(36).substr(2, 9);
const USER_ID = 'example_user_' + Math.random().toString(36).substr(2, 9);

// Connect to server
const socket = io(SERVER_URL);

console.log(`Connecting to server at ${SERVER_URL}`);
console.log(`Machine ID: ${MACHINE_ID}`);
console.log(`User ID: ${USER_ID}`);

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to server');

  // Register user after connection
  registerUser();
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

// Registration events
socket.on('registration_success', (data) => {
  console.log('✅ User registered:', data.message);

  // After registration, create a chat session
  setTimeout(() => {
    createChatSession();
  }, 1000);
});

socket.on('registration_error', (data) => {
  console.error('❌ Registration failed:', data.message);
});

// Session events
socket.on('session_created', (data) => {
  console.log('✅ Chat session created:', data.sessionId);

  // After session creation, send a message
  setTimeout(() => {
    sendMessage(data.sessionId);
  }, 1000);
});

socket.on('session_error', (data) => {
  console.error('❌ Session creation failed:', data.message);
});

socket.on('new_chat_session', (data) => {
  console.log('📨 New chat session invitation:', data.message);
});

// Message events
socket.on('message_sent', (data) => {
  console.log('✅ Message sent successfully:', data.messageId);
});

socket.on('message_error', (data) => {
  console.error('❌ Message sending failed:', data.message);
});

socket.on('receiver_unavailable', (data) => {
  console.log('⚠️ Receiver unavailable:', data.message);
});

socket.on('new_message', (data) => {
  console.log('📨 New message received:', {
    sessionId: data.sessionId,
    sender: data.senderUserId,
    message: data.message.message
  });
});

// Functions
function registerUser() {
  console.log('🔐 Registering user...');
  socket.emit('register_user', {
    machineId: MACHINE_ID,
    userId: USER_ID
  });
}

function createChatSession() {
  const receiverUserId = 'receiver_user_' + Math.random().toString(36).substr(2, 9);
  console.log('💬 Creating chat session with:', receiverUserId);

  socket.emit('create_chat_session', {
    machineId: MACHINE_ID,
    senderUserId: USER_ID,
    receiverUserId: receiverUserId
  });
}

function sendMessage(sessionId) {
  const message = `Hello from ${USER_ID}! This is a test message sent at ${new Date().toLocaleTimeString()}`;
  console.log('📤 Sending message:', message);

  socket.emit('send_message', {
    sessionId: sessionId,
    machineId: MACHINE_ID,
    senderUserId: USER_ID,
    receiverUserId: 'receiver_user_example', // This should match the one from createChatSession
    message: message
  });
}

// Error handling
socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down client...');
  socket.disconnect();
  process.exit(0);
});

// Keep the process alive
console.log('Press Ctrl+C to exit');
