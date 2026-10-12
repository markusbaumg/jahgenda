import Foundation
import Vision
import AppKit

// Decode every QR code in a PNG with Apple's Vision framework (local, no network).
let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("NOIMAGE")
    exit(2)
}
let req = VNDetectBarcodesRequest()
req.symbologies = [.qr]
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([req])
var found = 0
for r in req.results ?? [] {
    print("QR:", r.payloadStringValue ?? "<nil>", "box:", r.boundingBox)
    found += 1
}
if found == 0 {
    print("NOQR")
    exit(1)
}
