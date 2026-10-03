import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY, catchError, filter, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const auth = inject(AuthService);
  const path = request.url.split('?')[0];
  const publicRequest = path === '/api/auth/login' || path === '/api/auth/csrf';
  if (!publicRequest && path !== '/api/auth/me' && !auth.canSendProtectedRequest()) return EMPTY;
  const version = auth.sessionVersion;
  const send = () =>
    next(request).pipe(
      // Responses from before logout must not restore protected views or restart their timers.
      filter(() => version === auth.sessionVersion),
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            const timeout = event.headers.get('X-Session-Timeout-Seconds');
            if (timeout !== null) auth.recordActivity(Number(timeout));
          }
        },
      }),
      catchError((error: unknown) => {
        if (version !== auth.sessionVersion) return EMPTY;
        if (publicRequest || !(error instanceof HttpErrorResponse)) return throwError(() => error);
        if (error.status === 401) {
          auth.expireSession();
          // Route guards need the failed /me check; forms should not display a stale 401 error.
          return path === '/api/auth/me' ? throwError(() => error) : EMPTY;
        }
        const timeout = error.headers.get('X-Session-Timeout-Seconds');
        if (timeout !== null) auth.recordActivity(Number(timeout));
        if (error.status === 403 && path !== '/api/auth/me') auth.checkSession();
        return throwError(() => error);
      }),
    );

  const needsSessionCheck =
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    !publicRequest &&
    path !== '/api/auth/logout';
  if (!needsSessionCheck) return send();

  // Detect revoked sessions (for example after a server restart) before transmitting a save.
  // This is user-triggered, never an idle keep-alive, and the write itself still requires authentication.
  return auth.ensureAuthenticated().pipe(
    switchMap(() =>
      version === auth.sessionVersion && auth.canSendProtectedRequest() ? send() : EMPTY,
    ),
    catchError((error: unknown) =>
      error instanceof HttpErrorResponse && error.status === 401 ? EMPTY : throwError(() => error),
    ),
  );
};
