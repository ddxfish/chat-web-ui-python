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
        logger.info(f"=== STREAMING REQUEST START ===")
        logger.info(f"Backend: {self.backend_type}, Endpoint: {self.endpoint}")
        logger.info(f"Streaming enabled: {config.ENABLE_STREAMING}")
        
        if not config.ENABLE_STREAMING:
            logger.info("Streaming disabled, falling back to non-streaming")
            # Fallback to non-streaming
            response = self.get_response(user_message, history)
            yield response
            return
            
        try:
            if self.backend_type == 'openai':
                logger.info("Using OpenAI streaming")
                yield from self._openai_streaming_request(user_message, history)
            elif self.backend_type in ['lmstudio', 'ollama']:
                logger.info("Using OpenAI-compatible streaming")
                yield from self._openai_compatible_streaming_request(user_message, history)
            elif self.backend_type == 'custom':
                logger.info("Using custom streaming")
                yield from self._custom_streaming_request(user_message, history)
            else:
                raise ValueError(f"Unsupported backend: {self.backend_type}")
                
            logger.info("=== STREAMING REQUEST COMPLETE ===")
        except Exception as e:
            logger.error(f"=== STREAMING FAILED ===")
            logger.error(f"Streaming error: {e}")
            logger.info("Falling back to non-streaming")
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
        
        logger.info(f"=== STREAMING HTTP REQUEST ===")
        logger.info(f"URL: {url}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Model: {self.model}")
        logger.info(f"Stream: {payload['stream']}")
        logger.info(f"Message count: {len(payload['messages'])}")
        
        try:
            logger.info("Making HTTP request...")
            response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
            
            logger.info(f"=== STREAMING HTTP RESPONSE ===")
            logger.info(f"Status: {response.status_code}")
            logger.info(f"Headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                logger.error(f"HTTP error: {response.status_code}")
                logger.error(f"Response text: {response.text}")
                response.raise_for_status()
            
            content_type = response.headers.get('content-type', '')
            logger.info(f"Content-Type: {content_type}")
            
            if 'text/event-stream' not in content_type and 'text/plain' not in content_type:
                logger.warning(f"Unexpected content type for streaming: {content_type}")
            
            buffer = ""
            chunk_count = 0
            content_count = 0
            has_data = False
            
            logger.info("Starting to read response chunks...")
            
            try:
                for chunk in response.iter_content(chunk_size=1, decode_unicode=True):
                    if chunk:
                        buffer += chunk
                        has_data = True
                        
                        # Process complete lines
                        while '\n' in buffer:
                            line, buffer = buffer.split('\n', 1)
                            line = line.strip()
                            
                            if line.startswith('data: '):
                                chunk_count += 1
                                data_str = line[6:].strip()
                                
                                if chunk_count <= 3:  # Log first few chunks
                                    logger.info(f"Chunk {chunk_count}: {data_str[:200]}{'...' if len(data_str) > 200 else ''}")
                                
                                if data_str == '[DONE]':
                                    logger.info(f"=== STREAMING DONE - Total chunks: {chunk_count}, Content pieces: {content_count} ===")
                                    return
                                    
                                try:
                                    data = json.loads(data_str)
                                    if 'choices' in data and len(data['choices']) > 0:
                                        delta = data['choices'][0].get('delta', {})
                                        content = delta.get('content', '')
                                        if content:
                                            content_count += 1
                                            if content_count <= 5:  # Log first 5 content pieces
                                                logger.info(f"Content {content_count}: '{content}'")
                                            yield content
                                    elif 'error' in data:
                                        logger.error(f"API error in response: {data['error']}")
                                        raise Exception(f"API error: {data['error']}")
                                except json.JSONDecodeError as e:
                                    logger.warning(f"JSON decode error on chunk {chunk_count}: {data_str[:100]} - {e}")
                                    continue
                                    
                if not has_data:
                    logger.error("No data received from streaming response")
                    raise Exception("No data received from streaming endpoint")
                    
                if content_count == 0:
                    logger.warning(f"Received {chunk_count} chunks but no content")
                    
            except Exception as e:
                logger.error(f"Error reading streaming response: {e}")
                raise
                                
        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP request failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Streaming processing failed: {e}")
            raise
    
    def _custom_streaming_request(self, user_message, history=None):
        """Make streaming request to custom API - modify as needed."""
        # Fallback to non-streaming for custom APIs
        response = self._custom_request(user_message, history)
        yield response