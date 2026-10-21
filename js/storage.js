/*
 * js/storage.js
 * このファイルの役割: localStorage への保存・読み出しをまとめる。
 * 保存するのは「現在の貸出状態（loans）」と「操作履歴（history）」の 2 つだけ。
 * localStorage は文字列しか入らないので JSON に変換して出し入れする。
 * 壊れたデータや容量超過に備え、境界である読み書きの部分だけ try/catch で守る。
 */

const AppStorage = {
  KEY_LOANS: 'sample1.v1.loans',
  KEY_HISTORY: 'sample1.v1.history',
  MAX_HISTORY: 500,   // 履歴の最大件数。超えたら古いものから消す

  /**
   * localStorage から JSON を読む。失敗や未保存のときは fallback を返す。
   * @param {string} key 保存キー
   * @param {*} fallback 読めなかったときの値
   * @returns {*} 読み出した値
   */
  read(key, fallback) {
    try {
      const text = window.localStorage.getItem(key);
      if (text === null) return fallback;
      return JSON.parse(text);
    } catch (error) {
      return fallback;
    }
  },

  /**
   * localStorage へ JSON として書く。
   * @param {string} key 保存キー
   * @param {*} value 保存する値
   * @returns {boolean} 保存できたら true（容量超過などで失敗したら false）
   */
  write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * 貸出 1 件の形が正しいか調べる。
   * 値が null や { } のような壊れたデータのまま画面に出して、例外で落ちるのを防ぐ。
   * @param {*} loan 貸出情報
   * @returns {boolean} borrower・loanedAt・dueDate が文字列で、dueDate が YYYY-MM-DD・loanedAt が日付として読めるなら true
   */
  isValidLoan(loan) {
    return Boolean(loan) && typeof loan === 'object' &&
      typeof loan.borrower === 'string' &&
      typeof loan.loanedAt === 'string' &&
      typeof loan.dueDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(loan.dueDate) &&    // 返却期限は YYYY-MM-DD の形
      !Number.isNaN(Date.parse(loan.loanedAt));       // 貸出日時は日付として読めるもの
  },

  /**
   * 履歴 1 件の形が正しいか調べる。
   * null や種類・コードが無い要素を画面に出して、例外で落ちるのを防ぐ。
   * @param {*} entry 履歴の要素
   * @returns {boolean} type が 'loan' か 'return' で、code が文字列のオブジェクトなら true
   */
  isValidHistoryEntry(entry) {
    return Boolean(entry) && typeof entry === 'object' &&
      (entry.type === 'loan' || entry.type === 'return') &&
      typeof entry.code === 'string';
  },

  /**
   * 現在の貸出状態を返す。形が違うデータは空にし、壊れたエントリは取り除く。
   * @returns {object} { [コード値]: { borrower, loanedAt, dueDate } }
   */
  getLoans() {
    const loans = AppStorage.read(AppStorage.KEY_LOANS, {});
    if (!loans || typeof loans !== 'object' || Array.isArray(loans)) return {};
    // 形の壊れたエントリは捨てる
    const valid = {};
    Object.keys(loans).forEach((code) => {
      if (AppStorage.isValidLoan(loans[code])) valid[code] = loans[code];
    });
    return valid;
  },

  /**
   * 貸出状態を丸ごと保存する。
   * @param {object} loans 貸出状態
   * @returns {boolean} 保存できたら true
   */
  saveLoans(loans) {
    return AppStorage.write(AppStorage.KEY_LOANS, loans);
  },

  /**
   * 操作履歴（古い順）を返す。
   * @returns {object[]} 履歴の配列
   */
  getHistory() {
    const history = AppStorage.read(AppStorage.KEY_HISTORY, []);
    if (!Array.isArray(history)) return [];
    return history.filter(AppStorage.isValidHistoryEntry);
  },

  /**
   * 履歴を 1 件追加する。500 件を超えたら古いものから間引く。
   * @param {object} entry { id, type, code, title, borrower, at }
   * @returns {boolean} 保存できたら true
   */
  addHistory(entry) {
    const history = AppStorage.getHistory();
    history.push(entry);
    while (history.length > AppStorage.MAX_HISTORY) history.shift();
    return AppStorage.write(AppStorage.KEY_HISTORY, history);
  },

  /**
   * 履歴をすべて消す（貸出状態は消さない）。
   * @returns {boolean} 成功したら true
   */
  clearHistory() {
    return AppStorage.write(AppStorage.KEY_HISTORY, []);
  },
};
