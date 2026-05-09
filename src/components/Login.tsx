import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { session: currentSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

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
        const username = email.split('@')[0];
        const displayName = fullName.trim() || username;
        
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: displayName,
              username: username
            }
          }
        });
        if (error) throw error;
        
        if (signUpData?.user) {
          try {
            await supabase.from('profiles').upsert({
              id: signUpData.user.id,
              username: username,
              full_name: displayName,
              role: 'viewer',
              is_active: true
            });
          } catch (profileErr) {
            console.error('Profile creation after signup:', profileErr);
          }
        }
        
        alert('Đăng ký thành công! Bạn có thể đăng nhập ngay.');
        setIsSignUp(false);
      } else {
        const { data: { session }, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (session) {
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError && profileError.code !== 'PGRST116') {
              console.error('Error fetching profile:', profileError);
            }

            if (!profile) {
              const { error: insertError } = await supabase.from('profiles').upsert({
                id: session.user.id,
                username: email.split('@')[0],
                full_name: session.user.user_metadata?.full_name || email.split('@')[0],
                role: 'viewer',
                is_active: true
              });
              if (insertError) console.error('Error creating profile:', insertError);
            }
          } catch (profileErr) {
            console.error('Profile check/creation failed silently:', profileErr);
          }
          
          navigate('/inventory');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: "'Material Symbols Outlined'",
    fontSize: '1.25rem',
    width: '1.25rem',
    height: '1.25rem',
    lineHeight: 1,
    overflow: 'hidden'
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px]"></div>

      <div className="bg-surface-container-lowest p-6 sm:p-10 rounded-2xl sm:rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 border border-outline-variant/10">
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <span className="material-symbols-outlined text-primary" style={{ ...iconStyle, fontSize: '2rem', width: '2rem', height: '2rem', fontVariationSettings: "'FILL' 1" }}>warehouse</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-on-surface font-manrope tracking-tight">Wagon Inventory Hub</h1>
          <p className="text-on-surface-variant font-medium mt-2 text-sm sm:text-base">Hệ thống quản lý kho vận thông minh</p>
        </div>

        {error && (
          <div className="bg-error-container/20 border border-error/30 text-error p-3 sm:p-4 rounded-xl mb-4 sm:mb-6 text-xs sm:text-sm font-medium flex items-start gap-2">
            <span className="material-symbols-outlined flex-shrink-0" style={iconStyle}>error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4 sm:space-y-6">
          {isSignUp && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Họ và Tên</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" style={iconStyle}>person</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3.5 sm:py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 font-medium text-sm sm:text-base"
                  placeholder="Nguyễn Văn A"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-1">Email</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" style={iconStyle}>mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-3.5 sm:py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 font-medium text-sm sm:text-base"
                placeholder="email@wagongroups.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1 mb-1 sm:mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Mật khẩu</label>
              {!isSignUp && (
                <button 
                  type="button" 
                  onClick={handleResetPassword}
                  className="text-xs font-bold text-primary hover:underline hover:text-primary-dim transition-colors"
                  disabled={loading}
                >
                  Quên mật khẩu?
                </button>
              )}
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" style={iconStyle}>lock</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl py-3.5 sm:py-4 pl-12 pr-4 focus:ring-2 focus:ring-primary/20 font-medium text-sm sm:text-base"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 sm:py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:hover:scale-100 text-sm sm:text-base"
          >
            {loading ? 'Đang xử lý...' : (isSignUp ? 'Đăng Ký' : 'Đăng Nhập')}
          </button>
        </form>

        <div className="mt-6 sm:mt-8 text-center">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className="text-xs sm:text-sm font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            {isSignUp ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
