import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { sessionInterceptor } from './session.interceptor';

describe('session expiry', () => {
  let auth: AuthService;
  let http: HttpClient;
  let requests: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const user = { username: 'admin', role: 'ADMIN' as const };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  function signIn(timeout = 60): void {
    auth.ensureAuthenticated().subscribe();
    requests.expectOne('/api/auth/me').flush(user, {
      headers: { 'X-Session-Timeout-Seconds': String(timeout) },
    });
  }

  function allowSave(): void {
    requests
      .expectOne('/api/auth/me')
      .flush(user, { headers: { 'X-Session-Timeout-Seconds': '60' } });
  }

  it('clears an idle view at the server timeout without sending keep-alive requests', () => {
    signIn(8 * 60 * 60);
    vi.advanceTimersByTime(8 * 60 * 60 * 1000 - 1);
    expect(auth.user()).toEqual(user);
    vi.advanceTimersByTime(1);
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { sessionExpired: 'true' },
      replaceUrl: true,
    });
    requests.expectNone(() => true);
  });

  it('renews the deadline on API activity', () => {
    signIn();
    vi.advanceTimersByTime(30_000);
    http.get('/api/products').subscribe();
    requests
      .expectOne('/api/products')
      .flush([], { headers: { 'X-Session-Timeout-Seconds': '60' } });
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toEqual(user);
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toBeNull();
  });

  it('immediately clears authentication on a rejected protected request', () => {
    signIn();
    http.get('/api/products').subscribe({ error: () => {} });
    requests.expectOne('/api/products').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also counts authenticated validation failures as session activity', () => {
    signIn();
    vi.advanceTimersByTime(30_000);
    http.post('/api/sales', {}).subscribe({ error: () => {} });
    allowSave();
    requests.expectOne('/api/sales').flush(
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'X-Session-Timeout-Seconds': '60' },
      },
    );
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toEqual(user);
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toBeNull();
  });

  it('checks authentication after a forbidden write and redirects if the session is gone', () => {
    signIn();
    http.post('/api/sales', {}).subscribe({ error: () => {} });
    allowSave();
    requests.expectOne('/api/sales').flush({}, { status: 403, statusText: 'Forbidden' });
    requests.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid session after a genuine permission or CSRF failure', () => {
    signIn();
    http.post('/api/sales', {}).subscribe({ error: () => {} });
    allowSave();
    requests.expectOne('/api/sales').flush({}, { status: 403, statusText: 'Forbidden' });
    requests
      .expectOne('/api/auth/me')
      .flush(user, { headers: { 'X-Session-Timeout-Seconds': '60' } });
    expect(auth.user()).toEqual(user);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not treat wrong login credentials as expiry', () => {
    auth.login('admin', 'wrong').subscribe({ error: () => {} });
    requests.expectOne('/api/auth/csrf').flush({});
    requests.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not log out on network or server errors', () => {
    signIn();
    http.get('/api/products').subscribe({ error: () => {} });
    requests.expectOne('/api/products').flush({}, { status: 500, statusText: 'Server Error' });
    expect(auth.user()).toEqual(user);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cannot restore authentication from an in-flight response after expiry', () => {
    signIn();
    auth.ensureAuthenticated().subscribe();
    const pending = requests.expectOne('/api/auth/me');
    vi.advanceTimersByTime(60_000);
    pending.flush(user, { headers: { 'X-Session-Timeout-Seconds': '60' } });
    expect(auth.user()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses activity from another tab even if its storage event was delayed', () => {
    signIn();
    vi.advanceTimersByTime(30_000);
    localStorage.setItem('flower-shop.session-expiry', String(Date.now() + 60_000));
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toEqual(user);
    vi.advanceTimersByTime(30_000);
    expect(auth.user()).toBeNull();
  });

  it('clears a suspended view on focus when its deadline has passed', () => {
    signIn();
    vi.setSystemTime(Date.now() + 61_000);
    window.dispatchEvent(new Event('focus'));
    expect(auth.user()).toBeNull();
  });

  it('clears the view when another tab signs out', () => {
    signIn();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'flower-shop.session-expiry', newValue: null }),
    );
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('blocks Save before sending anything when the expiry timer has not run yet', () => {
    signIn();
    vi.setSystemTime(Date.now() + 61_000);
    http.post('/api/raw-materials', new FormData()).subscribe();
    requests.expectNone(() => true);
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('blocks protected requests when already signed out', () => {
    http.post('/api/raw-materials', new FormData()).subscribe();
    requests.expectNone(() => true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['POST', '/api/raw-materials'],
    ['PUT', '/api/raw-materials/1'],
    ['DELETE', '/api/raw-materials/1'],
    ['POST', '/api/raw-materials/1/receipts'],
    ['POST', '/api/raw-materials/1/write-offs'],
    ['POST', '/api/raw-materials/1/adjustments'],
    ['POST', '/api/products'],
    ['PUT', '/api/products/1'],
    ['DELETE', '/api/products/1'],
    ['POST', '/api/products/1/production'],
    ['POST', '/api/products/1/write-offs'],
    ['POST', '/api/products/1/adjustments'],
    ['POST', '/api/sales'],
    ['POST', '/api/sales/1/returns'],
    ['POST', '/api/sales/1/cancellation'],
    ['POST', '/api/auth/change-password'],
  ])('blocks %s %s when the server has revoked the session', (method, url) => {
    signIn();
    const error = vi.fn();
    http.request(method, url, { body: {} }).subscribe({ error });
    requests.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    requests.expectNone(url);
    expect(auth.user()).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('still permits a material save with a confirmed valid session', () => {
    signIn();
    const saved = vi.fn();
    http.post('/api/raw-materials', new FormData()).subscribe(saved);
    requests.expectNone('/api/raw-materials');
    allowSave();
    requests.expectOne('/api/raw-materials').flush({ id: 1 });
    expect(saved).toHaveBeenCalledWith({ id: 1 });
  });

  it('closes the view without showing a form error if the session expires during Save', () => {
    signIn();
    const error = vi.fn();
    http.post('/api/raw-materials', new FormData()).subscribe({ error });
    allowSave();
    requests.expectOne('/api/raw-materials').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});
