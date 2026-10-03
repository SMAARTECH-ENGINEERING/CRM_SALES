import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { listMasterData } from '../api/masterData.api.js';
import { checkSku, createProduct, getProduct, updateProduct } from '../api/products.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import ProductFormPage from './ProductFormPage.jsx';

vi.mock('../api/products.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));
vi.mock('../api/masterData.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listMasterData: vi.fn(),
}));

// Deliberately unusual values: the form must show whatever the API returns.
const LISTS = {
  'product-categories': [{ id: 'c1', name: 'Zebra Goods', skuPrefix: 'ZG' }],
  units: [{ id: 'u1', name: 'Quokka Crate', symbol: 'qc' }],
  taxes: [{ id: 't1', name: 'Narwhal Levy', rate: 7.5 }],
};

const EXISTING = {
  id: 'p1',
  sku: 'ZG-000042',
  name: 'Existing Thing',
  basePrice: 500,
  costPrice: 300,
  status: 'active',
  categoryId: 'c1',
  category: LISTS['product-categories'][0],
  unitId: 'u1',
  unit: LISTS.units[0],
};

function renderPage(route = '/products/new') {
  return renderAs(
    <Routes>
      <Route path="/products/new" element={<ProductFormPage />} />
      <Route path="/products/:id/edit" element={<ProductFormPage />} />
      <Route path="/products/:id" element={<h1>Product page</h1>} />
    </Routes>,
    { route, permissions: ['products.read', 'products.create', 'products.update'] }
  );
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const select = async (label, option) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};
const save = (name) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  listLeadConfig.mockImplementation((resource) => Promise.resolve({ data: { items: LISTS[resource] ?? [] } }));
  listMasterData.mockResolvedValue({ data: { items: [] } });
  createProduct.mockResolvedValue({ data: { product: { id: 'new-1', name: 'Gizmo', sku: 'PRD-000009' } } });
  updateProduct.mockResolvedValue({ data: { product: { ...EXISTING } } });
  getProduct.mockResolvedValue({ data: { product: EXISTING } });
  checkSku.mockResolvedValue({ data: { sku: 'MY-SKU', available: true } });
});

afterEach(cleanup);

describe('ProductFormPage', () => {
  it('category, unit and tax options come from the API', async () => {
    renderPage();
    for (const resource of ['product-categories', 'units', 'taxes']) {
      await waitFor(() => expect(listLeadConfig).toHaveBeenCalledWith(resource, { isActive: true }, expect.anything()));
    }

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Unit' }));
    const unitOptions = await screen.findAllByRole('option');
    expect(unitOptions.map((o) => o.textContent)).toEqual(['None', 'Quokka Crate (qc)']);
    fireEvent.click(unitOptions[1]);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tax' }));
    // The unit menu may still be closing: look in the menu that is open.
    await waitFor(() => expect(screen.getAllByRole('option', { hidden: false }).map((o) => o.textContent)).toEqual(['None', 'Narwhal Levy (7.5%)']));
  });

  it('a blank SKU is not sent, so the server generates one', async () => {
    renderPage();
    type(/Name/, 'Gizmo');
    type(/^Price/, '49.5');
    save('Create product');

    await waitFor(() => expect(createProduct).toHaveBeenCalled());
    const sent = createProduct.mock.calls[0][0];
    expect('sku' in sent).toBe(false);
    expect(sent).toMatchObject({ name: 'Gizmo', basePrice: 49.5, costPrice: null, categoryId: null, status: 'active' });
    expect(await screen.findByText('Product page')).toBeTruthy();
    expect(await screen.findByText('Gizmo created as PRD-000009')).toBeTruthy();
  });

  it('a hand-entered SKU is checked against the API and sent in upper case', async () => {
    renderPage();
    type(/Name/, 'Gizmo');
    type(/^Price/, '10');
    type('SKU', 'my-sku');
    fireEvent.blur(screen.getByLabelText('SKU'));

    await waitFor(() => expect(checkSku).toHaveBeenCalledWith('MY-SKU'));
    expect(await screen.findByText('MY-SKU is available')).toBeTruthy();

    await select('Category', 'Zebra Goods');
    save('Create product');
    await waitFor(() => expect(createProduct).toHaveBeenCalled());
    expect(createProduct.mock.calls[0][0]).toMatchObject({ sku: 'MY-SKU', categoryId: 'c1' });
  });

  it('says when a SKU is already in use', async () => {
    checkSku.mockResolvedValue({ data: { sku: 'TAKEN-1', available: false } });
    renderPage();
    type('SKU', 'taken-1');
    fireEvent.blur(screen.getByLabelText('SKU'));

    expect(await screen.findByText('TAKEN-1 is already in use')).toBeTruthy();
  });

  it('rejects a malformed SKU, a missing name and a negative price before calling the API', async () => {
    renderPage();
    type('SKU', 'has space');
    type(/^Price/, '-5');
    save('Create product');

    expect(await screen.findByText(/2-40 characters/)).toBeTruthy();
    expect(screen.getByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Must be 0 or more')).toBeTruthy();
    expect(createProduct).not.toHaveBeenCalled();
    expect(checkSku).not.toHaveBeenCalled();
  });

  it('shows an API error on the field it belongs to', async () => {
    createProduct.mockRejectedValue(
      Object.assign(new Error('This SKU is already in use'), {
        status: 409,
        errors: [{ field: 'sku', message: 'This SKU is already in use' }],
      })
    );
    renderPage();
    type(/Name/, 'Gizmo');
    type(/^Price/, '10');
    type('SKU', 'dup-1');
    save('Create product');

    expect(await screen.findByText('This SKU is already in use')).toBeTruthy();
    expect(screen.queryByText('Product page')).toBeNull();
  });

  it('editing shows the SKU as fixed and never sends it', async () => {
    renderPage('/products/p1/edit');
    await screen.findByDisplayValue('Existing Thing');

    const sku = screen.getByLabelText('SKU');
    expect(sku.value).toBe('ZG-000042');
    expect(sku.disabled).toBe(true);

    type(/^Price/, '650');
    type(/Cost price/, '');
    save('Save changes');

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    const [id, sent] = updateProduct.mock.calls[0];
    expect(id).toBe('p1');
    expect('sku' in sent).toBe(false);
    expect(sent).toMatchObject({ basePrice: 650, costPrice: null, categoryId: 'c1', unitId: 'u1', taxId: null });
  });
});
