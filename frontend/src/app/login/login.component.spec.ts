import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(queryParams: Record<string, string> = {}): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('tells the user the password was changed', () => {
    setup({ passwordChanged: 'true' });
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Password changed successfully',
    );
  });

  it('tells the user the session has ended', () => {
    setup({ sessionExpired: 'true' });
    expect(component.notice()).toBe('Your session has ended. Please sign in again.');
  });

  it('does not send an empty password', () => {
    setup();
    component.submit();

    expect(component.form.controls.password.touched).toBe(true);
    requests.expectNone('/api/auth/csrf');
  });

  it('signs in with the trimmed username and opens the dashboard', () => {
    setup();
    component.form.setValue({ username: '  admin ', password: ' secret ' });
    component.submit();
    expect(component.submitting()).toBe(true);

    requests.expectOne('/api/auth/csrf').flush({});
    const login = requests.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(login.request.body).toEqual({ username: 'admin', password: ' secret ' });
    login.flush({ username: 'admin', role: 'ADMIN' });

    expect(navigate).toHaveBeenCalledWith('/dashboard');
    expect(TestBed.inject(AuthService).user()).toEqual({ username: 'admin', role: 'ADMIN' });
    expect(component.submitting()).toBe(false);
  });

  it('shows why signing in failed and stays on the page', () => {
    setup();
    component.form.controls.password.setValue('wrong');
    component.submit();

    requests.expectOne('/api/auth/csrf').flush({});
    requests
      .expectOne({ method: 'POST', url: '/api/auth/login' })
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Invalid username or password.',
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it('shows the password for five seconds', () => {
    vi.useFakeTimers();
    setup();
    component.togglePasswordVisibility();
    expect(component.showPassword()).toBe(true);

    vi.advanceTimersByTime(4_999);
    expect(component.showPassword()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(component.showPassword()).toBe(false);
  });
});
