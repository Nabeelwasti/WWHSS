CREATE TABLE "rate_limit_buckets" (
  "key" TEXT NOT NULL,
  "total_hits" INTEGER NOT NULL,
  "reset_time" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "rate_limit_buckets_total_hits_nonnegative" CHECK ("total_hits" >= 0)
);

CREATE INDEX "rate_limit_buckets_reset_time_idx"
  ON "rate_limit_buckets" ("reset_time");
