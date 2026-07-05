const fs = require('fs');

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

const files = walk('apps/web/src/components');
files.filter(f => f.endsWith('.tsx')).forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let changed = false;

  if (c.includes('import {} from "framer-motion";')) {
    c = c.replace(/import \{\} from "framer-motion";/g, 'import { motion, AnimatePresence } from "framer-motion";');
    changed = true;
  }

  if (c.includes('<motion.') && !c.includes('"use client";') && !c.includes("'use client';")) {
    c = '"use client";\n' + c;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(f, c);
    console.log('Fixed ' + f);
  }
});
