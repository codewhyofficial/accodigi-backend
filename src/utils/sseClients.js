/**
 * Server-Sent Events (SSE) client manager.
 * Tracks connected frontend clients per clientId so we can push
 * real-time updates when webhooks arrive (new messages, status changes).
 */

// Map: clientId → Set of SSE response objects
const clients = new Map();

/**
 * Register an SSE connection for a given clientId
 */
export const addClient = (clientId, res) => {
    if (!clients.has(clientId)) {
        clients.set(clientId, new Set());
    }
    clients.get(clientId).add(res);
    console.log(`📡 SSE client connected for ${clientId} (total: ${clients.get(clientId).size})`);
};

/**
 * Remove an SSE connection when the client disconnects
 */
export const removeClient = (clientId, res) => {
    if (clients.has(clientId)) {
        clients.get(clientId).delete(res);
        if (clients.get(clientId).size === 0) {
            clients.delete(clientId);
        }
        console.log(`📡 SSE client disconnected for ${clientId}`);
    }
};

/**
 * Push an event to all connected SSE clients for a given clientId
 * @param {string} clientId - The DB client ID
 * @param {string} event - Event name (e.g., 'new_message', 'status_update')
 * @param {object} data - Data to send
 */
export const pushEvent = (clientId, event, data) => {
    if (!clients.has(clientId)) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const res of clients.get(clientId)) {
        res.write(payload);
    }
};
