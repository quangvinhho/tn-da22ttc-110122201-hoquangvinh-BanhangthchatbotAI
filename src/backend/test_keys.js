const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.0-flash';

async function testGroqKey(key, name) {
  if (!key) {
    console.log(`[-] ${name}: Không được cấu hình trong .env`);
    return;
  }
  
  console.log(`[*] Đang thử ${name} (${key.substring(0, 8)}...)...`);
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[+] ${name}: HOẠT ĐỘNG TỐT! Response: "${data.choices?.[0]?.message?.content?.trim()}"`);
    } else {
      const errText = await response.text();
      console.log(`[x] ${name}: LỖI (${response.status}) - ${errText}`);
    }
  } catch (err) {
    console.log(`[x] ${name}: EXCEPTION - ${err.message}`);
  }
}

async function testGeminiKey(key) {
  if (!key) {
    console.log(`[-] GEMINI_API_KEY: Không được cấu hình trong .env`);
    return;
  }

  console.log(`[*] Đang thử GEMINI_API_KEY (${key.substring(0, 8)}...)...`);
  try {
    let apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const apiHeaders = { 'Content-Type': 'application/json' };

    const cleanKey = key.trim();
    if (cleanKey.startsWith('ya29.') || cleanKey.startsWith('AQ.')) {
      apiHeaders['Authorization'] = `Bearer ${cleanKey}`;
    } else {
      apiUrl += `?key=${cleanKey}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`[+] GEMINI_API_KEY: HOẠT ĐỘNG TỐT! Response: "${text?.trim()}"`);
    } else {
      const errText = await response.text();
      console.log(`[x] GEMINI_API_KEY: LỖI (${response.status}) - ${errText}`);
    }
  } catch (err) {
    console.log(`[x] GEMINI_API_KEY: EXCEPTION - ${err.message}`);
  }
}

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM TRA CÁC API KEY ===\n');
  
  // Test các key Groq được phát hiện trong env
  const envKeys = Object.keys(process.env).filter(k => k.startsWith('GROQ_API_KEY')).sort();
  
  for (const envKey of envKeys) {
    const val = process.env[envKey];
    if (val) {
      const keysSplit = val.split(',').map(k => k.trim()).filter(Boolean);
      for (let i = 0; i < keysSplit.length; i++) {
        const displayName = keysSplit.length > 1 ? `${envKey} (Index ${i})` : envKey;
        await testGroqKey(keysSplit[i], displayName);
      }
    }
  }

  if (envKeys.length === 0) {
    await testGroqKey(null, 'GROQ_API_KEY');
  }
  
  console.log('');
  // Test key Gemini
  await testGeminiKey(process.env.GEMINI_API_KEY);
  
  console.log('\n=== KẾT THÚC KIỂM TRA ===');
}

runTests();
