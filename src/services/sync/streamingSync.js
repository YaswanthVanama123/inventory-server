/**
 * Streaming sync helpers
 * -------------------------------------------------------------------------
 * Small, dependency-light utilities shared by the streaming scrapers.
 *
 * The scrapers follow a constant-memory pattern:
 *
 *     for each page:
 *         scrape the page's rows
 *         bulkUpsert(rows)        // one round-trip, idempotent, no duplicates
 *         fetch details for the few rows that still need them
 *         clear the page array
 *         checkpoint progress
 *
 * Memory stays nearly flat regardless of whether the source has 100 or
 * 100,000 records, because only a single page is ever held at once.
 */

/**
 * Upsert a page of documents in a single round-trip.
 *
 * Uses `updateOne` with `upsert: true` keyed on the model's natural dedup
 * key(s), so re-running a page never creates duplicates and is safe to
 * retry. `$set` carries the scraped fields; `$setOnInsert` carries schema
 * defaults that the native driver would otherwise skip on insert (Mongoose
 * does not apply schema defaults inside bulkWrite).
 *
 * @param {import('mongoose').Model} Model
 * @param {object[]} docs            Page of plain objects to upsert.
 * @param {string[]} keyFields       Fields that make up the unique key.
 * @param {object} [setOnInsert={}]  Defaults applied only when inserting.
 *                                   Must NOT overlap with fields in `docs`.
 * @returns {Promise<{created:number, updated:number, failed:number}>}
 */
async function bulkUpsert(Model, docs, keyFields, setOnInsert = {}) {
  if (!docs || docs.length === 0) {
    return { created: 0, updated: 0, failed: 0 };
  }

  const ops = docs.map((doc) => {
    const filter = {};
    for (const k of keyFields) filter[k] = doc[k];
    const update = { $set: doc };
    if (setOnInsert && Object.keys(setOnInsert).length > 0) {
      update.$setOnInsert = setOnInsert;
    }
    return { updateOne: { filter, update, upsert: true } };
  });

  // `ordered: false` keeps going past a single bad row instead of aborting
  // the whole page, mirroring `insertMany({ ordered: false })`.
  const result = await Model.bulkWrite(ops, { ordered: false });

  const created = result.upsertedCount || 0;
  // Everything that matched an existing doc counts as an update, matching
  // the previous findOneAndUpdate-based semantics (an existing record is
  // "updated" even if no field actually changed).
  const updated = result.matchedCount || 0;
  return { created, updated, failed: 0 };
}

/**
 * Sleep helper used to throttle detail fetches against the source portal.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { bulkUpsert, delay };
