export interface AuthUser {
  username: string;
  role: 'ADMIN';
}

export interface ApiProblem {
  title?: string;
  detail?: string;
  message?: string;
}

export interface DashboardSummary {
  rawMaterialTypes: number;
  productTypes: number;
  productUnits: number;
  salesCount: number;
}

export interface RawMaterial {
  id: number;
  name: string;
  description: string;
  unit: string;
  quantity: number;
  averageUnitCost: number;
  stockValue: number;
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  quantity: number;
  markupPercentage: number;
  sellingPrice: number;
  averageUnitCost: number;
  stockValue: number;
  recipe: ProductRecipeItem[];
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRecipeItem {
  rawMaterialId: number;
  rawMaterialName: string;
  unit: string;
  quantityPerUnit: number;
  availableQuantity: number;
  averageUnitCost: number;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER';

export interface Sale {
  id: number;
  saleNumber: string;
  saleDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  items: SaleItem[];
  createdAt: string;
}

export interface SaleItem {
  productId: number;
  productSku: string;
  productName: string;
  quantity: number;
  recommendedUnitPrice: number;
  unitPrice: number;
  unitCost: number;
  lineRevenue: number;
  lineCost: number;
  lineProfit: number;
}

export interface MonthlySalesReport {
  month: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  unitsSold: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
  averageSaleValue: number;
  paymentSummaries: MonthlySalesPaymentSummary[];
  dailySummaries: MonthlySalesDailySummary[];
  productSummaries: MonthlySalesProductSummary[];
  sales: MonthlySaleSummary[];
}

export interface MonthlySalesPaymentSummary {
  paymentMethod: PaymentMethod;
  salesCount: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySalesDailySummary {
  saleDate: string;
  salesCount: number;
  unitsSold: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySalesProductSummary {
  productId: number;
  productSku: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySaleSummary {
  id: number;
  saleNumber: string;
  saleDate: string;
  paymentMethod: PaymentMethod;
  productLines: number;
  unitsSold: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}
