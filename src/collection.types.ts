import { BaseSchema, Infer } from './schema';
import { ErrorConfig, ParameterConfig, MockConfig } from './types';

/**
 * HTTP methods supported for CRUD operations
 */
export type CRUDMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Standard CRUD operation names
 */
export type OperationName = 'list' | 'get' | 'create' | 'update' | 'replace' | 'delete';

/**
 * Configuration for a single CRUD operation
 * Has same capabilities as defineEndpoint for consistency
 */
export interface OperationConfig {
  /**
   * Enable/disable this operation
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom path for this operation
   * If not provided, uses convention-based path
   * @example '/api/users' or '/api/users/:id'
   */
  path?: string;

  /**
   * HTTP method override (rarely needed)
   * @default Convention-based (GET for list/get, POST for create, etc.)
   */
  method?: CRUDMethod;

  /**
   * Response schema for this operation
   * Defines the structure of data returned by this specific operation
   * Different from the collection's entity schema
   *
   * Examples:
   * - list: Response with { data: T[], pagination: {...} }
   * - get: Single entity T
   * - create/update/replace: Created/updated entity T
   * - delete: void or { success: boolean }
   *
   * Note: Should only use fields from the collection's entity schema
   */
  responseSchema?: BaseSchema<any>;

  /**
   * Parameter definitions (path, query, body, headers)
   * Same as defineEndpoint params
   *
   * @example
   * params: [
   *   { name: 'id', location: 'path', schema: m.string(), required: true },
   *   { name: 'page', location: 'query', schema: m.number() }
   * ]
   */
  params?: ParameterConfig[];

  /**
   * Error configurations for this operation
   * Each error can have a failIf condition to trigger it conditionally
   * Same as defineEndpoint errors config
   */
  errors?: ErrorConfig[];

  /**
   * Custom mock configuration for this operation
   * Same as defineEndpoint mock config
   */
  mock?: MockConfig;

  /**
   * Override environment mode for this operation
   * @default Uses global config
   */
  mode?: 'mock' | 'production';

  /**
   * Disable automatic query parameters (pagination, sorting, filtering) for this operation
   * Overrides global disableQueryParams setting
   * @default false (query params are enabled)
   */
  disableQueryParams?: boolean;

}

/**
 * Configuration for all CRUD operations
 */
export interface OperationsConfig {
  list?: boolean | OperationConfig;
  get?: boolean | OperationConfig;
  create?: boolean | OperationConfig;
  update?: boolean | OperationConfig;
  replace?: boolean | OperationConfig;
  delete?: boolean | OperationConfig;
}

/**
 * Built-in generator types for auto-generated fields
 */
export type GeneratorType =
  | 'uuid'        // Generate UUID (crypto.randomUUID())
  | 'timestamp'   // Generate ISO timestamp
  | 'nanoid'      // Generate NanoID
  | 'cuid'        // Generate CUID
  | 'increment'   // Auto-incrementing integer
  | 'ai';         // AI-powered generation with instruction

/**
 * Custom generator function that receives the data being created/updated
 */
export type CustomGeneratorFunction = (data: any) => any | Promise<any>;

/**
 * Configuration for a single auto-generated field
 */
export interface AutoGenerateFieldConfig {
  /**
   * Generator type or custom function
   */
  generator: GeneratorType | CustomGeneratorFunction;

  /**
   * Instruction for AI generator (only used when generator is 'ai')
   */
  instruction?: string;

  /**
   * Field dependencies - this field will only be generated if these fields are present
   * Supports dot notation for nested fields (e.g., 'author.email')
   */
  dependsOn?: string[];

  /**
   * Condition function - field is only generated if this returns true
   */
  condition?: (data: any) => boolean | Promise<boolean>;

  /**
   * Whether to generate on create
   * @default true
   */
  onCreate?: boolean;

  /**
   * Whether to regenerate on update
   * @default false
   */
  onUpdate?: boolean;

  /**
   * Cache the generated value (don't regenerate on updates even if onUpdate is true)
   * Useful for stable fields like slugs
   * @default false
   */
  cache?: boolean;
}

/**
 * Auto-generate configuration
 * Maps field names to their generation config
 *
 * Supports shorthand syntax for common generators:
 * @example
 * {
 *   id: 'uuid',  // Shorthand
 *   slug: {      // Full config
 *     generator: 'ai',
 *     instruction: 'Create URL-friendly slug from title',
 *     dependsOn: ['title']
 *   }
 * }
 */
export type AutoGenerateConfig = Record<string, GeneratorType | CustomGeneratorFunction | AutoGenerateFieldConfig>;

/**
 * Configuration for a related collection
 */
export interface RelationConfig {
  /**
   * Type of relationship
   * - belongsTo: Many-to-one (e.g., Purchase belongs to User)
   * - hasMany: One-to-many (e.g., User has many Purchases)
   * - hasOne: One-to-one (e.g., User has one Profile)
   */
  type: 'belongsTo' | 'hasMany' | 'hasOne';

  /**
   * Name of the related collection
   */
  collection: string;

  /**
   * Foreign key field name in THIS collection (for belongsTo)
   * or in the RELATED collection (for hasMany/hasOne)
   * @example 'userId' for purchases.userId (belongsTo)
   */
  foreignKey: string;

  /**
   * Field in the related collection that the foreign key references
   * @default 'id'
   */
  references?: string;

  /**
   * Method name for accessing relation
   * If not provided, uses 'get' + capitalized collection name
   * @example 'getPosts' for users.getPosts(userId)
   */
  methodName?: string;
}

/**
 * Main configuration for defineCollection
 */
export interface CollectionConfig<T = any> {
  /**
   * Unique name for this collection
   * Used to generate method names and default paths
   * @example 'users' → users.list(), /users
   */
  name: string;

  /**
   * Schema definition for the collection.
   * This is what will be generated and stored for this collection.
   * Using the oprations, you will be able to perform some actions on the stored collection.
   * Uses Symulate schema builder (m.object(...))
   */
  schema: BaseSchema<T>;

  /**
   * Response schema with joined fields (optional)
   * Use this when you want to include fields from related collections in responses
   * The schema should include m.join() fields for related data
   * @example responseSchema with m.join('user', 'email')
   */
  responseSchema?: BaseSchema<any>;

  /**
   * Base path for all endpoints
   * @default `/${name}`
   * @example '/api/v1/users'
   */
  basePath?: string;

  /**
   * Number of seed items to generate
   * @default 10
   */
  seedCount?: number;

  /**
   * Seed data generation instruction for AI
   * @example 'Generate realistic employees from a tech company'
   */
  seedInstruction?: string;

  /**
   * Configure which operations to generate
   * @default All operations enabled
   */
  operations?: OperationsConfig;

  /**
   * Define relationships to other collections
   */
  relations?: Record<string, RelationConfig>;

  /**
   * Custom plural form for naming
   * @example { name: 'person', plural: 'people' }
   */
  plural?: string;

  /**
   * Auto-generate field configuration
   * Defines which fields should be automatically generated on create/update
   *
   * @example
   * autoGenerate: {
   *   id: 'uuid',
   *   createdAt: 'timestamp',
   *   updatedAt: { generator: 'timestamp', onCreate: true, onUpdate: true },
   *   slug: {
   *     generator: 'ai',
   *     instruction: 'Create URL-friendly slug from title',
   *     dependsOn: ['title']
   *   }
   * }
   */
  autoGenerate?: AutoGenerateConfig;

  /**
   * Lifecycle hooks (future enhancement)
   */
  hooks?: {
    beforeCreate?: (data: T) => T | Promise<T>;
    afterCreate?: (data: T) => void | Promise<void>;
    beforeUpdate?: (id: string, data: Partial<T>) => Partial<T> | Promise<Partial<T>>;
    afterUpdate?: (data: T) => void | Promise<void>;
    beforeDelete?: (id: string) => boolean | Promise<boolean>;
    afterDelete?: (id: string) => void | Promise<void>;
  };
}

/**
 * Query options for list operation
 */
export interface QueryOptions {
  /**
   * Page number (1-indexed)
   */
  page?: number;

  /**
   * Items per page
   * @default 20
   */
  limit?: number;

  /**
   * Field to sort by
   */
  sortBy?: string;

  /**
   * Sort order
   * @default 'asc'
   */
  sortOrder?: 'asc' | 'desc';

  /**
   * Filter criteria (future enhancement)
   */
  filter?: Record<string, any>;

  /**
   * Custom fetch implementation for this specific operation
   * Overrides global fetch configuration
   */
  fetch?: typeof fetch;
}

/**
 * Options for single-item operations (get, update, replace, delete)
 */
export interface OperationOptions {
  /**
   * Custom fetch implementation for this specific operation
   * Overrides global fetch configuration
   */
  fetch?: typeof fetch;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Collection instance returned by defineCollection
 * @template TBase - The base schema type (used for inputs like create/update)
 * @template TResponse - The response schema type with joins (used for outputs), defaults to TBase if no responseSchema
 */
export interface Collection<TBase = any, TResponse = TBase> {
  /**
   * Collection name
   */
  readonly name: string;

  /**
   * Base path for all endpoints
   */
  readonly basePath: string;

  /**
   * Schema definition
   */
  readonly schema: BaseSchema<TBase>;

  /**
   * Generated endpoints map
   * Key: operation name, Value: endpoint config
   */
  readonly endpoints: Map<OperationName, any>;

  /**
   * Internal data store (for advanced use)
   */
  readonly store: any;

  // CRUD Operations

  /**
   * List all items with pagination
   * GET /{basePath}
   *
   * Returns PaginatedResponse<TResponse> by default, or custom response shape if
   * operation-specific responseSchema is defined in operations.list.responseSchema
   */
  list(options?: QueryOptions): Promise<any>;

  /**
   * Get single item by ID
   * GET /{basePath}/:id
   *
   * Returns item with joined fields if responseSchema is defined
   */
  get(id: string, options?: OperationOptions): Promise<TResponse>;

  /**
   * Create new item
   * POST /{basePath}
   *
   * Input: base schema fields (no joins)
   * Output: response schema with joined fields if responseSchema is defined
   */
  create(data: Omit<TBase, 'id' | 'createdAt' | 'updatedAt'>, options?: OperationOptions): Promise<TResponse>;

  /**
   * Partial update (PATCH)
   * PATCH /{basePath}/:id
   *
   * Input: partial base schema fields (no joins)
   * Output: response schema with joined fields if responseSchema is defined
   */
  update(id: string, data: Partial<TBase>, options?: OperationOptions): Promise<TResponse>;

  /**
   * Full replacement (PUT)
   * PUT /{basePath}/:id
   *
   * Input: base schema fields (no joins)
   * Output: response schema with joined fields if responseSchema is defined
   */
  replace(id: string, data: Omit<TBase, 'id'>, options?: OperationOptions): Promise<TResponse>;

  /**
   * Delete item
   * DELETE /{basePath}/:id
   */
  delete(id: string, options?: OperationOptions): Promise<void>;

  // Dynamic relation methods added at runtime
  // e.g., getPosts(userId: string): Promise<Post[]>
  [key: string]: any;
}

/**
 * Internal metadata for collection registry
 * @template TBase - The base schema type
 * @template TResponse - The response schema type with joins, defaults to TBase
 */
export interface CollectionMetadata<TBase = any, TResponse = TBase> {
  name: string;
  config: CollectionConfig<TBase>;
  instance: Collection<TBase, TResponse>;
  endpoints: Map<OperationName, any>;
  store: any;
  createdAt: Date;
}

/**
 * Configuration for collection persistence
 */
export interface PersistenceConfig {
  /**
   * Persistence mode
   * - 'memory': In-memory only (default)
   * - 'local': localStorage (browser) or file (Node.js)
   * - 'cloud': Cloud sync via Supabase
   */
  mode: 'memory' | 'local' | 'cloud';

  /**
   * File path for local file persistence in Node.js
   * @default '.symulate-data.json'
   */
  filePath?: string;

  /**
   * Auto-save interval in milliseconds
   * @default 5000 (5 seconds)
   */
  autoSaveInterval?: number;
}

/**
 * Extract inferred type from schema
 */
export type InferCollection<C extends Collection<any>> =
  C extends Collection<infer T> ? T : never;

/**
 * Helper to ensure operation config is normalized
 */
export type NormalizedOperationConfig = Required<OperationConfig> & {
  enabled: true;
};

/**
 * Map of operation name to normalized config
 */
export type NormalizedOperations = Partial<Record<OperationName, NormalizedOperationConfig>>;
