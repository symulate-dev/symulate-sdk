import { BaseSchema } from './schema';
import { Collection, CollectionConfig, OperationName, QueryOptions, PaginatedResponse, OperationOptions } from './collection.types';
import { DataStore } from './dataStore';
import { getConfig, isDevelopment } from './config';
import { registerCollection, getCollection } from './collectionRegistry';
import { ErrorConfig, ParameterConfig, ParameterRole } from './types';
import { schemaToTypeDescription } from './schema';
import { PLATFORM_CONFIG } from './platformConfig';
import { resolveJoins } from './relations';

/**
 * Check if any error condition is met and throw appropriate error with generated response
 */
async function checkAndThrowError(errors: ErrorConfig[] | undefined, input: any, path: string, method: string): Promise<void> {
  if (!errors || errors.length === 0) return;

  for (const errorConfig of errors) {
    // Check failNow first
    if (errorConfig.failNow) {
      await throwGeneratedError(errorConfig, input, path, method);
    }

    // Check failIf condition
    if (errorConfig.failIf) {
      const shouldFail = await errorConfig.failIf(input);
      if (shouldFail) {
        await throwGeneratedError(errorConfig, input, path, method);
      }
    }
  }
}

/**
 * Throw error with generated response
 * Supports both BYOK (OpenAI) and Platform API modes
 */
async function throwGeneratedError(errorConfig: ErrorConfig, input: any, path: string, method: string): Promise<never> {
  console.log(`[Symulate] ⚠️ Simulating error response (${errorConfig.code})`);

  let errorResponse: any;

  // Generate realistic error response if schema is provided
  if (errorConfig.schema) {
    try {
      // Use AI provider (supports both BYOK and Platform modes)
      const { generateWithAI } = await import('./aiProvider');
      const typeDescription = schemaToTypeDescription(errorConfig.schema);

      const result = await generateWithAI({
        schema: errorConfig.schema,
        instruction: errorConfig.description || `Generate a realistic error response for HTTP ${errorConfig.code}`,
        typeDescription,
      });

      errorResponse = result;
    } catch (err) {
      console.warn('[Symulate] Failed to generate error response with AI:', err);
      // Fallback to simple error if generation fails
      errorResponse = {
        error: errorConfig.description || 'Operation failed',
        code: errorConfig.code,
      };
    }
  } else {
    // Default error response
    errorResponse = {
      error: errorConfig.description || 'Operation failed',
      code: errorConfig.code,
    };
  }

  // Create error with status code and response
  const error: any = new Error(typeof errorResponse === 'string' ? errorResponse : (errorResponse.error || errorResponse.message || JSON.stringify(errorResponse)));
  error.status = errorConfig.code;
  error.response = errorResponse;
  throw error;
}

/**
 * Extract parameter configuration by role from params array
 * Returns the parameter config for a specific role, or undefined if not found
 */
function getParamByRole(params: ParameterConfig[] | undefined, role: ParameterRole): ParameterConfig | undefined {
  if (!params) return undefined;
  return params.find(p => p.role === role);
}

/**
 * Get the fetch function to use for a request
 * Priority: operation-level fetch > global config fetch > native fetch
 */
function getFetchFunction(operationFetch?: typeof fetch): typeof fetch {
  if (operationFetch) return operationFetch;

  const config = getConfig();
  if (config.fetch) return config.fetch;

  return fetch;
}

/**
 * Project response data to match the responseSchema
 * Picks only the fields defined in the responseSchema
 */
function projectResponse<T>(data: T | T[], responseSchema: BaseSchema<any>): any {
  if (!responseSchema || responseSchema._meta.schemaType !== 'object') {
    return data;
  }

  const objectSchema = responseSchema as any;
  const fields = Object.keys(objectSchema._shape || {});

  if (fields.length === 0) {
    return data;
  }

  const projectItem = (item: any): any => {
    const projected: any = {};
    for (const field of fields) {
      if (field in item) {
        projected[field] = item[field];
      }
    }
    return projected;
  };

  if (Array.isArray(data)) {
    return data.map(projectItem);
  } else {
    return projectItem(data);
  }
}

/**
 * Build response object matching the given schema
 * Simply iterates through schema fields and builds each one according to its type
 */
async function buildResponseFromSchema(
  result: any,
  schema: BaseSchema<any>,
  collectionConfig: any
): Promise<any> {
  if (schema._meta.schemaType !== 'object') {
    // Not an object schema, can't build response
    return result;
  }

  const schemaShape = (schema as any)._shape;
  const response: any = {};

  // Get the source data
  const sourceData = result.data || (Array.isArray(result) ? result : []);
  const pagination = result.pagination;

  // Build ONE response object with all fields
  for (const [key, fieldSchema] of Object.entries(schemaShape)) {
    response[key] = await buildField(
      key,
      fieldSchema as any,
      sourceData,
      pagination,
      collectionConfig
    );
  }

  return response;
}

/**
 * Build a single field value based on its schema type
 */
async function buildField(
  fieldName: string,
  fieldSchema: any,
  sourceData: any[],
  pagination: any,
  collectionConfig: any
): Promise<any> {
  const schemaType = fieldSchema._meta?.schemaType;

  if (schemaType === 'array') {
    // Array field - apply element schema to source data
    const elementSchema = fieldSchema._element;
    if (elementSchema) {
      let processedData = sourceData;
      if (collectionConfig.relations) {
        processedData = await resolveJoins(processedData, elementSchema, collectionConfig.relations, collectionConfig.name);
      }
      processedData = projectResponse(processedData, elementSchema);
      return processedData;
    }
    return sourceData;
  } else if (schemaType === 'object') {
    // Object field - build nested object from schema
    return await buildNestedObject(fieldSchema, sourceData, pagination, collectionConfig);
  } else if (schemaType?.startsWith('collectionsMeta.')) {
    // Collection metadata field
    return calculateMetaField(schemaType, sourceData, pagination);
  } else {
    // Primitive field - return null (user should populate these)
    return null;
  }
}

/**
 * Build a nested object from its schema
 */
async function buildNestedObject(
  schema: any,
  sourceData: any[],
  pagination: any,
  collectionConfig: any
): Promise<any> {
  const schemaShape = schema._shape || {};
  const obj: any = {};

  for (const [key, fieldSchema] of Object.entries(schemaShape)) {
    obj[key] = await buildField(
      key,
      fieldSchema as any,
      sourceData,
      pagination,
      collectionConfig
    );
  }

  return obj;
}


/**
 * Calculate a single meta field value
 */
function calculateMetaField(schemaType: string, data: any[], pagination: any): any {
  if (schemaType === 'collectionsMeta.total') {
    return pagination?.total || data.length;
  } else if (schemaType === 'collectionsMeta.page') {
    return pagination?.page || 1;
  } else if (schemaType === 'collectionsMeta.limit') {
    return pagination?.limit || data.length;
  } else if (schemaType === 'collectionsMeta.totalPages') {
    return pagination?.totalPages || 1;
  } else if (schemaType.startsWith('collectionsMeta.avg:')) {
    const fieldName = schemaType.split(':')[1];
    const sum = data.reduce((acc, item) => acc + (Number(item[fieldName]) || 0), 0);
    return data.length > 0 ? sum / data.length : 0;
  } else if (schemaType.startsWith('collectionsMeta.sum:')) {
    const fieldName = schemaType.split(':')[1];
    return data.reduce((acc, item) => acc + (Number(item[fieldName]) || 0), 0);
  } else if (schemaType.startsWith('collectionsMeta.min:')) {
    const fieldName = schemaType.split(':')[1];
    const values = data.map(item => Number(item[fieldName])).filter(v => !isNaN(v));
    return values.length > 0 ? Math.min(...values) : 0;
  } else if (schemaType.startsWith('collectionsMeta.max:')) {
    const fieldName = schemaType.split(':')[1];
    const values = data.map(item => Number(item[fieldName])).filter(v => !isNaN(v));
    return values.length > 0 ? Math.max(...values) : 0;
  } else if (schemaType.startsWith('collectionsMeta.count:')) {
    const parts = schemaType.split(':');
    const fieldName = parts[1];
    const targetValue = parts[2] ? JSON.parse(parts[2]) : null;
    return data.filter(item => item[fieldName] === targetValue).length;
  }

  return null;
}

/**
 * Serialize autoGenerate config for sending to edge function
 * Converts functions to a serializable format
 */
function serializeAutoGenerate(autoGenerate?: any): any {
  if (!autoGenerate) return undefined;

  const serialized: any = {};

  for (const [fieldName, config] of Object.entries(autoGenerate)) {
    if (typeof config === 'function') {
      // Custom generator function - cannot be serialized, warn user
      console.warn(`[Symulate] Custom generator functions for field '${fieldName}' are not supported in stateful collections. Use built-in generators or 'ai' mode instead.`);
      continue;
    }

    if (typeof config === 'string') {
      // Shorthand syntax - pass through
      serialized[fieldName] = config;
    } else if (typeof config === 'object') {
      // Full config object
      const configCopy: any = { ...config };

      // Check if generator is a function
      if (typeof configCopy.generator === 'function') {
        console.warn(`[Symulate] Custom generator functions for field '${fieldName}' are not supported in stateful collections. Use built-in generators or 'ai' mode instead.`);
        continue;
      }

      // Check if condition is a function
      if (typeof configCopy.condition === 'function') {
        console.warn(`[Symulate] Condition functions for field '${fieldName}' are not supported in stateful collections. The field will be generated unconditionally.`);
        delete configCopy.condition;
      }

      serialized[fieldName] = configCopy;
    }
  }

  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

/**
 * Define a stateful CRUD collection
 *
 * @template TBase - The base schema type (inferred from schema property)
 * @template TResponse - The response schema type with joins (inferred from responseSchema property), defaults to TBase
 *
 * @example
 * // Without responseSchema (TResponse = TBase)
 * const users = defineCollection({
 *   name: 'users',
 *   schema: UserSchema,
 *   seedCount: 50
 * });
 *
 * // With responseSchema (TResponse includes join fields)
 * const orders = defineCollection({
 *   name: 'orders',
 *   schema: OrderSchema,
 *   responseSchema: OrderResponseSchema, // includes userName, userEmail from joins
 *   relations: { user: {...} }
 * });
 *
 * await users.list();
 * await users.get('id');
 * await users.create(data); // data: TBase (no join fields)
 */
export function defineCollection<
  TBase extends Record<string, any>,
  TResponse extends Record<string, any> = TBase
>(
  config: CollectionConfig<TBase> & {
    responseSchema?: BaseSchema<TResponse>;
  }
): Collection<TBase, TResponse> {
  // Check if already registered - only return if exact same config
  const existing = getCollection(config.name);
  if (existing) {
    console.warn(`Collection "${config.name}" already registered. Returning existing instance.`);
    return existing as Collection<TBase, TResponse>;
  }

  // Normalize configuration
  const normalizedConfig = normalizeConfig(config);

  // Validate persistence mode configuration
  const globalConfig = getConfig();
  const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();
  validatePersistenceMode(persistenceMode);

  // Create DataStore (uses base schema for storage)
  const store = new DataStore<TBase>({
    collectionName: normalizedConfig.name,
    schema: normalizedConfig.schema,
    seedCount: normalizedConfig.seedCount,
    seedInstruction: normalizedConfig.seedInstruction,
  });

  // Generate base path
  const basePath = normalizedConfig.basePath;

  // Create endpoints map and track enabled operations
  const endpoints = new Map<OperationName, any>();

  // Check which operations are enabled
  const opsConfig = normalizedConfig.operations;
  const enabledOps = {
    list: isOperationEnabled(opsConfig.list),
    get: isOperationEnabled(opsConfig.get),
    create: isOperationEnabled(opsConfig.create),
    update: isOperationEnabled(opsConfig.update),
    replace: isOperationEnabled(opsConfig.replace),
    delete: isOperationEnabled(opsConfig.delete),
  };

  // Mark enabled operations in endpoints map
  Object.entries(enabledOps).forEach(([op, enabled]) => {
    if (enabled) {
      endpoints.set(op as OperationName, true);
    }
  });

  // Create collection object (start with metadata only)
  const collection: any = {
    // Metadata
    name: normalizedConfig.name,
    basePath,
    schema: normalizedConfig.schema,
    endpoints,
    store,
  };

  // Conditionally add CRUD methods based on enabled operations
  if (enabledOps.list) {
    collection.list = async function(options?: QueryOptions): Promise<any> {
      if (!isDevelopment()) {
        // Production: call real backend
        return await callBackendList(normalizedConfig, basePath, options);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'list');
      await checkAndThrowError(operationConfig?.errors, options, basePath, 'GET');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      // Extract response schema if defined
      const responseSchema = operationConfig?.responseSchema || normalizedConfig.responseSchema;

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      let result;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore WITHOUT responseSchema (we'll resolve joins after)
        // The responseSchema is for item structure (with joins), not response structure
        result = await store.query(options);
      } else {
        // Use edge function for server-side persistence
        result = await callStatefulList(normalizedConfig, options);
      }

      // Transform response to match responseSchema if defined
      if (responseSchema && responseSchema._meta.schemaType === 'object') {
        // Check if this is a response envelope schema (has collectionsMeta fields)
        // or an item-level schema (with join fields for each item)
        const schemaShape = (responseSchema as any)._shape || {};
        const isResponseEnvelope = Object.values(schemaShape).some(
          (s: any) => s._meta?.schemaType?.startsWith('collectionsMeta.') || s._meta?.schemaType === 'array'
        );

        if (isResponseEnvelope) {
          result = await buildResponseFromSchema(result, responseSchema, normalizedConfig);
        } else {
          // Item-level schema: resolve joins and project fields on each item
          let items = result.data || [];
          if (normalizedConfig.relations) {
            items = await resolveJoins(items, responseSchema, normalizedConfig.relations, normalizedConfig.name);
          }
          items = projectResponse(items, responseSchema);
          result = { ...result, data: items };
        }
      }

      return result;
    };
  }

  if (enabledOps.get) {
    collection.get = async function(id: string, options?: OperationOptions): Promise<TResponse> {
      if (!isDevelopment()) {
        return await callBackendGet(basePath, id, options);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'get');
      await checkAndThrowError(operationConfig?.errors, { id }, `${basePath}/${id}`, 'GET');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      // Extract response schema if defined
      const responseSchema = operationConfig?.responseSchema || normalizedConfig.responseSchema;

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      let item;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore
        item = await store.findById(id);
        if (!item) {
          throw new Error(`${normalizedConfig.name} not found: ${id}`);
        }
      } else {
        // Use edge function for server-side persistence
        item = await callStatefulGet(normalizedConfig, id);
      }

      // Resolve joins and project fields if responseSchema is defined
      if (responseSchema) {
        if (normalizedConfig.relations) {
          item = await resolveJoins(item, responseSchema, normalizedConfig.relations, normalizedConfig.name);
        }
        item = projectResponse(item, responseSchema);
      }

      return item;
    };
  }

  if (enabledOps.create) {
    collection.create = async function(data: Omit<TBase, 'id' | 'createdAt' | 'updatedAt'>, options?: OperationOptions): Promise<TResponse> {
      if (!isDevelopment()) {
        return await callBackendCreate(basePath, data, options);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'create');
      await checkAndThrowError(operationConfig?.errors, data, basePath, 'POST');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      // Run hooks if defined
      let processedData = data as any;
      if (normalizedConfig.hooks?.beforeCreate) {
        processedData = await normalizedConfig.hooks.beforeCreate(processedData);
      }

      // Extract response schema if defined
      const responseSchema = operationConfig?.responseSchema || normalizedConfig.responseSchema;

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      let created: TBase;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore
        created = await store.insert(processedData);
      } else {
        // Use edge function for server-side persistence
        created = await callStatefulCreate<TBase>(normalizedConfig, processedData);
      }

      if (normalizedConfig.hooks?.afterCreate) {
        await normalizedConfig.hooks.afterCreate(created);
      }

      // Resolve joins and project fields if responseSchema is defined
      let result: any = created;
      if (responseSchema) {
        if (normalizedConfig.relations) {
          result = await resolveJoins(created, responseSchema, normalizedConfig.relations, normalizedConfig.name);
        }
        result = projectResponse(result, responseSchema);
      }

      return result as TResponse;
    };
  }

  if (enabledOps.update) {
    collection.update = async function(id: string, data: Partial<TBase>, options?: OperationOptions): Promise<TResponse> {
      if (!isDevelopment()) {
        return await callBackendUpdate(basePath, id, data, options);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'update');
      await checkAndThrowError(operationConfig?.errors, { id, ...data }, `${basePath}/${id}`, 'PATCH');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      let processedData = data;
      if (normalizedConfig.hooks?.beforeUpdate) {
        processedData = await normalizedConfig.hooks.beforeUpdate(id, data);
      }

      // Extract response schema if defined
      const responseSchema = operationConfig?.responseSchema || normalizedConfig.responseSchema;

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      let updated: TBase;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore
        const result = await store.update(id, processedData);
        if (!result) {
          throw new Error(`${normalizedConfig.name} not found: ${id}`);
        }
        updated = result;
      } else {
        // Use edge function for server-side persistence
        updated = await callStatefulUpdate<TBase>(normalizedConfig, id, processedData);
      }

      if (normalizedConfig.hooks?.afterUpdate) {
        await normalizedConfig.hooks.afterUpdate(updated);
      }

      // Resolve joins and project fields if responseSchema is defined
      let result: any = updated;
      if (responseSchema) {
        if (normalizedConfig.relations) {
          result = await resolveJoins(updated, responseSchema, normalizedConfig.relations, normalizedConfig.name);
        }
        result = projectResponse(result, responseSchema);
      }

      return result as TResponse;
    };
  }

  if (enabledOps.replace) {
    collection.replace = async function(id: string, data: Omit<TBase, 'id'>, options?: OperationOptions): Promise<TResponse> {
      if (!isDevelopment()) {
        return await callBackendReplace(basePath, id, data, options);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'replace');
      await checkAndThrowError(operationConfig?.errors, { id, ...data }, `${basePath}/${id}`, 'PUT');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      // Extract response schema if defined
      const responseSchema = operationConfig?.responseSchema || normalizedConfig.responseSchema;

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      let replaced: TBase;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore
        const result = await store.replace(id, data as TBase);
        if (!result) {
          throw new Error(`${normalizedConfig.name} not found: ${id}`);
        }
        replaced = result;
      } else {
        // Use edge function for server-side persistence (replace is same as update)
        replaced = await callStatefulUpdate<TBase>(normalizedConfig, id, data as TBase);
      }

      // Resolve joins and project fields if responseSchema is defined
      let result: any = replaced;
      if (responseSchema) {
        if (normalizedConfig.relations) {
          result = await resolveJoins(replaced, responseSchema, normalizedConfig.relations, normalizedConfig.name);
        }
        result = projectResponse(result, responseSchema);
      }

      return result as TResponse;
    };
  }

  if (enabledOps.delete) {
    collection.delete = async function(id: string, options?: OperationOptions): Promise<void> {
      if (!isDevelopment()) {
        return await callBackendDelete(basePath, id, options);
      }

      // Check persistence mode
      const globalConfig = getConfig();
      const persistenceMode = globalConfig.collections?.persistence?.mode || getDefaultPersistenceMode();

      // Get item for error check (use appropriate method based on persistence mode)
      let item: TBase | null;
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        item = await store.findById(id);
      } else {
        item = await callStatefulGet<TBase>(normalizedConfig, id);
      }

      // Check for error conditions
      const operationConfig = getOperationConfig(normalizedConfig, 'delete');
      await checkAndThrowError(operationConfig?.errors, item, `${basePath}/${id}`, 'DELETE');

      // Simulate loading delay if configured
      await applyDelay(operationConfig?.mock?.delay);

      if (normalizedConfig.hooks?.beforeDelete) {
        await normalizedConfig.hooks.beforeDelete(id);
      }

      // Delete using appropriate method
      if (persistenceMode === 'memory' || persistenceMode === 'local') {
        // Use local DataStore
        await store.delete(id);
      } else {
        // Use edge function for server-side persistence
        await callStatefulDelete(normalizedConfig, id);
      }

      if (normalizedConfig.hooks?.afterDelete) {
        await normalizedConfig.hooks.afterDelete(id);
      }
    };
  }

  // Add relation methods dynamically
  if (normalizedConfig.relations) {
    Object.entries(normalizedConfig.relations).forEach(([key, relationConfig]) => {
      const methodName = relationConfig.methodName || `get${capitalize(key)}`;

      collection[methodName] = async (parentId: string) => {
        if (!isDevelopment()) {
          return await callBackendRelation(basePath, parentId, key);
        }

        // Get related collection
        const relatedCollection = getCollection(relationConfig.collection);
        if (!relatedCollection) {
          throw new Error(`Related collection not found: ${relationConfig.collection}`);
        }

        // Query related items by foreign key
        const relatedStore = relatedCollection.store;
        const allItems = await relatedStore.toArray();

        return allItems.filter((item: any) =>
          item[relationConfig.foreignKey] === parentId
        );
      };
    });
  }

  // Register collection globally
  registerCollection(normalizedConfig.name, {
    name: normalizedConfig.name,
    config: normalizedConfig,
    instance: collection,
    endpoints,
    store,
    createdAt: new Date(),
  });

  return collection;
}

/**
 * Normalize collection config with defaults
 */
function normalizeConfig<T>(config: CollectionConfig<T>): Omit<Required<CollectionConfig<T>>, 'autoGenerate' | 'responseSchema'> & Pick<CollectionConfig<T>, 'autoGenerate' | 'responseSchema'> {
  return {
    name: config.name,
    schema: config.schema,
    responseSchema: config.responseSchema,
    basePath: config.basePath || `/${config.name}`,
    seedCount: config.seedCount ?? 10,
    seedInstruction: config.seedInstruction || '',
    operations: normalizeOperations(config.operations),
    relations: config.relations || {},
    plural: config.plural || pluralize(config.name),
    hooks: config.hooks || {},
    autoGenerate: config.autoGenerate,
  };
}

/**
 * Normalize operations config
 */
function normalizeOperations(ops: any): any {
  const defaults = {
    list: true,
    get: true,
    create: true,
    update: true,
    replace: true,
    delete: true,
  };

  if (!ops) return defaults;

  const normalized: any = {};

  Object.entries(defaults).forEach(([key, defaultValue]) => {
    const value = ops[key];

    if (value === undefined) {
      normalized[key] = defaultValue;
    } else if (typeof value === 'boolean') {
      normalized[key] = value;
    } else {
      // It's an OperationConfig object
      normalized[key] = { enabled: true, ...value };
    }
  });

  return normalized;
}

/**
 * Check if an operation is enabled
 */
function isOperationEnabled(config: boolean | any): boolean {
  if (config === undefined || config === true) return true;
  if (config === false) return false;
  if (typeof config === 'object') {
    return config.enabled !== false;
  }
  return true;
}

/**
 * Apply delay simulation if configured
 */
async function applyDelay(delay?: number): Promise<void> {
  if (delay && delay > 0) {
    console.log(`[Symulate] ⏱ Simulating ${delay}ms loading delay...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Get default persistence mode based on API key configuration
 * BYOK (openaiApiKey only) defaults to 'local'
 * Platform (symulateApiKey or demoApiKey) defaults to 'cloud'
 */
function getDefaultPersistenceMode(): 'local' | 'cloud' {
  const globalConfig = getConfig();

  // If using BYOK (only openaiApiKey, no platform keys)
  if (globalConfig.openaiApiKey && !globalConfig.symulateApiKey && !globalConfig.demoApiKey) {
    console.log('[Symulate] BYOK mode detected - using local persistence by default');
    return 'local';
  }

  // Default to cloud for platform users
  return 'cloud';
}

/**
 * Validate persistence mode configuration
 */
function validatePersistenceMode(mode: string): void {
  const globalConfig = getConfig();

  // Warn if trying to use cloud persistence with BYOK only
  if (mode === 'cloud' && globalConfig.openaiApiKey && !globalConfig.symulateApiKey && !globalConfig.demoApiKey) {
    console.warn(
      '[Symulate] WARNING: Cloud persistence requires Symulate Platform API key.\n' +
      'You are using BYOK mode (openaiApiKey only).\n' +
      'Please use local persistence instead:\n\n' +
      '  configureSymulate({\n' +
      '    openaiApiKey: "...",\n' +
      '    collections: { persistence: { mode: "local" } }\n' +
      '  })\n'
    );
  }
}

/**
 * Get operation config from normalized config
 */
function getOperationConfig(config: any, operation: OperationName): any {
  const opConfig = config.operations[operation];
  if (typeof opConfig === 'boolean') return null;
  return opConfig;
}

/**
 * Simple pluralization
 */
function pluralize(word: string): string {
  if (word.endsWith('y')) {
    return word.slice(0, -1) + 'ies';
  }
  if (word.endsWith('s')) {
    return word + 'es';
  }
  return word + 's';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Production mode backend calls
// These make standard HTTP requests to the real backend

async function callBackendList(collectionConfig: any, basePath: string, options?: QueryOptions): Promise<any> {
  const config = getConfig();
  const url = new URL(basePath, config.backendBaseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  let body: Record<string, any> | undefined;

  // Check if query params are disabled
  const globalDisabled = config.collections?.disableQueryParams === true;
  const operationConfig = getOperationConfig(collectionConfig, 'list');
  const operationDisabled = operationConfig?.disableQueryParams === true;

  if (options && !globalDisabled && !operationDisabled) {
    // Get params from operation config
    const params = operationConfig?.params;

    // Helper to add parameter based on role or default
    const addParam = (role: ParameterRole, defaultName: string, value: any) => {
      if (!value) return;

      // Try to find param with this role
      const param = getParamByRole(params, role);

      // Use param config if found, otherwise use defaults
      const name = param?.name || defaultName;
      const location = param?.location || 'query';
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : value.toString();

      if (location === 'query') {
        url.searchParams.set(name, stringValue);
      } else if (location === 'body') {
        if (!body) body = {};
        body[name] = value;
      } else if (location === 'header') {
        headers[name] = stringValue;
      }
    };

    // Add parameters based on their roles
    addParam('pagination.page', 'page', options.page);
    addParam('pagination.limit', 'limit', options.limit);
    addParam('sort.field', 'sortBy', options.sortBy);
    addParam('sort.order', 'sortOrder', options.sortOrder);
    addParam('filter', 'filter', options.filter);
  }

  const fetchOptions: RequestInit = {
    method: 'GET',
    headers
  };

  // If we have body params, we need to send as POST (GET with body is non-standard)
  if (body) {
    fetchOptions.method = 'POST';
    fetchOptions.body = JSON.stringify(body);
  }

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url.toString(), fetchOptions);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${basePath}: ${response.statusText}`);
  }
  return await response.json();
}

async function callBackendGet(basePath: string, id: string, options?: OperationOptions): Promise<any> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}/${id}`;

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${basePath}/${id}: ${response.statusText}`);
  }
  return await response.json();
}

async function callBackendCreate(basePath: string, data: any, options?: OperationOptions): Promise<any> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}`;

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create ${basePath}: ${response.statusText}`);
  }
  return await response.json();
}

async function callBackendUpdate(basePath: string, id: string, data: any, options?: OperationOptions): Promise<any> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}/${id}`;

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to update ${basePath}/${id}: ${response.statusText}`);
  }
  return await response.json();
}

async function callBackendReplace(basePath: string, id: string, data: any, options?: OperationOptions): Promise<any> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}/${id}`;

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to replace ${basePath}/${id}: ${response.statusText}`);
  }
  return await response.json();
}

async function callBackendDelete(basePath: string, id: string, options?: OperationOptions): Promise<void> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}/${id}`;

  const customFetch = getFetchFunction(options?.fetch);
  const response = await customFetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete ${basePath}/${id}: ${response.statusText}`);
  }
}

async function callBackendRelation(basePath: string, parentId: string, relationName: string): Promise<any> {
  const config = getConfig();
  const url = `${config.backendBaseUrl}${basePath}/${parentId}/${relationName}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${basePath}/${parentId}/${relationName}: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Get edge function URL based on config (demo vs regular)
 */
function getStatefulEdgeFunctionUrl(): string {
  const globalConfig = getConfig();
  if (globalConfig.demoApiKey) {
    return `${PLATFORM_CONFIG.supabase.url}/functions/v1/symulate-demo`;
  }
  return `${PLATFORM_CONFIG.supabase.url}/functions/v1/symulate`;
}

/**
 * Get headers for stateful operations based on config
 */
function getStatefulHeaders(operation: string): Record<string, string> {
  const globalConfig = getConfig();

  if (globalConfig.demoApiKey) {
    // Demo mode - use demo API key
    return {
      'Content-Type': 'application/json',
      'x-symulate-demo-key': globalConfig.demoApiKey,
      'x-symulate-stateful-operation': operation
    };
  }

  // Regular mode - use standard API keys
  return {
    'Content-Type': 'application/json',
    'x-mockend-api-key': globalConfig.symulateApiKey || '',
    'x-mockend-project-id': globalConfig.projectId || '',
    'x-symulate-stateful-operation': operation
  };
}

/**
 * Call edge function for stateful list operation
 */
async function callStatefulList<T>(collectionConfig: any, options?: QueryOptions): Promise<PaginatedResponse<T>> {
  const globalConfig = getConfig();
  const { schemaToTypeDescription } = await import('./schema');

  const entitySchema = schemaToTypeDescription(collectionConfig.schema);
  const operationConfig = getOperationConfig(collectionConfig, 'list');
  const responseSchema = operationConfig?.responseSchema ? schemaToTypeDescription(operationConfig.responseSchema) : undefined;
  const branch = globalConfig.collections?.branch || 'main';

  const url = getStatefulEdgeFunctionUrl();
  const headers = getStatefulHeaders('list');

  console.log('[callStatefulList] URL:', url, 'demoApiKey:', globalConfig.demoApiKey ? 'SET' : 'NOT SET');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionName: collectionConfig.name,
      operation: 'list',
      entitySchema,
      responseSchema,
      instruction: collectionConfig.seedInstruction,
      branch,
      page: options?.page || 1,
      limit: options?.limit || 20,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
      filters: options?.filter,
      autoGenerate: serializeAutoGenerate(collectionConfig.autoGenerate)
    })
  });

  if (!response.ok) {
    throw new Error(`Stateful list failed: ${response.statusText}`);
  }

  return (await response.json()) as PaginatedResponse<T>;
}

/**
 * Call edge function for stateful get operation
 */
async function callStatefulGet<T>(collectionConfig: any, id: string): Promise<T> {
  const globalConfig = getConfig();
  const { schemaToTypeDescription } = await import('./schema');

  const entitySchema = schemaToTypeDescription(collectionConfig.schema);
  const operationConfig = getOperationConfig(collectionConfig, 'get');
  const responseSchema = operationConfig?.responseSchema ? schemaToTypeDescription(operationConfig.responseSchema) : undefined;

  // First get the full list to find the item
  const listResponse = await callStatefulList<T>(collectionConfig, { page: 1, limit: 1000 });
  const item = listResponse.data.find((i: any) => i.id === id);

  if (!item) {
    throw new Error(`${collectionConfig.name} not found: ${id}`);
  }

  return item as T;
}

/**
 * Call edge function for stateful create operation
 */
async function callStatefulCreate<T>(collectionConfig: any, data: any): Promise<T> {
  const globalConfig = getConfig();
  const { schemaToTypeDescription } = await import('./schema');

  const entitySchema = schemaToTypeDescription(collectionConfig.schema);
  const operationConfig = getOperationConfig(collectionConfig, 'create');
  const responseSchema = operationConfig?.responseSchema ? schemaToTypeDescription(operationConfig.responseSchema) : undefined;
  const branch = globalConfig.collections?.branch || 'main';

  const url = getStatefulEdgeFunctionUrl();
  const headers = getStatefulHeaders('create');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionName: collectionConfig.name,
      operation: 'create',
      entitySchema,
      responseSchema,
      branch,
      data,
      autoGenerate: serializeAutoGenerate(collectionConfig.autoGenerate)
    })
  });

  if (!response.ok) {
    throw new Error(`Stateful create failed: ${response.statusText}`);
  }

  return (await response.json()) as T;
}

/**
 * Call edge function for stateful update operation
 */
async function callStatefulUpdate<T>(collectionConfig: any, id: string, data: any): Promise<T> {
  const globalConfig = getConfig();
  const { schemaToTypeDescription } = await import('./schema');

  const entitySchema = schemaToTypeDescription(collectionConfig.schema);
  const operationConfig = getOperationConfig(collectionConfig, 'update');
  const responseSchema = operationConfig?.responseSchema ? schemaToTypeDescription(operationConfig.responseSchema) : undefined;
  const branch = globalConfig.collections?.branch || 'main';

  const url = getStatefulEdgeFunctionUrl();
  const headers = getStatefulHeaders('update');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionName: collectionConfig.name,
      operation: 'update',
      entitySchema,
      responseSchema,
      branch,
      id,
      data,
      autoGenerate: serializeAutoGenerate(collectionConfig.autoGenerate)
    })
  });

  if (!response.ok) {
    throw new Error(`Stateful update failed: ${response.statusText}`);
  }

  return (await response.json()) as T;
}

/**
 * Call edge function for stateful delete operation
 */
async function callStatefulDelete(collectionConfig: any, id: string): Promise<void> {
  const globalConfig = getConfig();
  const { schemaToTypeDescription } = await import('./schema');

  const entitySchema = schemaToTypeDescription(collectionConfig.schema);
  const operationConfig = getOperationConfig(collectionConfig, 'delete');
  const responseSchema = operationConfig?.responseSchema ? schemaToTypeDescription(operationConfig.responseSchema) : undefined;
  const branch = globalConfig.collections?.branch || 'main';

  const url = getStatefulEdgeFunctionUrl();
  const headers = getStatefulHeaders('delete');

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      collectionName: collectionConfig.name,
      operation: 'delete',
      entitySchema,
      responseSchema,
      branch,
      id
    })
  });

  if (!response.ok) {
    throw new Error(`Stateful delete failed: ${response.statusText}`);
  }
}
