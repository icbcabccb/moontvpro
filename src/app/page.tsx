/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight, Film, Tv, Calendar, Sparkles, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // 新增：用于 Next.js 的无刷新路由跳转
import { Suspense, useEffect, useState, useRef, useMemo, useReducer } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { ShortDramaItem, ReleaseCalendarItem, DoubanItem } from '@/lib/types';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanDetails } from '@/lib/douban.client';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import SkeletonCard from '@/components/SkeletonCard';
import { TelegramWelcomeModal } from '@/components/TelegramWelcomeModal';
import VideoCard from '@/components/VideoCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface HomeState {
  activeTab: 'home' | 'favorites';
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotAnime: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendarData: BangumiCalendarData[];
  upcomingReleases: ReleaseCalendarItem[];
  loading: boolean;
  username: string;
}

type HomeAction =
  | { type: 'SET_ACTIVE_TAB'; payload: 'home' | 'favorites' }
  | { type: 'SET_HOT_MOVIES'; payload: DoubanItem[] }
  | { type: 'SET_HOT_TV_SHOWS'; payload: DoubanItem[] }
  | { type: 'SET_HOT_VARIETY_SHOWS'; payload: DoubanItem[] }
  | { type: 'SET_HOT_ANIME'; payload: DoubanItem[] }
  | { type: 'SET_HOT_SHORT_DRAMAS'; payload: ShortDramaItem[] }
  | { type: 'SET_BANGUMI_CALENDAR_DATA'; payload: BangumiCalendarData[] }
  | { type: 'SET_UPCOMING_RELEASES'; payload: ReleaseCalendarItem[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USERNAME'; payload: string }
  | { type: 'UPDATE_HOT_MOVIES'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_TV_SHOWS'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_VARIETY_SHOWS'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_ANIME'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_SHORT_DRAMAS'; payload: (prev: ShortDramaItem[]) => ShortDramaItem[] };

const homeReducer = (state: HomeState, action: HomeAction): HomeState => {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_HOT_MOVIES':
      return { ...state, hotMovies: action.payload };
    case 'SET_HOT_TV_SHOWS':
      return { ...state, hotTvShows: action.payload };
    case 'SET_HOT_VARIETY_SHOWS':
      return { ...state, hotVarietyShows: action.payload };
    case 'SET_HOT_ANIME':
      return { ...state, hotAnime: action.payload };
    case 'SET_HOT_SHORT_DRAMAS':
      return { ...state, hotShortDramas: action.payload };
    case 'SET_BANGUMI_CALENDAR_DATA':
      return { ...state, bangumiCalendarData: action.payload };
    case 'SET_UPCOMING_RELEASES':
      return { ...state, upcomingReleases: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_USERNAME':
      return { ...state, username: action.payload };
    case 'UPDATE_HOT_MOVIES':
      return { ...state, hotMovies: action.payload(state.hotMovies) };
    case 'UPDATE_HOT_TV_SHOWS':
      return { ...state, hotTvShows: action.payload(state.hotTvShows) };
    case 'UPDATE_HOT_VARIETY_SHOWS':
      return { ...state, hotVarietyShows: action.payload(state.hotVarietyShows) };
    case 'UPDATE_HOT_ANIME':
      return { ...state, hotAnime: action.payload(state.hotAnime) };
    case 'UPDATE_HOT_SHORT_DRAMAS':
      return { ...state, hotShortDramas: action.payload(state.hotShortDramas) };
    default:
      return state;
  }
};

function HomeClient() {
  const queryClient = useQueryClient();
  const router = useRouter(); // 实例化 router

  const [state, dispatch] = useReducer(homeReducer, {
    activeTab: 'home',
    hotMovies: [],
    hotTvShows: [],
    hotVarietyShows: [],
    hotAnime: [],
    hotShortDramas: [],
    bangumiCalendarData: [],
    upcomingReleases: [],
    loading: true,
    username: '',
  });

  const {
    activeTab,
    hotMovies,
    hotTvShows,
    hotVarietyShows,
    hotAnime,
    bangumiCalendarData,
    upcomingReleases,
    loading,
    username,
  } = state;

  const workerRef = useRef<Worker | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return '上午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }, []);

  const todayAnimes = useMemo(() => {
    const today = new Date();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentWeekday = weekdays[today.getDay()];

    return bangumiCalendarData.find(
      (item) => item.weekday.en === currentWeekday
    )?.items || [];
  }, [bangumiCalendarData]);

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const [requireClearConfirmation, setRequireClearConfirmation] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // 新增：用于搜索框的受控状态

  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      dispatch({ type: 'SET_USERNAME', payload: authInfo.username });
    }

    if (typeof window !== 'undefined') {
      const savedRequireClearConfirmation = localStorage.getItem('requireClearConfirmation');
      if (savedRequireClearConfirmation !== null) {
        setRequireClearConfirmation(JSON.parse(savedRequireClearConfirmation));
      }
    }
  }, []);

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

  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'>('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<'recent' | 'title' | 'rating'>('recent');
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [showClearFavoritesDialog, setShowClearFavoritesDialog] = useState(false);

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

  useEffect(() => {
    cleanExpiredCache().catch(console.error);

    const fetchRecommendData = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        const [moviesData, tvShowsData, varietyShowsData, animeData, shortDramasData, bangumiData, upcomingData] = await Promise.allSettled([
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv_animation' }),
          getRecommendedShortDramas(undefined, 8),
          GetBangumiCalendarData(),
          fetch('/api/release-calendar?limit=100').then(res => {
            if (!res.ok) {
              console.error('获取即将上映数据失败，状态码:', res.status);
              return { items: [] };
            }
            return res.json();
          }),
        ]);

        if (moviesData.status === 'fulfilled' && moviesData.value?.code === 200) {
          const movies = moviesData.value.list;
          dispatch({ type: 'SET_HOT_MOVIES', payload: movies });

          setTimeout(() => {
            Promise.all(
              movies.slice(0, 2).map(async (movie) => {
                try {
                  const detailsRes = await getDoubanDetails(movie.id);
                  if (detailsRes.code === 200 && detailsRes.data) {
                    return {
                      id: movie.id,
                      plot_summary: detailsRes.data.plot_summary,
                      backdrop: detailsRes.data.backdrop,
                      trailerUrl: detailsRes.data.trailerUrl,
                    };
                  }
                } catch (error) {
                  console.warn(`获取电影 ${movie.id} 详情失败:`, error);
                }
                return null;
              })
            ).then((results) => {
              dispatch({
                type: 'UPDATE_HOT_MOVIES',
                payload: (prev) => prev.map(m => {
                  const detail = results.find(r => r?.id === m.id);
                  return detail ? { ...m, ...detail } : m;
                })
              });
            });
          }, 2000);
        }

        if (tvShowsData.status === 'fulfilled' && tvShowsData.value?.code === 200) {
          const tvShows = tvShowsData.value.list;
          dispatch({ type: 'SET_HOT_TV_SHOWS', payload: tvShows });

          setTimeout(() => {
            Promise.all(
              tvShows.slice(0, 2).map(async (show) => {
                try {
                  const detailsRes = await getDoubanDetails(show.id);
                  if (detailsRes.code === 200 && detailsRes.data) {
                    return {
                      id: show.id,
                      plot_summary: detailsRes.data.plot_summary,
                      backdrop: detailsRes.data.backdrop,
                      trailerUrl: detailsRes.data.trailerUrl,
                    };
                  }
                } catch (error) {
                  console.warn(`获取剧集 ${show.id} 详情失败:`, error);
                }
                return null;
              })
            ).then((results) => {
              dispatch({
                type: 'UPDATE_HOT_TV_SHOWS',
                payload: (prev) => prev.map(s => {
                  const detail = results.find(r => r?.id === s.id);
                  return detail ? { ...s, ...detail } : s;
                })
              });
            });
          }, 2000);
        }

        if (animeData.status === 'fulfilled' && animeData.value?.code === 200) {
          const animes = animeData.value.list;
          dispatch({ type: 'SET_HOT_ANIME', payload: animes });

          if (animes.length > 0) {
            setTimeout(() => {
              const anime = animes[0];
              getDoubanDetails(anime.id)
                .then((detailsRes) => {
                  if (detailsRes.code === 200 && detailsRes.data) {
                    dispatch({
                      type: 'UPDATE_HOT_ANIME',
                      payload: (prev) => prev.map(a => a.id === anime.id ? { ...a, ...detailsRes.data } : a)
                    });
                  }
                })
                .catch((error) => {
                  console.warn(`获取动漫 ${anime.id} 详情失败:`, error);
                });
            }, 3000);
          }
        }

        if (varietyShowsData.status === 'fulfilled' && varietyShowsData.value?.code === 200) {
          const varietyShows = varietyShowsData.value.list;
          dispatch({ type: 'SET_HOT_VARIETY_SHOWS', payload: varietyShows });

          if (varietyShows.length > 0) {
            setTimeout(() => {
              const show = varietyShows[0];
              getDoubanDetails(show.id)
                .then((detailsRes) => {
                  if (detailsRes.code === 200 && detailsRes.data) {
                    dispatch({
                      type: 'UPDATE_HOT_VARIETY_SHOWS',
                      payload: (prev) => prev.map(s => s.id === show.id ? { ...s, ...detailsRes.data } : s)
                    });
                  }
                })
                .catch((error) => {
                  console.warn(`获取综艺 ${show.id} 详情失败:`, error);
                });
            }, 3000);
          }
        }

        if (shortDramasData.status === 'fulfilled') {
          const dramas = shortDramasData.value;
          dispatch({ type: 'SET_HOT_SHORT_DRAMAS', payload: dramas });

          setTimeout(() => {
            Promise.all(
              dramas.slice(0, 2).map(async (drama) => {
                try {
                  const response = await fetch(`/api/shortdrama/detail?id=${drama.id}&episode=1`);
                  if (response.ok) {
                    const detailData = await response.json();
                    if (detailData.desc) {
                      return { id: drama.id, description: detailData.desc };
                    }
                  }
                } catch (error) {
                  console.warn(`获取短剧 ${drama.id} 详情失败:`, error);
                }
                return null;
              })
            ).then((results) => {
              dispatch({
                type: 'UPDATE_HOT_SHORT_DRAMAS',
                payload: (prev) => prev.map(d => {
                  const detail = results.find(r => r?.id === d.id);
                  return detail ? { ...d, description: detail.description } : d;
                })
              });
            });
          }, 3000);
        }

        if (bangumiData.status === 'fulfilled' && Array.isArray(bangumiData.value)) {
          dispatch({ type: 'SET_BANGUMI_CALENDAR_DATA', payload: bangumiData.value });
        }

        dispatch({ type: 'SET_LOADING', payload: false });

        if (upcomingData.status === 'fulfilled' && upcomingData.value?.items) {
          const releases = upcomingData.value.items;

          if (!workerRef.current && typeof window !== 'undefined' && window.Worker) {
            try {
              workerRef.current = new Worker(new URL('../workers/releaseCalendar.worker.ts', import.meta.url));

              workerRef.current.onmessage = (e: MessageEvent) => {
                const { selectedItems, error } = e.data;

                if (error) {
                  console.error('📅 [Worker] 处理失败:', error);
                  dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
                  return;
                }

                dispatch({ type: 'SET_UPCOMING_RELEASES', payload: selectedItems });
              };

              workerRef.current.onerror = (error) => {
                console.error('📅 [Worker] 错误:', error);
                dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
              };
            } catch (error) {
              console.error('📅 [Worker] 初始化失败:', error);
              dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
            }
          }

          if (workerRef.current) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            workerRef.current.postMessage({
              releases,
              today: today.toISOString().split('T')[0],
            });
          } else {
            dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
          }
        } else {
          dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
        }
      } catch (error) {
        console.error('获取推荐数据失败:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    fetchRecommendData();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleClearFavorites = async () => {
    await clearAllFavorites();
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
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

  // 修改：接入 Next.js 无刷新路由，并确保获取最新受控数据
  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const keyword = searchQuery.trim();
    if (keyword) {
      router.push(`/search?keyword=${encodeURIComponent(keyword)}`);
    }
  };

  return (
    <PageLayout>
      <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#DC143C] selection:text-white">
        <TelegramWelcomeModal />

        <div className='overflow-visible pb-44 md:pb-36 max-w-7xl mx-auto'>
          
          <header className="text-center mb-6 mt-8 md:mt-12 px-4">
            <div className="flex justify-center items-center mb-6">
              <a href="#" onClick={(e) => { e.preventDefault(); dispatch({ type: 'SET_ACTIVE_TAB', payload: 'home' }); }} className="flex items-center">
                <svg className="w-16 h-16 md:w-20 md:h-20 mr-2 text-[#00ccff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h1 className="text-4xl md:text-5xl font-bold text-[#DC143C]">红月搜索</h1>
              </a>
            </div>

            <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl px-2 sm:px-0 mx-auto">
              <div className="group flex items-center h-14 bg-[#1a1a1a] border border-[#333] hover:border-[#555] focus-within:border-[#DC143C] focus-within:shadow-[0_0_15px_rgba(220,20,60,0.2)] rounded-full transition-all duration-300 pl-1.5 pr-1.5 shadow-lg">
                
                <button type="button" onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'home' })}
                  className="h-11 px-3 sm:px-5 flex items-center justify-center bg-transparent text-gray-400 hover:text-white hover:bg-white/10 rounded-full font-medium transition-all duration-200 shrink-0" 
                  aria-label="返回首页" title="返回首页">
                  <svg className="w-5 h-5 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  </svg>
                  <span className="hidden sm:inline text-sm">首页</span>
                </button>
                
                <div className="h-6 w-px bg-[#333] mx-1 sm:mx-2 transition-colors group-focus-within:bg-[#555]"></div>

                {/* 修改为受控组件以支持实时状态和清空 */}
                <input type="text" name="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-white px-2 sm:px-4 py-2 focus:outline-none placeholder-gray-600 text-base min-w-0" 
                  placeholder="搜索你想看的剧名..." 
                  autoComplete="off"
                  aria-label="视频搜索框" />
                
                {/* 增加一键清空按钮 (还原代码 B 设计逻辑) */}
                {searchQuery.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3 flex items-center justify-center text-gray-500 hover:text-[#DC143C] transition-colors shrink-0"
                    aria-label="清空搜索框"
                    title="清空搜索框"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </button>
                )}
                
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
          </header>

          <div className='mb-8 relative overflow-hidden rounded-xl bg-[#1a1a1a] border border-[#333] shadow-lg mx-4 md:mx-0'>
            <div className='relative p-4 sm:p-5'>
              <div className='relative z-10 flex items-center justify-between gap-4'>
                <div className='flex-1 min-w-0'>
                  <h2 className='text-lg sm:text-xl font-bold text-gray-100 mb-2 flex items-center gap-2 flex-wrap'>
                    <span>
                      {greeting}
                      {username && '，'}
                    </span>
                    {username && (
                      <span className='text-[#DC143C] font-semibold'>
                        {username}
                      </span>
                    )}
                    <span className='inline-block animate-wave origin-bottom-right'>👋</span>
                  </h2>
                  <p className='text-sm text-gray-400'>
                    直接通过上方搜索框输入剧名，或在下方分类里选览视频内容，如需其它功能请附上账号ID联系管理员admin@400821.xyz。
                  </p>
                </div>

                <div className='hidden md:flex items-center justify-center shrink-0 w-12 h-12 rounded-full bg-[#222] border border-[#333] shadow-inner'>
                  <Film className='w-6 h-6 text-[#DC143C]' />
                </div>
              </div>
            </div>
          </div>

          <div className='mb-8 flex items-center justify-center'>
            <div className='p-1 bg-[#1a1a1a] border border-[#333] rounded-full inline-flex shadow-lg'>
              <CapsuleSwitch
                options={[
                  { label: '首页', value: 'home' },
                  { label: '收藏夹', value: 'favorites' },
                ]}
                active={activeTab}
                onChange={(value) => dispatch({ type: 'SET_ACTIVE_TAB', payload: value as 'home' | 'favorites' })}
              />
            </div>
          </div>

          <div className='w-full mx-auto px-4 md:px-0'>
            {activeTab === 'favorites' ? (
              <section className='mb-8'>
                <div className='mb-6 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-white'>
                    我的收藏
                  </h2>
                  {favoriteItems.length > 0 && (
                    <button
                      className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-500 hover:text-white hover:bg-[#DC143C] border border-red-500 hover:border-[#DC143C] rounded-lg transition-all duration-200 shadow-sm'
                      onClick={() => {
                        if (requireClearConfirmation) {
                          setShowClearFavoritesDialog(true);
                        } else {
                          handleClearFavorites();
                        }
                      }}
                    >
                      <Trash2 className='w-4 h-4' />
                      <span>清空收藏</span>
                    </button>
                  )}
                </div>

                {favoriteStats && (
                  <div className='mb-4 flex flex-wrap gap-2 text-sm text-gray-400'>
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

                {favoriteItems.length > 0 && (
                  <div className='mb-4 flex flex-wrap gap-2'>
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
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                          favoriteFilter === key
                            ? 'bg-[#DC143C] border-[#DC143C] text-white shadow-[0_0_10px_rgba(220,20,60,0.3)] scale-105'
                            : 'bg-[#222] border-[#333] text-gray-300 hover:bg-[#333] hover:text-white'
                        }`}
                      >
                        <span className='mr-1'>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {favoriteItems.length > 0 && (
                  <div className='mb-4 flex items-center gap-2 text-sm'>
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
                              : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:bg-[#222]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                  {favoriteItems.length === 0 && (
                    <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                      <div className='mb-6 relative'>
                        <div className='absolute inset-0 bg-red-900/20 blur-3xl rounded-full animate-pulse'></div>
                        <svg className='w-32 h-32 relative z-10' viewBox='0 0 200 200' fill='none' xmlns='http://www.w3.org/2000/svg'>
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

                      <h3 className='text-xl font-semibold text-gray-300 mb-2'>
                        收藏夹空空如也
                      </h3>
                      <p className='text-sm text-gray-500 text-center max-w-xs'>
                        快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
                      </p>
                    </div>
                  )}
                </div>

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
              </section>
            ) : (
              <>
                <ContinueWatching />

                {!loading && upcomingReleases.length > 0 && (
                  <section className='mb-8'>
                    <div className='mb-4 flex items-center justify-between'>
                      <SectionTitle title="即将上映" icon={Calendar} iconColor="text-[#DC143C]" />
                      <Link
                        href='/release-calendar'
                        className='flex items-center text-sm text-gray-400 hover:text-white transition-colors'
                      >
                        查看更多
                        <ChevronRight className='w-4 h-4 ml-1' />
                      </Link>
                    </div>

                    <div className='mb-4 flex gap-2'>
                      {[
                        { key: 'all', label: '全部', count: upcomingReleases.length },
                        { key: 'movie', label: '电影', count: upcomingReleases.filter(r => r.type === 'movie').length },
                        { key: 'tv', label: '电视剧', count: upcomingReleases.filter(r => r.type === 'tv').length },
                      ].map(({ key, label, count }) => (
                        <button
                          key={key}
                          onClick={() => setUpcomingFilter(key as 'all' | 'movie' | 'tv')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                            upcomingFilter === key
                              ? 'bg-[#DC143C] border-[#DC143C] text-white shadow-[0_0_10px_rgba(220,20,60,0.3)]'
                              : 'bg-[#222] border-[#333] text-gray-300 hover:bg-[#333] hover:text-white'
                          }`}
                        >
                          {label}
                          {count > 0 && (
                            <span className={`ml-1.5 text-xs ${
                              upcomingFilter === key
                                ? 'text-white/80'
                                : 'text-gray-500'
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

                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="热门电影" icon={Film} iconColor="text-[#00ccff]" />
                    <Link
                      href='/douban?type=movie'
                      className='flex items-center text-sm text-gray-400 hover:text-white transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow enableVirtualization={true}>
                    {loading
                      ? Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                      : hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={movie.id}
                            source_name='豆瓣'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={Number(movie.id)}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                          />
                        </div>
                      ))}
                  </ScrollableRow>
                </section>

                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="热门剧集" icon={Tv} iconColor="text-[#DC143C]" />
                    <Link
                      href='/douban?type=tv'
                      className='flex items-center text-sm text-gray-400 hover:text-white transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow enableVirtualization={true}>
                    {loading
                      ? Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                      : hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='tv'
                          />
                        </div>
                      ))}
                  </ScrollableRow>
                </section>

                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="新番放送" icon={Calendar} iconColor="text-purple-400" />
                    <Link
                      href='/douban?type=anime'
                      className='flex items-center text-sm text-gray-400 hover:text-white transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow enableVirtualization={true}>
                    {loading
                      ? Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                      : todayAnimes.map((anime, index) => (
                          <div
                            key={`${anime.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              from='douban'
                              source='bangumi'
                              id={anime.id.toString()}
                              source_name='Bangumi'
                              title={anime.name_cn || anime.name}
                              poster={
                                anime.images?.large ||
                                anime.images?.common ||
                                anime.images?.medium ||
                                anime.images?.small ||
                                anime.images?.grid ||
                                '/placeholder-poster.jpg'
                              }
                              douban_id={anime.id}
                              rate={anime.rating?.score?.toFixed(1) || ''}
                              year={anime.air_date?.split('-')?.[0] || ''}
                              isBangumi={true}
                            />
                          </div>
                        ))}
                  </ScrollableRow>
                </section>

                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="热门综艺" icon={Sparkles} iconColor="text-pink-500" />
                    <Link
                      href='/douban?type=show'
                      className='flex items-center text-sm text-gray-400 hover:text-white transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow enableVirtualization={true}>
                    {loading
                      ? Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                      : hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='variety'
                          />
                        </div>
                      ))}
                  </ScrollableRow>
                </section>

              </>
            )}
          </div>
        </div>
        
        <footer className="footer mt-8 py-6 border-t border-[#333] bg-[#0a0a0a]">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <div className="flex items-center justify-center md:justify-start">
                  <img src="/logo.png" alt="红月搜索 Logo" className="w-12 h-12 mr-2 object-contain" />
                  <span className="text-blue-400 font-bold">红月搜索</span>
                </div>
                <p className="text-gray-500 text-sm mt-2 text-center md:text-left">
                  © {new Date().getFullYear()} 红月搜索-剧名搜索、在线视频神器。
                </p>
              </div>
              
              <div className="text-center md:text-right">
                <p className="text-gray-500 text-sm max-w-md"></p>
                <div className="mt-2 flex flex-wrap justify-center md:justify-end gap-x-4 gap-y-2">
                  <Link href="/about" className="text-gray-400 hover:text-white text-sm transition-colors">关于红月</Link>
                  <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">隐私政策</Link>
                  <a href="https://200805.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">网盘系统</a>
                  <a href="https://400823.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">镜向站</a>
                  <a href="https://timis.dpdns.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">API中转服务</a>
                  <a href="https://ctv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">RedMoon-CTV</a>
                  <a href="https://vtv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">RedMoon-VTV</a>
                  <a href="https://sync.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">RedMoon-VTVII</a>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
