const fs = require('fs');

const dashboardPath = 'apps/web/src/components/screens/Dashboard.tsx';
let content = fs.readFileSync(dashboardPath, 'utf8');

// Ensure next/dynamic is imported
if (!content.includes('import dynamic from "next/dynamic";')) {
  content = 'import dynamic from "next/dynamic";\n' + content;
}

// Replace synchronous panel imports with dynamic imports
const replacements = [
  { search: 'import { BillingSheet } from "../panels/BillingSheet";', replace: 'const BillingSheet = dynamic(() => import("../panels/BillingSheet").then(m => m.BillingSheet), { ssr: false });' },
  { search: 'import { SettingsSheet } from "../panels/SettingsSheet";', replace: 'const SettingsSheet = dynamic(() => import("../panels/SettingsSheet").then(m => m.SettingsSheet), { ssr: false });' },
  { search: 'import { ContactSheet, MigrationSheet, ShareSheet, GroupSheet } from "../panels/ContactSheets";', replace: `const ContactSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.ContactSheet), { ssr: false });
const MigrationSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.MigrationSheet), { ssr: false });
const ShareSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.ShareSheet), { ssr: false });
const GroupSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.GroupSheet), { ssr: false });` },
  { search: 'import { SafetyReportSheet } from "../panels/SafetyReportSheet";', replace: 'const SafetyReportSheet = dynamic(() => import("../panels/SafetyReportSheet").then(m => m.SafetyReportSheet), { ssr: false });' },
  { search: 'import { ChatPanel } from "../chat/ChatPanel";', replace: 'const ChatPanel = dynamic(() => import("../chat/ChatPanel").then(m => m.ChatPanel), { ssr: false });' }
];

replacements.forEach(r => {
  content = content.replace(r.search, r.replace);
});

// Since GlobalSearchResults and SettingsDashboardPreview are also imported, we need to handle them carefully if they are destructured.
// Let's replace the whole import block with dynamic ones:
content = content.replace('import { GlobalSearchResults, ChatPanel } from "../chat/ChatPanel";', 'import { GlobalSearchResults } from "../chat/ChatPanel";\nconst ChatPanel = dynamic(() => import("../chat/ChatPanel").then(m => m.ChatPanel), { ssr: false });');
content = content.replace('import { SettingsDashboardPreview, SettingsSheet } from "../panels/SettingsSheet";', 'import { SettingsDashboardPreview } from "../panels/SettingsSheet";\nconst SettingsSheet = dynamic(() => import("../panels/SettingsSheet").then(m => m.SettingsSheet), { ssr: false });');

fs.writeFileSync(dashboardPath, content);
console.log("Dynamically imported panels in Dashboard");
