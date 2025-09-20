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
  shortcutController.load();
  const mic = audio.mic;
  let hotkeyListener = new GlobalKeyboardListener();

  const appNameItem = {
    title: 'MuteMic',
    tooltip: 'MuteMic',
    enabled: false,
  };

  let currentShortcutItem = {
    title: shortcutController.shortcut.toString(),
    tooltip: 'Сочетание горячих клавиш',
    enabled: false,
  };

  const changeShortcutItem = {
    title: 'Изменить сочетание клавиш',
    tooltip: 'Изменить сочетание клавиш',
    enabled: true,
  };

  const exitItem = {
    title: 'Закрыть',
    tooltip: 'Закрыть',
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
        const wannaChangeShortcut = await new Promise((resolve, reject) => {
          notifier.notify({
            title: 'Хотите изменить сочетание клавиш?',
            message: 'После нажатия на "Да" удерживайте новое сочетание клавиш пока не появится следующее уведомление',
            icon: appIconPath,
            actions: ['Да', 'Нет'],
            wait: true
          }, (err, data) => {
            if (err) reject(err);

            resolve(data);
          })
        });

        if (['dismissed', 'timeout', 'нет'].includes(wannaChangeShortcut)) return;

        hotkeyListener.removeListener(onShortcut);

        function getShortcut(hotkeyListener, finishAfterKeyDown = 1000, failDelay = 5000) {
          return new Promise((resolve, reject) => {
            const keys = new Set();
            let changeTimeout = null;
            let failTimeout = null;

            const onShortcutChange = function (e, down) {
              if (e.state === 'DOWN') {
                if (keys.has(e.name)) return false;
                keys.add(e.name);

                if (failTimeout) {
                  clearTimeout(failTimeout);
                  console.log(`${new Date()} Удален failTimeout`)
                }
              } else {
                keys.delete(e.name);
              }

              if (changeTimeout) {
                clearTimeout(changeTimeout);
                console.log(`${new Date()} Удален changeTimeout`)
              }
              if (keys.size) {
                changeTimeout = setTimeout(() => {
                  hotkeyListener.removeListener(onShortcutChange);
                  resolve(new Shortcut(Array.from(keys)));
                }, finishAfterKeyDown);
                console.log(`${new Date()} Создан changeTimeout`)
              } else {
                failTimeout = setTimeout(() => {
                  hotkeyListener.removeListener(onShortcutChange);
                  reject(new Error(`Завершено по таймауту в ${failDelay} мс.`));
                }, failDelay);
                console.log(`${new Date()} Создан failTimeout`)
              }

              return false;
            }
            hotkeyListener.addListener(onShortcutChange);
          });
        }

        let _shortcut = null;

        try {
          _shortcut = await getShortcut(hotkeyListener);
        } catch (e) {
          console.error(`Не удалось получить новое сочетание клавиш: ${e.message}`);
        }

        hotkeyListener.kill();
        hotkeyListener = new GlobalKeyboardListener();
        hotkeyListener.addListener(onShortcut);

        if (!_shortcut) {
          notifier.notify({
            title: 'Изменение горячих клавиш',
            message: `Сочетание клавиш не было записано`,
            icon: appIconPath,
          });

          return false;
        }

        const saveShortcut = await new Promise((resolve, reject) => {
          notifier.notify({
            title: 'Изменение горячих клавиш',
            message: `Сохранить сочетание клавиш ${_shortcut.toString()}?`,
            icon: appIconPath,
            actions: ['Да', 'Нет'],
            wait: true
          }, (err, data) => {
            if (err) reject(err);

            resolve(data);
          })
        });

        if (['dismissed', 'timeout', 'нет'].includes(saveShortcut)) {
          notifier.notify({
            title: 'Изменение горячих клавиш',
            message: `Сочетание клавиш не было записано`,
            icon: appIconPath,
          });

          return;
        }

        shortcutController.save(_shortcut);
        sysTray.sendAction({
          type: 'update-item',
          seq_id: 1,
          item: {
            ...currentShortcutItem,
            title: shortcutController.shortcut.toString()
          }
        });

        notifier.notify({
          title: 'Изменение горячих клавиш',
          message: `Сочетание клавиш ${_shortcut.toString()} успешно сохранено`,
          icon: appIconPath,
        })

        break;
      }

      case 3: {
        process.exit();
      }
    }
  });

  hotkeyListener.addListener(onShortcut);
})();