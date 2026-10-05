import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;
  let requests: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const user = { username: 'admin', role: 'ADMIN' as const };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    requests = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('loads the authenticated user and stores it in the session signal', () => {
    const received = vi.fn();

    auth.ensureAuthenticated().subscribe(received);
    const request = requests.expectOne('/api/auth/me');
    expect(request.request.method).toBe('GET');
    request.flush(user);

    expect(received).toHaveBeenCalledWith(user);
    expect(auth.user()).toEqual(user);
  });

  it('fetches CSRF before posting login credentials and storing the user', () => {
    const received = vi.fn();

    auth.login('admin', 'secret').subscribe(received);
    requests.expectOne({ method: 'GET', url: '/api/auth/csrf' }).flush({ token: 'csrf' });
    const login = requests.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(login.request.body).toEqual({ username: 'admin', password: 'secret' });
    login.flush(user);

    expect(received).toHaveBeenCalledWith(user);
    expect(auth.user()).toEqual(user);
  });

  it('logs out and clears all local session state', () => {
    auth.user.set(user);
    auth.recordActivity(60);
    expect(localStorage.getItem('flower-shop.session-expiry')).not.toBeNull();

    auth.logout().subscribe();
    const logout = requests.expectOne({ method: 'POST', url: '/api/auth/logout' });
    expect(logout.request.body).toEqual({});
    logout.flush(null);

    expect(auth.user()).toBeNull();
    expect(auth.sessionVersion).toBe(1);
    expect(localStorage.getItem('flower-shop.session-expiry')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('changes the password and clears the authenticated session', () => {
    auth.user.set(user);

    auth.changePassword('old-secret', 'new-secret', 'new-secret').subscribe();
    const change = requests.expectOne({ method: 'POST', url: '/api/auth/change-password' });
    expect(change.request.body).toEqual({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
      newPasswordConfirmation: 'new-secret',
    });
    change.flush(null);

    expect(auth.user()).toBeNull();
    expect(auth.sessionVersion).toBe(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('coalesces concurrent session checks and permits a later recheck', () => {
    auth.user.set(user);

    auth.checkSession();
    auth.checkSession();
    requests.expectOne('/api/auth/me').flush(user);

    auth.checkSession();
    requests.expectOne('/api/auth/me').flush(user);
    expect(auth.user()).toEqual(user);
  });
});
