import { OrderType } from "./OrderType";

export class Order {
  public id: string = "";
  public type: OrderType = OrderType.Market;
}
