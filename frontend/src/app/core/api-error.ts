import { HttpErrorResponse } from '@angular/common/http';
import { ApiProblem } from './models';

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'An unexpected error occurred. Please try again.';
  }
  const problem = error.error as ApiProblem | string | null;
  if (typeof problem === 'string' && problem.trim()) {
    return problem;
  }
  if (problem && typeof problem === 'object') {
    return problem.detail || problem.message || problem.title || 'Unable to complete the request.';
  }
  if (error.status === 0) {
    return 'Unable to connect to the server.';
  }
  if (error.status === 401) {
    return 'Invalid username or password.';
  }
  return 'Unable to complete the request.';
}
