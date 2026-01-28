import { fetch } from '@tauri-apps/plugin-http';

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
}

export interface BiliAudioStream {
  url: string; // The direct stream URL
  type: string;
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper: Convert seconds to mm:ss
export const formatDuration = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

// 1. Get video metadata (including CID)
export async function getVideoInfo(bvid: string): Promise<BiliVideoInfo> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  console.log('Fetching video info:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
    }
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(data.message || 'Failed to fetch video info');
  }
  
  return data.data;
}

// 2. Get audio stream URL
export async function getAudioStreamUrl(bvid: string, cid: number): Promise<string> {
  // qn=16 (64k), fnval=16 (dash)
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnval=16&fnver=0`;
  console.log('Fetching playurl:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.bilibili.com', // Crucial!
      'Cookie': 'SESSDATA=your_sessdata_here_if_needed', // Optional: for 1080p+, usually not needed for basic audio
    }
  });

  const data = await response.json();
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

// 3. Proxy audio stream (to bypass Referer check on playback)
// Since html5 audio tag cannot set headers, we fetch the blob via Tauri and create a local object URL.
// Note: For long streams, this loads entire file into memory. For production, a Rust-side stream proxy is better.
export async function getPlayableAudioUrl(streamUrl: string): Promise<string> {
  console.log('Proxying stream:', streamUrl);
  
  const response = await fetch(streamUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.bilibili.com', // The magic key
    }
  });
  
  if (!response.ok) {
    throw new Error(`Stream fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
