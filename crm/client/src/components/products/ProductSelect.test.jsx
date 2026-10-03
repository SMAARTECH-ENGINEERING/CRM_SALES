import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProductOptions } from '../../api/products.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import ProductSelect from './ProductSelect.jsx';

vi.mock('../../api/products.api.js');

const PRODUCTS = [
  { id: 'p1', sku: 'ZZ-001', name: 'Zebra Widget', basePrice: 1250.5, status: 'active', unit: { symbol: 'pc' }, tax: { name: 'Std', rate: 18 } },
  { id: 'p2', sku: 'QQ-002', name: 'Quokka Service', basePrice: 900, status: 'active', unit: null, tax: null },
  { id: 'p3', sku: 'OLD-003', name: 'Retired Gadget', basePrice: 10, status: 'inactive', unit: null, tax: null },
];

// Behaves like GET /products/options: one by id, or active ones filtered by search.
function serve(params = {}) {
  const term = (params.search ?? '').toLowerCase();
  const products = params.id
    ? PRODUCTS.filter((p) => p.id === params.id)
    : PRODUCTS.filter((p) => p.status === 'active' && `${p.name} ${p.sku}`.toLowerCase().includes(term));
  return Promise.resolve({ data: { products } });
}

const picked = vi.fn();

function Harness({ initial = '', ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ProductSelect
        value={value}
        onChange={(id, product) => {
          setValue(id);
          picked(id, product);
        }}
        {...props}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const box = () => screen.getByRole('combobox', { name: /Product/ });
const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);

beforeEach(() => {
  picked.mockClear();
  listProductOptions.mockImplementation(serve);
});

afterEach(cleanup);

describe('ProductSelect', () => {
  it('loads its options from the API', async () => {
    renderAs(<Harness />);
    await waitFor(() => expect(listProductOptions).toHaveBeenCalledWith({ search: '', limit: 20 }, expect.anything()));

    fireEvent.mouseDown(box());
    await screen.findAllByRole('option');
    expect(optionTexts()).toEqual(['Zebra WidgetZZ-001 · 1,250.5 / pc', 'Quokka ServiceQQ-002 · 900']);
  });

  it('has nothing to offer when the API returns nothing', async () => {
    listProductOptions.mockResolvedValue({ data: { products: [] } });
    renderAs(<Harness />);

    fireEvent.mouseDown(box());
    expect(await screen.findByText('No products yet')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toEqual([]);
  });

  it('searches on the server as the user types', async () => {
    renderAs(<Harness />);
    box().focus();
    fireEvent.change(box(), { target: { value: 'qq-0' } });

    await waitFor(() => expect(listProductOptions).toHaveBeenCalledWith({ search: 'qq-0', limit: 20 }, expect.anything()));
    await waitFor(() => expect(optionTexts()).toEqual(['Quokka ServiceQQ-002 · 900']));
  });

  it('reports the chosen id together with what a line item needs', async () => {
    renderAs(<Harness />);
    fireEvent.mouseDown(box());
    fireEvent.click(await screen.findByRole('option', { name: /Zebra Widget/ }));

    expect(screen.getByTestId('value').textContent).toBe('p1');
    expect(picked).toHaveBeenCalledWith('p1', PRODUCTS[0]);
    expect(picked.mock.calls[0][1]).toMatchObject({ basePrice: 1250.5, unit: { symbol: 'pc' }, tax: { rate: 18 } });
  });

  it('shows a preselected product by looking it up - even one that is now inactive', async () => {
    renderAs(<Harness initial="p3" />);

    await waitFor(() => expect(box().value).toBe('Retired Gadget (OLD-003)'));
    expect(listProductOptions).toHaveBeenCalledWith({ id: 'p3' }, expect.anything());
  });

  it('does not look up a product the caller already supplied', async () => {
    renderAs(<Harness initial="p2" current={PRODUCTS[1]} />);

    await waitFor(() => expect(box().value).toBe('Quokka Service (QQ-002)'));
    expect(listProductOptions).not.toHaveBeenCalledWith({ id: 'p2' }, expect.anything());
  });

  it('shows the API error instead of failing silently', async () => {
    listProductOptions.mockRejectedValue(Object.assign(new Error('Could not load products'), { status: 500 }));
    renderAs(<Harness />);
    expect(await screen.findByText('Could not load products')).toBeTruthy();
  });
});
