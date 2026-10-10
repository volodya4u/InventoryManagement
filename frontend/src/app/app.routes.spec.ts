import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { routes } from './app.routes';
import { authGuard } from './core/auth.guard';
import { AuthService } from './core/auth.service';

describe('app routes', () => {
  const shell = routes.find((route) => route.path === '' && route.children);

  // @trace FR-34
  it('keeps the login page public and every other page behind authGuard in the shell', () => {
    const login = routes.find((route) => route.path === 'login');
    expect(login?.canActivate).toBeUndefined();
    expect(login?.canActivateChild).toBeUndefined();

    expect(shell?.component).toBeDefined();
    expect(shell?.canActivateChild).toEqual([authGuard]);
    expect(shell?.children?.map((route) => route.path)).toEqual([
      'dashboard',
      'raw-materials',
      'products',
      'sales',
      'stock-movements',
      'reports/monthly-sales',
      'change-password',
      '',
    ]);
  });

  // @trace FR-34
  it('lazy-loads every page behind the shell', () => {
    const pages = shell?.children?.filter((route) => route.path !== '') ?? [];
    expect(pages).toHaveLength(7);
    for (const page of pages) {
      expect(page.loadComponent).toBeDefined();
      expect(page.component).toBeUndefined();
    }
  });

  // @trace FR-34
  it('sends the empty path and any unknown path to the dashboard', () => {
    const empty = shell?.children?.find((route) => route.path === '');
    expect(empty?.redirectTo).toBe('dashboard');
    expect(empty?.pathMatch).toBe('full');

    const unknown = routes.find((route) => route.path === '**');
    expect(unknown?.redirectTo).toBe('dashboard');
    expect(routes.at(-1)).toBe(unknown);
  });
});

describe('authGuard', () => {
  let router: Router;
  let session: Observable<unknown>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { ensureAuthenticated: () => session } },
      ],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => TestBed.resetTestingModule());

  function runGuard(): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
      firstValueFrom(
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot) as Observable<unknown>,
      ),
    );
  }

  // @trace FR-34
  it('lets a signed-in user through', async () => {
    session = of({ username: 'admin', role: 'ADMIN' });
    expect(await runGuard()).toBe(true);
  });

  // @trace FR-34
  it('sends a user without a session to the login page', async () => {
    session = throwError(() => new Error('401'));
    const result = await runGuard();
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/login');
  });
});
