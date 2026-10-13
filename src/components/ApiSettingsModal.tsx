import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ApiCredentials } from "../services/credentials";
import { colors } from "../theme";

interface ApiSettingsModalProps {
  visible: boolean;
  credentials: ApiCredentials;
  onClose: () => void;
  onSave: (credentials: ApiCredentials) => Promise<void>;
}

export function ApiSettingsModal(props: ApiSettingsModalProps) {
  const [apiKey, setApiKey] = useState(props.credentials.apiKey);
  const [baseUrl, setBaseUrl] = useState(props.credentials.baseUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.visible) {
      setApiKey(props.credentials.apiKey);
      setBaseUrl(props.credentials.baseUrl);
      setError("");
    }
  }, [props.credentials, props.visible]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await props.onSave({ apiKey, baseUrl });
      props.onClose();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not save API settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.backdrop}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheet}>
          <View style={styles.headingRow}>
            <View>
              <Text style={styles.eyebrow}>CONNECTION</Text>
              <Text style={styles.title}>AxForge API</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={props.onClose}
              hitSlop={12}
            >
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>API key</Text>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            style={styles.input}
            placeholder="axf_…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.label}>API base URL</Text>
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            style={styles.input}
            placeholder="https://api.axforge.ai/v1"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.note}>
            The key stays in the device keychain. It is not bundled into the
            app.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={save}
            style={({ pressed }) => [
              styles.save,
              pressed && styles.pressed,
              saving && styles.disabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.saveText}>Save connection</Text>
            )}
          </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: 16,
    backgroundColor: "rgba(0, 0, 0, 0.74)",
  },
  sheet: {
    gap: 10,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  close: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.black,
    fontSize: 15,
  },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  save: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  saveText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
