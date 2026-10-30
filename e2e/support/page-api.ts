import type { Page } from '@playwright/test';

// A request the page itself makes, with its own cookies and the CSRF token it holds, as a script running in the page would.
// It is how a spec shows the server's own answer to something the page's forms never send (a write-off larger than the
// stock, a return that exceeds what was sold): the page refuses those first, so the answer cannot be seen through the form.

export interface PageResponse {
  status: number;
  text: string;
  json: Record<string, unknown> | null;
}

export function pageRequest(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  multipart?: Record<string, string>,
): Promise<PageResponse> {
  return page.evaluate(
    async ([m, p, jsonBody, fields]) => {
      const token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.slice(11) ?? '';
      const headers: Record<string, string> = { 'X-XSRF-TOKEN': token };
      let payload: BodyInit | undefined;
      if (fields) {
        const form = new FormData();
        for (const [name, value] of Object.entries(fields)) form.append(name, value);
        payload = form;
      } else if (jsonBody !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(jsonBody);
      }
      const response = await fetch(p, { method: m, headers, body: payload, credentials: 'same-origin' });
      const text = await response.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, text, json };
    },
    [method, path, body, multipart] as const,
  );
}
