const { app, BrowserWindow, ipcMain, Tray, Menu, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let overlay = null;
let tray = null;

const BARK_MESSAGES = [
  "WOOF! Code faster, human! 🐕",
  "Shiba is NOT impressed with your speed!",
  "BORK BORK! Less thinking, more typing!",
  "The treat jar is EMPTY and so is your commit history!",
  "I've seen snails deploy faster than this!",
  "AWOO! Ship it already!",
  "Stop sniffing around and WRITE CODE!",
  "*angry shiba noises* FASTER!",
  "Even a puppy could merge this PR by now!",
  "WOOF! Did you fall asleep at the keyboard?!"
];

function getRandomMessage() {
  return BARK_MESSAGES[Math.floor(Math.random() * BARK_MESSAGES.length)];
}

function sendToClaude(message) {
  // Send Ctrl+C interrupt then a motivational message to Claude Code
  const escaped = message.replace(/"/g, '\\"').replace(/!/g, '\\!');
  
  // Try to find Claude Code terminal and send interrupt + message
  // Method 1: Use claude CLI directly
  exec(`claude --message "${escaped}" --no-input 2>/dev/null || true`);
  
  // Method 2: Send to most recent terminal via osascript (macOS)
  if (process.platform === 'darwin') {
    const osa = `
      tell application "Terminal"
        if (count of windows) > 0 then
          do script "echo '🐕 ${escaped}'" in front window
        end if
      end tell
    `;
    exec(`osascript -e '${osa}' 2>/dev/null || true`);
  }
}

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlay = new BrowserWindow({
    width: 280,
    height: 320,
    x: width - 300,
    y: height - 360,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  overlay.loadFile('overlay.html');
  overlay.setIgnoreMouseEvents(false);
  
  // Make window click-through except for the shiba
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

app.whenReady().then(() => {
  createOverlay();

  // Tray icon
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    tray.setToolTip('BarkClaude 🐕');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '🐕 Bark!', click: () => overlay?.webContents.send('trigger-bark') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', () => overlay?.webContents.send('trigger-bark'));
  } catch (e) {
    console.log('Tray icon not found, running without tray');
  }

  ipcMain.on('bark', (_event, customMsg) => {
    const message = customMsg || getRandomMessage();
    console.log(`🐕 ${message}`);
    sendToClaude(message);
  });

  ipcMain.on('quit', () => app.quit());
});

app.on('window-all-closed', () => app.quit());
