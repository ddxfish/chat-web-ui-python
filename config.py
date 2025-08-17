# config.py
# Configuration for standalone chat interface

# LLM Backend Configuration
# Supported: 'openai', 'lmstudio', 'ollama', 'custom'
LLM_BACKEND = 'lmstudio'

# Backend-specific settings
OPENAI_API_KEY = ''  # Required for openai backend
LLM_ENDPOINT = 'http://localhost:1234/v1'  # For lmstudio, ollama, custom
MODEL_NAME = 'gpt-3.5-turbo'  # Model to use

# Custom headers (for custom backends)
CUSTOM_HEADERS = {}

# Chat Settings
MAX_HISTORY = 100
SYSTEM_PROMPT = "You are a helpful AI assistant."

# Streaming Settings
ENABLE_STREAMING = True
STREAMING_ENDPOINT = None  # If None, will try to auto-detect from LLM_ENDPOINT

# Storage
HISTORY_FILE = 'chat_history.json'

# Server Settings
HOST = '0.0.0.0'
PORT = 8080
DEBUG = True