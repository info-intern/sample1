/*
 * js/reader.js
 * このファイルの役割: カメレオンコードの読み取りを担当する（IroatoReader 層）。
 * iPhone の IroatoReader アプリ内では本物のカメラで読み取り、
 * PC のブラウザ（IroatoReader が無い環境）では手入力モーダルで代用する。
 * どちらの場合も、結果は「先頭ゼロを除いたコード値の文字列」（例: "7"）で app.js に返す。
 */

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
   * 1 コードだけ読み取る。環境に応じて実機の読み取り or 手入力を行う。
   * @param {function(string):void} onResult 読み取れたとき、コード値を受け取る関数
   * @param {function(string):void} onError 失敗したとき、メッセージを受け取る関数
   * @param {function():void} onCancel 手入力モーダルをキャンセルしたときに呼ぶ関数
   */
  readOne(onResult, onError, onCancel) {
    if (AppReader.isAvailable()) {
      AppReader.readWithCamera(onResult, onError);
    } else {
      AppReader.readWithManualInput(onResult, onCancel);
    }
  },

  /**
   * IroatoReader（実機のカメラ）で読み取る。
   * 初期化時のオプションが反映されない端末があるため、read にも同じオプションを渡す。
   * @param {function(string):void} onResult 読み取れたとき呼ぶ関数
   * @param {function(string):void} onError 失敗したとき呼ぶ関数
   */
  readWithCamera(onResult, onError) {
    try {
      // コードの値 → 書名 の対応表。読み取り画面に書名が出る
      const displayData = {};
      BookData.books.forEach((book) => { displayData[String(book.code)] = book.title; });

      const options = {
        mode: IroatoReader.single,           // 1 回 1 コード
        analyzeLevel: 5,                     // 解析レベル（大きいほど正確だが遅い）
        resolution: IroatoReader.r1920x1080,
        displayData: displayData,
        labelText: 'カメレオンコードを枠内に収めてください',
        buttonText: '読み取り',
      };
      const reader = new IroatoReader('cc', options);

      reader.read(options, (res) => {
        // 結果の形が想定と違うときは失敗として扱う
        if (!res || !res.status || !res.data || !Array.isArray(res.data.codes) || res.data.codes.length === 0) {
          onError('読み取りに失敗しました。もう一度お試しください');
          return;
        }
        onResult(AppReader.normalizeCode(res.data.codes[0].code));
      });
    } catch (error) {
      onError('読み取りを開始できませんでした');
    }
  },

  /**
   * PC 用の代替: 手入力モーダルを出し、1〜100 の整数だけ受け付ける。
   * 「読み取る」を押すたびにモーダルを開き、入力が正しければ onResult を呼んで閉じる。
   * キャンセル（ボタン・Escape キー）のときは onCancel を呼んで閉じる。
   * @param {function(string):void} onResult 正しいコード値を受け取る関数
   * @param {function():void} onCancel キャンセルで閉じたときに呼ぶ関数
   */
  readWithManualInput(onResult, onCancel) {
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
      // 全角数字（０〜９）は、スマホの日本語入力で入りやすいので、半角に直してから検証する
      const text = input.value.trim().replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
      if (text === '') {
        showError('コード番号を入力してください');
        return;
      }
      if (!/^\d+$/.test(text)) {
        showError('数字で入力してください');
        return;
      }
      const number = Number(text);
      if (number < AppReader.MIN_CODE || number > AppReader.MAX_CODE) {
        showError(AppReader.MIN_CODE + '〜' + AppReader.MAX_CODE + ' の番号を入力してください');
        return;
      }
      close();
      onResult(AppReader.normalizeCode(text));
    };

    input.value = '';
    errorText.hidden = true;
    input.classList.remove('field--error');
    modal.hidden = false;
    form.addEventListener('submit', onSubmit);
    cancelButton.addEventListener('click', cancel);
    document.addEventListener('keydown', onKeydown);
    input.focus();
  },
};
