/// <reference path="../typings/index.d.ts" />
/// <reference path="./slack_interfaces.d.ts" />
/// <reference path="./googledocs_interfaces.d.ts" />

// Configuration: Obtain Slack web API token at https://api.slack.com/web

// Need Property: slack_api_token, 
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('slack_api_token');
const FOLDER_NAME = PropertiesService.getScriptProperties().getProperty('folder_name');
const TARGET_CHANNEL = PropertiesService.getScriptProperties().getProperty('target_channel');

// GAS properties validation
if (!API_TOKEN) {
  throw 'You should set "slack_api_token" property from [File] > [Project properties] > [Script properties]';
}
if (!FOLDER_NAME) {
  throw 'You should set "folder_name" property from [File] > [Project properties] > [Script properties]';
}

/**** Do not edit below unless you know what you are doing ****/

const COL_LOG_TIMESTAMP = 1;
const COL_LOG_USER = 2;
const COL_LOG_TEXT = 3;
const COL_LOG_RAW_JSON = 4;
const COL_MAX = COL_LOG_RAW_JSON;

/**
 * GAS entiry point.
 */
function StoreLogsDelta() {
  (new SlackChannelHistoryLogger()).run();
}

/**
 * Main class
 */
class SlackChannelHistoryLogger {

  memberNames: { [id: string]: string } = {};
  teamName: string;

  // Inner objects.
  slack: SlackOperation;
  spread: GoogleSpreadsheetOperation;
  utils: Utils;

  constructor() {
    this.slack = new SlackOperation(API_TOKEN);
    this.spread = new GoogleSpreadsheetOperation();
    this.utils = new Utils();
  }

  /**
   * Main method.
   */
  public run() {

    const usersResp = <ISlackUsersListResponse>this.slack.request('users.list');
    usersResp.members.forEach((member) => {
      this.memberNames[member.id] = member.name;
    });

    const teamInfoResp = <ISlackTeamInfoResponse>this.slack.request('team.info');
    this.teamName = teamInfoResp.team.name;

    const channelsResp = <ISlackChannelsListResponse>this.slack.request('channels.list');
    for (const ch of channelsResp.channels) {
      if (TARGET_CHANNEL && TARGET_CHANNEL !== ch.name) continue;
      this.importChannelHistoryDelta(ch);
    }
  }

  importChannelHistoryDelta(ch: ISlackChannel) {

    Logger.log(`importChannelHistoryDelta ${ch.name} (${ch.id})`);

    const existingSheet = this.getSheet(ch, true);

    let oldest = '1'; // oldest=0 does not work
    if (existingSheet) {
      const lastRow = existingSheet.getLastRow();
      try {
        let data = <ISlackMessage>JSON.parse(<string>existingSheet.getRange(lastRow, COL_LOG_RAW_JSON).getValue());
        oldest = data.ts;
      } catch (e) {
        Logger.log(`while trying to parse the latest history item from existing sheet: ${e}`)
      }
    }

    // get messge by slack.
    const messages = this.slack.loadMessagesBulk(ch, { oldest: oldest });

    const  sheet = this.getSheet(ch);
    const timezone = sheet.getParent().getSpreadsheetTimeZone();
    const lastRow = sheet.getLastRow();

    const rows = messages.map((msg) => {
      // Array[ISlackMessage] to Array[Array[any]]
      const date = this.utils.toDateFromSlackTs(msg.ts);
      return [
        Utilities.formatDate(date, timezone, 'yyyy-MM-dd HH:mm:ss'),
        this.memberNames[msg.user] || msg.username,
        this.slack.unescapeMessageText(this.memberNames, msg.text),
        JSON.stringify(msg)
      ]
    }).filter((values: [any]) => {
      // delete except pure write.
      const logText: string = values[COL_LOG_TEXT - 1];
      return logText.indexOf('<@') != 0;    // System infomation.
    });
    if (rows.length > 0) {
      // insert & write for Google Spread Sheet
      const range = sheet.insertRowsAfter(lastRow || 1, rows.length).getRange(lastRow + 1, 1, rows.length, COL_MAX);
      range.setValues(rows);
    }
  }

  getSheet(ch: ISlackChannel, readonly: boolean = false): GoogleAppsScript.Spreadsheet.Sheet {

    let spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
    const sheetByID: { [id: string]: GoogleAppsScript.Spreadsheet.Sheet } = {};

    const  spreadsheetName = ch.name;
    const folder = this.spread.getLogsFolder(FOLDER_NAME, this.teamName);
    const it = folder.getFilesByName(spreadsheetName);
    if (it.hasNext()) {
      let file = it.next();
      spreadsheet = SpreadsheetApp.openById(file.getId());
    } else {
      if (readonly) return null;
      spreadsheet = SpreadsheetApp.create(spreadsheetName);
      folder.addFile(DriveApp.getFileById(spreadsheet.getId()));
    }

    let sheets = spreadsheet.getSheets();
    sheets.forEach((s: GoogleAppsScript.Spreadsheet.Sheet) => {
      let name = s.getName();
      let m = /^(.+) \((.+)\)$/.exec(name); // eg. "general (C123456)"
      if (!m) return;
      sheetByID[m[2]] = s;
    });

    let sheet = sheetByID[ch.id];
    if (!sheet) {
      if (readonly) return null;
      sheet = spreadsheet.insertSheet();
    }

    const sheetName = `${ch.name} (${ch.id})`;
    if (sheet.getName() !== sheetName) {
      sheet.setName(sheetName);
    }

    return sheet;
  }

}

// using classes

// Slack offers 10,000 history logs for free plan teams
const MAX_HISTORY_PAGINATION = 10;
const HISTORY_COUNT_PER_PAGE = 1000;

class SlackOperation {

  apiToken: string;

  constructor(token: string) {
    this.apiToken = token;
  }

  request(path: string, params: { [key: string]: any } = {}): ISlackResponse {
    let url = `https://slack.com/api/${path}?`;
    const token = this.apiToken;
    const qparams = [`token=${encodeURIComponent(token)}`];
    for (const k in params) {
      qparams.push(`${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`);
    }
    url += qparams.join('&');

    const resp = UrlFetchApp.fetch(url);
    const data = <ISlackResponse>JSON.parse(resp.getContentText());
    if (data.error) {
      throw `GET ${path}: ${data.error}`;
    }
    return data;
  }

  loadMessagesBulk(ch: ISlackChannel, options: { [key: string]: string | number } = {}): ISlackMessage[] {
    let messages: ISlackMessage[] = [];

    // channels.history will return the history from the latest to the oldest.
    // If the result's "has_more" is true, the channel has more older history.
    // In this case, use the result's "latest" value to the channel.history API parameters
    // to obtain the older page, and so on.
    options['count'] = HISTORY_COUNT_PER_PAGE;
    options['channel'] = ch.id;
    const loadSince = (oldest?: string) => {
      if (oldest) {
        options['oldest'] = oldest;
      }
      // order: recent-to-older
      let resp = <ISlackChannelsHistoryResponse>this.request('channels.history', options);
      messages = resp.messages.concat(messages);
      return resp;
    }

    let resp = loadSince();
    let page = 1;
    while (resp.has_more && page <= MAX_HISTORY_PAGINATION) {
      resp = loadSince(resp.messages[0].ts);
      page++;
    }

    // oldest-to-recent
    return messages.reverse();
  }


  unescapeMessageText(memberNames: { [id: string]: string }, text?: string): string {
    return (text || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/<@(.+?)>/g, ($0, userID) => {
        let name = memberNames[userID];
        return name ? `@${name}` : $0;
      });
  }

}

class GoogleSpreadsheetOperation {

  getLogsFolder(folderName: string, teamName: string): GoogleAppsScript.Drive.Folder {
    let folder = DriveApp.getRootFolder();
    let path = [folderName, teamName];
    path.forEach((name) => {
      let it = folder.getFoldersByName(name);
      if (it.hasNext()) {
        folder = it.next();
      } else {
        folder = folder.createFolder(name);
      }
    });
    return folder;
  }

}

class Utils {

  toDateFromSlackTs(timestamp: string): Date {
    return new Date(+timestamp * 1000);
  }

}