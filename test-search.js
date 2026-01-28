// Test script for Bilibili search API
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const parseDuration = (str) => {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
};

const formatDuration = (seconds) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

async function testSearch(keyword) {
  console.log(`\n🔍 Searching for: "${keyword}"\n`);
  
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=1`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      }
    });

    const text = await response.text();
    
    // Debug: show first 200 chars
    console.log('Response preview:', text.substring(0, 200));
    
    const data = JSON.parse(text);
    
    if (data.code !== 0) {
      console.error('❌ Search failed:', data.message);
      return;
    }

    const results = data.data.result || [];
    
    if (results.length === 0) {
      console.log('⚠️  No results found');
      return;
    }

    console.log(`✅ Found ${results.length} results:\n`);
    
    results.slice(0, 5).forEach((item, idx) => {
      const title = item.title.replace(/<[^>]*>/g, '');
      const duration = formatDuration(parseDuration(item.duration));
      console.log(`${idx + 1}. ${title}`);
      console.log(`   BV: ${item.bvid} | Author: ${item.author} | Duration: ${duration}`);
      console.log(`   Cover: ${item.pic}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test with multiple keywords
(async () => {
  await testSearch('周杰伦');
  await testSearch('Lofi Girl');
  await testSearch('泽野弘之');
})();
