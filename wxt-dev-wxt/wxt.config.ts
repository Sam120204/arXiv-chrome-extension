import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'arXiv Paper Assistant',
    description: 'AI-powered assistant for reading and organizing arXiv papers',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'notifications'],
    host_permissions: ['https://arxiv.org/*', 'https://*.arxiv.org/*']
  },
  modules: ['@wxt-dev/module-react'],
});
