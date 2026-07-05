const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../apps/web/app/globals.css');
const content = fs.readFileSync(cssPath, 'utf8');

// Match sections starting with the long divider
const sectionRegex = /\/\* ═════════════════════════════════════════════════════════════════════════════[\s\S]*?(?=\/\* ═════════════════════════════════════════════════════════════════════════════|$)/g;
const sections = content.match(sectionRegex) || [];

let globalsCss = '';
let chatCss = '';
let appCss = '';
let sharedCss = '';

const header = content.substring(0, content.indexOf('/* ═════════════════════════════════════════════════════════════════════════════'));
globalsCss += header;

for (const section of sections) {
  if (section.trim() === '') continue;

  if (section.includes('3. SIGNATURE — IDENTITY ORB') || section.includes('8. GLASS & SURFACE TREATMENT')) {
    sharedCss += section;
  } else if (section.includes('4. SIGNATURE — WHISPER BUBBLES') || section.includes('5. SIGNATURE — TIME RIBBON') || section.includes('6. SIGNATURE — LIQUID COMPOSER')) {
    chatCss += section;
  } else if (section.includes('9. APP LAYOUT SHELL') || section.includes('7. SIGNATURE — FLOATING ORB NAVIGATOR (mobile)')) {
    appCss += section;
  } else {
    globalsCss += section;
  }
}

// We will also strip the known dead classes from globalsCss and the other files
// A generic function to strip blocks:
function stripClasses(css, classList) {
  // We'll leave this to PurgeCSS if needed, doing it with regex is dangerous.
  return css;
}

const chatCssPath = path.join(__dirname, '../apps/web/src/components/chat/chat.css');
const appCssPath = path.join(__dirname, '../apps/web/src/components/app.css');
const sharedCssPath = path.join(__dirname, '../apps/web/src/components/shared.css');

fs.writeFileSync(chatCssPath, chatCss);
fs.writeFileSync(appCssPath, appCss);
fs.writeFileSync(sharedCssPath, sharedCss);
fs.writeFileSync(cssPath, globalsCss);

console.log('CSS extracted successfully');
