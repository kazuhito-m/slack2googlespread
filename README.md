Slack to Google Spreadsheet
===========================

## What's this ?

Slackの特定チャンネルから(システム通知を除いた)ログを、`Google Spreadsheet` へと保存する `Google Apps Script` です。

`TypeScript`で記述してあり、トランスパイルが必要です。

## Spesial Thanks

[@motemen](https://github.com/motemen) さんの [こちらのページ](http://motemen.hatenablog.com/entry/2015/11/gas-slack-log-spreadsheet) と [ソース](https://github.com/motemen/gas-slack-log-spreadsheet/) を参考にさせていただきました。感謝！

## Requirement

以下を前提とします。

- [SlackのAPIトークン](https://api.slack.com/docs/oauth-test-tokens)が取得できている
- [Google Apps Script](https://developers.google.com/apps-script/)のプロジェクトがGoogleDrive上に作成出来ている
- 開発端末に node.js/npm がインストールされている

## Usage

使い方(ビルドと仕込み方法)です。

1. npmでライブラリインストール、ビルド
  - `npm install`
  - `npm run build`
    - ここで `error TS6082:...` なエラーが出ますが、`app.js`ファイルが作成されていれば問題なし
0. `Google Apps Script` のプロジェクトにスクリプトを作成し `app.js` の内容を貼る
0. `Google Apps Script` のプロジェクトに、以下のプロパティを設定する
  - メニューから [ファイル] → [プロジェクトのプロパティ] → [スクリプトのプロパティ] で、以下の値を追加
    - `slack_api_token` : SlackのAPIトークン(xoxp-...から始まる値)
    - `target_channel` : 対象となるSlack上のチャンネル(これが無くば全てのチャンネルが対象となる)
    - `folder_name` : Google Drive内のフォルダ名(既存でも無くても良い)
0. `Google Apps Script` のプロジェクトのファイルを一度実行してみる
  - 作成したgsファイルを |> マークか [実行] → [StoreLogDelta] かのどちらかで実行してみる
  - Google Drive上の `folder_name` にフォルダとその中にSpreadsheetが作成されていれば成功


## Author

Kazuhito Miura ( [@kazuhito_m](https://twitter.com/kazuhito_m) on Twitter )
