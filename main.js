const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreElement = document.getElementById('current-score');
const highScoreElement = document.getElementById('high-score');
const startOverlay = document.getElementById('start-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const finalScoreElement = document.getElementById('final-score-value');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
const nextLevelBtn = document.getElementById('next-level-btn');
const levelTransitionOverlay = document.getElementById('level-transition-overlay');
const transitionLevelNum = document.getElementById('transition-level-num');

speedSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    if (v === 1) speedDisplay.textContent = 'Slow';
    if (v === 2) speedDisplay.textContent = 'Normal';
    if (v === 3) speedDisplay.textContent = 'Fast';
});

// Game constants
const CELL_SIZE = 20;
const GRID_WIDTH = canvas.width / CELL_SIZE;
const GRID_HEIGHT = canvas.height / CELL_SIZE;

// Colors
const SNAKE_HEAD_COLOR = '#ff007f'; // Pink
const SNAKE_BODY_COLOR = '#8a2be2'; // Purple
const FOOD_COLOR = '#00f3ff';       // Cyan
const OBSTACLE_COLOR = '#4a0e4e';   // Dark purple/red

// Game state
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let obstacles = [];
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let currentLevel = 1;
let foodsEatenInLevel = 0;
const FOODS_PER_LEVEL = 5;
const levelElement = document.getElementById('current-level');
let baseSpeed = 150; // ms per frame initially
let currentSpeed = baseSpeed;
let lastRenderTime = 0;
let isGameOver = false;
let isPlaying = false;
let animationFrameId;

highScoreElement.textContent = highScore;

function initGame() {
    snake = [
        { x: 10, y: 15 },
        { x: 9, y: 15 },
        { x: 8, y: 15 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    obstacles = [];
    currentLevel = 1;
    foodsEatenInLevel = 0;
    if (levelElement) levelElement.textContent = currentLevel;

    const sliderVal = parseInt(speedSlider.value);
    if (sliderVal === 1) baseSpeed = 250;
    else if (sliderVal === 2) baseSpeed = 150;
    else if (sliderVal === 3) baseSpeed = 80;

    currentSpeed = baseSpeed;
    isGameOver = false;
    updateScoreDisplay();
    spawnFood();
}

function spawnFood() {
    let validPosition = false;
    while (!validPosition) {
        food = {
            x: Math.floor(Math.random() * GRID_WIDTH),
            y: Math.floor(Math.random() * GRID_HEIGHT)
        };
        // Check if food spawns on snake or obstacles
        validPosition = !snake.some(segment => segment.x === food.x && segment.y === food.y) &&
                        !obstacles.some(obs => obs.x === food.x && obs.y === food.y);
    }
}

function spawnObstacle() {
    let validPosition = false;
    let attempts = 0;
    while (!validPosition && attempts < 100) {
        let obs = {
            x: Math.floor(Math.random() * GRID_WIDTH),
            y: Math.floor(Math.random() * GRID_HEIGHT)
        };
        
        // Prevent spawning an obstacle on snake, food, or in front of snake head
        let head = snake[0];
        let inFront = { x: head.x + direction.x, y: head.y + direction.y };
        // wrap in front
        inFront.x = (inFront.x + GRID_WIDTH) % GRID_WIDTH;
        inFront.y = (inFront.y + GRID_HEIGHT) % GRID_HEIGHT;

        validPosition = !snake.some(segment => segment.x === obs.x && segment.y === obs.y) &&
                        !(food.x === obs.x && food.y === obs.y) &&
                        !(inFront.x === obs.x && inFront.y === obs.y) &&
                        !obstacles.some(existing => existing.x === obs.x && existing.y === obs.y);
        
        if (validPosition) {
            obstacles.push(obs);
        }
        attempts++;
    }
}

window.addEventListener('keydown', e => {
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            if (direction.y === 0) nextDirection = { x: 0, y: -1 };
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            if (direction.y === 0) nextDirection = { x: 0, y: 1 };
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (direction.x === 0) nextDirection = { x: -1, y: 0 };
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            if (direction.x === 0) nextDirection = { x: 1, y: 0 };
            break;
    }
});

function update() {
    if (isGameOver) return;

    direction = nextDirection;
    
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    // Wall Wrapping
    head.x = (head.x + GRID_WIDTH) % GRID_WIDTH;
    head.y = (head.y + GRID_HEIGHT) % GRID_HEIGHT;

    // Check collision with self
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        triggerGameOver();
        return;
    }

    // Check collision with obstacles
    if (obstacles.some(obs => obs.x === head.x && obs.y === head.y)) {
        triggerGameOver();
        return;
    }

    snake.unshift(head);

    // Check food consumption
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        updateScoreDisplay();
        
        foodsEatenInLevel++;
        if (foodsEatenInLevel >= FOODS_PER_LEVEL) {
            levelUp();
        }

        spawnFood();
    } else {
        snake.pop(); // Remove tail
    }
}

function triggerGameOver() {
    isGameOver = true;
    isPlaying = false;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        highScoreElement.textContent = highScore;
    }
    
    finalScoreElement.textContent = score;
    gameOverOverlay.classList.remove('hidden');
    gameOverOverlay.classList.add('active');
}

function levelUp() {
    currentLevel++;
    foodsEatenInLevel = 0;
    if (levelElement) levelElement.textContent = currentLevel;
    
    // Speed up upon leveling up
    if (currentSpeed > 50) {
        currentSpeed -= 15;
    }

    isPlaying = false;
    
    if (levelTransitionOverlay) {
        transitionLevelNum.textContent = currentLevel;
        levelTransitionOverlay.classList.remove('hidden');
        levelTransitionOverlay.classList.add('active');
    }
}

function updateScoreDisplay() {
    scoreElement.textContent = score;
    
    // Add pop animation class
    scoreElement.classList.remove('pop');
    void scoreElement.offsetWidth; // Trigger reflow
    scoreElement.classList.add('pop');
}

function drawRectWithGlow(x, y, color, blur, shadowColor) {
    ctx.fillStyle = color;
    ctx.shadowBlur = blur;
    ctx.shadowColor = shadowColor || color;
    ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    ctx.shadowBlur = 0; // Reset
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw obstacles
    obstacles.forEach(obs => {
        drawRectWithGlow(obs.x, obs.y, OBSTACLE_COLOR, 15, '#ff0000');
    });

    // Draw snake tail (gradient effect)
    for (let i = 1; i < snake.length; i++) {
        const opacity = 1 - (i / (snake.length * 2)); // Fading tail
        const color = `rgba(138, 43, 226, ${opacity})`;
        drawRectWithGlow(snake[i].x, snake[i].y, color, 10, SNAKE_BODY_COLOR);
    }
    
    // Draw snake head
    drawRectWithGlow(snake[0].x, snake[0].y, SNAKE_HEAD_COLOR, 20, SNAKE_HEAD_COLOR);

    // Draw food with pulsing radius
    const time = Date.now() / 200;
    const pulseBlur = 15 + Math.sin(time) * 5;
    
    // Draw food as circle
    ctx.fillStyle = FOOD_COLOR;
    ctx.shadowBlur = pulseBlur;
    ctx.shadowColor = FOOD_COLOR;
    ctx.beginPath();
    ctx.arc(
        food.x * CELL_SIZE + CELL_SIZE / 2, 
        food.y * CELL_SIZE + CELL_SIZE / 2, 
        (CELL_SIZE / 2) - 2, 
        0, 
        Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;
}

function gameLoop(currentTime) {
    if (isPlaying) {
        animationFrameId = requestAnimationFrame(gameLoop);
        
        const secondsSinceLastRender = (currentTime - lastRenderTime);
        if (secondsSinceLastRender < currentSpeed) {
            return;
        }

        lastRenderTime = currentTime;
        
        update();
        draw();
    }
}

function startGame() {
    initGame();
    startOverlay.classList.remove('active');
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.remove('active');
    gameOverOverlay.classList.add('hidden');
    
    isPlaying = true;
    lastRenderTime = window.performance.now();
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
    gameOverOverlay.classList.remove('active');
    gameOverOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    startOverlay.classList.add('active');
});

function startNextLevel() {
    // Reset snake
    snake = [
        { x: 10, y: 15 },
        { x: 9, y: 15 },
        { x: 8, y: 15 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    
    // Set level obstacles
    obstacles = [];
    for (let i = 0; i < currentLevel; i++) {
        spawnObstacle();
    }
    
    spawnFood();
    
    levelTransitionOverlay.classList.remove('active');
    levelTransitionOverlay.classList.add('hidden');
    
    isPlaying = true;
    lastRenderTime = window.performance.now();
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
}

if (nextLevelBtn) {
    nextLevelBtn.addEventListener('click', startNextLevel);
}

// Draw initial state behind start menu
initGame();
draw();
