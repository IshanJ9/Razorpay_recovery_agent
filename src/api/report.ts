import { PaymentEvent } from '@prisma/client';
import { prisma } from '../db/client';

export interface ReportBreakdownRow {
  key: string;
  atRiskPaise: number;
  recoveredPaise: number;
  count: number;
  recoveredCount: number;
}

export interface BatchReport {
  batchId: string;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
  escalatedCount: number;
  byFailureReason: ReportBreakdownRow[];
  byType: ReportBreakdownRow[];
}

function breakdown(events: PaymentEvent[], keyFn: (e: PaymentEvent) => string): ReportBreakdownRow[] {
  const map = new Map<string, ReportBreakdownRow>();
  for (const e of events) {
    const key = keyFn(e);
    const row = map.get(key) ?? { key, atRiskPaise: 0, recoveredPaise: 0, count: 0, recoveredCount: 0 };
    row.atRiskPaise += e.amountPaise;
    row.count += 1;
    if (e.status === 'RECOVERED') {
      row.recoveredPaise += e.amountPaise;
      row.recoveredCount += 1;
    }
    map.set(key, row);
  }
  return Array.from(map.values());
}

export async function computeReport(batchId: string): Promise<BatchReport> {
  const events = await prisma.paymentEvent.findMany({ where: { batchId } });

  const atRiskPaise = events.reduce((sum, e) => sum + e.amountPaise, 0);
  const recoveredPaise = events.filter((e) => e.status === 'RECOVERED').reduce((sum, e) => sum + e.amountPaise, 0);
  const escalatedCount = events.filter((e) => e.status === 'ESCALATED').length;

  return {
    batchId,
    atRiskPaise,
    recoveredPaise,
    recoveryRate: atRiskPaise === 0 ? 0 : recoveredPaise / atRiskPaise,
    escalatedCount,
    byFailureReason: breakdown(events, (e) => e.failureReason ?? 'UNKNOWN'),
    byType: breakdown(events, (e) => e.type),
  };
}
