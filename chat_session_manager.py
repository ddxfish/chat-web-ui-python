# -*- coding: utf-8 -*-
# chat_session_manager.py
# Multi-session chat management

import json
import os
import time
import logging
from datetime import datetime
from pathlib import Path
import config

logger = logging.getLogger(__name__)

class ChatSessionManager:
    def __init__(self):
        self.sessions_dir = Path(config.SESSIONS_DIR)
        self.sessions_dir.mkdir(exist_ok=True)
        self.active_session_id = None
        self.active_session_data = None
        
    def create_new_session(self, system_prompt=None):
        """Create a new chat session."""
        session_id = str(int(time.time()))
        system_prompt = system_prompt or config.SYSTEM_PROMPT
        
        session_data = {
            "id": session_id,
            "name": session_id,  # Will be updated by AI later
            "system_prompt": system_prompt,
            "created_at": datetime.now().isoformat(),
            "last_active": datetime.now().isoformat(),
            "messages": []
        }
        
        session_file = self.sessions_dir / f"{session_id}.json"
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False)
        
        self.active_session_id = session_id
        self.active_session_data = session_data
        
        logger.info(f"Created new session: {session_id}")
        return session_id
    
    def load_session(self, session_id):
        """Load and activate a specific session."""
        session_file = self.sessions_dir / f"{session_id}.json"
        
        if not session_file.exists():
            raise FileNotFoundError(f"Session {session_id} not found")
        
        with open(session_file, 'r', encoding='utf-8') as f:
            session_data = json.load(f)
        
        # Update last active
        session_data['last_active'] = datetime.now().isoformat()
        self._save_session_data(session_id, session_data)
        
        self.active_session_id = session_id
        self.active_session_data = session_data
        
        logger.info(f"Loaded session: {session_id}")
        return session_data
    
    def get_active_session(self):
        """Get current active session data. Returns None if no active session."""
        if not self.active_session_id:
            return None
        return self.active_session_data
    
    def has_active_session(self):
        """Check if there's an active session."""
        return self.active_session_id is not None
    
    def list_sessions(self):
        """List all available sessions."""
        sessions = []
        
        for session_file in self.sessions_dir.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                sessions.append({
                    "id": data["id"],
                    "name": data["name"],
                    "created_at": data["created_at"],
                    "last_active": data["last_active"],
                    "message_count": len(data.get("messages", []))
                })
            except Exception as e:
                logger.warning(f"Failed to read session {session_file}: {e}")
        
        # Sort by last_active, most recent first
        sessions.sort(key=lambda x: x["last_active"], reverse=True)
        return sessions
    
    def delete_session(self, session_id):
        """Delete a session."""
        session_file = self.sessions_dir / f"{session_id}.json"
        
        if not session_file.exists():
            raise FileNotFoundError(f"Session {session_id} not found")
        
        session_file.unlink()
        
        # If deleting active session, clear it (DON'T auto-create new one)
        if self.active_session_id == session_id:
            self.active_session_id = None
            self.active_session_data = None
        
        logger.info(f"Deleted session: {session_id}")
    
    def update_session_name(self, session_id, new_name, rename_file=False):
        """Update session name and optionally rename file."""
        session_file = self.sessions_dir / f"{session_id}.json"
        
        if not session_file.exists():
            raise FileNotFoundError(f"Session {session_id} not found")
        
        with open(session_file, 'r', encoding='utf-8') as f:
            session_data = json.load(f)
        
        session_data['name'] = new_name
        session_data['last_active'] = datetime.now().isoformat()
        
        # Optionally rename file to use the new name
        if rename_file and config.USE_NAMED_FILES:
            # Create safe filename from name
            safe_name = new_name.replace(' ', '_').replace('/', '_').replace('\\', '_')
            safe_name = ''.join(c for c in safe_name if c.isalnum() or c in '_-')[:50]
            new_filename = f"{safe_name}_{session_id}.json"
            new_session_file = self.sessions_dir / new_filename
            
            # Save to new file and delete old one
            with open(new_session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2, ensure_ascii=False)
            
            session_file.unlink()
            logger.info(f"Renamed session file: {session_file.name} -> {new_filename}")
        else:
            # Just update the existing file
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2, ensure_ascii=False)
        
        # Update active session data if this is the active session
        if self.active_session_id == session_id:
            self.active_session_data = session_data
        
        logger.info(f"Updated session {session_id} name to: {new_name}")
    
    def _save_session_data(self, session_id, session_data):
        """Save session data to file."""
        # Find the actual file (might be renamed)
        session_file = None
        
        # First try the original timestamp filename
        original_file = self.sessions_dir / f"{session_id}.json"
        if original_file.exists():
            session_file = original_file
        else:
            # Look for renamed file that ends with session_id
            for f in self.sessions_dir.glob(f"*_{session_id}.json"):
                session_file = f
                break
        
        if not session_file:
            # Fallback to original name
            session_file = original_file
        
        session_data['last_active'] = datetime.now().isoformat()
        
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False)
    
    # Message management methods (require active session)
    def get_messages(self):
        """Get messages from active session."""
        session = self.get_active_session()
        if not session:
            return []
        return session.get("messages", [])
    
    def add_message(self, role, content):
        """Add message to active session."""
        session = self.get_active_session()
        if not session:
            raise RuntimeError("No active session")
        
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        
        session["messages"].append(message)
        self._save_session_data(self.active_session_id, session)
        
        logger.debug(f"Added {role} message to session {self.active_session_id}")
    
    def update_message(self, index, new_content):
        """Update a specific message in active session."""
        session = self.get_active_session()
        if not session:
            raise RuntimeError("No active session")
        
        messages = session.get("messages", [])
        
        if not (0 <= index < len(messages)):
            raise IndexError("Invalid message index")
        
        messages[index]['content'] = new_content
        self._save_session_data(self.active_session_id, session)
        
        logger.info(f"Updated message {index} in session {self.active_session_id}")
    
    def delete_last_messages(self, count):
        """Delete last N messages from active session."""
        session = self.get_active_session()
        if not session:
            raise RuntimeError("No active session")
        
        messages = session.get("messages", [])
        
        if count >= len(messages):
            deleted = len(messages)
            session["messages"] = []
        else:
            deleted = count
            session["messages"] = messages[:-count]
        
        self._save_session_data(self.active_session_id, session)
        
        logger.info(f"Deleted {deleted} messages from session {self.active_session_id}")
        return deleted
    
    def clear_session(self):
        """Clear all messages from active session."""
        session = self.get_active_session()
        if not session:
            raise RuntimeError("No active session")
        
        session["messages"] = []
        self._save_session_data(self.active_session_id, session)
        
        logger.info(f"Cleared session {self.active_session_id}")
    
    def get_system_prompt(self):
        """Get system prompt for active session."""
        session = self.get_active_session()
        if not session:
            return config.SYSTEM_PROMPT
        return session.get("system_prompt", config.SYSTEM_PROMPT)