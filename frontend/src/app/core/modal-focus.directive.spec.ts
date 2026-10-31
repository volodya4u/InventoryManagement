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

  // @trace FR-150
  it('focuses the parent dialog when a completed action removes the nested opener', async () => {
    const parent = document.createElement('section');
    parent.setAttribute('role', 'dialog');
    const parentClose = document.createElement('button');
    parent.append(parentClose, opener);
    document.body.append(parent);
    opener.focus();
    const childClose = document.createElement('button');
    dialog.append(childClose);

    directive = new ModalFocusDirective(new ElementRef(dialog));
    directive.ngAfterViewInit();
    expect(document.activeElement).toBe(childClose);

    opener.remove();
    directive.ngOnDestroy();
    directive = undefined;
    await Promise.resolve();
    expect(document.activeElement).toBe(parentClose);
    parent.remove();
  });

  // @trace FR-150
  it('checks the nested opener again after the parent rerenders', async () => {
    const parent = document.createElement('section');
    parent.setAttribute('role', 'dialog');
    const parentClose = document.createElement('button');
    parent.append(parentClose, opener);
    document.body.append(parent);
    opener.focus();
    dialog.append(document.createElement('button'));

    directive = new ModalFocusDirective(new ElementRef(dialog));
    directive.ngAfterViewInit();
    directive.ngOnDestroy();
    directive = undefined;
    expect(document.activeElement).toBe(opener);
    opener.remove();
    await Promise.resolve();
    expect(document.activeElement).toBe(parentClose);
    parent.remove();
  });

  // @trace FR-150
  it('focuses a page control when a table update removes the opener', async () => {
    const main = document.createElement('main');
    const addButton = document.createElement('button');
    main.append(addButton, opener);
    document.body.append(main);
    opener.focus();
    dialog.append(document.createElement('button'));

    directive = new ModalFocusDirective(new ElementRef(dialog));
    directive.ngAfterViewInit();
    directive.ngOnDestroy();
    directive = undefined;
    opener.remove();
    await Promise.resolve();
    expect(document.activeElement).toBe(addButton);
    main.remove();
  });
});
