/*
 * js/app.js
 * このファイルの役割: 画面の切り替え・描画・ボタン操作・toast（通知）を担当する。
 * マスタは data.js、保存は storage.js、読み取りは reader.js が担当し、ここから呼び出す。
 * 画面の部品は createElement と textContent で組み立てる（innerHTML は使わない）。
 * 4 つの画面（list / scan / detail / history）を 1 つの HTML の中で表示・非表示して切り替える。
 */

// ---------- 画面の状態（いま何を表示しているか） ----------
const state = {
  view: 'list',          // 表示中の画面
  tab: 'list',           // 強調するタブ（詳細画面では元のタブ）
  backView: 'list',      // 詳細の「戻る」で戻る画面
  detailCode: null,      // 詳細に表示中の本のコード値
  keyword: '',           // 検索ボックスの文字
  category: '',          // 選択中のカテゴリ（'' ならすべて）
  status: 'all',         // 状態の絞り込み（all / available / loaned）
  lockUntil: 0,          // この時刻（ミリ秒）まで貸出・返却ボタンを押せない（ダブルタップ対策）
  listScrollY: 0,        // 詳細へ移る直前の一覧のスクロール位置
};

const LOAN_DAYS = 14;        // 貸出期間（日）
const MAX_NAME_LENGTH = 20;  // 借りる人の名前の最大文字数
const LOCK_MS = 1500;        // 貸出・返却のあと、ボタンを押せなくする時間（ミリ秒）
const CLEAR_CONFIRM_MS = 3000;   // 「履歴を消す」の 2 回目の押下を待つ時間（ミリ秒）
const STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'available', label: '在庫あり' },
  { value: 'loaned', label: '貸出中' },
];

let toastTimer = null;
let clearHistoryTimer = null;   // 「履歴を消す」の確認待ちを元に戻すタイマー

// ---------- 小さな道具 ----------

/**
 * 要素を作る。クラス名と文字（textContent）を一度に指定できる。
 * @param {string} tag タグ名
 * @param {string} [className] クラス名
 * @param {string} [text] 表示する文字
 * @returns {HTMLElement} 作った要素
 */
function createEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * 要素の子をすべて消す。
 * @param {HTMLElement} element 対象の要素
 */
function clearChildren(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

/**
 * 数字を 2 桁にそろえる（5 → "05"）。
 * @param {number} number 数字
 * @returns {string} 2 桁の文字列
 */
function pad2(number) {
  return String(number).padStart(2, '0');
}

/**
 * Date を YYYY-MM-DD（この端末の日付）の文字列にする。
 * @param {Date} date 日付
 * @returns {string} YYYY-MM-DD
 */
function toDateString(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/**
 * ISO 日時を「M/D HH:mm」の表示用文字列にする。
 * @param {string} iso ISO 形式の日時
 * @returns {string} 表示用の日時
 */
function formatDateTime(iso) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return (date.getMonth() + 1) + '/' + date.getDate() + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

/**
 * 貸出日時（ISO）を、この端末の日付の「YYYY/MM/DD」にする（UTC の日付にずれないよう Date を通す）。
 * @param {string} iso ISO 形式の日時
 * @returns {string} 表示用の日付。日時が読めないときは空文字
 */
function formatLoanedDate(iso) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return toDateString(date).replace(/-/g, '/');
}

/**
 * 通知（toast）を表示する。1 つの要素を使い回し、数秒で消える。
 * @param {string} message 表示する文
 * @param {boolean} [isError] true ならエラー色にする
 */
function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--show' + (isError ? ' toast--error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ---------- 貸出状態の判定 ----------

/**
 * 本の貸出状態を調べる。貸出一覧は呼び出し側が 1 回だけ読んで渡す（行ごとに localStorage を読まないため）。
 * @param {object} book 本のデータ
 * @param {object} loans AppStorage.getLoans() の結果
 * @returns {{loaned: boolean, late: boolean, loan: object|undefined}} 貸出中か・延滞か・貸出情報
 */
function getStatus(book, loans) {
  const loan = loans[String(book.code)];
  if (!loan) return { loaned: false, late: false, loan: undefined };
  // 返却期限（YYYY-MM-DD）が今日より前なら延滞。同じ形式の文字列なので大小比較できる
  const late = loan.dueDate < toDateString(new Date());
  return { loaned: true, late: late, loan: loan };
}

/**
 * 状態バッジ（在庫あり／貸出中／延滞）の要素を作る。
 * @param {{loaned: boolean, late: boolean}} status getStatus の結果
 * @returns {HTMLElement} バッジ要素
 */
function createBadge(status) {
  if (status.late) return createEl('span', 'badge badge--late', '延滞');
  if (status.loaned) return createEl('span', 'badge badge--loan', '貸出中');
  return createEl('span', 'badge badge--ok', '在庫あり');
}

/**
 * カテゴリに対応する背表紙の色クラス名を返す。カテゴリ一覧は呼び出し側が 1 回だけ作って渡す。
 * @param {string} category カテゴリ名
 * @param {string[]} categories BookData.categories() の結果
 * @returns {string} spine--0 〜 spine--7 のクラス名
 */
function spineClass(category, categories) {
  const index = Math.max(0, categories.indexOf(category));
  return 'spine--' + (index % 8);
}

// ---------- 画面の切り替え ----------

/**
 * 指定した画面だけを表示し、タブの強調を更新する。
 * @param {string} viewName list / scan / detail / history
 */
function showView(viewName) {
  const previousView = state.view;
  // 一覧から別の画面へ移るとき、戻ってきたときのためにスクロール位置を覚えておく
  if (previousView === 'list' && viewName !== 'list') state.listScrollY = window.scrollY;
  state.view = viewName;
  ['list', 'scan', 'detail', 'history'].forEach((name) => {
    document.getElementById('view-' + name).hidden = (name !== viewName);
  });
  if (viewName !== 'detail') state.tab = viewName;
  document.querySelectorAll('.tabbar__button').forEach((button) => {
    const active = button.dataset.tab === state.tab;
    button.classList.toggle('tabbar__button--active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (viewName === 'scan') document.getElementById('scan-button').disabled = false;   // 読み取りボタンを必ず押せる状態に戻す

  if (viewName === 'list') {
    renderList();
    // 詳細から一覧へ戻ったときだけ、一覧のスクロール位置を復元する（他の画面からは先頭のまま）
    if (previousView === 'detail' && state.backView === 'list') window.scrollTo(0, state.listScrollY);
  }
  if (viewName === 'history') renderHistory();
}

/**
 * 本の詳細画面を開く。
 * @param {string} code コード値
 * @param {string} fromView 戻る先の画面
 */
function openDetail(code, fromView) {
  state.detailCode = code;
  state.backView = fromView;
  state.tab = fromView;
  renderDetail();
  showView('detail');
}

// ---------- 蔵書一覧 ----------

/**
 * 検索・カテゴリ・状態の条件に合う本だけを返す。
 * @param {object} loans AppStorage.getLoans() の結果
 * @returns {object[]} 条件に合う本の配列
 */
function filterBooks(loans) {
  const keyword = state.keyword.trim().toLowerCase();
  return BookData.books.filter((book) => {
    if (keyword && !(book.title + ' ' + book.author).toLowerCase().includes(keyword)) return false;
    if (state.category && book.category !== state.category) return false;
    const loaned = Boolean(loans[book.code]);
    if (state.status === 'available' && loaned) return false;
    if (state.status === 'loaned' && !loaned) return false;
    return true;
  });
}

/**
 * 上部のサマリー（蔵書数・貸出中・延滞）を更新する。
 * @param {object} loans AppStorage.getLoans() の結果
 */
function renderSummary(loans) {
  let loanCount = 0;
  let lateCount = 0;
  BookData.books.forEach((book) => {
    const status = getStatus(book, loans);
    if (status.loaned) loanCount += 1;
    if (status.late) lateCount += 1;
  });
  document.getElementById('sum-total').textContent = BookData.books.length;
  document.getElementById('sum-loan').textContent = loanCount;
  document.getElementById('sum-late').textContent = lateCount;
}

/**
 * カテゴリのチップ（すべて＋各カテゴリ）を作り直す。
 */
function renderChips() {
  const container = document.getElementById('chips');
  const scrollLeft = container.scrollLeft;   // 作り直しても横スクロール位置を保つ
  clearChildren(container);
  ['', ...BookData.categories()].forEach((category) => {
    const chip = createEl('button', 'chip', category || 'すべて');
    chip.type = 'button';
    if (state.category === category) chip.classList.add('chip--active');
    chip.addEventListener('click', () => {
      state.category = category;
      renderList();
    });
    container.appendChild(chip);
  });
  container.scrollLeft = scrollLeft;
}

/**
 * 状態の切り替えボタン（すべて／在庫あり／貸出中）を作り直す。
 */
function renderSegment() {
  const container = document.getElementById('segment');
  clearChildren(container);
  STATUS_FILTERS.forEach((filter) => {
    const button = createEl('button', 'segment__button', filter.label);
    button.type = 'button';
    if (state.status === filter.value) button.classList.add('segment__button--active');
    button.addEventListener('click', () => {
      state.status = filter.value;
      renderList();
    });
    container.appendChild(button);
  });
}

/**
 * 蔵書一覧の行（1 冊分）を作る。タップで詳細へ。
 * @param {object} book 本のデータ
 * @param {object} loans AppStorage.getLoans() の結果
 * @param {string[]} categories BookData.categories() の結果
 * @returns {HTMLElement} li 要素
 */
function createBookRow(book, loans, categories) {
  const item = createEl('li');
  const button = createEl('button', 'book ' + spineClass(book.category, categories));
  button.type = 'button';

  const body = createEl('div', 'book__body');
  body.appendChild(createEl('p', 'book__title', book.title));
  body.appendChild(createEl('p', 'book__meta', book.author));
  body.appendChild(createEl('p', 'book__meta', book.category + ' / 棚 ' + book.shelf));

  const status = createEl('div', 'book__status');
  status.appendChild(createBadge(getStatus(book, loans)));

  button.appendChild(createEl('span', 'book__spine'));
  button.appendChild(body);
  button.appendChild(status);
  button.addEventListener('click', () => openDetail(String(book.code), 'list'));
  item.appendChild(button);
  return item;
}

/**
 * 蔵書一覧画面全体（サマリー・絞り込み・一覧）を描き直す。
 */
function renderList() {
  const loans = AppStorage.getLoans();         // 貸出状態は最初に 1 回だけ読む
  const categories = BookData.categories();    // カテゴリ一覧も 1 回だけ作る
  renderSummary(loans);
  renderChips();
  renderSegment();

  const books = filterBooks(loans);
  const list = document.getElementById('book-list');
  clearChildren(list);
  books.forEach((book) => list.appendChild(createBookRow(book, loans, categories)));
  document.getElementById('list-empty').hidden = books.length > 0;
  document.getElementById('result-count').textContent = books.length + ' 冊';
}

// ---------- 詳細 ----------

/**
 * いま貸出・返却ボタンを押せない時間（処理の直後）かどうか。
 * @returns {boolean} 押せない時間なら true
 */
function isLocked() {
  return Date.now() < state.lockUntil;
}

/**
 * 貸出・返却の処理が済んだことを記録し、しばらくボタンを押せなくする。
 * ダブルタップで「貸出」の直後に「返却」が押されてしまうのを防ぐ。
 */
function startLock() {
  state.lockUntil = Date.now() + LOCK_MS;
}

/**
 * 押せない時間のあいだ、ボタンを無効（disabled）にし、時間が過ぎたら有効に戻す。
 * @param {HTMLButtonElement} button 貸出または返却のボタン
 */
function applyLock(button) {
  if (!isLocked()) return;
  button.disabled = true;
  setTimeout(() => { button.disabled = false; }, state.lockUntil - Date.now());
}

/**
 * 「項目名 / 値」の 1 行を dl に追加する。
 * @param {HTMLElement} dl 追加先の dl 要素
 * @param {string} label 項目名
 * @param {string} value 値
 */
function addFact(dl, label, value) {
  dl.appendChild(createEl('dt', '', label));
  dl.appendChild(createEl('dd', '', value));
}

/**
 * 在庫ありのときの「貸出する」フォームを作る。
 * @param {object} book 本のデータ
 * @returns {HTMLElement} パネル要素
 */
function createLoanPanel(book) {
  const panel = createEl('div', 'panel');
  panel.appendChild(createEl('h3', 'panel__title', '貸出する'));

  const label = createEl('label', 'form-label', '借りる人の名前');
  label.htmlFor = 'borrower-input';
  const input = createEl('input', 'field');
  input.id = 'borrower-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = '例: 学生A（' + MAX_NAME_LENGTH + '文字まで）';
  const error = createEl('p', 'form-error');
  error.hidden = true;
  const button = createEl('button', 'button button--loan', '貸出する');
  button.type = 'button';

  /** 名前をチェックして、正しければ貸出する */
  const submitLoan = () => {
    if (isLocked()) return;   // 直前の操作から間もないときは何もしない
    const name = input.value.trim();   // 前後の空白は取り除く
    let message = '';
    if (name === '') message = '名前を入力してください';
    else if (name.length > MAX_NAME_LENGTH) message = '名前は' + MAX_NAME_LENGTH + '文字以内で入力してください（現在 ' + name.length + ' 文字）';
    if (message) {
      error.textContent = message;
      error.hidden = false;
      input.classList.add('field--error');
      input.focus();
      return;
    }
    loanBook(String(book.code), name);
  };
  button.addEventListener('click', submitLoan);
  input.addEventListener('keydown', (event) => {
    // IME の変換を確定する Enter（isComposing / keyCode 229）では貸出しない
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) submitLoan();
  });
  // 入力し直したら、前回のエラー表示（赤枠・文言）を消す
  input.addEventListener('input', () => {
    error.hidden = true;
    input.classList.remove('field--error');
  });
  applyLock(button);

  panel.appendChild(label);
  panel.appendChild(input);
  panel.appendChild(error);
  panel.appendChild(button);
  return panel;
}

/**
 * 貸出中のときの「貸出情報＋返却ボタン」パネルを作る。
 * @param {object} book 本のデータ
 * @param {object} status getStatus の結果
 * @returns {HTMLElement} パネル要素
 */
function createReturnPanel(book, status) {
  const panel = createEl('div', 'panel');
  panel.appendChild(createEl('h3', 'panel__title', '貸出中の情報'));
  panel.appendChild(createEl('p', 'panel__text', '借りた人: ' + status.loan.borrower));
  panel.appendChild(createEl('p', 'panel__text', '貸出日: ' + formatLoanedDate(status.loan.loanedAt)));
  panel.appendChild(createEl('p', 'panel__text', '返却期限: ' + status.loan.dueDate.replace(/-/g, '/') + (status.late ? '（期限超過）' : '')));
  const button = createEl('button', 'button', '返却する');
  button.type = 'button';
  button.addEventListener('click', () => {
    if (isLocked()) return;   // 直前の操作から間もないときは何もしない
    returnBook(String(book.code));
  });
  applyLock(button);
  panel.appendChild(button);
  return panel;
}

/**
 * 詳細画面を描き直す（state.detailCode の本）。
 */
function renderDetail() {
  const view = document.getElementById('view-detail');
  clearChildren(view);
  const book = BookData.find(state.detailCode);
  if (!book) return;
  const status = getStatus(book, AppStorage.getLoans());

  const back = createEl('button', 'back-button', '‹ 戻る');
  back.type = 'button';
  back.addEventListener('click', () => showView(state.backView));
  view.appendChild(back);

  const card = createEl('div', 'detail__card ' + spineClass(book.category, BookData.categories()));
  card.appendChild(createEl('h2', 'detail__title', book.title));
  card.appendChild(createEl('p', 'detail__author', book.author));
  const facts = createEl('dl', 'facts');
  addFact(facts, '状態', '');
  facts.lastChild.appendChild(createBadge(status));
  addFact(facts, '出版社', book.publisher);
  addFact(facts, '発行年', book.year + ' 年');
  addFact(facts, 'ページ数', book.pages + ' ページ');
  addFact(facts, 'カテゴリ', book.category);
  addFact(facts, '棚', book.shelf);
  addFact(facts, 'コード値', 'No.' + book.code);
  card.appendChild(facts);
  card.appendChild(createEl('p', 'detail__summary', book.summary));
  view.appendChild(card);

  view.appendChild(status.loaned ? createReturnPanel(book, status) : createLoanPanel(book));
}

// ---------- 貸出・返却 ----------

/**
 * 貸出処理。処理の直前に最新の状態を読み直して二重貸出を防ぐ。
 * @param {string} code コード値
 * @param {string} borrower 借りる人の名前（チェック済み）
 */
function loanBook(code, borrower) {
  const book = BookData.find(code);
  const loans = AppStorage.getLoans();
  if (!book) return;
  if (loans[code]) {
    showToast('この本はすでに貸出中です', true);
    renderDetail();
    return;
  }
  const now = new Date();
  const due = new Date(now.getTime());
  due.setDate(due.getDate() + LOAN_DAYS);
  loans[code] = { borrower: borrower, loanedAt: now.toISOString(), dueDate: toDateString(due) };

  if (!AppStorage.saveLoans(loans)) {
    showToast('保存できませんでした（保存領域がいっぱいかもしれません）', true);
    return;
  }
  const historySaved = AppStorage.addHistory({ id: String(now.getTime()) + '-' + code, type: 'loan', code: code, title: book.title, borrower: borrower, at: now.toISOString() });
  if (historySaved) showToast('「' + book.title + '」を貸し出しました（返却期限 ' + loans[code].dueDate + '）');
  else showToast('貸し出しましたが履歴の保存に失敗しました', true);   // 貸出自体は成功している
  startLock();
  renderDetail();
}

/**
 * 返却処理。処理の直前に最新の状態を読み直して二重返却を防ぐ。
 * @param {string} code コード値
 */
function returnBook(code) {
  const book = BookData.find(code);
  const loans = AppStorage.getLoans();
  if (!book) return;
  const loan = loans[code];
  if (!loan) {
    showToast('この本はすでに返却済みです', true);
    renderDetail();
    return;
  }
  delete loans[code];

  if (!AppStorage.saveLoans(loans)) {
    showToast('保存できませんでした（保存領域がいっぱいかもしれません）', true);
    return;
  }
  const now = new Date();
  const historySaved = AppStorage.addHistory({ id: String(now.getTime()) + '-' + code, type: 'return', code: code, title: book.title, borrower: loan.borrower, at: now.toISOString() });
  if (historySaved) showToast('「' + book.title + '」を返却しました');
  else showToast('返却しましたが履歴の保存に失敗しました', true);   // 返却自体は成功している
  startLock();
  renderDetail();
}

// ---------- 読み取り ----------

/**
 * 読み取り（または手入力）で得たコード値を処理する。
 * マスタにあれば詳細へ、無ければ toast を出してこの画面に留まる。
 * @param {string} code コード値
 */
function handleCode(code) {
  if (BookData.find(code)) {
    openDetail(code, 'scan');
  } else {
    showToast('未登録のコードです（値: ' + code + '）', true);
  }
}

/**
 * 「読み取る」ボタン。二重タップを防ぐため、読み取り中はボタンを無効にする。
 * カメラをキャンセルするとコールバックが来ない端末があるため、3 秒後にも必ず有効に戻す。
 */
function startScan() {
  const button = document.getElementById('scan-button');
  button.disabled = true;
  /** 読み取りボタンを押せる状態に戻す */
  const finish = () => { button.disabled = false; };
  setTimeout(finish, 3000);
  AppReader.readOne(
    (code) => { finish(); handleCode(code); },
    (message) => { finish(); showToast(message, true); },
    finish
  );
}

// ---------- 履歴 ----------

/**
 * 履歴画面を描き直す（新しい順）。
 */
function renderHistory() {
  const history = AppStorage.getHistory().slice().reverse();
  const list = document.getElementById('history-list');
  clearChildren(list);
  history.forEach((entry) => {
    const item = createEl('li', 'history-item');
    const top = createEl('div', 'history-item__top');
    top.appendChild(createEl('span', entry.type === 'loan' ? 'badge badge--loan' : 'badge badge--ok', entry.type === 'loan' ? '貸出' : '返却'));
    top.appendChild(createEl('span', 'history-item__at', formatDateTime(entry.at)));
    item.appendChild(top);
    item.appendChild(createEl('p', 'history-item__title', entry.title));
    item.appendChild(createEl('p', 'history-item__who', entry.borrower));
    list.appendChild(item);
  });
  document.getElementById('history-empty').hidden = history.length > 0;
  document.getElementById('history-clear').hidden = history.length === 0;
  document.getElementById('history-count').textContent = history.length + ' 件の操作';
}

/**
 * 「履歴をすべて消す」。2 段階のボタンにする。
 * アプリ内ブラウザでは confirm（確認ダイアログ）が使えない場合があるため、confirm は使わない。
 * 1 回目のタップで文言を「もう一度押すと消えます」に変え、3 秒以内の 2 回目で削除する。
 */
function clearHistoryWithConfirm() {
  const button = document.getElementById('history-clear');
  // 1 回目: 文言を変えて 3 秒待つ。3 秒たったら元の文言に戻す
  if (clearHistoryTimer === null) {
    button.textContent = 'もう一度押すと消えます';
    clearHistoryTimer = setTimeout(resetClearButton, CLEAR_CONFIRM_MS);
    return;
  }
  // 2 回目（3 秒以内）: 削除する
  resetClearButton();
  if (AppStorage.clearHistory()) {
    renderHistory();
    showToast('履歴を消しました');
  } else {
    showToast('履歴を消せませんでした', true);
  }
}

/**
 * 「履歴をすべて消す」ボタンを、確認待ちでない元の状態（文言・タイマー）に戻す。
 */
function resetClearButton() {
  clearTimeout(clearHistoryTimer);
  clearHistoryTimer = null;
  document.getElementById('history-clear').textContent = '履歴をすべて消す';
}

// ---------- 起動 ----------

/**
 * ボタンや入力欄のイベントを登録する（最初に 1 回だけ）。
 */
function bindEvents() {
  document.querySelectorAll('.tabbar__button').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.tab));
  });
  document.getElementById('search-input').addEventListener('input', (event) => {
    state.keyword = event.target.value;
    renderList();
  });
  document.getElementById('scan-button').addEventListener('click', startScan);
  document.getElementById('history-clear').addEventListener('click', clearHistoryWithConfirm);
}

/**
 * アプリの起動処理。マスタを読み込んでから最初の画面を出す。
 */
async function init() {
  bindEvents();
  const ok = await BookData.load();
  if (!ok) {
    showToast('蔵書データを読み込めませんでした', true);
    return;
  }
  document.getElementById('scan-env').textContent = AppReader.isAvailable()
    ? '実行環境: iPhone（IroatoReader）'
    : '実行環境: PC（手入力で代用）';
  // 「PC では手入力で代用できます」の注記は、IroatoReader が無い PC のときだけ出す
  document.getElementById('scan-note').hidden = AppReader.isAvailable();
  showView('list');
}

init();
