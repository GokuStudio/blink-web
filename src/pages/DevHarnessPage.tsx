import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/useAuth';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import { DeviceCommand, DeviceTelemetry, DEFAULT_TELEMETRY, BlinkExpressionType } from '@/shared/contracts';

/**
 * Developer-only Integration Harness (F2B)
 * Used to verify live two-browser realtime communication without production UI.
 * Excluded from production builds.
 */
export const DevHarnessPage: React.FC = () => {
  if (import.meta.env.PROD) {
    return <Navigate to="/demo" replace />;
  }

  const { userId, isAuthenticated, signInAnonymous } = useAuth();
  const [role, setRole] = useState<'device' | 'controller'>('device');
  const [roomCode, setRoomCode] = useState<string>('DEV-ROOM-1');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [activeInvite, setActiveInvite] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<DeviceTelemetry | null>(null);
  const [receivedCommands, setReceivedCommands] = useState<DeviceCommand[]>([]);
  const [lastAck, setLastAck] = useState<string | null>(null);

  const [roomService] = useState(() => new FirebaseRoomService());
  const [realtimeService] = useState(() => new FirebaseRealtimeService());

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Device: Create room and connect
  const handleDeviceSetup = async () => {
    try {
      if (!isAuthenticated) await signInAnonymous();
      addLog(`Creating room ${roomCode} as Blink Device...`);
      const room = await roomService.createRoom({ roomCode, role: 'blink-device' });
      const inviteKey = Object.keys(room.invitations || {})[0];
      if (inviteKey) {
        setActiveInvite(inviteKey);
        addLog(`Generated invitation: ${inviteKey}`);
      }
      await realtimeService.connect(roomCode);
      setIsConnected(true);
      addLog(`Connected to ${roomCode}. Listening for commands...`);

      // Subscribe to commands
      realtimeService.subscribeToCommands(async (cmd) => {
        addLog(`Received command: ${cmd.type} (ID: ${cmd.id.slice(0, 8)})`);
        setReceivedCommands((prev) => [cmd, ...prev]);

        // Auto-acknowledge as executed
        await realtimeService.acknowledgeCommand(cmd.id, 'executed', `Executed ${cmd.type}`);
        addLog(`Acknowledged command ${cmd.id.slice(0, 8)} as EXECUTED`);
      });
    } catch (err: any) {
      addLog(`Device setup error: ${err.message}`);
    }
  };

  // Device: Publish simulated telemetry
  const handlePublishTelemetry = async () => {
    try {
      const telemetry: DeviceTelemetry = {
        ...DEFAULT_TELEMETRY,
        eventId: `telem-${Date.now()}`,
        timestamp: Date.now(),
        isSimulated: true,
        currentBlinkRatePerMinute: Math.floor(14 + Math.random() * 8),
        averageBlinkRatePerMinute: 17,
        blinkCount: 42,
        sessionDurationSeconds: 120,
      };
      await realtimeService.publishTelemetry(telemetry);
      addLog(`Published telemetry (Rate: ${telemetry.currentBlinkRatePerMinute} bpm)`);
    } catch (err: any) {
      addLog(`Telemetry publish error: ${err.message}`);
    }
  };

  // Controller: Join room with invite
  const handleControllerJoin = async () => {
    try {
      if (!isAuthenticated) await signInAnonymous();
      addLog(`Joining room ${roomCode} with invite ${inviteCode}...`);
      await roomService.joinRoomWithInvite({ roomCode, inviteCode });
      await realtimeService.connect(roomCode);
      setIsConnected(true);
      addLog(`Joined and connected to ${roomCode} as Controller.`);

      // Subscribe to telemetry
      realtimeService.subscribeToTelemetry((t) => {
        setLatestTelemetry(t);
        addLog(`Received live telemetry (Rate: ${t.currentBlinkRatePerMinute} bpm)`);
      });
    } catch (err: any) {
      addLog(`Controller join error: ${err.message}`);
    }
  };

  // Controller: Send SET_EXPRESSION command
  const handleSendCommand = async (expr: BlinkExpressionType) => {
    try {
      const cmdId = `cmd-${Date.now()}`;
      addLog(`Sending SET_EXPRESSION (${expr})...`);
      const cmd: DeviceCommand = {
        id: cmdId,
        schemaVersion: 1,
        targetDeviceId: 'blink-device-01',
        senderId: userId || 'unknown',
        type: 'SET_EXPRESSION',
        payload: { expression: expr },
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
      };

      // Subscribe to acknowledgment
      realtimeService.subscribeToCommandStatus(cmdId, (ack) => {
        setLastAck(`Command ${ack.commandId.slice(0, 8)}: ${ack.status.toUpperCase()} (${ack.resultMessage || ''})`);
        addLog(`ACK Received: ${ack.status.toUpperCase()}`);
      });

      await realtimeService.sendCommand(cmd);
    } catch (err: any) {
      addLog(`Command error: ${err.message}`);
    }
  };

  useEffect(() => {
    return () => {
      realtimeService.disconnect().catch(() => {});
    };
  }, [realtimeService]);

  return (
    <div className="min-h-screen bg-[#080A0C] text-white p-6 font-mono text-xs">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="border border-yellow-500/30 bg-yellow-500/10 p-4 rounded-xl text-yellow-400">
          <h1 className="font-bold text-sm">INTERNAL DEV HARNESS (F2B) — DEV ENVIRONMENT ONLY</h1>
          <p className="text-[11px] mt-1 text-yellow-300">
            For validating two-browser real-time synchronization against Firebase emulators. Not included in production.
          </p>
        </div>

        {/* Auth & Role Switcher */}
        <div className="p-4 bg-[#171A1D] border border-[#272E36] rounded-xl flex items-center justify-between">
          <div>
            <div>UID: <span className="text-[#35DFFF]">{userId || 'Not signed in'}</span></div>
            <div>STATUS: <span className={isConnected ? 'text-[#9AEA3F]' : 'text-neutral-400'}>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span></div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setRole('device'); setIsConnected(false); }}
              className={`px-3 py-1.5 rounded-lg border ${role === 'device' ? 'bg-[#35DFFF] text-black font-bold' : 'bg-[#22262B] text-neutral-300'}`}
            >
              BROWSER A: DEVICE
            </button>
            <button
              onClick={() => { setRole('controller'); setIsConnected(false); }}
              className={`px-3 py-1.5 rounded-lg border ${role === 'controller' ? 'bg-[#9AEA3F] text-black font-bold' : 'bg-[#22262B] text-neutral-300'}`}
            >
              BROWSER B: CONTROLLER
            </button>
          </div>
        </div>

        {/* Role Controls */}
        <div className="p-4 bg-[#171A1D] border border-[#272E36] rounded-xl space-y-4">
          <div className="flex gap-3 items-center">
            <label>ROOM CODE:</label>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="bg-[#0E1114] border border-[#272E36] px-3 py-1 rounded text-white font-mono"
            />
          </div>

          {role === 'device' ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleDeviceSetup}
                  disabled={isConnected}
                  className="px-4 py-2 bg-[#35DFFF] text-black font-bold rounded-lg disabled:opacity-50"
                >
                  Create & Listen as Device
                </button>
                <button
                  onClick={handlePublishTelemetry}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-[#22262B] text-white hover:bg-[#2A3036] rounded-lg disabled:opacity-50"
                >
                  Publish Simulated Telemetry
                </button>
              </div>
              {activeInvite && (
                <div className="p-3 bg-[#0E1114] border border-[#35DFFF]/30 rounded text-[#35DFFF]">
                  SHARE THIS INVITE CODE WITH CONTROLLER: <span className="font-bold text-base">{activeInvite}</span>
                </div>
              )}
              <div>
                <h3 className="font-bold mb-2">Received Commands ({receivedCommands.length}):</h3>
                {receivedCommands.map((c) => (
                  <div key={c.id} className="p-2 bg-[#0E1114] rounded border border-[#272E36] mb-1">
                    {c.type} — ID: {c.id} (Sender: {c.senderId.slice(0, 8)})
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                <label>INVITE CODE:</label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="PAIR-XXXX"
                  className="bg-[#0E1114] border border-[#272E36] px-3 py-1 rounded text-white font-mono"
                />
                <button
                  onClick={handleControllerJoin}
                  disabled={isConnected || !inviteCode}
                  className="px-4 py-2 bg-[#9AEA3F] text-black font-bold rounded-lg disabled:opacity-50"
                >
                  Join as Controller
                </button>
              </div>

              {latestTelemetry && (
                <div className="p-3 bg-[#0E1114] border border-[#9AEA3F]/30 rounded text-[#9AEA3F]">
                  LATEST TELEMETRY: {latestTelemetry.currentBlinkRatePerMinute} bpm | Count: {latestTelemetry.blinkCount} | isSimulated: {String(latestTelemetry.isSimulated)}
                </div>
              )}

              {lastAck && (
                <div className="p-3 bg-[#0E1114] border border-blue-500/30 rounded text-blue-400">
                  {lastAck}
                </div>
              )}

              <div className="flex gap-2 items-center">
                <span>SEND COMMAND:</span>
                {(['happy', 'sleepy', 'alert', 'idle'] as BlinkExpressionType[]).map((expr) => (
                  <button
                    key={expr}
                    onClick={() => handleSendCommand(expr)}
                    disabled={!isConnected}
                    className="px-3 py-1 bg-[#22262B] text-white hover:bg-[#2A3036] rounded disabled:opacity-50 capitalize"
                  >
                    {expr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Activity Logs */}
        <div className="p-4 bg-[#0E1114] border border-[#272E36] rounded-xl">
          <h3 className="font-bold text-neutral-400 mb-2">LIVE LOGS:</h3>
          <div className="space-y-1">
            {logs.map((l, i) => (
              <div key={i} className="text-neutral-300">{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
