import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";

const MODEL_URL = "/live2d/model.model3.json";

export function Live2DReadmeMinimalPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any | null>(null);
  const loadingRef = useRef(false);
  const [status, setStatus] = useState("not loaded");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const canvas = canvasRef.current;
    if (!canvas || loadingRef.current || appRef.current) {
      return;
    }

    void (async () => {
      try {
        loadingRef.current = true;
        (window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;

        const app = createPixiApplicationWithFallback(canvas);
        appRef.current = app;

        if (!isMounted) {
          destroyPixiApp(app);
          appRef.current = null;
          loadingRef.current = false;
          return;
        }

        setStatus("loading");
        setErrorText(null);

        const model = await Live2DModel.from(MODEL_URL);
        if (!isMounted) {
          model.destroy();
          loadingRef.current = false;
          return;
        }

        modelRef.current = model;
        app.stage.addChild(model);
        model.anchor.set(0.5, 0.5);
        model.position.set(300, 500);
        const scale = Math.min(600 / model.width, 600 / model.height) * 0.8;
        model.scale.set(scale);
        setStatus("loaded");
        loadingRef.current = false;
      } catch (error) {
        console.error("Live2D README minimal test failed:", error);
        if (!isMounted) {
          loadingRef.current = false;
          return;
        }

        setStatus("error");
        setErrorText(getErrorDetails(error));
        destroyPixiApp(appRef.current);
        appRef.current = null;
        modelRef.current = null;
        loadingRef.current = false;
      }
    })();

    return () => {
      isMounted = false;
      destroyPixiApp(appRef.current);
      appRef.current = null;
      modelRef.current = null;
      loadingRef.current = false;
    };
  }, []);

  return (
    <section style={styles.panel} aria-label="Live2D README minimal test">
      <div style={styles.header}>
        <h2 style={styles.title}>Live2D README Minimal Test</h2>
        <span style={styles.statusText}>{status}</span>
      </div>
      <canvas ref={canvasRef} width={600} height={600} style={styles.canvas} />
      <dl style={styles.debugGrid}>
        <DebugItem label="modelUrl" value={MODEL_URL} />
        <DebugItem label="status" value={status} />
      </dl>
      {errorText ? <pre style={styles.errorText}>{errorText}</pre> : null}
    </section>
  );
}

function createPixiApplicationWithFallback(canvas: HTMLCanvasElement) {
  try {
    return new PIXI.Application({
      view: canvas,
      width: 600,
      height: 600,
      backgroundAlpha: 0,
      autoStart: true,
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    } as any);
  } catch (error) {
    console.error("PIXI.Application WebGL creation failed; trying forceCanvas fallback:", error);
    return new PIXI.Application({
      view: canvas,
      width: 600,
      height: 600,
      backgroundAlpha: 0,
      autoStart: true,
      forceCanvas: true,
    } as any);
  }
}

function destroyPixiApp(app: PIXI.Application | null) {
  app?.destroy(true, {
    children: true,
    texture: false,
    baseTexture: false,
  });
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.debugItem}>
      <dt style={styles.debugLabel}>{label}</dt>
      <dd style={styles.debugValue}>{value}</dd>
    </div>
  );
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ""}`.trim();
  }

  return String(error);
}

const styles = {
  panel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0,
  },
  statusText: {
    color: "#5c667a",
    fontSize: 13,
    overflowWrap: "anywhere",
    textAlign: "right",
  },
  canvas: {
    width: 600,
    height: 600,
    maxWidth: "100%",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    background: "#eef2f7",
  },
  debugGrid: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  debugItem: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    padding: 10,
    border: "1px solid #e0e5ef",
    borderRadius: 8,
    background: "#f8fafc",
  },
  debugLabel: {
    color: "#5c667a",
    fontSize: 12,
  },
  debugValue: {
    margin: 0,
    color: "#172033",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    fontSize: 13,
    overflowWrap: "anywhere",
  },
  errorText: {
    margin: 0,
    maxHeight: 260,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#101828",
    color: "#f8fafc",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
} satisfies Record<string, CSSProperties>;
