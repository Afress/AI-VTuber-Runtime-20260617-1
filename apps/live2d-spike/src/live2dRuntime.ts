export type Live2DTransform = {
  viewerWidth: number;
  viewerHeight: number;
  modelScale: number;
  modelOffsetX: number;
  modelOffsetY: number;
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeParameterId(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (!raw || typeof raw !== "object") {
    return "";
  }

  const rawObject = raw as Record<string, unknown>;
  const nestedId = rawObject._id;
  if (nestedId && typeof nestedId === "object") {
    const nestedObject = nestedId as Record<string, unknown>;
    for (const property of ["s", "id", "value"]) {
      const nestedString = nestedObject[property];
      if (typeof nestedString === "string") {
        return nestedString;
      }
    }
  }

  for (const property of ["id", "s", "value", "name"]) {
    const stringValue = rawObject[property];
    if (typeof stringValue === "string") {
      return stringValue;
    }
  }

  try {
    const stringValue = (raw as { toString?: () => string }).toString?.();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue;
    }
  } catch {
    return "";
  }

  return "";
}

export function discoverParameterIds(coreModel: unknown): {
  rawIds: unknown[];
  parameterIds: string[];
} {
  const rawIds = toArrayLike((coreModel as any)?._model?.parameters?.ids);
  const normalizedPairs = rawIds
    .map((rawId) => ({ rawId, id: normalizeParameterId(rawId) }))
    .filter((entry) => isUsableParameterId(entry.id));

  return {
    rawIds: normalizedPairs.map((entry) => entry.rawId),
    parameterIds: normalizedPairs.map((entry) => entry.id),
  };
}

export function findMouthParameter(parameterIds: string[]): {
  parameterId: string;
  index: number;
} {
  const candidates = parameterIds.filter(isMouthParameterId);
  const parameterId = candidates.includes("ParamMouthOpenY")
    ? "ParamMouthOpenY"
    : candidates[0] ?? "";

  return {
    parameterId,
    index: parameterId ? parameterIds.indexOf(parameterId) : -1,
  };
}

export function applyMouthValue(coreModel: unknown, index: number, value: number): number {
  const clampedValue = clamp01(value);
  const setByIndex = (coreModel as any)?.setParameterValueByIndex;
  if (typeof setByIndex !== "function") {
    throw new Error("setParameterValueByIndex is not available on the Live2D core model.");
  }

  setByIndex.call(coreModel, index, clampedValue);
  return clampedValue;
}

export function applyModelTransform(
  model: any,
  app: any,
  transform: Live2DTransform,
): void {
  const x = app.screen.width / 2 + transform.modelOffsetX;
  const y = app.screen.height * 0.9 + transform.modelOffsetY;
  model.scale.set(transform.modelScale);
  model.position.set(x, y);
}

export function getValidatedDefaultTransform(): Live2DTransform {
  return {
    viewerWidth: 520,
    viewerHeight: 720,
    modelScale: 0.5,
    modelOffsetX: 0,
    modelOffsetY: 317,
  };
}

function toArrayLike(value: unknown): unknown[] {
  if (!value) {
    return [];
  }

  try {
    return Array.from(value as ArrayLike<unknown>);
  } catch {
    return [];
  }
}

function isMouthParameterId(parameterId: string): boolean {
  const lowerId = parameterId.toLowerCase();
  return (
    lowerId.includes("mouth") ||
    lowerId.includes("lip") ||
    parameterId.includes("\u53e3") ||
    lowerId.includes("kuchi")
  );
}

function isUsableParameterId(id: string): boolean {
  return Boolean(id.trim()) && !id.startsWith("#") && id !== "[object Object]";
}
