-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ONE_OFF', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('BANK_SERVER_ERROR', 'INSUFFICIENT_FUNDS', 'OTP_FAILED', 'CARD_EXPIRED', 'INVALID_CARD_DETAILS', 'DAILY_LIMIT_EXCEEDED', 'RISK_DECLINED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'RECOVERED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "BatchStrategy" AS ENUM ('AGENT', 'NAIVE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AttemptAction" AS ENUM ('RETRY', 'SEND_MESSAGE', 'ESCALATE');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "AuditStep" AS ENUM ('DETECTED', 'DIAGNOSED', 'DECIDED', 'ACTED', 'TRACKED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "strategy" "BatchStrategy" NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gatewayErrorCode" TEXT NOT NULL,
    "gatewayErrorMessage" TEXT NOT NULL,
    "failureReason" "FailureReason",
    "groundTruthRecoverable" DOUBLE PRECISION NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetryAttempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "action" "AttemptAction" NOT NULL,
    "messageSent" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,

    CONSTRAINT "RetryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "step" "AuditStep" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetryAttempt" ADD CONSTRAINT "RetryAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
