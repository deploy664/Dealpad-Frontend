console.log("🔥 main.js loaded");

// 1️⃣ Get agent ID
const agentId = localStorage.getItem("agentId");
if (!agentId) {
    window.location.href = "login.html";
}

const socket = window.socket;

// DOM Elements
const customerList = document.getElementById("customerList");
const chatBox = document.getElementById("chatBox");
const customerName = document.getElementById("customerName");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const recordBtn = document.getElementById("recordBtn");

let activeCustomer = null;

// ======================================================
// ⭐ AUTO-ADD NEW CUSTOMER IF NOT EXISTS
// ======================================================
function addCustomerIfNotExists(number) {
    let exists = Array.from(customerList.children).some(li => li.textContent === number);
    if (!exists) addCustomer(number, number);
}

// ======================================================
// 🔥 LOAD ASSIGNED CUSTOMERS
// ======================================================
fetch(`https://dealpad-backend-1.onrender.com/agent/customers?agentId=${agentId}`)
    .then(res => res.json())
    .then(customers => {
        if (!customers || customers.length === 0) {
            customerName.textContent = "No customers assigned yet";
            return;
        }

        customers.forEach(c => addCustomer(c.number, c.number));

        const first = customers[0];
        activeCustomer = first.number;
        customerName.textContent = first.number;

        socket.emit("load_messages", first.number);
    });

function addCustomer(name, number) {
    const li = document.createElement("li");
    li.textContent = name;
    li.onclick = () => selectCustomer(name, number);
    customerList.appendChild(li);
}

function selectCustomer(name, number) {
    activeCustomer = number;
    customerName.textContent = name;

    chatBox.innerHTML = "";
    socket.emit("load_messages", number);
}

// ======================================================
// 🚀 SEND TEXT MESSAGE
// ======================================================
sendBtn.onclick = async () => {
    if (!activeCustomer) return;

    const msg = messageInput.value.trim();
    if (!msg) return;

    fetch("https://dealpad-backend-1.onrender.com/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: activeCustomer, message: msg })
    });

    socket.emit("agent_message", { to: activeCustomer, message: msg, agentId });

    showMessage("You", msg, "agent");
    messageInput.value = "";
};

function showMessage(sender, text, type) {
    const div = document.createElement("div");
    div.classList.add("message", type);
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ======================================================
// 📜 LOAD CHAT HISTORY
// ======================================================
socket.on("chat_history", (messages) => {
    chatBox.innerHTML = "";
    messages.forEach(msg => {
        if (msg.fileData && msg.fileType) {
            showFile(msg);
            return;
        }
        if (msg.voiceNote && msg.audioData) {
            showAudio(msg);
            return;
        }
        showMessage(
            msg.sender,
            msg.message || "",
            msg.sender === "agent" ? "agent" : "customer"
        );
    });
});

// ======================================================
// 🔥 REAL incoming messages
// ======================================================
socket.on("incoming_message", (data) => {
    addCustomerIfNotExists(data.from);

    if (!activeCustomer) {
        activeCustomer = data.from;
        customerName.textContent = data.from;
    }

    if (data.from !== activeCustomer) return;

    if (data.fileData && data.fileType) {
        showFile(data);
        return;
    }
    if (data.voiceNote && data.audioData) {
        showAudio(data);
        return;
    }

    showMessage(data.sender === "agent" ? "You" : "Customer", data.message || "", data.sender === "agent" ? "agent" : "customer");
});

// ======================================================
// 📎 FILE UPLOAD
// ======================================================
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file || !activeCustomer) return;

    const reader = new FileReader();
    reader.onload = async () => {
        await fetch("https://dealpad-backend-1.onrender.com/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                to: activeCustomer,
                fileData: reader.result,
                fileName: file.name,
                fileType: file.type,
                isImage: file.type.startsWith("image"),
                isDocument: !file.type.startsWith("image")
            })
        });

        socket.emit("agent_message", {
            to: activeCustomer,
            fileName: file.name,
            fileData: reader.result,
            fileType: file.type,
            agentId
        });

        showFile({
            sender: "agent",
            fileName: file.name,
            fileData: reader.result,
            fileType: file.type
        });
    };

    reader.readAsDataURL(file);
};

function showFile(data) {
    if (!data.fileData && !data.audioData) return;

    const div = document.createElement("div");
    div.classList.add("message", data.sender === "agent" ? "agent" : "customer");

    // WhatsApp stickers (treat as image)
    if (data.fileType && data.fileType.includes("sticker")) {
        const img = document.createElement("img");
        img.src = data.fileData;
        img.style.maxWidth = "120px";
        img.style.borderRadius = "6px";
        div.appendChild(img);
    }
    // Images (base64 or WhatsApp CDN URL)
    else if (data.fileType && data.fileType.startsWith("image")) {
        const img = document.createElement("img");
        img.src = data.fileData;
        img.style.maxWidth = "200px";
        img.style.borderRadius = "6px";
        div.appendChild(img);
    }
    // Audio/voice (base64 or WhatsApp CDN URL)
    else if (data.voiceNote && (data.audioData || data.fileData)) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = data.audioData || data.fileData;
        div.appendChild(audio);
    }
    // Other files (base64 or WhatsApp CDN URL)
    else if (data.fileData && data.fileName) {
        const a = document.createElement("a");
        a.href = data.fileData;
        a.download = data.fileName || "file";
        a.textContent = "📎 " + (data.fileName || "Download File");
        div.appendChild(a);
    }

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ======================================================
// 🎤 VOICE NOTE (FIXED – OGG OPUS)
// ======================================================
let recorder;
let chunks = [];

recordBtn.onclick = async () => {
    if (!activeCustomer) return;

    if (!recorder) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        recorder = new MediaRecorder(stream, {
            mimeType: "audio/ogg; codecs=opus"
        });

        chunks = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: "audio/ogg" });
            chunks = [];

            const formData = new FormData();
            formData.append("audio", blob, "voice.ogg");
            formData.append("to", activeCustomer);
            formData.append("voiceNote", "true");

            await fetch("https://dealpad-backend-1.onrender.com/send-voice", {
                method: "POST",
                body: formData
            });

            const localURL = URL.createObjectURL(blob);

            socket.emit("agent_message", {
                to: activeCustomer,
                voiceNote: true,
                audioData: localURL,
                agentId
            });

            showAudio({ sender: "agent", audioData: localURL });
        };

        recorder.start();
        recordBtn.innerText = "⏹ Stop";
    } else {
        recorder.stop();
        recorder = null;
        recordBtn.innerText = "🎤";
    }
};

// ======================================================
// 🔊 SHOW AUDIO
// ======================================================
function showAudio(data) {
    if (!data.audioData && !data.fileData) return;

    const div = document.createElement("div");
    div.classList.add("message", data.sender === "agent" ? "agent" : "customer");

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = data.audioData || data.fileData;

    div.appendChild(audio);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}
