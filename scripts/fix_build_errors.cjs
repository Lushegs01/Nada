const fs = require('fs');

// Fix NadaApp.tsx duplicate import
let c = fs.readFileSync('apps/web/src/components/NadaApp.tsx', 'utf8');
c = c.replace(/import \{ decodeMessagePayload \} from "@\/lib\/media-message";\n/, '');
fs.writeFileSync('apps/web/src/components/NadaApp.tsx', c);

// Add missing motion imports
const filesToFix = [
  'apps/web/src/components/OfflineBanner.tsx',
  'apps/web/src/components/panels/Dialogs.tsx',
  'apps/web/src/components/panels/Sheet.tsx'
];

for (const file of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('framer-motion')) {
    content = 'import { motion, AnimatePresence } from "framer-motion";\n' + content;
    fs.writeFileSync(file, content);
  }
}

// Add missing Image import
const settingsSheet = 'apps/web/src/components/panels/SettingsSheet.tsx';
let ss = fs.readFileSync(settingsSheet, 'utf8');
if (!ss.includes('next/image')) {
  ss = 'import Image from "next/image";\n' + ss;
  fs.writeFileSync(settingsSheet, ss);
}
