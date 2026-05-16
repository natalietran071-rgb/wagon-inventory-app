import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { exportToExcelMultiSheet } from '../lib/excelUtils';
import { useAuth } from '../contexts/AuthContext';
import ItemManagement from './ItemManagement';
import ItemHistoryModal from './ItemHistoryModal';

const showToast = (msg: string, isError = false) => {
  try {
    const div = document.createElement('div');
    div.className = `fixed top-6 right-6 z-[9999] px-6 py-4 rounded-xl shadow-2xl font-bold text-sm transition-all duration-300 transform translate-y-0 opacity-100 ${isError ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`;
    div.innerText = msg;
    document.body.appendChild(div);
    setTimeout(() => {
      div.classList.add('opacity-0', '-translate-y-4');
      setTimeout(() => div.remove(), 300);
    }, 3000);
  } catch(e) {
    console.log(msg);
  }
};

const fmt = (n: number) => (n || 0).toLocaleString('en-US');

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

const Inventory = () => {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const isAdmin = profile?.role === 'admin' || user?.email === 'natalietran071@gmail.com';
  const canEdit = profile?.role === 'admin' || profile?.role === 'editor' || user?.email === 'natalietran071@gmail.com' || !profile;

  // Tab state
  const [activeTab, setActiveTab] = useState<'inventory' | 'report'>('inventory');

  // ──── TAB 1: Tồn Kho ────
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [alertFilter, setAlertFilter] = useState<'all' | 'negative' | 'missing' | 'critical'>('all');

  // ──── TAB 2: Báo cáo theo kỳ ────
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportStats, setReportStats] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState(getMonthRange().from);
  const [reportTo, setReportTo] = useState(getMonthRange().to);
  const [reportSearch, setReportSearch] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportSortField, setReportSortField] = useState('');
  const [reportSortDir, setReportSortDir] = useState<'asc' | 'desc' | ''>('');
  const [reportPage, setReportPage] = useState(1);

  // History modal
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; erp: string; name: string }>({ isOpen: false, erp: '', name: '' });

  // ─── Load locations once ────────────────────
  useEffect(() => {
    const loadLocations = async () => {
      const { data } = await supabase
        .from('inventory')
        .select('pos')
        .not('pos', 'is', null)
        .not('pos', 'eq', '')
        .order('pos');
      if (data) {
        const unique = [...new Set(data.map((l: any) => l.pos))].filter(Boolean) as string[];
        setLocations(unique);
      }
    };
    loadLocations();
  }, []);

  // ─── Fetch inventory (Tab 1) ────────────────
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      if (fromDate && toDate) {
        // Date filter → use RPC to get period data
        const { data, error } = await supabase.rpc('get_inventory_by_period', {
          p_from_date: fromDate,
          p_to_date: toDate,
          p_search: searchQuery || '',
          p_location: locationFilter || '',
        });
        if (error) throw error;
        setInventoryData((data || []).map((item: any) => ({
          ...item,
          start_stock: item.opening_stock,
          in_qty: item.in_period,
          out_qty: item.out_period,
          end_stock: item.closing_stock,
        })));
      } else {
        // No date filter → direct query
        let query = supabase.from('inventory').select('*');
        if (searchQuery) {
          query = query.or(`erp.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%`);
        }
        if (locationFilter) {
          query = query.ilike('pos', `${locationFilter}%`);
        }
        query = query.order('erp', { ascending: true });
        const { data, error } = await query;
        if (error) throw error;
        setInventoryData(data || []);
      }
    } catch (err) {
      console.error('Fetch inventory error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, locationFilter, fromDate, toDate]);

  useEffect(() => {
    if (activeTab === 'inventory') fetchInventory();
  }, [activeTab, fetchInventory]);

  // ─── Fetch report (Tab 2) ──────────────────
  const fetchReport = useCallback(async () => {
    if (!reportFrom || !reportTo) return;
    setReportLoading(true);
    try {
      const [{ data: items, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
        supabase.rpc('get_inventory_by_period', {
          p_from_date: reportFrom,
          p_to_date: reportTo,
          p_search: reportSearch || '',
          p_location: reportLocation || '',
        }),
        supabase.rpc('get_period_stats', {
          p_from_date: reportFrom,
          p_to_date: reportTo,
          p_search: reportSearch || '',
          p_location: reportLocation || '',
        }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setReportData(items || []);
      setReportStats(stats || null);
    } catch (err) {
      console.error('Fetch report error:', err);
    } finally {
      setReportLoading(false);
    }
  }, [reportFrom, reportTo, reportSearch, reportLocation]);

  useEffect(() => {
    if (activeTab === 'report') fetchReport();
  }, [activeTab, fetchReport]);

  // ─── Stats ──────────────────────────────────
  const stats = useMemo(() => {
    const d = inventoryData;
    return {
      total: d.length,
      inStock: d.filter(i => (i.end_stock || 0) > 0).length,
      zeroStock: d.filter(i => (i.end_stock || 0) === 0).length,
      negative: d.filter(i => (i.end_stock || 0) < 0).length,
      totalIn: d.reduce((s, i) => s + (i.in_qty || 0), 0),
      totalOut: d.reduce((s, i) => s + (i.out_qty || 0), 0),
      totalEnd: d.reduce((s, i) => s + (i.end_stock || 0), 0),
      totalStart: d.reduce((s, i) => s + (i.start_stock || 0), 0),
      critical: d.filter(i => i.critical).length,
      missingInfo: d.filter(i => !i.name || !i.pos).length,
      itemWithIn: d.filter(i => (i.in_qty || 0) > 0).length,
    };
  }, [inventoryData]);

  // ─── Filtered + sorted (Tab 1) ─────────────
  const filteredData = useMemo(() => {
    let result = [...inventoryData];
    if (alertFilter === 'negative') result = result.filter(i => (i.end_stock || 0) < 0);
    else if (alertFilter === 'missing') result = result.filter(i => !i.name || !i.pos);
    else if (alertFilter === 'critical') result = result.filter(i => i.critical);
    if (sortField && sortDir) {
      result.sort((a: any, b: any) => {
        const av = a[sortField] ?? '';
        const bv = b[sortField] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc' ? String(av).localeCompare(String(bv), 'vi') : String(bv).localeCompare(String(av), 'vi');
      });
    }
    return result;
  }, [inventoryData, alertFilter, sortField, sortDir]);

  // ─── Filtered + sorted (Tab 2) ─────────────
  const filteredReport = useMemo(() => {
    let result = [...reportData];
    if (reportSortField && reportSortDir) {
      result.sort((a: any, b: any) => {
        const av = a[reportSortField] ?? '';
        const bv = b[reportSortField] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return reportSortDir === 'asc' ? av - bv : bv - av;
        return reportSortDir === 'asc' ? String(av).localeCompare(String(bv), 'vi') : String(bv).localeCompare(String(av), 'vi');
      });
    }
    return result;
  }, [reportData, reportSortField, reportSortDir]);

  // ─── Pagination ─────────────────────────────
  const pagedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const pagedReport = filteredReport.slice((reportPage - 1) * PAGE_SIZE, reportPage * PAGE_SIZE);
  const reportTotalPages = Math.ceil(filteredReport.length / PAGE_SIZE);

  // ─── Sort with 3-state (asc → desc → off) ──
  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(''); setSortDir(''); }
    } else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };
  const handleReportSort = (field: string) => {
    if (reportSortField === field) {
      if (reportSortDir === 'asc') setReportSortDir('desc');
      else { setReportSortField(''); setReportSortDir(''); }
    } else { setReportSortField(field); setReportSortDir('asc'); }
    setReportPage(1);
  };

  const SortIcon = ({ field, cur, dir }: { field: string; cur: string; dir: string }) => {
    if (field !== cur || !dir) return <span className="ml-1 opacity-30 text-[9px]">↕</span>;
    return <span className="ml-1 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>;
  };

  // ─── Quick month ────────────────────────────
  const handleQuickMonth = (offset: number) => {
    const range = getMonthRange(offset);
    setReportFrom(range.from);
    setReportTo(range.to);
    setReportPage(1);
  };

  // ─── Export Excel ───────────────────────────
  const handleExport = async () => {
    setExporting(true);
    showToast('Đang xuất dữ liệu...');
    try {
      const isReportTab = activeTab === 'report';
      const pFromDate = isReportTab ? reportFrom : (fromDate || '2020-01-01');
      const pToDate = isReportTab ? reportTo : (toDate || new Date().toISOString().split('T')[0]);
      const pSearch = isReportTab ? reportSearch : searchQuery;
      const pLocation = isReportTab ? reportLocation : locationFilter;

      const { data, error } = await supabase.rpc('get_inventory_by_period', {
        p_from_date: pFromDate, p_to_date: pToDate, p_search: pSearch || '', p_location: pLocation || '',
      });
      if (error) throw error;
      if (!data || data.length === 0) { showToast('Không có dữ liệu để xuất', true); setExporting(false); return; }

      const exportData = data.map((item: any, idx: number) => ({
        'STT': idx + 1, 'Mã ERP': item.erp, 'Tên Item': item.name || '', 'Tên CN': item.name_cn || '',
        'Quy cách': item.spec || '', 'Vị trí': item.pos || '', 'ĐVT': item.unit || '',
        'Tồn đầu kỳ': item.opening_stock || 0, 'Nhập trong kỳ': item.in_period || 0,
        'Xuất trong kỳ': item.out_period || 0, 'Tồn cuối kỳ': item.closing_stock || 0,
      }));

      const today = new Date().toISOString().split('T')[0];
      const hasDateFilter = isReportTab || (fromDate && toDate);
      const dateStr = hasDateFilter ? `_${pFromDate}_${pToDate}` : `_all_${today}`;
      const sheets = exportToExcelMultiSheet(exportData, `TonKho${dateStr}.xlsx`, 'Tồn Kho');
      showToast(`✅ Đã xuất ${exportData.length.toLocaleString()} dòng — ${sheets} sheet!`);
    } catch (err: any) {
      console.error('Export error:', err);
      showToast('Lỗi: ' + err.message, true);
    } finally { setExporting(false); }
  };

  // ─── Report sums ────────────────────────────
  const reportSums = useMemo(() => ({
    opening: filteredReport.reduce((s, i) => s + (i.opening_stock || 0), 0),
    inPeriod: filteredReport.reduce((s, i) => s + (i.in_period || 0), 0),
    outPeriod: filteredReport.reduce((s, i) => s + (i.out_period || 0), 0),
    closing: filteredReport.reduce((s, i) => s + (i.closing_stock || 0), 0),
  }), [filteredReport]);

  // ─── Render pagination ──────────────────────
  const renderPagination = (currentPage: number, total: number, setFn: (p: number) => void, itemCount: number) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-2 p-4 border-t border-outline-variant/10 flex-wrap">
        <span className="text-[10px] font-bold text-on-surface-variant">Trang {currentPage}/{total} ({itemCount.toLocaleString()} item)</span>
        {currentPage > 1 && (<>
          <button onClick={() => setFn(1)} className="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-bold hover:bg-primary/10">«</button>
          <button onClick={() => setFn(currentPage - 1)} className="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-bold hover:bg-primary/10">‹</button>
        </>)}
        {Array.from({ length: Math.min(5, total) }, (_, i) => {
          const p = Math.max(1, Math.min(currentPage - 2, total - 4)) + i;
          if (p > total) return null;
          return <button key={p} onClick={() => setFn(p)} className={`px-3 py-1 rounded-lg text-xs font-bold ${p === currentPage ? 'bg-primary text-on-primary' : 'bg-surface-container-high hover:bg-primary/10'}`}>{p}</button>;
        })}
        {currentPage < total && (<>
          <button onClick={() => setFn(currentPage + 1)} className="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-bold hover:bg-primary/10">›</button>
          <button onClick={() => setFn(total)} className="px-2 py-1 rounded-lg bg-surface-container-high text-xs font-bold hover:bg-primary/10">»</button>
        </>)}
      </div>
    );
  };

  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════
  return (
    <div className="space-y-6 md:space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold font-manrope text-on-surface tracking-tight mb-1 md:mb-2">{t('inventory')}</h2>
          <p className="text-xs md:text-sm text-on-surface-variant font-medium">Theo dõi và quản lý vật tư trong thời gian thực.</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-surface-container-low p-1 rounded-xl w-full md:w-auto">
            <button onClick={() => setActiveTab('inventory')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === 'inventory' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
              📦 Tồn Kho
            </button>
            <button onClick={() => setActiveTab('report')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${activeTab === 'report' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
              📊 Báo Cáo Theo Kỳ
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ TAB 1: TỒN KHO ═══════ */}
      {activeTab === 'inventory' && (<>
        {/* Search */}
        <div className="bg-surface-container-lowest rounded-2xl md:rounded-[2rem] p-4 md:p-6 shadow-sm border border-outline-variant/10">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">search</span>
            <input type="text" placeholder="Tìm kiếm..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full bg-surface-container-low border-none rounded-xl pl-12 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
        </div>

        {/* Alert pills */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-bold text-on-surface-variant">Cảnh báo:</span>
          {([
            { key: 'all', label: 'Tất cả', active: 'bg-primary text-on-primary' },
            { key: 'negative', label: 'Tồn âm', active: 'bg-error/10 text-error border border-error/30' },
            { key: 'missing', label: 'Thiếu TT', active: 'bg-secondary/10 text-secondary border border-secondary/30' },
            { key: 'critical', label: '⭐ Critical', active: 'bg-tertiary/10 text-tertiary border border-tertiary/30' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => { setAlertFilter(f.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold transition-all ${alertFilter === f.key ? f.active : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-surface-container-lowest rounded-2xl p-4 md:p-5 shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><span className="material-symbols-outlined text-primary text-lg">inventory_2</span></div></div>
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Tổng mã hàng (Item)</div>
            <div className="text-xl md:text-2xl font-black font-manrope text-on-surface mt-1">{fmt(stats.total)}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-4 md:p-5 shadow-sm border border-outline-variant/10 col-span-1 md:col-span-2">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">📊 Thống kê lưu lượng</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <div><div className="text-[9px] font-bold text-on-surface-variant uppercase">Item có nhập</div><div className="text-sm md:text-base font-black text-primary">{fmt(stats.itemWithIn)}</div></div>
              <div><div className="text-[9px] font-bold text-on-surface-variant uppercase">Tổng nhập</div><div className="text-sm md:text-base font-black text-secondary">{fmt(stats.totalIn)}</div></div>
              <div><div className="text-[9px] font-bold text-on-surface-variant uppercase">Tổng xuất</div><div className="text-sm md:text-base font-black text-error">{fmt(stats.totalOut)}</div></div>
              <div><div className="text-[9px] font-bold text-on-surface-variant uppercase">Tồn kho</div><div className="text-sm md:text-base font-black text-tertiary">{fmt(stats.totalEnd)}</div></div>
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-4 md:p-5 shadow-sm border border-error/20">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-xl bg-error/10 flex items-center justify-center"><span className="material-symbols-outlined text-error text-lg">warning</span></div></div>
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Cần mua ngay</div>
            <div className="text-xl md:text-2xl font-black font-manrope text-error mt-1">{fmt(stats.zeroStock)} <span className="text-xs font-medium text-on-surface-variant">Mã</span></div>
            {stats.negative > 0 && <div className="text-[9px] text-error font-bold mt-0.5">⚠ {stats.negative} mã tồn âm</div>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <select value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
            className="bg-surface-container-low border border-outline-variant/10 rounded-xl px-4 py-2 text-xs md:text-sm font-medium outline-none w-full md:w-auto">
            <option value="">Tất cả Vị Trí</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={sortField ? `${sortField}:${sortDir}` : ''} onChange={e => {
            if (!e.target.value) { setSortField(''); setSortDir(''); }
            else { const [f, d] = e.target.value.split(':'); setSortField(f); setSortDir(d as any); }
            setPage(1);
          }} className="bg-surface-container-low border border-outline-variant/10 rounded-xl px-4 py-2 text-xs md:text-sm font-medium outline-none w-full md:w-auto">
            <option value="">Sắp xếp: Mới nhất</option>
            <option value="erp:asc">Mã ERP A→Z</option>
            <option value="erp:desc">Mã ERP Z→A</option>
            <option value="end_stock:asc">Tồn: Thấp → Cao</option>
            <option value="end_stock:desc">Tồn: Cao → Thấp</option>
            <option value="in_qty:desc">Nhập: Cao → Thấp</option>
            <option value="out_qty:desc">Xuất: Cao → Thấp</option>
          </select>
          <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/10 w-full md:w-auto">
            <span className="material-symbols-outlined text-sm text-on-surface-variant shrink-0">calendar_today</span>
            <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer p-0 min-w-[90px]" />
            <span className="text-xs text-on-surface-variant">đến</span>
            <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer p-0 min-w-[90px]" />
            {(fromDate || toDate) && <button onClick={() => { setFromDate(''); setToDate(''); }} className="material-symbols-outlined text-[14px] hover:text-error ml-1 shrink-0">close</button>}
          </div>
          <div className="flex gap-2 ml-auto">
            <span className="text-[10px] font-bold text-on-surface-variant self-center">Cập nhật lần cuối: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-xl text-primary hover:bg-primary-container hover:text-on-primary-container transition-colors font-bold text-xs disabled:opacity-50">
              <span className="material-symbols-outlined text-sm">{exporting ? 'sync' : 'download'}</span>
              {exporting ? 'Đang xuất...' : 'Xuất Excel'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-2xl md:rounded-[2rem] shadow-sm overflow-hidden border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="text-[9px] md:text-[10px] font-black text-on-surface-variant uppercase tracking-widest bg-surface-container-highest border-b border-outline-variant/20">
                  <th className="py-3 md:py-4 px-2 md:px-4 cursor-pointer select-none" onClick={() => handleSort('erp')}>Mã ERP <SortIcon field="erp" cur={sortField} dir={sortDir} /></th>
                  <th className="py-3 md:py-4 px-2 md:px-4 cursor-pointer select-none" onClick={() => handleSort('name')}>Tên Vật Tư <SortIcon field="name" cur={sortField} dir={sortDir} /></th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden lg:table-cell">Tên Tiếng Trung</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden xl:table-cell">Quy Cách</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell">ĐVT</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell">Vị Trí</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none hidden lg:table-cell" onClick={() => handleSort('start_stock')}>
                    <div>Tồn Đầu</div><div className="text-[8px] font-medium opacity-70 font-mono">{fmt(stats.totalStart)}</div><SortIcon field="start_stock" cur={sortField} dir={sortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleSort('in_qty')}>
                    <div className="text-primary">Nhập</div><div className="text-[8px] font-medium opacity-70 font-mono text-primary">{fmt(stats.totalIn)}</div><SortIcon field="in_qty" cur={sortField} dir={sortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleSort('out_qty')}>
                    <div className="text-error">Xuất</div><div className="text-[8px] font-medium opacity-70 font-mono text-error">{fmt(stats.totalOut)}</div><SortIcon field="out_qty" cur={sortField} dir={sortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleSort('end_stock')}>
                    <div className="text-tertiary">Tồn Cuối</div><div className="text-[8px] font-medium opacity-70 font-mono text-tertiary">{fmt(stats.totalEnd)}</div><SortIcon field="end_stock" cur={sortField} dir={sortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="text-[10px] md:text-sm divide-y divide-outline-variant/10">
                {loading ? (
                  <tr><td colSpan={11} className="py-20 text-center text-on-surface-variant"><span className="material-symbols-outlined animate-spin text-2xl block mb-2">sync</span>Đang tải...</td></tr>
                ) : pagedData.length === 0 ? (
                  <tr><td colSpan={11} className="py-20 text-center text-on-surface-variant italic">Không có dữ liệu</td></tr>
                ) : pagedData.map((item, idx) => (
                  <tr key={item.erp || idx} className={`hover:bg-surface-container-low transition-colors ${(item.end_stock || 0) < 0 ? 'bg-error/5' : ''}`}>
                    <td className="py-3 md:py-4 px-2 md:px-4">
                      <button onClick={() => setHistoryModal({ isOpen: true, erp: item.erp, name: item.name || '' })} className="font-bold text-primary text-[11px] md:text-sm hover:underline cursor-pointer font-mono">{item.erp}</button>
                    </td>
                    <td className="py-3 md:py-4 px-2 md:px-4"><div className="font-bold text-on-surface line-clamp-1">{item.name || <span className="text-outline-variant italic">N/A</span>}</div></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden lg:table-cell text-on-surface-variant text-xs">{item.name_zh || item.name_cn || ''}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden xl:table-cell text-on-surface-variant text-xs">{item.spec || ''}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell"><span className="px-2 py-0.5 bg-secondary-container/30 text-on-secondary-container rounded text-[9px] md:text-xs font-bold">{item.unit || ''}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell"><span className="px-2 py-0.5 bg-primary-container/20 text-primary rounded text-[9px] md:text-xs font-bold">{item.pos || ''}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono text-on-surface-variant hidden lg:table-cell">{fmt(item.start_stock)}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`${(item.in_qty||0)>0?'text-primary font-bold':'text-outline-variant'}`}>{(item.in_qty||0)>0?`+${fmt(item.in_qty)}`:fmt(item.in_qty||0)}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`${(item.out_qty||0)>0?'text-error font-bold':'text-outline-variant'}`}>{fmt(item.out_qty||0)}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`font-black ${(item.end_stock||0)>0?'text-tertiary':(item.end_stock||0)<0?'text-error':'text-outline-variant'}`}>{fmt(item.end_stock)}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right flex justify-end gap-1">
                      <button onClick={() => setHistoryModal({ isOpen: true, erp: item.erp, name: item.name || '' })} className="material-symbols-outlined text-outline-variant hover:text-primary bg-surface-container hover:bg-primary/10 p-1 md:p-2 rounded-lg text-[14px] md:text-base" title="Lịch sử">history</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination(page, totalPages, setPage, filteredData.length)}
        </div>
      </>)}

      {/* ═══════ TAB 2: BÁO CÁO THEO KỲ ═══════ */}
      {activeTab === 'report' && (<>
        {/* Period selector */}
        <div className="bg-surface-container-lowest rounded-2xl md:rounded-[2rem] p-4 md:p-6 shadow-sm border border-outline-variant/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><span className="material-symbols-outlined text-primary">date_range</span></div>
            <div>
              <h3 className="text-base md:text-lg font-bold font-manrope text-on-surface">Chọn kỳ báo cáo</h3>
              <p className="text-[10px] md:text-xs text-on-surface-variant font-medium">Xem tồn đầu kỳ, nhập/xuất trong kỳ, tồn cuối kỳ.</p>
            </div>
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[0, -1, -2, -3].map(offset => {
              const range = getMonthRange(offset);
              const isActive = reportFrom === range.from && reportTo === range.to;
              return <button key={offset} onClick={() => handleQuickMonth(offset)} className={`px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all ${isActive ? 'bg-primary text-on-primary shadow-md shadow-primary/20' : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/10'}`}>{range.label}</button>;
            })}
          </div>
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/10 w-full md:w-auto">
              <span className="material-symbols-outlined text-sm text-on-surface-variant shrink-0">calendar_today</span>
              <input type="date" value={reportFrom} onChange={e => { setReportFrom(e.target.value); setReportPage(1); }} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer p-0 min-w-[90px]" />
              <span className="text-xs text-on-surface-variant">→</span>
              <input type="date" value={reportTo} onChange={e => { setReportTo(e.target.value); setReportPage(1); }} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer p-0 min-w-[90px]" />
            </div>
            <div className="relative w-full md:w-auto flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-sm">search</span>
              <input type="text" placeholder="Tìm mã ERP, tên item..." value={reportSearch} onChange={e => { setReportSearch(e.target.value); setReportPage(1); }}
                className="w-full bg-surface-container-low border border-outline-variant/10 rounded-xl pl-9 pr-4 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <select value={reportLocation} onChange={e => { setReportLocation(e.target.value); setReportPage(1); }}
              className="bg-surface-container-low border border-outline-variant/10 rounded-xl px-4 py-2 text-xs font-medium outline-none w-full md:w-auto">
              <option value="">Tất cả Vị Trí</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-xl text-primary hover:bg-primary-container hover:text-on-primary-container transition-colors font-bold text-xs disabled:opacity-50 w-full md:w-auto justify-center">
              <span className="material-symbols-outlined text-sm">{exporting ? 'sync' : 'download'}</span>
              {exporting ? 'Đang xuất...' : 'Xuất Excel'}
            </button>
          </div>
        </div>

        {/* Report stats */}
        {reportStats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
            {[
              { label: 'Tổng Item', value: reportStats.total_items, icon: 'inventory_2', color: 'text-on-surface' },
              { label: 'Có tồn kho', value: reportStats.items_with_stock, icon: 'check_circle', color: 'text-secondary' },
              { label: 'Tồn = 0', value: reportStats.items_zero_stock, icon: 'warning', color: 'text-error' },
              { label: 'Tổng nhập kỳ', value: reportStats.total_in, icon: 'input', color: 'text-primary' },
              { label: 'Tổng xuất kỳ', value: reportStats.total_out, icon: 'output', color: 'text-error' },
              { label: 'Tồn cuối kỳ', value: reportStats.total_closing, icon: 'warehouse', color: 'text-tertiary' },
            ].map(s => (
              <div key={s.label} className="bg-surface-container-lowest rounded-xl p-3 shadow-sm border border-outline-variant/10 text-center">
                <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                <div className={`text-base md:text-lg font-black font-mono ${s.color}`}>{fmt(s.value)}</div>
                <div className="text-[8px] md:text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Report table */}
        <div className="bg-surface-container-lowest rounded-2xl md:rounded-[2rem] shadow-sm overflow-hidden border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="text-[9px] md:text-[10px] font-black text-on-surface-variant uppercase tracking-widest bg-surface-container-highest border-b border-outline-variant/20">
                  <th className="py-3 md:py-4 px-2 md:px-4 text-center w-10">STT</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 cursor-pointer select-none" onClick={() => handleReportSort('erp')}>Mã ERP <SortIcon field="erp" cur={reportSortField} dir={reportSortDir} /></th>
                  <th className="py-3 md:py-4 px-2 md:px-4 cursor-pointer select-none" onClick={() => handleReportSort('name')}>Tên Item <SortIcon field="name" cur={reportSortField} dir={reportSortDir} /></th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell">Vị Trí</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell">ĐVT</th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleReportSort('opening_stock')}>
                    <div>Tồn Đầu Kỳ</div><div className="text-[8px] font-medium opacity-70 font-mono">{fmt(reportSums.opening)}</div><SortIcon field="opening_stock" cur={reportSortField} dir={reportSortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleReportSort('in_period')}>
                    <div className="text-primary">Nhập Trong Kỳ</div><div className="text-[8px] font-medium opacity-70 font-mono text-primary">{fmt(reportSums.inPeriod)}</div><SortIcon field="in_period" cur={reportSortField} dir={reportSortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleReportSort('out_period')}>
                    <div className="text-error">Xuất Trong Kỳ</div><div className="text-[8px] font-medium opacity-70 font-mono text-error">{fmt(reportSums.outPeriod)}</div><SortIcon field="out_period" cur={reportSortField} dir={reportSortDir} />
                  </th>
                  <th className="py-3 md:py-4 px-2 md:px-4 text-right cursor-pointer select-none" onClick={() => handleReportSort('closing_stock')}>
                    <div className="text-tertiary">Tồn Cuối Kỳ</div><div className="text-[8px] font-medium opacity-70 font-mono text-tertiary">{fmt(reportSums.closing)}</div><SortIcon field="closing_stock" cur={reportSortField} dir={reportSortDir} />
                  </th>
                </tr>
              </thead>
              <tbody className="text-[10px] md:text-sm divide-y divide-outline-variant/10">
                {reportLoading ? (
                  <tr><td colSpan={9} className="py-20 text-center text-on-surface-variant"><span className="material-symbols-outlined animate-spin text-2xl block mb-2">sync</span>Đang tải báo cáo...</td></tr>
                ) : pagedReport.length === 0 ? (
                  <tr><td colSpan={9} className="py-20 text-center text-on-surface-variant italic">Không có dữ liệu trong kỳ này</td></tr>
                ) : pagedReport.map((item, idx) => (
                  <tr key={item.erp || idx} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3 md:py-4 px-2 md:px-4 text-center text-on-surface-variant text-[10px] font-bold">{(reportPage - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 font-bold text-primary font-mono text-[11px] md:text-sm">{item.erp}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4">
                      <div className="font-bold text-on-surface line-clamp-1">{item.name || '-'}</div>
                      {item.spec && <div className="text-[9px] text-on-surface-variant line-clamp-1">{item.spec}</div>}
                    </td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell"><span className="px-2 py-0.5 bg-primary-container/20 text-primary rounded text-[9px] md:text-xs font-bold">{item.pos || '-'}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 hidden md:table-cell text-xs">{item.unit || ''}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono">{fmt(item.opening_stock)}</td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`${(item.in_period||0)>0?'text-primary font-bold':'text-outline-variant'}`}>{(item.in_period||0)>0?`+${fmt(item.in_period)}`:'0'}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`${(item.out_period||0)>0?'text-error font-bold':'text-outline-variant'}`}>{(item.out_period||0)>0?fmt(item.out_period):'0'}</span></td>
                    <td className="py-3 md:py-4 px-2 md:px-4 text-right font-mono"><span className={`font-black ${(item.closing_stock||0)>0?'text-tertiary':(item.closing_stock||0)<0?'text-error':'text-outline-variant'}`}>{fmt(item.closing_stock)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination(reportPage, reportTotalPages, setReportPage, filteredReport.length)}
        </div>
      </>)}

      <ItemHistoryModal isOpen={historyModal.isOpen} erpCode={historyModal.erp} itemName={historyModal.name} onClose={() => setHistoryModal({ ...historyModal, isOpen: false })} />
    </div>
  );
};

export default Inventory;
