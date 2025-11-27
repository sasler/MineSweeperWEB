"use strict";
// Minesweeper Game - Modern Edition
// TypeScript implementation with animations and sound effects
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.isMuted = false;
        this.initAudioContext();
    }
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (this.isMuted || !this.audioContext)
            return;
        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }
    playClick() {
        this.playTone(800, 0.05, 'square', 0.1);
    }
    playReveal() {
        this.playTone(600, 0.1, 'sine', 0.15);
    }
    playRevealEmpty() {
        // Pleasant chord for empty cell cascade
        this.playTone(523.25, 0.15, 'sine', 0.1); // C5
        setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.1), 30); // E5
        setTimeout(() => this.playTone(783.99, 0.15, 'sine', 0.1), 60); // G5
    }
    playFlag() {
        this.playTone(440, 0.1, 'triangle', 0.2);
        setTimeout(() => this.playTone(550, 0.1, 'triangle', 0.2), 50);
    }
    playUnflag() {
        this.playTone(550, 0.1, 'triangle', 0.2);
        setTimeout(() => this.playTone(440, 0.1, 'triangle', 0.2), 50);
    }
    playExplosion() {
        if (this.isMuted || !this.audioContext)
            return;
        // White noise for explosion
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.audioContext.createBufferSource();
        whiteNoise.buffer = buffer;
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
        whiteNoise.start(this.audioContext.currentTime);
        whiteNoise.stop(this.audioContext.currentTime + 0.5);
        // Low boom
        this.playTone(60, 0.5, 'sine', 0.5);
    }
    playWin() {
        // Victory fanfare
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((note, i) => {
            setTimeout(() => this.playTone(note, 0.3, 'sine', 0.2), i * 150);
        });
    }
    playGameOver() {
        // Sad descending tone
        const notes = [392, 349.23, 311.13, 261.63]; // G4, F4, Eb4, C4
        notes.forEach((note, i) => {
            setTimeout(() => this.playTone(note, 0.3, 'sawtooth', 0.1), i * 200);
        });
    }
}
class Minesweeper {
    constructor() {
        this.board = [];
        this.rows = 9;
        this.cols = 9;
        this.mines = 10;
        this.minesLeft = 10;
        this.isGameOver = false;
        this.isFirstClick = true;
        this.timer = 0;
        this.timerInterval = null;
        this.revealedCount = 0;
        this.totalNonMines = 0;
        this.difficulties = {
            easy: { rows: 9, cols: 9, mines: 10 },
            medium: { rows: 16, cols: 16, mines: 40 },
            hard: { rows: 16, cols: 30, mines: 99 }
        };
        this.soundManager = new SoundManager();
        this.boardElement = document.getElementById('game-board');
        this.minesLeftElement = document.getElementById('mines-left');
        this.timerElement = document.getElementById('timer');
        this.faceElement = document.getElementById('face-emoji');
        this.overlayElement = document.getElementById('game-overlay');
        this.initEventListeners();
        this.createParticles();
        this.newGame();
    }
    initEventListeners() {
        // Difficulty buttons
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const difficulty = target.dataset.difficulty;
                document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                this.setDifficulty(difficulty);
                this.soundManager.playClick();
            });
        });
        // New game button
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.newGame();
            this.soundManager.playClick();
        });
        // Play again button
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.hideOverlay();
            this.newGame();
            this.soundManager.playClick();
        });
        // Sound toggle
        document.getElementById('sound-toggle').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isMuted = this.soundManager.toggleMute();
            btn.classList.toggle('muted', isMuted);
        });
        // Prevent context menu on board
        this.boardElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    setDifficulty(difficulty) {
        const diff = this.difficulties[difficulty];
        this.rows = diff.rows;
        this.cols = diff.cols;
        this.mines = diff.mines;
        this.newGame();
    }
    newGame() {
        this.stopTimer();
        this.timer = 0;
        this.isGameOver = false;
        this.isFirstClick = true;
        this.minesLeft = this.mines;
        this.revealedCount = 0;
        this.totalNonMines = this.rows * this.cols - this.mines;
        this.updateDisplay();
        this.faceElement.textContent = '😊';
        this.hideOverlay();
        this.initBoard();
        this.renderBoard();
    }
    initBoard() {
        this.board = [];
        for (let row = 0; row < this.rows; row++) {
            this.board[row] = [];
            for (let col = 0; col < this.cols; col++) {
                this.board[row][col] = {
                    row,
                    col,
                    isMine: false,
                    isRevealed: false,
                    isFlagged: false,
                    adjacentMines: 0
                };
            }
        }
    }
    placeMines(excludeRow, excludeCol) {
        let minesPlaced = 0;
        const excludeZone = this.getAdjacentCells(excludeRow, excludeCol);
        excludeZone.push({ row: excludeRow, col: excludeCol });
        while (minesPlaced < this.mines) {
            const row = Math.floor(Math.random() * this.rows);
            const col = Math.floor(Math.random() * this.cols);
            // Check if this cell is in the exclude zone
            const isExcluded = excludeZone.some(cell => cell.row === row && cell.col === col);
            if (!this.board[row][col].isMine && !isExcluded) {
                this.board[row][col].isMine = true;
                minesPlaced++;
            }
        }
        this.calculateAdjacentMines();
    }
    calculateAdjacentMines() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (!this.board[row][col].isMine) {
                    const adjacent = this.getAdjacentCells(row, col);
                    this.board[row][col].adjacentMines = adjacent.filter(cell => cell.isMine).length;
                }
            }
        }
    }
    getAdjacentCells(row, col) {
        const cells = [];
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols && !(r === row && c === col)) {
                    cells.push(this.board[r][c]);
                }
            }
        }
        return cells;
    }
    renderBoard() {
        this.boardElement.innerHTML = '';
        this.boardElement.style.gridTemplateColumns = `repeat(${this.cols}, 35px)`;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const cellElement = document.createElement('div');
                cellElement.className = 'cell';
                cellElement.dataset.row = row.toString();
                cellElement.dataset.col = col.toString();
                cellElement.addEventListener('click', (e) => this.handleClick(e));
                cellElement.addEventListener('contextmenu', (e) => this.handleRightClick(e));
                cellElement.addEventListener('mousedown', () => {
                    if (!this.isGameOver)
                        this.faceElement.textContent = '😮';
                });
                cellElement.addEventListener('mouseup', () => {
                    if (!this.isGameOver)
                        this.faceElement.textContent = '😊';
                });
                cellElement.addEventListener('mouseleave', () => {
                    if (!this.isGameOver)
                        this.faceElement.textContent = '😊';
                });
                this.boardElement.appendChild(cellElement);
            }
        }
    }
    handleClick(e) {
        if (this.isGameOver)
            return;
        const target = e.target;
        const row = parseInt(target.dataset.row);
        const col = parseInt(target.dataset.col);
        const cell = this.board[row][col];
        if (cell.isFlagged || cell.isRevealed)
            return;
        if (this.isFirstClick) {
            this.isFirstClick = false;
            this.placeMines(row, col);
            this.startTimer();
        }
        this.revealCell(row, col);
    }
    handleRightClick(e) {
        e.preventDefault();
        if (this.isGameOver)
            return;
        const target = e.target;
        const row = parseInt(target.dataset.row);
        const col = parseInt(target.dataset.col);
        const cell = this.board[row][col];
        if (cell.isRevealed)
            return;
        cell.isFlagged = !cell.isFlagged;
        this.minesLeft += cell.isFlagged ? -1 : 1;
        if (cell.isFlagged) {
            this.soundManager.playFlag();
        }
        else {
            this.soundManager.playUnflag();
        }
        this.updateCellDisplay(row, col);
        this.updateDisplay();
    }
    revealCell(row, col, isChain = false) {
        const cell = this.board[row][col];
        if (cell.isRevealed || cell.isFlagged)
            return;
        cell.isRevealed = true;
        this.revealedCount++;
        if (cell.isMine) {
            this.gameOver(row, col);
            return;
        }
        if (!isChain) {
            this.soundManager.playReveal();
        }
        this.updateCellDisplay(row, col);
        if (cell.adjacentMines === 0) {
            if (!isChain) {
                this.soundManager.playRevealEmpty();
            }
            // Reveal adjacent cells with delay for cascade effect
            const adjacent = this.getAdjacentCells(row, col);
            adjacent.forEach((adjCell, index) => {
                setTimeout(() => {
                    this.revealCell(adjCell.row, adjCell.col, true);
                }, index * 20);
            });
        }
        // Check win condition
        if (this.revealedCount === this.totalNonMines) {
            this.win();
        }
    }
    updateCellDisplay(row, col) {
        const cell = this.board[row][col];
        const cellElement = this.boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cellElement)
            return;
        cellElement.className = 'cell';
        if (cell.isFlagged) {
            cellElement.classList.add('flagged');
        }
        else if (cell.isRevealed) {
            cellElement.classList.add('revealed');
            if (cell.isMine) {
                cellElement.classList.add('mine');
            }
            else if (cell.adjacentMines > 0) {
                cellElement.classList.add(`num-${cell.adjacentMines}`);
                cellElement.textContent = cell.adjacentMines.toString();
            }
        }
    }
    gameOver(hitRow, hitCol) {
        this.isGameOver = true;
        this.stopTimer();
        this.faceElement.textContent = '😵';
        this.soundManager.playExplosion();
        // Shake the board
        this.boardElement.classList.add('shake');
        setTimeout(() => this.boardElement.classList.remove('shake'), 500);
        // Reveal all mines with delay
        let delay = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const cell = this.board[row][col];
                if (cell.isMine) {
                    setTimeout(() => {
                        cell.isRevealed = true;
                        this.updateCellDisplay(row, col);
                        if (row === hitRow && col === hitCol) {
                            const cellElement = this.boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                            cellElement?.classList.add('mine-hit');
                        }
                    }, delay);
                    delay += 50;
                }
            }
        }
        setTimeout(() => {
            this.soundManager.playGameOver();
            this.showOverlay(false);
        }, delay + 300);
    }
    win() {
        this.isGameOver = true;
        this.stopTimer();
        this.faceElement.textContent = '😎';
        this.soundManager.playWin();
        // Celebrate animation
        this.boardElement.classList.add('celebrate');
        setTimeout(() => this.boardElement.classList.remove('celebrate'), 500);
        // Create confetti
        this.createConfetti();
        setTimeout(() => {
            this.showOverlay(true);
        }, 500);
    }
    showOverlay(isWin) {
        const overlay = this.overlayElement;
        const icon = document.getElementById('overlay-icon');
        const title = document.getElementById('overlay-title');
        const message = document.getElementById('overlay-message');
        if (isWin) {
            icon.textContent = '🎉';
            title.textContent = 'You Win!';
            message.textContent = `Completed in ${this.timer} seconds!`;
        }
        else {
            icon.textContent = '💥';
            title.textContent = 'Game Over';
            message.textContent = 'Better luck next time!';
        }
        overlay.classList.add('active');
    }
    hideOverlay() {
        this.overlayElement.classList.remove('active');
    }
    updateDisplay() {
        this.minesLeftElement.textContent = this.minesLeft.toString().padStart(3, '0');
        this.timerElement.textContent = this.timer.toString().padStart(3, '0');
    }
    startTimer() {
        this.timerInterval = window.setInterval(() => {
            this.timer++;
            if (this.timer > 999)
                this.timer = 999;
            this.updateDisplay();
        }, 1000);
    }
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    createParticles() {
        const container = document.getElementById('particles');
        const colors = ['#6366f1', '#22d3ee', '#f472b6', '#10b981', '#f59e0b'];
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.animationDelay = `${Math.random() * 15}s`;
            particle.style.animationDuration = `${15 + Math.random() * 10}s`;
            container.appendChild(particle);
        }
    }
    createConfetti() {
        const colors = ['#6366f1', '#22d3ee', '#f472b6', '#10b981', '#f59e0b', '#ef4444'];
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = `${Math.random() * 0.5}s`;
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            if (Math.random() > 0.5) {
                confetti.style.borderRadius = '0';
            }
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 3000);
        }
    }
}
// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Minesweeper();
});
