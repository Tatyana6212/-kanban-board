const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Минимальная модель DOM проверяет сценарии приложения без браузера.
class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {};
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } }; this.value = ''; this.textContent = '';
    this.className = ''; this.scrollLeft = 0; this.clientWidth = 1000;
    this.offsetWidth = 280; this.isConnected = true; this.open = false;
  }
  get classList() {
    return { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim(); }, remove: name => { this.className = this.className.split(/\s+/).filter(part => part !== name).join(' '); } };
  }
  get scrollWidth() { return this.children.length * 296; }
  append(...nodes) { for (const node of nodes) { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); node.parentElement = this; node.isConnected = true; this.children.push(node); } }
  replaceChildren() { this.children.forEach(node => { node.isConnected = false; node.parentElement = null; }); this.children = []; }
  insertBefore(node, before) { if (!before) return this.append(node); if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); const index = this.children.indexOf(before); node.parentElement = this; node.isConnected = true; this.children.splice(index, 0, node); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  emit(name, extra = {}) { let result; for (const callback of this.listeners[name] || []) result = callback({ preventDefault() {}, target: this, ...extra }); return result; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  matches(selector) { const cls = selector.match(/\.([\w-]+)/)?.[1]; const attr = selector.match(/\[data-([\w-]+)/)?.[1]?.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return (!cls || this.classList.contains(cls)) && (!selector.startsWith('button') || this.tag === 'button') && (!attr || this.dataset[attr] !== undefined); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  click() { this.clicked = true; }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  setCustomValidity(message) { this.validityMessage = message; }
  reportValidity() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  scrollBy({ left }) { this.scrollLeft += left; this.emit('scroll'); }
}
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function boot(storage = new Map(), denyStorage = false) {
  const selectors = ['board', 'card-dialog', 'card-form', 'card-title', 'card-description', 'card-color', 'card-palette', 'column-palette', 'theme-toggle', 'theme-icon', 'storage-label', 'scroll-left', 'scroll-right', 'form-error', 'dialog-context', 'announcement', 'cancel-dialog', 'close-dialog', 'column-dialog', 'column-form', 'delete-card', 'delete-column', 'file-menu', 'file-menu-trigger', 'file-input', 'column-name', 'column-color', 'column-error', 'file-load', 'file-save', 'save-card', 'close-column-dialog', 'cancel-column-dialog', 'dialog-title'];
  const nodes = Object.fromEntries(selectors.map(name => [name, new Element()]));
  const root = new Element('html');
  nodes['card-form'].reset = () => { nodes['card-title'].value = ''; nodes['card-description'].value = ''; };
  let sequence = 0;
  let download = null;
  let confirmChoice = true;
  let confirmationMessage = '';
  class TestBlob { constructor(parts, options) { this.textValue = parts.join(''); this.type = options.type; download = this; } async text() { return this.textValue; } }
  vm.runInNewContext(source, {
    document: { querySelector: selector => nodes[selector.slice(1)], createElement: tag => new Element(tag), addEventListener() {}, body: new Element('body'), documentElement: root },
    window: { addEventListener() {}, confirm(message) { confirmationMessage = message; return confirmChoice; }, alert(message) { nodes.alertText = message; } }, crypto: { randomUUID: () => `id-${++sequence}` },
    Blob: TestBlob, URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(callback) { callback(); },
    localStorage: { getItem: key => { if (denyStorage) throw new Error('denied'); return storage.get(key) || null; }, setItem: (key, value) => { if (denyStorage) throw new Error('denied'); storage.set(key, value); } },
    matchMedia: () => ({ matches: true })
  });
  return { nodes, root, board: nodes.board, storage, getDownload: () => download, setConfirm: value => { confirmChoice = value; }, getConfirmation: () => confirmationMessage };
}
const app = boot();
assert.equal(app.root.classList.contains('dark'), true);
app.nodes['theme-toggle'].emit('click');
assert.equal(app.root.classList.contains('light'), true);
assert.equal(app.storage.get('kanban-board.theme'), 'light');
assert.equal(app.nodes['theme-toggle']['aria-pressed'], 'false');
const columns = () => app.board.querySelectorAll('.column');
const add = index => columns()[index].querySelector('.add-card');
const open = button => app.board.emit('click', { target: button });
const create = (title, description = '') => { app.nodes['card-title'].value = title; app.nodes['card-description'].value = description; app.nodes['card-form'].emit('submit'); };
assert.equal(columns().length, 4);
assert.deepEqual(columns().map(node => node.querySelectorAll('.column-heading')[0].children[1].textContent), ['', 'Принято', 'В деле', 'Закончено']);
assert.equal(app.board.children.at(-1).className, 'add-card add-column');
open(add(1)); create('  Подготовить макет  ', 'Первая строка\nВторая строка');
assert.equal(columns()[1].querySelectorAll('.card').length, 1);
assert.equal(columns()[0].querySelectorAll('.card').length, 0);
assert.equal(columns()[1].querySelector('.card').children[0].textContent, 'Подготовить макет');
assert.equal(columns()[1].querySelector('.card').children[1].textContent, 'Первая строка\nВторая строка');
assert.equal(columns()[1].querySelector('.card').style.values['--card-color'], '#e879f9');
assert.equal(columns()[1].querySelector('.cards').children.at(-1).className, 'add-card');
open(add(2)); app.nodes['cancel-dialog'].emit('click');
assert.equal(columns()[2].querySelectorAll('.card').length, 0);
open(app.board.children.at(-1)); app.nodes['cancel-dialog'].emit('click');
assert.equal(columns().length, 4);
open(app.board.children.at(-1)); create('   ');
assert.equal(columns().length, 4); assert.equal(app.nodes['card-dialog'].open, true);
app.nodes['card-title'].emit('input'); create('<img src=x onerror=alert(1)>');
assert.equal(columns().length, 5);
assert.equal(columns()[4].querySelector('.card').children[0].textContent, '<img src=x onerror=alert(1)>');
assert.equal(app.board.children.at(-1).className, 'add-card add-column');
assert.equal(app.nodes['card-dialog'].open, false);
for (let index = 0; index < 20; index++) { open(app.board.children.at(-1)); create(`Карточка ${index}`); }
assert.equal(columns().length, 25);
assert.equal(app.board.querySelectorAll('.add-card').length, 26);
const reloaded = boot(app.storage);
assert.equal(reloaded.board.querySelectorAll('.column').length, 25);
assert.equal(reloaded.board.querySelectorAll('.card').length, 22);
assert.equal(reloaded.root.classList.contains('light'), true);
const denied = boot(new Map(), true);
denied.board.emit('click', { target: denied.board.children.at(-1) });
denied.nodes['card-title'].value = 'Без хранилища'; denied.nodes['card-form'].emit('submit');
assert.equal(denied.board.querySelectorAll('.column').length, 5);
assert.match(denied.nodes['storage-label'].textContent, /Не удалось сохранить/);
async function testTextFileRoundTrip() {
  app.nodes['file-save'].emit('click');
  const fileText = await app.getDownload().text();
  assert.match(fileText, /"format": "kanban-board"/);
  const payload = JSON.parse(fileText);
  assert.equal(payload.columns.length, 25);
  assert.equal(payload.columns[1].cards[0].title, 'Подготовить макет');
  assert.equal(payload.columns[1].cards[0].description, 'Первая строка\nВторая строка');
  assert.equal(payload.columns[1].cards[0].color, '#e879f9');
  const restored = boot();
  restored.nodes['file-input'].files = [{ name: 'доска.txt', size: fileText.length, text: async () => fileText }];
  await restored.nodes['file-input'].emit('change');
  assert.equal(restored.board.querySelectorAll('.column').length, 25);
  assert.equal(restored.board.querySelectorAll('.card').length, 22);
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').children[0].textContent, 'Подготовить макет');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], '#e879f9');
  const oldColumnCount = restored.board.querySelectorAll('.column').length;
  restored.nodes['file-input'].files = [{ name: 'битый.txt', size: 3, text: async () => '{no' }];
  await restored.nodes['file-input'].emit('change');
  assert.equal(restored.board.querySelectorAll('.column').length, oldColumnCount);
  assert.match(restored.nodes.alertText, /Не удалось загрузить доску/);
  const firstColumn = restored.board.querySelectorAll('.column')[1];
  const firstCard = firstColumn.querySelector('.card');
  restored.board.emit('click', { target: firstCard });
  assert.equal(restored.nodes['card-dialog'].open, true);
  restored.nodes['card-title'].value = 'Обновлённая карточка';
  restored.nodes['card-description'].value = 'Новое описание';
  restored.nodes['card-palette'].querySelectorAll('.palette-swatch')[6].emit('click');
  restored.nodes['card-form'].emit('submit');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').children[0].textContent, 'Обновлённая карточка');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], '#22d3ee');
  const editButton = restored.board.querySelectorAll('.edit-column-button')[1];
  restored.board.emit('click', { target: editButton });
  restored.nodes['column-name'].value = 'Проверка'; restored.nodes['column-color'].value = '#123456';
  restored.nodes['column-form'].emit('submit');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.column-heading').children[1].textContent, 'Проверка');
  assert.equal(restored.board.querySelectorAll('.column')[1].style.values?.['--column-color'], '#123456');
  restored.board.emit('click', { target: restored.board.querySelectorAll('.edit-column-button')[1] });
  restored.setConfirm(false); restored.nodes['delete-column'].emit('click');
  assert.equal(restored.board.querySelectorAll('.column').length, 25);
  assert.match(restored.getConfirmation(), /карточки \(1\)/);
  restored.setConfirm(true); restored.nodes['delete-column'].emit('click');
  assert.equal(restored.board.querySelectorAll('.column').length, 24);
  const oldPayload = JSON.parse(fileText);
  delete oldPayload.columns[1].cards[0].color;
  const legacy = boot();
  legacy.nodes['file-input'].files = [{ name: 'старый.txt', size: 500, text: async () => JSON.stringify(oldPayload) }];
  await legacy.nodes['file-input'].emit('change');
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], oldPayload.columns[1].color);
  const tileTrash = legacy.board.querySelectorAll('.column')[1].querySelector('.card').querySelector('.tile-delete');
  legacy.setConfirm(false); legacy.board.emit('click', { target: tileTrash });
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelectorAll('.card').length, 1);
  legacy.setConfirm(true); legacy.board.emit('click', { target: tileTrash });
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelectorAll('.card').length, 0);
  console.log('OK: theme, palette, create/cancel/edit/delete, persistence, TXT round-trip, legacy import, corrupted-file recovery.');
}
testTextFileRoundTrip().catch(error => { console.error(error); process.exitCode = 1; });
