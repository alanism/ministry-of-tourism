# MOT-79 cache-read cancellation

City and Almanac loaders previously awaited an injected cache read before reaching their cancellation checks. If storage never answered, aborting the request could not settle it. Offline requests could also report an offline miss instead of the caller cancellation.

Both loaders now await cache reads through one private cancellation boundary. It removes its listener on success, rejection or cancellation. After cancellation, no transport starts, no cache write occurs and late values are not parsed or normalized. Caller cancellation takes priority over offline cache selection. Ordinary cache failure still follows the existing fallback path.

This stops the adapter waiting; it does not abort the underlying storage operation, clear storage or change saved source data. The existing FCC view's 20-second controller can now cancel a blocked read. No cache deadline was added, and fetch deadlines/retries remain unchanged (city 20s; Almanac 10s default/30s maximum). Source dates, schemas, normalization and all Spark builder files are unchanged.

Six new RED regressions in `packages/core/src/trip/fcc-cache-cancellation.test.ts` precede the fix. They cover both loaders, online/offline cancellation, late-value suppression and listener cleanup after normal offline misses. The focused source-settlement suite passes 16 tests across 3 files. Full `npm run check`, web build and controlled browser/native-cache regressions are recorded on MOT-79 in the production integration kanban and its evidence README.

The browser proof injects a stalled cache method on a fresh synthetic trip, checks prompt typed cancellation without transport, then restores and reopens the actual dated IndexedDB data. Original source-state and recovery probes run unchanged. No new UI, source currentness claim, paid model, deployment, credentials or PDF work. Existing independent reviews remain pending; this is builder verification.
