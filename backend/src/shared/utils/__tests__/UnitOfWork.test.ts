import { UnitOfWork, TransactionClient } from '../UnitOfWork';

// Minimal PrismaClient stub that runs the transaction callback immediately
function makePrisma() {
  return {
    $transaction: jest.fn(async (cb: (tx: TransactionClient) => Promise<any>) => cb({} as TransactionClient)),
  } as any;
}

describe('UnitOfWork.executeParallel', () => {
  it('returns results when all operations succeed', async () => {
    const uow = new UnitOfWork(makePrisma());
    const ops = [
      async () => 'a',
      async () => 'b',
      async () => 'c',
    ];
    const results = await uow.executeParallel(ops);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('throws AggregateError when one operation fails', async () => {
    const uow = new UnitOfWork(makePrisma());
    const ops = [
      async () => 'ok',
      async () => { throw new Error('op-2 failed'); },
    ];

    await expect(uow.executeParallel(ops)).rejects.toThrow(AggregateError);
  });

  it('includes all individual error messages in the AggregateError', async () => {
    const uow = new UnitOfWork(makePrisma());
    const ops = [
      async () => { throw new Error('first failure'); },
      async () => 'ok',
      async () => { throw new Error('second failure'); },
    ];

    let caught: AggregateError | undefined;
    try {
      await uow.executeParallel(ops);
    } catch (e) {
      caught = e as AggregateError;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const messages = caught!.errors.map((e: Error) => e.message);
    expect(messages).toContain('first failure');
    expect(messages).toContain('second failure');
    expect(caught!.errors).toHaveLength(2);
  });

  it('AggregateError message states how many operations failed', async () => {
    const uow = new UnitOfWork(makePrisma());
    const ops = [
      async () => { throw new Error('e1'); },
      async () => { throw new Error('e2'); },
    ];

    await expect(uow.executeParallel(ops)).rejects.toThrow('2 parallel operation(s) failed');
  });
});
