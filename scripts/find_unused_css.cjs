const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../apps/web/app/globals.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const classRegex = /\.([a-zA-Z0-9_-]+)(?=[^}]*\{)/g;
const classes = new Set();
let match;
while ((match = classRegex.exec(cssContent)) !== null) {
  classes.add(match[1]);
}

console.log('Total classes defined:', classes.size);
const classArray = Array.from(classes);

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const srcFiles = walk(path.join(__dirname, '../apps/web/src')).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
let unusedCount = 0;
let unusedClasses = [];

for (const cls of classArray) {
  // Common tailwind classes or generic ones we should skip
  if (['dark', 'has-tail', 'active', 'group-hover'].includes(cls)) continue;

  let used = false;
  for (const f of srcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes(cls)) {
      used = true;
      break;
    }
  }

  if (!used) {
    unusedCount++;
    unusedClasses.push(cls);
  }
}

console.log('Unused classes:', unusedCount);
console.log(unusedClasses.slice(0, 50).join(', '));
