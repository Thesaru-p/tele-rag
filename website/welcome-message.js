// Shared by the workspace preview and Telegram's /start reply.
function cleanLabel(value, limit) {
  return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');
}

export function welcomeMessageReady(connected, documents) {
  return Boolean(connected && documents.length && documents.every(doc => doc.status === 'ready'));
}

export function buildWelcomeMessage({ businessName, botUsername, documents = [] }) {
  const name = cleanLabel(businessName, 80);
  const username = cleanLabel(botUsername, 40).replace(/^@/, '');
  const greeting = name && name.toLowerCase() !== 'my business'
    ? `Hi! Welcome to ${name}.`
    : username ? `Hi! I’m @${username}, your business assistant.` : 'Hi! Welcome. I’m here to help.';
  const titles = [...new Set(documents.filter(doc => doc.status === 'ready').map(doc =>
    cleanLabel(String(doc.file_name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), 36)
  ).filter(Boolean))].sort().slice(0, 3);
  if (!documents.some(doc => doc.status === 'ready')) {
    return `${greeting} Our team is still getting the information ready. Please check back soon, or contact the team directly for help.`;
  }
  const topics = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}` : titles[0] || 'our business';
  return `${greeting} I can help you find answers about ${topics} using information our team has shared. Send me a question to get started. If I can’t find the answer, I’ll let you know so you can contact the team.`;
}
