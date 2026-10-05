import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Product, RawMaterial, ProductRecipeItem } from '../core/models';
import { ProductsComponent } from './products.component';

function rawMaterial(overrides: Partial<RawMaterial> = {}): RawMaterial {
  return {
    id: 1,
    name: 'Rose',
    description: '',
    unit: 'PIECE',
    quantity: 100,
    averageUnitCost: 2.5,
    stockValue: 250,
    reorderLevel: 0,
    belowReorderLevel: false,
    hasImage: false,
    unitChangeable: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'ROSE-BOX',
    name: 'Rose Box',
    description: 'Three roses',
    quantity: 5,
    markupPercentage: 50,
    advertisingCostPerUnit: 0,
    sellingPrice: 11.25,
    averageUnitCost: 7.5,
    stockValue: 37.5,
    recipe: [
      {
        rawMaterialId: 1,
        rawMaterialName: 'Rose',
        unit: 'PIECE',
        quantityPerUnit: 3,
        availableQuantity: 100,
        averageUnitCost: 2.5,
      },
    ],
    hasImage: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('ProductsComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<ProductsComponent>;
  let component: ProductsComponent;

  function setup(products: Product[], rawMaterials: RawMaterial[]): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushLoad(products, rawMaterials);
  }

  function flushLoad(products: Product[], rawMaterials: RawMaterial[]): void {
    requests.expectOne('/api/products').flush(products);
    requests.expectOne('/api/raw-materials').flush(rawMaterials);
    fixture.detectChanges();
  }

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
  });

  it('requires a recipe, and an initial unit cost when there is opening stock', () => {
    setup([], [rawMaterial()]);
    component.openCreate();
    component.form.controls.recipe.clear();
    component.form.updateValueAndValidity();
    expect(component.form.hasError('recipeRequired')).toBe(true);

    component.addRecipeItem();
    component.form.patchValue({ quantity: 5 });
    component.form.controls.initialUnitCost.setValue(null);
    component.form.updateValueAndValidity();
    expect(component.form.hasError('recipeRequired')).toBe(false);
    expect(component.form.hasError('initialUnitCostRequired')).toBe(true);
  });

  it('prices a new product from its recipe, advertising cost and markup', () => {
    setup([], [rawMaterial(), rawMaterial({ id: 2, name: 'Ribbon', averageUnitCost: 0.4 })]);
    component.openCreate();
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit: 3 });
    component.addRecipeItem();
    component.recipeControls[1].setValue({ rawMaterialId: 2, quantityPerUnit: 1.5 });
    component.form.patchValue({ advertisingCostPerUnit: 1.2, markupPercentage: 50 });

    expect(component.estimatedRecipeUnitCost()).toBeCloseTo(8.1, 10);
    expect(component.form.controls.initialUnitCost.value).toBe(9.3);
    expect(component.calculatedSellingPrice()).toBe(13.95);
  });

  it('counts production needs without floating-point drift', () => {
    const bouquet = product({
      recipe: [
        {
          rawMaterialId: 1,
          rawMaterialName: 'Rose',
          unit: 'PIECE',
          quantityPerUnit: 0.1,
          availableQuantity: 0.3,
          averageUnitCost: 10,
        },
      ],
    });
    setup([bouquet], [rawMaterial({ quantity: 0.3, averageUnitCost: 10 })]);
    component.openProduction(bouquet);
    expect(component.maximumProducible()).toBe(3);

    component.productionForm.controls.quantity.setValue(3);
    expect(component.productionRequirements()[0]).toMatchObject({
      required: 0.3,
      available: 0.3,
      missing: 0,
    });
    expect(component.hasProductionShortage()).toBe(false);

    component.productionForm.controls.quantity.setValue(4);
    expect(component.productionRequirements()[0].missing).toBe(0.1);
    expect(component.hasProductionShortage()).toBe(true);
    component.submitProduction();
    requests.expectNone({ method: 'POST', url: '/api/products/1/production' });
  });

  it('posts production when the materials are enough, then reloads', () => {
    setup([product()], [rawMaterial()]);
    component.openProduction(product());
    component.productionForm.patchValue({ quantity: 2, productionDate: '2026-09-20' });

    component.submitProduction();
    const request = requests.expectOne({ method: 'POST', url: '/api/products/1/production' });
    expect(request.request.body).toEqual({ quantity: 2, productionDate: '2026-09-20', notes: '' });
    request.flush(product({ quantity: 7 }));
    flushLoad([product({ quantity: 7 })], [rawMaterial()]);
    expect(component.productionDialogOpen()).toBe(false);
  });

  it('blocks a write-off larger than the stock', () => {
    setup([product({ quantity: 2 })], [rawMaterial()]);
    component.openStockOperation(product({ quantity: 2 }), 'WRITE_OFF');
    component.stockOperationForm.controls.quantity.setValue(3);

    expect(component.hasWriteOffShortage()).toBe(true);
    component.submitStockOperation();
    requests.expectNone({ method: 'POST', url: '/api/products/1/write-offs' });
  });

  it('sends an adjustment as the counted quantity and updates the row in place', () => {
    setup([product()], [rawMaterial()]);
    component.openStockOperation(product(), 'ADJUSTMENT');
    expect(component.stockOperationForm.controls.quantity.value).toBe(5);
    expect(component.hasNoAdjustmentChange()).toBe(true);
    component.submitStockOperation();
    requests.expectNone({ method: 'POST', url: '/api/products/1/adjustments' });

    component.stockOperationForm.patchValue({ quantity: 3, operationDate: '2026-09-21' });
    expect(component.stockDifference()).toBe(-2);
    expect(component.projectedStock()).toBe(3);
    expect(component.stockValueChange()).toBe(15);

    component.submitStockOperation();
    const request = requests.expectOne({ method: 'POST', url: '/api/products/1/adjustments' });
    expect(request.request.body).toEqual({
      actualQuantity: 3,
      operationDate: '2026-09-21',
      reason: 'Physical Inventory Count',
      notes: '',
    });
    request.flush(product({ quantity: 3 }));
    expect(component.items()[0].quantity).toBe(3);
    expect(component.stockOperationDialogOpen()).toBe(false);
  });

  it('creates a product with its opening stock, initial unit cost and recipe', async () => {
    setup([], [rawMaterial()]);
    component.openCreate();
    component.form.patchValue({ sku: 'ROSE-BOX', name: 'Rose Box', quantity: 5 });
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit: 3 });

    component.submit();
    const request = requests.expectOne({ method: 'POST', url: '/api/products' });
    const body = request.request.body as FormData;
    expect(body.get('quantity')).toBe('5');
    expect(body.get('initialUnitCost')).toBe('7.5');
    expect(JSON.parse(await (body.get('recipe') as Blob).text())).toEqual([
      { rawMaterialId: 1, quantityPerUnit: 3 },
    ]);
    request.flush(product());
    flushLoad([product()], [rawMaterial()]);
    expect(component.dialogOpen()).toBe(false);
  });

  it('edits a product without resending its quantity or initial unit cost', () => {
    setup([product()], [rawMaterial()]);
    component.openEdit(product());
    component.form.patchValue({ name: '  Rose Box Deluxe  ' });

    component.submit();
    const request = requests.expectOne({ method: 'PUT', url: '/api/products/1' });
    const body = request.request.body as FormData;
    expect(body.get('name')).toBe('Rose Box Deluxe');
    expect(body.has('quantity')).toBe(false);
    expect(body.has('initialUnitCost')).toBe(false);
    request.flush(product());
    flushLoad([product()], [rawMaterial()]);
    expect(component.dialogOpen()).toBe(false);
  });
});

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
      reorderLevel: 0,
      belowReorderLevel: false,
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

  function previewSellingPrice(
    averageUnitCost: number,
    quantityPerUnit: number,
    markupPercentage: number,
  ): number {
    component.rawMaterials.set([rawMaterial({ id: 1, averageUnitCost })]);
    component.openCreate();
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit });
    component.form.controls.markupPercentage.setValue(markupPercentage);
    return component.calculatedSellingPrice();
  }

  it('previews the selling price the server calculates', () => {
    // The server rounds the exact price half up: 2.555, 4.015, 2.135 and 2.175 (twice) here.
    expect(previewSellingPrice(0.73, 2, 75)).toBe(2.56);
    expect(previewSellingPrice(3.65, 1, 10)).toBe(4.02);
    expect(previewSellingPrice(0.61, 1, 250)).toBe(2.14);
    expect(previewSellingPrice(1.45, 1, 50)).toBe(2.18);
    expect(previewSellingPrice(1.5, 1, 45)).toBe(2.18);
  });

  function prefillInitialUnitCost(averageUnitCost: number, quantityPerUnit: number): number | null {
    component.rawMaterials.set([rawMaterial({ id: 1, averageUnitCost })]);
    component.openCreate();
    component.recipeControls[0].setValue({ rawMaterialId: 1, quantityPerUnit });
    return component.form.controls.initialUnitCost.value;
  }

  it('prefills the initial unit cost rounded half up to cents', () => {
    // 4.015 and 2.135 exactly.
    expect(prefillInitialUnitCost(3.65, 1.1)).toBe(4.02);
    expect(prefillInitialUnitCost(0.61, 3.5)).toBe(2.14);
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
