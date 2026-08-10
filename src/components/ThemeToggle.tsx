/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps */

'use client';

import { Moon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();

  const setThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const darkColor = '#131722'; // 完美适配你全站的暗黑背景色
    
    if (!meta) {
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = darkColor;
      document.head.appendChild(newMeta);
    } else {
      meta.setAttribute('content', darkColor);
    }
  };

  useEffect(() => {
    setMounted(true);
    setTheme('dark'); // 初始化时强制写入深色模式
  }, [setTheme]);

  // 监听主题和路由变化，如果发现不是暗色，立刻强制纠正
  useEffect(() => {
    if (mounted) {
      setThemeColor();
      if (resolvedTheme !== 'dark') {
        setTheme('dark');
      }
    }
  }, [mounted, resolvedTheme, pathname, setTheme]);

  if (!mounted) {
    // 渲染一个占位符以避免布局偏移
    return <div className='w-10 h-10' />;
  }

  // 强制展示为深色模式的月亮图标，去除了点击切换功能
  // 注：如果你觉得既然不能切换了，干脆连图标也不要显示，可以直接改成 return null;
  return (
    <div
      className='relative w-10 h-10 p-2 rounded-full flex items-center justify-center text-amber-500 cursor-default'
      title='已强制开启深色模式'
      aria-label='Dark theme enabled'
    >
      <Moon className='w-full h-full relative z-10' />
    </div>
  );
}
