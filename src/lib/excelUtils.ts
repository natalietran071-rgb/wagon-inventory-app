import * as XLSX from 'xlsx';

/**
 * Exports data to an Excel file, splitting it into multiple sheets if it exceeds the SHEET_SIZE.
 * @param data Array of objects to export
 * @param fileName Name of the resulting Excel file
 * @param sheetPrefix Prefix for the sheet names
 */
export const exportToExcelMultiSheet = (
  data: any[],
  fileName: string,
  sheetPrefix: string
) => {
  const SHEET_SIZE = 1000;
  const workbook = XLSX.utils.book_new();
  const totalSheets = Math.ceil(data.length / SHEET_SIZE);

  if (data.length === 0) {
    const worksheet = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetPrefix);
  } else {
    for (let i = 0; i < totalSheets; i++) {
      const chunk = data.slice(i * SHEET_SIZE, (i + 1) * SHEET_SIZE);
      const worksheet = XLSX.utils.json_to_sheet(chunk);
      const sheetName = totalSheets === 1
        ? sheetPrefix
        : `${sheetPrefix} ${i + 1}`;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }
  }

  XLSX.writeFile(workbook, fileName);
  return totalSheets || 1;
};
