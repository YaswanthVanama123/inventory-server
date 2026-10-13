const normalize = (value) => String(value == null ? '' : value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const prepareSearchText = (value) => {
  const norm = normalize(value);
  return { norm, compact: norm.replace(/ /g, ''), words: norm ? norm.split(' ') : [] };
};

const editDistance = (a, b, limit) => {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    before = prev;
    prev = row;
  }
  return prev[b.length];
};

const typoLimit = (length) => (length >= 8 ? 2 : 1);

const sameLetters = (a, b) => a.split('').sort().join('') === b.split('').sort().join('');

const wordDistance = (query, word, limit) => {
  let best = editDistance(query, word, limit);
  if (best === 0 || word.length <= query.length) return best;
  for (let size = Math.max(1, query.length - limit); size <= query.length + limit; size++) {
    for (let start = 0; start + size <= word.length; start++) {
      const distance = editDistance(query, word.slice(start, start + size), limit);
      if (distance < best) {
        best = distance;
        if (best === 0) return 0;
      }
    }
  }
  return best;
};

const closeWord = (query, words) => {
  if (query.length < 3) return words.some(word => word.includes(query)) ? 0 : Infinity;
  const limit = typoLimit(query.length);
  let best = Infinity;
  for (const word of words) {
    if (word.includes(query)) return 0;
    const distance = wordDistance(query, word, limit);
    if (distance > limit) continue;
    if (query.length === 3 && distance === 1 && !sameLetters(query, word.slice(0, 3)) && !sameLetters(query, word)) continue;
    best = Math.min(best, distance);
  }
  return best;
};

const isSubsequence = (needle, haystack) => {
  let index = 0;
  for (let j = 0; j < haystack.length && index < needle.length; j++) {
    if (haystack[j] === needle[index]) index++;
  }
  return index === needle.length;
};

const fuzzyScore = (query, target) => {
  const q = typeof query === 'string' ? prepareSearchText(query) : query;
  const t = typeof target === 'string' ? prepareSearchText(target) : target;
  if (!q.compact || !t.compact) return 0;
  if (t.compact === q.compact) return 100;
  if (t.compact.startsWith(q.compact)) return 95;
  if (t.words.some(word => word.startsWith(q.compact))) return 90;
  if (t.compact.includes(q.compact)) return 80;
  if (q.words.length > 1 && q.words.every(word => t.compact.includes(word))) return 75;
  if (q.compact.length < 3) return 0;
  if (q.words.length > 1) {
    const distances = q.words.map(word => closeWord(word, t.words));
    if (distances.every(d => d !== Infinity)) return 55 - 10 * Math.max(...distances);
  }
  const distance = closeWord(q.compact, t.words);
  if (distance !== Infinity) return 60 - 10 * distance;
  if (q.compact.length >= 4 && isSubsequence(q.compact, t.compact)) return 30;
  return 0;
};

const fuzzyFilter = (items, query, getTexts, limit) => {
  const q = prepareSearchText(query);
  if (!q.compact) return limit ? items.slice(0, limit) : items;
  const scored = [];
  items.forEach((item, index) => {
    const texts = [].concat(getTexts(item));
    let score = 0;
    texts.forEach((text, position) => {
      if (!text) return;
      const value = fuzzyScore(q, text);
      if (value > 0) score = Math.max(score, position === 0 ? value : Math.max(1, value - 15));
    });
    if (score > 0) scored.push({ item, score, length: String(texts[0] || '').length, index });
  });
  scored.sort((a, b) => b.score - a.score || a.length - b.length || a.index - b.index);
  const result = scored.map(entry => entry.item);
  return limit ? result.slice(0, limit) : result;
};

module.exports = { prepareSearchText, fuzzyScore, fuzzyFilter };
