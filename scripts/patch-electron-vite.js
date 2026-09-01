/**
 * Patches electron-vite to unset ELECTRON_RUN_AS_NODE when spawning the Electron process.
 *
 * Root cause: npm sets ELECTRON_RUN_AS_NODE=1 so that electron-vite's build tools
 * run as plain Node.js. However, this variable is inherited by the child Electron
 * process, causing it to start in "Node mode" instead of "Electron app mode".
 * In Node mode, require('electron') returns the npm binary path (a string) instead
 * of the Electron API, making `electron.app` undefined and crashing the app.
 *
 * This script modifies electron-vite's spawn call to delete ELECTRON_RUN_AS_NODE
 * from the child process environment.
 *
 * Run via: postinstall hook in package.json
 */

const fs = require('fs')
const path = require('path')

const chunksDir = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'dist', 'chunks')

if (!fs.existsSync(chunksDir)) {
  console.log('[patch-electron-vite] electron-vite not found, skipping patch')
  process.exit(0)
}

const files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.mjs') || f.endsWith('.cjs'))
let patched = 0

for (const file of files) {
  const filePath = path.join(chunksDir, file)
  let content = fs.readFileSync(filePath, 'utf8')

  // Already patched?
  if (content.includes('delete env.ELECTRON_RUN_AS_NODE')) {
    continue
  }

  // Pattern for MJS: spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })
  const mjsPattern = /const entry = process\.env\.ELECTRON_ENTRY \|\| '\.';\s*\n\s*const ps = spawn\(electronPath, \[entry\]\.concat\(args\), \{ stdio: 'inherit' \}\);/
  const mjsReplacement = `const entry = process.env.ELECTRON_ENTRY || '.';
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const ps = spawn(electronPath, [entry].concat(args), { stdio: 'inherit', env });`

  // Pattern for CJS: node_child_process.spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })
  const cjsPattern = /const entry = process\.env\.ELECTRON_ENTRY \|\| '\.';\s*\n\s*const ps = node_child_process\.spawn\(electronPath, \[entry\]\.concat\(args\), \{ stdio: 'inherit' \}\);/
  const cjsReplacement = `const entry = process.env.ELECTRON_ENTRY || '.';
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const ps = node_child_process.spawn(electronPath, [entry].concat(args), { stdio: 'inherit', env });`

  if (mjsPattern.test(content)) {
    content = content.replace(mjsPattern, mjsReplacement)
    fs.writeFileSync(filePath, content, 'utf8')
    patched++
    console.log(`[patch-electron-vite] Patched ${file} (ESM)`)
  } else if (cjsPattern.test(content)) {
    content = content.replace(cjsPattern, cjsReplacement)
    fs.writeFileSync(filePath, content, 'utf8')
    patched++
    console.log(`[patch-electron-vite] Patched ${file} (CJS)`)
  }
}

if (patched === 0) {
  console.log('[patch-electron-vite] No files needed patching (already patched or pattern not found)')
} else {
  console.log(`[patch-electron-vite] Successfully patched ${patched} file(s)`)
}
