// static/ui.js

const chatContainer = document.getElementById('chat-container');
const messageTemplate = document.getElementById('message-template');
const statusMessageTemplate = document.getElementById('status-message-template');
const continueButtonTemplate = document.getElementById('continue-button-template');

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
    avatarImg.src = role === 'user' ? '/static/user.png' : '/static/assistant.png';
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

// Continue button management
export const showContinueButton = (lastMessageIndex) => {
    // Remove existing continue button
    removeContinueButton();
    
    const continueButtonClone = continueButtonTemplate.content.cloneNode(true);
    const continueBtn = continueButtonClone.querySelector('.continue-btn');
    
    // Set the message index for the continue button
    continueBtn.dataset.messageIndex = lastMessageIndex;
    
    chatContainer.appendChild(continueButtonClone);
    scrollToBottom();
};

export const removeContinueButton = () => {
    const existingButton = document.getElementById('continue-button-container');
    if (existingButton) {
        existingButton.remove();
    }
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
        
        // FIX: Always update toolbar indexes after rendering
        updateAllToolbarIndexes();
        
        // Check if we should show the continue button
        const shouldShowContinue = history.length > 0 && 
                                 history[history.length - 1].role === 'user' && 
                                 !document.getElementById('streaming-message');
        
        if (shouldShowContinue) {
            showContinueButton(history.length - 1);
        } else {
            removeContinueButton();
        }
        
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

// Edit state management
let currentlyEditing = null;

const createEditControls = (originalContent, onSave, onDiscard) => {
    const container = document.createElement('div');
    container.className = 'edit-container';
    container.style.cssText = `
        background: var(--user-bg);
        padding: 1rem;
        border: 2px solid #4caf50;
        border-radius: 8px;
        margin: 0.5rem 0;
    `;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = originalContent;
    textarea.style.cssText = `
        width: 100%; min-height: 80px; max-height: 200px;
        padding: 0.6rem; border: 1px solid var(--border-color); border-radius: 6px;
        background: var(--bg-color); color: var(--text-color);
        font-family: inherit; font-size: 15px; line-height: 1.5;
        resize: vertical; box-sizing: border-box;
    `;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex; gap: 0.5rem; margin-top: 0.5rem; justify-content: flex-end;
    `;
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'edit-save-btn';
    saveBtn.style.cssText = `
        padding: 0.6rem 1rem; border: none; border-radius: 4px;
        background: #4caf50; color: white; cursor: pointer; font-size: 14px;
        font-weight: bold;
    `;
    
    const discardBtn = document.createElement('button');
    discardBtn.textContent = 'Discard';
    discardBtn.className = 'edit-discard-btn';
    discardBtn.style.cssText = `
        padding: 0.6rem 1rem; border: 1px solid var(--border-color); border-radius: 4px;
        background: var(--button-bg); color: var(--text-color); cursor: pointer; font-size: 14px;
        font-weight: bold;
    `;
    
    saveBtn.onclick = () => onSave(textarea.value.trim());
    discardBtn.onclick = onDiscard;
    
    buttonContainer.appendChild(saveBtn);
    buttonContainer.appendChild(discardBtn);
    container.appendChild(textarea);
    container.appendChild(buttonContainer);
    
    // Auto-focus and select text
    setTimeout(() => {
        textarea.focus();
        textarea.select();
    }, 100);
    
    return container;
};

export const startEditingMessage = (messageElement, messageIndex, currentContent, role) => {
    if (currentlyEditing) {
        console.log('Already editing a message');
        return;
    }
    
    const contentDiv = messageElement.querySelector('.message-wrapper .message-content');
    if (!contentDiv) {
        console.error('Could not find message content div');
        return;
    }
    
    // Store original content and state
    currentlyEditing = {
        messageIndex,
        role,
        originalContent: currentContent,
        originalContentHTML: contentDiv.innerHTML,
        messageElement,
        contentDiv
    };
    
    const onSave = async (newContent) => {
        if (!newContent) {
            alert('Content cannot be empty');
            return;
        }
        
        try {
            // Trigger save event with the new content
            const saveEvent = new CustomEvent('messageSave', {
                detail: { messageIndex, newContent, role }
            });
            document.dispatchEvent(saveEvent);
            
        } catch (error) {
            console.error('Error saving message:', error);
            alert('Failed to save message');
        }
    };
    
    const onDiscard = () => {
        finishEditingMessage(false);
    };
    
    // Replace content with edit controls
    const editControls = createEditControls(currentContent, onSave, onDiscard);
    contentDiv.innerHTML = '';
    contentDiv.appendChild(editControls);
    
    // Hide toolbar during edit
    const toolbar = messageElement.querySelector('.message-wrapper .message-toolbar');
    if (toolbar) toolbar.style.display = 'none';
};

export const finishEditingMessage = (success = true) => {
    if (!currentlyEditing) return;
    
    const { contentDiv, originalContentHTML, messageElement } = currentlyEditing;
    
    if (!success) {
        // Restore original content
        contentDiv.innerHTML = originalContentHTML;
    }
    
    // Show toolbar again
    const toolbar = messageElement.querySelector('.message-wrapper .message-toolbar');
    if (toolbar) toolbar.style.display = '';
    
    currentlyEditing = null;
};

export const isCurrentlyEditing = () => currentlyEditing !== null;

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

// Helper function to update all toolbar indexes after changes
const updateAllToolbarIndexes = () => {
    const allMessages = chatContainer.querySelectorAll('.message');
    const totalMessages = allMessages.length;
    
    allMessages.forEach((messageElement, index) => {
        const toolbar = messageElement.querySelector('.message-toolbar');
        if (toolbar) {
            const trashBtn = toolbar.querySelector('.trash-btn');
            const regenerateBtn = toolbar.querySelector('.regenerate-btn');
            const editBtn = toolbar.querySelector('.edit-btn');
            
            // Update all button indexes
            [trashBtn, regenerateBtn, editBtn].forEach(btn => {
                if (btn) btn.dataset.messageIndex = index;
            });
            
            // Update trash button title
            if (trashBtn) {
                const messagesToDelete = totalMessages - index;
                const messagePairsToDelete = Math.ceil(messagesToDelete / 2);
                trashBtn.title = `Delete from here (${messagesToDelete} message${messagesToDelete === 1 ? '' : 's'}, ${messagePairsToDelete} pair${messagePairsToDelete === 1 ? '' : 's'})`;
            }
        }
    });
};

// Export so other modules can call it when needed
export const forceUpdateToolbarIndexes = () => updateAllToolbarIndexes();

export const addUserMessage = (content) => {
    // Remove continue button when adding new message
    removeContinueButton();
    
    // Calculate proper message index for this new message
    const currentMessageCount = chatContainer.querySelectorAll('.message').length;
    const totalMessages = currentMessageCount + 1; // Include this new message
    
    const { messageClone } = createMessage('user', createParagraph(content), currentMessageCount, totalMessages);
    chatContainer.appendChild(messageClone);
    scrollToBottom();
};

export const startStreamingMessage = () => {
    // Remove continue button when starting to stream
    removeContinueButton();
    
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
                let textToAdd = newContent.slice(processingIndex);
                // FIX: Aggressively trim leading whitespace if paragraph is empty
                if (streamingState.currentParagraph.textContent === '') {
                    textToAdd = textToAdd.replace(/^\s+/, '');
                }
                streamingState.currentParagraph.textContent += textToAdd;
                break;
            } else {
                let textToAdd = newContent.slice(processingIndex, thinkStart);
                // FIX: Aggressively trim leading whitespace if paragraph is empty
                if (streamingState.currentParagraph.textContent === '') {
                    textToAdd = textToAdd.replace(/^\s+/, '');
                }
                streamingState.currentParagraph.textContent += textToAdd;
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
                
                // FIX: Skip ALL whitespace after </think> to prevent extra spacing
                let skipIndex = thinkEnd + 8;
                while (skipIndex < newContent.length && /\s/.test(newContent[skipIndex])) {
                    skipIndex++;
                }
                processingIndex = skipIndex;
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
    }
    
    // FIX: Update ALL toolbar indexes after streaming completes
    updateAllToolbarIndexes();
    
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