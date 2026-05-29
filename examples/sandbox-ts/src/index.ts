import { Order } from "./models/Order";
import { OrderRepository } from "./repositories/OrderRepository";
import { PricingService } from "./services/PricingService";
import { OrderService } from "./services/OrderService";

const orderService = new OrderService(new OrderRepository(), new PricingService());
const total = orderService.placeOrder(
  new Order("o-1", [{ sku: "A", quantity: 2, unitPrice: 50 }])
);

console.log(`order total: ${total}`);
