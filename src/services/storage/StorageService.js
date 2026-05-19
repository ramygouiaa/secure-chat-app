import { IStorageService } from "../../core/interfaces.js";
import { appConfig } from "../../core/config/AppConfig.js";

export class StorageService extends IStorageService {
  constructor() {
    super();
    this.prefix = appConfig.get("storage.prefix");
  }

  async initialize() {
    if (!this.isStorageAvailable()) {
      throw new Error("Local storage is not available");
    }
  }

  async save(key, data) {
    const fullKey = `${this.prefix}${key}`;
    localStorage.setItem(fullKey, JSON.stringify(data));
  }

  async load(key) {
    const fullKey = `${this.prefix}${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : null;
  }

  async remove(key) {
    const fullKey = `${this.prefix}${key}`;
    localStorage.removeItem(fullKey);
  }

  isStorageAvailable() {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async destroy() {
    // Optional cleanup
  }
}
