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

            // Parse and render content with think tags
            renderMessageContent(contentDiv, msg.content || '');
            chatContainer.appendChild(messageClone);
        });
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (error) {
        console.error('Error rendering history:', error);
        renderError('Failed to render chat history');
    }
};

const renderMessageContent = (contentDiv, content) => {
    // Parse <think> tags
    const thinkPattern = /<think>(.*?)<\/think>/gs;
    let match;
    let lastIndex = 0;
    let thinkCount = 0;
    
    contentDiv.innerHTML = '';
    
    while ((match = thinkPattern.exec(content)) !== null) {
        // Add content before the think tag
        const beforeText = content.slice(lastIndex, match.index).trim();
        if (beforeText) {
            const p = document.createElement('p');
            p.textContent = beforeText;
            contentDiv.appendChild(p);
        }
        
        // Add think accordion
        thinkCount++;
        const thinkContent = match[1].trim();
        const accordion = createThinkAccordion(thinkContent, thinkCount);
        contentDiv.appendChild(accordion);
        
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining content after last think tag
    const afterText = content.slice(lastIndex).trim();
    if (afterText) {
        const p = document.createElement('p');
        p.textContent = afterText;
        contentDiv.appendChild(p);
    }
    
    // If no think tags found, just add the content as text
    if (thinkCount === 0 && content.trim()) {
        const p = document.createElement('p');
        p.textContent = content;
        contentDiv.appendChild(p);
    }
};

const createThinkAccordion = (thinkContent, stepNumber) => {
    const details = document.createElement('details');
    details.style.cssText = `
        margin: 0.5em 0;
        border: 1px dashed var(--border-color);
        border-radius: 6px;
        padding: 0.3em 0.6em;
        background-color: rgba(0,0,0,0.2);
    `;
    
    const summary = document.createElement('summary');
    summary.style.cssText = `
        cursor: pointer;
        font-weight: bold;
        font-size: 0.85rem;
        user-select: none;
    `;
    summary.innerHTML = `🧠 Think (Step ${stepNumber})`;
    
    const content = document.createElement('div');
    content.style.cssText = `
        padding-top: 0.5em;
        margin: 0;
        white-space: pre-wrap;
        font-size: 0.9em;
        color: #ccc;
    `;
    content.textContent = thinkContent;
    
    details.appendChild(summary);
    details.appendChild(content);
    
    return details;
};

let currentStreamingMessage = null;
let streamingContent = '';

export const addUserMessage = (content) => {
    const messageClone = messageTemplate.content.cloneNode(true);
    const messageDiv = messageClone.querySelector('.message');
    const avatarImg = messageClone.querySelector('.avatar');
    const contentDiv = messageClone.querySelector('.message-content');

    messageDiv.classList.add('user');
    avatarImg.src = '/static/user.jpg';
    avatarImg.onerror = () => avatarImg.style.display = 'none';

    const p = document.createElement('p');
    p.textContent = content;
    contentDiv.appendChild(p);
    
    chatContainer.appendChild(messageClone);
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

export const startStreamingMessage = () => {
    // Create a new assistant message for streaming
    const messageClone = messageTemplate.content.cloneNode(true);
    const messageDiv = messageClone.querySelector('.message');
    const avatarImg = messageClone.querySelector('.avatar');
    const contentDiv = messageClone.querySelector('.message-content');

    messageDiv.classList.add('assistant');
    messageDiv.id = 'streaming-message';
    avatarImg.src = '/static/assistant.png';
    avatarImg.onerror = () => avatarImg.style.display = 'none';

    // Add trash icon
    const trashIcon = document.createElement('div');
    trashIcon.className = 'message-trash';
    trashIcon.textContent = '🗑️';
    trashIcon.style.display = 'none'; // Hide during streaming
    messageDiv.appendChild(trashIcon);

    const p = document.createElement('p');
    p.textContent = '';
    contentDiv.appendChild(p);
    
    currentStreamingMessage = { element: contentDiv, paragraph: p };
    streamingContent = '';
    
    chatContainer.appendChild(messageClone);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return contentDiv;
};

export const appendToStreamingMessage = (chunk) => {
    if (currentStreamingMessage) {
        streamingContent += chunk;
        currentStreamingMessage.paragraph.textContent = streamingContent;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
};

export const finishStreamingMessage = () => {
    if (currentStreamingMessage) {
        // Re-render the content with think tag parsing
        renderMessageContent(currentStreamingMessage.element, streamingContent);
        
        // Show trash icon and remove streaming ID
        const streamingMsg = document.getElementById('streaming-message');
        if (streamingMsg) {
            streamingMsg.removeAttribute('id');
            const trashIcon = streamingMsg.querySelector('.message-trash');
            if (trashIcon) {
                trashIcon.style.display = 'flex';
                // Calculate proper message index - count all messages, this will be the last one
                const allMessages = chatContainer.querySelectorAll('.message');
                trashIcon.dataset.messageIndex = allMessages.length - 1;
                trashIcon.title = `Delete from here (1 message pair)`;
            }
        }
        
        currentStreamingMessage = null;
        streamingContent = '';
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
};

export const cancelStreamingMessage = () => {
    const streamingMsg = document.getElementById('streaming-message');
    if (streamingMsg) {
        streamingMsg.remove();
    }
    currentStreamingMessage = null;
    streamingContent = '';
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