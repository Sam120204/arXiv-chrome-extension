import { ArxivAssistant } from '../utils/openai';
import { PDFExtractor } from '../utils/pdf-extractor';

export default defineBackground(() => {
  console.log('Background script loaded!');

  let arxivAssistant: ArxivAssistant | null = null;
  const pdfExtractor = new PDFExtractor();

  // Storage keys for local settings
  const STORAGE_KEYS = {
    PAPERS: 'arxiv_papers',
    TAGS: 'arxiv_tags',
    OPENAI_KEY: 'openai_api_key',
    EMBEDDINGS: 'paper_embeddings',
    CHUNK_EMBEDDINGS: 'chunk_embeddings',
    PDF_TEXTS: 'pdf_texts',
    INITIALIZED: 'extension_initialized'
  };

  // Default tags for common research fields
  const DEFAULT_TAGS = [
    'Machine Learning',
    'Deep Learning',
    'Computer Vision',
    'NLP',
    'Reinforcement Learning',
    'Physics',
    'Mathematics',
    'Statistics',
    'Quantum Computing',
    'Robotics',
    'To Read',
    'Important',
    'Reference',
    'My Research Area'
  ];

  // Initialize extension on first install
  async function initializeExtension() {
    const result = await browser.storage.local.get(STORAGE_KEYS.INITIALIZED);
    if (!result[STORAGE_KEYS.INITIALIZED]) {
      console.log('Initializing extension...');
      
      // Start with empty papers collection - no pre-populated content
      await browser.storage.local.set({
        [STORAGE_KEYS.PAPERS]: {},
        [STORAGE_KEYS.INITIALIZED]: true
      });

      console.log('Extension initialized with empty collection');
    }
  }

  // Run initialization
  initializeExtension();

  // Clear badge when popup is opened
  browser.action.onClicked.addListener(() => {
    browser.action.setBadgeText({ text: '' });
  });

  // Initialize ArxivAssistant when API key is available
  async function initializeAssistant() {
    const result = await browser.storage.local.get(STORAGE_KEYS.OPENAI_KEY);
    const apiKey = result[STORAGE_KEYS.OPENAI_KEY];
    if (apiKey && !arxivAssistant) {
      arxivAssistant = new ArxivAssistant(apiKey);
      await arxivAssistant.initializeVectorStore();
    }
    return arxivAssistant;
  }

  // Handle messages from content script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background: Received message:', message);
    console.log('Background: Message type:', message.type);

    // Handle async operations
    (async () => {
      try {
        let response;
        
        switch (message.type) {
          case 'OPEN_ASSISTANT':
            // Store current paper info locally for quick access
            await browser.storage.local.set({
              currentPaper: message.paperInfo
            });

            // Set badge to indicate paper is loaded
            await browser.action.setBadgeText({ text: '!' });
            await browser.action.setBadgeBackgroundColor({ color: '#1a73e8' });
            
            // Show notification
            browser.notifications.create({
              type: 'basic',
              iconUrl: '/icon/128.png',
              title: 'arXiv Paper Assistant',
              message: 'Paper loaded! Click the extension icon to open the assistant.'
            });
            response = { success: true };
            break;

          case 'SAVE_PAPER':
            console.log('Background: Saving paper:', message.paper);
            await savePaper(message.paper);
            response = { success: true };
            break;

          case 'EXTRACT_PDF':
            console.log('Background: Extracting PDF for paper:', message.paperId);
            try {
              const papers = await getPapers();
              const paper = papers[message.paperId];
              
              console.log('[Background] Retrieved paper:', paper);
              
              if (!paper) {
                response = { error: 'Paper not found' };
                break;
              }
              
              const assistant = await initializeAssistant();
              if (!assistant) {
                response = { error: 'OpenAI not configured' };
                break;
              }
              
              // Check if already extracted
              const chunkResult = await browser.storage.local.get(STORAGE_KEYS.CHUNK_EMBEDDINGS);
              const chunkEmbeddings = chunkResult[STORAGE_KEYS.CHUNK_EMBEDDINGS] || {};
              
              if (chunkEmbeddings[message.paperId]) {
                response = { 
                  success: true, 
                  alreadyExtracted: true,
                  chunkCount: chunkEmbeddings[message.paperId].chunkCount 
                };
                break;
              }
              
              // Extract content (PDF with HTML fallback)
              console.log('[Background] Starting content extraction...');
              const contentResult = await pdfExtractor.extractContent(paper.pdfUrl, paper, { fastMode: true });
              
              // Save full text
              const pdfResult = await browser.storage.local.get(STORAGE_KEYS.PDF_TEXTS);
              const pdfTexts = pdfResult[STORAGE_KEYS.PDF_TEXTS] || {};
              pdfTexts[message.paperId] = contentResult.fullText;
              await browser.storage.local.set({
                [STORAGE_KEYS.PDF_TEXTS]: pdfTexts
              });
              
              // Create and embed chunks
              const chunks = pdfExtractor.createChunks(contentResult.fullText, paper);
              await assistant.embedChunks(chunks, paper);
              
              // Save chunk metadata
              chunkEmbeddings[message.paperId] = {
                chunkCount: chunks.length,
                extractedAt: new Date().toISOString(),
                source: contentResult.source,
                hasFullPDF: contentResult.hasFullPDF
              };
              
              await browser.storage.local.set({
                [STORAGE_KEYS.CHUNK_EMBEDDINGS]: chunkEmbeddings
              });
              
              response = { 
                success: true, 
                chunkCount: chunks.length,
                source: contentResult.source,
                hasFullPDF: contentResult.hasFullPDF
              };
            } catch (error: any) {
              console.error('Background: PDF extraction error:', error);
              response = { error: error.message || 'Failed to extract PDF' };
            }
            break;

          case 'GET_PAPERS':
            console.log('Background: Getting papers');
            const papers = await getPapers();
            console.log('Background: Returning papers:', papers);
            response = papers;
            break;

          case 'ADD_TAG':
            console.log('Background: ADD_TAG case matched');
            const addResult = await addTagToPaper(message.paperId, message.tag);
            console.log('Background: ADD_TAG result:', addResult);
            response = addResult;
            break;

          case 'REMOVE_TAG':
            console.log('Background: REMOVE_TAG case matched');
            const removeResult = await removeTagFromPaper(message.paperId, message.tag);
            console.log('Background: REMOVE_TAG result:', removeResult);
            response = removeResult;
            break;

          case 'GET_OPENAI_KEY':
            const result = await browser.storage.local.get(STORAGE_KEYS.OPENAI_KEY);
            response = result[STORAGE_KEYS.OPENAI_KEY];
            break;

          case 'SET_OPENAI_KEY':
            await browser.storage.local.set({
              [STORAGE_KEYS.OPENAI_KEY]: message.apiKey
            });
            // Reinitialize assistant with new key
            arxivAssistant = null;
            await initializeAssistant();
            
            // Generate embeddings for existing papers
            console.log('[Background] API key set, generating embeddings for existing papers...');
            await generateEmbeddingsForExistingPapers();
            
            response = { success: true };
            break;

          case 'SEARCH_SIMILAR':
            // Search for similar papers using local embeddings
            const assistant = await initializeAssistant();
            if (assistant && message.query) {
              response = await searchSimilarPapers(message.query);
            } else {
              response = [];
            }
            break;

          case 'GET_TAGS_WITH_COUNTS':
            response = await getTagsWithCounts();
            break;
            
          case 'CHAT_WITH_PAPER':
            console.log('Background: CHAT_WITH_PAPER request received');
            console.log('Background: Message:', message);
            const chatAssistant = await initializeAssistant();
            if (!chatAssistant) {
              response = { error: 'OpenAI not configured. Please set your API key.' };
            } else {
              try {
                const { message: userMessage, paper } = message;
                
                console.log('[Background] Chat context - Paper:', paper.arxivId);
                console.log('[Background] User message:', userMessage);
                
                // Check if we have PDF chunks for this paper
                const chunkResult = await browser.storage.local.get(STORAGE_KEYS.CHUNK_EMBEDDINGS);
                const chunkEmbeddings = chunkResult[STORAGE_KEYS.CHUNK_EMBEDDINGS] || {};
                const hasChunks = !!chunkEmbeddings[paper.arxivId];
                
                let chatResponse;
                
                if (hasChunks) {
                  console.log('[Background] Using RAG with PDF chunks');
                  // Use RAG chat with full PDF context
                  chatResponse = await chatAssistant.chatWithRAG([
                    { role: 'user', content: userMessage }
                  ], paper);
                } else {
                  console.log('[Background] Using standard chat (no PDF chunks available)');
                  // Fall back to standard chat with just abstract
                  const systemPrompt = `You are an AI assistant helping researchers understand arXiv papers. 
                  You have access to the following paper:
                  Title: ${paper.title}
                  arXiv ID: ${paper.arxivId}
                  Abstract: ${paper.abstract}
                  
                  Please provide helpful, accurate, and concise responses about this paper. 
                  You can explain concepts, summarize sections, clarify methodology, or answer any questions about the research.`;
                  
                  chatResponse = await chatAssistant.chat([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                  ]);
                }
                
                console.log('[Background] Chat response length:', chatResponse?.length || 0);
                response = { response: chatResponse };
              } catch (error) {
                console.error('[Background] Chat error:', error);
                response = { error: error instanceof Error ? error.message : 'Failed to generate response' };
              }
            }
            break;
            
          default:
            console.warn('Background: Unknown message type:', message.type);
            response = { error: 'Unknown message type' };
        }
        
        console.log('Background: Sending response:', response);
        sendResponse(response);
      } catch (error) {
        console.error('Background script error:', error);
        sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    })();
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  });

  // Helper functions for local storage
  async function savePaper(paper: any) {
    console.log('[Background] Saving paper:', paper.arxivId, paper.title);
    const result = await browser.storage.local.get(STORAGE_KEYS.PAPERS);
    const papers = result[STORAGE_KEYS.PAPERS] || {};
    
    // Merge with existing paper data to preserve tags and other metadata
    const existingPaper = papers[paper.arxivId] || {};
    papers[paper.arxivId] = {
      ...existingPaper,  // Start with existing data
      ...paper,          // Override with new data
      savedAt: existingPaper.savedAt || new Date().toISOString(),
      tags: paper.tags !== undefined ? paper.tags : (existingPaper.tags || [])
    };

    await browser.storage.local.set({
      [STORAGE_KEYS.PAPERS]: papers
    });
    console.log('[Background] Paper saved to storage');

    // Generate and save embedding if OpenAI is configured
    const assistant = await initializeAssistant();
    if (assistant) {
      try {
        console.log('[Background] Generating embedding for paper...');
        const embedding = await assistant.embedPaper(paper);
        await saveEmbedding(paper.arxivId, embedding);
        console.log('[Background] Embedding saved successfully');
        
        // Extract and embed PDF if not already done
        const pdfResult = await browser.storage.local.get(STORAGE_KEYS.PDF_TEXTS);
        const pdfTexts = pdfResult[STORAGE_KEYS.PDF_TEXTS] || {};
        
        console.log('[Background] Checking if PDF already extracted:', paper.arxivId, !!pdfTexts[paper.arxivId]);
        
        if (!pdfTexts[paper.arxivId] && paper.pdfUrl) {
          console.log('[Background] Starting PDF extraction for:', paper.pdfUrl);
          try {
            const contentResult = await pdfExtractor.extractContent(paper.pdfUrl, paper);
            console.log('[Background] Content extracted, length:', contentResult.fullText.length, 'source:', contentResult.source);
            
            // Save full text
            pdfTexts[paper.arxivId] = contentResult.fullText;
            await browser.storage.local.set({
              [STORAGE_KEYS.PDF_TEXTS]: pdfTexts
            });
            
            // Create and embed chunks
            const chunks = pdfExtractor.createChunks(contentResult.fullText, paper);
            await assistant.embedChunks(chunks, paper);
            
            // Save chunk metadata
            const chunkResult = await browser.storage.local.get(STORAGE_KEYS.CHUNK_EMBEDDINGS);
            const chunkEmbeddings = chunkResult[STORAGE_KEYS.CHUNK_EMBEDDINGS] || {};
            chunkEmbeddings[paper.arxivId] = {
              chunkCount: chunks.length,
              extractedAt: new Date().toISOString(),
              source: contentResult.source,
              hasFullPDF: contentResult.hasFullPDF
            };
            await browser.storage.local.set({
              [STORAGE_KEYS.CHUNK_EMBEDDINGS]: chunkEmbeddings
            });
            
            console.log('[Background] Embedded', chunks.length, 'chunks for paper');
          } catch (error) {
            console.error('[Background] PDF extraction failed:', error);
            // Continue without PDF text - we'll use the abstract from HTML
          }
        }
      } catch (error) {
        console.error('[Background] Failed to generate embedding:', error);
      }
    } else {
      console.log('[Background] No assistant available, skipping embeddings');
    }
  }

  async function getPapers() {
    const result = await browser.storage.local.get(STORAGE_KEYS.PAPERS);
    return result[STORAGE_KEYS.PAPERS] || {};
  }

  async function addTagToPaper(paperId: string, tag: string) {
    console.log(`Adding tag "${tag}" to paper ${paperId}`);
    const papers = await getPapers();
    
    if (papers[paperId]) {
      if (!papers[paperId].tags) {
        papers[paperId].tags = [];
      }
      if (!papers[paperId].tags.includes(tag)) {
        papers[paperId].tags.push(tag);
        await browser.storage.local.set({
          [STORAGE_KEYS.PAPERS]: papers
        });
        console.log(`Successfully added tag "${tag}" to paper ${paperId}`);
        return { success: true, message: 'Tag added successfully' };
      } else {
        console.log(`Tag "${tag}" already exists for paper ${paperId}`);
        return { success: false, message: 'Tag already exists' };
      }
    } else {
      console.warn(`Paper ${paperId} not found when adding tag "${tag}"`);
      // Don't add tag to non-existent paper
      return { success: false, message: 'Paper not found' };
    }
  }

  async function removeTagFromPaper(paperId: string, tag: string) {
    console.log(`Removing tag "${tag}" from paper ${paperId}`);
    const papers = await getPapers();
    
    if (papers[paperId] && papers[paperId].tags) {
      const originalLength = papers[paperId].tags.length;
      papers[paperId].tags = papers[paperId].tags.filter((t: string) => t !== tag);
      
      if (papers[paperId].tags.length < originalLength) {
        await browser.storage.local.set({
          [STORAGE_KEYS.PAPERS]: papers
        });
        console.log(`Successfully removed tag "${tag}" from paper ${paperId}`);
        return { success: true, message: 'Tag removed successfully' };
      } else {
        return { success: false, message: 'Tag not found' };
      }
    } else {
      return { success: false, message: 'Paper not found or has no tags' };
    }
  }

  async function saveEmbedding(paperId: string, embedding: number[]) {
    const result = await browser.storage.local.get(STORAGE_KEYS.EMBEDDINGS);
    const embeddings = result[STORAGE_KEYS.EMBEDDINGS] || {};
    embeddings[paperId] = embedding;
    await browser.storage.local.set({
      [STORAGE_KEYS.EMBEDDINGS]: embeddings
    });
  }
  
  async function generateEmbeddingsForExistingPapers() {
    const assistant = await initializeAssistant();
    if (!assistant) {
      console.log('[Background] No assistant available for embedding generation');
      return;
    }
    
    const papers = await getPapers();
    const result = await browser.storage.local.get(STORAGE_KEYS.EMBEDDINGS);
    const existingEmbeddings = result[STORAGE_KEYS.EMBEDDINGS] || {};
    
    const pdfResult = await browser.storage.local.get(STORAGE_KEYS.PDF_TEXTS);
    const pdfTexts = pdfResult[STORAGE_KEYS.PDF_TEXTS] || {};
    
    let embeddingsGenerated = 0;
    let pdfsProcessed = 0;
    
    for (const [paperId, paper] of Object.entries(papers)) {
      if (!existingEmbeddings[paperId]) {
        try {
          console.log(`[Background] Generating embedding for paper: ${paperId}`);
          const embedding = await assistant.embedPaper(paper);
          await saveEmbedding(paperId, embedding);
          embeddingsGenerated++;
        } catch (error) {
          console.error(`[Background] Failed to generate embedding for ${paperId}:`, error);
        }
      }
      
      // Process PDF if not already done
      if (!pdfTexts[paperId] && (paper as any).pdfUrl) {
        try {
          console.log(`[Background] Processing PDF for paper: ${paperId}`);
          const contentResult = await pdfExtractor.extractContent((paper as any).pdfUrl, paper as any);
          
          // Save full text
          pdfTexts[paperId] = contentResult.fullText;
          await browser.storage.local.set({
            [STORAGE_KEYS.PDF_TEXTS]: pdfTexts
          });
          
          // Create chunks
          const chunks = pdfExtractor.createChunks(contentResult.fullText, paper as any);
          await assistant.embedChunks(chunks, paper as any);
          
          // Save chunk metadata
          const chunkResult = await browser.storage.local.get(STORAGE_KEYS.CHUNK_EMBEDDINGS);
          const chunkEmbeddings = chunkResult[STORAGE_KEYS.CHUNK_EMBEDDINGS] || {};
          chunkEmbeddings[paperId] = {
            chunkCount: chunks.length,
            extractedAt: new Date().toISOString(),
            source: contentResult.source,
            hasFullPDF: contentResult.hasFullPDF
          };
          await browser.storage.local.set({
            [STORAGE_KEYS.CHUNK_EMBEDDINGS]: chunkEmbeddings
          });
          
          console.log(`[Background] Processed PDF for ${paperId}: ${chunks.length} chunks`);
        } catch (error) {
          console.error(`[Background] Failed to process PDF for ${paperId}:`, error);
        }
      }
    }
    
    console.log(`[Background] Generated ${embeddingsGenerated} new embeddings, processed ${pdfsProcessed} PDFs`);
  }

  async function searchSimilarPapers(query: string, limit: number = 5) {
    const assistant = await initializeAssistant();
    if (!assistant) return [];

    try {
      // Generate embedding for query
      const queryEmbedding = await assistant.embedText(query);
      
      // Get all embeddings
      const result = await browser.storage.local.get([STORAGE_KEYS.EMBEDDINGS, STORAGE_KEYS.PAPERS]);
      const embeddings = result[STORAGE_KEYS.EMBEDDINGS] || {};
      const papers = result[STORAGE_KEYS.PAPERS] || {};

      // Calculate similarities
      const similarities: Array<{ paperId: string; similarity: number }> = [];
      
      for (const [paperId, embedding] of Object.entries(embeddings)) {
        if (Array.isArray(embedding)) {
          const similarity = cosineSimilarity(queryEmbedding, embedding as number[]);
          similarities.push({ paperId, similarity });
        }
      }

      // Sort by similarity and get top results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limit);

      // Return paper details
      return topResults.map(({ paperId, similarity }) => ({
        ...papers[paperId],
        similarity
      })).filter(paper => paper.arxivId); // Filter out any invalid entries
    } catch (error) {
      console.error('Failed to search similar papers:', error);
      return [];
    }
  }

  async function getTagsWithCounts() {
    const papers = await getPapers();
    const tagCounts: Record<string, number> = {};

    Object.values(papers).forEach((paper: any) => {
      if (paper.tags) {
        paper.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return tagCounts;
  }

  // Cosine similarity calculation
  function cosineSimilarity(a: number[], b: number[]): number {
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
});
