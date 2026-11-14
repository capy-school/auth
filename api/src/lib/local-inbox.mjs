/**
 * @typedef {{email: string, url: string, expiresAt: number}} Message
 * @param {{now?: () => number, limit?: number, ttl?: number, read?: () => Message[], write?: (messages: Message[]) => void}} options
 */
export function createInbox({ now = Date.now, limit = 20, ttl = 300_000, read, write } = {}) {
  let messages = [];
  const list = () => {
    messages = (read ? read() : messages).filter(message => message.expiresAt > now()).slice(0, limit);
    return messages.map(message => ({ ...message }));
  };
  return {
    list,
    add({ email, url }) {
      messages = [{ email, url, expiresAt: now() + ttl }, ...list()].slice(0, limit);
      write?.(messages);
    },
  };
}
