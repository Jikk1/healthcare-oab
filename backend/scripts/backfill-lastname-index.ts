/**
 * Одноразовый бэкфилл blind-индекса фамилии для строк, созданных до миграции
 * 3_patient_lastname_index. Требует PHI-ключ (расшифровывает lastNameEnc,
 * считает HMAC-индекс). Идемпотентен: обрабатывает только lastNameIndex IS NULL.
 *
 * Запуск (из backend/, .env подхватывается):
 *   node --env-file=.env --import tsx scripts/backfill-lastname-index.ts
 */
import { PrismaClient } from '@prisma/client';
import { decryptField, blindIndex } from '../src/shared/crypto.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.patient.findMany({
    where: { lastNameIndex: null },
    select: { id: true, lastNameEnc: true },
  });
  let done = 0;
  for (const row of rows) {
    const lastName = decryptField(row.lastNameEnc);
    await prisma.patient.update({
      where: { id: row.id },
      data: { lastNameIndex: blindIndex(lastName) },
    });
    done += 1;
  }
  // eslint-disable-next-line no-console
  console.log(`Backfilled lastNameIndex for ${done} of ${rows.length} patients.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
