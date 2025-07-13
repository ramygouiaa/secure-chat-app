import { View } from "./View.js";
import { appConfig } from "../../core/config/AppConfig.js";
import { escapeHtml } from "../../utils/helpers.js";

export class ContactListView extends View {
  constructor() {
    super("#contactsList");
  }

  render(peers, clientId) {
    this.element.innerHTML = "";
    peers.forEach((peer) => {
      if (peer.id !== clientId) {
        const item = this.createContactItem(peer);
        this.element.appendChild(item);
      }
    });
  }

  createContactItem(peer) {
    const item = document.createElement("div");
    item.className =
      "contact-item flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer";
    item.dataset.id = peer.id;

    const statusColors = appConfig.get("ui.statusColors");
    const statusColor = statusColors[peer.status] || statusColors.Offline;

    item.innerHTML = `
      <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
        <span class="text-white text-sm">${peer.name.charAt(0)}</span>
      </div>
      <div class="flex-1">
        <div class="text-sm font-medium">${escapeHtml(peer.name)}</div>
        <div class="text-xs text-gray-400">${peer.status || "Offline"}</div>
      </div>
      <div class="w-2 h-2 ${statusColor} rounded-full"></div>
    `;

    return item;
  }
}
