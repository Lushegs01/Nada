const fs = require('fs');
const path = require('path');

const TYPES_IMPORT = `import {
  NotificationSettings, NotificationSoundChoice, NotificationPreviewPrivacy,
  NotificationRingtoneChoice, DeliveryGlyph, CommunityRecord, CommunityPost,
  SafetyReport, StatusCommentPayload, StatusReactionPayload, StatusDeletePayload,
  GroupDeletePayload, STATUS_COMMENT_PREFIX, DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUND_CHOICES, NOTIFICATION_PREVIEW_PRIVACY_CHOICES,
  NOTIFICATION_RINGTONE_CHOICES, STATUS_REACTION_EMOJIS, GROUP_DECRYPTION_FALLBACK_TEXT
} from "@/utils/dashboard-types";
import { decodeMessagePayload } from "@/lib/media-message";
`;

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      let content = fs.readFileSync(p, 'utf8');
      let changed = false;

      // Fix framer-motion
      if (content.includes('motion.') || content.includes('<motion.') || content.includes('motion(')) {
        if (!content.includes('from "framer-motion"')) {
          content = `import { motion, AnimatePresence } from "framer-motion";\n` + content;
          changed = true;
        }
      }

      // Add missing types/constants if they are used
      const missingKeywords = ['STATUS_COMMENT_PREFIX', 'StatusCommentPayload', 'NotificationSettings', 'DeliveryGlyph', 'CommunityRecord', 'SafetyReport', 'decodeMessagePayload', 'STATUS_REACTION_EMOJIS'];
      if (missingKeywords.some(k => content.includes(k)) && !content.includes('dashboard-types')) {
        content = TYPES_IMPORT + content;
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(p, content);
      }
    }
  });
}

walk('apps/web/src/components');
walk('apps/web/src/utils');
console.log('Fixed imports manually.');
