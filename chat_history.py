# chat_history.py
# Local chat history management

import json
import os
import logging
from datetime import datetime
import config

logger = logging.getLogger(__name__)

class ChatHistory:
    def __init__(self):
        self.history_file = config.HISTORY_FILE
        self.max_history = config.MAX_HISTORY
        self._ensure_history_file()
    
    def _ensure_history_file(self):
        """Create history file if it doesn't exist."""
        if not os.path.exists(self.history_file):
            with open(self.history_file, 'w') as f:
                json.dump([], f)
            logger.info(f"Created new history file: {self.history_file}")
    
    def get_history(self):
        """Load chat history from file."""
        try:
            with open(self.history_file, 'r') as f:
                history = json.load(f)
            return history
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.error(f"Error loading history: {e}")
            return []
    
    def _save_history(self, history):
        """Save history to file."""
        try:
            # Trim history if too long
            if len(history) > self.max_history:
                history = history[-self.max_history:]
            
            with open(self.history_file, 'w') as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving history: {e}")
    
    def add_message(self, role, content):
        """Add a message to history."""
        history = self.get_history()
        
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        
        history.append(message)
        self._save_history(history)
        logger.debug(f"Added {role} message to history")
    
    def clear_history(self):
        """Clear all chat history."""
        self._save_history([])
        logger.info("Chat history cleared")
    
    def delete_last_messages(self, count):
        """Delete the last N messages from history."""
        history = self.get_history()
        
        if count >= len(history):
            deleted = len(history)
            self._save_history([])
        else:
            deleted = count
            history = history[:-count]
            self._save_history(history)
        
        logger.info(f"Deleted {deleted} messages from history")
        return deleted