import { HttpClient } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { imageFileError } from '../core/image-file';
import { RawMaterial } from '../core/models';

interface UnitOption {
  value: string;
  label: string;
}

function initialUnitCostValidator(control: AbstractControl): ValidationErrors | null {
  const quantity = Number(control.get('quantity')?.value ?? 0);
  const initialUnitCost = control.get('initialUnitCost')?.value;
  return quantity > 0 && (initialUnitCost === null || initialUnitCost === '')
    ? { initialUnitCostRequired: true }
    : null;
}

@Component({
  selector: 'app-raw-materials',
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './raw-materials.component.html',
  styleUrl: './raw-materials.component.scss'
})
export class RawMaterialsComponent implements OnInit {
  readonly items = signal<RawMaterial[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dialogOpen = signal(false);
  readonly editing = signal<RawMaterial | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal('');
  readonly receiptDialogOpen = signal(false);
  readonly receiving = signal(false);
  readonly receivingMaterial = signal<RawMaterial | null>(null);

  readonly units: UnitOption[] = [
    { value: 'STEM', label: 'Stem' },
    { value: 'PIECE', label: 'Piece' },
    { value: 'BUNCH', label: 'Bunch' },
    { value: 'GRAM', label: 'Gram' },
    { value: 'KILOGRAM', label: 'Kilogram' },
    { value: 'METER', label: 'Meter' },
    { value: 'PACKAGE', label: 'Package' }
  ];

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    unit: new FormControl('STEM', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    initialUnitCost: new FormControl<number | null>(null, [Validators.min(0)])
  }, { validators: initialUnitCostValidator });

  readonly receiptForm = new FormGroup({
    receivedQuantity: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    unitPurchaseCost: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    receiptDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] })
  });

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<RawMaterial[]>('/api/raw-materials')
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '', unit: 'STEM', quantity: 0, initialUnitCost: null });
    this.selectedFile.set(null);
    this.fileError.set('');
    this.error.set('');
    this.dialogOpen.set(true);
  }

  openEdit(item: RawMaterial): void {
    this.editing.set(item);
    this.form.reset({
      name: item.name,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      initialUnitCost: item.averageUnitCost
    });
    this.selectedFile.set(null);
    this.fileError.set('');
    this.error.set('');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) this.dialogOpen.set(false);
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.selectedFile.set(file);
    this.fileError.set(imageFileError(file));
  }

  submit(): void {
    if (this.form.invalid || this.fileError() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const data = new FormData();
    data.append('name', value.name.trim());
    data.append('description', value.description.trim());
    data.append('unit', value.unit);
    if (!this.editing()) {
      data.append('quantity', String(value.quantity));
      if (value.initialUnitCost !== null) {
        data.append('initialUnitCost', String(value.initialUnitCost));
      }
    }
    if (this.selectedFile()) data.append('image', this.selectedFile()!);

    this.saving.set(true);
    this.error.set('');
    const current = this.editing();
    const request = current
      ? this.http.put<RawMaterial>(`/api/raw-materials/${current.id}`, data)
      : this.http.post<RawMaterial>('/api/raw-materials', data);

    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.dialogOpen.set(false);
        this.load();
      },
      error: (error) => this.error.set(apiErrorMessage(error))
    });
  }

  remove(item: RawMaterial): void {
    if (!window.confirm(`Delete raw material “${item.name}”?`)) return;
    this.error.set('');
    this.http.delete<void>(`/api/raw-materials/${item.id}`).subscribe({
      next: () => this.items.update((items) => items.filter((candidate) => candidate.id !== item.id)),
      error: (error) => this.error.set(apiErrorMessage(error))
    });
  }

  openReceipt(item: RawMaterial): void {
    this.receivingMaterial.set(item);
    this.receiptForm.reset({
      receivedQuantity: null,
      unitPurchaseCost: null,
      receiptDate: this.today(),
      notes: ''
    });
    this.error.set('');
    this.receiptDialogOpen.set(true);
  }

  closeReceiptDialog(): void {
    if (!this.receiving()) this.receiptDialogOpen.set(false);
  }

  submitReceipt(): void {
    const material = this.receivingMaterial();
    if (!material || this.receiptForm.invalid || this.receiving()) {
      this.receiptForm.markAllAsTouched();
      return;
    }

    this.receiving.set(true);
    this.error.set('');
    this.http.post<RawMaterial>(`/api/raw-materials/${material.id}/receipts`, this.receiptForm.getRawValue())
      .pipe(finalize(() => this.receiving.set(false)))
      .subscribe({
        next: (updated) => {
          this.items.update((items) => items.map((item) => item.id === updated.id ? updated : item));
          this.receiptDialogOpen.set(false);
        },
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }

  initialStockValue(): number {
    const { quantity, initialUnitCost } = this.form.getRawValue();
    return quantity * (initialUnitCost ?? 0);
  }

  receiptValue(): number {
    const { receivedQuantity, unitPurchaseCost } = this.receiptForm.getRawValue();
    return (receivedQuantity ?? 0) * (unitPurchaseCost ?? 0);
  }

  imageUrl(item: RawMaterial): string {
    return `/api/raw-materials/${item.id}/image?v=${encodeURIComponent(item.updatedAt)}`;
  }

  unitLabel(value: string): string {
    return this.units.find((unit) => unit.value === value)?.label ?? value;
  }

  private today(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
