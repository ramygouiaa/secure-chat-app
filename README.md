<img width="797" height="544" alt="Screenshot 2026-05-18 at 18 39 27" src="https://github.com/user-attachments/assets/e279f632-048f-4ec1-9219-78ec7fc0c343" />
<img width="786" height="695" alt="Screenshot 2026-05-18 at 18 41 00" src="https://github.com/user-attachments/assets/8494db33-caca-41ab-a13f-6ad89c22c337" />


# Secure Chat App

This is a secure, real-time chat application that supports text messaging, file sharing, and end-to-end encrypted video and voice calls. It uses a Node.js server for signaling and serves the front-end application.

## Features

- **End-to-End Encryption:** All communications, including text, files, video, and voice, are end-to-end encrypted using the Web Crypto API.
- **Real-Time Communication:** Uses WebSockets for signaling and WebRTC for peer-to-peer communication.
- **Video and Voice Calls:** High-quality video and voice calls with a simple and intuitive interface.
- **File Sharing:** Securely share files with other users.

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
