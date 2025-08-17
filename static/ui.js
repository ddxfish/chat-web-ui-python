// static/ui.js

const chatContainer = document.getElementById('chat-container');
const messageTemplate = document.getElementById('message-template');
const statusMessageTemplate = document.getElementById('status-message-template');

export const renderError = (errorMessage) => {
    const messageClone = messageTemplate.content.cloneNode(true);
    const messageDiv = messageClone.querySelector('.message');
    const avatarImg = messageClone.querySelector('.avatar');
    const contentDiv = messageClone.querySelector('.message-content');

    messageDiv.classList.add('error');
    avatarImg.src = `https://placehold.co/32x32/ef5350/ffffff?text=⚠️`;
    contentDiv.textContent = errorMessage;
    chatContainer.appendChild(messageClone);
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

export const renderHistory = (history) => {
    try {
        chatContainer.innerHTML = '';
        
        if (!history || !Array.isArray(history)) {
            console.error('Invalid history data:', history);
            return;
        }
        
        history.forEach((msg, index) => {
            if (!msg || typeof msg !== 'object') {
                console.error('Invalid message at index', index, ':', msg);
                return;
            }
            
            const messageClone = messageTemplate.content.cloneNode(true);
            const messageDiv = messageClone.querySelector('.message');
            const avatarImg = messageClone.querySelector('.avatar');
            const contentDiv = messageClone.querySelector('.message-content');

            messageDiv.classList.add(msg.role || 'unknown');
            avatarImg.src = msg.role === 'user' ? '/static/user.jpg' : '/static/assistant.png';
            avatarImg.onerror = () => avatarImg.style.display = 'none';

            if (msg.role === 'assistant') {
                const trashIcon = document.createElement('div');
                trashIcon.className = 'message-trash';
                trashIcon.textContent = '🗑️';
                
                const messagePairsToDelete = Math.ceil((history.length - index + 1) / 2);
                trashIcon.title = `Delete from here (${messagePairsToDelete} message pairs)`;
                trashIcon.dataset.messageIndex = index;
                messageDiv.appendChild(trashIcon);
            }

            contentDiv.textContent = msg.content || '';
            chatContainer.appendChild(messageClone);
        });
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (error) {
        console.error('Error rendering history:', error);
        renderError('Failed to render chat history');
    }
};

export const showStatusMessage = () => {
    try {
        const statusMessage = statusMessageTemplate.content.cloneNode(true);
        chatContainer.appendChild(statusMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Error showing status message:', error);
    }
};

export const removeStatusMessage = () => {
    try {
        const statusEl = document.getElementById('status-message');
        if (statusEl) statusEl.remove();
    } catch (error) {
        console.error('Error removing status message:', error);
    }
};

export const updateStatusText = (text) => {
    try {
        const statusMessage = document.getElementById('status-message');
        if (statusMessage) {
            const statusTextEl = statusMessage.querySelector('.status-text');
            if (statusTextEl) {
                statusTextEl.textContent = text;
            }
        }
    } catch (error) {
        console.error('Error updating status text:', error);
    }
};