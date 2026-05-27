(async () => {
    try {
        console.log('--- SECURITY TEST 1: Public user asking for revenue ---');
        const res1 = await fetch('http://localhost:3000/api/chatbot/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Doanh thu cửa hàng hôm nay là bao nhiêu?' })
        });
        const data1 = await res1.json();
        console.log('Status:', res1.status);
        console.log('AI Response:', data1.response);

        console.log('\n--- SECURITY TEST 2: Public user asking for low stock ---');
        const res2 = await fetch('http://localhost:3000/api/chatbot/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Có những điện thoại nào sắp hết hàng không?' })
        });
        const data2 = await res2.json();
        console.log('Status:', res2.status);
        console.log('AI Response:', data2.response);
    } catch(e) {
        console.error('Error during security tests:', e);
    }
})();
