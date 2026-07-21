import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { PaymentMethod, Product, Sale } from '../core/models';

type SaleItemFormGroup = FormGroup<{
  productId: FormControl<number | null>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
}>;

interface PaymentMethodOption {
  value: PaymentMethod;
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

  readonly totalRevenue = computed(() =>
    this.sales().reduce((total, sale) => total + sale.totalRevenue, 0)
  );
  readonly totalCost = computed(() =>
    this.sales().reduce((total, sale) => total + sale.totalCost, 0)
  );
  readonly totalGrossProfit = computed(() =>
    this.sales().reduce((total, sale) => total + sale.grossProfit, 0)
  );

  readonly paymentMethods: PaymentMethodOption[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' }
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
