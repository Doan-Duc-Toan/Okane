import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

/**
 * Idempotent dev seed: a demo user, two goals (one JPY, one VND with a
 * deadline), a spread of mixed-currency entries, and 90 days of synthetic
 * RateSnapshot rows so the FX history chart is developable before the cron
 * has had three months to build real history. Never runs in production.
 */
const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@okane.local';
const DEMO_PASSWORD = 'Password123!';
const BASE_RATE = 168.4; // JPY -> VND, verified live 2026-09-10

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the dev seed with NODE_ENV=production');
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      displayName: 'Demo User',
      locale: 'vi',
      theme: 'system',
    },
  });

  const jpyGoal = await upsertGoal(user.id, 'Emergency fund', '1500000.00', 'JPY', null);
  const tenMonthsOut = new Date();
  tenMonthsOut.setMonth(tenMonthsOut.getMonth() + 10);
  const vndGoal = await upsertGoal(
    user.id,
    'Trip home',
    '30000000.00',
    'VND',
    tenMonthsOut,
  );

  await seedEntries(user.id, jpyGoal.id, 'JPY');
  await seedEntries(user.id, vndGoal.id, 'VND');
  await seedRateHistory();

  console.log(`Seed complete for ${DEMO_EMAIL}`);
}

async function upsertGoal(
  userId: string,
  name: string,
  targetAmount: string,
  currency: 'JPY' | 'VND',
  deadline: Date | null,
) {
  const existing = await prisma.goal.findFirst({ where: { userId, name } });
  if (existing) return existing;
  return prisma.goal.create({
    data: { userId, name, targetAmount, currency, deadline },
  });
}

async function seedEntries(userId: string, goalId: string, goalCurrency: 'JPY' | 'VND') {
  const existingCount = await prisma.savingsEntry.count({ where: { goalId } });
  if (existingCount > 0) return;

  const otherCurrency = goalCurrency === 'JPY' ? 'VND' : 'JPY';
  const entries: { amount: string; currency: 'JPY' | 'VND'; daysAgo: number }[] = [];
  for (let i = 0; i < 8; i++) {
    entries.push({ amount: goalCurrency === 'JPY' ? '30000.00' : '5000000.00', currency: goalCurrency, daysAgo: i * 12 });
  }
  for (let i = 0; i < 7; i++) {
    entries.push({ amount: otherCurrency === 'JPY' ? '10000.00' : '1500000.00', currency: otherCurrency, daysAgo: i * 15 + 5 });
  }

  for (const entry of entries) {
    const entryDate = new Date();
    entryDate.setDate(entryDate.getDate() - entry.daysAgo);

    const sameCurrency = entry.currency === goalCurrency;
    const rate = BASE_RATE * (1 + (Math.random() - 0.5) * 0.03);
    const amountNum = Number(entry.amount);
    const amountInGoalCurrency = sameCurrency
      ? entry.amount
      : entry.currency === 'JPY'
        ? (amountNum * rate).toFixed(2)
        : (amountNum / rate).toFixed(2);

    await prisma.savingsEntry.create({
      data: {
        userId,
        goalId,
        amount: entry.amount,
        currency: entry.currency,
        amountInGoalCurrency,
        fxRateUsed: sameCurrency ? null : rate.toFixed(8),
        entryDate,
        note: 'Seed data',
      },
    });
  }
}

async function seedRateHistory() {
  let rate = BASE_RATE;
  for (let i = 90; i >= 0; i--) {
    const capturedOn = new Date();
    capturedOn.setUTCHours(0, 0, 0, 0);
    capturedOn.setUTCDate(capturedOn.getUTCDate() - i);

    rate = rate * (1 + (Math.random() - 0.5) * 0.03);

    await prisma.rateSnapshot.upsert({
      where: { base_quote_capturedOn: { base: 'JPY', quote: 'VND', capturedOn } },
      update: {},
      create: {
        base: 'JPY',
        quote: 'VND',
        rate: rate.toFixed(8),
        capturedOn,
        source: 'seed',
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
