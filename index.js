const { GlobalKeyboardListener } = require('node-global-key-listener');
const audio = require('win-audio');
const { SysTray } = require('node-systray-v2');
const fs = require('fs').promises;
const path = require('path');
const { ShortcutController, Shortcut } = require('./src/shortcutController/shortcut.controller');
const notifier = require('node-notifier');

(async function main() {
  const iconsDir = path.resolve(__dirname, 'icons');
  const appIconPath = path.resolve(iconsDir, 'icon.png');

  const activeIcon = await fs.readFile(path.resolve(iconsDir, 'active.ico'), { encoding: 'base64' });
  const mutedIcon = await fs.readFile(path.resolve(iconsDir, 'muted.ico'), { encoding: 'base64' });

  const shortcutController = new ShortcutController();
  await shortcutController.load();
  const mic = audio.mic;
  let shortcutListener = new GlobalKeyboardListener();

  const appNameItem = {
    title: 'MuteMic',
    tooltip: 'MuteMic',
    enabled: false,
  };

  let currentShortcutItem = {
    title: shortcutController.shortcut.toString(),
    tooltip: 'Shortcut',
    enabled: false,
  };

  const changeShortcutItem = {
    title: 'Set shortcut',
    tooltip: 'Set shortcut',
    enabled: true,
  };

  const exitItem = {
    title: 'Close',
    tooltip: 'Close',
    enabled: true,
  };

  const menu = {
    icon: mic.isMuted() ? mutedIcon : activeIcon,
    title: 'MicMute',
    tooltip: 'MicMute',
    items: [
      appNameItem,
      currentShortcutItem,
      changeShortcutItem,
      exitItem
    ]
  }

  const sysTray = new SysTray({ menu });

  const onShortcut = function (e, down) {
    const matched = shortcutController.shortcut.keys.every(key => down[key] === true);

    if (matched) {
      mic.toggle();

      menu.icon = mic.isMuted() ? mutedIcon : activeIcon;

      sysTray.sendAction({
        menu,
        type: 'update-menu'
      })
    }

    return false;
  }

  sysTray.onClick(async action => {
    switch (action.seq_id) {
      case 2: {
        const wannaChangeShortcutResult = await new Promise((resolve, reject) => {
          notifier.notify({
            title: 'Do you want to change shortcut?',
            message: 'After press "Yes" hold new shortcut until next notification',
            icon: appIconPath,
            actions: ['Yes', 'No'],
            wait: true
          }, (err, data) => {
            if (err) reject(err);

            resolve(data);
          })
        });

        if (['dismissed', 'timeout', 'no'].includes(wannaChangeShortcutResult)) return;

        shortcutListener.removeListener(onShortcut);

        function getShortcut(shortcutListener, finishAfterKeyDown = 1000, failDelay = 5000) {
          return new Promise((resolve, reject) => {
            const keys = new Set();
            let changeTimeout = null;
            let failTimeout = null;

            const onShortcutChange = function (e, down) {
              if (e.state === 'DOWN') {
                if (keys.has(e.name)) return false;
                keys.add(e.name);

                if (failTimeout) clearTimeout(failTimeout);
              } else {
                keys.delete(e.name);
              }

              if (changeTimeout) clearTimeout(changeTimeout);
              if (keys.size) {
                changeTimeout = setTimeout(() => {
                  shortcutListener.removeListener(onShortcutChange);
                  resolve(new Shortcut(Array.from(keys)));
                }, finishAfterKeyDown);
              } else {
                failTimeout = setTimeout(() => {
                  shortcutListener.removeListener(onShortcutChange);
                  reject(new Error(`Timed out ${failDelay} ms.`));
                }, failDelay);
              }

              return false;
            }
            shortcutListener.addListener(onShortcutChange);
          });
        }

        let _shortcut = null;

        try {
          _shortcut = await getShortcut(shortcutListener);
        } catch (e) {
          console.error(`Cannot get new shortcut: ${e.message}`);
        }

        shortcutListener.kill();
        shortcutListener = new GlobalKeyboardListener();
        shortcutListener.addListener(onShortcut);

        if (!_shortcut) {
          notifier.notify({
            title: 'Changing shortcut',
            message: `The shortcut haven't saved`,
            icon: appIconPath,
          });

          return false;
        }

        const saveShortcutResult = await new Promise((resolve, reject) => {
          notifier.notify({
            title: 'Changing shortcut',
            message: `Do you want to save shortcut: ${_shortcut.toString()}?`,
            icon: appIconPath,
            actions: ['Yes', 'No'],
            wait: true
          }, (err, data) => {
            if (err) reject(err);

            resolve(data);
          })
        });

        if (['dismissed', 'timeout', 'no'].includes(saveShortcutResult)) {
          notifier.notify({
            title: 'Changing shortcut',
            message: `The shortcut haven't saved`,
            icon: appIconPath,
          });

          return;
        }

        await shortcutController.save(_shortcut);
        sysTray.sendAction({
          type: 'update-item',
          seq_id: 1,
          item: {
            ...currentShortcutItem,
            title: shortcutController.shortcut.toString()
          }
        });

        notifier.notify({
          title: 'Success!',
          message: `Shortcut ${_shortcut.toString()} saved successfully`,
          icon: appIconPath,
        })

        break;
      }

      case 3: {
        process.exit();
      }
    }
  });

  shortcutListener.addListener(onShortcut);
})();