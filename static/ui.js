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
        const accordion = createThinkAccordion(thinkContent, thinkCount, false);
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
    
    // If no content was added at all (empty content), add empty paragraph
    if (thinkCount === 0 && !afterText && content.trim()) {
        const p = document.createElement('p');
        p.textContent = content;
        contentDiv.appendChild(p);
    }
};

const createThinkAccordion = (thinkContent, stepNumber, isStreaming = false) => {
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
        ${isStreaming ? 'padding-top: 0;' : 'padding-top: 0.5em;'}
        margin: 0;
        white-space: pre-wrap;
        font-size: 0.9em;
        color: #ccc;
        ${isStreaming ? 'min-height: 0;' : ''}
    `;
    content.textContent = thinkContent;
    
    details.appendChild(summary);
    details.appendChild(content);
    
    return details;
};

let currentStreamingMessage = null;
let streamingContent = '';
let streamingState = {
    inThink: false,
    thinkBuffer: '',
    thinkCount: 0,
    currentThinkAccordion: null,
    currentParagraph: null,
    processedIndex: 0
};

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
    
    // Reset streaming state
    streamingState = {
        inThink: false,
        thinkBuffer: '',
        thinkCount: 0,
        currentThinkAccordion: null,
        currentParagraph: p,
        processedIndex: 0
    };
    
    chatContainer.appendChild(messageClone);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return contentDiv;
};

export const appendToStreamingMessage = (chunk) => {
    if (!currentStreamingMessage) return;
    
    streamingContent += chunk;
    
    // Only process the new part from where we left off
    const newContent = streamingContent.slice(streamingState.processedIndex);
    let processingIndex = 0;
    
    while (processingIndex < newContent.length) {
        if (!streamingState.inThink) {
            // Look for opening think tag in new content
            const thinkStart = newContent.indexOf('<think>', processingIndex);
            
            if (thinkStart === -1) {
                // No think tag found, add remaining content to current paragraph
                const textToAdd = newContent.slice(processingIndex);
                streamingState.currentParagraph.textContent += textToAdd;
                processingIndex = newContent.length;
            } else {
                // Found think tag, add content before it to current paragraph
                const beforeThink = newContent.slice(processingIndex, thinkStart);
                streamingState.currentParagraph.textContent += beforeThink;
                
                // Start think mode
                streamingState.inThink = true;
                streamingState.thinkCount++;
                streamingState.thinkBuffer = '';
                
                // Create accordion
                const accordion = createThinkAccordion('', streamingState.thinkCount, true);
                accordion.open = false; // Keep closed while streaming
                streamingState.currentThinkAccordion = accordion.querySelector('div');
                currentStreamingMessage.element.appendChild(accordion);
                
                // Skip past the <think> tag
                processingIndex = thinkStart + 7;
            }
        } else {
            // We're in think mode, look for closing tag
            const thinkEnd = newContent.indexOf('</think>', processingIndex);
            
            if (thinkEnd === -1) {
                // No closing tag yet, add remaining content to think accordion
                const textToAdd = newContent.slice(processingIndex);
                streamingState.thinkBuffer += textToAdd;
                if (streamingState.currentThinkAccordion) {
                    streamingState.currentThinkAccordion.textContent = streamingState.thinkBuffer;
                }
                processingIndex = newContent.length;
            } else {
                // Found closing tag
                const thinkContent = newContent.slice(processingIndex, thinkEnd);
                streamingState.thinkBuffer += thinkContent;
                if (streamingState.currentThinkAccordion) {
                    streamingState.currentThinkAccordion.textContent = streamingState.thinkBuffer;
                }
                
                // Exit think mode and create new paragraph for content after think
                streamingState.inThink = false;
                streamingState.currentThinkAccordion = null;
                
                // Create new paragraph for post-think content
                const newParagraph = document.createElement('p');
                newParagraph.textContent = '';
                currentStreamingMessage.element.appendChild(newParagraph);
                streamingState.currentParagraph = newParagraph;
                
                // Skip past the </think> tag
                processingIndex = thinkEnd + 8;
            }
        }
    }
    
    // Update our processed index
    streamingState.processedIndex = streamingContent.length;
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

export const finishStreamingMessage = () => {
    if (currentStreamingMessage) {
        // If we're still in think mode when finishing, close it
        if (streamingState.inThink && streamingState.currentThinkAccordion) {
            streamingState.inThink = false;
        }
        
        // DON'T re-render - the content was already properly built during streaming
        // The appendToStreamingMessage function already handles think tags and builds proper DOM
        
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
        streamingState = {
            inThink: false,
            thinkBuffer: '',
            thinkCount: 0,
            currentThinkAccordion: null,
            currentParagraph: null,
            processedIndex: 0
        };
        
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
    streamingState = {
        inThink: false,
        thinkBuffer: '',
        thinkCount: 0,
        currentThinkAccordion: null,
        currentParagraph: null,
        processedIndex: 0
    };
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