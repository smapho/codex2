export type TaxRate = 8 | 10 | 0;

export type ReceiptItem = {
  name: string;
  quantity: number;
  unit_price: number | null;
  amount: number;
  tax_rate: TaxRate;
};

export type ReceiptAnalysis = {
  purchase_date: string | null;
  purchase_time: string | null;
  merchant_name: string;
  total_amount: number;
  subtotal_amount: number | null;
  tax_8_base: number;
  tax_8_amount: number;
  tax_10_base: number;
  tax_10_amount: number;
  total_tax_amount: number;
  currency: "JPY";
  items: ReceiptItem[];
  notes: string | null;
};

export type SavedReceipt = ReceiptAnalysis & {
  id: string;
  image_url: string;
  created_at: string;
};
