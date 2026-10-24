import type { BodyState, Emotion } from "@runtime/brain";

export type AvatarRenderInput = {
  animationState: string;
  intensity: number;
  emotion: Emotion;
  bodyState: BodyState;
};

export type AvatarRenderOutput = {
  renderState: Record<string, unknown>;
};

export interface AvatarRenderer {
  render(input: AvatarRenderInput): AvatarRenderOutput;
}

export class WebMockRenderer implements AvatarRenderer {
  private readonly logs: AvatarRenderOutput[] = [];

  render(input: AvatarRenderInput): AvatarRenderOutput {
    const output: AvatarRenderOutput = {
      renderState: {
        animationState: input.animationState,
        intensity: clampIntensity(input.intensity),
        emotion: { ...input.emotion },
        bodyState: input.bodyState,
      },
    };

    this.logs.push(output);
    console.log("WebMockRenderer", output.renderState);

    return output;
  }

  getLogs() {
    return this.logs.map((log) => ({
      renderState: { ...log.renderState },
    }));
  }

  clearLogs() {
    this.logs.length = 0;
  }
}

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0, intensity));
}
