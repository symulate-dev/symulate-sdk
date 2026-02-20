/**
 * Collection Type Safety Tests
 *
 * These tests verify that TypeScript types correctly enforce:
 * 1. Input types (create/update/replace) use base schema WITHOUT join fields
 * 2. Output types (all operations) use response schema WITH join fields
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { defineCollection, m, configureSymulate } from '../index';

describe('Collection Type Safety', () => {
  beforeEach(() => {
    configureSymulate({
      environment: 'development',
      generateMode: 'faker',
      collections: {
        persistence: { mode: 'memory' },
      },
    });
  });

  describe('Without Response Schema', () => {
    it('should use same type for inputs and outputs when no responseSchema', async () => {
      const UserSchema = m.object({
        id: m.uuid(),
        name: m.person.fullName(),
        email: m.email(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const users = defineCollection({
        name: 'users-simple',
        schema: UserSchema,
        seedCount: 5,
      });

      // Create - input should not require id/timestamps
      const created = await users.create({
        name: 'John Doe',
        email: 'john@example.com',
      });

      // Output should have all fields including id and timestamps
      expect(created).toHaveProperty('id');
      expect(created).toHaveProperty('name');
      expect(created).toHaveProperty('email');
      expect(created).toHaveProperty('createdAt');
      expect(created).toHaveProperty('updatedAt');
      expect(created.name).toBe('John Doe');
      expect(created.email).toBe('john@example.com');

      // Update - input should be partial
      const updated = await users.update(created.id, {
        name: 'Jane Doe',
      });

      expect(updated.name).toBe('Jane Doe');
      expect(updated.email).toBe('john@example.com'); // Email unchanged

      // Replace - input should not require id
      const replaced = await users.replace(created.id, {
        name: 'Bob Smith',
        email: 'bob@example.com',
        createdAt: created.createdAt,
        updatedAt: new Date().toISOString(),
      });

      expect(replaced.name).toBe('Bob Smith');
      expect(replaced.email).toBe('bob@example.com');
    });
  });

  describe('With Response Schema (Join Fields)', () => {
    it('should exclude join fields from input types and include them in output types', async () => {
      // Base schemas
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
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      // Response schema with joins
      const OrderResponseSchema = m.object({
        id: m.uuid(),
        userId: m.uuid(),
        orderNumber: m.string(),
        total: m.number(),
        createdAt: m.date(),
        updatedAt: m.date(),
        userName: m.join('user', 'name'),
        userEmail: m.join('user', 'email'),
      });

      const users = defineCollection({
        name: 'users-with-joins',
        schema: UserSchema,
        seedCount: 5,
      });

      const orders = defineCollection({
        name: 'orders-with-joins',
        schema: OrderSchema,
        responseSchema: OrderResponseSchema,
        relations: {
          user: {
            type: 'belongsTo',
            collection: 'users-with-joins',
            foreignKey: 'userId',
            references: 'id',
          },
        },
        seedCount: 10,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get a user to reference
      const usersList = await users.list({ limit: 1 });
      const user = usersList.data[0];

      // CREATE: Input should NOT have join fields
      const created = await orders.create({
        userId: user.id,
        orderNumber: 'ORD-001',
        total: 100.50,
        // userName: 'Invalid', // This would cause TypeScript error
        // userEmail: 'invalid@example.com', // This would cause TypeScript error
      });

      // Output SHOULD have join fields
      expect(created).toHaveProperty('id');
      expect(created).toHaveProperty('userId');
      expect(created).toHaveProperty('orderNumber');
      expect(created).toHaveProperty('total');
      expect(created).toHaveProperty('userName');
      expect(created).toHaveProperty('userEmail');

      // Verify join fields are populated
      expect(created.userName).toBe(user.name);
      expect(created.userEmail).toBe(user.email);
      expect(created.orderNumber).toBe('ORD-001');
      expect(created.total).toBe(100.50);

      // UPDATE: Input should NOT have join fields
      const updated = await orders.update(created.id, {
        total: 150.75,
        // userName: 'Invalid', // This would cause TypeScript error
      });

      // Output SHOULD have join fields
      expect(updated).toHaveProperty('userName');
      expect(updated).toHaveProperty('userEmail');
      expect(updated.userName).toBe(user.name);
      expect(updated.userEmail).toBe(user.email);
      expect(updated.total).toBe(150.75);

      // REPLACE: Input should NOT have join fields
      const replaced = await orders.replace(created.id, {
        userId: user.id,
        orderNumber: 'ORD-002',
        total: 200.00,
        createdAt: created.createdAt,
        updatedAt: new Date().toISOString(),
        // userName: 'Invalid', // This would cause TypeScript error
        // userEmail: 'invalid@example.com', // This would cause TypeScript error
      });

      // Output SHOULD have join fields
      expect(replaced).toHaveProperty('userName');
      expect(replaced).toHaveProperty('userEmail');
      expect(replaced.userName).toBe(user.name);
      expect(replaced.userEmail).toBe(user.email);
      expect(replaced.orderNumber).toBe('ORD-002');
      expect(replaced.total).toBe(200.00);

      // GET: Output should have join fields
      const fetched = await orders.get(created.id);
      expect(fetched).toHaveProperty('userName');
      expect(fetched).toHaveProperty('userEmail');
      expect(fetched.userName).toBe(user.name);
      expect(fetched.userEmail).toBe(user.email);

      // LIST: Output should have join fields
      const list = await orders.list({ limit: 5 });
      expect(list.data.length).toBeGreaterThan(0);
      list.data.forEach(order => {
        expect(order).toHaveProperty('userName');
        expect(order).toHaveProperty('userEmail');
        expect(typeof order.userName).toBe('string');
        expect(typeof order.userEmail).toBe('string');
      });
    });
  });

  describe('Type Inference', () => {
    it('should properly infer types from schema definitions', async () => {
      const ProductSchema = m.object({
        id: m.uuid(),
        name: m.string(),
        price: m.number(),
        category: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const CategorySchema = m.object({
        id: m.uuid(),
        name: m.string(),
      });

      const ProductResponseSchema = m.object({
        id: m.uuid(),
        name: m.string(),
        price: m.number(),
        category: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
        categoryName: m.join('categoryRelation', 'name'),
      });

      const categories = defineCollection({
        name: 'categories-type-test',
        schema: CategorySchema,
        seedCount: 3,
      });

      const products = defineCollection({
        name: 'products-type-test',
        schema: ProductSchema,
        responseSchema: ProductResponseSchema,
        relations: {
          categoryRelation: {
            type: 'belongsTo',
            collection: 'categories-type-test',
            foreignKey: 'category',
            references: 'id',
          },
        },
        seedCount: 5,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const categoryList = await categories.list({ limit: 1 });
      const category = categoryList.data[0];

      // Test that create accepts base schema fields
      const product = await products.create({
        name: 'Test Product',
        price: 29.99,
        category: category.id,
      });

      // Test that response includes join fields
      expect(product.categoryName).toBe(category.name);

      // Test type structure
      expect(typeof product.id).toBe('string');
      expect(typeof product.name).toBe('string');
      expect(typeof product.price).toBe('number');
      expect(typeof product.category).toBe('string');
      expect(typeof product.categoryName).toBe('string'); // Join field
      expect(typeof product.createdAt).toBe('string');
      expect(typeof product.updatedAt).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle collections with multiple join fields', async () => {
      const AuthorSchema = m.object({
        id: m.uuid(),
        name: m.person.fullName(),
        bio: m.string(),
      });

      const EditorSchema = m.object({
        id: m.uuid(),
        name: m.person.fullName(),
        department: m.string(),
      });

      const ArticleSchema = m.object({
        id: m.uuid(),
        title: m.string(),
        authorId: m.uuid(),
        editorId: m.uuid(),
        content: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
      });

      const ArticleResponseSchema = m.object({
        id: m.uuid(),
        title: m.string(),
        authorId: m.uuid(),
        editorId: m.uuid(),
        content: m.string(),
        createdAt: m.date(),
        updatedAt: m.date(),
        authorName: m.join('author', 'name'),
        authorBio: m.join('author', 'bio'),
        editorName: m.join('editor', 'name'),
        editorDepartment: m.join('editor', 'department'),
      });

      const authors = defineCollection({
        name: 'authors-edge-test',
        schema: AuthorSchema,
        seedCount: 3,
      });

      const editors = defineCollection({
        name: 'editors-edge-test',
        schema: EditorSchema,
        seedCount: 3,
      });

      const articles = defineCollection({
        name: 'articles-edge-test',
        schema: ArticleSchema,
        responseSchema: ArticleResponseSchema,
        relations: {
          author: {
            type: 'belongsTo',
            collection: 'authors-edge-test',
            foreignKey: 'authorId',
            references: 'id',
          },
          editor: {
            type: 'belongsTo',
            collection: 'editors-edge-test',
            foreignKey: 'editorId',
            references: 'id',
          },
        },
        seedCount: 5,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const authorsList = await authors.list({ limit: 1 });
      const author = authorsList.data[0];
      const editorsList = await editors.list({ limit: 1 });
      const editor = editorsList.data[0];

      // Create with only base schema fields
      const article = await articles.create({
        title: 'Test Article',
        authorId: author.id,
        editorId: editor.id,
        content: 'Article content',
      });

      // Verify all join fields are present in output
      expect(article.authorName).toBe(author.name);
      expect(article.authorBio).toBe(author.bio);
      expect(article.editorName).toBe(editor.name);
      expect(article.editorDepartment).toBe(editor.department);

      // Update with only base schema fields
      const updated = await articles.update(article.id, {
        title: 'Updated Title',
      });

      // Verify join fields still present after update
      expect(updated.authorName).toBe(author.name);
      expect(updated.editorName).toBe(editor.name);
      expect(updated.title).toBe('Updated Title');
    });

    it('should handle empty collections gracefully', async () => {
      const EmptySchema = m.object({
        id: m.uuid(),
        value: m.string(),
      });

      const empty = defineCollection({
        name: 'empty-collection',
        schema: EmptySchema,
        seedCount: 0,
      });

      const list = await empty.list();
      expect(list.data).toEqual([]);
      expect(list.pagination.total).toBe(0);
    });
  });
});
