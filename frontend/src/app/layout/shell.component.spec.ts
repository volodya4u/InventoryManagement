import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  let requests: HttpTestingController;
  let fixture: ComponentFixture<ShellComponent>;
  let component: ShellComponent;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    requests = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    TestBed.inject(AuthService).user.set({ username: 'admin', role: 'ADMIN' });
    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('opens the menu from the toggle and closes it from a link', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-expanded]');
    toggle.click();
    fixture.detectChanges();
    expect(component.menuOpen()).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    (fixture.nativeElement.querySelector('nav a') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(component.menuOpen()).toBe(false);
  });

  it('signs out once and goes to the login page', () => {
    component.logout();
    component.logout();
    expect(component.loggingOut()).toBe(true);

    requests.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null);
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(component.loggingOut()).toBe(false);
    expect(TestBed.inject(AuthService).user()).toBeNull();
  });

  it('still goes to the login page when signing out fails', () => {
    component.logout();
    requests
      .expectOne({ method: 'POST', url: '/api/auth/logout' })
      .flush(null, { status: 500, statusText: 'Error' });

    expect(navigate).toHaveBeenCalledWith('/login');
    expect(component.loggingOut()).toBe(false);
  });
});
