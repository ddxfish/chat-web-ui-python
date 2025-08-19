# -*- coding: utf-8 -*-
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
        """Get response from LLM backend using default system prompt."""
        return self.get_response_with_system_prompt(user_message, history, config.SYSTEM_PROMPT)
    
    def get_response_with_system_prompt(self, user_message, history=None, system_prompt=None):
        """Get response from LLM backend with custom system prompt."""
        if self.backend_type == 'openai':
            return self._openai_request(user_message, history, system_prompt)
        elif self.backend_type in ['lmstudio', 'ollama']:
            return self._openai_compatible_request(user_message, history, system_prompt)
        elif self.backend_type == 'custom':
            return self._custom_request(user_message, history, system_prompt)
        else:
            raise ValueError(f"Unsupported backend: {self.backend_type}")
    
    def get_simple_response(self, prompt):
        """Get simple response for AI naming (no history, minimal system prompt)."""
        # Use simple system prompt to discourage thinking tags
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Respond directly and concisely without thinking tags."},
            {"role": "user", "content": prompt}
        ]
        
        headers = {"Content-Type": "application/json; charset=utf-8"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.1,  # Lower temperature for more consistent naming
            "max_tokens": 4000    # Plenty of room for any response
        }
        
        url = self.endpoint
        if self.backend_type in ['lmstudio', 'ollama']:
            if not url.endswith('/chat/completions'):
                url = url.rstrip('/') + '/chat/completions'
        elif self.backend_type == 'openai':
            url = "https://api.openai.com/v1/chat/completions"
        
        logger.info(f"Simple response request to {url}")
        logger.info(f"Payload: {payload}")
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        
        logger.info(f"Simple response received: '{content}'")
        return content
    
    def get_streaming_response(self, user_message, history=None):
        """Get streaming response from LLM backend using default system prompt."""
        yield from self.get_streaming_response_with_system_prompt(user_message, history, config.SYSTEM_PROMPT)
    
    def get_streaming_response_with_system_prompt(self, user_message, history=None, system_prompt=None):
        """Get streaming response from LLM backend with custom system prompt."""
        logger.info(f"=== STREAMING REQUEST START ===")
        logger.info(f"Backend: {self.backend_type}, Endpoint: {self.endpoint}")
        logger.info(f"Streaming enabled: {config.ENABLE_STREAMING}")
        
        if not config.ENABLE_STREAMING:
            logger.info("Streaming disabled, falling back to non-streaming")
            response = self.get_response_with_system_prompt(user_message, history, system_prompt)
            yield response
            return
            
        try:
            if self.backend_type == 'openai':
                logger.info("Using OpenAI streaming")
                yield from self._openai_streaming_request(user_message, history, system_prompt)
            elif self.backend_type in ['lmstudio', 'ollama']:
                logger.info("Using OpenAI-compatible streaming")
                yield from self._openai_compatible_streaming_request(user_message, history, system_prompt)
            elif self.backend_type == 'custom':
                logger.info("Using custom streaming")
                yield from self._custom_streaming_request(user_message, history, system_prompt)
            else:
                raise ValueError(f"Unsupported backend: {self.backend_type}")
                
            logger.info("=== STREAMING REQUEST COMPLETE ===")
        except Exception as e:
            logger.error(f"=== STREAMING FAILED ===")
            logger.error(f"Streaming error: {e}")
            logger.info("Falling back to non-streaming")
            response = self.get_response_with_system_prompt(user_message, history, system_prompt)
            yield response
    
    def _build_messages(self, user_message, history=None, system_prompt=None):
        """Build message array for chat completion with custom system prompt."""
        system_prompt = system_prompt or config.SYSTEM_PROMPT
        messages = [{"role": "system", "content": system_prompt}]
        
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
    
    def _openai_request(self, user_message, history=None, system_prompt=None):
        """Make request to OpenAI API."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history, system_prompt),
            "temperature": 0.7
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        
        response.encoding = 'utf-8'
        data = response.json()
        return data["choices"][0]["message"]["content"]
    
    def _openai_compatible_request(self, user_message, history=None, system_prompt=None):
        """Make request to OpenAI-compatible API (LM Studio, Ollama, etc.)."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json; charset=utf-8"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history, system_prompt),
            "temperature": 0.7
        }
        
        url = self.endpoint
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions'
        
        logger.info(f"Making request to {self.backend_type}: {url}")
        
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        
        if response.encoding != 'utf-8':
            logger.warning(f"{self.backend_type} returned encoding '{response.encoding}', forcing UTF-8")
            response.encoding = 'utf-8'
        
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        
        if isinstance(content, str) and ("ÃƒÂ°" in content or "ÃƒÆ'" in content):
            logger.warning(f"DETECTED EMOJI CORRUPTION IN {self.backend_type} RESPONSE")
        
        return content
    
    def _custom_request(self, user_message, history=None, system_prompt=None):
        """Make request to custom API endpoint."""
        headers = {
            "Content-Type": "application/json; charset=utf-8"
        }
        headers.update(self.headers)
        
        payload = {
            "prompt": user_message,
            "history": history or [],
            "model": self.model,
            "system_prompt": system_prompt
        }
        
        response = requests.post(self.endpoint, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        data = response.json()
        return data.get("response", data.get("text", str(data)))
    
    def _openai_streaming_request(self, user_message, history=None, system_prompt=None):
        """Make streaming request to OpenAI API."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history, system_prompt),
            "temperature": 0.7,
            "stream": True
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
            stream=True,
            timeout=90
        )
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        for line in response.iter_lines(decode_unicode=True):
            if line:
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
    
    def _openai_compatible_streaming_request(self, user_message, history=None, system_prompt=None):
        """Make streaming request to OpenAI-compatible API."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "text/event-stream; charset=utf-8"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        payload = {
            "model": self.model,
            "messages": self._build_messages(user_message, history, system_prompt),
            "temperature": 0.7,
            "stream": True
        }
        
        url = self.endpoint
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions'
        
        logger.info(f"=== {self.backend_type.upper()} STREAMING REQUEST ===")
        logger.info(f"URL: {url}")
        
        try:
            response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"HTTP error: {response.status_code}")
                response.raise_for_status()
            
            if response.encoding != 'utf-8':
                response.encoding = 'utf-8'
            
            chunk_count = 0
            content_count = 0
            
            for line in response.iter_lines(decode_unicode=True):
                if line:
                    line = line.strip()
                    
                    if line.startswith('data: '):
                        chunk_count += 1
                        data_str = line[6:].strip()
                        
                        if data_str == '[DONE]':
                            logger.info(f"=== {self.backend_type.upper()} STREAMING DONE - Chunks: {chunk_count}, Content: {content_count} ===")
                            return
                            
                        try:
                            data = json.loads(data_str)
                            if 'choices' in data and len(data['choices']) > 0:
                                delta = data['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    content_count += 1
                                    if "ÃƒÂ°" in content or "ÃƒÆ'" in content:
                                        logger.error(f"EMOJI CORRUPTION DETECTED in streaming: {repr(content)}")
                                    yield content
                            elif 'error' in data:
                                logger.error(f"{self.backend_type} API error: {data['error']}")
                                raise Exception(f"{self.backend_type} API error: {data['error']}")
                        except json.JSONDecodeError as e:
                            logger.warning(f"JSON decode error: {data_str[:100]} - {e}")
                            continue
                                
        except Exception as e:
            logger.error(f"{self.backend_type} streaming failed: {e}")
            raise
    
    def _custom_streaming_request(self, user_message, history=None, system_prompt=None):
        """Make streaming request to custom API - modify as needed."""
        response = self._custom_request(user_message, history, system_prompt)
        yield response