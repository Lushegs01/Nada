const fs = require('fs');

let tsx = fs.readFileSync('apps/web/src/components/NadaMobileUI.tsx', 'utf8');

// Also update it to use `touchAction: "pan-y"` and `onClick` on mobile
tsx = tsx.replace(
  /whileTap=\{\{ scale: 0\.99 \}\}\n      className=\{cn\(/,
  `whileTap={{ scale: 0.99 }}\n      className={cn(`
);

// We want to make sure the inner contents have the active styling correctly but prevent absolute swipe items from bleeding on transparent background.
// We applied `touchAction: "pan-y"` but let's make sure it's saved.

fs.writeFileSync('apps/web/src/components/NadaMobileUI.tsx', tsx);
