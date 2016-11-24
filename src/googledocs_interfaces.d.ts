interface ISpreadsheetInfo {
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
  sheets: { [ id: string ]: GoogleAppsScript.Spreadsheet.Sheet; };
}

