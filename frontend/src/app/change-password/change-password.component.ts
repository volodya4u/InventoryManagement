import { Component, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmation = control.get('newPasswordConfirmation')?.value;
  return newPassword === confirmation ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent {
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showNewPasswordConfirmation = signal(false);

  readonly form = new FormGroup({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10), Validators.maxLength(64)]
    }),
    newPasswordConfirmation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  }, { validators: matchingPasswords });

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.submitting.set(true);
    const { currentPassword, newPassword, newPasswordConfirmation } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, newPassword, newPasswordConfirmation)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/login'], {
          queryParams: { passwordChanged: 'true' },
          replaceUrl: true
        }),
        error: (error) => this.error.set(apiErrorMessage(error))
      });
  }
}
