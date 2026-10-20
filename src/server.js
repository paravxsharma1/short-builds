const { app } = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every hour

async function waitForDatabase(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await db.init();
      console.log('Database ready');
      return;
    } catch (err) {
      console.log(`Waiting for database (attempt ${i}/${retries})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('Database never became available');
}

async function start() {
  await waitForDatabase();

  // Scheduled cleanup job for links past their 30-day expiry
  setInterval(async () => {
    try {
      const removed = await db.deleteExpired();
      console.log(JSON.stringify({ job: 'cleanup', removed }));
    } catch (err) {
      console.error('Cleanup failed', err);
    }
  }, CLEANUP_INTERVAL_MS);

  app.listen(PORT, () => console.log(`Short Builds running on port ${PORT}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
