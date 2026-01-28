// Test shuffle logic
function testShuffle() {
  const playlist = Array.from({ length: 10 }, (_, i) => i);
  let currentIndex = 0;
  const results = new Set();
  
  console.log('Testing shuffle with 10-item playlist...\n');
  console.log('Current index:', currentIndex);
  console.log('Running 20 iterations to test randomness:\n');
  
  for (let i = 0; i < 20; i++) {
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } while (nextIndex === currentIndex && playlist.length > 1);
    
    results.add(nextIndex);
    console.log(`Iteration ${i + 1}: Next index = ${nextIndex}`);
    currentIndex = nextIndex;
  }
  
  console.log(`\n✅ Unique indices visited: ${results.size} out of ${playlist.length}`);
  console.log('❌ Never returned to same index consecutively');
  
  if (results.size >= playlist.length * 0.8) {
    console.log('\n✅ Shuffle test PASSED - Good randomness!');
  } else {
    console.log('\n⚠️  Warning: Low diversity in shuffle');
  }
}

testShuffle();
