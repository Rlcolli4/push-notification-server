# Push Notification Chat Server

A Node.js server with Socket.IO that handles session-to-session chat between users with real-time push notifications.

This project was started as a personal learning opportunity using Cursor, AI, and various other tools.

## Features

- **Real-time Chat**: Instant messaging using Socket.IO
- **Session Management**: Create and manage chat sessions between users
- **Push Notifications**: Real-time delivery of messages to online users
- **Offline Handling**: Notifies senders when receivers are unavailable
- **Persistent Storage**: Chat sessions and messages stored in JSON files
- **Machine ID Tracking**: Unique identification for different devices/machines
- **REST API**: Additional endpoints for session management

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client A      │    │   Node.js        │    │   Client B      │
│   (Machine 1)   │◄──►│   Server         │◄──►│   (Machine 2)   │
│   User: Alice   │    │   + Socket.IO    │    │   User: Bob     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   File System    │
                       │   (chat_sessions)│
                       │   - session.json │
                       └──────────────────┘
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd push-notification-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

## Client Setup and Testing

### ⚠️ **Important: Proper Client Access**

The test client (`public/index.html`) **must be accessed through the Node.js server**, not opened directly from the file system. This is because:

1. **Socket.IO Library**: The client needs the Socket.IO client library (`/socket.io/socket.io.js`) which is served by the Node.js server
2. **CORS Requirements**: Direct file access (`file://` protocol) cannot make HTTP requests to `localhost:3000`
3. **WebSocket Connection**: Socket.IO requires a proper HTTP server to establish WebSocket connections

### 🚀 **Step-by-Step Client Setup**

#### **1. Start the Node.js Server**
```bash
# Navigate to project directory
cd push-notification-server

# Install dependencies (if not done already)
npm install

# Start the server in development mode
npm run dev

# Or start in production mode
npm start
```

**Expected Output:**
```
🚀 Push notification server starting...
📡 Server running on port 3000
🔌 Socket.IO server initialized
📁 Chat sessions directory: ./chat_sessions
✅ Server ready for connections
```

#### **2. Access the Test Client**
**❌ Don't do this:**
- Opening `public/index.html` directly in browser
- Using `file:///C:/path/to/index.html`

**✅ Do this instead:**
- Open your web browser
- Navigate to: `http://localhost:3000`
- The server will automatically serve the `index.html` file

#### **3. Establish Connection**
Once the client page loads:

1. **Check Server Status**: Click "Check Server Status" to verify the server is running
2. **Debug Connection**: Click "Debug Connection" to establish Socket.IO connection
3. **Verify Connection**: Status should show "Connected to server" in green
4. **Enable Features**: Action buttons will become enabled once connected

### 🔧 **Troubleshooting Client Connection**

#### **Common Issues and Solutions**

**Issue: "Socket.IO library not loaded"**
- **Cause**: Accessing the page directly from file system
- **Solution**: Access via `http://localhost:3000` instead

**Issue: "Failed to check server status"**
- **Cause**: Server not running or wrong port
- **Solution**: Ensure server is running with `npm run dev`

**Issue: "Socket Connection Failed"**
- **Cause**: Server running but Socket.IO not responding
- **Solution**: Check server console for errors, restart server

**Issue: "Connection refused"**
- **Cause**: Port 3000 already in use
- **Solution**: Change PORT environment variable or stop conflicting service

#### **Verification Steps**
```bash
# 1. Check if server is running
curl http://localhost:3000/api/status

# Expected response:
# {"status":"running","activeConnections":0,"activeUsers":0}

# 2. Check if Socket.IO endpoint is available
curl http://localhost:3000/socket.io/

# Expected response:
# 0{"sid":"...","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":5000}
```

### 🌐 **Testing with Multiple Clients**

To test the chat system between two users:

1. **Client A**: Open `http://localhost:3000` in Chrome
2. **Client B**: Open `http://localhost:3000` in Firefox (or different browser)
3. **Register Users**: Each client registers with different Machine ID and User ID
4. **Create Session**: Client A creates a chat session with Client B
5. **Send Messages**: Test real-time messaging between clients

### 📱 **Alternative Client Options**

#### **Node.js Client Script**
Use the included `example-client.js` for programmatic testing:
```bash
# Install socket.io-client if not present
npm install socket.io-client

# Run the example client
node example-client.js
```

#### **Custom Client Integration**
Integrate with your own application using the Socket.IO client:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to chat server');
});

socket.emit('register_user', {
  machineId: 'my_machine',
  userId: 'my_user'
});
```

## Usage

### 1. User Registration

Users must register with a unique machine ID and user ID:

```javascript
// Client-side registration
socket.emit('register_user', {
  machineId: 'machine_abc123',
  userId: 'user_alice'
});
```

### 2. Creating Chat Sessions

To start a chat session between two users:

```javascript
socket.emit('create_chat_session', {
  machineId: 'machine_abc123',
  senderUserId: 'user_alice',
  receiverUserId: 'user_bob'
});
```

This creates:
- A unique session ID (GUID)
- A folder structure: `chat_sessions/{sessionId}/session.json`
- Notifies the receiver if they're online

### 3. Sending Messages

Send messages within an existing session:

```javascript
socket.emit('send_message', {
  sessionId: 'session_guid_here',
  machineId: 'machine_abc123',
  senderUserId: 'user_alice',
  receiverUserId: 'user_bob',
  message: 'Hello, Bob!'
});
```

### 4. Real-time Notifications

The system automatically:
- Delivers messages to online receivers
- Notifies senders if receivers are offline
- Updates session files with new messages

## API Endpoints

### REST API

- `GET /api/status` - Server status and connection info
- `GET /api/sessions/:sessionId` - Get specific chat session
- `GET /api/users/:userId/sessions` - Get all sessions for a user

### Socket.IO Events

#### Client → Server
- `register_user` - Register a user on a machine
- `create_chat_session` - Create new chat session
- `send_message` - Send message in existing session

#### Server → Client
- `registration_success/error` - User registration result
- `session_created/error` - Session creation result
- `message_sent/error` - Message sending result
- `new_message` - Incoming message notification
- `receiver_unavailable` - Receiver offline notification
- `new_chat_session` - New session invitation

## File Structure

```
push-notification-server/
├── server.js                 # Main server file
├── package.json             # Dependencies and scripts
├── public/
│   └── index.html          # Test client interface
├── chat_sessions/          # Generated chat session storage
│   └── {sessionId}/
│       └── session.json    # Session data and messages
└── README.md               # This file
```

## Session Data Structure

Each chat session creates a `session.json` file:

```json
{
  "sessionId": "uuid-generated-id",
  "machineId": "machine_abc123",
  "senderUserId": "user_alice",
  "receiverUserId": "user_bob",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "messages": [
    {
      "id": "message-uuid",
      "senderUserId": "user_alice",
      "receiverUserId": "user_bob",
      "message": "Hello!",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "machineId": "machine_abc123"
    }
  ],
  "participants": ["user_alice", "user_bob"]
}
```

## Testing the System

1. **Open the test client**: Navigate to `http://localhost:3000` in your browser

2. **Test with two browsers/tabs**:
   - Register User A (e.g., Alice) with Machine ID 1
   - Register User B (e.g., Bob) with Machine ID 2
   - Create a chat session from Alice to Bob
   - Send messages between them

3. **Test offline behavior**:
   - Close one browser/tab
   - Try sending a message
   - Verify the "receiver unavailable" notification

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### Customization

- **Storage Path**: Modify `CHAT_SESSIONS_DIR` in `server.js`
- **CORS**: Adjust CORS settings in the Socket.IO configuration
- **Message Format**: Extend the message structure in the `send_message` handler

## Security Considerations

- The current implementation allows any origin (`origin: "*"`)
- In production, restrict CORS to specific domains
- Consider implementing authentication and authorization
- Validate and sanitize all incoming data
- Implement rate limiting for message sending

## Scaling Considerations

- **File Storage**: For production, consider using a database instead of file system
- **Memory**: Active connections are stored in memory; consider Redis for clustering
- **Load Balancing**: Use Socket.IO adapter for multiple server instances
- **Persistence**: Implement message queuing for offline users

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the PORT environment variable
2. **CORS errors**: Check browser console and adjust CORS settings
3. **Messages not delivered**: Verify both users are registered and connected
4. **File permission errors**: Ensure write permissions to the chat_sessions directory

### Debug Mode

Enable detailed logging by adding console.log statements or using a logging library like Winston.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
