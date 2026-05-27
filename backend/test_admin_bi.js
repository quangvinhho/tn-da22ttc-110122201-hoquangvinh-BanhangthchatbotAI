// Use global fetch API instead of node-fetch

async function testAdminBI() {
  const url = 'http://127.0.0.1:8000/api/admin-chat';
  
  console.log('--- TEST 1: Sản phẩm sắp hết hàng (tồn kho < 5) ---');
  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Cho tôi biết những sản phẩm nào sắp hết hàng (dưới 5 cái)?' })
    });
    const data1 = await res1.json();
    console.log('Status:', res1.status);
    console.log('AI Response:\n', data1.response);
  } catch (err) {
    console.error('Error in Test 1:', err);
  }

  console.log('\n--- TEST 2: Tổng kết doanh thu hôm nay ---');
  try {
    const res2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Tổng hợp doanh thu tuần này?' })
    });
    const data2 = await res2.json();
    console.log('Status:', res2.status);
    console.log('AI Response:\n', data2.response);
  } catch (err) {
    console.error('Error in Test 2:', err);
  }
}

testAdminBI();
