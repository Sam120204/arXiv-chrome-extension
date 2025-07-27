// Import PDF.js v3 - this version works better with Chrome extensions
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { browser } from 'wxt/browser';

// Type definitions for v3
type PDFDocumentProxy = any;
type PDFPageProxy = any;

// Completely disable workers for Chrome extension compatibility
// Setting to empty string for v3 compatibility
if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

export interface PDFChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  startChar: number;
  endChar: number;
}

export interface PaperContent {
  fullText: string;
  source: 'pdf' | 'html' | 'combined';
  hasFullPDF: boolean;
}

export class PDFExtractor {
  private chunkSize: number = 1000; // characters per chunk
  private chunkOverlap: number = 200; // overlap between chunks

  async extractTextFromPDF(pdfUrl: string, options?: { maxPages?: number }): Promise<string> {
    try {
      console.log('[PDFExtractor] Loading PDF from:', pdfUrl);
      console.log('[PDFExtractor] Using pdfjs-dist v3.11.174 without workers');
      
      const maxPages = options?.maxPages || Infinity;
      
      // For Chrome extensions, we need to fetch the PDF first to handle CORS
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log('[PDFExtractor] PDF fetched, size:', arrayBuffer.byteLength);
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        // v3 specific options
        verbosity: 0,
      });
      
      const pdf: PDFDocumentProxy = await loadingTask.promise;
      
      const pagesToExtract = Math.min(pdf.numPages, maxPages);
      console.log(`[PDFExtractor] PDF loaded, extracting ${pagesToExtract}/${pdf.numPages} pages`);
      
      let fullText = '';
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
        try {
          const page: PDFPageProxy = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Concatenate text items with proper spacing
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          
          fullText += `\n[Page ${pageNum}]\n${pageText}`;
          
          // Log progress for long PDFs
          if (pageNum % 10 === 0) {
            console.log(`[PDFExtractor] Processed ${pageNum}/${pagesToExtract} pages`);
          }
        } catch (pageError) {
          console.error(`[PDFExtractor] Error on page ${pageNum}:`, pageError);
          // Continue with other pages even if one fails
        }
      }
      
      if (pagesToExtract < pdf.numPages) {
        fullText += `\n\n[Note: Only first ${pagesToExtract} pages extracted for faster processing. Full PDF has ${pdf.numPages} pages.]`;
      }
      
      console.log('[PDFExtractor] Extraction complete, text length:', fullText.length);
      
      // Clean up
      if (loadingTask.destroy) {
        await loadingTask.destroy();
      }
      
      // Fallback: if no text was extracted, return a message
      if (fullText.trim().length === 0) {
        console.warn('[PDFExtractor] No text extracted, PDF might be image-based');
        throw new Error('PDF extraction failed: The PDF appears to be image-based or empty. Only text-based PDFs are supported.');
      }
      
      return fullText;
    } catch (error) {
      console.error('[PDFExtractor] Error extracting PDF:', error);
      // Re-throw with better error messages
      if (error instanceof Error) {
        console.error('[PDFExtractor] Error name:', error.name);
        console.error('[PDFExtractor] Error message:', error.message);
        
        // Check for specific error types
        if (error.message.includes('fetch')) {
          throw new Error('Failed to download PDF: Check your internet connection');
        } else if (error.message.includes('Invalid PDF')) {
          throw new Error('Invalid PDF file: The file appears to be corrupted or is not a valid PDF');
        } else if (error.message.includes('GlobalWorkerOptions.workerSrc')) {
          throw new Error('PDF library initialization failed. Using HTML content as fallback.');
        }
      }
      throw error;
    }
  }

  async extractFromOpenPDFTab(tabId: number): Promise<string | null> {
    try {
      // Inject a content script to extract text from the PDF viewer
      const results = await browser.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // Check if this is Chrome's PDF viewer
          const embedElement = document.querySelector('embed[type="application/pdf"]');
          if (!embedElement) return null;
          
          // Try to extract text from the PDF viewer's selection API
          const selection = window.getSelection();
          if (selection) {
            // Select all content
            document.execCommand('selectAll');
            const text = selection.toString();
            selection.removeAllRanges();
            return text;
          }
          return null;
        }
      });
      
      return results[0]?.result || null;
    } catch (error) {
      console.error('[PDFExtractor] Failed to extract from PDF tab:', error);
      return null;
    }
  }

  async extractContent(pdfUrl: string, paperMetadata?: any, options?: { fastMode?: boolean }): Promise<PaperContent> {
    // If we have paper metadata with abstract, use it as initial content
    let htmlContent = '';
    if (paperMetadata && paperMetadata.abstract) {
      htmlContent = `Title: ${paperMetadata.title || 'Unknown'}\n`;
      htmlContent += `Authors: ${(paperMetadata.authors || []).join(', ')}\n`;
      htmlContent += `ArXiv ID: ${paperMetadata.arxivId || 'Unknown'}\n\n`;
      htmlContent += `Abstract:\n${paperMetadata.abstract}\n`;
    }
    
    try {
      // In fast mode, only extract first 10 pages
      const extractOptions = options?.fastMode ? { maxPages: 10 } : undefined;
      
      // Try to extract PDF content
      const pdfText = await this.extractTextFromPDF(pdfUrl, extractOptions);
      
      if (pdfText && pdfText.length > htmlContent.length) {
        // We got more content from PDF
        return {
          fullText: pdfText,
          source: options?.fastMode ? 'combined' : 'pdf',
          hasFullPDF: !options?.fastMode
        };
      } else if (htmlContent) {
        // PDF extraction gave less content than HTML, use combined
        return {
          fullText: htmlContent + '\n\n[Note: Full PDF extraction was limited. Using abstract from HTML.]\n\n' + pdfText,
          source: 'combined',
          hasFullPDF: false
        };
      } else {
        // Only PDF content available
        return {
          fullText: pdfText,
          source: options?.fastMode ? 'combined' : 'pdf',
          hasFullPDF: !options?.fastMode
        };
      }
    } catch (error) {
      console.warn('[PDFExtractor] PDF extraction failed, using HTML content:', error);
      
      if (htmlContent) {
        // Fall back to HTML content
        return {
          fullText: htmlContent + '\n\n[Note: PDF extraction failed. Using abstract and metadata from HTML page.]',
          source: 'html',
          hasFullPDF: false
        };
      } else {
        // No content available
        throw new Error('Unable to extract paper content from PDF or HTML');
      }
    }
  }

  createChunks(fullText: string, metadata: any): PDFChunk[] {
    const chunks: PDFChunk[] = [];
    let currentPage = 1;
    let chunkIndex = 0;
    
    // Split by pages first
    const pageRegex = /\[Page (\d+)\]\n/g;
    const pages = fullText.split(pageRegex);
    
    for (let i = 1; i < pages.length; i += 2) {
      const pageNumber = parseInt(pages[i]);
      const pageText = pages[i + 1];
      
      if (!pageText || pageText.trim().length === 0) continue;
      
      // Create overlapping chunks from page text
      let startIdx = 0;
      
      while (startIdx < pageText.length) {
        const endIdx = Math.min(startIdx + this.chunkSize, pageText.length);
        const chunkText = pageText.slice(startIdx, endIdx);
        
        chunks.push({
          pageNumber,
          chunkIndex: chunkIndex++,
          text: chunkText,
          startChar: startIdx,
          endChar: endIdx
        });
        
        // Move forward with overlap
        startIdx += this.chunkSize - this.chunkOverlap;
      }
    }
    
    console.log('[PDFExtractor] Created', chunks.length, 'chunks');
    return chunks;
  }

  // Create a context string from chunks for RAG
  formatChunkForEmbedding(chunk: PDFChunk, metadata: any): string {
    return `Paper: ${metadata.title}
Authors: ${metadata.authors.join(', ')}
Page: ${chunk.pageNumber}
Content: ${chunk.text}`;
  }
} 