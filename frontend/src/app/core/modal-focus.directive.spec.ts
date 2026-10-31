import { ElementRef } from '@angular/core';
import { ModalFocusDirective } from './modal-focus.directive';

describe('ModalFocusDirective', () => {
  let opener: HTMLButtonElement;
  let dialog: HTMLElement;
  let directive: ModalFocusDirective | undefined;

  beforeEach(() => {
    opener = document.createElement('button');
    dialog = document.createElement('section');
    dialog.tabIndex = -1;
    document.body.append(opener, dialog);
    opener.focus();
  });

  afterEach(() => {
    directive?.ngOnDestroy();
    dialog.remove();
    opener.remove();
  });

  // @trace FR-150
  it('skips disabled and hidden controls when choosing the first focus target', () => {
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const hidden = document.createElement('button');
    hidden.style.visibility = 'hidden';
    const available = document.createElement('button');
    dialog.append(disabled, hidden, available);

    directive = new ModalFocusDirective(new ElementRef(dialog));
    directive.ngAfterViewInit();
    expect(document.activeElement).toBe(available);

    available.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(available);
    available.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(available);
  });

  // @trace FR-150
  it('keeps focus on a dialog whose controls are temporarily unavailable', () => {
    const disabled = document.createElement('button');
    disabled.disabled = true;
    dialog.append(disabled);

    directive = new ModalFocusDirective(new ElementRef(dialog));
    directive.ngAfterViewInit();
    expect(document.activeElement).toBe(dialog);
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(dialog);
  });
});
