import { eventBus } from "../../core/events/EventBus.js";

export class ContactListView {
  constructor() {
    this.container = document.getElementById("contactsList");
  }

  render(peers, currentClientId) {
    if (!this.container) return;

    // Clear existing contacts
    this.container.innerHTML = "";

    // Filter out current user and render contacts
    const otherPeers = peers.filter((peer) => peer.id !== currentClientId);

    if (otherPeers.length === 0) {
      this.showEmptyState();
      return;
    }

    otherPeers.forEach((peer) => {
      const contactElement = this.createContactElement(peer);
      this.container.appendChild(contactElement);
    });

    console.log(`Contact list updated: ${otherPeers.length} contacts`);
  }

  showEmptyState() {
    this.container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <i class="fas fa-users text-3xl mb-2"></i>
        <p>No contacts online</p>
        <p class="text-sm">Share your ID with friends to start chatting</p>
      </div>
    `;
  }

  createContactElement(peer) {
    const div = document.createElement("div");
    div.className =
      "contact-item p-3 border-b border-gray-700 hover:bg-gray-700 cursor-pointer transition-colors";
    div.dataset.peerId = peer.id;

    const statusColor = this.getStatusColor(peer.status);

    div.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-3 h-3 rounded-full ${statusColor}"></div>
        <div class="flex-1">
          <div class="font-medium text-white">${peer.name || peer.id}</div>
          <div class="text-sm text-gray-400">${peer.status || "Online"}</div>
        </div>
        <div class="text-xs text-gray-500">
          <i class="fas fa-lock"></i>
        </div>
      </div>
    `;

    div.addEventListener("click", () => {
      // Visual feedback
      document.querySelectorAll(".contact-item").forEach((item) => {
        item.classList.remove("bg-gray-700");
      });
      div.classList.add("bg-gray-700");

      // Emit contact selection event
      eventBus.emit("ui:contact-selected", {
        id: peer.id,
        name: peer.name || peer.id,
      });
    });

    return div;
  }

  getStatusColor(status) {
    const colors = {
      Online: "bg-green-500",
      Away: "bg-yellow-500",
      "In call": "bg-red-500",
      "Do Not Disturb": "bg-orange-500",
      Offline: "bg-gray-500",
    };
    return colors[status] || "bg-green-500";
  }
}
