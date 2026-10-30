import { Api, type Product, type RawMaterial } from './api';

// Shared setup of the sales specs: a product that has been produced from three materials, so it has stock and an average
// cost. 1 peony bunch (50.00) + 2 ribbon metres (8.00 each) + 1 sheet of paper (3.00) cost 69.00 a unit; with a markup of
// 30 % the selling price is 89.70. `tag` keeps the names apart between tests, which share one database.
export async function producedBouquet(baseURL: string, tag: string, units = 5): Promise<{ api: Api; product: Product; peony: RawMaterial }> {
  const api = await Api.signIn(baseURL);
  const peony = await api.rawMaterial({ name: `Peony ${tag}`, unit: 'BUNCH', quantity: 50, initialUnitCost: 50 });
  const ribbon = await api.rawMaterial({ name: `Ribbon ${tag}`, unit: 'METER', quantity: 100, initialUnitCost: 8 });
  const paper = await api.rawMaterial({ name: `Paper ${tag}`, unit: 'PIECE', quantity: 50, initialUnitCost: 3 });
  const product = await api.product({
    sku: `BQ-${tag}`,
    name: `Bouquet ${tag}`,
    markupPercentage: 30,
    recipe: [
      { rawMaterialId: peony.id, quantityPerUnit: 1 },
      { rawMaterialId: ribbon.id, quantityPerUnit: 2 },
      { rawMaterialId: paper.id, quantityPerUnit: 1 },
    ],
  });
  await api.produce(product.id, units);
  return { api, product, peony };
}
