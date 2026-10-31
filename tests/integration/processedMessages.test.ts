import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';

const messageId = '22222222-2222-4222-8222-222222222222';
const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const noTrace = { currentTraceparent: () => undefined };

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });
afterEach(async () => { await clearTestDB(); });

describe('Processed messages', () => {
  it('GIVEN a message id already recorded WHEN a unit of work records it again THEN it reports a repeat and the transaction can still write', async () => {
    // GIVEN
    const unitOfWork = new PrismaUnitOfWork(prisma, noTrace);
    await unitOfWork.run(({ processedMessages }) => processedMessages.markProcessed(messageId, 'GenerateBudget'));

    // WHEN
    const firstDelivery = await unitOfWork.run(async ({ processedMessages, outbox }) => {
      const isFirst = await processedMessages.markProcessed(messageId, 'GenerateBudget');
      await outbox.add({ destination: 'saga-replies', type: 'BudgetGenerated', serviceOrderId, payload: {} });
      return isFirst;
    });

    // THEN
    expect(firstDelivery).toBe(false);
    expect(await prisma.processedMessage.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });
});
