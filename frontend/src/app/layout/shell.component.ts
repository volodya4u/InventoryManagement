import { Component, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  readonly menuOpen = signal(false);
  readonly loggingOut = signal(false);

  constructor(
    readonly auth: AuthService,
    private readonly router: Router
  ) {}

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.auth.logout()
      .pipe(finalize(() => this.loggingOut.set(false)))
      .subscribe({
        next: () => this.router.navigateByUrl('/login'),
        error: () => this.router.navigateByUrl('/login')
      });
  }
}

