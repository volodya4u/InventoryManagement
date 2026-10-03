import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Product, Sale, SaleItem } from '../core/models';
import { SalesComponent } from './sales.component';

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
