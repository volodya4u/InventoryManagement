import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { imageFileError } from '../core/image-file';
import { Product } from '../core/models';

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  readonly items = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dialogOpen = signal(false);
  readonly editing = signal<Product | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal('');

  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    quantity: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] })
  });

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<Product[]>('/api/products')
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ sku: '', name: '', description: '', quantity: 0, price: 0 });
    this.selectedFile.set(null);
    this.fileError.set('');
    this.error.set('');
    this.dialogOpen.set(true);
  }

  openEdit(item: Product): void {
    this.editing.set(item);
    this.form.reset({
      sku: item.sku,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      price: item.price
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
    data.append('sku', value.sku.trim());
    data.append('name', value.name.trim());
    data.append('description', value.description.trim());
    data.append('quantity', String(value.quantity));
    data.append('price', String(value.price));
    if (this.selectedFile()) data.append('image', this.selectedFile()!);

    this.saving.set(true);
    this.error.set('');
    const current = this.editing();
    const request = current
      ? this.http.put<Product>(`/api/products/${current.id}`, data)
      : this.http.post<Product>('/api/products', data);

    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.dialogOpen.set(false);
        this.load();
      },
      error: (error) => this.error.set(apiErrorMessage(error))
    });
  }

  remove(item: Product): void {
    if (!window.confirm(`Delete product “${item.name}”?`)) return;
    this.error.set('');
    this.http.delete<void>(`/api/products/${item.id}`).subscribe({
      next: () => this.items.update((items) => items.filter((candidate) => candidate.id !== item.id)),
      error: (error) => this.error.set(apiErrorMessage(error))
    });
  }

  imageUrl(item: Product): string {
    return `/api/products/${item.id}/image?v=${encodeURIComponent(item.updatedAt)}`;
  }
}
