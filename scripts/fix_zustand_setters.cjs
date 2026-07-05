const fs = require('fs');

const p = 'apps/web/src/stores/useDashboardStore.ts';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('type Updater<T>')) {
  c = c.replace("import { create } from 'zustand';", "import { create } from 'zustand';\ntype Updater<T> = T | ((prev: T) => T);");
}

// Fix interface types
c = c.replace(/set([A-Z][a-zA-Z0-9_]*): \(([^:]+): ([^\)]+)\) => void;/g, (match, name, arg, type) => {
  return `set${name}: (${arg}: Updater<${type}>) => void;`;
});

// Fix implementations
c = c.replace(/set([A-Z][a-zA-Z0-9_]*): \(([a-zA-Z0-9_]+)\) => set\(\{ ([a-zA-Z0-9_]+) \}\),/g, (match, name, arg, prop) => {
  return `set${name}: (${arg}) => set((state) => ({ ${prop}: typeof ${arg} === 'function' ? ${arg}(state.${prop}) : ${arg} })),`;
});

// chatPref has a custom implementation line in the regex, let's fix it manually too
c = c.replace(/setChatPref: \((chatPref)\) => set\(\{ chatPref \}\),/g, `setChatPref: (chatPref) => set((state) => ({ chatPref: typeof chatPref === 'function' ? chatPref(state.chatPref) : chatPref })),`);


fs.writeFileSync(p, c);
console.log('Fixed Zustand setters');
