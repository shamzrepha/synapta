export interface TextChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  chunkIndex: number;
  text: string;
  tokens: string[];
}

export interface ScoredChunk {
  chunk: TextChunk;
  score: number;
  citationTag: string;
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can",
  "cannot", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further",
  "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "let's", "me", "more", "most", "my", "myself", "no",
  "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out",
  "over", "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "with", "won't", "would", "you", "your", "yours", "yourself", "yourselves"
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function chunkText(
  sourceId: string,
  sourceTitle: string,
  text: string,
  chunkSize = 500,
  overlap = 80
): TextChunk[] {
  const clean = text.trim();
  if (!clean) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < clean.length) {
    let end = start + chunkSize;

    // Try to break at paragraph or sentence boundary
    if (end < clean.length) {
      const nextNewline = clean.indexOf("\n", end - 100);
      if (nextNewline !== -1 && nextNewline <= end + 100) {
        end = nextNewline + 1;
      } else {
        const nextPeriod = clean.indexOf(". ", end - 80);
        if (nextPeriod !== -1 && nextPeriod <= end + 80) {
          end = nextPeriod + 2;
        }
      }
    } else {
      end = clean.length;
    }

    const chunkContent = clean.slice(start, end).trim();
    if (chunkContent.length > 20) {
      chunks.push({
        id: `${sourceId}_chunk_${chunkIndex}`,
        sourceId,
        sourceTitle,
        chunkIndex,
        text: chunkContent,
        tokens: tokenize(chunkContent),
      });
      chunkIndex++;
    }

    if (end >= clean.length) break;
    start = end - overlap;
  }

  return chunks;
}

export function retrieveRelevantChunks(
  query: string,
  chunks: TextChunk[],
  topK = 5
): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // If query has no filtered tokens, return initial chunks
    return chunks.slice(0, topK).map((c, i) => ({
      chunk: c,
      score: 1.0,
      citationTag: `[S${i + 1}]`,
    }));
  }

  // 1. Calculate Document Frequency (DF) for each term across all chunks
  const df: Record<string, number> = {};
  for (const chunk of chunks) {
    const uniqueTokens = new Set(chunk.tokens);
    for (const t of uniqueTokens) {
      df[t] = (df[t] || 0) + 1;
    }
  }

  const N = chunks.length;

  // 2. Score each chunk using TF-IDF + exact match bonus
  const scored: { chunk: TextChunk; score: number }[] = [];
  const normalizedQuery = query.toLowerCase().trim();

  for (const chunk of chunks) {
    let tfidfScore = 0;
    const chunkTokensCount = chunk.tokens.length || 1;

    // Term frequency map in this chunk
    const tfMap: Record<string, number> = {};
    for (const t of chunk.tokens) {
      tfMap[t] = (tfMap[t] || 0) + 1;
    }

    for (const qTerm of queryTokens) {
      const tf = (tfMap[qTerm] || 0) / chunkTokensCount;
      const docFreq = df[qTerm] || 1;
      const idf = Math.log(1 + N / docFreq);
      tfidfScore += tf * idf;
    }

    // Exact phrase bonus if the chunk contains the raw query string or partial phrase
    if (chunk.text.toLowerCase().includes(normalizedQuery)) {
      tfidfScore += 2.5;
    }

    scored.push({ chunk, score: tfidfScore });
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Take top K and assign citation tags [S1], [S2] ...
  return scored.slice(0, topK).map((item, index) => ({
    chunk: item.chunk,
    score: item.score,
    citationTag: `[S${index + 1}]`,
  }));
}
