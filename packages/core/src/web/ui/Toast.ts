import { byId } from "../dom";

export class Toast {
  private readonly element = byId("toast");
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string): void {
    this.element.textContent = message;
    this.element.classList.remove("hidden");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.element.classList.add("hidden"), 3500);
  }
}
