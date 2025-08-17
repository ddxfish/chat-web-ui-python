# Standalone Chat Interface

A simple web interface for chatting with various LLM backends.

## Setup

1. Install dependencies:
```bash
pip install flask requests
```

2. Edit `config.py` to configure your LLM backend:

```python
# For LM Studio
LLM_BACKEND = 'lmstudio'
LLM_ENDPOINT = 'http://localhost:1234/v1'
MODEL_NAME = 'your-model-name'

# For OpenAI
LLM_BACKEND = 'openai'
OPENAI_API_KEY = 'your-api-key'
MODEL_NAME = 'gpt-3.5-turbo'

# For Ollama
LLM_BACKEND = 'ollama'
LLM_ENDPOINT = 'http://localhost:11434/v1'
MODEL_NAME = 'llama2'
```

3. Run the app:
```bash
python main.py
```

4. Open http://localhost:8080 in your browser

## Features

- Clean web chat interface
- Support for multiple LLM backends
- Local chat history (JSON file)
- Message deletion
- Responsive design
- Auto-refresh

## Supported Backends

- **OpenAI**: Official OpenAI API
- **LM Studio**: Local LM Studio server
- **Ollama**: Local Ollama server
- **Custom**: Any OpenAI-compatible API

## Configuration

Edit `config.py` to customize:
- LLM backend and endpoint
- Model name
- System prompt
- History limits
- Server settings
- Streaming debug level

Chat history is stored in `chat_history.json`.
Debug logs are written to `chat_debug.log`.

## Troubleshooting

**Streaming not working?**
1. Check browser console for detailed streaming logs
2. Check `chat_debug.log` for server-side streaming details
3. Set `DEBUG_STREAMING = True` in config.py for verbose logs
4. Verify your LLM backend supports streaming

**Common issues:**
- LM Studio: Ensure "Enable Streaming" is checked in settings
- OpenAI: Verify API key is valid
- Network: Check for firewalls/proxies blocking streaming