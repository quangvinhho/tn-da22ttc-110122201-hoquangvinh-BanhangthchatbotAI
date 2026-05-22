(async () => {
    try {
        const response = await fetch('http://localhost:3000/api/chatbot/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Hello',
                userId: 3,
                conversationId: null
            })
        });
        const data = await response.text();
        console.log('Status:', response.status);
        console.log('Body:', data);
    } catch(e) {
        console.error(e);
    }
})();
