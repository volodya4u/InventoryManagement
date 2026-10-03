import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Product, Sale, SaleItem } from '../core/models';
import { SalesComponent } from './sales.component';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'ROSE-BOX',
    name: 'Rose Box',
    description: '',
    quantity: 5,
    markupPercentage: 50,
    advertisingCostPerUnit: 0,
    sellingPrice: 30,
    averageUnitCost: 20,
    stockValue: 100,
    recipe: [],
    hasImage: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function saleItem(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: 11,
    productId: 1,
    productSku: 'ROSE-BOX',
    productName: 'Rose Box',
    quantity: 3,
    recommendedUnitPrice: 30,
    unitPrice: 30,
    unitCost: 3.3333,
    lineRevenue: 90,
    lineCost: 10,
    lineProfit: 80,
    returnedQuantity: 0,
    returnedCost: 0,
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 7,
    saleNumber: 'S-0007',
    saleDate: '2026-09-10',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    notes: '',
    totalRevenue: 90,
    totalCost: 10,
    grossProfit: 80,
    refundedRevenue: 0,
    returnedCost: 0,
    reversedGrossProfit: 0,
    netRevenue: 90,
    netCost: 10,
    netGrossProfit: 80,
    items: [saleItem()],
    returns: [],
    createdAt: '2026-09-10T10:00:00Z',
    ...overrides,
  };
}

describe('SalesComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<SalesComponent>;
  let component: SalesComponent;

  function setup(queryParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SalesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function flushLoad(sales: Sale[], products: Product[]): void {
    requests.expectOne('/api/sales').flush(sales);
    requests.expectOne('/api/products').flush(products);
    fixture.detectChanges();
  }

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
  });

  it('loads sales and products and opens the sale named in ?saleId', () => {
    setup({ saleId: '8' });
    flushLoad([sale(), sale({ id: 8, saleNumber: 'S-0008' })], [product()]);

    expect(component.loading()).toBe(false);
    expect(component.detailSale()?.saleNumber).toBe('S-0008');
    expect(fixture.nativeElement.textContent).toContain('S-0008');
  });

  it('totals net revenue, cost and profit after returns', () => {
    setup();
    flushLoad(
      [
        sale({ netRevenue: 60, netCost: 6.67, netGrossProfit: 53.33 }),
        sale({ id: 8, netRevenue: 40, netCost: 20, netGrossProfit: 20 }),
      ],
      [product()],
    );

    expect(component.totalRevenue()).toBe(100);
    expect(component.totalCost()).toBeCloseTo(26.67, 10);
    expect(component.totalGrossProfit()).toBeCloseTo(73.33, 10);
  });

  it('fills the unit price from the product and starts at one unit', () => {
    setup();
    flushLoad([], [product()]);
    component.openCreate();
    const row = component.itemControls[0];
    row.controls.productId.setValue(1);
    component.productChanged(0);

    expect(row.controls.unitPrice.value).toBe(30);
    expect(row.controls.quantity.value).toBe(1);
    expect(component.lineRevenue(row)).toBe(30);
    expect(component.lineCost(row)).toBe(20);
    expect(component.lineProfit(row)).toBe(10);
  });

  it('does not post a sale that needs more units than the stock holds', () => {
    setup();
    flushLoad([], [product({ quantity: 2 })]);
    component.openCreate();
    const row = component.itemControls[0];
    row.controls.productId.setValue(1);
    component.productChanged(0);
    row.controls.quantity.setValue(3);

    expect(component.hasShortage()).toBe(true);
    component.submit();
    requests.expectNone({ method: 'POST', url: '/api/sales' });
  });

  it('posts the sale with trimmed notes, then closes the dialog and reloads', () => {
    setup();
    flushLoad([], [product()]);
    component.openCreate();
    component.form.patchValue({ saleDate: '2026-09-15', paymentMethod: 'CARD', notes: '  Gift  ' });
    const row = component.itemControls[0];
    row.controls.productId.setValue(1);
    component.productChanged(0);
    row.controls.quantity.setValue(2);

    component.submit();
    const request = requests.expectOne({ method: 'POST', url: '/api/sales' });
    expect(request.request.body).toEqual({
      saleDate: '2026-09-15',
      paymentMethod: 'CARD',
      notes: 'Gift',
      items: [{ productId: 1, quantity: 2, unitPrice: 30 }],
    });
    request.flush(sale());
    flushLoad([sale()], [product()]);
    expect(component.dialogOpen()).toBe(false);
  });

  it('reverses the recorded line cost in proportion, exactly on the last unit', () => {
    setup();
    const partlyReturned = sale({
      status: 'PARTIALLY_RETURNED',
      items: [saleItem({ quantity: 3, lineCost: 10, returnedQuantity: 1, returnedCost: 3.33 })],
    });
    flushLoad([partlyReturned], [product()]);
    component.openReturn(partlyReturned);
    const row = component.returnItemControls[0];

    row.controls.quantity.setValue(1);
    expect(component.returnCost()).toBe(3.34);
    row.controls.quantity.setValue(2);
    expect(component.returnCost()).toBe(6.67);
    expect(component.returnRefund()).toBe(60);
  });

  it('offers only items with units left and blocks returning more than that', () => {
    setup();
    const partlyReturned = sale({
      status: 'PARTIALLY_RETURNED',
      items: [
        saleItem({ id: 11, quantity: 3, returnedQuantity: 1 }),
        saleItem({ id: 12, quantity: 2, returnedQuantity: 2 }),
      ],
    });
    flushLoad([partlyReturned], [product()]);
    component.openReturn(partlyReturned);

    expect(component.returnItemControls.map((row) => row.controls.saleItemId.value)).toEqual([11]);
    component.returnItemControls[0].controls.quantity.setValue(3);
    expect(component.hasReturnQuantityError()).toBe(true);
    component.submitReturn();
    requests.expectNone({ method: 'POST', url: '/api/sales/7/returns' });
  });

  it('asks for a quantity instead of posting an empty return', () => {
    setup();
    flushLoad([sale()], [product()]);
    component.openReturn(sale());

    component.submitReturn();
    expect(component.returnError()).toBe('Enter a return quantity for at least one Product.');
    requests.expectNone({ method: 'POST', url: '/api/sales/7/returns' });
  });

  it('allows returns for completed and partly returned sales, cancellation only for completed', () => {
    setup();
    flushLoad([], []);

    expect(component.canReturn(sale({ status: 'COMPLETED' }))).toBe(true);
    expect(component.canReturn(sale({ status: 'PARTIALLY_RETURNED' }))).toBe(true);
    expect(component.canReturn(sale({ status: 'RETURNED' }))).toBe(false);
    expect(component.canReturn(sale({ status: 'CANCELLED' }))).toBe(false);
    expect(component.canCancel(sale({ status: 'COMPLETED' }))).toBe(true);
    expect(component.canCancel(sale({ status: 'PARTIALLY_RETURNED' }))).toBe(false);
  });
});
