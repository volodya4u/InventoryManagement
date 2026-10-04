import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StockMovement, StockMovementHistory } from '../core/models';
import { StockMovementsComponent } from './stock-movements.component';

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    inventoryType: 'PRODUCT',
    movementId: 1,
    itemId: 1,
    itemCode: 'ROSE-BOX',
    itemName: 'Rose Box',
    unit: 'PIECE',
    movementType: 'SALE',
    direction: 'OUT',
    quantity: 2,
    signedQuantity: -2,
    unitCost: 7.5,
    totalCost: 15,
    signedTotalCost: -15,
    occurredAt: '2026-09-10T10:00:00Z',
    notes: '',
    referenceType: 'SALE',
    referenceId: 7,
    referenceNumber: 'S-0007',
    createdAt: '2026-09-10T10:00:00Z',
    ...overrides,
  };
}

function history(overrides: Partial<StockMovementHistory> = {}): StockMovementHistory {
  return {
    movements: [movement()],
    totalElements: 30,
    page: 0,
    size: 25,
    totalPages: 2,
    totals: { movementCount: 30, incomingValue: 100, outgoingValue: 15, netValueChange: 85 },
    ...overrides,
  };
}

describe('StockMovementsComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<StockMovementsComponent>;
  let component: StockMovementsComponent;

  function expectHistory(): TestRequest {
    return requests.expectOne((request) => request.url === '/api/stock-movements');
  }

  function params(request: TestRequest): Record<string, string> {
    const query = request.request.params;
    return Object.fromEntries(query.keys().map((key) => [key, query.get(key) ?? '']));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StockMovementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
  });

  it('loads the first page of all inventory', () => {
    const request = expectHistory();
    expect(params(request)).toEqual({ inventoryType: 'ALL', page: '0', size: '25' });
    request.flush(history());
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Rose Box');
  });

  it('sends only the filters that are set, trims the search, and starts again at page 0', () => {
    expectHistory().flush(history());
    component.nextPage();
    expectHistory().flush(history({ page: 1 }));
    expect(component.page()).toBe(1);

    component.filters.patchValue({
      inventoryType: 'PRODUCT',
      movementType: 'SALE',
      query: '  rose  ',
      from: '2026-09-01',
    });
    component.applyFilters();

    const filtered = expectHistory();
    expect(params(filtered)).toEqual({
      inventoryType: 'PRODUCT',
      page: '0',
      size: '25',
      movementType: 'SALE',
      query: 'rose',
      from: '2026-09-01',
    });
    filtered.flush(history());
    expect(component.page()).toBe(0);
  });

  it('pages forward and back only within the result', () => {
    expectHistory().flush(history());
    component.previousPage();
    requests.expectNone((request) => request.url === '/api/stock-movements');

    component.nextPage();
    const second = expectHistory();
    expect(params(second)['page']).toBe('1');
    second.flush(history({ page: 1 }));
    expect(component.page()).toBe(1);

    component.nextPage();
    requests.expectNone((request) => request.url === '/api/stock-movements');

    component.previousPage();
    const first = expectHistory();
    expect(params(first)['page']).toBe('0');
    first.flush(history());
  });

  it('ignores paging clicks while a page is loading', () => {
    expectHistory().flush(history({ totalPages: 3 }));
    component.nextPage();
    component.nextPage();
    const second = expectHistory();
    expect(params(second)['page']).toBe('1');
    second.flush(history({ page: 1, totalPages: 3 }));

    component.nextPage();
    expectHistory().flush(history({ page: 2, totalPages: 3 }));
    component.previousPage();
    component.previousPage();
    const back = expectHistory();
    expect(params(back)['page']).toBe('1');
    back.flush(history({ page: 1, totalPages: 3 }));
    expect(component.page()).toBe(1);
  });

  it('clears the filters and the page on reset', () => {
    expectHistory().flush(history());
    component.filters.patchValue({ movementType: 'WRITE_OFF', query: 'moss', to: '2026-09-30' });
    component.applyFilters();
    expectHistory().flush(history());

    component.resetFilters();
    const reset = expectHistory();
    expect(params(reset)).toEqual({ inventoryType: 'ALL', page: '0', size: '25' });
    reset.flush(history());
  });

  it('shows the API error and drops the old result', () => {
    expectHistory().flush(history());
    component.applyFilters();
    expectHistory().flush(
      { detail: 'History is unavailable.' },
      { status: 500, statusText: 'Error' },
    );

    expect(component.history()).toBeNull();
    expect(component.error()).toBe('History is unavailable.');
    expect(component.loading()).toBe(false);
  });

  it('describes the visible range and which rows link to a sale', () => {
    expect(component.pageStart(history({ page: 1 }))).toBe(26);
    expect(component.pageEnd(history({ page: 1 }))).toBe(30);
    expect(component.pageStart(history({ totalElements: 0, movements: [] }))).toBe(0);

    expect(component.canOpenSale(movement())).toBe(true);
    expect(component.canOpenSale(movement({ referenceType: 'SALE_RETURN', referenceId: 3 }))).toBe(
      true,
    );
    expect(component.canOpenSale(movement({ referenceType: 'PRODUCTION_BATCH' }))).toBe(false);
    expect(component.canOpenSale(movement({ referenceId: null }))).toBe(false);
    expect(component.movementTypeLabel('ADJUSTMENT_DECREASE')).toBe('Adjustment Decrease');
    expect(component.inventoryTypeLabel('RAW_MATERIAL')).toBe('Raw Material');
    expectHistory().flush(history());
  });
});
