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
        
        logger.info(f"GET /api/sessions - Found {len(sessions)} sessions, active: {active_id}")
        
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
        logger.info(f"POST /api/sessions - Created session: {session_id}")
        return jsonify({"session_id": session_id, "status": "success"})
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        return jsonify({"error": "Failed to create session"}), 500

@app.route('/api/sessions/<session_id>/activate', methods=['POST'])
def activate_session(session_id):
    """Activate a specific session."""
    try:
        session_data = session_manager.load_session(session_id)
        logger.info(f"POST /api/sessions/{session_id}/activate - Activated session")
        return jsonify({"status": "success", "session": session_data})
    except FileNotFoundError:
        logger.error(f"Session {session_id} not found")
        return jsonify({"error": "Session not found"}), 404
    except Exception as e:
        logger.error(f"Error activating session {session_id}: {e}")
        return jsonify({"error": "Failed to activate session"}), 500

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a specific session."""
    try:
        session_manager.delete_session(session_id)
        logger.info(f"DELETE /api/sessions/{session_id} - Deleted session")
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
        
        logger.info(f"PUT /api/sessions/{session_id}/name - Updating to: '{new_name}'")
        session_manager.update_session_name(session_id, new_name, rename_file=config.USE_NAMED_FILES)
        logger.info(f"Successfully updated session {session_id} name to: '{new_name}'")
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
        
        logger.info(f"POST /api/chat - User message: '{user_message[:50]}...'")
        
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
        current_messages = session_manager.get_messages()
        session = session_manager.get_active_session()
        
        logger.info(f"Message count: {len(current_messages)}, Session name: '{session['name']}', Session ID: '{session['id']}'")
        
        if config.AUTO_NAME_SESSIONS and len(current_messages) == 2 and session['name'] == session['id']:
            logger.info("*** TRIGGERING AUTO-NAMING ***")
            _schedule_session_naming(session['id'], current_messages[0]['content'], current_messages[1]['content'])
        else:
            logger.info(f"Not auto-naming: AUTO_NAME_SESSIONS={config.AUTO_NAME_SESSIONS}, len={len(current_messages)}, name==id={session['name'] == session['id']}")
        
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
        
        logger.info(f"POST /api/chat/stream - User message: '{user_message[:50]}...'")
        
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
                
                logger.info(f"STREAMING: Message count: {len(current_messages)}, Session name: '{session['name']}', Session ID: '{session['id']}'")
                
                if config.AUTO_NAME_SESSIONS and len(current_messages) == 2 and session['name'] == session['id']:
                    logger.info("*** STREAMING: TRIGGERING AUTO-NAMING ***")
                    _schedule_session_naming(session['id'], current_messages[0]['content'], current_messages[1]['content'])
                else:
                    logger.info(f"STREAMING: Not auto-naming: AUTO_NAME_SESSIONS={config.AUTO_NAME_SESSIONS}, len={len(current_messages)}, name==id={session['name'] == session['id']}")
                
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

def _schedule_session_naming(session_id, user_message, assistant_message):
    """Schedule AI naming for session (background task)."""
    import threading
    
    def name_session():
        try:
            logger.info(f"=== AI NAMING START for session {session_id} ===")
            
            # Create naming prompt with both messages
            conversation_context = f"User: {user_message[:300]}\n\nAssistant: {assistant_message[:300]}"
            naming_prompt = f"{config.NAMING_PROMPT}\n\nConversation:\n{conversation_context}"
            
            logger.info(f"AI naming prompt: '{naming_prompt}'")
            
            name_response = chat_backend.get_simple_response(naming_prompt)
            
            logger.info(f"AI naming raw response: '{name_response}'")
            
            # Extract content after </think> tags if present
            if '</think>' in name_response:
                # Get everything after the last </think> tag
                clean_name = name_response.split('</think>')[-1].strip()
                logger.info(f"Extracted from think tags: '{clean_name}'")
            else:
                clean_name = name_response.strip()
                logger.info(f"No think tags, using full response: '{clean_name}'")
            
            # Clean up the response - remove quotes, periods, etc.
            clean_name = clean_name.strip().strip('"\'.,!?').strip()
            logger.info(f"After cleaning: '{clean_name}'")
            
            # If response already has underscores, use as-is
            if '_' in clean_name:
                parts = clean_name.split('_')
                if len(parts) == 3 and all(part.strip() for part in parts):
                    clean_name = '_'.join(part.strip().lower() for part in parts)
                    logger.info(f"Using underscore format: '{clean_name}'")
                else:
                    # Invalid underscore format, try space-separated
                    clean_name = clean_name.replace('_', ' ')
                    logger.info(f"Invalid underscore format, trying spaces: '{clean_name}'")
            
            # If space-separated, convert to underscores
            if ' ' in clean_name:
                parts = clean_name.split()
                if len(parts) == 3:
                    clean_name = '_'.join(part.strip().lower() for part in parts)
                    logger.info(f"Converted spaces to underscores: '{clean_name}'")
                else:
                    logger.warning(f"AI returned {len(parts)} words instead of 3: '{clean_name}'")
                    # Take first 3 words if more than 3
                    if len(parts) > 3:
                        clean_name = '_'.join(parts[:3])
                        logger.info(f"Truncated to 3 words: '{clean_name}'")
                    else:
                        raise ValueError("Not enough words")
            
            # Final validation
            final_parts = clean_name.split('_')
            logger.info(f"Final parts: {final_parts}")
            
            if len(final_parts) != 3:
                raise ValueError(f"Wrong number of parts: {len(final_parts)}")
            
            if not all(part.replace('-', '').isalnum() for part in final_parts):
                raise ValueError(f"Invalid characters in parts: {final_parts}")
            
            # Ensure each part is reasonable length
            if any(len(part) > 15 or len(part) < 2 for part in final_parts):
                raise ValueError(f"Word length out of bounds: {[len(p) for p in final_parts]}")
            
            logger.info(f"AI naming final: '{clean_name}'")
            
            # Check current session state before updating
            current_session = session_manager.get_active_session()
            if current_session:
                logger.info(f"Current session name before update: '{current_session['name']}'")
            
            # Update session with file renaming
            session_manager.update_session_name(session_id, clean_name, rename_file=config.USE_NAMED_FILES)
            
            # Check session state after updating
            updated_session = session_manager.get_active_session()
            if updated_session:
                logger.info(f"Session name after update: '{updated_session['name']}'")
            
            logger.info(f"=== AI NAMING SUCCESS for session {session_id}: '{clean_name}' ===")
                
        except Exception as e:
            logger.error(f"=== AI NAMING FAILED for session {session_id}: {e} ===")
            logger.error(f"Keeping timestamp name")
            import traceback
            logger.error(traceback.format_exc())
    
    # Run in background thread
    logger.info(f"Scheduling AI naming for session {session_id} in background thread")
    thread = threading.Thread(target=name_session, daemon=True)
    thread.start()

if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)