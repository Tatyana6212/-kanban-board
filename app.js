(() => {
  'use strict';
  const STORAGE_KEY = 'kanban-board.stage1.v1';
  const THEME_KEY = 'kanban-board.theme';
  const palette = [
    { color: '#f87171', name: 'Красный' }, { color: '#e879f9', name: 'Малиновый' },
    { color: '#fb923c', name: 'Оранжевый' }, { color: '#818cf8', name: 'Синий' },
    { color: '#60a5fa', name: 'Голубой' }, { color: '#4ade80', name: 'Зелёный' },
    { color: '#22d3ee', name: 'Лазурный' }, { color: '#fca5a5', name: 'Светло-красный' },
    { color: '#f0abfc', name: 'Светло-малиновый' }, { color: '#fdba74', name: 'Светло-оранжевый' },
    { color: '#a5b4fc', name: 'Светло-синий' }, { color: '#93c5fd', name: 'Светло-голубой' },
    { color: '#86efac', name: 'Светло-зелёный' }, { color: '#67e8f9', name: 'Светло-лазурный' }
  ];
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const initialColumns = () => ['', 'Принято', 'В деле', 'Закончено'].map((name, index) => ({ id: id(), name, color: palette[index].color, cards: [] }));
  const board = document.querySelector('#board');
  const dialog = document.querySelector('#card-dialog');
  const form = document.querySelector('#card-form');
  const titleInput = document.querySelector('#card-title');
  const descriptionInput = document.querySelector('#card-description');
  const storageLabel = document.querySelector('#storage-label');
  const columnDialog = document.querySelector('#column-dialog');
  const columnForm = document.querySelector('#column-form');
  const cardDeleteButton = document.querySelector('#delete-card');
  const columnDeleteButton = document.querySelector('#delete-column');
  const fileMenu = document.querySelector('#file-menu');
  const fileMenuTrigger = document.querySelector('#file-menu-trigger');
  const fileInput = document.querySelector('#file-input');
  const themeToggle = document.querySelector('#theme-toggle');
  const themeIcon = document.querySelector('#theme-icon');
  const cardColorInput = document.querySelector('#card-color');
  const columnColorInput = document.querySelector('#column-color');
  let columns = initialColumns();
  let targetColumnId = null;
  let editingCard = null;
  let editingColumnId = null;
  let returnFocus = null;
  let pointerCandidate = null;
  let activeDrag = null;
  let dragFrame = 0;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  let chosenTheme = null;
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') chosenTheme = storedTheme;
  } catch { /* Keep the system preference when storage is unavailable. */ }
  function applyTheme(theme) {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add(theme);
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    themeIcon.textContent = theme === 'dark' ? '☀' : '☾';
  }
  applyTheme(chosenTheme || (systemTheme.matches ? 'dark' : 'light'));
  systemTheme.addEventListener?.('change', event => { if (!chosenTheme) applyTheme(event.matches ? 'dark' : 'light'); });
  themeToggle.addEventListener('click', () => {
    chosenTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(chosenTheme);
    try { localStorage.setItem(THEME_KEY, chosenTheme); } catch { /* The switch still works for this visit. */ }
  });
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.length >= 1 && stored.every(column => column && typeof column.id === 'string' && typeof column.name === 'string' && isColor(column.color) && Array.isArray(column.cards) && column.cards.every(card => card && typeof card.title === 'string' && typeof card.description === 'string'))) {
      columns = stored;
      columns.forEach(column => column.cards.forEach(card => {
        if (typeof card.id !== 'string') card.id = id();
        if (!isColor(card.color)) card.color = column.color;
      }));
    }
  } catch { storageLabel.textContent = 'Сохранение в браузере недоступно'; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(columns)); }
    catch { storageLabel.textContent = 'Не удалось сохранить: данные доступны до закрытия'; }
  }
  function isColor(color) { return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color); }
  function columnColor(color, whiteMix) {
    const channels = color.slice(1).match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
    return `rgb(${channels.map(channel => Math.round(channel + (255 - channel) * whiteMix)).join(' ')})`;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v6m4-6v6"/></svg>';
  function trashButton(kind, item) {
    const button = element('button', 'tile-delete');
    button.type = 'button';
    button.dataset[kind === 'card' ? 'deleteCardId' : 'deleteColumnId'] = item.id;
    button.setAttribute('aria-label', `Удалить ${kind === 'card' ? 'карточку' : 'колонку'} «${item.title || item.name || 'Без названия'}»`);
    button.title = kind === 'card' ? 'Удалить карточку' : 'Удалить колонку';
    button.innerHTML = trashIcon;
    return button;
  }
  function renderPalette(container, input) {
    palette.forEach(color => {
      const button = element('button', 'palette-swatch');
      button.type = 'button';
      button.dataset.color = color.color;
      button.style.setProperty('--swatch', color.color);
      button.setAttribute('aria-label', color.name);
      button.title = color.name;
      button.addEventListener('click', () => { input.value = color.color; updatePalette(container, input); });
      container.append(button);
    });
    input.addEventListener('input', () => updatePalette(container, input));
  }
  function updatePalette(container, input) {
    container.querySelectorAll('.palette-swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color.toLowerCase() === input.value.toLowerCase())));
  }
  renderPalette(document.querySelector('#card-palette'), cardColorInput);
  renderPalette(document.querySelector('#column-palette'), columnColorInput);
  function addButton(column) {
    const button = element('button', column ? 'add-card' : 'add-card add-column');
    button.type = 'button';
    button.dataset.columnId = column?.id || '';
    const plus = element('span', 'plus', '+');
    plus.setAttribute('aria-hidden', 'true');
    button.append(plus, element('span', '', 'Добавить карточку'));
    if (!column) button.append(element('small', '', 'в новой колонке'));
    button.setAttribute('aria-label', column ? `Добавить карточку: ${column.name || 'колонка без названия'}` : 'Добавить карточку в новой колонке');
    return button;
  }
  function render() {
    board.replaceChildren();
    columns.forEach(column => {
      const section = element('section', 'column');
      section.dataset.columnId = column.id;
      section.setAttribute('aria-label', column.name || 'Колонка без названия');
      section.style.setProperty('--column-color', column.color);
      section.style.setProperty('--column-bg', columnColor(column.color, .91));
      section.style.setProperty('--column-border', columnColor(column.color, .82));
      const header = element('header', 'column-header');
      header.dataset.dragHandle = 'column';
      header.dataset.columnId = column.id;
      header.setAttribute('aria-label', `Перетащить колонку «${column.name || 'Без названия'}»`);
      const heading = element('div', 'column-heading');
      const dot = element('span', 'color-dot');
      dot.setAttribute('aria-hidden', 'true');
      heading.append(dot, element('h2', '', column.name));
      const headerActions = element('div', 'column-header-actions');
      headerActions.append(element('span', 'card-count', String(column.cards.length)));
      const editColumnButton = element('button', 'edit-column-button', '···');
      editColumnButton.type = 'button'; editColumnButton.dataset.editColumnId = column.id;
      editColumnButton.setAttribute('aria-label', `Настроить колонку «${column.name || 'Без названия'}»`);
      headerActions.append(editColumnButton, trashButton('column', column));
      header.append(heading, headerActions);
      const cards = element('div', 'cards');
      column.cards.forEach(card => {
        const tile = element('article', 'card');
        tile.dataset.cardId = card.id;
        tile.style.setProperty('--card-color', card.color || column.color);
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tile.setAttribute('aria-label', `Редактировать карточку «${card.title}»; перетащить для перемещения`);
        tile.append(element('h3', '', card.title));
        if (card.description) tile.append(element('p', '', card.description));
        tile.append(trashButton('card', card));
        cards.append(tile);
      });
      cards.append(addButton(column));
      section.append(header, cards);
      board.append(section);
    });
    board.append(addButton(null));
    updateScrollControls();
  }
  function updateScrollControls() {
    document.querySelector('#scroll-left').disabled = board.scrollLeft <= 1;
    document.querySelector('#scroll-right').disabled = board.scrollLeft + board.clientWidth >= board.scrollWidth - 2;
  }
  function animateShift(parent, move) {
    const children = Array.from(parent.children);
    const oldRects = new Map(children.map(child => [child, child.getBoundingClientRect()]));
    move();
    for (const child of parent.children) {
      const oldRect = oldRects.get(child);
      if (!oldRect || child === activeDrag?.placeholder) continue;
      const rect = child.getBoundingClientRect();
      const dx = oldRect.left - rect.left;
      const dy = oldRect.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      child.style.transition = 'none';
      child.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        child.style.transition = '';
        child.style.transform = '';
      });
    }
  }
  function movePlaceholder(parent, before = null) {
    if (!activeDrag || activeDrag.placeholder.parentElement === parent && activeDrag.placeholder.nextElementSibling === before) return;
    animateShift(parent, () => parent.insertBefore(activeDrag.placeholder, before));
  }
  function beginDrag(point) {
    if (!pointerCandidate || activeDrag) return;
    const { source, kind, column, card, pointerId, x, y } = pointerCandidate;
    const rect = source.getBoundingClientRect();
    const placeholder = element('div', kind === 'card' ? 'card drag-placeholder' : 'column drag-placeholder column-placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.flexBasis = `${rect.width}px`;
    const ghost = source.cloneNode(true);
    ghost.className = kind === 'card' ? 'card drag-ghost' : 'column drag-ghost column-ghost';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${point.clientX - rect.width / 2}px`;
    ghost.style.top = `${point.clientY - Math.min(point.clientY - rect.top, rect.height / 2)}px`;
    ghost.style.setProperty('--drag-rotation', kind === 'card' ? '-2deg' : '-1.25deg');
    document.body.append(ghost);
    source.replaceWith(placeholder);
    activeDrag = { kind, columnId: column.id, cardId: card?.id, source, placeholder, ghost, pointerId, offsetX: rect.width / 2, offsetY: Math.min(point.clientY - rect.top, rect.height / 2) };
    positionGhost(point);
    document.body.classList.add('is-dragging');
    pointerCandidate = null;
    document.querySelector('#announcement').textContent = kind === 'card' ? 'Перемещение карточки. Отпустите, чтобы поместить.' : 'Перемещение колонки. Отпустите, чтобы поместить.';
  }
  function positionGhost(point) {
    if (!activeDrag) return;
    activeDrag.ghost.style.left = `${point.clientX - activeDrag.offsetX}px`;
    activeDrag.ghost.style.top = `${point.clientY - activeDrag.offsetY}px`;
  }
  function nearestSibling(container, coordinate, axis) {
    const center = item => { const rect = item.getBoundingClientRect(); return axis === 'x' ? rect.left + rect.width / 2 : rect.top + rect.height / 2; };
    const siblings = Array.from(container.children).filter(item => item !== activeDrag.placeholder && !(item.classList.contains('add-card')) && !(item.classList.contains('card') && item.dataset.cardId === activeDrag.cardId));
    return siblings.find(item => coordinate < center(item)) || null;
  }
  function updateDropTarget(point) {
    const target = document.elementFromPoint(point.clientX, point.clientY);
    if (!target) return;
    if (activeDrag.kind === 'column') {
      const lastTile = board.querySelector('.add-column');
      const column = target.closest('.column');
      if (column && column.parentElement === board && column.dataset.columnId !== activeDrag.columnId) {
        movePlaceholder(board, nearestSibling(board, point.clientX, 'x'));
      } else if (lastTile?.contains(target)) {
        movePlaceholder(board, lastTile);
      } else if (target === board && point.clientX > board.getBoundingClientRect().left && point.clientX < board.getBoundingClientRect().right) {
        movePlaceholder(board, nearestSibling(board, point.clientX, 'x') || lastTile);
      }
      return;
    }
    const addColumn = target.closest('.add-column');
    if (addColumn) {
      activeDrag.dropOnNewColumn = true;
      addColumn.classList.add('is-drop-target');
      const prior = board.querySelectorAll('.add-column.is-drop-target');
      prior.forEach(tile => { if (tile !== addColumn) tile.classList.remove('is-drop-target'); });
      return;
    }
    if (activeDrag.dropOnNewColumn) {
      board.querySelectorAll('.add-column.is-drop-target').forEach(tile => tile.classList.remove('is-drop-target'));
      activeDrag.dropOnNewColumn = false;
    }
    const column = target.closest('.column');
    if (!column || !columns.some(item => item.id === column.dataset.columnId)) return;
    const list = column.querySelector('.cards');
    if (!list) return;
    list.classList.add('is-card-drop-target');
    board.querySelectorAll('.is-card-drop-target').forEach(node => { if (node !== list) node.classList.remove('is-card-drop-target'); });
    let before = nearestSibling(list, point.clientY, 'y');
    if (target.closest('.add-card') && target.closest('.column') === column) before = column.querySelector('.add-card');
    movePlaceholder(list, before);
    activeDrag.dropColumnId = column.dataset.columnId;
  }
  function onPointerMove(event) {
    if (pointerCandidate?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pointerCandidate.x, event.clientY - pointerCandidate.y) < 7) return;
      beginDrag(event);
    }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    positionGhost(event);
    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (!activeDrag) return;
      updateDropTarget(event);
      const rect = board.getBoundingClientRect();
      if (event.clientX < rect.left + 56) board.scrollLeft -= 14;
      else if (event.clientX > rect.right - 56) board.scrollLeft += 14;
    });
  }
  function finishDrag(event, cancelled = false) {
    if (pointerCandidate?.pointerId === event.pointerId) { pointerCandidate = null; return; }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const drag = activeDrag;
    if (!cancelled && drag.kind === 'card' && drag.dropOnNewColumn) {
      const sourceColumn = columns.find(item => item.id === drag.columnId);
      const cardIndex = sourceColumn?.cards.findIndex(item => item.id === drag.cardId) ?? -1;
      if (sourceColumn && cardIndex >= 0) {
        const [card] = sourceColumn.cards.splice(cardIndex, 1);
        const newColumn = { id: id(), name: '', color: palette[columns.length % palette.length].color, cards: [card] };
        columns.push(newColumn);
      }
    } else if (!cancelled && drag.kind === 'card' && drag.placeholder.parentElement?.classList.contains('cards')) {
      const from = columns.find(item => item.id === drag.columnId);
      const to = columns.find(item => item.id === drag.dropColumnId || item.id === drag.placeholder.parentElement.closest('.column')?.dataset.columnId);
      const cardIndex = from?.cards.findIndex(item => item.id === drag.cardId) ?? -1;
      if (from && to && cardIndex >= 0) {
        const [card] = from.cards.splice(cardIndex, 1);
        const ordered = Array.from(drag.placeholder.parentElement.children).filter(node => node.classList.contains('card') || node === drag.placeholder);
        const destinationIndex = ordered.indexOf(drag.placeholder);
        const targetIndex = Math.max(0, Math.min(destinationIndex, to.cards.length));
        to.cards.splice(targetIndex, 0, card);
      }
    } else if (!cancelled && drag.kind === 'column' && drag.placeholder.parentElement === board) {
      const movingIndex = columns.findIndex(item => item.id === drag.columnId);
      if (movingIndex >= 0) {
        const [column] = columns.splice(movingIndex, 1);
        const siblingsBefore = Array.from(board.children).slice(0, Array.from(board.children).indexOf(drag.placeholder)).filter(node => node.classList.contains('column')).length;
        columns.splice(Math.min(siblingsBefore, columns.length), 0, column);
      }
    }
    document.body.classList.remove('is-dragging');
    drag.ghost.remove();
    activeDrag = null;
    save();
    render();
    document.querySelector('#announcement').textContent = cancelled ? 'Перемещение отменено.' : 'Порядок доски обновлён.';
  }
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const cardNode = event.target.closest('.card[data-card-id]');
    const headerNode = event.target.closest('.column-header[data-drag-handle="column"]');
    const source = cardNode || headerNode;
    if (!source) return;
    const columnId = (cardNode || headerNode).closest('.column').dataset.columnId;
    const column = columns.find(item => item.id === columnId);
    const card = cardNode ? column?.cards.find(item => item.id === cardNode.dataset.cardId) : null;
    if (!column || cardNode && !card) return;
    pointerCandidate = { source, kind: cardNode ? 'card' : 'column', column, card, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', event => finishDrag(event));
  window.addEventListener('pointercancel', event => finishDrag(event, true));
  function deleteCard(columnId, cardId) {
    const column = columns.find(item => item.id === columnId);
    const card = column?.cards.find(item => item.id === cardId);
    if (!column || !card || !window.confirm(`Удалить карточку «${card.title}»?`)) return;
    column.cards = column.cards.filter(item => item.id !== card.id);
    if (dialog.open) dialog.close();
    editingCard = null; save(); render();
    document.querySelector('#announcement').textContent = 'Карточка удалена.';
  }
  function deleteColumn(columnId) {
    const column = columns.find(item => item.id === columnId);
    if (!column) return;
    if (column.cards.length && !window.confirm(`В колонке «${column.name || 'Без названия'}» есть карточки (${column.cards.length}). Удалить колонку вместе со всеми карточками? Это действие нельзя отменить.`)) return;
    columns = columns.filter(item => item.id !== column.id);
    if (columnDialog.open) columnDialog.close();
    editingColumnId = null; save(); render();
    document.querySelector('#announcement').textContent = 'Колонка удалена.';
  }
  board.addEventListener('click', event => {
    const deleteCardButton = event.target.closest('[data-delete-card-id]');
    if (deleteCardButton) {
      deleteCard(deleteCardButton.closest('.column')?.dataset.columnId, deleteCardButton.dataset.deleteCardId);
      return;
    }
    const deleteColumnButton = event.target.closest('[data-delete-column-id]');
    if (deleteColumnButton) { deleteColumn(deleteColumnButton.dataset.deleteColumnId); return; }
    const button = event.target.closest('button.add-card');
    if (button) {
      editingCard = null;
      targetColumnId = button.dataset.columnId || null;
      returnFocus = button;
      form.reset();
      titleInput.setCustomValidity('');
      document.querySelector('#dialog-title').textContent = 'Новая карточка';
      document.querySelector('#save-card').textContent = 'Создать';
      cardDeleteButton.hidden = true;
      document.querySelector('#form-error').textContent = '';
      const column = columns.find(item => item.id === targetColumnId);
      cardColorInput.value = column?.color || palette[columns.length % palette.length].color;
      updatePalette(document.querySelector('#card-palette'), cardColorInput);
      document.querySelector('#dialog-context').textContent = column ? `В колонке «${column.name || 'Без названия'}»` : 'Карточка появится в новой колонке справа.';
      dialog.showModal();
      titleInput.focus();
      return;
    }
    const editColumn = event.target.closest('[data-edit-column-id]');
    if (editColumn) { openColumnEditor(editColumn.dataset.editColumnId, editColumn); return; }
    const cardNode = event.target.closest('.card[data-card-id]');
    if (!cardNode) return;
    const column = columns.find(item => item.id === cardNode.closest('.column')?.dataset.columnId);
    const card = column?.cards.find(item => item.id === cardNode.dataset.cardId);
    if (!column || !card) return;
    editingCard = { columnId: column.id, cardId: card.id };
    targetColumnId = column.id;
    returnFocus = cardNode;
    form.reset();
    titleInput.setCustomValidity('');
    titleInput.value = card.title;
    descriptionInput.value = card.description;
    cardColorInput.value = card.color || column.color;
    updatePalette(document.querySelector('#card-palette'), cardColorInput);
    document.querySelector('#dialog-title').textContent = 'Редактировать карточку';
    document.querySelector('#save-card').textContent = 'Сохранить';
    cardDeleteButton.hidden = false;
    document.querySelector('#form-error').textContent = '';
    document.querySelector('#dialog-context').textContent = `В колонке «${column.name || 'Без названия'}»`;
    dialog.showModal();
    titleInput.focus();
    titleInput.select();
  });
  board.addEventListener('keydown', event => {
    if (event.target.closest('button')) return;
    const card = event.target.closest('.card[data-card-id]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.click(); }
  });
  titleInput.addEventListener('input', () => {
    titleInput.setCustomValidity('');
    document.querySelector('#form-error').textContent = '';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.setCustomValidity('Введите название карточки.');
      document.querySelector('#form-error').textContent = 'Введите название карточки.';
      titleInput.reportValidity();
      return;
    }
    if (editingCard) {
      const column = columns.find(item => item.id === editingCard.columnId);
      const card = column?.cards.find(item => item.id === editingCard.cardId);
      if (!card) { document.querySelector('#form-error').textContent = 'Эта карточка больше не найдена.'; return; }
      card.title = title;
      card.description = descriptionInput.value.trim();
      card.color = cardColorInput.value;
      save(); dialog.close(); editingCard = null; render();
      document.querySelector('#announcement').textContent = 'Карточка сохранена.';
      return;
    }
    const isNewColumn = targetColumnId === null;
    let column = columns.find(item => item.id === targetColumnId);
    if (isNewColumn) {
      column = { id: id(), name: '', color: palette[columns.length % palette.length].color, cards: [] };
      columns.push(column);
    }
    if (!column) return;
    column.cards.push({ id: id(), title, description: descriptionInput.value.trim(), color: cardColorInput.value });
    save();
    dialog.close();
    render();
    const section = Array.from(board.querySelectorAll('.column')).find(node => node.dataset.columnId === column.id);
    returnFocus = section.querySelector('.add-card');
    returnFocus.focus({ preventScroll: true });
    if (isNewColumn) board.scrollLeft = section.offsetLeft - board.offsetLeft;
    document.querySelector('#announcement').textContent = isNewColumn ? 'Создана новая колонка с карточкой.' : 'Карточка создана.';
  });
  document.querySelector('#cancel-dialog').addEventListener('click', () => dialog.close());
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { form.reset(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  cardDeleteButton.addEventListener('click', () => {
    if (!editingCard) return;
    deleteCard(editingCard.columnId, editingCard.cardId);
  });
  function openColumnEditor(columnId, focusTarget) {
    const column = columns.find(item => item.id === columnId);
    if (!column) return;
    editingColumnId = column.id; returnFocus = focusTarget;
    document.querySelector('#column-name').value = column.name;
    columnColorInput.value = column.color;
    updatePalette(document.querySelector('#column-palette'), columnColorInput);
    document.querySelector('#column-error').textContent = '';
    columnDialog.showModal(); document.querySelector('#column-name').focus();
  }
  columnForm.addEventListener('submit', event => {
    event.preventDefault();
    const column = columns.find(item => item.id === editingColumnId);
    const color = columnColorInput.value;
    if (!column || !isColor(color)) { document.querySelector('#column-error').textContent = 'Выберите корректный цвет.'; return; }
    column.name = document.querySelector('#column-name').value.trim(); column.color = color;
    save(); columnDialog.close(); render();
    document.querySelector('#announcement').textContent = 'Настройки колонки сохранены.';
  });
  document.querySelector('#cancel-column-dialog').addEventListener('click', () => columnDialog.close());
  document.querySelector('#close-column-dialog').addEventListener('click', () => columnDialog.close());
  columnDialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  columnDeleteButton.addEventListener('click', () => {
    deleteColumn(editingColumnId);
  });
  fileMenuTrigger.addEventListener('click', () => {
    const open = fileMenu.hidden;
    fileMenu.hidden = !open;
    fileMenuTrigger.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.file-menu-wrap')) {
      fileMenu.hidden = true;
      fileMenuTrigger.setAttribute('aria-expanded', 'false');
    }
  });
  document.querySelector('#file-load').addEventListener('click', () => {
    fileMenu.hidden = true; fileMenuTrigger.setAttribute('aria-expanded', 'false'); fileInput.click();
  });
  document.querySelector('#file-save').addEventListener('click', () => {
    fileMenu.hidden = true; fileMenuTrigger.setAttribute('aria-expanded', 'false');
    const payload = { format: 'kanban-board', version: 1, columns: columns.map(column => ({ name: column.name, color: column.color, cards: column.cards.map(card => ({ title: card.title, description: card.description, color: card.color || column.color })) })) };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url; link.download = `doska-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.querySelector('#announcement').textContent = 'Файл доски сохранён.';
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ.');
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      if (!parsed || parsed.format !== 'kanban-board' || parsed.version !== 1 || !Array.isArray(parsed.columns) || parsed.columns.length < 1 || parsed.columns.length > 1000) throw new Error('Это не файл доски подходящего формата.');
      let totalCards = 0;
      const imported = parsed.columns.map(column => {
        if (!column || typeof column.name !== 'string' || column.name.length > 100 || !isColor(column.color) || !Array.isArray(column.cards)) throw new Error('Проверьте названия и цвета колонок в файле.');
        totalCards += column.cards.length;
        if (totalCards > 10000) throw new Error('В файле слишком много карточек.');
        const cards = column.cards.map(card => {
          if (!card || typeof card.title !== 'string' || !card.title.trim() || card.title.length > 200 || typeof card.description !== 'string' || card.description.length > 20000 || (card.color !== undefined && !isColor(card.color))) throw new Error('В файле есть карточка с неверным названием, описанием или цветом.');
          return { id: id(), title: card.title, description: card.description, color: card.color || column.color };
        });
        return { id: id(), name: column.name, color: column.color, cards };
      });
      columns = imported; save(); render();
      document.querySelector('#announcement').textContent = 'Доска загружена из файла.';
    } catch (error) {
      window.alert(`Не удалось загрузить доску. ${error.message || 'Файл повреждён или имеет неверный формат.'}`);
    } finally { fileInput.value = ''; }
  });
  for (const [selector, direction] of [['#scroll-left', -1], ['#scroll-right', 1]]) {
    document.querySelector(selector).addEventListener('click', () => board.scrollBy({ left: direction * (board.querySelector('.column').offsetWidth + (parseFloat(getComputedStyle(board).gap) || 0)), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  board.addEventListener('scroll', updateScrollControls, { passive: true });
  window.addEventListener('resize', updateScrollControls);
  render();
})();
