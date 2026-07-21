import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import {
  MonthlySaleSummary,
  MonthlySalesReport,
  PaymentMethod,
  SaleReturnType,
  SaleStatus
} from '../../core/models';

@Component({
  selector: 'app-monthly-sales-report',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './monthly-sales-report.component.html',
  styleUrl: './monthly-sales-report.component.scss'
})
export class MonthlySalesReportComponent implements OnInit {
  readonly selectedMonth = signal(this.currentMonth());
  readonly report = signal<MonthlySalesReport | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  monthChanged(event: Event): void {
    const month = (event.target as HTMLInputElement).value;
    if (!month) return;
    this.selectedMonth.set(month);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const params = new HttpParams().set('month', this.selectedMonth());
    this.http.get<MonthlySalesReport>('/api/reports/monthly-sales', { params })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (report) => this.report.set(report),
        error: (error) => {
          this.report.set(null);
          this.error.set(apiErrorMessage(error));
        }
      });
  }

  paymentMethodLabel(value: PaymentMethod): string {
    const labels: Record<PaymentMethod, string> = {
      CASH: 'Cash',
      CARD: 'Card',
      BANK_TRANSFER: 'Bank Transfer'
    };
    return labels[value];
  }

  saleStatusLabel(value: SaleStatus): string {
    const labels: Record<SaleStatus, string> = {
      COMPLETED: 'Completed',
      PARTIALLY_RETURNED: 'Partially Returned',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled'
    };
    return labels[value];
  }

  returnTypeLabel(value: SaleReturnType): string {
    return value === 'CANCELLATION' ? 'Cancellation' : 'Return';
  }

  exportCsv(): void {
    const report = this.report();
    if (!report || (report.sales.length === 0 && report.returns.length === 0)) return;

    const rows: Array<Array<string | number>> = [
      ['Monthly Sales Report', report.month],
      [],
      ['Sales'],
      ['Sale Number', 'Date', 'Status', 'Payment Method', 'Product Lines', 'Units Sold', 'Gross Revenue (UAH)', 'Refunded (UAH)', 'Net Revenue (UAH)', 'Net Cost (UAH)', 'Net Gross Profit (UAH)'],
      ...report.sales.map((sale) => this.saleCsvRow(sale)),
      [],
      ['Returns and Cancellations'],
      ['Document', 'Date', 'Type', 'Original Sale', 'Payment Method', 'Units Returned', 'Refund (UAH)', 'Returned Cost (UAH)', 'Profit Reversal (UAH)'],
      ...report.returns.map((saleReturn) => [
        saleReturn.returnNumber,
        saleReturn.returnDate,
        saleReturn.operationType,
        saleReturn.saleNumber,
        this.paymentMethodLabel(saleReturn.paymentMethod),
        saleReturn.unitsReturned,
        saleReturn.refund,
        saleReturn.returnedCost,
        saleReturn.grossProfitReversal
      ]),
      [],
      ['Monthly Net Totals', '', '', '', '', report.unitsSold, report.grossRevenue, report.refunds, report.revenue, report.totalCost, report.grossProfit]
    ];
    const csv = '\uFEFF' + rows
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly-sales-${report.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private saleCsvRow(sale: MonthlySaleSummary): Array<string | number> {
    return [
      sale.saleNumber,
      sale.saleDate,
      sale.status,
      this.paymentMethodLabel(sale.paymentMethod),
      sale.productLines,
      sale.unitsSold,
      sale.revenue,
      sale.refunds,
      sale.netRevenue,
      sale.totalCost,
      sale.grossProfit
    ];
  }

  private csvCell(value: string | number): string {
    const text = String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  private currentMonth(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
