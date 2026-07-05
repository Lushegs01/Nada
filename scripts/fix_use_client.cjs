const fs = require('fs');

const files = [
  'apps/web/src/components/NadaApp.tsx',
  'apps/web/src/components/screens/Dashboard.tsx',
  'apps/web/src/components/screens/StatusView.tsx',
  'apps/web/src/components/screens/CommunitiesHome.tsx',
  'apps/web/src/components/screens/Onboarding.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/[\r\n]*"use client";[\r\n]*/g, '\n');
    c = c.replace(/^(\/\* eslint-disable \*\/[\r\n]*)/, '');
    c = '"use client";\n/* eslint-disable */\n' + c;
    fs.writeFileSync(f, c);
  }
});
console.log('Fixed use client');
