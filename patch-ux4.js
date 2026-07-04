const fs = require('fs');

let tsx = fs.readFileSync('apps/web/src/components/NadaMobileUI.tsx', 'utf8');

// For mobile clicks, Framer Motion intercepts `onClick` if drag is enabled.
// And `onTap` doesn't always play well inside complex React apps on mobile browsers if touch-action isn't set.
// A common fix is `style={{ touchAction: "pan-y" }}` to allow vertical scrolling but allow Framer to handle horizontal drag.
// And we should use `onClick` instead of `onTap` if possible, because React's onClick works better with `touch-action: pan-y`.

// Let's replace onTap with onClick and add touch-action.
tsx = tsx.replace(/onTap=\{onClick\}/, 'onClick={onClick}');
tsx = tsx.replace(
  /style=\{\{\n        background: isSelected \? "rgb\(var\(--n-s3\)\)" : "rgb\(var\(--n-base\)\)"\n      \}\}/,
  `style={{
        background: isSelected ? "rgb(var(--n-s3))" : "rgb(var(--n-base))",
        touchAction: "pan-y"
      }}`
);
fs.writeFileSync('apps/web/src/components/NadaMobileUI.tsx', tsx);
