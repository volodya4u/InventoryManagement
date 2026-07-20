import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { imageFileError } from '../core/image-file';
import { Product, RawMaterial } from '../core/models';

type RecipeFormGroup = FormGroup<{
  rawMaterialId: FormControl<number | null>;
  quantityPerUnit: FormControl<number | null>;
}>;

interface ProductionRequirement {
  rawMaterialId: number;
  name: string;
  unit: string;
  required: number;
  available: number;
  missing: number;
  cost: number;
}

function productFormValidator(control: AbstractControl): ValidationErrors | null {
  const quantity = Number(control.get('quantity')?.value ?? 0);
  const initialUnitCost = control.get('initialUnitCost')?.value;
  const recipe = control.get('recipe') as FormArray | null;
  const errors: ValidationErrors = {};
  if (quantity > 0 && (initialUnitCost === null || initialUnitCost === '')) {
    errors['initialUnitCostRequired'] = true;
  }
  if (!recipe || recipe.length === 0) {
    errors['recipeRequired'] = true;
  }
  return Object.keys(errors).length === 0 ? null : errors;
}

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  readonly items = signal<Product[]>([]);
  readonly rawMaterials = signal<RawMaterial[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly dialogOpen = signal(false);
  readonly editing = signal<Product | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal('');
  readonly productionDialogOpen = signal(false);
  readonly producing = signal(false);
  readonly productionProduct = signal<Product | null>(null);
  readonly productionError = signal('');

  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(60)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    quantity: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]
    }),
    initialUnitCost: new FormControl<number | null>(null, [Validators.min(0)]),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    recipe: new FormArray<RecipeFormGroup>([])
  }, { validators: productFormValidator });

  readonly productionForm = new FormGroup({
    quantity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]),
    productionDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] })
  });

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  get recipeControls(): RecipeFormGroup[] {
    return this.form.controls.recipe.controls;
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      products: this.http.get<Product[]>('/api/products'),
      rawMaterials: this.http.get<RawMaterial[]>('/api/raw-materials')
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ products, rawMaterials }) => {
          this.items.set(products);
          this.rawMaterials.set(rawMaterials);
        },
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({
      sku: '',
      name: '',
      description: '',
      quantity: 0,
      initialUnitCost: null,
      price: 0
    });
    this.form.controls.recipe.clear();
    this.addRecipeItem();
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
      initialUnitCost: item.averageUnitCost,
      price: item.price
    });
    this.form.controls.recipe.clear();
    for (const recipeItem of item.recipe) {
      this.form.controls.recipe.push(this.createRecipeRow(
        recipeItem.rawMaterialId,
        recipeItem.quantityPerUnit
      ));
    }
    if (item.recipe.length === 0) this.addRecipeItem();
    this.selectedFile.set(null);
    this.fileError.set('');
    this.error.set('');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    if (!this.saving()) this.dialogOpen.set(false);
  }

  addRecipeItem(): void {
    this.form.controls.recipe.push(this.createRecipeRow());
    this.form.updateValueAndValidity();
  }

  removeRecipeItem(index: number): void {
    this.form.controls.recipe.removeAt(index);
    this.form.updateValueAndValidity();
  }

  materialSelectedElsewhere(rawMaterialId: number, currentIndex: number): boolean {
    return this.recipeControls.some((row, index) =>
      index !== currentIndex && row.controls.rawMaterialId.value === rawMaterialId
    );
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
    const recipe = value.recipe.map((item) => ({
      rawMaterialId: item.rawMaterialId!,
      quantityPerUnit: item.quantityPerUnit!
    }));
    const data = new FormData();
    data.append('sku', value.sku.trim());
    data.append('name', value.name.trim());
    data.append('description', value.description.trim());
    data.append('price', String(value.price));
    data.append('recipe', new Blob([JSON.stringify(recipe)], { type: 'application/json' }), 'recipe.json');
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

  openProduction(item: Product): void {
    this.productionProduct.set(item);
    this.productionForm.reset({ quantity: null, productionDate: this.today(), notes: '' });
    this.productionError.set('');
    this.error.set('');
    this.productionDialogOpen.set(true);
  }

  closeProductionDialog(): void {
    if (!this.producing()) this.productionDialogOpen.set(false);
  }

  productionRequirements(): ProductionRequirement[] {
    const product = this.productionProduct();
    const quantity = this.productionForm.controls.quantity.value ?? 0;
    if (!product || quantity <= 0) return [];
    return product.recipe.map((recipeItem) => {
      const material = this.rawMaterials().find((candidate) => candidate.id === recipeItem.rawMaterialId);
      const available = material?.quantity ?? recipeItem.availableQuantity;
      const required = recipeItem.quantityPerUnit * quantity;
      return {
        rawMaterialId: recipeItem.rawMaterialId,
        name: recipeItem.rawMaterialName,
        unit: recipeItem.unit,
        required,
        available,
        missing: Math.max(required - available, 0),
        cost: required * (material?.averageUnitCost ?? recipeItem.averageUnitCost)
      };
    });
  }

  hasProductionShortage(): boolean {
    return this.productionRequirements().some((requirement) => requirement.missing > 0);
  }

  maximumProducible(): number {
    const product = this.productionProduct();
    if (!product || product.recipe.length === 0) return 0;
    return Math.max(0, Math.floor(Math.min(...product.recipe.map((recipeItem) => {
      const material = this.rawMaterials().find((candidate) => candidate.id === recipeItem.rawMaterialId);
      return (material?.quantity ?? recipeItem.availableQuantity) / recipeItem.quantityPerUnit;
    }))));
  }

  estimatedProductionCost(): number {
    return this.productionRequirements().reduce((total, requirement) => total + requirement.cost, 0);
  }

  submitProduction(): void {
    const product = this.productionProduct();
    if (!product || this.productionForm.invalid || this.hasProductionShortage() || this.producing()) {
      this.productionForm.markAllAsTouched();
      return;
    }
    this.producing.set(true);
    this.productionError.set('');
    this.http.post<Product>(`/api/products/${product.id}/production`, this.productionForm.getRawValue())
      .pipe(finalize(() => this.producing.set(false)))
      .subscribe({
        next: () => {
          this.productionDialogOpen.set(false);
          this.load();
        },
        error: (error) => this.productionError.set(apiErrorMessage(error))
      });
  }

  initialStockValue(): number {
    const { quantity, initialUnitCost } = this.form.getRawValue();
    return quantity * (initialUnitCost ?? 0);
  }

  estimatedRecipeUnitCost(): number {
    return this.recipeControls.reduce((total, row) => {
      const material = this.rawMaterials().find(
        (candidate) => candidate.id === row.controls.rawMaterialId.value
      );
      return total + (row.controls.quantityPerUnit.value ?? 0) * (material?.averageUnitCost ?? 0);
    }, 0);
  }

  recipeSummary(item: Product): string {
    return item.recipe
      .map((recipeItem) => `${recipeItem.quantityPerUnit} ${this.unitLabel(recipeItem.unit)} ${recipeItem.rawMaterialName}`)
      .join(' · ');
  }

  unitLabel(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
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

  private createRecipeRow(rawMaterialId: number | null = null, quantityPerUnit: number | null = null): RecipeFormGroup {
    return new FormGroup({
      rawMaterialId: new FormControl<number | null>(rawMaterialId, [Validators.required]),
      quantityPerUnit: new FormControl<number | null>(quantityPerUnit, [Validators.required, Validators.min(0.0001)])
    });
  }

  private today(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
