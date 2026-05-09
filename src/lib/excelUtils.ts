import * as XLSX from 'xlsx';

const ROWS_PER_SHEET = 50000;
const ROWS_PER_FILE = 200000;

/**
 * Exports data to Excel. Auto-splits into multiple sheets/files.
 */
export const exportToExcelMultiSheet = (
  data: any[],
  fileName: string,
  sheetPrefix: string
) => {
  if (data.length <= ROWS_PER_FILE) {
    const workbook = XLSX.utils.book_new();
    const totalSheets = Math.ceil(data.length / ROWS_PER_SHEET) || 1;

    if (data.length === 0) {
      const worksheet = XLSX.utils.json_to_sheet([]);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetPrefix);
    } else {
      for (let i = 0; i < totalSheets; i++) {
        const chunk = data.slice(i * ROWS_PER_SHEET, (i + 1) * ROWS_PER_SHEET);
        const worksheet = XLSX.utils.json_to_sheet(chunk);
        const sheetName = totalSheets === 1
          ? sheetPrefix
          : `${sheetPrefix} ${i + 1}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
      }
    }

    XLSX.writeFile(workbook, fileName);
    return totalSheets;
  } else {
    exportMultipleFiles(data, fileName, sheetPrefix);
    return Math.ceil(data.length / ROWS_PER_FILE);
  }
};

const exportMultipleFiles = async (
  data: any[],
  fileName: string,
  sheetPrefix: string
) => {
  const totalFiles = Math.ceil(data.length / ROWS_PER_FILE);
  const baseName = fileName.replace(/\.xlsx$/i, '');

  for (let f = 0; f < totalFiles; f++) {
    const fileChunk = data.slice(f * ROWS_PER_FILE, (f + 1) * ROWS_PER_FILE);
    const workbook = XLSX.utils.book_new();
    const totalSheets = Math.ceil(fileChunk.length / ROWS_PER_SHEET);

    for (let s = 0; s < totalSheets; s++) {
      const sheetChunk = fileChunk.slice(s * ROWS_PER_SHEET, (s + 1) * ROWS_PER_SHEET);
      const worksheet = XLSX.utils.json_to_sheet(sheetChunk);
      const sheetName = totalSheets === 1
        ? sheetPrefix
        : `${sheetPrefix} ${s + 1}`;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
    }

    const partName = totalFiles === 1 ? fileName : `${baseName}_Part${f + 1}.xlsx`;
    
    await new Promise(resolve => setTimeout(resolve, f * 500));
    XLSX.writeFile(workbook, partName);
  }
};

/**
 * Fetch ALL data from a Supabase table with no row limit.
 * Supabase default limit is 1000, so we paginate.
 */
export const fetchAllRows = async (
  supabase: any,
  table: string,
  options?: {
    select?: string;
    filters?: { column: string; operator: string; value: any }[];
    order?: { column: string; ascending?: boolean };
    dateRange?: { column: string; from?: string; to?: string };
  }
) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(options?.select || '*')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (options?.filters) {
      for (const f of options.filters) {
        if (f.operator === 'eq') query = query.eq(f.column, f.value);
        else if (f.operator === 'neq') query = query.neq(f.column, f.value);
        else if (f.operator === 'ilike') query = query.ilike(f.column, f.value);
        else if (f.operator === 'gte') query = query.gte(f.column, f.value);
        else if (f.operator === 'lte') query = query.lte(f.column, f.value);
        else if (f.operator === 'in') query = query.in(f.column, f.value);
      }
    }

    if (options?.dateRange) {
      if (options.dateRange.from) {
        query = query.gte(options.dateRange.column, options.dateRange.from);
      }
      if (options.dateRange.to) {
        query = query.lte(options.dateRange.column, options.dateRange.to + 'T23:59:59');
      }
    }

    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
};
