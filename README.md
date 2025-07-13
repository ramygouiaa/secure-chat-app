# SecureChat - Refactored Application

A secure, real-time chat application with end-to-end encrypted video and voice calls, built with modern JavaScript architecture following SOLID principles.

## 🚀 Features

- **End-to-End Encryption** - All communications protected with Web Crypto API
- **Real-Time Communication** - WebRTC for P2P with WebSocket fallback
- **Video & Voice Calls** - High-quality multimedia communication
- **File Sharing** - Secure file transfer with chunked uploads
- **Voice Messages** - Record and send voice messages
- **Modern Architecture** - SOLID principles, dependency injection, and modular design
- **Comprehensive Testing** - Unit and integration tests included
- **Responsive Design** - Works on desktop and mobile devices

## 🏗️ Architecture

### Key Principles

- **SOLID Principles** - Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **Modular Design** - Clear separation between services, controllers, and utilities
- **Event-Driven** - Loose coupling through centralized event system
- **State Management** - Redux-like pattern for predictable state updates
- **Error Handling** - Centralized error management with graceful recovery

### Project Structure

```
/app/
├── index.html                 # Application entry point
├── src/
│   ├── Application.js         # Main application orchestrator
│   ├── main.js               # Entry point with initialization
│   ├── core/                 # Core framework
│   │   ├── interfaces.js     # Base interfaces and contracts
│   │   ├── config/           # Configuration management
│   │   ├── state/            # State management system
│   │   ├── events/           # Event bus implementation
│   │   └── errors/           # Error handling system
│   ├── services/             # Business logic services
│   │   ├── crypto/           # Encryption and cryptography
│   │   ├── storage/          # Data persistence
│   │   ├── signaling/        # WebSocket communication
│   │   └── webrtc/           # P2P communication
│   ├── ui/
│   │   └── controllers/      # UI controllers
│   ├── utils/                # Utility functions
│   └── tests/                # Test suites
└── signaling-server.js       # Node.js WebSocket server
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 14+ 
- Modern web browser with WebRTC support
- HTTPS (required for WebRTC features)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ramygouiaa/secure-chat-app.git
   cd secure-chat-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open the application:**
   Navigate to `http://localhost:3000` in two separate browser tabs to test the chat between two users.

## 🧪 Testing

The application includes comprehensive test suites for unit and integration testing.

### Running Tests

Open the browser console and use the test runner:

```javascript
// Run all tests
window.SecureChatTests.runAll();

// Run specific test suite
window.SecureChatTests.runSuite("StateManager");
window.SecureChatTests.runSuite("EventBus");
window.SecureChatTests.runSuite("Application");

// Run individual test categories
window.SecureChatTests.StateManager();
window.SecureChatTests.EventBus();
window.SecureChatTests.Application();
```

### Test Coverage

- **Unit Tests** - Individual component testing
  - StateManager functionality
  - EventBus operations
  - Service implementations
- **Integration Tests** - Component interaction testing
  - Application initialization
  - Service coordination
  - Controller integration

## 🔧 Configuration

### Application Configuration

Modify `src/core/config/AppConfig.js` to customize:

```javascript
{
  webrtc: {
    iceServers: [...],           // STUN/TURN servers
    connectionTimeout: 15000     // Connection timeout
  },
  websocket: {
    reconnectDelay: 3000        // Reconnection delay
  },
  encryption: {
    algorithm: "ECDH",          // Encryption algorithm
    namedCurve: "P-256"         // Curve for key generation
  }
}
```

### Environment Variables

Set environment-specific configurations:

- `NODE_ENV` - Set to 'production' for production builds
- `PORT` - Server port (default: 3000)

## 🏛️ Architecture Deep Dive

### Services Layer

**EncryptionService** - Handles all cryptographic operations
```javascript
const encryptionService = app.getService('encryption');
await encryptionService.encryptMessage(data, targetId);
```

**WebRTCService** - Manages P2P connections
```javascript
const webrtcService = app.getService('webrtc');
await webrtcService.connect(targetId);
```

**SignalingService** - WebSocket communication
```javascript
const signalingService = app.getService('signaling');
await signalingService.sendMessage(message);
```

**StorageService** - Data persistence
```javascript
const storageService = app.getService('storage');
await storageService.save(key, data);
```

### State Management

Centralized state with Redux-like patterns:

```javascript
// Update state
stateManager.dispatch('ADD_MESSAGE', {
  chatId: 'chat1',
  message: messageData
});

// Subscribe to changes
stateManager.subscribe((state) => {
  console.log('State updated:', state);
});
```

### Event System

Decoupled communication through events:

```javascript
// Emit events
eventBus.emit('webrtc:connected', { targetId });

// Listen to events
eventBus.on('webrtc:connected', (data) => {
  console.log('Connected to:', data.targetId);
});
```

## 🔒 Security Features

### End-to-End Encryption

- **ECDH Key Exchange** - Secure key establishment
- **AES-GCM Encryption** - Message and file encryption
- **Perfect Forward Secrecy** - New keys for each session
- **No Server-Side Decryption** - Only clients can decrypt messages

### WebRTC Security

- **DTLS** - Encrypted P2P communication
- **SRTP** - Secure media streams
- **ICE** - NAT traversal with security
- **Origin Validation** - Prevents unauthorized connections

## 🚀 Deployment

### Production Deployment

1. **Build for production:**
   ```bash
   NODE_ENV=production npm start
   ```

2. **HTTPS Setup:**
   WebRTC requires HTTPS in production. Configure your web server with SSL certificates.

3. **TURN Server:**
   For production use, configure your own TURN server in `AppConfig.js`.

### Docker Deployment

```dockerfile
FROM node:14-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Follow the architecture patterns
4. Write tests for new functionality
5. Submit a pull request

### Code Guidelines

- **Services** - Business logic only
- **Controllers** - UI management only  
- **Utils** - Pure functions only
- **Tests** - Cover new functionality
- **Documentation** - Update relevant docs

### Adding New Features

1. **Create a Service:**
   ```javascript
   export class NewFeatureService extends IService {
     async initialize() {
       // Service initialization
     }
   }
   ```

2. **Register in Application:**
   ```javascript
   const newService = new NewFeatureService();
   this.services.set('newFeature', newService);
   ```

3. **Create Controller (if needed):**
   ```javascript
   export class NewFeatureController extends IUIController {
     async render(data) {
       // UI rendering logic
     }
   }
   ```

4. **Write Tests:**
   ```javascript
   runner.test('NewFeature works correctly', () => {
     // Test implementation
   });
   ```

## 📝 API Reference

### Application API

```javascript
const app = new Application();

// Lifecycle
await app.initialize();
await app.cleanup();

// Services
const service = app.getService('serviceName');

// Controllers  
const controller = app.getController('controllerName');

// State
const state = app.getState();

// Info
const info = app.getInfo();
```

### Service APIs

Each service implements the `IService` interface:

```javascript
interface IService {
  async initialize();
  async destroy();
}
```

Specific service methods:

```javascript
// EncryptionService
await encryptionService.generateKeys();
await encryptionService.encryptMessage(data, targetId);
await encryptionService.decryptMessage(data, senderId);

// WebRTCService  
await webrtcService.connect(targetId);
await webrtcService.sendMessage(message);
await webrtcService.disconnect();

// StorageService
await storageService.save(key, data);
const data = await storageService.load(key);
await storageService.remove(key);
```

## 📋 Changelog

### Version 2.0.0 (Refactored)

**Major Changes:**
- Complete architecture refactor following SOLID principles
- Modular ES6 module system
- Dependency injection pattern
- Centralized state management
- Event-driven architecture
- Comprehensive error handling
- Full test suite implementation
- Improved TypeScript-like interfaces

**Improvements:**
- Better code organization and maintainability
- Enhanced error handling and recovery
- Improved performance and memory management
- Better developer experience with clear APIs
- Foundation for future feature development

**Breaking Changes:**
- Complete API restructure
- New file organization
- Updated configuration format

### Version 1.0.0 (Original)

- Basic WebRTC chat functionality
- End-to-end encryption
- File sharing capabilities
- Voice and video calls

## 🐛 Troubleshooting

### Common Issues

**WebRTC Connection Fails:**
- Check STUN/TURN server configuration
- Verify network connectivity
- Enable relay fallback mode

**Encryption Errors:**
- Ensure Web Crypto API support
- Check HTTPS requirements
- Verify key exchange process

**Audio/Video Issues:**
- Grant microphone/camera permissions
- Check device compatibility
- Verify media constraints

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('debug', 'securechat:*');
```

## 📄 License

ISC License - see LICENSE file for details.

## 👨‍💻 Author

**Ramy Gouiaa** - Original implementation and refactor

## 🙏 Acknowledgments

- WebRTC community for protocols and best practices
- Web Crypto API for encryption capabilities
- Modern JavaScript ecosystem for tooling and patterns

## 📞 Support

For support and questions:

- Create an issue on GitHub
- Check the troubleshooting section
- Review the documentation

---

**SecureChat** - Secure communication made simple and maintainable.