import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      reorderLevel: 0,
      belowReorderLevel: false,
      hasImage: false,
      unitChangeable: false,
      createdAt: '2026-10-01T09:00:00Z',
      updatedAt: '2026-10-01T09:00:00Z',
      ...overrides,
    };
  }

  // @trace FR-69
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

  // @trace FR-69
  it('values a stock adjustment without floating-point drift', () => {
    component.openStockOperation(rawMaterial({ quantity: 2, averageUnitCost: 1.1 }), 'ADJUSTMENT');
    component.stockOperationForm.controls.quantity.setValue(5);

    expect(component.stockDifference()).toBe(3);
    expect(component.projectedStock()).toBe(5);
    expect(component.stockValueChange()).toBe(3.3);
  });

  // @trace FR-69
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

  // @trace FR-69
  it('values initial stock without floating-point drift', () => {
    component.openCreate();
    component.form.patchValue({ unit: 'KILOGRAM', quantity: 1.5, initialUnitCost: 0.4 });

    expect(component.initialStockValue()).toBe(0.6);
  });

  // @trace FR-69
  it('totals a receipt without floating-point drift', () => {
    component.openReceipt(rawMaterial({ unit: 'KILOGRAM' }));
    component.receiptForm.patchValue({ receivedQuantity: 0.7, unitPurchaseCost: 3 });

    expect(component.receiptValue()).toBe(2.1);
  });

  // @trace FR-69
  it('totals the stock value of all raw materials without floating-point drift', () => {
    component.items.set([
      rawMaterial({ id: 1, stockValue: 0.1 }),
      rawMaterial({ id: 2, stockValue: 0.2 }),
    ]);

    expect(component.totalStockValue()).toBe(0.3);
  });
});

describe('RawMaterialsComponent low-stock badge', () => {
  let requests: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
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

  // @trace FR-59
  it('marks a raw material below its reorder level', () => {
    const fixture = TestBed.createComponent(RawMaterialsComponent);
    fixture.detectChanges();
    requests.expectOne('/api/raw-materials').flush([
      rawMaterial({ id: 1, name: 'Low', quantity: 2, reorderLevel: 5, belowReorderLevel: true }),
      rawMaterial({
        id: 2,
        name: 'Fine',
        quantity: 50,
        reorderLevel: 5,
        belowReorderLevel: false,
      }),
    ]);
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('.low-stock-badge');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain('Low stock');
  });
});

describe('RawMaterialsComponent delete confirmation', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<RawMaterialsComponent>;
  let confirm: ReturnType<typeof vi.spyOn>;

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

  function clickDelete(): void {
    const button = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((candidate) => candidate.textContent?.trim() === 'Delete');
    button?.click();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    requests = TestBed.inject(HttpTestingController);
    confirm = vi.spyOn(window, 'confirm');
    fixture = TestBed.createComponent(RawMaterialsComponent);
    fixture.detectChanges();
    requests.expectOne('/api/raw-materials').flush([rawMaterial({})]);
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // @trace FR-55, NFR-19
  it('asks before deleting and sends nothing when the answer is no', () => {
    confirm.mockReturnValue(false);

    clickDelete();

    expect(confirm).toHaveBeenCalledWith('Delete raw material “Red Rose”?');
    requests.expectNone({ method: 'DELETE', url: '/api/raw-materials/1' });
    expect(fixture.nativeElement.textContent).toContain('Red Rose');
  });

  // @trace FR-55, NFR-19
  it('deletes the raw material and drops its row when the answer is yes', () => {
    confirm.mockReturnValue(true);

    clickDelete();

    requests.expectOne({ method: 'DELETE', url: '/api/raw-materials/1' }).flush(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Red Rose');
  });

  // @trace NFR-19
  it('guards raw material write forms and shows API errors', () => {
    const component = fixture.componentInstance;
    const material = rawMaterial({});

    component.openCreate();
    component.submit();
    requests.expectNone({ method: 'POST', url: '/api/raw-materials' });
    component.form.controls.name.setValue('White Rose');
    component.submit();
    requests
      .expectOne({ method: 'POST', url: '/api/raw-materials' })
      .flush({ detail: 'Material save failed.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Material save failed.');

    component.openReceipt(material);
    component.submitReceipt();
    requests.expectNone({ method: 'POST', url: '/api/raw-materials/1/receipts' });
    component.receiptForm.patchValue({ receivedQuantity: 2, unitPurchaseCost: 3 });
    component.submitReceipt();
    requests
      .expectOne({ method: 'POST', url: '/api/raw-materials/1/receipts' })
      .flush({ detail: 'Receipt failed.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Receipt failed.');

    component.openStockOperation(material, 'WRITE_OFF');
    component.submitStockOperation();
    requests.expectNone({ method: 'POST', url: '/api/raw-materials/1/write-offs' });
    component.stockOperationForm.controls.quantity.setValue(1);
    component.submitStockOperation();
    requests
      .expectOne({ method: 'POST', url: '/api/raw-materials/1/write-offs' })
      .flush({ detail: 'Write-off failed.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Write-off failed.');

    component.openStockOperation(material, 'ADJUSTMENT');
    component.stockOperationForm.controls.quantity.setValue(-1);
    component.submitStockOperation();
    requests.expectNone({ method: 'POST', url: '/api/raw-materials/1/adjustments' });
    component.stockOperationForm.controls.quantity.setValue(80);
    component.submitStockOperation();
    requests
      .expectOne({ method: 'POST', url: '/api/raw-materials/1/adjustments' })
      .flush({ detail: 'Adjustment failed.' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Adjustment failed.');
  });
});

describe('RawMaterialsComponent modal keyboard focus', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<RawMaterialsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RawMaterialsComponent);
    fixture.detectChanges();
    requests.expectOne('/api/raw-materials').flush([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
  });

  // @trace FR-150
  it('keeps dialog focus inside and returns it to the opener', () => {
    const opener = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((button) => button.textContent?.trim() === '+ Add Raw Material')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);

    const buttons = Array.from<HTMLButtonElement>(dialog.querySelectorAll('button:not(:disabled)'));
    const first = buttons[0];
    const last = buttons.at(-1)!;
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);

    const cancel = buttons.find((button) => button.textContent?.trim() === 'Cancel')!;
    cancel.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });
});
