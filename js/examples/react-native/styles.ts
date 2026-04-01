import { Platform, StyleSheet } from "react-native";

const monoText = {
  color: "#2f2922",
  fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  fontSize: 12,
  lineHeight: 18,
} as const;

export const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f6efe2",
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    color: "#1d1a17",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#65594a",
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: "#fffaf2",
    borderColor: "#ddcfb9",
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  sectionTitle: {
    color: "#1d1a17",
    fontSize: 18,
    fontWeight: "700",
  },
  inlineMeta: {
    color: "#574d40",
    fontSize: 14,
  },
  label: {
    color: "#4f463a",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  input: {
    backgroundColor: "#fcf6ea",
    borderColor: "#d8c5a6",
    borderRadius: 12,
    borderWidth: 1,
    color: "#1d1a17",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectButton: {
    alignItems: "center",
    backgroundColor: "#fcf6ea",
    borderColor: "#d8c5a6",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectButtonText: {
    color: "#1d1a17",
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  selectButtonChevron: {
    color: "#8a7557",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  selectMenu: {
    gap: 8,
  },
  selectOption: {
    backgroundColor: "#fff6e8",
    borderColor: "#e5d6bd",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectOptionSelected: {
    backgroundColor: "#f0e2c3",
    borderColor: "#c7a66a",
  },
  selectOptionTitle: {
    color: "#1d1a17",
    fontSize: 14,
    fontWeight: "700",
  },
  selectOptionDescription: {
    color: "#65594a",
    fontSize: 12,
    lineHeight: 18,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    backgroundColor: "#efe1c9",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  segmentButtonSelected: {
    backgroundColor: "#1d1a17",
  },
  segmentButtonText: {
    color: "#4a3f31",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  segmentButtonTextSelected: {
    color: "#fcf6ea",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#1d1a17",
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#fcf6ea",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#efe1c9",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: "#1d1a17",
    fontSize: 15,
    fontWeight: "700",
  },
  statusValue: {
    color: "#1d1a17",
    fontSize: 16,
    fontWeight: "700",
  },
  mono: monoText,
  logLine: monoText,
});
