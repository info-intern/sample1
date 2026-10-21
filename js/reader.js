/*
 * js/reader.js
 * このファイルの役割: カメレオンコードの読み取りを担当する（IroatoReader 層）。
 * iPhone の IroatoReader アプリ内では本物のカメラで読み取り、
 * PC のブラウザ（IroatoReader が無い環境）では手入力モーダルで代用する。
 * どちらの場合も、結果は「先頭ゼロを除いたコード値の文字列」（例: "7"）で app.js に返す。
 * 読み取り方は 2 つ。1 冊ずつ（IroatoReader.single）と、まとめて（IroatoReader.multi）。
 */

// 手入力モーダルを閉じる関数（開いている間だけ入る）。二重に開いたとき、前回のものを閉じるために覚えておく
let closeManualModal = null;

const AppReader = {
  MIN_CODE: 1,
  MAX_CODE: 100,

  /**
   * IroatoReader が使える環境（iPhone のアプリ内ブラウザ）かどうか。
   * IroatoReader.single などを参照する前に、必ずこの判定を通すこと。
   * @returns {boolean} 使えるなら true
   */
  isAvailable() {
    return typeof IroatoReader !== 'undefined';
  },

  /**
   * 読み取ったコード値を正規化する。前後の空白と先頭のゼロを取る（"0007" → "7"）。
   * @param {*} rawCode 読み取った生の値
   * @returns {string} 正規化したコード値
   */
  normalizeCode(rawCode) {
    return String(rawCode).trim().replace(/^0+(?=\d)/, '');
  },

  /**
   * 1 コードだけ読み取る（IroatoReader.single）。環境に応じて実機の読み取り or 手入力を行う。
   * @param {function(string):void} onResult 読み取れたとき、コード値を受け取る関数
   * @param {function(string):void} onError 失敗したとき、メッセージを受け取る関数
   * @param {function():void} onCancel 手入力モーダルをキャンセルしたときに呼ぶ関数
   */
  readOne(onResult, onError, onCancel) {
    /** 1 件だけ入った配列から、先頭のコード値を渡す */
    const passFirst = (codes) => onResult(codes[0]);
    if (AppReader.isAvailable()) {
      AppReader.readWithCamera(false, passFirst, onError);
    } else {
      AppReader.readWithManualInput(false, passFirst, onCancel);
    }
  },

  /**
   * 複数のコードをまとめて読み取る（IroatoReader.multi）。
   * 結果は重複を除いた配列（読み取った順）で返す。
   * @param {function(string[]):void} onResult 読み取れたとき、コード値の配列を受け取る関数
   * @param {function(string):void} onError 失敗したとき、メッセージを受け取る関数
   * @param {function():void} onCancel 手入力モーダルをキャンセルしたときに呼ぶ関数
   */
  readMany(onResult, onError, onCancel) {
    if (AppReader.isAvailable()) {
      AppReader.readWithCamera(true, onResult, onError);
    } else {
      AppReader.readWithManualInput(true, onResult, onCancel);
    }
  },

  /**
   * コード値の配列から、重複を取り除く（最初に出てきた順を保つ）。
   * @param {string[]} codes コード値の配列
   * @returns {string[]} 重複のない配列
   */
  uniqueCodes(codes) {
    const list = [];
    codes.forEach((code) => {
      if (!list.includes(code)) list.push(code);
    });
    return list;
  },

  /**
   * IroatoReader に渡すオプションを作る。1 冊ずつとまとめてで、違うのは mode と画面の文言だけ。
   * @param {boolean} isMany true ならまとめて（multi）、false なら 1 冊ずつ（single）
   * @returns {object} IroatoReader のオプション
   */
  buildOptions(isMany) {
    // コードの値 → 書名 の対応表。読み取り画面に書名が出る
    const displayData = {};
    BookData.books.forEach((book) => { displayData[String(book.code)] = book.title; });

    return {
      mode: isMany ? IroatoReader.multi : IroatoReader.single,   // multi は 1 回の撮影で複数コード、single は 1 コード
      analyzeLevel: 5,                     // 解析レベル（大きいほど正確だが遅い）
      resolution: IroatoReader.r1920x1080,
      displayData: displayData,
      labelText: isMany ? '複数のコードを枠内に収めてください' : 'カメレオンコードを枠内に収めてください',
      buttonText: isMany ? '読み取り完了' : '読み取り',
    };
  },

  /**
   * IroatoReader（実機のカメラ）で読み取る。
   * read にも初期化時と同じ形式でオプションを渡せる（reference.md）。両方に渡しておくと確実。
   * 結果は正規化・重複除去した配列で onResult に渡す（1 冊ずつのときは 1 件だけ）。
   * @param {boolean} isMany true ならまとめて読み取る
   * @param {function(string[]):void} onResult 読み取れたとき呼ぶ関数
   * @param {function(string):void} onError 失敗したとき呼ぶ関数
   */
  readWithCamera(isMany, onResult, onError) {
    try {
      const options = AppReader.buildOptions(isMany);
      const reader = new IroatoReader('cc', options);

      reader.read(options, (res) => {
        // 結果の形が想定と違うときは失敗として扱う
        if (!res || !res.status || !res.data || !Array.isArray(res.data.codes) || res.data.codes.length === 0) {
          onError('読み取りに失敗しました。もう一度お試しください');
          return;
        }
        // code を持つ要素だけ正規化し、空文字になったものは除く（null や {} が混ざっても落ちない）
        const normalized = res.data.codes
          .filter((item) => item && item.code != null)
          .map((item) => AppReader.normalizeCode(item.code))
          .filter((code) => code !== '');
        if (normalized.length === 0) {
          onError('コードを認識できませんでした。もう一度お試しください');
          return;
        }
        const codes = AppReader.uniqueCodes(normalized);
        onResult(isMany ? codes : codes.slice(0, 1));
      });
    } catch (error) {
      onError('読み取りを開始できませんでした');
    }
  },

  /**
   * 入力文字の全角を半角に直す。全角数字（０〜９）・全角カンマ（，、）・全角空白を対象にする。
   * スマホの日本語入力では全角になりやすいので、検証の前に必ず通す。
   * @param {string} text 入力された文字
   * @returns {string} 半角に直した文字
   */
  toHalfWidth(text) {
    return text
      .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
      .replace(/[，、]/g, ',')
      .replace(/　/g, ' ');
  },

  /**
   * 1 つの値が 1〜100 の整数かどうか調べる。
   * @param {string} text 半角に直した 1 つの値
   * @returns {boolean} 正しければ true
   */
  isValidCodeText(text) {
    if (!/^\d+$/.test(text)) return false;
    const number = Number(text);
    return number >= AppReader.MIN_CODE && number <= AppReader.MAX_CODE;
  },

  /**
   * 手入力の文字（1 冊ずつ用）を調べる。
   * @param {string} inputText 入力欄の文字
   * @returns {{codes: string[], error: string}} 正しければ codes に 1 件、だめなら error にメッセージ
   */
  parseSingleInput(inputText) {
    const text = AppReader.toHalfWidth(inputText).trim();
    if (text === '') return { codes: [], error: 'コード番号を入力してください' };
    if (!/^\d+$/.test(text)) return { codes: [], error: '数字で入力してください' };
    if (!AppReader.isValidCodeText(text)) {
      return { codes: [], error: AppReader.MIN_CODE + '〜' + AppReader.MAX_CODE + ' の番号を入力してください' };
    }
    return { codes: [AppReader.normalizeCode(text)], error: '' };
  },

  /**
   * 手入力の文字（まとめて用）を調べる。カンマまたは空白で区切り、重複は取り除く。
   * @param {string} inputText 入力欄の文字（例: "3, 7, ７ 15"）
   * @returns {{codes: string[], error: string}} 正しければ codes、だめなら error（何番目が不正かを含む）
   */
  parseManyInput(inputText) {
    const text = AppReader.toHalfWidth(inputText).trim();
    if (text === '') return { codes: [], error: 'コード番号を入力してください' };
    const tokens = text.split(/[,\s]+/).filter((token) => token !== '');
    for (let i = 0; i < tokens.length; i++) {
      if (!AppReader.isValidCodeText(tokens[i])) {
        return { codes: [], error: (i + 1) + '番目の値が不正です（「' + tokens[i] + '」は ' + AppReader.MIN_CODE + '〜' + AppReader.MAX_CODE + ' の整数ではありません）' };
      }
    }
    return { codes: AppReader.uniqueCodes(tokens.map(AppReader.normalizeCode)), error: '' };
  },

  /**
   * PC 用の代替: 手入力モーダルを出し、1〜100 の整数だけ受け付ける。
   * 「読み取る」を押すたびにモーダルを開き、入力が正しければ onResult を呼んで閉じる。
   * まとめて読み取りのときは、カンマまたは空白区切りで複数の番号を受け付ける。
   * キャンセル（ボタン・Escape キー）のときは onCancel を呼んで閉じる。
   * @param {boolean} isMany true ならまとめて入力
   * @param {function(string[]):void} onResult 正しいコード値の配列を受け取る関数
   * @param {function():void} onCancel キャンセルで閉じたときに呼ぶ関数
   */
  readWithManualInput(isMany, onResult, onCancel) {
    // 前回のモーダルが開いたままなら先に閉じる（前回のイベントリスナーを残さないため）
    if (closeManualModal) closeManualModal();

    const modal = document.getElementById('manual-modal');
    const form = document.getElementById('manual-form');
    const input = document.getElementById('manual-input');
    const errorText = document.getElementById('manual-error');
    const cancelButton = document.getElementById('manual-cancel');

    /** モーダルを閉じ、登録したイベントをすべて外す */
    const close = () => {
      modal.hidden = true;
      form.removeEventListener('submit', onSubmit);
      cancelButton.removeEventListener('click', cancel);
      document.removeEventListener('keydown', onKeydown);
      closeManualModal = null;
    };

    /** キャンセル（ボタンまたは Escape）。閉じてから onCancel を呼ぶ */
    const cancel = () => {
      close();
      onCancel();
    };

    /** Escape キーが押されたらキャンセルと同じ動作にする */
    const onKeydown = (event) => {
      if (event.key === 'Escape') cancel();
    };

    /** 入力欄にエラーを表示してフォーカスを戻す */
    const showError = (message) => {
      errorText.textContent = message;
      errorText.hidden = false;
      input.classList.add('field--error');
      input.focus();
    };

    /** 決定ボタン（Enter でも可）が押されたときの入力チェック */
    const onSubmit = (event) => {
      event.preventDefault();
      const result = isMany ? AppReader.parseManyInput(input.value) : AppReader.parseSingleInput(input.value);
      if (result.error) {
        showError(result.error);
        return;
      }
      close();
      onResult(result.codes);
    };

    // モードに応じて、モーダルの見出し・説明・入力欄の例を切り替える
    document.getElementById('manual-title').textContent = isMany ? 'コード番号をまとめて入力' : 'コード番号を入力';
    document.getElementById('manual-text').textContent = isMany
      ? 'PC では読み取りの代わりに、カンマまたは空白で区切って複数の番号（1〜100）を入力します。同じ番号は 1 冊として数えます。'
      : 'PC では読み取りの代わりに、1〜100 の番号を入力します。';
    input.placeholder = isMany ? '例: 3, 7, 15' : '例: 7';
    input.inputMode = isMany ? 'text' : 'numeric';   // まとめては区切りのカンマを打てるよう、通常のキーボードにする
    input.value = '';
    errorText.hidden = true;
    input.classList.remove('field--error');
    modal.hidden = false;
    form.addEventListener('submit', onSubmit);
    cancelButton.addEventListener('click', cancel);
    document.addEventListener('keydown', onKeydown);
    closeManualModal = close;
    input.focus();
  },
};
