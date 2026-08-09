import { create } from "zustand";
import { calculateLineItem, GlobalSettingsMap } from "../lib/calculator";

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  cifUsd: number;
  defaultProfitPct: number;
  // Calculated fields
  exWorksCost: number;
  totalCost: number;
  salesPrice: number;
  profitAmount: number;
}

interface QuoteState {
  customerName: string;
  deliveryType: string;
  incoterm: string;
  creditDays: number;
  items: QuoteItem[];
  settings: GlobalSettingsMap;

  // Actions
  setCustomerDetails: (details: Partial<QuoteState>) => void;
  addItem: (
    item: Omit<
      QuoteItem,
      "exWorksCost" | "totalCost" | "salesPrice" | "profitAmount"
    >,
  ) => void;
  updateItemQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
}

export const useQuoteStore = create<QuoteState>((set, get) => ({
  customerName: "",
  deliveryType: "Local",
  incoterm: "DDP",
  creditDays: 30,
  items: [],

  // Mocking settings for now until we connect Prisma
  settings: {
    usd_to_aed_conversion: 3.6725,
    annual_interest_rate: 0.1,
    tt_bank_flat_fee: 30,
  },

  setCustomerDetails: (details) => set(() => ({ ...details })),

  addItem: (newItem) =>
    set((state) => {
      const calculated = calculateLineItem(
        newItem,
        state.settings,
        state.creditDays,
      );
      return { items: [...state.items, { ...newItem, ...calculated }] };
    }),

  updateItemQty: (id, qty) =>
    set((state) => {
      const updatedItems = state.items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, qty };
          const calculated = calculateLineItem(
            updatedItem,
            state.settings,
            state.creditDays,
          );
          return { ...updatedItem, ...calculated };
        }
        return item;
      });
      return { items: updatedItems };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
}));
