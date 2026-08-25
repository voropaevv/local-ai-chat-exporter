export function pdfBodyFromBytes(bytes: string | Uint8Array): string {
  if (typeof bytes === "string") {
    throw new TypeError("Expected binary PDF bytes.");
  }

  return new TextDecoder("latin1").decode(bytes);
}

export function extractPdfText(bytes: string | Uint8Array): string {
  const body = pdfBodyFromBytes(bytes);
  const fontMaps = new Map<string, ReadonlyMap<string, string>>();

  for (const cmap of body.matchAll(/\/CMapName \/([^\s]+)-UCS def([\s\S]*?)endcmap/gu)) {
    const glyphMap = new Map<string, string>();

    for (const mapping of cmap[2].matchAll(/<([\da-f]{4})>\s+<([\da-f]{4,8})>/giu)) {
      glyphMap.set(mapping[1].toLowerCase(), decodeUtf16Hex(mapping[2]));
    }

    fontMaps.set(cmap[1], glyphMap);
  }

  const resourceMaps = new Map([
    ["F1", fontMaps.get("NotoSans-Regular")],
    ["F2", fontMaps.get("NotoSans-Bold")],
    ["F3", fontMaps.get("NotoSansMono-Regular")]
  ]);

  const positionedRuns = [
    ...body.matchAll(
      /BT[^\r\n]*\/(F[123])\s+[\d.]+\s+Tf\s+([-\d.]+)\s+([-\d.]+)\s+Td\s+<([\da-f]+)>\s+Tj\s+ET/giu
    )
  ].map((match) => {
    const glyphMap = resourceMaps.get(match[1]);

    return {
      text: (glyphMap === undefined
        ? []
        : (match[4].match(/[\da-f]{4}/giu) ?? []).map(
            (glyphId) => glyphMap.get(glyphId.toLowerCase()) ?? "�"
          )
      ).join(""),
      x: Number.parseFloat(match[2]),
      y: Number.parseFloat(match[3])
    };
  });
  const lines: { text: string; x: number; y: number }[] = [];

  for (const run of positionedRuns) {
    const previous = lines.at(-1);
    if (previous !== undefined && Math.abs(previous.y - run.y) < 0.01 && run.x >= previous.x) {
      const separator =
        previous.text.length > 0 &&
        run.text.length > 0 &&
        !/\s$/u.test(previous.text) &&
        !/^\s/u.test(run.text)
          ? " "
          : "";
      previous.text += `${separator}${run.text}`;
      previous.x = run.x;
    } else {
      lines.push({ ...run });
    }
  }

  return lines.map((line) => line.text).join("\n");
}

function decodeUtf16Hex(value: string): string {
  return String.fromCharCode(
    ...(value.match(/[\da-f]{4}/giu) ?? []).map((unit) => Number.parseInt(unit, 16))
  );
}
