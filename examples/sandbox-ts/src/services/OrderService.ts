import { Order } from "../models/Order";
import { OrderRepository } from "../repositories/OrderRepository";
import { PricingService } from "./PricingService";

export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly pricingService: PricingService
  ) {}

  placeOrder(order: Order): number {
    this.orderRepository.save(order);
    return this.pricingService.calculateTotal(order);
  }
}
