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
  advertisingCostPerUnit: number;
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
export type SaleStatus = 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'CANCELLED';
export type SaleReturnType = 'RETURN' | 'CANCELLATION';

export interface Sale {
  id: number;
  saleNumber: string;
  saleDate: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  notes: string;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  refundedRevenue: number;
  returnedCost: number;
  reversedGrossProfit: number;
  netRevenue: number;
  netCost: number;
  netGrossProfit: number;
  items: SaleItem[];
  returns: SaleReturn[];
  createdAt: string;
}

export interface SaleItem {
  id: number;
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
  returnedQuantity: number;
}

export interface SaleReturn {
  id: number;
  returnNumber: string;
  returnDate: string;
  operationType: SaleReturnType;
  reason: string;
  notes: string;
  totalRefund: number;
  totalCost: number;
  grossProfitReversal: number;
  items: SaleReturnItem[];
  createdAt: string;
}

export interface SaleReturnItem {
  saleItemId: number;
  productId: number;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineRefund: number;
  lineCost: number;
  grossProfitReversal: number;
}

export interface MonthlySalesReport {
  month: string;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  returnCount: number;
  unitsSold: number;
  unitsReturned: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  grossCost: number;
  returnedCost: number;
  totalCost: number;
  grossProfit: number;
  averageSaleValue: number;
  paymentSummaries: MonthlySalesPaymentSummary[];
  dailySummaries: MonthlySalesDailySummary[];
  productSummaries: MonthlySalesProductSummary[];
  sales: MonthlySaleSummary[];
  returns: MonthlyReturnSummary[];
}

export interface MonthlySalesPaymentSummary {
  paymentMethod: PaymentMethod;
  salesCount: number;
  returnCount: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySalesDailySummary {
  saleDate: string;
  salesCount: number;
  returnCount: number;
  unitsSold: number;
  unitsReturned: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySalesProductSummary {
  productId: number;
  productSku: string;
  productName: string;
  quantitySold: number;
  quantityReturned: number;
  netQuantity: number;
  grossRevenue: number;
  refunds: number;
  revenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlySaleSummary {
  id: number;
  saleNumber: string;
  saleDate: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  productLines: number;
  unitsSold: number;
  revenue: number;
  refunds: number;
  netRevenue: number;
  totalCost: number;
  grossProfit: number;
}

export interface MonthlyReturnSummary {
  id: number;
  returnNumber: string;
  operationType: SaleReturnType;
  saleId: number;
  saleNumber: string;
  returnDate: string;
  paymentMethod: PaymentMethod;
  unitsReturned: number;
  refund: number;
  returnedCost: number;
  grossProfitReversal: number;
}
