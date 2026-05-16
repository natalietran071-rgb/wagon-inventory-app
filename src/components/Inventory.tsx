import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import * as XLSX from 'xlsx';

// ─── Types ───────────────────────────────────────────────────────
interface InventoryItem {
  id?: number;
  erp: string;
  name: string;
  name_cn?: string;
  spec?: string;
  pos?: string;
  pos2?: string;
  unit?: string;
  start_stock: number;
  in_qty: number;
  out_qty: number;
  end_stock: number;
}

interface PeriodItem {
  erp: string;
  name: string;
  name_cn?: string;
  spec?: string;
  pos?: string;
  pos2?: string;
  unit?: string;
  opening_stock: number;
  in_period: number;
  out_period: number;
  closing_stock: number;
}

interface PeriodStats {
  total_items: number;
  items_with_stock: number;
  items_zero_stock: number;
  items_negative_stock: number;
  total_opening: number;
  total_in: number;
  total_out: number;
  total_closing: number;
}

interface InventoryStats {
  tong_sku: number;
  sku_co_ton: number;
  sku_het_ton: number;
  tong_nhap: number;
  tong_xuat: number;
  tong_ton: number;
}

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n: number) => (n || 0).toLocaleString('vi-VN');

const getMonthRange = (offset = 0) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  return {
    from: first.toISOString().split('T')[0],
    to: last.toISOString().split('T')[0],
    label: first.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }),
  };
};

const PAGE_SIZE = 50;

// ─── Component ───────────────────────────────────────────────────
export default function Inventory() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const isAdmin = profile?.role === 'admin';

  // Tab state
  const [activeTab, setActiveTab] = useState<'inventory' | 'report'>('inventory');

  // ──── TAB 1: Tồn Kho ────
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'zero'>('all');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<InventoryStats>({
    tong_sku: 0, sku_co_ton: 0, sku_het_ton: 0,
    tong_nhap: 0, tong_xuat: 0, tong_ton: 0,
  });
  const [sortCol, setSortCol] = useState<string>('erp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const searchTimeout = useRef<any>(null);

  // ──── TAB 2: Báo cáo theo kỳ ────
  const [reportData, setReportData] = useState<PeriodItem[]>([]);
  const [reportStats, setReportStats] = useState<PeriodStats | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState(getMonthRange().from);
  const [reportTo, setReportTo] = useState(getMonthRange().to);
  const [reportSearch, setReportSearch] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [reportSortCol, setReportSortCol] = useState<string>('erp');
  const [reportSortDir, setReportSortDir] = useState<'asc' | 'desc'>('asc');
  const reportSearchTimeout = useRef<any>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // ─── Load locations (once) ─────────────────────────────────────
  useEffect(() => {
    const loadLocations = async () => {
      const { data: locs } = await supabase
        .from('inventory')
        .select('pos')
        .not('pos', 'is', null)
        .not('pos', 'eq', '')
        .order('pos');
      if (locs) {
        const unique = [...new Set(locs.map((l: any) => l.pos))].filter(Boolean) as string[];
        setLocations(unique);
      }
    };
    loadLocations();
  }, []);

  // ─── Fetch inventory (Tab 1) ──────────────────────────────────
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('inventory').select('*', { count: 'exact' });

      if (search) {
        query = query.or(`erp.ilike.%${search}%,name.ilike.%${search}%`);
      }
      if (location) {
        query = query.ilike('pos', `${location}%`);
      }
      if (stockFilter === 'instock') {
        query = query.gt('end_stock', 0);
      } else if (stockFilter === 'zero') {
        query = query.eq('end_stock', 0);
      }

      query = query.order(sortCol, { ascending: sortDir === 'asc' });

      const { data: items, count, error } = await query;

      if (error) throw error;
      setData(items || []);

      // Calculate stats from full data
      if (items) {
        const totalItems = count || items.length;
        const inStock = items.filter(i => i.end_stock > 0).length;
        const zeroStock = items.filter(i => i.end_stock === 0).length;
        const totalIn = items.reduce((s, i) => s + (i.in_qty || 0), 0);
        const totalOut = items.reduce((s, i) => s + (i.out_qty || 0), 0);
        const totalEnd = items.reduce((s, i) => s + (i.end_stock || 0), 0);

        setStats({
          tong_sku: totalItems,
          sku_co_ton: inStock,
          sku_het_ton: zeroStock,
          tong_nhap: totalIn,
          tong_xuat: totalOut,
          tong_ton: totalEnd,
        });
      }
    } catch (err) {
      console.error('Fetch inventory error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, location, stockFilter, sortCol, sortDir]);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [activeTab, fetchInventory]);

  // ─── Fetch report (Tab 2) ─────────────────────────────────────
  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const [{ data: items, error: itemsErr }, { data: statsData, error: statsErr }] =
        await Promise.all([
          supabase.rpc('get_inventory_by_period', {
            p_from_date: reportFrom,
            p_to_date: reportTo,
            p_search: reportSearch,
            p_location: reportLocation,
          }),
          supabase.rpc('get_period_stats', {
            p_from_date: reportFrom,
            p_to_date: reportTo,
            p_search: reportSearch,
            p_location: reportLocation,
          }),
        ]);

      if (itemsErr) throw itemsErr;
      if (statsErr) throw statsErr;

      setReportData(items || []);
      setReportStats(statsData || null);
    } catch (err) {
      console.error('Fetch report error:', err);
    } finally {
      setReportLoading(false);
    }
  }, [reportFrom, reportTo, reportSearch, reportLocation]);

  useEffect(() => {
    if (activeTab === 'report') fetchReport();
  }, [activeTab, fetchReport]);

  // ─── Search debounce ──────────────────────────────────────────
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {}, 300);
  };

  const handleReportSearch = (val: string) => {
    setReportSearch(val);
    setReportPage(1);
    if (reportSearchTimeout.current) clearTimeout(reportSearchTimeout.current);
    reportSearchTimeout.current = setTimeout(() => {}, 300);
  };

  // ─── Sort handlers ────────────────────────────────────────────
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleReportSort = (col: string) => {
    if (reportSortCol === col) {
      setReportSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setReportSortCol(col);
      setReportSortDir('asc');
    }
    setReportPage(1);
  };

  // ─── Sort data locally for report ─────────────────────────────
  const sortedReportData = [...reportData].sort((a: any, b: any) => {
    const av = a[reportSortCol] ?? '';
    const bv = b[reportSortCol] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') {
      return reportSortDir === 'asc' ? av - bv : bv - av;
    }
    return reportSortDir === 'asc'
      ? String(av).localeCompare(String(bv), 'vi')
      : String(bv).localeCompare(String(av), 'vi');
  });

  // ─── Pagination ───────────────────────────────────────────────
  const paginatedData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(data.length / PAGE_SIZE);

  const paginatedReport = sortedReportData.slice(
    (reportPage - 1) * PAGE_SIZE,
    reportPage * PAGE_SIZE
  );
  const reportTotalPages = Math.ceil(sortedReportData.length / PAGE_SIZE);

  // ─── Quick month select ───────────────────────────────────────
  const handleQuickMonth = (offset: number) => {
    const range = getMonthRange(offset);
    setReportFrom(range.from);
    setReportTo(range.to);
    setReportPage(1);
  };

  // ─── EXPORT EXCEL ─────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      let exportData: any[] = [];
      const hasDateFilter = reportFrom && reportTo && activeTab === 'report';

      if (hasDateFilter) {
        // Export theo kỳ đã chọn → dùng RPC
        const { data: items, error } = await supabase.rpc('get_inventory_by_period', {
          p_from_date: reportFrom,
          p_to_date: reportTo,
          p_search: reportSearch || '',
          p_location: reportLocation || '',
        });
        if (error) throw error;

        exportData = (items || []).map((item: PeriodItem, idx: number) => ({
          'STT': idx + 1,
          'Mã ERP': item.erp,
          'Tên Item': item.name,
          'Tên CN': item.name_cn || '',
          'Quy cách': item.spec || '',
          'Vị trí': item.pos || '',
          'ĐVT': item.unit || '',
          'Tồn đầu kỳ': item.opening_stock || 0,
          'Nhập trong kỳ': item.in_period || 0,
          'Xuất trong kỳ': item.out_period || 0,
          'Tồn cuối kỳ': item.closing_stock || 0,
        }));
      } else {
        // Export toàn bộ → dùng RPC với date range rất rộng để lấy đủ nhập/xuất
        const minDate = '2020-01-01';
        const maxDate = new Date().toISOString().split('T')[0];

        const { data: items, error } = await supabase.rpc('get_inventory_by_period', {
          p_from_date: minDate,
          p_to_date: maxDate,
          p_search: search || '',
          p_location: location || '',
        });
        if (error) throw error;

        exportData = (items || []).map((item: PeriodItem, idx: number) => ({
          'STT': idx + 1,
          'Mã ERP': item.erp,
          'Tên Item': item.name,
          'Tên CN': item.name_cn || '',
          'Quy cách': item.spec || '',
          'Vị trí': item.pos || '',
          'ĐVT': item.unit || '',
          'Tồn đầu kỳ': item.opening_stock || 0,
          'Nhập trong kỳ': item.in_period || 0,
          'Xuất trong kỳ': item.out_period || 0,
          'Tồn cuối kỳ': item.closing_stock || 0,
        }));
      }

      if (exportData.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
      }

      // Create workbook — 1 sheet duy nhất, xuất hết toàn bộ bất kể bao nhiêu item
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      ws['!cols'] = [
        { wch: 6 },   // STT
        { wch: 18 },  // Mã ERP
        { wch: 40 },  // Tên Item
        { wch: 30 },  // Tên CN
        { wch: 25 },  // Quy cách
        { wch: 12 },  // Vị trí
        { wch: 8 },   // ĐVT
        { wch: 14 },  // Tồn đầu kỳ
        { wch: 14 },  // Nhập trong kỳ
        { wch: 14 },  // Xuất trong kỳ
        { wch: 14 },  // Tồn cuối kỳ
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Tồn Kho');

      // File name
      const dateStr = hasDateFilter
        ? `_${reportFrom}_${reportTo}`
        : `_all_${new Date().toISOString().split('T')[0]}`;
      const fileName = `TonKho${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export error:', err);
      alert('Lỗi khi xuất Excel. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  };

  // ─── Sort indicator ───────────────────────────────────────────
  const SortIcon = ({ col, currentCol, dir }: { col: string; currentCol: string; dir: string }) => (
    <span style={{ opacity: col === currentCol ? 1 : 0.3, marginLeft: 4, fontSize: 11 }}>
      {col === currentCol ? (dir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  // ─── Pagination component ────────────────────────────────────
  const Pagination = ({
    current, total, onChange,
  }: { current: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div style={{
        display: 'flex', gap: 4, justifyContent: 'center',
        alignItems: 'center', padding: '12px 0', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>
          Trang {current}/{total}
        </span>
        {current > 1 && (
          <>
            <button onClick={() => onChange(1)} style={pgBtnStyle}>«</button>
            <button onClick={() => onChange(current - 1)} style={pgBtnStyle}>‹</button>
          </>
        )}
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              ...pgBtnStyle,
              ...(p === current ? { background: '#1a3a5c', color: '#fff', borderColor: '#1a3a5c' } : {}),
            }}
          >
            {p}
          </button>
        ))}
        {current < total && (
          <>
            <button onClick={() => onChange(current + 1)} style={pgBtnStyle}>›</button>
            <button onClick={() => onChange(total)} style={pgBtnStyle}>»</button>
          </>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '0' }}>
      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 16,
        background: '#fff', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            ...tabStyle,
            ...(activeTab === 'inventory' ? activeTabStyle : {}),
          }}
        >
          📦 Tồn Kho
        </button>
        <button
          onClick={() => setActiveTab('report')}
          style={{
            ...tabStyle,
            ...(activeTab === 'report' ? activeTabStyle : {}),
          }}
        >
          📊 Báo Cáo Theo Kỳ
        </button>
      </div>

      {/* ══════════ TAB 1: TỒN KHO ══════════ */}
      {activeTab === 'inventory' && (
        <div>
          {/* Dashboard Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10, marginBottom: 16,
          }}>
            <StatCard label="Tổng Item" value={fmt(stats.tong_sku)} color="#1a3a5c" icon="📦" />
            <StatCard label="Có tồn kho" value={fmt(stats.sku_co_ton)} color="#16a34a" icon="✅" />
            <StatCard label="Tồn = 0" value={fmt(stats.sku_het_ton)} color="#dc2626" icon="⚠️" />
            <StatCard label="Tổng nhập" value={fmt(stats.tong_nhap)} color="#2563eb" icon="📥" />
            <StatCard label="Tổng xuất" value={fmt(stats.tong_xuat)} color="#ea580c" icon="📤" />
            <StatCard label="Tổng tồn" value={fmt(stats.tong_ton)} color="#7c3aed" icon="🏭" />
          </div>

          {/* Filters */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <input
              type="text"
              placeholder="🔍 Tìm mã ERP, tên item..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={inputStyle}
            />
            <select
              value={location}
              onChange={e => { setLocation(e.target.value); setPage(1); }}
              style={{ ...inputStyle, maxWidth: 160 }}
            >
              <option value="">Tất cả vị trí</option>
              {locations.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={e => { setStockFilter(e.target.value as any); setPage(1); }}
              style={{ ...inputStyle, maxWidth: 160 }}
            >
              <option value="all">Tất cả</option>
              <option value="instock">Có tồn kho</option>
              <option value="zero">Tồn = 0</option>
            </select>
            <button onClick={handleExport} disabled={exporting} style={exportBtnStyle}>
              {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div style={emptyStyle}>⏳ Đang tải dữ liệu...</div>
          ) : data.length === 0 ? (
            <div style={emptyStyle}>Không có dữ liệu</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>STT</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('erp')}>
                        Mã ERP <SortIcon col="erp" currentCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('name')}>
                        Tên Item <SortIcon col="name" currentCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={thStyle}>Vị trí</th>
                      <th style={thStyle}>ĐVT</th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('start_stock')}>
                        <div>Tồn đầu kỳ</div>
                        <div style={thSumStyle}>{fmt(data.reduce((s, i) => s + (i.start_stock || 0), 0))}</div>
                        <SortIcon col="start_stock" currentCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#16a34a' }} onClick={() => handleSort('in_qty')}>
                        <div>Nhập</div>
                        <div style={thSumStyle}>{fmt(stats.tong_nhap)}</div>
                        <SortIcon col="in_qty" currentCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#dc2626' }} onClick={() => handleSort('out_qty')}>
                        <div>Xuất</div>
                        <div style={thSumStyle}>{fmt(stats.tong_xuat)}</div>
                        <SortIcon col="out_qty" currentCol={sortCol} dir={sortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#1a3a5c' }} onClick={() => handleSort('end_stock')}>
                        <div>Tồn cuối</div>
                        <div style={thSumStyle}>{fmt(stats.tong_ton)}</div>
                        <SortIcon col="end_stock" currentCol={sortCol} dir={sortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((item, idx) => (
                      <tr key={item.erp} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={tdStyle}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                          {item.erp}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500 }}>{item.name}</div>
                          {item.name_cn && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.name_cn}</div>
                          )}
                          {item.spec && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.spec}</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeLocStyle}>{item.pos || '—'}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{item.unit || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                          {fmt(item.start_stock)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontFamily: 'monospace',
                          color: item.in_qty > 0 ? '#16a34a' : '#94a3b8',
                        }}>
                          {item.in_qty > 0 ? `+${fmt(item.in_qty)}` : fmt(item.in_qty)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontFamily: 'monospace',
                          color: item.out_qty > 0 ? '#dc2626' : '#94a3b8',
                        }}>
                          {item.out_qty > 0 ? `-${fmt(item.out_qty)}` : fmt(item.out_qty)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace',
                          color: item.end_stock > 0 ? '#1a3a5c' : item.end_stock < 0 ? '#dc2626' : '#94a3b8',
                        }}>
                          {fmt(item.end_stock)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination current={page} total={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      )}

      {/* ══════════ TAB 2: BÁO CÁO THEO KỲ ══════════ */}
      {activeTab === 'report' && (
        <div>
          {/* Period selector */}
          <div style={{
            background: '#fff', borderRadius: 10, padding: 14,
            border: '1px solid #e2e8f0', marginBottom: 14,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#1a3a5c' }}>
              📅 Chọn kỳ báo cáo
            </div>

            {/* Quick month buttons */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {[0, -1, -2, -3].map(offset => {
                const range = getMonthRange(offset);
                const isActive = reportFrom === range.from && reportTo === range.to;
                return (
                  <button
                    key={offset}
                    onClick={() => handleQuickMonth(offset)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: '1px solid',
                      cursor: 'pointer',
                      background: isActive ? '#1a3a5c' : '#f8fafc',
                      color: isActive ? '#fff' : '#475569',
                      borderColor: isActive ? '#1a3a5c' : '#cbd5e1',
                    }}
                  >
                    {range.label}
                  </button>
                );
              })}
            </div>

            {/* Custom date range */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="date"
                value={reportFrom}
                onChange={e => { setReportFrom(e.target.value); setReportPage(1); }}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              <span style={{ color: '#94a3b8', fontSize: 13 }}>→</span>
              <input
                type="date"
                value={reportTo}
                onChange={e => { setReportTo(e.target.value); setReportPage(1); }}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              <input
                type="text"
                placeholder="🔍 Tìm mã ERP, tên item..."
                value={reportSearch}
                onChange={e => handleReportSearch(e.target.value)}
                style={inputStyle}
              />
              <select
                value={reportLocation}
                onChange={e => { setReportLocation(e.target.value); setReportPage(1); }}
                style={{ ...inputStyle, maxWidth: 160 }}
              >
                <option value="">Tất cả vị trí</option>
                {locations.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button onClick={handleExport} disabled={exporting} style={exportBtnStyle}>
                {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
              </button>
            </div>
          </div>

          {/* Report Dashboard */}
          {reportStats && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10, marginBottom: 14,
            }}>
              <StatCard label="Tổng Item" value={fmt(reportStats.total_items)} color="#1a3a5c" icon="📦" />
              <StatCard label="Có tồn kho" value={fmt(reportStats.items_with_stock)} color="#16a34a" icon="✅" />
              <StatCard label="Tồn = 0" value={fmt(reportStats.items_zero_stock)} color="#dc2626" icon="⚠️" />
              <StatCard label="Tổng nhập kỳ" value={fmt(reportStats.total_in)} color="#2563eb" icon="📥" />
              <StatCard label="Tổng xuất kỳ" value={fmt(reportStats.total_out)} color="#ea580c" icon="📤" />
              <StatCard label="Tồn cuối kỳ" value={fmt(reportStats.total_closing)} color="#7c3aed" icon="🏭" />
            </div>
          )}

          {/* Report Table */}
          {reportLoading ? (
            <div style={emptyStyle}>⏳ Đang tải báo cáo...</div>
          ) : reportData.length === 0 ? (
            <div style={emptyStyle}>Không có dữ liệu trong kỳ này</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>STT</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleReportSort('erp')}>
                        Mã ERP <SortIcon col="erp" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleReportSort('name')}>
                        Tên Item <SortIcon col="name" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                      <th style={thStyle}>Vị trí</th>
                      <th style={thStyle}>ĐVT</th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => handleReportSort('opening_stock')}>
                        <div>Tồn đầu kỳ</div>
                        <div style={thSumStyle}>{reportStats ? fmt(reportStats.total_opening) : ''}</div>
                        <SortIcon col="opening_stock" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#16a34a' }} onClick={() => handleReportSort('in_period')}>
                        <div>Nhập trong kỳ</div>
                        <div style={thSumStyle}>{reportStats ? fmt(reportStats.total_in) : ''}</div>
                        <SortIcon col="in_period" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#dc2626' }} onClick={() => handleReportSort('out_period')}>
                        <div>Xuất trong kỳ</div>
                        <div style={thSumStyle}>{reportStats ? fmt(reportStats.total_out) : ''}</div>
                        <SortIcon col="out_period" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right', color: '#1a3a5c' }} onClick={() => handleReportSort('closing_stock')}>
                        <div>Tồn cuối kỳ</div>
                        <div style={thSumStyle}>{reportStats ? fmt(reportStats.total_closing) : ''}</div>
                        <SortIcon col="closing_stock" currentCol={reportSortCol} dir={reportSortDir} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReport.map((item, idx) => (
                      <tr key={item.erp} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={tdStyle}>{(reportPage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                          {item.erp}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500 }}>{item.name}</div>
                          {item.name_cn && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.name_cn}</div>
                          )}
                          {item.spec && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.spec}</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeLocStyle}>{item.pos || '—'}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{item.unit || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                          {fmt(item.opening_stock)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontFamily: 'monospace',
                          color: item.in_period > 0 ? '#16a34a' : '#94a3b8',
                        }}>
                          {item.in_period > 0 ? `+${fmt(item.in_period)}` : fmt(item.in_period)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontFamily: 'monospace',
                          color: item.out_period > 0 ? '#dc2626' : '#94a3b8',
                        }}>
                          {item.out_period > 0 ? `-${fmt(item.out_period)}` : fmt(item.out_period)}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace',
                          color: item.closing_stock > 0 ? '#1a3a5c' : item.closing_stock < 0 ? '#dc2626' : '#94a3b8',
                        }}>
                          {fmt(item.closing_stock)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination current={reportPage} total={reportTotalPages} onChange={setReportPage} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StatCard Component ─────────────────────────────────────────
function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '12px 14px',
      border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const tabStyle: React.CSSProperties = {
  padding: '12px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  color: '#64748b', borderBottom: '3px solid transparent', marginBottom: -2,
  background: 'none', border: 'none', borderBottomStyle: 'solid',
  borderBottomWidth: 3, borderBottomColor: 'transparent',
  fontFamily: 'inherit', transition: 'all 0.2s',
};

const activeTabStyle: React.CSSProperties = {
  color: '#1a3a5c', borderBottomColor: '#1a3a5c',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
  fontSize: 13, outline: 'none', flex: 1, minWidth: 140,
  background: '#fff',
};

const exportBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid #16a34a',
  background: '#f0fdf4', color: '#16a34a', fontWeight: 600,
  fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
};

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: '10px 8px', textAlign: 'left', fontWeight: 700,
  background: '#1a3a5c', color: '#fff', fontSize: 12,
  whiteSpace: 'nowrap', position: 'sticky', top: 0,
};

const thSumStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 400, opacity: 0.85,
  fontFamily: 'monospace', marginTop: 2,
};

const tdStyle: React.CSSProperties = {
  padding: '8px', borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top', fontSize: 13,
};

const pgBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
  background: '#fff', cursor: 'pointer', fontSize: 12,
};

const badgeLocStyle: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
  background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14,
};
