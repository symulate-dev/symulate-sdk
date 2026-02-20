/**
 * m.pick() Schema Tests
 *
 * Tests that m.pick() correctly selects fields from base schemas
 * and properly projects response data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { defineCollection, m, configureSymulate } from '../index';

describe('m.pick() Schema Helper', () => {
  beforeEach(() => {
    configureSymulate({
      environment: 'development',
      generateMode: 'faker',
      collections: {
        persistence: { mode: 'memory' },
      },
    });
  });

  describe('Schema Definition', () => {
    it('should pick specific fields from an object schema', () => {
      const FullSchema = m.object({
        id: m.uuid(),
        name: m.string(),
        email: m.email(),
        password: m.string(),
        age: m.number(),
        createdAt: m.date(),
      });

      const PickedSchema = m.pick(FullSchema, ['id', 'name', 'email']);

      // Verify schema structure
      expect(PickedSchema._meta.schemaType).toBe('object');
      expect(Object.keys(PickedSchema._shape)).toEqual(['id', 'name', 'email']);
      expect(PickedSchema._shape.id).toBeDefined();
      expect(PickedSchema._shape.name).toBeDefined();
      expect(PickedSchema._shape.email).toBeDefined();
      expect(PickedSchema._shape.password).toBeUndefined();
      expect(PickedSchema._shape.age).toBeUndefined();
      expect(PickedSchema._shape.createdAt).toBeUndefined();
    });

    it('should throw error when picking from non-object schema', () => {
      const StringSchema = m.string();

      expect(() => {
        // @ts-expect-error - Testing error handling
        m.pick(StringSchema, ['somefield']);
      }).toThrow('m.pick() can only be used with object schemas');
    });

    it('should throw error when picking non-existent field', () => {
      const Schema = m.object({
        id: m.uuid(),
        name: m.string(),
      });

      expect(() => {
        // @ts-expect-error - Testing error handling
        m.pick(Schema, ['id', 'nonexistent']);
      }).toThrow('Field "nonexistent" does not exist in the source schema');
    });
  });

  describe('Collection with m.pick() for list operation', () => {
    it('should return only picked fields in list operation', async () => {
      const OfferSchema = m.object({
        id: m.uuid(),
        title: m.string(),
        description: m.string(),
        price: m.number(),
        category: m.string(),
        imageUrl: m.url(),
        internalNotes: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const OfferListSchema = m.pick(OfferSchema, ['id', 'title', 'price', 'imageUrl']);

      const offers = defineCollection({
        name: 'offers-list-pick',
        schema: OfferSchema,
        operations: {
          list: {
            responseSchema: OfferListSchema,
          },
          get: true, // Uses full schema
        },
        seedCount: 5,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // List returns only picked fields
      const listResult = await offers.list();
      expect(listResult.data.length).toBeGreaterThan(0);

      const listItem = listResult.data[0];
      expect(listItem).toHaveProperty('id');
      expect(listItem).toHaveProperty('title');
      expect(listItem).toHaveProperty('price');
      expect(listItem).toHaveProperty('imageUrl');
      // These should NOT be in list response
      expect(listItem).not.toHaveProperty('description');
      expect(listItem).not.toHaveProperty('category');
      expect(listItem).not.toHaveProperty('internalNotes');
      expect(listItem).not.toHaveProperty('createdAt');
      expect(listItem).not.toHaveProperty('updatedAt');

      // Get returns all fields (uses full schema)
      const fullItem = await offers.get(listItem.id);
      expect(fullItem).toHaveProperty('id');
      expect(fullItem).toHaveProperty('title');
      expect(fullItem).toHaveProperty('price');
      expect(fullItem).toHaveProperty('imageUrl');
      expect(fullItem).toHaveProperty('description');
      expect(fullItem).toHaveProperty('category');
      expect(fullItem).toHaveProperty('internalNotes');
      expect(fullItem).toHaveProperty('createdAt');
      expect(fullItem).toHaveProperty('updatedAt');
    });
  });

  describe('Collection with m.pick() for get operation', () => {
    it('should return only picked fields in get operation', async () => {
      const UserSchema = m.object({
        id: m.uuid(),
        name: m.person.fullName(),
        email: m.email(),
        password: m.string(),
        role: m.string(),
        lastLogin: m.date(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const PublicUserSchema = m.pick(UserSchema, ['id', 'name', 'role']);

      const users = defineCollection({
        name: 'users-get-pick',
        schema: UserSchema,
        operations: {
          list: true, // Uses full schema
          get: {
            responseSchema: PublicUserSchema, // Public view
          },
        },
        seedCount: 3,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const listResult = await users.list({ limit: 1 });
      const userId = listResult.data[0].id;

      // Get returns only picked fields
      const user = await users.get(userId);
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      // Sensitive fields should NOT be in get response
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('email');
      expect(user).not.toHaveProperty('lastLogin');
      expect(user).not.toHaveProperty('createdAt');
      expect(user).not.toHaveProperty('updatedAt');
    });
  });

  describe('Collection with m.pick() for create/update/replace', () => {
    it('should return only picked fields after create/update/replace', async () => {
      const ProductSchema = m.object({
        id: m.uuid(),
        name: m.string(),
        description: m.string(),
        price: m.number(),
        stock: m.number(),
        sku: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const ProductSummarySchema = m.pick(ProductSchema, ['id', 'name', 'price']);

      const products = defineCollection({
        name: 'products-mutation-pick',
        schema: ProductSchema,
        operations: {
          list: true,
          get: true,
          create: {
            responseSchema: ProductSummarySchema, // Return summary after create
          },
          update: {
            responseSchema: ProductSummarySchema, // Return summary after update
          },
          replace: {
            responseSchema: ProductSummarySchema, // Return summary after replace
          },
        },
        seedCount: 0,
      });

      // Create - returns only picked fields
      const created = await products.create({
        name: 'Test Product',
        description: 'Test description',
        price: 99.99,
        stock: 10,
        sku: 'TEST-001',
      });

      expect(created).toHaveProperty('id');
      expect(created).toHaveProperty('name');
      expect(created).toHaveProperty('price');
      expect(created.name).toBe('Test Product');
      expect(created.price).toBe(99.99);
      // These should NOT be in create response
      expect(created).not.toHaveProperty('description');
      expect(created).not.toHaveProperty('stock');
      expect(created).not.toHaveProperty('sku');
      expect(created).not.toHaveProperty('createdAt');
      expect(created).not.toHaveProperty('updatedAt');

      // Update - returns only picked fields
      const updated = await products.update(created.id, {
        price: 89.99,
      });

      expect(updated).toHaveProperty('id');
      expect(updated).toHaveProperty('name');
      expect(updated).toHaveProperty('price');
      expect(updated.price).toBe(89.99);
      expect(updated).not.toHaveProperty('description');
      expect(updated).not.toHaveProperty('stock');

      // Replace - returns only picked fields
      const replaced = await products.replace(created.id, {
        name: 'Replaced Product',
        description: 'New description',
        price: 79.99,
        stock: 5,
        sku: 'TEST-002',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(replaced).toHaveProperty('id');
      expect(replaced).toHaveProperty('name');
      expect(replaced).toHaveProperty('price');
      expect(replaced.name).toBe('Replaced Product');
      expect(replaced.price).toBe(79.99);
      expect(replaced).not.toHaveProperty('description');
      expect(replaced).not.toHaveProperty('stock');
      expect(replaced).not.toHaveProperty('sku');
    });
  });

  describe('m.pick() with m.join() fields', () => {
    it('should work with both picked base fields and join fields', async () => {
      const UserSchema = m.object({
        id: m.uuid(),
        name: m.person.fullName(),
        email: m.email(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const OrderSchema = m.object({
        id: m.uuid(),
        userId: m.uuid(),
        orderNumber: m.string(),
        total: m.number(),
        status: m.string(),
        items: m.string(), // JSON string
        notes: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      // Pick only some fields and add a join
      const OrderListSchema = m.object({
        id: m.uuid(),
        orderNumber: m.string(),
        total: m.number(),
        status: m.string(),
        userName: m.join('user', 'name'),
      });

      const users = defineCollection({
        name: 'users-pick-join',
        schema: UserSchema,
        seedCount: 3,
      });

      const orders = defineCollection({
        name: 'orders-pick-join',
        schema: OrderSchema,
        operations: {
          list: {
            responseSchema: OrderListSchema,
          },
        },
        relations: {
          user: {
            type: 'belongsTo',
            collection: 'users-pick-join',
            foreignKey: 'userId',
            references: 'id',
          },
        },
        seedCount: 5,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const listResult = await orders.list();
      expect(listResult.data.length).toBeGreaterThan(0);

      const order = listResult.data[0];
      // Should have picked fields
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('orderNumber');
      expect(order).toHaveProperty('total');
      expect(order).toHaveProperty('status');
      // Should have join field
      expect(order).toHaveProperty('userName');
      expect(typeof order.userName).toBe('string');
      // Should NOT have non-picked fields
      expect(order).not.toHaveProperty('userId');
      expect(order).not.toHaveProperty('items');
      expect(order).not.toHaveProperty('notes');
      expect(order).not.toHaveProperty('createdAt');
      expect(order).not.toHaveProperty('updatedAt');
    });
  });
});
