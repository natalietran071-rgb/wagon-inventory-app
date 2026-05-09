import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  email: string;
  last_sign_in_at?: string;
  created_at: string;
}

const UserManagement: React.FC = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'viewer' as any,
    is_active: true,
    email: '',
    password: '',
    username: ''
  });

  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Gọi RPC để lấy danh sách người dùng đầy đủ
      const { data, error } = await supabase.rpc('get_all_users');

      if (error) {
        console.error('RPC falling back to profiles table:', error);
        // Fallback sang bảng profiles nếu RPC chưa cài đặt
        const { data: profiles, error: pError } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (pError) throw pError;
        setUsers(profiles || []);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      full_name: '',
      role: 'viewer',
      is_active: true,
      email: '',
      password: '',
      username: ''
    });
    setIsAddModalOpen(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: formData.email,
        p_password: formData.password,
        p_username: formData.username || formData.email.split('@')[0],
        p_full_name: formData.full_name,
        p_role: formData.role
      });

      if (error) throw error;
      if (data && data.status === 'error') throw new Error(data.error);

      await fetchUsers();
      setIsAddModalOpen(false);
      alert('Thêm người dùng thành công!');
    } catch (err: any) {
      console.error('Error creating user:', err);
      alert('Lỗi: ' + (err.message || 'Không thể tạo người dùng'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      full_name: user.full_name || '',
      role: user.role || 'viewer',
      is_active: user.is_active,
      email: user.email,
      password: '',
      username: user.username || ''
    });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_user', {
        p_user_id: selectedUser.id,
        p_email: formData.email,
        p_username: formData.username,
        p_role: formData.role,
        p_full_name: formData.full_name,
        p_is_active: formData.is_active,
        p_password: formData.password || null
      });

      if (error) throw error;
      if (data && data.status === 'error') throw new Error(data.error);
      
      setIsEditModalOpen(false); // Close modal first
      await fetchUsers(); // Reload list
      alert('✅ Cập nhật người dùng thành công!');
    } catch (err: any) {
      console.error('Error updating user:', err);
      alert('Lỗi: ' + (err.message || 'Không thể cập nhật'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPassword = (user: UserProfile) => {
    setSelectedUser(user);
    setNewPassword('');
    setIsPasswordModalOpen(true);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('admin_update_password', {
        p_user_id: selectedUser.id,
        p_new_password: newPassword
      });

      if (error) throw error;
      if (data && data.status === 'error') throw new Error(data.error);

      setIsPasswordModalOpen(false);
      alert('Đã cập nhật mật khẩu mới!');
    } catch (err: any) {
      console.error('Error updating password:', err);
      alert('Lỗi: ' + (err.message || 'Không thể đổi mật khẩu'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa người dùng này?')) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId
      });
      if (error) throw error;
      if (data && data.status === 'error') throw new Error(data.error);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      alert('Lỗi: ' + (err.message || 'Không thể xóa'));
    } finally {
      setLoading(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!confirm('Bạn có muốn dọn dẹp các lịch sử cũ hơn 30 ngày ngay bây giờ?')) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('cleanup_old_history');
      if (error) throw error;
      
      const { deleted_history, deleted_items } = data;
      alert(`✅ Dọn dẹp thành công!\n- Lịch sử chỉnh sửa: ${deleted_history}\n- Danh mục đã xóa: ${deleted_items}`);
    } catch (err: any) {
      console.error('Cleanup error:', err);
      alert('Lỗi: ' + (err.message || 'Không thể dọn dẹp'));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h2 className="text-3xl font-black text-on-surface font-manrope tracking-tight mb-2">Quản lý người dùng</h2>
          <p className="text-on-surface-variant font-medium">Thêm mới, phân quyền và quản lý tài khoản nhân sự truy cập kho.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={fetchUsers}
            className="p-3 bg-surface-container rounded-2xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <button 
            onClick={handleManualCleanup}
            title="Dọn dẹp lịch sử (>30 ngày)"
            className="flex items-center gap-2 px-4 py-3 bg-surface-container rounded-2xl text-on-surface-variant hover:bg-warning/10 hover:text-warning transition-all border border-outline-variant/10 shadow-sm"
          >
            <span className="material-symbols-outlined text-xl">cleaning_services</span>
            <span className="uppercase tracking-widest text-[9px] font-black hidden md:inline">Dọn dẹp</span>
          </button>
          <button 
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-2xl font-black text-sm hover:shadow-lg hover:shadow-primary/20 transition-all"
          >
            <span className="material-symbols-outlined">person_add</span>
            <span className="uppercase tracking-widest text-[11px]">Thêm người dùng</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-[2.5rem] overflow-hidden border border-outline-variant/10 shadow-sm mb-10 bg-white/80 backdrop-blur-xl">
        <div className="p-6 border-b border-outline-variant/10">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">search</span>
            <input 
              type="text"
              placeholder="Tìm kiếm người dùng..."
              className="w-full bg-surface-container-lowest border-none rounded-2xl py-4 pl-12 pr-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] font-black tracking-widest border-b border-outline-variant/10">
                <th className="px-8 py-5">Họ và tên</th>
                <th className="px-8 py-5">Email</th>
                <th className="px-8 py-5">Vai trò</th>
                <th className="px-8 py-5">Đăng nhập cuối</th>
                <th className="px-8 py-5">Trạng thái</th>
                <th className="px-8 py-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading && users.length === 0 ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-6 h-16 bg-surface-container-lowest/50"></td>
                  </tr>
                ))
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black uppercase text-xs">
                          {user.full_name?.charAt(0) || user.username?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{user.full_name || 'Chưa cập nhật'}</p>
                          <p className="text-[10px] text-on-surface-variant/70 font-medium">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm font-medium text-on-surface-variant">{user.email}</td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        user.role === 'admin' ? 'bg-error/10 text-error' : 
                        user.role === 'editor' ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-sm font-medium text-on-surface-variant">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Chưa từng'}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-success' : 'bg-outline-variant'}`}></span>
                        <span className={`text-[11px] font-bold ${user.is_active ? 'text-success' : 'text-on-surface-variant'}`}>
                          {user.is_active ? 'Active' : 'Bị khóa'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenPassword(user)}
                          title="Đổi mật khẩu"
                          className="p-2 rounded-xl hover:bg-warning/10 text-on-surface-variant hover:text-warning transition-all"
                        >
                          <span className="material-symbols-outlined text-xl">lock_reset</span>
                        </button>
                        <button 
                          onClick={() => handleEdit(user)}
                          title="Chỉnh sửa"
                          className="p-2 rounded-xl hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          title="Xóa người dùng"
                          className="p-2 rounded-xl hover:bg-error/10 text-on-surface-variant hover:text-error transition-all"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr key="empty-users">
                  <td colSpan={6} className="px-8 py-20 text-center text-on-surface-variant font-bold italic">
                    Không tìm thấy người dùng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Chỉnh sửa */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-2xl max-w-lg w-full border border-outline-variant/10"
            >
              <h3 className="text-3xl font-black text-on-surface mb-8">Chỉnh sửa thông tin</h3>
              
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Email</label>
                    <input 
                      type="email"
                      required
                      className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Username</label>
                    <input 
                      type="text"
                      required
                      className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Mật khẩu mới (Để trống nếu không đổi)</label>
                  <input 
                    type="password"
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập mật khẩu mới..."
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Họ và tên</label>
                  <input 
                    type="text"
                    required
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập họ và tên..."
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Vai trò</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                    >
                      <option value="viewer">Viewer (Chỉ xem)</option>
                      <option value="editor">Editor (Chỉnh sửa/Nhập xuất)</option>
                      <option value="admin">Admin (Quản trị viên)</option>
                    </select>
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 material-symbols-outlined pointer-events-none text-on-surface-variant">expand_more</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-surface-container-low p-5 rounded-2xl border border-outline-variant/5">
                  <input 
                    type="checkbox"
                    id="is_active_edit"
                    className="w-6 h-6 rounded-lg border-none bg-surface-container-highest text-primary focus:ring-primary/20 cursor-pointer"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <label htmlFor="is_active_edit" className="text-sm font-bold text-on-surface cursor-pointer select-none">Kích hoạt tài khoản</label>
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-5 bg-surface-container text-on-surface-variant rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-surface-container-high transition-colors"
                  >
                    HỦY
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-5 bg-primary text-on-primary rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50"
                  >
                    {loading ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Thêm người dùng */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-2xl max-w-lg w-full border border-outline-variant/10"
            >
              <h3 className="text-3xl font-black text-on-surface mb-8">Thêm người dùng</h3>
              
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Họ và tên</label>
                    <input 
                      type="text" required
                      className="w-full bg-surface-container border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                      value={formData.full_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Username</label>
                    <input 
                      type="text" required
                      className="w-full bg-surface-container border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Email (Tài khoản)</label>
                  <input 
                    type="email" required
                    className="w-full bg-surface-container border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                    placeholder="example@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Mật khẩu khởi tạo</label>
                  <input 
                    type="password" required
                    className="w-full bg-surface-container border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Vai trò</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-surface-container border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner appearance-none cursor-pointer"
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor (Chỉnh sửa)</option>
                      <option value="admin">Admin</option>
                    </select>
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 material-symbols-outlined pointer-events-none text-on-surface-variant">expand_more</span>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-5 bg-surface-container text-on-surface-variant rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-surface-container-high transition-colors"
                  >
                    HỦY
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-5 bg-primary text-on-primary rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-lg hover:shadow-primary/30 transition-all font-manrope"
                  >
                    {loading ? 'XỬ LÝ...' : 'TẠO TÀI KHOẢN'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Đổi mật khẩu */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPasswordModalOpen(false)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-2xl max-w-sm w-full border border-outline-variant/10"
            >
              <h3 className="text-2xl font-black text-on-surface mb-2">Đổi mật khẩu</h3>
              <p className="text-xs text-on-surface-variant font-medium mb-8">Cho tài khoản: {selectedUser?.email}</p>
              
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Mật khẩu mới</label>
                  <input 
                    type="password"
                    required
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 text-sm font-bold shadow-inner focus:ring-2 focus:ring-primary/20"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="flex-1 py-4 bg-surface-container text-on-surface-variant rounded-2xl font-black text-xs uppercase tracking-widest"
                  >
                    HỦY
                  </button>
                  <button 
                    type="submit"
                    disabled={loading || !newPassword}
                    className="flex-1 py-4 bg-warning text-on-warning rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-lg disabled:opacity-50"
                  >
                    {loading ? '...' : 'CẬP NHẬT'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;
