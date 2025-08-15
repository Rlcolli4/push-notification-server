# Server Configuration

The push notification server can be configured using environment variables. All configuration values have sensible defaults and are optional.

## Environment Variables

### `PORT`
- **Default**: `3000`
- **Description**: The port on which the server will listen
- **Example**: `PORT=8080`

### `CHAT_SESSIONS_DIR`
- **Default**: `./chat_sessions` (relative to server.js)
- **Description**: Directory where chat sessions and messages are stored
- **Example**: `CHAT_SESSIONS_DIR=/var/chat_sessions`
- **Production Note**: Use absolute paths for production deployments

### `CORS_ORIGIN`
- **Default**: `*` (allows all origins)
- **Description**: CORS origin setting for cross-origin requests
- **Example**: `CORS_ORIGIN=https://yourdomain.com`
- **Production Note**: Restrict this to your actual domain for security

### `MAX_MESSAGE_LENGTH`
- **Default**: `1000`
- **Description**: Maximum allowed message length in characters
- **Example**: `MAX_MESSAGE_LENGTH=500`

### `SESSION_CLEANUP_INTERVAL`
- **Default**: `86400000` (24 hours in milliseconds)
- **Description**: How often to clean up old sessions
- **Example**: `SESSION_CLEANUP_INTERVAL=3600000` (1 hour)
- **Note**: Set to `0` to disable automatic cleanup

## Usage Examples

### Basic Development
```bash
node server.js
```

### Custom Port
```bash
PORT=8080 node server.js
```

### Custom Chat Sessions Directory
```bash
CHAT_SESSIONS_DIR=/tmp/chat_sessions node server.js
```

### Production Configuration
```bash
PORT=8080 \
CHAT_SESSIONS_DIR=/var/chat_sessions \
CORS_ORIGIN=https://yourdomain.com \
MAX_MESSAGE_LENGTH=500 \
SESSION_CLEANUP_INTERVAL=3600000 \
node server.js
```

### Using .env file (if you have dotenv installed)
Create a `.env` file in your project root:
```env
PORT=8080
CHAT_SESSIONS_DIR=/var/chat_sessions
CORS_ORIGIN=https://yourdomain.com
MAX_MESSAGE_LENGTH=500
SESSION_CLEANUP_INTERVAL=3600000
```

Then run:
```bash
node server.js
```

## File Structure
```
project-root/
├── server.js
├── CONFIG.md
├── chat_sessions/          # Default sessions directory
│   ├── session-id-1/
│   │   └── session.json
│   └── session-id-2/
│       └── session.json
└── public/
    └── index.html
```

## Security Considerations

1. **CORS Origin**: In production, restrict `CORS_ORIGIN` to your actual domain
2. **Chat Sessions Directory**: Use absolute paths and ensure proper file permissions
3. **Port**: Avoid using privileged ports (below 1024) unless necessary
4. **Message Length**: Set reasonable limits to prevent abuse

## Troubleshooting

- **Permission Denied**: Ensure the `CHAT_SESSIONS_DIR` is writable by the Node.js process
- **Port Already in Use**: Change the `PORT` environment variable
- **CORS Issues**: Verify the `CORS_ORIGIN` setting matches your frontend domain
