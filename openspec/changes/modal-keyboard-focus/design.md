# Design — modal-keyboard-focus

The ten existing dialogs already have `role="dialog"` and `aria-modal="true"`, but these attributes do not manage keyboard focus. A standalone directive on each dialog card will capture the active opener before the dialog renders, focus its first enabled visible control after the view initializes, intercept Tab at the first and last controls, and restore focus to a still-connected opener when the dialog is destroyed. The directive keeps the behavior in one place while the three features retain their existing open and close methods.

The test exercises the real Raw Materials template with keyboard activation, both wrap directions and close. Companion tests check that the Products and Sales templates use the same behavior. The directive uses DOM focus and key events only; it adds no package or API dependency.
