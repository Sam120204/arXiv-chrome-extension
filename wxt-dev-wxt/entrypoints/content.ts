import '../assets/content.css';

export default defineContentScript({
  matches: ['*://arxiv.org/*'],
  main() {
    console.log('arXiv Paper Assistant loaded!');
    
    const isAbstractPage = window.location.pathname.includes('/abs/');
    const isPdfPage = window.location.pathname.includes('/pdf/');
    
    if (!isAbstractPage && !isPdfPage) {
      console.log('Not on abstract or PDF page');
      return;
    }

    // Function to extract paper information (for abstract pages)
    function extractPaperInfo() {
      const paperInfo = {
        title: '',
        authors: [] as string[],
        abstract: '',
        arxivId: '',
        pdfUrl: ''
      };

      // Extract arXiv ID from URL - supports both old (YYMM.NNNNN) and new formats
      const urlMatch = window.location.pathname.match(/\/(abs|pdf)\/([^\/]+?)(?:v\d+)?$/);
      if (urlMatch) {
        paperInfo.arxivId = urlMatch[2];
        paperInfo.pdfUrl = `https://arxiv.org/pdf/${paperInfo.arxivId}.pdf`;
      }

      if (isAbstractPage) {
        // Extract title
        const titleElement = document.querySelector('h1.title');
        if (titleElement) {
          paperInfo.title = titleElement.textContent?.replace('Title:', '').trim() || '';
        }

        // Extract authors
        const authorsElement = document.querySelector('.authors');
        if (authorsElement) {
          const authorLinks = authorsElement.querySelectorAll('a');
          paperInfo.authors = Array.from(authorLinks).map(a => a.textContent?.trim() || '');
        }

        // Extract abstract
        const abstractElement = document.querySelector('.abstract');
        if (abstractElement) {
          paperInfo.abstract = abstractElement.textContent?.replace('Abstract:', '').trim() || '';
        }
      }

      return paperInfo;
    }

    // Get BibTeX citation directly from the page
    async function getBibTeXCitation(): Promise<string | null> {
      // First, click the export button to trigger loading
      const bibButton = document.getElementById('bib-cite-trigger');
      if (!bibButton) {
        // Try alternative methods to find the button
        const buttons = document.querySelectorAll('.bib-cite-button, .abs-button, span');
        let found = false;
        for (const button of buttons) {
          if (button.textContent?.toLowerCase().includes('export bibtex')) {
            (button as HTMLElement).click();
            found = true;
            break;
          }
        }
        if (!found) return null;
      } else {
        bibButton.click();
      }
      
      // Wait for the citation to load in the textarea
      const maxAttempts = 20; // 2 seconds max wait
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
        
        const citationTextarea = document.getElementById('bib-cite-target') as HTMLTextAreaElement;
        if (citationTextarea && citationTextarea.value && citationTextarea.value !== 'loading...') {
          // Citation loaded successfully
          return citationTextarea.value;
        }
      }
      
      return null;
    }

    // Create abstract page widget (paper info, tags, export)
    function createAbstractWidget() {
      const widget = document.createElement('div');
      widget.id = 'arxiv-abstract-widget';
      widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        background: white;
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: all 0.3s ease;
        box-sizing: border-box;
        overflow: hidden;
      `;

      const paperInfo = extractPaperInfo();
      
      // Ensure we have at least a title for the paper
      if (!paperInfo.title && paperInfo.arxivId) {
        paperInfo.title = `arXiv Paper ${paperInfo.arxivId}`;
      }
      
      widget.innerHTML = `
        <div class="widget-header" style="
          padding: 14px 16px;
          background: #4f46e5;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <h3 style="margin: 0; font-size: 16px; font-weight: 500;">arXiv Paper Assistant</h3>
          <button id="minimize-widget" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            font-size: 18px;
            font-weight: 500;
          ">−</button>
        </div>
        
        <div class="widget-tabs" style="
          display: flex;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        ">
          <button class="tab-button active" data-tab="paper" style="
            flex: 1;
            padding: 10px;
            background: white;
            border: none;
            border-bottom: 2px solid #4f46e5;
            color: #4f46e5;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">
            📄 Current Paper
          </button>
          <button class="tab-button" data-tab="collections" style="
            flex: 1;
            padding: 10px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: #6b7280;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">
            📚 Collections
          </button>
        </div>
        
        <div class="tab-content" id="paper-tab" style="padding: 16px; overflow: visible; box-sizing: border-box;">
          <div class="paper-info" style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 10px 0; font-size: 15px; color: #111827; line-height: 1.4; font-weight: 600; word-wrap: break-word;">
              ${paperInfo.title || 'Loading paper information...'}
            </h4>
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #6b7280; line-height: 1.4; word-wrap: break-word;">
              <strong style="color: #374151;">Authors:</strong> ${paperInfo.authors.join(', ') || 'Loading...'}
            </p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              <strong style="color: #374151;">arXiv ID:</strong> ${paperInfo.arxivId}
            </p>
          </div>
          
          <div class="tags-section" style="margin-bottom: 16px;">
            <h5 style="margin: 0 0 8px 0; font-size: 13px; color: #374151; font-weight: 600;">Tags</h5>
            <div id="tags-container" style="
              display: flex; 
              gap: 6px; 
              flex-wrap: wrap; 
              margin-bottom: 12px; 
              min-height: 28px; 
              max-height: 84px; 
              overflow-y: auto; 
              padding: 2px;
              width: 100%;
              box-sizing: border-box;
            "></div>
            <div style="position: relative; width: 100%;">
              <input id="tag-input" type="text" placeholder="Click for suggestions or type custom tag..." style="
                width: 100%;
                box-sizing: border-box;
                padding: 8px 10px;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                font-size: 13px;
                transition: all 0.2s;
                outline: none;
              ">
            </div>
            <div id="tag-suggestions" style="
              position: fixed;
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              box-shadow: 0 -4px 16px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
              max-height: 200px;
              overflow-y: auto;
              display: none;
              z-index: 999999;
              padding: 4px 0;
              min-width: 200px;
            "></div>
          </div>
          
          <div class="actions" style="display: flex; gap: 8px; position: relative;">
            <button id="export-bibtex" style="
              flex: 1;
              padding: 10px 14px;
              background: #10b981;
              color: white;
              border: none;
              border-radius: 10px;
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
            ">
              📑 Export BibTeX
            </button>
            <a href="${paperInfo.pdfUrl}" target="_blank" style="
              flex: 1;
              padding: 10px 14px;
              background: #3b82f6;
              color: white;
              border: none;
              border-radius: 10px;
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              text-align: center;
              text-decoration: none;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
            ">
              📄 Open PDF
            </a>
          </div>
        </div>
        
        <div class="tab-content" id="collections-tab" style="padding: 16px; display: none; overflow-y: auto; box-sizing: border-box;">
          <div style="margin-bottom: 16px;">
            <h5 style="margin: 0 0 10px 0; font-size: 13px; color: #374151; font-weight: 600;">Your Tags</h5>
            <div id="all-tags-container" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; max-height: 200px; overflow-y: auto; padding: 4px;"></div>
          </div>
          
          <div id="tag-papers" style="display: none;">
            <div style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
              <button id="back-to-tags" style="
                background: none;
                border: none;
                color: #6b7280;
                cursor: pointer;
                padding: 4px;
                display: flex;
                align-items: center;
                transition: color 0.2s;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>
              <h5 style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">
                Papers tagged with "<span id="selected-tag"></span>"
              </h5>
            </div>
            <div id="papers-list" style="max-height: 250px; overflow-y: auto;"></div>
          </div>
          
          <div id="no-tags-message" style="
            text-align: center;
            padding: 40px 20px;
            color: #9ca3af;
          ">
            <p style="margin: 0; font-size: 14px;">No tags created yet.</p>
            <p style="margin: 8px 0 0 0; font-size: 13px;">Add tags to papers to organize your collection!</p>
          </div>
        </div>
      `;

      document.body.appendChild(widget);
      
      // Store paper info
      browser.storage.local.set({ currentPaper: paperInfo });

      // Set up event handlers
      const tagInput = widget.querySelector('#tag-input') as HTMLInputElement;
      const tagsContainer = widget.querySelector('#tags-container');
      let tagSuggestions = widget.querySelector('#tag-suggestions') as HTMLElement;
      const exportBtn = widget.querySelector('#export-bibtex');
      const minimizeBtn = widget.querySelector('#minimize-widget');
      const tabButtons = widget.querySelectorAll('.tab-button');
      const paperTab = widget.querySelector('#paper-tab') as HTMLElement;
      const collectionsTab = widget.querySelector('#collections-tab') as HTMLElement;
      const allTagsContainer = widget.querySelector('#all-tags-container');
      const tagPapers = widget.querySelector('#tag-papers') as HTMLElement;
      const papersList = widget.querySelector('#papers-list');
      const selectedTagSpan = widget.querySelector('#selected-tag');
      const noTagsMessage = widget.querySelector('#no-tags-message') as HTMLElement;
      const backToTagsBtn = widget.querySelector('#back-to-tags');
      
      let isMinimized = false;
      
      // Load saved tab state
      browser.storage.local.get('selectedTab').then((result) => {
        if (result.selectedTab === 'collections') {
          // Simulate clicking the collections tab
          const collectionsBtn = Array.from(tabButtons).find(btn => btn.getAttribute('data-tab') === 'collections');
          if (collectionsBtn) {
            (collectionsBtn as HTMLElement).click();
          }
        }
      });
      
      // Default tag suggestions
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

      // Tab switching
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const tab = button.getAttribute('data-tab');
          
          // Save selected tab to storage
          browser.storage.local.set({ selectedTab: tab });
          
          // Update button styles
          tabButtons.forEach(btn => {
            if (btn === button) {
              (btn as HTMLElement).style.background = 'white';
              (btn as HTMLElement).style.borderBottomColor = '#4f46e5';
              (btn as HTMLElement).style.color = '#4f46e5';
              btn.classList.add('active');
            } else {
              (btn as HTMLElement).style.background = 'transparent';
              (btn as HTMLElement).style.borderBottomColor = 'transparent';
              (btn as HTMLElement).style.color = '#6b7280';
              btn.classList.remove('active');
            }
          });
          
          // Show/hide tabs
          if (tab === 'paper') {
            paperTab.style.display = 'block';
            collectionsTab.style.display = 'none';
          } else {
            paperTab.style.display = 'none';
            collectionsTab.style.display = 'block';
            // Reset the view and always reload when switching to collections
            tagPapers.style.display = 'none';
            allTagsContainer!.parentElement!.style.display = 'block';
            // Small delay to ensure any pending saves are completed
            setTimeout(() => loadCollections(), 50);
          }
        });
      });

      // Load collections
      async function loadCollections() {
        try {
          console.log('Loading collections...');
          const papers = await browser.runtime.sendMessage({ type: 'GET_PAPERS' });
          
          console.log('Papers loaded:', papers);
          
          // Ensure papers is a valid object
          if (!papers || typeof papers !== 'object') {
            console.warn('No papers found or invalid response');
            noTagsMessage.style.display = 'block';
            tagPapers.style.display = 'none';
            return;
          }
          
          const allTags = new Map<string, number>();
          
          // Count tags
          Object.values(papers).forEach((paper: any) => {
            if (paper.tags && paper.tags.length > 0) {
              paper.tags.forEach((tag: string) => {
                allTags.set(tag, (allTags.get(tag) || 0) + 1);
              });
            }
          });
        
          if (allTags.size === 0) {
            noTagsMessage.style.display = 'block';
            tagPapers.style.display = 'none';
            return;
          }
          
          noTagsMessage.style.display = 'none';
          
          // Display all tags
          allTagsContainer!.innerHTML = '';
          allTags.forEach((count, tag) => {
            const tagEl = document.createElement('button');
            tagEl.style.cssText = `
              padding: 4px 10px;
              background: #e0e7ff;
              color: #4338ca;
              border: none;
              border-radius: 16px;
              font-size: 11px;
              cursor: pointer;
              transition: all 0.2s;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              white-space: nowrap;
              line-height: 1.4;
            `;
            tagEl.innerHTML = `${tag} <span style="background: #4338ca; color: white; padding: 0px 4px; border-radius: 8px; font-size: 9px;">${count}</span>`;
            
            tagEl.addEventListener('mouseenter', () => {
              tagEl.style.background = '#c7d2fe';
              tagEl.style.transform = 'scale(1.05)';
            });
            
            tagEl.addEventListener('mouseleave', () => {
              tagEl.style.background = '#e0e7ff';
              tagEl.style.transform = 'scale(1)';
            });
            
            tagEl.addEventListener('click', () => {
              showPapersForTag(tag, papers);
            });
            
            allTagsContainer!.appendChild(tagEl);
          });
        } catch (error) {
          console.error('Error loading collections:', error);
          noTagsMessage.style.display = 'block';
          tagPapers.style.display = 'none';
          allTagsContainer!.innerHTML = '';
          return;
        }
      }

      // Show papers for a specific tag
      function showPapersForTag(tag: string, allPapers: any) {
        console.log('Showing papers for tag:', tag);
        console.log('All papers:', allPapers);
        
        selectedTagSpan!.textContent = tag;
        tagPapers.style.display = 'block';
        allTagsContainer!.parentElement!.style.display = 'none';
        papersList!.innerHTML = '';
        
        const papersWithTag = Object.entries(allPapers).filter(([id, paper]: [string, any]) => 
          paper.tags && paper.tags.includes(tag)
        );
        
        console.log('Papers with tag:', papersWithTag);
        
        if (papersWithTag.length === 0) {
          papersList!.innerHTML = `
            <p style="text-align: center; color: #9ca3af; font-size: 13px; padding: 20px;">
              No papers found with this tag.
            </p>
          `;
          return;
        }
        
        papersWithTag.forEach(([id, paper]: [string, any]) => {
          const paperEl = document.createElement('a');
          paperEl.href = `https://arxiv.org/abs/${paper.arxivId}`;
          paperEl.target = '_blank';
          paperEl.style.cssText = `
            display: block;
            padding: 12px;
            margin-bottom: 8px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
          `;
          
          paperEl.innerHTML = `
            <h6 style="margin: 0 0 4px 0; font-size: 13px; color: #111827; font-weight: 500; line-height: 1.4;">
              ${paper.title}
            </h6>
            <p style="margin: 0; font-size: 11px; color: #6b7280;">
              ${paper.authors?.slice(0, 3).join(', ')}${paper.authors?.length > 3 ? ' et al.' : ''}
            </p>
            <div style="margin: 6px 0 0 0; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 11px; color: #4338ca; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                arXiv:${paper.arxivId}
              </span>
              <span style="font-size: 10px; color: #9ca3af;">
                ${new Date(paper.savedAt).toLocaleDateString()}
              </span>
            </div>
          `;
          
          paperEl.addEventListener('mouseenter', () => {
            paperEl.style.background = '#f3f4f6';
            paperEl.style.borderColor = '#d1d5db';
            paperEl.style.transform = 'translateY(-1px)';
            paperEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
          });
          
          paperEl.addEventListener('mouseleave', () => {
            paperEl.style.background = '#f9fafb';
            paperEl.style.borderColor = '#e5e7eb';
            paperEl.style.transform = 'translateY(0)';
            paperEl.style.boxShadow = 'none';
          });
          
          papersList!.appendChild(paperEl);
        });
      }



      // Move tag suggestions to body after all handlers are set up
      if (tagSuggestions) {
        document.body.appendChild(tagSuggestions);
        // Update the reference after moving
        tagSuggestions = document.getElementById('tag-suggestions') as HTMLElement;
      }

      function addTagElement(tag: string) {
        // Check if tag already exists in UI
        const existingTags = Array.from(tagsContainer?.querySelectorAll('span') || []);
        if (existingTags.some(el => el.textContent?.includes(tag))) {
          return;
        }

        const tagEl = document.createElement('span');
        tagEl.style.cssText = `
          padding: 3px 8px;
          background: #e0e7ff;
          color: #4338ca;
          border-radius: 16px;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          transition: all 0.2s;
          white-space: nowrap;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4;
        `;
        tagEl.innerHTML = `
          <span style="overflow: hidden; text-overflow: ellipsis;">${tag}</span>
          <button data-tag="${tag}" style="
            background: none;
            border: none;
            color: #4338ca;
            cursor: pointer;
            padding: 0;
            font-size: 14px;
            line-height: 1;
            opacity: 0.6;
            transition: opacity 0.2s;
            flex-shrink: 0;
            margin-left: 1px;
          " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">×</button>
        `;

        const removeBtn = tagEl.querySelector('button');
        removeBtn?.addEventListener('click', async () => {
          tagEl.remove();
          // Remove tag from storage
          await browser.runtime.sendMessage({
            type: 'REMOVE_TAG',
            paperId: paperInfo.arxivId,
            tag: tag
          });
          
          // Auto-refresh collections if visible
          if (collectionsTab.style.display !== 'none') {
            setTimeout(() => loadCollections(), 100);
          }
        });

        tagsContainer?.appendChild(tagEl);
      }

      // Tag functionality
      const addTag = async () => {
        const tag = tagInput.value.trim();
        if (!tag) return;

        console.log('Adding tag:', tag);

        // Check if tag already exists
        const existingTags = Array.from(tagsContainer?.querySelectorAll('span') || []);
        if (existingTags.some(el => el.textContent?.includes(tag))) {
          tagInput.value = '';
          return;
        }

        addTagElement(tag);
        tagInput.value = '';

        // Add the tag directly without re-saving the paper
        // The paper already exists from when the widget was created
        try {
          console.log('Sending ADD_TAG message for:', paperInfo.arxivId, tag);
          const response = await browser.runtime.sendMessage({
            type: 'ADD_TAG',
            paperId: paperInfo.arxivId,
            tag: tag
          });
          console.log('ADD_TAG response:', response);
          
          // Auto-refresh collections if visible
          if (collectionsTab.style.display !== 'none') {
            setTimeout(() => loadCollections(), 100); // Small delay to ensure storage is updated
          }
        } catch (error) {
          console.error('Error saving tag:', error);
        }
      };

      tagInput?.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await addTag();
        }
      });

      // Tag suggestions functionality
      let isSelectingSuggestion = false;
      
      function positionSuggestions() {
        if (!tagInput || !tagSuggestions) return;
        
        const inputRect = tagInput.getBoundingClientRect();
        
        // For dropup: position the bottom of suggestions at the top of input
        // Calculate actual height of suggestions or use max
        const suggestionsRect = tagSuggestions.getBoundingClientRect();
        const actualHeight = suggestionsRect.height || 200;
        const topValue = inputRect.top - actualHeight - 8;
        
        tagSuggestions.style.top = `${topValue}px`;
        tagSuggestions.style.left = `${inputRect.left}px`;
        tagSuggestions.style.width = `${inputRect.width}px`;
        tagSuggestions.style.bottom = 'auto';
        tagSuggestions.style.position = 'fixed';
      }
      
      function showTagSuggestions(filter: string = '') {
        if (!tagSuggestions) {
          tagSuggestions = document.getElementById('tag-suggestions') as HTMLElement;
          if (!tagSuggestions) return;
        }
        
        const currentTags = Array.from(tagsContainer?.querySelectorAll('span') || [])
          .map(el => el.textContent?.replace('×', '').trim());
        
        const availableTags = DEFAULT_TAGS.filter(tag => !currentTags.includes(tag));
        const filteredTags = filter 
          ? availableTags.filter(tag => tag.toLowerCase().includes(filter.toLowerCase()))
          : availableTags;

        tagSuggestions.innerHTML = '';
        
        // Always show suggestions when input is focused
        const tagsToShow = filteredTags.slice(0, 6);
        
        if (tagsToShow.length === 0 && !filter) {
          // Show message when all default tags are used
          const noTagsMsg = document.createElement('div');
          noTagsMsg.style.cssText = `
            padding: 12px;
            text-align: center;
            font-size: 12px;
            color: #9ca3af;
          `;
          noTagsMsg.textContent = 'All suggested tags are in use. Type to create custom tags.';
          tagSuggestions.appendChild(noTagsMsg);
        } else {
          // Show suggested tags
          if (tagsToShow.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = `
              padding: 6px 12px;
              font-size: 11px;
              color: #9ca3af;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            `;
            header.textContent = 'Suggested Tags';
            tagSuggestions.appendChild(header);
          }

          tagsToShow.forEach((tag, index) => {
            const suggestionEl = document.createElement('div');
            suggestionEl.style.cssText = `
              padding: 8px 12px;
              cursor: pointer;
              transition: all 0.15s ease;
              font-size: 13px;
              color: #374151;
            `;
            
            suggestionEl.textContent = tag;
            
            suggestionEl.addEventListener('mouseenter', () => {
              suggestionEl.style.background = '#f3f4f6';
              suggestionEl.style.paddingLeft = '14px';
            });
            
            suggestionEl.addEventListener('mouseleave', () => {
              suggestionEl.style.background = 'transparent';
              suggestionEl.style.paddingLeft = '12px';
            });
            
            suggestionEl.addEventListener('mousedown', (e) => {
              e.preventDefault();
              isSelectingSuggestion = true;
            });
            
            suggestionEl.addEventListener('click', async () => {
              tagInput.value = tag;
              await addTag();
              tagSuggestions.style.display = 'none';
              isSelectingSuggestion = false;
              tagInput.focus();
            });
            
            tagSuggestions.appendChild(suggestionEl);
          });
        }
        
        // Add custom tag option if user is typing
        if (filter && filter.length > 0) {
          // Add separator if there are suggestions above
          if (tagsToShow.length > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = `
              height: 1px;
              background: #e5e7eb;
              margin: 4px 0;
            `;
            tagSuggestions.appendChild(separator);
          }

          const customOption = document.createElement('div');
          customOption.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 13px;
            color: #059669;
            font-weight: 500;
          `;
          customOption.innerHTML = `<span style="opacity: 0.7;">Create:</span> "${filter}"`;
          
          customOption.addEventListener('mouseenter', () => {
            customOption.style.background = '#ecfdf5';
            customOption.style.paddingLeft = '14px';
          });
          
          customOption.addEventListener('mouseleave', () => {
            customOption.style.background = 'transparent';
            customOption.style.paddingLeft = '12px';
          });
          
          customOption.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isSelectingSuggestion = true;
          });
          
          customOption.addEventListener('click', async () => {
            await addTag();
            tagSuggestions.style.display = 'none';
            isSelectingSuggestion = false;
            tagInput.focus();
          });
          
          tagSuggestions.appendChild(customOption);
        }
        
        positionSuggestions();
        tagSuggestions.style.display = 'block';
      }
      
      function hideSuggestions() {
        if (!isSelectingSuggestion) {
          tagSuggestions.style.display = 'none';
        }
      }

      tagInput?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        showTagSuggestions(value);
      });

      // Focus effect for input
      tagInput?.addEventListener('focus', () => {
        tagInput.style.borderColor = '#4f46e5';
        tagInput.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
        // Always show suggestions on focus
        setTimeout(() => {
          showTagSuggestions(tagInput.value);
        }, 50);
      });
      
      // Also show on click in case focus doesn't trigger
      tagInput?.addEventListener('click', () => {
        if (!tagSuggestions || tagSuggestions.style.display === 'none') {
          showTagSuggestions(tagInput.value);
        }
      });
      
      tagInput?.addEventListener('blur', () => {
        tagInput.style.borderColor = '#e5e7eb';
        tagInput.style.boxShadow = 'none';
        // Delay to allow click events on suggestions
        setTimeout(() => {
          if (!isSelectingSuggestion) {
            hideSuggestions();
          }
        }, 150);
      });
      
      // Hide suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!tagInput?.contains(e.target as Node) && !tagSuggestions?.contains(e.target as Node)) {
          hideSuggestions();
        }
      });
      
      // Reposition dropdown on scroll/resize
      window.addEventListener('scroll', () => {
        if (tagSuggestions.style.display !== 'none') {
          positionSuggestions();
        }
      });
      
      window.addEventListener('resize', () => {
        if (tagSuggestions.style.display !== 'none') {
          positionSuggestions();
        }
      });

      // Export BibTeX
      exportBtn?.addEventListener('click', async () => {
        if (exportBtn instanceof HTMLElement) {
          const originalText = exportBtn.textContent;
          
          // Show loading state
          exportBtn.textContent = '⏳ Loading...';
          exportBtn.style.background = '#6b7280';
          
          try {
            const bibtex = await getBibTeXCitation();
            
            if (bibtex) {
              // Copy to clipboard
              await navigator.clipboard.writeText(bibtex);
              
              // Show success state
              exportBtn.textContent = '✓ Copied!';
              exportBtn.style.background = '#10b981';
              
              // Show the BibTeX in a tooltip
              const tooltip = document.createElement('div');
              tooltip.style.cssText = `
                position: absolute;
                bottom: 100%;
                left: 0;
                right: 0;
                margin-bottom: 8px;
                padding: 12px;
                background: #1f2937;
                color: white;
                border-radius: 12px;
                font-size: 11px;
                font-family: monospace;
                white-space: pre-wrap;
                word-break: break-all;
                max-height: 200px;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                z-index: 1000;
              `;
              tooltip.textContent = bibtex;
              exportBtn.parentElement?.appendChild(tooltip);
              
              // Add scrollbar styling for tooltip
              const style = document.createElement('style');
              style.textContent = `
                #arxiv-abstract-widget [style*="overflow-y: auto"]::-webkit-scrollbar {
                  width: 6px;
                }
                #arxiv-abstract-widget [style*="overflow-y: auto"]::-webkit-scrollbar-track {
                  background: rgba(255, 255, 255, 0.1);
                  border-radius: 3px;
                }
                #arxiv-abstract-widget [style*="overflow-y: auto"]::-webkit-scrollbar-thumb {
                  background: rgba(255, 255, 255, 0.3);
                  border-radius: 3px;
                }
                #tag-suggestions::-webkit-scrollbar {
                  width: 4px;
                }
                #tag-suggestions::-webkit-scrollbar-track {
                  background: transparent;
                }
                #tag-suggestions::-webkit-scrollbar-thumb {
                  background: #e5e7eb;
                  border-radius: 2px;
                }
                #tag-suggestions::-webkit-scrollbar-thumb:hover {
                  background: #d1d5db;
                }
                #tags-container::-webkit-scrollbar {
                  width: 4px;
                }
                #tags-container::-webkit-scrollbar-track {
                  background: transparent;
                }
                #tags-container::-webkit-scrollbar-thumb {
                  background: #e5e7eb;
                  border-radius: 2px;
                }
                #tags-container::-webkit-scrollbar-thumb:hover {
                  background: #d1d5db;
                }
                #all-tags-container::-webkit-scrollbar {
                  width: 4px;
                }
                #all-tags-container::-webkit-scrollbar-track {
                  background: transparent;
                }
                #all-tags-container::-webkit-scrollbar-thumb {
                  background: #e5e7eb;
                  border-radius: 2px;
                }
                #all-tags-container::-webkit-scrollbar-thumb:hover {
                  background: #d1d5db;
                }
                #arxiv-abstract-widget {
                  max-height: 90vh;
                  overflow: hidden !important;
                }
                #arxiv-abstract-widget * {
                  box-sizing: border-box;
                }
                #arxiv-abstract-widget .tab-content {
                  max-height: calc(90vh - 200px);
                  overflow-y: auto;
                }
                #arxiv-abstract-widget .widget-header {
                  flex-shrink: 0;
                }
                #arxiv-abstract-widget .widget-tabs {
                  flex-shrink: 0;
                }
                #arxiv-abstract-widget button {
                  font-family: inherit;
                }
                #arxiv-abstract-widget .tab-button:hover:not(.active) {
                  background: rgba(79, 70, 229, 0.05);
                  color: #4f46e5;
                }
                #arxiv-abstract-widget a[href*="pdf"]:hover {
                  transform: translateY(-2px);
                  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }
                #arxiv-abstract-widget #export-bibtex:hover:not(:disabled) {
                  transform: translateY(-2px);
                  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                }
                #minimize-widget:hover {
                  background: rgba(255,255,255,0.3) !important;
                }
                #tag-suggestions {
                  animation: slideUp 0.15s ease-out;
                }
                @keyframes slideUp {
                  from {
                    opacity: 0;
                    transform: translateY(8px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `;
              document.head.appendChild(style);
              
              // Remove tooltip and reset button after 5 seconds
              setTimeout(() => {
                tooltip.remove();
                exportBtn.textContent = originalText;
                exportBtn.style.background = '#10b981';
              }, 5000);
            } else {
              throw new Error('Failed to get BibTeX');
            }
          } catch (error) {
            // Error state
            exportBtn.textContent = '❌ Failed';
            exportBtn.style.background = '#ef4444';
            
            setTimeout(() => {
              exportBtn.textContent = originalText;
              exportBtn.style.background = '#10b981';
            }, 2000);
          }
        }
      });

      // Back to tags button
      backToTagsBtn?.addEventListener('click', () => {
        tagPapers.style.display = 'none';
        allTagsContainer!.parentElement!.style.display = 'block';
      });
      
      backToTagsBtn?.addEventListener('mouseenter', () => {
        if (backToTagsBtn instanceof HTMLElement) {
          backToTagsBtn.style.color = '#374151';
        }
      });
      
      backToTagsBtn?.addEventListener('mouseleave', () => {
        if (backToTagsBtn instanceof HTMLElement) {
          backToTagsBtn.style.color = '#6b7280';
        }
      });

      // Minimize/maximize
      minimizeBtn?.addEventListener('click', () => {
        isMinimized = !isMinimized;
        if (isMinimized) {
          widget.style.height = '56px';
          widget.style.overflow = 'hidden';
          minimizeBtn.textContent = '+';
          // Hide suggestions when minimizing
          hideSuggestions();
        } else {
          widget.style.height = 'auto';
          widget.style.overflow = 'visible';
          minimizeBtn.textContent = '−';
        }
      });

      // Save paper and load existing tags
      // First check if paper already exists to preserve tags
      browser.runtime.sendMessage({ type: 'GET_PAPERS' }).then(async (papers) => {
        const existingPaper = papers && papers[paperInfo.arxivId];
        const paperToSave = {
          ...paperInfo,
          tags: existingPaper?.tags || [] // Preserve existing tags
        };
        
        // Save the paper with preserved tags
        await browser.runtime.sendMessage({
          type: 'SAVE_PAPER',
          paper: paperToSave
        });
        
        console.log('Paper saved successfully:', paperToSave);
        
        // Load existing tags into UI
        if (paperToSave.tags && paperToSave.tags.length > 0) {
          paperToSave.tags.forEach((tag: string) => {
            addTagElement(tag);
          });
        }
        
        // Now enable tag input (paper is guaranteed to be saved)
        tagInput.disabled = false;
        tagInput.placeholder = "Click for suggestions or type custom tag...";
        // PDF processing status removed per user request
      }).catch((error) => {
        console.error('Error saving paper:', error);
        tagInput.disabled = false;
      });
      
      // Initially disable tag input until paper is saved
      tagInput.disabled = true;
      tagInput.placeholder = "Loading...";

      return widget;
    }

    // Create PDF page chat widget
    async function createPdfChatWidget() {
      const widget = document.createElement('div');
      widget.id = 'arxiv-chat-widget';
      
      // Simple markdown to HTML converter
      function renderMarkdown(text: string): string {
        // Escape HTML first
        const escapeHtml = (str: string) => {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        };
        
        // Process line by line for better control
        const lines = text.split('\n');
        const html: string[] = [];
        let inCodeBlock = false;
        let codeBlockLang = '';
        let codeBlockLines: string[] = [];
        
        for (const line of lines) {
          // Code blocks
          if (line.startsWith('```')) {
            if (inCodeBlock) {
              // End code block
              html.push(`<pre style="background: #1f2937; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; font-size: 13px; line-height: 1.4;"><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
              codeBlockLines = [];
              inCodeBlock = false;
              codeBlockLang = '';
            } else {
              // Start code block
              inCodeBlock = true;
              codeBlockLang = line.slice(3).trim();
            }
            continue;
          }
          
          if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
          }
          
          let processedLine = escapeHtml(line);
          
          // Headers
          if (line.startsWith('### ')) {
            processedLine = `<h5 style="margin: 12px 0 8px 0; font-weight: 600; font-size: 14px;">${escapeHtml(line.slice(4))}</h5>`;
          } else if (line.startsWith('## ')) {
            processedLine = `<h4 style="margin: 12px 0 8px 0; font-weight: 600; font-size: 15px;">${escapeHtml(line.slice(3))}</h4>`;
          } else if (line.startsWith('# ')) {
            processedLine = `<h3 style="margin: 12px 0 8px 0; font-weight: 600; font-size: 16px;">${escapeHtml(line.slice(2))}</h3>`;
          } else {
            // Inline formatting
            processedLine = processedLine
              // Bold
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              // Italic
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              // Inline code
              .replace(/`(.+?)`/g, '<code style="background: #e5e7eb; padding: 2px 4px; border-radius: 3px; font-size: 13px;">$1</code>')
              // Links
              .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" style="color: #4f46e5; text-decoration: underline;">$1</a>');
            
            // Lists
            if (line.startsWith('- ') || line.startsWith('* ')) {
              processedLine = `<li style="margin: 4px 0;">${processedLine.slice(2)}</li>`;
            } else if (/^\d+\.\s/.test(line)) {
              processedLine = `<li style="margin: 4px 0;">${processedLine.replace(/^\d+\.\s/, '')}</li>`;
            }
            
            // Wrap in paragraph if not already wrapped
            if (processedLine && !processedLine.startsWith('<')) {
              processedLine = `<p style="margin: 8px 0; line-height: 1.5;">${processedLine}</p>`;
            }
          }
          
          html.push(processedLine);
        }
        
        // Close any open code block
        if (inCodeBlock) {
          html.push(`<pre style="background: #1f2937; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; font-size: 13px; line-height: 1.4;"><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
        }
        
        // Wrap consecutive list items in ul/ol tags
        const finalHtml = html.join('\n').replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
          return `<ul style="margin: 8px 0; padding-left: 20px;">${match}</ul>`;
        });
        
        return finalHtml;
      }
      
      widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        height: 600px;
        background: white;
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        transition: all 0.3s ease;
      `;

      const paperInfo = extractPaperInfo();
      
      widget.innerHTML = `
        <div class="chat-header" style="
          padding: 16px 20px;
          background: #4f46e5;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        ">
          <div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">arXiv Assistant</h3>
            <p style="margin: 2px 0 0 0; font-size: 13px; opacity: 0.9;">Chat about this paper</p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="settings-btn" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </button>
            <button id="close-chat" style="
              background: rgba(255,255,255,0.2);
              border: none;
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
              font-size: 20px;
              font-weight: 500;
            ">×</button>
          </div>
        </div>
        
        <div class="chat-messages" id="chat-messages" style="
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f9fafb;
        ">
          <div class="welcome-message" style="
            text-align: center;
            color: #6b7280;
            padding: 60px 20px;
          ">
            <div style="
              width: 80px;
              height: 80px;
              margin: 0 auto 20px;
              background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
              border-radius: 20px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <h4 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937; font-weight: 600;">
              Ask me about this paper!
            </h4>
            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
              I can help explain concepts, summarize sections,<br>or answer any questions you have.
            </p>
            <div id="welcome-status" style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 8px 16px;
              background: white;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 500;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            ">
              <span style="color: #6b7280;">Checking API key...</span>
            </div>
          </div>
        </div>
        
        <div class="chat-input-container" style="
          padding: 16px;
          background: white;
          border-top: 1px solid #e5e7eb;
          flex-shrink: 0;
        ">
          <div style="display: flex; gap: 10px; margin-bottom: 8px;">
            <input id="chat-input" type="text" placeholder="Ask a question..." style="
              flex: 1;
              padding: 10px 14px;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              font-size: 14px;
              transition: all 0.2s;
              outline: none;
            ">
            <button id="send-button" style="
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: #4f46e5;
              color: white;
              border: none;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
            <span id="api-status" style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
            ">Powered by OpenAI</span> • <a href="#" id="configure-link" style="color: #4f46e5; text-decoration: none;">Configure API key</a>
          </p>
        </div>
      `;

      document.body.appendChild(widget);

      // Add chat widget styles
      const chatStyles = document.createElement('style');
      chatStyles.textContent = `
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        
        #arxiv-chat-widget #close-chat:hover {
          background: rgba(255,255,255,0.3) !important;
        }
        
        #arxiv-chat-widget #settings-btn:hover {
          background: rgba(255,255,255,0.3) !important;
        }
        
        #arxiv-chat-widget #send-button:hover {
          background: #4338ca !important;
          transform: scale(1.05);
        }
        
        #arxiv-chat-widget #send-button:active {
          transform: scale(0.95);
        }
        
        #arxiv-chat-widget #chat-input:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }
        
        #arxiv-chat-widget .chat-messages::-webkit-scrollbar {
          width: 6px;
        }
        
        #arxiv-chat-widget .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }
        
        #arxiv-chat-widget .chat-messages::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 3px;
        }
        
        #arxiv-chat-widget .chat-messages::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
        
        #arxiv-chat-widget .settings-view {
          display: none;
          padding: 20px;
          background: #f9fafb;
          flex: 1;
          overflow-y: auto;
        }
        
        #arxiv-chat-widget .settings-view.active {
          display: block;
        }
        
        #arxiv-chat-widget .chat-messages.hidden {
          display: none;
        }
        
        #arxiv-chat-widget .chat-input-container.hidden {
          display: none;
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `;
      document.head.appendChild(chatStyles);

      // Get paper info from abstract page if available
      let finalPaperInfo = paperInfo;
      
      const storedPaperResult = await browser.storage.local.get('currentPaper');
      if (storedPaperResult.currentPaper && storedPaperResult.currentPaper.arxivId === paperInfo.arxivId) {
        // We have the full paper info from the abstract page
        console.log('[Chat] Using full paper info from abstract page:', storedPaperResult.currentPaper);
        finalPaperInfo = storedPaperResult.currentPaper;
      } else if (!isAbstractPage) {
        // We're on a PDF page without stored abstract, try to get from saved papers
        const papers = await browser.runtime.sendMessage({ type: 'GET_PAPERS' });
        if (papers && papers[paperInfo.arxivId]) {
          console.log('[Chat] Using saved paper info:', papers[paperInfo.arxivId]);
          finalPaperInfo = papers[paperInfo.arxivId];
        }
      }

      // Update the paper info display
      const titleElement = widget.querySelector('h4');
      const authorsElement = widget.querySelector('p:nth-of-type(1)');
      if (titleElement && finalPaperInfo.title) {
        titleElement.textContent = finalPaperInfo.title;
      }
      if (authorsElement && finalPaperInfo.authors && finalPaperInfo.authors.length > 0) {
        authorsElement.innerHTML = `<strong style="color: #374151;">Authors:</strong> ${finalPaperInfo.authors.join(', ')}`;
      }

      // Save the paper to ensure it's available for PDF extraction
      console.log('[Chat] Saving paper for extraction:', finalPaperInfo);
      
      // Store the full paper info for use in message handler
      await browser.storage.local.set({ currentPaper: finalPaperInfo });
      
      browser.runtime.sendMessage({
        type: 'SAVE_PAPER',
        paper: finalPaperInfo
      }).then(() => {
        console.log('[Chat] Paper saved for extraction:', finalPaperInfo.arxivId);
      }).catch((error) => {
        console.error('[Chat] Failed to save paper:', error);
      });

      // Set up event handlers
      const closeBtn = widget.querySelector('#close-chat');
      const settingsBtn = widget.querySelector('#settings-btn');
      const configureLink = widget.querySelector('#configure-link');
      const apiStatus = widget.querySelector('#api-status');
      const chatInput = widget.querySelector('#chat-input') as HTMLInputElement;
      const sendBtn = widget.querySelector('#send-button');
      const messagesContainer = widget.querySelector('#chat-messages');
      
      // Check for API key on load
      let hasApiKey = false;
      browser.runtime.sendMessage({ type: 'GET_OPENAI_KEY' }).then((apiKey) => {
        hasApiKey = !!apiKey;
        updateApiStatus();
        updateWelcomeStatus();
        if (!hasApiKey) {
          // Show API key setup prompt
          showApiKeySetup();
        }
      });
      
      function updateApiStatus() {
        if (hasApiKey) {
          if (apiStatus) {
            apiStatus.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span style="color: #10b981; font-weight: 500;">API key configured</span>
            `;
          }
        } else {
          if (apiStatus) {
            apiStatus.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              <span style="color: #ef4444; font-weight: 500;">No API key</span>
            `;
          }
        }
      }
      
      function updateWelcomeStatus() {
        const welcomeStatus = widget.querySelector('#welcome-status');
        if (welcomeStatus) {
          if (hasApiKey) {
            welcomeStatus.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span style="color: #10b981;">Ready to chat with full PDF!</span>
            `;
          } else {
            welcomeStatus.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01"/>
              </svg>
              <span style="color: #ef4444;">API key required</span>
            `;
          }
        }
      }

      // Add settings view
      function addSettingsView() {
        const settingsView = document.createElement('div');
        settingsView.className = 'settings-view';
        settingsView.innerHTML = `
          <div style="max-width: 320px; margin: 0 auto;">
            <div style="
              width: 64px;
              height: 64px;
              margin: 0 auto 20px;
              background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
              border-radius: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </div>
            
            <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; text-align: center; color: #111827;">
              Configure OpenAI API Key
            </h3>
            
            <p style="margin: 0 0 20px 0; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.5;">
              To enable AI-powered chat, please enter your OpenAI API key.
            </p>
            
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: #374151;">
                API Key
              </label>
              <input type="password" id="api-key-input" placeholder="sk-..." style="
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                font-size: 14px;
                transition: all 0.2s;
                outline: none;
                box-sizing: border-box;
              ">
              <p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280;">
                Your key is stored locally and never shared.
              </p>
            </div>
            
            <button id="save-api-key" style="
              width: 100%;
              padding: 10px 16px;
              background: #4f46e5;
              color: white;
              border: none;
              border-radius: 10px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
              margin-bottom: 12px;
            ">
              Save API Key
            </button>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #4f46e5; text-decoration: none;">
                  Get your API key from OpenAI →
                </a>
              </p>
            </div>
          </div>
        `;
        
        // Insert after header but before messages
        const header = widget.querySelector('.chat-header');
        if (header && header.nextSibling) {
          header.parentNode?.insertBefore(settingsView, header.nextSibling);
        }
        
        // Set up settings event handlers
        const apiKeyInput = settingsView.querySelector('#api-key-input') as HTMLInputElement;
        const saveBtn = settingsView.querySelector('#save-api-key');
        
        // Focus on input
        apiKeyInput?.addEventListener('focus', () => {
          apiKeyInput.style.borderColor = '#4f46e5';
          apiKeyInput.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
        });
        
        apiKeyInput?.addEventListener('blur', () => {
          apiKeyInput.style.borderColor = '#e5e7eb';
          apiKeyInput.style.boxShadow = 'none';
        });
        
        // Save button hover
        saveBtn?.addEventListener('mouseenter', () => {
          if (saveBtn instanceof HTMLElement) {
            saveBtn.style.background = '#4338ca';
            saveBtn.style.transform = 'translateY(-1px)';
          }
        });
        
        saveBtn?.addEventListener('mouseleave', () => {
          if (saveBtn instanceof HTMLElement) {
            saveBtn.style.background = '#4f46e5';
            saveBtn.style.transform = 'translateY(0)';
          }
        });
        
        // Save API key
        saveBtn?.addEventListener('click', async () => {
          const apiKey = apiKeyInput?.value.trim();
          if (!apiKey) {
            apiKeyInput?.focus();
            return;
          }
          
          if (!apiKey.startsWith('sk-')) {
            alert('Please enter a valid OpenAI API key (should start with "sk-")');
            return;
          }
          
          // Save the API key
          await browser.runtime.sendMessage({
            type: 'SET_OPENAI_KEY',
            apiKey: apiKey
          });
          
          hasApiKey = true;
          hideApiKeySetup();
          updateApiStatus();
          updateWelcomeStatus();
          
          // Show success message
          const successMsg = document.createElement('div');
          successMsg.style.cssText = `
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: #10b981;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
            z-index: 1000;
          `;
          successMsg.textContent = '✓ API key saved successfully!';
          widget.appendChild(successMsg);
          
          setTimeout(() => successMsg.remove(), 3000);
        });
        
        // Allow Enter to save
        apiKeyInput?.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            (saveBtn as HTMLElement)?.click();
          }
        });
      }
      
      function showApiKeySetup() {
        const settingsView = widget.querySelector('.settings-view');
        const messagesContainer = widget.querySelector('#chat-messages');
        const inputContainer = widget.querySelector('.chat-input-container');
        
        if (!settingsView) {
          addSettingsView();
        }
        
        widget.querySelector('.settings-view')?.classList.add('active');
        messagesContainer?.classList.add('hidden');
        inputContainer?.classList.add('hidden');
        
        // Focus on input
        setTimeout(() => {
          const input = widget.querySelector('#api-key-input') as HTMLInputElement;
          input?.focus();
        }, 100);
      }
      
      function hideApiKeySetup() {
        const settingsView = widget.querySelector('.settings-view');
        const messagesContainer = widget.querySelector('#chat-messages');
        const inputContainer = widget.querySelector('.chat-input-container');
        
        settingsView?.classList.remove('active');
        messagesContainer?.classList.remove('hidden');
        inputContainer?.classList.remove('hidden');
        
        // Focus back on chat input
        chatInput?.focus();
      }

      closeBtn?.addEventListener('click', () => {
        widget.style.display = 'none';
      });
      
      settingsBtn?.addEventListener('click', () => {
        showApiKeySetup();
      });
      
      configureLink?.addEventListener('click', (e) => {
        e.preventDefault();
        showApiKeySetup();
      });

      // Chat functionality
      const sendMessage = async () => {
        const message = chatInput?.value.trim();
        if (!message) return;
        
        // Check for special commands
        if (message === '/clear-pdf-cache') {
          console.log('[Chat] Clearing PDF cache...');
          // Clear the chunk embeddings for this paper
          const chunkResult = await browser.storage.local.get('chunk_embeddings');
          const chunkEmbeddings = chunkResult.chunk_embeddings || {};
          if (chunkEmbeddings[paperInfo.arxivId]) {
            delete chunkEmbeddings[paperInfo.arxivId];
            await browser.storage.local.set({ chunk_embeddings: chunkEmbeddings });
            console.log('[Chat] PDF cache cleared for:', paperInfo.arxivId);
            
            // Show confirmation message
            const confirmMsg = document.createElement('div');
            confirmMsg.style.cssText = `
              text-align: center;
              padding: 12px;
              margin: 10px 16px;
              background: #fee2e2;
              color: #991b1b;
              border-radius: 12px;
              font-size: 13px;
            `;
            confirmMsg.textContent = '✅ PDF cache cleared. Next message will re-extract the PDF.';
            messagesContainer?.appendChild(confirmMsg);
            chatInput!.value = '';
            return;
          }
        }
        
        // Add user message to chat
        console.log('[Chat] Sending message:', message);
        
        const userMsg = document.createElement('div');
        userMsg.style.cssText = `
          margin-bottom: 16px;
          display: flex;
          justify-content: flex-end;
        `;
        userMsg.innerHTML = `
          <div style="
            max-width: 70%;
            padding: 12px 16px;
            background: #4f46e5;
            color: white;
            border-radius: 20px 20px 4px 20px;
            font-size: 14px;
            line-height: 1.5;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.2);
          ">${message}</div>
        `;
        
        const welcomeMsg = messagesContainer?.querySelector('.welcome-message');
        if (welcomeMsg) welcomeMsg.remove();
        
        messagesContainer?.appendChild(userMsg);
        chatInput.value = '';

        // Show typing indicator
        const typingMsg = document.createElement('div');
        typingMsg.style.cssText = `
          margin-bottom: 16px;
          display: flex;
        `;
        typingMsg.innerHTML = `
          <div style="
            padding: 12px 16px;
            background: #f3f4f6;
            border-radius: 20px 20px 20px 4px;
            display: flex;
            gap: 4px;
            align-items: center;
          ">
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite;"></span>
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite; animation-delay: 0.2s;"></span>
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite; animation-delay: 0.4s;"></span>
          </div>
        `;
        messagesContainer?.appendChild(typingMsg);
        messagesContainer?.scrollTo(0, messagesContainer.scrollHeight);

        try {
          let responseText = '';
          
          if (hasApiKey) {
            console.log('[Chat] API key detected, sending to OpenAI...');
            
            // Update send button to show loading state
            (sendBtn as HTMLButtonElement)!.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                <path d="M21 12a9 9 0 00-9-9" opacity="0.5"/>
              </svg>
            `;
            (sendBtn as HTMLButtonElement)!.style.background = '#9ca3af';
            (sendBtn as HTMLButtonElement)!.disabled = true;
            
            // Use OpenAI to get response
            const paperContext = await browser.storage.local.get('currentPaper');
            const paper = paperContext.currentPaper || paperInfo;
            
            console.log('[Chat] Paper context:', paper.arxivId, paper.title);
            
            // Check if PDF has been extracted
            const chunkResult = await browser.storage.local.get('chunk_embeddings');
            const chunkEmbeddings = chunkResult.chunk_embeddings || {};
            
            console.log('[Chat] Checking chunks for paper:', paper.arxivId);
            console.log('[Chat] Existing chunks:', Object.keys(chunkEmbeddings));
            console.log('[Chat] Paper chunk data:', chunkEmbeddings[paper.arxivId]);
            
            if (!chunkEmbeddings[paper.arxivId]) {
              console.log('[Chat] PDF not extracted yet, triggering extraction...');
              
              // Update typing message to show PDF extraction status
              typingMsg.innerHTML = `
                <div style="
                  padding: 12px 16px;
                  background: #fef3c7;
                  color: #92400e;
                  border-radius: 20px 20px 20px 4px;
                  font-size: 13px;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                ">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    <path d="M21 12a9 9 0 00-9-9" opacity="0.5"/>
                  </svg>
                  Extracting PDF content for better responses...
                </div>
              `;
              
              // Trigger PDF extraction
              const extractResult = await browser.runtime.sendMessage({
                type: 'EXTRACT_PDF',
                paperId: paper.arxivId
              });
              
              if (extractResult.error) {
                console.error('[Chat] PDF extraction failed:', extractResult.error);
                // Continue without PDF context
                typingMsg.innerHTML = `
                  <div style="
                    padding: 12px 16px;
                    background: #f3f4f6;
                    border-radius: 20px 20px 20px 4px;
                    display: flex;
                    gap: 4px;
                    align-items: center;
                  ">
                    <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite;"></span>
                    <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite; animation-delay: 0.2s;"></span>
                    <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: pulse 1.4s infinite; animation-delay: 0.4s;"></span>
                  </div>
                `;
              } else if (extractResult.success) {
                console.log('[Chat] PDF extracted successfully:', extractResult.chunkCount, 'chunks', 'source:', extractResult.source);
                
                // Show extraction source to user
                let sourceMessage = 'Ready to chat!';
                if (extractResult.source === 'html') {
                  sourceMessage = '📝 Using paper abstract (PDF extraction failed)';
                } else if (extractResult.source === 'combined') {
                  sourceMessage = '📄 Using partial PDF content';
                } else if (extractResult.source === 'pdf') {
                  sourceMessage = '📄 Full paper loaded';
                }
                
                // Add a temporary notification
                const notification = document.createElement('div');
                notification.style.cssText = `
                  position: fixed;
                  bottom: 20px;
                  right: 20px;
                  background: ${extractResult.source === 'html' ? '#fef3c7' : '#d1fae5'};
                  color: ${extractResult.source === 'html' ? '#92400e' : '#065f46'};
                  padding: 12px 20px;
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  z-index: 999999;
                  animation: slideIn 0.3s ease-out;
                `;
                notification.textContent = sourceMessage;
                document.body.appendChild(notification);
                
                // Remove notification after 3 seconds
                setTimeout(() => {
                  notification.style.animation = 'slideOut 0.3s ease-out';
                  setTimeout(() => notification.remove(), 300);
                }, 3000);
              }
            } else {
              console.log('[Chat] Using existing PDF chunks:', chunkEmbeddings[paper.arxivId]);
            }
            
            const response = await browser.runtime.sendMessage({
              type: 'CHAT_WITH_PAPER',
              message: message,
              paper: {
                title: paper.title,
                abstract: paper.abstract,
                arxivId: paper.arxivId
              }
            });
            
            console.log('[Chat] Response received:', response);
            
            // Reset send button
            (sendBtn as HTMLButtonElement)!.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            `;
            (sendBtn as HTMLButtonElement)!.style.background = '#4f46e5';
            (sendBtn as HTMLButtonElement)!.disabled = false;
            
            if (response && response.error) {
              responseText = `⚠️ Error: ${response.error}. Please check your API key and try again.`;
              console.error('[Chat] Error:', response.error);
            } else if (response && response.response) {
              responseText = response.response;
              console.log('[Chat] Success, response length:', responseText.length);
            } else {
              responseText = '⚠️ Sorry, I couldn\'t generate a response. Please try again.';
              console.error('[Chat] Invalid response format:', response);
            }
          } else {
            console.log('[Chat] No API key configured');
            // No API key - show setup prompt with icon
            responseText = '🔑 To enable AI-powered responses, please configure your OpenAI API key using the key button above.';
          }
          
          // Remove typing indicator and add response
          typingMsg.remove();
          const botMsg = document.createElement('div');
          botMsg.style.cssText = `
            margin-bottom: 16px;
            display: flex;
          `;
          botMsg.innerHTML = `
            <div style="
              max-width: 70%;
              padding: 12px 16px;
              background: #f3f4f6;
              color: #1f2937;
              border-radius: 20px 20px 20px 4px;
              font-size: 14px;
              line-height: 1.5;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            ">${hasApiKey ? renderMarkdown(responseText) : responseText}</div>
          `;
          messagesContainer?.appendChild(botMsg);
          messagesContainer?.scrollTo(0, messagesContainer.scrollHeight);
          
        } catch (error) {
          console.error('Chat error:', error);
          typingMsg.remove();
          
          // Reset send button on error
          if (sendBtn) {
            (sendBtn as HTMLButtonElement).innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            `;
            (sendBtn as HTMLButtonElement).style.background = '#4f46e5';
            (sendBtn as HTMLButtonElement).disabled = false;
          }
          
          const errorMsg = document.createElement('div');
          errorMsg.style.cssText = `
            margin-bottom: 16px;
            display: flex;
          `;
          errorMsg.innerHTML = `
            <div style="
              max-width: 70%;
              padding: 12px 16px;
              background: #fee2e2;
              color: #991b1b;
              border-radius: 20px 20px 20px 4px;
              font-size: 14px;
              line-height: 1.5;
            ">❌ Sorry, something went wrong. Please try again later.</div>
          `;
          messagesContainer?.appendChild(errorMsg);
          messagesContainer?.scrollTo(0, messagesContainer.scrollHeight);
        }
      };

      sendBtn?.addEventListener('click', sendMessage);
      chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Focus on input when widget loads
      setTimeout(() => chatInput?.focus(), 100);

      return widget;
    }

    // Create floating button for PDF pages
    function createFloatingButton() {
      const button = document.createElement('button');
      button.id = 'arxiv-assistant-btn';
      button.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      `;
      button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 20px;
        background: #4f46e5;
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(79, 70, 229, 0.3), 0 2px 8px rgba(79, 70, 229, 0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      `;

      // Add floating button styles
      const buttonStyles = document.createElement('style');
      buttonStyles.textContent = `
        #arxiv-assistant-btn:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 6px 24px rgba(79, 70, 229, 0.4), 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        
        #arxiv-assistant-btn:active {
          transform: translateY(-1px) scale(0.98);
        }
        
        @keyframes bounce-in {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        #arxiv-assistant-btn {
          animation: bounce-in 0.4s ease-out;
        }
      `;
      document.head.appendChild(buttonStyles);

      return button;
    }

    

      // Initialize based on page type
      if (isAbstractPage) {
        // Abstract page: Show paper info widget immediately
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createAbstractWidget);
        } else {
          createAbstractWidget();
        }
      } else if (isPdfPage) {
      // PDF page: Show floating button that opens chat
      let chatWidget: HTMLElement | null = null;
      
      const button = createFloatingButton();
      button.addEventListener('click', async () => {
        if (!chatWidget) {
          chatWidget = await createPdfChatWidget();
        } else {
          const isVisible = chatWidget.style.display !== 'none';
          chatWidget.style.display = isVisible ? 'none' : 'flex';
          if (!isVisible) {
            const input = chatWidget.querySelector('#chat-input') as HTMLInputElement;
            setTimeout(() => input?.focus(), 100);
          }
        }
      });
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(button);
        });
      } else {
        document.body.appendChild(button);
      }
    }
  },
});
