import { useEffect, useState } from "react";
import { AppState, Button, Linking, Text, View } from "react-native";
import {
  useIDKitRequest,
  type IDKitRequestHookConfig,
  type RpContext,
} from "@worldcoin/idkit/hooks";

type SmokeProps = {
  appId: `app_${string}`;
  action: string;
  returnTo: string;
  /** Backend returns a fresh signed RpContext for this app/action. */
  rpContextEndpoint: string;
  /** Backend verifies the SDK result and returns { verified: true } on success. */
  verificationEndpoint: string;
};

/** Copy into a real RN/Expo app after configuring a secure entropy provider. */
export function IDKitSmoke(props: SmokeProps) {
  const [config, setConfig] = useState<IDKitRequestHookConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function prepare() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(props.rpContextEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: props.appId, action: props.action }),
      });
      if (!response.ok) throw new Error("Backend could not prepare a request");
      const rpContext: RpContext = await response.json();
      setConfig({
        app_id: props.appId,
        action: props.action,
        rp_context: rpContext,
        allow_legacy_proofs: false,
        return_to: props.returnTo,
        preset: { type: "ProofOfHuman" },
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text>IDKit headless native smoke</Text>
      {config ? (
        <RequestSmoke
          config={config}
          verificationEndpoint={props.verificationEndpoint}
          onReset={() => setConfig(null)}
        />
      ) : (
        <Button
          title="Prepare request"
          disabled={loading}
          onPress={() => void prepare()}
        />
      )}
      {error ? <Text>{error}</Text> : null}
    </View>
  );
}

function RequestSmoke({
  config,
  verificationEndpoint,
  onReset,
}: {
  config: IDKitRequestHookConfig;
  verificationEndpoint: string;
  onReset: () => void;
}) {
  const request = useIDKitRequest(config);
  const [appState, setAppState] = useState(AppState.currentState);
  const [verification, setVerification] = useState("Not submitted");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!request.result) return;
    const controller = new AbortController();
    setVerification("Verifying on backend");
    void fetch(verificationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.result),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || (await response.json()).verified !== true) {
          throw new Error("Backend rejected the proof");
        }
        if (!controller.signal.aborted)
          setVerification("PASS: backend verified the proof");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setVerification(String(error));
      });
    return () => controller.abort();
  }, [request.result, verificationEndpoint]);

  return (
    <View style={{ gap: 16 }}>
      <Text>App state: {appState}</Text>
      <Text>
        Waiting for connection: {String(request.isAwaitingUserConnection)}
      </Text>
      <Text>
        Waiting for confirmation: {String(request.isAwaitingUserConfirmation)}
      </Text>
      <Text>SDK result received: {String(request.isSuccess)}</Text>
      <Text>SDK error: {request.errorCode ?? "none"}</Text>
      <Text>{verification}</Text>
      <Button
        title="Start verification"
        disabled={request.isOpen}
        onPress={request.open}
      />
      {request.connectorURI ? (
        <Button
          title="Open World App"
          onPress={() => void Linking.openURL(request.connectorURI!)}
        />
      ) : null}
      <Button
        title="Reset"
        onPress={() => {
          request.reset();
          onReset();
        }}
      />
    </View>
  );
}
