const { GlobalKeyboardListener } = require('node-global-key-listener');
const audio = require('win-audio');
const { SysTray } = require('node-systray-v2');
const fs = require('fs');
const path = require('path');

(function main() {
  const activeBuffer = fs.readFileSync(path.resolve(__dirname, './icons/active.ico')).toString('base64');
  const mutedBuffer = fs.readFileSync(path.resolve(__dirname, './icons/muted.ico')).toString('base64');

  const mic = audio.mic;

  const hotkeyListener = new GlobalKeyboardListener();

  const menu = {
    icon: mic.isMuted() ? mutedBuffer : activeBuffer,
    title: 'MicMute',
    tooltip: 'MicMute',
    items: [{
      title: 'Закрыть',
      tooltip: 'Закрыть',
      enabled: true,
    }]
  }

  const sysTray = new SysTray({ menu });

  sysTray.onClick(action => {
    if (action.seq_id === 0) {
      process.exit();
    }
  })

  hotkeyListener.addListener((e, down) => {
    if (down['LEFT CTRL'] && down['LEFT ALT']) {
      mic.toggle();

      menu.icon = mic.isMuted() ? mutedBuffer : activeBuffer;

      sysTray.sendAction({
        menu,
        type: 'update-menu'
      })

      return false;
    }
  });
})();