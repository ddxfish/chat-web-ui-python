# -*- coding: utf-8 -*-
# main.py
# Standalone chat web interface with session management

from flask import Flask, render_template, request, jsonify, Response
import logging
import json
import sys
import config
from chat_backend import ChatBackend
from chat_session_manager import ChatSessionManager

app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize components
chat_backend = ChatBackend()
session_manager = ChatSessionManager()

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

# Session Management API
@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Get list of all chat sessions."""
    try:
        sessions = session_manager.list_sessions()
        active_id = session_manager.active_session_id
        
        response = jsonify({
            "sessions": sessions,
            "active_session": active_id
        })
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    except Exception as e:
        logger.error(f"Error getting sessions: {e}")
        return jsonify({"error": "Failed to get sessions"}), 500

@app.route('/api/sessions', methods=['POST'])
def create_session():
    """Create a new chat session."""
    try:
        data = request.json or {}
        system_prompt = data.get('system_prompt')
        
        session_id = session_manager.create_new_session(system_prompt)
        return jsonify({"session_id": session_id, "status": "success"})
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        return jsonify({"error": "Failed to create session"}), 500

@app.route('/api/sessions/<session_id>/activate', methods=['POST'])
def activate_session(session_id):
    """Activate a specific session."""
    try:
        session_data = session_manager.load_session(session_id)
        return jsonify({"status": "success", "session": session_data})
    except FileNotFoundError:
        return jsonify({"error": "Session not found"}), 404
    except Exception as e:
        logger.error(f"Error activating session {session_id}: {e}")
        return jsonify({"error": "Failed to activate session"}), 500

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a specific session."""
    try:
        session_manager.delete_session(session_id)
        return jsonify({"status": "success"})
    except FileNotFoundError:
        return jsonify({"error": "Session not found"}), 404
    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {e}")
        return jsonify({"error": "Failed to delete session"}), 500

@app.route('/api/sessions/<session_id>/name', methods=['PUT'])
def update_session_name(session_id):
    """Update session name."""
    try:
        data = request.json
        new_name = data.get('name', '').strip()
        
        if not new_name:
            return jsonify({"error": "Empty name"}), 400
        
        session_manager.update_session_name(session_id, new_name, rename_file=config.USE_NAMED_FILES)
        return jsonify({"status": "success"})
    except FileNotFoundError:
        return jsonify({"error": "Session not found"}), 404
    except Exception as e:
        logger.error(f"Error updating session name: {e}")
        return jsonify({"error": "Failed to update session name"}), 500

# Chat History API (now session-aware)
@app.route('/api/history', methods=['GET'])
def get_history():
    """Get chat history for active session."""
    try:
        if not session_manager.has_active_session():
            return jsonify([])  # Return empty array if no active session
        
        messages = session_manager.get_messages()
        response = jsonify(messages)
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        return jsonify({"error": "Failed to get chat history"}), 500

@app.route('/api/chat', methods=['POST'])
def post_chat():
    """Send message to LLM and get response."""
    try:
        if not session_manager.has_active_session():
            return jsonify({"error": "No active session. Create a new chat first."}), 400
        
        data = request.json
        user_message = data.get('text', '').strip()
        
        if not user_message:
            return jsonify({"error": "Empty message"}), 400
        
        # Add user message to active session
        session_manager.add_message('user', user_message)
        
        # Get LLM response using session's system prompt and history
        messages = session_manager.get_messages()
        system_prompt = session_manager.get_system_prompt()
        
        # Build message context for LLM (inject session's system prompt)
        response = chat_backend.get_response_with_system_prompt(user_message, messages, system_prompt)
        
        # Add assistant response to session
        session_manager.add_message('assistant', response)
        
        # Auto-name session if this is the first exchange
        session = session_manager.get_active_session()
        if config.AUTO_NAME_SESSIONS and len(messages) == 2 and session['name'] == session['id']:
            _schedule_session_naming(session['id'], user_message)
        
        return jsonify({"status": "success"})
        
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        return jsonify({"error": f"Chat failed: {str(e)}"}), 500

@app.route('/api/chat/stream', methods=['POST'])
def post_chat_stream():
    """Send message to LLM and get streaming response."""
    try:
        if not session_manager.has_active_session():
            return jsonify({"error": "No active session. Create a new chat first."}), 400
        
        data = request.json
        user_message = data.get('text', '').strip()
        
        if not user_message:
            return jsonify({"error": "Empty message"}), 400
        
        # Get current session state (don't add user message yet - frontend handles display)
        messages = session_manager.get_messages()
        system_prompt = session_manager.get_system_prompt()
        
        def generate():
            try:
                logger.info("=== FLASK STREAMING START ===")
                logger.info(f"User message: {user_message[:100]}{'...' if len(user_message) > 100 else ''}")
                
                full_response = ""
                chunk_count = 0
                
                for chunk in chat_backend.get_streaming_response_with_system_prompt(user_message, messages, system_prompt):
                    if chunk:
                        chunk_count += 1
                        full_response += chunk
                        
                        if chunk_count <= 5 or chunk_count % 10 == 0:
                            logger.info(f"Flask yielding chunk {chunk_count}: '{chunk[:30]}{'...' if len(chunk) > 30 else ''}'")
                        
                        chunk_data = f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                        yield chunk_data.encode('utf-8')
                        sys.stdout.flush()
                
                logger.info(f"=== FLASK STREAMING COMPLETE ===")
                logger.info(f"Total chunks: {chunk_count}, Final response length: {len(full_response)}")
                
                # Now add both messages to session
                session_manager.add_message('user', user_message)
                session_manager.add_message('assistant', full_response)
                
                # Auto-name session if this is the first exchange
                current_messages = session_manager.get_messages()
                session = session_manager.get_active_session()
                if config.AUTO_NAME_SESSIONS and len(current_messages) == 2 and session['name'] == session['id']:
                    _schedule_session_naming(session['id'], user_message)
                
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
                'X-Accel-Buffering': 'no',
                'Content-Type': 'text/event-stream; charset=utf-8'
            }
        )
        
    except Exception as e:
        logger.error(f"Error in streaming chat: {e}")
        return jsonify({"error": f"Streaming chat failed: {str(e)}"}), 500

@app.route('/api/history/messages/<int:index>', methods=['PUT'])
def update_message(index):
    """Update a specific message in active session."""
    try:
        if not session_manager.has_active_session():
            return jsonify({"error": "No active session"}), 400
        
        data = request.json
        new_content = data.get('content', '').strip()
        
        if not new_content:
            return jsonify({"error": "Empty content"}), 400
        
        session_manager.update_message(index, new_content)
        
        logger.info(f"Updated message {index}: {new_content[:50]}...")
        return jsonify({"status": "success", "message": "Message updated"})
        
    except IndexError:
        return jsonify({"error": "Invalid message index"}), 400
    except Exception as e:
        logger.error(f"Error updating message: {e}")
        return jsonify({"error": "Failed to update message"}), 500

@app.route('/api/reset', methods=['POST'])
def post_reset():
    """Reset active session (clear messages)."""
    try:
        if not session_manager.has_active_session():
            return jsonify({"error": "No active session"}), 400
        
        session_manager.clear_session()
        return jsonify({"status": "success", "message": "Session cleared"})
    except Exception as e:
        logger.error(f"Error resetting session: {e}")
        return jsonify({"error": "Failed to reset session"}), 500

@app.route('/api/history/messages', methods=['DELETE'])
def delete_history_messages():
    """Delete last N messages from active session."""
    try:
        if not session_manager.has_active_session():
            return jsonify({"error": "No active session"}), 400
        
        data = request.json
        count = data.get('count', 1)
        
        deleted = session_manager.delete_last_messages(count)
        return jsonify({"status": "success", "deleted": deleted})
        
    except Exception as e:
        logger.error(f"Error deleting messages: {e}")
        return jsonify({"error": "Failed to delete messages"}), 500

@app.route('/api/health', methods=['GET'])
def get_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "backend": config.LLM_BACKEND})

def _schedule_session_naming(session_id, first_user_message):
    """Schedule AI naming for session (background task)."""
    import threading
    
    def name_session():
        try:
            logger.info(f"Starting AI naming for session {session_id}")
            
            # Get AI to generate a name using the simple response method
            naming_prompt = f"{config.NAMING_PROMPT} {first_user_message}"
            name_response = chat_backend.get_simple_response(naming_prompt)
            
            # Clean up the response
            clean_name = name_response.strip().strip('"\'.,!?').strip()
            word_count = len(clean_name.split())
            
            logger.info(f"AI naming raw response: '{name_response}'")
            logger.info(f"AI naming cleaned: '{clean_name}' ({word_count} words)")
            
            # Validate the name
            if 1 <= word_count <= 4 and len(clean_name) <= 50:
                session_manager.update_session_name(session_id, clean_name, rename_file=config.USE_NAMED_FILES)
                logger.info(f"AI successfully named session {session_id}: '{clean_name}'")
            else:
                logger.warning(f"AI name rejected (too long/short): '{clean_name}' - keeping timestamp")
                
        except Exception as e:
            logger.warning(f"Failed to auto-name session {session_id}: {e}")
    
    # Run in background thread
    thread = threading.Thread(target=name_session, daemon=True)
    thread.start()

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)