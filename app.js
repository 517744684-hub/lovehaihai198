(function () {
  'use strict';

  // ── Storage helpers ──────────────────────────────────────────────
  var KEYS = {
    ENGINE: 'nav-engine',
    GROUPS: 'nav-groups',
    VIEW: 'nav-view',
    BG: 'nav-bg',
    RECENT: 'nav-recent',
    THEME: 'nav-theme',
  };

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function uid() {
    try { return crypto.randomUUID(); } catch (e) {
      return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────
  function h(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') Object.assign(node.style, v);
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'on') {
          for (var ev in v) node.addEventListener(ev, v[ev]);
        }
        else if (k === 'attrs') {
          for (var ak in v) node.setAttribute(ak, v[ak]);
        }
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  function $ (sel, root) { return (root || document).querySelector(sel); }
  function $$ (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ── Default data ─────────────────────────────────────────────────
  var DEFAULT_GROUPS = [
    { id: 'dev', name: '开发工具', bookmarks: [
      { id: 'github', name: 'GitHub', url: 'https://github.com' },
      { id: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com' },
      { id: 'mdn', name: 'MDN 文档', url: 'https://developer.mozilla.org' },
      { id: 'npm', name: 'npm', url: 'https://npmjs.com' },
      { id: 'vercel', name: 'Vercel', url: 'https://vercel.com' },
    ] },
    { id: 'ai', name: 'AI 助手', bookmarks: [
      { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
      { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com' },
      { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn' },
      { id: 'doubao', name: '豆包', url: 'https://www.doubao.com' },
    ] },
    { id: 'social', name: '社交媒体', bookmarks: [
      { id: 'bilibili', name: '哔哩哔哩', url: 'https://bilibili.com' },
      { id: 'weibo', name: '微博', url: 'https://weibo.com' },
      { id: 'douyin', name: '抖音', url: 'https://www.douyin.com' },
      { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com' },
    ] },
    { id: 'news', name: '资讯阅读', bookmarks: [
      { id: 'toutiao', name: '今日头条', url: 'https://www.toutiao.com' },
      { id: 'sspai', name: '少数派', url: 'https://sspai.com' },
      { id: 'hackernews', name: 'Hacker News', url: 'https://news.ycombinator.com' },
    ] },
    { id: 'entertainment', name: '影音娱乐', bookmarks: [
      { id: 'iqiyi', name: '爱奇艺', url: 'https://www.iqiyi.com' },
      { id: 'youku', name: '优酷', url: 'https://youku.com' },
      { id: 'youtube', name: 'YouTube', url: 'https://youtube.com' },
      { id: 'spotify', name: 'Spotify', url: 'https://spotify.com' },
    ] },
  ];

  var CATEGORIES = [
    '开发工具', 'AI 助手', '社交媒体', '资讯阅读', '影音娱乐',
    '购物', '教育学习', '金融理财', '效率工具', '其他',
  ];

  var ENGINES = {
    baidu:  { name: '百度', url: 'https://www.baidu.com/s?wd=', placeholder: '百度一下，你就知道...' },
    bing:   { name: '必应', url: 'https://www.bing.com/search?q=', placeholder: '搜索必应...' },
    google: { name: '谷歌', url: 'https://www.google.com/search?q=', placeholder: 'Search Google...' },
  };

  // ── State ────────────────────────────────────────────────────────
  var state = {
    engine: load(KEYS.ENGINE, 'baidu'),
    groups: load(KEYS.GROUPS, DEFAULT_GROUPS),
    viewMode: load(KEYS.VIEW, 'icon'),
    bg: load(KEYS.BG, null),
    recent: load(KEYS.RECENT, []),
    theme: load(KEYS.THEME, 'light'),
  };

  // edit-in-progress holder for Add/Edit modal
  var editingRef = null; // { groupId, bookmark } or null

  // ── Icons ────────────────────────────────────────────────────────
  function faviconCandidates(u) {
    try {
      var host = new URL(u).hostname;
      return [
        'https://www.google.com/s2/favicons?domain=' + host + '&sz=64',
        'https://icons.duckduckgo.com/ip3/' + host + '.ico',
        'https://api.iowen.cn/favicon/' + host + '.png',
        'https://api.faviconkit.com/' + host + '/64'
      ];
    } catch (e) { return []; }
  }

  function faviconUrl(u) {
    var list = faviconCandidates(u);
    return list.length ? list[0] : '';
  }

  var iconFetching = {};

  // Fetch site icon URL from candidate services. Uses <img> loading (no CORS
  // restrictions) and skips 1x1 placeholder images. Stores the icon URL.
  function autoFetchIcon(bm, onSuccess) {
    if (bm.icon) { if (onSuccess) onSuccess(bm.icon); return; }
    if (iconFetching[bm.url]) return;
    var list = faviconCandidates(bm.url);
    if (!list.length) { if (onSuccess) onSuccess(''); return; }
    iconFetching[bm.url] = true;
    function done(icon) {
      delete iconFetching[bm.url];
      bm.icon = icon;
      if (!icon) bm.color = bm.color || letterColorFor(bm.name);
      if (onSuccess) onSuccess(icon);
    }
    var i = 0;
    function tryNext() {
      if (i >= list.length) { done(''); return; }
      var url = list[i++];
      var img = new Image();
      var timer = setTimeout(function () { img.src = ''; tryNext(); }, 5000);
      img.onload = function () {
        clearTimeout(timer);
        if (img.naturalWidth > 2 && img.naturalHeight > 2) done(url);
        else tryNext();
      };
      img.onerror = function () { clearTimeout(timer); tryNext(); };
      img.src = url;
    }
    tryNext();
  }

  function svgIcon(paths, size) {
    size = size || 14;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  function pencilIcon(size) {
    return svgIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', size);
  }
  function trashIcon(size) {
    return svgIcon('<path d="M18 6L6 18M6 6l12 12"/>', size);
  }

  // ── Background ───────────────────────────────────────────────────
  function applyBg() {
    document.body.classList.toggle('has-bg', !!state.bg);
    if (state.bg) document.body.style.backgroundImage = 'url("' + state.bg + '")';
    else document.body.style.backgroundImage = 'none';
    $('#bg-overlay').classList.toggle('hidden', !state.bg);
    $('#bg-overlay').style.background = 'rgba(10,15,30,0.35)';
  }

  // ── Clock ────────────────────────────────────────────────────────
  var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function tickClock() {
    var now = new Date();
    $('#c-h').textContent = pad(now.getHours());
    $('#c-m').textContent = pad(now.getMinutes());
    $('#c-s').textContent = pad(now.getSeconds());
    $('#c-date').textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日  ' + WEEKDAYS[now.getDay()];
  }

  // ── Recent links ─────────────────────────────────────────────────
  var recentEl = $('#recent');

  function recordVisit(bm) {
    var filtered = state.recent.filter(function (r) { return r.url !== bm.url; });
    filtered.unshift({ id: uid(), name: bm.name, url: bm.url, icon: bm.icon || '', color: bm.color || '' });
    state.recent = filtered.slice(0, 9);
    save(KEYS.RECENT, state.recent);
    renderRecent();
  }

  function renderRecent() {
    var links = state.recent;
    if (!links.length) {
      recentEl.innerHTML = '';
      recentEl.classList.add('hidden');
      return;
    }
    recentEl.classList.remove('hidden');
    var html = '<p class="card-label">最近访问</p><div class="recent-list">';
    links.forEach(function (link, i) {
      var host = '';
      try { host = new URL(link.url).hostname.replace('www.', ''); } catch (e) { host = link.url; }
      html +=
        '<div class="recent-item" data-i="' + i + '">' +
          '<div class="fav-box"><span data-fav="' + i + '"></span></div>' +
          '<div class="min0">' +
            '<p class="name t1">' + escapeHtml(link.name) + '</p>' +
            '<p class="host t2">' + escapeHtml(host) + '</p>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    recentEl.innerHTML = html;

    links.forEach(function (link, i) {
      var slot = recentEl.querySelector('[data-fav="' + i + '"]');
      if (!slot) return;
      if (link.icon) {
        var img = document.createElement('img');
        img.alt = link.name;
        img.src = link.icon;
        img.onerror = function () {
          fallbackLetter(slot, link.name, link.color);
        };
        slot.appendChild(img);
      } else {
        fallbackLetter(slot, link.name, link.color);
        autoFetchIcon(link, function (icon) {
          if (!icon) return;
          slot.innerHTML = '';
          var img = document.createElement('img');
          img.alt = link.name;
          img.src = icon;
          img.onerror = function () {
            fallbackLetter(slot, link.name, link.color);
          };
          slot.appendChild(img);
          save(KEYS.RECENT, state.recent);
        });
      }
    });

    $$('.recent-item', recentEl).forEach(function (item) {
      item.addEventListener('click', function () {
        var link = links[parseInt(item.dataset.i, 10)];
        window.open(link.url, '_blank', 'noopener,noreferrer');
        recordVisit(link);
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Search ───────────────────────────────────────────────────────
  function initSearch() {
    var select = $('#engine-select');
    select.innerHTML = Object.keys(ENGINES).map(function (k) {
      return '<option value="' + k + '">' + ENGINES[k].name + '</option>';
    }).join('');
    select.value = state.engine;
    select.addEventListener('change', function () {
      state.engine = select.value;
      save(KEYS.ENGINE, state.engine);
      $('#search-input').placeholder = ENGINES[state.engine].placeholder;
    });

    $('#search-input').placeholder = ENGINES[state.engine].placeholder;
    var box = $('#search-box');
    $('#search-input').addEventListener('focus', function () { box.classList.add('focused'); });
    $('#search-input').addEventListener('blur', function () { box.classList.remove('focused'); });

    function doSearch() {
      var q = $('#search-input').value.trim();
      if (!q) return;
      window.open(ENGINES[state.engine].url + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
      $('#search-input').value = '';
    }
    $('#search-btn').addEventListener('click', doSearch);
    $('#search-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
  }

  // ── Bookmarks rendering ──────────────────────────────────────────
  var groupsEl = $('#groups');
  var draggingId = null;
  var draggingGroupId = null;

  function countText() {
    var total = state.groups.reduce(function (s, g) { return s + g.bookmarks.length; }, 0);
    $('#group-count').textContent = '共 ' + total + ' 个网址 · ' + state.groups.length + ' 个分组';
  }

  function renderGroups() {
    draggingId = null;
    groupsEl.className = 'groups-grid ' + (state.viewMode === 'icon' ? 'view-icon' : 'view-card');
    groupsEl.innerHTML = '';

    if (!state.groups.length) {
      groupsEl.appendChild(h('div', { class: 'empty-page' }, ['暂无网址，点击下方「添加网址」开始使用']));
      return;
    }

    state.groups.forEach(function (group) {
      groupsEl.appendChild(renderGroupCard(group));
    });
  }

  function glassStyle() {
    return {}; // theme variables drive styling; placeholder kept for clarity
  }

  function renderGroupCard(group) {
    var card = h('div', { class: 'group-card' });

    // header
    var titleBox = h('div', { class: 'group-title', text: group.name, title: '点击重命名' });

    var actions = h('div', { class: 'gh-actions' }, [
      h('button', { class: 'mini-btn edit hover-eff', title: '重命名分组', html: pencilIcon(13), on: { click: function (e) { e.stopPropagation(); startRename(group, card); } } }),
      h('button', { class: 'mini-btn del hover-eff', title: '删除分组', html: trashIcon(13), on: { click: function (e) { e.stopPropagation(); deleteGroup(group.id); } } }),
    ]);

    var head = h('div', { class: 'group-head' }, [titleBox, actions]);

    // drag the header to reorder groups
    head.setAttribute('draggable', 'true');
    head.addEventListener('dragstart', function (e) {
      draggingGroupId = group.id;
      card.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', group.id); } catch (err) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    head.addEventListener('dragend', function () { resetGroupDrag(); });

    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (draggingGroupId && draggingGroupId !== group.id && !card.classList.contains('drag-over')) {
        $$('.drag-over', groupsEl).forEach(function (el) { el.classList.remove('drag-over'); });
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', function () { card.classList.remove('drag-over'); });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!draggingGroupId || draggingGroupId === group.id) { resetGroupDrag(); return; }
      reorderGroups(draggingGroupId, group.id);
      resetGroupDrag();
    });

    // long-press the header to reveal edit/delete buttons
    var longTimer = null;
    var longPressed = false;
    var pressPos = null;
    var cancelLong = function () { clearTimeout(longTimer); longTimer = null; };

    titleBox.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      startRename(group, card);
    });
    head.addEventListener('click', function () {
      if (longPressed) { longPressed = false; }
    });
    head.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pressPos = { x: e.clientX, y: e.clientY };
      longPressed = false;
      cancelLong();
      longTimer = setTimeout(function () {
        longPressed = true;
        hideAllGroupActions();
        actions.classList.add('show');
      }, 500);
    });
    head.addEventListener('pointermove', function (e) {
      if (pressPos && (Math.abs(e.clientX - pressPos.x) > 8 || Math.abs(e.clientY - pressPos.y) > 8)) {
        cancelLong();
      }
    });
    head.addEventListener('pointerup', cancelLong);
    head.addEventListener('pointerleave', function () { cancelLong(); pressPos = null; });
    head.addEventListener('pointercancel', function () { cancelLong(); pressPos = null; });

    card.appendChild(head);

    // items
    if (state.viewMode === 'icon') {
      var wrap = h('div', { class: 'icon-grid' });
      group.bookmarks.forEach(function (bm) {
        wrap.appendChild(renderIconItem(group, bm));
      });
      card.appendChild(wrap);
    } else {
      var list = h('div', { class: 'card-list' });
      group.bookmarks.forEach(function (bm) {
        list.appendChild(renderCardItem(group, bm));
      });
      card.appendChild(list);
    }

    if (!group.bookmarks.length) {
      card.appendChild(h('p', { class: 'empty-hint', text: '暂无网址' }));
    }
    return card;
  }

  function startRename(group, card) {
    var input = h('input', { attrs: { type: 'text', value: group.name, maxlength: '30' } });
    var titleBox = $('.group-title', card);
    var actions = $('.gh-actions', card);
    actions.classList.add('hidden');
    titleBox.replaceWith(input);
    input.focus();
    input.select();
    var done = function (commit) {
      var val = input.value.trim();
      if (commit && val && val !== group.name) renameGroup(group.id, val);
      renderGroups();
    };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', function () { done(true); });
  }

  function itemActions(group, bm) {
    return h('div', { class: 'item-actions' }, [
      h('button', { class: 'item-act edit', title: '编辑', html: pencilIcon(12), on: { click: function (e) { e.stopPropagation(); openEditModal(group, bm); } } }),
      h('button', { class: 'item-act del', title: '删除', html: trashIcon(12), on: { click: function (e) { e.stopPropagation(); deleteBookmark(group.id, bm.id); } } }),
    ]);
  }

  function faviconEl(bm) {
    var box = h('div', { class: 'fav-box' });
    if (bm.icon) {
      var img = h('img', { attrs: { alt: bm.name } });
      img.src = bm.icon;
      img.onerror = function () { fallbackLetter(box, bm.name, bm.color); };
      box.appendChild(img);
    } else {
      fallbackLetter(box, bm.name, bm.color);
      autoFetchIcon(bm, function (icon) {
        if (!icon) return;
        box.innerHTML = '';
        var img = h('img', { attrs: { alt: bm.name } });
        img.src = icon;
        img.onerror = function () { fallbackLetter(box, bm.name, bm.color); };
        box.appendChild(img);
        save(KEYS.GROUPS, state.groups);
      });
    }
    return box;
  }

  function letterColorFor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    var palette = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b',
      '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6', '#84cc16', '#ef4444'
    ];
    return palette[Math.abs(hash) % palette.length];
  }

  function fallbackLetter(box, name, color) {
    box.style.background = color || letterColorFor(name);
    box.innerHTML = '<span style="font-weight:bold;color:#fff;font-size:0.75rem;line-height:1;">' + escapeHtml((name[0] || '?').toUpperCase()) + '</span>';
  }

  function renderIconItem(group, bm) {
    var actionsEl = itemActions(group, bm);
    var item = h('div', {
      class: 'icon-item',
      dataset: { id: bm.id },
      attrs: { draggable: 'true', title: bm.url },
    }, [
      actionsEl,
      faviconEl(bm),
      h('span', { class: 'name', text: bm.name }),
    ]);

    var longPressTimer = null;
    var longPressed = false;
    var pressPos = null;

    function cancelLongPress() {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    item.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      hideAllIconActions();
      visit(bm);
    });

    item.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pressPos = { x: e.clientX, y: e.clientY };
      longPressed = false;
      cancelLongPress();
      longPressTimer = setTimeout(function () {
        longPressed = true;
        hideAllIconActions();
        actionsEl.classList.add('show');
      }, 500);
    });

    item.addEventListener('pointermove', function (e) {
      if (pressPos && (Math.abs(e.clientX - pressPos.x) > 8 || Math.abs(e.clientY - pressPos.y) > 8)) {
        cancelLongPress();
      }
    });

    item.addEventListener('pointerup', cancelLongPress);
    item.addEventListener('pointerleave', function () { cancelLongPress(); pressPos = null; });
    item.addEventListener('pointercancel', function () { cancelLongPress(); pressPos = null; });

    bindDrag(item, group, bm);
    return item;
  }

  function renderCardItem(group, bm) {
    var host = '';
    try { host = new URL(bm.url).hostname.replace('www.', ''); } catch (e) { host = bm.url; }
    var actionsEl = itemActions(group, bm);
    var item = h('div', {
      class: 'card-item',
      dataset: { id: bm.id },
      attrs: { draggable: 'true', title: bm.url },
    }, [
      faviconEl(bm),
      h('div', { class: 'info' }, [
        h('p', { class: 'name t1', text: bm.name }),
        h('p', { class: 'host t2', text: host }),
      ]),
      actionsEl,
    ]);

    var longPressTimer = null;
    var longPressed = false;
    var pressPos = null;

    function cancelLongPress() {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    item.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      hideAllIconActions();
      visit(bm);
    });

    item.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pressPos = { x: e.clientX, y: e.clientY };
      longPressed = false;
      cancelLongPress();
      longPressTimer = setTimeout(function () {
        longPressed = true;
        hideAllIconActions();
        actionsEl.classList.add('show');
      }, 500);
    });

    item.addEventListener('pointermove', function (e) {
      if (pressPos && (Math.abs(e.clientX - pressPos.x) > 8 || Math.abs(e.clientY - pressPos.y) > 8)) {
        cancelLongPress();
      }
    });

    item.addEventListener('pointerup', cancelLongPress);
    item.addEventListener('pointerleave', function () { cancelLongPress(); pressPos = null; });
    item.addEventListener('pointercancel', function () { cancelLongPress(); pressPos = null; });

    bindDrag(item, group, bm);
    return item;
  }

  function visit(bm) {
    window.open(bm.url, '_blank', 'noopener,noreferrer');
    recordVisit(bm);
  }

  function hideAllIconActions() {
    $$('.icon-item .item-actions', groupsEl).forEach(function (el) { el.classList.remove('show'); });
    $$('.card-item .item-actions', groupsEl).forEach(function (el) { el.classList.remove('show'); });
  }

  function hideAllGroupActions() {
    $$('.group-head .gh-actions', groupsEl).forEach(function (el) { el.classList.remove('show'); });
  }

  function bindDrag(item, group, bm) {
    item.addEventListener('dragstart', function (e) {
      draggingId = bm.id;
      item.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', bm.id); } catch (err) {}
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (draggingId && draggingId !== bm.id && !item.classList.contains('drag-over')) {
        $$('.drag-over', groupsEl).forEach(function (el) { el.classList.remove('drag-over'); });
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('dragleave', function () { item.classList.remove('drag-over'); });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!draggingId || draggingId === bm.id) { resetDrag(); return; }
      reorderBookmark(group.id, draggingId, bm.id);
      resetDrag();
    });
    item.addEventListener('dragend', function () { resetDrag(); });
  }

  function resetDrag() {
    $$('.dragging', groupsEl).forEach(function (el) { el.classList.remove('dragging'); });
    $$('.drag-over', groupsEl).forEach(function (el) { el.classList.remove('drag-over'); });
    draggingId = null;
  }

  function resetGroupDrag() {
    $$('.group-card.dragging', groupsEl).forEach(function (el) { el.classList.remove('dragging'); });
    $$('.group-card.drag-over', groupsEl).forEach(function (el) { el.classList.remove('drag-over'); });
    draggingGroupId = null;
  }

  // ── Mutations ────────────────────────────────────────────────────
  function commit() {
    save(KEYS.GROUPS, state.groups);
    countText();
    renderGroups();
  }

  function addBookmark(groupName, bookmark) {
    var exists = state.groups.find(function (g) { return g.name === groupName; });
    var newBm = Object.assign({}, bookmark, { id: uid() });
    if (exists) {
      exists.bookmarks = exists.bookmarks.concat([newBm]);
    } else {
      state.groups.push({ id: uid(), name: groupName, bookmarks: [newBm] });
    }
    commit();
    autoFetchIcon(newBm);
  }

  function saveEdit(groupId, bookmark) {
    state.groups.forEach(function (g) {
      if (g.id !== groupId) return;
      g.bookmarks = g.bookmarks.map(function (b) {
        return b.id === bookmark.id ? bookmark : b;
      });
    });
    commit();
    autoFetchIcon(bookmark);
  }

  function deleteBookmark(groupId, bookmarkId) {
    state.groups = state.groups
      .map(function (g) {
        if (g.id !== groupId) return g;
        var next = Object.assign({}, g, { bookmarks: g.bookmarks.filter(function (b) { return b.id !== bookmarkId; }) });
        return next;
      })
      .filter(function (g) { return g.bookmarks.length > 0; });
    commit();
  }

  function reorderBookmark(groupId, fromId, toId) {
    state.groups.forEach(function (g) {
      if (g.id !== groupId) return;
      var items = g.bookmarks.slice();
      var fromIdx = items.findIndex(function (b) { return b.id === fromId; });
      var toIdx = items.findIndex(function (b) { return b.id === toId; });
      if (fromIdx < 0 || toIdx < 0) return;
      var moved = items.splice(fromIdx, 1)[0];
      items.splice(toIdx, 0, moved);
      g.bookmarks = items;
    });
    commit();
  }

  function renameGroup(groupId, newName) {
    state.groups.forEach(function (g) {
      if (g.id === groupId) g.name = newName;
    });
    commit();
  }

  function reorderGroups(fromId, toId) {
    var items = state.groups.slice();
    var fromIdx = items.findIndex(function (g) { return g.id === fromId; });
    var toIdx = items.findIndex(function (g) { return g.id === toId; });
    if (fromIdx < 0 || toIdx < 0) return;
    var moved = items.splice(fromIdx, 1)[0];
    items.splice(toIdx, 0, moved);
    state.groups = items;
    commit();
  }

  function deleteGroup(groupId) {
    var g = state.groups.find(function (g) { return g.id === groupId; });
    if (g && window.confirm('确定删除分组「' + g.name + '」及其中所有网址吗？')) {
      state.groups = state.groups.filter(function (x) { return x.id !== groupId; });
      commit();
    }
  }

  // ── View mode ────────────────────────────────────────────────────
  function initViewSeg() {
    $('#seg-icon').addEventListener('click', function () { setViewMode('icon'); });
    $('#seg-card').addEventListener('click', function () { setViewMode('card'); });
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    save(KEYS.VIEW, state.viewMode);
    $('#seg-icon').classList.toggle('active', mode === 'icon');
    $('#seg-card').classList.toggle('active', mode === 'card');
    renderGroups();
  }

  // ── Theme ───────────────────────────────────────────────────────
  var SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function applyTheme() {
    var groupsEl = $('#groups');
    var dark = state.theme === 'dark';
    groupsEl.classList.toggle('theme-dark', dark);
    $('#btn-theme').innerHTML = dark ? SUN_SVG : MOON_SVG;
    save(KEYS.THEME, state.theme);
  }

  function initTheme() {
    $('#btn-theme').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
    });
  }

  // ── Add / Edit modal ─────────────────────────────────────────────
  var addModal = $('#add-modal');
  var customIcon = '';
  var faviconFailed = false;

  function initAddModal() {
    var preview = $('#icon-preview');
    var fileInput = $('#icon-file');

    preview.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) { customIcon = ev.target.result; faviconFailed = false; refreshIconPreview(); };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    $('#f-url').addEventListener('input', function () {
      faviconFailed = false;
      if (!customIcon) { customIcon = ''; }
      refreshIconPreview();
    });

    $('#f-category').addEventListener('change', function () {
      $('#f-custom-cat').classList.toggle('hidden', $('#f-category').value !== '__new__');
    });

    $('#btn-fetch-icon').addEventListener('click', fetchIconNow);
    $('#btn-upload-icon').addEventListener('click', function () { fileInput.click(); });
    $('#btn-letter-icon').addEventListener('click', function () {
      customIcon = '';
      faviconFailed = true;
      refreshIconPreview();
    });

    $('#add-submit').addEventListener('click', submitAddModal);
    $('#f-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitAddModal(); });
    $('#f-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitAddModal(); });
  }

  function allCategories() {
    var seen = {};
    state.groups.forEach(function (g) { seen[g.name] = true; });
    CATEGORIES.forEach(function (c) { seen[c] = true; });
    return Object.keys(seen);
  }

  function openAddModal() {
    editingRef = null;
    $('#add-title').textContent = '添加网址';
    $('#add-submit').textContent = '添加网址';
    $('#f-name').value = '';
    $('#f-url').value = '';
    customIcon = '';
    faviconFailed = false;
    var cats = allCategories();
    fillCategorySelect(cats, state.groups[0] ? state.groups[0].name : cats[0]);
    $('#f-custom-cat').classList.add('hidden');
    refreshIconPreview();
    showModal(addModal);
  }

  function openEditModal(group, bm) {
    editingRef = { groupId: group.id, bookmark: bm };
    $('#add-title').textContent = '编辑网址';
    $('#add-submit').textContent = '保存更改';
    $('#f-name').value = bm.name;
    $('#f-url').value = bm.url.replace(/^https:\/\//, '').replace(/^http:\/\//, '');
    customIcon = bm.icon || '';
    faviconFailed = false;
    var cats = allCategories();
    fillCategorySelect(cats, group.name);
    $('#f-custom-cat').classList.add('hidden');
    refreshIconPreview();
    showModal(addModal);
  }

  function fillCategorySelect(cats, selected) {
    var select = $('#f-category');
    select.innerHTML = cats.map(function (c) {
      return '<option value="' + escapeHtml(c) + '"' + (c === selected ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
    }).join('') + '<option value="__new__">+ 新建分组…</option>';
  }

  function refreshIconPreview() {
    var url = $('#f-url').value.trim();
    var previewIcon = customIcon || (url ? faviconFromUrl(url) : '');
    var img = $('#icon-preview-img');
    var letter = $('#icon-preview-letter');
    var name = $('#f-name').value;
    if (previewIcon && !faviconFailed) {
      img.src = previewIcon;
      img.onerror = function () { faviconFailed = true; refreshIconPreview(); };
      img.classList.remove('hidden');
      letter.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      letter.classList.remove('hidden');
      letter.textContent = (name[0] || '?').toUpperCase();
    }
  }

  function faviconFromUrl(raw) {
    var withProto = raw.indexOf('http') === 0 ? raw : 'https://' + raw;
    return faviconUrl(withProto);
  }

  function fetchIconNow() {
    var name = $('#f-name').value.trim();
    var url = $('#f-url').value.trim();
    if (!url) return;
    var fullUrl = url.indexOf('http') === 0 ? url : 'https://' + url;
    var temp = { name: name || fullUrl, url: fullUrl, icon: '', color: '' };
    customIcon = '';
    faviconFailed = false;
    refreshIconPreview();
    autoFetchIcon(temp, function (icon) {
      if (icon) { customIcon = icon; faviconFailed = false; }
      else { customIcon = ''; faviconFailed = true; }
      refreshIconPreview();
    });
  }

  function submitAddModal() {
    var name = $('#f-name').value.trim();
    var url = $('#f-url').value.trim();
    if (!name || !url) return;
    var catVal = $('#f-category').value;
    var finalCat = catVal === '__new__' ? $('#f-custom-cat').value.trim() : catVal;
    if (catVal === '__new__' && !finalCat) return;
    var fullUrl = url.indexOf('http') === 0 ? url : 'https://' + url;

    // Auto-fetch site icon on add; keep manually uploaded icon if present
    var icon = customIcon || undefined;

    if (editingRef) {
      var group = state.groups.find(function (g) { return g.name === finalCat; });
      saveEdit(group ? group.id : editingRef.groupId, Object.assign({}, editingRef.bookmark, {
        name: name, url: fullUrl, icon: icon,
      }));
    } else {
      addBookmark(finalCat, { name: name, url: fullUrl, icon: icon });
    }
    hideModal(addModal);
  }

  // ── Import modal ─────────────────────────────────────────────────
  var importModal = $('#import-modal');
  var parsedGroups = null;

  function parseBookmarkHTML(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var groups = [];

    function processFolder(dl, folderName) {
      var direct = [];
      for (var i = 0; i < dl.children.length; i++) {
        var dt = dl.children[i];
        if (dt.tagName !== 'DT') continue;
        var first = dt.firstElementChild;
        if (!first) continue;
        if (first.tagName === 'A') {
          var href = first.getAttribute('href') || '';
          if (href.indexOf('http') === 0) {
            direct.push({ id: uid(), name: first.textContent.trim() || href, url: href });
          }
        } else if (first.tagName === 'H3') {
          var sub = dt.querySelector('dl');
          if (sub) processFolder(sub, first.textContent.trim() || '文件夹');
        }
      }
      if (direct.length) {
        var existing = groups.find(function (g) { return g.name === folderName; });
        if (existing) existing.bookmarks.push.apply(existing.bookmarks, direct);
        else groups.push({ id: uid(), name: folderName, bookmarks: direct });
      }
    }

    var root = doc.querySelector('dl');
    if (root) processFolder(root, '导入的收藏夹');
    return groups.filter(function (g) { return g.bookmarks.length > 0; });
  }

  function initImportModal() {
    var zone = $('#drop-zone');
    var fileInput = $('#import-file');
    var nameEl = $('#dz-name');

    zone.addEventListener('click', function () { fileInput.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('dragging'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('dragging');
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) processImportFile(file);
    });
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) processImportFile(file);
      e.target.value = '';
    });

    $('#import-submit').addEventListener('click', function () {
      if (!parsedGroups) return;
      state.groups.forEach(function (g) {
        var incoming = parsedGroups.find(function (ng) { return ng.name === g.name; });
        if (incoming) {
          incoming.bookmarks.forEach(function (b) { g.bookmarks.push(b); });
        }
      });
      parsedGroups.forEach(function (ng) {
        if (!state.groups.find(function (g) { return g.name === ng.name; })) {
          state.groups.push(ng);
        }
      });
      hideModal(importModal);
      commit();
    });
  }

  function processImportFile(file) {
    $('#dz-name').textContent = file.name;
    $('#import-error').classList.add('hidden');
    var reader = new FileReader();
    reader.onload = function (ev) {
      var result = parseBookmarkHTML(ev.target.result);
      if (!result.length) {
        parsedGroups = null;
        $('#import-error').textContent = '未找到有效的收藏夹数据，请确认此文件为浏览器导出的收藏夹 HTML。';
        $('#import-error').classList.remove('hidden');
        $('#import-preview').classList.add('hidden');
        $('#import-submit').disabled = true;
      } else {
        parsedGroups = result;
        $('#import-error').classList.add('hidden');
        var total = result.reduce(function (s, g) { return s + g.bookmarks.length; }, 0);
        var html = '<p class="p-title">预览 — ' + result.length + ' 个分组 · ' + total + ' 个网址</p>';
        result.forEach(function (g) {
          html += '<div class="p-row"><span class="p-name">' + escapeHtml(g.name) + '</span><span class="p-count">' + g.bookmarks.length + ' 个</span></div>';
        });
        $('#import-preview').innerHTML = html;
        $('#import-preview').classList.remove('hidden');
        $('#import-submit').disabled = false;
        $('#import-submit').textContent = '导入 ' + total + ' 个网址';
      }
    };
    reader.readAsText(file);
  }

  function openImportModal() {
    parsedGroups = null;
    $('#dz-name').textContent = '点击或拖拽收藏夹 HTML 文件到此处';
    $('#import-error').classList.add('hidden');
    $('#import-preview').classList.add('hidden');
    $('#import-submit').disabled = true;
    $('#import-submit').textContent = '导入收藏夹';
    showModal(importModal);
  }

  // ── Background modal ─────────────────────────────────────────────
  var bgModal = $('#bg-modal');

  function fetchBingWallpaper() {
    return fetch('https://bing.biturl.top/?resolution=1920&format=json&index=random&mkt=zh-CN')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.url) throw new Error('no url');
        return data.url;
      });
  }

  function initBgModal() {
    $('#opt-none').addEventListener('click', function () {
      state.bg = null;
      save(KEYS.BG, null);
      applyBg();
      hideModal(bgModal);
    });

    $('#opt-bing').addEventListener('click', function () {
      var btn = $('#opt-bing');
      var iconEl = $('#bing-icon');
      iconEl.innerHTML = '<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
      fetchBingWallpaper()
        .then(function (url) {
          state.bg = url;
          save(KEYS.BG, url);
          applyBg();
          hideModal(bgModal);
        })
        .catch(function () {
          $('#bg-error').textContent = '获取必应壁纸失败，请检查网络后重试。';
          $('#bg-error').classList.remove('hidden');
        });
    });

    $('#opt-upload').addEventListener('click', function () { $('#bg-file').click(); });
    $('#bg-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        state.bg = ev.target.result;
        save(KEYS.BG, ev.target.result);
        applyBg();
        hideModal(bgModal);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    $('#bg-close').addEventListener('click', function () { hideModal(bgModal); });
  }

  function openBgModal() {
    $('#bg-error').classList.add('hidden');
    var hasBg = !!state.bg;
    $('#opt-none').classList.toggle('active', !hasBg);
    $('#opt-bing').classList.toggle('active', false);
    $('#opt-upload').classList.toggle('active', false);
    var preview = $('#bg-preview');
    if (hasBg) {
      $('#bg-preview-img').src = state.bg;
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
    // restore bing icon
    $('#bing-icon').innerHTML = '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';
    showModal(bgModal);
  }

  // ── Export / Restore ─────────────────────────────────────────────
  function initBackup() {
    $('#btn-clear').addEventListener('click', function () {
      if (!state.groups.length) { window.alert('当前没有网址数据。'); return; }
      if (!window.confirm('确定要清空所有网址和分组吗？此操作不可恢复，建议先导出备份。')) return;
      state.groups = [];
      commit();
    });

    $('#btn-export').addEventListener('click', function () {
      var groups = state.groups.map(function (g) {
        return Object.assign({}, g, {
          bookmarks: (g.bookmarks || []).map(function (b) {
            return {
              id: b.id,
              name: b.name,
              url: b.url,
              icon: b.icon || '',
              color: b.color || letterColorFor(b.name)
            };
          })
        });
      });
      var payload = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), groups: groups }, null, 2);
      var blob = new Blob([payload], { type: 'application/json' });
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = 'nav-backup.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
    });

    $('#btn-restore').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (Array.isArray(data.groups)) {
              state.groups = data.groups;
              commit();
            } else {
              window.alert('备份文件格式不正确，请重新选择。');
            }
          } catch (err) {
            window.alert('无法解析备份文件。');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // ── Modal plumbing ───────────────────────────────────────────────
  function showModal(modal) { modal.classList.remove('hidden'); }
  function hideModal(modal) { modal.classList.add('hidden'); }

  function initModalPlumbing() {
    $$('.modal-mask').forEach(function (mask) {
      mask.addEventListener('mousedown', function (e) {
        if (e.target === mask) hideModal(mask);
      });
      mask.querySelectorAll('[data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { hideModal(mask); });
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    applyBg();
    tickClock();
    setInterval(tickClock, 1000);

    initSearch();
    initViewSeg();
    initTheme();
    initAddModal();
    initImportModal();
    initBgModal();
    initBackup();
    initModalPlumbing();

    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.icon-item')) hideAllIconActions();
      if (!e.target.closest || !e.target.closest('.group-head')) hideAllGroupActions();
    });

    $('#btn-add').addEventListener('click', openAddModal);
    $('#btn-import').addEventListener('click', openImportModal);
    $('#btn-bg').addEventListener('click', openBgModal);

    $('#seg-icon').classList.toggle('active', state.viewMode === 'icon');
    $('#seg-card').classList.toggle('active', state.viewMode === 'card');

    renderRecent();
    countText();
    applyTheme();
    renderGroups();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
