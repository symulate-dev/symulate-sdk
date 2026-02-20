import { faker } from "@faker-js/faker";
import type { BaseSchema, ObjectSchema, ArraySchema } from "./schema";
import { getConfig } from "./config";

/**
 * Generates mock data using Faker.js based on the schema
 * This mode works offline and is perfect for CI/CD pipelines
 *
 * @param schema - The schema to generate data for
 * @param count - Number of items to generate
 * @param fkValuePools - Map of field names to available foreign key values for FK integrity
 */
export function generateWithFaker<T>(
  schema: BaseSchema<T>,
  count: number = 1,
  fkValuePools?: Map<string, string[]>
): T {
  const config = getConfig();

  // Set seed for deterministic generation if provided
  if (config.fakerSeed !== undefined) {
    faker.seed(config.fakerSeed);
  }

  // If the schema itself is an array schema and count > 1, generate the array with specified count
  if (schema._meta.schemaType === 'array' && count > 1) {
    const arrSchema = schema as ArraySchema<any>;
    return Array.from({ length: count }, () => generateSingleValue(arrSchema._element, fkValuePools)) as T;
  }

  // If count > 1 but schema is not an array, generate array of objects
  if (count > 1) {
    return Array.from({ length: count }, () => generateSingleValue(schema, fkValuePools)) as T;
  }

  return generateSingleValue(schema, fkValuePools) as T;
}

/**
 * Generates a fake JWT token that looks realistic
 */
function generateFakeJwt(): string {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const payload = {
    sub: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    jti: faker.string.uuid()
  };

  const base64Header = btoa(JSON.stringify(header)).replace(/=/g, '');
  const base64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const fakeSignature = faker.string.alphanumeric(43);

  return `${base64Header}.${base64Payload}.${fakeSignature}`;
}

function generateSingleValue(schema: BaseSchema, fkValuePools?: Map<string, string[]>, fieldName?: string): any {
  // Check if field is optional and randomly make it undefined (25% chance)
  if (schema._meta.optional && Math.random() < 0.25) {
    return undefined;
  }

  const schemaType = schema._meta.schemaType;

  // Handle join schemas (will be resolved at query time, not generated)
  if (schemaType === "join") {
    // Joins are resolved at query time, not during generation
    // Return a placeholder that will be replaced during join resolution
    return null;
  }

  // Handle object schemas
  if (schemaType === "object") {
    const objSchema = schema as ObjectSchema<any>;
    const result: any = {};
    for (const key in objSchema._shape) {
      const value = generateSingleValue(objSchema._shape[key], fkValuePools, key);
      // Only include field if it's not undefined (respects optional fields)
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  // Handle array schemas
  if (schemaType === "array") {
    const arrSchema = schema as ArraySchema<any>;
    // Generate 3-5 items for arrays by default
    const arrayLength = faker.number.int({ min: 3, max: 5 });
    return Array.from({ length: arrayLength }, () => generateSingleValue(arrSchema._element, fkValuePools));
  }

  // Handle primitive types - map to Faker.js methods
  switch (schemaType) {
    case "uuid":
      // Check if this is a foreign key field with available values
      if (fieldName && fkValuePools && fkValuePools.has(fieldName)) {
        const availableIds = fkValuePools.get(fieldName)!;
        if (availableIds.length > 0) {
          // Select random ID from available pool
          const randomIndex = faker.number.int({ min: 0, max: availableIds.length - 1 });
          return availableIds[randomIndex];
        }
      }
      // Generate random UUID if not a FK or no values available
      return faker.string.uuid();

    case "string":
      return faker.lorem.word();

    case "number":
      return faker.number.int({ min: 1, max: 1000 });

    case "boolean":
      return faker.datatype.boolean();

    case "date":
      return faker.date.recent().toISOString();

    case "email":
      return faker.internet.email();

    case "url":
      return faker.internet.url();

    case "phoneNumber":
      return faker.phone.number();

    // Person fields
    case "person.fullName":
      return faker.person.fullName();

    case "person.firstName":
      return faker.person.firstName();

    case "person.lastName":
      return faker.person.lastName();

    case "person.jobTitle":
      return faker.person.jobTitle();

    // Internet fields
    case "internet.userName":
      return faker.internet.userName();

    case "internet.avatar":
      return faker.image.avatar();

    case "internet.jwt":
      return generateFakeJwt();

    // Location fields
    case "location.street":
      return faker.location.streetAddress();

    case "location.city":
      return faker.location.city();

    case "location.state":
      return faker.location.state();

    case "location.zipCode":
      return faker.location.zipCode();

    case "location.country":
      return faker.location.country();

    case "location.latitude":
      return faker.location.latitude().toString();

    case "location.longitude":
      return faker.location.longitude().toString();

    // Commerce fields
    case "commerce.productName":
      return faker.commerce.productName();

    case "commerce.department":
      return faker.commerce.department();

    case "commerce.price":
      return parseFloat(faker.commerce.price());

    // Lorem fields
    case "lorem.word":
      return faker.lorem.word();

    case "lorem.sentence":
      return faker.lorem.sentence();

    case "lorem.paragraph":
      return faker.lorem.paragraph();

    default:
      // Fallback for unknown types
      return faker.lorem.word();
  }
}
