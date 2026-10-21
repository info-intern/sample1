/*
 * js/data.js
 * このファイルの役割: 蔵書マスタ（data/books.json）を読み込んで、アプリ全体で使えるようにする。
 * ふつうは fetch で JSON を読む。file:// 直開きなどで fetch が失敗したときは、
 * index.html で先に読み込んでおいた data/books.js（window.__BOOKS_JSON__）を代わりに使う。
 * マスタは読み取り専用。アプリからは書き換えない。
 */

const BookData = {
  books: [],          // 蔵書の配列
  byCode: new Map(),  // コード値（文字列）から本を引くための辞書（Map なら "constructor" などのキーを引いても誤ヒットしない）

  /**
   * マスタを読み込む。成功すると BookData.books / byCode が埋まる。
   * キャッシュ対策として ?v=2 を付け、cache: 'no-store' で毎回取りに行く。
   * マスタを差し替えたら v の数字を上げると確実に反映される。
   * @returns {Promise<boolean>} 読み込めたら true
   */
  async load() {
    let json = null;
    try {
      const response = await fetch('data/books.json?v=2', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      json = await response.json();
    } catch (error) {
      json = null;
    }
    // fetch できない（file:// など）か、形が不正なときは books.js のデータを使う
    if (!BookData.isValid(json)) json = window.__BOOKS_JSON__;
    if (!BookData.isValid(json)) return false;

    BookData.books = json.books;
    BookData.byCode = new Map();
    json.books.forEach((book) => { BookData.byCode.set(String(book.code), book); });
    return true;
  },

  /**
   * マスタの形が正しいか調べる。books が配列でない壊れたデータで、後の処理が落ちるのを防ぐ。
   * @param {*} json 読み込んだマスタ
   * @returns {boolean} { books: [...] } の形なら true
   */
  isValid(json) {
    // books が配列で、各要素が code を持つオブジェクトであることまで確認する
    return Boolean(json) && Array.isArray(json.books)
      && json.books.every((book) => Boolean(book) && book.code != null);
  },

  /**
   * コード値から本を探す。
   * @param {string} code コード値（"1"〜"100"）
   * @returns {object|null} 見つかった本。無ければ null
   */
  find(code) {
    return BookData.byCode.get(String(code)) || null;
  },

  /**
   * カテゴリの一覧を、マスタに出てくる順に重複なしで返す。
   * @returns {string[]} カテゴリ名の配列
   */
  categories() {
    const list = [];
    BookData.books.forEach((book) => {
      if (!list.includes(book.category)) list.push(book.category);
    });
    return list;
  },
};
