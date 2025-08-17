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
            "Content-Type": "application/json; charset=utf-8",
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
        
        # Ensure proper UTF-8 decoding
        response.encoding = 'utf-8'
        data = response.json()
        return data["choices"][0]["message"]["content"]
    
    def _openai_compatible_request(self, user_message, history=None):
        """Make request to OpenAI-compatible API (LM Studio, Ollama, etc.)."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json; charset=utf-8"
        }
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
        
        logger.info(f"Making request to LM Studio: {url}")
        logger.info(f"Request headers: {headers}")
        
        response = requests.post(
            url, 
            headers=headers, 
            json=payload, 
            timeout=60
        )
        response.raise_for_status()
        
        # CRITICAL: Force UTF-8 encoding for LM Studio response
        logger.info(f"LM Studio response encoding: {response.encoding}")
        logger.info(f"LM Studio response headers: {dict(response.headers)}")
        
        if response.encoding != 'utf-8':
            logger.warning(f"LM Studio returned encoding '{response.encoding}', forcing UTF-8")
            response.encoding = 'utf-8'
        
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        
        # Debug the actual content bytes
        logger.info(f"Raw content type: {type(content)}")
        if isinstance(content, str):
            logger.info(f"Content sample: {content[:100]}")
            # Check if we have emoji corruption patterns
            if "ð" in content or "Ã" in content:
                logger.warning("DETECTED EMOJI CORRUPTION IN LM STUDIO RESPONSE")
                logger.info(f"Corrupted content sample: {content}")
        
        return content
    
    def _custom_request(self, user_message, history=None):
        """Make request to custom API endpoint."""
        headers = {
            "Content-Type": "application/json; charset=utf-8"
        }
        headers.update(self.headers)
        
        # Custom payload format - modify as needed
        payload = {
            "prompt": user_message,
            "history": history or [],
            "model": self.model
        }
        
        response = requests.post(
            self.endpoint, 
            headers=headers, 
            json=payload, 
            timeout=60
        )
        response.raise_for_status()
        
        # Ensure proper UTF-8 decoding
        response.encoding = 'utf-8'
        
        # Assume response has 'response' field - modify as needed
        data = response.json()
        return data.get("response", data.get("text", str(data)))
    
    def _openai_streaming_request(self, user_message, history=None):
        """Make streaming request to OpenAI API."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
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
        
        # Ensure proper UTF-8 decoding
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
    
    def _openai_compatible_streaming_request(self, user_message, history=None):
        """Make streaming request to OpenAI-compatible API."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "text/event-stream; charset=utf-8"
        }
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
        
        logger.info(f"=== LM STUDIO STREAMING REQUEST ===")
        logger.info(f"URL: {url}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Model: {self.model}")
        logger.info(f"Stream: {payload['stream']}")
        logger.info(f"Message count: {len(payload['messages'])}")
        
        try:
            logger.info("Making HTTP request...")
            response = requests.post(
                url, 
                headers=headers, 
                json=payload, 
                stream=True, 
                timeout=60
            )
            
            logger.info(f"=== LM STUDIO STREAMING RESPONSE ===")
            logger.info(f"Status: {response.status_code}")
            logger.info(f"Headers: {dict(response.headers)}")
            logger.info(f"Encoding: {response.encoding}")
            
            if response.status_code != 200:
                logger.error(f"HTTP error: {response.status_code}")
                logger.error(f"Response text: {response.text}")
                response.raise_for_status()
            
            # CRITICAL: Force UTF-8 encoding for streaming
            if response.encoding != 'utf-8':
                logger.warning(f"LM Studio streaming encoding '{response.encoding}', forcing UTF-8")
                response.encoding = 'utf-8'
            
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
                # CRITICAL: Use decode_unicode=True to ensure proper UTF-8 handling
                for line in response.iter_lines(decode_unicode=True):
                    if line:
                        has_data = True
                        line = line.strip()
                        
                        if line.startswith('data: '):
                            chunk_count += 1
                            data_str = line[6:].strip()
                            
                            if chunk_count <= 3:  # Log first few chunks
                                logger.info(f"LM Studio chunk {chunk_count}: {data_str[:200]}{'...' if len(data_str) > 200 else ''}")
                            
                            if data_str == '[DONE]':
                                logger.info(f"=== LM STUDIO STREAMING DONE - Total chunks: {chunk_count}, Content pieces: {content_count} ===")
                                return
                                
                            try:
                                data = json.loads(data_str)
                                if 'choices' in data and len(data['choices']) > 0:
                                    delta = data['choices'][0].get('delta', {})
                                    content = delta.get('content', '')
                                    if content:
                                        content_count += 1
                                        if content_count <= 5:  # Log first 5 content pieces
                                            logger.info(f"LM Studio content {content_count}: '{content}'")
                                            # Check for corruption
                                            if "ð" in content or "Ã" in content:
                                                logger.error(f"EMOJI CORRUPTION DETECTED in chunk {content_count}: {repr(content)}")
                                        yield content
                                elif 'error' in data:
                                    logger.error(f"LM Studio API error: {data['error']}")
                                    raise Exception(f"LM Studio API error: {data['error']}")
                            except json.JSONDecodeError as e:
                                logger.warning(f"JSON decode error on chunk {chunk_count}: {data_str[:100]} - {e}")
                                continue
                                
                if not has_data:
                    logger.error("No data received from LM Studio streaming response")
                    raise Exception("No data received from LM Studio streaming endpoint")
                    
                if content_count == 0:
                    logger.warning(f"LM Studio: Received {chunk_count} chunks but no content")
                    
            except Exception as e:
                logger.error(f"Error reading LM Studio streaming response: {e}")
                raise
                                
        except requests.exceptions.RequestException as e:
            logger.error(f"LM Studio HTTP request failed: {e}")
            raise
        except Exception as e:
            logger.error(f"LM Studio streaming processing failed: {e}")
            raise
    
    def _custom_streaming_request(self, user_message, history=None):
        """Make streaming request to custom API - modify as needed."""
        # Fallback to non-streaming for custom APIs
        response = self._custom_request(user_message, history)
        yield response