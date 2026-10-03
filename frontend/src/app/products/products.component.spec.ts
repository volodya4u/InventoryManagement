import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Product, ProductRecipeItem, RawMaterial } from '../core/models';
import { ProductsComponent } from './products.component';

describe('ProductsComponent amounts', () => {
  let component: ProductsComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(ProductsComponent).componentInstance;
  });

  function rawMaterial(overrides: Partial<RawMaterial>): RawMaterial {
    return {
      id: 1,
      name: 'Red Rose',
      description: '',
      unit: 'PIECE',
      quantity: 100,
      averageUnitCost: 0,
      stockValue: 0,
      hasImage: false,
      unitChangeable: false,
      createdAt: '2026-10-01T09:00:00Z',
      updatedAt: '2026-10-01T09:00:00Z',
      ...overrides,
    };
  }

  function recipeItem(overrides: Partial<ProductRecipeItem>): ProductRecipeItem {
    return {
      rawMaterialId: 1,
      rawMaterialName: 'Red Rose',
      unit: 'PIECE',
      quantityPerUnit: 1,
      availableQuantity: 100,
      averageUnitCost: 0,
      ...overrides,
    };
  }

  function product(overrides: Partial<Product>): Product {
    return {
      id: 1,
      sku: 'ROSE-BOUQUET',
      name: 'Rose Bouquet',
      description: '',
      quantity: 10,
      markupPercentage: 0,
      advertisingCostPerUnit: 0,
      sellingPrice: 0,
      averageUnitCost: 0,
      stockValue: 0,
      recipe: [],
      hasImage: false,
      createdAt: '2026-10-01T09:00:00Z',
      updatedAt: '2026-10-01T09:00:00Z',
      ...overrides,
    };
  }

  it('estimates the unit cost of a recipe without floating-point drift', () => {
    component.rawMaterials.set([
      rawMaterial({ id: 1, averageUnitCost: 0.4 }),
      rawMaterial({ id: 2, averageUnitCost: 0.1 }),
    ]);
    component.openCreate();
    component.addRecipeItem();
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit: 1.5 });
    component.recipeControls[1].setValue({ rawMaterialId: 2, quantityPerUnit: 1 });
    component.form.controls.advertisingCostPerUnit.setValue(0.2);

    expect(component.estimatedRecipeUnitCost()).toBe(0.7);
    expect(component.estimatedTotalUnitCost()).toBe(0.9);
  });

  it('previews the selling price the server calculates', () => {
    component.rawMaterials.set([rawMaterial({ id: 1, averageUnitCost: 0.73 })]);
    component.openCreate();
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit: 2 });
    component.form.controls.markupPercentage.setValue(75);

    // 1.46 * 1.75 is exactly 2.555, which the server rounds half up.
    expect(component.calculatedSellingPrice()).toBe(2.56);
  });

  it('costs a production run without floating-point drift', () => {
    component.rawMaterials.set([
      rawMaterial({ id: 1, averageUnitCost: 1.1 }),
      rawMaterial({ id: 2, averageUnitCost: 0.1 }),
    ]);
    component.openProduction(
      product({
        advertisingCostPerUnit: 0.2,
        recipe: [
          recipeItem({ rawMaterialId: 1, quantityPerUnit: 0.5 }),
          recipeItem({ rawMaterialId: 2, quantityPerUnit: 1 }),
        ],
      }),
    );
    component.productionForm.controls.quantity.setValue(3);

    expect(component.productionRequirements().map((requirement) => requirement.cost)).toEqual([
      1.65, 0.3,
    ]);
    expect(component.estimatedMaterialsProductionCost()).toBe(1.95);
    expect(component.estimatedAdvertisingProductionCost()).toBe(0.6);
    expect(component.estimatedProductionCost()).toBe(2.55);
  });

  it('values stock without floating-point drift', () => {
    component.openStockOperation(product({ quantity: 10, averageUnitCost: 1.1 }), 'WRITE_OFF');
    component.stockOperationForm.controls.quantity.setValue(3);
    expect(component.stockValueChange()).toBe(3.3);

    component.openCreate();
    component.form.patchValue({ quantity: 3, initialUnitCost: 1.1 });
    expect(component.initialStockValue()).toBe(3.3);

    component.items.set([product({ id: 1, stockValue: 0.1 }), product({ id: 2, stockValue: 0.2 })]);
    expect(component.totalStockValue()).toBe(0.3);
  });
});
