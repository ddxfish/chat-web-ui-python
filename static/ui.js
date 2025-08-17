// static/ui.js

const chatContainer = document.getElementById('chat-container');
const messageTemplate = document.getElementById('message-template');
const statusMessageTemplate = document.getElementById('status-message-template');

// Helper functions
const scrollToBottom = () => chatContainer.scrollTop = chatContainer.scrollHeight;
const handleAvatarError = (img) => img.style.display = 'none';
const createParagraph = (text = '') => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
};

const setupToolbar = (messageClone, role, messageIndex = null, totalMessages = null) => {
    const toolbar = messageClone.querySelector('.message-toolbar');
    const trashBtn = toolbar.querySelector('.trash-btn');
    const regenerateBtn = toolbar.querySelector('.regenerate-btn');
    const editBtn = toolbar.querySelector('.edit-btn');
    
    // Set data attributes for all buttons
    if (messageIndex !== null) {
        [trashBtn, regenerateBtn, editBtn].forEach(btn => {
            btn.dataset.messageIndex = messageIndex;
        });
        
        // Calculate message pairs for trash button title (both user and assistant)
        const total = totalMessages || chatContainer.querySelectorAll('.message').length;
        const messagesToDelete = total - messageIndex;
        const messagePairsToDelete = Math.ceil(messagesToDelete / 2);
        trashBtn.title = `Delete from here (${messagesToDelete} message${messagesToDelete === 1 ? '' : 's'}, ${messagePairsToDelete} pair${messagePairsToDelete === 1 ? '' : 's'})`;
    }
    
    return toolbar;
};

const createMessage = (role, content, messageIndex = null, totalMessages = null) => {
    const messageClone = messageTemplate.content.cloneNode(true);
    const messageDiv = messageClone.querySelector('.message');
    const avatarImg = messageClone.querySelector('.avatar');
    const contentDiv = messageClone.querySelector('.message-content');

    messageDiv.classList.add(role);
    avatarImg.src = role === 'user' ? '/static/user.jpg' : '/static/assistant.png';
    avatarImg.onerror = () => handleAvatarError(avatarImg);

    // Setup toolbar
    setupToolbar(messageClone, role, messageIndex, totalMessages);

    if (typeof content === 'string') {
        renderMessageContent(contentDiv, content);
    } else if (content) {
        contentDiv.appendChild(content);
    }

    return { messageClone, contentDiv, messageDiv };
};

const safeExecute = (fn, errorMsg) => {
    try {
        return fn();
    } catch (error) {
        console.error(`Error ${errorMsg}:`, error);
        renderError(`Failed to ${errorMsg}`);
    }
};

export const renderError = (errorMessage) => {
    const { messageClone } = createMessage('error');
    const contentDiv = messageClone.querySelector('.message-content');
    const avatarImg = messageClone.querySelector('.avatar');
    
    avatarImg.src = `https://placehold.co/32x32/ef5350/ffffff?text=⚠️`;
    contentDiv.textContent = errorMessage;
    chatContainer.appendChild(messageClone);
    scrollToBottom();
};

export const renderHistory = (history) => {
    safeExecute(() => {
        chatContainer.innerHTML = '';
        
        if (!Array.isArray(history)) {
            console.error('Invalid history data:', history);
            return;
        }
        
        const totalMessages = history.length;
        
        history.forEach((msg, index) => {
            if (!msg?.role || !msg.hasOwnProperty('content')) return;
            
            const { messageClone } = createMessage(msg.role, msg.content, index, totalMessages);
            chatContainer.appendChild(messageClone);
        });
        
        scrollToBottom();
    }, 'render chat history');
};

const createThinkAccordion = (thinkContent, stepNumber) => {
    const details = document.createElement('details');
    details.style.cssText = `
        margin: 0.5em 0; border: 1px dashed var(--border-color); border-radius: 6px;
        padding: 0.3em 0.6em; background-color: rgba(0,0,0,0.2);
    `;
    
    const summary = document.createElement('summary');
    summary.style.cssText = `cursor: pointer; font-weight: bold; font-size: 0.85rem; user-select: none;`;
    summary.innerHTML = `🧠 Think (Step ${stepNumber})`;
    
    const content = document.createElement('div');
    content.style.cssText = `
        padding-top: 0.5em; white-space: pre-wrap; font-size: 0.9em; 
        color: #ccc; line-height: 1.4;
    `;
    content.textContent = thinkContent;
    
    details.appendChild(summary);
    details.appendChild(content);
    return details;
};

const renderMessageContent = (contentDiv, content) => {
    const thinkPattern = /<think>(.*?)<\/think>/gs;
    let match, lastIndex = 0, thinkCount = 0;
    
    contentDiv.innerHTML = '';
    
    while ((match = thinkPattern.exec(content)) !== null) {
        const beforeText = content.slice(lastIndex, match.index).trim();
        if (beforeText) contentDiv.appendChild(createParagraph(beforeText));
        
        contentDiv.appendChild(createThinkAccordion(match[1].trim(), ++thinkCount));
        lastIndex = match.index + match[0].length;
    }
    
    const afterText = content.slice(lastIndex).trim();
    if (afterText) {
        contentDiv.appendChild(createParagraph(afterText));
    } else if (thinkCount === 0 && content.trim()) {
        contentDiv.appendChild(createParagraph(content));
    }
};

// Streaming state
let currentStreamingMessage = null;
let streamingContent = '';
let streamingState = {
    inThink: false, thinkBuffer: '', thinkCount: 0,
    currentThinkAccordion: null, currentParagraph: null, processedIndex: 0
};

const resetStreamingState = (paragraph = null) => {
    streamingState = {
        inThink: false, thinkBuffer: '', thinkCount: 0,
        currentThinkAccordion: null, currentParagraph: paragraph, processedIndex: 0
    };
};

export const addUserMessage = (content) => {
    // Calculate proper message index for this new message
    const currentMessageCount = chatContainer.querySelectorAll('.message').length;
    const totalMessages = currentMessageCount + 1; // Include this new message
    
    const { messageClone } = createMessage('user', createParagraph(content), currentMessageCount, totalMessages);
    chatContainer.appendChild(messageClone);
    scrollToBottom();
};

export const startStreamingMessage = () => {
    const { messageClone, contentDiv, messageDiv } = createMessage('assistant');
    messageDiv.id = 'streaming-message';

    const p = createParagraph();
    contentDiv.appendChild(p);
    
    currentStreamingMessage = { element: contentDiv, paragraph: p };
    streamingContent = '';
    resetStreamingState(p);
    
    chatContainer.appendChild(messageClone);
    scrollToBottom();
    return contentDiv;
};

export const appendToStreamingMessage = (chunk) => {
    if (!currentStreamingMessage) return;
    
    streamingContent += chunk;
    const newContent = streamingContent.slice(streamingState.processedIndex);
    let processingIndex = 0;
    
    while (processingIndex < newContent.length) {
        if (!streamingState.inThink) {
            const thinkStart = newContent.indexOf('<think>', processingIndex);
            
            if (thinkStart === -1) {
                streamingState.currentParagraph.textContent += newContent.slice(processingIndex);
                break;
            } else {
                streamingState.currentParagraph.textContent += newContent.slice(processingIndex, thinkStart);
                streamingState.inThink = true;
                streamingState.thinkCount++;
                streamingState.thinkBuffer = '';
                
                const accordion = createThinkAccordion('', streamingState.thinkCount);
                accordion.open = false;
                streamingState.currentThinkAccordion = accordion.querySelector('div');
                currentStreamingMessage.element.appendChild(accordion);
                
                processingIndex = thinkStart + 7;
            }
        } else {
            const thinkEnd = newContent.indexOf('</think>', processingIndex);
            
            if (thinkEnd === -1) {
                streamingState.thinkBuffer += newContent.slice(processingIndex);
                if (streamingState.currentThinkAccordion) {
                    streamingState.currentThinkAccordion.textContent = streamingState.thinkBuffer;
                }
                break;
            } else {
                streamingState.thinkBuffer += newContent.slice(processingIndex, thinkEnd);
                if (streamingState.currentThinkAccordion) {
                    streamingState.currentThinkAccordion.textContent = streamingState.thinkBuffer;
                }
                
                streamingState.inThink = false;
                streamingState.currentThinkAccordion = null;
                
                const newParagraph = createParagraph();
                currentStreamingMessage.element.appendChild(newParagraph);
                streamingState.currentParagraph = newParagraph;
                
                processingIndex = thinkEnd + 8;
            }
        }
    }
    
    streamingState.processedIndex = streamingContent.length;
    scrollToBottom();
};

export const finishStreamingMessage = () => {
    if (!currentStreamingMessage) return;
    
    const streamingMsg = document.getElementById('streaming-message');
    if (streamingMsg) {
        streamingMsg.removeAttribute('id');
        
        // Update toolbar with proper message index
        const allMessages = chatContainer.querySelectorAll('.message');
        const messageIndex = allMessages.length - 1;
        const totalMessages = allMessages.length;
        
        setupToolbar(streamingMsg, 'assistant', messageIndex, totalMessages);
    }
    
    currentStreamingMessage = null;
    streamingContent = '';
    resetStreamingState();
    scrollToBottom();
};

export const cancelStreamingMessage = () => {
    const streamingMsg = document.getElementById('streaming-message');
    if (streamingMsg) streamingMsg.remove();
    
    currentStreamingMessage = null;
    streamingContent = '';
    resetStreamingState();
};

export const showStatusMessage = () => {
    safeExecute(() => {
        const statusMessage = statusMessageTemplate.content.cloneNode(true);
        chatContainer.appendChild(statusMessage);
        scrollToBottom();
    }, 'show status message');
};

export const removeStatusMessage = () => {
    safeExecute(() => {
        const statusEl = document.getElementById('status-message');
        if (statusEl) statusEl.remove();
    }, 'remove status message');
};

export const updateStatusText = (text) => {
    safeExecute(() => {
        const statusMessage = document.getElementById('status-message');
        const statusTextEl = statusMessage?.querySelector('.status-text');
        if (statusTextEl) statusTextEl.textContent = text;
    }, 'update status text');
};