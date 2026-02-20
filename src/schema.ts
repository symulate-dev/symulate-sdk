/**
 * Schema builder for Mockend - defines both TypeScript types and runtime schema information
 * Similar to Zod, but optimized for mock data generation
 */

export type SchemaType =
  | "uuid"
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "email"
  | "url"
  | "phoneNumber"
  | "person.fullName"
  | "person.firstName"
  | "person.lastName"
  | "person.jobTitle"
  | "internet.userName"
  | "internet.avatar"
  | "internet.jwt"
  | "location.street"
  | "location.city"
  | "location.state"
  | "location.zipCode"
  | "location.country"
  | "location.latitude"
  | "location.longitude"
  | "commerce.productName"
  | "commerce.department"
  | "commerce.price"
  | "lorem.word"
  | "lorem.sentence"
  | "lorem.paragraph"
  | "collectionsMeta.page"
  | "collectionsMeta.limit"
  | "collectionsMeta.total"
  | "collectionsMeta.totalPages"
  | string; // Allow dynamic collectionsMeta types like "collectionsMeta.avg:price"

export type JsonType = "string" | "number" | "boolean" | "object" | "array";

export interface BaseSchema<T = any> {
  _type: T;
  _meta: {
    schemaType: SchemaType | "object" | "array";
    description?: string;
    dataType?: JsonType; // Optional override for JSON type
    optional?: boolean; // Whether this field can be undefined (for 25% undefined chance in generation)
  };
}

export interface StringSchema extends BaseSchema<string> {
  _meta: {
    schemaType: SchemaType;
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
    dbReference?: {
      schema?: string;
      table: string;
      column: string;
    };
  };
}

export interface NumberSchema extends BaseSchema<number> {
  _meta: {
    schemaType: "number" | "commerce.price" | "collectionsMeta.page" | "collectionsMeta.limit" | "collectionsMeta.total" | "collectionsMeta.totalPages" | string;
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
    dbReference?: {
      schema?: string;
      table: string;
      column: string;
    };
  };
}

export interface BooleanSchema extends BaseSchema<boolean> {
  _meta: {
    schemaType: "boolean";
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
    dbReference?: {
      schema?: string;
      table: string;
      column: string;
    };
  };
}

export interface ObjectSchema<T extends Record<string, any>> extends BaseSchema<T> {
  _meta: {
    schemaType: "object";
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
  };
  _shape: { [K in keyof T]: BaseSchema<T[K]> };
}

export interface ArraySchema<T> extends BaseSchema<T[]> {
  _meta: {
    schemaType: "array";
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
    isDataArray?: boolean; // Marks this array as the main data array for list responses
  };
  _element: BaseSchema<T>;
}

export interface JoinSchema extends BaseSchema<any> {
  _meta: {
    schemaType: "join";
    description?: string;
    dataType?: JsonType;
    optional?: boolean;
    join: {
      relationPath: string; // e.g., "user" or "purchase.user"
      field?: string; // Optional field to extract, e.g., "email"
    };
  };
}

// Type inference helper
export type Infer<T extends BaseSchema> = T["_type"];

// Schema builder options
export interface SchemaOptions {
  description?: string;
  dataType?: JsonType;
}

// Schema builders
export class SchemaBuilder {
  // Primitive types
  uuid(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "uuid", description: opts?.description, dataType: opts?.dataType },
    };
  }

  string(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "string", description: opts?.description, dataType: opts?.dataType },
    };
  }

  number(options?: string | SchemaOptions): NumberSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: 0 as number,
      _meta: { schemaType: "number", description: opts?.description, dataType: opts?.dataType },
    };
  }

  boolean(options?: string | SchemaOptions): BooleanSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: false as boolean,
      _meta: { schemaType: "boolean", description: opts?.description, dataType: opts?.dataType },
    };
  }

  date(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "date", description: opts?.description, dataType: opts?.dataType },
    };
  }

  email(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "email", description: opts?.description, dataType: opts?.dataType },
    };
  }

  url(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "url", description: opts?.description, dataType: opts?.dataType },
    };
  }

  phoneNumber(options?: string | SchemaOptions): StringSchema {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: "" as string,
      _meta: { schemaType: "phoneNumber", description: opts?.description, dataType: opts?.dataType },
    };
  }

  // Person fields
  person = {
    fullName: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "person.fullName", description: opts?.description, dataType: opts?.dataType },
      };
    },
    firstName: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "person.firstName", description: opts?.description, dataType: opts?.dataType },
      };
    },
    lastName: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "person.lastName", description: opts?.description, dataType: opts?.dataType },
      };
    },
    jobTitle: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "person.jobTitle", description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Internet fields
  internet = {
    userName: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "internet.userName", description: opts?.description, dataType: opts?.dataType },
      };
    },
    avatar: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "internet.avatar", description: opts?.description, dataType: opts?.dataType },
      };
    },
    jwt: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "internet.jwt", description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Location fields
  location = {
    street: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.street", description: opts?.description, dataType: opts?.dataType },
      };
    },
    city: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.city", description: opts?.description, dataType: opts?.dataType },
      };
    },
    state: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.state", description: opts?.description, dataType: opts?.dataType },
      };
    },
    zipCode: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.zipCode", description: opts?.description, dataType: opts?.dataType },
      };
    },
    country: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.country", description: opts?.description, dataType: opts?.dataType },
      };
    },
    latitude: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.latitude", description: opts?.description, dataType: opts?.dataType },
      };
    },
    longitude: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "location.longitude", description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Commerce fields
  commerce = {
    productName: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "commerce.productName", description: opts?.description, dataType: opts?.dataType },
      };
    },
    department: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "commerce.department", description: opts?.description, dataType: opts?.dataType },
      };
    },
    price: (options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: "commerce.price", description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Lorem fields
  lorem = {
    word: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "lorem.word", description: opts?.description, dataType: opts?.dataType },
      };
    },
    sentence: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "lorem.sentence", description: opts?.description, dataType: opts?.dataType },
      };
    },
    paragraph: (options?: string | SchemaOptions): StringSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: "" as string,
        _meta: { schemaType: "lorem.paragraph", description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Collections meta fields - populated automatically during list operations
  collectionsMeta = {
    // Pagination fields
    page: (options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: "collectionsMeta.page", description: opts?.description, dataType: opts?.dataType },
      };
    },
    limit: (options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: "collectionsMeta.limit", description: opts?.description, dataType: opts?.dataType },
      };
    },
    total: (options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: "collectionsMeta.total", description: opts?.description, dataType: opts?.dataType },
      };
    },
    totalPages: (options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: "collectionsMeta.totalPages", description: opts?.description, dataType: opts?.dataType },
      };
    },

    // Aggregate functions - calculated over all items (not just current page)
    avg: (fieldName: string, options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: `collectionsMeta.avg:${fieldName}`, description: opts?.description, dataType: opts?.dataType },
      };
    },
    sum: (fieldName: string, options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: `collectionsMeta.sum:${fieldName}`, description: opts?.description, dataType: opts?.dataType },
      };
    },
    min: (fieldName: string, options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: `collectionsMeta.min:${fieldName}`, description: opts?.description, dataType: opts?.dataType },
      };
    },
    max: (fieldName: string, options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: `collectionsMeta.max:${fieldName}`, description: opts?.description, dataType: opts?.dataType },
      };
    },
    count: (fieldName: string, value: any, options?: string | SchemaOptions): NumberSchema => {
      const opts = typeof options === 'string' ? { description: options } : options;
      return {
        _type: 0 as number,
        _meta: { schemaType: `collectionsMeta.count:${fieldName}:${JSON.stringify(value)}`, description: opts?.description, dataType: opts?.dataType },
      };
    },
  };

  // Database type reference
  /**
   * Reference a database column with type-safety and autocomplete
   * @param dbPath - Database path in format "table.column" or "schema.table.column"
   * @param description - Optional AI instruction for this field
   * @example
   * // Import database types file to enable autocomplete
   * import './types/database'
   * m.db('users.email', 'User email address')
   * m.db('public.users.email', 'User email (with schema)')
   */
  db<T extends string = string>(
    dbPath: T,
    description?: string
  ): StringSchema | NumberSchema | BooleanSchema {
    const parts = dbPath.split(".");

    // Support both formats:
    // - "table.column" (2 parts)
    // - "schema.table.column" (3 parts, Postgres style)
    if (parts.length !== 2 && parts.length !== 3) {
      throw new Error(
        `Invalid db reference format. Expected "table.column" or "schema.table.column", got "${dbPath}"`
      );
    }

    let schema: string | undefined;
    let table: string;
    let column: string;

    if (parts.length === 3) {
      // schema.table.column format
      [schema, table, column] = parts;
    } else {
      // table.column format
      [table, column] = parts;
    }

    // Database types would need to be loaded from user's project, not from SDK
    // For now, we'll just use a generic string type
    // TODO: Implement a way to load database types from user's project at runtime
    let dbType: string | undefined;

    // Map database type to schema type
    const schemaType = mapDbTypeToSchemaType(dbType || "string");

    // Build dbReference object
    const dbReference = schema
      ? { schema, table, column }
      : { table, column };

    // Return appropriate schema based on inferred type
    if (
      schemaType === "number" ||
      schemaType === "commerce.price"
    ) {
      return {
        _type: 0 as number,
        _meta: {
          schemaType: "number",
          description,
          dbReference,
        },
      };
    }

    if (schemaType === "boolean") {
      return {
        _type: false as boolean,
        _meta: {
          schemaType: "boolean",
          description,
          dbReference,
        },
      };
    }

    // Default to string
    return {
      _type: "" as string,
      _meta: {
        schemaType: dbType ? mapDbTypeToSchemaType(dbType) : "string",
        description,
        dbReference,
      },
    };
  }

  // Complex types
  object<T extends Record<string, BaseSchema>>(
    shape: T,
    description?: string
  ): ObjectSchema<{ [K in keyof T]: Infer<T[K]> }> {
    return {
      _type: {} as { [K in keyof T]: Infer<T[K]> },
      _meta: { schemaType: "object", description },
      _shape: shape,
    };
  }

  array<T extends BaseSchema>(
    element: T,
    options?: string | { description?: string; isDataArray?: boolean }
  ): ArraySchema<Infer<T>> {
    const opts = typeof options === 'string' ? { description: options } : options;
    return {
      _type: [] as Infer<T>[],
      _meta: {
        schemaType: "array",
        description: opts?.description,
        isDataArray: opts?.isDataArray
      },
      _element: element,
    };
  }

  // Modifier: Make any schema optional (25% chance of being undefined during generation)
  optional<T extends BaseSchema>(schema: T): T {
    return {
      ...schema,
      _meta: {
        ...schema._meta,
        optional: true,
      },
    } as T;
  }

  // Join: Reference a related collection field
  join(relationPath: string, field?: string): JoinSchema {
    return {
      _type: undefined as any,
      _meta: {
        schemaType: "join",
        join: {
          relationPath,
          field,
        },
      },
    };
  }

  // Pick: Select specific fields from an existing object schema
  pick<T extends Record<string, any>, K extends keyof T>(
    schema: ObjectSchema<T>,
    fields: K[]
  ): ObjectSchema<Pick<T, K>> {
    // Validate that we're picking from an object schema
    if (schema._meta.schemaType !== "object") {
      throw new Error("m.pick() can only be used with object schemas");
    }

    // Build the new shape with only the picked fields
    const pickedShape: Record<string, BaseSchema> = {};
    for (const field of fields) {
      if (!(field in schema._shape)) {
        throw new Error(
          `Field "${String(field)}" does not exist in the source schema`
        );
      }
      pickedShape[field as string] = schema._shape[field];
    }

    return {
      _type: {} as Pick<T, K>,
      _meta: {
        schemaType: "object",
        description: schema._meta.description,
      },
      _shape: pickedShape as { [P in K]: BaseSchema<T[P]> },
    };
  }
}

// Helper function to map database types to schema types
function mapDbTypeToSchemaType(dbType: string): SchemaType {
  const type = dbType.toLowerCase().split("(")[0];

  const typeMap: Record<string, SchemaType> = {
    // String types
    varchar: "string",
    char: "string",
    text: "string",
    uuid: "uuid",

    // Number types
    integer: "number",
    int: "number",
    smallint: "number",
    bigint: "number",
    decimal: "number",
    numeric: "number",
    real: "number",
    "double precision": "number",
    serial: "number",
    bigserial: "number",

    // Boolean
    boolean: "boolean",
    bool: "boolean",

    // Date/Time
    timestamp: "date",
    timestamptz: "date",
    "timestamp with time zone": "date",
    date: "date",
    time: "string",
    timetz: "string",
  };

  return typeMap[type] || "string";
}

export const m = new SchemaBuilder();

/**
 * Converts a schema to type descriptions for AI prompts
 */
export function schemaToTypeDescription(schema: BaseSchema): any {
  if (schema._meta.schemaType === "object") {
    const objSchema = schema as ObjectSchema<any>;
    const result: any = {};
    for (const key in objSchema._shape) {
      result[key] = schemaToTypeDescription(objSchema._shape[key]);
    }
    return result;
  }

  if (schema._meta.schemaType === "array") {
    const arrSchema = schema as ArraySchema<any>;
    return [schemaToTypeDescription(arrSchema._element)];
  }

  // For join fields, return placeholder (will be resolved at query time)
  if (schema._meta.schemaType === "join") {
    return "(joined field - resolved at query time)";
  }

  // For collectionsMeta fields, return the schemaType itself (not a description)
  // This allows edge functions to detect and populate these fields
  if (schema._meta.schemaType.startsWith && schema._meta.schemaType.startsWith("collectionsMeta.")) {
    return schema._meta.schemaType;
  }

  // Return a descriptive string for the AI
  const typeDescriptions: Record<string, string> = {
    uuid: "UUID string",
    string: "string",
    number: "number",
    boolean: "boolean",
    date: "ISO date string",
    email: "email address",
    url: "URL",
    phoneNumber: "phone number",
    "person.fullName": "full name",
    "person.firstName": "first name",
    "person.lastName": "last name",
    "person.jobTitle": "job title",
    "internet.userName": "username",
    "internet.avatar": "avatar URL",
    "internet.jwt": "JWT token",
    "location.street": "street address",
    "location.city": "city",
    "location.state": "state",
    "location.zipCode": "ZIP code",
    "location.country": "country",
    "location.latitude": "latitude coordinate",
    "location.longitude": "longitude coordinate",
    "commerce.productName": "product name",
    "commerce.department": "department/category name",
    "commerce.price": "price (number)",
    "lorem.word": "word",
    "lorem.sentence": "sentence",
    "lorem.paragraph": "paragraph",
  };

  const desc = typeDescriptions[schema._meta.schemaType as string] || schema._meta.schemaType;
  let finalDesc = schema._meta.description ? `${desc} (${schema._meta.description})` : desc;

  // Add optional marker for AI
  if (schema._meta.optional) {
    finalDesc += " [optional]";
  }

  return finalDesc;
}

/**
 * Populate collectionsMeta values in a response based on schema
 * Walks through the schema and replaces collectionsMeta.* fields with actual values
 */
export function populateCollectionsMeta(
  schema: BaseSchema,
  metaValues: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
): any {
  if (schema._meta.schemaType === "object") {
    const objSchema = schema as ObjectSchema<any>;
    const result: any = {};
    for (const key in objSchema._shape) {
      result[key] = populateCollectionsMeta(objSchema._shape[key], metaValues);
    }
    return result;
  }

  if (schema._meta.schemaType === "array") {
    // Arrays don't contain meta values, return empty array
    return [];
  }

  // Check if this is a collectionsMeta field
  if (schema._meta.schemaType.startsWith("collectionsMeta.")) {
    const metaField = schema._meta.schemaType.split(".")[1] as keyof typeof metaValues;
    return metaValues[metaField];
  }

  // For other types, return undefined (they should be overwritten by actual data)
  return undefined;
}
