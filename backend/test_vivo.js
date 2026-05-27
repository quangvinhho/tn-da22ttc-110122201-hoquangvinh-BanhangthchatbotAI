// Native fetch is supported in Node.js v22
// Since modern Node.js versions (v18+) support global fetch, we will try using standard global fetch.
async function test() {
  const url = 'http://localhost:3000/api/chatbot/chat';
  
  console.log('--- TEST 1: Shop có mấy điện thoại vivo? ---');
  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Shop có mấy điện thoại vivo?' })
    });
    const data1 = await res1.json();
    console.log('Status:', res1.status);
    console.log('Response:\n', data1.response);
  } catch (err) {
    console.error('Error in Test 1:', err);
  }

  console.log('\n--- TEST 2: Tổng hợp tất cả mẫu vivo ---');
  try {
    const res2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hãy tổng hợp lại cho tôi biết rõ tất cả mẫu vivo á' })
    });
    const data2 = await res2.json();
    console.log('Status:', res2.status);
    console.log('Response:\n', data2.response);
  } catch (err) {
    console.error('Error in Test 2:', err);
  }
}

test();
