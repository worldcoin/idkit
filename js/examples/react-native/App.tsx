import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  IDKit,
  IDKitErrorCodes,
  type IDKitRequest,
  type IDKitResult,
} from "@worldcoin/idkit-react-native";
import {
  APP_ID,
  RP_ID,
  DEFAULT_ACTION,
  DEFAULT_SIGNAL,
  RETURN_TO_URL,
  SIGNATURE_ENDPOINT,
  VERIFY_ENDPOINT,
  FLOW_STATE_LABELS,
  PRESET_OPTIONS,
  type Environment,
  type FlowState,
  type PresetKey,
} from "./constants";
import Clipboard from "@react-native-clipboard/clipboard";
import { styles } from "./styles";

function engineLabel(): string {
  return (globalThis as { HermesInternal?: unknown }).HermesInternal
    ? "Hermes"
    : "Non-Hermes";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App(): React.JSX.Element {
  const [action, setAction] = useState(DEFAULT_ACTION);
  const [signal, setSignal] = useState(DEFAULT_SIGNAL);
  const [environment, setEnvironment] = useState<Environment>("production");
  const [presetKey, setPresetKey] = useState<PresetKey>("orb_legacy");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [connectorUri, setConnectorUri] = useState<string | null>(null);
  const [verifyResponse, setVerifyResponse] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const runIdRef = useRef(0);
  const deepLinkReceivedRef = useRef(false);
  const pendingRequestRef = useRef<IDKitRequest | null>(null);
  const selectedPreset =
    PRESET_OPTIONS.find((option) => option.key === presetKey) ??
    PRESET_OPTIONS[0];

  function log(message: string): void {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(line);
    setLogs((current) => [line, ...current].slice(0, 120));
  }

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          deepLinkReceivedRef.current = true;
          log(`Opened from initial URL: ${url}`);
        }
      })
      .catch((error) => {
        log(`Failed to read initial URL: ${getErrorMessage(error)}`);
      });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      deepLinkReceivedRef.current = true;
      log(`Received callback URL: ${url}`);
    });

    return () => subscription.remove();
  }, []);

  async function fetchRpContext() {
    const response = await fetch(SIGNATURE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });

    const payload = (await response.json()) as {
      sig?: string;
      nonce?: string;
      created_at?: number;
      expires_at?: number;
      error?: string;
    };

    if (
      !response.ok ||
      !payload.sig ||
      !payload.nonce ||
      payload.created_at === undefined ||
      payload.expires_at === undefined
    ) {
      throw new Error(payload.error ?? "Failed to fetch RP signature");
    }

    log(
      `RP signature: created_at=${payload.created_at}, expires_at=${payload.expires_at}`,
    );

    return {
      rp_id: RP_ID,
      nonce: payload.nonce,
      created_at: payload.created_at,
      expires_at: payload.expires_at,
      signature: payload.sig,
    };
  }

  async function verifyProof(result: IDKitResult): Promise<string> {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rp_id: RP_ID, devPortalPayload: result }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(payload, null, 2));
    }

    return JSON.stringify(payload, null, 2);
  }

  async function pollRequest(
    currentRunId: number,
    request: IDKitRequest,
  ): Promise<void> {
    const startedAt = Date.now();
    const timeoutMs = 180_000;

    while (runIdRef.current === currentRunId) {
      if (Date.now() - startedAt > timeoutMs) {
        setFlowState("failed");
        log("Timed out waiting for proof completion.");
        return;
      }

      const status = await request.pollOnce();

      if (runIdRef.current !== currentRunId) {
        return;
      }

      switch (status.type) {
        case "waiting_for_connection":
          setFlowState("waiting_for_connection");
          break;
        case "awaiting_confirmation":
          setFlowState("awaiting_confirmation");
          break;
        case "confirmed": {
          setFlowState("verifying_proof");
          log(`Proof confirmed. Verifying...`);
          try {
            const result = await verifyProof(status.result);
            if (runIdRef.current !== currentRunId) return;
            setVerifyResponse(result);
            setFlowState("verified");
            log("Verification succeeded.");
          } catch (error) {
            if (runIdRef.current !== currentRunId) return;
            setFlowState("failed");
            log(`Verify request failed: ${getErrorMessage(error)}`);
          }
          return;
        }
        case "failed":
          if (
            status.error === IDKitErrorCodes.ConnectionFailed &&
            !deepLinkReceivedRef.current
          ) {
            log("Bridge not ready yet. Retrying...");
            break;
          }
          setFlowState("failed");
          log(`Proof failed: ${status.error}`);
          return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function startVerification(): Promise<void> {
    const currentRunId = ++runIdRef.current;
    setFlowState("fetching_signature");
    setVerifyResponse(null);
    setConnectorUri(null);
    setRequestId(null);
    setPresetMenuOpen(false);
    deepLinkReceivedRef.current = false;

    try {
      log(`Runtime: ${engineLabel()} on ${Platform.OS}`);
      const rpContext = await fetchRpContext();
      log(`Using preset: ${selectedPreset.label}`);

      const request = await IDKit.request({
        app_id: APP_ID,
        action,
        rp_context: rpContext,
        action_description: "IDKit React Native Demo",
        allow_legacy_proofs: true,
        return_to: RETURN_TO_URL,
        environment,
      }).preset(selectedPreset.build(signal));

      if (runIdRef.current !== currentRunId) return;

      pendingRequestRef.current = request;
      setRequestId(request.requestId);
      setConnectorUri(request.connectorURI);
      setFlowState("opening_world_app");
      log(`Connector URI ready. Tap Open or Copy.`);

      // Start polling immediately — user can open/copy the URI while we poll
      void pollRequest(currentRunId, request);
    } catch (error) {
      if (runIdRef.current !== currentRunId) return;
      setFlowState("failed");
      log(`Verification failed: ${getErrorMessage(error)}`);
    }
  }

  function openConnectorUri(): void {
    if (!connectorUri) return;
    log("Opening connector URI...");
    void Linking.openURL(connectorUri);
  }

  function copyConnectorUri(): void {
    if (!connectorUri) return;
    Clipboard.setString(connectorUri ?? "");
    log("Connector URI copied to clipboard.");
  }

  function resetRun(): void {
    runIdRef.current += 1;
    setFlowState("idle");
    setRequestId(null);
    setConnectorUri(null);
    setVerifyResponse(null);
    setLogs([]);
    setPresetMenuOpen(false);
    deepLinkReceivedRef.current = false;
    pendingRequestRef.current = null;
  }

  const isBusy =
    flowState !== "idle" && flowState !== "verified" && flowState !== "failed";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={styles.safeArea.backgroundColor}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>IDKit React Native Demo</Text>
        <Text style={styles.subtitle}>
          {engineLabel()} on {Platform.OS}
        </Text>

        {/* Request config */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Request</Text>

          <Text style={styles.label}>App ID</Text>
          <TextInput editable={false} style={styles.input} value={APP_ID} />

          <Text style={styles.label}>Action</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAction}
            style={styles.input}
            value={action}
          />

          <Text style={styles.label}>Signal</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSignal}
            style={styles.input}
            value={signal}
          />

          <Text style={styles.label}>Preset</Text>
          <Pressable
            onPress={() => setPresetMenuOpen((open) => !open)}
            style={styles.selectButton}
          >
            <Text style={styles.selectButtonText}>{selectedPreset.label}</Text>
            <Text style={styles.selectButtonChevron}>
              {presetMenuOpen ? "Hide" : "Select"}
            </Text>
          </Pressable>
          {presetMenuOpen &&
            PRESET_OPTIONS.map((option) => {
              const selected = option.key === presetKey;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    setPresetKey(option.key);
                    setPresetMenuOpen(false);
                  }}
                  style={[
                    styles.selectOption,
                    selected && styles.selectOptionSelected,
                  ]}
                >
                  <Text style={styles.selectOptionTitle}>{option.label}</Text>
                  <Text style={styles.selectOptionDescription}>
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}

          <Text style={styles.label}>Environment</Text>
          <View style={styles.segmentRow}>
            {(["production", "staging"] as Environment[]).map((value) => {
              const selected = environment === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setEnvironment(value)}
                  style={[
                    styles.segmentButton,
                    selected && styles.segmentButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      selected && styles.segmentButtonTextSelected,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.buttonRow}>
          <Pressable
            disabled={isBusy}
            onPress={() => void startVerification()}
            style={[styles.button, isBusy && styles.buttonDisabled]}
          >
            {isBusy ? (
              <ActivityIndicator color="#fcf6ea" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </Pressable>
          <Pressable onPress={resetRun} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </Pressable>
        </View>

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Text style={styles.statusValue}>{FLOW_STATE_LABELS[flowState]}</Text>
          {requestId && <Text style={styles.mono}>Request: {requestId}</Text>}
          {connectorUri && (
            <>
              <Text style={styles.mono} selectable>
                {connectorUri}
              </Text>
              <View style={styles.buttonRow}>
                <Pressable
                  onPress={() => void openConnectorUri()}
                  style={[styles.button, { flex: 1 }]}
                >
                  <Text style={styles.buttonText}>Open URL</Text>
                </Pressable>
                <Pressable
                  onPress={copyConnectorUri}
                  style={[styles.secondaryButton, { flex: 1 }]}
                >
                  <Text style={styles.secondaryButtonText}>Copy</Text>
                </Pressable>
              </View>
            </>
          )}
          {verifyResponse && (
            <>
              <Text style={styles.label}>Response</Text>
              <Text style={styles.mono}>{verifyResponse}</Text>
            </>
          )}
        </View>

        {/* Logs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Logs</Text>
          {logs.length === 0 ? (
            <Text style={styles.inlineMeta}>No logs yet.</Text>
          ) : (
            logs.map((entry, index) => (
              <Text key={`${index}-${entry}`} style={styles.logLine}>
                {entry}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
