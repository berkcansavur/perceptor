import { Order } from "../models/Order";

export class PricingService {
  calculateTotal(order: Order): number {
    return order.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
  }
}
