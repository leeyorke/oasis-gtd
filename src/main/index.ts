import { app, shell, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, settingsQueries } from './db/database'
import { registerHandlers } from './ipc/handlers'

// Fix Windows console encoding — without this, Chinese (and other CJK) characters
// appear as mojibake because the default Windows console code page is GBK/CP936.
if (process.platform === 'win32') {
  try {
    // Node 21+ has reconfigure(); fall back gracefully for older versions
    ;(process.stdout as NodeJS.WriteStream & { reconfigure?: (opts: object) => void })
      .reconfigure?.({ encoding: 'utf8' })
    ;(process.stderr as NodeJS.WriteStream & { reconfigure?: (opts: object) => void })
      .reconfigure?.({ encoding: 'utf8' })
  } catch {
    // non-critical, ignore
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quickCaptureWindow: BrowserWindow | null = null

function createTray(): void {
  const iconPath = is.dev
    ? join(__dirname, '../../resources/icon.ico')
    : join(process.resourcesPath, 'icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ])

  tray.setToolTip('Oasis GTD')
  tray.setContextMenu(contextMenu)

  // Left-click toggles window visibility
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  // Get the display where the cursor is currently located
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = display.workArea

  // Center the window on the screen where the cursor is
  const windowWidth = 1100
  const windowHeight = 800
  const x = Math.round(screenX + (screenWidth - windowWidth) / 2)
  const y = Math.round(screenY + (screenHeight - windowHeight) / 2)

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1100,
    minHeight: 700,
    x,
    y,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#e9e6e2',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.setSize(windowWidth, windowHeight)
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Window control IPC
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.hide()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createQuickCaptureWindow(): void {
  // Don't create duplicate windows
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.focus()
    return
  }

  quickCaptureWindow = new BrowserWindow({
    width: 480,
    height: 420,
    center: true,
    title: '',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#EBE7E0',
      symbolColor: '#666666',
      height: 32,
    },
    resizable: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#EBE7E0',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Prevent HTML <title> from overriding the blank title
  quickCaptureWindow.webContents.on('page-title-updated', (e) => e.preventDefault())
  // Remove native menu bar (File/Edit/Window/Help)
  quickCaptureWindow.setMenu(null)

  quickCaptureWindow.on('ready-to-show', () => quickCaptureWindow!.show())

  // Clean up reference when closed
  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    quickCaptureWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#quick-capture')
  } else {
    quickCaptureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'quick-capture' })
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.oasis.gtd')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()

  // Register all IPC handlers
  registerHandlers()

  createTray()
  createWindow()

  // Register global shortcut for quick capture from stored settings
  const registerQuickCapture = () => {
    globalShortcut.unregisterAll()
    try {
      const raw = settingsQueries.get('shortcuts')
      const shortcuts = raw ? JSON.parse(raw) : {}
      const combo = (shortcuts.newThought as string) || 'Ctrl+N'
      const accel = combo.replace('Ctrl', 'CommandOrControl')
      globalShortcut.register(accel, () => createQuickCaptureWindow())
    } catch {
      globalShortcut.register('CommandOrControl+N', () => createQuickCaptureWindow())
    }
  }
  registerQuickCapture()

  // Allow renderer to re-register the shortcut when settings change
  ipcMain.on('quick-capture:registerShortcut', (_event, shortcut: string) => {
    globalShortcut.unregisterAll()
    const accel = shortcut.replace('Ctrl', 'CommandOrControl')
    globalShortcut.register(accel, () => createQuickCaptureWindow())
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep the app running even with no windows (macOS convention).
  // On other platforms, the app stays alive in the tray instead of quitting.
  // Only quit when the user explicitly clicks "退出" from the tray menu.
  if (process.platform === 'darwin') {
    // macOS: do nothing — app stays alive
  } else {
    // Windows/Linux: minimize to tray instead of quitting
    if (mainWindow) mainWindow.hide()
  }
})

// Ensure window is shown before quitting (helps macOS restore state)
app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.show()
  }
})