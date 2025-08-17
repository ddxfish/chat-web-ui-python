# -*- coding: utf-8 -*-
# main.py
# Standalone chat web interface

from flask import Flask, render_template, request, jsonify, Response
import logging
import json
import sys
import config
from chat_backend import ChatBackend
from chat_history import ChatHistory

app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize components
chat_backend = ChatBackend()
chat_history = ChatHistory()

@app.after_request
def after_request(response):
    """Ensure all responses have proper UTF-8 charset"""
    if response.content_type.startswith('text/'):
        response.charset = 'utf-8'
    return response

@app.route('/')
def index():
    """Serves the main chat interface."""
    response = Response(render_template('index.html'))
    response.headers['Content-Type'] = 'text/html; charset=utf-8'
    return response

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get chat history."""
    try:
        history = chat_history.get_history()
        response = jsonify(history)
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        return jsonify({"error": "Failed to get chat history"}), 500

@app.route('/api/chat', methods=['POST'])
def post_chat():
    """Send message to LLM and get response."""
    try:
        data = request.json
        user_message = data.get('text', '').strip()
        
        if not user_message:
            return jsonify({"error": "Empty message"}), 400
        
        # Add user message to history
        chat_history.add_message('user', user_message)
        
        # Get LLM response
        history = chat_history.get_history()
        response = chat_backend.get_response(user_message, history)
        
        # Add assistant response to history
        chat_history.add_message('assistant', response)
        
        return jsonify({"status": "success"})
        
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        return jsonify({"error": f"Chat failed: {str(e)}"}), 500

@app.route('/api/chat/stream', methods=['POST'])
def post_chat_stream():
    """Send message to LLM and get streaming response."""
    try:
        data = request.json
        user_message = data.get('text', '').strip()
        
        if not user_message:
            return jsonify({"error": "Empty message"}), 400
        
        # Get current history (don't add user message yet - frontend will handle display)
        history = chat_history.get_history()
        
        def generate():
            try:
                logger.info("=== FLASK STREAMING START ===")
                logger.info(f"User message: {user_message[:100]}{'...' if len(user_message) > 100 else ''}")
                
                full_response = ""
                chunk_count = 0
                
                for chunk in chat_backend.get_streaming_response(user_message, history):
                    if chunk:
                        chunk_count += 1
                        full_response += chunk
                        
                        if chunk_count <= 5 or chunk_count % 10 == 0:  # Log first few and every 10th
                            logger.info(f"Flask yielding chunk {chunk_count}: '{chunk[:30]}{'...' if len(chunk) > 30 else ''}'")
                        
                        # Send chunk and force flush
                        chunk_data = f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                        yield chunk_data.encode('utf-8')
                        sys.stdout.flush()  # Force flush to client
                
                logger.info(f"=== FLASK STREAMING COMPLETE ===")
                logger.info(f"Total chunks: {chunk_count}, Final response length: {len(full_response)}")
                
                # Now add both messages to history
                chat_history.add_message('user', user_message)
                chat_history.add_message('assistant', full_response)
                
                # Send completion signal
                completion_data = f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
                yield completion_data.encode('utf-8')
                sys.stdout.flush()
                
            except Exception as e:
                logger.error(f"=== FLASK STREAMING ERROR ===")
                logger.error(f"Error: {e}")
                error_data = f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
                yield error_data.encode('utf-8')
                sys.stdout.flush()
        
        return Response(
            generate(),
            mimetype='text/event-stream; charset=utf-8',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'X-Accel-Buffering': 'no',  # Disable nginx buffering
                'Content-Type': 'text/event-stream; charset=utf-8'
            }
        )
        
    except Exception as e:
        logger.error(f"Error in streaming chat: {e}")
        return jsonify({"error": f"Streaming chat failed: {str(e)}"}), 500

@app.route('/api/history/messages/<int:index>', methods=['PUT'])
def update_message(index):
    """Update a specific message in history."""
    try:
        data = request.json
        new_content = data.get('content', '').strip()
        
        if not new_content:
            return jsonify({"error": "Empty content"}), 400
        
        history = chat_history.get_history()
        
        if not (0 <= index < len(history)):
            return jsonify({"error": "Invalid message index"}), 400
        
        # Update the message content
        history[index]['content'] = new_content
        chat_history._save_history(history)
        
        logger.info(f"Updated message {index}: {new_content[:50]}...")
        return jsonify({"status": "success", "message": "Message updated"})
        
    except Exception as e:
        logger.error(f"Error updating message: {e}")
        return jsonify({"error": "Failed to update message"}), 500

@app.route('/api/reset', methods=['POST'])
def post_reset():
    """Reset chat history."""
    try:
        chat_history.clear_history()
        return jsonify({"status": "success", "message": "Chat history cleared"})
    except Exception as e:
        logger.error(f"Error resetting chat: {e}")
        return jsonify({"error": "Failed to reset chat"}), 500

@app.route('/api/history/messages', methods=['DELETE'])
def delete_history_messages():
    """Delete last N messages from history."""
    try:
        data = request.json
        count = data.get('count', 1)
        
        deleted = chat_history.delete_last_messages(count)
        return jsonify({"status": "success", "deleted": deleted})
        
    except Exception as e:
        logger.error(f"Error deleting messages: {e}")
        return jsonify({"error": "Failed to delete messages"}), 500

@app.route('/api/health', methods=['GET'])
def get_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "backend": config.LLM_BACKEND})

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)