import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { session: currentSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (currentSession) {
      navigate('/inventory');
    }
  }, [currentSession, navigate]);

  const handleResetPassword = async () => {
    if (!email) {
      setError('Vui lòng nhập định dạng email vào ô trên để khôi phục mật khẩu.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      alert('Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư của bạn.');
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận.');
      } else {
        const { data: { session }, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (session) {
          // Load profile to check if it exists
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is code for "no rows returned"
              console.error('Error fetching profile:', profileError);
            }

            if (!profile) {
              // Profile chưa có → tạo mới
              const { error: insertError } = await supabase.from('profiles').insert({
                id: session.user.id,
                username: email.split('@')[0],
                full_name: email.split('@')[0],
                role: 'viewer',
                is_active: true
              });
              if (insertError) console.error('Error creating profile:', insertError);
            }
          } catch (profileErr) {
            console.error('Profile check/creation failed silently:', profileErr);
          }
          
          // Chuyển vào app
          navigate('/inventory');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px]"></div>

      <div className="bg-surface-container-lowest p-10 rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 border border-outline-variant/10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>warehouse</span>
          </div>
          <h1 className="text-3xl font-black text-on-surface font-manrope tracking-tight">Wagon Inventory Hub</h1>
          <p className="text-on-surface-variant font-medium mt-2">Hệ thống quản lý kho vận thông minh</p>
        </div>

        {error && (
          <div className="bg-error-container/20 border border-error/30 text-error p-4 rounded-xl mb-6 text-sm font-medium flex items-start gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Email</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 font-medium"
                placeholder="admin@hubalpha.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1 mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Mật khẩu</label>
              <button 
                type="button" 
                onClick={handleResetPassword}
                className="text-xs font-bold text-primary hover:underline hover:text-primary-dim transition-colors"
                disabled={loading}
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">lock</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 font-medium"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-primary to-primary-dim text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-70 disabled:hover:scale-100"
          >
            {loading ? 'Đang xử lý...' : (isSignUp ? 'Đăng Ký' : 'Đăng Nhập')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            {isSignUp ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
