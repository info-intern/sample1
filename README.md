# sample1 図書貸出管理（お手本アプリ）

## これは何か

学生向け「SE 仕事体験」の**お手本（完成プログラム）**です。
学生が作るものと同じ条件（HTML / CSS / JavaScript、localStorage、`data/*.json`、DB なし）で作った
図書貸出管理アプリです。本に貼ったカメレオンコードを IroatoReader で読み取り、貸出・返却を記録します。
仕様書の書き方の例は `仕様書.md` を見てください。

- 公開 URL: https://info-intern.github.io/sample1/

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面の骨組み（1 ページで画面を切り替える） |
| `css/style.css` | 見た目。色や余白は先頭の変数にまとめてある |
| `js/data.js` | 蔵書マスタの読み込み（fetch、失敗時は `data/books.js`） |
| `js/storage.js` | localStorage への保存・読み出し |
| `js/reader.js` | IroatoReader での読み取り。PC では手入力で代用 |
| `js/app.js` | 画面の切り替え・描画・ボタン操作・通知 |
| `data/books.json` | 蔵書マスタ 100 件（読み取り専用） |
| `data/books.js` | books.json と同じ内容の JS 版（file:// 用の予備） |
| `仕様書.md` | プロンプトテンプレートの記入例 |
| `test.md` | 共通テスト項目（iPhone で確認） |

## 動かし方

- PC: VS Code の Live Server、または `python -m http.server 8000` を実行して `http://localhost:8000/` を開く。
  `index.html` をダブルクリックして開く（file://）でも、`data/books.js` を使って動く。
  PC では読み取りボタンで手入力の画面が出るので、1〜100 の番号を入れて試す
- iPhone: IroatoReader アプリのブラウザで上の公開 URL を開く。読み取りの最終確認はここで行う

## 学べるポイント

- IroatoReader の呼び方: `new IroatoReader('cc', {...})` → `read(オプション, コールバック)`。
  結果は `res.status` を確認してから `res.data.codes[0].code` を使う（`js/reader.js`）
- PC フォールバック: `typeof IroatoReader !== 'undefined'` で環境を判定し、PC では手入力に切り替える
- JSON と localStorage の役割分担: 変わらないマスタは `data/books.json`、操作で増える記録は localStorage
- キャッシュ対策: `fetch('data/books.json?v=1', { cache: 'no-store' })` と `style.css?v=1` のようなクエリ
- 入力チェック: 必須・文字数・数値の範囲を確かめ、エラーを画面に出してフォーカスを戻す

## 自分のテーマに作り替える手順

1. `仕様書.md` を参考に、自分のアプリの仕様書を書く
2. `data/books.json` を自分のデータに差し替える（コードの値は文字列 "1"〜"100"）。
   同じ内容で `data/books.js`（`window.__BOOKS_JSON__ = {...};` の形）も作り直す
3. `index.html` の `css/style.css?v=1`・`js/*.js?v=1`・`data/books.js?v=1` と、`js/data.js` の `books.json?v=1` の数字をすべて上げて、古いデータが残らないようにする
4. `js/storage.js` のキー名（`sample1.v1.*`）を自分のアプリ名に変える
5. 画面の文言は `index.html` と `js/app.js`、色は `css/style.css` の先頭の変数を直す
6. `test.md` の項目を iPhone で確認する
