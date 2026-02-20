import { BaseSchema } from './schema';
import { QueryOptions, PaginatedResponse } from './collection.types';
import { generateWithFaker } from './fakerGenerator';
import { getConfig } from './config';

/**
 * In-memory data store for collection items
 * Provides CRUD operations with optional persistence
 */
export class DataStore<T extends Record<string, any>> {
  private data: Map<string, T> = new Map();
  private schema: BaseSchema<T>;
  private collectionName: string;
  private seedCount: number;
  private seedInstruction?: string;
  private initialized: boolean = false;

  // Static flag to track if we're currently initializing all collections
  private static isInitializingAll: boolean = false;

  constructor(config: {
    collectionName: string;
    schema: BaseSchema<T>;
    seedCount: number;
    seedInstruction?: string;
  }) {
    this.collectionName = config.collectionName;
    this.schema = config.schema;
    this.seedCount = config.seedCount;
    this.seedInstruction = config.seedInstruction;
  }

  /**
   * Initialize all collections in dependency order with FK integrity
   * This is a static method that coordinates seeding across all collections
   */
  static async initializeAllCollections(): Promise<void> {
    // Prevent multiple simultaneous initialization attempts
    if (DataStore.isInitializingAll) {
      return;
    }

    DataStore.isInitializingAll = true;

    try {
      const { getCollectionSeedOrder } = await import('./relations');
      const { getCollectionRegistry } = await import('./collectionRegistry');

      const registry = getCollectionRegistry();
      const seedOrder = getCollectionSeedOrder();

      console.log('[Symulate] Initializing collections in dependency order:', seedOrder);

      // Track available IDs from already-seeded collections
      const availableIds = new Map<string, string[]>();

      // Seed each collection in dependency order
      for (const collectionName of seedOrder) {
        const metadata = registry.get(collectionName);
        if (!metadata) continue;

        const store = metadata.store;
        if (!store || store.initialized) continue;

        // Try to load from persistence first
        const persistedData = await store.loadFromPersistence();
        if (persistedData && persistedData.length > 0) {
          // Load from persistence
          persistedData.forEach(item => {
            store.data.set(item.id, item);
          });
          store.initialized = true;

          // Store available IDs for FK references
          const ids = Array.from(store.data.keys());
          availableIds.set(collectionName, ids);

          console.log(`[Symulate] Loaded ${collectionName} from persistence with ${ids.length} items`);
          continue;
        }

        // No persisted data - generate fresh with FK integrity
        // Build FK value pools for this collection
        const fkValuePools = new Map<string, string[]>();
        if (metadata.config.relations) {
          for (const [relationName, relationConfig] of Object.entries(metadata.config.relations)) {
            // For belongsTo relations, we need IDs from the related collection
            if (relationConfig.type === 'belongsTo') {
              const relatedCollectionName = relationConfig.collection;
              const relatedIds = availableIds.get(relatedCollectionName);
              if (relatedIds && relatedIds.length > 0) {
                // Map foreign key field name to available IDs
                fkValuePools.set(relationConfig.foreignKey, relatedIds);
              }
            }
          }
        }

        // Generate seed data with FK integrity
        await store.initializeWithFKIntegrity(fkValuePools);

        // Store available IDs for this collection
        const ids = Array.from(store.data.keys());
        availableIds.set(collectionName, ids);

        console.log(`[Symulate] Initialized ${collectionName} with ${ids.length} items`);
      }
    } finally {
      DataStore.isInitializingAll = false;
    }
  }

  /**
   * Initialize this specific store with FK integrity support
   * Called by initializeAllCollections
   */
  async initializeWithFKIntegrity(fkValuePools: Map<string, string[]>): Promise<void> {
    if (this.initialized) return;

    // Generate seed data with FK value pools
    const seedData = await this.generateSeedData(fkValuePools);
    seedData.forEach(item => {
      this.data.set(item.id, item);
    });

    // Save initial seed data
    await this.persist();
    this.initialized = true;
  }

  /**
   * Initialize store with seed data
   * Called lazily on first operation
   *
   * IMPORTANT: This method coordinates FK-aware seeding across all collections
   * by seeding them in dependency order.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // IMPORTANT: Always use coordinated initialization to ensure FK integrity
    // Even if data exists in persistence, we need to ensure all collections
    // are initialized together in the correct order
    await DataStore.initializeAllCollections();

    // If not initialized by initializeAllCollections (e.g. standalone store not in registry),
    // fall back to direct self-initialization without FK integrity
    if (!this.initialized) {
      await this.initializeWithFKIntegrity(new Map());
    }
  }

  /**
   * Generate seed data using AI or Faker
   * Supports FK integrity by accepting available IDs from related collections
   */
  private async generateSeedData(availableRelationIds?: Map<string, string[]>): Promise<T[]> {
    const config = getConfig();
    const generateMode = config.generateMode || 'faker';

    // Check if we should use AI for seed data
    const shouldUseAI = generateMode === 'ai' || generateMode === 'auto';

    if (shouldUseAI) {
      try {
        // Try to generate with AI
        // Works with or without seedInstruction - schema provides type information
        const aiData = await this.generateSeedDataWithAI();
        if (aiData && aiData.length > 0) {
          return aiData;
        }
      } catch (error) {
        console.warn(`[Symulate] Failed to generate seed data with AI for ${this.collectionName}, falling back to Faker:`, error);

        // If mode is 'ai' (strict), rethrow the error
        if (generateMode === 'ai') {
          throw error;
        }
        // Otherwise fall through to Faker
      }
    }

    // Use Faker for seed data (default or fallback)
    return Array.from({ length: this.seedCount }, () => {
      const item = generateWithFaker(this.schema, 1, availableRelationIds) as T;
      // Ensure id, createdAt, updatedAt exist
      const now = new Date().toISOString();
      return {
        ...item,
        id: item.id || this.generateId(),
        createdAt: item.createdAt || now,
        updatedAt: now,
      } as T;
    });
  }

  /**
   * Generate seed data using AI
   */
  private async generateSeedDataWithAI(): Promise<T[]> {
    const { generateWithAI } = await import('./aiProvider');
    const { schemaToTypeDescription } = await import('./schema');

    // Create an array schema for batch generation
    const arraySchema = {
      type: 'array',
      items: this.schema,
      minItems: this.seedCount,
      maxItems: this.seedCount,
    };

    const typeDescription = schemaToTypeDescription(this.schema);
    const instruction = this.seedInstruction
      ? `Generate ${this.seedCount} realistic ${this.collectionName} items: ${this.seedInstruction}`
      : `Generate ${this.seedCount} diverse and realistic ${this.collectionName} items`;

    console.log(`[Symulate] Generating ${this.seedCount} seed items with AI for ${this.collectionName}...`);

    const generatedData = await generateWithAI({
      schema: arraySchema,
      instruction,
      typeDescription,
    });

    // Unwrap the response if AI returned an object with collection name key
    // e.g., { "products": [...] } -> [...]
    let dataArray: any[];
    if (Array.isArray(generatedData)) {
      dataArray = generatedData;
    } else if (typeof generatedData === 'object' && generatedData !== null) {
      // Check if the object has a key matching the collection name
      if (generatedData[this.collectionName] && Array.isArray(generatedData[this.collectionName])) {
        dataArray = generatedData[this.collectionName];
      } else {
        // Check for common array keys
        const arrayKey = Object.keys(generatedData).find(key => Array.isArray(generatedData[key]));
        if (arrayKey) {
          dataArray = generatedData[arrayKey];
        } else {
          // Fallback: wrap in array
          dataArray = [generatedData];
        }
      }
    } else {
      dataArray = [generatedData];
    }

    // Ensure each item has proper timestamps and IDs
    const now = new Date().toISOString();
    return dataArray.map((item: any) => ({
      ...item,
      id: item.id || this.generateId(),
      createdAt: item.createdAt || now,
      updatedAt: now,
    })) as T[];
  }

  /**
   * Query all items with filtering, sorting, and pagination
   * Supports flexible response schemas with meta fields
   */
  async query(options: QueryOptions = {}, responseSchema?: any): Promise<any> {
    await this.initialize();

    let items = Array.from(this.data.values());

    // Apply filtering (future enhancement)
    if (options.filter) {
      items = this.applyFilters(items, options.filter);
    }

    // Apply sorting
    if (options.sortBy) {
      items = this.applySorting(items, options.sortBy, options.sortOrder || 'asc');
    }

    // Calculate pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedItems = items.slice(startIndex, endIndex);

    // If custom response schema provided, build response from it
    if (responseSchema) {
      const { buildResponseFromSchema } = await import('./collectionMeta');
      const metaValues = { page, limit, total, totalPages };
      return buildResponseFromSchema(responseSchema, paginatedItems, items, metaValues);
    }

    // Default response format
    return {
      data: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Find item by ID
   */
  async findById(id: string): Promise<T | null> {
    await this.initialize();
    return this.data.get(id) || null;
  }

  /**
   * Insert new item
   */
  async insert(item: T): Promise<T> {
    await this.initialize();

    // Add timestamps if not present
    const now = new Date().toISOString();
    const newItem = {
      ...item,
      id: item.id || this.generateId(),
      createdAt: item.createdAt || now,
      updatedAt: now,
    } as T;

    this.data.set(newItem.id, newItem);
    await this.persistCreate(newItem);

    return newItem;
  }

  /**
   * Update existing item (partial)
   */
  async update(id: string, updates: Partial<T>): Promise<T | null> {
    await this.initialize();

    const existing = this.data.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      id, // Preserve ID
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date().toISOString(),
    } as T;

    this.data.set(id, updated);
    await this.persistUpdate(id, updates);

    return updated;
  }

  /**
   * Replace entire item (full replacement)
   */
  async replace(id: string, item: T): Promise<T | null> {
    await this.initialize();

    const existing = this.data.get(id);
    if (!existing) return null;

    const replaced = {
      ...item,
      id,
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date().toISOString(),
    } as T;

    this.data.set(id, replaced);
    // Replace is essentially a full update
    await this.persistUpdate(id, replaced);

    return replaced;
  }

  /**
   * Delete item by ID
   */
  async delete(id: string): Promise<boolean> {
    await this.initialize();

    const existed = this.data.has(id);
    this.data.delete(id);

    if (existed) {
      await this.persistDelete(id);
    }

    return existed;
  }

  /**
   * Check if item exists
   */
  async exists(id: string): Promise<boolean> {
    await this.initialize();
    return this.data.has(id);
  }

  /**
   * Count total items
   */
  async count(filter?: Record<string, any>): Promise<number> {
    await this.initialize();

    if (!filter) {
      return this.data.size;
    }

    const items = Array.from(this.data.values());
    const filtered = this.applyFilters(items, filter);
    return filtered.length;
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.data.clear();
    await this.persist();
  }

  /**
   * Get all data as array (for export/debugging)
   */
  async toArray(): Promise<T[]> {
    await this.initialize();
    return Array.from(this.data.values());
  }

  // Private helper methods

  private isBrowser(): boolean {
    return typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined';
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private applyFilters(items: T[], filter: Record<string, any>): T[] {
    return items.filter(item => {
      return Object.entries(filter).every(([key, value]) => {
        if (value === undefined) return true;

        const itemValue = item[key];

        // Exact match
        if (typeof value !== 'object') {
          return itemValue === value;
        }

        // Operators (future enhancement)
        // e.g., { age: { $gt: 18 } }
        if (value.$eq !== undefined) return itemValue === value.$eq;
        if (value.$ne !== undefined) return itemValue !== value.$ne;
        if (value.$gt !== undefined) return itemValue > value.$gt;
        if (value.$gte !== undefined) return itemValue >= value.$gte;
        if (value.$lt !== undefined) return itemValue < value.$lt;
        if (value.$lte !== undefined) return itemValue <= value.$lte;
        if (value.$in !== undefined) return value.$in.includes(itemValue);
        if (value.$nin !== undefined) return !value.$nin.includes(itemValue);

        return true;
      });
    });
  }

  private applySorting(items: T[], sortBy: string, sortOrder: 'asc' | 'desc'): T[] {
    return items.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (aValue === bValue) return 0;

      const comparison = aValue > bValue ? 1 : -1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Load data from persistence layer
   */
  private async loadFromPersistence(): Promise<T[] | null> {
    const config = getConfig();
    const persistenceMode = config.collections?.persistence?.mode;

    console.log(`[DataStore] loadFromPersistence for ${this.collectionName}, mode:`, persistenceMode);
    console.log(`[DataStore] Config:`, config);

    if (!persistenceMode || persistenceMode === 'memory') {
      console.log(`[DataStore] No persistence mode or memory mode - returning null`);
      return null;
    }

    try {
      if (persistenceMode === 'local') {
        console.log(`[DataStore] Using local persistence`);
        // Browser: use localStorage, Node.js: use filesystem
        if (this.isBrowser()) {
          const { loadFromLocalStorage } = await import('./persistence/localStoragePersistence');
          return await loadFromLocalStorage(this.collectionName);
        } else {
          // Dynamic import - only executed in Node.js environment
          // This will never run in browser, so the module doesn't need to exist
          try {
            // Use dynamic string to prevent bundlers from resolving this at build time
            const modulePath = './persistence/' + 'filePersistence';
            const { loadFromFile } = await import(/* @vite-ignore */ modulePath);
            return await loadFromFile(this.collectionName);
          } catch (error) {
            console.warn('[DataStore] File persistence not available in this environment');
            return null;
          }
        }
      }

      if (persistenceMode === 'cloud') {
        console.log(`[DataStore] Using cloud persistence - calling loadFromEdgeFunction`);
        // Always use edge function for consistency across all environments
        const { loadFromEdgeFunction } = await import('./persistence/edgeFunctionPersistence');
        return await loadFromEdgeFunction(this.collectionName, this.schema, this.seedInstruction);
      }
    } catch (error) {
      console.warn(`Failed to load ${this.collectionName} from persistence:`, error);
    }

    return null;
  }

  /**
   * Save data to persistence layer (bulk save)
   */
  private async persist(): Promise<void> {
    const config = getConfig();
    const persistenceMode = config.collections?.persistence?.mode;

    if (!persistenceMode || persistenceMode === 'memory') {
      return;
    }

    const data = Array.from(this.data.values());

    try {
      if (persistenceMode === 'local') {
        // Browser: use localStorage, Node.js: use filesystem
        if (this.isBrowser()) {
          const { saveToLocalStorage } = await import('./persistence/localStoragePersistence');
          await saveToLocalStorage(this.collectionName, data);
        } else {
          // Dynamic import - only executed in Node.js environment
          try {
            // Use dynamic string to prevent bundlers from resolving this at build time
            const modulePath = './persistence/' + 'filePersistence';
            const { saveToFile } = await import(/* @vite-ignore */ modulePath);
            await saveToFile(this.collectionName, data);
          } catch (error) {
            console.warn('[DataStore] File persistence not available in this environment');
          }
        }
      }

      // For cloud mode, edge function handles persistence per-operation
      // Bulk save is not needed as individual CRUD operations sync automatically
    } catch (error) {
      console.error(`Failed to persist ${this.collectionName}:`, error);
    }
  }

  /**
   * Persist create operation
   */
  private async persistCreate(item: T): Promise<void> {
    const config = getConfig();
    const persistenceMode = config.collections?.persistence?.mode;

    if (!persistenceMode || persistenceMode === 'memory') {
      return;
    }

    try {
      if (persistenceMode === 'cloud') {
        // Always use edge function for consistency
        const { createInEdgeFunction } = await import('./persistence/edgeFunctionPersistence');
        await createInEdgeFunction(this.collectionName, item);
      } else if (persistenceMode === 'local') {
        // For local mode, use bulk persist
        await this.persist();
      }
    } catch (error) {
      console.error(`Failed to persist create for ${this.collectionName}:`, error);
    }
  }

  /**
   * Persist update operation
   */
  private async persistUpdate(id: string, updates: Partial<T>): Promise<void> {
    const config = getConfig();
    const persistenceMode = config.collections?.persistence?.mode;

    if (!persistenceMode || persistenceMode === 'memory') {
      return;
    }

    try {
      if (persistenceMode === 'cloud') {
        // Always use edge function for consistency
        const { updateInEdgeFunction } = await import('./persistence/edgeFunctionPersistence');
        await updateInEdgeFunction(this.collectionName, id, updates);
      } else if (persistenceMode === 'local') {
        // For local mode, use bulk persist
        await this.persist();
      }
    } catch (error) {
      console.error(`Failed to persist update for ${this.collectionName}:`, error);
    }
  }

  /**
   * Persist delete operation
   */
  private async persistDelete(id: string): Promise<void> {
    const config = getConfig();
    const persistenceMode = config.collections?.persistence?.mode;

    if (!persistenceMode || persistenceMode === 'memory') {
      return;
    }

    try {
      if (persistenceMode === 'cloud') {
        // Always use edge function for consistency
        const { deleteFromEdgeFunction } = await import('./persistence/edgeFunctionPersistence');
        await deleteFromEdgeFunction(this.collectionName, id);
      } else if (persistenceMode === 'local') {
        // For local mode, use bulk persist
        await this.persist();
      }
    } catch (error) {
      console.error(`Failed to persist delete for ${this.collectionName}:`, error);
    }
  }
}
