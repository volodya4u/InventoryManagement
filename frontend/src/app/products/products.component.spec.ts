import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Product, RawMaterial } from '../core/models';
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
