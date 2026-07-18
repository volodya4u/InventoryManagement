import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, switchMap, tap } from 'rxjs';
import { AuthUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);

  constructor(private readonly http: HttpClient) {}

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
      tap(() => this.user.set(null))
    );
  }
}

