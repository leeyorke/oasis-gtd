import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db/database'
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

function createWindow(): void {
  // Get the display where the cursor is currently located
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = display.workArea

  // Center the window on the screen where the cursor is
  const windowWidth = 1100
  const windowHeight = 700
  const x = Math.round(screenX + (screenWidth - windowWidth) / 2)
  const y = Math.round(screenY + (screenHeight - windowHeight) / 2)

  const mainWindow = new BrowserWindow({
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
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
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
  ipcMain.on('window:close', () => mainWindow.close())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})