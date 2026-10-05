import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
  });

  it('shows the inventory summary', () => {
    expect(component.loading()).toBe(true);
    requests.expectOne('/api/dashboard').flush({
      rawMaterialTypes: 3,
      productTypes: 2,
      productUnits: 12.5,
      salesCount: 7,
      lowStockRawMaterials: 1,
    });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    const values = [...fixture.nativeElement.querySelectorAll('strong')].map((element) =>
      element.textContent.trim(),
    );
    expect(values).toEqual(['3', '2', '12.5', '7', '1']);
  });

  it('shows the API error instead of the numbers', () => {
    requests
      .expectOne('/api/dashboard')
      .flush({ detail: 'Database is busy.' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.summary()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Database is busy.');
    const values = [...fixture.nativeElement.querySelectorAll('strong')].map((element) =>
      element.textContent.trim(),
    );
    expect(values).toEqual(['—', '—', '—', '—', '—']);
  });

  it('loads again on demand and clears the previous error', () => {
    requests.expectOne('/api/dashboard').flush(null, { status: 500, statusText: 'Error' });
    expect(component.error()).not.toBe('');

    component.load();
    expect(component.error()).toBe('');
    requests.expectOne('/api/dashboard').flush({
      rawMaterialTypes: 1,
      productTypes: 1,
      productUnits: 1,
      salesCount: 0,
      lowStockRawMaterials: 0,
    });
    expect(component.summary()?.salesCount).toBe(0);
  });

  it('shows the low-stock raw material count', () => {
    requests.expectOne('/api/dashboard').flush({
      rawMaterialTypes: 4,
      productTypes: 2,
      productUnits: 10,
      salesCount: 3,
      lowStockRawMaterials: 2,
    });
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.low-stock-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Low Stock');
    expect(card.querySelector('strong').textContent.trim()).toBe('2');
  });
});
