import type { SavedReceipt } from "./types";

export const demoReceipts: SavedReceipt[] = [
  {
    id: "demo-001",
    purchase_date: "2026-07-18",
    purchase_time: "18:42",
    merchant_name: "スーパーマーケット青空",
    total_amount: 3268,
    subtotal_amount: 3018,
    tax_8_base: 1850,
    tax_8_amount: 148,
    tax_10_base: 1020,
    tax_10_amount: 102,
    total_tax_amount: 250,
    currency: "JPY",
    notes: "デモデータ",
    image_url: "",
    created_at: "2026-07-18T09:43:00.000Z",
    items: [
      { name: "国産たまご 10個", quantity: 1, unit_price: 298, amount: 298, tax_rate: 8 },
      { name: "オリーブオイル", quantity: 1, unit_price: 798, amount: 798, tax_rate: 8 },
      { name: "キッチンペーパー", quantity: 2, unit_price: 510, amount: 1020, tax_rate: 10 }
    ]
  }
];
