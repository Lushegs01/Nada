const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      let content = fs.readFileSync(p, 'utf8');
      
      // Fix all 'import type { motion'
      content = content.replace(/import type\s*\{\s*([^}]*motion[^}]*)\s*\}\s*from\s*["']framer-motion["'];?/g, 'import { $1 } from "framer-motion";');
      
      // Fix 'import type { AnimatePresence'
      content = content.replace(/import type\s*\{\s*([^}]*AnimatePresence[^}]*)\s*\}\s*from\s*["']framer-motion["'];?/g, 'import { $1 } from "framer-motion";');

      // Fix specific Dashboard stuff
      content = content.replace(/import type \{ useCallStore \} from "@\/store\/call-store";/g, 'import { useCallStore } from "@/store/call-store";');
      content = content.replace(/import type \{ useIdentityStore \} from "@\/store\/identity-store";/g, 'import { useIdentityStore } from "@/store/identity-store";');
      content = content.replace(/import type \{ getRelayHttpBaseUrl, createLocalCallSession \} from "@\/lib\/livekit";/g, 'import { getRelayHttpBaseUrl, createLocalCallSession } from "@/lib/livekit";');
      content = content.replace(/import type \{ useEffect, useCallback \} from "react";/g, 'import { useEffect, useCallback } from "react";');
      content = content.replace(/import type \{ useEffect \} from "react";/g, 'import { useEffect } from "react";');
      content = content.replace(/import type \{ useCallback \} from "react";/g, 'import { useCallback } from "react";');
      
      fs.writeFileSync(p, content);
    }
  });
}

walk('apps/web/src/components');
console.log('Fixed imports permanently.');
