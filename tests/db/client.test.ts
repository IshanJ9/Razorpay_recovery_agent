// tests/db/client.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/db/client';

describe('prisma client', () => {
  it('can create and read a Customer', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Test Customer', contact: 'test@example.com' },
    });
    const found = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(found?.name).toBe('Test Customer');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
