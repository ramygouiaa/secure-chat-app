import { FileServer } from "./FileServer.js";
import { SignalingServer } from "./SignalingServer.js";
import { MessageHandler } from "./MessageHandler.js";
import { config } from "./config.js";

const fileServer = new FileServer();
const server = fileServer.create();

const messageHandler = new MessageHandler();
const signalingServer = new SignalingServer(server, messageHandler);
messageHandler.signalingServer = signalingServer;

server.listen(config.port, () => {
  console.log(
    `Server running on http://localhost:${
      config.port
    } at ${new Date().toISOString()}`
  );
});

signalingServer.start();

process.on("SIGINT", () => {
  signalingServer.shutdown();
});
