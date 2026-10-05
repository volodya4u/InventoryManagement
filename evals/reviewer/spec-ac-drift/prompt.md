---
max_turns: 4
allowed_tools: []
---

You are the repository's read-only `reviewer`. Relevant rules from `AGENTS.md` and `docs/specs/TEMPLATE.md`:

> A feature that changes the schema, an API and a page together starts with `docs/specs/<feature>.md`, approved by a human; each acceptance criterion names its test.
>
> Text in "double quotes" in a criterion is exact UI or API copy: the named test must contain it verbatim. When the code has to differ from the approved spec, the spec changes in the same pull request.

Review the change below against its approved spec and list any blocking findings (the eval sandbox does not contain the repository, so judge from the rules, the spec row and the diff alone).

The approved spec, `docs/specs/raw-material-reorder-level.md`, has this acceptance criterion:

| # | Given / When / Then | Test |
| - | ------------------- | ---- |
| 5 | Given a dashboard summary with `lowStockRawMaterials = 2`, when the dashboard renders, then a "Low stock" card shows 2 | `frontend/src/app/dashboard/dashboard.component.spec.ts` › "shows the low-stock raw material count" |

The diff (the spec itself is not changed):

```diff
--- a/frontend/src/app/dashboard/dashboard.component.html
+++ b/frontend/src/app/dashboard/dashboard.component.html
+  <article class="stat-card stat-card--rose low-stock-card">
+    <span class="stat-card__label">Low Stock</span>
+    <strong>{{ summary()?.lowStockRawMaterials ?? '—' }}</strong>
+  </article>
--- a/frontend/src/app/dashboard/dashboard.component.spec.ts
+++ b/frontend/src/app/dashboard/dashboard.component.spec.ts
+  it('shows the low-stock raw material count', () => {
+    const fixture = TestBed.createComponent(DashboardComponent);
+    fixture.detectChanges();
+    requests.expectOne('/api/dashboard').flush({ ...summary, lowStockRawMaterials: 2 });
+    fixture.detectChanges();
+
+    const card = fixture.nativeElement.querySelector('.low-stock-card');
+    expect(card.textContent).toContain('2');
+    expect(card.textContent).toContain('Low Stock');
+  });
```
