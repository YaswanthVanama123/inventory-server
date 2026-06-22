const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const ModelCategory = require('../models/ModelCategory');
const ManualPurchaseOrderItem = require('../models/ManualPurchaseOrderItem');
const Inventory = require('../models/Inventory');

// ─────────────────────────────────────────────────────────────────────────
// Strong stock search: partial (substring/prefix) + fuzzy (typo-tolerant)
// matching across category names, aliases (Enviromaster / order item names),
// SKUs, manual-PO item names and inventory item names. Every hit is resolved
// back to its canonical category name (what the stock summary is keyed by).
// ─────────────────────────────────────────────────────────────────────────

const INDEX_TTL_MS = 60 * 1000;
let indexCache = {data: null, builtAt: 0};

// Classic Levenshtein edit distance.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

// Score a single indexed term against the query. Returns {score, matchType}.
// exact > prefix > substring > word-prefix > fuzzy. 0 means "no match".
function scoreTerm(q, termRaw) {
  const t = (termRaw || '').toLowerCase().trim();
  if (!t) return {score: 0, matchType: null};
  if (t === q) return {score: 1, matchType: 'exact'};
  if (t.startsWith(q)) return {score: 0.9, matchType: 'prefix'};
  if (t.includes(q)) return {score: 0.78, matchType: 'partial'};

  const words = t.split(/[\s\-_/.,]+/).filter(Boolean);
  if (words.some(w => w.startsWith(q))) return {score: 0.82, matchType: 'prefix'};
  if (words.some(w => w.includes(q))) return {score: 0.72, matchType: 'partial'};

  // Fuzzy: best similarity of the query against the whole string or any word.
  let bestSim = 0;
  for (const candidate of [t, ...words]) {
    const maxLen = Math.max(q.length, candidate.length);
    if (!maxLen) continue;
    const sim = 1 - levenshtein(q, candidate) / maxLen;
    if (sim > bestSim) bestSim = sim;
  }
  if (bestSim >= 0.6) return {score: bestSim * 0.7, matchType: 'fuzzy'};
  return {score: 0, matchType: null};
}

// Build (and cache) the flat term index: [{term, category, source}].
async function buildIndex() {
  const now = Date.now();
  if (indexCache.data && now - indexCache.builtAt < INDEX_TTL_MS) {
    return indexCache.data;
  }

  const [aliases, modelCats, poItems, inventory] = await Promise.all([
    RouteStarItemAlias.find({isActive: true})
      .select('canonicalName aliases')
      .lean(),
    ModelCategory.find({}).select('modelNumber categoryItemName notes').lean(),
    ManualPurchaseOrderItem.find({})
      .select('sku name description mappedCategoryItemName')
      .lean(),
    Inventory.find({isActive: true, isDeleted: {$ne: true}})
      .select('itemName skuCode category')
      .lean(),
  ]);

  // Resolve any name to its canonical category via the alias map.
  const lookup = new Map();
  for (const a of aliases) {
    if (a.canonicalName) lookup.set(a.canonicalName.toLowerCase(), a.canonicalName);
    for (const al of a.aliases || []) {
      if (al?.name) lookup.set(al.name.toLowerCase(), a.canonicalName);
    }
  }
  const resolve = name => (name && lookup.get(name.toLowerCase())) || name || '';

  const terms = [];
  const push = (term, category, source) => {
    if (term && category) terms.push({term, category, source});
  };

  for (const a of aliases) {
    push(a.canonicalName, a.canonicalName, 'category');
    for (const al of a.aliases || []) push(al?.name, a.canonicalName, 'alias');
  }
  for (const m of modelCats) {
    const cat = resolve(m.categoryItemName);
    push(m.categoryItemName, cat, 'category');
    push(m.modelNumber, cat, 'sku');
    push(m.notes, cat, 'note');
  }
  for (const p of poItems) {
    const cat = resolve(p.mappedCategoryItemName || p.name);
    push(p.name, cat, 'orderItem');
    push(p.sku, cat, 'sku');
    push(p.mappedCategoryItemName, cat, 'category');
  }
  for (const inv of inventory) {
    const cat = resolve(inv.category || inv.itemName);
    push(inv.itemName, cat, 'item');
    push(inv.skuCode, cat, 'sku');
  }

  indexCache = {data: terms, builtAt: now};
  return terms;
}

const MIN_SCORE = 0.4;

async function searchStock(rawQuery, limit = 50) {
  const q = (rawQuery || '').toLowerCase().trim();
  if (!q) return {query: rawQuery, total: 0, matches: []};

  const terms = await buildIndex();

  // Best hit per canonical category.
  const byCategory = new Map();
  for (const {term, category, source} of terms) {
    const {score, matchType} = scoreTerm(q, term);
    if (score < MIN_SCORE) continue;
    const existing = byCategory.get(category);
    if (!existing || score > existing.score) {
      byCategory.set(category, {
        categoryName: category,
        score: Number(score.toFixed(3)),
        matchType,
        matchedOn: term,
        source,
      });
    }
  }

  const matches = Array.from(byCategory.values())
    .sort((a, b) => b.score - a.score || a.categoryName.localeCompare(b.categoryName))
    .slice(0, limit);

  return {query: rawQuery, total: matches.length, matches};
}

module.exports = {searchStock, _scoreTerm: scoreTerm};
