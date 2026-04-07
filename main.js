const { app, BrowserWindow, ipcMain, Tray, Menu, screen } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');

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
  // No emoji prefix — conhost with non-UTF8 codepage mangles multi-byte chars on paste.
  const text = message;

  if (process.platform === 'win32') {
    // Type the text character-by-character via SendKeys (no clipboard, no Ctrl+V).
    // Claude Code's TUI in raw mode doesn't handle Ctrl+V as paste — it just sees
    // a literal 'v'. Synthetic keystrokes, on the other hand, are delivered as
    // normal char input through conhost's stdin and land in the TUI input field.
    // SendKeys special metachars +^%~(){}[] must be wrapped in {} to be literal.
    const textB64 = Buffer.from(text, 'utf8').toString('base64');
    const ps = `
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textB64}'))
$escaped = $text -replace '([+^%~(){}\\[\\]])', '{$1}'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait($escaped)
Start-Sleep -Milliseconds 120
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`, { windowsHide: true });
    return;
  }

  if (process.platform === 'darwin') {
    // Type the text directly via System Events (same rationale as Windows:
    // Cmd+V into a TUI is unreliable; typing chars into the focused terminal is).
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `tell application "System Events"
  keystroke "${escaped}"
  delay 0.1
  key code 36
end tell`;
    execFile('osascript', ['-e', script], (err) => {
      if (err) console.warn('osascript failed:', err.message);
    });
    return;
  }

  // Linux: try xdotool
  const escaped = text.replace(/'/g, `'\\''`);
  exec(`xdotool type --delay 0 -- '${escaped}' && xdotool key Return 2>/dev/null || true`);
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
    focusable: false, // critical: don't steal focus from the user's terminal
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
    sendToClaude(message);
  });

  // Drag: renderer tells us "drag started", we poll the cursor and reposition
  // the window until the renderer tells us "drag ended". This works with
  // pointer capture in the renderer so we keep tracking even if the cursor
  // momentarily leaves the window while it catches up.
  let dragOffset = null;
  let dragTimer = null;
  ipcMain.on('drag-start', () => {
    if (!overlay) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = overlay.getBounds();
    dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!dragOffset || !overlay) return;
      const c = screen.getCursorScreenPoint();
      overlay.setPosition(c.x - dragOffset.x, c.y - dragOffset.y);
    }, 16);
  });
  ipcMain.on('drag-end', () => {
    dragOffset = null;
    if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
  });

  ipcMain.on('quit', () => app.quit());
});

app.on('window-all-closed', () => app.quit());
