// static/api.js

const fetchWithHandling = async (url, options = {}, timeoutMs = 60000) => {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = options.signal || timeoutController.signal;
    
    try {
        const response = await fetch(url, { ...options, signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* ignore */ }
            throw new Error(errorMsg);
        }
        
        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
            return await response.json();
        }
        
        return response;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error(options.signal?.aborted ? 'Request cancelled' : `Request timeout after ${timeoutMs/1000}s`);
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network connection failed');
        }
        throw error;
    }
};

export const fetchHistory = () => fetchWithHandling('/api/history');

export const postChatMessage = (prompt) => fetchWithHandling('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt })
});

export const postReset = () => fetchWithHandling('/api/reset', { method: 'POST' });

export const fetchApiHealth = () => fetchWithHandling('/api/health');

export const removeLastMessages = async (count) => {
    return await fetchWithHandling('/api/history/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
    });
};