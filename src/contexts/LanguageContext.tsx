import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'vi' | 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  vi: {
    dashboard: 'Bảng điều khiển',
    inventory: 'Tồn Kho',
    inbound: 'Nhập Kho',
    outbound: 'Xuất Kho',
    audit: 'Kiểm Kê',
    newItem: 'Thêm Mới',
    users: 'Người Dùng',
    reports: 'Báo Cáo',
    welcome: 'Chào mừng trở lại',
    warehouseCapacity: 'Sức chứa kho',
    quickActions: 'Thao tác nhanh',
    recentMovements: 'Biến động gần đây',
    systemStatus: 'Trạng thái hệ thống',
    searchPlaceholder: 'Tìm kiếm vật tư, mã ERP...',
    scanQR: 'Quét mã QR',
    logout: 'Đăng xuất',
    support: 'Hỗ trợ',
    totalInventoryValue: 'Tổng giá trị tồn kho',
    activeShipments: 'Lô hàng đang xử lý',
    lowStockAlerts: 'Cảnh báo tồn thấp',
    fulfilledOrders: 'Đơn hàng hoàn tất',
    viewAll: 'Xem tất cả',
    skuTotal: 'Tổng SKU Vật Tư',
    lastUpdate: 'Cập nhật lần cuối',
    erpCode: 'Mã ERP',
    itemName: 'Tên Vật Tư',
    spec: 'Quy Cách',
    unit: 'ĐVT',
    location: 'Vị Trí',
    startStock: 'Tồn Đầu',
    inQty: 'Nhập',
    outQty: 'Xuất',
    endStock: 'Tồn Cuối',
    confirmReceipt: 'Xác nhận đã nhận đủ',
    delivered: 'Đã giao hàng',
    inTransit: 'Đang vận chuyển',
    partner: 'Đối tác',
    expectedDate: 'Ngày dự kiến',
    action: 'Thao tác',
    approveAudit: 'Phê Duyệt & Cập Nhật Tồn',
    approved: 'Đã Phê Duyệt',
    auditor: 'Người kiểm kê',
    auditDate: 'Ngày kiểm kê',
    saveDraft: 'Lưu Tạm',
    confirmReceiptTitle: 'Xác nhận nhận hàng?',
    confirmReceiptDesc: 'Bạn đang xác nhận rằng lô hàng đã được nhận đầy đủ và đúng quy cách.',
    cancel: 'Hủy bỏ',
    confirm: 'Xác nhận',
    requiredDate: 'Ngày yêu cầu xuất',
  },
  en: {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    inbound: 'Inbound',
    outbound: 'Outbound',
    audit: 'Audit',
    newItem: 'New Item',
    users: 'Users Management',
    reports: 'Analytics',
    welcome: 'Welcome back',
    warehouseCapacity: 'Warehouse Capacity',
    quickActions: 'Quick Actions',
    recentMovements: 'Recent Movements',
    systemStatus: 'System Status',
    searchPlaceholder: 'Search items, ERP codes...',
    scanQR: 'Scan QR Code',
    logout: 'Logout',
    support: 'Support',
    totalInventoryValue: 'Total Inventory Value',
    activeShipments: 'Active Shipments',
    lowStockAlerts: 'Low Stock Alerts',
    fulfilledOrders: 'Fulfilled Orders',
    viewAll: 'View All',
    skuTotal: 'Total SKUs',
    lastUpdate: 'Last updated',
    erpCode: 'ERP Code',
    itemName: 'Item Name',
    spec: 'Specification',
    unit: 'Unit',
    location: 'Location',
    startStock: 'Opening',
    inQty: 'In',
    outQty: 'Out',
    endStock: 'Closing',
    confirmReceipt: 'Confirm Receipt',
    delivered: 'Delivered',
    inTransit: 'In-Transit',
    partner: 'Partner',
    expectedDate: 'Expected Date',
    action: 'Action',
    approveAudit: 'Approve & Update Stock',
    approved: 'Approved',
    auditor: 'Auditor',
    auditDate: 'Audit Date',
    saveDraft: 'Save Draft',
    confirmReceiptTitle: 'Confirm Receipt?',
    confirmReceiptDesc: 'You are confirming that the shipment has been received in full and correctly.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    requiredDate: 'Required Date',
  },
  zh: {
    dashboard: '儀表板',
    inventory: '庫存管理',
    inbound: '入庫',
    outbound: '出庫',
    audit: '盤點',
    newItem: '新增項目',
    users: '使用者管理',
    reports: '分析報告',
    welcome: '歡迎回來',
    warehouseCapacity: '倉庫容量',
    quickActions: '快速操作',
    recentMovements: '近期異動',
    systemStatus: '系統狀態',
    searchPlaceholder: '搜尋物料、ERP 代碼...',
    scanQR: '掃描 QR Code',
    logout: '登出',
    support: '支援',
    totalInventoryValue: '總庫存價值',
    activeShipments: '進行中貨運',
    lowStockAlerts: '低庫存警示',
    fulfilledOrders: '已完成訂單',
    viewAll: '查看全部',
    skuTotal: '總物料種類',
    lastUpdate: '最後更新',
    erpCode: 'ERP 代碼',
    itemName: '物料名稱',
    spec: '規格',
    unit: '單位',
    location: '位置',
    startStock: '期初',
    inQty: '入庫',
    outQty: '出庫',
    endStock: '期末',
    confirmReceipt: '確認簽收',
    delivered: '已送達',
    inTransit: '運送中',
    partner: '合作夥伴',
    expectedDate: '預計日期',
    action: '操作',
    approveAudit: '核准並更新庫存',
    approved: '已核准',
    auditor: '盤點人員',
    auditDate: '盤點日期',
    saveDraft: '儲存草稿',
    confirmReceiptTitle: '確認簽收？',
    confirmReceiptDesc: '您正在確認該批貨物已完整且正確地收到。',
    cancel: '取消',
    confirm: '確認',
    requiredDate: '要求日期',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('vi');

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
