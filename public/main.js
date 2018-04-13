const {
  app, BrowserWindow, Menu, ipcMain, shell,
  Tray, dialog, globalShortcut
} = require('electron');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const url = require('url');

let platform = process.platform;
const userHomeDir = require('os').homedir()
const ARIA2DESKTOP_DEV = process.env.ARIA2DESKTOP_DEV === 'true';

const template = [
  {
    label: '编辑',
    submenu: [
      {role: 'undo'},
      {role: 'redo'},
      {type: 'separator'},
      {role: 'cut', label: '剪切'},
      {role: 'copy', label: '复制'},
      {role: 'paste', label: '粘贴'},
      {role: 'delete', label: '删除'},
      {role: 'selectall', label: '全选'}
    ]
  },
  {
    label: '视图',
    submenu: [
      {role: 'reload', label: '重新载入'},
      {role: 'forcereload', label: '强制重新载入'},
      {type: 'separator'},
      {role: 'togglefullscreen'}
    ]
  },
  {
    role: 'window',
    label: '窗口',
    submenu: [
      {role: 'minimize', label: '最小化'},
      {role: 'close', label: '关闭'}
    ]
  },
  {
    role: 'help',
    label: '帮助',
    submenu: [
      {
        label: '在线帮助',
        click() {
          shell.openExternal('https://github.com/wapznw/aria2desktop')
        }
      }
    ]
  }
];

if (platform === 'darwin') {
  template.unshift({
    label: app.getName(),
    submenu: [
      {role: 'about', label: '关于' + app.getName()},
      {type: 'separator'},
      {role: 'services', label: '服务', submenu: []},
      {type: 'separator'},
      {role: 'hide'},
      {role: 'hideothers'},
      {role: 'unhide'},
      {type: 'separator'},
      {role: 'quit', label: '退出'}
    ]
  });
}

let menu = Menu.buildFromTemplate(template);

let mainWindow;

const aria2dir = path.resolve(__dirname, 'aria2cli');

const aria2home = path.join(userHomeDir, app.getName());
const aria2Cli = path.resolve(aria2home, 'aria2c');
const aria2DownloadDir = path.join(userHomeDir, 'Downloads');
const sessionFile = path.join(aria2home, 'aria2.session');
const aria2ConfFile = path.join(aria2home, 'aria2.conf');

if (!fs.existsSync(aria2home)) {
  fs.mkdirSync(aria2home);
}

fs.readdirSync(aria2dir).forEach(file => {
  var src = path.join(aria2dir, file),
    dest = path.join(aria2home, file);
  if (!fs.existsSync(dest)) {
    console.log('释放文件: ', src);
    if ('copyFileSync' in fs) {
      fs.copyFileSync(src, dest);
    } else {
      fs.writeFileSync(dest, fs.readFileSync(src));
      if (file === 'aria2c') {
        fs.chmodSync(dest, 755)
      }
    }
  }
});

let secret = Math.random().toString(32).substr(2);
if (fs.existsSync(aria2ConfFile)) {
  let confContent = fs.readFileSync(aria2ConfFile).toString();
  let c = confContent.replace(/\\n/g, "\n").replace(/#.+/g, '');
  let m = c.match(/rpc-secret=(.+)/i);
  if (m && m.length > 1) {
    secret = m[1]
  } else {
    confContent = confContent.replace(/rpc-secret=(.+)/i, 'rpc-secret=' + secret);
    fs.writeFileSync(aria2ConfFile, confContent);
  }
}

const aria2Conf = [
  '--dir', aria2DownloadDir,
  '--conf-path', aria2ConfFile,
  '--input-file', sessionFile,
  '--save-session', sessionFile,
  // '--max-concurrent-downloads', 10,
  // '--max-connection-per-server', 16,
  // '--min-split-size', '1024K',
  // '--split', 16,
  // '--max-overall-download-limit', '0K',
  // '--max-overall-upload-limit', '0K',
  // '--max-download-limit', '0K',
  // '--max-upload-limit', '0K',
  // '--continue', 'true',
  // '--auto-file-renaming', 'true',
  // '--allow-overwrite', 'true',
  // '--disk-cache', '0M',
  // '--max-tries', 0,
  // '--retry-wait', 5,
  '--rpc-secret', secret
];

if (fs.existsSync(aria2Cli)) {
  console.log('rpc-secret: ', secret);
  const worker = child_process.spawn(aria2Cli, aria2Conf);

  worker.stdout.on('data', function (data) {
    console.log(data.toString());
  });

  process.on('exit', function () {
    worker.killed || worker.kill();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    center: true,
    titleBarStyle: 'hiddenInset',
    show: false,
    frame: platform === 'darwin',
    title: 'Aria2Desktop'
  });

  const loadUrl = ARIA2DESKTOP_DEV ? 'http://localhost:3000/' : url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  });
  mainWindow.loadURL(loadUrl + '#' + secret);
  console.log('loadUrl', loadUrl + '#' + secret);

  mainWindow.on('closed', function () {
    mainWindow = null
  });

  ipcMain.on('close-window', function () {
    mainWindow.close()
  });
  ipcMain.on('set-window-maximize', function () {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  });
  ipcMain.on('set-window-minimize', function () {
    mainWindow.minimize()
  });

  ipcMain.on('open-file-dialog', function () {
    dialog.showOpenDialog({properties: ['openDirectory', 'multiSelections']})
  });

  mainWindow.once('ready-to-show', () => {
    Menu.setApplicationMenu(process.platform === 'darwin' ? menu : null);
    mainWindow.show()
  })
}

function toggleWindow() {
  if (mainWindow === null) {
    createWindow()
  } else {
    if (mainWindow.isVisible() && !mainWindow.isFocused()) {
      mainWindow.focus();
    } else {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  }
}

let tray;
let templateMenu = [
  {role: 'about', label: '关于' + app.getName()},
  {type: 'separator'},
  {role: 'quit', label: '完全退出'}
];
app.on('ready', function () {
  createWindow();
  tray = new Tray(path.join(__dirname, 'aria2icon_16.png'));
  tray.setToolTip('aria2 desktop');
  if (platform === 'darwin') {
    tray.on('right-click', () => {
      tray.popUpContextMenu(Menu.buildFromTemplate(templateMenu))
    })
  } else {
    templateMenu.splice(1, 0, {type: 'separator'}, {
      label: '显示/隐藏',
      click(){
        toggleWindow()
      }
    });
    tray.setContextMenu(Menu.buildFromTemplate(templateMenu))
  }
  tray.on('click', () => {
    toggleWindow()
  });
  globalShortcut.register('CommandOrControl+Alt+J', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.openDevTools()
    }
  });
});

app.on('window-all-closed', function () {
  // if (process.platform !== 'darwin') {
  // app.quit()
  // }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
  mainWindow.isFocused() || mainWindow.focus();
});

