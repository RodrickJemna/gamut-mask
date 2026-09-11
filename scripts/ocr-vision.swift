// Text recognition via the macOS Vision framework, for the Citadel extractor.
//
// Build-time only, like `qlmanage` in the other extractors: the Citadel chart is a single
// flattened JPEG with NO text layer at all, so the paint names have to be read optically.
// Vision ships with macOS, which avoids adding a Tesseract install to a hobby project —
// and the system Python here is 3.9, too old to build a modern pyobjc.
//
// Reads one image path per line on stdin; writes one JSON object per line to stdout:
//   {"path": ..., "lines": [{"text": ..., "x": ..., "y": ..., "w": ..., "h": ..., "conf": ...}]}
//
// Coordinates are Vision's own: normalised 0-1 with the ORIGIN AT BOTTOM LEFT, so y is
// flipped relative to image coordinates. The caller converts.
//
// Run with: swift scripts/ocr-vision.swift  (interpreted; no build step)

import Foundation
import Vision
import CoreGraphics
import ImageIO

func recognise(_ path: String) -> [[String: Any]] {
    guard let url = URL(string: "file://" + path.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed)!),
          let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        return []
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // The names are set in a display face and are not dictionary words; correction turns
    // "KANTOR BLUE" into something else entirely.
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])

    var out: [[String: Any]] = []
    for observation in (request.results ?? []) {
        guard let best = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        out.append([
            "text": best.string,
            "x": box.origin.x, "y": box.origin.y,
            "w": box.size.width, "h": box.size.height,
            "conf": best.confidence,
        ])
    }
    return out
}

while let path = readLine(strippingNewline: true) {
    if path.isEmpty { continue }
    let payload: [String: Any] = ["path": path, "lines": recognise(path)]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let text = String(data: data, encoding: .utf8) {
        print(text)
        fflush(stdout)
    }
}
