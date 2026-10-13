// ==UserScript==
// @name         交大课堂实录 · 自定义倍速
// @namespace    sjtu-videos-custom-speed
// @version      1.0.0
// @description  在原倍速菜单中输入自定义倍率，同时控制课堂和课件视频。
// @match        https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/*
// @match        https://v.sjtu.edu.cn/jy-application-resmgr-ui/*
// @run-at       document-end
// @grant        none
// @sandbox      raw
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const marker = 'data-sjtu-custom-speed';
  if (document.documentElement.hasAttribute(marker)) return;
  document.documentElement.setAttribute(marker, '');

  const videos = new WeakSet();
  let selectedRate = null;
  let customRate = null;
  let timer;

  function controlProps(menu) {
    const root = menu.closest('.jy-player-control-wrap');
    // 生产构建保留渲染树，但不保留 DOM 上的开发调试标记。
    const stack = [document.querySelector('#app')?._vnode];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      const component = node.component;
      if (component?.type?.name === 'JyPlayerControl' && node.el === root) {
        return component.props;
      }
      if (component?.subTree) stack.push(component.subTree);
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
  }

  function applyRate(menu, rate) {
    const props = controlProps(menu);
    if (!props || props.isLive) throw new Error('当前点播播放器不可用，请刷新后重试。');
    if (props.emitter) {
      props.emitter.emit('playBackRateChange', { rate, showHint: false });
    } else {
      props.setPlaybackRate(rate, false);
    }
  }

  function syncItem(menu) {
    const item = menu.querySelector(`[${marker}="item"]`);
    const media = [...document.querySelectorAll('.jy-kmedia-player video')]
      .filter(video => video.readyState > 0);
    item?.classList.toggle('active', customRate !== null && media.length > 0 &&
      media.every(video => Math.abs(video.playbackRate - customRate) < 0.0001));
  }

  function attachMenu(menu) {
    const list = menu.querySelector('.popper-ul');
    if (!list || list.querySelector(`[${marker}]`)) return;

    const item = document.createElement('li');
    item.setAttribute(marker, 'item');
    item.hidden = customRate === null;
    item.textContent = customRate === null ? '' : `${customRate}X`;
    const row = document.createElement('li');
    row.setAttribute(marker, 'input');
    row.innerHTML = '<form style="display:flex;gap:6px;align-items:center"><input aria-label="自定义倍速" type="number" min="0.0625" max="16" step="any" placeholder="如 3.25" required style="width:76px;padding:4px;border:1px solid #888;border-radius:3px;background:#fff;color:#111;font:inherit"><button type="submit" style="padding:4px 6px;border:1px solid #888;border-radius:3px;background:#fff;color:#111;font:inherit;cursor:pointer">设置</button></form><span role="status" style="display:block;max-width:190px;white-space:normal;font-size:12px;line-height:1.5"></span>';
    const input = row.querySelector('input');
    const status = row.querySelector('[role="status"]');
    if (customRate !== null) input.value = String(customRate);

    function choose(rate) {
      try {
        applyRate(menu, rate);
        const media = [...document.querySelectorAll('.jy-kmedia-player video')]
          .filter(video => video.readyState > 0);
        if (!media.length || !media.every(video => Math.abs(video.playbackRate - rate) < 0.0001)) {
          throw new Error('播放器未接受此倍率，请选择其他数值。');
        }
        selectedRate = customRate = rate;
        item.hidden = false;
        item.textContent = `${rate}X`;
        status.textContent = rate > 4 ? '高倍速可能影响声音和流畅度。' : '';
        syncItem(menu);
      } catch (error) {
        status.textContent = error.message;
      }
    }

    row.addEventListener('click', event => event.stopPropagation());
    row.addEventListener('keydown', event => event.stopPropagation());
    row.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const rate = Number(input.value);
      if (Number.isFinite(rate) && rate >= 0.0625 && rate <= 16) choose(rate);
    });
    item.addEventListener('click', () => choose(customRate));
    list.addEventListener('click', event => {
      const nativeItem = event.target.closest('li');
      if (!nativeItem || nativeItem.hasAttribute(marker)) return;
      const rate = Number(nativeItem.textContent.trim().replace(/X$/i, ''));
      if (Number.isFinite(rate) && rate > 0) selectedRate = rate;
    }, true);
    list.prepend(item, row);
    syncItem(menu);
  }

  function menus() {
    return [...document.querySelectorAll('.jy-player-control-wrap .control-popper')]
      .filter(menu => menu.querySelector('.popper-ul')?.textContent.includes('1.25X'));
  }

  function restoreRate() {
    if (selectedRate === null) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const menu of menus()) {
        try { applyRate(menu, selectedRate); } catch { /* 等待点播播放器加载。 */ }
        syncItem(menu);
      }
    }, 100);
  }

  function scan() {
    for (const menu of menus()) attachMenu(menu);
    for (const video of document.querySelectorAll('.jy-kmedia-player video')) {
      if (videos.has(video)) continue;
      videos.add(video);
      video.addEventListener('loadedmetadata', restoreRate);
      video.addEventListener('ratechange', () => menus().forEach(syncItem));
      if (video.readyState > 0) restoreRate();
    }
  }

  let scanPending = false;
  new MutationObserver(() => {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      scanPending = false;
      scan();
    });
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
