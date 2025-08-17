# main.py
# Standalone chat web interface

from flask import Flask, render_template, request, jsonify
import logging
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

@app.route('/')
def index():
    """Serves the main chat interface."""
    return render_template('index.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get chat history."""
    try:
        history = chat_history.get_history()
        return jsonify(history)
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