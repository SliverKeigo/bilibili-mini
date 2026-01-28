import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Search, Volume2, List, Repeat, Repeat1, Shuffle, RefreshCw, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getVideoInfo, getAudioStreamUrl, getPlayableAudioUrl, formatDuration, BiliVideoInfo } from './bili-api';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Song {
  id: string; // bvid + cid
  bvid: string;
  cid: number;
  title: string;
  author: string;
  duration: number; // seconds
  cover: string;
  audioUrl?: string; // Blob URL
}

type LoopMode = 'off' | 'all' | 'one';

// Persistent storage keys
const STORAGE_KEYS = {
  PLAYLIST: 'bilimini_playlist',
  LOOP_MODE: 'bilimini_loop_mode',
  VOLUME: 'bilimini_volume',
};

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Song[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYLIST);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [progress, setProgress] = useState(0); 
  const [currentTime, setCurrentTime] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VOLUME);
    return saved ? parseFloat(saved) : 0.8;
  });
  const [loopMode, setLoopMode] = useState<LoopMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOOP_MODE) as LoopMode;
    return saved || 'off';
  });
  const [inputBv, setInputBv] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Save playlist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAYLIST, JSON.stringify(playlist));
  }, [playlist]);

  // Save volume to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VOLUME, volume.toString());
  }, [volume]);

  // Save loop mode to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOOP_MODE, loopMode);
  }, [loopMode]);

  // Initialize audio element
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
      if (e.target instanceof HTMLInputElement) return; // Ignore if typing in input
      
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

  const currentSong = currentSongIndex >= 0 ? playlist[currentSongIndex] : null;

  const handleSongEnd = () => {
    if (loopMode === 'one') {
      // Replay current song
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else if (loopMode === 'all') {
      playNext();
    } else {
      // Check if there's a next song
      if (currentSongIndex < playlist.length - 1) {
        playNext();
      } else {
        setIsPlaying(false);
      }
    }
  };

  const handleSearch = async () => {
    if (!inputBv) return;
    setIsLoading(true);
    setErrorMsg('');
    
    // Extract BV id if URL provided
    let bvid = inputBv.trim();
    const match = inputBv.match(/(BV\w+)/);
    if (match) bvid = match[1];

    try {
      const info = await getVideoInfo(bvid);
      
      // Check if song already exists
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
      
      // If nothing playing, play this one
      if (currentSongIndex === -1) {
        playSong(newSong, playlist.length); // length is index of new item
      }
      
      setInputBv(''); // Clear input
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Error fetching video');
    } finally {
      setIsLoading(false);
    }
  };

  const playSong = async (song: Song, index: number) => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      
      // If no audio url yet (or expired), fetch it
      let url = song.audioUrl;
      if (!url) {
        const streamUrl = await getAudioStreamUrl(song.bvid, song.cid);
        url = await getPlayableAudioUrl(streamUrl);
        
        // Cache it in playlist
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
    const nextIndex = (currentSongIndex + 1) % playlist.length;
    playSong(playlist[nextIndex], nextIndex);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    playSong(playlist[prevIndex], prevIndex);
  };

  const removeSong = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setPlaylist(prev => {
      const next = prev.filter((_, i) => i !== index);
      
      // Adjust current index if needed
      if (index === currentSongIndex) {
        // Stop playing if removing current song
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
      {/* Header / Search */}
      <div className="h-12 border-b border-white/5 flex items-center px-4 gap-3 bg-zinc-800/50" data-tauri-drag-region>
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
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="BV..."
            className="w-full bg-zinc-900/50 border border-transparent focus:border-pink-500/50 rounded-full py-1 pl-8 pr-3 text-xs outline-none transition-all placeholder:text-zinc-600 font-mono"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Error Toast */}
      {errorMsg && (
        <div className="bg-red-500/10 text-red-400 text-xs px-4 py-1 text-center border-b border-red-500/10">
          {errorMsg}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide relative group">
        {showPlaylist ? (
          <div className="flex flex-col">
            {playlist.length === 0 && (
              <div className="text-zinc-600 text-xs text-center py-10 italic">
                Playlist empty.<br/>Paste a Bilibili ID above.
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
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
            {currentSong ? (
               <>
                <div className="w-32 h-32 rounded-lg bg-zinc-800 shadow-lg shadow-black/20 overflow-hidden relative group/cover">
                   <img src={currentSong.cover} alt="cover" className="w-full h-full object-cover opacity-80 group-hover/cover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white line-clamp-2 px-4">{currentSong.title}</h2>
                  <p className="text-xs text-zinc-500 mt-1">{currentSong.author}</p>
                </div>
               </>
            ) : (
                <div className="text-zinc-600 text-xs">No song playing</div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-24 bg-zinc-900 border-t border-white/5 flex flex-col">
        {/* Progress Bar */}
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
          {/* Left: Info */}
          <div className="flex items-center gap-3 w-1/3">
            <div className="flex flex-col min-w-0">
               <span className="text-[10px] text-zinc-400 font-mono">
                 {formatDuration(currentTime)} / {currentSong ? formatDuration(currentSong.duration) : "0:00"}
               </span>
            </div>
          </div>

          {/* Center: Play Controls */}
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

          {/* Right: Extra Controls */}
          <div className="flex items-center justify-end gap-3 w-1/3">
            <button 
              onClick={() => setShowPlaylist(!showPlaylist)}
              className={cn("transition-colors", showPlaylist ? "text-pink-500" : "text-zinc-400 hover:text-white")}
            >
              <List size={16} />
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
