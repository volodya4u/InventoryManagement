import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, switchMap, tap } from 'rxjs';
import { AuthUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  private readonly expiryKey = 'flower-shop.session-expiry';
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private expiresAt = 0;
  private checkingSession = false;
  sessionVersion = 0;

  constructor(private readonly http: HttpClient, private readonly router: Router, destroyRef: DestroyRef) {
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== this.expiryKey || !this.user()) return;
      if (event.newValue === null) this.expireSession();
      else this.setDeadline(Number(event.newValue));
    };
    const resumed = () => this.checkDeadline();
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', resumed);
    document.addEventListener('visibilitychange', resumed);
    destroyRef.onDestroy(() => {
      clearTimeout(this.expiryTimer);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', resumed);
      document.removeEventListener('visibilitychange', resumed);
    });
  }

  recordActivity(timeoutSeconds: number): void {
    if (!Number.isFinite(timeoutSeconds)) return;
    const deadline = timeoutSeconds > 0 ? Date.now() + timeoutSeconds * 1000 : 0;
    this.setDeadline(deadline);
    try { localStorage.setItem(this.expiryKey, String(deadline)); } catch { /* Storage may be disabled. */ }
  }

  canSendProtectedRequest(): boolean {
    if (!this.user()) {
      this.expireSession(true);
      return false;
    }
    this.checkDeadline();
    return this.user() !== null;
  }

  expireSession(forceRedirect = false): void {
    const wasSignedIn = this.user() !== null;
    this.clearSession();
    if (wasSignedIn || forceRedirect) {
      void this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' }, replaceUrl: true });
    }
  }

  // A forbidden write may mean either expired authentication or a genuine CSRF/permission error.
  checkSession(): void {
    if (!this.user() || this.checkingSession) return;
    this.checkingSession = true;
    this.ensureAuthenticated().pipe(finalize(() => this.checkingSession = false)).subscribe({ error: () => {} });
  }

  private setDeadline(deadline: number): void {
    if (!Number.isFinite(deadline) || deadline < 0) return;
    clearTimeout(this.expiryTimer);
    this.expiresAt = deadline;
    if (deadline > 0) {
      this.expiryTimer = setTimeout(() => this.checkDeadline(),
        Math.min(Math.max(deadline - Date.now(), 0), 2_147_483_647));
    }
  }

  private checkDeadline(): void {
    if (!this.user() || this.expiresAt === 0) return;
    // Read the latest deadline even if a background tab has delayed its storage events.
    try {
      const shared = localStorage.getItem(this.expiryKey);
      if (shared !== null) this.setDeadline(Number(shared));
    } catch { /* The local timer also works without storage. */ }
    if (this.expiresAt > 0 && Date.now() >= this.expiresAt) this.expireSession();
    else this.setDeadline(this.expiresAt);
  }

  private clearSession(): void {
    this.sessionVersion++;
    this.user.set(null);
    this.setDeadline(0);
    try { localStorage.removeItem(this.expiryKey); } catch { /* Storage may be disabled. */ }
  }

  ensureAuthenticated(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/me').pipe(
      tap((user) => this.user.set(user))
    );
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http.get('/api/auth/csrf').pipe(
      switchMap(() =>
        this.http.post<AuthUser>('/api/auth/login', { username, password })
      ),
      tap((user) => this.user.set(user))
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      tap(() => this.clearSession())
    );
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Observable<void> {
    return this.http.post<void>('/api/auth/change-password', {
      currentPassword,
      newPassword,
      newPasswordConfirmation
    }).pipe(
      tap(() => this.clearSession())
    );
  }
}
