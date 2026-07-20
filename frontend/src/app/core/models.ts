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
  price: number;
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
