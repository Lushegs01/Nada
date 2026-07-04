const fs = require('fs');

let css = fs.readFileSync('apps/web/app/globals.css', 'utf8');
css = css.replace(
  /\.nada-chat-item-active \{\n  background: rgb\(var\(--n-s3\) \/ 0\.85\);\n\}/,
  `.nada-chat-item-active {\n  background: rgb(var(--n-s3));\n}`
);
fs.writeFileSync('apps/web/app/globals.css', css);

let tsx = fs.readFileSync('apps/web/src/components/NadaMobileUI.tsx', 'utf8');

// For onTap on Framer Motion: sometimes onTap doesn't trigger if drag is active.
// A better approach is to use onClick but prevent default if it was a drag.
// However, Framer Motion usually handles this.
// But another reason onTap might fail is if the element isn't capturing touch properly.
// Let's change onTap={onClick} to `onClick={onClick} onPointerDownCapture={(e) => e.stopPropagation()}`?
// Actually, Framer Motion's docs suggest `onClick` SHOULD work with `drag` unless the drag actually happens.
// If it's intercepting taps, it's often because `dragThreshold` or `dragElastic` issues, or maybe we need to use a standard HTML button if drag isn't enabled?
// Let's use `onPointerUp` or keep `onTap`. Let's switch back to `onClick` BUT add a check or use `onPointerUp`?
// Wait! We can just use an inner div for content and attach `onClick` there?
// No, the drag happens on the button.

// Let's check `NadaMobileUI.tsx`
