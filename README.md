# AI VTuber Runtime

以 TypeScript / React 開發的 AI 虛擬角色互動原型，整合本機語言模型、語音輸入、語音合成與角色表演，並提供 Electron 桌面外殼。

本儲存庫為**作品集原始碼展示版**，不提供線上服務、GitHub Pages 或可直接安裝的執行檔。保留自寫程式碼、測試、重建設定及去識別化的設定範例；不附帶角色素材、聲音樣本、模型權重與已安裝的第三方依賴。

> **重建不等於完整功能開箱即用。** 此擷取版尚未重新安裝依賴、建置或執行測試。模型、素材及本機服務須另外準備；缺少素材時，角色載入失敗或資源 404 屬於此展示版的已知限制。

## 展示重點

- **對話編排**：Provider 介面串接 Mock 與 Ollama，組合角色設定、情緒及執行期間的對話記憶。
- **語音輸入管線**：瀏覽器麥克風擷取、VAD、音訊片段、STT Provider、中文逐字稿正規化與送出流程。
- **語音輸出管線**：Mock / HTTP TTS、音訊播放與嘴型同步，以及 Python HTTP 服務介接。
- **角色控制**：VRM 載入、視線、自主行為、情緒表情，以及 Live2D Canvas 整合程式碼。
- **呈現與除錯**：舞台背景、角色展示介面與各管線的除錯面板。
- **桌面外殼**：Electron 主程序、preload、`app://runtime` 靜態資源協定與 Windows 資料夾封裝設定。

以上是程式碼涵蓋的能力，不表示本次擷取後已全部通過執行驗收；相關測試位置見下方。

## 技術與架構

| 層級 | 使用技術／職責 |
| --- | --- |
| 前端 | React、TypeScript、Vite |
| 角色呈現 | Three.js、@pixiv/three-vrm、PixiJS、Live2D 整合 |
| 桌面 | Electron、electron-builder |
| 音訊 | Web Audio、AudioWorklet、VAD、WAV 擷取與播放 |
| 對話 | Ollama HTTP API、可替換的 Provider |
| Python 介接 | FastAPI、Uvicorn、IndexTTS-2 wrapper、faster-whisper |
| 專案管理 | pnpm workspace、lockfile、Node.js 測試 |

```text
apps/web：互動介面與流程編排
  ├─ packages/brain：LLM Provider、角色設定、情緒與記憶
  ├─ packages/audio-core：麥克風、VAD、音訊片段與播放
  ├─ packages/stt-core：語音辨識與逐字稿處理
  ├─ packages/speech-core：TTS Provider
  └─ packages/avatar-core / avatar-vrm：角色狀態與 VRM 控制

apps/desktop：Electron 外殼，載入 Web 介面
python/：獨立啟動的 HTTP 語音服務
```

### 目錄

```text
apps/
  web/                主要 Web 介面、元件及測試
  desktop/            Electron 程式碼、封裝設定及測試
  live2d-spike/       Live2D 技術驗證程式碼，非主要入口
packages/
  audio-core/         瀏覽器音訊處理
  avatar-core/        角色呈現介面與狀態映射
  avatar-vrm/         VRM 呈現與行為控制
  brain/              對話、情緒及記憶
  event-bus/          事件模組預留骨架，非完整事件系統
  speech-core/        語音合成介面與 Provider
  stt-core/           語音辨識與正規化
python/
  index_tts2_http/    TTS wrapper 與可選 gateway
  local_stt_http/     本機 STT HTTP 服務
  tts_http_test/      獨立的測試用 TTS HTTP 服務
```

## 重建 Web 介面

以下以 Windows PowerShell 為例，指令從儲存庫根目錄執行。需要 Git、Node.js 及 pnpm；根目錄 `package.json` 指定 `pnpm@9.0.0`。Node.js 建議使用 24 LTS，但本擷取版尚未完成乾淨環境相容性驗證。

```powershell
git clone https://github.com/Afress/AI-VTuber-Runtime-20260617-1.git
cd AI-VTuber-Runtime-20260617-1
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @runtime/web build
pnpm --filter @runtime/web dev
```

使用 Vite 輸出的本機網址開啟介面。依賴安裝會下載第三方套件，可能包含 Electron 執行環境；本儲存庫不直接存放這些檔案。

### 不啟動 AI 服務的程式流程檢視

在介面的開發者／除錯設定中，將 Chat provider 改為 `mock`、TTS provider 改為 `mock-tts` 或 `mock-audio-tts`，可避免相應的外部服務請求：

- `mock`：固定規則的對話替身，不是語言模型。
- `mock-tts`：只回傳估計時長，沒有真正語音。
- `mock-audio-tts`：程式產生的測試波形，不是人聲或語音模型。

預設仍是 Ollama 與 HTTP TTS；本版沒有改寫啟動預設。Mock 也不會補上缺少的角色模型或 Live2D Core，不能視為完整視覺展示模式。

## 自行補齊資源

以下資源**未隨原始碼提供**；請使用自己持有、且具有適當授權的素材，不要將私人資料提交到 Git。

| 資源 | 程式預設位置／需求 |
| --- | --- |
| VRM 模型 | `apps/web/public/models/default.vrm`；亦可在介面調整模型 URL |
| VRM 動作 | `apps/web/public/motions/idle.vrma` |
| Live2D 模型與貼圖 | `apps/web/public/live2d/model.model3.json` 及它引用的相依檔案 |
| Live2D Cubism Core | `apps/web/public/live2d/core/live2dcubismcore.min.js`；依官方授權自行取得 |
| 填充語音 | `apps/web/public/audio/filler_received_loading.wav`，如需此功能自行準備 |
| 真實 AI 模型 | Ollama 模型、IndexTTS-2 權重、Whisper 模型等，另行安裝／下載 |
| TTS 聲音樣本 | 於本機 `config.json` 指定具授權的參考音檔，不提交到儲存庫 |

`apps/web/public/audio/pcm-capture-worklet.js` 是自寫音訊處理程式，並非錄音素材，因此保留。

### Ollama 對話（選用）

另行安裝並啟動 Ollama，準備介面設定的模型。程式預設模型為 `qwen3:8b`：

```powershell
ollama pull qwen3:8b
```

模型下載需要網路、磁碟空間及足夠記憶體。Web 開發模式由 Vite 將 `/api/chat` 轉送至 `http://127.0.0.1:11434`。

### Python 語音服務（選用）

Python 服務與前端分開管理，請使用獨立虛擬環境。Python 版本、CUDA 及驅動需配合各上游模型要求；本版未鎖定完整 Python 依賴版本，不能保證跨環境位元級重現。

#### TTS wrapper

```powershell
python -m venv python/index_tts2_http/.venv
.\python\index_tts2_http\.venv\Scripts\python.exe -m pip install -r python/index_tts2_http/requirements.txt
Copy-Item python/index_tts2_http/config.example.json python/index_tts2_http/config.json
.\python\index_tts2_http\.venv\Scripts\python.exe python/index_tts2_http/server.py
```

範例設定為 `mode: "mock"`，只提供測試音訊；預設監聽 `127.0.0.1:7861`。真實人聲合成需另外安裝 IndexTTS-2、權重與其依賴，將本機 `config.json` 的 `mode` 改為 `indextts2`，並填入 `indextts2_repo_dir`、`model_dir`、`reference_audio`。服務應在能匯入 IndexTTS-2 的 Python 環境中執行；上述最小依賴安裝不包含真正的推論環境。

#### 本機 STT

```powershell
python -m venv python/local_stt_http/.venv
.\python\local_stt_http\.venv\Scripts\python.exe -m pip install -r python/local_stt_http/requirements.txt
Copy-Item python/local_stt_http/config.example.json python/local_stt_http/config.json
.\python\local_stt_http\.venv\Scripts\python.exe python/local_stt_http/server.py
```

預設監聽 `127.0.0.1:7890`，範例採用 `small`、`cuda`、`float16`。沒有相容 GPU 時可於本機設定改用 `device: "cpu"`、`compute_type: "int8"`；模型可能在首次辨識時下載，效能與環境相容性須自行驗證。

Vite 開發模式已有 `/api/tts` 與 `/api/local-stt` proxy；不要以直接開啟 HTML 檔或單純的靜態檔案服務取代它。

## Electron 桌面外殼

先在一個 PowerShell 視窗啟動 Web：

```powershell
pnpm --filter @runtime/web dev
```

再於另一個視窗、相同專案根目錄執行，網址以實際 Vite 輸出為準：

```powershell
$env:ELECTRON_RENDERER_URL = "http://localhost:5173"
pnpm --filter @runtime/desktop dev
```

Windows 資料夾封裝指令：

```powershell
pnpm --filter @runtime/desktop package:unpacked
```

設定的輸出位置為 `apps/desktop/release/win-unpacked/AI VTuber Runtime.exe`。這不是安裝程式；封裝只帶入前端與 Electron 外殼，不會補上被排除的素材、啟動 Python／Ollama，或附帶模型權重。

**桌面執行限制：**封裝版從 `app://runtime` 直接連本機服務，目前 TTS wrapper 未提供對應 CORS 設定；TTS 跨來源請求可能被阻擋，Ollama 的來源許可也需另外驗證。本版未修正這些問題，未驗收完整桌面流程；不要將封裝指令等同已完成可交付的桌面產品。

## 測試與驗證指令

完成依賴安裝後，可從根目錄執行以下既有測試。這些是**重現指令，不是本次已通過的測試結果**：

```powershell
pnpm --filter @runtime/web test:runtime-endpoints
pnpm --filter @runtime/web test:chinese-normalization
pnpm --filter @runtime/web test:normalized-transcript-review
pnpm --filter @runtime/web test:stage-presentation
pnpm --filter @runtime/web test:voice-turn-submission
pnpm --filter @runtime/audio-core test:input
pnpm --filter @runtime/audio-core test:vad
pnpm --filter @runtime/audio-core test:segment-capture
pnpm --filter @runtime/avatar-vrm test:behavior
pnpm --filter @runtime/stt-core test
pnpm --filter @runtime/stt-core test:local-http-endpoints
pnpm --filter @runtime/stt-core test:transcript-normalization
pnpm --filter @runtime/desktop test
```

Web `build` 使用 Vite，不等同完整 TypeScript 型別檢查；其他 workspace 套件另有各自的建置／檢查指令。角色渲染、麥克風權限、真實推論與桌面跨來源連線仍需要整合驗收。

## 公開內容與已知限制

- 不包含私人設定、參考聲音、模型／貼圖／動作、訓練權重、執行日誌、備份或內部工作紀錄。
- 不包含 `node_modules`、Python 虛擬環境、已編譯檔案或舊 exe；以 manifest 與 lockfile 重裝依賴。
- 沒有複製原始專案的硬編碼個人路徑啟動腳本，請使用本文指令。
- Web 預設載入的 Live2D Core script 與角色素材沒有提供，可能出現 404 或模型錯誤；本版保留原始程式行為，不偽造成功畫面。
- `apps/live2d-spike` 是技術驗證用程式，亦依賴另外準備的 Live2D 資源。
- `python/index_tts2_http/gateway.py` 是保留的輔助程式，非本作品集必要啟動流程；另依賴 `httpx`，並未包含在 TTS 的 `requirements.txt`，且沒有 STT proxy。此版不提供公開網路部署指引。
- 瀏覽器設定與對話記憶可能保存在使用者本機 `localStorage`；分享錄影、螢幕或除錯輸出前請自行檢查。
- 目前沒有安裝程式、自動更新或簽章交付流程；本版不宣稱達到正式產品或公開服務的安全驗收標準。

## 第三方授權

React、Vite、Electron、Three.js、PixiJS、VRM／Live2D 相關套件、Ollama、IndexTTS-2、faster-whisper 與各模型／素材，均保留各自的著作權及授權條款。**本儲存庫不授予第三方模型、聲音、角色素材或 SDK 的使用及再散布權利**；取得資源前請自行確認官方條款，勿將作品集展示視為商業使用授權。

本次整理沒有替原始程式碼新增授權條款。公開展示不等同提供任意使用、修改或散布的授權。
