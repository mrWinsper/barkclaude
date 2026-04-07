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
  const text = `🐕 ${message}`;

  if (process.platform === 'win32') {
    // Find the terminal window that owns a running `claude` CLI process,
    // activate it by PID, then paste + Enter. No title matching, no shotgun.
    const textB64 = Buffer.from(text, 'utf8').toString('base64');
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textB64}'))

$all = Get-CimInstance Win32_Process
# Processes whose command line contains the claude CLI as a word
# (\\bclaude\\b avoids matching "barkclaude")
$claudePids = @($all | Where-Object {
  $_.CommandLine -and $_.CommandLine -match '\\bclaude\\b'
} | Select-Object -ExpandProperty ProcessId)

if ($claudePids.Count -eq 0) { exit 0 }

# Build map for fast parent lookup
$byPid = @{}
foreach ($p in $all) { $byPid[[int]$p.ProcessId] = $p }

# Walk up the parent chain from each claude pid; collect ancestor PIDs
$ancestors = @{}
foreach ($cp in $claudePids) {
  $cur = [int]$cp
  while ($cur -and -not $ancestors.ContainsKey($cur)) {
    $ancestors[$cur] = $true
    $p = $byPid[$cur]
    if (-not $p) { break }
    $cur = [int]$p.ParentProcessId
  }
}

# Find the first ancestor that owns a visible top-level window
$target = Get-Process | Where-Object {
  $_.MainWindowHandle -ne [IntPtr]::Zero -and $ancestors.ContainsKey([int]$_.Id)
} | Select-Object -First 1

if (-not $target) { exit 0 }

$wshell = New-Object -ComObject wscript.shell
$null = $wshell.AppActivate([int]$target.Id)
Start-Sleep -Milliseconds 200

Add-Type -AssemblyName System.Windows.Forms | Out-Null
[System.Windows.Forms.Clipboard]::SetText($text)
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -EncodedCommand ${encoded}`);
    return;
  }

  if (process.platform === 'darwin') {
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const osa = `
      tell application "System Events"
        set the clipboard to "${escaped}"
        keystroke "v" using command down
        delay 0.1
        keystroke return
      end tell
    `;
    exec(`osascript -e '${osa}' 2>/dev/null || true`);
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
