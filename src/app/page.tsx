'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const keyword = searchQuery.trim();
    if (keyword) {
      router.push(`/search?keyword=${encodeURIComponent(keyword)}`);
    }
  };

  return (
    // 使用与截图完全一致的深石板蓝背景色 #131722，并设置为全屏 Flex 布局
    <main className="min-h-screen bg-[#131722] text-white flex flex-col selection:bg-[#DC143C] selection:text-white">
      
      {/* 核心搜索区域 - 垂直水平绝对居中 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-4 -mt-10">
        
        {/* 大 Logo 区域 */}
        <div className="flex justify-center items-center mb-10">
          <Link href="/" className="flex items-center transition-transform hover:scale-105 duration-300">
            {/* 青色放大镜图标 */}
            <svg className="w-16 h-16 md:w-20 md:h-20 mr-4 text-[#00ccff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {/* 品牌名称，严格应用 #DC143C 红色 */}
            <h1 className="text-5xl md:text-6xl font-bold text-[#DC143C] tracking-wide">
              红月搜索
            </h1>
          </Link>
        </div>

        {/* 胶囊搜索框 */}
        <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl px-2 sm:px-0">
          <div className="group flex items-center h-14 bg-[#1a1a1a] border border-[#333] hover:border-[#555] focus-within:border-[#DC143C] focus-within:shadow-[0_0_20px_rgba(220,20,60,0.15)] rounded-full transition-all duration-300 pl-1.5 pr-1.5 shadow-xl">
            
            {/* 首页标识图标 */}
            <div className="h-11 px-3 sm:px-5 flex items-center justify-center bg-transparent text-gray-400 shrink-0">
              <svg className="w-5 h-5 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
              <span className="hidden sm:inline text-sm font-medium">首页</span>
            </div>
            
            {/* 分割线 */}
            <div className="h-6 w-px bg-[#333] mx-1 sm:mx-2 transition-colors group-focus-within:bg-[#555]"></div>

            {/* 输入框 */}
            <input 
              type="text" 
              name="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-white px-2 sm:px-4 py-2 focus:outline-none placeholder-gray-600 text-base min-w-0" 
              placeholder="搜索你想看的剧名..." 
              autoComplete="off"
              aria-label="视频搜索框" 
            />
            
            {/* 一键清空按钮 */}
            {searchQuery.length > 0 && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3 flex items-center justify-center text-gray-500 hover:text-[#DC143C] transition-colors shrink-0"
                aria-label="清空搜索框"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </button>
            )}
            
            {/* 搜索提交按钮 */}
            <button type="submit" 
              className="h-11 px-5 sm:px-8 flex items-center justify-center bg-[#DC143C] hover:bg-[#b81030] text-white rounded-full font-medium transition-all duration-200 shadow-[0_0_10px_rgba(220,20,60,0.3)] hover:shadow-[0_0_15px_rgba(220,20,60,0.5)] transform hover:scale-[1.02] active:scale-95 shrink-0" 
              aria-label="搜索按钮">
              <svg className="w-4 h-4 mr-1.5 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              <span>搜索</span>
            </button>
          </div>
        </form>
      </div>

      {/* 底部 Footer - 保持在最底端 */}
      <footer className="w-full py-6 bg-[#0a0a0a] border-t border-[#1f2937]">
        <div className="max-w-[2560px] mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            
            {/* 左侧信息 */}
            <div className="mb-4 md:mb-0">
              <div className="flex items-center justify-center md:justify-start">
                <img src="/logo.png" alt="红月搜索 Logo" className="w-10 h-10 mr-2 object-contain" />
                <span className="text-[#00ccff] font-bold text-lg">红月搜索</span>
              </div>
              <p className="text-[#6b7280] text-sm mt-2 text-center md:text-left">
                © {new Date().getFullYear()} 红月搜索-剧名搜索、在线视频神器。
              </p>
            </div>
            
            {/* 右侧外链 */}
            <div className="text-center md:text-right">
              <div className="flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-2">
                <Link href="/about" className="text-[#9ca3af] hover:text-white text-sm transition-colors">关于红月</Link>
                <Link href="/privacy" className="text-[#9ca3af] hover:text-white text-sm transition-colors">隐私政策</Link>
                <a href="https://200805.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">网盘系统</a>
                <a href="https://400823.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">镜向站</a>
                <a href="https://timis.dpdns.org" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">API中转服务</a>
                <a href="https://ctv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-CTV</a>
                <a href="https://vtv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-VTV</a>
                <a href="https://sync.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-VTVII</a>
              </div>
            </div>

          </div>
        </div>
      </footer>
    </main>
  );
}
