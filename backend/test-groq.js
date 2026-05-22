require('dotenv').config();
(async () => {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: 'test' }]
            })
        });
        const data = await response.text();
        console.log('Status:', response.status);
        console.log('Body:', data);
    } catch(e) {
        console.error(e);
    }
})();
