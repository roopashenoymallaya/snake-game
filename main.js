const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreElement = document.getElementById('current-score');
const startOverlay = document.getElementById('start-overlay');
const lobbyOverlay = document.getElementById('lobby-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const finalScoreElement = document.getElementById('final-score-value');
const errorMsg = document.getElementById('error-msg');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startGameBtn = document.getElementById('start-game-btn');
const roomCodeInput = document.getElementById('room-code-input');
const lobbyRoomCode = document.getElementById('lobby-room-code');
const playersList = document.getElementById('players-list');
const restartBtn = document.getElementById('restart-btn');
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');

if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        if (v === 1) speedDisplay.textContent = 'Slow';
        if (v === 2) speedDisplay.textContent = 'Normal';
        if (v === 3) speedDisplay.textContent = 'Fast';
    });
}

const CELL_SIZE = 20;
const GRID_WIDTH = canvas.width / CELL_SIZE;
const GRID_HEIGHT = canvas.height / CELL_SIZE;

const FOOD_COLOR = '#00f3ff';       // Cyan
const OBSTACLE_COLOR = '#4a0e4e';   // Dark purple/red

let socket = null;
let currentRoomId = null;
let localSocketId = null;
let gameState = null;
let isPlaying = false;
let isGameOver = false;

async function connectWebSocket() {
    return new Promise((resolve) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
        socket.onopen = () => {
            console.log("Connected to server");
            resolve();
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        };
        
        socket.onclose = () => {
            console.log("Disconnected from server");
        };
    });
}

function handleServerMessage(data) {
    if (data.type === 'roomCreated') {
        currentRoomId = data.roomId;
        lobbyRoomCode.textContent = currentRoomId;
    } else if (data.type === 'roomJoined') {
        currentRoomId = data.state.roomId;
        localSocketId = data.socketId;
        gameState = data.state;
        lobbyRoomCode.textContent = currentRoomId;
        errorMsg.textContent = "";
        
        startOverlay.classList.remove('active');
        startOverlay.classList.add('hidden');
        gameOverOverlay.classList.remove('active');
        gameOverOverlay.classList.add('hidden');
        
        if (gameState.status === 'playing') {
            isPlaying = true;
            lobbyOverlay.classList.remove('active');
            lobbyOverlay.classList.add('hidden');
            errorMsg.textContent = "";
        } else {
            lobbyOverlay.classList.remove('hidden');
            lobbyOverlay.classList.add('active');
        }
        
        updateLobbyPlayers();
    } else if (data.type === 'gameStarted') {
        lobbyOverlay.classList.remove('active');
        lobbyOverlay.classList.add('hidden');
        isPlaying = true;
        isGameOver = false;
        errorMsg.textContent = "";
    } else if (data.type === 'gameUpdate') {
        gameState = data.state;
        if (lobbyOverlay.classList.contains('active')) {
            updateLobbyPlayers();
        }
        if (isPlaying) {
            draw();
            updateScoreDisplay();
            checkLocalPlayerStatus();
        }
    } else if (data.type === 'gameOver') {
        if (data.playerId === localSocketId) {
            triggerGameOver();
        }
    } else if (data.type === 'error') {
        errorMsg.textContent = data.message;
    }
}

function updateLobbyPlayers() {
    playersList.innerHTML = '';
    const ids = Object.keys(gameState.players);
    ids.forEach((id, index) => {
        const p = gameState.players[id];
        const div = document.createElement('div');
        div.textContent = `Player ${index + 1} ${id === localSocketId ? '(You)' : ''}`;
        div.style.color = p.color;
        div.style.fontWeight = 'bold';
        div.style.fontSize = '1.2em';
        div.style.margin = '5px 0';
        playersList.appendChild(div);
    });
}

createRoomBtn.addEventListener('click', async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) await connectWebSocket();
    socket.send(JSON.stringify({ type: 'createRoom', speed: speedSlider ? parseInt(speedSlider.value) : 2 }));
});

joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim();
    if (!code) {
        errorMsg.textContent = "Please enter a code";
        return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) await connectWebSocket();
    socket.send(JSON.stringify({ type: 'joinRoom', roomId: code }));
});

startGameBtn.addEventListener('click', () => {
    if (socket) {
        socket.send(JSON.stringify({ type: 'startGame' }));
    }
});

restartBtn.addEventListener('click', () => {
    // Navigate back to lobby creation instead of auto restart since room might be gone
    window.location.reload();
});

window.addEventListener('keydown', e => {
    if (!isPlaying || isGameOver) return;
    
    let dir = null;
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            dir = { x: 0, y: -1 };
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            dir = { x: 0, y: 1 };
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            dir = { x: -1, y: 0 };
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            dir = { x: 1, y: 0 };
            break;
    }
    if (dir && socket) {
        socket.send(JSON.stringify({ type: 'changeDirection', direction: dir }));
    }
});

function drawRectWithGlow(x, y, color, blur, shadowColor) {
    ctx.fillStyle = color;
    ctx.shadowBlur = blur;
    ctx.shadowColor = shadowColor || color;
    ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    ctx.shadowBlur = 0; // Reset
}

function updateScoreDisplay() {
    if (!gameState) return;
    const p = gameState.players[localSocketId];
    if (p) {
        scoreElement.textContent = p.score;
        scoreElement.classList.remove('pop');
        void scoreElement.offsetWidth; // Trigger reflow
        scoreElement.classList.add('pop');
    }
}

function checkLocalPlayerStatus() {
    if (!gameState || isGameOver) return;
    const p = gameState.players[localSocketId];
    if (p && !p.isAlive) {
        triggerGameOver();
    }
}

function triggerGameOver() {
    isGameOver = true;
    isPlaying = false;
    
    if (gameState && gameState.players[localSocketId]) {
        finalScoreElement.textContent = gameState.players[localSocketId].score;
    }
    
    gameOverOverlay.classList.remove('hidden');
    gameOverOverlay.classList.add('active');
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState) return;

    // Draw obstacles
    gameState.obstacles.forEach(obs => {
        drawRectWithGlow(obs.x, obs.y, OBSTACLE_COLOR, 15, '#ff0000');
    });

    // Draw snake for each player
    Object.values(gameState.players).forEach(p => {
        if (!p.isAlive) return;
        
        const snake = p.snake;
        const color = p.color;
        
        // Draw snake tail (gradient effect)
        for (let i = 1; i < snake.length; i++) {
            const opacity = Math.max(0.2, 1 - (i / (snake.length * 2))); 
            // Instead of parsing hex to rgba manually, we just set globalAlpha
            ctx.globalAlpha = opacity;
            drawRectWithGlow(snake[i].x, snake[i].y, color, 10, color);
            ctx.globalAlpha = 1.0;
        }
        
        // Draw snake head
        if(snake.length > 0) {
            drawRectWithGlow(snake[0].x, snake[0].y, color, 20, '#ffffff');
        }
    });

    // Draw food with pulsing radius
    const time = Date.now() / 200;
    const pulseBlur = 15 + Math.sin(time) * 5;
    
    ctx.fillStyle = FOOD_COLOR;
    ctx.shadowBlur = pulseBlur;
    ctx.shadowColor = FOOD_COLOR;
    ctx.beginPath();
    ctx.arc(
        gameState.food.x * CELL_SIZE + CELL_SIZE / 2, 
        gameState.food.y * CELL_SIZE + CELL_SIZE / 2, 
        (CELL_SIZE / 2) - 2, 
        0, 
        Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;
}

// Draw initial empty grid or default state
draw();
