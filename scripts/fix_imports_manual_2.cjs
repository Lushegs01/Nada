const fs = require('fs');
const path = require('path');

const TYPES_IMPORT = `import type {
  NotificationSettings, NotificationSoundChoice, NotificationPreviewPrivacy,
  NotificationRingtoneChoice, DeliveryGlyph, CommunityRecord, CommunityPost,
  SafetyReport, StatusCommentPayload, StatusReactionPayload, StatusDeletePayload,
  GroupDeletePayload
} from "@/utils/dashboard-types";
import {
  STATUS_COMMENT_PREFIX, DEFAULT_NOTIFICATION_SETTINGS,
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
      
      // Remove the old bad import
      const badImport = `import {
  NotificationSettings, NotificationSoundChoice, NotificationPreviewPrivacy,
  NotificationRingtoneChoice, DeliveryGlyph, CommunityRecord, CommunityPost,
  SafetyReport, StatusCommentPayload, StatusReactionPayload, StatusDeletePayload,
  GroupDeletePayload, STATUS_COMMENT_PREFIX, DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUND_CHOICES, NOTIFICATION_PREVIEW_PRIVACY_CHOICES,
  NOTIFICATION_RINGTONE_CHOICES, STATUS_REACTION_EMOJIS, GROUP_DECRYPTION_FALLBACK_TEXT
} from "@/utils/dashboard-types";
import { decodeMessagePayload } from "@/lib/media-message";
`;
      if (content.includes(badImport)) {
        content = content.replace(badImport, TYPES_IMPORT);
        fs.writeFileSync(p, content);
      }
    }
  });
}

walk('apps/web/src/components');
walk('apps/web/src/utils');

// Also remove it from dashboard-types.ts since it shouldn't import itself!
let dTypes = fs.readFileSync('apps/web/src/utils/dashboard-types.ts', 'utf8');
dTypes = dTypes.replace(TYPES_IMPORT, '');
fs.writeFileSync('apps/web/src/utils/dashboard-types.ts', dTypes);

console.log('Fixed imports manually part 2.');
