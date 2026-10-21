#!/usr/bin/env node
/**
 * Derives the platform icon files from resources/icon.ico.
 *
 * The .ico holds a single 256×256 PNG entry, which is exactly what the other
 * platforms need:
 *   resources/icon.png  — the Linux window icon (src/main/index.ts) and the
 *                         copy shipped next to the executable
 *   resources/icon.icns — the macOS bundle icon
 *
 * Both were referenced by electron-builder.yml but missing from the repo, so
 * every build printed "file source doesn't exist". Run this after replacing
 * the .ico:
 *
 *   node scripts/make-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const icoPath = join(repoRoot, 'resources', 'icon.ico')

/** The largest PNG-embedded entry of an .ico file. */
function extractPng(ico) {
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error('not an icon file')
  }
  const count = ico.readUInt16LE(4)
  let best = null
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const width = ico[entry] === 0 ? 256 : ico[entry]
    const height = ico[entry + 1] === 0 ? 256 : ico[entry + 1]
    const size = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    const isPng = ico[offset] === 0x89 && ico[offset + 1] === 0x50 && ico[offset + 2] === 0x4e
    if (!isPng) continue
    if (!best || width > best.width) best = { width, height, data: ico.subarray(offset, offset + size) }
  }
  if (!best) throw new Error('the .ico contains no PNG entry to reuse')
  return best
}

/** Wraps PNG payloads into an Apple ICNS container. */
function buildIcns(entries) {
  const chunks = []
  let total = 8
  for (const { type, data } of entries) {
    const length = data.length + 8
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(length, 4)
    chunks.push(header, data)
    total += length
  }
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(total, 4)
  return Buffer.concat([header, ...chunks])
}

const ico = readFileSync(icoPath)
const { width, height, data } = extractPng(ico)
console.log(`icon.ico: reusing its ${width}×${height} PNG entry (${data.length} bytes)`)

const pngPath = join(repoRoot, 'resources', 'icon.png')
writeFileSync(pngPath, data)
console.log(`wrote ${pngPath}`)

// 'ic08' is the 256×256 PNG slot; 'ic09' the 512×512 one. Only the size we
// actually have is written — macOS scales the rest.
const icnsPath = join(repoRoot, 'resources', 'icon.icns')
writeFileSync(icnsPath, buildIcns([{ type: 'ic08', data }]))
console.log(`wrote ${icnsPath}`)
