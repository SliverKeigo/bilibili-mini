import { invoke } from '@tauri-apps/api/core';

// Types
export interface BiliVideoInfo {
  title: string;
  pic: string;
  desc: string;
  owner: {
    name: string;
    face: string;
  };
  duration: number;
  cid: number;
  bvid: string;
  pages?: BiliPage[]; // Multi-part video pages
}

export interface BiliPage {
  cid: number;
  page: number;
  part: string; // Title of this part
  duration: number;
}

export interface BiliSearchResult {
  bvid: string;
  title: string;
  author: string;
  duration: number; // in seconds
  pic: string;
}

// Cache for proxied image URLs
const imageCache = new Map<string, string>();

// Helper: Convert seconds to mm:ss
export const formatDuration = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

// Helper: Parse duration string like "1:23:45" or "4:30" to seconds
const parseDuration = (str: string): number => {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
};

// Helper: Get proxied image URL (bypass Bilibili Referer check)
export async function getProxiedImageUrl(imageUrl: string): Promise<string> {
  // Return cached URL if available
  if (imageCache.has(imageUrl)) {
    return imageCache.get(imageUrl)!;
  }

  try {
    const bytes = await invoke<number[]>('fetch_image', { url: imageUrl });
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
    const blobUrl = URL.createObjectURL(blob);
    imageCache.set(imageUrl, blobUrl);
    return blobUrl;
  } catch (e) {
    console.error('Failed to proxy image:', e);
    return imageUrl; // Fallback to original URL
  }
}

// 1. Get video metadata (including CID and pages) - via Rust
export async function getVideoInfo(bvid: string): Promise<BiliVideoInfo> {
  console.log('Invoking fetch_bili_video_info:', bvid);
  
  const data: any = await invoke('fetch_bili_video_info', { bvid });
  
  if (data.code !== 0) {
    throw new Error(data.message || 'Failed to fetch video info');
  }
  
  return data.data;
}

// 2. Get audio stream URL - via Rust
export async function getAudioStreamUrl(bvid: string, cid: number): Promise<string> {
  console.log('Invoking fetch_bili_play_url:', { bvid, cid });

  const data: any = await invoke('fetch_bili_play_url', { bvid, cid });

  if (data.code !== 0) {
    throw new Error(data.message || 'Failed to fetch play url');
  }

  // Look for dash audio
  const dash = data.data.dash;
  if (dash && dash.audio && dash.audio.length > 0) {
    // Usually the first one is the best available without login
    return dash.audio[0].baseUrl; 
  }
  
  // Fallback to durl (mp4) if dash not available
  if (data.data.durl && data.data.durl.length > 0) {
    return data.data.durl[0].url;
  }

  throw new Error('No audio stream found');
}

// 3. Proxy audio stream (to bypass Referer check on playback) - via Rust
export async function getPlayableAudioUrl(streamUrl: string): Promise<string> {
  console.log('Invoking fetch_audio_stream:', streamUrl);
  
  // Returns Vec<u8> which maps to number[] in JS
  const bytes = await invoke<number[]>('fetch_audio_stream', { url: streamUrl });
  
  // Convert to Blob
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/mp4' }); // or audio/m4a
  return URL.createObjectURL(blob);
}

// 4. Search videos on Bilibili - via Rust
export async function searchVideos(keyword: string, page = 1): Promise<BiliSearchResult[]> {
  console.log('Invoking fetch_bili_search:', { keyword, page });

  const data: any = await invoke('fetch_bili_search', { keyword, page });

  if (data.code !== 0) {
    throw new Error(data.message || 'Search failed');
  }

  const results = data.data.result || [];
  
  return results.slice(0, 15).map((item: any) => ({
    bvid: item.bvid,
    title: item.title.replace(/<[^>]*>/g, ''), // Remove HTML tags
    author: item.author,
    duration: parseDuration(item.duration),
    pic: 'https:' + item.pic,
  }));
}
