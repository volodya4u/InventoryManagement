import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { adminPassword, adminUsername } from './auth';

// Sets data up through the application's own API, signed in as the administrator, so a spec can start from the state it
// needs and show the one behaviour it is about. The pages are what a spec drives and asserts; this is only the setup.
// The handshake is the one SessionCookieHttpTest uses: GET /api/auth/csrf sets the XSRF-TOKEN cookie, which every write
// echoes in the X-XSRF-TOKEN header (a new token is issued by the login, so it is fetched again after it).

export type Unit = 'PIECE' | 'BUNCH' | 'GRAM' | 'KILOGRAM' | 'METER' | 'PACKAGE';

export interface RawMaterial {
  id: number;
  name: string;
  quantity: number;
  averageUnitCost: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  sellingPrice: number;
}

export interface Sale {
  id: number;
  saleNumber: string;
  items: { id: number; productId: number }[];
}

// Today's date as the date inputs write it (the browser's own calendar day, YYYY-MM-DD).
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export class Api {
  private constructor(
    private readonly context: APIRequestContext,
    private csrf: string,
  ) {}

  static async signIn(baseURL: string): Promise<Api> {
    const context = await request.newContext({ baseURL });
    const fetchToken = async () => ((await (await context.get('/api/auth/csrf')).json()) as { token: string }).token;
    const login = await context.post('/api/auth/login', {
      headers: { 'X-XSRF-TOKEN': await fetchToken() },
      data: { username: adminUsername, password: adminPassword() },
    });
    if (!login.ok()) throw new Error(`the setup sign-in failed with ${login.status()}`);
    return new Api(context, await fetchToken());
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  get(path: string): Promise<APIResponse> {
    return this.context.get(path);
  }

  private async created<T>(response: APIResponse): Promise<T> {
    if (!response.ok()) throw new Error(`${response.url()} answered ${response.status()}: ${await response.text()}`);
    return (await response.json()) as T;
  }

  private headers() {
    return { 'X-XSRF-TOKEN': this.csrf };
  }

  async rawMaterial(m: {
    name: string;
    unit?: Unit;
    quantity?: number;
    initialUnitCost?: number;
    reorderLevel?: number;
    description?: string;
  }): Promise<RawMaterial> {
    const multipart: Record<string, string> = {
      name: m.name,
      description: m.description ?? '',
      unit: m.unit ?? 'PIECE',
      quantity: String(m.quantity ?? 0),
      reorderLevel: String(m.reorderLevel ?? 0),
    };
    if (m.initialUnitCost !== undefined) multipart.initialUnitCost = String(m.initialUnitCost);
    return this.created(await this.context.post('/api/raw-materials', { headers: this.headers(), multipart }));
  }

  async product(p: {
    sku: string;
    name: string;
    recipe: { rawMaterialId: number; quantityPerUnit: number }[];
    markupPercentage?: number;
    advertisingCostPerUnit?: number;
    quantity?: number;
    initialUnitCost?: number;
  }): Promise<Product> {
    const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
      sku: p.sku,
      name: p.name,
      description: '',
      quantity: String(p.quantity ?? 0),
      markupPercentage: String(p.markupPercentage ?? 0),
      advertisingCostPerUnit: String(p.advertisingCostPerUnit ?? 0),
      recipe: { name: 'recipe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p.recipe)) },
    };
    if (p.initialUnitCost !== undefined) multipart.initialUnitCost = String(p.initialUnitCost);
    return this.created(await this.context.post('/api/products', { headers: this.headers(), multipart }));
  }

  async receipt(rawMaterialId: number, receivedQuantity: number, unitPurchaseCost: number): Promise<void> {
    await this.created(
      await this.context.post(`/api/raw-materials/${rawMaterialId}/receipts`, {
        headers: this.headers(),
        data: { receivedQuantity, unitPurchaseCost, receiptDate: today() },
      }),
    );
  }

  async produce(productId: number, quantity: number): Promise<void> {
    await this.created(
      await this.context.post(`/api/products/${productId}/production`, {
        headers: this.headers(),
        data: { quantity, productionDate: today() },
      }),
    );
  }

  async sale(
    items: { productId: number; quantity: number; unitPrice: number }[],
    paymentMethod = 'CASH',
    saleDate = today(),
  ): Promise<Sale> {
    return this.created(
      await this.context.post('/api/sales', {
        headers: this.headers(),
        data: { saleDate, paymentMethod, items },
      }),
    );
  }

  async returnItem(sale: Sale, quantity: number, returnDate: string): Promise<void> {
    await this.created(
      await this.context.post(`/api/sales/${sale.id}/returns`, {
        headers: this.headers(),
        data: { returnDate, reason: 'Customer Return', items: [{ saleItemId: sale.items[0].id, quantity }] },
      }),
    );
  }

  async cancel(sale: Sale, cancellationDate: string): Promise<void> {
    await this.created(
      await this.context.post(`/api/sales/${sale.id}/cancellation`, {
        headers: this.headers(),
        data: { cancellationDate, reason: 'Customer Cancelled' },
      }),
    );
  }
}
