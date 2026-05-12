import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { wsClient, send, onMessage } from "../../websocket";
import type { WSMessage, Peer, InterceptedPacket, ClientId } from "../../types";

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function IntruderView() {
  const wsConnected = useStore((state) => state.wsConnected);
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [mitmActive, setMitmActive] = useState(false);
  const protocol = useStore((state) => state.protocol);
  const [attackStatus, setAttackStatus] = useState("");
  const [attackResult, setAttackResult] = useState<"success" | "failed" | null>(
    null,
  );
  const interceptedPackets = useStore((state) => state.interceptedPackets);
  const [selectedPacketKey, setSelectedPacketKey] = useState<string | null>(
    null,
  );
  const shouldAutoStartAttackRef = useRef(false);

  // Generate keypair on mount
  useEffect(() => {
    const generateKeys = async () => {
      const { generateRSAKeyPair } = await import("../../crypto");
      const kp = await generateRSAKeyPair();
      setKeyPair(kp);
      console.log("[Intruder] KeyPair generated");
    };
    generateKeys();
  }, []);

  // Register with server
  useEffect(() => {
    if (!wsConnected || !keyPair) return;

    const register = async () => {
      const { exportPublicKey } = await import("../../crypto");
      const publicKeyJWK = await exportPublicKey(keyPair.publicKey);
      send(wsClient, {
        type: "REGISTER",
        from: "Intruder",
        to: "server",
        payload: { id: "Intruder", publicKey: publicKeyJWK },
        timestamp: Date.now(),
      });
      console.log("[Intruder] Registered with server");
    };
    register();
  }, [keyPair, wsConnected]);

  // Handle peer list updates
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      const { peers: peerList } = msg.payload as {
        peers: Array<{ id: ClientId; publicKey: JsonWebKey }>;
      };
      const { importPublicKey } = await import("../../crypto");
      const importedPeers = await Promise.all(
        peerList.map(async (p) => ({
          id: p.id,
          publicKey: await importPublicKey(p.publicKey),
        })),
      );
      setPeers(importedPeers);
      console.log(
        "[Intruder] Received peer list:",
        peerList.map((p) => p.id).join(", "),
      );
    };

    return onMessage(wsClient, "PEER_LIST", handler);
  }, [setPeers]);

  // Handle MitM activation/deactivation
  useEffect(() => {
    const handleMitmActivated = () => {
      setMitmActive(true);
      setAttackResult(null);
      console.log("[Intruder] MitM activated");

      if (shouldAutoStartAttackRef.current) {
        shouldAutoStartAttackRef.current = false;
        send(wsClient, {
          type: "ATTACK_SIM",
          from: "Intruder",
          to: "server",
          payload: { targetId: "Intruder" },
          timestamp: Date.now(),
        });
        setAttackStatus(
          protocol === "NSL"
            ? "🔴 NSL ATTACK RUNNING: Intruder will relay MSG1, but Alice must reject Bob's identity in MSG2."
            : "🟢 NSPK ATTACK RUNNING: Intruder is actively relaying/decrypting/re-encrypting handshake messages.",
        );
      }
    };

    const handleMitmDeactivated = () => {
      setMitmActive(false);
      setAttackStatus("");
      setAttackResult(null);
      console.log("[Intruder] MitM deactivated");
    };

    const unsubscribeActivated = onMessage(
      wsClient,
      "MITM_ACTIVATED",
      handleMitmActivated,
    );
    const unsubscribeDeactivated = onMessage(
      wsClient,
      "MITM_DEACTIVATED",
      handleMitmDeactivated,
    );

    return () => {
      unsubscribeActivated();
      unsubscribeDeactivated();
    };
  }, [protocol]);

  // Handle ATTACK_RESULT
  useEffect(() => {
    const handleAttackResult = (msg: WSMessage) => {
      const { result, reason } = msg.payload as {
        result: "success" | "failed";
        reason?: string;
      };
      setAttackResult(result);
      if (result === "failed" && reason) {
        setAttackStatus(reason);
      }
      console.log("[Intruder] Attack result:", result.toUpperCase(), reason);
    };

    return onMessage(wsClient, "ATTACK_RESULT", handleAttackResult);
  }, []);

  // Handle MITM_INTERCEPT (MSG1 from Alice)
  useEffect(() => {
    if (!keyPair || !mitmActive) {
      console.log("[Intruder] MITM_INTERCEPT handler not active:", {
        keyPair: !!keyPair,
        mitmActive,
      });
      return;
    }

    const handleMitmIntercept = async (msg: WSMessage) => {
      console.log("[Intruder] MITM_INTERCEPT received:", msg);

      const {
        attackStep,
        protocol,
        originalType,
        originalFrom,
        originalTo,
        originalRecipient,
        routedFrom,
        routedTo,
        keySubstituted,
        originalPayload,
      } = msg.payload as {
        attackStep?: string;
        protocol?: "NSPK" | "NSL";
        originalType: "NSL_MSG1" | "NSL_MSG3";
        originalFrom: string;
        originalTo: string;
        originalRecipient?: string;
        routedFrom?: string;
        routedTo?: string;
        keySubstituted?: boolean;
        originalPayload: { ciphertext: string };
      };

      const activePacket: InterceptedPacket = {
        timestamp: Date.now(),
        from: originalFrom,
        to: originalTo,
        messageType: `${originalType} (ACTIVE MITM)`,
        payloadPreview: JSON.stringify({
          attackStep,
          originalRecipient,
          routedTo: originalTo,
          keySubstituted,
        }).substring(0, 200),
        mode: "active",
        protocol,
        attackStep,
      };
      useStore.getState().addInterceptedPacket(activePacket);

      console.log("[Intruder] Active MITM intercept", {
        attackStep,
        protocol,
        originalType,
        originalFrom,
        originalRecipient: originalRecipient ?? originalTo,
        routedFrom: routedFrom ?? originalFrom,
        routedTo: routedTo ?? originalTo,
        keySubstituted: keySubstituted === true,
        hasCiphertext: typeof originalPayload.ciphertext === "string",
      });

      // Decrypt Alice's message encrypted with the substituted Intruder key.
      const { decryptRSA } = await import("../../crypto");
      try {
        const decrypted = await decryptRSA(
          originalPayload.ciphertext,
          keyPair.privateKey,
        );

        const relayPeer = peers.find((p) => p.id === originalTo);
        if (!relayPeer) {
          console.error("[Intruder] Relay target not found in peer list", {
            originalType,
            originalTo,
            knownPeers: peers.map((p) => p.id),
          });
          return;
        }

        if (originalType === "NSL_MSG1") {
          const NA = decrypted.slice(0, 16);
          const IDA = decrypted.slice(16);

          console.log("[Intruder] Decrypted MSG1 with Intruder private key", {
            protocol,
            payloadLength: decrypted.length,
            nonceLength: NA.length,
            initiatorId: new TextDecoder().decode(IDA),
            reencryptedFor: originalTo,
          });
        } else {
          console.log("[Intruder] Decrypted MSG3 with Intruder private key", {
            protocol,
            payloadLength: decrypted.length,
            reencryptedFor: originalTo,
          });
        }

        const { encryptRSA } = await import("../../crypto");
        const relayedCiphertext = await encryptRSA(
          decrypted,
          relayPeer.publicKey,
        );

        send(wsClient, {
          type: originalType,
          from: originalFrom, // Spoof as Alice for controlled MitM relay.
          to: originalTo,
          payload: {
            ciphertext: relayedCiphertext,
            mitmForwarded: true,
            attackStep,
            originalRecipient,
            decryptedByIntruder: true,
            modifiedByIntruder:
              originalRecipient !== undefined &&
              originalRecipient !== originalTo,
            reencryptedFor: originalTo,
          },
          timestamp: Date.now(),
        });

        console.log(
          "[Intruder] Re-encrypted and forwarded active MITM message",
          {
            protocol,
            originalType,
            from: originalFrom,
            originalRecipient: originalRecipient ?? originalTo,
            relayTarget: originalTo,
            decryptedByIntruder: true,
            modifiedByIntruder:
              originalRecipient !== undefined &&
              originalRecipient !== originalTo,
            reencryptedFor: originalTo,
          },
        );
        setAttackStatus(
          originalType === "NSL_MSG1"
            ? `Forwarded MSG1 to ${originalTo}. Waiting for MSG2...`
            : `Forwarded MSG3 to ${originalTo}. Waiting for handshake result...`,
        );
      } catch (err) {
        console.error("[Intruder] Failed to relay intercepted message", {
          originalType,
          originalFrom,
          originalTo,
          error: err,
        });
      }
    };

    return onMessage(wsClient, "MITM_INTERCEPT", handleMitmIntercept);
  }, [keyPair, peers, mitmActive]);

  const handleStartActiveMitm = async () => {
    console.log("[Intruder] Start active MitM clicked", {
      keyPair,
      wsConnected,
    });

    if (!keyPair) {
      console.error("[Intruder] No keypair available");
      return;
    }

    // Export public key to send to server
    const { exportPublicKey } = await import("../../crypto");
    const publicKeyJWK = await exportPublicKey(keyPair.publicKey);

    setAttackResult(null);

    if (mitmActive) {
      send(wsClient, {
        type: "ATTACK_SIM",
        from: "Intruder",
        to: "server",
        payload: { targetId: "Intruder" },
        timestamp: Date.now(),
      });
      setAttackStatus(
        protocol === "NSL"
          ? "🔴 NSL ATTACK RUNNING: Intruder will relay MSG1, but Alice must reject Bob's identity in MSG2."
          : "🟢 NSPK ATTACK RUNNING: Intruder is actively relaying/decrypting/re-encrypting handshake messages.",
      );
      return;
    }

    shouldAutoStartAttackRef.current = true;

    console.log("[Intruder] Sending ACTIVATE_MITM to server");
    send(wsClient, {
      type: "ACTIVATE_MITM",
      from: "Intruder",
      to: "server",
      payload: { publicKey: publicKeyJWK },
      timestamp: Date.now(),
    });
    setAttackStatus("Starting active MITM attack...");
  };

  const handleDeactivateMitm = () => {
    send(wsClient, {
      type: "DEACTIVATE_MITM",
      from: "Intruder",
      to: "server",
      payload: {},
      timestamp: Date.now(),
    });
    setMitmActive(false);
    setAttackResult(null);
    setAttackStatus("");
  };

  const displayedPackets = interceptedPackets.slice().reverse();
  const packetKey = (packet: InterceptedPacket, idx: number) =>
    `${packet.timestamp}-${idx}`;
  const activeConnections = peers.filter((p) => p.id !== "Intruder").length;

  return (
    <div className="h-screen w-full bg-[#09090b] text-white flex flex-col overflow-hidden">
      {/* Modern Header */}
      <div className="flex-shrink-0 bg-[#111113]/95 border-b border-white/10 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-lg shadow-red-500/20 shrink-0">
              <span className="text-lg">🎭</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate">
                Intruder Panel
              </h1>
              <p className="text-xs text-white/40 truncate">
                Active MITM simulator
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider">
                Peers
              </div>
              <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent leading-none">
                {activeConnections}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto p-4 lg:p-5 grid grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-4 lg:gap-5 min-h-full">
          {/* Attack Control Card */}
          <section className="bg-[#111113] rounded-2xl p-4 border border-white/10 shadow-2xl h-fit">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <span className="text-xl">⚡</span>
              </div>
              <h2 className="text-lg font-semibold">Attack Control</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  <p className="text-red-400 font-semibold text-sm">
                    {mitmActive ? "MitM Attack Active" : "MitM Attack Ready"}
                  </p>
                </div>
                <p className="text-sm text-white/50">
                  {attackStatus ||
                    (protocol === "NSL"
                      ? "Press start: NSL should visibly block the active MITM attack."
                      : "Press start: NSPK should visibly allow a compromised handshake.")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handleStartActiveMitm}
                  disabled={!keyPair || !wsConnected}
                  className="py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Active MITM Attack
                </button>
                <button
                  onClick={handleDeactivateMitm}
                  disabled={!mitmActive}
                  className="py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Stop / Reset Attack
                </button>
              </div>
            </div>

            <div className="mt-4 bg-white/[0.02] rounded-2xl p-3 border border-white/5">
              <p className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">
                How it works
              </p>
              <ol className="space-y-2 text-xs text-white/40 leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-white/20">1.</span>
                  <span>Server intercepts MSG1 during handshake</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white/20">2.</span>
                  <span>Intruder decrypts and inspects the message</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white/20">3.</span>
                  <span>Intruder re-encrypts with forged identity</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-white/20">4.</span>
                  <span>Victim detects mismatch (NSL protection)</span>
                </li>
              </ol>
            </div>
          </section>

          <section className="min-w-0 min-h-0 space-y-4">
            {/* Super-visible protocol result banner */}
            <div
              className={`rounded-2xl p-4 border shadow-2xl ${
                attackResult === "success"
                  ? "bg-green-500/15 border-green-400 shadow-green-500/10"
                  : attackResult === "failed"
                    ? "bg-red-500/15 border-red-400 shadow-red-500/10"
                    : protocol === "NSL"
                      ? "bg-blue-500/10 border-blue-500/30 shadow-blue-500/5"
                      : "bg-orange-500/10 border-orange-500/30 shadow-orange-500/5"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="text-3xl shrink-0">
                  {attackResult === "success"
                    ? "🚨"
                    : attackResult === "failed"
                      ? "🛡️"
                      : protocol === "NSL"
                        ? "🔒"
                        : "⚠️"}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-lg font-black uppercase tracking-wide leading-tight ${
                      attackResult === "success"
                        ? "text-green-300"
                        : attackResult === "failed"
                          ? "text-red-300"
                          : protocol === "NSL"
                            ? "text-blue-300"
                            : "text-orange-300"
                    }`}
                  >
                    {attackResult === "success"
                      ? "NSPK ATTACK SUCCESSFUL — HANDSHAKE COMPROMISED"
                      : attackResult === "failed"
                        ? "NSL ATTACK FAILED — IDENTITY MISMATCH DETECTED"
                        : protocol === "NSL"
                          ? "NSL PROTECTION ARMED — FORCE ATTACK TO SEE BLOCK"
                          : "NSPK VULNERABLE — FORCE ATTACK TO COMPROMISE"}
                  </p>
                  <p className="text-sm text-white/60 mt-2">
                    {attackResult === "success"
                      ? "Intruder actively relayed encrypted handshake traffic. NSPK did not authenticate responder identity in MSG2."
                      : attackResult === "failed"
                        ? attackStatus ||
                          "Alice rejected MSG2 because responder identity did not match the intended peer."
                        : protocol === "NSL"
                          ? "Intruder can observe packets, but active MITM must fail when Alice verifies responder identity in MSG2."
                          : "Intruder will substitute/relay keys and Bob/Alice can finish a compromised session."}
                  </p>
                </div>
              </div>
            </div>

            {/* Attack Result */}
            {attackResult === "success" && (
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-2xl p-4 border border-green-500/20 shadow-2xl shadow-green-500/5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">✅</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-green-400 font-semibold text-lg mb-3">
                      MitM Attack Successful
                    </p>
                    <p className="font-mono text-sm text-white/60 mb-4">
                      Alice ↔ Intruder ↔ Bob
                    </p>
                    <div className="bg-black/20 rounded-2xl p-4 space-y-2 border border-white/5">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                        <span className="text-white/50">
                          Alice thinks peer is:
                        </span>
                        <span className="text-red-400 font-semibold">
                          Intruder
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                        <span className="text-white/50">
                          Bob thinks peer is:
                        </span>
                        <span className="text-blue-400 font-semibold">
                          Alice
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                      <p className="text-xs text-orange-400">
                        ⚠️ No identity verification in MSG2 — attack undetected
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {attackResult === "failed" && (
              <div className="bg-gradient-to-br from-red-500/10 to-pink-500/5 rounded-2xl p-4 border border-red-500/20 shadow-2xl shadow-red-500/5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">❌</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-red-400 font-semibold text-lg mb-3">
                      MitM Attack Failed
                    </p>
                    <p className="font-mono text-sm text-white/60 mb-4">
                      Alice detected identity mismatch
                    </p>
                    <div className="bg-black/20 rounded-2xl p-4 space-y-2 border border-white/5">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                        <span className="text-white/50">Expected peer:</span>
                        <span className="text-red-400 font-semibold">
                          Intruder
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                        <span className="text-white/50">
                          Received identity in MSG2:
                        </span>
                        <span className="text-blue-400 font-semibold">Bob</span>
                      </div>
                    </div>
                    <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                      <p className="text-xs text-green-400">
                        ✅ NSL modification prevented the attack
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Packet Interception */}
            <div className="bg-[#111113] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col min-h-[420px] max-h-[calc(100vh-240px)]">
              <div className="px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <span className="text-xl">📡</span>
                    </div>
                    <h2 className="text-sm font-semibold">
                      Packet Interception
                    </h2>
                  </div>
                  <div className="px-3 py-1.5 bg-white/5 rounded-full">
                    <span className="text-xs font-medium text-white/60">
                      {interceptedPackets.length} captured
                    </span>
                  </div>
                </div>
              </div>

              {interceptedPackets.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-2xl mb-2 opacity-20">📋</div>
                  <p className="text-xs text-white/40">
                    No packets intercepted
                  </p>
                  <p className="text-[11px] text-white/20 mt-0.5">
                    Waiting for network activity...
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5 overflow-y-auto min-h-0">
                  {displayedPackets.map((packet, idx) => {
                    const rowKey = packetKey(packet, idx);
                    const isSelected = selectedPacketKey === rowKey;

                    return (
                      <div
                        key={rowKey}
                        onClick={() =>
                          setSelectedPacketKey(isSelected ? null : rowKey)
                        }
                        className={`px-4 py-3 cursor-pointer transition-all duration-150 ${
                          isSelected ? "bg-blue-500/5" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="grid grid-cols-[72px_minmax(130px,auto)_auto_minmax(0,1fr)] items-center gap-3 min-w-0">
                          <div className="text-[11px] font-mono text-white/30">
                            {formatTime(packet.timestamp)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-[11px] font-medium border border-blue-500/20">
                              {packet.from}
                            </span>
                            <span className="text-white/20">→</span>
                            <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded-lg text-[11px] font-medium border border-amber-500/20">
                              {packet.to}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium border whitespace-nowrap ${
                              packet.blockedByProtocol
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : packet.mode === "active"
                                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                                  : "bg-white/5 text-white/40 border-white/10"
                            }`}
                          >
                            {packet.mode === "active" ? "ACTIVE " : "PASSIVE "}
                            {packet.messageType}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-mono text-white/30 truncate">
                              {packet.payloadPreview}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-4 pt-4 border-t border-white/5">
                            <p className="text-xs font-semibold text-white/40 mb-2 uppercase tracking-wider">
                              Payload
                            </p>
                            <pre className="text-xs font-mono text-white/50 bg-black/20 rounded-xl p-4 overflow-auto max-h-40 border border-white/5">
                              {packet.payloadPreview}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
