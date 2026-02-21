"use client";

import { useRef, useEffect, useCallback } from "react";

const CANVAS_W = 400;
const CANVAS_H = 150;
const GROUND_Y = 130;

const DINO_X = 50;
const DINO_W = 20;
const DINO_H = 24;

const JUMP_VELOCITY = -10;
const GRAVITY = 0.6;

const INITIAL_SPEED = 3;
const MAX_SPEED = 8;
const SPEED_INCREMENT = 0.001;

const MIN_SPAWN_GAP = 80;
const MAX_SPAWN_GAP = 150;

interface Obstacle {
  x: number;
  width: number;
  height: number;
}

interface GameState {
  dinoY: number;
  dinoVelocity: number;
  isJumping: boolean;
  obstacles: Obstacle[];
  score: number;
  frameCount: number;
  speed: number;
  isGameOver: boolean;
  groundOffset: number;
  nextSpawnFrame: number;
}

function createInitialState(): GameState {
  return {
    dinoY: 0,
    dinoVelocity: 0,
    isJumping: false,
    obstacles: [],
    score: 0,
    frameCount: 0,
    speed: INITIAL_SPEED,
    isGameOver: false,
    groundOffset: 0,
    nextSpawnFrame: 60,
  };
}

function getColors(isDark: boolean) {
  return isDark
    ? { bg: "#1a1a1a", fg: "#fafafa", muted: "#a3a3a3", border: "#333333" }
    : { bg: "#ffffff", fg: "#1a1a1a", muted: "#8a8a8a", border: "#e5e5e5" };
}

export function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const rafRef = useRef<number>(0);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s.isGameOver) {
      stateRef.current = createInitialState();
      return;
    }
    if (!s.isJumping) {
      s.dinoVelocity = JUMP_VELOCITY;
      s.isJumping = true;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.scale(dpr, dpr);

    const isDark =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const colors = getColors(isDark);

    function spawnObstacle(s: GameState) {
      const isTall = Math.random() > 0.5;
      s.obstacles.push({
        x: CANVAS_W + 10,
        width: isTall ? 10 + Math.random() * 4 : 12 + Math.random() * 6,
        height: isTall ? 30 + Math.random() * 15 : 18 + Math.random() * 12,
      });
      s.nextSpawnFrame =
        s.frameCount +
        Math.floor(
          MIN_SPAWN_GAP + Math.random() * (MAX_SPAWN_GAP - MIN_SPAWN_GAP)
        );
    }

    function update(s: GameState) {
      if (s.isGameOver) return;

      s.frameCount++;

      // Dino physics
      if (s.isJumping) {
        s.dinoVelocity += GRAVITY;
        s.dinoY += s.dinoVelocity;
        if (s.dinoY >= 0) {
          s.dinoY = 0;
          s.dinoVelocity = 0;
          s.isJumping = false;
        }
      }

      // Move obstacles
      for (const obs of s.obstacles) {
        obs.x -= s.speed;
      }
      s.obstacles = s.obstacles.filter((o) => o.x > -30);

      // Spawn
      if (s.frameCount >= s.nextSpawnFrame) {
        spawnObstacle(s);
      }

      // Collision
      const dinoBottom = GROUND_Y - Math.abs(s.dinoY);
      const dinoTop = dinoBottom - DINO_H;
      const dinoRight = DINO_X + DINO_W;

      for (const obs of s.obstacles) {
        const obsTop = GROUND_Y - obs.height;
        const obsRight = obs.x + obs.width;
        if (
          DINO_X < obsRight &&
          dinoRight > obs.x &&
          dinoTop < GROUND_Y &&
          dinoBottom > obsTop
        ) {
          s.isGameOver = true;
          break;
        }
      }

      // Score
      if (s.frameCount % 6 === 0) {
        s.score++;
      }

      // Speed up
      s.speed = Math.min(MAX_SPEED, s.speed + SPEED_INCREMENT);

      // Ground scroll
      s.groundOffset = (s.groundOffset + s.speed) % 20;
    }

    function draw(s: GameState) {
      if (!ctx) return;

      // Background
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Ground line
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_W, GROUND_Y);
      ctx.stroke();

      // Ground dashes
      ctx.fillStyle = colors.border;
      for (let x = -s.groundOffset; x < CANVAS_W; x += 20) {
        ctx.fillRect(x, GROUND_Y + 3, 6, 1);
      }
      for (let x = 10 - s.groundOffset; x < CANVAS_W; x += 35) {
        ctx.fillRect(x, GROUND_Y + 6, 3, 1);
      }

      // Dino body
      const dinoTop = GROUND_Y - DINO_H - Math.abs(s.dinoY);
      ctx.fillStyle = colors.fg;
      // Body
      ctx.fillRect(DINO_X, dinoTop, DINO_W, DINO_H);
      // Head bump
      ctx.fillRect(DINO_X + 10, dinoTop - 4, 10, 6);
      // Eye
      ctx.fillStyle = colors.bg;
      ctx.fillRect(DINO_X + 16, dinoTop - 2, 2, 2);
      // Legs (alternate)
      ctx.fillStyle = colors.fg;
      if (s.isGameOver || s.frameCount % 12 < 6) {
        ctx.fillRect(DINO_X + 3, dinoTop + DINO_H, 4, 6);
        ctx.fillRect(DINO_X + 12, dinoTop + DINO_H, 4, 6);
      } else {
        ctx.fillRect(DINO_X + 5, dinoTop + DINO_H, 4, 6);
        ctx.fillRect(DINO_X + 14, dinoTop + DINO_H, 4, 6);
      }
      // Tail
      ctx.fillRect(DINO_X - 6, dinoTop + 4, 6, 4);

      // Obstacles (cacti)
      for (const obs of s.obstacles) {
        const obsTop = GROUND_Y - obs.height;
        ctx.fillStyle = colors.muted;
        // Main trunk
        ctx.fillRect(obs.x, obsTop, obs.width, obs.height);
        // Cactus arms
        if (obs.height > 25) {
          ctx.fillRect(obs.x - 4, obsTop + 8, 4, 3);
          ctx.fillRect(obs.x - 4, obsTop + 5, 2, 6);
          ctx.fillRect(obs.x + obs.width, obsTop + 14, 4, 3);
          ctx.fillRect(obs.x + obs.width + 2, obsTop + 11, 2, 6);
        }
      }

      // Score
      ctx.fillStyle = colors.fg;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${String(s.score).padStart(5, "0")}`, CANVAS_W - 10, 20);

      // Game over
      if (s.isGameOver) {
        ctx.fillStyle =
          isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.5)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = colors.fg;
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", CANVAS_W / 2, 60);

        ctx.font = "12px sans-serif";
        ctx.fillText(
          `Score: ${s.score}  |  Tap or Space to restart`,
          CANVAS_W / 2,
          85
        );
      }
    }

    function loop() {
      const s = stateRef.current;
      update(s);
      draw(s);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [jump]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-auto cursor-pointer"
      style={{ imageRendering: "pixelated" }}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={jump}
      onTouchStart={(e) => {
        e.preventDefault();
        jump();
      }}
    />
  );
}
