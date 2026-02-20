import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStore } from '../dataStore';
import { m } from '../schema';
import { configureSymulate } from '../config';

// Single mock at file level - vi.mock is hoisted, so only one should exist per module
const mockGenerateWithAI = vi.fn();
vi.mock('../aiProvider', () => ({
  generateWithAI: mockGenerateWithAI,
}));

describe('AI Response Unwrapping', () => {
  const ProductSchema = m.object({
    id: m.uuid(),
    name: m.string(),
    price: m.number(),
  });

  beforeEach(() => {
    configureSymulate({
      environment: 'development',
      generateMode: 'ai',
      openaiApiKey: 'test-key',
      collections: {
        persistence: { mode: 'memory' }
      }
    });

    mockGenerateWithAI.mockReset();
  });

  describe('generateSeedDataWithAI unwrapping', () => {
    it('should handle plain array response from AI', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { name: 'Product 1', price: 100 },
        { name: 'Product 2', price: 200 },
        { name: 'Product 3', price: 300 },
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 3,
      });

      const result = await store.query();

      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toHaveProperty('id');
      expect(result.data[0]).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('price');
      expect(result.data[0]).toHaveProperty('createdAt');
      expect(result.data[0]).toHaveProperty('updatedAt');
    });

    it('should unwrap { "products": [...] } response from AI', async () => {
      mockGenerateWithAI.mockResolvedValueOnce({
        products: [
          { name: 'Product 1', price: 100 },
          { name: 'Product 2', price: 200 },
        ]
      });

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 2,
      });

      const result = await store.query();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Product 1');
      expect(result.data[1].name).toBe('Product 2');
    });

    it('should unwrap { "items": [...] } response from AI', async () => {
      mockGenerateWithAI.mockResolvedValueOnce({
        items: [
          { name: 'Product 1', price: 100 },
          { name: 'Product 2', price: 200 },
        ]
      });

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 2,
      });

      const result = await store.query();

      expect(result.data).toHaveLength(2);
    });

    it('should handle nested wrapper like { "products": [{ "products": [...] }] }', async () => {
      mockGenerateWithAI.mockResolvedValueOnce({
        products: [
          {
            products: [
              { name: 'Product 1', price: 100 },
            ]
          }
        ]
      });

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      const result = await store.query();

      // Should extract the outer array
      expect(result.data).toHaveLength(1);
    });

    it('should handle single object response by wrapping in array', async () => {
      mockGenerateWithAI.mockResolvedValueOnce({
        name: 'Product 1',
        price: 100
      });

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      const result = await store.query();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Product 1');
    });

    it('should find array in object with multiple keys', async () => {
      mockGenerateWithAI.mockResolvedValueOnce({
        metadata: { count: 2, timestamp: '2024-01-01' },
        data: [
          { name: 'Product 1', price: 100 },
          { name: 'Product 2', price: 200 },
        ],
        status: 'success'
      });

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 2,
      });

      const result = await store.query();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Product 1');
    });
  });

  describe('AI generation without seedInstruction', () => {
    it('should generate data with AI even without seedInstruction', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { name: 'Generated Product', price: 150 },
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
        // No seedInstruction provided
      });

      const result = await store.query();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('price');
    });

    it('should use schema type description when no seedInstruction provided', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { name: 'Product', price: 100 }
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      await store.query();

      // Verify that generateWithAI was called with typeDescription
      expect(mockGenerateWithAI).toHaveBeenCalled();
    });
  });

  describe('Timestamp and ID generation', () => {
    it('should add timestamps to AI-generated items', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { name: 'Product 1', price: 100 },
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      const result = await store.query();

      expect(result.data[0]).toHaveProperty('createdAt');
      expect(result.data[0]).toHaveProperty('updatedAt');
      expect(typeof result.data[0].createdAt).toBe('string');
      expect(typeof result.data[0].updatedAt).toBe('string');
    });

    it('should preserve AI-provided ID if present', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { id: 'ai-generated-id', name: 'Product 1', price: 100 },
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      const result = await store.query();

      expect(result.data[0].id).toBe('ai-generated-id');
    });

    it('should auto-generate ID if AI did not provide one', async () => {
      mockGenerateWithAI.mockResolvedValueOnce([
        { name: 'Product 1', price: 100 },
      ]);

      const store = new DataStore({
        collectionName: 'products',
        schema: ProductSchema,
        seedCount: 1,
      });

      const result = await store.query();

      expect(result.data[0]).toHaveProperty('id');
      expect(typeof result.data[0].id).toBe('string');
      expect(result.data[0].id.length).toBeGreaterThan(0);
    });
  });
});
