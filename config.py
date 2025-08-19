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
SYSTEM_PROMPT = "You are a very mean AI assistant."

# Session Settings
SESSIONS_DIR = 'history'  # Directory to store chat sessions
AUTO_NAME_SESSIONS = True  # Let AI generate names for sessions
USE_NAMED_FILES = True  # Rename session files to match AI-generated names
NAMING_PROMPT = "Summarize this conversation in exactly 3 words separated by underscores. Examples: python_web_scraping, database_optimization_help, react_component_issue. Only respond with the 3 words:"

# Streaming Settings
ENABLE_STREAMING = True
STREAMING_ENDPOINT = None  # If None, will try to auto-detect from LLM_ENDPOINT
DEBUG_STREAMING = True  # Set to False to reduce streaming logs

# Legacy Storage (deprecated)
HISTORY_FILE = 'chat_history.json'

# Server Settings
HOST = '0.0.0.0'
PORT = 8080
DEBUG = True