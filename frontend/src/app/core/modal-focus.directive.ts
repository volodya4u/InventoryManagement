import { AfterViewInit, Directive, ElementRef, OnDestroy } from '@angular/core';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

@Directive({ selector: '[appModalFocus]' })
export class ModalFocusDirective implements AfterViewInit, OnDestroy {
  private readonly opener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private readonly dialog: HTMLElement;

  constructor(element: ElementRef<HTMLElement>) {
    this.dialog = element.nativeElement;
  }

  ngAfterViewInit(): void {
    this.dialog.addEventListener('keydown', this.onKeyDown);
    (this.focusable()[0] ?? this.dialog).focus();
  }

  ngOnDestroy(): void {
    this.dialog.removeEventListener('keydown', this.onKeyDown);
    if (this.opener?.isConnected) this.opener.focus();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const controls = this.focusable();
    const first = controls[0] ?? this.dialog;
    const last = controls.at(-1) ?? this.dialog;
    const active = document.activeElement;
    if (
      event.shiftKey
        ? active === first || !this.dialog.contains(active)
        : active === last || !this.dialog.contains(active)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  private focusable(): HTMLElement[] {
    return Array.from(this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) =>
        !element.closest('[hidden], [inert]') && getComputedStyle(element).visibility !== 'hidden',
    );
  }
}
