import { Order } from "../models/Order";

export class OrderRepository {
  public last: Order = new Order();

  public save(order: Order): void {
    this.last = order;
  }
}
