import { emitToUser } from '../../realtime/index.js';
import { peerOf } from './chat.service.js';

const ID = /^[a-f0-9]{24}$/;

/** Live-only chat signals. Messages themselves are sent over REST so they are always saved. */
export const registerChatSocket = (socket) => {
  socket.on('chat:typing', async ({ conversationId } = {}) => {
    if (!ID.test(String(conversationId))) return;
    const peer = await peerOf(socket.data.userId, conversationId);
    if (peer) emitToUser(peer, 'chat:typing', { conversationId, userId: socket.data.userId });
  });
};
