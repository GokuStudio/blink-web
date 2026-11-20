import React, { useState, useEffect } from 'react';
import { useTrackingStore } from '../state/trackingStore';
import { useWellnessStore } from '../wellness/wellnessStore';
import { useTelemetryPublisherStore } from '../telemetry/telemetryStore';
import { usePersonalityStore } from '../personality';
import { ConnectionStatus } from '@/shared/contracts';
import {
  Camera,
  CameraOff,
  Video,
  Activity,
  RefreshCw,
  Settings2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Eye,
  EyeOff,
  Zap,
  Bell,
  BellOff,
  Play,
  Pause,
  Cloud,
  CloudOff,
  Radio,
  Send,
} from 'lucide-react';

export const EyeTrackingDevPanel: React.FC = () => {
  const {
    permissionState,
    isCameraActive,
    isModelLoading,
    cameraError,
    modelError,
    closureLeft,
    closureRight,
    isFaceDetected,
    isMirroringEnabled,
    inferenceFps,
    averageLatencyMs,
    bridgeLatencyMs,
    pipelineLatencyMs,
    droppedFrames,
    blinkCount,
    leftWinkCount,
    rightWinkCount,
    lastEvent,
    classifierConfig,
    startTracking,
    stopTracking,
    setMirroringEnabled,
    resetCounters,
    simulateBlink,
    simulateWink,
    simulateSlowClosure,
    simulateFaceLoss,
  } = useTrackingStore();

  const {
    metrics: wellnessMetrics,
    config: wellnessConfig,
    isMonitoringActive,
    isAutoNudgeEnabled,
    startMonitoring,
    pauseMonitoring,
    resumeMonitoring,
    toggleAutoNudge,
    forceCooldownExpiration,
    triggerManualNudge,
    updateConfig: updateWellnessConfig,
    simulateNormalBlinking,
    simulateProlongedStare,
    simulateLowBlinkRate,
    simulateFaceLoss: simulateWellnessFaceLoss,
  } = useWellnessStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSynthetic, setShowSynthetic] = useState(false);

  const {
    diagnostics: publisherDiag,
    config: publisherConfig,
    isConnecting: isPublisherConnecting,
    connect: connectPublisher,
    disconnect: disconnectPublisher,
    publishNow,
  } = useTelemetryPublisherStore();

  const [roomInput, setRoomInput] = useState(publisherConfig.roomCode);

  const {
    config: personalityConfig,
    diagnostics: personalityDiag,
    owner: expressionOwner,
    currentSpontaneous,
    toggleEnabled: togglePersonalityEnabled,
    toggleTestSuppression,
    triggerNextExpression,
    resetOwnership,
    setSeed: setPersonalitySeed,
    updateConfig: updatePersonalityConfig,
  } = usePersonalityStore();

  const [seedInput, setSeedInput] = useState(personalityConfig.seed);

  useEffect(() => {
    usePersonalityStore.getState().startEngine();
  }, []);

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const calculateVisualOpenness = (closure: number) => {
    if (closure <= 0.10) return 1.0;
    if (closure >= 0.80) return 0.04;
    const norm = (closure - 0.10) / (0.80 - 0.10);
    return 1.0 - norm * 0.96;
  };

  const opennessLeft = calculateVisualOpenness(closureLeft);
  const opennessRight = calculateVisualOpenness(closureRight);

  // Wellness badge styling helper
  const getWellnessBadgeClass = (state: string) => {
    switch (state) {
      case 'healthy':
        return 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30';
      case 'warning':
        return 'bg-[#FFD043]/15 text-[#FFD043] border-[#FFD043]/30';
      case 'nudge_eligible':
      case 'nudging':
        return 'bg-[#FF5449]/20 text-[#FF5449] border-[#FF5449]/40';
      case 'cooldown':
        return 'bg-[#C084FC]/15 text-[#C084FC] border-[#C084FC]/30';
      case 'observing':
        return 'bg-[#35DFFF]/15 text-[#35DFFF] border-[#35DFFF]/30';
      default:
        return 'bg-[#22262B] text-neutral-400 border-[#272E36]';
    }
  };

  const getPublisherStatusBadge = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30';
      case 'connecting':
      case 'reconnecting':
        return 'bg-[#35DFFF]/15 text-[#35DFFF] border-[#35DFFF]/30';
      case 'failed':
        return 'bg-[#FF5449]/15 text-[#FF5449] border-[#FF5449]/30';
      default:
        return 'bg-[#22262B] text-neutral-400 border-[#272E36]';
    }
  };

  const getPersonalityStateBadgeClass = (state: string) => {
    switch (state) {
      case 'active':
        return 'bg-[#C084FC]/20 text-[#C084FC] border-[#C084FC]/40';
      case 'idle':
        return 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30';
      case 'suppressed':
        return 'bg-[#FFD043]/15 text-[#FFD043] border-[#FFD043]/30';
      case 'paused':
        return 'bg-[#35DFFF]/15 text-[#35DFFF] border-[#35DFFF]/30';
      default:
        return 'bg-[#22262B] text-neutral-400 border-[#272E36]';
    }
  };

  return (
    <div className="rounded-2xl bg-[#121519] border border-[#272E36] p-4 text-xs space-y-4">
      {/* Header & Badges */}
      <div className="flex items-center justify-between border-b border-[#272E36] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#35DFFF]" />
          <span className="font-semibold text-white tracking-wide">
            Eye Tracking & Nudge Intelligence
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1F2730] text-[#35DFFF] border border-[#35DFFF]/30">
            <ShieldCheck className="w-3 h-3" />
            RTDB Ready
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1F2226] text-neutral-400 border border-[#272E36]">
            Step 08
          </span>
        </div>
      </div>

      {/* Main Controls: Camera, Mirroring & Monitoring */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (isCameraActive) {
                stopTracking();
              } else {
                startTracking().catch(() => {});
              }
            }}
            disabled={isModelLoading}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all shadow-md ${
              isCameraActive
                ? 'bg-[#FF5449]/20 text-[#FF5449] border border-[#FF5449]/40 hover:bg-[#FF5449]/30'
                : 'bg-[#35DFFF] text-black font-semibold hover:bg-[#60E5FF] active:scale-95'
            } ${isModelLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isCameraActive ? (
              <>
                <CameraOff className="w-4 h-4" />
                <span>Stop Camera</span>
              </>
            ) : isModelLoading ? (
              <>
                <Video className="w-4 h-4 animate-spin" />
                <span>Loading Model...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Start Camera</span>
              </>
            )}
          </button>

          <button
            onClick={() => setMirroringEnabled(!isMirroringEnabled)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border font-medium transition-colors ${
              isMirroringEnabled
                ? 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30 hover:bg-[#9AEA3F]/25'
                : 'bg-[#1C2025] text-neutral-400 border-[#272E36] hover:text-white'
            }`}
            title="Toggle Real-Time Eyelid Mirroring in WebGL"
          >
            {isMirroringEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Mirroring: {isMirroringEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => toggleAutoNudge()}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border font-medium transition-colors ${
              isAutoNudgeEnabled
                ? 'bg-[#35DFFF]/15 text-[#35DFFF] border-[#35DFFF]/30 hover:bg-[#35DFFF]/25'
                : 'bg-[#1C2025] text-neutral-400 border-[#272E36] hover:text-white'
            }`}
            title="Toggle Automatic Wellness Nudges"
          >
            {isAutoNudgeEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            <span>Nudges: {isAutoNudgeEnabled ? 'AUTO' : 'OFF'}</span>
          </button>

          <button
            onClick={resetCounters}
            className="p-2 rounded-xl bg-[#1C2025] border border-[#272E36] text-neutral-300 hover:text-white hover:bg-[#252B32] transition-colors"
            title="Reset All Counters"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400 text-[10px]">Permission:</span>
            <span
              className={`font-mono text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                permissionState === 'granted'
                  ? 'bg-[#9AEA3F]/10 text-[#9AEA3F] border border-[#9AEA3F]/30'
                  : permissionState === 'denied' || permissionState === 'unsupported'
                  ? 'bg-[#FF5449]/10 text-[#FF5449] border border-[#FF5449]/30'
                  : 'bg-[#22262B] text-neutral-300'
              }`}
            >
              {permissionState}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400 text-[10px]">Face:</span>
            <span
              className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                isFaceDetected
                  ? 'bg-[#35DFFF]/10 text-[#35DFFF] border border-[#35DFFF]/30'
                  : 'bg-[#22262B] text-neutral-500'
              }`}
            >
              {isFaceDetected ? 'TRACKED' : 'NO FACE'}
            </span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {(cameraError || modelError) && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FF5449]/10 border border-[#FF5449]/30 text-[#FF5449]">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-[11px]">
            <p className="font-semibold">Tracking Initialization Error</p>
            <p className="text-neutral-300 mt-0.5">{cameraError || modelError}</p>
          </div>
        </div>
      )}

      {/* Wellness Intelligence Status Card (Requirement 9) */}
      <div className="p-3 rounded-xl bg-[#171A1E] border border-[#272E36] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-neutral-300 font-semibold text-[11px]">Wellness State:</span>
            <span
              className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${getWellnessBadgeClass(
                wellnessMetrics.state
              )}`}
            >
              {wellnessMetrics.state.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (isMonitoringActive) {
                  pauseMonitoring();
                } else if (wellnessMetrics.mode === 'paused') {
                  resumeMonitoring();
                } else {
                  startMonitoring();
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 font-medium text-[10px]"
            >
              {isMonitoringActive ? (
                <>
                  <Pause className="w-3 h-3 text-[#FFD043]" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-[#9AEA3F]" />
                  <span>{wellnessMetrics.mode === 'paused' ? 'Resume' : 'Start'}</span>
                </>
              )}
            </button>
            <button
              onClick={triggerManualNudge}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FF5449]/15 border border-[#FF5449]/30 text-[#FF5449] hover:bg-[#FF5449]/25 font-medium text-[10px]"
            >
              Manual Nudge
            </button>
          </div>
        </div>

        {/* Real-Time Interval & Rate Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Time Since Blink</span>
            <span className={`font-mono text-xs font-bold ${
              wellnessMetrics.timeSinceLastBlinkMs >= wellnessConfig.noBlinkNudgeThresholdMs
                ? 'text-[#FF5449]'
                : wellnessMetrics.timeSinceLastBlinkMs >= wellnessConfig.noBlinkReminderThresholdMs
                ? 'text-[#FFD043]'
                : 'text-white'
            }`}>
              {(wellnessMetrics.timeSinceLastBlinkMs / 1000).toFixed(1)}s
              <span className="text-neutral-500 text-[10px]"> / {(wellnessConfig.noBlinkNudgeThresholdMs / 1000).toFixed(0)}s</span>
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Rolling Blink Rate</span>
            <span className={`font-mono text-xs font-bold ${
              wellnessMetrics.rollingBlinkRateBpm === null
                ? 'text-neutral-400'
                : wellnessMetrics.rollingBlinkRateBpm < wellnessConfig.lowBlinkRateThresholdBpm
                ? 'text-[#FF5449]'
                : 'text-[#9AEA3F]'
            }`}>
              {wellnessMetrics.rollingBlinkRateBpm !== null
                ? `${wellnessMetrics.rollingBlinkRateBpm.toFixed(1)} BPM`
                : 'Observing...'}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Observation Time</span>
            <span className="font-mono text-xs font-bold text-white">
              {(wellnessMetrics.validObservationDurationMs / 1000).toFixed(0)}s
              <span className="text-neutral-500 text-[10px]"> / {(wellnessConfig.minObservationTimeForRateMs / 1000).toFixed(0)}s req</span>
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-neutral-500">Cooldown</span>
              {wellnessMetrics.cooldownRemainingMs > 0 && (
                <button
                  onClick={forceCooldownExpiration}
                  className="text-[9px] text-[#35DFFF] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <span className={`font-mono text-xs font-bold ${
              wellnessMetrics.cooldownRemainingMs > 0 ? 'text-[#C084FC]' : 'text-neutral-400'
            }`}>
              {wellnessMetrics.cooldownRemainingMs > 0
                ? `${(wellnessMetrics.cooldownRemainingMs / 1000).toFixed(0)}s left`
                : 'Ready'}
            </span>
          </div>
        </div>

        {/* Nudge Audit Row */}
        <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-[#272E36]/60">
          <div>
            <span>Total Auto-Nudges: </span>
            <strong className="text-white font-mono">{wellnessMetrics.totalAutomaticNudges}</strong>
          </div>
          <div>
            <span>Last Nudge: </span>
            <strong className="text-white font-mono">
              {wellnessMetrics.lastNudgeEvent
                ? `${wellnessMetrics.lastNudgeEvent.reason.replace('_', ' ')} (${wellnessMetrics.lastNudgeEvent.urgency})`
                : 'None'}
            </strong>
          </div>
        </div>
      </div>

      {/* Firebase RTDB Telemetry Publisher Diagnostics (Step 08) */}
      <div className="p-3 rounded-xl bg-[#171A1E] border border-[#272E36] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#35DFFF]" />
            <span className="text-neutral-200 font-semibold text-[11px]">
              Firebase Cloud Telemetry & Pairing
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${getPublisherStatusBadge(
                publisherDiag.connectionStatus
              )}`}
            >
              {publisherDiag.connectionStatus}
            </span>
            <span
              className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                publisherDiag.isRealDataSource
                  ? 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30'
                  : 'bg-[#FFD043]/15 text-[#FFD043] border-[#FFD043]/30'
              }`}
            >
              {publisherDiag.isRealDataSource ? 'CAMERA (REAL)' : 'SIMULATED'}
            </span>
          </div>
        </div>

        {/* Room Pairing & Manual Control Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-neutral-400 text-[10px]">Room:</span>
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="BLINK-DEMO"
              className="px-2 py-1 rounded-lg bg-[#121519] border border-[#272E36] font-mono text-[10px] text-white focus:outline-none focus:border-[#35DFFF] w-32"
            />
            <button
              onClick={() => {
                if (publisherDiag.connectionStatus === 'connected') {
                  disconnectPublisher().catch(() => {});
                } else {
                  connectPublisher(roomInput).catch(() => {});
                }
              }}
              disabled={isPublisherConnecting}
              className={`px-2.5 py-1 rounded-lg font-medium text-[10px] inline-flex items-center gap-1 transition-colors ${
                publisherDiag.connectionStatus === 'connected'
                  ? 'bg-[#FF5449]/15 border border-[#FF5449]/30 text-[#FF5449] hover:bg-[#FF5449]/25'
                  : 'bg-[#35DFFF]/15 border border-[#35DFFF]/30 text-[#35DFFF] hover:bg-[#35DFFF]/25'
              }`}
            >
              {publisherDiag.connectionStatus === 'connected' ? (
                <>
                  <CloudOff className="w-3 h-3" />
                  <span>Disconnect</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3 h-3" />
                  <span>{isPublisherConnecting ? 'Connecting...' : 'Connect RTDB'}</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={() => publishNow().catch(() => {})}
            disabled={publisherDiag.connectionStatus !== 'connected'}
            className="px-2.5 py-1 rounded-lg bg-[#22262B] border border-[#272E36] text-neutral-300 hover:text-white font-medium text-[10px] inline-flex items-center gap-1 disabled:opacity-40"
            title="Coalesced publish tick on demand"
          >
            <Send className="w-3 h-3 text-[#35DFFF]" />
            <span>Publish Now</span>
          </button>
        </div>

        {/* Real-time Publisher Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Last Cloud Write</span>
            <span className="font-mono text-xs font-bold text-white">
              {publisherDiag.lastPublishTimestamp
                ? formatTimestamp(publisherDiag.lastPublishTimestamp)
                : 'Never'}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Write Frequency</span>
            <span className="font-mono text-xs font-bold text-[#35DFFF]">
              {publisherDiag.writesPerMinute}
              <span className="text-neutral-500 text-[10px]"> / min</span>
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Published Blinks</span>
            <span className="font-mono text-xs font-bold text-white">
              {publisherDiag.publishedBlinkCount} blinks
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121519] border border-[#272E36]">
            <span className="text-neutral-500 block mb-0.5">Published Rate</span>
            <span className="font-mono text-xs font-bold text-[#9AEA3F]">
              {publisherDiag.publishedBlinkRate} BPM
            </span>
          </div>
        </div>

        {/* Command Acknowledgment & Error Diagnostic */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-[#272E36]/60 gap-1">
          <div>
            <span>Last Acked Command: </span>
            <strong className="text-neutral-200 font-mono">
              {publisherDiag.lastAcknowledgedCommand || 'None yet'}
            </strong>
          </div>
          <div>
            <span>Total Writes: </span>
            <strong className="text-white font-mono">{publisherDiag.totalPublishedPayloads}</strong>
          </div>
        </div>

        {publisherDiag.lastPublishError && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#FF5449]/10 border border-[#FF5449]/30 text-[#FF5449] text-[10px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Publish Error: {publisherDiag.lastPublishError}</span>
          </div>
        )}
      </div>

      {/* Autonomous Personality & Context-Aware Engine (Step 09) */}
      <div className="p-3 rounded-xl bg-[#171A1E] border border-[#272E36] space-y-3" data-testid="personality-dev-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C084FC]" />
            <span className="text-neutral-200 font-semibold text-[11px]">
              Autonomous Personality & Context Engine
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => togglePersonalityEnabled()}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                personalityConfig.enabled
                  ? 'bg-[#9AEA3F]/15 text-[#9AEA3F] border-[#9AEA3F]/30 hover:bg-[#9AEA3F]/25'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
              }`}
            >
              {personalityConfig.enabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Status & Ownership Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-[#121417] border border-[#22262B]">
            <span className="text-[9px] uppercase text-neutral-500 block">Activity State</span>
            <span className={`font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-block mt-0.5 border ${getPersonalityStateBadgeClass(personalityDiag.activityState)}`}>
              {personalityDiag.activityState}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121417] border border-[#22262B]">
            <span className="text-[9px] uppercase text-neutral-500 block">Expression Owner</span>
            <span className="font-mono text-[11px] font-bold text-[#35DFFF] block mt-0.5 capitalize">
              {expressionOwner}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121417] border border-[#22262B]">
            <span className="text-[9px] uppercase text-neutral-500 block">Current Spontaneous</span>
            <span className="font-mono text-[11px] font-bold text-neutral-200 block mt-0.5 capitalize">
              {currentSpontaneous ?? (personalityDiag.lastSpontaneousExpression ? `(${personalityDiag.lastSpontaneousExpression})` : 'none')}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-[#121417] border border-[#22262B]">
            <span className="text-[9px] uppercase text-neutral-500 block">Next Action In</span>
            <span className="font-mono text-[11px] font-bold text-white block mt-0.5">
              {personalityDiag.suppressionReason !== 'none'
                ? 'Suppressed'
                : personalityDiag.timeUntilNextEligibleMs > 0
                ? `${(personalityDiag.timeUntilNextEligibleMs / 1000).toFixed(1)}s`
                : 'Ready'}
            </span>
          </div>
        </div>

        {/* Suppression Reason Alert if suppressed */}
        {personalityDiag.suppressionReason !== 'none' && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#FFD043]/10 border border-[#FFD043]/30 text-[#FFD043] text-[10px]">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Suppression Active: <strong className="font-mono uppercase">{personalityDiag.suppressionReason}</strong></span>
            </div>
            {personalityConfig.testSuppressed && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#FFD043]/20 font-mono">TEST_LOCK</span>
            )}
          </div>
        )}

        {/* Developer Action Buttons */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            onClick={() => triggerNextExpression(true)}
            className="py-1 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#C084FC] text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
            title="Trigger Next Eligible Expression Immediately"
          >
            <Zap className="w-3 h-3" />
            <span>Trigger Next</span>
          </button>
          <button
            onClick={() => toggleTestSuppression()}
            className={`py-1 px-2 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 border transition-colors ${
              personalityConfig.testSuppressed
                ? 'bg-[#FFD043]/20 text-[#FFD043] border-[#FFD043]/40'
                : 'bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 border-transparent'
            }`}
            title="Toggle Test Suppression"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{personalityConfig.testSuppressed ? 'Unsuppress' : 'Suppress Test'}</span>
          </button>
          <button
            onClick={() => resetOwnership()}
            className="py-1 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
            title="Reset ownership to resting neutral idle"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Idle</span>
          </button>
        </div>

        {/* Seed & Parameters */}
        <div className="pt-2 border-t border-[#22262B] space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">PRNG Seed:</span>
              <input
                type="number"
                value={seedInput}
                onChange={(e) => setSeedInput(parseInt(e.target.value, 10) || 0)}
                className="w-20 px-1.5 py-0.5 rounded bg-[#121417] border border-[#272E36] text-white font-mono text-[10px]"
              />
              <button
                onClick={() => setPersonalitySeed(seedInput)}
                className="px-2 py-0.5 rounded bg-[#22262B] hover:bg-[#2A3036] text-[#35DFFF] font-medium"
              >
                Set
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-neutral-400">
              <input
                type="checkbox"
                checked={personalityConfig.suppressDuringMirroring}
                onChange={(e) => updatePersonalityConfig({ suppressDuringMirroring: e.target.checked })}
                className="rounded accent-[#35DFFF] w-3 h-3"
              />
              <span>Calm in Mirroring</span>
            </label>
          </div>

          {/* Interval & Duration Sliders */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <div className="flex justify-between text-neutral-400 mb-0.5">
                <span>Min Interval</span>
                <span className="font-mono text-white">{(personalityConfig.minIntervalMs / 1000).toFixed(0)}s</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={personalityConfig.minIntervalMs / 1000}
                onChange={(e) => updatePersonalityConfig({ minIntervalMs: parseFloat(e.target.value) * 1000 })}
                className="w-full h-1 bg-[#252B32] rounded appearance-none cursor-pointer accent-[#C084FC]"
              />
            </div>
            <div>
              <div className="flex justify-between text-neutral-400 mb-0.5">
                <span>Max Interval</span>
                <span className="font-mono text-white">{(personalityConfig.maxIntervalMs / 1000).toFixed(0)}s</span>
              </div>
              <input
                type="range"
                min="20"
                max="90"
                value={personalityConfig.maxIntervalMs / 1000}
                onChange={(e) => updatePersonalityConfig({ maxIntervalMs: parseFloat(e.target.value) * 1000 })}
                className="w-full h-1 bg-[#252B32] rounded appearance-none cursor-pointer accent-[#C084FC]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px] pt-1">
            <div>
              <div className="flex justify-between text-neutral-400 mb-0.5">
                <span>Happy (s)</span>
                <span className="font-mono text-white">{(personalityConfig.happyDurationMaxMs / 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={personalityConfig.happyDurationMaxMs / 1000}
                onChange={(e) => {
                  const max = parseFloat(e.target.value) * 1000;
                  updatePersonalityConfig({ happyDurationMaxMs: max, happyDurationMinMs: Math.min(personalityConfig.happyDurationMinMs, max) });
                }}
                className="w-full h-1 bg-[#252B32] rounded appearance-none cursor-pointer accent-[#C084FC]"
              />
            </div>
            <div>
              <div className="flex justify-between text-neutral-400 mb-0.5">
                <span>Thinking (s)</span>
                <span className="font-mono text-white">{(personalityConfig.thinkingDurationMaxMs / 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={personalityConfig.thinkingDurationMaxMs / 1000}
                onChange={(e) => {
                  const max = parseFloat(e.target.value) * 1000;
                  updatePersonalityConfig({ thinkingDurationMaxMs: max, thinkingDurationMinMs: Math.min(personalityConfig.thinkingDurationMinMs, max) });
                }}
                className="w-full h-1 bg-[#252B32] rounded appearance-none cursor-pointer accent-[#C084FC]"
              />
            </div>
            <div>
              <div className="flex justify-between text-neutral-400 mb-0.5">
                <span>Sleepy (s)</span>
                <span className="font-mono text-white">{(personalityConfig.sleepyDurationMaxMs / 1000).toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={personalityConfig.sleepyDurationMaxMs / 1000}
                onChange={(e) => {
                  const max = parseFloat(e.target.value) * 1000;
                  updatePersonalityConfig({ sleepyDurationMaxMs: max, sleepyDurationMinMs: Math.min(personalityConfig.sleepyDurationMinMs, max) });
                }}
                className="w-full h-1 bg-[#252B32] rounded appearance-none cursor-pointer accent-[#C084FC]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Latency & Performance Cards (Requirement 8) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Tracking FPS</span>
          <span className="font-mono text-sm font-bold text-white">
            {isCameraActive ? `${inferenceFps} FPS` : '—'}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Inference Latency</span>
          <span className="font-mono text-sm font-bold text-white">
            {isCameraActive ? `${averageLatencyMs.toFixed(1)} ms` : '—'}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Bridge / Pipeline</span>
          <span className="font-mono text-sm font-bold text-white">
            {isCameraActive || bridgeLatencyMs > 0 ? `${bridgeLatencyMs.toFixed(1)} / ${pipelineLatencyMs.toFixed(1)} ms` : '—'}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Dropped Frames</span>
          <span className="font-mono text-sm font-bold text-neutral-300">
            {droppedFrames}
          </span>
        </div>
      </div>

      {/* Blink & Wink Counters */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Bilateral Blinks</span>
          <span className="font-mono text-base font-bold text-[#35DFFF]">
            {blinkCount}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Left Winks</span>
          <span className="font-mono text-base font-bold text-neutral-200">
            {leftWinkCount}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36]">
          <span className="text-[10px] uppercase text-neutral-400 block mb-0.5">Right Winks</span>
          <span className="font-mono text-base font-bold text-neutral-200">
            {rightWinkCount}
          </span>
        </div>
      </div>

      {/* Real-Time Eye Closure & Openness Visualizers */}
      <div className="space-y-3 p-3 rounded-xl bg-[#171A1E] border border-[#272E36]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-300 font-semibold">Continuous Eyelid Deformation</span>
          <span className="text-[10px] text-neutral-500 font-mono">
            {isMirroringEnabled && isFaceDetected ? 'Mirroring to WebGL' : 'Mirroring Inactive'}
          </span>
        </div>

        {/* Left Eye */}
        <div>
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="text-neutral-400">
              Left Eye <span className="text-[10px] text-neutral-500">(User Left ➔ Screen Left)</span>
            </span>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="text-neutral-400">
                Raw: <strong className={closureLeft >= 0.6 ? 'text-[#35DFFF]' : 'text-neutral-300'}>{(closureLeft * 100).toFixed(0)}%</strong>
              </span>
              <span className="text-neutral-400">
                Openness: <strong className="text-white">{(opennessLeft * 100).toFixed(0)}%</strong>
              </span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-[#252B32] overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                closureLeft >= classifierConfig.closeThreshold
                  ? 'bg-[#35DFFF]'
                  : closureLeft <= classifierConfig.openThreshold
                  ? 'bg-neutral-500'
                  : 'bg-[#9AEA3F]'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, closureLeft * 100))}%` }}
            />
          </div>
        </div>

        {/* Right Eye */}
        <div>
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="text-neutral-400">
              Right Eye <span className="text-[10px] text-neutral-500">(User Right ➔ Screen Right)</span>
            </span>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="text-neutral-400">
                Raw: <strong className={closureRight >= 0.6 ? 'text-[#35DFFF]' : 'text-neutral-300'}>{(closureRight * 100).toFixed(0)}%</strong>
              </span>
              <span className="text-neutral-400">
                Openness: <strong className="text-white">{(opennessRight * 100).toFixed(0)}%</strong>
              </span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-[#252B32] overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                closureRight >= classifierConfig.closeThreshold
                  ? 'bg-[#35DFFF]'
                  : closureRight <= classifierConfig.openThreshold
                  ? 'bg-neutral-500'
                  : 'bg-[#9AEA3F]'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, closureRight * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Most Recent Event Telemetry */}
      <div className="p-2.5 rounded-xl bg-[#171A1E] border border-[#272E36] flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase text-neutral-500 block">Classified Blink Event</span>
          <span className="font-mono text-[11px] font-semibold text-white">
            {lastEvent ? (
              <span className="text-[#35DFFF]">
                {lastEvent.type} <span className="text-neutral-400">({lastEvent.durationMs.toFixed(0)} ms)</span>
              </span>
            ) : (
              <span className="text-neutral-500">No events detected yet</span>
            )}
          </span>
        </div>
        {lastEvent && (
          <span className="font-mono text-[10px] text-neutral-400">
            {formatTimestamp(lastEvent.timestamp)}
          </span>
        )}
      </div>

      {/* Synthetic Inputs Section (Requirement 9) */}
      <div className="pt-1">
        <button
          onClick={() => setShowSynthetic(!showSynthetic)}
          className="flex items-center gap-1.5 text-[11px] text-[#35DFFF] hover:underline transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{showSynthetic ? 'Hide Test Simulation Drivers' : 'Deterministic Simulation Drivers (Testing)'}</span>
        </button>

        {showSynthetic && (
          <div className="mt-2.5 p-3 rounded-xl bg-[#171A1E] border border-[#272E36] space-y-3">
            <div>
              <span className="text-[10px] font-semibold text-neutral-300 block mb-1">
                A. Eyelid Mirroring & Blink Events:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => simulateBlink(180)}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#35DFFF] font-medium text-center"
                >
                  Bilateral Blink (180ms)
                </button>
                <button
                  onClick={() => simulateSlowClosure(600)}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#35DFFF] font-medium text-center"
                >
                  Slow Closure (600ms)
                </button>
                <button
                  onClick={() => simulateWink('left', 180)}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 font-medium text-center"
                >
                  Left Wink (180ms)
                </button>
                <button
                  onClick={() => simulateWink('right', 180)}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-neutral-300 font-medium text-center"
                >
                  Right Wink (180ms)
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-[#272E36]/60">
              <span className="text-[10px] font-semibold text-neutral-300 block mb-1">
                B. Wellness & Automatic Nudge Scenarios:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => simulateNormalBlinking()}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#9AEA3F] font-medium text-center"
                >
                  Normal Blinks (18 BPM)
                </button>
                <button
                  onClick={() => simulateProlongedStare()}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#FF5449] font-medium text-center"
                >
                  Prolonged Stare (&gt;18s)
                </button>
                <button
                  onClick={() => simulateLowBlinkRate()}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#FFD043] font-medium text-center"
                >
                  Low Blink Rate (&lt;12 BPM)
                </button>
                <button
                  onClick={() => {
                    simulateFaceLoss();
                    simulateWellnessFaceLoss();
                  }}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#FF5449] font-medium text-center"
                >
                  Simulate Face Loss
                </button>
                <button
                  onClick={() => forceCooldownExpiration()}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-[#C084FC] font-medium text-center"
                >
                  Force Cooldown Expiry
                </button>
                <button
                  onClick={() => triggerManualNudge()}
                  className="py-1.5 px-2 rounded-lg bg-[#22262B] hover:bg-[#2A3036] text-white font-medium text-center"
                >
                  Manual Test Nudge
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Tuning Drawer Toggle */}
      <div className="pt-1 border-t border-[#272E36]">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-white transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{showAdvanced ? 'Hide Advanced Settings' : 'Advanced Classifier & Nudge Tuning'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 p-3 rounded-xl bg-[#171A1E] border border-[#272E36] space-y-3">
            <div>
              <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                <span>Prolonged Stare Nudge Threshold</span>
                <span className="font-mono text-white">{(wellnessConfig.noBlinkNudgeThresholdMs / 1000).toFixed(0)}s</span>
              </div>
              <input
                type="range"
                min="8"
                max="30"
                step="1"
                value={wellnessConfig.noBlinkNudgeThresholdMs / 1000}
                onChange={(e) => updateWellnessConfig({ noBlinkNudgeThresholdMs: parseFloat(e.target.value) * 1000 })}
                className="w-full h-1 bg-[#252B32] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                <span>Low Blink Rate Threshold (BPM)</span>
                <span className="font-mono text-white">{wellnessConfig.lowBlinkRateThresholdBpm} BPM</span>
              </div>
              <input
                type="range"
                min="6"
                max="18"
                step="1"
                value={wellnessConfig.lowBlinkRateThresholdBpm}
                onChange={(e) => updateWellnessConfig({ lowBlinkRateThresholdBpm: parseInt(e.target.value, 10) })}
                className="w-full h-1 bg-[#252B32] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                <span>Nudge Cooldown Duration</span>
                <span className="font-mono text-white">{(wellnessConfig.nudgeCooldownMs / 1000).toFixed(0)}s</span>
              </div>
              <input
                type="range"
                min="15"
                max="120"
                step="5"
                value={wellnessConfig.nudgeCooldownMs / 1000}
                onChange={(e) => updateWellnessConfig({ nudgeCooldownMs: parseFloat(e.target.value) * 1000 })}
                className="w-full h-1 bg-[#252B32] rounded-lg appearance-none cursor-pointer accent-[#35DFFF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
              <div>
                <span className="text-neutral-500 block">Min Obs Window:</span>
                <span className="font-mono text-neutral-300">{(wellnessConfig.minObservationTimeForRateMs / 1000).toFixed(0)}s</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Rolling Window:</span>
                <span className="font-mono text-neutral-300">{(wellnessConfig.rollingWindowDurationMs / 1000).toFixed(0)}s</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
