/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { Heart, Trash2, X, Clock, Calendar, ChevronRight, Film, Tv, PlaySquare, Cat, Clover, Radio, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
  getSearchHistory,
  deleteSearchHistory,
  clearSearchHistory,
} from '@/lib/db.client';

import VideoCard from '@/components/VideoCard';
import ContinueWatching from '@/components/ContinueWatching';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import SearchSuggestions from '@/components/SearchSuggestions';
import SectionTitle from '@/components/SectionTitle';
import ScrollableRow from '@/components/ScrollableRow';

// 引入主题切换和用户菜单组件
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';

function HomeClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 搜索历史状态
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // 模态框及选项卡状态
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [modalTab, setModalTab] = useState<'favorites' | 'history'>('history'); // 默认展示历史或收藏
  
  // 即将上映模态框状态
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [upcomingReleases, setUpcomingReleases] = useState<any[]>([]);
  const [isUpcomingLoading, setIsUpcomingLoading] = useState(true);
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const workerRef = useRef<Worker | null>(null);

  const [requireClearConfirmation, setRequireClearConfirmation] = useState(false);
  const [showClearFavoritesDialog, setShowClearFavoritesDialog] = useState(false);
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'>('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<'recent' | 'title' | 'rating'>('recent');

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRequireClearConfirmation = localStorage.getItem('requireClearConfirmation');
      if (savedRequireClearConfirmation !== null) {
        setRequireClearConfirmation(JSON.parse(savedRequireClearConfirmation));
      }
    }
  }, []);

  // 加载搜索历史及监听更新
  useEffect(() => {
    getSearchHistory().then(setSearchHistory);

    const unsubscribeSearch = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    return () => {
      unsubscribeSearch();
    };
  }, []);

  // 获取即将上映数据
  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        setIsUpcomingLoading(true);
        const res = await fetch('/api/release-calendar?limit=100');
        if (!res.ok) {
          setIsUpcomingLoading(false);
          return;
        }
        const data = await res.json();
        const releases = data.items || [];
        
        if (!workerRef.current && typeof window !== 'undefined' && window.Worker) {
          try {
            workerRef.current = new Worker(new URL('../workers/releaseCalendar.worker.ts', import.meta.url));
            workerRef.current.onmessage = (e) => {
              setUpcomingReleases(e.data.selectedItems || []);
              setIsUpcomingLoading(false);
            };
            workerRef.current.onerror = () => {
              setUpcomingReleases([]);
              setIsUpcomingLoading(false);
            };
          } catch (err) {
            setUpcomingReleases([]);
            setIsUpcomingLoading(false);
          }
        }
        
        if (workerRef.current) {
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          workerRef.current.postMessage({
            releases,
            today: todayDate.toISOString().split('T')[0],
          });
        } else {
          setUpcomingReleases([]);
          setIsUpcomingLoading(false);
        }
      } catch (err) {
        setIsUpcomingLoading(false);
      }
    };
    
    fetchUpcoming();
    
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // 获取收藏数据
  const { data: allFavorites = {} } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => getAllFavorites(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: allPlayRecords = {} } = useQuery({
    queryKey: ['playRecords'],
    queryFn: () => getAllPlayRecords(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    origin?: 'vod' | 'live';
    type?: string;
    releaseDate?: string;
    remarks?: string;
  };

  const favoriteItems = useMemo(() => {
    return Object.entries(allFavorites)
      .sort(([, a], [, b]) => (b as any).save_time - (a as any).save_time)
      .map(([key, fav]: [string, any]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        const playRecord = allPlayRecords[key] as any;
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
          origin: fav?.origin,
          type: fav?.type,
          releaseDate: fav?.releaseDate,
          remarks: fav?.remarks,
        } as FavoriteItem;
      });
  }, [allFavorites, allPlayRecords]);

  const favoriteStats = useMemo(() => {
    if (favoriteItems.length === 0) return null;

    return {
      total: favoriteItems.length,
      movie: favoriteItems.filter(item => {
        if (item.type) return item.type === 'movie';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes === 1;
      }).length,
      tv: favoriteItems.filter(item => {
        if (item.type) return item.type === 'tv';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes > 1;
      }).length,
      anime: favoriteItems.filter(item => {
        if (item.type) return item.type === 'anime';
        return item.source === 'bangumi';
      }).length,
      shortdrama: favoriteItems.filter(item => {
        if (item.type) return item.type === 'shortdrama';
        return item.source === 'shortdrama' || item.source_name === '短剧';
      }).length,
      live: favoriteItems.filter(item => item.origin === 'live').length,
      variety: favoriteItems.filter(item => {
        if (item.type) return item.type === 'variety';
        return false;
      }).length,
    };
  }, [favoriteItems]);

  const handleClearFavorites = async () => {
    await clearAllFavorites();
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
    setShowClearFavoritesDialog(false);
  };

  useEffect(() => {
    const unsubscribeFavorites = subscribeToDataUpdates(
      'favoritesUpdated',
      () => {
        queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
    );

    const unsubscribePlayRecords = subscribeToDataUpdates(
      'playRecordsUpdated',
      () => {
        queryClient.invalidateQueries({ queryKey: ['playRecords'] });
      }
    );

    return () => {
      unsubscribeFavorites();
      unsubscribePlayRecords();
    };
  }, [queryClient]);

  // 搜索处理逻辑
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  return (
    <main className="relative min-h-screen bg-[#131722] text-white flex flex-col selection:bg-[#DC143C] selection:text-white">
      
      {/* ================== 左上角按钮 ================== */}
      <div className='absolute top-4 left-4 md:top-6 md:left-6 z-50 flex items-center gap-2 sm:gap-3'>
        {/* 历史与收藏 */}
        <button
          onClick={() => setShowFavoritesModal(true)}
          className="group flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
        >
          <Clock className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
          <span className="text-xs sm:text-sm font-medium tracking-wide hidden sm:inline">历史与收藏</span>
          {(favoriteItems.length > 0 || Object.keys(allPlayRecords).length > 0) && (
            <span className="bg-[#333] group-hover:bg-[#DC143C] text-white text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full ml-0.5 transition-colors">
              {favoriteItems.length + Object.keys(allPlayRecords).length}
            </span>
          )}
        </button>

        {/* 即将上映 */}
        <button
          onClick={() => setShowUpcomingModal(true)}
          className="group flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
        >
          <Calendar className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
          <span className="text-xs sm:text-sm font-medium tracking-wide hidden sm:inline">即将上映</span>
        </button>
      </div>

      {/* ================== 右上角按钮 ================== */}
      <div className='absolute top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-2'>
        <ThemeToggle />
        <UserMenu />
      </div>

      {/* 核心搜索区域 - 垂直水平绝对居中 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-4 -mt-10">
        
        {/* 大 Logo 区域 */}
        <div className="flex justify-center items-center mb-10 -mt-16 sm:-mt-24">
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

        {/* ================== 首页分类快捷按钮组 ================== */}
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 mb-8 max-w-3xl mx-auto">
          {/* 电影 */}
          <Link
            href="/douban?type=movie"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <Film className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">电影</span>
          </Link>

          {/* 剧集 */}
          <Link
            href="/douban?type=tv"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <Tv className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">剧集</span>
          </Link>

          {/* 短剧 */}
          <Link
            href="/shortdrama"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <PlaySquare className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">短剧</span>
          </Link>

          {/* 动漫 */}
          <Link
            href="/douban?type=anime"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <Cat className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">动漫</span>
          </Link>

          {/* 综艺 */}
          <Link
            href="/douban?type=show"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <Clover className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">综艺</span>
          </Link>

          {/* 直播 */}
          <Link
            href="/live"
            className="group flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1a1a1a] border border-[#333] hover:border-[#DC143C] text-gray-400 hover:text-[#DC143C] rounded-full transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.2)]"
          >
            <Radio className="w-4 h-4 group-hover:text-[#DC143C] transition-colors" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">直播</span>
          </Link>
        </div>

        {/* 胶囊搜索框 */}
        <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl px-2 sm:px-0 relative mx-auto z-50">
          <div className="group flex items-center h-14 bg-[#1a1a1a] border border-[#333] hover:border-[#555] focus-within:border-[#DC143C] focus-within:shadow-[0_0_20px_rgba(220,20,60,0.15)] rounded-full transition-all duration-300 pl-1.5 pr-1.5 shadow-xl relative z-20">
            
            {/* 源库浏览标识图标 */}
            <Link href="/source-browser" className="h-11 px-3 sm:px-5 flex items-center justify-center bg-transparent text-gray-400 hover:text-[#DC143C] shrink-0 transition-colors cursor-pointer group/link">
              <svg className="w-5 h-5 sm:mr-1.5 group-hover/link:text-[#DC143C] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="hidden sm:inline text-sm font-medium">源库浏览</span>
            </Link>
            
            {/* 分割线 */}
            <div className="h-6 w-px bg-[#333] mx-1 sm:mx-2 transition-colors group-focus-within:bg-[#555]"></div>

            {/* 输入框 */}
            <input 
              id="searchInput"
              type="text" 
              name="search"
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              className="flex-1 bg-transparent text-white px-2 sm:px-4 py-2 focus:outline-none placeholder-gray-600 text-base min-w-0" 
              placeholder="搜索你想看的剧名..." 
              autoComplete="off"
              aria-label="视频搜索框" 
            />
            
            {/* 一键清空按钮 */}
            {searchQuery.length > 0 && (
              <button 
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSuggestions(true); 
                  document.getElementById('searchInput')?.focus();
                }}
                className="px-3 flex items-center justify-center text-gray-500 hover:text-[#DC143C] transition-colors shrink-0"
                aria-label="清空搜索框"
              >
                <X className="w-5 h-5" />
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

          {/* 搜索建议 */}
          <SearchSuggestions
            query={searchQuery}
            isVisible={showSuggestions}
            onSelect={handleSuggestionSelect}
            onClose={() => setShowSuggestions(false)}
            onEnterKey={() => {
              const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
              if (!trimmed) return;
              setSearchQuery(trimmed);
              setShowSuggestions(false);
              router.push(`/search?q=${encodeURIComponent(trimmed)}`);
            }}
          />
        </form>

        {/* ================== 搜索历史模块 ================== */}
        {searchHistory.length > 0 && (
          <div className="w-full max-w-2xl px-2 sm:px-0 mx-auto mt-6 z-10 relative">
            <section className='mb-6'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-sm font-medium text-gray-400'>
                  最近搜索
                </h2>
                {/* 增加特效与图标的清空按钮 */}
                <button
                  onClick={() => clearSearchHistory()}
                  className='p-1.5 text-gray-500 hover:text-[#DC143C] hover:bg-[#DC143C]/10 rounded-full transition-all duration-300 hover:scale-110 hover:rotate-12 active:scale-95 cursor-pointer'
                  title="清空搜索记录"
                  aria-label="清空搜索记录"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className='flex flex-wrap gap-2'>
                {searchHistory.map((item) => (
                  <div key={item} className='relative group'>
                    <button
                      onClick={() => {
                        setSearchQuery(item);
                        router.push(
                          `/search?q=${encodeURIComponent(item.trim())}`
                        );
                      }}
                      className='px-3 py-1.5 bg-[#1a1a1a] border border-[#333] hover:border-[#555] rounded-full text-xs text-gray-300 hover:text-white transition-colors duration-200 shadow-md'
                    >
                      {item}
                    </button>
                    {/* 删除按钮 */}
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item); 
                      }}
                      className='absolute -top-1 -right-1 w-3.5 h-3.5 opacity-0 group-hover:opacity-100 bg-[#333] hover:bg-[#DC143C] text-white rounded-full flex items-center justify-center text-[8px] transition-colors'
                    >
                      <X className='w-2.5 h-2.5' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* 底部 Footer */}
      <footer className="w-full py-6 bg-[#0a0a0a] border-t border-[#1f2937] shrink-0">
        <div className="max-w-[2560px] mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <div className="flex items-center justify-center md:justify-start">
                <img src="/logo.png" alt="红月搜索 Logo" className="w-10 h-10 mr-2 object-contain" />
                <span className="text-[#00ccff] font-bold text-lg">红月搜索</span>
              </div>
              <p className="text-[#6b7280] text-sm mt-2 text-center md:text-left">
                © {new Date().getFullYear()} 红月搜索-剧名搜索、在线视频神器。
              </p>
            </div>
            
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

      {/* ================== 历史与收藏 双选项卡模态框 ================== */}
      {showFavoritesModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity">
          <div 
            className="bg-[#131722] border border-[#333] w-full max-w-6xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal 头部：选项卡切换 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] bg-[#1a1a1a] shrink-0">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setModalTab('history')}
                  className={`text-lg sm:text-xl font-bold flex items-center gap-2 transition-colors ${
                    modalTab === 'history' ? 'text-white' : 'text-gray-600 hover:text-gray-300'
                  }`}
                >
                  <Clock className={`w-5 h-5 ${modalTab === 'history' ? 'text-[#00ccff]' : 'text-gray-600'}`} />
                  观看历史
                </button>
                <div className="w-px h-6 bg-[#333]"></div>
                <button
                  onClick={() => setModalTab('favorites')}
                  className={`text-lg sm:text-xl font-bold flex items-center gap-2 transition-colors ${
                    modalTab === 'favorites' ? 'text-white' : 'text-gray-600 hover:text-gray-300'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${modalTab === 'favorites' ? 'text-[#DC143C] fill-[#DC143C]' : 'text-gray-600'}`} />
                  我的收藏
                </button>
              </div>

              <div className="flex items-center gap-3">
                {modalTab === 'favorites' && favoriteItems.length > 0 && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#DC143C] hover:text-white hover:bg-[#DC143C] border border-[#DC143C] rounded-lg transition-all duration-200"
                    onClick={() => {
                      if (requireClearConfirmation) {
                        setShowClearFavoritesDialog(true);
                      } else {
                        handleClearFavorites();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">清空收藏</span>
                  </button>
                )}
                <button
                  onClick={() => setShowFavoritesModal(false)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-xl transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal 内容区 (根据选项卡切换) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {modalTab === 'favorites' ? (
                <>
                  {/* 收藏夹内容 */}
                  {/* 统计信息 */}
                  {favoriteStats && (
                    <div className='mb-5 flex flex-wrap gap-2 text-sm text-gray-400'>
                      <span className='px-3 py-1 bg-[#222] border border-[#333] rounded-full text-gray-300'>
                        共 <strong className='text-white'>{favoriteStats.total}</strong> 项
                      </span>
                      {favoriteStats.movie > 0 && (
                        <span className='px-3 py-1 bg-[#222] border border-[#333] text-blue-400 rounded-full'>
                          电影 {favoriteStats.movie}
                        </span>
                      )}
                      {favoriteStats.tv > 0 && (
                        <span className='px-3 py-1 bg-[#222] border border-[#333] text-purple-400 rounded-full'>
                          剧集 {favoriteStats.tv}
                        </span>
                      )}
                      {favoriteStats.anime > 0 && (
                        <span className='px-3 py-1 bg-[#222] border border-[#333] text-pink-400 rounded-full'>
                          动漫 {favoriteStats.anime}
                        </span>
                      )}
                      {favoriteStats.shortdrama > 0 && (
                        <span className='px-3 py-1 bg-[#222] border border-[#333] text-orange-400 rounded-full'>
                          短剧 {favoriteStats.shortdrama}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 筛选标签 */}
                  {favoriteItems.length > 0 && (
                    <div className='mb-5 flex flex-wrap gap-2'>
                      {[
                        { key: 'all' as const, label: '全部', icon: '📚' },
                        { key: 'movie' as const, label: '电影', icon: '🎬' },
                        { key: 'tv' as const, label: '剧集', icon: '📺' },
                        { key: 'anime' as const, label: '动漫', icon: '🎌' },
                        { key: 'shortdrama' as const, label: '短剧', icon: '🎭' },
                        { key: 'live' as const, label: '直播', icon: '📡' },
                        { key: 'variety' as const, label: '综艺', icon: '🎪' },
                      ].map(({ key, label, icon }) => (
                        <button
                          key={key}
                          onClick={() => setFavoriteFilter(key)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                            favoriteFilter === key
                              ? 'bg-[#DC143C] border-[#DC143C] text-white shadow-[0_0_10px_rgba(220,20,60,0.3)] scale-105'
                              : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:bg-[#222] hover:text-gray-200'
                          }`}
                        >
                          <span className='mr-1'>{icon}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 排序选项 */}
                  {favoriteItems.length > 0 && (
                    <div className='mb-6 flex items-center gap-2 text-sm'>
                      <span className='text-gray-500'>排序：</span>
                      <div className='flex gap-2'>
                        {[
                          { key: 'recent' as const, label: '最近添加' },
                          { key: 'title' as const, label: '标题 A-Z' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setFavoriteSortBy(key)}
                            className={`px-3 py-1 rounded-md transition-colors border ${
                              favoriteSortBy === key
                                ? 'bg-[#333] border-[#555] text-white'
                                : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:bg-[#222] hover:text-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 收藏列表网格 */}
                  <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                    {(() => {
                      let filtered = favoriteItems;
                      if (favoriteFilter === 'movie') {
                        filtered = favoriteItems.filter(item => {
                          if (item.type) return item.type === 'movie';
                          if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
                          if (item.source === 'bangumi') return false;
                          if (item.origin === 'live') return false;
                          return item.episodes === 1;
                        });
                      } else if (favoriteFilter === 'tv') {
                        filtered = favoriteItems.filter(item => {
                          if (item.type) return item.type === 'tv';
                          if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
                          if (item.source === 'bangumi') return false;
                          if (item.origin === 'live') return false;
                          return item.episodes > 1;
                        });
                      } else if (favoriteFilter === 'anime') {
                        filtered = favoriteItems.filter(item => {
                          if (item.type) return item.type === 'anime';
                          return item.source === 'bangumi';
                        });
                      } else if (favoriteFilter === 'shortdrama') {
                        filtered = favoriteItems.filter(item => {
                          if (item.type) return item.type === 'shortdrama';
                          return item.source === 'shortdrama' || item.source_name === '短剧';
                        });
                      } else if (favoriteFilter === 'live') {
                        filtered = favoriteItems.filter(item => item.origin === 'live');
                      } else if (favoriteFilter === 'variety') {
                        filtered = favoriteItems.filter(item => {
                          if (item.type) return item.type === 'variety';
                          return false;
                        });
                      }

                      if (favoriteSortBy === 'title') {
                        filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
                      }

                      return filtered.map((item) => {
                        let calculatedRemarks = item.remarks;

                        if (item.releaseDate) {
                          const releaseDate = new Date(item.releaseDate);
                          const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                          if (daysDiff < 0) {
                            const daysAgo = Math.abs(daysDiff);
                            calculatedRemarks = `已上映${daysAgo}天`;
                          } else if (daysDiff === 0) {
                            calculatedRemarks = '今日上映';
                          } else {
                            calculatedRemarks = `${daysDiff}天后上映`;
                          }
                        }

                        return (
                          <div key={item.id + item.source} className='w-full'>
                            <VideoCard
                              query={item.search_title}
                              {...item}
                              from='favorite'
                              remarks={calculatedRemarks}
                            />
                          </div>
                        );
                      });
                    })()}

                    {/* 空状态 */}
                    {favoriteItems.length === 0 && (
                      <div className='col-span-full flex flex-col items-center justify-center py-20 px-4'>
                        <div className='mb-6 relative'>
                          <div className='absolute inset-0 bg-[#DC143C]/20 blur-3xl rounded-full animate-pulse'></div>
                          <svg className='w-28 h-28 relative z-10' viewBox='0 0 200 200' fill='none' xmlns='http://www.w3.org/2000/svg'>
                            <path d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                              className='fill-[#1a1a1a] stroke-[#333] transition-colors duration-300'
                              strokeWidth='3'
                            />
                            <path d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                              fill='none'
                              stroke='currentColor'
                              strokeWidth='2'
                              strokeDasharray='5,5'
                              className='text-[#555]'
                            />
                          </svg>
                        </div>
                        <h3 className='text-lg font-semibold text-gray-300 mb-2'>
                          收藏夹空空如也
                        </h3>
                        <p className='text-sm text-gray-500 text-center max-w-xs'>
                          快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 继续观看 (历史记录) 模块直接挂载于此 */
                <div className="w-full pt-2">
                  <ContinueWatching />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================== 即将上映 独立模态框 ================== */}
      {showUpcomingModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity">
          <div 
            className="bg-[#131722] border border-[#333] w-full max-w-6xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] bg-[#1a1a1a] shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#DC143C]" />
                即将上映
              </h2>
              <button
                onClick={() => setShowUpcomingModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-xl transition-colors"
                aria-label="关闭"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Modal 内容区 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {(() => {
                const loading = isUpcomingLoading;
                console.log('🔍 即将上映 section 渲染检查:', { loading, upcomingReleasesCount: upcomingReleases.length });
                return null;
              })()}
              
              {isUpcomingLoading ? (
                 <div className='flex items-center justify-center py-12'>
                    <div className='w-8 h-8 border-2 border-[#333] border-t-[#DC143C] rounded-full animate-spin'></div>
                 </div>
              ) : !isUpcomingLoading && upcomingReleases.length > 0 && (
                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="即将上映" icon={Calendar} iconColor="text-[#DC143C]" />
                    <Link
                      href='/release-calendar'
                      className='flex items-center text-sm text-gray-400 hover:text-[#DC143C] transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>

                  {/* Tab 切换 */}
                  <div className='mb-4 flex gap-2'>
                    {[
                      { key: 'all', label: '全部', count: upcomingReleases.length },
                      { key: 'movie', label: '电影', count: upcomingReleases.filter(r => r.type === 'movie').length },
                      { key: 'tv', label: '电视剧', count: upcomingReleases.filter(r => r.type === 'tv').length },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setUpcomingFilter(key as 'all' | 'movie' | 'tv')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
                          upcomingFilter === key
                            ? 'bg-[#DC143C] border-[#DC143C] text-white shadow-[0_0_10px_rgba(220,20,60,0.3)]'
                            : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:bg-[#222] hover:text-gray-200'
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span className={`ml-1.5 text-xs ${
                            upcomingFilter === key ? 'text-white/80' : 'text-gray-500'
                          }`}>
                            ({count})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <ScrollableRow enableVirtualization={true}>
                    {upcomingReleases
                      .filter(release => upcomingFilter === 'all' || release.type === upcomingFilter)
                      .map((release, index) => {
                        const releaseDate = new Date(release.releaseDate);
                        const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                        let remarksText;
                        if (daysDiff < 0) {
                          remarksText = `已上映${Math.abs(daysDiff)}天`;
                        } else if (daysDiff === 0) {
                          remarksText = '今日上映';
                        } else {
                          remarksText = `${daysDiff}天后上映`;
                        }

                        return (
                          <div
                            key={`${release.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              source='upcoming_release'
                              id={release.id}
                              source_name='即将上映'
                              from='douban'
                              title={release.title}
                              poster={release.cover || '/placeholder-poster.jpg'}
                              year={release.releaseDate.split('-')[0]}
                              type={release.type}
                              remarks={remarksText}
                              releaseDate={release.releaseDate}
                              query={release.title}
                              episodes={release.episodes || (release.type === 'tv' ? undefined : 1)}
                            />
                          </div>
                        );
                      })}
                  </ScrollableRow>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 清空收藏的确认对话框 */}
      <ConfirmDialog
        isOpen={showClearFavoritesDialog}
        title="确认清空收藏"
        message={`确定要清空所有收藏吗？\n\n这将删除 ${favoriteItems.length} 项收藏，此操作无法撤销。`}
        confirmText="确认清空"
        cancelText="取消"
        variant="danger"
        onConfirm={handleClearFavorites}
        onCancel={() => setShowClearFavoritesDialog(false)}
      />

    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#131722]"></div>}>
      <HomeClient />
    </Suspense>
  );
}
