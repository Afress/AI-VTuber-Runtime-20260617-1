import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  AvatarStateMapper,
  WebMockRenderer,
  type AvatarRenderInput,
  type AvatarRenderOutput,
  type AvatarStateMapperOutput,
} from "@runtime/avatar-core";
import {
  BrowserAudioAnalyser,
  BrowserAudioInput,
  BrowserAudioPlayer,
  BrowserAudioSegmentCapture,
  BrowserVoiceActivityDetector,
  DEFAULT_ENERGY_VAD_CONFIG,
  type AudioPlaybackSource,
  type AudioPlaybackState,
  type AudioInputSnapshot,
  type AudioSegmentCaptureSnapshot,
  type EnergyVadConfig,
  type VadSnapshot,
} from "@runtime/audio-core";
import {
  VrmRenderer,
  normalizePointerToGaze,
  type CameraPreset,
  type ThinkingLookDirection,
  type VrmRendererCapabilities,
  type VrmRendererDebugState,
} from "@runtime/avatar-vrm";
import {
  Brain,
  createEmptyRuntimeSessionMemory,
  formatRuntimeSessionMemorySummary,
  MockProvider,
  OllamaProvider,
  type ChatMessage,
  type RuntimeSessionMemory,
} from "@runtime/brain";
import {
  HttpTTSProvider,
  MockAudioTTSProvider,
  MockTTSProvider,
  type ITTSProvider,
  type TTSResult,
} from "@runtime/speech-core";
import {
  LocalHttpSpeechRecognitionProvider,
  SpeechRecognitionService,
  type SpeechRecognitionResult,
  type SpeechRecognitionSnapshot,
} from "@runtime/stt-core";
import { AudioDebugPanel } from "./components/AudioDebugPanel";
import { AvatarMotionExpressionPanel } from "./components/AvatarMotionExpressionPanel";
import { BrainCharacterMemoryPanel } from "./components/BrainCharacterMemoryPanel";
import { BrowserAudioInputPanel } from "./components/BrowserAudioInputPanel";
import { AudioSegmentCapturePanel } from "./components/AudioSegmentCapturePanel";
import { SpeechRecognitionDebugPanel } from "./components/SpeechRecognitionDebugPanel";
import { VadDebugPanel } from "./components/VadDebugPanel";
import { Live2DViewerPanel } from "./components/Live2DViewerPanel";
import { SpeechDebugPanel } from "./components/SpeechDebugPanel";
import { StagePresentationShell } from "./components/StagePresentationShell";
import { applyTranscriptToChatDraft, type TranscriptDraftAction } from "./transcriptReviewDraft";
import { taiwanTraditionalTranscriptNormalizer } from "./chineseTranscriptNormalizer";
import { resolveRuntimeEndpoints } from "./runtimeEndpoints";
import {
  clearLocalStageBackground,
  getBundledStageBackground,
  readLocalStageBackground,
  readStageBackgroundSettings,
  saveLocalStageBackground,
  validateStageBackgroundFile,
  writeStageBackgroundSettings,
  type StageBackgroundFit,
  type StageBackgroundKind,
  type StageBackgroundSettings,
} from "./stageBackground";
import {
  constrainStageMenuPosition,
  getStageMicrophoneState,
} from "./stagePresentationState";
import { addBoundedVoiceTurnKey, evaluateVoiceTurnSubmission } from "./voiceTurnSubmission";

type DebugState = {
  emotionMood: string;
  emotionIntensity: number;
  bodyState: string;
  avatarState: AvatarStateMapperOutput;
  renderInput: AvatarRenderInput;
  renderState: AvatarRenderOutput["renderState"];
};

type EmotionMappingDebug = {
  currentEmotionMood: string;
  mappedExpression: string | null;
  lastEmotionReactionTurnId: number | null;
  lastTriggeredEmotionMood: string | null;
  lastTriggeredExpression: string | null;
  autoAvatarStatus: string;
  currentAutoAvatarPhase: AutoAvatarPhase;
};

type SpeechDebugState = {
  enabled: boolean;
  providerName: string;
  selectedTtsProvider: TtsProviderId;
  lastText: string;
  estimatedDurationMs: number | null;
  hasAudioBlob: boolean;
  hasAudioUrl: boolean;
  playbackState: SpeechPlaybackState;
  speechStartedAt: number | null;
  speechEndsAt: number | null;
  remainingSpeechMs: number | null;
  talkingControlSource: TalkingControlSource;
  httpEndpoint: string;
  httpProviderName: string;
  lastError: string | null;
  status: string;
  ttsQueueSegmentIndex: number | null;
  ttsQueueSegmentCount: number;
  ttsQueueStatus: string;
  isGeneratingNextSegment: boolean;
  ttsQueueEnabled: boolean;
  ttsMode: "fullResponse" | "sentenceQueue";
  fillerVoiceEnabled: boolean;
  fillerVoiceUrl: string;
  fillerVoiceStatus: FillerVoiceStatus;
  fillerMotionMode: FillerMotionMode;
  fillerVoiceWarning: string | null;
};

type AudioDebugState = {
  enabled: boolean;
  lipSyncEnabled: boolean;
  playbackState: AudioPlaybackState;
  lastAudioSource: string;
  currentAudioVolume: number;
  externalMouthValue: number;
  lipSyncPreset: LipSyncPreset;
  lipSyncGain: number;
  lipSyncNoiseGate: number;
  lipSyncSmoothing: number;
  lipSyncMaxMouthValue: number;
  lipSyncMinMouthValue: number;
  lipSyncCurvePower: number;
  lipSyncIsSaturated: boolean;
  lipSyncSaturationWarning: string | null;
  status: string;
};

type SpeechPlaybackState = "idle" | "synthesizing" | "playing" | "finished" | "error";
type FillerVoiceStatus = "idle" | "playing" | "failed";
type FillerMotionMode = "minimal" | "speaking";
type WaitingMotionMode = "none" | "subtleThinking" | "legacy";
type SpeakingFaceMode = "keepCurrent" | "smoothCenter" | "instantCenter";
type AssistantEmotionName = "neutral" | "happy" | "surprised" | "sad" | "angry" | "thinking" | "calm";
type ExpressionSource = "assistant-response" | "manual" | "none";
type AssistantEmotionDetection = {
  emotion: AssistantEmotionName;
  intensity: number;
};
type BrainProviderId = "mock" | "ollama";
type AvatarType = "vrm" | "live2d";
type ResponseDisplayMode = "immediate" | "syncWithSpeech";
type ResponseDisplayStatus = "idle" | "thinking" | "waitingForSpeech" | "speechReady" | "speaking";
type RuntimeMode = "normal" | "debug";
type MotionLoadStatus = "idle" | "loading" | "loaded" | "error";
type TtsProviderId = "mock-tts" | "mock-audio-tts" | "http-tts";
type EmotionExpressionMode = "pulse" | "holdDuringSpeech" | "off";
type LipSyncPreset = "balanced" | "highSensitivity" | "mockAudioTts" | "custom";
type LipSyncPresetConfig = {
  gain: number;
  noiseGate: number;
  smoothing: number;
  maxMouthValue: number;
  curvePower: number;
};
type TalkingControlSource =
  | "minimum-talking-duration"
  | "speech-duration"
  | "audio-playback"
  | "audio-analyser"
  | "manual-speech-duration";

type VrmRuntimeStatus = {
  motionStatus: MotionLoadStatus;
  motionError: string | null;
};
type AvatarLoadSettings = {
  autoLoadAvatar: boolean;
  avatarUrl: string;
  idleMotionUrl: string;
};
type RuntimeCoreStatusItem = {
  label: string;
  value: string;
};
type VoiceTurnSource = "voice-vad" | "voice-manual" | "text-manual";
type VoiceTurnStatus = "idle" | "listening" | "capturing" | "processing" | "submitting" | "success" | "skipped" | "failed" | "unavailable";

type SpeechDisplayCallbacks = {
  onSpeechReady?: () => void;
  onSpeaking?: () => void;
  onSpeechFinished?: () => void;
  onSpeechError?: () => void;
};

type AutoAvatarPhase =
  | "idle"
  | "waitingForAssistant"
  | "assistantTalking"
  | "assistantFinished"
  | "listeningPose";

const DEFAULT_CHARACTER_NAME = "\u5c0f\u6885";
const DEFAULT_RUNTIME_ENDPOINTS = resolveRuntimeEndpoints();
const DEFAULT_STT_ENDPOINT = DEFAULT_RUNTIME_ENDPOINTS.localStt;
const DEFAULT_CHARACTER_STYLE =
  "\u6eab\u67d4\u3001\u6d3b\u6f51\u3001\u89aa\u5207\uff0c\u50cf VTuber \u4e00\u6a23\u81ea\u7136\u804a\u5929\u3002";
const DEFAULT_SYSTEM_PROMPT = [
  "\u4f60\u662f\u4e00\u4f4d\u540d\u53eb\u300c\u5c0f\u6885\u300d\u7684\u865b\u64ec\u89d2\u8272\u3002",
  "\u4f60\u500b\u6027\u6eab\u67d4\u3001\u6d3b\u6f51\u3001\u89aa\u5207\uff0c\u6703\u966a\u4f7f\u7528\u8005\u4e00\u8d77\u5b8c\u6210 AI VTuber \u7cfb\u7d71\u958b\u767c\u3002",
  "\u8acb\u4f7f\u7528\u7e41\u9ad4\u4e2d\u6587\u56de\u7b54\u3002",
  "\u56de\u7b54\u8981\u81ea\u7136\u3001\u53e3\u8a9e\u3001\u7c21\u77ed\u3002",
  "\u901a\u5e38\u53ea\u56de\u7b54 1 \u5230 2 \u53e5\u3002",
  "\u4e0d\u8981\u8f38\u51fa\u601d\u8003\u904e\u7a0b\u3002",
  "\u4e0d\u8981\u8f38\u51fa Thinking\u3001\u63a8\u7406\u3001\u5206\u6790\u3001\u5167\u5fc3\u7368\u767d\u3002",
  "\u4e0d\u8981\u4f7f\u7528 Markdown\u3002",
  "\u4e0d\u8981\u689d\u5217\u592a\u591a\u9805\u76ee\u3002",
  "\u4f60\u7684\u56de\u7b54\u6703\u88ab\u8a9e\u97f3\u5408\u6210\uff0c\u6240\u4ee5\u8acb\u907f\u514d\u9577\u7bc7\u56de\u7b54\u3002",
  "\u5982\u679c\u4f7f\u7528\u8005\u554f\u6280\u8853\u554f\u984c\uff0c\u53ef\u4ee5\u7c21\u77ed\u8aaa\u660e\uff0c\u5fc5\u8981\u6642\u518d\u8a62\u554f\u662f\u5426\u8981\u5c55\u958b\u3002",
].join("\n");

const STORAGE_KEYS = {
  characterName: "ai-vtuber.characterName",
  characterStyle: "ai-vtuber.characterStyle",
  systemPrompt: "ai-vtuber.systemPrompt",
  llmReplyMaxLength: "ai-vtuber.llmReplyMaxLength",
  runtimeSessionMemory: "ai-vtuber.runtimeSessionMemory",
  runtimeMode: "ai-vtuber.runtimeMode",
  brainProvider: "ai-vtuber.brainProvider",
  avatarType: "ai-vtuber.avatarType",
  autoLoadAvatar: "ai-vtuber.autoLoadAvatar",
  avatarUrl: "ai-vtuber.avatarUrl",
  idleMotionUrl: "ai-vtuber.idleMotionUrl",
  audioInputSelectedDevice: "ai-vtuber.audioInputSelectedDevice",
} as const;
const DEFAULT_RUNTIME_COMPLETED_ITEMS = [
  "Ollama qwen3:8b chat provider",
  "IndexTTS2 HTTP TTS playback",
  "filler voice",
  "audio analyser lip sync",
  "assistant emotion expression link",
];

function readStoredString(key: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function readStoredNumber(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
  return clampInteger(value, min, max, fallback);
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function writeStoredString(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

function readStoredRuntimeMode() {
  const value = readStoredString(STORAGE_KEYS.runtimeMode, "debug");
  return value === "normal" || value === "debug" ? value : "debug";
}

function readStoredBrainProvider() {
  const value = readStoredString(STORAGE_KEYS.brainProvider, "ollama");
  return value === "mock" || value === "ollama" ? value : "ollama";
}

function readStoredAvatarType() {
  const value = readStoredString(STORAGE_KEYS.avatarType, "vrm");
  return value === "live2d" ? value : "vrm";
}

function readStoredRuntimeSessionMemory() {
  const emptyMemory = createDefaultRuntimeSessionMemory();

  if (typeof window === "undefined") {
    return emptyMemory;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.runtimeSessionMemory);
  if (!rawValue) {
    return emptyMemory;
  }

  try {
    return normalizeRuntimeSessionMemory(JSON.parse(rawValue));
  } catch {
    return emptyMemory;
  }
}

function writeStoredRuntimeSessionMemory(memory: RuntimeSessionMemory) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.runtimeSessionMemory, JSON.stringify(memory));
}

export function App() {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(() => readStoredRuntimeMode());
  const [avatarType, setAvatarType] = useState<AvatarType>(() => readStoredAvatarType());
  const [brainProviderId, setBrainProviderId] = useState<BrainProviderId>(() =>
    readStoredBrainProvider(),
  );
  const [ollamaEndpoint, setOllamaEndpoint] = useState(DEFAULT_RUNTIME_ENDPOINTS.ollama);
  const [ollamaModel, setOllamaModel] = useState("qwen3:8b");
  const [characterName, setCharacterName] = useState(() =>
    readStoredString(STORAGE_KEYS.characterName, DEFAULT_CHARACTER_NAME),
  );
  const [characterStyle, setCharacterStyle] = useState(() =>
    readStoredString(STORAGE_KEYS.characterStyle, DEFAULT_CHARACTER_STYLE),
  );
  const [systemPrompt, setSystemPrompt] = useState(() =>
    readStoredString(STORAGE_KEYS.systemPrompt, DEFAULT_SYSTEM_PROMPT),
  );
  const [llmReplyMaxLength, setLlmReplyMaxLength] = useState(() =>
    readStoredNumber(STORAGE_KEYS.llmReplyMaxLength, 80, 20, 300),
  );
  const [runtimeSessionMemory, setRuntimeSessionMemory] = useState<RuntimeSessionMemory>(() =>
    readStoredRuntimeSessionMemory(),
  );
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [developerDrawerOpen, setDeveloperDrawerOpen] = useState(false);
  const [transcriptReviewOpen, setTranscriptReviewOpen] = useState(false);
  const [stageBackgroundSettings, setStageBackgroundSettings] = useState<StageBackgroundSettings>(() =>
    readStageBackgroundSettings(),
  );
  const [stageBackgroundObjectUrl, setStageBackgroundObjectUrl] = useState<string | null>(null);
  const [stageBackgroundError, setStageBackgroundError] = useState<string | null>(null);
  const [motionMenu, setMotionMenu] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [transcriptReviewStatus, setTranscriptReviewStatus] = useState<string | null>(null);
  const inputRef = useRef("");
  const isSendingRef = useRef(false);
  const stageVoiceModeRef = useRef<"vad" | "manual" | null>(null);
  const submittedVoiceKeysRef = useRef<string[]>([]);
  const [voiceTurnStatus, setVoiceTurnStatus] = useState<VoiceTurnStatus>("idle");
  const [voiceTurnNotice, setVoiceTurnNotice] = useState<string | null>(null);
  const [memoryNoteInput, setMemoryNoteInput] = useState("");
  const [brainError, setBrainError] = useState<string | null>(null);
  const [responseDisplayMode, setResponseDisplayMode] =
    useState<ResponseDisplayMode>("syncWithSpeech");
  const [responseDisplayStatus, setResponseDisplayStatus] =
    useState<ResponseDisplayStatus>("idle");
  const [pendingAssistantText, setPendingAssistantText] = useState<string | null>(null);
  const [cleanedReplyLength, setCleanedReplyLength] = useState(0);
  const pendingAssistantTextRef = useRef<string | null>(null);
  const memorySummary = useMemo(
    () => formatRuntimeSessionMemorySummary(runtimeSessionMemory),
    [runtimeSessionMemory],
  );
  const effectiveSystemPrompt = useMemo(
    () => createCharacterSystemPrompt(characterName, characterStyle, systemPrompt, memorySummary),
    [characterName, characterStyle, memorySummary, systemPrompt],
  );
  const brain = useMemo(
    () =>
      new Brain(
        brainProviderId === "ollama"
          ? new OllamaProvider({
              endpoint: formatOllamaChatEndpoint(ollamaEndpoint),
              model: ollamaModel.trim() || "qwen3:8b",
              systemPrompt: effectiveSystemPrompt,
              replyMaxLength: llmReplyMaxLength,
            })
          : new MockProvider(),
      ),
    [brainProviderId, effectiveSystemPrompt, llmReplyMaxLength, ollamaEndpoint, ollamaModel],
  );

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.characterName, characterName);
  }, [characterName]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.characterStyle, characterStyle);
  }, [characterStyle]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.systemPrompt, systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.llmReplyMaxLength, String(llmReplyMaxLength));
  }, [llmReplyMaxLength]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.runtimeMode, runtimeMode);
  }, [runtimeMode]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.avatarType, avatarType);
  }, [avatarType]);

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.brainProvider, brainProviderId);
  }, [brainProviderId]);

  useEffect(() => {
    writeStoredRuntimeSessionMemory(runtimeSessionMemory);
  }, [runtimeSessionMemory]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    writeStageBackgroundSettings(stageBackgroundSettings);
  }, [stageBackgroundSettings]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (stageBackgroundSettings.kind !== "local") {
      setStageBackgroundObjectUrl(null);
      return undefined;
    }

    void readLocalStageBackground()
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setStageBackgroundObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setStageBackgroundError("Saved local background could not be loaded.");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [stageBackgroundSettings.kind]);

  const avatarMapper = useMemo(() => new AvatarStateMapper(), []);
  const avatarRenderer = useMemo(() => new WebMockRenderer(), []);
  const vrmRenderer = useMemo(() => new VrmRenderer(), []);
  const audioPlayer = useMemo(() => new BrowserAudioPlayer(), []);
  const audioAnalyser = useMemo(() => new BrowserAudioAnalyser(), []);
  const audioInput = useMemo(() => new BrowserAudioInput(), []);
  const voiceActivityDetector = useMemo(() => new BrowserVoiceActivityDetector(), []);
  const audioSegmentCapture = useMemo(() => new BrowserAudioSegmentCapture(), []);
  const speechRecognitionService = useMemo(
    () => new SpeechRecognitionService(new LocalHttpSpeechRecognitionProvider(DEFAULT_STT_ENDPOINT), {
      transcriptNormalizer: taiwanTraditionalTranscriptNormalizer,
    }),
    [],
  );
  const ttsProviders = useMemo(
    () =>
      ({
        "mock-tts": new MockTTSProvider(),
        "mock-audio-tts": new MockAudioTTSProvider(),
      }) satisfies Record<Exclude<TtsProviderId, "http-tts">, ITTSProvider>,
    [],
  );
  const initialDebugState = useMemo(
    () => createDebugState(brain, avatarMapper, avatarRenderer, false),
    [brain, avatarMapper, avatarRenderer],
  );
  const lastTriggeredEmotionMoodRef = useRef<string | null>(null);
  const lastTriggeredExpressionRef = useRef<string | null>(null);
  const lastEmotionReactionTurnIdRef = useRef<number | null>(null);
  const currentTurnIdRef = useRef(0);
  const autoAvatarControlEnabledRef = useRef(true);
  const emotionReactionEnabledRef = useRef(true);
  const emotionExpressionModeRef = useRef<EmotionExpressionMode>("holdDuringSpeech");
  const heldEmotionExpressionRef = useRef<string | null>(null);
  const heldEmotionExpressionValueRef = useRef(0);
  const assistantExpressionIntervalRef = useRef<number | null>(null);
  const assistantActiveExpressionRef = useRef<string | null>(null);
  const assistantExpressionSourceRef = useRef<ExpressionSource>("none");
  const audioEnabledRef = useRef(true);
  const lipSyncEnabledRef = useRef(true);
  const lipSyncActiveRef = useRef(false);
  const lipSyncMouthOnlyActiveRef = useRef(false);
  const lipSyncCalibrationRef = useRef({
    gain: 8,
    noiseGate: 0.01,
    smoothing: 0.15,
    maxMouthValue: 1,
    minMouthValue: 0.02,
    curvePower: 0.85,
    previousMouthValue: 0,
  });
  const speechEnabledRef = useRef(true);
  const ttsQueueEnabledRef = useRef(false);
  const fillerVoiceEnabledRef = useRef(true);
  const fillerVoiceUrlRef = useRef("/audio/filler_received_loading.wav");
  const fillerMotionModeRef = useRef<FillerMotionMode>("minimal");
  const waitingMotionModeRef = useRef<WaitingMotionMode>("none");
  const speakingFaceModeRef = useRef<SpeakingFaceMode>("keepCurrent");
  const autoAvatarStatusRef = useRef("Auto avatar control ready");
  const currentAutoAvatarPhaseRef = useRef<AutoAvatarPhase>("idle");
  const enableListeningPoseAfterReplyRef = useRef(false);
  const minimumTalkingDurationMsRef = useRef(2000);
  const minimumTalkingTimeoutRef = useRef<number | null>(null);
  const listeningPoseEndTimeoutRef = useRef<number | null>(null);
  const speechPlaybackTimeoutRef = useRef<number | null>(null);
  const speechRemainingIntervalRef = useRef<number | null>(null);
  const speechEndsAtRef = useRef<number | null>(null);
  const lipSyncIntervalRef = useRef<number | null>(null);
  const audioPlaybackTalkingIntervalRef = useRef<number | null>(null);
  const ttsQueueRunIdRef = useRef(0);
  const [manualTtsText, setManualTtsText] = useState("IndexTTS2 HTTP TTS test.");
  const [httpTtsEndpoint, setHttpTtsEndpoint] = useState(DEFAULT_RUNTIME_ENDPOINTS.tts);
  const [httpTtsProviderName, setHttpTtsProviderName] = useState("indextts2-http");
  const [fillerVoiceUrl, setFillerVoiceUrl] = useState("/audio/filler_received_loading.wav");
  const [waitingMotionMode, setWaitingMotionMode] = useState<WaitingMotionMode>("none");
  const [speakingFaceMode, setSpeakingFaceMode] = useState<SpeakingFaceMode>("keepCurrent");
  const [testAudioUrl, setTestAudioUrl] = useState("");
  const [selectedTtsProvider, setSelectedTtsProvider] = useState<TtsProviderId>("http-tts");
  const [isSending, setIsSending] = useState(false);
  const [debugState, setDebugState] = useState<DebugState>(initialDebugState);
  const vrmRenderState = useMemo<AvatarRenderOutput["renderState"]>(() => ({}), []);
  const [currentTurnId, setCurrentTurnId] = useState(0);
  const [autoAvatarControlEnabled, setAutoAvatarControlEnabled] = useState(true);
  const [emotionReactionEnabled, setEmotionReactionEnabled] = useState(true);
  const [emotionExpressionMode, setEmotionExpressionMode] =
    useState<EmotionExpressionMode>("holdDuringSpeech");
  const [heldEmotionExpression, setHeldEmotionExpression] = useState<string | null>(null);
  const [heldEmotionExpressionValue, setHeldEmotionExpressionValue] = useState(0);
  const [detectedAssistantEmotion, setDetectedAssistantEmotion] =
    useState<AssistantEmotionName>("neutral");
  const [detectedAssistantEmotionIntensity, setDetectedAssistantEmotionIntensity] = useState(0);
  const [activeAssistantExpression, setActiveAssistantExpression] = useState<string | null>(null);
  const [expressionSource, setExpressionSource] = useState<ExpressionSource>("none");
  const [autoAvatarStatus, setAutoAvatarStatus] = useState("Auto avatar control ready");
  const [currentAutoAvatarPhase, setCurrentAutoAvatarPhase] = useState<AutoAvatarPhase>("idle");
  const [enableListeningPoseAfterReply, setEnableListeningPoseAfterReply] = useState(false);
  const [minimumTalkingDurationMs, setMinimumTalkingDurationMs] = useState(2000);
  const [ttsQueueEnabled, setTtsQueueEnabled] = useState(false);
  const [speechDebugState, setSpeechDebugState] = useState<SpeechDebugState>(() => ({
    enabled: true,
    providerName: "indextts2-http",
    selectedTtsProvider: "http-tts",
    lastText: "",
    estimatedDurationMs: null,
    hasAudioBlob: false,
    hasAudioUrl: false,
    playbackState: "idle",
    speechStartedAt: null,
    speechEndsAt: null,
    remainingSpeechMs: null,
    talkingControlSource: "minimum-talking-duration",
    httpEndpoint: "http://localhost:7861/tts",
    httpProviderName: "indextts2-http",
    lastError: null,
    status: "Auto speech after chat enabled",
    ttsQueueSegmentIndex: null,
    ttsQueueSegmentCount: 0,
    ttsQueueStatus: "idle",
    isGeneratingNextSegment: false,
    ttsQueueEnabled: false,
    ttsMode: "fullResponse",
    fillerVoiceEnabled: true,
    fillerVoiceUrl: "/audio/filler_received_loading.wav",
    fillerVoiceStatus: "idle",
    fillerMotionMode: "minimal",
    fillerVoiceWarning: null,
  }));
  const [audioDebugState, setAudioDebugState] = useState<AudioDebugState>({
    enabled: true,
    lipSyncEnabled: true,
    playbackState: "idle",
    lastAudioSource: "none",
    currentAudioVolume: 0,
    externalMouthValue: 0,
    lipSyncPreset: "highSensitivity",
    lipSyncGain: 8,
    lipSyncNoiseGate: 0.01,
    lipSyncSmoothing: 0.15,
    lipSyncMaxMouthValue: 1,
    lipSyncMinMouthValue: 0.02,
    lipSyncCurvePower: 0.85,
    lipSyncIsSaturated: false,
    lipSyncSaturationWarning: null,
    status: "Audio playback enabled",
  });
  const [audioInputSnapshot, setAudioInputSnapshot] = useState<AudioInputSnapshot>(() =>
    audioInput.getSnapshot(),
  );
  const [vadConfig, setVadConfig] = useState<EnergyVadConfig>(() => ({
    ...DEFAULT_ENERGY_VAD_CONFIG,
  }));
  const [vadSnapshot, setVadSnapshot] = useState<VadSnapshot>(() =>
    voiceActivityDetector.getSnapshot(),
  );
  const [audioSegmentCaptureSnapshot, setAudioSegmentCaptureSnapshot] = useState<AudioSegmentCaptureSnapshot>(() =>
    audioSegmentCapture.getSnapshot(),
  );
  const [sttEndpoint, setSttEndpoint] = useState(DEFAULT_STT_ENDPOINT);
  const [sttLanguage, setSttLanguage] = useState("auto");
  const [speechRecognitionSnapshot, setSpeechRecognitionSnapshot] = useState<SpeechRecognitionSnapshot>(() =>
    speechRecognitionService.getSnapshot(),
  );
  const audioInputDisposeTimerRef = useRef<number | null>(null);
  const vadDisposeTimerRef = useRef<number | null>(null);
  const audioSegmentCaptureDisposeTimerRef = useRef<number | null>(null);
  const speechRecognitionDisposeTimerRef = useRef<number | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const sttProviderEndpointRef = useRef(DEFAULT_STT_ENDPOINT);
  const [vrmDebugSnapshot, setVrmDebugSnapshot] = useState<VrmRendererDebugState>(() =>
    vrmRenderer.getDebugState(),
  );
  const [vrmRuntimeStatus, setVrmRuntimeStatus] = useState<VrmRuntimeStatus>({
    motionStatus: "idle",
    motionError: null,
  });
  const [avatarLoadSettings, setAvatarLoadSettings] = useState<AvatarLoadSettings>(() => ({
    autoLoadAvatar: readStoredBoolean(STORAGE_KEYS.autoLoadAvatar, true),
    avatarUrl: readStoredString(STORAGE_KEYS.avatarUrl, "/models/default.vrm"),
    idleMotionUrl: readStoredString(STORAGE_KEYS.idleMotionUrl, "/motions/idle.vrma"),
  }));
  useEffect(() => {
    writeStoredString(STORAGE_KEYS.autoLoadAvatar, String(avatarLoadSettings.autoLoadAvatar));
    writeStoredString(STORAGE_KEYS.avatarUrl, avatarLoadSettings.avatarUrl);
    writeStoredString(STORAGE_KEYS.idleMotionUrl, avatarLoadSettings.idleMotionUrl);
  }, [avatarLoadSettings]);
  const [emotionMappingDebug, setEmotionMappingDebug] = useState<EmotionMappingDebug>(() => ({
    currentEmotionMood: initialDebugState.emotionMood,
    mappedExpression: mapEmotionToExpression(initialDebugState.emotionMood),
    lastEmotionReactionTurnId: null,
    lastTriggeredEmotionMood: null,
    lastTriggeredExpression: null,
    autoAvatarStatus: "Auto avatar control ready",
    currentAutoAvatarPhase: "idle",
  }));
  const chatAvatarController = useMemo(
    () =>
      createChatAvatarController({
        renderer: vrmRenderer,
        enabledRef: autoAvatarControlEnabledRef,
        emotionReactionEnabledRef,
        emotionExpressionModeRef,
        heldEmotionExpressionRef,
        heldEmotionExpressionValueRef,
        currentTurnIdRef,
        lastEmotionReactionTurnIdRef,
        lastTriggeredEmotionMoodRef,
        lastTriggeredExpressionRef,
        setHeldEmotionExpression,
        setHeldEmotionExpressionValue,
        clearHeldEmotionExpression,
        setStatus: setAutoAvatarControllerStatus,
        setPhase: setAutoAvatarControllerPhase,
        enableListeningPoseAfterReplyRef,
        waitingMotionModeRef,
        minimumTalkingDurationMsRef,
        minimumTalkingTimeoutRef,
        listeningPoseEndTimeoutRef,
      }),
    [vrmRenderer],
  );

  useEffect(() => {
    setRuntimeSessionMemory((current) => ({
      ...current,
      completedItems:
        current.completedItems.length > 0 ? current.completedItems : DEFAULT_RUNTIME_COMPLETED_ITEMS,
      brainProvider: brainProviderId,
      ttsProvider: selectedTtsProvider,
      characterName,
      lastError: brainError ?? speechDebugState.lastError ?? current.lastError,
      lastSuccessfulTest:
        speechDebugState.playbackState === "finished"
          ? `${speechDebugState.providerName} playback finished`
          : current.lastSuccessfulTest,
    }));
  }, [
    brainError,
    brainProviderId,
    characterName,
    selectedTtsProvider,
    speechDebugState.lastError,
    speechDebugState.playbackState,
    speechDebugState.providerName,
  ]);

  function refreshDebugState(isStreaming: boolean) {
    refreshAvatarDebugState(isStreaming, false);
  }

  function refreshAvatarDebugState(isStreaming: boolean, allowEmotionReaction: boolean) {
    const nextDebugState = createDebugState(brain, avatarMapper, avatarRenderer, isStreaming);
    const mappedExpression = mapEmotionToExpression(nextDebugState.emotionMood);
    chatAvatarController.syncEmotion(
      nextDebugState.emotionMood,
      mappedExpression,
      allowEmotionReaction,
    );

    setDebugState(nextDebugState);
    setEmotionMappingDebug({
      currentEmotionMood: nextDebugState.emotionMood,
      mappedExpression,
      lastEmotionReactionTurnId: lastEmotionReactionTurnIdRef.current,
      lastTriggeredEmotionMood: lastTriggeredEmotionMoodRef.current,
      lastTriggeredExpression: lastTriggeredExpressionRef.current,
      autoAvatarStatus: autoAvatarStatusRef.current,
      currentAutoAvatarPhase: currentAutoAvatarPhaseRef.current,
    });
  }

  function handleAutoAvatarControlEnabledChange(enabled: boolean) {
    autoAvatarControlEnabledRef.current = enabled;
    if (!enabled) {
      clearTimeoutRef(minimumTalkingTimeoutRef);
      clearTimeoutRef(listeningPoseEndTimeoutRef);
    }
    setAutoAvatarControlEnabled(enabled);
    setAutoAvatarControllerStatus(enabled ? "Auto avatar control ready" : "Auto avatar control off");
    setAutoAvatarControllerPhase("idle");
  }

  function handleListeningPoseAfterReplyChange(enabled: boolean) {
    enableListeningPoseAfterReplyRef.current = enabled;
    setEnableListeningPoseAfterReply(enabled);
  }

  function handleMinimumTalkingDurationChange(durationMs: number) {
    minimumTalkingDurationMsRef.current = durationMs;
    setMinimumTalkingDurationMs(durationMs);
  }

  function handleEmotionReactionEnabledChange(enabled: boolean) {
    emotionReactionEnabledRef.current = enabled;
    setEmotionReactionEnabled(enabled);
  }

  function handleEmotionExpressionModeChange(mode: EmotionExpressionMode) {
    emotionExpressionModeRef.current = mode;
    setEmotionExpressionMode(mode);

    if (mode !== "holdDuringSpeech") {
      clearAssistantResponseExpression(true);
      clearHeldEmotionExpression();
    }
  }

  function handleSpeechEnabledChange(enabled: boolean) {
    speechEnabledRef.current = enabled;
    if (!enabled) {
      clearSpeechPlayback(true);
    }

    setSpeechDebugState((current) => ({
      ...current,
      enabled,
      playbackState: enabled ? current.playbackState : "idle",
      speechStartedAt: enabled ? current.speechStartedAt : null,
      speechEndsAt: enabled ? current.speechEndsAt : null,
      remainingSpeechMs: enabled ? current.remainingSpeechMs : null,
      talkingControlSource: enabled ? current.talkingControlSource : "minimum-talking-duration",
      status: enabled ? "Speech enabled" : "Speech disabled",
    }));
  }

  function handleFillerVoiceEnabledChange(enabled: boolean) {
    fillerVoiceEnabledRef.current = enabled;
    setSpeechDebugState((current) => ({
      ...current,
      fillerVoiceEnabled: enabled,
      fillerVoiceStatus: enabled ? current.fillerVoiceStatus : "idle",
      fillerVoiceWarning: enabled ? current.fillerVoiceWarning : null,
      status: enabled ? "Filler voice enabled" : "Filler voice disabled",
    }));
  }

  function handleFillerVoiceUrlChange(url: string) {
    fillerVoiceUrlRef.current = url;
    setFillerVoiceUrl(url);
    setSpeechDebugState((current) => ({
      ...current,
      fillerVoiceUrl: url,
    }));
  }

  function handleFillerMotionModeChange(mode: FillerMotionMode) {
    fillerMotionModeRef.current = mode;
    setSpeechDebugState((current) => ({
      ...current,
      fillerMotionMode: mode,
      status:
        mode === "minimal"
          ? "Filler Motion Mode: Minimal"
          : "Filler Motion Mode: Speaking",
    }));
  }

  function handleWaitingMotionModeChange(mode: WaitingMotionMode) {
    waitingMotionModeRef.current = mode;
    setWaitingMotionMode(mode);
    setAutoAvatarControllerStatus(`Waiting Motion Mode: ${formatWaitingMotionMode(mode)}`);
  }

  function handleSpeakingFaceModeChange(mode: SpeakingFaceMode) {
    speakingFaceModeRef.current = mode;
    setSpeakingFaceMode(mode);
    setAutoAvatarControllerStatus(`Speaking Face Mode: ${formatSpeakingFaceMode(mode)}`);
  }

  function handleTtsQueueEnabledChange(enabled: boolean) {
    ttsQueueEnabledRef.current = enabled;
    setTtsQueueEnabled(enabled);
    setSpeechDebugState((current) => ({
      ...current,
      ttsQueueEnabled: enabled,
      ttsMode: enabled ? "sentenceQueue" : "fullResponse",
      ttsQueueStatus: enabled ? "Sentence queue enabled" : "Full response",
      status: enabled ? "TTS Queue enabled" : "TTS Mode: Full response",
    }));
  }

  function handleSelectedTtsProviderChange(providerId: TtsProviderId) {
    setSelectedTtsProvider(providerId);
    setSpeechDebugState((current) => ({
      ...current,
      selectedTtsProvider: providerId,
      providerName: getSelectedTtsProvider(providerId).providerName,
      status: `TTS provider: ${providerId}`,
    }));
  }

  function handleHttpTtsEndpointChange(endpoint: string) {
    setHttpTtsEndpoint(endpoint);
    setSpeechDebugState((current) => ({
      ...current,
      httpEndpoint: endpoint,
    }));
  }

  function handleHttpTtsProviderNameChange(providerName: string) {
    setHttpTtsProviderName(providerName);
    setSpeechDebugState((current) => ({
      ...current,
      httpProviderName: providerName,
      providerName: selectedTtsProvider === "http-tts" ? providerName : current.providerName,
    }));
  }

  async function handleHttpTtsTest() {
    const text =
      manualTtsText.trim() ||
      speechDebugState.lastText.trim() ||
      "IndexTTS2 HTTP TTS test.";

    await synthesizeAndPlaySpeech(text, "manual-speech-duration", "http-tts");
  }

  function handleAudioEnabledChange(enabled: boolean) {
    audioEnabledRef.current = enabled;
    if (!enabled) {
      stopAudioPlaybackTalkingControl(false);
      stopAudioLipSync();
      audioPlayer.stop();
    }

    setAudioDebugState((current) => ({
      ...current,
      enabled,
      playbackState: audioPlayer.getState(),
      status: enabled ? "Audio enabled" : "Audio disabled",
    }));
  }

  async function handleAudioInputRequestPermission() {
    try {
      await audioInput.requestPermission();
    } catch {
      // The provider publishes its structured error state for the debug panel.
    }
  }

  async function handleAudioInputRefreshDevices() {
    try {
      await audioInput.enumerateDevices();
    } catch {
      // The provider publishes its structured error state for the debug panel.
    }
  }

  async function handleAudioInputStart() {
    const storedDeviceId = readStoredString(STORAGE_KEYS.audioInputSelectedDevice, "");
    const selectedDeviceId = audioInputSnapshot.devices.some(
      (device) => device.deviceId === storedDeviceId,
    )
      ? storedDeviceId
      : undefined;

    try {
      await audioInput.start(selectedDeviceId);
    } catch {
      // The provider publishes its structured error state for the debug panel.
    }
  }

  async function handleAudioInputSelectDevice(deviceId: string) {
    if (!deviceId) {
      return;
    }

    try {
      await audioInput.selectDevice(deviceId);
    } catch {
      // The provider publishes its structured error state for the debug panel.
    }
  }

  function handleAudioInputMutedChange(muted: boolean) {
    audioInput.setMuted(muted);
  }

  function handleVadEnabledChange(enabled: boolean) {
    voiceActivityDetector.setEnabled(enabled);
    if (!enabled && stageVoiceModeRef.current === "vad") {
      stageVoiceModeRef.current = null;
      audioSegmentCapture.setEnabled(false);
      setVoiceTurnStatus("idle");
      setVoiceTurnNotice("VAD listening stopped. Use the microphone button for manual capture.");
    }
  }

  function handleVadReset() {
    voiceActivityDetector.reset();
  }

  function handleVadConfigChange(config: Partial<EnergyVadConfig>) {
    setVadConfig((current) => ({ ...current, ...config }));
    voiceActivityDetector.updateConfig(config);
  }

  function handleVadRestoreDefaults() {
    const defaults = { ...DEFAULT_ENERGY_VAD_CONFIG };
    setVadConfig(defaults);
    voiceActivityDetector.updateConfig(defaults);
  }

  function handleAudioSegmentCaptureEnabledChange(enabled: boolean) {
    audioSegmentCapture.setEnabled(enabled);
  }

  function handleAudioSegmentCaptureReset() {
    audioSegmentCapture.reset();
  }

  function handleAudioSegmentCaptureClearLast() {
    audioSegmentCapture.clearLastSegment();
  }

  function handleAudioSegmentCaptureDownloadLast() {
    const segment = audioSegmentCapture.getLastSegment();
    if (!segment) {
      return;
    }
    const url = URL.createObjectURL(new Blob([segment.wav], { type: "audio/wav" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audio-segment-${segment.metadata.segmentId}.wav`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handleSttEndpointChange(endpoint: string) {
    setSttEndpoint(endpoint);
  }

  function handleSttHealthCheck() {
    const endpoint = sttEndpoint.trim() || DEFAULT_STT_ENDPOINT;
    if (endpoint !== sttProviderEndpointRef.current) {
      speechRecognitionService.setProvider(new LocalHttpSpeechRecognitionProvider(endpoint));
      sttProviderEndpointRef.current = endpoint;
    }
    void speechRecognitionService.healthCheck().catch(() => undefined);
  }

  function handleTranscribeLastSegment() {
    const segment = audioSegmentCapture.getLastSegment();
    if (!segment) return;
    void speechRecognitionService.transcribeSegment(segment, { force: true, language: sttLanguage }).catch(() => undefined);
  }

  function applyLatestTranscriptToChatDraft(action: TranscriptDraftAction) {
    const transcript = speechRecognitionSnapshot.lastTranscript;
    const result = applyTranscriptToChatDraft(input, transcript ?? "", action);
    const statusByReason = {
      "empty-transcript": "No completed transcript is available.",
      inserted: "Transcript inserted into the chat draft. Review and submit manually.",
      "requires-choice": "Draft already has text. Choose Append Transcript or Replace Draft.",
      appended: "Transcript appended to the chat draft. Review and submit manually.",
      replaced: "Chat draft replaced with the transcript. Review and submit manually.",
      duplicate: "This transcript is already present in the chat draft.",
    } as const;
    setTranscriptReviewStatus(statusByReason[result.reason]);
    if (!result.changed) return;
    setInput(result.draft);
    chatInputRef.current?.focus();
  }

  function rememberSubmittedVoiceKey(key: string) {
    submittedVoiceKeysRef.current = addBoundedVoiceTurnKey(submittedVoiceKeysRef.current, key);
  }

  async function submitVoiceTranscript(result: SpeechRecognitionResult, source: Exclude<VoiceTurnSource, "text-manual">) {
    const transcript = result.text.trim();
    const gate = evaluateVoiceTurnSubmission({ text: transcript, segmentId: result.segmentId, requestId: result.requestId, chatDraft: inputRef.current, chatBusy: isSendingRef.current, submittedKeys: submittedVoiceKeysRef.current });
    if (!gate.allowed) {
      if (gate.reason !== "duplicate") rememberSubmittedVoiceKey(gate.key);
      setVoiceTurnStatus("skipped");
      setVoiceTurnNotice(gate.reason === "draft-not-empty" ? "Voice turn skipped because chat draft is not empty." : gate.reason === "chat-busy" ? "Voice turn skipped because chat is busy. Transcript is available in Review." : "Voice turn skipped because the transcript is empty.");
      return;
    }

    rememberSubmittedVoiceKey(gate.key);
    setVoiceTurnStatus("submitting");
    setVoiceTurnNotice(`Heard: ${transcript}`);
    const submitted = await submitChatText(transcript, source);
    setVoiceTurnStatus(submitted ? "success" : "failed");
    if (!submitted) setVoiceTurnNotice("Voice message ready for review after chat submit failed.");
  }

  async function handleStageMicrophoneToggle() {
    const isCapturing = audioSegmentCapture.getSnapshot().enabled;
    const vadEnabled = voiceActivityDetector.getSnapshot().enabled;

    try {
      if (isCapturing) {
        const manualSegmentFinalized =
          stageVoiceModeRef.current === "manual"
            ? audioSegmentCapture.stopManualSegment()
            : false;
        audioSegmentCapture.stop("stopped");
        await audioInput.stop();

        if (stageVoiceModeRef.current === "manual" && !manualSegmentFinalized) {
          stageVoiceModeRef.current = null;
          setVoiceTurnStatus("idle");
          setVoiceTurnNotice("No recorded audio segment was available for transcription.");
          return;
        }

        if (stageVoiceModeRef.current === "vad") {
          stageVoiceModeRef.current = null;
          setVoiceTurnStatus("idle");
        }
        return;
      }

      await handleAudioInputStart();
      if (audioInput.getSnapshot().status !== "active") {
        setVoiceTurnStatus("unavailable");
        setVoiceTurnNotice("Microphone is unavailable.");
        return;
      }

      stageVoiceModeRef.current = vadEnabled ? "vad" : "manual";
      audioSegmentCapture.start();
      if (vadEnabled) {
        setVoiceTurnStatus("listening");
        setVoiceTurnNotice(null);
        return;
      }

      if (!audioSegmentCapture.startManualSegment()) {
        stageVoiceModeRef.current = null;
        audioSegmentCapture.stop("reset");
        await audioInput.stop();
        setVoiceTurnStatus("idle");
        setVoiceTurnNotice("Unable to start a manual audio segment.");
        return;
      }

      setVoiceTurnStatus("capturing");
      setVoiceTurnNotice(null);
    } catch (error) {
      stageVoiceModeRef.current = null;
      try {
        audioSegmentCapture.stop("reset");
        await audioInput.stop();
      } catch {
        // Preserve the original capture error while best-effort cleanup runs.
      }
      setVoiceTurnStatus("idle");
      setVoiceTurnNotice(
        error instanceof Error ? `Microphone control failed: ${error.message}` : "Microphone control failed.",
      );
    }
  }

  async function handleStageBackgroundFile(file: File | null) {
    if (!file) return;
    const validationError = validateStageBackgroundFile(file);
    if (validationError) {
      setStageBackgroundError(validationError);
      return;
    }

    try {
      await saveLocalStageBackground(file);
      const objectUrl = URL.createObjectURL(file);
      setStageBackgroundObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
      setStageBackgroundSettings((current) => ({ ...current, kind: "local" }));
      setStageBackgroundError(null);
    } catch {
      setStageBackgroundError("Unable to save the local background on this device.");
    }
  }

  async function handleStageBackgroundClear() {
    try {
      await clearLocalStageBackground();
      setStageBackgroundObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setStageBackgroundSettings((current) => ({ ...current, kind: "default" }));
      setStageBackgroundError(null);
    } catch {
      setStageBackgroundError("Unable to clear the saved local background.");
    }
  }

  function handleLipSyncEnabledChange(enabled: boolean) {
    lipSyncEnabledRef.current = enabled;
    if (!enabled) {
      stopAudioLipSync();
    }

    setAudioDebugState((current) => ({
      ...current,
      lipSyncEnabled: enabled,
      currentAudioVolume: enabled ? current.currentAudioVolume : 0,
      externalMouthValue: enabled ? current.externalMouthValue : 0,
      lipSyncIsSaturated: enabled ? current.lipSyncIsSaturated : false,
      lipSyncSaturationWarning: enabled ? current.lipSyncSaturationWarning : null,
    }));
  }

  function handleLipSyncGainChange(value: number) {
    lipSyncCalibrationRef.current.gain = value;
    setAudioDebugState((current) => ({ ...current, lipSyncPreset: "custom", lipSyncGain: value }));
  }

  function handleLipSyncNoiseGateChange(value: number) {
    lipSyncCalibrationRef.current.noiseGate = value;
    setAudioDebugState((current) => ({
      ...current,
      lipSyncPreset: "custom",
      lipSyncNoiseGate: value,
    }));
  }

  function handleLipSyncSmoothingChange(value: number) {
    lipSyncCalibrationRef.current.smoothing = value;
    setAudioDebugState((current) => ({
      ...current,
      lipSyncPreset: "custom",
      lipSyncSmoothing: value,
    }));
  }

  function handleLipSyncMaxMouthValueChange(value: number) {
    lipSyncCalibrationRef.current.maxMouthValue = value;
    setAudioDebugState((current) => ({
      ...current,
      lipSyncPreset: "custom",
      lipSyncMaxMouthValue: value,
    }));
  }

  function handleLipSyncCurvePowerChange(value: number) {
    lipSyncCalibrationRef.current.curvePower = value;
    setAudioDebugState((current) => ({
      ...current,
      lipSyncPreset: "custom",
      lipSyncCurvePower: value,
    }));
  }

  function handleLipSyncPresetChange(preset: LipSyncPreset) {
    if (preset === "custom") {
      setAudioDebugState((current) => ({ ...current, lipSyncPreset: "custom" }));
      return;
    }

    const config = LIP_SYNC_PRESETS[preset];
    lipSyncCalibrationRef.current.gain = config.gain;
    lipSyncCalibrationRef.current.noiseGate = config.noiseGate;
    lipSyncCalibrationRef.current.smoothing = config.smoothing;
    lipSyncCalibrationRef.current.maxMouthValue = config.maxMouthValue;
    lipSyncCalibrationRef.current.curvePower = config.curvePower;
    lipSyncCalibrationRef.current.previousMouthValue = 0;

    setAudioDebugState((current) => ({
      ...current,
      lipSyncPreset: preset,
      lipSyncGain: config.gain,
      lipSyncNoiseGate: config.noiseGate,
      lipSyncSmoothing: config.smoothing,
      lipSyncMaxMouthValue: config.maxMouthValue,
      lipSyncCurvePower: config.curvePower,
      externalMouthValue: 0,
      lipSyncIsSaturated: false,
      lipSyncSaturationWarning: null,
    }));
  }

  async function handlePlayTestAudio() {
    const audioUrl = testAudioUrl.trim();
    if (!audioUrl) {
      return;
    }

    if (!audioEnabledRef.current) {
      setAudioDebugState((current) => ({
        ...current,
        lastAudioSource: audioUrl,
        status: "Audio disabled",
      }));
      return;
    }

    await playAudioSource({ audioUrl }, audioUrl, { enableLipSync: true });
  }

  function handleStopAudio() {
    stopAudioPlaybackTalkingControl(true);
    stopAudioLipSync();
    audioPlayer.stop();
    setAudioDebugState((current) => ({
      ...current,
      currentAudioVolume: 0,
      externalMouthValue: 0,
      playbackState: audioPlayer.getState(),
      status: "Audio stopped",
    }));
  }

  function setAutoAvatarControllerStatus(status: string) {
    autoAvatarStatusRef.current = status;
    setAutoAvatarStatus(status);
  }

  function setAutoAvatarControllerPhase(phase: AutoAvatarPhase) {
    currentAutoAvatarPhaseRef.current = phase;
    setCurrentAutoAvatarPhase(phase);
  }

  function handleBrainProviderChange(providerId: BrainProviderId) {
    setBrainProviderId(providerId);
    setBrainError(null);
  }

  function handleOllamaEndpointChange(endpoint: string) {
    setOllamaEndpoint(endpoint);
    setBrainError(null);
  }

  function handleOllamaModelChange(model: string) {
    setOllamaModel(model);
    setBrainError(null);
  }

  function handleCharacterNameChange(name: string) {
    setCharacterName(name);
    setBrainError(null);
  }

  function handleCharacterStyleChange(style: string) {
    setCharacterStyle(style);
    setBrainError(null);
  }

  function handleSystemPromptChange(prompt: string) {
    setSystemPrompt(prompt);
    setBrainError(null);
  }

  function handleLlmReplyMaxLengthChange(value: string) {
    const nextValue = Number.parseInt(value, 10);
    setLlmReplyMaxLength(clampInteger(nextValue, 20, 300, 80));
    setBrainError(null);
  }

  function handleAddMemoryNote() {
    const note = memoryNoteInput.trim();
    if (!note) {
      return;
    }

    setRuntimeSessionMemory((current) => ({
      ...current,
      notes: [...current.notes, note].slice(-12),
    }));
    setMemoryNoteInput("");
  }

  function handleClearSessionMemory() {
    setRuntimeSessionMemory({
      ...createEmptyRuntimeSessionMemory(),
      completedItems: DEFAULT_RUNTIME_COMPLETED_ITEMS,
      brainProvider: brainProviderId,
      ttsProvider: selectedTtsProvider,
      characterName,
    });
  }

  function handleResponseDisplayModeChange(mode: ResponseDisplayMode) {
    setResponseDisplayMode(mode);
  }

  function setPendingAssistantResponse(text: string | null) {
    pendingAssistantTextRef.current = text;
    setPendingAssistantText(text);
  }

  function revealPendingAssistantResponse(baseMessages: ChatMessage[]) {
    const text = pendingAssistantTextRef.current;
    if (!text) {
      return;
    }

    setMessages([
      ...baseMessages,
      {
        role: "assistant",
        content: text,
      },
    ]);
    setPendingAssistantResponse(null);
  }

  async function submitChatText(rawContent: string, source: VoiceTurnSource): Promise<boolean> {
    const content = rawContent.trim();
    if (!content || isSendingRef.current) return false;
    isSendingRef.current = true;

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content,
      },
    ];
    const nextTurnId = currentTurnIdRef.current + 1;
    currentTurnIdRef.current = nextTurnId;
    clearSpeechPlayback(true);
    clearHeldEmotionExpression();
    setPendingAssistantResponse(null);
    setCleanedReplyLength(0);

    setMessages(nextMessages);
    setCurrentTurnId(nextTurnId);
    if (source === "text-manual") setInput("");
    setTranscriptReviewStatus(null);
    setIsSending(true);
    setResponseDisplayStatus("thinking");
    if (!speechEnabledRef.current) {
      setSpeechDebugState((current) => ({
        ...current,
        talkingControlSource: "minimum-talking-duration",
      }));
    }
    chatAvatarController.handleUserMessageSubmitted();
    refreshDebugState(false);
    setBrainError(null);

    let assistantContent = "";
    let shouldPlaySpeech = true;
    try {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
      };

      if (responseDisplayMode === "immediate") {
        setMessages([...nextMessages, assistantMessage]);
      }

      let hasStartedStreaming = false;
      for await (const chunk of brain.streamChat(nextMessages)) {
        if (!hasStartedStreaming) {
          hasStartedStreaming = true;
          chatAvatarController.handleAssistantStreamStarted();
        }
        assistantContent += chunk;
        setCleanedReplyLength(assistantContent.trim().length);
        refreshDebugState(true);
        if (responseDisplayMode === "immediate") {
          setMessages([
            ...nextMessages,
            {
              ...assistantMessage,
              content: assistantContent,
            },
          ]);
        }
      }

      if (responseDisplayMode === "syncWithSpeech") {
        setPendingAssistantResponse(assistantContent);
        setResponseDisplayStatus(
          speechEnabledRef.current ? "waitingForSpeech" : "speechReady",
        );
        if (!speechEnabledRef.current) {
          revealPendingAssistantResponse(nextMessages);
        }
      }
      return true;
    } catch (error) {
      const errorMessage = formatBrainProviderError(
        error,
        brainProviderId,
        ollamaModel.trim() || "qwen3:8b",
      );
      setBrainError(errorMessage);
      if (source === "text-manual") setInput((current) => current.trim() ? current : content);
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
      assistantContent = "";
      shouldPlaySpeech = false;
      setPendingAssistantResponse(null);
      setResponseDisplayStatus("idle");
      return false;
    } finally {
      refreshAvatarDebugState(true, false);
      chatAvatarController.handleAssistantResponseCompleted({
        useMinimumTalkingTimer: !speechEnabledRef.current,
      });
      refreshAvatarDebugState(false, false);
      if (shouldPlaySpeech) {
        await playSpeechIfEnabled(assistantContent, {
          onSpeechReady: () => {
            setResponseDisplayStatus("speechReady");
            if (responseDisplayMode === "syncWithSpeech") {
              revealPendingAssistantResponse(nextMessages);
            }
          },
          onSpeaking: () => setResponseDisplayStatus("speaking"),
          onSpeechFinished: () => setResponseDisplayStatus("idle"),
          onSpeechError: () => {
            if (responseDisplayMode === "syncWithSpeech") {
              revealPendingAssistantResponse(nextMessages);
            }
            setResponseDisplayStatus("idle");
          },
        });
      }
      setIsSending(false);
      isSendingRef.current = false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitChatText(input, "text-manual");
  }

  async function handleManualTtsTest() {
    const text = manualTtsText.trim();
    if (!text) {
      return;
    }

    await synthesizeAndPlaySpeech(text, "manual-speech-duration");
  }

  async function playSpeechIfEnabled(text: string, options: SpeechDisplayCallbacks = {}) {
    if (!speechEnabledRef.current) {
      options.onSpeechFinished?.();
      return;
    }

    if (text.trim().length === 0) {
      clearSpeechPlayback(true);
      options.onSpeechFinished?.();
      return;
    }

    if (ttsQueueEnabledRef.current) {
      await synthesizeAndPlaySpeechQueue(text, detectAssistantEmotion(text), options);
      return;
    }

    await synthesizeAndPlayFullResponse(text, detectAssistantEmotion(text), options);
  }

  async function synthesizeAndPlayFullResponse(
    text: string,
    assistantEmotion: AssistantEmotionDetection,
    options: SpeechDisplayCallbacks = {},
  ) {
    const providerId = selectedTtsProvider;
    const provider = getSelectedTtsProvider(providerId);
    const queueRunId = ttsQueueRunIdRef.current + 1;
    ttsQueueRunIdRef.current = queueRunId;
    enterTtsGeneratingState();
    setSpeechDebugState((current) => ({
      ...current,
      selectedTtsProvider: providerId,
      providerName: provider.providerName,
      lastText: text,
      playbackState: "synthesizing",
      speechStartedAt: null,
      speechEndsAt: null,
      remainingSpeechMs: null,
      talkingControlSource: "speech-duration",
      httpEndpoint: httpTtsEndpoint,
      httpProviderName: httpTtsProviderName,
      lastError: null,
      status: "TTS Mode: Full response; generating full TTS",
      ttsQueueSegmentIndex: null,
      ttsQueueSegmentCount: 0,
      ttsQueueStatus: "Full response",
      isGeneratingNextSegment: false,
      ttsQueueEnabled: ttsQueueEnabledRef.current,
      ttsMode: "fullResponse",
      fillerVoiceStatus: fillerVoiceEnabledRef.current ? "playing" : "idle",
      fillerVoiceWarning: null,
    }));

    const fillerPlaybackPromise = playFillerVoiceIfEnabled(queueRunId, "full response");

    try {
      const result = await provider.synthesize({ text });
      if (queueRunId !== ttsQueueRunIdRef.current || !speechEnabledRef.current) {
        clearSpeechPlayback(true);
        return;
      }

      setSpeechDebugState((current) => ({
        ...current,
        providerName: result.providerName,
        selectedTtsProvider: providerId,
        lastText: text,
        estimatedDurationMs: result.durationMs ?? null,
        hasAudioBlob: Boolean(result.audioBlob),
        hasAudioUrl: Boolean(result.audioUrl),
        playbackState: "synthesizing",
        status: "Full TTS ready; waiting for filler voice",
        ttsQueueStatus: "Full response ready",
      }));

      await fillerPlaybackPromise;

      if (queueRunId !== ttsQueueRunIdRef.current || !speechEnabledRef.current) {
        clearSpeechPlayback(true);
        return;
      }

      setSpeechDebugState((current) => ({
        ...current,
        playbackState: "playing",
        ttsQueueStatus: "Playing full response",
        status: "TTS Mode: Full response; playing full response",
      }));
      options.onSpeechReady?.();
      options.onSpeaking?.();
      await playQueuedSpeechSegment(text, result, providerId, assistantEmotion);

      if (queueRunId !== ttsQueueRunIdRef.current) {
        return;
      }

      finishSpeechPlayback("speech-duration", "Full response TTS finished");
      options.onSpeechFinished?.();
      setSpeechDebugState((current) => ({
        ...current,
        ttsQueueStatus: "Full response finished",
        isGeneratingNextSegment: false,
      }));
    } catch (error) {
      if (queueRunId !== ttsQueueRunIdRef.current) {
        return;
      }

      await fillerPlaybackPromise;
      options.onSpeechError?.();
      clearSpeechPlayback(true);
      setSpeechDebugState((current) => ({
        ...current,
        playbackState: "error",
        remainingSpeechMs: 0,
        lastError: getErrorMessage(error),
        status: `Speech error: ${getErrorMessage(error)}`,
        ttsQueueStatus: "Full response failed",
        isGeneratingNextSegment: false,
      }));
    }
  }

  async function synthesizeAndPlaySpeechQueue(
    text: string,
    assistantEmotion: AssistantEmotionDetection,
    options: SpeechDisplayCallbacks = {},
  ) {
    const segments = splitTextIntoTtsSegments(text);
    if (segments.length === 0) {
      clearSpeechPlayback(true);
      return;
    }

    const providerId = selectedTtsProvider;
    const provider = getSelectedTtsProvider(providerId);
    const queueRunId = ttsQueueRunIdRef.current + 1;
    ttsQueueRunIdRef.current = queueRunId;
    enterTtsGeneratingState();
    setSpeechDebugState((current) => ({
      ...current,
      selectedTtsProvider: providerId,
      providerName: provider.providerName,
      lastText: text,
      playbackState: "synthesizing",
      speechStartedAt: null,
      speechEndsAt: null,
      remainingSpeechMs: null,
      talkingControlSource: "speech-duration",
      httpEndpoint: httpTtsEndpoint,
      httpProviderName: httpTtsProviderName,
      lastError: null,
      status: `TTS Queue: segment 1 / ${segments.length}; generating first segment`,
      ttsQueueSegmentIndex: 1,
      ttsQueueSegmentCount: segments.length,
      ttsQueueStatus: "Generating segment 1",
      isGeneratingNextSegment: false,
      ttsQueueEnabled: true,
      ttsMode: "sentenceQueue",
      fillerVoiceStatus: fillerVoiceEnabledRef.current ? "playing" : "idle",
      fillerVoiceWarning: null,
    }));

    const synthesizeSegment = async (segment: string, index: number) => {
      setSpeechDebugState((current) => ({
        ...current,
        playbackState: current.playbackState === "playing" ? current.playbackState : "synthesizing",
        status:
          index === 0
            ? `TTS Queue: segment 1 / ${segments.length}; generating first segment`
            : `TTS Queue: segment ${index + 1} / ${segments.length}; generating next segment...`,
        ttsQueueSegmentIndex: index + 1,
        ttsQueueSegmentCount: segments.length,
        ttsQueueStatus:
          index === 0 ? `Generating segment ${index + 1}` : "Generating next segment...",
        isGeneratingNextSegment: index > 0,
      }));
      return provider.synthesize({ text: segment });
    };

    const prepareSegmentPromise = (segment: string, index: number) => {
      const promise = synthesizeSegment(segment, index);
      void promise.catch(() => undefined);
      return promise;
    };

    const fillerPlaybackPromise = playFillerVoiceIfEnabled(queueRunId, "TTS queue");
    let nextResultPromise: Promise<TTSResult> | null = prepareSegmentPromise(segments[0], 0);

    try {
      for (let index = 0; index < segments.length; index += 1) {
        if (queueRunId !== ttsQueueRunIdRef.current || !speechEnabledRef.current) {
          clearSpeechPlayback(true);
          return;
        }

        const segmentText = segments[index];
        if (nextResultPromise === null) {
          throw new Error(`TTS segment ${index + 1} was not scheduled`);
        }

        let result: TTSResult;
        try {
          result = await nextResultPromise;
        } catch (error) {
          throw new Error(`TTS segment ${index + 1} failed: ${getErrorMessage(error)}`);
        }

        if (index === 0) {
          await fillerPlaybackPromise;
        }

        nextResultPromise =
          index + 1 < segments.length
            ? prepareSegmentPromise(segments[index + 1], index + 1)
            : null;

        setSpeechDebugState((current) => ({
          ...current,
          providerName: result.providerName,
          selectedTtsProvider: providerId,
          lastText: segmentText,
          estimatedDurationMs: result.durationMs ?? null,
          hasAudioBlob: Boolean(result.audioBlob),
          hasAudioUrl: Boolean(result.audioUrl),
          playbackState: "playing",
          ttsQueueSegmentIndex: index + 1,
          ttsQueueSegmentCount: segments.length,
          ttsQueueStatus: `Playing segment ${index + 1} / ${segments.length}`,
          isGeneratingNextSegment: nextResultPromise !== null,
          status: `TTS Queue: playing segment ${index + 1} / ${segments.length}${
            nextResultPromise ? "; generating next segment..." : ""
          }`,
        }));

        if (index === 0) {
          options.onSpeechReady?.();
          options.onSpeaking?.();
        }
        await playQueuedSpeechSegment(segmentText, result, providerId, assistantEmotion);
      }

      if (queueRunId !== ttsQueueRunIdRef.current) {
        return;
      }

      finishSpeechPlayback("speech-duration", "TTS queue finished");
      options.onSpeechFinished?.();
      setSpeechDebugState((current) => ({
        ...current,
        ttsQueueSegmentIndex: segments.length,
        ttsQueueSegmentCount: segments.length,
        ttsQueueStatus: "finished",
        isGeneratingNextSegment: false,
      }));
    } catch (error) {
      if (queueRunId !== ttsQueueRunIdRef.current) {
        return;
      }

      clearSpeechPlayback(true);
      options.onSpeechError?.();
      setSpeechDebugState((current) => ({
        ...current,
        playbackState: "error",
        remainingSpeechMs: 0,
        lastError: getErrorMessage(error),
        status: getErrorMessage(error),
        ttsQueueStatus: getErrorMessage(error),
        isGeneratingNextSegment: false,
      }));
    }
  }

  async function synthesizeAndPlaySpeech(
    text: string,
    talkingControlSource: TalkingControlSource,
    providerOverride?: TtsProviderId,
  ) {
    ttsQueueRunIdRef.current += 1;
    const providerId = providerOverride ?? selectedTtsProvider;
    const provider = getSelectedTtsProvider(providerId);
    enterTtsGeneratingState();
    setSpeechDebugState((current) => ({
      ...current,
      selectedTtsProvider: providerId,
      providerName: provider.providerName,
      lastText: text,
      playbackState: "synthesizing",
      speechStartedAt: null,
      speechEndsAt: null,
      remainingSpeechMs: null,
      talkingControlSource,
      httpEndpoint: httpTtsEndpoint,
      httpProviderName: httpTtsProviderName,
      lastError: null,
      status: "Synthesizing TTS",
      ttsQueueSegmentIndex: null,
      ttsQueueSegmentCount: 0,
      ttsQueueStatus: "manual single request",
      isGeneratingNextSegment: false,
      ttsQueueEnabled: ttsQueueEnabledRef.current,
      ttsMode: "fullResponse",
      fillerVoiceStatus: "idle",
      fillerVoiceWarning: null,
    }));

    try {
      const result = await provider.synthesize({ text });
      if (talkingControlSource === "speech-duration" && !speechEnabledRef.current) {
        clearSpeechPlayback(true);
        return;
      }
      startSpeechBridgePlayback(text, result, talkingControlSource, providerId);
    } catch (error) {
      clearSpeechPlayback(true);
      setSpeechDebugState((current) => ({
        ...current,
        lastText: text,
        playbackState: "error",
        speechStartedAt: null,
        speechEndsAt: null,
        remainingSpeechMs: null,
        talkingControlSource,
        lastError: getErrorMessage(error),
        status: `Speech error: ${getErrorMessage(error)}`,
      }));
    }
  }

  function enterTtsGeneratingState() {
    clearSpeechPlayback(true);
    vrmRenderer.setTalkingOverlayActive(false);
    vrmRenderer.setMouthOnlyOverlayActive(false);
    vrmRenderer.setExternalMouthValue(0);
    vrmRenderer.setMouthDrivingMode("auto");
    setAudioDebugState((current) => ({
      ...current,
      currentAudioVolume: 0,
      externalMouthValue: 0,
      lipSyncIsSaturated: false,
      lipSyncSaturationWarning: null,
    }));
  }

  function playFillerVoiceIfEnabled(queueRunId: number, ttsContext: string) {
    const fillerUrl = fillerVoiceUrlRef.current.trim();
    if (!fillerVoiceEnabledRef.current || !fillerUrl) {
      setSpeechDebugState((current) => ({
        ...current,
        fillerVoiceStatus: "idle",
      }));
      return Promise.resolve();
    }

    if (!audioEnabledRef.current) {
      const warning = "Filler voice skipped because Audio Playback Enabled is Off.";
      setSpeechDebugState((current) => ({
        ...current,
        fillerVoiceStatus: "failed",
        fillerVoiceWarning: warning,
        status: `${warning} Continuing TTS queue.`,
      }));
      return Promise.resolve();
    }

    setSpeechDebugState((current) => ({
      ...current,
      fillerVoiceStatus: "playing",
      fillerVoiceWarning: null,
      fillerMotionMode: fillerMotionModeRef.current,
      status: `Filler voice playing (${fillerMotionModeRef.current}); generating ${ttsContext}...`,
    }));

    return new Promise<void>((resolve) => {
      const fillerMotionMode = fillerMotionModeRef.current;
      void playAudioSource({ audioUrl: fillerUrl }, fillerUrl, {
        controlTalkingOverlay: fillerMotionMode === "speaking",
        enableLipSync: lipSyncEnabledRef.current,
        mouthOnlyOverlay: fillerMotionMode === "minimal",
        speakingFaceMode: "keepCurrent",
        talkingControlSource: lipSyncEnabledRef.current ? "audio-analyser" : "audio-playback",
        onStarted: () => {
          if (queueRunId !== ttsQueueRunIdRef.current) {
            return;
          }

          setSpeechDebugState((current) => ({
            ...current,
            fillerVoiceStatus: "playing",
            fillerMotionMode,
            status: `Filler voice playing (${fillerMotionMode}); generating ${ttsContext}...`,
          }));
        },
        onFinished: () => {
          if (queueRunId === ttsQueueRunIdRef.current) {
            setSpeechDebugState((current) => ({
              ...current,
              fillerVoiceStatus: "idle",
              status: `Filler voice finished; waiting for ${ttsContext}`,
            }));
          }
          resolve();
        },
        onError: () => {
          const warning = "Filler voice playback failed; continuing TTS queue.";
          if (queueRunId === ttsQueueRunIdRef.current) {
            setSpeechDebugState((current) => ({
              ...current,
              fillerVoiceStatus: "failed",
              fillerVoiceWarning: warning,
              status: warning,
            }));
          }
          resolve();
        },
      });
    });
  }

  function getSelectedTtsProvider(providerId = selectedTtsProvider): ITTSProvider {
    if (providerId === "http-tts") {
      return new HttpTTSProvider(
        httpTtsEndpoint.trim() || "http://localhost:7861/tts",
        httpTtsProviderName.trim() || "indextts2-http",
      );
    }

    return ttsProviders[providerId];
  }

  function startSpeechBridgePlayback(
    text: string,
    result: TTSResult,
    talkingControlSource: TalkingControlSource,
    providerId: TtsProviderId,
    assistantEmotion?: AssistantEmotionDetection | null,
  ) {
    const source = getAudioPlaybackSourceFromTtsResult(result);
    const hasAudioSource = source !== null;

    if (hasAudioSource && audioEnabledRef.current) {
      const nextTalkingControlSource = lipSyncEnabledRef.current ? "audio-analyser" : "audio-playback";
      setSpeechDebugState((current) => ({
        ...current,
        providerName: result.providerName,
        selectedTtsProvider: providerId,
        lastText: text,
        estimatedDurationMs: result.durationMs ?? null,
        hasAudioBlob: Boolean(result.audioBlob),
        hasAudioUrl: Boolean(result.audioUrl),
        playbackState: "synthesizing",
        speechStartedAt: null,
        speechEndsAt: null,
        remainingSpeechMs: null,
        talkingControlSource: nextTalkingControlSource,
        httpEndpoint: httpTtsEndpoint,
        httpProviderName: httpTtsProviderName,
        lastError: null,
        status: "TTS audio ready; starting audio playback",
      }));
      void playAudioSource(source, getAudioSourceLabel(source), {
        controlTalkingOverlay: true,
        enableLipSync: lipSyncEnabledRef.current,
        speakingFaceMode:
          talkingControlSource === "manual-speech-duration"
            ? "keepCurrent"
            : speakingFaceModeRef.current,
        assistantEmotion,
        talkingControlSource: nextTalkingControlSource,
        onStarted: () =>
          startSpeechDebugPlayback(text, result, nextTalkingControlSource, providerId),
        onFinished: () => finishSpeechPlayback(nextTalkingControlSource, "Speech audio finished"),
        onError: (error) => failSpeechPlayback(text, nextTalkingControlSource, error),
      });
      return;
    }

    if (hasAudioSource && !audioEnabledRef.current) {
      const audioOffStatus =
        providerId === "http-tts"
          ? "HTTP TTS returned audio, but Audio Playback Enabled is Off"
          : "TTS returned audio, but Audio Playback Enabled is Off";
      clearIntervalRef(speechRemainingIntervalRef);
      clearTimeoutRef(speechPlaybackTimeoutRef);
      speechEndsAtRef.current = null;
      setAudioDebugState((current) => ({
        ...current,
        lastAudioSource: getAudioSourceLabel(source),
        playbackState: audioPlayer.getState(),
        status: audioOffStatus,
      }));
      setSpeechDebugState((current) => ({
        ...current,
        providerName: result.providerName,
        selectedTtsProvider: providerId,
        lastText: text,
        estimatedDurationMs: result.durationMs ?? null,
        hasAudioBlob: Boolean(result.audioBlob),
        hasAudioUrl: Boolean(result.audioUrl),
        playbackState: "finished",
        speechStartedAt: null,
        speechEndsAt: null,
        remainingSpeechMs: null,
        talkingControlSource,
        httpEndpoint: httpTtsEndpoint,
        httpProviderName: httpTtsProviderName,
        lastError: null,
        status: audioOffStatus,
      }));
      return;
    }

    if (!hasAudioSource) {
      setAudioDebugState((current) => ({
        ...current,
        playbackState: audioPlayer.getState(),
        lastAudioSource: "none",
        status: "No audio source from TTS",
      }));
    }

    startDurationSpeechPlayback(text, result, talkingControlSource, providerId, assistantEmotion);
  }

  function playQueuedSpeechSegment(
    text: string,
    result: TTSResult,
    providerId: TtsProviderId,
    assistantEmotion?: AssistantEmotionDetection | null,
  ) {
    const source = getAudioPlaybackSourceFromTtsResult(result);
    const hasAudioSource = source !== null;

    if (hasAudioSource && audioEnabledRef.current) {
      const nextTalkingControlSource = lipSyncEnabledRef.current ? "audio-analyser" : "audio-playback";
      setSpeechDebugState((current) => ({
        ...current,
        providerName: result.providerName,
        selectedTtsProvider: providerId,
        lastText: text,
        estimatedDurationMs: result.durationMs ?? null,
        hasAudioBlob: Boolean(result.audioBlob),
        hasAudioUrl: Boolean(result.audioUrl),
        playbackState: "synthesizing",
        speechStartedAt: null,
        speechEndsAt: null,
        remainingSpeechMs: null,
        talkingControlSource: nextTalkingControlSource,
        httpEndpoint: httpTtsEndpoint,
        httpProviderName: httpTtsProviderName,
        lastError: null,
      }));

      return new Promise<void>((resolve, reject) => {
        void playAudioSource(source, getAudioSourceLabel(source), {
          controlTalkingOverlay: true,
          enableLipSync: lipSyncEnabledRef.current,
          speakingFaceMode: speakingFaceModeRef.current,
          assistantEmotion,
          talkingControlSource: nextTalkingControlSource,
          onStarted: () =>
            startSpeechDebugPlayback(text, result, nextTalkingControlSource, providerId),
          onFinished: () => resolve(),
          onError: (error) => reject(error),
        });
      });
    }

    if (hasAudioSource && !audioEnabledRef.current) {
      const audioOffStatus = "TTS returned audio, but Audio Playback Enabled is Off";
      setAudioDebugState((current) => ({
        ...current,
        lastAudioSource: getAudioSourceLabel(source),
        playbackState: audioPlayer.getState(),
        status: audioOffStatus,
      }));
      setSpeechDebugState((current) => ({
        ...current,
        providerName: result.providerName,
        selectedTtsProvider: providerId,
        lastText: text,
        estimatedDurationMs: result.durationMs ?? null,
        hasAudioBlob: Boolean(result.audioBlob),
        hasAudioUrl: Boolean(result.audioUrl),
        playbackState: "finished",
        speechStartedAt: null,
        speechEndsAt: null,
        remainingSpeechMs: null,
        talkingControlSource: "speech-duration",
        httpEndpoint: httpTtsEndpoint,
        httpProviderName: httpTtsProviderName,
        lastError: null,
        status: audioOffStatus,
      }));
      return Promise.resolve();
    }

    if (!hasAudioSource) {
      setAudioDebugState((current) => ({
        ...current,
        playbackState: audioPlayer.getState(),
        lastAudioSource: "none",
        status: "No audio source from TTS",
      }));
    }

    return new Promise<void>((resolve) => {
      const durationMs = result.durationMs ?? minimumTalkingDurationMsRef.current;
      startSpeechDebugPlayback(text, result, "speech-duration", providerId);
      applySpeakingFaceMode(speakingFaceModeRef.current);
      startAssistantResponseExpression(assistantEmotion ?? null);
      vrmRenderer.setTalkingOverlayActive(true);
      clearTimeoutRef(speechPlaybackTimeoutRef);
      speechPlaybackTimeoutRef.current = window.setTimeout(() => {
        clearSpeechPlayback(true);
        resolve();
      }, durationMs);
    });
  }

  function startSpeechDebugPlayback(
    text: string,
    result: TTSResult,
    talkingControlSource: TalkingControlSource,
    providerId: TtsProviderId,
  ) {
    const durationMs = result.durationMs ?? minimumTalkingDurationMsRef.current;
    const speechStartedAt = Date.now();
    const speechEndsAt = speechStartedAt + durationMs;
    speechEndsAtRef.current = speechEndsAt;

    setSpeechDebugState((current) => ({
      ...current,
      enabled: speechEnabledRef.current,
      providerName: result.providerName,
      selectedTtsProvider: providerId,
      lastText: text,
      estimatedDurationMs: durationMs,
      hasAudioBlob: Boolean(result.audioBlob),
      hasAudioUrl: Boolean(result.audioUrl),
      playbackState: "playing",
      speechStartedAt,
      speechEndsAt,
      remainingSpeechMs: durationMs,
      talkingControlSource,
      httpEndpoint: httpTtsEndpoint,
      httpProviderName: httpTtsProviderName,
      lastError: null,
      status: "TTS playing",
    }));

    clearIntervalRef(speechRemainingIntervalRef);
    speechRemainingIntervalRef.current = window.setInterval(() => {
      const nextRemainingMs = Math.max(0, speechEndsAt - Date.now());
      setSpeechDebugState((current) => ({
        ...current,
        remainingSpeechMs: nextRemainingMs,
      }));
    }, 250);
  }

  function startDurationSpeechPlayback(
    text: string,
    result: TTSResult,
    talkingControlSource: TalkingControlSource,
    providerId: TtsProviderId,
    assistantEmotion?: AssistantEmotionDetection | null,
  ) {
    const durationMs = result.durationMs ?? minimumTalkingDurationMsRef.current;
    startSpeechDebugPlayback(text, result, talkingControlSource, providerId);

    applySpeakingFaceMode(
      talkingControlSource === "manual-speech-duration"
        ? "keepCurrent"
        : speakingFaceModeRef.current,
    );
    startAssistantResponseExpression(assistantEmotion ?? null);
    vrmRenderer.setTalkingOverlayActive(true);
    clearTimeoutRef(speechPlaybackTimeoutRef);

    speechPlaybackTimeoutRef.current = window.setTimeout(() => {
      clearSpeechPlayback(true);
      finishSpeechPlayback(talkingControlSource, "TTS finished");
    }, durationMs);
  }

  async function playAudioSource(
    source: AudioPlaybackSource,
    sourceLabel: string,
    options: {
      controlTalkingOverlay?: boolean;
      enableLipSync: boolean;
      mouthOnlyOverlay?: boolean;
      speakingFaceMode?: SpeakingFaceMode;
      assistantEmotion?: AssistantEmotionDetection | null;
      talkingControlSource?: TalkingControlSource;
      onStarted?: () => void;
      onFinished?: () => void;
      onError?: (error: unknown) => void;
    },
  ) {
    stopAudioPlaybackTalkingControl(false);
    stopAudioLipSync();
    setAudioDebugState((current) => ({
      ...current,
      lastAudioSource: sourceLabel,
      playbackState: "loading",
      status: "Audio loading",
    }));

    try {
      await audioPlayer.play(source);
      setAudioDebugState((current) => ({
        ...current,
        lastAudioSource: sourceLabel,
        playbackState: audioPlayer.getState(),
        status: "Audio playing",
      }));
      options.onStarted?.();
      applySpeakingFaceMode(options.speakingFaceMode ?? "keepCurrent");
      startAssistantResponseExpression(options.assistantEmotion ?? null);

      if (options.enableLipSync && lipSyncEnabledRef.current) {
        const shouldUseMouthOnlyOverlay = options.mouthOnlyOverlay ?? false;
        const shouldControlTalkingOverlay =
          options.controlTalkingOverlay ?? !shouldUseMouthOnlyOverlay;
        startAudioLipSync(options.onFinished, {
          controlTalkingOverlay: shouldControlTalkingOverlay,
          mouthOnlyOverlay: shouldUseMouthOnlyOverlay,
        });
      } else if (options.controlTalkingOverlay) {
        startAudioPlaybackTalkingControl(options.onFinished);
      }
    } catch (error) {
      if (options.enableLipSync) {
        stopAudioLipSync();
      }
      if (options.controlTalkingOverlay) {
        stopAudioPlaybackTalkingControl(true);
      }
      options.onError?.(error);
      setAudioDebugState((current) => ({
        ...current,
        lastAudioSource: sourceLabel,
        playbackState: audioPlayer.getState(),
        status: `Audio error: ${getErrorMessage(error)}`,
      }));
    }
  }

  function applySpeakingFaceMode(mode: SpeakingFaceMode) {
    if (mode === "keepCurrent") {
      return;
    }

    if (!vrmRenderer.getDebugState().hasVrm) {
      return;
    }

    if (mode === "smoothCenter") {
      vrmRenderer.setFacingDirectionSmooth("front", 1000);
      return;
    }

    vrmRenderer.setFacingDirection("front");
  }

  function startAssistantResponseExpression(assistantEmotion: AssistantEmotionDetection | null) {
    clearAssistantResponseExpression(true);
    if (!assistantEmotion || emotionExpressionModeRef.current === "off") {
      if (assistantEmotion) {
        setDetectedAssistantEmotion(assistantEmotion.emotion);
        setDetectedAssistantEmotionIntensity(assistantEmotion.intensity);
      }
      setExpressionSource("none");
      return;
    }

    const expressionName = mapAssistantEmotionToExpression(
      assistantEmotion.emotion,
      vrmRenderer.getCapabilities().availableExpressions,
    );
    setDetectedAssistantEmotion(assistantEmotion.emotion);
    setDetectedAssistantEmotionIntensity(assistantEmotion.intensity);

    if (!expressionName) {
      setActiveAssistantExpression(null);
      setExpressionSource("none");
      return;
    }

    assistantActiveExpressionRef.current = expressionName;
    assistantExpressionSourceRef.current = "assistant-response";
    setActiveAssistantExpression(expressionName);
    setExpressionSource("assistant-response");

    if (emotionExpressionModeRef.current === "pulse") {
      runAssistantExpressionPulse(expressionName, assistantEmotion.intensity);
      return;
    }

    runAssistantExpressionHold(expressionName, assistantEmotion.intensity);
  }

  function runAssistantExpressionHold(expressionName: string, intensity: number) {
    const targetValue = clamp(intensity, 0, 1);
    let currentValue = 0;
    assistantExpressionIntervalRef.current = window.setInterval(() => {
      currentValue += (targetValue - currentValue) * 0.28;
      vrmRenderer.setExpression(expressionName, currentValue);
      heldEmotionExpressionRef.current = expressionName;
      heldEmotionExpressionValueRef.current = currentValue;
      setHeldEmotionExpression(expressionName);
      setHeldEmotionExpressionValue(currentValue);
    }, 50);
  }

  function runAssistantExpressionPulse(expressionName: string, intensity: number) {
    const startedAt = Date.now();
    const targetValue = clamp(intensity, 0, 1);
    assistantExpressionIntervalRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const envelope = getExpressionPulseEnvelope(elapsedMs);
      const value = targetValue * envelope;
      vrmRenderer.setExpression(expressionName, value);
      heldEmotionExpressionRef.current = expressionName;
      heldEmotionExpressionValueRef.current = value;
      setHeldEmotionExpression(expressionName);
      setHeldEmotionExpressionValue(value);

      if (elapsedMs >= 2400) {
        clearAssistantResponseExpression(true);
      }
    }, 50);
  }

  function clearAssistantResponseExpression(immediate: boolean) {
    clearIntervalRef(assistantExpressionIntervalRef);
    const expressionName = assistantActiveExpressionRef.current;
    if (!expressionName) {
      assistantExpressionSourceRef.current = "none";
      setExpressionSource("none");
      setActiveAssistantExpression(null);
      return;
    }

    if (immediate) {
      vrmRenderer.setExpression(expressionName, 0);
      assistantActiveExpressionRef.current = null;
      assistantExpressionSourceRef.current = "none";
      heldEmotionExpressionRef.current = null;
      heldEmotionExpressionValueRef.current = 0;
      setActiveAssistantExpression(null);
      setExpressionSource("none");
      setHeldEmotionExpression(null);
      setHeldEmotionExpressionValue(0);
      return;
    }

    let currentValue = heldEmotionExpressionValueRef.current;
    assistantExpressionIntervalRef.current = window.setInterval(() => {
      currentValue += (0 - currentValue) * 0.35;
      vrmRenderer.setExpression(expressionName, currentValue);
      heldEmotionExpressionRef.current = expressionName;
      heldEmotionExpressionValueRef.current = currentValue;
      setHeldEmotionExpressionValue(currentValue);

      if (currentValue < 0.01) {
        clearIntervalRef(assistantExpressionIntervalRef);
        vrmRenderer.setExpression(expressionName, 0);
        assistantActiveExpressionRef.current = null;
        assistantExpressionSourceRef.current = "none";
        heldEmotionExpressionRef.current = null;
        heldEmotionExpressionValueRef.current = 0;
        setActiveAssistantExpression(null);
        setExpressionSource("none");
        setHeldEmotionExpression(null);
        setHeldEmotionExpressionValue(0);
      }
    }, 50);
  }

  function startAudioLipSync(
    onFinished?: () => void,
    options: { controlTalkingOverlay: boolean; mouthOnlyOverlay: boolean } = {
      controlTalkingOverlay: true,
      mouthOnlyOverlay: false,
    },
  ) {
    stopAudioLipSync();
    const audio = audioPlayer.getAudioElement();
    if (!audio) {
      return;
    }

    try {
      audioAnalyser.connect(audio);
      vrmRenderer.setMouthDrivingMode("external");
      if (options.mouthOnlyOverlay) {
        vrmRenderer.setMouthOnlyOverlayActive(true);
        lipSyncMouthOnlyActiveRef.current = true;
      }
      if (options.controlTalkingOverlay) {
        vrmRenderer.setTalkingOverlayActive(true);
        lipSyncActiveRef.current = true;
      }
      lipSyncCalibrationRef.current.previousMouthValue = 0;
      lipSyncIntervalRef.current = window.setInterval(() => {
        const rawVolume = audioAnalyser.getVolume();
        const calibratedMouthValue = calibrateLipSyncVolume(
          rawVolume,
          lipSyncCalibrationRef.current,
        );
        const isSaturated = calibratedMouthValue >= 0.98;
        const saturationWarning = isSaturated
          ? "Lip sync saturated: reduce gain or max mouth"
          : null;
        lipSyncCalibrationRef.current.previousMouthValue = calibratedMouthValue;
        vrmRenderer.setExternalMouthValue(calibratedMouthValue);
        setAudioDebugState((current) => ({
          ...current,
          currentAudioVolume: rawVolume,
          externalMouthValue: calibratedMouthValue,
          lipSyncIsSaturated: isSaturated,
          lipSyncSaturationWarning: saturationWarning,
        }));

        const playbackState = audioPlayer.getState();
        if (playbackState === "finished" || playbackState === "error" || playbackState === "idle") {
          stopAudioLipSync();
          onFinished?.();
        }
      }, 50);
    } catch (error) {
      stopAudioLipSync();
      setAudioDebugState((current) => ({
        ...current,
        status: `Audio analyser error: ${getErrorMessage(error)}`,
      }));
    }
  }

  function stopAudioLipSync() {
    clearIntervalRef(lipSyncIntervalRef);
    audioAnalyser.dispose();
    vrmRenderer.setExternalMouthValue(0);
    vrmRenderer.setMouthDrivingMode("auto");
    lipSyncCalibrationRef.current.previousMouthValue = 0;
    if (lipSyncMouthOnlyActiveRef.current) {
      vrmRenderer.setMouthOnlyOverlayActive(false);
    }
    if (lipSyncActiveRef.current) {
      vrmRenderer.setTalkingOverlayActive(false);
    }
    lipSyncActiveRef.current = false;
    lipSyncMouthOnlyActiveRef.current = false;
    setAudioDebugState((current) => ({
      ...current,
      currentAudioVolume: 0,
      externalMouthValue: 0,
      lipSyncIsSaturated: false,
      lipSyncSaturationWarning: null,
    }));
  }

  function startAudioPlaybackTalkingControl(onFinished?: () => void) {
    stopAudioPlaybackTalkingControl(false);
    vrmRenderer.setTalkingOverlayActive(true);

    audioPlaybackTalkingIntervalRef.current = window.setInterval(() => {
      const playbackState = audioPlayer.getState();
      setAudioDebugState((current) => ({
        ...current,
        playbackState,
      }));

      if (playbackState === "finished" || playbackState === "error" || playbackState === "idle") {
        stopAudioPlaybackTalkingControl(true);
        onFinished?.();
      }
    }, 50);
  }

  function stopAudioPlaybackTalkingControl(stopTalkingOverlay: boolean) {
    clearIntervalRef(audioPlaybackTalkingIntervalRef);

    if (stopTalkingOverlay) {
      vrmRenderer.setTalkingOverlayActive(false);
    }
  }

  function finishSpeechPlayback(talkingControlSource: TalkingControlSource, status: string) {
    clearTimeoutRef(speechPlaybackTimeoutRef);
    clearIntervalRef(speechRemainingIntervalRef);
    speechEndsAtRef.current = null;
    setSpeechDebugState((current) => ({
      ...current,
      playbackState: "finished",
      remainingSpeechMs: 0,
      talkingControlSource,
      lastError: null,
      status,
    }));
    vrmRenderer.setThinkingOverlayActive(false);
    clearAssistantResponseExpression(false);
  }

  function failSpeechPlayback(
    text: string,
    talkingControlSource: TalkingControlSource,
    error: unknown,
  ) {
    clearSpeechPlayback(true);
    setSpeechDebugState((current) => ({
      ...current,
      lastText: text,
      playbackState: "error",
      remainingSpeechMs: 0,
      talkingControlSource,
      lastError: getErrorMessage(error),
      status: `Speech audio error: ${getErrorMessage(error)}`,
    }));
  }

  function clearSpeechPlayback(stopTalkingOverlay: boolean) {
    clearTimeoutRef(speechPlaybackTimeoutRef);
    clearIntervalRef(speechRemainingIntervalRef);
    stopAudioPlaybackTalkingControl(false);
    speechEndsAtRef.current = null;

    if (stopTalkingOverlay) {
      stopAudioLipSync();
      audioPlayer.stop();
      vrmRenderer.setTalkingOverlayActive(false);
      vrmRenderer.setMouthOnlyOverlayActive(false);
      vrmRenderer.setThinkingOverlayActive(false);
      clearAssistantResponseExpression(true);
      clearHeldEmotionExpression();
      setSpeechDebugState((current) => ({
        ...current,
        fillerVoiceStatus: "idle",
      }));
    }
  }

  function clearHeldEmotionExpression() {
    const expressionName = heldEmotionExpressionRef.current;
    if (expressionName !== null) {
      vrmRenderer.setExpression(expressionName, 0);
    }

    heldEmotionExpressionRef.current = null;
    heldEmotionExpressionValueRef.current = 0;
    setHeldEmotionExpression(null);
    setHeldEmotionExpressionValue(0);
  }

  useEffect(() => {
    setEmotionMappingDebug((current) => ({
      ...current,
      autoAvatarStatus,
      currentAutoAvatarPhase,
    }));
  }, [autoAvatarStatus, currentAutoAvatarPhase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setVrmDebugSnapshot(vrmRenderer.getDebugState());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [vrmRenderer]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setAudioDebugState((current) => ({
        ...current,
        playbackState: audioPlayer.getState(),
      }));
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [audioPlayer]);

  useEffect(() => {
    if (audioInputDisposeTimerRef.current !== null) {
      window.clearTimeout(audioInputDisposeTimerRef.current);
      audioInputDisposeTimerRef.current = null;
    }

    return audioInput.subscribe(setAudioInputSnapshot);
  }, [audioInput]);

  useEffect(() => {
    if (audioInputSnapshot.selectedDeviceId) {
      writeStoredString(STORAGE_KEYS.audioInputSelectedDevice, audioInputSnapshot.selectedDeviceId);
    }
  }, [audioInputSnapshot.selectedDeviceId]);

  useEffect(
    () => () => {
      // Delay disposal by one turn so React StrictMode's development-only effect
      // replay can resubscribe to the same provider without recreating a stream.
      audioInputDisposeTimerRef.current = window.setTimeout(() => {
        void audioInput.dispose();
        audioInputDisposeTimerRef.current = null;
      }, 0);
    },
    [audioInput],
  );

  useEffect(() => {
    if (vadDisposeTimerRef.current !== null) {
      window.clearTimeout(vadDisposeTimerRef.current);
      vadDisposeTimerRef.current = null;
    }

    return voiceActivityDetector.subscribe(setVadSnapshot);
  }, [voiceActivityDetector]);

  useEffect(() => {
    if (audioSegmentCaptureDisposeTimerRef.current !== null) {
      window.clearTimeout(audioSegmentCaptureDisposeTimerRef.current);
      audioSegmentCaptureDisposeTimerRef.current = null;
    }

    return audioSegmentCapture.subscribe(setAudioSegmentCaptureSnapshot);
  }, [audioSegmentCapture]);

  useEffect(() => {
    if (speechRecognitionDisposeTimerRef.current !== null) {
      window.clearTimeout(speechRecognitionDisposeTimerRef.current);
      speechRecognitionDisposeTimerRef.current = null;
    }
    return speechRecognitionService.subscribe(setSpeechRecognitionSnapshot);
  }, [speechRecognitionService]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (motionMenu) setMotionMenu(null);
      else if (transcriptReviewOpen) setTranscriptReviewOpen(false);
      else if (developerDrawerOpen) setDeveloperDrawerOpen(false);
      else if (settingsDrawerOpen) setSettingsDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [developerDrawerOpen, motionMenu, settingsDrawerOpen, transcriptReviewOpen]);

  useEffect(() => {
    return audioSegmentCapture.onSegment((segment) => {
      const stageVoiceMode = stageVoiceModeRef.current;
      if (stageVoiceMode) {
        if (stageVoiceMode === "manual") {
          stageVoiceModeRef.current = null;
        }
        setVoiceTurnStatus("processing");
        void speechRecognitionService
          .transcribeSegment(segment, { language: sttLanguage })
          .then((result) => submitVoiceTranscript(result, stageVoiceMode === "vad" ? "voice-vad" : "voice-manual"))
          .catch(() => {
            setVoiceTurnStatus("failed");
            setVoiceTurnNotice("Voice transcription failed. Transcript history remains available in Developer.");
          });
      } else if (speechRecognitionService.getSnapshot().autoTranscribeEnabled) {
        void speechRecognitionService.transcribeSegment(segment, { language: sttLanguage }).catch(() => undefined);
      }
    });
  }, [audioSegmentCapture, speechRecognitionService, sttLanguage]);

  useEffect(() => {
    audioSegmentCapture.bindVad(voiceActivityDetector);
    return () => audioSegmentCapture.unbindVad();
  }, [audioSegmentCapture, voiceActivityDetector]);

  useEffect(() => {
    const hasActiveInput = audioInputSnapshot.activeTrackCount > 0;
    const inputSource = hasActiveInput ? audioInput.getInputAudioNode() : null;
    const inputEndReason = hasActiveInput || audioInputSnapshot.status === "error" ? "device-lost" : "stopped";
    voiceActivityDetector.setInputSource(
      inputSource,
      hasActiveInput ? audioInputSnapshot.inputSessionId : null,
      inputEndReason,
    );
    voiceActivityDetector.setInputMuted(audioInputSnapshot.muted);
    audioSegmentCapture.setInputSource(
      inputSource,
      hasActiveInput ? audioInputSnapshot.inputSessionId : null,
      inputEndReason,
    );
    audioSegmentCapture.setInputMuted(audioInputSnapshot.muted);
  }, [audioInput, audioInputSnapshot.activeTrackCount, audioInputSnapshot.inputSessionId, audioInputSnapshot.muted, audioInputSnapshot.status, audioSegmentCapture, voiceActivityDetector]);

  useEffect(
    () => () => {
      // Preserve the provider through React StrictMode's development-only effect replay.
      vadDisposeTimerRef.current = window.setTimeout(() => {
        voiceActivityDetector.dispose();
        vadDisposeTimerRef.current = null;
      }, 0);
    },
    [voiceActivityDetector],
  );

  useEffect(
    () => () => {
      audioSegmentCaptureDisposeTimerRef.current = window.setTimeout(() => {
        audioSegmentCapture.dispose();
        audioSegmentCaptureDisposeTimerRef.current = null;
      }, 0);
    },
    [audioSegmentCapture],
  );

  useEffect(
    () => () => {
      speechRecognitionDisposeTimerRef.current = window.setTimeout(() => {
        speechRecognitionService.dispose();
        speechRecognitionDisposeTimerRef.current = null;
      }, 0);
    },
    [speechRecognitionService],
  );

  useEffect(
    () => () => {
      clearTimeoutRef(minimumTalkingTimeoutRef);
      clearTimeoutRef(listeningPoseEndTimeoutRef);
      clearSpeechPlayback(true);
      audioPlayer.dispose();
    },
    [audioPlayer],
  );

  const avatarDebugJson = createAvatarDebugJson({
    debugState,
    vrmDebugState: vrmDebugSnapshot,
    speechDebugState,
    audioDebugState,
    audioInputSnapshot,
    vadSnapshot,
    audioSegmentCaptureSnapshot,
    speechRecognitionSnapshot,
    emotionMappingDebug,
    currentTurnId,
    runtimeMode,
    autoAvatarControlEnabled,
    brainProviderId,
    ollamaEndpoint,
    ollamaModel,
    characterName,
    characterStyle,
    llmReplyMaxLength,
    cleanedReplyLength,
    runtimeSessionMemory,
    memorySummary,
    brainError,
    responseDisplayMode,
    responseDisplayStatus,
    pendingAssistantText,
    emotionReactionEnabled,
    emotionExpressionMode,
    heldEmotionExpression,
    heldEmotionExpressionValue,
    detectedAssistantEmotion,
    detectedAssistantEmotionIntensity,
    activeAssistantExpression,
    expressionSource,
    minimumTalkingDurationMs,
    enableListeningPoseAfterReply,
    waitingMotionMode,
    speakingFaceMode,
  });
  const runtimeStatus = formatRuntimeStatus({
    brainError,
    speechDebugState,
    audioDebugState,
    responseDisplayStatus,
  });
  const isDebugMode = runtimeMode === "debug";

  const stageBackgroundImage =
    stageBackgroundSettings.kind === "local"
      ? stageBackgroundObjectUrl
      : getBundledStageBackground(stageBackgroundSettings.kind);
  const detectedMicrophoneState = getStageMicrophoneState(
    audioInputSnapshot.status,
    speechRecognitionSnapshot.status === "transcribing",
    audioSegmentCaptureSnapshot.enabled,
  );
  const stageMicrophoneState =
    detectedMicrophoneState === "unavailable" ? "unavailable" : voiceTurnStatus === "idle" ? detectedMicrophoneState : voiceTurnStatus;
  const stageChat = (
    <section style={styles.stageChatPanel}>
      <h1 style={styles.title}>Chat</h1>
      <div style={styles.messages}>{messages.map((message, index) => <div key={`${message.role}-${index}`} style={{ ...styles.message, ...(message.role === "user" ? styles.userMessage : styles.assistantMessage) }}><span style={styles.role}>{message.role}</span><p style={styles.content}>{message.content}</p></div>)}</div>
      {responseDisplayMode === "syncWithSpeech" && responseDisplayStatus !== "idle" ? <p style={styles.helperText}>{formatResponseDisplayStatus(responseDisplayStatus)}</p> : null}
      <form onSubmit={handleSubmit} style={styles.form}><input aria-label="Message" ref={chatInputRef} value={input} onChange={(event) => { setInput(event.target.value); setTranscriptReviewStatus(null); }} style={styles.input} /><button type="submit" disabled={!input.trim() || isSending} style={styles.button}>Send</button></form>
    </section>
  );
  const stageTranscriptReview = (
    <section style={styles.debugPanel} aria-label="Stage transcript review">
      <p style={styles.helperText}>{speechRecognitionSnapshot.lastTranscript ?? "No completed transcript yet."}</p>
      {speechRecognitionSnapshot.lastRawTranscript && speechRecognitionSnapshot.lastRawTranscript !== speechRecognitionSnapshot.lastTranscript ? <p style={styles.helperText}>Raw: {speechRecognitionSnapshot.lastRawTranscript}</p> : null}
      <div style={styles.motionControls}><button type="button" onClick={() => applyLatestTranscriptToChatDraft("use")} disabled={!speechRecognitionSnapshot.lastTranscript} style={styles.button}>Use Transcript</button>{input.trim() ? <><button type="button" onClick={() => applyLatestTranscriptToChatDraft("append")} style={styles.secondaryButton}>Append</button><button type="button" onClick={() => applyLatestTranscriptToChatDraft("replace")} style={styles.secondaryButton}>Replace</button></> : null}</div>
      <form onSubmit={handleSubmit} style={styles.form}><input aria-label="Transcript chat draft" ref={chatInputRef} value={input} onChange={(event) => { setInput(event.target.value); setTranscriptReviewStatus(null); }} style={styles.input} /><button type="submit" disabled={!input.trim() || isSending} style={styles.button}>Send</button></form>
      <p style={styles.helperText}>{transcriptReviewStatus ?? "Review and submit manually."}</p>
    </section>
  );
  const stageSettings = (
    <>
      <section style={styles.debugPanel}><h2 style={styles.debugTitle}>Avatar</h2><div style={styles.motionControls}><button type="button" onClick={() => setAvatarType("vrm")} style={{ ...styles.secondaryButton, ...(avatarType === "vrm" ? styles.activeButton : undefined) }}>VRM 3D</button><button type="button" onClick={() => setAvatarType("live2d")} style={{ ...styles.secondaryButton, ...(avatarType === "live2d" ? styles.activeButton : undefined) }}>Live2D</button></div></section>
      <section style={styles.debugPanel}><h2 style={styles.debugTitle}>Background</h2><div style={styles.motionControls}>{(["default", "aurora", "studio"] as const).map((kind) => <button key={kind} type="button" onClick={() => setStageBackgroundSettings((current) => ({ ...current, kind }))} style={{ ...styles.secondaryButton, ...(stageBackgroundSettings.kind === kind ? styles.activeButton : undefined) }}>{kind}</button>)}</div><label style={styles.settingLabel}>Local image<input aria-label="Choose local stage background" type="file" accept="image/*" onChange={(event) => void handleStageBackgroundFile(event.target.files?.[0] ?? null)} /></label><div style={styles.motionControls}><button type="button" onClick={() => setStageBackgroundSettings((current) => ({ ...current, fit: current.fit === "cover" ? "contain" : "cover" }))} style={styles.secondaryButton}>Fit: {stageBackgroundSettings.fit}</button><button type="button" onClick={() => void handleStageBackgroundClear()} style={styles.secondaryButton}>Reset</button></div>{stageBackgroundError ? <p style={styles.errorText}>{stageBackgroundError}</p> : null}</section>
      <section style={styles.debugPanel}><h2 style={styles.debugTitle}>Microphone and STT</h2><label style={styles.settingLabel}>Input device<select value={audioInputSnapshot.selectedDeviceId ?? ""} onChange={(event) => void handleAudioInputSelectDevice(event.target.value)} style={styles.input}><option value="">Browser default</option>{audioInputSnapshot.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}</select></label><label style={styles.settingLabel}>STT language<select value={sttLanguage} onChange={(event) => setSttLanguage(event.target.value)} style={styles.input}><option value="auto">auto</option><option value="zh">zh</option><option value="ja">ja</option><option value="en">en</option></select></label><p style={styles.helperText}>Chinese output: Taiwan Traditional</p></section>
      <section style={styles.debugPanel}><h2 style={styles.debugTitle}>Providers</h2><label style={styles.settingLabel}>Chat provider<select value={brainProviderId} onChange={(event) => handleBrainProviderChange(event.target.value as BrainProviderId)} style={styles.input}><option value="ollama">ollama</option><option value="mock">mock</option></select></label><label style={styles.settingLabel}>TTS provider<select value={selectedTtsProvider} onChange={(event) => handleSelectedTtsProviderChange(event.target.value as TtsProviderId)} style={styles.input}><option value="http-tts">http-tts</option><option value="mock-tts">mock-tts</option><option value="mock-audio-tts">mock-audio-tts</option></select></label><button type="button" onClick={() => handleAudioEnabledChange(!audioDebugState.enabled)} style={styles.secondaryButton}>Audio: {audioDebugState.enabled ? "On" : "Off"}</button></section>
    </>
  );
  const stageDeveloper = developerDrawerOpen ? <>
    <section style={styles.runtimeBar} aria-label="Runtime mode"><div><h2 style={styles.debugTitle}>Runtime Mode</h2><span style={styles.statusText}>{runtimeStatus}</span></div><div style={styles.motionControls}>{(["normal", "debug"] as const).map((mode) => <button key={mode} type="button" onClick={() => setRuntimeMode(mode)} style={{ ...styles.secondaryButton, ...(runtimeMode === mode ? styles.activeButton : undefined) }}>{mode === "normal" ? "Normal" : "Debug"}</button>)}</div></section>
    <BrainCharacterMemoryPanel brainProviderId={brainProviderId} ollamaEndpoint={ollamaEndpoint} ollamaModel={ollamaModel} characterName={characterName} characterStyle={characterStyle} systemPrompt={systemPrompt} llmReplyMaxLength={llmReplyMaxLength} cleanedReplyLength={cleanedReplyLength} memorySummary={memorySummary} brainError={brainError} responseDisplayMode={responseDisplayMode} responseDisplayStatus={responseDisplayStatus} pendingAssistantText={pendingAssistantText} memoryNoteInput={memoryNoteInput} onBrainProviderChange={handleBrainProviderChange} onResponseDisplayModeChange={handleResponseDisplayModeChange} onOllamaEndpointChange={handleOllamaEndpointChange} onOllamaModelChange={handleOllamaModelChange} onCharacterNameChange={handleCharacterNameChange} onLlmReplyMaxLengthChange={handleLlmReplyMaxLengthChange} onCharacterStyleChange={handleCharacterStyleChange} onSystemPromptChange={handleSystemPromptChange} onMemoryNoteInputChange={setMemoryNoteInput} onAddMemoryNote={handleAddMemoryNote} onClearSessionMemory={handleClearSessionMemory} />
    <SpeechDebugPanel speechDebugState={speechDebugState} selectedTtsProvider={selectedTtsProvider} manualTtsText={manualTtsText} httpTtsEndpoint={httpTtsEndpoint} httpTtsProviderName={httpTtsProviderName} fillerVoiceUrl={fillerVoiceUrl} waitingMotionMode={waitingMotionMode} speakingFaceMode={speakingFaceMode} onSelectedTtsProviderChange={handleSelectedTtsProviderChange} onManualTtsTextChange={setManualTtsText} onHttpTtsEndpointChange={handleHttpTtsEndpointChange} onHttpTtsProviderNameChange={handleHttpTtsProviderNameChange} onFillerVoiceUrlChange={handleFillerVoiceUrlChange} onManualTtsTest={handleManualTtsTest} onHttpTtsTest={handleHttpTtsTest} onSpeechEnabledChange={handleSpeechEnabledChange} onFillerVoiceEnabledChange={handleFillerVoiceEnabledChange} onFillerMotionModeChange={handleFillerMotionModeChange} onWaitingMotionModeChange={handleWaitingMotionModeChange} onSpeakingFaceModeChange={handleSpeakingFaceModeChange} ttsQueueEnabled={ttsQueueEnabled} onTtsQueueEnabledChange={handleTtsQueueEnabledChange} />
    <AudioDebugPanel audioDebugState={audioDebugState} mouthDrivingMode={vrmDebugSnapshot.mouthDrivingMode} testAudioUrl={testAudioUrl} onAudioEnabledChange={handleAudioEnabledChange} onLipSyncEnabledChange={handleLipSyncEnabledChange} onLipSyncPresetChange={handleLipSyncPresetChange} onLipSyncGainChange={handleLipSyncGainChange} onLipSyncNoiseGateChange={handleLipSyncNoiseGateChange} onLipSyncSmoothingChange={handleLipSyncSmoothingChange} onLipSyncMaxMouthValueChange={handleLipSyncMaxMouthValueChange} onLipSyncCurvePowerChange={handleLipSyncCurvePowerChange} onTestAudioUrlChange={setTestAudioUrl} onPlayTestAudio={handlePlayTestAudio} onStopAudio={handleStopAudio} />
    <BrowserAudioInputPanel snapshot={audioInputSnapshot} onRequestPermission={handleAudioInputRequestPermission} onStart={handleAudioInputStart} onStop={() => { void audioInput.stop(); }} onMutedChange={handleAudioInputMutedChange} onRefreshDevices={handleAudioInputRefreshDevices} onSelectDevice={handleAudioInputSelectDevice} />
    <VadDebugPanel snapshot={vadSnapshot} config={vadConfig} onEnabledChange={handleVadEnabledChange} onReset={handleVadReset} onConfigChange={handleVadConfigChange} onRestoreDefaults={handleVadRestoreDefaults} />
    <AudioSegmentCapturePanel snapshot={audioSegmentCaptureSnapshot} onEnabledChange={handleAudioSegmentCaptureEnabledChange} onReset={handleAudioSegmentCaptureReset} onDownloadLast={handleAudioSegmentCaptureDownloadLast} onClearLast={handleAudioSegmentCaptureClearLast} />
    <SpeechRecognitionDebugPanel snapshot={speechRecognitionSnapshot} endpoint={sttEndpoint} language={sttLanguage} onEndpointChange={handleSttEndpointChange} onEndpointCommit={handleSttHealthCheck} onLanguageChange={setSttLanguage} onHealthCheck={handleSttHealthCheck} onTranscribeLast={handleTranscribeLastSegment} onAutoChange={(enabled) => speechRecognitionService.setAutoTranscribeEnabled(enabled)} onCancel={() => speechRecognitionService.cancelActive()} onClear={() => speechRecognitionService.clearTranscriptHistory()} chatDraft={input} transcriptReviewStatus={transcriptReviewStatus} onUseLatestTranscript={() => applyLatestTranscriptToChatDraft("use")} onAppendLatestTranscript={() => applyLatestTranscriptToChatDraft("append")} onReplaceLatestTranscript={() => applyLatestTranscriptToChatDraft("replace")} />
    <section style={styles.debugPanel} aria-label="Avatar debug JSON panel"><h2 style={styles.debugTitle}>Avatar Debug JSON</h2><pre style={styles.renderState}>{JSON.stringify(avatarDebugJson, null, 2)}</pre></section>
  </> : null;
  const stageAvatar = <div onContextMenu={(event) => { event.preventDefault(); setMotionMenu(constrainStageMenuPosition(event.clientX, event.clientY, window.innerWidth, window.innerHeight)); }}>
    {avatarType === "vrm" ? <VrmViewerPanel runtimeMode={developerDrawerOpen ? "debug" : "normal"} renderer={vrmRenderer} onRuntimeStatusChange={setVrmRuntimeStatus} avatarLoadSettings={avatarLoadSettings} onAvatarLoadSettingsChange={setAvatarLoadSettings} renderState={vrmRenderState} emotionMappingDebug={emotionMappingDebug} autoAvatarControlEnabled={autoAvatarControlEnabled} onAutoAvatarControlEnabledChange={handleAutoAvatarControlEnabledChange} emotionReactionEnabled={emotionReactionEnabled} onEmotionReactionEnabledChange={handleEmotionReactionEnabledChange} emotionExpressionMode={emotionExpressionMode} onEmotionExpressionModeChange={handleEmotionExpressionModeChange} heldEmotionExpression={heldEmotionExpression} heldEmotionExpressionValue={heldEmotionExpressionValue} detectedAssistantEmotion={detectedAssistantEmotion} detectedAssistantEmotionIntensity={detectedAssistantEmotionIntensity} activeAssistantExpression={activeAssistantExpression} expressionSource={expressionSource} onManualExpressionChange={(expressionName) => { setActiveAssistantExpression(expressionName); setExpressionSource(expressionName === null ? "none" : "manual"); }} enableListeningPoseAfterReply={enableListeningPoseAfterReply} onListeningPoseAfterReplyChange={handleListeningPoseAfterReplyChange} minimumTalkingDurationMs={minimumTalkingDurationMs} onMinimumTalkingDurationChange={handleMinimumTalkingDurationChange} /> : <Live2DViewerPanel runtimeMode={developerDrawerOpen ? "debug" : "normal"} modelUrl="/live2d/model.model3.json" mouthValue={audioDebugState.externalMouthValue} mouthSyncEnabled={audioDebugState.lipSyncEnabled} audioPlaying={audioDebugState.playbackState === "playing"} />}
  </div>;
  const stageMotionMenu = motionMenu ? <section role="menu" aria-label="Avatar motion menu" onMouseLeave={() => undefined} style={{ ...styles.motionMenu, left: motionMenu.x, top: motionMenu.y }}><button type="button" role="menuitem" onClick={() => { if (avatarType === "vrm") { vrmRenderer.clearExpressions(); vrmRenderer.setTalkingOverlayActive(false); vrmRenderer.setExternalMouthValue(0); } setMotionMenu(null); }} style={styles.secondaryButton}>Neutral / Reset</button>{avatarType === "vrm" ? <><button type="button" role="menuitem" onClick={() => { vrmRenderer.triggerReaction("happy"); setMotionMenu(null); }} style={styles.secondaryButton}>Reaction Test</button><button type="button" role="menuitem" onClick={() => { setAutoAvatarControlEnabled(!autoAvatarControlEnabled); setMotionMenu(null); }} style={styles.secondaryButton}>Idle: {autoAvatarControlEnabled ? "On" : "Off"}</button></> : <p style={styles.helperText}>Live2D motion is not yet part of the validated baseline.</p>}</section> : null;
  return <StagePresentationShell backgroundImage={stageBackgroundImage} backgroundFit={stageBackgroundSettings.fit} avatar={stageAvatar} controlsExpanded={controlsExpanded} microphoneState={stageMicrophoneState} microphoneCaptureActive={audioSegmentCaptureSnapshot.enabled} settingsOpen={settingsDrawerOpen} developerOpen={developerDrawerOpen} transcriptReviewOpen={transcriptReviewOpen} onControlsExpandedChange={setControlsExpanded} onMicrophoneClick={() => { void handleStageMicrophoneToggle(); }} onSettingsOpenChange={setSettingsDrawerOpen} onDeveloperOpenChange={setDeveloperDrawerOpen} onTranscriptReviewOpenChange={setTranscriptReviewOpen} onAvatarTypeChange={setAvatarType} avatarType={avatarType} vadEnabled={vadSnapshot.enabled} onVadEnabledChange={handleVadEnabledChange} settings={stageSettings} developer={stageDeveloper} transcriptReview={stageTranscriptReview} motionMenu={stageMotionMenu} chat={controlsExpanded && !transcriptReviewOpen ? stageChat : null} />;
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.debugItem}>
      <dt style={styles.debugLabel}>{label}</dt>
      <dd style={styles.debugValue}>{value}</dd>
    </div>
  );
}

function NormalModeCoreStatus({
  items,
  brainProviderId,
  audioEnabled,
  speechEnabled,
  onBrainProviderChange,
  onAudioEnabledChange,
  onSpeechEnabledChange,
}: {
  items: RuntimeCoreStatusItem[];
  brainProviderId: BrainProviderId;
  audioEnabled: boolean;
  speechEnabled: boolean;
  onBrainProviderChange: (providerId: BrainProviderId) => void;
  onAudioEnabledChange: (enabled: boolean) => void;
  onSpeechEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <section style={styles.debugPanel} aria-label="Runtime controls">
      <h2 style={styles.debugTitle}>Core Status</h2>
      <dl style={styles.debugGrid}>
        {items.map((item) => (
          <DebugItem key={item.label} label={item.label} value={item.value} />
        ))}
      </dl>
      <div style={styles.motionControls} aria-label="Normal brain provider controls">
        {(["mock", "ollama"] as const).map((providerId) => (
          <button
            key={providerId}
            type="button"
            onClick={() => onBrainProviderChange(providerId)}
            style={{
              ...styles.secondaryButton,
              ...(brainProviderId === providerId ? styles.activeButton : undefined),
            }}
          >
            {providerId === "mock" ? "Mock" : "Ollama"}
          </button>
        ))}
      </div>
      <div style={styles.motionControls}>
        <button
          type="button"
          onClick={() => onAudioEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(audioEnabled ? styles.activeButton : undefined),
          }}
        >
          Voice On
        </button>
        <button
          type="button"
          onClick={() => onAudioEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!audioEnabled ? styles.activeButton : undefined),
          }}
        >
          Voice Off
        </button>
        <button
          type="button"
          onClick={() => onSpeechEnabledChange(true)}
          style={{
            ...styles.secondaryButton,
            ...(speechEnabled ? styles.activeButton : undefined),
          }}
        >
          Auto Speech On
        </button>
        <button
          type="button"
          onClick={() => onSpeechEnabledChange(false)}
          style={{
            ...styles.secondaryButton,
            ...(!speechEnabled ? styles.activeButton : undefined),
          }}
        >
          Auto Speech Off
        </button>
      </div>
    </section>
  );
}

type VrmViewerPanelProps = {
  runtimeMode: RuntimeMode;
  renderer: VrmRenderer;
  onRuntimeStatusChange: (status: VrmRuntimeStatus) => void;
  avatarLoadSettings: AvatarLoadSettings;
  onAvatarLoadSettingsChange: (settings: AvatarLoadSettings) => void;
  renderState: AvatarRenderOutput["renderState"];
  emotionMappingDebug: EmotionMappingDebug;
  autoAvatarControlEnabled: boolean;
  onAutoAvatarControlEnabledChange: (enabled: boolean) => void;
  emotionReactionEnabled: boolean;
  onEmotionReactionEnabledChange: (enabled: boolean) => void;
  emotionExpressionMode: EmotionExpressionMode;
  onEmotionExpressionModeChange: (mode: EmotionExpressionMode) => void;
  heldEmotionExpression: string | null;
  heldEmotionExpressionValue: number;
  detectedAssistantEmotion: AssistantEmotionName;
  detectedAssistantEmotionIntensity: number;
  activeAssistantExpression: string | null;
  expressionSource: ExpressionSource;
  onManualExpressionChange: (expressionName: string | null) => void;
  enableListeningPoseAfterReply: boolean;
  onListeningPoseAfterReplyChange: (enabled: boolean) => void;
  minimumTalkingDurationMs: number;
  onMinimumTalkingDurationChange: (durationMs: number) => void;
};

const LIP_SYNC_PRESETS = {
  balanced: {
    gain: 4,
    noiseGate: 0.03,
    smoothing: 0.25,
    maxMouthValue: 0.85,
    curvePower: 0.85,
  },
  highSensitivity: {
    gain: 8,
    noiseGate: 0.01,
    smoothing: 0.15,
    maxMouthValue: 1,
    curvePower: 0.85,
  },
  mockAudioTts: {
    gain: 8,
    noiseGate: 0.03,
    smoothing: 0.25,
    maxMouthValue: 0.85,
    curvePower: 0.85,
  },
} as const satisfies Record<Exclude<LipSyncPreset, "custom">, LipSyncPresetConfig>;

function VrmViewerPanel({
  runtimeMode,
  renderer,
  onRuntimeStatusChange,
  avatarLoadSettings,
  onAvatarLoadSettingsChange,
  renderState,
  emotionMappingDebug,
  autoAvatarControlEnabled,
  onAutoAvatarControlEnabledChange,
  emotionReactionEnabled,
  onEmotionReactionEnabledChange,
  emotionExpressionMode,
  onEmotionExpressionModeChange,
  heldEmotionExpression,
  heldEmotionExpressionValue,
  detectedAssistantEmotion,
  detectedAssistantEmotionIntensity,
  activeAssistantExpression,
  expressionSource,
  onManualExpressionChange,
  enableListeningPoseAfterReply,
  onListeningPoseAfterReplyChange,
  minimumTalkingDurationMs,
  onMinimumTalkingDurationChange,
}: VrmViewerPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Not initialized");
  const [isRendererReady, setIsRendererReady] = useState(false);
  const [debugState, setDebugState] = useState<VrmRendererDebugState>(() =>
    renderer.getDebugState(),
  );
  const [capabilities, setCapabilities] = useState<VrmRendererCapabilities>(() =>
    renderer.getCapabilities(),
  );
  const [expressionStrength, setExpressionStrength] = useState(1);
  const [reactionExpression, setReactionExpression] = useState("surprised");
  const [manualRenderState, setManualRenderState] =
    useState<AvatarRenderOutput["renderState"]>(renderState);
  const autoLoadAttemptedRef = useRef(false);

  function refreshRendererDebugState() {
    setDebugState(renderer.getDebugState());
  }

  function refreshCapabilities() {
    setCapabilities(renderer.getCapabilities());
  }

  useEffect(() => {
    setManualRenderState(renderState);
  }, [renderState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshRendererDebugState();
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [renderer]);

  useEffect(() => {
    let isMounted = true;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setStatus("Initializing renderer");

    renderer
      .initialize(container)
      .then(() => {
        if (isMounted) {
          setStatus("Renderer ready");
          setIsRendererReady(true);
          refreshRendererDebugState();
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setStatus(`Renderer error: ${getErrorMessage(error)}`);
          refreshRendererDebugState();
        }
      });

    return () => {
      isMounted = false;
      setIsRendererReady(false);
      renderer.dispose();
    };
  }, [renderer]);

  async function handleLoadModel() {
    const avatarUrl = avatarLoadSettings.avatarUrl.trim() || "/models/default.vrm";
    setStatus(`Loading ${avatarUrl}`);

    try {
      await renderer.loadModel(avatarUrl);
      refreshCapabilities();
      setStatus(`Loaded ${avatarUrl}`);
      onRuntimeStatusChange({
        motionStatus: "idle",
        motionError: null,
      });
    } catch (error) {
      setStatus(`Load failed: ${getErrorMessage(error)}`);
    } finally {
      refreshRendererDebugState();
    }
  }

  async function handleLoadAnimation() {
    if (!renderer.getDebugState().hasVrm) {
      setStatus("Please load VRM first.");
      onRuntimeStatusChange({
        motionStatus: "idle",
        motionError: "Please load VRM first.",
      });
      refreshRendererDebugState();
      return;
    }

    const idleMotionUrl = avatarLoadSettings.idleMotionUrl.trim() || "/motions/idle.vrma";
    setStatus("Loading idle motion...");
    onRuntimeStatusChange({
      motionStatus: "loading",
      motionError: null,
    });

    try {
      await renderer.loadAnimation(idleMotionUrl);
      setStatus("Idle motion loaded");
      onRuntimeStatusChange({
        motionStatus: "loaded",
        motionError: null,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(`Idle motion failed: ${message}`);
      onRuntimeStatusChange({
        motionStatus: "error",
        motionError: message,
      });
    } finally {
      refreshRendererDebugState();
    }
  }

  useEffect(() => {
    autoLoadAttemptedRef.current = false;
  }, [avatarLoadSettings.autoLoadAvatar, avatarLoadSettings.avatarUrl, avatarLoadSettings.idleMotionUrl]);

  useEffect(() => {
    if (!isRendererReady || !avatarLoadSettings.autoLoadAvatar || autoLoadAttemptedRef.current) {
      return;
    }

    autoLoadAttemptedRef.current = true;

    void (async () => {
      const currentDebugState = renderer.getDebugState();
      if (!currentDebugState.hasVrm) {
        await handleLoadModel();
      }

      const nextDebugState = renderer.getDebugState();
      if (nextDebugState.hasVrm && !nextDebugState.hasAnimation) {
        await handleLoadAnimation();
      }
    })();
  }, [
    avatarLoadSettings.autoLoadAvatar,
    avatarLoadSettings.avatarUrl,
    avatarLoadSettings.idleMotionUrl,
    isRendererReady,
    renderer,
  ]);

  function handleClearReactionOverlays() {
    renderer.clearReactionOverlays();
    const output = renderer.render(createMotionInput("idle"));
    setManualRenderState(output.renderState);
    setStatus("Reaction overlays cleared");
    refreshRendererDebugState();
  }

  function handleFlipFacing() {
    renderer.toggleFacingDirection();
    const nextDebugState = renderer.getDebugState();
    setDebugState(nextDebugState);
    setStatus(`Facing ${nextDebugState.facingDirection}`);
  }

  function handleCameraPreset(preset: CameraPreset, label: string) {
    renderer.setCameraPreset(preset);
    setStatus(`Camera preset: ${label}`);
    refreshRendererDebugState();
  }

  function handleDebugStrength(value: number, label: string) {
    renderer.setDebugReactionStrength(value);
    setStatus(`Debug reaction strength: ${label}`);
    refreshRendererDebugState();
  }

  function handleMouthStrength(value: number) {
    renderer.setMouthStrength(value);
    setStatus(`Mouth strength: ${formatExpressionStrength(value)}`);
    refreshRendererDebugState();
  }

  function handleMouthSpeed(value: number, label: string) {
    renderer.setMouthSpeed(value);
    setStatus(`Mouth speed: ${label}`);
    refreshRendererDebugState();
  }

  function handleTestTalking() {
    renderer.setTalkingOverlayActive(true);
    const output = renderer.render(createMotionInput("talking"));
    setManualRenderState(output.renderState);
    setStatus("Testing Talking");
    refreshRendererDebugState();
  }

  function handleStopTalking() {
    renderer.setTalkingOverlayActive(false);
    setStatus("Stop talking");
    refreshRendererDebugState();
  }

  function handleThinkingDirection(direction: ThinkingLookDirection, label: string) {
    renderer.setThinkingLookDirection(direction);
    setStatus(`Thinking look direction: ${label}`);
    refreshRendererDebugState();
  }

  function handleThinkingStrength(value: number) {
    renderer.setThinkingLookStrength(value);
    setStatus(`Thinking look strength: ${formatExpressionStrength(value)}`);
    refreshRendererDebugState();
  }

  function handleTestThinking() {
    renderer.setBehaviorManualOverrideActive(true);
    renderer.setThinkingOverlayActive(true);
    const output = renderer.render(createMotionInput("thinking"));
    setManualRenderState(output.renderState);
    setStatus("Testing Thinking");
    refreshRendererDebugState();
  }

  function handleStopThinking() {
    renderer.setThinkingOverlayActive(false);
    renderer.setBehaviorManualOverrideActive(false);
    setStatus("Stop thinking");
    refreshRendererDebugState();
  }

  function handleAutonomousBehaviorEnabled(enabled: boolean) {
    renderer.setAutonomousBehaviorEnabled(enabled);
    setStatus(`Autonomous behavior: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleAutoBlinkEnabled(enabled: boolean) {
    renderer.setAutoBlinkEnabled(enabled);
    setStatus(`Auto blink: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleAutonomousGazeEnabled(enabled: boolean) {
    renderer.setAutonomousGazeEnabled(enabled);
    setStatus(`Autonomous gaze: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleMouseFollowEnabled(enabled: boolean) {
    renderer.setMouseFollowEnabled(enabled);
    setStatus(`Mouse follow: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleIdleEyeMovementEnabled(enabled: boolean) {
    renderer.setIdleEyeMovementEnabled(enabled);
    setStatus(`Idle eye movement: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleBehaviorManualOverrideActive(active: boolean) {
    renderer.setBehaviorManualOverrideActive(active);
    setStatus(`Behavior manual override: ${active ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleVrmPointerMove(event: PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const gaze = normalizePointerToGaze(event.clientX, event.clientY, rect);
    renderer.setMouseFollowTarget(gaze.gazeX, gaze.gazeY);
  }

  function handleTestReacting() {
    renderer.triggerReaction(reactionExpression);
    onManualExpressionChange(reactionExpression);
    const output = renderer.render(createMotionInput("reacting"));
    setManualRenderState(output.renderState);
    setStatus(`Trigger reaction: ${reactionExpression}`);
    refreshRendererDebugState();
  }

  function handleStopReacting() {
    renderer.setReactingOverlayActive(false);
    setStatus("Stop reacting");
    refreshRendererDebugState();
  }

  function handleReactionExpression(expressionName: string) {
    setReactionExpression(expressionName);
    renderer.setReactingExpression(expressionName);
    setStatus(`Reaction expression: ${expressionName}`);
    refreshRendererDebugState();
  }

  function handleReactionStrength(value: number) {
    renderer.setReactingExpressionStrength(value);
    setStatus(`Reaction strength: ${formatExpressionStrength(value)}`);
    refreshRendererDebugState();
  }

  function handleReactionDuration(value: number) {
    renderer.setReactingDurationMs(value);
    setStatus(`Reaction duration: ${value}ms`);
    refreshRendererDebugState();
  }

  function handleReactionMotionEnabled(enabled: boolean) {
    renderer.setReactingMotionEnabled(enabled);
    setStatus(`Reacting motion: ${enabled ? "On" : "Off"}`);
    refreshRendererDebugState();
  }

  function handleReactionMotionStrength(value: number) {
    renderer.setReactingMotionStrength(value);
    setStatus(`Reacting motion strength: ${formatExpressionStrength(value)}`);
    refreshRendererDebugState();
  }

  function handleExpressionTest(expressionName: string) {
    renderer.clearExpressions();
    renderer.setExpression(expressionName, expressionStrength);
    onManualExpressionChange(expressionName);
    setStatus(
      `Testing expression: ${expressionName} strength=${formatExpressionStrength(expressionStrength)}`,
    );
    refreshRendererDebugState();
  }

  function handleClearExpressions() {
    renderer.clearExpressions();
    onManualExpressionChange(null);
    setStatus("Expressions cleared");
    refreshRendererDebugState();
  }

  return (
    <section style={styles.vrmPanel} aria-label="VRM viewer test panel">
      <div style={styles.vrmHeader}>
        <h2 style={styles.debugTitle}>VRM Viewer</h2>
        <span style={styles.statusText}>
          {status} | {emotionMappingDebug.autoAvatarStatus}
        </span>
      </div>

      <div ref={containerRef} onPointerMove={handleVrmPointerMove} style={styles.vrmContainer} />

      {runtimeMode === "normal" ? (
        <>
          <p style={styles.helperText}>
            {debugState.hasVrm
              ? `VRM loaded | Mouth ${debugState.currentMouthValue.toFixed(2)} | Expression ${
                  debugState.currentReactingExpressionValue > 0
                    ? debugState.reactingExpressionName
                    : "neutral"
                }`
              : status.includes("Loading")
                ? "Loading VRM..."
                : "VRM not loaded"}
          </p>
          <div style={styles.motionControls} aria-label="Normal VRM load controls">
            <button type="button" onClick={handleLoadModel} style={styles.secondaryButton}>
              Load VRM
            </button>
            <button type="button" onClick={handleLoadAnimation} style={styles.secondaryButton}>
              Load Idle Motion
            </button>
          </div>
        </>
      ) : null}

      {runtimeMode === "debug" ? (
        <AvatarMotionExpressionPanel
          avatarLoadSettings={avatarLoadSettings}
          onAvatarLoadSettingsChange={onAvatarLoadSettingsChange}
          debugState={debugState}
          capabilities={capabilities}
          emotionMappingDebug={emotionMappingDebug}
          autoAvatarControlEnabled={autoAvatarControlEnabled}
          onAutoAvatarControlEnabledChange={onAutoAvatarControlEnabledChange}
          emotionReactionEnabled={emotionReactionEnabled}
          onEmotionReactionEnabledChange={onEmotionReactionEnabledChange}
          emotionExpressionMode={emotionExpressionMode}
          onEmotionExpressionModeChange={onEmotionExpressionModeChange}
          heldEmotionExpression={heldEmotionExpression}
          heldEmotionExpressionValue={heldEmotionExpressionValue}
          detectedAssistantEmotion={detectedAssistantEmotion}
          detectedAssistantEmotionIntensity={detectedAssistantEmotionIntensity}
          activeAssistantExpression={activeAssistantExpression}
          expressionSource={expressionSource}
          enableListeningPoseAfterReply={enableListeningPoseAfterReply}
          onListeningPoseAfterReplyChange={onListeningPoseAfterReplyChange}
          minimumTalkingDurationMs={minimumTalkingDurationMs}
          onMinimumTalkingDurationChange={onMinimumTalkingDurationChange}
          manualRenderState={manualRenderState}
          expressionStrength={expressionStrength}
          reactionExpression={reactionExpression}
          onClearReactionOverlays={handleClearReactionOverlays}
          onTestThinking={handleTestThinking}
          onTestTalking={handleTestTalking}
          onTestReacting={handleTestReacting}
          onStopReacting={handleStopReacting}
          onFlipFacing={handleFlipFacing}
          onDebugStrength={handleDebugStrength}
          onLoadModel={handleLoadModel}
          onLoadAnimation={handleLoadAnimation}
          onCameraPreset={handleCameraPreset}
          onMouthStrength={handleMouthStrength}
          onMouthSpeed={handleMouthSpeed}
          onStopTalking={handleStopTalking}
            onThinkingDirection={handleThinkingDirection}
            onThinkingStrength={handleThinkingStrength}
            onStopThinking={handleStopThinking}
            onAutonomousBehaviorEnabled={handleAutonomousBehaviorEnabled}
            onAutoBlinkEnabled={handleAutoBlinkEnabled}
            onAutonomousGazeEnabled={handleAutonomousGazeEnabled}
            onMouseFollowEnabled={handleMouseFollowEnabled}
            onIdleEyeMovementEnabled={handleIdleEyeMovementEnabled}
            onBehaviorManualOverrideActive={handleBehaviorManualOverrideActive}
          onReactionExpression={handleReactionExpression}
          onReactionStrength={handleReactionStrength}
          onReactionDuration={handleReactionDuration}
          onReactionMotionEnabled={handleReactionMotionEnabled}
          onReactionMotionStrength={handleReactionMotionStrength}
          onExpressionStrengthChange={setExpressionStrength}
          onExpressionTest={handleExpressionTest}
          onClearExpressions={handleClearExpressions}
        />
      ) : null}
    </section>
  );
}

type ChatAvatarControllerOptions = {
  renderer: VrmRenderer;
  enabledRef: { current: boolean };
  emotionReactionEnabledRef: { current: boolean };
  emotionExpressionModeRef: { current: EmotionExpressionMode };
  heldEmotionExpressionRef: { current: string | null };
  heldEmotionExpressionValueRef: { current: number };
  currentTurnIdRef: { current: number };
  lastEmotionReactionTurnIdRef: { current: number | null };
  lastTriggeredEmotionMoodRef: { current: string | null };
  lastTriggeredExpressionRef: { current: string | null };
  setHeldEmotionExpression: (expressionName: string | null) => void;
  setHeldEmotionExpressionValue: (value: number) => void;
  clearHeldEmotionExpression: () => void;
  setStatus: (status: string) => void;
  setPhase: (phase: AutoAvatarPhase) => void;
  enableListeningPoseAfterReplyRef: { current: boolean };
  waitingMotionModeRef: { current: WaitingMotionMode };
  minimumTalkingDurationMsRef: { current: number };
  minimumTalkingTimeoutRef: { current: number | null };
  listeningPoseEndTimeoutRef: { current: number | null };
};

function createChatAvatarController({
  renderer,
  enabledRef,
  emotionReactionEnabledRef,
  emotionExpressionModeRef,
  heldEmotionExpressionRef,
  heldEmotionExpressionValueRef,
  currentTurnIdRef,
  lastEmotionReactionTurnIdRef,
  lastTriggeredEmotionMoodRef,
  lastTriggeredExpressionRef,
  setHeldEmotionExpression,
  setHeldEmotionExpressionValue,
  clearHeldEmotionExpression,
  setStatus,
  setPhase,
  enableListeningPoseAfterReplyRef,
  waitingMotionModeRef,
  minimumTalkingDurationMsRef,
  minimumTalkingTimeoutRef,
  listeningPoseEndTimeoutRef,
}: ChatAvatarControllerOptions) {
  function canControlLoadedVrm() {
    return enabledRef.current && renderer.getDebugState().hasVrm;
  }

  function isEnabled() {
    return enabledRef.current;
  }

  function clearListeningPoseTimers() {
    clearTimeoutRef(minimumTalkingTimeoutRef);
    clearTimeoutRef(listeningPoseEndTimeoutRef);
  }

  return {
    handleUserMessageSubmitted() {
      clearListeningPoseTimers();
      if (!isEnabled()) {
        setStatus("Auto avatar control off");
        setPhase("idle");
        return;
      }

      setStatus("Avatar thinking...");
      setPhase("waitingForAssistant");

      if (!canControlLoadedVrm()) {
        return;
      }

      if (waitingMotionModeRef.current === "legacy") {
        renderer.setThinkingOverlayActive(true);
      } else {
        renderer.setThinkingOverlayActive(false);
      }
      renderer.setTalkingOverlayActive(false);
    },

    handleAssistantStreamStarted() {
      clearListeningPoseTimers();
      if (!isEnabled()) {
        setStatus("Auto avatar control off");
        setPhase("idle");
        return;
      }

      setStatus("Avatar talking...");
      setPhase("assistantTalking");

      if (!canControlLoadedVrm()) {
        return;
      }

      renderer.setThinkingOverlayActive(false);
      renderer.setTalkingOverlayActive(false);
    },

    handleAssistantResponseCompleted({
      useMinimumTalkingTimer,
    }: {
      useMinimumTalkingTimer: boolean;
    }) {
      clearListeningPoseTimers();
      if (!isEnabled()) {
        setStatus("Auto avatar control off");
        setPhase("idle");
        return;
      }

      setStatus("Avatar response complete");
      setPhase("assistantFinished");

      if (canControlLoadedVrm()) {
        renderer.setThinkingOverlayActive(false);
      }

      if (!useMinimumTalkingTimer) {
        return;
      }

      minimumTalkingTimeoutRef.current = window.setTimeout(() => {
        if (!isEnabled()) {
          setPhase("idle");
          minimumTalkingTimeoutRef.current = null;
          return;
        }

        if (canControlLoadedVrm()) {
          renderer.setTalkingOverlayActive(false);
          renderer.setThinkingOverlayActive(false);
        }
        clearHeldEmotionExpression();

        minimumTalkingTimeoutRef.current = null;

        if (!enableListeningPoseAfterReplyRef.current) {
          setStatus("Avatar idle");
          setPhase("idle");
          return;
        }

        setStatus("Avatar listening pose");
        setPhase("listeningPose");

        if (canControlLoadedVrm()) {
          renderer.setThinkingOverlayActive(true);
        }

        listeningPoseEndTimeoutRef.current = window.setTimeout(() => {
          if (canControlLoadedVrm()) {
            renderer.setThinkingOverlayActive(false);
          }

          if (isEnabled()) {
            setStatus("Avatar idle");
            setPhase("idle");
          }

          listeningPoseEndTimeoutRef.current = null;
        }, 1000);
      }, minimumTalkingDurationMsRef.current);
    },

    syncEmotion(mood: string, mappedExpression: string | null, allowEmotionReaction: boolean) {
      const currentTurnId = currentTurnIdRef.current;
      const emotionExpressionMode = emotionExpressionModeRef.current;

      if (
        !allowEmotionReaction ||
        !enabledRef.current ||
        !emotionReactionEnabledRef.current ||
        emotionExpressionMode === "off" ||
        mappedExpression === null ||
        lastEmotionReactionTurnIdRef.current === currentTurnId
      ) {
        return null;
      }

      if (!renderer.getDebugState().hasVrm) {
        return null;
      }

      renderer.setReactingMotionEnabled(false);
      if (emotionExpressionMode === "holdDuringSpeech") {
        const heldValue = 0.75;
        renderer.setExpression(mappedExpression, heldValue);
        heldEmotionExpressionRef.current = mappedExpression;
        heldEmotionExpressionValueRef.current = heldValue;
        setHeldEmotionExpression(mappedExpression);
        setHeldEmotionExpressionValue(heldValue);
        setStatus(`Avatar holding expression: ${mappedExpression}`);
      } else {
        renderer.triggerReaction(mappedExpression);
        setStatus(`Avatar reaction: ${mappedExpression}`);
      }

      lastEmotionReactionTurnIdRef.current = currentTurnId;
      lastTriggeredEmotionMoodRef.current = mood;
      lastTriggeredExpressionRef.current = mappedExpression;

      return mood;
    },
  };
}

function createMotionInput(state: "idle" | "thinking" | "talking" | "reacting"): AvatarRenderInput {
  const animationStateByMotion = {
    idle: "idle",
    thinking: "gaze-away",
    talking: "mouth-active",
    reacting: "expressive",
  };

  return {
    animationState: animationStateByMotion[state],
    intensity: state === "idle" ? 0.1 : 0.8,
    emotion: {
      mood: state === "reacting" ? "surprised" : state === "thinking" ? "thinking" : "neutral",
      intensity: state === "idle" ? 0.1 : 0.8,
    },
    bodyState: state,
  };
}

function createDebugState(
  brain: Brain,
  avatarMapper: AvatarStateMapper,
  avatarRenderer: WebMockRenderer,
  isStreaming: boolean,
): DebugState {
  const brainState = brain.getState();
  const avatarState = avatarMapper.map({
    emotion: brainState.emotion,
    bodyState: brainState.bodyState,
    isStreaming,
  });
  const renderInput = {
    animationState: avatarState.animationState,
    intensity: avatarState.intensity,
    emotion: brainState.emotion,
    bodyState: brainState.bodyState,
  };
  const renderOutput = avatarRenderer.render(renderInput);

  return {
    emotionMood: brainState.emotion.mood,
    emotionIntensity: brainState.emotion.intensity,
    bodyState: brainState.bodyState,
    avatarState,
    renderInput,
    renderState: renderOutput.renderState,
  };
}

function createAvatarDebugJson({
  debugState,
  vrmDebugState,
  speechDebugState,
  audioDebugState,
  audioInputSnapshot,
  vadSnapshot,
  audioSegmentCaptureSnapshot,
  speechRecognitionSnapshot,
  emotionMappingDebug,
  currentTurnId,
  runtimeMode,
  autoAvatarControlEnabled,
  brainProviderId,
  ollamaEndpoint,
  ollamaModel,
    characterName,
    characterStyle,
    llmReplyMaxLength,
    cleanedReplyLength,
    runtimeSessionMemory,
    memorySummary,
    brainError,
  responseDisplayMode,
  responseDisplayStatus,
  pendingAssistantText,
  emotionReactionEnabled,
    emotionExpressionMode,
    heldEmotionExpression,
    heldEmotionExpressionValue,
    detectedAssistantEmotion,
    detectedAssistantEmotionIntensity,
    activeAssistantExpression,
    expressionSource,
    minimumTalkingDurationMs,
  enableListeningPoseAfterReply,
  waitingMotionMode,
  speakingFaceMode,
}: {
  debugState: DebugState;
  vrmDebugState: VrmRendererDebugState;
  speechDebugState: SpeechDebugState;
  audioDebugState: AudioDebugState;
  audioInputSnapshot: AudioInputSnapshot;
  vadSnapshot: VadSnapshot;
  audioSegmentCaptureSnapshot: AudioSegmentCaptureSnapshot;
  speechRecognitionSnapshot: SpeechRecognitionSnapshot;
  emotionMappingDebug: EmotionMappingDebug;
  currentTurnId: number;
  runtimeMode: RuntimeMode;
  autoAvatarControlEnabled: boolean;
  brainProviderId: BrainProviderId;
  ollamaEndpoint: string;
  ollamaModel: string;
  characterName: string;
  characterStyle: string;
  llmReplyMaxLength: number;
  cleanedReplyLength: number;
  runtimeSessionMemory: RuntimeSessionMemory;
  memorySummary: string;
  brainError: string | null;
  responseDisplayMode: ResponseDisplayMode;
  responseDisplayStatus: ResponseDisplayStatus;
  pendingAssistantText: string | null;
  emotionReactionEnabled: boolean;
  emotionExpressionMode: EmotionExpressionMode;
  heldEmotionExpression: string | null;
  heldEmotionExpressionValue: number;
  detectedAssistantEmotion: AssistantEmotionName;
  detectedAssistantEmotionIntensity: number;
  activeAssistantExpression: string | null;
  expressionSource: ExpressionSource;
  minimumTalkingDurationMs: number;
  enableListeningPoseAfterReply: boolean;
  waitingMotionMode: WaitingMotionMode;
  speakingFaceMode: SpeakingFaceMode;
}) {
  return {
    chat: {
      currentTurnId,
      runtimeMode,
      currentAutoAvatarPhase: emotionMappingDebug.currentAutoAvatarPhase,
      autoAvatarControlEnabled,
      minimumTalkingDurationMs,
      enableListeningPoseAfterReply,
      waitingMotionMode,
      speakingFaceMode,
    },
    brain: {
      provider: brainProviderId,
      ollamaEndpoint,
      ollamaChatEndpoint: formatOllamaChatEndpoint(ollamaEndpoint),
      ollamaModel,
      characterName,
      characterStyle,
      replyMaxLength: llmReplyMaxLength,
      cleanedReplyLength,
      runtimeSessionMemory,
      memorySummary,
      error: brainError,
      responseDisplayMode,
      responseDisplayStatus,
      hasPendingAssistantText: pendingAssistantText !== null,
      bodyState: debugState.bodyState,
      emotion: {
        mood: debugState.emotionMood,
        intensity: debugState.emotionIntensity,
      },
    },
    avatarMapping: {
      animationState: debugState.avatarState.animationState,
      mappedExpression: emotionMappingDebug.mappedExpression,
      emotionReactionEnabled,
      emotionExpressionMode,
      detectedAssistantEmotion,
      detectedAssistantEmotionIntensity,
      activeExpression: activeAssistantExpression,
      expressionSource,
      heldEmotionExpression,
      heldEmotionExpressionValue,
      lastEmotionReactionTurnId: emotionMappingDebug.lastEmotionReactionTurnId,
      lastTriggeredEmotionMood: emotionMappingDebug.lastTriggeredEmotionMood,
      lastTriggeredExpression: emotionMappingDebug.lastTriggeredExpression,
      avatarRenderInput: debugState.renderInput,
    },
    speech: {
      enabled: speechDebugState.enabled,
      provider: speechDebugState.providerName,
      selectedTtsProvider: speechDebugState.selectedTtsProvider,
      httpEndpoint: speechDebugState.httpEndpoint,
      httpProviderName: speechDebugState.httpProviderName,
      playbackState: speechDebugState.playbackState,
      speechPlaybackState: speechDebugState.playbackState,
      lastText: speechDebugState.lastText,
      estimatedDurationMs: speechDebugState.estimatedDurationMs,
      hasAudioBlob: speechDebugState.hasAudioBlob,
      hasAudioUrl: speechDebugState.hasAudioUrl,
      remainingSpeechMs: speechDebugState.remainingSpeechMs,
      talkingControlSource: speechDebugState.talkingControlSource,
      lastError: speechDebugState.lastError,
      ttsQueue: {
        enabled: speechDebugState.ttsQueueEnabled,
        mode: speechDebugState.ttsMode,
        segmentIndex: speechDebugState.ttsQueueSegmentIndex,
        segmentCount: speechDebugState.ttsQueueSegmentCount,
        status: speechDebugState.ttsQueueStatus,
        isGeneratingNextSegment: speechDebugState.isGeneratingNextSegment,
      },
      fillerVoice: {
        enabled: speechDebugState.fillerVoiceEnabled,
        motionMode: speechDebugState.fillerMotionMode,
        waitingMotionMode,
        speakingFaceMode,
        url: speechDebugState.fillerVoiceUrl,
        status: speechDebugState.fillerVoiceStatus,
        warning: speechDebugState.fillerVoiceWarning,
      },
    },
    audio: {
      audioEnabled: audioDebugState.enabled,
      audioPlaybackState: audioDebugState.playbackState,
      lastAudioSource: audioDebugState.lastAudioSource,
    },
    audioInput: {
      supported: audioInputSnapshot.supported,
      secureContext: audioInputSnapshot.secureContext,
      permission: audioInputSnapshot.permission,
      status: audioInputSnapshot.status,
      selectedDeviceId: audioInputSnapshot.selectedDeviceId,
      deviceCount: audioInputSnapshot.devices.length,
      muted: audioInputSnapshot.muted,
      level: audioInputSnapshot.level,
      sampleRate: audioInputSnapshot.sampleRate,
      channelCount: audioInputSnapshot.channelCount,
      trackReadyState: audioInputSnapshot.trackReadyState,
      trackEnabled: audioInputSnapshot.trackEnabled,
      activeTrackCount: audioInputSnapshot.activeTrackCount,
      audioContextState: audioInputSnapshot.audioContextState,
      startCount: audioInputSnapshot.startCount,
      stopCount: audioInputSnapshot.stopCount,
      deviceChangeCount: audioInputSnapshot.deviceChangeCount,
      error: audioInputSnapshot.error,
    },
    vad: {
      enabled: vadSnapshot.enabled,
      state: vadSnapshot.state,
      calibrationProgress: vadSnapshot.calibrationProgress,
      speechActive: vadSnapshot.speechActive,
      rawLevel: vadSnapshot.rawLevel,
      smoothedLevel: vadSnapshot.smoothedLevel,
      noiseFloor: vadSnapshot.noiseFloor,
      threshold: vadSnapshot.threshold,
      score: vadSnapshot.score,
      speechStartCount: vadSnapshot.speechStartCount,
      speechEndCount: vadSnapshot.speechEndCount,
      lastSpeechDurationMs: vadSnapshot.lastSpeechDurationMs,
      lastEndReason: vadSnapshot.lastEndReason,
      processingFps: vadSnapshot.processingFps,
      activeProcessingLoopCount: vadSnapshot.activeProcessingLoopCount,
      lastError: vadSnapshot.lastError,
    },
    audioSegmentCapture: {
      enabled: audioSegmentCaptureSnapshot.enabled,
      state: audioSegmentCaptureSnapshot.state,
      pcmSourceAttached: audioSegmentCaptureSnapshot.pcmSourceAttached,
      processingFrameCount: audioSegmentCaptureSnapshot.processingFrameCount,
      sampleRate: audioSegmentCaptureSnapshot.sampleRate,
      channelCount: audioSegmentCaptureSnapshot.channelCount,
      preRollBufferedMs: audioSegmentCaptureSnapshot.preRollBufferedMs,
      activeSegmentId: audioSegmentCaptureSnapshot.activeSegmentId,
      activeSegmentDurationMs: audioSegmentCaptureSnapshot.activeSegmentDurationMs,
      activeSampleCount: audioSegmentCaptureSnapshot.activeSampleCount,
      segmentCount: audioSegmentCaptureSnapshot.segmentCount,
      lastSegmentDurationMs: audioSegmentCaptureSnapshot.lastSegmentDurationMs,
      lastSegmentByteSize: audioSegmentCaptureSnapshot.lastSegmentByteSize,
      lastEndReason: audioSegmentCaptureSnapshot.lastEndReason,
      lastValidSpeech: audioSegmentCaptureSnapshot.lastValidSpeech,
      droppedFrameCount: audioSegmentCaptureSnapshot.droppedFrameCount,
      activeCaptureLoopCount: audioSegmentCaptureSnapshot.activeCaptureLoopCount,
      lastError: audioSegmentCaptureSnapshot.lastError,
    },
    speechRecognition: {
      provider: speechRecognitionSnapshot.providerId,
      status: speechRecognitionSnapshot.status,
      autoTranscribeEnabled: speechRecognitionSnapshot.autoTranscribeEnabled,
      activeRequestId: speechRecognitionSnapshot.activeRequestId,
      activeSegmentId: speechRecognitionSnapshot.activeSegmentId,
      queueLength: speechRecognitionSnapshot.queueLength,
      requestCount: speechRecognitionSnapshot.requestCount,
      completedCount: speechRecognitionSnapshot.completedCount,
      errorCount: speechRecognitionSnapshot.errorCount,
      cancelledCount: speechRecognitionSnapshot.cancelledCount,
      lastTranscript: speechRecognitionSnapshot.lastTranscript,
      detectedLanguage: speechRecognitionSnapshot.detectedLanguage,
      processingTimeMs: speechRecognitionSnapshot.processingTimeMs,
      realtimeFactor: speechRecognitionSnapshot.realtimeFactor,
      lastError: speechRecognitionSnapshot.lastError,
      health: speechRecognitionSnapshot.health,
    },
    lipSync: {
      enabled: audioDebugState.lipSyncEnabled,
      preset: audioDebugState.lipSyncPreset,
      rawVolume: audioDebugState.currentAudioVolume,
      calibratedMouthValue: audioDebugState.externalMouthValue,
      gain: audioDebugState.lipSyncGain,
      noiseGate: audioDebugState.lipSyncNoiseGate,
      smoothing: audioDebugState.lipSyncSmoothing,
      maxMouthValue: audioDebugState.lipSyncMaxMouthValue,
      curvePower: audioDebugState.lipSyncCurvePower,
      isSaturated: audioDebugState.lipSyncIsSaturated,
      saturationWarning: audioDebugState.lipSyncSaturationWarning,
    },
    vrm: {
      hasVrm: vrmDebugState.hasVrm,
      baseMotionState: vrmDebugState.baseMotionState,
      reactionState: vrmDebugState.reactionState,
      isTalkingOverlayActive: vrmDebugState.isTalkingOverlayActive,
      isMouthOnlyOverlayActive: vrmDebugState.isMouthOnlyOverlayActive,
      isThinkingOverlayActive: vrmDebugState.isThinkingOverlayActive,
      isReactingOverlayActive: vrmDebugState.isReactingOverlayActive,
      facingDirection: vrmDebugState.facingDirection,
      cameraPreset: vrmDebugState.cameraPreset,
      reactingExpressionName: vrmDebugState.reactingExpressionName,
      currentReactingExpressionValue: vrmDebugState.currentReactingExpressionValue,
      mouthDrivingMode: vrmDebugState.mouthDrivingMode,
      externalMouthValue: vrmDebugState.externalMouthValue,
      currentMouthValue: vrmDebugState.currentMouthValue,
      mixerTime: vrmDebugState.mixerTime,
    },
  };
}

function mapEmotionToExpression(mood: string) {
  if (mood === "happy" || mood === "excited") {
    return "happy";
  }

  if (mood === "surprised") {
    return "surprised";
  }

  if (mood === "sad") {
    return "sad";
  }

  if (mood === "angry") {
    return "angry";
  }

  if (mood === "calm" || mood === "neutral") {
    return "relaxed";
  }

  if (mood === "confused") {
    return "surprised";
  }

  return null;
}

function detectAssistantEmotion(text: string): AssistantEmotionDetection {
  const normalizedText = text.toLowerCase();
  const matchers: Array<{ emotion: AssistantEmotionName; keywords: string[] }> = [
    {
      emotion: "happy",
      keywords: ["太好了", "成功", "很棒", "沒問題", "可以喔", "好耶", "開心", "nice", "great"],
    },
    {
      emotion: "surprised",
      keywords: ["咦", "哇", "真的嗎", "居然", "沒想到", "surprise"],
    },
    {
      emotion: "angry",
      keywords: ["不應該", "嚴重", "危險", "生氣"],
    },
    {
      emotion: "sad",
      keywords: ["失敗", "錯誤", "沒辦法", "可惜"],
    },
    {
      emotion: "thinking",
      keywords: ["讓我想想", "稍等", "我看看", "讀取中", "檢查一下"],
    },
    {
      emotion: "calm",
      keywords: ["抱歉", "不好意思", "沒關係", "冷靜", "calm", "relax"],
    },
  ];
  const match = matchers.find((item) =>
    item.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())),
  );
  const strongMarks = (text.match(/[!！?？]/g) ?? []).length;
  let intensity = match ? 0.62 : 0.35;

  if (strongMarks >= 3) {
    intensity = 0.9;
  } else if (strongMarks > 0) {
    intensity = Math.max(intensity, 0.75);
  }

  return {
    emotion: match?.emotion ?? "neutral",
    intensity: clamp(intensity, 0, 1),
  };
}

function mapAssistantEmotionToExpression(
  emotion: AssistantEmotionName,
  availableExpressions: string[],
) {
  const expressionCandidatesByEmotion: Record<AssistantEmotionName, string[]> = {
    happy: ["happy", "smile", "relaxed"],
    surprised: ["surprised", "happy"],
    sad: ["sad", "relaxed"],
    angry: ["angry", "surprised"],
    thinking: ["relaxed"],
    calm: ["relaxed", "happy"],
    neutral: ["relaxed"],
  };
  const candidates = expressionCandidatesByEmotion[emotion];

  return candidates.find((candidate) => availableExpressions.includes(candidate)) ?? null;
}

function getExpressionPulseEnvelope(elapsedMs: number) {
  if (elapsedMs < 400) {
    return elapsedMs / 400;
  }

  if (elapsedMs < 1600) {
    return 1;
  }

  if (elapsedMs < 2400) {
    return 1 - (elapsedMs - 1600) / 800;
  }

  return 0;
}

function formatOllamaChatEndpoint(endpoint: string) {
  const trimmedEndpoint = endpoint.trim() || "http://localhost:11434";
  const normalizedEndpoint = trimmedEndpoint.replace(/\/$/, "");

  if (normalizedEndpoint.endsWith("/api/chat")) {
    return normalizedEndpoint;
  }

  return `${normalizedEndpoint}/api/chat`;
}

function normalizeRuntimeSessionMemory(value: unknown): RuntimeSessionMemory {
  const emptyMemory = createDefaultRuntimeSessionMemory();

  if (typeof value !== "object" || value === null) {
    return emptyMemory;
  }

  const record = value as Partial<RuntimeSessionMemory>;

  return {
    completedItems: normalizeStringList(record.completedItems),
    brainProvider: normalizeString(record.brainProvider),
    ttsProvider: normalizeString(record.ttsProvider),
    characterName: normalizeString(record.characterName),
    lastError: normalizeNullableString(record.lastError),
    lastSuccessfulTest: normalizeNullableString(record.lastSuccessfulTest),
    notes: normalizeStringList(record.notes),
  };
}

function createDefaultRuntimeSessionMemory(): RuntimeSessionMemory {
  return {
    ...createEmptyRuntimeSessionMemory(),
    completedItems: DEFAULT_RUNTIME_COMPLETED_ITEMS,
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function createCharacterSystemPrompt(
  name: string,
  style: string,
  systemPrompt: string,
  memorySummary: string,
) {
  const trimmedName = name.trim() || DEFAULT_CHARACTER_NAME;
  const trimmedStyle = style.trim() || DEFAULT_CHARACTER_STYLE;
  const trimmedPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
  const trimmedMemorySummary = memorySummary.trim();

  return [
    `Character Name: ${trimmedName}`,
    `Character Style: ${trimmedStyle}`,
    trimmedPrompt,
    trimmedMemorySummary.length > 0 ? `Runtime session memory:\n${trimmedMemorySummary}` : "",
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function formatBrainProviderError(
  error: unknown,
  providerId: BrainProviderId,
  ollamaModel: string,
) {
  const message = getErrorMessage(error);

  if (providerId !== "ollama") {
    return message;
  }

  if (message === "Failed to fetch" || message.includes("fetch")) {
    return `Ollama connection failed: ${message}`;
  }

  return `Ollama error for model "${ollamaModel}": ${message}`;
}

function formatRuntimeStatus({
  brainError,
  speechDebugState,
  audioDebugState,
  responseDisplayStatus,
}: {
  brainError: string | null;
  speechDebugState: SpeechDebugState;
  audioDebugState: AudioDebugState;
  responseDisplayStatus: ResponseDisplayStatus;
}) {
  const error = brainError ?? speechDebugState.lastError ?? audioDebugState.lipSyncSaturationWarning;

  if (error) {
    return `Error: ${error}`;
  }

  if (speechDebugState.playbackState === "playing") {
    return "Speaking";
  }

  if (speechDebugState.fillerVoiceStatus === "playing") {
    return "Filler speaking";
  }

  if (responseDisplayStatus === "waitingForSpeech" || responseDisplayStatus === "speechReady") {
    return "Waiting for speech";
  }

  if (responseDisplayStatus === "thinking") {
    return "Thinking";
  }

  return "Idle";
}

function createRuntimeCoreStatusItems({
  runtimeStatus,
  avatarType,
  brainProviderId,
  ollamaModel,
  selectedTtsProvider,
  speechDebugState,
  audioDebugState,
  vrmDebugSnapshot,
  emotionExpressionMode,
  detectedAssistantEmotion,
  detectedAssistantEmotionIntensity,
  activeAssistantExpression,
  heldEmotionExpression,
  memorySummary,
  runtimeSessionMemory,
  avatarLoadSettings,
  vrmRuntimeStatus,
}: {
  runtimeStatus: string;
  avatarType: AvatarType;
  brainProviderId: BrainProviderId;
  ollamaModel: string;
  selectedTtsProvider: TtsProviderId;
  speechDebugState: SpeechDebugState;
  audioDebugState: AudioDebugState;
  vrmDebugSnapshot: VrmRendererDebugState;
  emotionExpressionMode: EmotionExpressionMode;
  detectedAssistantEmotion: AssistantEmotionName;
  detectedAssistantEmotionIntensity: number;
  activeAssistantExpression: string | null;
  heldEmotionExpression: string | null;
  memorySummary: string;
  runtimeSessionMemory: RuntimeSessionMemory;
  avatarLoadSettings: AvatarLoadSettings;
  vrmRuntimeStatus: VrmRuntimeStatus;
}): RuntimeCoreStatusItem[] {
  return [
    { label: "Status", value: runtimeStatus },
    { label: "Avatar Type", value: avatarType === "vrm" ? "VRM 3D" : "Live2D" },
    { label: "Brain", value: brainProviderId },
    { label: "Model", value: brainProviderId === "ollama" ? ollamaModel : "mock" },
    { label: "TTS", value: `${selectedTtsProvider} / ${speechDebugState.providerName}` },
    { label: "Voice", value: audioDebugState.enabled ? "on" : "off" },
    { label: "Auto Speech", value: speechDebugState.enabled ? "on" : "off" },
    { label: "Lip Sync", value: audioDebugState.lipSyncEnabled ? "on" : "off" },
    { label: "Mouth Value", value: vrmDebugSnapshot.currentMouthValue.toFixed(2) },
    { label: "Expression", value: formatEmotionExpressionMode(emotionExpressionMode) },
    {
      label: "Emotion",
      value: `${detectedAssistantEmotion} ${detectedAssistantEmotionIntensity.toFixed(2)}`,
    },
    {
      label: "Active Expression",
      value: activeAssistantExpression ?? heldEmotionExpression ?? "none",
    },
    { label: "Memory", value: memorySummary.trim().length > 0 ? "On" : "Empty" },
    { label: "Memory notes", value: `${runtimeSessionMemory.notes.length}` },
    { label: "VRM", value: vrmDebugSnapshot.hasVrm ? "loaded" : "not loaded" },
    { label: "Auto Load Avatar", value: avatarLoadSettings.autoLoadAvatar ? "On" : "Off" },
    { label: "Idle Motion", value: vrmDebugSnapshot.hasAnimation ? "loaded" : "not loaded" },
    {
      label: "Motion Status",
      value: vrmRuntimeStatus.motionError
        ? `${vrmRuntimeStatus.motionStatus}: ${vrmRuntimeStatus.motionError}`
        : vrmRuntimeStatus.motionStatus,
    },
  ];
}

function formatEmotionExpressionMode(mode: EmotionExpressionMode) {
  if (mode === "holdDuringSpeech") {
    return "Hold During Speech";
  }

  if (mode === "pulse") {
    return "Pulse";
  }

  return "Off";
}

function formatResponseDisplayStatus(status: ResponseDisplayStatus) {
  if (status === "thinking") {
    return "思考中...";
  }

  if (status === "waitingForSpeech") {
    return "思考完成，準備語音中...";
  }

  if (status === "speechReady") {
    return "語音準備好了...";
  }

  if (status === "speaking") {
    return "說話中...";
  }

  return "";
}

function formatWaitingMotionMode(mode: WaitingMotionMode) {
  if (mode === "none") {
    return "None";
  }

  if (mode === "subtleThinking") {
    return "Subtle Thinking";
  }

  return "Legacy";
}

function formatSpeakingFaceMode(mode: SpeakingFaceMode) {
  if (mode === "keepCurrent") {
    return "Keep Current";
  }

  if (mode === "smoothCenter") {
    return "Smooth Center";
  }

  return "Instant Center";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatExpressionStrength(value: number) {
  return value.toFixed(value === 1 ? 1 : 2);
}

function getAudioPlaybackSourceFromTtsResult(result: TTSResult): AudioPlaybackSource | null {
  if (result.audioUrl) {
    return { audioUrl: result.audioUrl };
  }

  if (result.audioBlob) {
    return { audioBlob: result.audioBlob };
  }

  return null;
}

function splitTextIntoTtsSegments(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return [];
  }

  const punctuationPattern = /[。！？!?；;]/;
  const rawSegments: string[] = [];
  let currentSegment = "";

  for (const character of normalizedText) {
    currentSegment += character;
    if (punctuationPattern.test(character)) {
      rawSegments.push(currentSegment.trim());
      currentSegment = "";
    }
  }

  if (currentSegment.trim()) {
    rawSegments.push(currentSegment.trim());
  }

  return rawSegments.flatMap((segment) => splitLongTtsSegment(segment, 40));
}

function splitLongTtsSegment(segment: string, maxLength: number) {
  const trimmedSegment = segment.trim();
  if (!trimmedSegment) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const character of trimmedSegment) {
    currentChunk += character;
    if (currentChunk.length >= maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function getAudioSourceLabel(source: AudioPlaybackSource) {
  if (source.audioUrl) {
    return source.audioUrl;
  }

  if (source.audioBlob) {
    return `Blob (${source.audioBlob.type || "audio"})`;
  }

  return "none";
}

function calibrateLipSyncVolume(
  rawVolume: number,
  calibration: {
    gain: number;
    noiseGate: number;
    smoothing: number;
    maxMouthValue: number;
    minMouthValue: number;
    curvePower: number;
    previousMouthValue: number;
  },
) {
  const clampedRawVolume = clamp(rawVolume, 0, 1);
  const gated =
    clampedRawVolume < calibration.noiseGate ? 0 : clampedRawVolume - calibration.noiseGate;
  const normalized = gated / Math.max(0.001, 1 - calibration.noiseGate);
  const amplified = normalized * calibration.gain;
  const softClipped = amplified / (1 + amplified);
  const curved = Math.pow(softClipped, calibration.curvePower);
  let target = curved * calibration.maxMouthValue;

  if (target > 0) {
    target = Math.max(target, calibration.minMouthValue);
  }

  const smoothed =
    calibration.previousMouthValue * calibration.smoothing +
    target * (1 - calibration.smoothing);

  return clamp(smoothed, 0, calibration.maxMouthValue);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(clamp(value, min, max));
}

function clearTimeoutRef(timeoutRef: { current: number | null }) {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function clearIntervalRef(intervalRef: { current: number | null }) {
  if (intervalRef.current !== null) {
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
}

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    display: "grid",
    placeItems: "center",
    background: "#f5f7fb",
    color: "#172033",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  panel: {
    width: "min(720px, calc(100vw - 32px))",
    display: "grid",
    gap: 16,
  },
  stageChatPanel: {
    display: "grid",
    gap: 10,
    padding: 14,
    color: "#172033",
    border: "1px solid rgba(255,255,255,.22)",
    borderRadius: 8,
    background: "rgba(15, 23, 42, .9)",
    boxShadow: "0 12px 30px rgba(0,0,0,.25)",
  },
  runtimeBar: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 12,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 0,
  },
  messages: {
    minHeight: 360,
    maxHeight: "60vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  message: {
    width: "fit-content",
    maxWidth: "82%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid transparent",
  },
  userMessage: {
    alignSelf: "flex-end",
    background: "#e7f0ff",
    borderColor: "#bfd5ff",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    background: "#f4f0e8",
    borderColor: "#ded3c2",
  },
  role: {
    display: "block",
    marginBottom: 4,
    color: "#5c667a",
    fontSize: 12,
    textTransform: "capitalize",
  },
  content: {
    margin: 0,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  form: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  input: {
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
  },
  settingLabel: {
    display: "grid",
    gap: 6,
    color: "#364152",
    fontSize: 13,
  },
  errorText: {
    margin: 0,
    color: "#b42318",
    fontSize: 13,
  },
  motionMenu: {
    position: "fixed",
    zIndex: 5,
    display: "grid",
    gap: 8,
    width: 200,
    padding: 10,
    border: "1px solid #d8deea",
    borderRadius: 8,
    background: "#ffffff",
    boxShadow: "0 12px 30px rgba(0,0,0,.25)",
  },
  textarea: {
    minWidth: 0,
    minHeight: 180,
    padding: "10px 12px",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    font: "inherit",
    lineHeight: 1.5,
    resize: "vertical",
  },
  button: {
    padding: "10px 16px",
    border: "1px solid #1f5eff",
    borderRadius: 8,
    background: "#1f5eff",
    color: "#ffffff",
    font: "inherit",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "9px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#c8d0df",
    borderRadius: 8,
    background: "#ffffff",
    color: "#172033",
    font: "inherit",
    cursor: "pointer",
  },
  activeButton: {
    borderColor: "#1f5eff",
    background: "#e7f0ff",
    color: "#123a9f",
  },
  debugPanel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  debugTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0,
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
  renderState: {
    margin: 0,
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    background: "#101828",
    color: "#f8fafc",
    fontSize: 12,
    lineHeight: 1.5,
  },
  vrmPanel: {
    display: "grid",
    gap: 12,
    padding: 16,
    background: "#ffffff",
    border: "1px solid #d8deea",
    borderRadius: 8,
  },
  vrmHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  statusText: {
    color: "#5c667a",
    fontSize: 13,
    overflowWrap: "anywhere",
    textAlign: "right",
  },
  vrmContainer: {
    width: 400,
    height: 500,
    maxWidth: "100%",
    overflow: "hidden",
    border: "1px solid #c8d0df",
    borderRadius: 8,
    background: "#eef2f7",
  },
  vrmControls: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },
  characterControls: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(140px, 180px)",
    gap: 10,
  },
  motionControls: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  expressionControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
    gap: 8,
  },
  helperText: {
    margin: 0,
    color: "#5c667a",
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;

