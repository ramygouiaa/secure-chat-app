# Secure Chat App

This is a secure, real-time chat application that supports text messaging, file sharing, and end-to-end encrypted video and voice calls. It uses a Node.js server for signaling and serves the front-end application.

## Features

- **End-to-End Encryption:** All communications, including text, files, video, and voice, are end-to-end encrypted using the Web Crypto API.
- **Real-Time Communication:** Uses WebSockets for signaling and WebRTC for peer-to-peer communication.
- **Video and Voice Calls:** High-quality video and voice calls with a simple and intuitive interface.
- **File Sharing:** Securely share files with other users.
- **Refactored Codebase:** The front-end JavaScript has been refactored into modules for better readability and maintenance.

## How to Use

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ramygouiaa/secure-chat-app.git
    cd secure-chat-app
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the application:**

    ```bash
    npm start
    ```

4.  **Open the application in your browser:**
    Navigate to `http://localhost:3000` in two separate browser tabs to simulate a chat between two users.

## Deployment

This application is ready to be deployed on any platform that supports Node.js, such as Render, Heroku, or a custom server. The server is configured to serve the front-end files and will use the `PORT` environment variable if it is available.
