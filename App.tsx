import Slider from "@react-native-community/slider";
import { useEventListener } from "expo";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

import { ApiSettingsModal } from "./src/components/ApiSettingsModal";
import { Timeline } from "./src/components/Timeline";
import type {
  AudioMode,
  GeneratedSoundtrack,
  VideoSelection,
} from "./src/domain";
import { soundtrackPosition } from "./src/lib/timeline";
import { clamp, formatElapsed, formatTime } from "./src/lib/time";
import {
  type ApiCredentials,
  DEFAULT_API_BASE_URL,
  loadCredentials,
  normalizeApiBaseUrl,
  saveCredentials,
} from "./src/services/credentials";
import { exportVideoToPhotos } from "./src/services/exporter";
import { generateMusic } from "./src/services/musicApi";
import { colors } from "./src/theme";

const MAX_VIDEO_SECONDS = 300;
const WORK_LOCK = "axforge-soundtrack-work";
const PROMPT_STARTERS = [
  "Cinematic build",
  "Warm electronic",
  "Acoustic pulse",
  "Dark minimal",
];

type BusyTask = "generating" | "exporting" | null;

export default function App() {
  const [activityReady, setActivityReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const mountEditor = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (!cancelled) setActivityReady(true);
      }, 750);
    };

    // Some older Android/ColorOS builds do not emit the initial active event
    // when a development client hands off to the app activity. Always arm a
    // settled fallback, while still reacting to later foreground transitions.
    mountEditor();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") mountEditor();
    });

    return () => {
      cancelled = true;
      if (settleTimer) clearTimeout(settleTimer);
      subscription.remove();
    };
  }, []);

  if (!activityReady) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.bootScreen]}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return <SoundtrackEditor />;
}

function messageFromError(value: unknown): string {
  if (value instanceof Error) {
    if (value.name === "AbortError") return "Music generation was cancelled.";
    if (
      /unknownhost|network request failed|fetch failed|unable to resolve host/i.test(
        value.message,
      )
    ) {
      return "No internet connection. Check Wi-Fi and try again.";
    }
    return value.message;
  }
  return "Something went wrong.";
}

function pickedVideo(asset: ImagePicker.ImagePickerAsset): VideoSelection {
  return {
    uri: asset.uri,
    fileName: asset.fileName || "Selected video",
    durationSeconds: asset.duration ? asset.duration / 1000 : 0,
    width: asset.width,
    height: asset.height,
    hasOriginalAudio: null,
  };
}

function SoundtrackEditor() {
  const [video, setVideo] = useState<VideoSelection | null>(null);
  const [soundtrack, setSoundtrack] = useState<GeneratedSoundtrack | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [offset, setOffset] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [mode, setMode] = useState<AudioMode>("mix");
  const [originalVolume, setOriginalVolume] = useState(0.8);
  const [musicVolume, setMusicVolume] = useState(0.72);
  const [isPlaying, setIsPlaying] = useState(false);
  const [busy, setBusy] = useState<BusyTask>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [credentials, setCredentials] = useState<ApiCredentials>({
    apiKey: "",
    baseUrl: DEFAULT_API_BASE_URL,
  });
  const [credentialsReady, setCredentialsReady] = useState(false);

  const soundtrackRef = useRef<GeneratedSoundtrack | null>(null);
  const offsetRef = useRef(0);
  const resumeAfterGesture = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const lastMusicSeekAt = useRef(0);

  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = false;
    player.timeUpdateEventInterval = 0.1;
    player.audioMixingMode = "mixWithOthers";
    player.keepScreenOnWhilePlaying = true;
  });
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 100,
    keepAudioSessionActive: true,
  });

  useEffect(() => {
    soundtrackRef.current = soundtrack;
  }, [soundtrack]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadCredentials()
      .then((loaded) => {
        if (!mounted) return;
        setCredentials(loaded);
        setCredentialsReady(true);
        if (!loaded.apiKey) setSettingsVisible(true);
      })
      .catch(() => {
        if (!mounted) return;
        setCredentialsReady(true);
        setSettingsVisible(true);
      });
    return () => {
      mounted = false;
      requestController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return undefined;
    }
    const started = Date.now();
    const interval = setInterval(
      () => setElapsed((Date.now() - started) / 1000),
      1000,
    );
    return () => clearInterval(interval);
  }, [busy]);

  useEffect(() => {
    videoPlayer.muted = mode === "replace";
    videoPlayer.volume = originalVolume;
  }, [mode, originalVolume, videoPlayer]);

  useEffect(() => {
    audioPlayer.volume = musicVolume;
  }, [audioPlayer, musicVolume]);

  const syncSoundtrack = useCallback(
    (videoTime: number, shouldPlay: boolean) => {
      const activeSoundtrack = soundtrackRef.current;
      if (!activeSoundtrack) {
        if (audioPlayer.playing) audioPlayer.pause();
        return;
      }

      const position = soundtrackPosition(
        videoTime,
        offsetRef.current,
        activeSoundtrack.durationSeconds,
      );
      if (!position.active) {
        if (audioPlayer.playing) audioPlayer.pause();
        if (position.musicTime < 0.05 && audioPlayer.currentTime > 0.1) {
          void audioPlayer.seekTo(0);
        }
        return;
      }

      const drift = Math.abs(audioPlayer.currentTime - position.musicTime);
      const now = Date.now();
      if (drift > 0.22 && now - lastMusicSeekAt.current > 300) {
        lastMusicSeekAt.current = now;
        void audioPlayer.seekTo(position.musicTime);
      }

      if (shouldPlay && !audioPlayer.playing) {
        audioPlayer.play();
      } else if (!shouldPlay && audioPlayer.playing) {
        audioPlayer.pause();
      }
    },
    [audioPlayer],
  );

  useEventListener(videoPlayer, "timeUpdate", ({ currentTime: nextTime }) => {
    setCurrentTime(nextTime);
    syncSoundtrack(nextTime, videoPlayer.playing);
  });

  useEventListener(
    videoPlayer,
    "playingChange",
    ({ isPlaying: nextPlaying }) => {
      setIsPlaying(nextPlaying);
      syncSoundtrack(videoPlayer.currentTime, nextPlaying);
    },
  );

  useEventListener(videoPlayer, "playToEnd", () => {
    audioPlayer.pause();
    setIsPlaying(false);
    if (video) setCurrentTime(video.durationSeconds);
  });

  useEventListener(
    videoPlayer,
    "sourceLoad",
    ({ duration, availableAudioTracks }) => {
      setVideo((previous) =>
        previous
          ? {
              ...previous,
              durationSeconds:
                duration > 0 ? duration : previous.durationSeconds,
              hasOriginalAudio: availableAudioTracks.length > 0,
            }
          : previous,
      );
    },
  );

  const pausePreview = useCallback(() => {
    videoPlayer.pause();
    audioPlayer.pause();
  }, [audioPlayer, videoPlayer]);

  const selectVideoAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      if (asset.type && asset.type !== "video")
        throw new Error("Choose a video file.");
      const selection = pickedVideo(asset);
      if (selection.durationSeconds > MAX_VIDEO_SECONDS + 0.5) {
        throw new Error("Choose a video up to 5 minutes long.");
      }

      pausePreview();
      setVideo(selection);
      setSoundtrack(null);
      setOffset(0);
      setCurrentTime(0);
      setSaved(false);
      setError("");
      await videoPlayer.replaceAsync({ uri: selection.uri });
    },
    [audioPlayer, pausePreview, videoPlayer],
  );

  const pickFromLibrary = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access needed", "Allow access to choose a video.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      });
      if (!result.canceled) await selectVideoAsset(result.assets[0]);
    } catch (value) {
      setError(messageFromError(value));
    }
  };

  const recordVideo = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera access needed",
          "Allow camera access to record a video.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        cameraType: ImagePicker.CameraType.back,
        quality: 1,
        videoMaxDuration: MAX_VIDEO_SECONDS,
      });
      if (!result.canceled) await selectVideoAsset(result.assets[0]);
    } catch (value) {
      setError(messageFromError(value));
    }
  };

  const togglePreview = () => {
    if (!video || busy) return;
    if (videoPlayer.playing) {
      pausePreview();
      return;
    }
    if (videoPlayer.currentTime >= video.durationSeconds - 0.1) {
      videoPlayer.currentTime = 0;
      setCurrentTime(0);
    }
    syncSoundtrack(videoPlayer.currentTime, true);
    videoPlayer.play();
  };

  const beginGesture = () => {
    resumeAfterGesture.current = videoPlayer.playing;
    pausePreview();
  };

  const seek = (value: number) => {
    videoPlayer.currentTime = value;
    setCurrentTime(value);
    syncSoundtrack(value, false);
  };

  const completeSeek = (value: number) => {
    seek(value);
    if (resumeAfterGesture.current) {
      syncSoundtrack(value, true);
      videoPlayer.play();
    }
  };

  const completeOffset = (value: number) => {
    const safeOffset = clamp(
      value,
      0,
      Math.max(0, (video?.durationSeconds ?? 1) - 1),
    );
    setOffset(safeOffset);
    offsetRef.current = safeOffset;
    syncSoundtrack(videoPlayer.currentTime, resumeAfterGesture.current);
    if (resumeAfterGesture.current) videoPlayer.play();
  };

  const saveApiSettings = async (next: ApiCredentials) => {
    const normalized = {
      apiKey: next.apiKey.trim(),
      baseUrl: normalizeApiBaseUrl(next.baseUrl),
    };
    await saveCredentials(normalized);
    setCredentials(normalized);
  };

  const startGeneration = async () => {
    if (!video) {
      setError("Choose or record a video first.");
      return;
    }
    if (!video.durationSeconds) {
      setError("The video is still loading. Try again in a moment.");
      return;
    }
    if (video.durationSeconds > MAX_VIDEO_SECONDS) {
      setError("MiniMax-Music3 supports videos up to 5 minutes.");
      return;
    }
    if (!credentials.apiKey) {
      setSettingsVisible(true);
      return;
    }
    if (!prompt.trim()) {
      setError("Describe the soundtrack you want.");
      return;
    }

    pausePreview();
    setError("");
    setSaved(false);
    setBusy("generating");
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    await activateKeepAwakeAsync(WORK_LOCK).catch(() => undefined);

    try {
      const generated = await generateMusic({
        ...credentials,
        prompt,
        durationSeconds: video.durationSeconds,
        signal: controller.signal,
      });
      audioPlayer.replace(generated.uri);
      audioPlayer.volume = musicVolume;
      await audioPlayer.seekTo(0);
      setSoundtrack(generated);
      setOffset(0);
      setCurrentTime(0);
      videoPlayer.currentTime = 0;
    } catch (value) {
      setError(messageFromError(value));
    } finally {
      clearTimeout(timeout);
      requestController.current = null;
      setBusy(null);
      await deactivateKeepAwake(WORK_LOCK).catch(() => undefined);
    }
  };

  const cancelGeneration = () => requestController.current?.abort();

  const startExport = async () => {
    if (!video || !soundtrack) return;
    pausePreview();
    setError("");
    setSaved(false);
    setBusy("exporting");
    await activateKeepAwakeAsync(WORK_LOCK).catch(() => undefined);
    try {
      await exportVideoToPhotos({
        video,
        soundtrack,
        settings: { mode, offsetSeconds: offset, originalVolume, musicVolume },
      });
      setSaved(true);
    } catch (value) {
      setError(messageFromError(value));
    } finally {
      setBusy(null);
      await deactivateKeepAwake(WORK_LOCK).catch(() => undefined);
    }
  };

  const appendPromptStarter = (starter: string) => {
    setPrompt((value) =>
      value.trim() ? `${value.trim()}, ${starter.toLowerCase()}` : starter,
    );
  };

  const duration = video?.durationSeconds ?? 0;
  const previewAspect =
    video?.width && video?.height ? video.width / video.height : 16 / 9;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>AXFORGE</Text>
              <Text style={styles.title}>Soundtrack</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsVisible(true)}
              style={styles.connection}
            >
              <View
                style={[styles.dot, credentials.apiKey && styles.dotConnected]}
              />
              <Text style={styles.connectionText}>
                {credentialsReady && credentials.apiKey
                  ? "API ready"
                  : "Connect API"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.tagline}>Video in. Original score out.</Text>

          {error ? (
            <Pressable onPress={() => setError("")} style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.dismiss}>Dismiss</Text>
            </Pressable>
          ) : null}

          {!video ? (
            <View style={[styles.card, styles.emptyCard]}>
              <View style={styles.mediaGlyph}>
                <Text style={styles.mediaGlyphText}>▶</Text>
              </View>
              <Text style={styles.cardTitle}>Choose a clip</Text>
              <Text style={styles.cardHint}>Up to 5 minutes</Text>
              <View style={styles.buttonRow}>
                <ActionButton
                  label="Pick video"
                  onPress={pickFromLibrary}
                  primary
                />
                <ActionButton label="Record" onPress={recordVideo} />
              </View>
            </View>
          ) : (
            <View style={styles.previewCard}>
              <View style={[styles.preview, { aspectRatio: previewAspect }]}>
                <VideoView
                  player={videoPlayer}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  nativeControls={false}
                  surfaceType="textureView"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isPlaying ? "Pause preview" : "Play preview"
                  }
                  onPress={togglePreview}
                  style={styles.previewControl}
                >
                  <View style={styles.playButton}>
                    <Text style={styles.playButtonText}>
                      {isPlaying ? "Ⅱ" : "▶"}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationBadgeText}>
                    {formatTime(duration)}
                  </Text>
                </View>
              </View>
              <View style={styles.videoMeta}>
                <Text numberOfLines={1} style={styles.videoName}>
                  {video.fileName}
                </Text>
                <Pressable onPress={pickFromLibrary} hitSlop={10}>
                  <Text style={styles.changeLink}>Change</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.step}>01</Text>
            <Text style={styles.sectionTitle}>Describe the music</Text>
          </View>
          <View style={styles.card}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              editable={!busy}
              multiline
              maxLength={1200}
              style={styles.promptInput}
              placeholder="Warm electronic pulse, restrained drums, hopeful lift at the end…"
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {PROMPT_STARTERS.map((starter) => (
                <Pressable
                  key={starter}
                  onPress={() => appendPromptStarter(starter)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{starter}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {busy === "generating" ? (
              <View style={styles.progressBox}>
                <ActivityIndicator color={colors.accent} />
                <View style={styles.progressCopy}>
                  <Text style={styles.progressTitle}>
                    Composing · {formatElapsed(elapsed)}
                  </Text>
                  <Text style={styles.progressHint}>
                    Target {formatTime(duration)} · this can take several minutes.
                  </Text>
                </View>
                <Pressable onPress={cancelGeneration}>
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={!video || busy !== null}
                onPress={startGeneration}
                style={({ pressed }) => [
                  styles.generateButton,
                  (!video || busy !== null) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.generateButtonText}>
                  {soundtrack ? "Generate another" : "Generate soundtrack"}
                </Text>
              </Pressable>
            )}
          </View>

          {soundtrack && video ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.step}>02</Text>
                <Text style={styles.sectionTitle}>Place it</Text>
                <View style={styles.generatedBadge}>
                  <Text style={styles.generatedBadgeText}>AI GENERATED</Text>
                </View>
              </View>
              <View style={styles.card}>
                <Timeline
                  currentTime={currentTime}
                  duration={duration}
                  musicDuration={soundtrack.durationSeconds}
                  offset={offset}
                  onSeek={seek}
                  onSeekStart={beginGesture}
                  onSeekComplete={completeSeek}
                  onOffsetChange={setOffset}
                  onOffsetStart={beginGesture}
                  onOffsetComplete={completeOffset}
                />

                {soundtrack.durationSeconds + 0.5 < duration ? (
                  <View style={styles.trackLengthNotice}>
                    <Text style={styles.trackLengthText}>
                      Music {formatTime(soundtrack.durationSeconds)} · Video {formatTime(duration)}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.controlLabel}>Sound</Text>
                <View style={styles.segmented}>
                  <ModeButton
                    active={mode === "mix"}
                    label="Mix with video"
                    onPress={() => setMode("mix")}
                  />
                  <ModeButton
                    active={mode === "replace"}
                    label="Music only"
                    onPress={() => setMode("replace")}
                  />
                </View>
                {mode === "mix" ? (
                  <VolumeControl
                    label="Original"
                    value={originalVolume}
                    onChange={setOriginalVolume}
                  />
                ) : null}
                <VolumeControl
                  label="Music"
                  value={musicVolume}
                  onChange={setMusicVolume}
                />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.step}>03</Text>
                <Text style={styles.sectionTitle}>Export</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy !== null}
                onPress={startExport}
                style={({ pressed }) => [
                  styles.exportButton,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {busy === "exporting" ? (
                  <>
                    <ActivityIndicator color={colors.black} />
                    <Text style={styles.exportButtonText}>
                      Exporting · {formatElapsed(elapsed)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.exportButtonText}>Export to Photos</Text>
                )}
              </Pressable>
              {saved ? (
                <Text style={styles.saved}>Saved to your photo library.</Text>
              ) : null}
            </>
          ) : null}

          <View style={styles.licenseLine}>
            <View style={styles.licenseDot} />
            <Text style={styles.licenseText}>
              Machine-generated audio by MiniMax-Music3
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ApiSettingsModal
        visible={settingsVisible}
        credentials={credentials}
        onClose={() => setSettingsVisible(false)}
        onSave={saveApiSettings}
      />
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          primary && styles.actionButtonPrimaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text
        style={[styles.modeButtonText, active && styles.modeButtonTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VolumeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.volumeRow}>
      <Text style={styles.volumeLabel}>{label}</Text>
      <Slider
        accessibilityLabel={`${label} volume`}
        style={styles.volumeSlider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
      />
      <Text style={styles.volumeValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bootScreen: { alignItems: "center", justifyContent: "center" },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 48,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.3,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  tagline: {
    marginTop: 3,
    marginBottom: 18,
    color: colors.muted,
    fontSize: 14,
  },
  connection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  dotConnected: { backgroundColor: colors.accent },
  connectionText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#623d39",
    backgroundColor: "#271816",
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 18 },
  dismiss: { color: colors.text, fontSize: 11, fontWeight: "800" },
  card: {
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 30,
    borderStyle: "dashed",
  },
  mediaGlyph: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: colors.accentDark,
  },
  mediaGlyphText: { marginLeft: 3, color: colors.accent, fontSize: 20 },
  cardTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  cardHint: { marginTop: 2, color: colors.muted, fontSize: 12 },
  buttonRow: { flexDirection: "row", gap: 9, marginTop: 18 },
  actionButton: {
    minWidth: 112,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  actionButtonPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  actionButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  actionButtonPrimaryText: { color: colors.black },
  previewCard: {
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.black,
  },
  preview: {
    position: "relative",
    width: "100%",
    maxHeight: 480,
    minHeight: 200,
    backgroundColor: "#020403",
  },
  previewControl: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "rgba(5, 8, 7, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  playButtonText: {
    marginLeft: 2,
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
  },
  durationBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  durationBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  videoMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
  },
  videoName: { flex: 1, color: colors.muted, fontSize: 12 },
  changeLink: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 24,
    marginBottom: 9,
  },
  step: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  promptInput: {
    minHeight: 108,
    padding: 13,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.black,
    fontSize: 15,
    lineHeight: 21,
  },
  chips: { gap: 7, paddingTop: 11, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  generateButton: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 13,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  generateButtonText: { color: colors.black, fontSize: 15, fontWeight: "900" },
  progressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 13,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.accentDark,
  },
  progressCopy: { flex: 1 },
  progressTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  progressHint: { marginTop: 2, color: colors.muted, fontSize: 11 },
  cancel: { color: colors.danger, fontSize: 12, fontWeight: "800" },
  generatedBadge: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: colors.accentDark,
  },
  generatedBadgeText: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  trackLengthNotice: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#332a17",
  },
  trackLengthText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  controlLabel: {
    marginTop: 18,
    marginBottom: 7,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  segmented: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 11,
    backgroundColor: colors.black,
  },
  modeButton: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  modeButtonActive: { backgroundColor: colors.surfaceRaised },
  modeButtonText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  modeButtonTextActive: { color: colors.text },
  volumeRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  volumeLabel: { width: 62, color: colors.muted, fontSize: 12 },
  volumeSlider: { flex: 1, height: 34 },
  volumeValue: {
    width: 42,
    color: colors.text,
    fontSize: 11,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  exportButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 15,
    backgroundColor: colors.accent,
  },
  exportButtonText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  saved: {
    marginTop: 9,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  licenseLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 30,
  },
  licenseDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  licenseText: { color: colors.muted, fontSize: 10 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
});
