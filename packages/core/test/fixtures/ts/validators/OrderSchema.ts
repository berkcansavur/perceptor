import { OrderType } from "../models/OrderType";

export const OrderSchema = {
  validate: (type: OrderType): boolean => type === OrderType.Market,
};

export type OrderRequest = {
  type: OrderType;
};
