import Slider from "@react-native-community/slider";
import { StyleSheet, Text, View } from "react-native";

import { formatTime } from "../lib/time";
import { colors } from "../theme";

interface TimelineProps {
  currentTime: number;
  duration: number;
  musicDuration: number;
  offset: number;
  onSeek: (value: number) => void;
  onSeekStart: () => void;
  onSeekComplete: (value: number) => void;
  onOffsetChange: (value: number) => void;
  onOffsetStart: () => void;
  onOffsetComplete: (value: number) => void;
}

export function Timeline(props: TimelineProps) {
  const safeDuration = Math.max(0.1, props.duration);
  const startPercent =
    `${Math.min(100, Math.max(0, (props.offset / safeDuration) * 100))}%` as const;
  const musicWidthPercent =
    `${Math.min(
      100 - Number.parseFloat(startPercent),
      Math.max(0, (props.musicDuration / safeDuration) * 100),
    )}%` as const;
  const playheadPercent =
    `${Math.min(100, Math.max(0, (props.currentTime / safeDuration) * 100))}%` as const;

  return (
    <View>
      <View style={styles.labels}>
        <Text style={styles.label}>Timeline</Text>
        <Text style={styles.time}>
          {formatTime(props.currentTime)} / {formatTime(props.duration)}
        </Text>
      </View>

      <View
        style={styles.timeline}
        accessibilityLabel="Video and soundtrack timeline"
      >
        <View style={[styles.track, styles.videoTrack]}>
          <Text style={styles.trackLabel}>VIDEO</Text>
        </View>
        <View style={[styles.track, styles.musicRail]}>
          <View
            style={[
              styles.musicTrack,
              { left: startPercent, width: musicWidthPercent },
            ]}
          >
            <Text numberOfLines={1} style={styles.musicLabel}>
              AI MUSIC · {formatTime(props.musicDuration)}
            </Text>
          </View>
        </View>
        <View style={[styles.playhead, { left: playheadPercent }]} />
      </View>

      <Slider
        accessibilityLabel="Playback position"
        minimumValue={0}
        maximumValue={safeDuration}
        value={Math.min(props.currentTime, safeDuration)}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
        onSlidingStart={props.onSeekStart}
        onValueChange={props.onSeek}
        onSlidingComplete={props.onSeekComplete}
      />

      <View style={styles.labels}>
        <Text style={styles.label}>Music starts</Text>
        <Text style={styles.offset}>
          {props.offset < 0.05 ? "With video" : `+${formatTime(props.offset)}`}
        </Text>
      </View>
      <Slider
        accessibilityLabel="Music start offset"
        minimumValue={0}
        maximumValue={Math.max(0, safeDuration - 1)}
        step={0.1}
        value={props.offset}
        minimumTrackTintColor={colors.blue}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.blue}
        onSlidingStart={props.onOffsetStart}
        onValueChange={props.onOffsetChange}
        onSlidingComplete={props.onOffsetComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  time: {
    color: colors.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  offset: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timeline: {
    position: "relative",
    gap: 5,
    marginTop: 10,
  },
  track: {
    height: 27,
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "center",
  },
  videoTrack: {
    backgroundColor: "#29423a",
  },
  musicRail: {
    backgroundColor: "#17211f",
    borderWidth: 1,
    borderColor: colors.border,
  },
  musicTrack: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    backgroundColor: "#254b68",
    borderLeftWidth: 2,
    borderLeftColor: colors.blue,
  },
  trackLabel: {
    paddingHorizontal: 9,
    color: "#b9d0c8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  musicLabel: {
    paddingHorizontal: 9,
    color: "#c7e1ff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  playhead: {
    position: "absolute",
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.text,
    borderRadius: 2,
  },
});
