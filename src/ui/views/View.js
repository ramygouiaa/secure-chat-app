export class View {
  constructor(selector) {
    this.element = document.querySelector(selector);
  }

  show() {
    this.element.classList.remove("hidden");
  }

  hide() {
    this.element.classList.add("hidden");
  }

  on(event, handler) {
    this.element.addEventListener(event, handler);
  }

  off(event, handler) {
    this.element.removeEventListener(event, handler);
  }
}
