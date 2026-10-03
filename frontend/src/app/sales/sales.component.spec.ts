import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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

describe('SalesComponent amounts', () => {
  let component: SalesComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    component = TestBed.createComponent(SalesComponent).componentInstance;
  });

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

  function saleItem(overrides: Partial<SaleItem>): SaleItem {
    return {
      id: 1,
      productId: 1,
      productSku: 'ROSE-BOUQUET',
      productName: 'Rose Bouquet',
      quantity: 1,
      recommendedUnitPrice: 0,
      unitPrice: 0,
      unitCost: 0,
      lineRevenue: 0,
      lineCost: 0,
      lineProfit: 0,
      returnedQuantity: 0,
      returnedCost: 0,
      ...overrides,
    };
  }

  function sale(overrides: Partial<Sale>): Sale {
    return {
      id: 1,
      saleNumber: 'S-0001',
      saleDate: '2026-10-01',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      notes: '',
      totalRevenue: 0,
      totalCost: 0,
      grossProfit: 0,
      refundedRevenue: 0,
      returnedCost: 0,
      reversedGrossProfit: 0,
      netRevenue: 0,
      netCost: 0,
      netGrossProfit: 0,
      items: [],
      returns: [],
      createdAt: '2026-10-01T09:00:00Z',
      ...overrides,
    };
  }

  function fillSaleForm(): void {
    component.products.set([
      product({ id: 1, averageUnitCost: 0.1 }),
      product({ id: 2, averageUnitCost: 0.1 }),
    ]);
    component.openCreate();
    component.addItem();
    component.itemControls[0].setValue({ productId: 1, quantity: 3, unitPrice: 0.2 });
    component.itemControls[1].setValue({ productId: 2, quantity: 3, unitPrice: 1.1 });
  }

  it('prices each sale line without floating-point drift', () => {
    fillSaleForm();
    const [roses, tulips] = component.itemControls;

    expect(component.lineRevenue(tulips)).toBe(3.3);
    expect(component.lineCost(tulips)).toBe(0.3);
    expect(component.lineProfit(roses)).toBe(0.3);
  });

  it('totals the sale form without floating-point drift', () => {
    fillSaleForm();

    expect(component.formRevenue()).toBe(3.9);
    expect(component.formCost()).toBe(0.6);
    expect(component.formGrossProfit()).toBe(3.3);
  });

  it('totals a return without floating-point drift', () => {
    component.openReturn(
      sale({
        items: [
          saleItem({ id: 1, quantity: 3, unitPrice: 0.1, lineCost: 0.1 }),
          saleItem({ id: 2, quantity: 1, unitPrice: 0.3, lineCost: 0.2 }),
        ],
      }),
    );
    component.returnItemControls[0].controls.quantity.setValue(3);
    component.returnItemControls[1].controls.quantity.setValue(1);

    expect(component.returnLineRefund(component.returnItemControls[0])).toBe(0.3);
    expect(component.returnRefund()).toBe(0.6);
    expect(component.returnCost()).toBe(0.3);
    expect(component.returnProfitReversal()).toBe(0.3);
  });

  it.each([
    // 4.35 / 2 is exactly 2.175.
    { lineCost: 4.35, quantity: 2, returnedQuantity: 0, returnedCost: 0, returning: 1, cost: 2.18 },
    {
      lineCost: 4.35,
      quantity: 2,
      returnedQuantity: 1,
      returnedCost: 2.18,
      returning: 1,
      cost: 2.17,
    },
    // 0.07 * 3 / 6 is exactly 0.035, but 0.21 / 6 is 0.034999999999999996 in floating point.
    { lineCost: 0.07, quantity: 6, returnedQuantity: 0, returnedCost: 0, returning: 3, cost: 0.04 },
    // 0.29 * 3 / 6 is exactly 0.145, but 0.29 * 3 is 0.8699999999999999 in floating point.
    { lineCost: 0.29, quantity: 6, returnedQuantity: 0, returnedCost: 0, returning: 3, cost: 0.15 },
  ])(
    'reverses $cost of a $lineCost line cost when $returning of $quantity units come back',
    ({ lineCost, quantity, returnedQuantity, returnedCost, returning, cost }) => {
      component.openReturn(
        sale({ items: [saleItem({ quantity, lineCost, returnedQuantity, returnedCost })] }),
      );
      component.returnItemControls[0].controls.quantity.setValue(returning);

      expect(component.returnCost()).toBe(cost);
    },
  );

  it('sums the net totals of all sales without floating-point drift', () => {
    component.sales.set([
      sale({ id: 1, netRevenue: 10.1, netCost: 10, netGrossProfit: 0.1 }),
      sale({ id: 2, netRevenue: 20.2, netCost: 14.9, netGrossProfit: 5.3 }),
      sale({ id: 3, netRevenue: 30.3, netCost: 30.2, netGrossProfit: 0.1 }),
    ]);

    expect(component.totalRevenue()).toBe(60.6);
    expect(component.totalCost()).toBe(55.1);
    expect(component.totalGrossProfit()).toBe(5.5);
  });
});
