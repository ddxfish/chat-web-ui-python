# Standalone Chat Interface

A **lightweight, UI-only chat interface** that connects to OpenAI-compatible API endpoints. No built-in LLM - just a clean, modern web interface for chatting with any OpenAI-compatible service. No junk, ultra-lightweight.

<img width="1736" height="1154" alt="image" src="https://github.com/user-attachments/assets/971383f4-bb10-4d6b-8206-048a013a6583" />


## Features

- 🚀 **Streaming responses** with real-time message display
- ✏️ **Edit any message** inline and regenerate from that point
- 🔄 **Regenerate responses** from any message in the conversation
- 🗑️ **Smart deletion** - remove message pairs from any point
- ⏭️ **Continue conversations** - button appears when ending on user message
- 🧠 **Thinking blocks** - collapsible reasoning steps in responses
- 📱 **Responsive design** with sidebar and mobile support
- 💾 **Local chat history** stored in JSON file
- 🎨 **Dark theme** optimized for readability
- 🔧 **Multiple backends** - OpenAI, LM Studio, Ollama, or custom endpoints

## Configuration

Edit `config.py` for your setup:

```python
# Backend type: 'openai', 'lmstudio', 'ollama', 'custom'
LLM_BACKEND = 'lmstudio'

# API endpoint (for local servers)
LLM_ENDPOINT = 'http://localhost:1234/v1'

# Model name
MODEL_NAME = 'gpt-3.5-turbo'

# API key (only needed for OpenAI)
OPENAI_API_KEY = 'your-key-here'
```

## Installation & Usage

### Clone and Install
```bash
git clone https://github.com/ddxfish/chat-web-ui-python
cd chat-web-ui-python
pip install -r requirements.txt
```

### Run the Application
```bash
python main.py
```

Open http://localhost:8080 in your browser.

## FAQ

**Q: Does this have an LLM back-end?**  
A: No, this is just a UI that connects to external API endpoints. You need to run your own LLM server or use OpenAI's API.

**Q: Does this require an account with OpenAI?**  
A: Only if you want to use OpenAI's API. For local models (LM Studio, Ollama, etc.), no account needed.

**Q: What API key and model name do I use with llama-server or LM Studio?**  
A: None needed! Just set `LLM_BACKEND = 'lmstudio'` and point `LLM_ENDPOINT` to your local server. Leave `OPENAI_API_KEY` empty.

## License

MIT License - see LICENSE file for details.
