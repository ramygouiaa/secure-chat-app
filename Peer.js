import crypto from "crypto";

export class Peer {
  constructor(ws) {
    this.ws = ws;
    this.id = crypto.randomUUID();
    this.name = null;
    this.status = "Online";
  }

  send(message) {
    if (this.ws.readyState === 1) {
      // WebSocket.OPEN
      this.ws.send(JSON.stringify(message));
    }
  }
}
