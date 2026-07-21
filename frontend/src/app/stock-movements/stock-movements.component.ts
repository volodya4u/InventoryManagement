import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import {
  InventoryType,
  StockMovement,
  StockMovementHistory,
  StockMovementType
} from '../core/models';

interface SelectOption<T> {
  value: T;
  label: string;
}

@Component({
  selector: 'app-stock-movements',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './stock-movements.component.html',
  styleUrl: './stock-movements.component.scss'
})
export class StockMovementsComponent implements OnInit {
  readonly history = signal<StockMovementHistory | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly page = signal(0);
  readonly pageSize = 25;

  readonly inventoryTypes: SelectOption<InventoryType>[] = [
    { value: 'ALL', label: 'All Inventory' },
    { value: 'RAW_MATERIAL', label: 'Raw Materials' },
    { value: 'PRODUCT', label: 'Products' }
  ];

  readonly movementTypes: SelectOption<StockMovementType | ''>[] = [
    { value: '', label: 'All Movement Types' },
    { value: 'OPENING_BALANCE', label: 'Opening Balance' },
    { value: 'RECEIPT', label: 'Receipt' },
    { value: 'PRODUCTION_CONSUMPTION', label: 'Production Consumption' },
    { value: 'PRODUCTION', label: 'Production' },
    { value: 'SALE', label: 'Sale' },
    { value: 'SALE_RETURN', label: 'Sale Return' },
    { value: 'SALE_CANCELLATION', label: 'Sale Cancellation' },
    { value: 'WRITE_OFF', label: 'Write Off' },
    { value: 'ADJUSTMENT_INCREASE', label: 'Adjustment Increase' },
    { value: 'ADJUSTMENT_DECREASE', label: 'Adjustment Decrease' }
  ];

  readonly filters = new FormGroup({
    inventoryType: new FormControl<InventoryType>('ALL', { nonNullable: true }),
    movementType: new FormControl<StockMovementType | ''>('', { nonNullable: true }),
    query: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true })
  });

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  applyFilters(): void {
    this.page.set(0);
    this.load();
  }

  resetFilters(): void {
    this.filters.reset({
      inventoryType: 'ALL',
      movementType: '',
      query: '',
      from: '',
      to: ''
    });
    this.page.set(0);
    this.load();
  }

  previousPage(): void {
    if (this.page() === 0 || this.loading()) return;
    this.page.update((page) => page - 1);
    this.load();
  }

  nextPage(): void {
    const history = this.history();
    if (!history || this.page() + 1 >= history.totalPages || this.loading()) return;
    this.page.update((page) => page + 1);
    this.load();
  }

  load(): void {
    const filter = this.filters.getRawValue();
    let params = new HttpParams()
      .set('inventoryType', filter.inventoryType)
      .set('page', this.page())
      .set('size', this.pageSize);
    if (filter.movementType) params = params.set('movementType', filter.movementType);
    if (filter.query.trim()) params = params.set('query', filter.query.trim());
    if (filter.from) params = params.set('from', filter.from);
    if (filter.to) params = params.set('to', filter.to);

    this.loading.set(true);
    this.error.set('');
    this.http.get<StockMovementHistory>('/api/stock-movements', { params })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (history) => this.history.set(history),
        error: (error) => {
          this.history.set(null);
          this.error.set(apiErrorMessage(error));
        }
      });
  }

  movementTypeLabel(value: StockMovementType): string {
    return this.movementTypes.find((option) => option.value === value)?.label ?? value;
  }

  inventoryTypeLabel(value: StockMovement['inventoryType']): string {
    return value === 'RAW_MATERIAL' ? 'Raw Material' : 'Product';
  }

  unitLabel(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  pageStart(history: StockMovementHistory): number {
    return history.totalElements === 0 ? 0 : history.page * history.size + 1;
  }

  pageEnd(history: StockMovementHistory): number {
    return Math.min((history.page + 1) * history.size, history.totalElements);
  }

  canOpenSale(movement: StockMovement): boolean {
    return (movement.referenceType === 'SALE' || movement.referenceType === 'SALE_RETURN')
      && movement.referenceId !== null;
  }
}
