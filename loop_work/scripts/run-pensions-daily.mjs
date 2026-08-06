// One-shot Render Cron entrypoint. Stock prices stay in the continuous market
// worker; pensions run independently so provider/fund refreshes cannot delay a
// one-minute quote cycle.
process.env.LOOP_CRON_ENDPOINT = "/api/cron/pensions-daily";
await import("./run-loop-cron-endpoint.mjs");
