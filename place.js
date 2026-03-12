import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    onValue,
    get,
    push,
    onDisconnect,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

import { firebaseConfig } from "./canvas.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const canvas = document.getElementById("pixel-canvas");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("color-picker");
const coordText = document.getElementById("coord-text");

const WORLD_W = 304; // 304
const WORLD_H = 304; // 304
const PIXEL_SIZE = 8;

let view = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    zoom: 2,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    moved: false
};

function obfuscateIP(ip) {
    const map = {
        '1': 'h', 
        '2': 'j', 
        '3': 'k', 
        '4': 'l', 
        '5': 'm',
        '6': 'n', 
        '7': 'o', 
        '8': 'p', 
        '9': 'r', 
        '0': 's',
        '.': 'x'
    };
    
    return ip.split('').map(char => map[char] || char).join('');
}

const ipRes = await fetch("https://api.ipify.org?format=json");
const ipData = await ipRes.json();
const rawIp = ipData.ip;
const ip = obfuscateIP(rawIp);

const worldCanvas = document.createElement('canvas');
worldCanvas.width = WORLD_W;
worldCanvas.height = WORLD_H;
const wCtx = worldCanvas.getContext('2d');

wCtx.fillStyle = "#bfbfbf";
wCtx.fillRect(0, 0, WORLD_W, WORLD_H);

const toggledark = document.getElementById("darktoggle");

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("darkmode");
  toggledark.textContent = "Light Mode";
}

toggledark.addEventListener("click", () => {
  document.body.classList.toggle("darkmode");

  const isDark = document.body.classList.contains("darkmode");

  toggledark.textContent = isDark ? "Light Mode" : "Dark Mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

function drawGrid() {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(169, 169, 169, 0.60)";
    ctx.lineWidth = 0.7 / view.zoom;

    for (let x = 0; x <= WORLD_W; x += PIXEL_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_H);
    }

    for (let y = 0; y <= WORLD_H; y += PIXEL_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
    }
    ctx.stroke();
}


function render() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);
    ctx.drawImage(worldCanvas, 0, 0);
    if (view.zoom > 3) drawGrid();
    ctx.restore();

    coordText.innerText = `${Math.floor(view.x / PIXEL_SIZE)}, ${Math.floor(view.y / PIXEL_SIZE)}`;

    requestAnimationFrame(render);
}


function getRawWorldPos(sx, sy) {
    return {
        x: (sx - canvas.width / 2) / view.zoom + view.x,
        y: (sy - canvas.height / 2) / view.zoom + view.y
    };
}

function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const x = (sx - rect.left - canvas.width / 2) / view.zoom + view.x;
    const y = (sy - rect.top - canvas.height / 2) / view.zoom + view.y;
    return { 
        x: Math.floor(x / PIXEL_SIZE), 
        y: Math.floor(y / PIXEL_SIZE) 
    };
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const mouseBefore = getRawWorldPos(e.clientX, e.clientY);
    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
        view.zoom *= (1 + zoomSpeed);
    } else {
        view.zoom /= (1 + zoomSpeed);
    }
    view.zoom = Math.max(0.5, Math.min(view.zoom, 80));
    const mouseAfter = getRawWorldPos(e.clientX, e.clientY);

    view.x += (mouseBefore.x - mouseAfter.x);
    view.y += (mouseBefore.y - mouseAfter.y);
}, { passive: false });

let lastDist = 0;
canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        if (lastDist > 0) {
            const zoomAmount = dist / lastDist;
            const midX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
            const midY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
            const pointBefore = getRawWorldPos(midX, midY);

            view.zoom *= zoomAmount;
            view.zoom = Math.max(0.5, Math.min(view.zoom, 80));

            const pointAfter = getRawWorldPos(midX, midY);
            view.x += (pointBefore.x - pointAfter.x);
            view.y += (pointBefore.y - pointAfter.y);
        }
        lastDist = dist;
    }
}, { passive: false });

canvas.addEventListener('touchend', () => {
    lastDist = 0;
});

canvas.addEventListener('pointerdown', (e) => {
    view.isDragging = true;
    view.moved = false;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    view.startX = e.clientX;
    view.startY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
    if (view.isDragging) {
        const dx = (e.clientX - view.lastX) / view.zoom;
        const dy = (e.clientY - view.lastY) / view.zoom;
        const totalDist = Math.hypot(e.clientX - view.startX, e.clientY - view.startY);
        if (totalDist > 5) {
            view.moved = true;
        }
        let nextX = view.x - dx;
        let nextY = view.y - dy;
        const margin = 0; 
        view.x = Math.max(-margin, Math.min(nextX, WORLD_W + margin));
        view.y = Math.max(-margin, Math.min(nextY, WORLD_H + margin));
        view.lastX = e.clientX;
        view.lastY = e.clientY;
    }
    const pos = screenToWorld(e.clientX, e.clientY);
});

window.addEventListener('pointerup', (e) => {
    if (!view.moved && view.isDragging) {
        const pos = screenToWorld(e.clientX, e.clientY);
        if (pos.x >= 0 && pos.x < WORLD_W / PIXEL_SIZE && pos.y >= 0 && pos.y < WORLD_H / PIXEL_SIZE) {
            const pixelRef = ref(db, `pixels/${pos.x},${pos.y}`);
            set(pixelRef, {
                x: pos.x,
                y: pos.y,
                color: colorPicker.value,
                user: ip,
                time: Date.now()
            });
        }
    }
    view.isDragging = false;
});

onValue(ref(db, "pixels"), (snapshot) => {
    wCtx.fillStyle = "#fff";
    wCtx.fillRect(0, 0, WORLD_W, WORLD_H);
    snapshot.forEach(child => {
        const data = child.val();
        wCtx.fillStyle = data.color;
        wCtx.fillRect(data.x * PIXEL_SIZE, data.y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
    });
});

render();
