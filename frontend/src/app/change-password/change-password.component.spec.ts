import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ChangePasswordComponent } from './change-password.component';

describe('ChangePasswordComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let component: ChangePasswordComponent;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    requests = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(AuthService).user.set({ username: 'admin', role: 'ADMIN' });
    fixture = TestBed.createComponent(ChangePasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function fill(currentPassword: string, newPassword: string, newPasswordConfirmation: string) {
    component.form.setValue({ currentPassword, newPassword, newPasswordConfirmation });
  }

  it('does not send a confirmation that differs from the new password', () => {
    fill('old-password', 'new-password-1', 'new-password-2');
    expect(component.form.hasError('passwordMismatch')).toBe(true);

    component.submit();
    requests.expectNone('/api/auth/change-password');
  });

  it('requires a new password of 10 to 64 characters', () => {
    fill('old-password', 'x'.repeat(9), 'x'.repeat(9));
    expect(component.form.controls.newPassword.hasError('minlength')).toBe(true);
    fill('old-password', 'x'.repeat(10), 'x'.repeat(10));
    expect(component.form.valid).toBe(true);
    fill('old-password', 'x'.repeat(64), 'x'.repeat(64));
    expect(component.form.valid).toBe(true);
    fill('old-password', 'x'.repeat(65), 'x'.repeat(65));
    expect(component.form.controls.newPassword.hasError('maxlength')).toBe(true);
  });

  it('changes the password, ends the session and asks to sign in again', () => {
    fill('old-password', 'new-password-1', 'new-password-1');
    component.submit();
    component.submit();

    const request = requests.expectOne({ method: 'POST', url: '/api/auth/change-password' });
    expect(request.request.body).toEqual({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
      newPasswordConfirmation: 'new-password-1',
    });
    request.flush(null);

    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { passwordChanged: 'true' },
      replaceUrl: true,
    });
    expect(TestBed.inject(AuthService).user()).toBeNull();
    expect(component.submitting()).toBe(false);
  });

  it('shows the server error and keeps the session', () => {
    fill('wrong-password', 'new-password-1', 'new-password-1');
    component.submit();

    requests
      .expectOne({ method: 'POST', url: '/api/auth/change-password' })
      .flush(
        { detail: 'The current password is incorrect.' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The current password is incorrect.');
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthService).user()).not.toBeNull();
    expect(component.submitting()).toBe(false);
  });
});
