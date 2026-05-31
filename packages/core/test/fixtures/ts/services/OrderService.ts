import { OrderRepository } from "../repositories/OrderRepository";
import { Order } from "../models/Order";

export class OrderService {
  constructor(private readonly orderRepository: OrderRepository) {}

  public place(order: Order): void {
    this.orderRepository.save(order);
  }
}
