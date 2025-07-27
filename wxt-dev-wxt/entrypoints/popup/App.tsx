import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Tag, Send, Settings, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ArxivAssistant } from '../../utils/openai';
import './App.css';

interface PaperInfo {
  title: string;
  authors: string[];
  abstract: string;
  arxivId: string;
  pdfUrl: string;
  tags?: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function App() {
  const [currentPaper, setCurrentPaper] = useState<PaperInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [assistant, setAssistant] = useState<ArxivAssistant | null>(null);

  useEffect(() => {
    // Clear badge when popup opens
    browser.action.setBadgeText({ text: '' });
    // Load current paper info
    loadCurrentPaper();
    // Load API key
    loadApiKey();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadCurrentPaper = async () => {
    const result = await browser.storage.local.get('currentPaper');
    if (result.currentPaper) {
      setCurrentPaper(result.currentPaper);
      // Load tags for this paper
      const papers = await browser.runtime.sendMessage({ type: 'GET_PAPERS' });
      if (papers[result.currentPaper.arxivId]) {
        setTags(papers[result.currentPaper.arxivId].tags || []);
      }
    }
  };

  const loadApiKey = async () => {
    const key = await browser.runtime.sendMessage({ type: 'GET_OPENAI_KEY' });
    if (key) {
      setApiKey(key);
      const newAssistant = new ArxivAssistant(key);
      await newAssistant.initializeVectorStore();
      setAssistant(newAssistant);
    }
  };

  const saveApiKey = async () => {
    await browser.runtime.sendMessage({ 
      type: 'SET_OPENAI_KEY', 
      apiKey 
    });
    const newAssistant = new ArxivAssistant(apiKey);
    await newAssistant.initializeVectorStore();
    setAssistant(newAssistant);
    setShowSettings(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !apiKey || !assistant || !currentPaper) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Create paper context
      const paperContext = `Title: ${currentPaper.title}
Authors: ${currentPaper.authors.join(', ')}
Abstract: ${currentPaper.abstract}
arXiv ID: ${currentPaper.arxivId}`;

      // Convert messages to format expected by OpenAI
      const chatMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
      chatMessages.push({ role: 'user', content: inputMessage });

      // Get response from OpenAI
      const response = await assistant.chat(chatMessages, paperContext);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || 'Sorry, I could not generate a response.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      // Embed the paper if this is the first message
      if (messages.length === 0) {
        await assistant.embedPaper(currentPaper);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please check your API key and try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = async () => {
    if (!newTag.trim() || !currentPaper) return;

    const updatedTags = [...tags, newTag];
    setTags(updatedTags);
    setNewTag('');

    // Save tag
    await browser.runtime.sendMessage({
      type: 'ADD_TAG',
      paperId: currentPaper.arxivId,
      tag: newTag
    });

    // Save paper if not already saved
    await browser.runtime.sendMessage({
      type: 'SAVE_PAPER',
      paper: currentPaper
    });
  };

  const removeTag = async (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
    // TODO: Implement remove tag functionality
  };

  return (
    <div className="app">
      {showSettings ? (
        <div className="settings-view">
          <div className="settings-header">
            <h2>Settings</h2>
            <button onClick={() => setShowSettings(false)} className="close-btn">
              <X size={20} />
            </button>
          </div>
          <div className="settings-content">
            <label>
              OpenAI API Key:
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </label>
            <button onClick={saveApiKey} className="save-btn">
              Save Settings
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="header">
            <h1>arXiv Assistant</h1>
            <button onClick={() => setShowSettings(true)} className="settings-btn">
              <Settings size={20} />
            </button>
          </div>

          {currentPaper && (
            <div className="paper-info">
              <h2>{currentPaper.title}</h2>
              <p className="authors">by {currentPaper.authors.join(', ')}</p>
              <a href={currentPaper.pdfUrl} target="_blank" rel="noopener noreferrer" className="pdf-link">
                View PDF
              </a>
              
              <div className="tags-section">
                <h3><Tag size={16} /> Tags</h3>
                <div className="tags">
                  {tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="remove-tag">×</button>
                    </span>
                  ))}
                  <div className="add-tag">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addTag()}
                      placeholder="Add tag..."
                    />
                    <button onClick={addTag}>+</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="chat-section">
            <div className="messages">
              {messages.length === 0 && (
                <div className="welcome-message">
                  <MessageCircle size={32} />
                  <p>Ask me anything about this paper!</p>
                  <p className="hint">I can help you understand concepts, summarize sections, or answer questions.</p>
                </div>
              )}
              {messages.map(message => (
                <div key={message.id} className={`message ${message.role}`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant loading">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-section">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about the paper..."
                disabled={!apiKey}
              />
              <button onClick={sendMessage} disabled={!apiKey || !inputMessage.trim()}>
                <Send size={20} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
