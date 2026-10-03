import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MonthlySalesReport } from '../../core/models';
import { MonthlySalesReportComponent } from './monthly-sales-report.component';

function report(overrides: Partial<MonthlySalesReport> = {}): MonthlySalesReport {
  return {
    month: '2026-01',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    salesCount: 1,
    returnCount: 1,
    unitsSold: 3,
    unitsReturned: 1,
    grossRevenue: 90,
    refunds: 30,
    revenue: 60,
    grossCost: 10,
    returnedCost: 3.33,
    totalCost: 6.67,
    grossProfit: 53.33,
    averageSaleValue: 60,
    paymentSummaries: [],
    dailySummaries: [],
    productSummaries: [],
    sales: [
      {
        id: 7,
        saleNumber: 'S-0007',
        saleDate: '2026-01-10',
        paymentMethod: 'CARD',
        status: 'PARTIALLY_RETURNED',
        productLines: 1,
        unitsSold: 3,
        revenue: 90,
        refunds: 30,
        netRevenue: 60,
        totalCost: 6.67,
        grossProfit: 53.33,
      },
    ],
    returns: [
      {
        id: 3,
        returnNumber: 'R-"3"',
        operationType: 'RETURN',
        saleId: 7,
        saleNumber: 'S-0007',
        returnDate: '2026-01-12',
        paymentMethod: 'BANK_TRANSFER',
        unitsReturned: 1,
        refund: 30,
        returnedCost: 3.33,
        grossProfitReversal: 26.67,
      },
    ],
    ...overrides,
  };
}

describe('MonthlySalesReportComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<MonthlySalesReportComponent>;
  let component: MonthlySalesReportComponent;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  function expectReport(month: string): TestRequest {
    return requests.expectOne(
      (request) =>
        request.url === '/api/reports/monthly-sales' && request.params.get('month') === month,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 15));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MonthlySalesReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('loads the current month on open', () => {
    expect(component.selectedMonth()).toBe('2026-01');
    expectReport('2026-01').flush(report());
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.report()?.revenue).toBe(60);
    expect(fixture.nativeElement.textContent).toContain('S-0007');
  });

  it('reloads for another month and ignores a cleared month picker', () => {
    expectReport('2026-01').flush(report());

    component.monthChanged({ target: { value: '2025-12' } } as unknown as Event);
    expectReport('2025-12').flush(report({ month: '2025-12' }));
    expect(component.report()?.month).toBe('2025-12');

    component.monthChanged({ target: { value: '' } } as unknown as Event);
    // A string matcher compares the URL with its query string, so match the path instead.
    requests.expectNone((request) => request.url === '/api/reports/monthly-sales');
    expect(component.selectedMonth()).toBe('2025-12');
  });

  it('shows the API error and drops the previous report', () => {
    expectReport('2026-01').flush(report());
    component.load();
    expectReport('2026-01').flush(
      { detail: 'Report is not available.' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.report()).toBeNull();
    expect(component.error()).toBe('Report is not available.');
    expect(component.loading()).toBe(false);
  });

  it('exports sales and returns as a UTF-8 CSV with escaped quotes', async () => {
    expectReport('2026-01').flush(report());
    const createObjectUrl = vi.fn((_: Blob) => 'blob:monthly-sales');
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = vi.fn();
    let downloadName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    component.exportCsv();

    expect(downloadName).toBe('monthly-sales-2026-01.csv');
    const blob = createObjectUrl.mock.calls[0][0];
    // The byte order mark makes Excel read UTF-8; Blob.text() strips it while decoding.
    expect([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = (await blob.text()).split('\r\n');
    expect(lines[0]).toBe('"Monthly Sales Report","2026-01"');
    expect(lines).toContain(
      '"S-0007","2026-01-10","PARTIALLY_RETURNED","Card","1","3","90","30","60","6.67","53.33"',
    );
    expect(lines).toContain(
      '"R-""3""","2026-01-12","RETURN","S-0007","Bank Transfer","1","30","3.33","26.67"',
    );
    expect(lines.at(-1)).toBe('"Monthly Net Totals","","","","","3","90","30","60","6.67","53.33"');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:monthly-sales');
  });

  it('does not export a month without sales or returns', () => {
    expectReport('2026-01').flush(report({ sales: [], returns: [] }));
    URL.createObjectURL = vi.fn();

    component.exportCsv();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
