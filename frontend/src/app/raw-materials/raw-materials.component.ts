import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { imageFileError } from '../core/image-file';
import { RawMaterial } from '../core/models';

interface UnitOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-raw-materials',
  imports: [ReactiveFormsModule],
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
    quantity: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] })
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
    this.form.reset({ name: '', description: '', unit: 'STEM', quantity: 0 });
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
      quantity: item.quantity
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
    data.append('quantity', String(value.quantity));
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

  imageUrl(item: RawMaterial): string {
    return `/api/raw-materials/${item.id}/image?v=${encodeURIComponent(item.updatedAt)}`;
  }

  unitLabel(value: string): string {
    return this.units.find((unit) => unit.value === value)?.label ?? value;
  }
}
