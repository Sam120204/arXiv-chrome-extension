# arXiv Paper Assistant Chrome Extension

An AI-powered Chrome extension that helps researchers read, understand, and organize arXiv papers using OpenAI's GPT models with local storage.

## Features

- 🤖 **AI Chat Assistant**: Ask questions about papers and get instant explanations
- 🏷️ **Smart Tagging**: Organize papers with custom tags and browse by collection
- 📑 **Paper Information Extraction**: Automatically extracts title, authors, and abstract
- 🔍 **Semantic Search**: Find similar papers using local vector embeddings
- 💾 **Local Storage**: All data stored locally in your browser for privacy
- 📊 **Vector Search**: Find related papers based on content similarity
- 🎨 **Clean UI**: Modern, tabbed interface with collections management
- 🔌 **Offline Support**: Works without internet (except for AI features)

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `.output/chrome-mv3-dev` directory

## Usage

1. **Initial Setup** (Optional - for AI features):
   - Click the extension icon in Chrome toolbar
   - Add your OpenAI API key (get one from https://platform.openai.com)
   - Save the settings

2. **On Abstract Pages** (e.g., https://arxiv.org/abs/2301.00001):
   - The assistant widget appears automatically in the bottom right
   - **Current Paper tab**: Shows paper info, tags, and actions
   - **Collections tab**: Browse all your saved papers by tag
   - Features:
     - Add/remove tags to organize papers
     - Export BibTeX citation with one click
     - Quick access to PDF version
     - Minimize/maximize the widget

3. **On PDF Pages** (e.g., https://arxiv.org/pdf/2301.00001.pdf):
   - Click the blue chat button in the bottom right
   - Chat with AI about the paper (requires OpenAI key)
   - Ask questions, request summaries, or clarifications

4. **Data Storage**:
   - All papers, tags, and embeddings are stored locally in your browser
   - No cloud sync needed - works offline
   - Your data stays private on your device

## Development

### Project Structure
```
wxt-dev-wxt/
├── entrypoints/
│   ├── content.ts       # Content script for arXiv pages
│   ├── background.ts    # Background service worker
│   └── popup/          # React popup interface
├── utils/
│   └── openai.ts       # OpenAI integration and vector search
└── wxt.config.ts       # WXT configuration
```

### Building for Production
```bash
npm run build
```

The production build will be in `.output/chrome-mv3`.

### Key Technologies
- **WXT**: Next-gen web extension framework
- **React**: UI components
- **OpenAI API**: Chat completions and embeddings
- **Vectra**: In-browser vector database
- **LangChain**: AI application framework

## API Key Security

Your OpenAI API key is stored locally in Chrome's secure storage and is never transmitted except to OpenAI's servers. See [OPENAI_SETUP.md](./OPENAI_SETUP.md) for setup instructions.

## Why Local Storage?

This extension uses local storage (`chrome.storage.local`) instead of cloud databases. This is perfect for personal research assistants:

### ✅ Advantages
- **Privacy**: Your research data never leaves your device
- **Speed**: Instant access with no network latency
- **Simplicity**: No authentication or complex setup required
- **Reliability**: Works offline (except AI features)
- **Cost**: Completely free - no hosting or database fees

### 📊 How It Works
- Papers and tags are stored in Chrome's local storage
- Vector embeddings are generated via OpenAI and stored locally
- Semantic search uses cosine similarity calculations in JavaScript
- All processing happens in your browser

## Future Enhancements

- [ ] Export entire collections to BibTeX
- [ ] Integrate with reference managers (Zotero, Mendeley)
- [ ] Support for other preprint servers
- [ ] Backup/restore collections
- [ ] Advanced search filters
- [ ] Paper recommendation system

## Contributing

Feel free to open issues or submit pull requests! This is a hackathon project built for learning and experimentation.

## License

MIT
