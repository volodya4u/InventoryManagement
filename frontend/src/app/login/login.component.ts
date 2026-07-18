import { Component, OnDestroy, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { TimedPasswordVisibility } from '../core/timed-password-visibility';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnDestroy {
  private readonly passwordVisibility = new TimedPasswordVisibility();

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly showPassword = this.passwordVisibility.visible;

  readonly form = new FormGroup({
    username: new FormControl('admin', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    route: ActivatedRoute
  ) {
    if (route.snapshot.queryParamMap.get('passwordChanged') === 'true') {
      this.notice.set('Password changed successfully. Sign in with your new password.');
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisibility.toggle();
  }

  ngOnDestroy(): void {
    this.passwordVisibility.destroy();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username.trim(), password)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl('/dashboard'),
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }
}
