(async () => {
    try {
        const response = await fetch('http://127.0.0.1:8000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'samsung', history: [] })
        });
        const data = await response.text();
        console.log('Status:', response.status);
        console.log('Body:', data);
    } catch(e) {
        console.error(e);
    }
})();
