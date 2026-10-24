import type { BodyState, Emotion } from "@runtime/brain";

export type AvatarStateMapperInput = {
  emotion: Emotion;
  bodyState: BodyState;
  isStreaming: boolean;
};

export type AvatarStateMapperOutput = {
  animationState: string;
  intensity: number;
};

export class AvatarStateMapper {
  map(input: AvatarStateMapperInput): AvatarStateMapperOutput {
    return {
      animationState: mapAnimationState(input.bodyState, input.isStreaming),
      intensity: mapIntensity(input.emotion, input.bodyState, input.isStreaming),
    };
  }
}

function mapAnimationState(bodyState: BodyState, isStreaming: boolean) {
  if (bodyState === "thinking") {
    return "gaze-away";
  }

  if (bodyState === "talking" || isStreaming) {
    return "mouth-active";
  }

  if (bodyState === "reacting") {
    return "expressive";
  }

  return "idle";
}

function mapIntensity(emotion: Emotion, bodyState: BodyState, isStreaming: boolean) {
  const bodyIntensity = getBodyIntensity(bodyState, isStreaming);
  return clampIntensity(Math.max(emotion.intensity, bodyIntensity));
}

function getBodyIntensity(bodyState: BodyState, isStreaming: boolean) {
  if (bodyState === "reacting") {
    return 0.8;
  }

  if (bodyState === "talking" || isStreaming) {
    return 0.6;
  }

  if (bodyState === "thinking") {
    return 0.4;
  }

  return 0.1;
}

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0, intensity));
}
