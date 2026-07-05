const fs = require('fs');

const path = 'apps/web/src/components/screens/Dashboard.tsx';
let code = fs.readFileSync(path, 'utf8');

const storeProps = [
  'ghostMode', 'mood', 'notificationSettings', 'showOnboarding',
  'chats', 'contacts', 'messages', 'allStatuses', 'communities', 'safetyReports',
  'selectedContactHash', 'selectedGroupId', 'selectedStatusSenderHash',
  'disappearingTimer', 'displayName', 'editingMessageId', 'replyToId', 'forwardMessageId',
  'panel', 'activeTab', 'activeFilter', 'searchQuery', 'messageSearchQuery', 'globalSearchResults', 'uploadStatus',
  'blurShieldActive', 'blurShieldRevealed', 'showGhostModal', 'showMoodModal', 'showArchivedChats',
  'pendingChatAction', 'pendingReportTarget', 'inAppNotification',
  'archivedChatIds', 'mutedChatIds'
];

storeProps.forEach(prop => {
  const regex = new RegExp(`const \\s*\\[\\s*${prop}\\s*,\\s*(set[a-zA-Z0-9_]+)\\s*\\]\\s*=\\s*useState(?:<[^>]+>)?\\s*\\([\\s\\S]*?\\);`);
  const match = code.match(regex);
  if (match) {
    const setterName = match[1];
    code = code.replace(match[0], `const ${prop} = useDashboardStore((s) => s.${prop});\n    const ${setterName} = useDashboardStore((s) => s.${setterName});`);
  }
});

const regexChatPref = /const \s*\[\s*chatPref\s*,\s*setChatPrefState\s*\]\s*=\s*useState(?:<[^>]+>)?\s*\([\s\S]*?\);/;
const matchChatPref = code.match(regexChatPref);
if (matchChatPref) {
  code = code.replace(matchChatPref[0], `const chatPref = useDashboardStore((s) => s.chatPref);\n    const setChatPrefState = useDashboardStore((s) => s.setChatPref);`);
}

// Add import
if (!code.includes('@/stores/useDashboardStore')) {
  code = code.replace('import { useCallStore }', 'import { useDashboardStore } from "@/stores/useDashboardStore";\nimport { useCallStore }');
}

fs.writeFileSync(path, code);
console.log('Regex replace complete');
