#!/usr/bin/env node
// Script to generate a simple placeholder icon
// Run: node generate-icon.js
// Then use an online tool or electron-icon-maker to convert to .ico

console.log('Place icon files in resources/')
console.log('  resources/icon.ico   (Windows, required)')
console.log('  resources/icon.icns  (macOS)')
console.log('  resources/icon.png   (Linux, 256x256)')
console.log('')
console.log('Generate from PNG: npx electron-icon-maker --input=resources/icon.png --output=resources/')
