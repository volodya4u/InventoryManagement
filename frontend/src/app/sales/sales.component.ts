import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { PaymentMethod, Product, Sale, SaleItem, SaleStatus } from '../core/models';

type SaleItemFormGroup = FormGroup<{
  productId: FormControl<number | null>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
}>;

type ReturnItemFormGroup = FormGroup<{
  saleItemId: FormControl<number>;
  quantity: FormControl<number | null>;
}>;

interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

interface ReasonOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-sales',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss'
})
export class SalesComponent implements OnInit {
  readonly sales = signal<Sale[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly saleError = signal('');
  readonly dialogOpen = signal(false);
  readonly detailSale = signal<Sale | null>(null);
  readonly returnDialogOpen = signal(false);
  readonly returning = signal(false);
  readonly returnError = signal('');
  readonly returnSale = signal<Sale | null>(null);
  readonly cancellationDialogOpen = signal(false);
  readonly cancelling = signal(false);
  readonly cancellationError = signal('');
  readonly cancellationSale = signal<Sale | null>(null);

  readonly totalRevenue = computed(() =>
    this.sales().reduce((total, sale) => total + sale.netRevenue, 0)
  );
  readonly totalCost = computed(() =>
    this.sales().reduce((total, sale) => total + sale.netCost, 0)
  );
  readonly totalGrossProfit = computed(() =>
    this.sales().reduce((total, sale) => total + sale.netGrossProfit, 0)
  );

  readonly paymentMethods: PaymentMethodOption[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' }
  ];

  readonly returnReasons: ReasonOption[] = [
    { value: 'Customer Return', label: 'Customer Return' },
    { value: 'Product Defect', label: 'Product Defect' },
    { value: 'Incorrect Product', label: 'Incorrect Product' },
    { value: 'Order Error', label: 'Order Error' },
    { value: 'Other', label: 'Other' }
  ];

  readonly cancellationReasons: ReasonOption[] = [
    { value: 'Entry Error', label: 'Entry Error' },
    { value: 'Duplicate Sale', label: 'Duplicate Sale' },
    { value: 'Customer Cancelled', label: 'Customer Cancelled' },
    { value: 'Payment Failed', label: 'Payment Failed' },
    { value: 'Other', label: 'Other' }
  ];

  readonly form = new FormGroup({
    saleDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    paymentMethod: new FormControl<PaymentMethod>('CASH', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    items: new FormArray<SaleItemFormGroup>([])
  });

  readonly returnForm = new FormGroup({
    returnDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl(this.returnReasons[0].value, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)]
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    items: new FormArray<ReturnItemFormGroup>([])
  });

  readonly cancellationForm = new FormGroup({
    cancellationDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl(this.cancellationReasons[0].value, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)]
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] })
  });

  constructor(
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get itemControls(): SaleItemFormGroup[] {
    return this.form.controls.items.controls;
  }

  get returnItemControls(): ReturnItemFormGroup[] {
    return this.returnForm.controls.items.controls;
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      sales: this.http.get<Sale[]>('/api/sales'),
      products: this.http.get<Product[]>('/api/products')
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ sales, products }) => {
          this.sales.set(sales);
          this.products.set(products);
          const requestedSaleId = Number(this.route.snapshot.queryParamMap.get('saleId'));
          if (requestedSaleId > 0) {
            this.detailSale.set(sales.find((sale) => sale.id === requestedSaleId) ?? null);
          }
        },
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }

  openCreate(): void {
    this.form.reset({ saleDate: this.today(), paymentMethod: 'CASH', notes: '' });
    this.form.controls.items.clear();
    this.addItem();
    this.error.set('');
    this.saleError.set('');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) this.dialogOpen.set(false);
  }

  addItem(): void {
    this.form.controls.items.push(this.createItemRow());
  }

  removeItem(index: number): void {
    this.form.controls.items.removeAt(index);
  }

  productChanged(index: number): void {
    const row = this.itemControls[index];
    const product = this.productForRow(row);
    row.controls.unitPrice.setValue(product?.sellingPrice ?? null);
    if (product && row.controls.quantity.value === null) {
      row.controls.quantity.setValue(1);
    }
  }

  productSelectedElsewhere(productId: number, currentIndex: number): boolean {
    return this.itemControls.some((row, index) =>
      index !== currentIndex && row.controls.productId.value === productId
    );
  }

  productForRow(row: SaleItemFormGroup): Product | undefined {
    return this.products().find((product) => product.id === row.controls.productId.value);
  }

  lineRevenue(row: SaleItemFormGroup): number {
    return (row.controls.quantity.value ?? 0) * (row.controls.unitPrice.value ?? 0);
  }

  lineCost(row: SaleItemFormGroup): number {
    return (row.controls.quantity.value ?? 0) * (this.productForRow(row)?.averageUnitCost ?? 0);
  }

  lineProfit(row: SaleItemFormGroup): number {
    return this.lineRevenue(row) - this.lineCost(row);
  }

  formRevenue(): number {
    return this.itemControls.reduce((total, row) => total + this.lineRevenue(row), 0);
  }

  formCost(): number {
    return this.itemControls.reduce((total, row) => total + this.lineCost(row), 0);
  }

  formGrossProfit(): number {
    return this.formRevenue() - this.formCost();
  }

  rowHasShortage(row: SaleItemFormGroup): boolean {
    const product = this.productForRow(row);
    const quantity = row.controls.quantity.value ?? 0;
    return !!product && quantity > product.quantity;
  }

  hasShortage(): boolean {
    return this.itemControls.some((row) => this.rowHasShortage(row));
  }

  hasSellableProducts(): boolean {
    return this.products().some((product) => product.quantity > 0);
  }

  sellableProductCount(): number {
    return this.products().filter((product) => product.quantity > 0).length;
  }

  submit(): void {
    if (this.form.invalid || this.itemControls.length === 0 || this.hasShortage() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      saleDate: value.saleDate,
      paymentMethod: value.paymentMethod,
      notes: value.notes.trim(),
      items: value.items.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity!,
        unitPrice: item.unitPrice!
      }))
    };

    this.saving.set(true);
    this.saleError.set('');
    this.http.post<Sale>('/api/sales', request)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.dialogOpen.set(false);
          this.load();
        },
        error: (error) => this.saleError.set(apiErrorMessage(error))
      });
  }

  openDetails(sale: Sale): void {
    this.detailSale.set(sale);
  }

  closeDetails(): void {
    this.detailSale.set(null);
  }

  openReturn(sale: Sale): void {
    if (!this.canReturn(sale)) return;
    this.returnSale.set(sale);
    this.returnForm.reset({
      returnDate: this.today(),
      reason: this.returnReasons[0].value,
      notes: ''
    });
    this.returnForm.controls.items.clear();
    for (const item of sale.items.filter((candidate) => this.remainingReturnable(candidate) > 0)) {
      this.returnForm.controls.items.push(new FormGroup({
        saleItemId: new FormControl(item.id, { nonNullable: true }),
        quantity: new FormControl<number | null>(null, [
          Validators.min(0),
          Validators.pattern(/^\d+$/)
        ])
      }));
    }
    this.returnError.set('');
    this.returnDialogOpen.set(true);
  }

  closeReturnDialog(): void {
    if (!this.returning()) this.returnDialogOpen.set(false);
  }

  returnItem(row: ReturnItemFormGroup): SaleItem | undefined {
    return this.returnSale()?.items.find((item) => item.id === row.controls.saleItemId.value);
  }

  remainingReturnable(item: SaleItem): number {
    return item.quantity - item.returnedQuantity;
  }

  returnQuantityExceedsAvailable(row: ReturnItemFormGroup): boolean {
    const item = this.returnItem(row);
    return !!item && (row.controls.quantity.value ?? 0) > this.remainingReturnable(item);
  }

  selectedReturnItems(): Array<{ saleItemId: number; quantity: number }> {
    return this.returnItemControls
      .map((row) => ({
        saleItemId: row.controls.saleItemId.value,
        quantity: row.controls.quantity.value ?? 0
      }))
      .filter((item) => item.quantity > 0);
  }

  returnRefund(): number {
    return this.returnItemControls.reduce((total, row) => {
      const item = this.returnItem(row);
      return total + (row.controls.quantity.value ?? 0) * (item?.unitPrice ?? 0);
    }, 0);
  }

  returnCost(): number {
    return this.returnItemControls.reduce((total, row) => {
      const item = this.returnItem(row);
      return total + (row.controls.quantity.value ?? 0) * (item?.unitCost ?? 0);
    }, 0);
  }

  hasReturnQuantityError(): boolean {
    return this.returnItemControls.some((row) => this.returnQuantityExceedsAvailable(row));
  }

  submitReturn(): void {
    const sale = this.returnSale();
    const items = this.selectedReturnItems();
    if (!sale || this.returnForm.invalid || items.length === 0
        || this.hasReturnQuantityError() || this.returning()) {
      this.returnForm.markAllAsTouched();
      if (items.length === 0) this.returnError.set('Enter a return quantity for at least one Product.');
      return;
    }
    const value = this.returnForm.getRawValue();
    const request = {
      returnDate: value.returnDate,
      reason: value.reason,
      notes: value.notes.trim(),
      items
    };
    this.returning.set(true);
    this.returnError.set('');
    this.http.post<Sale>(`/api/sales/${sale.id}/returns`, request)
      .pipe(finalize(() => this.returning.set(false)))
      .subscribe({
        next: (updated) => {
          this.returnDialogOpen.set(false);
          this.detailSale.set(updated);
          this.load();
        },
        error: (error) => this.returnError.set(apiErrorMessage(error))
      });
  }

  openCancellation(sale: Sale): void {
    if (!this.canCancel(sale)) return;
    this.cancellationSale.set(sale);
    this.cancellationForm.reset({
      cancellationDate: this.today(),
      reason: this.cancellationReasons[0].value,
      notes: ''
    });
    this.cancellationError.set('');
    this.cancellationDialogOpen.set(true);
  }

  closeCancellationDialog(): void {
    if (!this.cancelling()) this.cancellationDialogOpen.set(false);
  }

  submitCancellation(): void {
    const sale = this.cancellationSale();
    if (!sale || this.cancellationForm.invalid || this.cancelling()) {
      this.cancellationForm.markAllAsTouched();
      return;
    }
    this.cancelling.set(true);
    this.cancellationError.set('');
    const value = this.cancellationForm.getRawValue();
    this.http.post<Sale>(`/api/sales/${sale.id}/cancellation`, {
      cancellationDate: value.cancellationDate,
      reason: value.reason,
      notes: value.notes.trim()
    })
      .pipe(finalize(() => this.cancelling.set(false)))
      .subscribe({
        next: (updated) => {
          this.cancellationDialogOpen.set(false);
          this.detailSale.set(updated);
          this.load();
        },
        error: (error) => this.cancellationError.set(apiErrorMessage(error))
      });
  }

  canReturn(sale: Sale): boolean {
    return sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED';
  }

  canCancel(sale: Sale): boolean {
    return sale.status === 'COMPLETED';
  }

  saleStatusLabel(status: SaleStatus): string {
    const labels: Record<SaleStatus, string> = {
      COMPLETED: 'Completed',
      PARTIALLY_RETURNED: 'Partially Returned',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled'
    };
    return labels[status];
  }

  paymentMethodLabel(value: PaymentMethod): string {
    return this.paymentMethods.find((method) => method.value === value)?.label ?? value;
  }

  saleItemsSummary(sale: Sale): string {
    return sale.items
      .map((item) => `${item.quantity} × ${item.productName}`)
      .join(' · ');
  }

  private createItemRow(): SaleItemFormGroup {
    return new FormGroup({
      productId: new FormControl<number | null>(null, [Validators.required]),
      quantity: new FormControl<number | null>(null, [
        Validators.required,
        Validators.min(1),
        Validators.pattern(/^\d+$/)
      ]),
      unitPrice: new FormControl<number | null>(null, [Validators.required, Validators.min(0)])
    });
  }

  private today(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
