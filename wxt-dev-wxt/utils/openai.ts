import { OpenAI } from 'openai';
import { PDFChunk } from './pdf-extractor';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface VectorItem {
  id: string;
  vector: number[];
  metadata: any;
}

interface ChunkVectorItem extends VectorItem {
  metadata: {
    paperId: string;
    chunkIndex: number;
    pageNumber: number;
    text: string;
  };
}

// Simple in-memory vector store for browser environment
class BrowserVectorStore {
  private items: Map<string, VectorItem> = new Map();
  private chunkItems: Map<string, ChunkVectorItem> = new Map();

  async addItem(id: string, vector: number[], metadata: any) {
    this.items.set(id, { id, vector, metadata });
  }
  
  async addChunkItem(id: string, vector: number[], metadata: any) {
    this.chunkItems.set(id, { id, vector, metadata } as ChunkVectorItem);
  }

  async findSimilar(queryVector: number[], limit: number = 5) {
    const similarities: Array<{ id: string; similarity: number; metadata: any }> = [];
    
    for (const [id, item] of this.items) {
      const similarity = this.cosineSimilarity(queryVector, item.vector);
      similarities.push({ id, similarity, metadata: item.metadata });
    }
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
  
  async findSimilarChunks(queryVector: number[], paperId: string, limit: number = 5) {
    const similarities: Array<{ id: string; similarity: number; metadata: any }> = [];
    
    // Only search chunks from the specific paper
    for (const [id, item] of this.chunkItems) {
      if (item.metadata.paperId === paperId) {
        const similarity = this.cosineSimilarity(queryVector, item.vector);
        similarities.push({ id, similarity, metadata: item.metadata });
      }
    }
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
  }
}

export class ArxivAssistant {
  private openai: OpenAI | null = null;
  private vectorStore: BrowserVectorStore;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
    }
    this.vectorStore = new BrowserVectorStore();
  }

  async initializeVectorStore() {
    // No initialization needed for in-memory store
    return;
  }

  async embedPaper(paperInfo: any) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const text = `Title: ${paperInfo.title}\nAuthors: ${paperInfo.authors.join(', ')}\nAbstract: ${paperInfo.abstract}`;
    
    console.log('[OpenAI] Creating embedding for paper:', paperInfo.arxivId);
    console.log('[OpenAI] Embedding text length:', text.length);
    
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    const embedding = response.data[0].embedding;
    console.log('[OpenAI] Embedding created successfully, dimension:', embedding.length);

    // Store in our browser-compatible vector store
    await this.vectorStore.addItem(
      paperInfo.arxivId,
      embedding,
      {
        arxivId: paperInfo.arxivId,
        title: paperInfo.title,
        text: text
      }
    );

    return embedding;
  }
  
  async embedChunk(chunk: PDFChunk, paperInfo: any) {
    if (!this.openai) throw new Error('OpenAI not initialized');
    
    const chunkText = `Paper: ${paperInfo.title}
Page ${chunk.pageNumber}
Content: ${chunk.text}`;
    
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunkText,
    });
    
    const embedding = response.data[0].embedding;
    
    // Store chunk embedding
    const chunkId = `${paperInfo.arxivId}_chunk_${chunk.chunkIndex}`;
    await this.vectorStore.addChunkItem(
      chunkId,
      embedding,
      {
        paperId: paperInfo.arxivId,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        text: chunk.text
      }
    );
    
    return embedding;
  }
  
  async embedChunks(chunks: PDFChunk[], paperInfo: any) {
    console.log(`[OpenAI] Embedding ${chunks.length} chunks for paper ${paperInfo.arxivId}`);
    const embeddings = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      console.log(`[OpenAI] Processing chunks ${i} to ${i + batch.length}`);
      
      const batchEmbeddings = await Promise.all(
        batch.map(chunk => this.embedChunk(chunk, paperInfo))
      );
      
      embeddings.push(...batchEmbeddings);
      
      // Small delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[OpenAI] All ${chunks.length} chunks embedded successfully`);
    return embeddings;
  }
  
  async retrieveRelevantChunks(query: string, paperId: string, topK: number = 3) {
    if (!this.openai) throw new Error('OpenAI not initialized');
    
    console.log(`[OpenAI] Retrieving relevant chunks for query: "${query}"`);
    
    // Embed the query
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    
    const queryEmbedding = response.data[0].embedding;
    
    // Find similar chunks
    const similarChunks = await this.vectorStore.findSimilarChunks(queryEmbedding, paperId, topK);
    
    console.log(`[OpenAI] Found ${similarChunks.length} relevant chunks`);
    return similarChunks;
  }

  async embedText(text: string) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  }

  async searchSimilarPapers(query: string, k: number = 5) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryEmbedding = response.data[0].embedding;
    const results = await this.vectorStore.findSimilar(queryEmbedding, k);
    
    return results.map(r => ({
      score: r.similarity,
      item: r.metadata
    }));
  }

  async chat(messages: ChatMessage[], paperContext?: string) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const systemMessage: ChatMessage = {
      role: 'system',
      content: paperContext 
        ? `You are an AI assistant helping researchers understand arXiv papers. Here is the paper context:\n\n${paperContext}\n\nAnswer questions about this paper clearly and concisely. Use markdown formatting for better readability.`
        : 'You are an AI assistant helping researchers understand arXiv papers. Use markdown formatting for better readability.'
    };

    const allMessages = [systemMessage, ...messages];

    console.log('[OpenAI] Sending chat request with', allMessages.length, 'messages');
    console.log('[OpenAI] Using model: gpt-4o-mini');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    console.log('[OpenAI] Chat response received:', {
      usage: response.usage,
      finishReason: response.choices[0].finish_reason
    });

    return response.choices[0].message.content;
  }
  
  async chatWithRAG(messages: ChatMessage[], paper: any) {
    if (!this.openai) throw new Error('OpenAI not initialized');
    
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;
    
    // Retrieve relevant chunks
    const relevantChunks = await this.retrieveRelevantChunks(userQuery, paper.arxivId, 3);
    
    // Build context from chunks
    let ragContext = `You are an AI assistant helping researchers understand arXiv papers. 
    
Paper Information:
Title: ${paper.title}
Authors: ${paper.authors?.join(', ') || 'Unknown'}
arXiv ID: ${paper.arxivId}

Abstract: ${paper.abstract}

Relevant sections from the full paper:
`;
    
    relevantChunks.forEach((chunk, idx) => {
      ragContext += `\n[Section ${idx + 1} - Page ${chunk.metadata.pageNumber}]\n${chunk.metadata.text}\n`;
    });
    
    ragContext += '\nUse the above context to answer questions. If information is not in the provided context, say so.';
    
    const systemMessage: ChatMessage = {
      role: 'system',
      content: ragContext
    };
    
    const allMessages = [systemMessage, ...messages];
    
    console.log('[OpenAI] RAG Chat - Retrieved', relevantChunks.length, 'chunks');
    console.log('[OpenAI] Context length:', ragContext.length);
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    return response.choices[0].message.content;
  }

  async summarizePaper(paperInfo: any) {
    const prompt = `Please provide a concise summary of this paper:

Title: ${paperInfo.title}
Authors: ${paperInfo.authors.join(', ')}
Abstract: ${paperInfo.abstract}

Provide a 2-3 paragraph summary that highlights the key contributions and findings.`;

    return this.chat([{ role: 'user', content: prompt }]);
  }

  async extractKeywords(paperInfo: any) {
    const prompt = `Extract 5-8 relevant keywords/tags for this paper:

Title: ${paperInfo.title}
Abstract: ${paperInfo.abstract}

Return only the keywords as a comma-separated list.`;

    const response = await this.chat([{ role: 'user', content: prompt }]);
    return response?.split(',').map(k => k.trim()) || [];
  }
} 