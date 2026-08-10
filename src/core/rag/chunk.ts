export interface TextChunk {
  index: number;
  content: string;
  tokenEstimate: number;
  page: number | null;
}

/**
 * Paragraph-aware chunking with overlap. Every character of the source is
 * indexed — text is never truncated to make an embedding request fit.
 */
export function chunkText(text: string, opts: { maxChars?: number; overlap?: number } = {}): TextChunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlap ?? 150;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      push();
      for (let i = 0; i < paragraph.length; i += maxChars - overlap) {
        chunks.push(paragraph.slice(i, i + maxChars));
      }
      continue;
    }
    if ((current + "\n\n" + paragraph).length > maxChars) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();

  return chunks.map((content, index) => ({
    index,
    content,
    tokenEstimate: Math.ceil(content.length / 4),
    page: null,
  }));
}
