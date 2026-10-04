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

  const result = await Model.bulkWrite(ops, { ordered: false });

  const created = result.upsertedCount || 0;
  const updated = result.matchedCount || 0;
  return { created, updated, failed: 0 };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { bulkUpsert, delay };
