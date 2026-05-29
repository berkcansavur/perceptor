export interface OrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export class Order {
  constructor(
    public readonly id: string,
    public readonly items: OrderItem[]
  ) {}
}
