import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineCollection } from '../defineCollection';
import { getCollection, hasCollection, getRegisteredCollections } from '../collectionRegistry';
import { m } from '../schema';
import { configureSymulate } from '../config';
import type { Infer } from '../schema';

describe('defineCollection', () => {
  // Test schema
  const ProductSchema = m.object({
    id: m.uuid(),
    name: m.string(),
    price: m.number(),
    category: m.string(),
    inStock: m.boolean(),
    createdAt: m.date(),
    updatedAt: m.date(),
  });

  type Product = Infer<typeof ProductSchema>;

  beforeEach(() => {
    // Configure for testing
    configureSymulate({
      environment: 'development',
      generateMode: 'faker',
      collections: {
        persistence: { mode: 'memory' }
      }
    });
  });

  describe('Collection Creation', () => {
    it('should create a collection with default config', () => {
      const products = defineCollection<Product>({
        name: 'products',
        schema: ProductSchema,
      });

      expect(products).toBeDefined();
      expect(products.name).toBe('products');
      expect(products.basePath).toBe('/products');
      expect(products.schema).toBe(ProductSchema);
    });

    it('should create collection with custom basePath', () => {
      const products = defineCollection<Product>({
        name: 'products-custom-path',
        schema: ProductSchema,
        basePath: '/api/v1/products',
      });

      expect(products.basePath).toBe('/api/v1/products');
    });

    it('should register collection globally', () => {
      defineCollection<Product>({
        name: 'test-products',
        schema: ProductSchema,
      });

      expect(hasCollection('test-products')).toBe(true);
      const retrieved = getCollection<Product>('test-products');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-products');
    });

    it('should return existing collection if already defined', () => {
      const first = defineCollection<Product>({
        name: 'duplicate-test',
        schema: ProductSchema,
      });

      const second = defineCollection<Product>({
        name: 'duplicate-test',
        schema: ProductSchema,
      });

      expect(first).toBe(second);
    });
  });

  describe('List Operation', () => {
    it('should list all items', async () => {
      const products = defineCollection<Product>({
        name: 'list-test',
        schema: ProductSchema,
        seedCount: 5,
      });

      const result = await products.list();

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(5);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBe(5);
    });

    it('should support pagination options', async () => {
      const products = defineCollection<Product>({
        name: 'pagination-test',
        schema: ProductSchema,
        seedCount: 25,
      });

      const result = await products.list({ page: 2, limit: 10 });

      expect(result.data.length).toBe(10);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
    });

    it('should support sorting', async () => {
      const products = defineCollection<Product>({
        name: 'sort-test',
        schema: ProductSchema,
        seedCount: 10,
      });

      const result = await products.list({
        sortBy: 'price',
        sortOrder: 'asc',
      });

      expect(result.data.length).toBeGreaterThan(0);
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].price).toBeGreaterThanOrEqual(result.data[i - 1].price);
      }
    });

    it('should support filtering', async () => {
      const products = defineCollection<Product>({
        name: 'filter-test',
        schema: ProductSchema,
        seedCount: 10,
      });

      // Create a specific product
      await products.create({
        name: 'Special Product',
        price: 999,
        category: 'Special',
        inStock: true,
      });

      const result = await products.list({
        filter: { price: 999 }
      });

      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach(product => {
        expect(product.price).toBe(999);
      });
    });
  });

  describe('Get Operation', () => {
    it('should get item by ID', async () => {
      const products = defineCollection<Product>({
        name: 'get-test',
        schema: ProductSchema,
        seedCount: 5,
      });

      const created = await products.create({
        name: 'Test Product',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      const retrieved = await products.get(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe('Test Product');
    });

    it('should throw error for non-existent ID', async () => {
      const products = defineCollection<Product>({
        name: 'get-error-test',
        schema: ProductSchema,
      });

      await expect(products.get('non-existent-id')).rejects.toThrow();
    });
  });

  describe('Create Operation', () => {
    it('should create new item', async () => {
      const products = defineCollection<Product>({
        name: 'create-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'New Product',
        price: 50,
        category: 'Electronics',
        inStock: true,
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('New Product');
      expect(created.price).toBe(50);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('should support read-after-write', async () => {
      const products = defineCollection<Product>({
        name: 'raw-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'RAW Test',
        price: 75,
        category: 'Test',
        inStock: true,
      });

      const retrieved = await products.get(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe('RAW Test');
    });

    it('should call beforeCreate hook', async () => {
      const beforeCreate = vi.fn((data) => ({
        ...data,
        name: data.name.toUpperCase(),
      }));

      const products = defineCollection<Product>({
        name: 'before-create-test',
        schema: ProductSchema,
        hooks: { beforeCreate },
      });

      const created = await products.create({
        name: 'lowercase',
        price: 50,
        category: 'Test',
        inStock: true,
      });

      expect(beforeCreate).toHaveBeenCalled();
      expect(created.name).toBe('LOWERCASE');
    });

    it('should call afterCreate hook', async () => {
      const afterCreate = vi.fn();

      const products = defineCollection<Product>({
        name: 'after-create-test',
        schema: ProductSchema,
        hooks: { afterCreate },
      });

      await products.create({
        name: 'Test',
        price: 50,
        category: 'Test',
        inStock: true,
      });

      expect(afterCreate).toHaveBeenCalled();
    });
  });

  describe('Update Operation', () => {
    it('should update item partially', async () => {
      const products = defineCollection<Product>({
        name: 'update-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'Original',
        price: 100,
        category: 'Electronics',
        inStock: true,
      });

      const updated = await products.update(created.id, {
        price: 150,
      });

      expect(updated.price).toBe(150);
      expect(updated.name).toBe('Original'); // Unchanged
      expect(updated.category).toBe('Electronics'); // Unchanged
    });

    it('should update updatedAt timestamp', async () => {
      const products = defineCollection<Product>({
        name: 'timestamp-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'Test',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      const originalUpdatedAt = created.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await products.update(created.id, {
        price: 120,
      });

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should preserve createdAt timestamp', async () => {
      const products = defineCollection<Product>({
        name: 'preserve-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'Test',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      const updated = await products.update(created.id, {
        price: 120,
      });

      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('should call beforeUpdate hook', async () => {
      const beforeUpdate = vi.fn((id, updates) => ({
        ...updates,
        price: (updates.price || 0) * 2,
      }));

      const products = defineCollection<Product>({
        name: 'before-update-test',
        schema: ProductSchema,
        hooks: { beforeUpdate },
      });

      const created = await products.create({
        name: 'Test',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      const updated = await products.update(created.id, {
        price: 50,
      });

      expect(beforeUpdate).toHaveBeenCalled();
      expect(updated.price).toBe(100); // 50 * 2
    });
  });

  describe('Delete Operation', () => {
    it('should delete item', async () => {
      const products = defineCollection<Product>({
        name: 'delete-test',
        schema: ProductSchema,
      });

      const created = await products.create({
        name: 'To Delete',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      await products.delete(created.id);

      await expect(products.get(created.id)).rejects.toThrow();
    });

    it('should call beforeDelete hook', async () => {
      const beforeDelete = vi.fn();

      const products = defineCollection<Product>({
        name: 'before-delete-test',
        schema: ProductSchema,
        hooks: { beforeDelete },
      });

      const created = await products.create({
        name: 'Test',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      await products.delete(created.id);

      expect(beforeDelete).toHaveBeenCalledWith(created.id);
    });

    it('should respect failIf condition', async () => {
      const products = defineCollection<Product>({
        name: 'failif-test',
        schema: ProductSchema,
        operations: {
          delete: {
            errors: [{
              code: 403,
              description: 'Cannot delete',
              failIf: (data) => data.inStock
            }]
          }
        }
      });

      const created = await products.create({
        name: 'In Stock',
        price: 100,
        category: 'Test',
        inStock: true,
      });

      // Should fail because inStock is true
      await expect(products.delete(created.id)).rejects.toThrow();
    });
  });

  describe('Operation Configuration', () => {
    it('should disable operations when set to false', async () => {
      const products = defineCollection<Product>({
        name: 'disabled-ops-test',
        schema: ProductSchema,
        operations: {
          delete: false,
        }
      });

      expect(products.delete).toBeUndefined();
    });

    it('should support custom error definitions', async () => {
      const products = defineCollection<Product>({
        name: 'custom-error-test',
        schema: ProductSchema,
        operations: {
          create: {
            errors: [{
              code: 400,
              description: 'Invalid product',
              failIf: (data) => data.price <= 0
            }]
          }
        }
      });

      await expect(products.create({
        name: 'Invalid',
        price: -10,
        category: 'Test',
        inStock: true,
      })).rejects.toThrow();
    });
  });

  describe('Registry Functions', () => {
    it('should track all registered collections', () => {
      const initialCount = getRegisteredCollections().size;

      defineCollection<Product>({
        name: 'registry-test-1',
        schema: ProductSchema,
      });

      defineCollection<Product>({
        name: 'registry-test-2',
        schema: ProductSchema,
      });

      const finalCount = getRegisteredCollections().size;

      expect(finalCount).toBe(initialCount + 2);
    });

    it('should retrieve collection by name', () => {
      defineCollection<Product>({
        name: 'retrieve-test',
        schema: ProductSchema,
      });

      const retrieved = getCollection<Product>('retrieve-test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('retrieve-test');
    });

    it('should check collection existence', () => {
      defineCollection<Product>({
        name: 'exists-test',
        schema: ProductSchema,
      });

      expect(hasCollection('exists-test')).toBe(true);
      expect(hasCollection('non-existent')).toBe(false);
    });
  });

  describe('Query Parameter Customization', () => {
    it('should use custom parameter names with role-based params', async () => {
      // Configure for production mode
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      // Mock fetch to capture URL
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'custom-params-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'pageNumber', location: 'query', role: 'pagination.page', schema: m.number() },
              { name: 'pageSize', location: 'query', role: 'pagination.limit', schema: m.number() },
              { name: 'orderBy', location: 'query', role: 'sort.field', schema: m.string() },
              { name: 'direction', location: 'query', role: 'sort.order', schema: m.string() },
            ]
          }
        }
      });

      await products.list({ page: 2, limit: 10, sortBy: 'price', sortOrder: 'desc' });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0].toString();

      // Should use custom parameter names
      expect(callUrl).toContain('pageNumber=2');
      expect(callUrl).toContain('pageSize=10');
      expect(callUrl).toContain('orderBy=price');
      expect(callUrl).toContain('direction=desc');

      // Should NOT use default parameter names
      expect(callUrl).not.toContain('page=');
      expect(callUrl).not.toContain('limit=');
      expect(callUrl).not.toContain('sortBy=');
      expect(callUrl).not.toContain('sortOrder=');
    });

    it('should use custom filter parameter name', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'filter-param-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'search', location: 'query', role: 'filter', schema: m.object() },
            ]
          }
        }
      });

      await products.list({ filter: { category: 'Electronics' } });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0].toString();

      // Should use 'search' instead of 'filter'
      expect(callUrl).toContain('search=');
      expect(callUrl).not.toContain('filter=');
    });

    it('should use default parameter names when no params defined', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'default-params-test',
        schema: ProductSchema,
      });

      await products.list({ page: 1, limit: 10, sortBy: 'name' });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0].toString();

      // Should use default parameter names
      expect(callUrl).toContain('page=1');
      expect(callUrl).toContain('limit=10');
      expect(callUrl).toContain('sortBy=name');
    });

    it('should serialize filter as JSON string', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'filter-json-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'search', location: 'query', role: 'filter', schema: m.object() },
            ]
          }
        }
      });

      const filterObj = { category: 'Electronics', inStock: true };
      await products.list({ filter: filterObj });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0].toString();

      // Filter should be JSON stringified
      const expectedFilter = encodeURIComponent(JSON.stringify(filterObj));
      expect(callUrl).toContain(`search=${expectedFilter}`);
    });

    it('should send parameters in query string by default', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'location-query-test',
        schema: ProductSchema,
      });

      await products.list({ page: 2, limit: 15 });

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const callUrl = call[0].toString();
      const callOptions = call[1];

      // Should be in query string
      expect(callUrl).toContain('page=2');
      expect(callUrl).toContain('limit=15');

      // Should be GET request
      expect(callOptions.method).toBe('GET');
    });

    it('should send parameters in request body when location is "body"', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'location-body-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'filter', location: 'body', role: 'filter', schema: m.object() },
            ]
          }
        }
      });

      const filterObj = { category: 'Electronics' };
      await products.list({ filter: filterObj });

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const callOptions = call[1];

      // Should be POST when body params are used
      expect(callOptions.method).toBe('POST');

      // Should have body with filter
      const body = JSON.parse(callOptions.body);
      expect(body.filter).toEqual(filterObj);
    });

    it('should send parameters in headers when location is "header"', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'location-header-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'X-Page', location: 'header', role: 'pagination.page', schema: m.number() },
              { name: 'X-Sort-By', location: 'header', role: 'sort.field', schema: m.string() },
            ]
          }
        }
      });

      await products.list({ page: 3, sortBy: 'name' });

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const callOptions = call[1];

      // Should be in headers
      expect(callOptions.headers['X-Page']).toBe('3');
      expect(callOptions.headers['X-Sort-By']).toBe('name');
    });

    it('should support mixing different parameter locations', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'location-mixed-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'page', location: 'query', role: 'pagination.page', schema: m.number() },
              { name: 'limit', location: 'query', role: 'pagination.limit', schema: m.number() },
              { name: 'filter', location: 'body', role: 'filter', schema: m.object() },
              { name: 'X-Sort-Field', location: 'header', role: 'sort.field', schema: m.string() },
            ]
          }
        }
      });

      const filterObj = { inStock: true };
      await products.list({ page: 1, limit: 10, filter: filterObj, sortBy: 'price' });

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const callUrl = call[0].toString();
      const callOptions = call[1];

      // Page and limit in query string
      expect(callUrl).toContain('page=1');
      expect(callUrl).toContain('limit=10');

      // Filter in body (triggers POST)
      expect(callOptions.method).toBe('POST');
      const body = JSON.parse(callOptions.body);
      expect(body.filter).toEqual(filterObj);

      // Sort field in header
      expect(callOptions.headers['X-Sort-Field']).toBe('price');
    });

    it('should use POST method when body parameters are present', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'location-post-test',
        schema: ProductSchema,
        operations: {
          list: {
            params: [
              { name: 'page', location: 'body', role: 'pagination.page', schema: m.number() },
              { name: 'limit', location: 'body', role: 'pagination.limit', schema: m.number() },
            ]
          }
        }
      });

      await products.list({ page: 2, limit: 25 });

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const callOptions = call[1];

      // Should automatically switch to POST
      expect(callOptions.method).toBe('POST');

      // Parameters should be in body
      const body = JSON.parse(callOptions.body);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(25);
    });

    it('should disable query params when disableQueryParams is true', async () => {
      configureSymulate({
        environment: 'production',
        backendBaseUrl: 'http://localhost:3001',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        })
      });
      global.fetch = mockFetch;

      const products = defineCollection<Product>({
        name: 'disabled-params-test',
        schema: ProductSchema,
        operations: {
          list: {
            disableQueryParams: true
          }
        }
      });

      await products.list({ page: 2, limit: 10, sortBy: 'name' });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0].toString();

      // Should NOT include any query parameters
      expect(callUrl).not.toContain('page=');
      expect(callUrl).not.toContain('limit=');
      expect(callUrl).not.toContain('sortBy=');
    });
  });
});
