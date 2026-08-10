/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, User, Lock, Sparkles, UserPlus, Shield } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <div
      className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${updateStatus === UpdateStatus.HAS_UPDATE
            ? 'text-yellow-500'
            : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-500'
              : ''
            }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>Update</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>Latest version</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldShowRegister, setShouldShowRegister] = useState(false);
  const [registrationDisabled, setRegistrationDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');

  const { siteName } = useSite();

  // 检查注册是否可用
  useEffect(() => {
    const checkRegistrationAvailable = async () => {
      try {
        // 用空数据检测，这样不会创建用户但能得到正确的错误信息
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '', password: '', confirmPassword: '' }),
        });
        
        const data = await res.json();
        
        // 如果是localStorage模式，跳转登录
        if (data.error === 'localStorage 模式不支持用户注册') {
          router.replace('/login');
          return;
        }
        
        // 如果是管理员关闭了注册
        if (data.error === 'The administrator has disabled user registration.') {
          setRegistrationDisabled(true);
          setDisabledReason('The administrator has disabled user registration.');
          setShouldShowRegister(true);
          return;
        }
        
        // 其他情况显示注册表单（包括用户名已存在等正常的验证错误）
        setShouldShowRegister(true);
      } catch (error) {
        // 网络错误也显示注册页面
        setShouldShowRegister(true);
      }
    };

    checkRegistrationAvailable();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !password || !confirmPassword) {
      setError('Please fill in all the information completely.');
      return;
    }

    if (password !== confirmPassword) {
      setError('The passwords entered twice do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          confirmPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // 显示成功消息，稍等一下再跳转
        setError(null);
        setSuccess('successful！Waiting...');

        // Upstash 需要额外延迟等待数据同步
        const delay = data.needDelay ? 2500 : 1500;

        setTimeout(() => {
          const redirect = searchParams.get('redirect') || '/';
          router.replace(redirect);
        }, delay);
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failure');
      }
    } catch (error) {
      setError('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (!shouldShowRegister) {
    return (
      <div className='min-h-screen bg-[#131722] flex items-center justify-center text-gray-400'>
        Loading...
      </div>
    );
  }

  // 如果注册被禁用，显示提示页面
  if (registrationDisabled) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-3 sm:px-4 py-8 sm:py-0 overflow-hidden bg-[#131722] text-white selection:bg-[#DC143C] selection:text-white'>
        {/* 渐变氛围背景 */}
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#131722] to-[#131722]' />

        <div className='absolute top-3 right-3 sm:top-4 sm:right-4 z-20'>
          <ThemeToggle />
        </div>

        <div className='relative z-10 w-full max-w-md rounded-2xl sm:rounded-3xl bg-[#1a1a1a] shadow-2xl p-6 sm:p-10 border border-[#333] animate-fade-in transition-shadow duration-500'>
          
          <div className='text-center mb-8'>
            <a
              href='https://400821.xyz'
              target='_blank'
              rel='noopener noreferrer'
              className='relative inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 rounded-2xl bg-[#222] border border-[#333] shadow-lg transition-all duration-300 hover:scale-105 hover:border-[#DC143C]/50 hover:shadow-[#DC143C]/20 cursor-pointer'
            >
              <img
                src="/logo.png"
                alt={siteName}
                className="w-10 h-10 sm:w-14 sm:h-14 object-contain drop-shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <Sparkles className='w-8 h-8 sm:w-10 sm:h-10 text-[#DC143C] hidden' />
            </a>
            <h1 className='text-[#DC143C] tracking-tight text-2xl sm:text-3xl font-extrabold mb-1.5 drop-shadow-sm'>
              {siteName}
            </h1>
          </div>

          <div className='text-center space-y-6'>
            <h2 className='text-xl font-semibold text-gray-200'>
              Sorry, registration is not available yet.
            </h2>
            <div className='p-4 rounded-xl bg-yellow-900/20 border border-yellow-800/50'>
              <p className='text-gray-300 text-sm leading-relaxed'>
                {disabledReason || 'The administrator has disabled user registration.'}
              </p>
            </div>
            <p className='text-gray-500 text-xs'>
              To register an account, please contact the website administrator.
            </p>
            <button
              onClick={() => router.push('/login')}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-[#DC143C] hover:bg-red-800 py-3.5 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 overflow-hidden'
            >
              Return to Login →
            </button>
          </div>
        </div>
        <VersionDisplay />
      </div>
    );
  }

  return (
    <div className='relative min-h-screen flex items-center justify-center px-3 sm:px-4 py-8 sm:py-0 overflow-hidden bg-[#131722] text-white selection:bg-[#DC143C] selection:text-white'>
      
      {/* 渐变氛围背景 (配合深色主题) */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#131722] to-[#131722]' />

      <div className='absolute top-3 right-3 sm:top-4 sm:right-4 z-20'>
        <ThemeToggle />
      </div>

      <div className='relative z-10 w-full max-w-md rounded-2xl sm:rounded-3xl bg-[#1a1a1a] shadow-2xl p-6 sm:p-10 border border-[#333] animate-fade-in transition-shadow duration-500'>
        
        {/* 标题区域 */}
        <div className='text-center mb-6 sm:mb-8'>
          {/* Logo 图片组件 - 点击跳转至 https://400821.xyz */}
          <a
            href='https://400821.xyz'
            target='_blank'
            rel='noopener noreferrer'
            className='relative inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 rounded-2xl bg-[#222] border border-[#333] shadow-lg transition-all duration-300 hover:scale-105 hover:border-[#DC143C]/50 hover:shadow-[#DC143C]/20 cursor-pointer'
          >
            <img
              src="/logo.png"
              alt={siteName}
              className="w-10 h-10 sm:w-14 sm:h-14 object-contain drop-shadow-md"
              onError={(e) => {
                // 加载失败时隐藏图片并显示后方 Sparkles 图标
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            {/* 降级图标 */}
            <Sparkles className='w-8 h-8 sm:w-10 sm:h-10 text-[#DC143C] hidden' />
          </a>

          {/* 网站名称标题 - 点击跳转至 https://400821.xyz */}
          <h1 className='text-[#DC143C] tracking-tight text-2xl sm:text-3xl font-extrabold mb-1.5 drop-shadow-sm'>
            <a
              href='https://400821.xyz'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:opacity-85 transition-opacity'
            >
              {siteName}
            </a>
          </h1>
          <p className='text-gray-400 text-xs sm:text-sm font-medium'>Create your ID.</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-4 sm:space-y-5'>
          <div className='group'>
            <label htmlFor='username' className='block text-sm font-medium text-gray-300 mb-2'>
              Username:
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <User className='h-5 w-5 text-gray-500 group-focus-within:text-[#DC143C] transition-colors' />
              </div>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border border-[#333] bg-[#131722] text-white shadow-sm placeholder:text-gray-600 focus:border-[#DC143C] focus:ring-1 focus:ring-[#DC143C] focus:outline-none sm:text-base transition-all duration-300 hover:shadow-md'
                placeholder='3-20 alphanumeric characters and underscores.'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label htmlFor='password' className='block text-sm font-medium text-gray-300 mb-2'>
              Password:
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Lock className='h-5 w-5 text-gray-500 group-focus-within:text-[#DC143C] transition-colors' />
              </div>
              <input
                id='password'
                type='password'
                autoComplete='new-password'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border border-[#333] bg-[#131722] text-white shadow-sm placeholder:text-gray-600 focus:border-[#DC143C] focus:ring-1 focus:ring-[#DC143C] focus:outline-none sm:text-base transition-all duration-300 hover:shadow-md'
                placeholder='At least 6 characters'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label htmlFor='confirmPassword' className='block text-sm font-medium text-gray-300 mb-2'>
              Confirm password
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Shield className='h-5 w-5 text-gray-500 group-focus-within:text-[#DC143C] transition-colors' />
              </div>
              <input
                id='confirmPassword'
                type='password'
                autoComplete='new-password'
                className='block w-full pl-12 pr-4 py-3.5 rounded-xl border border-[#333] bg-[#131722] text-white shadow-sm placeholder:text-gray-600 focus:border-[#DC143C] focus:ring-1 focus:ring-[#DC143C] focus:outline-none sm:text-base transition-all duration-300 hover:shadow-md'
                placeholder='Enter the password again'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-red-900/20 border border-red-800/50 animate-slide-down'>
              <AlertCircle className='h-4 w-4 text-red-400 shrink-0' />
              <p className='text-sm text-red-400'>{error}</p>
            </div>
          )}

          {success && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-green-900/20 border border-green-800/50 animate-slide-down'>
              <CheckCircle className='h-4 w-4 text-green-400 shrink-0' />
              <p className='text-sm text-green-400'>{success}</p>
            </div>
          )}

          <button
            type='submit'
            disabled={
              !username || !password || !confirmPassword || loading || !!success
            }
            className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-[#DC143C] hover:bg-red-800 py-3.5 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 overflow-hidden active:scale-95'
          >
            <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
            <UserPlus className='h-5 w-5' />
            {loading ? 'Waiting...' : success ? 'Success！，Loading...' : 'Sign up now'}
          </button>

          <div className='mt-6 pt-6 border-t border-[#333]'>
            <p className='text-center text-gray-400 text-sm mb-3'>
              Already a member？
            </p>
            <a
              href='/login'
              className='group flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg bg-[#222] border border-[#333] text-gray-300 text-sm font-semibold hover:bg-[#333] hover:text-white transition-all duration-300 hover:shadow-md active:scale-100'
            >
              <Lock className='w-4 h-4' />
              <span>Sign in now</span>
              <span className='inline-block transition-transform group-hover:translate-x-1'>→</span>
            </a>
          </div>
        </form>
      </div>

      <VersionDisplay />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#131722]"></div>}>
      <RegisterPageClient />
    </Suspense>
  );
}
