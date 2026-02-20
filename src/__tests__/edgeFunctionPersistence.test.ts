import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureSymulate, getConfig } from '../config';
import { loadFromEdgeFunction, createInEdgeFunction, updateInEdgeFunction, deleteFromEdgeFunction } from '../persistence/edgeFunctionPersistence';

// Mock fetch
global.fetch = vi.fn();

describe('edgeFunctionPersistence - Demo API Key Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config before each test - explicitly clear keys to prevent leaking between tests
    configureSymulate({
      environment: 'development',
      cacheEnabled: false,
      demoApiKey: undefined,
      symulateApiKey: undefined,
      projectId: undefined,
    });
  });

  describe('loadFromEdgeFunction', () => {
    it('should use symulate-demo URL when demoApiKey is set', async () => {
      // Configure with demo API key
      configureSymulate({
        demoApiKey: 'sym_demo_test123',
        collections: {
          persistence: { mode: 'cloud' }
        }
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: '1', name: 'Test' }] }),
      });

      await loadFromEdgeFunction('products', { type: 'object' }, 'test instruction');

      // Verify fetch was called with demo URL
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/functions/v1/symulate-demo');
      expect(options.headers['x-symulate-demo-key']).toBe('sym_demo_test123');
      expect(options.headers['X-Mockend-API-Key']).toBeUndefined();
    });

    it('should use symulate URL when regular API key is set', async () => {
      // Configure with regular API key
      configureSymulate({
        symulateApiKey: 'sym_live_test123',
        projectId: 'project-123',
        collections: {
          persistence: { mode: 'cloud' }
        }
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: '1', name: 'Test' }] }),
      });

      await loadFromEdgeFunction('products', { type: 'object' }, 'test instruction');

      // Verify fetch was called with regular URL
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/functions/v1/symulate');
      expect(url).not.toContain('/functions/v1/symulate-demo');
      expect(options.headers['X-Mockend-API-Key']).toBe('sym_live_test123');
      expect(options.headers['X-Mockend-Project-Id']).toBe('project-123');
      expect(options.headers['x-symulate-demo-key']).toBeUndefined();
    });

    it('should prioritize demoApiKey over regular API key', async () => {
      // Configure with BOTH keys - demo should take priority
      configureSymulate({
        symulateApiKey: 'sym_live_test123',
        projectId: 'project-123',
        demoApiKey: 'sym_demo_test456',
        collections: {
          persistence: { mode: 'cloud' }
        }
      });

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: '1', name: 'Test' }] }),
      });

      await loadFromEdgeFunction('products', { type: 'object' });

      // Verify demo URL is used
      const [url, options] = (global.fetch as any).mock.calls[0];

      expect(url).toContain('/functions/v1/symulate-demo');
      expect(options.headers['x-symulate-demo-key']).toBe('sym_demo_test456');
      expect(options.headers['X-Mockend-API-Key']).toBeUndefined();
    });
  });

  describe('createInEdgeFunction', () => {
    it('should use demo URL and headers when demoApiKey is set', async () => {
      configureSymulate({
        demoApiKey: 'sym_demo_test123',
        collections: {
          persistence: { mode: 'cloud' }
        }
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', name: 'Test' }),
      });

      await createInEdgeFunction('products', { name: 'Test' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/functions/v1/symulate-demo');
      expect(options.headers['x-symulate-demo-key']).toBe('sym_demo_test123');
    });

    it('should use regular URL and headers when regular API key is set', async () => {
      configureSymulate({
        symulateApiKey: 'sym_live_test123',
        projectId: 'project-123',
        collections: {
          persistence: { mode: 'cloud' }
        }
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', name: 'Test' }),
      });

      await createInEdgeFunction('products', { name: 'Test' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/functions/v1/symulate');
      expect(options.headers['X-Mockend-API-Key']).toBe('sym_live_test123');
    });
  });

  describe('updateInEdgeFunction', () => {
    it('should use demo URL when demoApiKey is set', async () => {
      configureSymulate({
        demoApiKey: 'sym_demo_test123',
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', name: 'Updated' }),
      });

      await updateInEdgeFunction('products', '1', { name: 'Updated' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/functions/v1/symulate-demo');
      expect(options.headers['x-symulate-demo-key']).toBe('sym_demo_test123');
    });
  });

  describe('deleteFromEdgeFunction', () => {
    it('should use demo URL when demoApiKey is set', async () => {
      configureSymulate({
        demoApiKey: 'sym_demo_test123',
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await deleteFromEdgeFunction('products', '1');

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/functions/v1/symulate-demo');
      expect(options.headers['x-symulate-demo-key']).toBe('sym_demo_test123');
    });
  });

  describe('Config verification', () => {
    it('should correctly store demoApiKey in config', () => {
      configureSymulate({
        demoApiKey: 'sym_demo_test123',
      });

      const config = getConfig();
      console.log('Config after setting demoApiKey:', config);

      expect(config.demoApiKey).toBe('sym_demo_test123');
    });

    it('should correctly store both keys in config', () => {
      configureSymulate({
        symulateApiKey: 'sym_live_test123',
        projectId: 'project-123',
        demoApiKey: 'sym_demo_test456',
      });

      const config = getConfig();
      console.log('Config with both keys:', config);

      expect(config.symulateApiKey).toBe('sym_live_test123');
      expect(config.projectId).toBe('project-123');
      expect(config.demoApiKey).toBe('sym_demo_test456');
    });
  });
});
