# chat_backend.py
# LLM backend abstraction layer

import requests
import json
import logging
import config

logger = logging.getLogger(__name__)

class ChatBackend:
    def __init__(self):
        self.backend_type = config.LLM_BACKEND.lower()
        self.endpoint = config.LLM_ENDPOINT
        self.model = config.MODEL_NAME
        self.api_key = getattr(config, 'OPENAI_API_KEY', '')
        self.headers = getattr(config, 'CUSTOM_HEADERS', {})
        
        logger.info(f"Initialized {self.backend_type} backend: {self.endpoint}")
    
    def get_response(self, user_message, history=None):
        """Get response from LLM backend."""
        if self.backend_type == 'openai':
            return self._openai_request(user_message, history)
        elif self.backend_type in ['lmstudio', 'ollama']:
            return self._openai_compatible_request(user_message, history)
        elif self.backend_type == 'custom':
            return self._custom_request(user_message, history)
        else:
            raise ValueError(f"Unsupported backend: {self.backend_type}")
    
    def get_streaming_response(self, user_message, history=None):
        """Get streaming response from LLM backend."""
        if not config.ENABLE_STREAMING:
            # Fallback to non-streaming
            response = self.get_response(user_message, history)
            yield response
            return
            
        try:
            if self.backend_type == 'openai':
                yield from self._openai_streaming_request(user_message, history)
            elif self.backend_type in ['lmstudio', 'ollama']:
                yield from self._openai_compatible_streaming_request(user_message, history)
            elif self.backend_type == 'custom':
                yield from self._custom_streaming_request(user_message, history)
            else:
                raise ValueError(f"Unsupported backend: {self.backend_type}")
        except Exception as e:
            logger.warning(f"Streaming failed, falling back to non-streaming: {e}")
            # Fallback to non-streaming
            response = self.get_response(user_message, history)
            yield response
    
    def _build_messages(self, user_message, history=None):
        """Build message array for chat completion."""
        messages = [{"role": "system", "content": config.SYSTEM_PROMPT}]
        
        # Add recent history (last 20 messages to avoid token limits)
        if history:
            recent_history = history[-20:] if len(history) > 20 else history
            for msg in recent_history:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        return messages
    
    def _openai_request(self, user_message, history=None):
        """Make request to OpenAI API."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history),
            "temperature": 0.7
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        
        data = response.json()
        return data["choices"][0]["message"]["content"]
    
    def _openai_compatible_request(self, user_message, history=None):
        """Make request to OpenAI-compatible API (LM Studio, Ollama, etc.)."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history),
            "temperature": 0.7
        }
        
        # Handle different endpoint formats
        url = self.endpoint
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions'
        
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        
        data = response.json()
        return data["choices"][0]["message"]["content"]
    
    def _custom_request(self, user_message, history=None):
        """Make request to custom API endpoint."""
        headers = {"Content-Type": "application/json"}
        headers.update(self.headers)
        
        # Custom payload format - modify as needed
        payload = {
            "prompt": user_message,
            "history": history or [],
            "model": self.model
        }
        
        response = requests.post(self.endpoint, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        
        # Assume response has 'response' field - modify as needed
        data = response.json()
        return data.get("response", data.get("text", str(data)))
    
    def _openai_streaming_request(self, user_message, history=None):
        """Make streaming request to OpenAI API."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history),
            "temperature": 0.7,
            "stream": True
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            stream=True,
            timeout=60
        )
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data_str = line[6:]
                    if data_str == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        if 'choices' in data and len(data['choices']) > 0:
                            delta = data['choices'][0].get('delta', {})
                            content = delta.get('content', '')
                            if content:
                                yield content
                    except json.JSONDecodeError:
                        continue
    
    def _openai_compatible_streaming_request(self, user_message, history=None):
        """Make streaming request to OpenAI-compatible API."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history),
            "temperature": 0.7,
            "stream": True
        }
        
        url = self.endpoint
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions'
        
        response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        response.raise_for_status()
        
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data_str = line[6:]
                    if data_str == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        if 'choices' in data and len(data['choices']) > 0:
                            delta = data['choices'][0].get('delta', {})
                            content = delta.get('content', '')
                            if content:
                                yield content
                    except json.JSONDecodeError:
                        continue
    
    def _custom_streaming_request(self, user_message, history=None):
        """Make streaming request to custom API - modify as needed."""
        # Fallback to non-streaming for custom APIs
        response = self._custom_request(user_message, history)
        yield response