import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Search, Volume2, List, Repeat, Repeat1, RefreshCw, X, ArrowLeft, Plus, Clock, Download, Upload, Trash2, Shuffle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getVideoInfo, getAudioStreamUrl, getPlayableAudioUrl, formatDuration, searchVideos, BiliSearchResult } from './bili-api';
import { listen } from '@tauri-apps/api/event';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Song {
  id: string;
  bvid: string;
  cid: number;
  title: string;
  author: string;
  duration: number;
  cover: string;
  audioUrl?: string;
}

type LoopMode = 'off' | 'all' | 'one';
type ViewMode = 'playlist' | 'search' | 'history';

const STORAGE_KEYS = {
  PLAYLIST: 'bilimini_playlist',
  HISTORY: 'bilimini_history',
  LOOP_MODE: 'bilimini_loop_mode',
  VOLUME: 'bilimini_volume',
  SHUFFLE: 'bilimini_shuffle',
};

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Song[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYLIST);
    return saved ? JSON.parse(saved) : [];
  });
  const [history, setHistory] = useState<Song[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [progress, setProgress] = useState(0); 
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('playlist');
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VOLUME);
    return saved ? parseFloat(saved) : 0.8;
  });
  const [loopMode, setLoopMode] = useState<LoopMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOOP_MODE) as LoopMode;
    return saved || 'off';
  });
  const [isShuffleOn, setIsShuffleOn] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHUFFLE);
    return saved === 'true';
  });
  const [inputBv, setInputBv] = useState('');
  const [searchResults, setSearchResults] = useState<BiliSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAYLIST, JSON.stringify(playlist));
  }, [playlist]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VOLUME, volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOOP_MODE, loopMode);
  }, [loopMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHUFFLE, isShuffleOn.toString());
  }, [isShuffleOn]);

  // Auto-clear error messages
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Initialize audio
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
      
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current && audioRef.current.duration) {
          const current = audioRef.current.currentTime;
          const duration = audioRef.current.duration;
          setCurrentTime(current);
          setProgress((current / duration) * 100);
        }
      };
      
      audioRef.current.onended = () => {
        handleSongEnd();
      };
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          playNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, currentSongIndex, playlist]);

  // Global shortcuts listener
  useEffect(() => {
    const unlisten = listen<string>('global-shortcut', (event) => {
      const action = event.payload;
      switch(action) {
        case 'play-pause':
          togglePlay();
          break;
        case 'next':
          playNext();
          break;
        case 'prev':
          playPrev();
          break;
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [isPlaying, currentSongIndex, playlist]);

  const currentSong = currentSongIndex >= 0 ? playlist[currentSongIndex] : null;

  const addToHistory = (song: Song) => {
    setHistory(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      return [song, ...filtered].slice(0, 50); // Keep last 50
    });
  };

  const handleSongEnd = () => {
    if (loopMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else if (loopMode === 'all') {
      playNext();
    } else {
      if (currentSongIndex < playlist.length - 1) {
        playNext();
      } else {
        setIsPlaying(false);
      }
    }
  };

  const handleInput = async () => {
    if (!inputBv.trim()) return;
    
    const trimmed = inputBv.trim();
    
    // Check if it's a BV ID
    const bvMatch = trimmed.match(/(BV\w+)/);
    if (bvMatch) {
      await handleAddByBV(bvMatch[1]);
    } else {
      // Trigger search
      await handleSearch(trimmed);
    }
  };

  const handleAddByBV = async (bvid: string) => {
    setIsLoading(true);
    setErrorMsg('');
    
    try {
      const info = await getVideoInfo(bvid);
      
      // Check if it's a multi-part video
      if (info.pages && info.pages.length > 1) {
        // Add all parts
        const newSongs: Song[] = info.pages.map(page => ({
          id: `${info.bvid}-${page.cid}`,
          bvid: info.bvid,
          cid: page.cid,
          title: `${info.title} - ${page.part}`,
          author: info.owner.name,
          duration: page.duration,
          cover: info.pic,
        }));
        
        setPlaylist(prev => [...prev, ...newSongs]);
        
        if (currentSongIndex === -1) {
          playSong(newSongs[0], playlist.length);
        }
        
        setInputBv('');
      } else {
        // Single video
        const exists = playlist.some(s => s.bvid === info.bvid);
        if (exists) {
          setErrorMsg('Already in playlist!');
          setIsLoading(false);
          return;
        }

        const newSong: Song = {
          id: `${info.bvid}-${info.cid}`,
          bvid: info.bvid,
          cid: info.cid,
          title: info.title,
          author: info.owner.name,
          duration: info.duration,
          cover: info.pic,
        };

        setPlaylist(prev => [...prev, newSong]);
        
        if (currentSongIndex === -1) {
          playSong(newSong, playlist.length);
        }
        
        setInputBv('');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Error fetching video');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (keyword: string) => {
    setIsLoading(true);
    setErrorMsg('');
    
    try {
      const results = await searchVideos(keyword);
      setSearchResults(results);
      setViewMode('search');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const addFromSearch = async (result: BiliSearchResult) => {
    const exists = playlist.some(s => s.bvid === result.bvid);
    if (exists) {
      setErrorMsg('Already in playlist!');
      setTimeout(() => setErrorMsg(''), 2000);
      return;
    }

    const newSong: Song = {
      id: `${result.bvid}-temp`,
      bvid: result.bvid,
      cid: 0, // Will be fetched when playing
      title: result.title,
      author: result.author,
      duration: result.duration,
      cover: result.pic,
    };

    setPlaylist(prev => [...prev, newSong]);
  };

  const playSong = async (song: Song, index: number) => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      
      // If CID is 0, fetch it
      let cid = song.cid;
      if (cid === 0) {
        const info = await getVideoInfo(song.bvid);
        cid = info.cid;
        
        // Update playlist with correct CID
        setPlaylist(prev => {
          const next = [...prev];
          next[index] = { ...song, cid, id: `${song.bvid}-${cid}` };
          return next;
        });
      }
      
      let url = song.audioUrl;
      if (!url) {
        const streamUrl = await getAudioStreamUrl(song.bvid, cid);
        url = await getPlayableAudioUrl(streamUrl);
        
        setPlaylist(prev => {
          const next = [...prev];
          next[index] = { ...song, audioUrl: url };
          return next;
        });
      }

      if (audioRef.current) {
        audioRef.current.src = url!;
        await audioRef.current.play();
        setIsPlaying(true);
        setCurrentSongIndex(index);
        addToHistory(playlist[index]);
      }
    } catch (e: any) {
      console.error('Play failed', e);
      setErrorMsg('Failed to play: ' + e.message);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    
    let nextIndex: number;
    if (isShuffleOn) {
      // Random index, but not the current one
      do {
        nextIndex = Math.floor(Math.random() * playlist.length);
      } while (nextIndex === currentSongIndex && playlist.length > 1);
    } else {
      nextIndex = (currentSongIndex + 1) % playlist.length;
    }
    
    playSong(playlist[nextIndex], nextIndex);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    
    let prevIndex: number;
    if (isShuffleOn) {
      // Random index for shuffle mode
      do {
        prevIndex = Math.floor(Math.random() * playlist.length);
      } while (prevIndex === currentSongIndex && playlist.length > 1);
    } else {
      prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    }
    
    playSong(playlist[prevIndex], prevIndex);
  };

  const removeSong = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setPlaylist(prev => {
      const next = prev.filter((_, i) => i !== index);
      
      if (index === currentSongIndex) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }
        setIsPlaying(false);
        setCurrentSongIndex(-1);
      } else if (index < currentSongIndex) {
        setCurrentSongIndex(prev => prev - 1);
      }
      
      return next;
    });
  };

  const toggleLoopMode = () => {
    const modes: LoopMode[] = ['off', 'all', 'one'];
    const currentIdx = modes.indexOf(loopMode);
    setLoopMode(modes[(currentIdx + 1) % modes.length]);
  };

  const exportPlaylist = () => {
    const data = JSON.stringify(playlist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bilimini-playlist-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importPlaylist = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Song[];
        
        // Validate structure
        if (!Array.isArray(imported) || !imported.every(s => s.bvid && s.title)) {
          setErrorMsg('Invalid playlist file');
          return;
        }
        
        setPlaylist(prev => [...prev, ...imported]);
      } catch (e) {
        setErrorMsg('Failed to import playlist');
      }
    };
    input.click();
  };

  const clearPlaylist = () => {
    if (playlist.length === 0) return;
    
    if (confirm(`Clear all ${playlist.length} songs from playlist?`)) {
      setPlaylist([]);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsPlaying(false);
      setCurrentSongIndex(-1);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !currentSong) return;
    
    const bar = progressBarRef.current;
    if (!bar) return;
    
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * audioRef.current.duration;
    
    audioRef.current.currentTime = newTime;
  };

  const LoopIcon = loopMode === 'one' ? Repeat1 : Repeat;
  const loopColor = loopMode === 'off' ? 'text-zinc-400' : 'text-pink-500';

  return (
    <div className="h-screen w-full bg-zinc-900/95 text-white flex flex-col select-none overflow-hidden rounded-xl border border-white/10 shadow-2xl backdrop-blur-md font-sans">
      {/* Header */}
      <div className="h-12 border-b border-white/5 flex items-center px-4 gap-3 bg-zinc-800/50" data-tauri-drag-region>
        {viewMode === 'search' && (
          <button onClick={() => setViewMode('playlist')} className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="text-pink-500 font-bold tracking-tight flex items-center gap-1">
          <span className="text-lg">📺</span>
        </div>
        <div className="flex-1 relative group">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-pink-500 transition-colors">
            {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          </div>
          <input 
            type="text"
            value={inputBv}
            onChange={(e) => setInputBv(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInput()}
            placeholder={viewMode === 'search' ? 'Search...' : 'BV / Search...'}
            className="w-full bg-zinc-900/50 border border-transparent focus:border-pink-500/50 rounded-full py-1 pl-8 pr-3 text-xs outline-none transition-all placeholder:text-zinc-600 font-mono"
            disabled={isLoading}
          />
        </div>
        {viewMode === 'playlist' && playlist.length > 0 && (
          <button 
            onClick={clearPlaylist}
            className="text-zinc-500 hover:text-red-400 transition-colors"
            title="Clear playlist"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 text-red-400 text-xs px-4 py-1 text-center border-b border-red-500/10">
          {errorMsg}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {viewMode === 'playlist' && (
          <div className="flex flex-col">
            {playlist.length === 0 && (
              <div className="text-zinc-600 text-xs text-center py-10 italic">
                Playlist empty.<br/>Paste BV or search above.
              </div>
            )}
            {playlist.map((song, idx) => (
              <div 
                key={song.id}
                onClick={() => playSong(song, idx)}
                className={cn(
                  "px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer transition-colors text-sm border-b border-white/5 group/item",
                  idx === currentSongIndex && "bg-pink-500/10"
                )}
              >
                <div className={cn("text-xs w-4 text-center", idx === currentSongIndex ? "text-pink-500" : "text-zinc-500")}>
                  {idx === currentSongIndex ? (isPlaying ? '♫' : '⏸') : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("font-medium truncate text-xs", idx === currentSongIndex ? "text-pink-400" : "text-zinc-200")}>
                    {song.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{song.author}</div>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">{formatDuration(song.duration)}</div>
                <button
                  onClick={(e) => removeSong(idx, e)}
                  className="opacity-0 group-hover/item:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'search' && (
          <div className="flex flex-col">
            {searchResults.length === 0 && !isLoading && (
              <div className="text-zinc-600 text-xs text-center py-10 italic">
                No results.
              </div>
            )}
            {searchResults.map((result) => (
              <div 
                key={result.bvid}
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-sm border-b border-white/5 group/item"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-xs text-zinc-200">
                    {result.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{result.author}</div>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">{formatDuration(result.duration)}</div>
                <button
                  onClick={() => addFromSearch(result)}
                  className="text-zinc-500 hover:text-pink-400 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'history' && (
          <div className="flex flex-col">
            {history.length === 0 && (
              <div className="text-zinc-600 text-xs text-center py-10 italic">
                No history yet.
              </div>
            )}
            {history.map((song, idx) => (
              <div 
                key={song.id + idx}
                onClick={() => {
                  const playlistIdx = playlist.findIndex(s => s.id === song.id);
                  if (playlistIdx >= 0) {
                    playSong(playlist[playlistIdx], playlistIdx);
                    setViewMode('playlist');
                  }
                }}
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer transition-colors text-sm border-b border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-xs text-zinc-200">
                    {song.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{song.author}</div>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">{formatDuration(song.duration)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-24 bg-zinc-900 border-t border-white/5 flex flex-col">
        <div 
          ref={progressBarRef}
          className="w-full h-1 bg-zinc-800 cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-pink-500 relative group-hover:bg-pink-400 transition-colors pointer-events-none" 
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-sm" />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-between px-4">
          <div className="flex items-center gap-3 w-1/3">
            {currentSong && (
              <>
                <div className="w-12 h-12 rounded bg-zinc-800 overflow-hidden flex-shrink-0 shadow-md">
                  <img 
                    src={currentSong.cover} 
                    alt="cover" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-white truncate">
                    {currentSong.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {currentSong.author}
                  </div>
                  <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                    {formatDuration(currentTime)} / {formatDuration(currentSong.duration)}
                  </div>
                </div>
              </>
            )}
            {!currentSong && (
              <span className="text-[10px] text-zinc-600 italic">No song playing</span>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 w-1/3">
            <button onClick={playPrev} className="text-zinc-400 hover:text-white transition-colors" disabled={playlist.length === 0}>
              <SkipBack size={18} />
            </button>
            <button 
              onClick={togglePlay}
              disabled={!currentSong}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={playNext} className="text-zinc-400 hover:text-white transition-colors" disabled={playlist.length === 0}>
              <SkipForward size={18} />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 w-1/3">
            <button 
              onClick={() => setIsShuffleOn(!isShuffleOn)}
              className={cn("transition-colors hover:text-white", isShuffleOn ? "text-pink-500" : "text-zinc-400")}
              title={isShuffleOn ? "Shuffle: On" : "Shuffle: Off"}
            >
              <Shuffle size={16} />
            </button>
            <button 
              onClick={exportPlaylist}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Export Playlist"
              disabled={playlist.length === 0}
            >
              <Download size={14} />
            </button>
            <button 
              onClick={importPlaylist}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Import Playlist"
            >
              <Upload size={14} />
            </button>
            <button 
              onClick={() => setViewMode(viewMode === 'playlist' ? 'playlist' : 'playlist')}
              className={cn("transition-colors", viewMode === 'playlist' ? "text-pink-500" : "text-zinc-400 hover:text-white")}
            >
              <List size={16} />
            </button>
            <button 
              onClick={() => setViewMode(viewMode === 'history' ? 'playlist' : 'history')}
              className={cn("transition-colors", viewMode === 'history' ? "text-pink-500" : "text-zinc-400 hover:text-white")}
              title="History"
            >
              <Clock size={16} />
            </button>
            <button 
              onClick={toggleLoopMode}
              className={cn("transition-colors hover:text-white", loopColor)}
              title={loopMode === 'off' ? 'Loop: Off' : loopMode === 'all' ? 'Loop: All' : 'Loop: One'}
            >
              <LoopIcon size={16} />
            </button>
            <div className="flex items-center gap-1.5 group w-16">
              <Volume2 size={14} className="text-zinc-400 flex-shrink-0" />
              <input 
                type="range" 
                min="0" max="1" step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
