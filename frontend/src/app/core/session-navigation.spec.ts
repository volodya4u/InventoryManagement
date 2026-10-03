import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../app.config';
import { RawMaterialsComponent } from '../raw-materials/raw-materials.component';
import { AuthService } from './auth.service';

describe('protected material page', () => {
  let requests: HttpTestingController;
  const user = { username: 'admin', role: 'ADMIN' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it.each([
    '/dashboard',
    '/raw-materials',
    '/products',
    '/sales',
    '/stock-movements',
    '/reports/monthly-sales',
    '/change-password',
  ])('redirects an unauthorized visit to %s without showing the page', async (url) => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url);
    await vi.waitFor(() =>
      requests.expectOne('/api/auth/me').flush(
        {},
        {
          status: 401,
          statusText: 'Unauthorized',
        },
      ),
    );
    await navigation;
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.fixture.nativeElement.querySelector('.app-shell')).toBeNull();
    requests.expectNone(() => true);
  });

  it('removes the material form and goes to login when the pre-save session check fails', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/raw-materials');
    await vi.waitFor(() =>
      requests.expectOne('/api/auth/me').flush(user, {
        headers: { 'X-Session-Timeout-Seconds': '60' },
      }),
    );
    await navigation;
    requests.expectOne('/api/raw-materials').flush([]);
    harness.detectChanges();
    const materials = harness.routeDebugElement!.query(By.directive(RawMaterialsComponent))
      .componentInstance as RawMaterialsComponent;
    materials.openCreate();
    materials.form.controls.name.setValue('Rose');
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('#raw-name')).not.toBeNull();

    materials.submit();
    requests.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    requests.expectNone('/api/raw-materials');
    harness.detectChanges();
    // The protected form is removed even while navigation is still pending.
    expect(harness.fixture.nativeElement.querySelector('#raw-name')).toBeNull();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login?sessionExpired=true');
    expect(TestBed.inject(AuthService).user()).toBeNull();
    expect(materials.saveError()).toBe('');
    expect(materials.saving()).toBe(false);
  });

  it('rechecks authentication when moving between protected child pages', async () => {
    const harness = await RouterTestingHarness.create();
    const first = harness.navigateByUrl('/raw-materials');
    await vi.waitFor(() => requests.expectOne('/api/auth/me').flush(user));
    await first;
    requests.expectOne('/api/raw-materials').flush([]);

    const second = harness.navigateByUrl('/products');
    await vi.waitFor(() =>
      requests.expectOne('/api/auth/me').flush(
        {},
        {
          status: 401,
          statusText: 'Unauthorized',
        },
      ),
    );
    await second;
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('/login');
    requests.expectNone('/api/products');
    expect(harness.fixture.nativeElement.querySelector('.app-shell')).toBeNull();
  });
});
