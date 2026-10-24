export type NormalizedGazeTarget = {
  gazeX: number;
  gazeY: number;
};

export function normalizePointerToGaze(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): NormalizedGazeTarget {
  if (rect.width <= 0 || rect.height <= 0) {
    return { gazeX: 0, gazeY: 0 };
  }

  const gazeX = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
  const screenY = clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1);

  return {
    gazeX,
    // Abstract gaze convention: positive is up while browser screen Y increases downward.
    gazeY: -screenY,
  };
}

export function convertGazeYToVrmPitch(gazeY: number): number {
  // VRMLookAt positive pitch rotates the forward direction downward for this runtime's YXZ setup.
  return gazeY === 0 ? 0 : -gazeY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
