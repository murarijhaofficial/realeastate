export function pageHeader(title: string, description: string, action = '') {
  return `<header class="page-header"><div><p class="eyebrow">ESTATEDESK WORKSPACE</p><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
}

export function emptyState(message: string) { return `<div class="empty-state"><span>◇</span><p>${message}</p></div>`; }
