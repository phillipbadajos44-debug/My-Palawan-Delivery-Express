async function sendPrompt() {
    const input = document.getElementById("prompt");
    const chat = document.getElementById("chat");

    const prompt = input.value.trim();

    if (!prompt) return;

    chat.innerHTML += `
        <div class="user">${prompt}</div>
    `;

    input.value = "";

    const loading = document.createElement("div");
    loading.className = "ai";
    loading.innerHTML = "⏳ Thinking...";
    chat.appendChild(loading);

    chat.scrollTop = chat.scrollHeight;

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();

        loading.innerHTML = data.reply || "No response.";
    } catch (error) {
        loading.innerHTML = "❌ Error connecting to AI.";
        console.error(error);
    }

    chat.scrollTop = chat.scrollHeight;
}
