/**
 * Direct WebSocket test for DebateForge debate flow.
 * Tests: JWT auth → create debate → join via WS → send text → receive AI response
 */
const { io } = require('socket.io-client');
const axios = require('axios');

const API = 'http://localhost:5001';

async function test() {
  console.log('=== DebateForge E2E WebSocket Test ===\n');

  // Step 1: Login or register
  console.log('1. Authenticating...');
  let token;
  const dynUser = 'DebateTest_' + Date.now();
  try {
    const regRes = await axios.post(`${API}/api/auth/register`, {
      username: dynUser,
      email: `${dynUser}@test.com`,
      password: 'testtest123',
      role: 'student'
    });
    token = regRes.data.token;
    console.log(`   ✅ Registered new user: ${dynUser}`);
  } catch (e2) {
    console.error('   ❌ Auth failed:', e2.response?.data || e2.message);
    process.exit(1);
  }

  // Step 2: Create a debate via POST /api/debates/start
  console.log('\n2. Creating a debate...');
  let debateId;
  try {
    const debateRes = await axios.post(`${API}/api/debates/start`, {
      customTopic: 'Technology is beneficial for education',
      side: 'for',
      difficulty: 'beginner',
      format: 'freeform'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    debateId = debateRes.data.debateId;
    console.log('   ✅ Debate created:', debateId);
    console.log('   Topic:', debateRes.data.topicSnapshot);
  } catch (e) {
    console.error('   ❌ Create debate failed:', e.response?.data || e.message);
    process.exit(1);
  }

  // Step 3: Connect via WebSocket
  console.log('\n3. Connecting via WebSocket...');
  const socket = io(API, {
    transports: ['websocket'],
    auth: { token },
    timeout: 10000,
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('\n   ⏰ Timeout after 60s — AI did not respond');
      socket.disconnect();
      resolve();
    }, 60000);

    socket.on('connect', () => {
      console.log('   ✅ WebSocket connected (id:', socket.id + ')');
      console.log('\n4. Joining debate...');
      socket.emit('join_debate', { debateId });
    });

    socket.on('debate_joined', (data) => {
      console.log('   ✅ Joined! Topic:', data.topic, '| Side:', data.userSide, '| AI:', data.aiPosition);

      // Wait a beat then send text
      setTimeout(() => {
        console.log('\n5. Sending text argument...');
        socket.emit('transcript_direct', {
          debateId,
          text: 'Technology improves education by making knowledge accessible to everyone around the world.'
        });
        console.log('   ✅ Argument sent, waiting for AI...\n');
      }, 500);
    });

    socket.on('ai_thinking', () => {
      console.log('   🤔 AI is thinking...');
    });

    let aiText = '';
    socket.on('ai_text_chunk', (data) => {
      aiText += data.text;
      process.stdout.write(data.text);
    });

    socket.on('ai_turn_complete', (data) => {
      console.log('\n\n   ✅✅✅ AI RESPONDED SUCCESSFULLY! ✅✅✅');
      console.log('   AI text length:', aiText.length, 'chars');
      console.log('   Next round:', data.round);
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    });

    socket.on('scores_update', (data) => {
      console.log('   📊 Scores:', JSON.stringify(data).slice(0, 100));
    });

    socket.on('fallacy_detected', (data) => {
      console.log('   ⚠️ Fallacy:', data.fallacy_type);
    });

    socket.on('error', (data) => {
      console.log('   ❌ Server error:', JSON.stringify(data));
    });

    socket.on('connect_error', (err) => {
      console.log('   ❌ Connection error:', err.message);
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    });

    socket.on('disconnect', (reason) => {
      console.log('   🔌 Disconnected:', reason);
    });
  });
}

test().then(() => {
  console.log('\n=== Test Complete ===');
  process.exit(0);
}).catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
