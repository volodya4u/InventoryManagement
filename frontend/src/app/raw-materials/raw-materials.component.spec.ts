import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RawMaterial } from '../core/models';
import { RawMaterialsComponent } from './raw-materials.component';

describe('RawMaterialsComponent amounts', () => {
  let component: RawMaterialsComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.createComponent(RawMaterialsComponent).componentInstance;
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

  it('values a write-off of a fractional quantity without floating-point drift', () => {
    component.openStockOperation(
      rawMaterial({ unit: 'KILOGRAM', quantity: 0.7, averageUnitCost: 3 }),
      'WRITE_OFF',
    );
    component.stockOperationForm.controls.quantity.setValue(0.3);

    expect(component.stockDifference()).toBe(-0.3);
    expect(component.projectedStock()).toBe(0.4);
    expect(component.stockValueChange()).toBe(0.9);
  });

  it('values a stock adjustment without floating-point drift', () => {
    component.openStockOperation(rawMaterial({ quantity: 2, averageUnitCost: 1.1 }), 'ADJUSTMENT');
    component.stockOperationForm.controls.quantity.setValue(5);

    expect(component.stockDifference()).toBe(3);
    expect(component.projectedStock()).toBe(5);
    expect(component.stockValueChange()).toBe(3.3);
  });

  it('keeps a stock adjustment finer than four decimal places', () => {
    component.openStockOperation(
      rawMaterial({ unit: 'KILOGRAM', quantity: 1.00004, averageUnitCost: 3 }),
      'ADJUSTMENT',
    );
    component.stockOperationForm.controls.quantity.setValue(1);

    expect(component.stockDifference()).toBe(-0.00004);
    expect(component.projectedStock()).toBe(1);
    expect(component.hasNoAdjustmentChange()).toBe(false);
    expect(component.stockValueChange()).toBe(0.00012);
  });

  it('values initial stock without floating-point drift', () => {
    component.openCreate();
    component.form.patchValue({ unit: 'KILOGRAM', quantity: 1.5, initialUnitCost: 0.4 });

    expect(component.initialStockValue()).toBe(0.6);
  });

  it('totals a receipt without floating-point drift', () => {
    component.openReceipt(rawMaterial({ unit: 'KILOGRAM' }));
    component.receiptForm.patchValue({ receivedQuantity: 0.7, unitPurchaseCost: 3 });

    expect(component.receiptValue()).toBe(2.1);
  });

  it('totals the stock value of all raw materials without floating-point drift', () => {
    component.items.set([
      rawMaterial({ id: 1, stockValue: 0.1 }),
      rawMaterial({ id: 2, stockValue: 0.2 }),
    ]);

    expect(component.totalStockValue()).toBe(0.3);
  });
});
