Icon files
==========

The app loads its icons at runtime:

  resources/icon.ico   Windows window + installer icon
  resources/icon.png   Linux window icon (256x256)
  resources/icon.icns  macOS bundle icon

icon.ico is the source of truth. The other two are derived from it:

  node scripts/make-icons.mjs

The script reuses the PNG entry embedded in the .ico, so no image tooling is
needed. Run it again whenever icon.ico is replaced.
