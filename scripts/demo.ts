import 'dotenv/config';
import { createBatch } from '../src/pipeline/createBatch';
import { runBatch } from '../src/pipeline/batchRunner';
import { computeReport } from '../src/api/report';
import { prisma } from '../src/db/client';

async function main() {
  const count = Number(process.argv[2] ?? 300);
  const seed = Number(process.argv[3] ?? 42);

  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(seed)) {
    console.error('Usage: npm run demo -- <count> <seed>');
    console.error('  <count> must be a positive integer, <seed> must be an integer.');
    process.exit(1);
  }

  const [agentBatch, naiveBatch] = await createBatch(count, seed, 'BOTH');
  await runBatch(agentBatch.id);
  await runBatch(naiveBatch.id);

  const agentReport = await computeReport(agentBatch.id);
  const naiveReport = await computeReport(naiveBatch.id);

  const toRupees = (paise: number) => (paise / 100).toFixed(2);

  console.log(`\nBatch of ${count} synthetic failed payments (seed ${seed})`);
  console.log(`Total at risk: Rs ${toRupees(agentReport.atRiskPaise)}`);
  console.log(`Agent strategy recovered: Rs ${toRupees(agentReport.recoveredPaise)} (${(agentReport.recoveryRate * 100).toFixed(1)}%)`);
  console.log(`Naive retry-everything baseline recovered: Rs ${toRupees(naiveReport.recoveredPaise)} (${(naiveReport.recoveryRate * 100).toFixed(1)}%)`);
  console.log(`Agent escalated to human review: ${agentReport.escalatedCount} of ${count} events`);
  console.log('\nAgent recovery rate by failure reason:');
  for (const row of agentReport.byFailureReason) {
    const rate = row.count === 0 ? 0 : (row.recoveredCount / row.count) * 100;
    console.log(`  ${row.key}: ${rate.toFixed(1)}% (${row.recoveredCount}/${row.count})`);
  }

  console.log('\nAgent recovery rate by event type:');
  for (const row of agentReport.byType) {
    const rate = row.count === 0 ? 0 : (row.recoveredCount / row.count) * 100;
    console.log(`  ${row.key}: ${rate.toFixed(1)}% (${row.recoveredCount}/${row.count})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
